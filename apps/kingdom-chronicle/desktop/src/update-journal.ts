import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

interface PendingUpdate { previousVersion: string; expectedVersion: string; startedAt: string; status: "installing" | "failed"; detail?: string }
export function updateJournal(userData: string) {
  const directory = path.join(userData, "updates");
  const file = path.join(directory, "restart.json");
  const logs = path.join(userData, "logs");
  mkdirSync(directory, { recursive: true });
  mkdirSync(logs, { recursive: true });
  const logFile = path.join(logs, "updater.log");
  const log = (message: string) => {
    if (existsSync(logFile) && statSync(logFile).size > 2_000_000) {
      renameSync(logFile, `${logFile}.previous`);
    }
    appendFileSync(logFile, `${new Date().toISOString()} ${message}\n`, "utf8");
  };
  const read = (): PendingUpdate | null => {
    if (!existsSync(file)) return null;
    if (statSync(file).size > 16_000) throw new Error("Invalid update restart journal size.");
    const value = JSON.parse(readFileSync(file, "utf8")) as PendingUpdate;
    if (!value || !/^\d+\.\d+\.\d+$/.test(value.expectedVersion) || !/^\d+\.\d+\.\d+$/.test(value.previousVersion)
      || !["installing", "failed"].includes(value.status)) throw new Error("Invalid update restart journal.");
    return value;
  };
  const write = (value: PendingUpdate) => {
    const temporary = `${file}.tmp`;
    writeFileSync(temporary, JSON.stringify(value, null, 2), "utf8");
    renameSync(temporary, file);
  };
  return {
    log, directory,
    begin(previousVersion: string, expectedVersion: string) {
      write({ previousVersion, expectedVersion, startedAt: new Date().toISOString(), status: "installing" });
      log(`Update requested. Previous version: ${previousVersion}. Expected version: ${expectedVersion}.`);
    },
    health(version: string, check: () => void) {
      const pending = read();
      if (!pending) { check(); return false; }
      try {
        if (pending.expectedVersion !== version) throw new Error(`Expected ${pending.expectedVersion}, running ${version}. Installer or relaunch did not finish.`);
        check();
        const success = path.join(directory, "last-success.json");
        writeFileSync(`${success}.tmp`, JSON.stringify({
          previousVersion: pending.previousVersion, expectedVersion: pending.expectedVersion,
          currentVersion: version, startedAt: pending.startedAt, completedAt: new Date().toISOString(), status: "complete",
        }, null, 2), "utf8");
        renameSync(`${success}.tmp`, success);
        log(`Update successful. Previous version: ${pending.previousVersion}. Current version: ${version}.`);
        rmSync(file);
        return true;
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        write({ ...pending, status: "failed", detail });
        log(`Post-update health failed: ${detail}`);
        throw error;
      }
    },
  };
}
