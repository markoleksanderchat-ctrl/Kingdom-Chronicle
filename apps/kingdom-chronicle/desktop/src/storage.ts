import { mkdir, open, rename, rm, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { isColonySnapshot } from "@/lib/snapshot-validation";
import type { DesktopRuntimeState } from "./types";

interface DesktopSettings {
  instancePath: string | null;
}

const MAX_SETTINGS_BYTES = 64_000;
const MAX_CACHE_BYTES = 4_000_000;

async function readJson<T>(file: string, maximumBytes: number): Promise<T | null> {
  try {
    const handle = await open(file, "r");
    try {
      const info = await handle.stat();
      if (!info.isFile() || info.size > maximumBytes) return null;
      const buffer = Buffer.alloc(maximumBytes + 1);
      let total = 0;
      while (total < buffer.length) {
        const { bytesRead } = await handle.read(buffer, total, buffer.length - total, total);
        if (bytesRead === 0) break;
        total += bytesRead;
      }
      if (total > maximumBytes) return null;
      return JSON.parse(buffer.subarray(0, total).toString("utf8")) as T;
    } finally {
      await handle.close();
    }
  } catch {
    return null;
  }
}

async function writeJsonAtomic(file: string, value: unknown) {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.${randomUUID()}.tmp`;
  const backup = `${file}.${process.pid}.${randomUUID()}.bak`;
  await writeFile(temporary, `${JSON.stringify(value)}\n`, { encoding: "utf8", flag: "wx" });
  try {
    try {
      await rename(temporary, file);
    } catch (error) {
      if (!(error instanceof Error && "code" in error && (error.code === "EEXIST" || error.code === "EPERM"))) throw error;
      await rename(file, backup);
      try {
        await rename(temporary, file);
        await rm(backup, { force: true });
      } catch (replacementError) {
        await rename(backup, file).catch(() => undefined);
        throw replacementError;
      }
    }
  } finally {
    await rm(temporary, { force: true });
  }
}

export function settingsFile(userData: string) {
  return path.join(userData, "settings.json");
}

export function cacheFile(userData: string) {
  return path.join(userData, "cache", "last-good.json");
}

export async function readSelectedInstance(userData: string) {
  const settings = await readJson<DesktopSettings>(settingsFile(userData), MAX_SETTINGS_BYTES);
  return typeof settings?.instancePath === "string" && settings.instancePath ? settings.instancePath : null;
}

export async function saveSelectedInstance(userData: string, instancePath: string) {
  await writeJsonAtomic(settingsFile(userData), { instancePath } satisfies DesktopSettings);
}

export async function readCachedState(userData: string, instancePath: string) {
  const value = await readJson<unknown>(cacheFile(userData), MAX_CACHE_BYTES);
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<DesktopRuntimeState>;
  if (!candidate.snapshot || !isColonySnapshot(candidate.snapshot)) return null;
  if (candidate.status !== "ready" && candidate.status !== "cached") return null;
  if (!Array.isArray(candidate.history) || !candidate.history.every((entry) => (
    entry && typeof entry === "object"
    && typeof entry.generatedAt === "string"
    && typeof entry.receivedAt === "string"
    && isColonySnapshot(entry.snapshot)
  ))) return null;
  if (typeof candidate.instancePath !== "string"
    || path.resolve(candidate.instancePath).toLocaleLowerCase("en-US") !== path.resolve(instancePath).toLocaleLowerCase("en-US")) return null;
  if (typeof candidate.instanceName !== "string" || typeof candidate.message !== "string") return null;
  if (candidate.technicalDetail !== null && typeof candidate.technicalDetail !== "string") return null;
  return candidate as DesktopRuntimeState;
}

export async function saveCachedState(userData: string, state: DesktopRuntimeState) {
  await writeJsonAtomic(cacheFile(userData), state);
}
