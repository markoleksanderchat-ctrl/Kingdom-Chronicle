import { StrictMode, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ChronicleDashboard,
  type ChronicleTabId,
  type ChronicleViewMode,
} from "@/app/page";
import "@/app/globals.css";
import "./shell.css";
import { ElectronColonyDataSource } from "./electron-data-source";
import { ItemSpriteContext } from "@/components/dashboard/minecraft-item-icon";
import { connectionStateForSnapshot } from "@/lib/chronicle-runtime";
import type { DesktopAppInfo, DesktopRuntimeState, DesktopUpdateState } from "../types";

import { UpdatesPanel } from "./updates-panel";

type UtilityPanel = "settings" | "updates" | "about" | null;
import { ChronicleGlyph as NavigationGlyph, type ChronicleIcon as NavigationIcon } from "@/components/dashboard/chronicle-glyph";

const navigation: ReadonlyArray<{
  id: ChronicleTabId;
  label: string;
  description: string;
  icon: NavigationIcon;
}> = [
  { id: "overview", label: "Overview", description: "Colony priorities", icon: "overview" },
  { id: "projects", label: "Construction", description: "Building progress", icon: "projects" },
  { id: "citizens", label: "Citizens", description: "Work and wellbeing", icon: "citizens" },
  { id: "buildings", label: "Buildings", description: "Huts and workers", icon: "buildings" },
  { id: "realm", label: "Realm", description: "Safety and territory", icon: "realm" },
  { id: "records", label: "Ledger", description: "Supplies and production", icon: "records" },
];

const VIEW_MODE_STORAGE_KEY = "kingdom-chronicle-view-mode";


function reportIdentity(state: DesktopRuntimeState) {
  const snapshot = state.snapshot;
  return snapshot
    ? [snapshot.generatedAt, snapshot.fingerprint ?? "", snapshot.world.dimension ?? "", snapshot.colony.id ?? "", snapshot.colony.name ?? ""].join("|")
    : "";
}

function sameRuntimeState(left: DesktopRuntimeState | null, right: DesktopRuntimeState) {
  return left?.status === right.status
    && left.instancePath === right.instancePath
    && reportIdentity(left) === reportIdentity(right)
    && left.message === right.message
    && left.technicalDetail === right.technicalDetail
    && left.history.map((entry) => `${entry.generatedAt}|${entry.snapshot.fingerprint ?? ""}`).join("|")
      === right.history.map((entry) => `${entry.generatedAt}|${entry.snapshot.fingerprint ?? ""}`).join("|");
}

function formatDesktopTimestamp(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return "Unknown time";
  return date.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function initialViewMode(): ChronicleViewMode {
  try {
    const stored = window.localStorage.getItem(VIEW_MODE_STORAGE_KEY);
    return stored === "detailed" ? "detailed" : "simple";
  } catch {
    return "simple";
  }
}

function DesktopApp() {
  useEffect(() => { void window.kingdomDesktop.rendererReady().catch(console.error); }, []);
  const [state, setState] = useState<DesktopRuntimeState | null>(null);
  const [appInfo, setAppInfo] = useState<DesktopAppInfo | null>(null);
  const [activeSection, setActiveSection] = useState<ChronicleTabId>("overview");
  const [viewMode, setViewMode] = useState<ChronicleViewMode>(initialViewMode);
  const [utilityPanel, setUtilityPanel] = useState<UtilityPanel>(null);
  const panelRef = useRef<HTMLElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [connectionTime, setConnectionTime] = useState(Date.now);
  const [busyAction, setBusyAction] = useState<"choose" | "refresh" | null>(null);
  const busy = busyAction !== null;
  const [updateState, setUpdateState] = useState<DesktopUpdateState>({ revision: -1, phase: "idle", currentVersion: "…" });
  const [updatePending, setUpdatePending] = useState(false);
  const installingUpdate = updateState.phase === "installing";
  const dataSource = useMemo(() => state?.snapshot ? new ElectronColonyDataSource(state) : null, [state]);
  const spriteInstance = state?.instancePath;
  const spriteLoader = useMemo(() => {
    const cache = new Map<string, ReturnType<typeof window.kingdomDesktop.getItemSprite>>();
    return (id: string) => {
      if (!spriteInstance) return Promise.resolve(null);
      let promise = cache.get(id);
      if (!promise) { promise = window.kingdomDesktop.getItemSprite(id); cache.set(id, promise); }
      return promise;
    };
  }, [spriteInstance]);
  useEffect(() => {
    const timer = window.setInterval(() => setConnectionTime(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => { window.scrollTo({ top: 0, left: 0, behavior: "instant" }); }, [activeSection]);

  useEffect(() => {
    let active = true;
    const stopListening = window.kingdomDesktop.onRuntimeChanged((next) => {
      if (active) setState((current) => sameRuntimeState(current, next) ? current : next);
    });
    void window.kingdomDesktop.getRuntimeState()
      .then((next) => { if (active) setState(next); })
      .catch((error) => {
        if (active) setState({
          status: "error", snapshot: null, history: [], instanceName: null, instancePath: null,
          message: "Could not load the colony.", technicalDetail: error instanceof Error ? error.message : String(error),
        });
      });
    return () => { active = false; stopListening(); };
  }, []);

  useEffect(() => {
    let active = true;
    const accept = (next: DesktopUpdateState) => { if (active) setUpdateState((current) => next.revision >= current.revision ? next : current); };
    const unsubscribe = window.kingdomDesktop.onUpdateState(accept);
    void window.kingdomDesktop.getUpdateState().then(accept).catch(console.error);
    return () => { active = false; unsubscribe(); };
  }, []);

  useEffect(() => {
    let active = true;
    void window.kingdomDesktop.getAppInfo()
      .then((info) => { if (active) setAppInfo(info); })
      .catch(() => { /* The colony dashboard remains usable without version metadata. */ });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!utilityPanel) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const panel = panelRef.current;
    panel?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape" && !installingUpdate) setUtilityPanel(null);
      if (event.key !== "Tab" || !panel) return;
      const controls = [...panel.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled), summary, a[href], [tabindex='0']")];
      const first = controls[0];
      const last = controls.at(-1);
      if (event.shiftKey && (document.activeElement === first || !panel.contains(document.activeElement))) {
        event.preventDefault(); last?.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !panel.contains(document.activeElement))) {
        event.preventDefault(); first?.focus();
      }
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => { window.removeEventListener("keydown", closeOnEscape); previousFocus?.focus(); };
  }, [installingUpdate, utilityPanel]);

  useEffect(() => {
    if (!menuOpen) return;
    const closeMenuOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", closeMenuOnEscape);
    return () => window.removeEventListener("keydown", closeMenuOnEscape);
  }, [menuOpen]);

  const choose = async () => {
    setBusyAction("choose");
    try { setState(await window.kingdomDesktop.chooseInstance()); }
    catch (error) {
      setState((current) => current ? {
        ...current,
        status: current.snapshot ? "cached" : "error",
        message: "Could not open the Minecraft folder picker.",
        technicalDetail: error instanceof Error ? error.message : String(error),
      } : current);
    } finally { setBusyAction(null); }
  };

  const refresh = async () => {
    setBusyAction("refresh");
    try { setState(await window.kingdomDesktop.refresh()); }
    catch (error) {
      setState((current) => current ? {
        ...current,
        status: current.snapshot ? "cached" : "error",
        message: current.snapshot ? "Could not refresh. The last complete report is still shown." : "Could not load the colony.",
        technicalDetail: error instanceof Error ? error.message : String(error),
      } : current);
    } finally { setBusyAction(null); }
  };

  const updateAction = async (action: () => Promise<DesktopUpdateState>) => {
    if (updatePending) return;
    setUpdatePending(true);
    try { await action(); } catch (error) { console.error("Update IPC failed", error); }
    finally { setUpdatePending(false); }
  };
  const openUpdates = () => {
    setMenuOpen(false);
    setUtilityPanel("updates");
    if (["idle", "current"].includes(updateState.phase)) void updateAction(() => window.kingdomDesktop.checkForUpdates());
  };
  const openUtilityPanel = (panel: Exclude<UtilityPanel, null>) => {
    setMenuOpen(false);
    setUtilityPanel(panel);
  };

  const openColonySection = (section: ChronicleTabId) => {
    setActiveSection(section);
    setUtilityPanel(null);
    setMenuOpen(false);
  };

  const chooseViewMode = (nextMode: ChronicleViewMode) => {
    setViewMode(nextMode);
    try { window.localStorage.setItem(VIEW_MODE_STORAGE_KEY, nextMode); }
    catch { /* The preference still applies until the app closes. */ }
  };
  const updatesBody = <UpdatesPanel state={updateState} pending={updatePending}
    onCheck={() => void updateAction(() => window.kingdomDesktop.checkForUpdates())}
    onDownload={() => void updateAction(() => window.kingdomDesktop.downloadUpdate())}
    onRestart={() => void updateAction(() => window.kingdomDesktop.restartAndUpdate())}
    onLater={() => setUtilityPanel(null)} />;

  if (!state) {
    return (
      <div className="desktop-gate">
        <div className="desktop-gate-card">
          <div className="desktop-mark">KC</div>
          <p className="desktop-kicker">MineColonies companion</p>
          <h1>Opening Kingdom Chronicle</h1>
          <p>Loading your colony.</p>
          <span className="desktop-gate-progress" aria-label="Loading" />
        </div>
      </div>
    );
  }

  if (!state.snapshot || !dataSource) {
    return (
      <div className="desktop-gate">
        <div className="desktop-gate-card desktop-setup-card">
          <div className="desktop-mark">KC</div>
          <p className="desktop-kicker">MineColonies companion</p>
          <h1>{state.status === "needs-instance" ? "Connect your Minecraft instance" : "Colony report unavailable"}</h1>
          <p>{state.message}</p>
          {state.technicalDetail && <details><summary>More details</summary><code>{state.technicalDetail}</code></details>}
          <div className="desktop-actions">
            <button type="button" onClick={() => void choose()} disabled={busy}>{busyAction === "choose" ? "Opening…" : "Choose instance"}</button>
            {state.status !== "needs-instance" && <button type="button" className="secondary" onClick={() => void refresh()} disabled={busy}>{busyAction === "refresh" ? "Checking…" : "Try again"}</button>}
            <button type="button" className="secondary" onClick={openUpdates}>{updateState.phase === "ready" ? "Update ready" : "Updates"}</button>
          </div>
          <div className="desktop-trust-note"><i aria-hidden="true" /><span><strong>Your world stays untouched</strong>Kingdom Chronicle only reads colony reports.</span></div>
          {appInfo && <small>Kingdom Chronicle {appInfo.version}</small>}
        </div>
        {utilityPanel === "updates" && <div className="desktop-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget && !installingUpdate) setUtilityPanel(null); }}>
          <section ref={panelRef} className="desktop-panel" role="dialog" aria-modal="true" aria-labelledby="desktop-panel-title">
            <header><h2 id="desktop-panel-title">Updates</h2><button type="button" disabled={installingUpdate} onClick={() => setUtilityPanel(null)} aria-label="Close panel">×</button></header>
            {updatesBody}
          </section>
        </div>}
      </div>
    );
  }

  const snapshot = state.snapshot;
  const worldClosed = ["shutdown", "disconnect"].includes(snapshot.trigger);
  const live = state.status === "ready" && !worldClosed && connectionStateForSnapshot(snapshot, connectionTime) === "connected";
  const connectionTitle = live ? "LIVE — Minecraft connected" : "OFFLINE — showing last report";
  const currentNavigation = navigation.find((item) => item.id === activeSection) ?? navigation[0];
  const navCounts: Partial<Record<ChronicleTabId, number>> = {
    projects: snapshot.construction.length,
    citizens: snapshot.citizens.length,
    buildings: snapshot.buildings.length,
  };

  return (
    <div className={`desktop-shell${menuOpen ? " desktop-menu-open" : ""}`}>
      {menuOpen && <button type="button" className="desktop-menu-scrim" aria-label="Close navigation menu" onClick={() => setMenuOpen(false)} />}
      <aside className={`desktop-sidebar${menuOpen ? " open" : ""}`} aria-label="Navigation">
        <div className="desktop-sidebar-head">
          <button
            type="button"
            className="desktop-menu-toggle"
            aria-label={menuOpen ? "Close navigation menu" : "Open navigation menu"}
            aria-expanded={menuOpen}
            aria-controls="desktop-navigation-menu"
            onClick={() => setMenuOpen((open) => !open)}
          >
            <span /><span /><span />
          </button>
          <div className="desktop-brand" aria-hidden={!menuOpen}>
            <span aria-hidden="true">KC</span>
            <div><strong>Kingdom Chronicle</strong><small>Colony companion</small></div>
          </div>
        </div>

        <div
          id="desktop-navigation-menu"
          className="desktop-menu-content"
        >
          <nav className="desktop-nav" aria-label="Colony views">
            <p>Colony</p>
            {navigation.map((item) => (
              <button
                key={item.id}
                type="button"
                className={activeSection === item.id && !utilityPanel ? "active" : undefined}
                aria-current={activeSection === item.id && !utilityPanel ? "page" : undefined}
                aria-label={item.label}
                title={`${item.label} — ${item.description}`}
                onClick={() => openColonySection(item.id)}
              >
                <span className="desktop-nav-mark"><NavigationGlyph icon={item.icon} /></span>
                <span className="desktop-nav-copy"><strong>{item.label}</strong><small>{item.description}</small></span>
                {navCounts[item.id] != null && <b>{navCounts[item.id]}</b>}
              </button>
            ))}
          </nav>

          <nav className="desktop-utility-nav" aria-label="Application tools">
            <p>Kingdom Chronicle</p>
            <button type="button" title="Settings" aria-label="Settings" className={utilityPanel === "settings" ? "active" : undefined} onClick={() => openUtilityPanel("settings")}><span><NavigationGlyph icon="settings" /></span><strong>Settings</strong></button>
            <button type="button" title={updateState.phase === "ready" ? "Update ready — restart when convenient" : "Updates"} aria-label={updateState.phase === "ready" ? "Updates — update ready" : "Updates"} className={`${utilityPanel === "updates" ? "active " : ""}${updateState.phase === "ready" ? "desktop-update-ready-nav" : ""}`} onClick={openUpdates}><span><NavigationGlyph icon="updates" /></span><strong>{updateState.phase === "ready" ? "Update ready" : "Updates"}</strong></button>
            <button type="button" title="About" aria-label="About" className={utilityPanel === "about" ? "active" : undefined} onClick={() => openUtilityPanel("about")}><span><NavigationGlyph icon="about" /></span><strong>About</strong></button>
          </nav>
        </div>

        <div className={`desktop-connection desktop-status-${live ? "live" : "offline"}`} role="status" aria-live="polite" title={connectionTitle} aria-label={connectionTitle}>
          <i aria-hidden="true" />
          <div aria-hidden={!menuOpen}><strong>{connectionTitle}</strong><small>{formatDesktopTimestamp(snapshot.generatedAt)}</small></div>
        </div>
      </aside>

      <div className="desktop-workspace">
        <header className="desktop-commandbar">
          <div className="desktop-page-identity">
            <p>{snapshot.colony.name ?? "Your colony"} <span aria-hidden="true">/</span> {currentNavigation.label}</p>
            <h1>{currentNavigation.label}</h1>
            <small title={state.message}>{connectionTitle} · Last report {formatDesktopTimestamp(snapshot.generatedAt)}</small>
          </div>
          <div className="desktop-command-actions">
            <div className="desktop-density" role="group" aria-label="Reading depth">
              <button type="button" aria-pressed={viewMode === "simple"} onClick={() => chooseViewMode("simple")}>Simple</button>
              <button type="button" aria-pressed={viewMode === "detailed"} onClick={() => chooseViewMode("detailed")}>Detailed</button>
            </div>
            <button type="button" className="desktop-refresh" onClick={() => void refresh()} disabled={busy}>
              <span aria-hidden="true">↻</span>{busy ? "Refreshing…" : "Refresh"}
            </button>
          </div>
        </header>

        <div className="desktop-content">
          {state.technicalDetail && <p className="desktop-report-warning" role="alert">{state.message}</p>}
          <ItemSpriteContext value={spriteLoader}><ChronicleDashboard
            key={state.instancePath ?? snapshot.fingerprint ?? snapshot.generatedAt}
            initialSnapshot={snapshot}
            dataSource={dataSource}
            desktopMode
            activeTab={activeSection}
            onActiveTabChange={setActiveSection}
            viewMode={viewMode}
            onViewModeChange={chooseViewMode}
          /></ItemSpriteContext>
        </div>
      </div>

      {utilityPanel && <div className="desktop-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget && !installingUpdate) setUtilityPanel(null); }}>
        <section ref={panelRef} className="desktop-panel" role="dialog" aria-modal="true" aria-labelledby="desktop-panel-title">
          <header>
            <h2 id="desktop-panel-title">{utilityPanel === "settings" ? "Settings" : utilityPanel === "updates" ? "Updates" : "About"}</h2>
            <button type="button" onClick={() => setUtilityPanel(null)} disabled={installingUpdate} aria-label="Close panel">×</button>
          </header>

          {utilityPanel === "settings" && <div className="desktop-panel-body">
            <section className="desktop-setting-group">
              <div><h3>View</h3></div>
              <div className="desktop-setting-options" role="group" aria-label="Reading depth setting">
                <button type="button" aria-pressed={viewMode === "simple"} onClick={() => chooseViewMode("simple")}><strong>Simple</strong><small>Priorities, supplies and active problems</small></button>
                <button type="button" aria-pressed={viewMode === "detailed"} onClick={() => chooseViewMode("detailed")}><strong>Detailed</strong><small>Complete inventories, rosters and records</small></button>
              </div>
            </section>
            <section className="desktop-setting-group">
              <div><h3>Minecraft instance</h3><p title={state.instancePath ?? undefined}>{state.instanceName ?? "Selected instance"}</p></div>
              <button type="button" className="desktop-panel-action" onClick={() => void choose()} disabled={busy}>{busy ? "Opening…" : "Switch instance"}</button>
            </section>
            <section className="desktop-privacy-card"><i aria-hidden="true" /><div><strong>Your world stays untouched</strong><p>Kingdom Chronicle only reads local colony reports.</p></div></section>
          </div>}

          {utilityPanel === "updates" && updatesBody}
          {utilityPanel === "about" && <div className="desktop-panel-body desktop-about-body">
            <div className="desktop-about-mark">KC</div>
            <div><h3>Kingdom Chronicle</h3><p>Your MineColonies companion.</p></div>
            <dl>
              <div><dt>Version</dt><dd>{appInfo?.version ?? "Unavailable"}</dd></div>
              <div><dt>Colony reports</dt><dd>Local</dd></div>
              <div><dt>Updates</dt><dd>Background</dd></div>
            </dl>
            <p className="desktop-about-note">Shows your colony without changing your world.</p>
          </div>}
        </section>
      </div>}
    </div>
  );
}

const rendererRoot = import.meta.hot?.data.rendererRoot ?? createRoot(document.getElementById("root")!);
rendererRoot.render(<StrictMode><DesktopApp /></StrictMode>);
if (import.meta.hot) import.meta.hot.dispose((data) => { data.rendererRoot = rendererRoot; });
