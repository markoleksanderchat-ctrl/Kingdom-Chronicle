import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { deflateRawSync } from "node:zlib";
import { AssetArchive, ItemAssetResolver } from "../src/item-assets";

function archive(members: Record<string, Buffer | string>) {
  const local: Buffer[] = [], central: Buffer[] = [];
  let offset = 0;
  for (const [name, value] of Object.entries(members)) {
    const bytes = Buffer.from(value), encoded = Buffer.from(name), compressed = deflateRawSync(bytes);
    const header = Buffer.alloc(30), directory = Buffer.alloc(46);
    header.writeUInt32LE(0x04034b50); header.writeUInt16LE(8, 8);
    header.writeUInt32LE(compressed.length, 18); header.writeUInt32LE(bytes.length, 22); header.writeUInt16LE(encoded.length, 26);
    directory.writeUInt32LE(0x02014b50); directory.writeUInt16LE(8, 10);
    directory.writeUInt32LE(compressed.length, 20); directory.writeUInt32LE(bytes.length, 24); directory.writeUInt16LE(encoded.length, 28); directory.writeUInt32LE(offset, 42);
    local.push(header, encoded, compressed); central.push(directory, encoded);
    offset += header.length + encoded.length + compressed.length;
  }
  const table = Buffer.concat(central), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50); end.writeUInt16LE(central.length / 2, 8); end.writeUInt16LE(central.length / 2, 10);
  end.writeUInt32LE(table.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, table, end]);
}
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==", "base64");
async function withAssets(members: Record<string, Buffer | string>, run: (resolver: ItemAssetResolver) => Promise<void>) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "chronicle-assets-"));
  try {
    const file = path.join(directory, "fixture.jar");
    await writeFile(file, archive(members));
    await run(new ItemAssetResolver([await AssetArchive.load(file)]));
  } finally { await rm(directory, { recursive: true, force: true }); }
}
test("item sprites follow canonical mod IDs and inherited texture aliases", async () => {
  await withAssets({
    "assets/test/models/item/meal.json": JSON.stringify({ parent: "test:item/base", textures: { layer0: "#food", food: "test:item/meal" } }),
    "assets/test/models/item/base.json": JSON.stringify({ parent: "minecraft:item/generated" }),
    "assets/test/textures/item/meal.png": png,
  }, async (resolver) => {
    const sprite = await resolver.resolve("test:meal");
    assert.equal(sprite?.kind, "flat");
    assert.equal(sprite?.layers[0], `data:image/png;base64,${png.toString("base64")}`);
    assert.equal(await resolver.resolve("minecraft:meal"), null);
    assert.equal(await resolver.resolve("test:../../meal"), null);
    assert.equal(await resolver.resolve("Meal"), null);
  });
});
test("block previews use real face textures and missing/custom/cyclic models fall back", async () => {
  await withAssets({
    "assets/test/models/item/block.json": JSON.stringify({ parent: "minecraft:block/cube_all", textures: { all: "test:block/stone" } }),
    "assets/test/textures/block/stone.png": png,
    "assets/test/models/item/cycle.json": JSON.stringify({ parent: "test:item/cycle" }),
    "assets/test/models/item/entity.json": JSON.stringify({ parent: "minecraft:builtin/entity" }),
  }, async (resolver) => {
    assert.equal((await resolver.resolve("test:block"))?.layers.length, 3);
    for (const id of ["test:cycle", "test:entity", "test:missing"]) assert.equal(await resolver.resolve(id), null);
  });
});
test("oversized archive entries are ignored without inflating them", async () => {
  await withAssets({
    "assets/test/models/item/big.json": JSON.stringify({ parent: "minecraft:item/generated", textures: { layer0: "test:item/big" } }),
    "assets/test/textures/item/big.png": Buffer.alloc(2 * 1024 * 1024),
  }, async (resolver) => assert.equal(await resolver.resolve("test:big"), null));
});

test("inherited block geometry renders with the child item texture", async () => {
  await withAssets({
    "assets/test/models/item/slab.json": JSON.stringify({parent:"test:block/slab",textures:{all:"test:block/stone"}}),
    "assets/test/models/block/slab.json": JSON.stringify({elements:[{from:[0,0,0],to:[16,8,16],faces:{up:{texture:"#all"},north:{texture:"#all"},east:{texture:"#all"},south:{texture:"#all"},west:{texture:"#all"}}}]}),
    "assets/test/textures/block/stone.png": png,
  },async resolver=> {
    const sprite=await resolver.resolve("test:slab");
    assert.equal(sprite?.kind,"model");assert.equal(sprite?.faces?.length,3);
    assert.equal(sprite?.layers[0],`data:image/png;base64,${png.toString("base64")}`);
  });
});
