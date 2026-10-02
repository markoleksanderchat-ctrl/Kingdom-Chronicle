import { app } from "electron";
import { NsisUpdater } from "electron-updater";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { UpdateCoordinator, type UpdateInfo } from "./update-coordinator";
import { updateJournal } from "./update-journal";
import { inspectLegacyArtifacts, migrateLegacyData, verifyUserData } from "./installation-migration";
import type { RuntimeService } from "./runtime-service";
import type { DesktopUpdateState } from "./types";

export const STABLE_UPDATE_URL = "https://kingdom-chronicle-prototype.markoleksanderchat.chatgpt.site/api/desktop-updates/stable";
export const APPLICATION_ID = "com.squirrel.KingdomChronicle.KingdomChronicle";

export function validateRelease(info: UpdateInfo, lab: boolean) {
  if (!/^\d+\.\d+\.\d+$/.test(info.version) || !Array.isArray(info.files) || info.files.length !== 1) throw new Error("Invalid stable release metadata.");
  const file = info.files[0];
  const name = `${lab ? "KingdomChronicleLab" : "KingdomChronicle"}-${info.version}-Setup.exe`;
  if (file.url !== `${info.version}/${name}` || !/^[A-Za-z0-9+/]{86}==$/.test(file.sha512)
    || !Number.isSafeInteger(file.size) || file.size! <= 0 || file.size! > 300 * 1024 * 1024) {
    throw new Error("Update artifact is outside this application's stable release namespace.");
  }
}

export function createDesktopUpdater(options: {
  lab: boolean; runtime: RuntimeService; stopWatch(): void;
  emit(state: DesktopUpdateState): void;
}) {
  const userData = app.getPath("userData"), journal = updateJournal(userData);
  const legacyRoot = path.join(app.getPath("appData"), "../Local/KingdomChronicle");
  const version = app.getVersion();
  // Copy legacy data before the renderer can initiate runtime discovery.
  let migrationError: unknown = null;
  if (!options.lab) try { migrateLegacyData(userData, path.join(legacyRoot, "UserData"), journal.log); }
  catch (error) { migrationError = error; journal.log(`Legacy migration deferred: ${String(error)}`); }
  const config = path.join(process.resourcesPath, "app-update.yml");
  let configError: unknown = null;
  if (app.isPackaged) try {
    const content = readFileSync(config, "utf8");
    const expected = options.lab ? "http://127.0.0.1:5195/stable" : STABLE_UPDATE_URL;
    if (!/^provider: generic\r?$/m.test(content) || !content.split(/\r?\n/).includes(`url: ${expected}`)
      || !/^useMultipleRangeRequest: false\r?$/m.test(content)) throw new Error("The installed update provider does not match the fixed stable channel.");
  } catch (error) { configError = error; journal.log(`Invalid update configuration: ${String(error)}`); }
  const updater = new NsisUpdater();
  updater.autoDownload = false;
  updater.autoInstallOnAppQuit = false;
  updater.allowDowngrade = false;
  updater.allowPrerelease = false;
  updater.disableWebInstaller = true;
  updater.logger = { info: (value) => journal.log(String(value)), warn: (value) => journal.log(`WARN ${value}`),
    error: (value) => journal.log(`ERROR ${value}`), debug: (value) => journal.log(`DEBUG ${value}`) };
  if (app.isPackaged) {
    // Preserve the registered path, including the one-time Squirrel bridge.
    updater.installDirectory = path.dirname(process.execPath).match(/[\\/]app-\d/)
      ? path.join(app.getPath("appData"), "../Local/Programs/KingdomChronicle") : path.dirname(process.execPath);
  }
  const coordinator = new UpdateCoordinator({
    version, updater, enabled: app.isPackaged && !configError,
    emit: (state) => {
      options.emit(state);
      if (options.lab) writeFileSync(path.join(journal.directory, "lab-state.json"), JSON.stringify({ ...state, pid: process.pid, executable: process.execPath }));
    }, log: journal.log,
    validateRelease: (info) => validateRelease(info, options.lab),
    beforeInstall: async (expected) => {
      if (!options.lab) migrateLegacyData(userData, path.join(legacyRoot, "UserData"), journal.log);
      options.stopWatch();
      await options.runtime.flush();
      verifyUserData(userData);
      journal.begin(version, expected);
    },
  });
  // Isolated test builds expose a CLI test driver, never renderer-controlled
  // paths or feeds. Production compiles this mode off.
  if (options.lab) app.on("second-instance", (_event, argv) => {
    if (argv.includes("--update-lab-check")) void coordinator.check();
    if (argv.includes("--update-lab-download")) void coordinator.download();
    if (argv.includes("--update-lab-restart")) void coordinator.install();
  });
  return {
    coordinator, log: journal.log,
    async afterWindowReady() {
      try {
        if (migrationError) throw migrationError;
        if (configError) throw configError;
        const report = await options.runtime.current();
        if (report.status === "error") throw new Error(`Colony report startup check: ${report.message}`);
        journal.health(version, () => {
          verifyUserData(userData);
          if (app.isPackaged && (!existsSync(config) || !existsSync(app.getAppPath()) || !existsSync(process.execPath))) {
            throw new Error("Installed application resources or update configuration are missing.");
          }
        });
        // Only a running, health-verified NSIS application may clean old versions.
        const nsisInstall = existsSync(path.join(path.dirname(process.execPath), `Uninstall ${path.basename(process.execPath)}`));
        if (!options.lab && nsisInstall && path.resolve(path.dirname(process.execPath)) !== path.resolve(legacyRoot)) {
          const script = path.join(process.resourcesPath, "Finalize-LegacyMigration.ps1");
          if (existsSync(script)) execFile("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script,
            "-Root", path.dirname(process.execPath), "-ExpectedVersion", version], { windowsHide: true }, (error, output, detail) => {
            journal.log(`Legacy registration/shortcuts: ${error ? String(error) : output}${detail}`);
            if (!error) try { inspectLegacyArtifacts(legacyRoot, userData, true, journal.log); }
            catch (cleanupError) { journal.log(`Legacy cleanup deferred: ${String(cleanupError)}`); }
          });
        }
        journal.log(`Startup healthy. Version: ${version}. Executable: ${process.execPath}. User data: ${userData}.`);
      } catch (error) { coordinator.healthError(error); }
    },
    start() {
      if (!app.isPackaged) return;
      const startup = setTimeout(() => void coordinator.backgroundCheck(), options.lab ? 1000 : 15_000);
      const periodic = setInterval(() => void coordinator.backgroundCheck(), 6 * 60 * 60 * 1000);
      startup.unref(); periodic.unref();
      app.once("before-quit", () => { clearTimeout(startup); clearInterval(periodic); });
    },
  };
}
