import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { performance } from "node:perf_hooks";

import { buildDashboardModel } from "../lib/dashboard-model.ts";
import { selectBuildings } from "../lib/selectors/buildings.ts";
import { selectStock } from "../lib/selectors/stock.ts";
import { buildingName } from "../lib/colony.ts";
import { isColonySnapshot } from "../lib/snapshot-validation.ts";

const baseSnapshot = JSON.parse(await readFile(new URL("../data/colony-snapshot.json", import.meta.url), "utf8"));
const clone = (value) => structuredClone(value);

test("snapshot contract accepts additive producer fields without changing the domain model", () => {
  const additive = { ...clone(baseSnapshot), futureBridgeField: { accepted: true } };
  assert.equal(isColonySnapshot(additive), true);
  const model = buildDashboardModel(additive, [], "simple", "");
  assert.equal(model.citizens.length, baseSnapshot.citizens.length);
  assert.equal(model.sortedBuildings.length, baseSnapshot.buildings.length);
});

test("building staffing uses workplace links without mutating input", () => {
  const buildings = [
    { id: "home", registryId: "minecolonies:residence", type: null, level: 2, assignedWorkerIds: [1],
      staffed: true, active: true, upgrading: false, beingBuilt: false, structurallyComplete: true },
    { id: "hut", registryId: "minecolonies:builder", type: null, level: 2, assignedWorkerIds: [],
      staffed: false, active: true, upgrading: false, beingBuilt: false, structurallyComplete: true },
  ];
  const citizens = [{ id: 1, workplaceBuildingId: "hut" }];
  const before = JSON.stringify(buildings);
  const selected = selectBuildings(buildings, citizens, 1, buildingName);
  assert.equal(selected.reconciled.find((building) => building.id === "home").staffed, false);
  assert.equal(selected.reconciled.find((building) => building.id === "hut").staffed, true);
  assert.equal(JSON.stringify(buildings), before);
});

test("duplicate friendly stock names remain distinguishable", () => {
  const stock = selectStock({ itemsById: { "minecraft:oak_log": 4, "example:oak_log": 2 } });
  assert.equal(stock.friendlyNameCounts.get("Oak Log"), 2);
  assert.deepEqual(stock.items, [["minecraft:oak_log", 4], ["example:oak_log", 2]]);
});

test("missing optional fields and menu gaps produce stable defaults", () => {
  const snapshot = clone(baseSnapshot);
  delete snapshot.livestock;
  delete snapshot.recentStatistics;
  delete snapshot.defenseStatistics;
  delete snapshot.stockLedger;
  snapshot.research.effects = undefined;
  snapshot.foodSupply = { ...snapshot.foodSupply, approvedMenuItems: ["minecraft:bread", "minecraft:apple"],
    servingsByItem: { "minecraft:bread": 12 } };
  const model = buildDashboardModel(snapshot, [], "simple", "");
  assert.deepEqual(model.livestockHuts, []);
  assert.deepEqual([...model.visibleStats].sort(), Object.keys(snapshot.statistics).sort());
  assert.deepEqual(model.missingMenuFoods, ["minecraft:apple"]);
  assert.equal(model.defenseCoverage, 100);
  assert.deepEqual(model.stockItems, []);
  assert.deepEqual(model.researchBenefits, []);
});

test("incomplete defense detail reports partial coverage", () => {
  const snapshot = clone(baseSnapshot);
  const emptyBreakdown = { total: 0, raiders: 0, hostile: 0, peacefulOrOther: 0, unclassified: 0, byEntity: {} };
  snapshot.defenseStatistics = {
    lifetime: { total: 10, raiders: 1, hostile: 2, peacefulOrOther: 0, unclassified: 7,
      byEntity: { "minecraft:zombie": 3 } },
    today: emptyBreakdown,
    recentWindow: emptyBreakdown,
    currentDay: null,
    windowDays: 7,
    animalsButchered: 0,
    animalsButcheredToday: 0,
    animalsButcheredRecentWindow: 0,
  };
  const model = buildDashboardModel(snapshot, [], "detailed", "");
  assert.equal(model.lifetimeDefenseDetail, 3);
  assert.equal(model.defenseCoverage, 30);
});

test("history deltas flag changed stock scan coverage", () => {
  const previous = clone(baseSnapshot);
  const current = clone(baseSnapshot);
  current.generatedAt = "2026-07-15T10:50:41Z";
  previous.stockLedger.scannedHandlers = current.stockLedger.scannedHandlers;
  previous.stockLedger.scannedSlots = 100;
  current.stockLedger.scannedSlots = 180;
  current.stockLedger.totalItems = (previous.stockLedger.totalItems ?? 0) + 25;
  const model = buildDashboardModel(current, [{ generatedAt: previous.generatedAt, receivedAt: previous.generatedAt, snapshot: previous }], "simple", "");
  assert.equal(model.stockCoverageChanged, true);
  assert.equal(model.stockTotalDelta, "+25");
});

test("unknown research and missing raid evidence remain explicit", () => {
  const snapshot = clone(baseSnapshot);
  snapshot.research.effects = [{ id: "example:unknown_research_effect", nameTranslationKey: null,
    subtitleTranslationKey: null, strength: null }];
  snapshot.colony.underAttack = null;
  snapshot.colony.raided = null;
  delete snapshot.colony.flags.expectedRaiderCount;
  const model = buildDashboardModel(snapshot, [], "simple", "");
  assert.equal(model.raidForecast, "Raid status unavailable");
  assert.equal(model.expectedRaiderCount, null);
  assert.match(model.researchBenefits[0].summary.title, /Unknown Research Effect/i);
  assert.ok(model.researchBenefits[0].summary.description.length > 0);
});

test("selectors do not mutate snapshot arrays and cache base work by identity", () => {
  const snapshot = clone(baseSnapshot);
  const before = JSON.stringify(snapshot);
  const first = buildDashboardModel(snapshot, [], "simple", "");
  const second = buildDashboardModel(snapshot, [], "detailed", "stone");
  assert.equal(JSON.stringify(snapshot), before);
  assert.strictEqual(first.citizenById, second.citizenById);
  assert.strictEqual(first.sortedBuildings, second.sortedBuildings);
  assert.strictEqual(first.stockItems, second.stockItems);
});

test("large dashboard model stays within the provisional 50 ms budget", () => {
  const snapshot = clone(baseSnapshot);
  const citizenTemplate = snapshot.citizens[0];
  const buildingTemplate = snapshot.buildings[0];
  snapshot.citizens = Array.from({ length: 500 }, (_, index) => ({ ...clone(citizenTemplate), id: index + 1,
    name: `Citizen ${index + 1}`, workplaceBuildingId: `building-${index % 250}` }));
  snapshot.summary.citizenCount = snapshot.citizens.length;
  snapshot.buildings = Array.from({ length: 250 }, (_, index) => ({ ...clone(buildingTemplate),
    id: `building-${index}`, registryId: index % 2 ? "minecolonies:builder" : "minecolonies:residence" }));
  snapshot.stockLedger.itemsById = Object.fromEntries(Array.from({ length: 2_000 }, (_, index) =>
    [`example:item_${String(index).padStart(4, "0")}`, index]));
  const started = performance.now();
  const model = buildDashboardModel(snapshot, [], "detailed", "item_19");
  const elapsed = performance.now() - started;
  assert.equal(model.citizens.length, 500);
  assert.equal(model.stockItems.length, 2_000);
  assert.ok(elapsed < 50, `model build took ${elapsed.toFixed(2)} ms`);
});
