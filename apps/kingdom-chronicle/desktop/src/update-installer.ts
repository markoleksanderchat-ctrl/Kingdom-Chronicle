import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import type { DesktopAvailableUpdate } from "./types";
import { downloadInstallerFile, type FetchInstaller, type ReportProgress } from "./bounded-download";
import { verifyInstaller } from "./installer-verification";
import { assertPinnedDownload, VERSION_PATTERN } from "./update-policy";

export function installerPath(updateDirectory: string, version: string) {
  if (!VERSION_PATTERN.test(version)) throw new Error("Invalid update version.");
  return path.join(updateDirectory, `Kingdom Chronicle-${version} Setup.exe`);
}

export async function downloadVerifiedInstaller(update: DesktopAvailableUpdate, updateDirectory: string,
                                                fetchInstaller: FetchInstaller = fetch,
                                                reportProgress: ReportProgress = () => undefined,
                                                timeoutMilliseconds = 10 * 60_000) {
  assertPinnedDownload(update);
  await mkdir(updateDirectory, { recursive: true });
  const destination = installerPath(updateDirectory, update.latestVersion);
  try {
    if (await verifyInstaller(destination, update.sizeBytes, update.sha256)) {
      reportProgress({ stage: "ready", receivedBytes: update.sizeBytes, totalBytes: update.sizeBytes });
      return destination;
    }
  } catch { /* download a fresh copy */ }
  await rm(destination, { force: true });
  try {
    const received = await downloadInstallerFile(update, destination, fetchInstaller, reportProgress, timeoutMilliseconds);
    reportProgress({ stage: "verifying", receivedBytes: received, totalBytes: update.sizeBytes });
    if (!await verifyInstaller(destination, update.sizeBytes, update.sha256)) {
      throw new Error("The update failed its SHA-256 security check.");
    }
    reportProgress({ stage: "ready", receivedBytes: received, totalBytes: update.sizeBytes });
    return destination;
  } catch (error) {
    await rm(destination, { force: true });
    throw error;
  }
}

export { verifyInstaller } from "./installer-verification";
