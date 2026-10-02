import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import fixture from "@/data/colony-snapshot.json";
import { cacheFile, readCachedState, saveCachedState } from "../src/storage";
import type { DesktopRuntimeState } from "../src/types";

async function cachedFixture(instancePath: string): Promise<DesktopRuntimeState> {
  return {
    status: "ready",
    snapshot: fixture,
    history: [],
    instanceName: path.basename(instancePath),
    instancePath,
    message: "Connected directly to Colony Bridge on this computer.",
    technicalDetail: null,
  };
}

test("cache loads only for the Minecraft instance that produced it", async () => {
  const userData = await mkdtemp(path.join(os.tmpdir(), "kingdom-storage-"));
  const firstInstance = path.join(userData, "First instance");
  const secondInstance = path.join(userData, "Second instance");
  await saveCachedState(userData, await cachedFixture(firstInstance));
  assert.equal((await readCachedState(userData, firstInstance))?.snapshot?.colony.name, fixture.colony.name);
  assert.equal(await readCachedState(userData, secondInstance), null);
});

test("cache rejects malformed snapshot data", async () => {
  const userData = await mkdtemp(path.join(os.tmpdir(), "kingdom-storage-"));
  const instance = path.join(userData, "Instance");
  await saveCachedState(userData, await cachedFixture(instance));
  const malformed = { ...(await cachedFixture(instance)), snapshot: { schemaVersion: 2 } };
  await writeFile(cacheFile(userData), JSON.stringify(malformed));
  assert.equal(await readCachedState(userData, instance), null);
});

test("cache rejects invalid runtime status and oversized files", async () => {
  const userData = await mkdtemp(path.join(os.tmpdir(), "kingdom-storage-"));
  const instance = path.join(userData, "Instance");
  await saveCachedState(userData, await cachedFixture(instance));
  await writeFile(cacheFile(userData), JSON.stringify({ ...(await cachedFixture(instance)), status: "unknown" }));
  assert.equal(await readCachedState(userData, instance), null);
  await writeFile(cacheFile(userData), " ".repeat(4_000_001));
  assert.equal(await readCachedState(userData, instance), null);
});

test("cache atomically replaces an existing report", async () => {
  const userData = await mkdtemp(path.join(os.tmpdir(), "kingdom-storage-"));
  const instance = path.join(userData, "Instance");
  await saveCachedState(userData, await cachedFixture(instance));
  await saveCachedState(userData, { ...(await cachedFixture(instance)), status: "cached", message: "Saved copy" });
  assert.equal((await readCachedState(userData, instance))?.message, "Saved copy");
});
