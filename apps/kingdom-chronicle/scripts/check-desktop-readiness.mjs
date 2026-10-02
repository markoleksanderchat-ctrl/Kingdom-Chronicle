import { lstat, readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { inspectBridgeInfo } from "../lib/bridge-info.ts";
import { isColonySnapshot } from "../lib/snapshot-validation.ts";
import { MAX_BRIDGE_INFO_BYTES, MAX_SNAPSHOT_BYTES } from "../lib/runtime-contract.ts";

const instanceRoot = path.resolve(process.argv[2] ?? "");
if (!process.argv[2]) {
  console.error("Usage: npm run desktop:check -- <minecraft-instance-folder>");
  process.exit(2);
}

const outputRoot = path.join(instanceRoot, "colonybridge");
const infoPath = path.join(outputRoot, "bridge-info.json");

function isInside(parent, child) {
  const relative = path.relative(parent, child);
  return relative !== "" && !relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative);
}

try {
  const infoStat = await lstat(infoPath);
  if (!infoStat.isFile() || infoStat.isSymbolicLink()) throw new Error("bridge-info.json is not a regular file.");
  if (infoStat.size > MAX_BRIDGE_INFO_BYTES) throw new Error(`bridge-info.json exceeds ${MAX_BRIDGE_INFO_BYTES} bytes.`);
  const result = inspectBridgeInfo(JSON.parse(await readFile(infoPath, "utf8")));
  if (!result.compatible || !result.info) throw new Error(result.issues.map((issue) => issue.message).join(" "));

  const declaredRoot = path.resolve(result.info.outputRoot);
  const realOutputRoot = await realpath(outputRoot);
  if ((await realpath(declaredRoot)) !== realOutputRoot) throw new Error("Bridge declared a different output root than the selected instance.");
  const latestRoot = await realpath(path.join(realOutputRoot, "latest"));
  const snapshots = [];
  for (const declaredFile of result.info.latestFiles) {
    const candidate = path.resolve(declaredFile);
    const candidateStat = await lstat(candidate);
    if (!candidateStat.isFile() || candidateStat.isSymbolicLink()) throw new Error(`Latest snapshot is not a regular file: ${candidate}`);
    const realCandidate = await realpath(candidate);
    if (!isInside(latestRoot, realCandidate)) throw new Error(`Latest snapshot escaped the bridge latest folder: ${candidate}`);
    if (candidateStat.size > MAX_SNAPSHOT_BYTES) throw new Error(`Latest snapshot exceeds ${MAX_SNAPSHOT_BYTES} bytes: ${candidate}`);
    const snapshot = JSON.parse(await readFile(realCandidate, "utf8"));
    if (!isColonySnapshot(snapshot)) throw new Error(`Latest snapshot does not match the supported contract: ${candidate}`);
    snapshots.push({ colony: snapshot.colony.name ?? `Colony ${snapshot.colony.id ?? "unknown"}`, generatedAt: snapshot.generatedAt, bytes: candidateStat.size });
  }

  console.log(`Desktop readiness check passed for Colony Bridge ${result.info.bridgeVersion}.`);
  console.log(`Protocol ${result.info.protocolId}; schema ${result.info.schemaVersion}; layout ${result.info.outputLayoutVersion}; read-only filesystem transport.`);
  console.log(`${snapshots.length} latest snapshot${snapshots.length === 1 ? "" : "s"} validated within size and path boundaries.`);
  for (const snapshot of snapshots) console.log(`- ${snapshot.colony}: ${snapshot.generatedAt} (${snapshot.bytes} bytes)`);
} catch (error) {
  console.error(`Desktop readiness check failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
