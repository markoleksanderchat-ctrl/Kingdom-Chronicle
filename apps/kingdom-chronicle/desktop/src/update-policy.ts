import path from "node:path";
import type { DesktopAvailableUpdate } from "./types";

export const DESKTOP_UPDATE_MANIFEST_URL = "https://kingdom-chronicle-prototype.markoleksanderchat.chatgpt.site/api/desktop-update";
export const DESKTOP_UPDATE_SOURCE = "Kingdom Chronicle stable channel";
export const UPDATE_PROTOCOL_ID = "com.kingdomchronicle.desktop-update";
export const UPDATE_SCHEMA_VERSION = 2;
export const MAX_UPDATE_RESPONSE_BYTES = 64_000;
export const MAX_INSTALLER_BYTES = 300_000_000;
export const VERSION_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

export function parseVersion(value: string) {
  const match = VERSION_PATTERN.exec(value);
  if (!match) return null;
  const parts = match.slice(1).map(Number);
  return parts.every(Number.isSafeInteger) ? parts : null;
}

export function compareVersions(left: string, right: string) {
  const leftParts = parseVersion(left);
  const rightParts = parseVersion(right);
  if (!leftParts || !rightParts) throw new Error("The update channel returned an invalid version number.");
  for (let index = 0; index < 3; index += 1) {
    if (leftParts[index] !== rightParts[index]) return leftParts[index] - rightParts[index];
  }
  return 0;
}

export function isPinnedUpdateUrl(value: unknown, pathname: string) {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    const expected = new URL(DESKTOP_UPDATE_MANIFEST_URL);
    return url.protocol === "https:" && url.origin === expected.origin && url.pathname === pathname
      && !url.search && !url.hash;
  } catch { return false; }
}

export function assertPinnedDownload(update: DesktopAvailableUpdate) {
  if (!isPinnedUpdateUrl(update.downloadUrl, "/api/desktop-release")) {
    throw new Error("The update download address was not trusted.");
  }
  if (!Number.isSafeInteger(update.sizeBytes) || update.sizeBytes <= 0 || update.sizeBytes > MAX_INSTALLER_BYTES) {
    throw new Error("The update reported an invalid file size.");
  }
  if (!/^[a-f0-9]{64}$/.test(update.sha256)) throw new Error("The update reported an invalid security digest.");
}

export function assertPathInside(parent: string, candidate: string) {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate));
  if (!relative || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error("The verified update path escaped its private update directory.");
  }
}
