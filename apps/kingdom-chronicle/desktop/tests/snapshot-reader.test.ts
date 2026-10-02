import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import fixture from "@/data/colony-snapshot.json";
import { readLiveRuntime } from "../src/snapshot-reader";
import { MAX_SNAPSHOT_BYTES } from "@/lib/runtime-contract";

async function runtimeFixture(overrides: Record<string, unknown> = {}) {
  const instance = await mkdtemp(path.join(os.tmpdir(), "kingdom-runtime-"));
  const output = path.join(instance, "colonybridge");
  const latest = path.join(output, "latest");
  const file = path.join(latest, "colony-test-1.json");
  await mkdir(latest, { recursive: true });
  await writeFile(file, JSON.stringify(fixture));
  await writeFile(path.join(output, "bridge-info.json"), JSON.stringify({
    bridgeVersion: "0.15.0", protocolId: "com.colonybridge.snapshot", schemaVersion: 2,
    outputLayoutVersion: 1, transport: "filesystem", readOnly: true, status: "ready",
    outputRoot: output, latestFiles: [file], coloniesDetected: 1, lastSuccessfulExportAt: fixture.generatedAt,
    ...overrides,
  }));
  return { instance, output, file };
}

test("reader returns a validated offline runtime state", async () => {
  const { instance } = await runtimeFixture();
  const state = await readLiveRuntime(instance);
  assert.equal(state.status, "ready");
  assert.equal(state.snapshot?.schemaVersion, 2);
  assert.equal(state.snapshot?.colony.name, fixture.colony.name);
});

test("reader rejects paths outside the Bridge latest directory", async () => {
  const { instance, output } = await runtimeFixture({ latestFiles: [path.join(os.tmpdir(), "escaped.json")] });
  await writeFile(path.join(os.tmpdir(), "escaped.json"), JSON.stringify(fixture));
  await assert.rejects(() => readLiveRuntime(instance), /escaped the Bridge output folder/);
  assert.ok(output);
});

test("reader rejects a write-capable contract", async () => {
  const { instance } = await runtimeFixture({ readOnly: false });
  await assert.rejects(() => readLiveRuntime(instance), /read-only boundary/);
});

test("reader rejects an oversized latest report", async () => {
  const { instance, file } = await runtimeFixture();
  await writeFile(file, Buffer.alloc(MAX_SNAPSHOT_BYTES + 1, 0x20));
  await assert.rejects(() => readLiveRuntime(instance), /safety limit/);
});

test("reader rejects malformed nested report data", async () => {
  const { instance, file } = await runtimeFixture();
  await writeFile(file, JSON.stringify({ ...fixture, citizens: [{ id: 1 }] }));
  await assert.rejects(() => readLiveRuntime(instance), /supported Bridge contract/);
});

test("reader keeps a valid colony when another latest report is malformed", async () => {
  const { instance, output, file } = await runtimeFixture();
  const malformed = path.join(output, "latest", "colony-malformed.json");
  await writeFile(malformed, "{not json");
  const infoFile = path.join(output, "bridge-info.json");
  const info = JSON.parse(await readFile(infoFile, "utf8"));
  await writeFile(infoFile, JSON.stringify({ ...info, latestFiles: [malformed, file], coloniesDetected: 2 }));
  const state = await readLiveRuntime(instance);
  assert.equal(state.snapshot?.colony.name, fixture.colony.name);
});

test("reader rejects a symlinked latest report", async (context) => {
  const { instance, output, file } = await runtimeFixture();
  const target = path.join(output, "target.json");
  await writeFile(target, JSON.stringify(fixture));
  try {
    await import("node:fs/promises").then(({ rm }) => rm(file));
    await symlink(target, file, "file");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "EPERM") {
      context.skip("Creating symlinks is not allowed in this Windows session.");
      return;
    }
    throw error;
  }
  await assert.rejects(() => readLiveRuntime(instance), /regular file/);
});
