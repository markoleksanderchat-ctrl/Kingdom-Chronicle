import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import fixture from "@/data/colony-snapshot.json";
import { MAX_SNAPSHOT_BYTES } from "@/lib/runtime-contract";
import { readBoundedJson, readLiveRuntime } from "../src/snapshot-reader";

async function makeRuntime(contents: string) {
  const instance = await mkdtemp(path.join(os.tmpdir(), "kingdom-contract-negative-"));
  const output = path.join(instance, "colonybridge");
  const latest = path.join(output, "latest");
  const file = path.join(latest, "colony-negative.json");
  await mkdir(latest, { recursive: true });
  await writeFile(file, contents);
  await writeFile(path.join(output, "bridge-info.json"), JSON.stringify({
    bridgeVersion: "0.28.1", protocolId: "com.colonybridge.snapshot", schemaVersion: 2,
    outputLayoutVersion: 1, transport: "filesystem", readOnly: true, status: "ready",
    outputRoot: output, latestFiles: [file], coloniesDetected: 1, lastSuccessfulExportAt: fixture.generatedAt,
  }));
  return { instance, file };
}

test("negative contract: incomplete latest write fails after bounded retries", async () => {
  const { instance } = await makeRuntime('{ "schemaVersion": 2,');
  await assert.rejects(() => readLiveRuntime(instance), /No complete colony report/);
});

test("negative contract: wrong snapshot schema fails at the runtime contract", async () => {
  const { instance } = await makeRuntime(JSON.stringify({ ...fixture, schemaVersion: 3 }));
  await assert.rejects(() => readLiveRuntime(instance), /supported Bridge contract/);
});

test("negative contract: a file changed during read fails for the intended reason", async () => {
  const { file } = await makeRuntime(JSON.stringify(fixture));
  let revision = 0;
  await assert.rejects(
    () => readBoundedJson(file, MAX_SNAPSHOT_BYTES, async () => {
      revision += 1;
      await writeFile(file, JSON.stringify({ ...fixture, trigger: `changed-${revision}` }));
    }),
    /changed while it was being read/,
  );
});
