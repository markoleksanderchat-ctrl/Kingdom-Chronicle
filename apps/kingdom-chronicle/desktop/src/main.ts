import { app, BrowserWindow, dialog, ipcMain, Menu, session } from "electron";
import { rm } from "node:fs/promises";
import path from "node:path";
import squirrelStartup from "electron-squirrel-startup";
import { registerApplicationLifecycle } from "./app-lifecycle";
import { RuntimeWatchService } from "./file-watch-service";
import { registerDesktopApi } from "./ipc-handlers";
import { loadInstanceItemAssets, type ItemAssetResolver } from "./item-assets";
import { createMainWindow } from "./main-window";
import { RuntimeService } from "./runtime-service";
import { cacheFile } from "./storage";
import { APPLICATION_ID, createDesktopUpdater } from "./desktop-updater";
import { migrateLegacyData } from "./installation-migration";
import type { DesktopWindowLike } from "./window-state";

declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined;
declare const MAIN_WINDOW_VITE_NAME: string;
declare const __KC_UPDATE_LAB__: boolean;
declare const __KC_LAB_USER_DATA__: string;

const diagnosticsEnabled = process.env.KINGDOM_CHRONICLE_DIAGNOSTICS === "1";
const trace = (message: string) => { if (diagnosticsEnabled) console.error(`[Kingdom Chronicle] ${message}`); };

trace("main module loaded");
if (squirrelStartup) app.quit();
app.disableHardwareAcceleration();

const executableDirectory = path.dirname(process.execPath);
const updateLab = typeof __KC_UPDATE_LAB__ !== "undefined" && __KC_UPDATE_LAB__;
if (updateLab) app.setPath("userData", __KC_LAB_USER_DATA__);

let mainWindow: BrowserWindow | null = null;
let desktopLog = trace;
let itemAssets: { instance: string; resolver: Promise<ItemAssetResolver> } | null = null;

const runtime = new RuntimeService({
  userDataPath: app.getPath("userData"),
  trace,
  onInstanceReady: (instancePath) => watchService.start(instancePath),
  onSelectionChange: () => watchService.stop(),
});

const watchService = new RuntimeWatchService({
  trace,
  onRefresh: async () => {
    const state = await runtime.current();
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send("kingdom:runtime-changed", state);
  },
});

async function openMainWindow() {
  trace("creating window");
  const window = await createMainWindow({
    executableDirectory,
    appPath: app.getAppPath(),
    preloadPath: path.join(__dirname, "preload.js"),
    developmentUrl: MAIN_WINDOW_VITE_DEV_SERVER_URL,
    rendererName: MAIN_WINDOW_VITE_NAME,
    trace,
    onCreated: (created) => { mainWindow = created; },
    onConsole: (message) => desktopLog(message),
  });
  mainWindow = window;
  window.once("closed", () => { if (mainWindow === window) mainWindow = null; });
  trace("window created");
  return window;
}

const hasSingleInstanceLock = squirrelStartup ? false : app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
} else {
  // Chromium opens Preferences and Local Storage during ready/session setup.
  // Copy legacy preferences before that creates an empty destination profile.
  if (!updateLab) try {
    migrateLegacyData(app.getPath("userData"), path.join(app.getPath("appData"), "../Local/KingdomChronicle/UserData"), trace);
  } catch (error) {
    // The updater repeats validation and exposes this failure in its normal
    // health state; the existing profile and verified backup remain intact.
    trace(`Early legacy migration deferred: ${String(error)}`);
  }
  registerApplicationLifecycle(app, {
    getMainWindow: () => mainWindow as DesktopWindowLike | null,
    getWindowCount: () => BrowserWindow.getAllWindows().length,
    createWindow: openMainWindow,
    shutdown: () => {
      runtime.shutdown();
      watchService.stop();
    },
  });

  void app.whenReady().then(async () => {
    trace("application ready");
    app.setAppUserModelId(updateLab ? "com.kingdomchronicle.UpdateLab" : APPLICATION_ID);
    Menu.setApplicationMenu(null);
    session.defaultSession.setPermissionCheckHandler(() => false);
    session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
    const updates = createDesktopUpdater({ lab: updateLab, runtime, stopWatch: () => watchService.stop(),
      emit: (state) => mainWindow?.webContents.send("kingdom:update-state", state) });
    desktopLog = updates.log;
    let rendererHealthy = false;
    registerDesktopApi({
      ipcMain,
      runtime,
      updates: updates.coordinator,
      onRendererReady: () => { if (!rendererHealthy) { rendererHealthy = true; void updates.afterWindowReady(); } },
      getWindow: () => mainWindow as DesktopWindowLike | null,
      appInfo: { name: app.getName(), version: app.getVersion() },
      defaultInstanceRoot: path.join(process.env.USERPROFILE ?? "", "curseforge", "minecraft", "Instances"),
      chooseDirectory: (window, options) => dialog.showOpenDialog(
        window as BrowserWindow, options as Electron.OpenDialogOptions,
      ),
      clearCache: () => rm(cacheFile(app.getPath("userData")), { force: true }),
      itemSprite: async (id) => {
        const instance = runtime.selectedInstancePath;
        if (!instance) return null;
        if (itemAssets?.instance !== instance) {
          // Reserve the cache before awaiting so concurrent rows share one archive index.
          itemAssets = { instance, resolver: runtime.current().then((state) =>
            loadInstanceItemAssets(instance, state.snapshot?.game.minecraftVersion ?? "")) };
        }
        return (await itemAssets.resolver).resolve(id);
      },
    });
    await openMainWindow();
    const healthTimeout = setTimeout(() => { if (!rendererHealthy) updates.coordinator.healthError(new Error("The application renderer did not start.")); }, 10_000);
    healthTimeout.unref();
    updates.start();
  });
}
