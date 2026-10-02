import { lstat, open, readdir, realpath } from "node:fs/promises";
import path from "node:path";
import { inspectBridgeInfo } from "@/lib/bridge-info";
import type { ColonySnapshot, SnapshotHistoryEntry } from "@/lib/colony-schema";
import { isColonySnapshot } from "@/lib/snapshot-validation";
import { MAX_BRIDGE_INFO_BYTES, MAX_SNAPSHOT_BYTES } from "@/lib/runtime-contract";
import type { DesktopRuntimeState } from "./types";

function samePath(left: string, right: string) {
  const normalize = (value: string) => path.normalize(value).replace(/[\\/]$/, "").toLocaleLowerCase("en-US");
  return normalize(left) === normalize(right);
}

function isInside(parent: string, child: string) {
  const relative = path.relative(parent, child);
  return relative !== "" && relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

const retryDelay = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

export async function readBoundedJson(file: string, maximumBytes: number, beforeFinalStat?: () => Promise<void>) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const before = await lstat(file);
      if (!before.isFile() || before.isSymbolicLink()) throw new Error("A Bridge data path was not a regular file.");
      if (before.size > maximumBytes) throw new Error(`A Bridge data file exceeded the ${maximumBytes.toLocaleString("en-US")}-byte safety limit.`);
      const handle = await open(file, "r");
      const contents = Buffer.alloc(maximumBytes + 1);
      let total = 0;
      try {
        while (total < contents.length) {
          const { bytesRead } = await handle.read(contents, total, contents.length - total, total);
          if (bytesRead === 0) break;
          total += bytesRead;
        }
      } finally {
        await handle.close();
      }
      await beforeFinalStat?.();
      const after = await lstat(file);
      if (!after.isFile() || after.isSymbolicLink()) throw new Error("A Bridge data path changed while it was being read.");
      if (total > maximumBytes || after.size > maximumBytes) throw new Error(`A Bridge data file exceeded the ${maximumBytes.toLocaleString("en-US")}-byte safety limit.`);
      if (before.size !== after.size || before.mtimeMs !== after.mtimeMs || total !== after.size) {
        throw new Error("A Bridge data file changed while it was being read.");
      }
      return JSON.parse(contents.subarray(0, total).toString("utf8")) as unknown;
    } catch (error) {
      lastError = error;
      const retryable = error instanceof SyntaxError || (error instanceof Error && error.message.includes("changed while"));
      if (!retryable || attempt === 2) throw error;
      await retryDelay(30 * (attempt + 1));
    }
  }
  throw lastError;
}

async function validatedSnapshot(file: string, latestRoot: string) {
  const declared = await lstat(file);
  if (!declared.isFile() || declared.isSymbolicLink()) throw new Error("A latest snapshot was not a regular file.");
  const candidate = await realpath(file);
  if (!isInside(latestRoot, candidate)) throw new Error("A latest snapshot path escaped the Bridge output folder.");
  const value = await readBoundedJson(candidate, MAX_SNAPSHOT_BYTES);
  if (!isColonySnapshot(value)) throw new Error("A colony report did not match the supported Bridge contract.");
  return value;
}

async function loadHistory(outputRoot: string, latestFile: string): Promise<SnapshotHistoryEntry[]> {
  const stem = path.basename(latestFile, path.extname(latestFile));
  const historyRoot = path.join(outputRoot, "snapshots", stem);
  try {
    const realHistoryRoot = await realpath(historyRoot);
    const entries = (await readdir(realHistoryRoot, { withFileTypes: true }))
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .map((entry) => entry.name)
      .sort()
      .reverse();
    const history: SnapshotHistoryEntry[] = [];
    for (const name of entries) {
      if (history.length >= 2) break;
      try {
        const file = await realpath(path.join(realHistoryRoot, name));
        if (!isInside(realHistoryRoot, file)) continue;
        const value = await readBoundedJson(file, MAX_SNAPSHOT_BYTES);
        if (!isColonySnapshot(value)) continue;
        history.push({ generatedAt: value.generatedAt, receivedAt: value.generatedAt, snapshot: value });
      } catch {
        // A malformed historical entry is skipped without hiding a valid latest report.
      }
    }
    return history;
  } catch {
    return [];
  }
}

export async function readLiveRuntime(instancePath: string): Promise<DesktopRuntimeState> {
  const resolvedInstance = path.resolve(instancePath);
  const expectedOutputRoot = path.join(resolvedInstance, "colonybridge");
  const outputRootStat = await lstat(expectedOutputRoot);
  if (!outputRootStat.isDirectory() || outputRootStat.isSymbolicLink()) throw new Error("The Bridge output folder must be a regular local directory.");
  const infoValue = await readBoundedJson(path.join(expectedOutputRoot, "bridge-info.json"), MAX_BRIDGE_INFO_BYTES);
  const compatibility = inspectBridgeInfo(infoValue);
  if (!compatibility.compatible || !compatibility.info) {
    throw new Error(compatibility.issues.map((issue) => issue.message).join(" "));
  }
  const realOutputRoot = await realpath(expectedOutputRoot);
  const declaredOutputRoot = await realpath(path.resolve(compatibility.info.outputRoot));
  if (!samePath(realOutputRoot, declaredOutputRoot)) throw new Error("Bridge reported a different output folder than the selected instance.");
  if (compatibility.info.latestFiles.length === 0) throw new Error("Colony Bridge has not written its first colony report yet.");
  const declaredLatestRoot = path.join(realOutputRoot, "latest");
  const latestRootStat = await lstat(declaredLatestRoot);
  if (!latestRootStat.isDirectory() || latestRootStat.isSymbolicLink()) throw new Error("The Bridge latest folder must be a regular local directory.");
  const latestRoot = await realpath(declaredLatestRoot);
  const snapshots: Array<{ file: string; snapshot: ColonySnapshot }> = [];
  const failures: string[] = [];
  for (const file of compatibility.info.latestFiles) {
    try {
      snapshots.push({ file, snapshot: await validatedSnapshot(file, latestRoot) });
    } catch (error) {
      failures.push(error instanceof Error ? error.message : String(error));
    }
  }
  if (snapshots.length === 0) throw new Error(`No complete colony report could be read. ${failures[0] ?? "The Bridge latest folder was empty."}`);
  snapshots.sort((left, right) => Date.parse(right.snapshot.generatedAt) - Date.parse(left.snapshot.generatedAt));
  const latest = snapshots[0];
  const history = await loadHistory(realOutputRoot, latest.file);
  return {
    status: "ready",
    snapshot: latest.snapshot,
    history,
    instanceName: path.basename(resolvedInstance),
    instancePath: resolvedInstance,
    message: ["disconnect", "shutdown"].includes(latest.snapshot.trigger)
      ? "Minecraft is closed. Showing the latest colony report."
      : "Colony connected.",
    technicalDetail: `Bridge ${compatibility.info.bridgeVersion}; schema ${compatibility.info.schemaVersion}; ${latest.snapshot.generatedAt}`,
  };
}
