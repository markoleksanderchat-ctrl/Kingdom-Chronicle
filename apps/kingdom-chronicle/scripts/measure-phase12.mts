import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";

import { buildDashboardModel } from "../lib/dashboard-model.ts";
import type { ColonySnapshot } from "../lib/colony-schema.ts";
import { isColonySnapshot } from "../lib/snapshot-validation.ts";
import { readLiveRuntime } from "../desktop/src/snapshot-reader.ts";

const ITERATIONS = 25;
const root = path.resolve(import.meta.dirname, "../../..");
const fixturePath = path.join(root, "contracts/snapshot/v2/fixtures/maximum-bounded.json");
const outputPath = path.resolve(process.argv[2] ?? path.join(root, "artifacts/baseline/phase12-chronicle.json"));

type SampleSummary = { medianMs: number; p95Ms: number; maxMs: number };

function summarize(samples: number[]): SampleSummary {
  const sorted = [...samples].sort((left, right) => left - right);
  const nearestRank = (percentile: number) => sorted[Math.max(0, Math.ceil(percentile * sorted.length) - 1)];
  return { medianMs: nearestRank(0.5), p95Ms: nearestRank(0.95), maxMs: sorted.at(-1) ?? 0 };
}

function measure(iterations: number, operation: (index: number) => unknown): SampleSummary {
  const samples: number[] = [];
  for (let index = 0; index < iterations; index += 1) {
    const started = performance.now();
    operation(index);
    samples.push(performance.now() - started);
  }
  return summarize(samples);
}

async function measureAsync(iterations: number, operation: (index: number) => Promise<unknown>): Promise<SampleSummary> {
  const samples: number[] = [];
  for (let index = 0; index < iterations; index += 1) {
    const started = performance.now();
    await operation(index);
    samples.push(performance.now() - started);
  }
  return summarize(samples);
}

async function createRuntimeFixture(snapshotText: string) {
  const temporaryRoot = path.join(root, ".tmp");
  await mkdir(temporaryRoot, { recursive: true });
  const instance = await mkdtemp(path.join(temporaryRoot, "phase12-runtime-"));
  const outputRoot = path.join(instance, "colonybridge");
  const latestRoot = path.join(outputRoot, "latest");
  const historyRoot = path.join(outputRoot, "snapshots", "colony-fixture");
  await mkdir(latestRoot, { recursive: true });
  await mkdir(historyRoot, { recursive: true });
  const latestFile = path.join(latestRoot, "colony-fixture.json");
  await writeFile(latestFile, snapshotText, "utf8");
  await writeFile(path.join(historyRoot, "2026-08-03T20-00-00Z.json"), snapshotText, "utf8");
  await writeFile(path.join(outputRoot, "bridge-info.json"), JSON.stringify({
    bridgeVersion: "0.28.1",
    protocolId: "com.colonybridge.snapshot",
    schemaVersion: 2,
    outputLayoutVersion: 1,
    transport: "filesystem",
    readOnly: true,
    status: "ready",
    outputRoot,
    latestFiles: [latestFile],
    coloniesDetected: 1,
    lastSuccessfulExportAt: "2026-08-03T20:00:00Z",
  }), "utf8");
  return instance;
}

const fixtureText = await readFile(fixturePath, "utf8");
const snapshot = JSON.parse(fixtureText) as ColonySnapshot;
if (!isColonySnapshot(snapshot)) throw new Error("Maximum-bounded fixture failed validation.");

const clones = Array.from({ length: ITERATIONS }, () => structuredClone(snapshot));
const parse = measure(ITERATIONS, () => JSON.parse(fixtureText));
const validation = measure(ITERATIONS, () => {
  if (!isColonySnapshot(snapshot)) throw new Error("Snapshot validation changed during measurement.");
});
const coldDashboard = measure(ITERATIONS, (index) => buildDashboardModel(clones[index], [], "detailed", "item_19"));
buildDashboardModel(snapshot, [], "detailed", "");
const stockSearch = measure(250, (index) => buildDashboardModel(snapshot, [], "detailed", `item_${index % 50}`));

const heapBefore = process.memoryUsage().heapUsed;
for (let index = 0; index < 1_000; index += 1) {
  buildDashboardModel(snapshot, [], index % 2 ? "simple" : "detailed", `item_${index % 50}`);
}
const heapAfter = process.memoryUsage().heapUsed;

const instance = await createRuntimeFixture(fixtureText);
let liveRead: SampleSummary;
try {
  liveRead = await measureAsync(ITERATIONS, () => readLiveRuntime(instance));
} finally {
  await rm(instance, { recursive: true, force: true });
}

const budgets = {
  dashboardModelP95Under50Ms: coldDashboard.p95Ms < 50,
  stockSearchP95Under50Ms: stockSearch.p95Ms < 50,
};
if (!Object.values(budgets).every(Boolean)) throw new Error(`Phase 12 performance budget failed: ${JSON.stringify(budgets)}`);

const report = {
  measuredAt: new Date().toISOString(),
  phase: 12,
  iterations: ITERATIONS,
  fixture: { path: path.relative(root, fixturePath).replaceAll("\\", "/"), bytes: Buffer.byteLength(fixtureText) },
  measurements: { snapshotParse: parse, snapshotValidation: validation, liveSnapshotAndHistoryRead: liveRead,
    coldDashboardModel: coldDashboard, stockSearch, repeatedModelHeapDeltaBytes: heapAfter - heapBefore },
  budgets,
  optimizationDecision: "Measured bounded paths are below budget; retain existing identity cache and watcher coalescing.",
  runtimeOnly: ["initial React commit", "tab-switch commit", "packaged startup", "packaged idle CPU"],
};
await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
process.stdout.write(`Phase 12 Chronicle performance evidence: ${outputPath}\n${JSON.stringify(report, null, 2)}\n`);
