import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ChronicleDashboard } from "../components/dashboard/chronicle-dashboard.tsx";
import { chronicleTabs, nextTabForKey } from "../components/dashboard/dashboard-contract.ts";
import { connectionStateForSnapshot } from "../lib/chronicle-runtime.ts";
import { OfflineColonyDataSource } from "../lib/colony-data-source.ts";

const fixtureSnapshot = JSON.parse(await readFile(new URL("../data/colony-snapshot.json", import.meta.url), "utf8"));

test("tab keyboard navigation wraps and supports Home and End", () => {
  assert.equal(nextTabForKey("overview", "ArrowLeft"), "records");
  assert.equal(nextTabForKey("records", "ArrowRight"), "overview");
  assert.equal(nextTabForKey("buildings", "Home"), "overview");
  assert.equal(nextTabForKey("projects", "End"), "records");
  assert.equal(nextTabForKey("realm", "Enter"), null);
});

test("runtime connection labels preserve stale and shutdown behavior", () => {
  const generated = new Date(fixtureSnapshot.generatedAt).valueOf();
  const openWorld = { ...fixtureSnapshot, trigger: "periodic" };
  assert.equal(connectionStateForSnapshot(openWorld, generated + 60_000), "connected");
  assert.equal(connectionStateForSnapshot(openWorld, generated + 6 * 60_000), "stale");
  assert.equal(connectionStateForSnapshot({ ...fixtureSnapshot, trigger: "shutdown" }, generated + 6 * 60_000), "connected");
});

test("page is route composition while runtime and tabs have explicit ownership", async () => {
  const [page, dashboard, runtime, tabs] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/dashboard/chronicle-dashboard.tsx", import.meta.url), "utf8"),
    readFile(new URL("../lib/chronicle-runtime.ts", import.meta.url), "utf8"),
    readFile(new URL("../components/dashboard/dashboard-tabs.tsx", import.meta.url), "utf8"),
  ]);
  assert.ok(page.split(/\r?\n/).length < 35);
  assert.doesNotMatch(page, /useEffect|role="tabpanel"|buildDashboardModel/);
  assert.match(dashboard, /useChronicleRuntime/);
  assert.match(dashboard, /useDeferredValue\(stockQuery\)/);
  assert.match(runtime, /AbortController/);
  assert.match(runtime, /visibilitychange/);
  assert.match(runtime, /addEventListener\("online"/);
  for (const name of ["OverviewTab", "ProjectsTab", "CitizensTab", "BuildingsTab", "RealmTab", "RecordsTab"]) {
    assert.match(tabs, new RegExp(`export const ${name} = memo`));
  }
});

test("every controlled dashboard tab keeps the complete accessible panel contract", () => {
  const dataSource = new OfflineColonyDataSource(fixtureSnapshot);
  for (const tab of chronicleTabs) {
    const html = renderToStaticMarkup(createElement(ChronicleDashboard, {
      initialSnapshot: fixtureSnapshot,
      dataSource,
      desktopMode: true,
      activeTab: tab.id,
      viewMode: "detailed",
    }));
    assert.equal((html.match(/role="tabpanel"/g) ?? []).length, chronicleTabs.length);
    const desktopLabel = tab.id === "projects" ? "Construction" : tab.id === "records" ? "Ledger" : tab.label;
    assert.match(html, new RegExp(`id="panel-${tab.id}"[^>]*aria-label="${desktopLabel}"[^>]*tabindex="0"`));
    assert.doesNotMatch(html, new RegExp(`id="panel-${tab.id}"[^>]*hidden`));
    for (const other of chronicleTabs.filter((candidate) => candidate.id !== tab.id)) {
      assert.match(html, new RegExp(`id="panel-${other.id}"[^>]*hidden`));
    }
  }
});
