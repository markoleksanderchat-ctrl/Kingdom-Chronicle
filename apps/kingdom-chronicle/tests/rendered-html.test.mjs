import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { sanitizeSnapshot, validateSnapshot } from "../scripts/import-colony-snapshot.mjs";
import { explainResearchEffect } from "../lib/research-effects.ts";
import { foodRunoutCopy, foodRunwayLabel, foodStatusLabel } from "../lib/food.ts";
import { assessRaidReadiness } from "../lib/raid.ts";
import { reconcileBuildingStaffing } from "../lib/colony.ts";
import { isColonySnapshot, MAX_SNAPSHOT_BYTES } from "../lib/snapshot-validation.ts";
import { OfflineColonyDataSource } from "../lib/colony-data-source.ts";
import { COLONY_PROTOCOL_ID, SUPPORTED_SNAPSHOT_SCHEMA } from "../lib/runtime-contract.ts";
import { inspectBridgeInfo } from "../lib/bridge-info.ts";
import { DESKTOP_RELEASE, DESKTOP_UPDATE_PROTOCOL_ID, DESKTOP_UPDATE_SCHEMA_VERSION } from "../lib/desktop-release.ts";

const fixtureSnapshot = JSON.parse(await readFile(new URL("../data/colony-snapshot.json", import.meta.url), "utf8"));

async function readStyleEntry(url) {
  const entry = await readFile(url, "utf8");
  const imports = [...entry.matchAll(/@import\s+["']([^"']+)["'];/g)];
  if (imports.length === 0) return entry;
  return (await Promise.all(imports.map((match) => readFile(new URL(match[1], url), "utf8")))).join("\n");
}

test("desktop update service pins a verified stable release", () => {
  assert.equal(DESKTOP_UPDATE_PROTOCOL_ID, "com.kingdomchronicle.desktop-update");
  assert.equal(DESKTOP_UPDATE_SCHEMA_VERSION, 2);
  assert.match(DESKTOP_RELEASE.version, /^\d+\.\d+\.\d+$/);
  assert.match(DESKTOP_RELEASE.sha256, /^[a-f0-9]{64}$/);
  assert.ok(DESKTOP_RELEASE.sizeBytes >= 0);
});

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server renders the shelved public surface without colony data", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Kingdom Chronicle<\/title>/);
  assert.match(html, /Kingdom Chronicle is now on desktop/);
  assert.match(html, /Desktop updates available/);
  assert.match(html, /verified releases only/i);
  assert.doesNotMatch(html, /Example Colony|Citizen 001|Citizen 002|Raid Readiness|Colony Stock/);
});

test("the imported snapshot is valid and contains no private save identifiers", async () => {
  const text = await readFile(new URL("../data/colony-snapshot.json", import.meta.url), "utf8");
  const snapshot = validateSnapshot(JSON.parse(text));
  assert.equal(snapshot.schemaVersion, 2);
  assert.equal(snapshot.summary.citizenCount, fixtureSnapshot.summary.citizenCount);
  assert.equal(snapshot.summary.buildingCount, fixtureSnapshot.summary.buildingCount);
  assert.equal(snapshot.construction.length, 2);
  assert.equal(snapshot.requests.length, fixtureSnapshot.requests.length);
  assert.equal(snapshot.summary.citizenCount, snapshot.citizens.length);
  assert.equal(snapshot.summary.buildingCount, snapshot.buildings.length);
  assert.equal(snapshot.summary.activeConstructionProjects, snapshot.construction.length);
  assert.equal(snapshot.summary.activeRequests, snapshot.requests.length);
  assert.equal(snapshot.summary.employedCitizens, snapshot.citizens.filter((citizen) => citizen.employed).length);
  assert.equal(snapshot.summary.staffedBuildings, snapshot.buildings.filter((building) => building.staffed).length);
  assert.equal(Math.floor(snapshot.environment.gameTimeTicks / 24000), Math.floor(fixtureSnapshot.environment.gameTimeTicks / 24000));
  assert.doesNotMatch(text, /ownerUuid|worldId|currentPosition|lastKnownPosition|94d658c7|8677b6d5|-1595/);
  assert.ok(snapshot.buildings.every((building) => /^building-[a-f0-9]{12}$/.test(building.id)));
  assert.ok(snapshot.requests.every((request) => /^request-[a-f0-9]{12}$/.test(request.id)));
});

test("snapshot ingestion rejects malformed protocol payloads", () => {
  assert.equal(isColonySnapshot(fixtureSnapshot), true);
  const hutScopedLivestock = {
    ...fixtureSnapshot,
    livestock: {
      total: 4,
      housed: 4,
      withoutHome: 0,
      byType: { "minecraft:sheep": 4 },
      huts: [{
        buildingId: "12,70,-4",
        buildingType: "minecolonies:shepherd",
        name: "Shepherd's Hut",
        position: { x: 12, y: 70, z: -4 },
        workerIds: [7],
        total: 4,
        byType: { "minecraft:sheep": 4 },
      }],
    },
  };
  assert.equal(isColonySnapshot(hutScopedLivestock), true);
  const defenseStatistics = {
    ...hutScopedLivestock,
    defenseStatistics: {
      lifetime: { total: 14, detailedTotal: 13, raiders: 3, hostile: 9, peacefulOrOther: 1, unclassified: 1, reconciled: false, byEntity: { "entity.minecraft.zombie": 9 }, byEntityCategory: { "entity.minecraft.zombie": "monster_or_hostile" } },
      today: { total: 2, detailedTotal: 2, raiders: 0, hostile: 2, peacefulOrOther: 0, unclassified: 0, reconciled: true, byEntity: { "entity.minecraft.zombie": 2 }, byEntityCategory: { "entity.minecraft.zombie": "monster_or_hostile" } },
      recentWindow: { total: 6, detailedTotal: 6, raiders: 1, hostile: 5, peacefulOrOther: 0, unclassified: 0, reconciled: true, byEntity: { "entity.minecraft.zombie": 5 }, byEntityCategory: { "entity.minecraft.zombie": "monster_or_hostile" } },
      currentDay: 42,
      windowDays: 7,
      animalsButchered: 8,
      animalsButcheredToday: 1,
      animalsButcheredRecentWindow: 3,
    },
  };
  assert.equal(isColonySnapshot(defenseStatistics), true);
  assert.equal(isColonySnapshot({ ...defenseStatistics, defenseStatistics: { ...defenseStatistics.defenseStatistics, animalsButchered: -1 } }), false);
  assert.equal(isColonySnapshot({ ...defenseStatistics, defenseStatistics: { ...defenseStatistics.defenseStatistics, lifetime: { ...defenseStatistics.defenseStatistics.lifetime, byEntityCategory: { "entity.minecraft.zombie": "guess" } } } }), false);
  assert.equal(isColonySnapshot({
    ...hutScopedLivestock,
    livestock: { ...hutScopedLivestock.livestock, huts: [{ ...hutScopedLivestock.livestock.huts[0], workerIds: ["7"] }] },
  }), false);
  assert.equal(MAX_SNAPSHOT_BYTES, 1_000_000);
  assert.equal(isColonySnapshot({ ...fixtureSnapshot, generatedAt: "not-a-date" }), false);
  assert.equal(isColonySnapshot({ ...fixtureSnapshot, construction: null }), false);
  assert.equal(isColonySnapshot({ ...fixtureSnapshot, bridgeVersion: "" }), false);
});

test("offline data source validates snapshots and history", async () => {
  const offline = new OfflineColonyDataSource(fixtureSnapshot, [{
    generatedAt: fixtureSnapshot.generatedAt,
    receivedAt: fixtureSnapshot.generatedAt,
    snapshot: fixtureSnapshot,
  }]);
  assert.equal((await offline.latest()).snapshot, fixtureSnapshot);
  assert.equal((await offline.history()).length, 1);
  assert.equal(COLONY_PROTOCOL_ID, "com.colonybridge.snapshot");
  assert.equal(SUPPORTED_SNAPSHOT_SCHEMA, 2);
});

test("desktop discovery accepts only the read-only filesystem contract", () => {
  const valid = {
    bridgeVersion: "0.15.0",
    protocolId: COLONY_PROTOCOL_ID,
    schemaVersion: SUPPORTED_SNAPSHOT_SCHEMA,
    outputLayoutVersion: 1,
    transport: "filesystem",
    readOnly: true,
    status: "ready",
    outputRoot: "C:\\fixture\\colonybridge",
    latestFiles: ["C:\\fixture\\colonybridge\\latest\\colony-1.json"],
    coloniesDetected: 1,
    lastSuccessfulExportAt: fixtureSnapshot.generatedAt,
  };
  assert.equal(inspectBridgeInfo(valid).compatible, true);
  assert.equal(inspectBridgeInfo({ ...valid, protocolId: "unknown" }).issues[0].code, "protocol");
  assert.equal(inspectBridgeInfo({ ...valid, schemaVersion: 3 }).issues[0].code, "schema");
  assert.equal(inspectBridgeInfo({ ...valid, outputLayoutVersion: 2 }).issues[0].code, "layout");
  assert.equal(inspectBridgeInfo({ ...valid, readOnly: false }).issues[0].code, "write_capable");
  assert.equal(inspectBridgeInfo({ ...valid, latestFiles: null }).issues[0].code, "malformed");
});

test("the sanitizer removes locations and preserves cross-record links", async () => {
  const source = JSON.parse(await readFile(new URL("../data/colony-snapshot.json", import.meta.url), "utf8"));
  source.world.worldId = "C:/private/world";
  source.colony.ownerUuid = "private-owner";
  source.colony.center = { x: 1, y: 2, z: 3 };
  source.buildings[0].id = "1,2,3";
  source.buildings[0].position = { x: 1, y: 2, z: 3 };
  source.citizens[0].workplaceBuildingId = "1,2,3";
  source.citizens[0].uuid = "private-citizen";
  source.citizens[0].currentPosition = { x: 1, y: 2, z: 3 };

  const sanitized = sanitizeSnapshot(source);
  assert.equal(sanitized.world.worldId, undefined);
  assert.equal(sanitized.colony.ownerUuid, undefined);
  assert.equal(sanitized.colony.center, undefined);
  assert.equal(sanitized.citizens[0].uuid, undefined);
  assert.match(sanitized.citizens[0].workplaceBuildingId, /^building-[a-f0-9]{12}$/);
  assert.equal(sanitized.buildings.find((building) => building.id === sanitized.citizens[0].workplaceBuildingId)?.position, undefined);
});

test("production source reads the bridge contract instead of duplicating colony facts", async () => {
  const [page, dashboard, tabs, runtime, tabContract, layout, css, packageJson, readme, health, bridgeInfo] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/dashboard/chronicle-dashboard.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/dashboard/dashboard-tabs.tsx", import.meta.url), "utf8"),
    readFile(new URL("../lib/chronicle-runtime.ts", import.meta.url), "utf8"),
    readFile(new URL("../components/dashboard/dashboard-contract.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readStyleEntry(new URL("../app/globals.css", import.meta.url)),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../README.md", import.meta.url), "utf8"),
    readFile(new URL("../app/api/health/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/bridge-info.ts", import.meta.url), "utf8"),
  ]);
  const dashboardSource = `${page}\n${dashboard}\n${tabs}\n${runtime}\n${tabContract}`;
  assert.match(dashboardSource, /colony-snapshot\.json/);
  assert.match(dashboardSource, /"use client"/);
  assert.match(dashboardSource, /ArrowRight/);
  assert.match(dashboardSource, /role="tabpanel"/);
  assert.doesNotMatch(dashboardSource, /const citizens =|const buildings =|width:\s*"54%"/);
  assert.doesNotMatch(dashboardSource, /environment\.worldDay|Minecraft Day|Calendar Day/);
  assert.match(layout, /title: "Kingdom Chronicle"/);
  assert.match(layout, /\/favicon\.svg/);
  assert.match(layout, /\/favicon-32\.png/);
  assert.match(layout, /\/apple-touch-icon\.png/);
  assert.match(dashboardSource, /kingdom-chronicle-view-mode/);
  assert.match(dashboardSource, /aria-pressed=\{viewMode === "simple"\}/);
  assert.match(css, /\[data-view-mode="simple"\] \.detail-only/);
  assert.match(css, /@media \(max-width: 700px\)/);
  assert.match(css, /@media \(max-width: 430px\)/);
  assert.match(css, /@media \(max-width: 340px\)/);
  assert.match(css, /overflow-x: auto/);
  assert.match(css, /td::before \{ content: attr\(data-label\)/);
  assert.match(css, /\.tab-panel\[hidden\] \{ display: none/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(layout, /viewportFit:\s*"cover"/);
  assert.match(css, /--bg: #eee9df/);
  assert.match(css, /\.view-options/);
  assert.match(dashboardSource, /Colony connected/);
  assert.match(dashboardSource, /window\.addEventListener\("online", refresh\)/);
  assert.match(dashboardSource, /document\.addEventListener\("visibilitychange", refreshWhenVisible\)/);
  assert.match(dashboardSource, /Simple view/);
  assert.match(dashboardSource, /Detailed view/);
  assert.doesNotMatch(dashboardSource, /Journal|journal|The Founding Years|Orders for the Coming Day|steward&apos;s margin/);
  assert.doesNotMatch(css, /journal-|steward-report|report-events|steward-duties/);
  assert.match(dashboardSource, /<InventoryList model=\{model\}/);
  assert.match(dashboardSource, /This count may be incomplete/);
  assert.match(dashboardSource, /No animals at staffed huts/);
  assert.match(dashboardSource, /Livestock unavailable/);
  assert.match(dashboardSource, /<dt>Read<\/dt>/);
  assert.match(css, /border-radius: 11px/);
  assert.match(packageJson, /"sync:colony"/);
  assert.match(readme, /npm run sync:colony/);
  assert.match(runtime, /dataSource\.latest/);
  assert.match(runtime, /dataSource\.history/);
  assert.match(dashboard, /export function ChronicleDashboard/);
  assert.match(dashboard, /dataSource \?\? new OfflineColonyDataSource\(initialSnapshot\)/);
  assert.doesNotMatch(runtime, /setInterval\(refreshWhenVisible, 30_000\)/);
  assert.match(health, /COLONY_PROTOCOL_ID/);
  assert.match(health, /SUPPORTED_OUTPUT_LAYOUT_VERSION/);
  assert.match(health, /MAX_BRIDGE_INFO_BYTES/);
  assert.match(health, /runtimeCapabilities/);
  assert.match(bridgeInfo, /outputLayoutVersion/);
  assert.match(bridgeInfo, /write_capable/);
  const productCopy = `${dashboardSource}\n${layout.replace(/^\s*metadataBase:.*$/m, "")}\n${readme}`;
  assert.doesNotMatch(productCopy, /\bprototype\b|\bbeta\b|\bpreview\b|read[- ]only|will appear after|after the next Colony Bridge/i);
  assert.match(packageJson, /"version":\s*"1\.0\.0"/);
});

test("hosted colony history is retired", async () => {
  const source = await readFile(new URL("../app/api/history/route.ts", import.meta.url), "utf8");
  assert.match(source, /status: 410/);
  assert.doesNotMatch(source, /snapshotHistoryRows/);
});

test("hosted colony snapshot reads and uploads are retired", async () => {
  const source = await readFile(new URL("../app/api/snapshot/route.ts", import.meta.url), "utf8");
  assert.match(source, /status: 410/);
  assert.match(source, /export async function GET/);
  assert.match(source, /export async function PUT/);
  assert.doesNotMatch(source, /SNAPSHOT_UPLOAD_TOKEN|storeSnapshot/);
});

test("research effects are explained in player-facing language", () => {
  assert.deepEqual(explainResearchEffect("minecolonies:effects/blockhuthospital", 5), {
    title: "Hospital",
    description: "Unlocks the Hospital so sick and injured citizens can receive treatment.",
    value: "Unlocked",
  });
  assert.equal(explainResearchEffect("minecolonies:effects/softshoesunlock", 1).description, "Farmers no longer trample crops while working in the fields.");
  assert.match(explainResearchEffect("minecolonies:effects/assistanthammerunlock", 1).description, /place materials for an active builder project/i);
  assert.deepEqual(explainResearchEffect("minecolonies:effects/farmingmultiplier", 0.1), {
    title: "Crop harvest",
    description: "Farmers harvest more crops.",
    value: "+10%",
  });
  assert.deepEqual(explainResearchEffect("minecolonies:effects/healingsaturationlimitaddition", -1), {
    title: "Earlier healing",
    description: "Citizens can begin healing at a lower food level.",
    value: "−1 food point",
  });
  assert.equal(explainResearchEffect("minecolonies:effects/min_order", 1).description, "Buildings wait longer before placing supply requests.");
  assert.equal(explainResearchEffect("minecolonies:effects/sleeplessmultiplier", 1).description, "Guards need less sleep.");
  assert.deepEqual(explainResearchEffect("example:effects/mysterious_bonus", null), {
    title: "Mysterious bonus",
    description: "Activates the mysterious bonus research benefit.",
    value: "Active",
  });
});

test("food runway copy remains explicit about its estimate", () => {
  const food = {
    storedServings: 84,
    distinctFoodTypes: 3,
    servingsByItem: { "minecraft:bread": 84 },
    mealsServedToday: 4,
    mealsServedSample: 70,
    sampleDays: 7,
    averageMealsPerDay: 10,
    estimatedDaysRemaining: 8.4,
    estimatedRunoutColonyDay: 138,
    status: "stable",
    confidence: "high",
    diningHallsScanned: 1,
    menuApprovedFoodTypes: 1,
    approvedMenuItems: ["minecraft:bread"],
    scannedBuildings: 28,
    scannedSlots: 420,
    truncated: false,
  };
  assert.equal(foodStatusLabel(food.status), "Well stocked");
  assert.equal(foodRunwayLabel(food), "8.4 colony days");
  assert.equal(foodRunoutCopy(food), "May run out near Colony Day 138 if no food is added.");

  const emptyMenu = { ...food, status: "menu_empty", estimatedDaysRemaining: null, estimatedRunoutColonyDay: null, menuApprovedFoodTypes: 0, approvedMenuItems: [] };
  assert.equal(foodStatusLabel(emptyMenu.status), "Menu empty");
  assert.equal(foodRunwayLabel(emptyMenu), "Set the menu");
  assert.match(foodRunoutCopy(emptyMenu), /Choose foods on the Restaurant menu/);

  const incomplete = { ...food, status: "incomplete", truncated: true, estimatedDaysRemaining: null, estimatedRunoutColonyDay: null };
  assert.equal(foodStatusLabel(incomplete.status), "Scan incomplete");
  assert.equal(foodRunwayLabel(incomplete), "Scan incomplete");
  assert.match(foodRunoutCopy(incomplete), /scan was incomplete/);
});

test("raid readiness uses the complete defensive roster without fabricating guards", () => {
  const snapshot = {
    colony: { flags: { raidsEnabled: true, expectedRaiderCount: 8, lostCitizensToRaids: 0 } },
    summary: { guards: 4, citizenCount: 3 },
    citizens: [
      { guard: true, jobRegistryId: "minecolonies:knight", alive: true, sick: false, injured: false },
      { guard: true, jobRegistryId: "minecolonies:ranger", alive: true, sick: false, injured: false },
      { guard: true, jobRegistryId: "minecolonies:druid", alive: true, sick: false, injured: true },
    ],
    buildings: [{ registryId: "minecolonies:hospital", type: "hospital", structurallyComplete: true, staffed: true }],
  };
  const readiness = assessRaidReadiness(snapshot);
  assert.equal(readiness.totalGuards, 3);
  assert.equal(readiness.availableGuards, 2);
  assert.equal(readiness.unavailableGuards, 1);
  assert.equal(readiness.expectedRaiders, 8);
  assert.equal(readiness.medicalStatus, "Staffed Hospital");
  assert.match(readiness.actions.join(" "), /guard is sick, injured, or unavailable/i);
  assert.equal(readiness.populationBaseline, 1);
  assert.equal(readiness.recommendedGuards, 8);
  assert.equal(readiness.score, 45);
  assert.equal(readiness.label, "Threat exceeds guards");
});

test("old snapshots recover a Knight even when the exported guard summary is zero", () => {
  const readiness = assessRaidReadiness({
    colony: { flags: { raidsEnabled: true, expectedRaiderCount: 2, lostCitizensToRaids: 0 } },
    summary: { guards: 0, citizenCount: 1 },
    citizens: [{ jobRegistryId: "minecolonies:knight", alive: true, sick: false, injured: false }],
    buildings: [],
  });
  assert.equal(readiness.totalGuards, 1);
  assert.equal(readiness.availableGuards, 1);
  assert.doesNotMatch(readiness.actions.join(" "), /Assign guards/i);
});

test("one healthy guard cannot appear fully ready for a twenty-citizen colony", () => {
  const readiness = assessRaidReadiness({
    colony: { underAttack: false, raided: false, flags: { raidsEnabled: true, expectedRaiderCount: 1, lostCitizensToRaids: 0 } },
    summary: { guards: 1, citizenCount: 20 },
    citizens: [{ guard: true, jobRegistryId: "minecolonies:knight", alive: true, sick: false, injured: false }],
    buildings: [
      { registryId: "minecolonies:guardtower", structurallyComplete: true, staffed: true },
      { registryId: "minecolonies:hospital", structurallyComplete: true, staffed: true },
    ],
  });
  assert.equal(readiness.populationBaseline, 4);
  assert.equal(readiness.recommendedGuards, 4);
  assert.equal(readiness.availableGuards, 1);
  assert.equal(readiness.forceRatio, 1);
  assert.equal(readiness.score, 49);
  assert.equal(readiness.label, "Thin guard coverage");
  assert.equal(readiness.confidence, "Limited");
  assert.match(readiness.actions.join(" "), /Add 3 available guards/i);
  assert.match(readiness.actions.join(" "), /current raid estimate is matched/i);
});

test("workplace staffing excludes housing occupants and linked warehouse couriers", () => {
  const buildings = reconcileBuildingStaffing([
    { id: "home", assignedWorkerIds: [1], staffed: true },
    { id: "warehouse", assignedWorkerIds: [2], staffed: true },
    { id: "guard", assignedWorkerIds: [3], staffed: false },
  ], [
    { id: 1, workplaceBuildingId: "guard" },
    { id: 2, workplaceBuildingId: "warehouse-hut" },
    { id: 3, workplaceBuildingId: "guard" },
  ], 3);
  assert.equal(buildings.filter((building) => building.staffed).length, 1);
  assert.deepEqual(buildings.find((building) => building.id === "guard").workplaceWorkerIds, [1, 3]);
});

test("zero guards never become a fabricated force ratio", () => {
  const readiness = assessRaidReadiness({
    colony: { flags: { raidsEnabled: true, expectedRaiderCount: 1, lostCitizensToRaids: 0 } },
    summary: { guards: 0, citizenCount: 18 },
    citizens: [],
    buildings: [{ registryId: "minecolonies:hospital", structurallyComplete: true, staffed: true }],
  });
  assert.equal(readiness.availableGuards, 0);
  assert.equal(readiness.forceRatio, 0);
  assert.equal(readiness.label, "No active defense");
  assert.equal(readiness.score, 15);
});
