import type { DesktopUpdateState } from "../types";

export function updateTitle(state: DesktopUpdateState) {
  switch (state.phase) {
    case "idle": return "Updates";
    case "checking": return "Checking for updates…";
    case "current": return "Kingdom Chronicle is up to date.";
    case "available": return `Kingdom Chronicle ${state.latestVersion} is available.`;
    case "downloading": return "Downloading update…";
    case "verifying": return "Verifying update…";
    case "ready": return "Update ready to install.";
    case "installing": return "Installing update…";
    case "error": return state.error?.operation === "check" ? "Could not check for updates." : "Update failed.";
  }
}
const megabytes = (value: number) => `${(value / 1_000_000).toFixed(1)} MB`;
export function UpdatesPanel({ state, pending, onCheck, onDownload, onRestart, onLater }: {
  state: DesktopUpdateState; pending?: boolean; onCheck(): void; onDownload(): void; onRestart(): void; onLater(): void;
}) {
  const busy = pending || ["checking", "downloading", "verifying", "installing"].includes(state.phase);
  const spinning = ["checking", "verifying", "installing"].includes(state.phase);
  return <div className="desktop-panel-body desktop-updates-body">
    <div className={`desktop-update-state desktop-update-${state.phase}`} aria-live="polite" aria-atomic="true">
      <span className={spinning ? "desktop-spinner" : "desktop-update-symbol"} aria-hidden="true">
        {spinning ? null : state.phase === "error" ? "!" : ["ready", "current"].includes(state.phase) ? "✓" : "↓"}
      </span>
      <h3>{updateTitle(state)}</h3>
      <p>{state.phase === "error" ? state.error?.message : state.phase === "ready"
        ? `Version ${state.latestVersion}. Restart when convenient.` : state.phase === "installing"
        ? "Kingdom Chronicle will reopen automatically. Your reports and settings are kept."
        : state.phase === "current" ? `Installed version ${state.currentVersion}`
        : state.phase === "available" ? state.summary || "Download now, then restart when convenient."
        : state.phase === "downloading" ? "You can continue using your colony reports."
        : state.phase === "verifying" ? "Checking the downloaded package before installation."
        : `Installed version ${state.currentVersion}`}</p>
      {state.phase === "downloading" && <div className="desktop-update-progress">
        <progress aria-label="Update download" max={100} value={state.progress?.percent ?? 0} />
        <small>{state.progress ? `${Math.round(state.progress.percent)}% · ${megabytes(state.progress.transferred)} of ${megabytes(state.progress.total)}${state.progress.bytesPerSecond > 0 ? ` · ${megabytes(state.progress.bytesPerSecond)}/s` : ""}` : "Preparing download…"}</small>
      </div>}
      {state.phase === "ready" && <button type="button" className="desktop-panel-primary" disabled={busy} onClick={onRestart}>Restart and update</button>}
      {state.phase === "available" && <button type="button" className="desktop-panel-primary" disabled={busy} onClick={onDownload}>Download update</button>}
      {state.phase === "ready" ? <button type="button" className="desktop-panel-action" disabled={busy} onClick={onLater}>Later</button>
        : state.phase !== "installing" && <button type="button" className="desktop-panel-action" disabled={busy} onClick={onCheck}>{state.phase === "error" ? "Retry" : "Check for updates"}</button>}
      {state.error && <details className="desktop-update-details"><summary>Technical details</summary><code>{state.error.detail}</code></details>}
      {state.checkedAt && <small>Checked {new Date(state.checkedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</small>}
    </div>
  </div>;
}
