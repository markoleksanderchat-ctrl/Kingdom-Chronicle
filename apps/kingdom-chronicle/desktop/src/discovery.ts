import { lstat, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { inspectBridgeInfo } from "@/lib/bridge-info";
import { MAX_BRIDGE_INFO_BYTES } from "@/lib/runtime-contract";

export async function isCompatibleInstance(instancePath: string) {
  try {
    const instanceStat = await lstat(instancePath);
    const bridgeRoot = path.join(instancePath, "colonybridge");
    const bridgeStat = await lstat(bridgeRoot);
    if (!instanceStat.isDirectory() || instanceStat.isSymbolicLink() || !bridgeStat.isDirectory() || bridgeStat.isSymbolicLink()) return false;
    const infoPath = path.join(bridgeRoot, "bridge-info.json");
    const stat = await lstat(infoPath);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_BRIDGE_INFO_BYTES) return false;
    return inspectBridgeInfo(JSON.parse(await readFile(infoPath, "utf8"))).compatible;
  } catch {
    return false;
  }
}

export async function discoverInstance(savedPath: string | null, profilePath = process.env.USERPROFILE ?? "") {
  if (savedPath && await isCompatibleInstance(savedPath)) return path.resolve(savedPath);
  if (!profilePath) return null;
  const instancesRoot = path.join(profilePath, "curseforge", "minecraft", "Instances");
  try {
    const entries = await readdir(instancesRoot, { withFileTypes: true });
    const matches: string[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const candidate = path.join(instancesRoot, entry.name);
      if (await isCompatibleInstance(candidate)) matches.push(candidate);
    }
    return matches.length === 1 ? matches[0] : null;
  } catch {
    return null;
  }
}
