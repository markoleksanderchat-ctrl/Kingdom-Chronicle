import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { InventoryList } from "../components/dashboard/inventory-list.tsx";
import { buildDashboardModel } from "../lib/dashboard-model.ts";
import { MinecraftItemIcon } from "../components/dashboard/minecraft-item-icon.tsx";
import { selectStockHistory } from "../lib/selectors/stock.ts";
import { selectFood } from "../lib/selectors/food.ts";
import { ProjectsTab, CitizensTab } from "../components/dashboard/dashboard-tabs.tsx";
import { citizenAttentionReason } from "../lib/selectors/presentation.ts";

const fixture = JSON.parse(await readFile(new URL("../data/colony-snapshot.json", import.meta.url), "utf8"));
function renderInventory(complete, previous = false, query = "") {
  const snapshot = structuredClone(fixture);
  snapshot.stockLedger = { ...snapshot.stockLedger, itemsById: { "minecraft:coal": 200, "minecraft:iron_ingot": 2 }, scannedBuildings: 10, scannedSlots: 100, scannedHandlers: 10, truncated: !complete, omittedItemTypes: complete ? 0 : 4 };
  snapshot.requests = [{ id: "r1", requestedItemRegistryId: "minecraft:iron_ingot", remainingQuantity: 5 }, { id: "r2", requestedItemRegistryId: "minecraft:glass", remainingQuantity: 4 }];
  snapshot.foodSupply = undefined;
  const prior = structuredClone(snapshot);
  prior.generatedAt = "2026-01-01T00:00:00Z";
  prior.stockLedger.itemsById["minecraft:coal"] = 180;
  const model = buildDashboardModel(snapshot, previous ? [{ generatedAt: prior.generatedAt, snapshot: prior }] : [], query);
  return renderToStaticMarkup(createElement(InventoryList, { model }));
}
test("inventory retains the full ledger, recorded changes and requested shortages", () => {
  const html = renderInventory(true, true);
  assert.match(html, /Counted inventory/);
  assert.match(html, /Largest changes/);
  assert.match(html, /\+20/);
  assert.match(html, /Low-stock priorities/);
  assert.match(html, /Glass/);
  assert.doesNotMatch(html, /No comparable item changes/);
});
test("an incomplete inventory never claims an unexported requested item has zero stock", () => {
  const html = renderInventory(false);
  assert.match(html, /Iron Ingot/);
  assert.doesNotMatch(html, /Glass/);
  assert.match(html, /No comparable item changes/);
});
test("registry and namespace search filters the complete inventory", () => {
  const html = renderInventory(true, true, "minecraft:iron");
  assert.match(html, /Iron Ingot/);
  assert.doesNotMatch(html, /Coal|Counted inventory|Low-stock priorities/);
});
test("unavailable sprites render a placeholder with no broken image or name-based request", () => {
  const html = renderToStaticMarkup(createElement(MinecraftItemIcon, { registryId: "unknown:missing", displayName: "Coal" }));
  assert.match(html, /item-placeholder/);
  assert.doesNotMatch(html, /<img/);
});
test("missing history and partial export omissions cannot create recorded stock changes", () => {
  const current = { itemsById: { "minecraft:coal": 10 }, truncated: false, omittedItemTypes: 0 };
  assert.deepEqual(selectStockHistory(current, undefined).changes, []);
  assert.deepEqual(selectStockHistory(current, { ...current, itemsById: {}, truncated: true }).changes, []);
  assert.deepEqual(selectStockHistory(current, { ...current, itemsById: {} }).changes, [{ item: "minecraft:coal", delta: 10 }]);
});
test("food records retain full menus and distinguish zero stock from incomplete coverage", () => {
  const ids = Array.from({length: 15}, (_, index) => `test:food_${index}`);
  const food = { approvedMenuItems: ids, servingsByItem: Object.fromEntries(ids.slice(0, 14).map((id, index) => [id, index])), truncated: true };
  const selected = selectFood(food);
  assert.equal(selected.menuFoods.length, 15);
  assert.equal(selected.topFoods.length, 13);
  assert.deepEqual(selected.missingMenuFoods, [ids[0]]);
  assert.deepEqual(selectFood({ ...food, truncated: false }).missingMenuFoods, [ids[0], ids[14]]);
});

test("removal orders retain their reported level without pretending to build level zero", () => {
  const snapshot = structuredClone(fixture);
  snapshot.construction = [{ ...snapshot.construction[0], projectType: "remove", currentLevel: 4, targetLevel: 0, projectState: "REMOVE" }];
  const model = buildDashboardModel(snapshot, [], "");
  const html = renderToStaticMarkup(createElement(ProjectsTab, { model, active: true, desktopMode: true }));
  assert.match(html, /Level 4 · Removal/);
  assert.match(html, /Removal order/);
  assert.doesNotMatch(html, /Under construction|Current phase: Queued|Builder requests|→ 0/);
});

test("citizen saturation is reported without an invented vanilla food maximum", () => {
  const snapshot = structuredClone(fixture);
  snapshot.citizens[0].saturation = 49.7;
  const model = buildDashboardModel(snapshot, [], "");
  const html = renderToStaticMarkup(createElement(CitizensTab, { model, active: true, desktopMode: true }));
  assert.match(html, /data-label="Saturation">49.7/);
  assert.doesNotMatch(html, /49.7.*\/ 20/);
  assert.equal(citizenAttentionReason({ ...snapshot.citizens[0], saturation: 4, sick: false, injured: false, happiness: 10, requestingItem: false, idle: false }), "Low saturation: 4.0");
});
