import { constants, copyFileSync, cpSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { isColonySnapshot } from "@/lib/snapshot-validation";

function safeJson(file: string, maximum: number) {
  if (lstatSync(file).isSymbolicLink() || statSync(file).size > maximum) throw new Error(`Invalid stored data: ${file}`);
  return JSON.parse(readFileSync(file, "utf8"));
}
export function verifyUserData(directory: string) {
  const settings = path.join(directory, "settings.json");
  if (existsSync(settings)) {
    const value = safeJson(settings, 64_000);
    if (value.instancePath !== null && typeof value.instancePath !== "string") throw new Error("Settings are not readable.");
  }
  const cache = path.join(directory, "cache/last-good.json");
  if (existsSync(cache) && !isColonySnapshot(safeJson(cache, 4_000_000).snapshot)) throw new Error("The saved colony report is not readable.");
}
export function migrateLegacyData(destination: string, legacy: string, log: (message: string) => void) {
  mkdirSync(destination, { recursive: true });
  if (!existsSync(legacy)) return;
  if (lstatSync(legacy).isSymbolicLink()) throw new Error("Legacy data path is a link; automatic migration is unsafe.");
  const backup = path.join(destination, "legacy-user-data-backup"), marker = path.join(backup, "migration-complete.json");
  if (!existsSync(marker)) {
    const files: Array<{ name: string; sha256: string }> = [];
    const collect = (directory: string) => {
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const source = path.join(directory, entry.name);
        if (entry.isSymbolicLink()) throw new Error(`Legacy data contains a link: ${source}`);
        if (entry.isDirectory()) collect(source);
        else if (entry.isFile()) files.push({ name: path.relative(legacy, source), sha256: createHash("sha256").update(readFileSync(source)).digest("hex") });
      }
    };
    collect(legacy);
    cpSync(legacy, backup, { recursive: true });
    for (const file of files) if (createHash("sha256").update(readFileSync(path.join(backup, file.name))).digest("hex") !== file.sha256) throw new Error(`Legacy backup verification failed: ${file.name}`);
    writeFileSync(marker, JSON.stringify({ source: legacy, files }, null, 2));
    log(`Complete legacy profile preserved outside the install folder: ${backup}`);
  }
  verifyUserData(legacy);
  for (const name of ["Local Storage", "Preferences"]) {
    const source = path.join(legacy, name), target = path.join(destination, name);
    if (existsSync(source) && !existsSync(target)) {
      cpSync(source, target, { recursive: true, errorOnExist: true, force: false });
      log(`Preserved legacy ${name}; existing Roaming preferences take priority.`);
    }
  }
  const report: Array<{ file: string; status: string }> = [];
  for (const name of ["settings.json", "cache/last-good.json"]) {
    const source = path.join(legacy, name), target = path.join(destination, name);
    if (!existsSync(source)) continue;
    if (existsSync(target)) {
      const same = readFileSync(source).equals(readFileSync(target));
      report.push({ file: name, status: same ? "already preserved" : "conflict: both copies retained; existing Roaming data remains active" });
      continue;
    }
    mkdirSync(path.dirname(target), { recursive: true });
    copyFileSync(source, target, constants.COPYFILE_EXCL);
    if (!readFileSync(source).equals(readFileSync(target))) throw new Error(`Migration verification failed: ${name}`);
    report.push({ file: name, status: "copied and verified; original retained" });
  }
  writeFileSync(path.join(destination, "legacy-data-migration.json"), JSON.stringify(report, null, 2));
  log(`Legacy data migration: ${JSON.stringify(report)}`);
}

/** Never delete UserData, arbitrary folders, workspace builds or taskbar pins. */
export function inspectLegacyArtifacts(root: string, userData: string, clean: boolean, log: (message: string) => void) {
  const inventory: Array<{ path: string; classification: string; removed: boolean; fingerprint?: string }> = [];
  if (!existsSync(root)) return inventory;
  const resolvedRoot = realpathSync(root);
  const launcherHashes = new Set<string>();
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const target = path.join(root, entry.name);
    let owned = false;
    if (!entry.isSymbolicLink() && entry.isDirectory() && /^app-\d+\.\d+\.\d+$/.test(entry.name)) {
      const metadata = path.join(target, "resources/app/package.json");
      try {
        const value = safeJson(metadata, 64_000);
        owned = value.name === "kingdom-chronicle-desktop" && `app-${value.version}` === entry.name
          && existsSync(path.join(target, "electron-runtime.bin"));
      } catch { /* Unknown/incomplete package: report rather than delete. */ }
    }
    const resolved = realpathSync(target);
    if (!resolved.startsWith(resolvedRoot + path.sep) || lstatSync(target).isSymbolicLink()) owned = false;
    const item = { path: target, classification: owned ? "obsolete Squirrel application" : entry.name === "UserData" ? "legacy user data: retained" : "unknown/current: retained", removed: false };
    if (clean && owned) {
      const launcher = path.join(target, "KingdomChronicle.exe");
      if (existsSync(launcher) && !lstatSync(launcher).isSymbolicLink()) launcherHashes.add(createHash("sha256").update(readFileSync(launcher)).digest("hex"));
      rmSync(target, { recursive: true, force: false }); item.removed = true;
    }
    inventory.push(item);
  }
  const rootLauncher = path.join(root, "KingdomChronicle.exe");
  if (clean && existsSync(rootLauncher) && !lstatSync(rootLauncher).isSymbolicLink()) {
    const fingerprint = createHash("sha256").update(readFileSync(rootLauncher)).digest("hex");
    if (launcherHashes.has(fingerprint)) {
      rmSync(rootLauncher);
      inventory.push({ path: rootLauncher, classification: "obsolete Squirrel launcher: matches verified old application", removed: true, fingerprint });
    }
  }
  const packages = path.join(root, "packages"), releases = path.join(packages, "RELEASES");
  if (clean && launcherHashes.size && existsSync(releases) && !lstatSync(packages).isSymbolicLink() && !lstatSync(releases).isSymbolicLink()) {
    let allKnown = true;
    for (const line of readFileSync(releases, "utf8").trim().split(/\r?\n/)) {
      const match = /^([a-fA-F0-9]{40}) (KingdomChronicle-\d+\.\d+\.\d+-full\.nupkg) (\d+)$/.exec(line);
      if (!match) { allKnown = false; continue; }
      const file = path.join(packages, match[2]);
      if (!existsSync(file)) continue;
      if (lstatSync(file).isSymbolicLink() || statSync(file).size !== Number(match[3])
        || createHash("sha1").update(readFileSync(file)).digest("hex") !== match[1].toLowerCase()) { allKnown = false; continue; }
      const fingerprint = createHash("sha256").update(readFileSync(file)).digest("hex");
      rmSync(file);
      inventory.push({ path: file, classification: "verified obsolete Squirrel package", removed: true, fingerprint });
    }
    if (allKnown) { rmSync(releases); inventory.push({ path: releases, classification: "obsolete Squirrel package index", removed: true }); }
  }
  // The old custom updater's exact installer pattern is positively identified,
  // but leave the current framework's updater cache to electron-updater.
  const oldUpdates = path.join(userData, "updates");
  if (clean && existsSync(oldUpdates)) for (const entry of readdirSync(oldUpdates, { withFileTypes: true })) {
    if (!entry.isFile() || !/^Kingdom Chronicle-\d+\.\d+\.\d+ Setup\.exe$/.test(entry.name)) continue;
    const target = path.join(oldUpdates, entry.name);
    const fingerprint = createHash("sha256").update(readFileSync(target)).digest("hex");
    rmSync(target);
    inventory.push({ path: target, classification: "obsolete custom-updater installer", removed: true, fingerprint });
  }
  writeFileSync(path.join(userData, "legacy-installation-report.json"), JSON.stringify(inventory, null, 2));
  log(`Legacy artifacts: ${JSON.stringify(inventory)}`);
  return inventory;
}
