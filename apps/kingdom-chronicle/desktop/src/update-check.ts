import type { DesktopUpdateResult } from "./types";
import {
  compareVersions, DESKTOP_UPDATE_MANIFEST_URL, DESKTOP_UPDATE_SOURCE, isPinnedUpdateUrl,
  MAX_UPDATE_RESPONSE_BYTES, parseVersion, UPDATE_PROTOCOL_ID, UPDATE_SCHEMA_VERSION, VERSION_PATTERN,
} from "./update-policy";

export { DESKTOP_UPDATE_MANIFEST_URL, DESKTOP_UPDATE_SOURCE } from "./update-policy";

type FetchUpdateManifest = (url: string, init: RequestInit) => Promise<Response>;

interface UpdateManifest {
  protocolId: typeof UPDATE_PROTOCOL_ID;
  schemaVersion: typeof UPDATE_SCHEMA_VERSION;
  channel: "stable";
  latest: {
    version: string;
    releasedAt: string;
    summary: string;
    downloadUrl: string;
    releaseNotesUrl: string;
    sizeBytes: number;
    sha256: string;
  };
}

function isUpdateManifest(value: unknown): value is UpdateManifest {
  if (!value || typeof value !== "object") return false;
  const manifest = value as Partial<UpdateManifest>;
  const latest = manifest.latest as Partial<UpdateManifest["latest"]> | undefined;
  return manifest.protocolId === UPDATE_PROTOCOL_ID
    && manifest.schemaVersion === UPDATE_SCHEMA_VERSION
    && manifest.channel === "stable"
    && !!latest
    && typeof latest.version === "string"
    && VERSION_PATTERN.test(latest.version)
    && typeof latest.releasedAt === "string"
    && Number.isFinite(Date.parse(latest.releasedAt))
    && typeof latest.summary === "string"
    && latest.summary.trim().length > 0
    && latest.summary.length <= 500
    && isPinnedUpdateUrl(latest.downloadUrl, "/api/desktop-release")
    && isPinnedUpdateUrl(latest.releaseNotesUrl, "/api/desktop-release-notes")
    && typeof latest.sizeBytes === "number"
    && Number.isSafeInteger(latest.sizeBytes)
    && latest.sizeBytes > 0
    && latest.sizeBytes <= 300_000_000
    && typeof latest.sha256 === "string"
    && /^[a-f0-9]{64}$/.test(latest.sha256);
}

async function readBoundedText(response: Response) {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_UPDATE_RESPONSE_BYTES) throw new Error("The update response was too large.");
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_UPDATE_RESPONSE_BYTES) {
      await reader.cancel();
      throw new Error("The update response was too large.");
    }
    chunks.push(value);
  }
  const combined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { combined.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder().decode(combined);
}

export async function checkForDesktopUpdate(
  currentVersion: string,
  fetchManifest: FetchUpdateManifest = fetch,
  now = new Date(),
  timeoutMilliseconds = 10_000,
): Promise<DesktopUpdateResult> {
  const checkedAt = now.toISOString();
  try {
    if (!parseVersion(currentVersion)) throw new Error("The installed app version could not be read.");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMilliseconds);
    let response: Response;
    let responseText: string;
    try {
      response = await fetchManifest(DESKTOP_UPDATE_MANIFEST_URL, {
        method: "GET",
        cache: "no-store",
        redirect: "error",
        signal: controller.signal,
        headers: { accept: "application/json" },
      });
      if (!response.ok) throw new Error(`The update service returned status ${response.status}.`);
      responseText = await readBoundedText(response);
    } finally {
      clearTimeout(timeout);
    }
    const manifest = JSON.parse(responseText) as unknown;
    if (!isUpdateManifest(manifest)) throw new Error("The update service returned an invalid response.");
    const available = compareVersions(manifest.latest.version, currentVersion) > 0;
    return {
      status: available ? "available" : "up-to-date",
      currentVersion,
      latestVersion: manifest.latest.version,
      checkedAt,
      source: DESKTOP_UPDATE_SOURCE,
      summary: manifest.latest.summary,
      downloadUrl: manifest.latest.downloadUrl,
      releaseNotesUrl: manifest.latest.releaseNotesUrl,
      sizeBytes: manifest.latest.sizeBytes,
      sha256: manifest.latest.sha256,
    };
  } catch (error) {
    return {
      status: "error",
      currentVersion,
      checkedAt,
      source: DESKTOP_UPDATE_SOURCE,
      message: error instanceof Error && error.name === "AbortError"
        ? "The update check timed out. Try again when the internet connection is available."
        : error instanceof Error ? error.message : "The update check failed.",
    };
  }
}
