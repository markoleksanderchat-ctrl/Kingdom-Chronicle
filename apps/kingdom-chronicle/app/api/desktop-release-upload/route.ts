import { DESKTOP_RELEASE } from "@/lib/desktop-release";

const MAX_PART_BYTES = 24 * 1024 * 1024;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;

async function authorized(request: Request) {
  const { RELEASE_UPLOAD_TOKEN } = (await import("cloudflare:workers")).env;
  return typeof RELEASE_UPLOAD_TOKEN === "string"
    && RELEASE_UPLOAD_TOKEN.length >= 32
    && request.headers.get("authorization") === `Bearer ${RELEASE_UPLOAD_TOKEN}`;
}

async function bucket() {
  return (await import("cloudflare:workers")).env.RELEASES as R2Bucket;
}

function jsonError(message: string, status: number) {
  return Response.json({ error: message }, { status, headers: { "cache-control": "no-store" } });
}

export async function POST(request: Request) {
  if (!await authorized(request)) return jsonError("Unauthorized", 401);
  const url = new URL(request.url);
  const action = url.searchParams.get("action");
  if (action === "start") {
    const body = await request.json() as { version?: unknown; sizeBytes?: unknown; sha256?: unknown };
    if (body.version !== DESKTOP_RELEASE.version
      || body.sizeBytes !== DESKTOP_RELEASE.sizeBytes
      || body.sha256 !== DESKTOP_RELEASE.sha256
      || !SHA256_PATTERN.test(DESKTOP_RELEASE.sha256)) return jsonError("Release metadata does not match the pinned release", 409);
    const upload = await (await bucket()).createMultipartUpload(DESKTOP_RELEASE.objectKey, {
      httpMetadata: {
        contentType: "application/vnd.microsoft.portable-executable",
        contentDisposition: `attachment; filename="${DESKTOP_RELEASE.fileName}"`,
        cacheControl: "public, max-age=3600, immutable",
      },
      customMetadata: { version: DESKTOP_RELEASE.version, sha256: DESKTOP_RELEASE.sha256 },
    });
    return Response.json({ uploadId: upload.uploadId, objectKey: DESKTOP_RELEASE.objectKey });
  }
  if (action === "complete") {
    const uploadId = url.searchParams.get("uploadId");
    const body = await request.json() as { parts?: Array<{ partNumber?: unknown; etag?: unknown }> };
    if (!uploadId || !Array.isArray(body.parts) || body.parts.length === 0) return jsonError("Invalid multipart completion request", 400);
    const parts = body.parts.map((part) => ({ partNumber: Number(part.partNumber), etag: String(part.etag ?? "") }));
    if (parts.some((part) => !Number.isInteger(part.partNumber) || part.partNumber < 1 || !part.etag)) return jsonError("Invalid uploaded part list", 400);
    const upload = (await bucket()).resumeMultipartUpload(DESKTOP_RELEASE.objectKey, uploadId);
    const object = await upload.complete(parts);
    if (object.size !== DESKTOP_RELEASE.sizeBytes) {
      await (await bucket()).delete(DESKTOP_RELEASE.objectKey);
      return jsonError("Uploaded release size did not match the pinned release", 409);
    }
    return Response.json({ ok: true, version: DESKTOP_RELEASE.version, sizeBytes: object.size });
  }
  return jsonError("Unsupported upload action", 400);
}

export async function PUT(request: Request) {
  if (!await authorized(request)) return jsonError("Unauthorized", 401);
  const url = new URL(request.url);
  const uploadId = url.searchParams.get("uploadId");
  const partNumber = Number(url.searchParams.get("partNumber"));
  const length = Number(request.headers.get("content-length"));
  if (!uploadId || !Number.isInteger(partNumber) || partNumber < 1 || !request.body) return jsonError("Invalid multipart part", 400);
  if (!Number.isFinite(length) || length <= 0 || length > MAX_PART_BYTES) return jsonError("Invalid multipart part size", 413);
  const upload = (await bucket()).resumeMultipartUpload(DESKTOP_RELEASE.objectKey, uploadId);
  const part = await upload.uploadPart(partNumber, request.body);
  return Response.json({ partNumber: part.partNumber, etag: part.etag });
}

export async function DELETE(request: Request) {
  if (!await authorized(request)) return jsonError("Unauthorized", 401);
  const uploadId = new URL(request.url).searchParams.get("uploadId");
  if (!uploadId) return jsonError("Missing multipart upload identifier", 400);
  await (await bucket()).resumeMultipartUpload(DESKTOP_RELEASE.objectKey, uploadId).abort();
  return Response.json({ ok: true });
}
