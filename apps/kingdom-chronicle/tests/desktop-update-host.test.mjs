import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { publishUpdateRequest, serveUpdateAsset, UPDATE_APP_ID, validPublishedRelease } from '../lib/desktop-update-host.ts';
const token = 'isolated-test-token-12345678901234567890';
class Bucket {
  objects = new Map();
  uploads = new Map();
  async delete(key) { this.objects.delete(key); }
  async createMultipartUpload(key, options) {
    const uploadId = `upload-${this.uploads.size + 1}`;
    this.uploads.set(uploadId, { key, options, parts: new Map() });
    return this.resumeMultipartUpload(key, uploadId);
  }
  resumeMultipartUpload(key, uploadId) {
    const upload = this.uploads.get(uploadId);
    return { uploadId,
      abort: async () => this.uploads.delete(uploadId),
      uploadPart: async (number, body) => {
        assert.equal(upload.key, key); const bytes = Buffer.from(await new Response(body).arrayBuffer());
        upload.parts.set(number, bytes); return { partNumber: number, etag: String(number) };
      },
      complete: async parts => {
        assert.equal(upload.key, key);
        return this.put(key, Buffer.concat(parts.map(part => upload.parts.get(part.partNumber))), upload.options);
      },
    };
  }
  async head(key) { return this.objects.get(key) ?? null; }
  async get(key, options) {
    const item = this.objects.get(key); if (!item) return null;
    const data = options?.range ? item.data.subarray(options.range.offset, options.range.offset + options.range.length) : item.data;
    return { ...item, body: new ReadableStream({ start(controller) { controller.enqueue(data); controller.close(); } }), json: async () => JSON.parse(item.data.toString()), text: async () => item.data.toString() };
  }
  async put(key, data, options) {
    const old = this.objects.get(key);
    if (options?.onlyIf?.etagDoesNotMatch === '*' && old || options?.onlyIf?.etagMatches && old?.etag !== options.onlyIf.etagMatches) return null;
    const bytes = Buffer.from(data), etag = createHash('sha256').update(bytes).digest('hex');
    const item = { size: bytes.length, etag, httpEtag: `"${etag}"`, data: bytes, customMetadata: options?.customMetadata ?? {} };
    this.objects.set(key, item); return item;
  }
}
async function staged(bucket, version) {
  const artifacts = [];
  for (const suffix of ['Setup.exe', 'Setup.exe.blockmap']) {
    const data = Buffer.from('valid artifact bytes'), fileName = `KingdomChronicle-${version}-${suffix}`;
    const item = { fileName, sizeBytes: data.length, sha512: createHash('sha512').update(data).digest('base64'), sha256: createHash('sha256').update(data).digest('hex') };
    await bucket.put(`desktop/stable/${version}/${fileName}`, data, { customMetadata: item }); artifacts.push(item);
  }
  return { appId: UPDATE_APP_ID, version, releasedAt: '2026-10-01T00:00:00.000Z', summary: 'Test release', artifacts };
}
const commit = release => new Request('https://example.test/api/desktop-updates-publish?action=commit', { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: JSON.stringify(release) });
test('latest metadata changes only after every artifact exists; duplicates are rejected', async () => {
  const bucket = new Bucket(), first = await staged(bucket, '0.3.3');
  assert.equal((await publishUpdateRequest(commit(first), bucket, token)).status, 200);
  const next = await staged(bucket, '0.3.4'), key = `desktop/stable/0.3.4/${next.artifacts[1].fileName}`, blockmap = bucket.objects.get(key);
  bucket.objects.delete(key);
  assert.equal((await publishUpdateRequest(commit(next), bucket, token)).status, 409);
  assert.match(await (await serveUpdateAsset(new Request('https://example.test'), ['stable', 'latest.yml'], bucket)).text(), /version: 0.3.3/);
  bucket.objects.set(key, blockmap); assert.equal((await publishUpdateRequest(commit(next), bucket, token)).status, 200);
  assert.equal((await publishUpdateRequest(commit(next), bucket, token)).status, 200); // Unknown commit outcome can resume.
  const changed = { ...next, artifacts: next.artifacts.map(item => ({ ...item, sha256: '0'.repeat(64) })) };
  assert.equal((await publishUpdateRequest(commit(changed), bucket, token)).status, 409);
});
test('concurrent and interrupted multipart requests cannot overwrite immutable artifacts', async () => {
  const bucket = new Bucket(), data = Buffer.from('verified multipart installer'), version = '0.3.4';
  const item = { fileName: `KingdomChronicle-${version}-Setup.exe`, sizeBytes: data.length,
    sha512: createHash('sha512').update(data).digest('base64'), sha256: createHash('sha256').update(data).digest('hex') };
  const endpoint = `https://example.test?version=${version}&file=${item.fileName}`;
  const request = (action, body, method = 'POST', id = '') => new Request(`${endpoint}&action=${action}${id ? `&uploadId=${id}` : ''}`, {
    method, headers: { authorization: `Bearer ${token}`, 'content-length': String(body?.length ?? 0) }, body,
  });
  const [first, second] = await Promise.all([publishUpdateRequest(request('start', JSON.stringify(item)), bucket, token), publishUpdateRequest(request('start', JSON.stringify(item)), bucket, token)]);
  const a = await first.json(), b = await second.json(); assert.equal(a.uploadId, b.uploadId);
  assert.equal((await publishUpdateRequest(request('start', JSON.stringify({ ...item, sha256: '0'.repeat(64) })), bucket, token)).status, 409);
  assert.equal((await publishUpdateRequest(request('complete', JSON.stringify({ parts: [] }), 'POST', 'unowned'), bucket, token)).status, 409);
  const partRequest = new Request(`${endpoint}&uploadId=${a.uploadId}&partNumber=1`, { method: 'PUT', headers: { authorization: `Bearer ${token}`, 'content-length': String(data.length) }, body: data });
  const part = await (await publishUpdateRequest(partRequest, bucket, token)).json();
  for (let i=0;i<2;i++) assert.equal((await publishUpdateRequest(request('complete', JSON.stringify({ parts: [part] }), 'POST', a.uploadId), bucket, token)).status, 200);
  assert.equal((await publishUpdateRequest(request('start', JSON.stringify(item)), bucket, token)).status, 200);
  assert.equal((await publishUpdateRequest(request('start', JSON.stringify({ ...item, sha256: '0'.repeat(64) })), bucket, token)).status, 409);
  assert.equal((await publishUpdateRequest(request('abort', undefined, 'DELETE', a.uploadId), bucket, token)).status, 409);
  assert.equal(bucket.objects.get(`desktop/stable/${version}/${item.fileName}`).data.toString(), data.toString());
});

test('malformed and oversized authenticated metadata is rejected safely', async () => {
  const bucket = new Bucket();
  for (const body of ['{broken', 'x'.repeat(32_001), 'null']) {
    const request = new Request('https://example.test?action=commit', { method: 'POST', headers: { authorization: `Bearer ${token}` }, body });
    assert.equal((await publishUpdateRequest(request, bucket, token)).status, 400);
  }
});
test('single HTTP ranges are served correctly and unknown paths cannot write artifacts', async () => {
  const bucket = new Bucket(), release = await staged(bucket, '0.3.3'), name = release.artifacts[0].fileName;
  const result = await serveUpdateAsset(new Request('https://example.test', { headers: { range: 'bytes=1-3' } }), ['stable', '0.3.3', name], bucket);
  assert.equal(result.status, 206); assert.equal(await result.text(), 'ali'); assert.equal(result.headers.get('content-length'), '3');
  assert.equal((await serveUpdateAsset(new Request('https://example.test'), ['stable', '../', name], bucket)).status, 404);
  assert.equal((await publishUpdateRequest(new Request('https://example.test?action=start&version=0.3.3&file=evil.exe', { method: 'POST', headers: { authorization: `Bearer ${token}` } }), bucket, token)).status, 400);
});
test('production publication rejects test identities, test filenames and missing authentication', async () => {
  const bucket = new Bucket(), release = await staged(bucket, '0.3.3');
  assert.equal(validPublishedRelease({ ...release, appId: 'com.kingdomchronicle.UpdateLab' }), false);
  assert.equal(validPublishedRelease({ ...release, artifacts: release.artifacts.map(item => ({ ...item, fileName: item.fileName.replace('KingdomChronicle', 'KingdomChronicleLab') })) }), false);
  assert.equal((await publishUpdateRequest(new Request('https://example.test', { method: 'POST' }), bucket, token)).status, 401);
});
