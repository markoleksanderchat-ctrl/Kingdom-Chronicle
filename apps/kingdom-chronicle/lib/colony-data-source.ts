import type { ColonySnapshot, SnapshotHistoryEntry } from "./colony.ts";
import { isColonySnapshot } from "./snapshot-validation.ts";

export interface SnapshotReadResult {
  snapshot: ColonySnapshot;
  receivedAt: string | null;
}

export interface ColonyDataSource {
  latest(signal?: AbortSignal): Promise<SnapshotReadResult>;
  history(signal?: AbortSignal): Promise<SnapshotHistoryEntry[]>;
}

export class OfflineColonyDataSource implements ColonyDataSource {
  private readonly entries: SnapshotHistoryEntry[];

  constructor(snapshot: ColonySnapshot, history: SnapshotHistoryEntry[] = []) {
    if (!isColonySnapshot(snapshot)) throw new Error("Offline snapshot did not match the supported Colony Bridge contract");
    this.entries = history.filter((entry) => isColonySnapshot(entry.snapshot));
    this.snapshot = snapshot;
  }

  private readonly snapshot: ColonySnapshot;

  async latest(): Promise<SnapshotReadResult> {
    return { snapshot: this.snapshot, receivedAt: this.snapshot.generatedAt };
  }

  async history(): Promise<SnapshotHistoryEntry[]> {
    return this.entries;
  }
}
