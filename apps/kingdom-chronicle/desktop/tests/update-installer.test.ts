import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { downloadVerifiedInstaller, verifyInstaller } from "../src/update-installer";
import type { DesktopAvailableUpdate } from "../src/types";

const payload = new TextEncoder().encode("verified Kingdom Chronicle installer fixture");
const digest = createHash("sha256").update(payload).digest("hex");
const update: DesktopAvailableUpdate = {
  status: "available",
  currentVersion: "0.1.3",
  latestVersion: "0.1.4",
  checkedAt: "2026-07-18T09:00:00.000Z",
  source: "Kingdom Chronicle stable channel",
  summary: "Updater test release.",
  downloadUrl: "https://kingdom-chronicle-prototype.markoleksanderchat.chatgpt.site/api/desktop-release",
  releaseNotesUrl: "https://kingdom-chronicle-prototype.markoleksanderchat.chatgpt.site/api/desktop-release-notes",
  sizeBytes: payload.byteLength,
  sha256: digest,
};

test("verified installer downloads to the private update directory", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "kingdom-update-"));
  try {
    const progress: string[] = [];
    const destination = await downloadVerifiedInstaller(update, directory, async () => new Response(payload, {
      headers: { "content-length": String(payload.byteLength) },
    }), (state) => progress.push(state.stage));
    assert.deepEqual(new Uint8Array(await readFile(destination)), payload);
    assert.equal(await verifyInstaller(destination, payload.byteLength, digest), true);
    assert.equal(progress.at(-1), "ready");
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("tampered installer is removed", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "kingdom-update-"));
  try {
    await assert.rejects(() => downloadVerifiedInstaller({ ...update, sha256: "b".repeat(64) }, directory, async () => new Response(payload, {
      headers: { "content-length": String(payload.byteLength) },
    })), /SHA-256/);
    assert.deepEqual(await readdir(directory), []);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("installer verification rejects altered bytes and size", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "kingdom-update-"));
  try {
    const installer = path.join(directory, "candidate.exe");
    await writeFile(installer, payload);
    assert.equal(await verifyInstaller(installer, payload.byteLength, digest), true);
    await writeFile(installer, new TextEncoder().encode("altered Kingdom Chronicle installer fixture"));
    assert.equal(await verifyInstaller(installer, payload.byteLength, digest), false);
    assert.equal(await verifyInstaller(installer, payload.byteLength + 1, digest), false);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("installer download rejects redirects and size mismatches", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "kingdom-update-"));
  try {
    await assert.rejects(() => downloadVerifiedInstaller(update, directory, async () => new Response(payload, {
      headers: { "content-length": String(payload.byteLength + 1) },
    })), /size did not match/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("installer download rejects oversized streamed bodies", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "kingdom-update-"));
  try {
    const oversized = new Uint8Array(payload.byteLength + 1);
    oversized.set(payload);
    await assert.rejects(() => downloadVerifiedInstaller(update, directory, async () => new Response(oversized, {
      headers: { "content-length": String(payload.byteLength) },
    })), /exceeded its declared size/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("installer download cancellation removes its partial file", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "kingdom-update-"));
  try {
    await assert.rejects(() => downloadVerifiedInstaller(update, directory, async (_url, init) => new Response(new ReadableStream({
      start(controller) {
        init.signal?.addEventListener("abort", () => controller.error(new DOMException("Aborted", "AbortError")));
      },
    }), { headers: { "content-length": String(payload.byteLength) } }), () => undefined, 5), /Aborted/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
