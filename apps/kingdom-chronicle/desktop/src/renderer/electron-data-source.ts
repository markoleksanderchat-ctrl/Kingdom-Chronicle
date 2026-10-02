import type { ColonyDataSource, SnapshotReadResult } from "@/lib/colony-data-source";
import type { SnapshotHistoryEntry } from "@/lib/colony-schema";
import type { DesktopRuntimeState } from "../types";

export class ElectronColonyDataSource implements ColonyDataSource {
  private current: DesktopRuntimeState;
  private refreshedAt: number;

  constructor(initial: DesktopRuntimeState) {
    this.current = initial;
    this.refreshedAt = Date.now();
  }

  private async refresh(signal?: AbortSignal) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    if (Date.now() - this.refreshedAt > 1_000) {
      this.current = await window.kingdomDesktop.refresh();
      this.refreshedAt = Date.now();
    }
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    if (!this.current.snapshot) throw new Error(this.current.message);
    return this.current;
  }

  async latest(signal?: AbortSignal): Promise<SnapshotReadResult> {
    const state = await this.refresh(signal);
    return { snapshot: state.snapshot!, receivedAt: state.snapshot!.generatedAt };
  }

  async history(signal?: AbortSignal): Promise<SnapshotHistoryEntry[]> {
    return (await this.refresh(signal)).history;
  }
}
