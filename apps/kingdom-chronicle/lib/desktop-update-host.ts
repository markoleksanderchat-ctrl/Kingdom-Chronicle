/** Generic electron-updater host. Publishing is authenticated; readers are public. */
import { timingSafeEqual } from "node:crypto";
export const UPDATE_APP_ID = "com.squirrel.KingdomChronicle.KingdomChronicle";
export interface ReleaseArtifact { fileName: string; sizeBytes: number; sha512: string; sha256: string }
export interface PublishedDesktopRelease {
  appId: typeof UPDATE_APP_ID; version: string; releasedAt: string; summary: string;
  artifacts: ReleaseArtifact[]; legacy?: { version: string; artifact: ReleaseArtifact };
}
const prefix = "desktop/stable/";
const pointerKey = `${prefix}latest.json`;
const versionPattern = /^\d+\.\d+\.\d+$/;
const fail = (message: string, status = 400) => Response.json({ error: message }, { status, headers: { "cache-control": "no-store" } });
async function smallJson(request: Request) {
  if (!request.body) return null;
  const reader = request.body.getReader(), decoder = new TextDecoder();
  let size = 0, text = "";
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.length;
      if (size > 32_000) { await reader.cancel(); return null; }
      text += decoder.decode(chunk.value, { stream: true });
    }
    return JSON.parse(text + decoder.decode());
  } catch { return null; }
}
function sameArtifact(left: ReleaseArtifact, right: ReleaseArtifact) {
  return left.fileName === right.fileName && left.sizeBytes === right.sizeBytes && left.sha512 === right.sha512 && left.sha256 === right.sha256;
}
export function compareVersions(left: string, right: string) {
  const a = left.split(".").map(Number), b = right.split(".").map(Number);
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] - b[i];
  return 0;
}
export function validArtifact(version: string, item: ReleaseArtifact) {
  return versionPattern.test(version) && !!item && Number.isSafeInteger(item.sizeBytes) && item.sizeBytes > 0 && item.sizeBytes < 300 * 1024 * 1024
    && /^[A-Za-z0-9+/]{86}==$/.test(item.sha512) && /^[a-f0-9]{64}$/.test(item.sha256)
    && [`KingdomChronicle-${version}-Setup.exe`, `KingdomChronicle-${version}-Setup.exe.blockmap`, `KingdomChronicle-${version}-Bridge-Setup.exe`].includes(item.fileName);
}
export function validPublishedRelease(value: PublishedDesktopRelease) {
  if (!value || value.appId !== UPDATE_APP_ID || !versionPattern.test(value.version)
    || typeof value.summary !== "string" || value.summary.length > 4000 || Number.isNaN(Date.parse(value.releasedAt))
    || !Array.isArray(value.artifacts) || value.artifacts.length !== 2 || !value.artifacts.every(item => validArtifact(value.version, item))) return false;
  if (new Set(value.artifacts.map(item => item.fileName)).size !== 2
    || !value.artifacts.some(item => item.fileName === `KingdomChronicle-${value.version}-Setup.exe`)
    || !value.artifacts.some(item => item.fileName.endsWith(".blockmap"))) return false;
  return !value.legacy || (versionPattern.test(value.legacy.version) && compareVersions(value.legacy.version, value.version) < 0
    && validArtifact(value.legacy.version, value.legacy.artifact)
    && value.legacy.artifact.fileName === `KingdomChronicle-${value.legacy.version}-Bridge-Setup.exe`);
}
export function releaseYaml(release: PublishedDesktopRelease) {
  const installer = release.artifacts.find(item => item.fileName.endsWith(".exe"))!;
  const url = `${release.version}/${installer.fileName}`;
  return `version: ${release.version}\nfiles:\n  - url: ${url}\n    sha512: ${installer.sha512}\n    size: ${installer.sizeBytes}\npath: ${url}\nsha512: ${installer.sha512}\nreleaseDate: ${JSON.stringify(release.releasedAt)}\nreleaseNotes: ${JSON.stringify(release.summary)}\n`;
}
export async function readPublishedRelease(bucket: R2Bucket) {
  const object = await bucket.get(pointerKey);
  if (!object) return null;
  if (object.size > 32_000) throw new Error("Invalid stored release metadata size");
  const release = await object.json<PublishedDesktopRelease>();
  if (!validPublishedRelease(release)) throw new Error("Invalid stored release metadata");
  return release;
}
export async function serveUpdateAsset(request: Request, segments: string[], bucket: R2Bucket) {
  if (segments[0] !== "stable") return fail("Unknown channel", 404);
  if (segments.length === 2 && segments[1] === "latest.yml") {
    const release = await readPublishedRelease(bucket);
    if (!release) return fail("No NSIS release published", 404);
    const headers = { "content-type": "text/yaml; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" };
    return new Response(request.method === "HEAD" ? null : releaseYaml(release), { headers });
  }
  if (segments.length !== 3 || !versionPattern.test(segments[1])) return fail("Invalid artifact path", 404);
  const [, version, fileName] = segments;
  if (![ `KingdomChronicle-${version}-Setup.exe`, `KingdomChronicle-${version}-Setup.exe.blockmap`, `KingdomChronicle-${version}-Bridge-Setup.exe` ].includes(fileName)) return fail("Invalid artifact name", 404);
  const key = `${prefix}${version}/${fileName}`;
  const info = await bucket.head(key);
  if (!info) return fail("Release artifact unavailable", 404);
  const headers: Record<string, string> = { "accept-ranges": "bytes", "content-type": fileName.endsWith(".exe") ? "application/vnd.microsoft.portable-executable" : "application/octet-stream",
    "cache-control": "public, max-age=31536000, immutable", "content-length": String(info.size), "x-content-type-options": "nosniff",
    "content-disposition": `attachment; filename="${fileName}"`, etag: info.httpEtag };
  if (request.method === "HEAD") return new Response(null, { headers });
  let range: { offset: number; length: number } | undefined;
  const rawRange = request.headers.get("range");
  if (rawRange) {
    const match = /^bytes=(\d+)-(\d*)$/.exec(rawRange);
    if (!match) return new Response(null, { status: 416, headers: { "content-range": `bytes */${info.size}` } });
    const start = Number(match[1]), end = match[2] ? Math.min(Number(match[2]), info.size - 1) : info.size - 1;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= info.size) return new Response(null, { status: 416, headers: { "content-range": `bytes */${info.size}` } });
    range = { offset: start, length: end - start + 1 };
    headers["content-range"] = `bytes ${start}-${end}/${info.size}`;
    headers["content-length"] = String(range.length);
  }
  const object = await bucket.get(key, range ? { range } : undefined);
  return object ? new Response(object.body, { status: range ? 206 : 200, headers }) : fail("Release artifact unavailable", 404);
}

export async function publishUpdateRequest(request: Request, bucket: R2Bucket, token: unknown) {
  if (typeof token !== "string" || token.length < 32) return fail("Unauthorized", 401);
  const expected = new TextEncoder().encode(`Bearer ${token}`), received = new TextEncoder().encode(request.headers.get("authorization") ?? "");
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) return fail("Unauthorized", 401);
  const url = new URL(request.url), action = url.searchParams.get("action");
  if (request.method === "POST" && action === "commit") {
    const release = await smallJson(request) as PublishedDesktopRelease;
    if (!validPublishedRelease(release)) return fail("Invalid production release metadata");
    const previousObject = await bucket.get(pointerKey);
    if (previousObject) {
      const previous = await previousObject.json<PublishedDesktopRelease>();
      // A network timeout after the atomic pointer write must be safely retryable.
      if (release.version === previous.version && release.artifacts.every(item => previous.artifacts.some(old => sameArtifact(item, old)))
        && (!release.legacy || previous.legacy?.version === release.legacy.version && sameArtifact(previous.legacy.artifact, release.legacy.artifact))) {
        return Response.json({ ok: true, version: release.version, alreadyPublished: true });
      }
      if (compareVersions(release.version, previous.version) <= 0) return fail("Version already published or older than stable", 409);
      // Keep legacy clients on a safe Squirrel bridge; never hand them NSIS.
      if (!release.legacy && previous.legacy) release.legacy = previous.legacy;
    }
    const artifacts = [...release.artifacts.map(artifact => ({ version: release.version, artifact })), ...(release.legacy ? [release.legacy] : [])];
    for (const { version, artifact } of artifacts) {
      const info = await bucket.head(`${prefix}${version}/${artifact.fileName}`);
      if (!info || info.size !== artifact.sizeBytes || info.customMetadata?.sha512 !== artifact.sha512 || info.customMetadata?.sha256 !== artifact.sha256) return fail(`Artifact not verified: ${artifact.fileName}`, 409);
    }
    await bucket.put(`${prefix}${release.version}/release.json`, JSON.stringify(release), { onlyIf: { etagDoesNotMatch: "*" } });
    const published = await bucket.put(pointerKey, JSON.stringify(release), {
      onlyIf: previousObject ? { etagMatches: previousObject.etag } : { etagDoesNotMatch: "*" },
      httpMetadata: { contentType: "application/json", cacheControl: "no-store" },
    });
    return published ? Response.json({ ok: true, version: release.version }) : fail("Stable changed concurrently; inspect and retry", 409);
  }
  const version = url.searchParams.get("version") ?? "", fileName = url.searchParams.get("file") ?? "";
  // Validate paths before any bucket write; never derive arbitrary keys from input.
  if (!versionPattern.test(version) || ![`KingdomChronicle-${version}-Setup.exe`, `KingdomChronicle-${version}-Setup.exe.blockmap`, `KingdomChronicle-${version}-Bridge-Setup.exe`].includes(fileName)) return fail("Invalid artifact path");
  const key = `${prefix}${version}/${fileName}`;
  const sessionKey = `${prefix}uploads/${version}/${fileName}.json`;
  type UploadSession = { item: ReleaseArtifact; uploadId: string };
  if (request.method === "POST" && action === "start") {
    const item = await smallJson(request) as ReleaseArtifact;
    if (!item || item.fileName !== fileName || !validArtifact(version, item)) return fail("Invalid artifact metadata");
    const existing = await bucket.head(key);
    if (existing) return existing.size === item.sizeBytes && existing.customMetadata?.sha512 === item.sha512 && existing.customMetadata?.sha256 === item.sha256
      ? Response.json({ exists: true }) : fail("Immutable artifact already exists with different content", 409);
    const priorSession = await bucket.get(sessionKey);
    if (priorSession) {
      const previous = await priorSession.json<UploadSession>();
      return sameArtifact(previous.item, item) ? Response.json({ uploadId: previous.uploadId }) : fail("A different artifact upload owns this version", 409);
    }
    const upload = await bucket.createMultipartUpload(key, {
      customMetadata: { sha512: item.sha512, sha256: item.sha256, expectedSize: String(item.sizeBytes) },
      httpMetadata: { contentType: fileName.endsWith(".exe") ? "application/vnd.microsoft.portable-executable" : "application/octet-stream" },
    });
    const reserved = await bucket.put(sessionKey, JSON.stringify({ item, uploadId: upload.uploadId }), { onlyIf: { etagDoesNotMatch: "*" } });
    if (!reserved) {
      await upload.abort();
      const winner = await bucket.get(sessionKey);
      const previous = winner ? await winner.json<UploadSession>() : null;
      return previous && sameArtifact(previous.item, item) ? Response.json({ uploadId: previous.uploadId }) : fail("Artifact upload changed concurrently; retry", 409);
    }
    return Response.json({ uploadId: upload.uploadId });
  }
  const uploadId = url.searchParams.get("uploadId");
  if (!uploadId) return fail("Missing upload ID");
  const sessionObject = await bucket.get(sessionKey);
  const session = sessionObject ? await sessionObject.json<UploadSession>() : null;
  if (!session || session.uploadId !== uploadId) return fail("Upload session does not own this artifact", 409);
  const upload = bucket.resumeMultipartUpload(key, uploadId);
  if (request.method === "PUT") {
    const number = Number(url.searchParams.get("partNumber")), size = Number(request.headers.get("content-length"));
    if (!Number.isInteger(number) || number < 1 || number > 64 || !request.body || !Number.isSafeInteger(size) || size <= 0 || size > 20 * 1024 * 1024) return fail("Invalid multipart part");
    return Response.json(await upload.uploadPart(number, request.body));
  }
  if (request.method === "POST" && action === "complete") {
    const existing = await bucket.head(key);
    if (existing) return existing.size === session.item.sizeBytes && existing.customMetadata?.sha512 === session.item.sha512 && existing.customMetadata?.sha256 === session.item.sha256
      ? Response.json({ ok: true, sizeBytes: existing.size }) : fail("Immutable artifact differs from upload", 409);
    const body = await smallJson(request) as { parts: R2UploadedPart[] };
    if (!body || !Array.isArray(body.parts) || !body.parts.length || body.parts.length > 64 || body.parts.some((part, i) => !part || part.partNumber !== i + 1 || typeof part.etag !== "string" || !part.etag)) return fail("Invalid part list");
    const object = await upload.complete(body.parts);
    if (object.size !== session.item.sizeBytes) { await bucket.delete(key); await bucket.delete(sessionKey); return fail("Artifact size mismatch", 409); }
    return Response.json({ ok: true, sizeBytes: object.size });
  }
  if (request.method === "DELETE") {
    if (await bucket.head(key)) return fail("Completed artifacts cannot be aborted", 409);
    await upload.abort(); await bucket.delete(sessionKey); return Response.json({ ok: true });
  }
  return fail("Unsupported operation");
}
