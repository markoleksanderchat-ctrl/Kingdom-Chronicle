import { DESKTOP_RELEASE } from "@/lib/desktop-release";
import { readPublishedRelease } from "@/lib/desktop-update-host";

async function releaseObject() {
  const { RELEASES } = (await import("cloudflare:workers")).env;
  const published = await readPublishedRelease(RELEASES);
  const legacy = published?.legacy;
  return { object: await RELEASES.get(legacy ? `desktop/stable/${legacy.version}/${legacy.artifact.fileName}` : DESKTOP_RELEASE.objectKey),
    release: legacy ? { ...legacy.artifact, version: legacy.version } : DESKTOP_RELEASE };
}

function headers(object: R2ObjectBody, release: { fileName: string; version: string; sha256: string }) {
  return {
    "content-type": "application/vnd.microsoft.portable-executable",
    "content-disposition": `attachment; filename="${release.fileName}"`,
    "content-length": String(object.size),
    "cache-control": "public, max-age=3600, immutable",
    "x-content-type-options": "nosniff",
    "x-kingdom-version": release.version,
    "x-kingdom-sha256": release.sha256,
    etag: object.httpEtag,
  };
}

export async function GET() {
  const { object, release } = await releaseObject();
  if (!object || object.size !== release.sizeBytes) {
    return Response.json({ error: "Release unavailable" }, { status: 404, headers: { "cache-control": "no-store" } });
  }
  return new Response(object.body, { headers: headers(object, release) });
}

export async function HEAD() {
  const { object, release } = await releaseObject();
  if (!object || object.size !== release.sizeBytes) return new Response(null, { status: 404 });
  return new Response(null, { headers: headers(object, release) });
}

