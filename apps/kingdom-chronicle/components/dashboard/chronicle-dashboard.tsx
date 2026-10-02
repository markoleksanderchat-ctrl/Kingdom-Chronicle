"use client";

import { useDeferredValue, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import rawSnapshot from "@/data/colony-snapshot.json";
import { formatSnapshotTime } from "@/lib/colony";
import type { ColonySnapshot } from "@/lib/colony-schema";
import { buildDashboardModel } from "@/lib/dashboard-model";
import { OfflineColonyDataSource, type ColonyDataSource } from "@/lib/colony-data-source";
import { useChronicleRuntime } from "@/lib/chronicle-runtime";
import { clearRetiredPreferences } from "@/lib/retired-preferences";
import {
  chronicleTabs, nextTabForKey, type ChronicleTabId,
} from "./dashboard-contract";
import {
  BuildingsTab, CitizensTab, OverviewTab, ProjectsTab, RealmTab, RecordsTab,
} from "./dashboard-tabs";

const fallbackSnapshot = rawSnapshot as unknown as ColonySnapshot;

export interface ChronicleDashboardProps {
  initialSnapshot?: ColonySnapshot;
  dataSource?: ColonyDataSource;
  desktopMode?: boolean;
  activeTab?: ChronicleTabId;
  onActiveTabChange?: (tab: ChronicleTabId) => void;
}

export function ChronicleDashboard({
  initialSnapshot = fallbackSnapshot,
  dataSource,
  desktopMode = false,
  activeTab: controlledActiveTab,
  onActiveTabChange,
}: ChronicleDashboardProps) {
  const [internalActiveTab, setInternalActiveTab] = useState<ChronicleTabId>("overview");
  const [stockQuery, setStockQuery] = useState("");
  const tabRailRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<Partial<Record<ChronicleTabId, HTMLButtonElement | null>>>({});
  const activeTab = controlledActiveTab ?? internalActiveTab;
  const resolvedDataSource = useMemo(() => dataSource ?? new OfflineColonyDataSource(initialSnapshot),
    [dataSource, initialSnapshot]);
  const runtime = useChronicleRuntime(initialSnapshot, resolvedDataSource, desktopMode);

  useEffect(() => {
    clearRetiredPreferences();
  }, []);

  const deferredStockQuery = useDeferredValue(stockQuery);
  const dashboardModel = useMemo(() => buildDashboardModel(
    runtime.snapshot, runtime.history, deferredStockQuery,
  ), [runtime.snapshot, runtime.history, deferredStockQuery]);
  const { colony, tabCounts } = dashboardModel;
  const worldClosed = ["shutdown", "disconnect"].includes(runtime.snapshot.trigger);
  const connectionLabel = runtime.connectionState === "connected"
    ? worldClosed ? "Latest colony report ready" : "Colony connected"
    : runtime.connectionState === "stale"
      ? "Waiting for an update"
      : runtime.connectionState === "degraded"
        ? "Showing the latest saved report"
        : "Connecting to the colony";

  function activateTab(nextTab: ChronicleTabId, moveFocus = false) {
    if (controlledActiveTab == null) setInternalActiveTab(nextTab);
    onActiveTabChange?.(nextTab);
    requestAnimationFrame(() => {
      if (moveFocus) tabRefs.current[nextTab]?.focus();
      const rail = tabRailRef.current;
      if (rail && window.scrollY > rail.offsetTop + 1) rail.scrollIntoView({ block: "start" });
    });
  }

  function handleTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, currentTab: ChronicleTabId) {
    const nextTab = nextTabForKey(currentTab, event.key);
    if (nextTab == null) return;
    event.preventDefault();
    activateTab(nextTab, true);
  }

  return (
    <main data-live-ready={runtime.initialLoadDone} data-desktop={desktopMode}>
      {!desktopMode && <header className="topbar">
        <div className="sigil" aria-hidden="true"><span>KC</span></div>
        <div><p className="kicker">MineColonies companion</p><h1>Kingdom Chronicle</h1></div>
        <div className={`snapshot connection-${runtime.connectionState}`} aria-live="polite">
          <span aria-hidden="true" />
          <div><strong>{connectionLabel}</strong><small>Recorded {formatSnapshotTime(runtime.snapshot.generatedAt)}</small></div>
        </div>
      </header>}

      {!runtime.initialLoadDone && <section className="loading-state" aria-live="polite">
        <strong>Loading {colony.name ?? "your colony"}</strong>
      </section>}

      {!desktopMode && <div className="tab-rail" ref={tabRailRef}>
        <div className="tab-list" role="tablist" aria-label="Colony dashboard views">
          {chronicleTabs.map((tab) => (
            <button key={tab.id} id={`tab-${tab.id}`} ref={(element) => { tabRefs.current[tab.id] = element; }}
              type="button" role="tab" aria-selected={activeTab === tab.id} aria-controls={`panel-${tab.id}`}
              tabIndex={activeTab === tab.id ? 0 : -1} onClick={() => activateTab(tab.id)}
              onKeyDown={(event) => handleTabKeyDown(event, tab.id)}>
              <span>{tab.label}</span>{tabCounts[tab.id] != null && <small>{tabCounts[tab.id]}</small>}
            </button>
          ))}
        </div>
        <span className="tab-swipe-cue" aria-hidden="true">Swipe for more →</span>
      </div>}

      <OverviewTab model={dashboardModel} active={activeTab === "overview"} desktopMode={desktopMode} />
      <ProjectsTab model={dashboardModel} active={activeTab === "projects"} desktopMode={desktopMode} />
      <CitizensTab model={dashboardModel} active={activeTab === "citizens"} desktopMode={desktopMode} />
      <BuildingsTab model={dashboardModel} active={activeTab === "buildings"} desktopMode={desktopMode} />
      <RealmTab model={dashboardModel} active={activeTab === "realm"} desktopMode={desktopMode} />
      <RecordsTab model={dashboardModel} active={activeTab === "records"} desktopMode={desktopMode}
        stockQuery={stockQuery} onStockQueryChange={setStockQuery}
        receivedAt={runtime.receivedAt} observedAt={runtime.observedAt} />

      {!desktopMode && <footer><strong>Kingdom Chronicle</strong>
        <span>{colony.name ?? "Unknown colony"} · MineColonies companion dashboard</span>
        <b>Schema {runtime.snapshot.schemaVersion}</b>
      </footer>}
    </main>
  );
}

export { chronicleTabs } from "./dashboard-contract";
export type { ChronicleTabId } from "./dashboard-contract";
