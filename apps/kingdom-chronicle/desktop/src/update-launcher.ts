import type { ChildProcess } from "node:child_process";
import path from "node:path";
import type { DesktopAvailableUpdate } from "./types";
import { assertPathInside, parseVersion } from "./update-policy";

export interface UpdateLauncherDependencies {
  exists: (file: string) => boolean;
  copy: (source: string, destination: string) => Promise<void>;
  spawnDetached: (command: string, args: string[]) => Pick<ChildProcess, "unref">;
  scheduleQuit: () => void;
}

export async function launchVerifiedUpdate(update: DesktopAvailableUpdate, installer: string, updateDirectory: string,
                                           executableDirectory: string, installRoot: string, parentPid: number,
                                           isSquirrelInstall: boolean, dependencies: UpdateLauncherDependencies) {
  if (!parseVersion(update.latestVersion)) throw new Error("Invalid update version.");
  assertPathInside(updateDirectory, installer);
  const packagedLauncher = path.join(executableDirectory, "KingdomChronicle.exe");
  if (!isSquirrelInstall || !dependencies.exists(packagedLauncher)) {
    throw new Error("The installed update host is unavailable. Reinstall Kingdom Chronicle and try again.");
  }
  const updateHost = path.join(updateDirectory, `KingdomChronicleUpdateHost-${update.latestVersion}.exe`);
  assertPathInside(updateDirectory, updateHost);
  await dependencies.copy(packagedLauncher, updateHost);
  const child = dependencies.spawnDetached(updateHost, ["--complete-update", String(parentPid), installer, installRoot]);
  child.unref();
  dependencies.scheduleQuit();
}
