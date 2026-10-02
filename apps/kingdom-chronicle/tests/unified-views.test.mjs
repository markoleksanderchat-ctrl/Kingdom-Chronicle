import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { buildDashboardModel } from "../lib/dashboard-model.ts";
import { clearRetiredPreferences } from "../lib/retired-preferences.ts";
import { OverviewTab, CitizensTab, BuildingsTab, RealmTab, RecordsTab } from "../components/dashboard/dashboard-tabs.tsx";
import { InventoryList } from "../components/dashboard/inventory-list.tsx";
import { citizenNeedsAttention } from "../lib/selectors/citizens.ts";

const fixture = JSON.parse(await readFile(new URL("../data/colony-snapshot.json", import.meta.url), "utf8"));
const renderTab = (component, model) => renderToStaticMarkup(createElement(component, {
  model, active: true, desktopMode: true, stockQuery: "", onStockQueryChange() {}, receivedAt: null, observedAt: null,
}));

test("canonical views retain every citizen, building, inventory item and production record", () => {
  const snapshot = structuredClone(fixture);
  snapshot.stockLedger.itemsById = Object.fromEntries(Array.from({ length: 150 }, (_, i) => [`example:item_${i}`, i]));
  snapshot.recentStatistics.today = Object.fromEntries(Array.from({ length: 20 }, (_, i) => [`record_${i}`, 0]));
  snapshot.recentStatistics.recentWindow = {};
  const model = buildDashboardModel(snapshot, [], "");
  assert.equal(model.visibleCitizens.length, snapshot.citizens.length);
  assert.ok(model.visibleCitizens.slice(0, model.attentionCitizens.length).every(citizenNeedsAttention));
  assert.ok(model.lowMoraleHighlights.every((citizen, i, all) => i === 0 || citizen.happiness >= all[i - 1].happiness));
  assert.equal(model.visibleBuildings.length, snapshot.buildings.length);
  assert.equal(model.visibleStockItems.length, 150);
  assert.equal(model.visibleRecentKeys.length, 20);
  assert.equal((renderTab(CitizensTab, model).match(/data-label="Citizen"/g) ?? []).length, snapshot.citizens.length);
  assert.equal((renderTab(BuildingsTab, model).match(/data-building="true"/g) ?? []).length, snapshot.buildings.length);
  const inventory = renderToStaticMarkup(createElement(InventoryList, { model }));
  assert.match(inventory, /Counted inventory \(150\)/);
  assert.match(inventory, /Item 149/);
  assert.match(inventory, /Low-stock priorities/);
  const records = renderTab(RecordsTab, model);
  assert.match(records, /Record 19/);
  assert.match(records, /Lifetime production/);
  assert.match(records, /<summary>Developer details<\/summary>/);
});

test("overview retains priority highlights and all menu foods behind compact section expanders", () => {
  const snapshot = structuredClone(fixture);
  snapshot.citizens[0].happiness = 2;
  snapshot.foodSupply.approvedMenuItems = Array.from({ length: 15 }, (_, i) => `example:food_${i}`);
  snapshot.foodSupply.servingsByItem = Object.fromEntries(snapshot.foodSupply.approvedMenuItems.map((id, i) => [id, i + 1]));
  const model = buildDashboardModel(snapshot, [], "");
  const html = renderTab(OverviewTab, model);
  assert.match(html, /Lowest happiness/);
  assert.match(html, /More food on hand \(9\)/);
  assert.match(html, /Dining Hall menu \(15\)/);
  for (let i = 0; i < 15; i++) assert.match(html, new RegExp(`Food ${i}(?:<|&)`));
  assert.match(renderTab(RealmTab, model), /Completed research/);
});

test("empty and older reports keep stable canonical pages", () => {
  const snapshot = structuredClone(fixture);
  snapshot.citizens = [];
  snapshot.buildings = [];
  snapshot.construction = [];
  snapshot.requests = [];
  snapshot.research.completed = [];
  snapshot.research.effects = [];
  delete snapshot.stockLedger;
  delete snapshot.foodSupply;
  delete snapshot.recentStatistics;
  delete snapshot.defenseStatistics;
  const model = buildDashboardModel(snapshot, [], "");
  assert.match(renderTab(CitizensTab, model), /No citizens reported/);
  assert.match(renderTab(BuildingsTab, model), /No buildings reported/);
  assert.match(renderTab(OverviewTab, model), /Food estimate unavailable/);
  assert.match(renderTab(RecordsTab, model), /Storage count unavailable/);
});

test("retired preferences are removed without reading saved values or changing other settings", () => {
  for (const legacy of ["simple", "detailed", "invalid", "", null]) {
    const values = new Map([["kingdom-chronicle-view-mode", legacy], ["unrelated-setting", "keep"]]);
    const storage = { getItem() { throw new Error("Retired values must not be read"); }, removeItem(key) { values.delete(key); } };
    clearRetiredPreferences(storage);
    clearRetiredPreferences(storage);
    assert.equal(values.has("kingdom-chronicle-view-mode"), false);
    assert.equal(values.get("unrelated-setting"), "keep");
  }
  assert.doesNotThrow(() => clearRetiredPreferences({ removeItem() { throw new Error("Storage blocked"); } }));
  assert.doesNotThrow(() => clearRetiredPreferences());
});
