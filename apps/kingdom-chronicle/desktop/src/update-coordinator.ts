import type { DesktopUpdateState } from "./types";

export interface UpdateInfo { version: string; releaseNotes?: unknown; files?: Array<{ url: string; sha512: string; size?: number }> }
interface UpdaterLike {
  on(event: "update-available" | "update-downloaded", listener: (info: UpdateInfo) => void): unknown;
  on(event: "update-not-available", listener: () => void): unknown;
  on(event: "error", listener: (error: Error) => void): unknown;
  on(event: "download-progress", listener: (progress: { percent: number; transferred: number; total: number; bytesPerSecond: number }) => void): unknown;
  checkForUpdates(): Promise<unknown>;
  downloadUpdate(): Promise<unknown>;
  quitAndInstall(silent: boolean, forceRunAfter: boolean): void;
}
export interface UpdateCoordinatorDependencies {
  version: string;
  updater: UpdaterLike;
  enabled: boolean;
  emit(state: DesktopUpdateState): void;
  log(message: string): void;
  beforeInstall(expectedVersion: string): Promise<void>;
  validateRelease?(info: UpdateInfo): void;
  now?: () => string;
}

export class UpdateCoordinator {
  private state: DesktopUpdateState;
  private checking: Promise<DesktopUpdateState> | null = null;
  private downloading: Promise<DesktopUpdateState> | null = null;
  private installing: Promise<DesktopUpdateState> | null = null;
  private readonly now: () => string;
  constructor(private readonly dependencies: UpdateCoordinatorDependencies) {
    this.state = { revision: 0, phase: "idle", currentVersion: dependencies.version };
    this.now = dependencies.now ?? (() => new Date().toISOString());
    const updater = dependencies.updater;
    updater.on("update-available", (info: UpdateInfo) => {
      if (this.state.phase !== "checking") return;
      try { dependencies.validateRelease?.(info); }
      catch (error) { this.fail("check", error); return; }
      this.set({ phase: "available", latestVersion: info.version, checkedAt: this.now(),
        summary: typeof info.releaseNotes === "string" ? info.releaseNotes.slice(0, 4000) : undefined });
    });
    updater.on("update-not-available", () => {
      if (this.state.phase === "checking") this.set({ phase: "current", checkedAt: this.now() });
    });
    updater.on("download-progress", (progress) => {
      if (this.state.phase !== "downloading" && this.state.phase !== "verifying") return;
      if (progress.percent >= 100) {
        this.set({ ...this.state, phase: "verifying", progress: undefined });
        return;
      }
      this.set({ ...this.state, phase: "downloading", progress: {
        percent: Math.min(100, Math.max(0, Number(progress.percent) || 0)),
        transferred: Number(progress.transferred) || 0, total: Number(progress.total) || 0,
        bytesPerSecond: Number(progress.bytesPerSecond) || 0,
      } });
    });
    updater.on("update-downloaded", (info: UpdateInfo) => {
      if (this.state.phase !== "downloading" && this.state.phase !== "verifying") return;
      // electron-updater emits this only after the supported SHA512/signature checks.
      this.set({ ...this.state, phase: "ready", latestVersion: info.version, progress: undefined });
    });
    updater.on("error", (error) => {
      const operation = this.state.phase === "installing" ? "install"
        : this.downloading || this.state.phase === "downloading" ? "download" : "check";
      this.fail(operation, error);
    });
  }
  current() { return { ...this.state }; }
  private set(next: Omit<DesktopUpdateState, "revision" | "currentVersion">) {
    this.state = { ...next, currentVersion: this.dependencies.version, revision: this.state.revision + 1 };
    this.dependencies.log(`update state ${this.state.phase}${this.state.latestVersion ? ` ${this.state.latestVersion}` : ""}`);
    this.dependencies.emit(this.current());
  }
  private fail(operation: NonNullable<DesktopUpdateState["error"]>["operation"], error: unknown) {
    const detail = error instanceof Error ? error.stack ?? error.message : String(error);
    this.dependencies.log(`update ${operation} failed: ${detail}`);
    this.set({ phase: "error", latestVersion: this.state.latestVersion, checkedAt: this.state.checkedAt,
      error: { operation, message: operation === "check" ? "The update service could not be reached or returned an invalid release. Try again."
        : operation === "download" ? "The download could not be verified. Retry to download a valid update."
        : operation === "health" ? "The last update did not pass its startup checks. Your reports have been retained."
        : "The update could not be installed. Restart Kingdom Chronicle and try again.", detail } });
  }
  healthError(error: unknown) { this.fail("health", error); }
  check(): Promise<DesktopUpdateState> {
    if (this.checking) return this.checking;
    if (this.downloading || this.installing || ["ready", "installing"].includes(this.state.phase)) return Promise.resolve(this.current());
    if (!this.dependencies.enabled) {
      this.fail("check", new Error("Updates require an installed release. Use the Windows installer for this build."));
      return Promise.resolve(this.current());
    }
    this.set({ phase: "checking" });
    const operation = (async () => {
      try { await this.dependencies.updater.checkForUpdates(); }
      catch (error) { this.fail("check", error); }
      return this.current();
    })();
    this.checking = operation;
    void operation.finally(() => { if (this.checking === operation) this.checking = null; });
    return operation;
  }
  download(): Promise<DesktopUpdateState> {
    if (this.downloading) return this.downloading;
    if (this.state.phase !== "available") return Promise.resolve(this.current());
    this.set({ ...this.state, phase: "downloading", progress: undefined, error: undefined });
    const operation = (async () => {
      try {
        await this.dependencies.updater.downloadUpdate();
        if (this.state.phase === "downloading") this.set({ ...this.state, phase: "verifying", progress: undefined });
      } catch (error) { this.fail("download", error); }
      return this.current();
    })();
    this.downloading = operation;
    void operation.finally(() => { if (this.downloading === operation) this.downloading = null; });
    return operation;
  }
  install(): Promise<DesktopUpdateState> {
    if (this.installing) return this.installing;
    if (this.state.phase !== "ready" || !this.state.latestVersion) return Promise.resolve(this.current());
    const expected = this.state.latestVersion;
    this.set({ ...this.state, phase: "installing", progress: undefined, error: undefined });
    const operation = (async () => {
      try {
        await this.dependencies.beforeInstall(expected);
        this.dependencies.log(`handoff to NSIS: ${this.dependencies.version} -> ${expected}`);
        // Stable v6 API: silent per-user installation, explicitly relaunch afterwards.
        this.dependencies.updater.quitAndInstall(true, true);
      } catch (error) { this.fail("install", error); }
      return this.current();
    })();
    this.installing = operation;
    void operation.finally(() => { if (this.installing === operation) this.installing = null; });
    return operation;
  }
  async backgroundCheck() {
    if (this.state.phase === "error" && this.state.error?.operation === "health") return;
    const state = await this.check();
    if (state.phase === "available") await this.download();
  }
}
