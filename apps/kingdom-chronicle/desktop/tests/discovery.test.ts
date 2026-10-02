import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { discoverInstance, isCompatibleInstance } from "../src/discovery";

const validInfo = {
  bridgeVersion: "0.15.0", protocolId: "com.colonybridge.snapshot", schemaVersion: 2,
  outputLayoutVersion: 1, transport: "filesystem", readOnly: true, status: "ready",
  outputRoot: "C:\\fixture\\colonybridge", latestFiles: [], coloniesDetected: 0, lastSuccessfulExportAt: null,
};

test("discovery accepts one compatible saved instance", async () => {
  const root = await import("node:fs/promises").then(({ mkdtemp }) => mkdtemp(path.join(os.tmpdir(), "kingdom-discovery-")));
  await mkdir(path.join(root, "colonybridge"), { recursive: true });
  await writeFile(path.join(root, "colonybridge", "bridge-info.json"), JSON.stringify(validInfo));
  assert.equal(await isCompatibleInstance(root), true);
  assert.equal(await discoverInstance(root, ""), root);
});

test("discovery rejects write-capable and malformed bridges", async () => {
  const root = await import("node:fs/promises").then(({ mkdtemp }) => mkdtemp(path.join(os.tmpdir(), "kingdom-discovery-")));
  await mkdir(path.join(root, "colonybridge"), { recursive: true });
  await writeFile(path.join(root, "colonybridge", "bridge-info.json"), JSON.stringify({ ...validInfo, readOnly: false }));
  assert.equal(await isCompatibleInstance(root), false);
});
