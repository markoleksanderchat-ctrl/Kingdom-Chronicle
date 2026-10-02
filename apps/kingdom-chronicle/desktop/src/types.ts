import type { ColonySnapshot, SnapshotHistoryEntry } from "@/lib/colony-schema";

export type DesktopRuntimeStatus = "ready" | "cached" | "needs-instance" | "error";

export interface DesktopRuntimeState {
  status: DesktopRuntimeStatus;
  snapshot: ColonySnapshot | null;
  history: SnapshotHistoryEntry[];
  instanceName: string | null;
  instancePath: string | null;
  message: string;
  technicalDetail: string | null;
}

export interface DesktopAppInfo {
  name: string;
  version: string;
  updates: "background";
}

export interface DesktopAvailableUpdate {
  status: "up-to-date" | "available";
  currentVersion: string;
  latestVersion: string;
  checkedAt: string;
  source: string;
  summary: string;
  downloadUrl: string;
  releaseNotesUrl: string;
  sizeBytes: number;
  sha256: string;
}

export type DesktopUpdateResult = DesktopAvailableUpdate | {
  status: "error";
  currentVersion: string;
  checkedAt: string;
  source: string;
  message: string;
};

export interface DesktopUpdateProgress {
  stage: "downloading" | "verifying" | "ready";
  receivedBytes: number;
  totalBytes: number;
}

export type DesktopUpdateInstallResult = {
  status: "cancelled" | "not-available" | "launching-installer";
  message: string;
} | {
  status: "error";
  message: string;
};

/** Complete main-process snapshot: the renderer never combines separate phases. */
export interface DesktopUpdateState {
  revision: number;
  phase: "idle" | "checking" | "current" | "available" | "downloading" | "verifying" | "ready" | "installing" | "error";
  currentVersion: string;
  latestVersion?: string;
  checkedAt?: string;
  summary?: string;
  progress?: { percent: number; transferred: number; total: number; bytesPerSecond: number };
  error?: { operation: "check" | "download" | "install" | "health"; message: string; detail: string };
}

export interface KingdomDesktopApi {
  rendererReady(): Promise<void>;
  getItemSprite(id: string): Promise<import("@/lib/item-sprite").ItemSprite | null>;
  getAppInfo(): Promise<DesktopAppInfo>;
  getUpdateState(): Promise<DesktopUpdateState>;
  checkForUpdates(): Promise<DesktopUpdateState>;
  downloadUpdate(): Promise<DesktopUpdateState>;
  restartAndUpdate(): Promise<DesktopUpdateState>;
  getRuntimeState(): Promise<DesktopRuntimeState>;
  chooseInstance(): Promise<DesktopRuntimeState>;
  refresh(): Promise<DesktopRuntimeState>;
  clearLocalCache(): Promise<void>;
  onUpdateState(callback: (state: DesktopUpdateState) => void): () => void;
  onRuntimeChanged(callback: (state: DesktopRuntimeState) => void): () => void;
}
