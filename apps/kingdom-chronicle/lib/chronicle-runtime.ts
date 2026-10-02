"use client";

import { useEffect, useRef, useState } from "react";
import type { ColonyDataSource } from "./colony-data-source";
import type { ColonySnapshot, SnapshotHistoryEntry } from "./colony-schema";
import { snapshotIdentity } from "./selectors/presentation";

export type ChronicleConnectionState = "checking" | "connected" | "stale" | "degraded";

export interface ChronicleRuntimeState {
  snapshot: ColonySnapshot;
  history: SnapshotHistoryEntry[];
  receivedAt: string | null;
  observedAt: string | null;
  connectionState: ChronicleConnectionState;
  initialLoadDone: boolean;
}

export function connectionStateForSnapshot(snapshot: ColonySnapshot, now = Date.now()): ChronicleConnectionState {
  const snapshotAgeMs = now - new Date(snapshot.generatedAt).valueOf();
  const worldClosed = ["shutdown", "disconnect"].includes(snapshot.trigger);
  return !worldClosed && snapshotAgeMs > 5 * 60_000 ? "stale" : "connected";
}

export function useChronicleRuntime(initialSnapshot: ColonySnapshot, dataSource: ColonyDataSource,
                                    desktopMode: boolean): ChronicleRuntimeState {
  const [snapshot, setSnapshot] = useState<ColonySnapshot>(initialSnapshot);
  const [connectionState, setConnectionState] = useState<ChronicleConnectionState>("checking");
  const [initialLoadDone, setInitialLoadDone] = useState(false);
  const [history, setHistory] = useState<SnapshotHistoryEntry[]>([]);
  const [receivedAt, setReceivedAt] = useState<string | null>(null);
  const [observedAt, setObservedAt] = useState<string | null>(null);
  const latestSnapshotIdentityRef = useRef(snapshotIdentity(initialSnapshot));
  const historyLoadedRef = useRef(false);

  useEffect(() => {
    let active = true;
    let controller: AbortController | null = null;
    const refresh = async () => {
      controller?.abort();
      controller = new AbortController();
      try {
        const latest = await dataSource.latest(controller.signal);
        const next = latest.snapshot;
        const firstObservation = !historyLoadedRef.current;
        const nextIdentity = snapshotIdentity(next);
        const hasNewSnapshot = nextIdentity !== latestSnapshotIdentityRef.current;
        let historyPayload: { entries?: SnapshotHistoryEntry[] } | null = null;
        if (firstObservation || hasNewSnapshot) {
          historyPayload = { entries: await dataSource.history(controller.signal) };
        }
        if (!active) return;
        if (hasNewSnapshot) {
          latestSnapshotIdentityRef.current = nextIdentity;
          setSnapshot(next);
        }
        if (historyPayload) {
          historyLoadedRef.current = true;
          setHistory(historyPayload.entries ?? []);
        }
        setReceivedAt(latest.receivedAt);
        if (firstObservation || hasNewSnapshot) setObservedAt(new Date().toISOString());
        setConnectionState(connectionStateForSnapshot(next));
      } catch (error) {
        if (active && !(error instanceof DOMException && error.name === "AbortError")) setConnectionState("degraded");
      } finally {
        if (active) setInitialLoadDone(true);
      }
    };
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    void refresh();
    const timer = desktopMode ? window.setInterval(refreshWhenVisible, 90_000) : null;
    if (desktopMode) {
      window.addEventListener("online", refresh);
      document.addEventListener("visibilitychange", refreshWhenVisible);
    }
    return () => {
      active = false;
      controller?.abort();
      if (timer != null) window.clearInterval(timer);
      if (desktopMode) {
        window.removeEventListener("online", refresh);
        document.removeEventListener("visibilitychange", refreshWhenVisible);
      }
    };
  }, [dataSource, desktopMode]);

  return { snapshot, history, receivedAt, observedAt, connectionState, initialLoadDone };
}
