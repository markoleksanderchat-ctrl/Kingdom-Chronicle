import { open, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { inflateRawSync } from "node:zlib";
import { validItemId, type ItemSprite } from "@/lib/item-sprite";
import { blockSprite, type ModelElement, type GuiTransform } from "./block-sprite";
import { firstTextureFrame } from "./sprite-png";
import { entitySprite } from "./entity-sprite";

const MAX_ENTRY = 1024 * 1024;
type Entry = { offset: number; compressed: number; size: number; method: number };

// Read only selected ZIP members. Never extract archives or expose paths to the renderer.
export class AssetArchive {
  private constructor(private readonly file: string, private readonly entries: Map<string, Entry>) {}

  static async load(file: string) {
    const handle = await open(file, "r");
    try {
      const { size } = await handle.stat();
      if (size < 22 || size > 1024 * 1024 * 1024) throw new Error("Unsupported asset archive size");
      const tail = Buffer.alloc(Math.min(size, 65557));
      await handle.read(tail, 0, tail.length, size - tail.length);
      let end = tail.length - 22;
      while (end >= 0 && (tail.readUInt32LE(end) !== 0x06054b50 || end + 22 + tail.readUInt16LE(end + 20) !== tail.length)) end--;
      if (end < 0 || tail.readUInt16LE(end + 4) || tail.readUInt16LE(end + 6)) throw new Error("Unsupported asset archive");
      const length = tail.readUInt32LE(end + 12), offset = tail.readUInt32LE(end + 16);
      if (length > 16 * 1024 * 1024 || offset + length > size - 22) throw new Error("Invalid asset directory");
      const directory = Buffer.alloc(length);
      const read = await handle.read(directory, 0, length, offset);
      if (read.bytesRead !== length) throw new Error("Incomplete asset directory");
      const entries = new Map<string, Entry>();
      for (let cursor = 0; cursor + 46 <= length;) {
        if (directory.readUInt32LE(cursor) !== 0x02014b50) throw new Error("Invalid asset member");
        const nameLength = directory.readUInt16LE(cursor + 28);
        const next = cursor + 46 + nameLength + directory.readUInt16LE(cursor + 30) + directory.readUInt16LE(cursor + 32);
        if (next > length) throw new Error("Invalid asset member bounds");
        const name = directory.toString("utf8", cursor + 46, cursor + 46 + nameLength);
        const method = directory.readUInt16LE(cursor + 10), flags = directory.readUInt16LE(cursor + 8);
        const member = { method, compressed: directory.readUInt32LE(cursor + 20), size: directory.readUInt32LE(cursor + 24), offset: directory.readUInt32LE(cursor + 42) };
        if (name.startsWith("assets/") && !name.includes("..") && !name.includes("\\")
          && /\.(json|png)$/.test(name) && !(flags & 1) && [0, 8].includes(method)
          && member.size <= MAX_ENTRY && member.compressed <= MAX_ENTRY && member.offset < size) entries.set(name, member);
        cursor = next;
      }
      return new AssetArchive(file, entries);
    } finally { await handle.close(); }
  }

  async read(name: string): Promise<Buffer | null> {
    const entry = this.entries.get(name);
    if (!entry) return null;
    const handle = await open(this.file, "r");
    try {
      const header = Buffer.alloc(30);
      if ((await handle.read(header, 0, 30, entry.offset)).bytesRead !== 30 || header.readUInt32LE(0) !== 0x04034b50) return null;
      const start = entry.offset + 30 + header.readUInt16LE(26) + header.readUInt16LE(28);
      const buffer = Buffer.alloc(entry.compressed);
      if ((await handle.read(buffer, 0, buffer.length, start)).bytesRead !== buffer.length) return null;
      const data = entry.method === 0 ? buffer : inflateRawSync(buffer, { maxOutputLength: MAX_ENTRY });
      return data.length === entry.size ? data : null;
    } finally { await handle.close(); }
  }
}

type Model = { parent?: string; textures?: Record<string, string>; elements?: ModelElement[]; display?: { gui?: GuiTransform } };
export class ItemAssetResolver {
  private readonly cache = new Map<string, Promise<ItemSprite | null>>();
  constructor(private readonly archives: readonly AssetArchive[]) {}

  resolve(id: unknown): Promise<ItemSprite | null> {
    if (!validItemId(id)) return Promise.resolve(null);
    let result = this.cache.get(id);
    if (!result) {
      result = this.render(id).catch(() => null);
      if (this.cache.size >= 2048) this.cache.clear();
      this.cache.set(id, result);
    }
    return result;
  }

  private async read(location: string, folder: "models" | "textures", extension: string) {
    if (!validItemId(location)) return null;
    const [namespace, name] = location.split(":");
    for (const archive of this.archives) {
      const data = await archive.read(`assets/${namespace}/${folder}/${name}.${extension}`);
      if (data) return data;
    }
    return null;
  }

  private async render(id: string): Promise<ItemSprite | null> {
    const [namespace, name] = id.split(":");
    let location = `${namespace}:item/${name}`;
    const textures: Record<string, string> = {};
    const parents: string[] = [];
    let elements: ModelElement[] | undefined;
    let gui: GuiTransform | undefined;
    for (let depth = 0; depth < 16; depth++) {
      const data = await this.read(location, "models", "json");
      if (!data) break;
      const model = JSON.parse(data.toString("utf8")) as Model;
      elements ??= model.elements;
      gui ??= model.display?.gui;
      for (const [key, value] of Object.entries(model.textures ?? {})) if (!(key in textures) && typeof value === "string") textures[key] = value;
      if (typeof model.parent !== "string") break;
      location = model.parent.includes(":") ? model.parent : `minecraft:${model.parent}`;
      if (parents.includes(location)) return null;
      parents.push(location);
    }
    const texture = async (key: string): Promise<string | null> => {
      let value = key.startsWith("#") ? textures[key.slice(1)] : textures[key] ?? key;
      for (let depth = 0; value?.startsWith("#") && depth < 16; depth++) value = textures[value.slice(1)];
      if (!value || value.startsWith("#")) return null;
      const bytes = await this.read(value.includes(":") ? value : `minecraft:${value}`, "textures", "png");
      const frame = bytes && firstTextureFrame(bytes);
      return frame ? `data:image/png;base64,${frame.toString("base64")}` : null;
    };
    if (parents.some((parent) => /:(item\/(generated|handheld.*)|builtin\/generated)$/.test(parent))) {
      const keys = Object.keys(textures).filter((key) => /^layer[0-7]$/.test(key)).sort();
      const layers = await Promise.all(keys.map(texture));
      return layers.length && layers.every((layer): layer is string => layer !== null) ? { kind: "flat", layers } : null;
    }
    if (elements) return blockSprite(elements, gui, texture);
    if (parents.includes("minecraft:builtin/entity")) return entitySprite(id, gui, texture);
    if (parents.some((parent) => /:block\/(cube.*)$/.test(parent))) {
      const top = await texture("top") ?? await texture("end") ?? await texture("all");
      const side = await texture("side") ?? await texture("north") ?? await texture("all");
      const front = await texture("front") ?? side;
      return top && side && front ? { kind: "cube", layers: [top, side, front] } : null;
    }
    return null;
  }
}

export async function loadInstanceItemAssets(instance: string, version: string) {
  if (!/^[0-9]+\.[0-9]+(?:\.[0-9]+)?$/.test(version)) return new ItemAssetResolver([]);
  const modFiles = await readdir(path.join(instance, "mods")).catch(() => [] as string[]);
  const files = modFiles.filter((name) => name.endsWith(".jar")).sort().slice(0, 512).map((name) => path.join(instance, "mods", name));
  const minecraftRoot = path.dirname(path.dirname(instance));
  files.push(path.join(minecraftRoot, "Install", "versions", version, `${version}.jar`),
    path.join(instance, "versions", version, `${version}.jar`),
    path.join(minecraftRoot, "versions", version, `${version}.jar`));
  const archives: AssetArchive[] = [];
  for (const file of files) {
    try { if ((await stat(file)).isFile()) archives.push(await AssetArchive.load(file)); }
    catch { /* One malformed/unavailable mod does not hide the inventory. */ }
  }
  return new ItemAssetResolver(archives);
}
