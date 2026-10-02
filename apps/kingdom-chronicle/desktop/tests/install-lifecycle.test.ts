import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const desktopRoot = path.resolve(import.meta.dirname, "..");

test("native launcher owns durable lifecycle repair outside Electron sandboxing", async () => {
  const [mainSource, launcherSource, assetBuildSource] = await Promise.all([
    readFile(path.join(desktopRoot, "src/main.ts"), "utf8"),
    readFile(path.join(desktopRoot, "launcher/KingdomChronicle.cs"), "utf8"),
    readFile(path.join(desktopRoot, "scripts/Build-WindowsAssets.ps1"), "utf8"),
  ]);

  assert.doesNotMatch(mainSource, /repairWindowsDurableLauncher|repairWindowsInstallRegistration/);
  assert.doesNotMatch(mainSource, /3_000, 12_000, 27_000, 42_000, 57_000, 72_000/);
  assert.match(launcherSource, /RepairDurableLauncher/);
  assert.match(launcherSource, /File\.Replace\(pendingPath, targetPath, null, true\)/);
  assert.match(launcherSource, /Path\.Combine\(userProfile\.FullName, "OneDrive", "Desktop"\)/);
  assert.match(launcherSource, /Directory\.GetFiles\(installRoot, "KingdomChronicle\.exe\.\*\.new"\)/);
  assert.match(launcherSource, /ResolveApplicationDirectory/);
  assert.match(launcherSource, /OrderByDescending\(candidate => candidate\.Version\)/);
  assert.doesNotMatch(launcherSource, /Assembly(?:File)?Version\("/);
  assert.match(assetBuildSource, /ConvertFrom-Json\)\.version/);
  assert.match(assetBuildSource, /AssemblyVersion\("\$version\.0"\)/);
});

test("legacy migration host is retained but modern main uses the established updater", async () => {
  const [mainSource, updateLauncherSource, launcherSource] = await Promise.all([
    readFile(path.join(desktopRoot, "src/main.ts"), "utf8"),
    readFile(path.join(desktopRoot, "src/update-launcher.ts"), "utf8"),
    readFile(path.join(desktopRoot, "launcher/KingdomChronicle.cs"), "utf8"),
  ]);

  assert.match(updateLauncherSource, /KingdomChronicleUpdateHost-\$\{update\.latestVersion\}\.exe/);
  assert.match(updateLauncherSource, /"--complete-update"/);
  assert.match(mainSource, /createDesktopUpdater/);
  assert.doesNotMatch(mainSource, /launchVerifiedUpdate/);
  assert.doesNotMatch(`${mainSource}\n${updateLauncherSource}`, /spawn\(installer, \["--silent"\]/);
  assert.match(launcherSource, /private static int CompleteUpdate/);
  assert.match(launcherSource, /parent\.WaitForExit\(30000\)/);
  assert.match(launcherSource, /installer\.WaitForExit\(600000\)/);
  assert.match(launcherSource, /ResolveApplicationDirectory\(Path\.GetFullPath\(installRoot\)\)/);
  assert.match(launcherSource, /FileName = launcherPath/);
});
