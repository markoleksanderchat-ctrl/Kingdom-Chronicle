import path from "node:path";
import { discoverInstance, isCompatibleInstance } from "./discovery";
import { readLiveRuntime } from "./snapshot-reader";
import { readCachedState, readSelectedInstance, saveCachedState, saveSelectedInstance } from "./storage";
import type { DesktopRuntimeState } from "./types";

export interface RuntimeServiceDependencies {
  userDataPath: string;
  profilePath?: string;
  discover?: typeof discoverInstance;
  isCompatible?: typeof isCompatibleInstance;
  readLive?: typeof readLiveRuntime;
  readSelected?: typeof readSelectedInstance;
  saveSelected?: typeof saveSelectedInstance;
  readCached?: typeof readCachedState;
  saveCached?: typeof saveCachedState;
  onInstanceReady?: (instancePath: string) => void;
  onSelectionChange?: () => void;
  trace?: (message: string) => void;
}

const errorMessage = (error: unknown) => error instanceof Error ? error.message : String(error);

export class RuntimeService {
  private selectedInstance: string | null = null;
  private revision = 0;
  private runtimeRead: { revision: number; promise: Promise<DesktopRuntimeState> } | null = null;
  private latestState: { revision: number; state: DesktopRuntimeState } | null = null;
  private pendingWrites = new Set<Promise<unknown>>();
  private readonly dependencies: Required<Omit<RuntimeServiceDependencies, "profilePath">> & { profilePath: string };

  constructor(dependencies: RuntimeServiceDependencies) {
    this.dependencies = {
      userDataPath: dependencies.userDataPath,
      profilePath: dependencies.profilePath ?? process.env.USERPROFILE ?? "",
      discover: dependencies.discover ?? discoverInstance,
      isCompatible: dependencies.isCompatible ?? isCompatibleInstance,
      readLive: dependencies.readLive ?? readLiveRuntime,
      readSelected: dependencies.readSelected ?? readSelectedInstance,
      saveSelected: (...args) => this.trackWrite((dependencies.saveSelected ?? saveSelectedInstance)(...args)),
      readCached: dependencies.readCached ?? readCachedState,
      saveCached: (...args) => this.trackWrite((dependencies.saveCached ?? saveCachedState)(...args)),
      onInstanceReady: dependencies.onInstanceReady ?? (() => undefined),
      onSelectionChange: dependencies.onSelectionChange ?? (() => undefined),
      trace: dependencies.trace ?? (() => undefined),
    };
  }

  get selectedInstancePath() { return this.selectedInstance; }

  private trackWrite<T>(promise: Promise<T>): Promise<T> {
    this.pendingWrites.add(promise);
    void promise.finally(() => this.pendingWrites.delete(promise)).catch(() => undefined);
    return promise;
  }

  async flush() {
    await this.runtimeRead?.promise;
    await Promise.all([...this.pendingWrites]);
  }

  emptyState(status: "needs-instance" | "error", message: string, detail: string | null = null): DesktopRuntimeState {
    return { status, snapshot: null, history: [], instanceName: this.selectedInstance ? path.basename(this.selectedInstance) : null,
      instancePath: this.selectedInstance, message, technicalDetail: detail };
  }

  current(): Promise<DesktopRuntimeState> {
    const revision = this.revision;
    if (this.runtimeRead?.revision === revision) return this.runtimeRead.promise;
    const slot = { revision, promise: this.loadForRevision(revision).then((state) => {
      if (this.revision === revision) this.latestState = { revision, state };
      return state;
    }) };
    this.runtimeRead = slot;
    void slot.promise.finally(() => { if (this.runtimeRead === slot) this.runtimeRead = null; }).catch(() => undefined);
    return slot.promise;
  }

  async select(candidatePath: string): Promise<DesktopRuntimeState> {
    const candidate = path.resolve(candidatePath);
    if (!await this.dependencies.isCompatible(candidate)) {
      const previous = await this.current();
      return { ...previous, message: "That folder does not contain a compatible Colony Bridge report.",
        technicalDetail: "Choose the Minecraft instance folder itself, not its mods or colonybridge subfolder." };
    }
    this.selectedInstance = candidate;
    this.revision += 1;
    this.latestState = null;
    this.dependencies.onSelectionChange();
    let persistenceError: unknown = null;
    try { await this.dependencies.saveSelected(this.dependencies.userDataPath, candidate); }
    catch (error) { persistenceError = error; }
    const state = await this.current();
    return persistenceError ? { ...state,
      message: `${state.message} This instance is active for this session, but the selection could not be saved.`,
      technicalDetail: `${state.technicalDetail ?? ""}\nSettings: ${errorMessage(persistenceError)}`.trim() } : state;
  }

  shutdown() {
    this.revision += 1;
    this.runtimeRead = null;
    this.latestState = null;
    this.dependencies.onSelectionChange();
  }

  private async loadForRevision(startRevision: number): Promise<DesktopRuntimeState> {
    if (!this.selectedInstance) {
      const saved = await this.dependencies.readSelected(this.dependencies.userDataPath);
      const discovered = await this.dependencies.discover(saved, this.dependencies.profilePath);
      if (this.revision !== startRevision) return this.currentRevisionState();
      this.selectedInstance = discovered;
      if (discovered) {
        await this.dependencies.saveSelected(this.dependencies.userDataPath, discovered)
          .catch((error) => this.dependencies.trace(`could not save discovered instance: ${errorMessage(error)}`));
      }
    }
    const instance = this.selectedInstance;
    if (!instance) return this.emptyState("needs-instance", "Choose the CurseForge instance that contains Colony Bridge.");
    try {
      const state = await this.dependencies.readLive(instance);
      if (this.revision !== startRevision || this.selectedInstance !== instance) return this.currentRevisionState();
      this.dependencies.onInstanceReady(instance);
      try {
        await this.dependencies.saveCached(this.dependencies.userDataPath, state);
      } catch (error) {
        if (this.revision !== startRevision || this.selectedInstance !== instance) return this.currentRevisionState();
        return { ...state, message: `${state.message} The local backup could not be updated.`,
          technicalDetail: `${state.technicalDetail ?? ""}\nCache: ${errorMessage(error)}`.trim() };
      }
      if (this.revision !== startRevision || this.selectedInstance !== instance) return this.currentRevisionState();
      return state;
    } catch (error) {
      if (this.revision !== startRevision || this.selectedInstance !== instance) return this.currentRevisionState();
      const cached = await this.dependencies.readCached(this.dependencies.userDataPath, instance);
      if (this.revision !== startRevision || this.selectedInstance !== instance) return this.currentRevisionState();
      if (cached?.snapshot) return { ...cached, status: "cached",
        message: "The selected instance is unavailable. Showing the last complete local copy.", technicalDetail: errorMessage(error) };
      return this.emptyState("error", "Kingdom Chronicle could not read a complete colony report.", errorMessage(error));
    }
  }

  private currentRevisionState(): Promise<DesktopRuntimeState> | DesktopRuntimeState {
    if (this.runtimeRead?.revision === this.revision) return this.runtimeRead.promise;
    if (this.latestState?.revision === this.revision) return this.latestState.state;
    return this.current();
  }
}
