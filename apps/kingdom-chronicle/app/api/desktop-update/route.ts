import {
  DESKTOP_RELEASE,
  DESKTOP_UPDATE_PROTOCOL_ID,
  DESKTOP_UPDATE_SCHEMA_VERSION,
  releaseDownloadUrl,
  releaseNotesUrl,
} from "@/lib/desktop-release";
import { readPublishedRelease } from "@/lib/desktop-update-host";

export async function GET(request: Request) {
  const { RELEASES } = (await import("cloudflare:workers")).env;
  const published = await readPublishedRelease(RELEASES);
  if (published?.legacy) {
    const { version, artifact } = published.legacy;
    return Response.json({ protocolId: DESKTOP_UPDATE_PROTOCOL_ID, schemaVersion: DESKTOP_UPDATE_SCHEMA_VERSION, channel: "stable",
      latest: { version, releasedAt: published.releasedAt, summary: "Updates Kingdom Chronicle to the new Windows update system.",
        downloadUrl: releaseDownloadUrl(request), releaseNotesUrl: releaseNotesUrl(request), sizeBytes: artifact.sizeBytes, sha256: artifact.sha256 } },
    { headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" } });
  }
  const release = await RELEASES.head(DESKTOP_RELEASE.objectKey);
  if (!release || release.size !== DESKTOP_RELEASE.sizeBytes) {
    return Response.json({ error: "The stable desktop release is being prepared." }, {
      status: 503,
      headers: { "cache-control": "no-store", "retry-after": "60" },
    });
  }
  return Response.json({
    protocolId: DESKTOP_UPDATE_PROTOCOL_ID,
    schemaVersion: DESKTOP_UPDATE_SCHEMA_VERSION,
    channel: "stable",
    latest: {
      version: DESKTOP_RELEASE.version,
      releasedAt: DESKTOP_RELEASE.releasedAt,
      summary: DESKTOP_RELEASE.summary,
      downloadUrl: releaseDownloadUrl(request),
      releaseNotesUrl: releaseNotesUrl(request),
      sizeBytes: DESKTOP_RELEASE.sizeBytes,
      sha256: DESKTOP_RELEASE.sha256,
    },
  }, {
    headers: {
      "cache-control": "public, max-age=60, must-revalidate",
      "x-content-type-options": "nosniff",
    },
  });
}
