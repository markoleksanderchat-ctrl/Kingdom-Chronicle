import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { registerApplicationLifecycle } from "../src/app-lifecycle";
import { RuntimeWatchService } from "../src/file-watch-service";
import { RuntimeService } from "../src/runtime-service";
import type { DesktopAvailableUpdate, DesktopRuntimeState } from "../src/types";
import { launchVerifiedUpdate } from "../src/update-launcher";
import { UpdateService } from "../src/update-service";
import { assertTrustedSender, sendToActiveWindow, type DesktopWindowLike } from "../src/window-state";

const desktopRoot = path.resolve(import.meta.dirname, "..");
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

function windowFixture(destroyed = false): DesktopWindowLike & { sent: unknown[][] } {
  const sent: unknown[][] = [];
  return {
    sent, isDestroyed: () => destroyed, show() {},
    webContents: { id: 7, mainFrame: {}, send: (...args) => sent.push(args) },
  };
}

function runtimeState(instancePath: string): DesktopRuntimeState {
  return { status: "ready", snapshot: null, history: [], instanceName: path.basename(instancePath),
    instancePath, message: `Ready ${instancePath}`, technicalDetail: null };
}

const availableUpdate: DesktopAvailableUpdate = {
  status: "available", currentVersion: "0.2.8", latestVersion: "0.2.9",
  checkedAt: "2026-08-03T00:00:00.000Z", source: "Kingdom Chronicle stable channel", summary: "Test update",
  downloadUrl: "https://kingdom-chronicle-prototype.markoleksanderchat.chatgpt.site/api/desktop-release",
  releaseNotesUrl: "https://kingdom-chronicle-prototype.markoleksanderchat.chatgpt.site/api/desktop-release-notes",
  sizeBytes: 12, sha256: "a".repeat(64),
};

test("destroyed windows reject send and sender validation", () => {
  const destroyed = windowFixture(true);
  assert.equal(sendToActiveWindow(destroyed, "kingdom:runtime-changed", {}), false);
  assert.equal(destroyed.sent.length, 0);
  assert.throws(() => assertTrustedSender(destroyed, {
    sender: { id: destroyed.webContents.id }, senderFrame: destroyed.webContents.mainFrame,
  }), /untrusted/);
  const active = windowFixture();
  assert.doesNotThrow(() => assertTrustedSender(active, {
    sender: { id: active.webContents.id }, senderFrame: active.webContents.mainFrame,
  }));
});

test("watch service debounces rapid events, reports errors, and owns stop restart", async () => {
  class FakeWatcher extends EventEmitter {
    closed = false;
    close() { this.closed = true; }
  }
  const watchers: FakeWatcher[] = [];
  const listeners: Array<() => void> = [];
  const traces: string[] = [];
  let refreshes = 0;
  const service = new RuntimeWatchService({
    debounceMilliseconds: 5,
    onRefresh: () => { refreshes += 1; },
    trace: (message) => traces.push(message),
    watchFactory: ((_folder, _options, listener) => {
      const watcher = new FakeWatcher();
      watchers.push(watcher);
      listeners.push(listener);
      return watcher as never;
    }),
  });
  service.start("C:\\Instances\\First");
  listeners[0](); listeners[0](); listeners[1]();
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(refreshes, 1);
  watchers[0].emit("error", new Error("watch failed"));
  assert.match(traces.join(" "), /watch failed/);
  service.restart("C:\\Instances\\Second");
  assert.equal(watchers[0].closed, true);
  assert.equal(watchers[1].closed, true);
  service.stop();
  assert.equal(watchers.at(-1)?.closed, true);
});

test("runtime reads are single-flight and cannot return a stale selected instance", async () => {
  const first = path.resolve("C:\\Instances\\First");
  const second = path.resolve("C:\\Instances\\Second");
  let releaseFirst!: (state: DesktopRuntimeState) => void;
  const firstRead = new Promise<DesktopRuntimeState>((resolve) => { releaseFirst = resolve; });
  const reads: string[] = [];
  const service = new RuntimeService({
    userDataPath: "C:\\UserData",
    readSelected: async () => first,
    discover: async (saved) => saved,
    isCompatible: async () => true,
    saveSelected: async () => undefined,
    readLive: async (instance) => {
      reads.push(instance);
      return instance === first ? firstRead : runtimeState(instance);
    },
    readCached: async () => null,
    saveCached: async () => undefined,
  });
  const original = service.current();
  assert.equal(service.current(), original);
  await tick();
  const selected = service.select(second);
  assert.equal((await selected).instancePath, second);
  releaseFirst(runtimeState(first));
  assert.equal((await original).instancePath, second);
  assert.deepEqual(reads, [first, second]);
});

test("runtime cache-write failures remain non-fatal and explicit", async () => {
  const instance = path.resolve("C:\\Instances\\CacheFailure");
  const service = new RuntimeService({
    userDataPath: "C:\\UserData", readSelected: async () => instance, discover: async (saved) => saved,
    readLive: async () => runtimeState(instance), saveCached: async () => { throw new Error("disk full"); },
    readCached: async () => null, saveSelected: async () => undefined, isCompatible: async () => true,
  });
  const state = await service.current();
  assert.match(state.message, /backup could not be updated/);
  assert.match(state.technicalDetail ?? "", /disk full/);
});

test("update installation is single-flight, cancellable, and stops when its window is destroyed", async () => {
  const active = windowFixture();
  let approvals = 0;
  let downloads = 0;
  const service = new UpdateService({
    currentVersion: "0.2.8", updateDirectory: "C:\\Updates", getWindow: () => active,
    fetch: async () => { throw new Error("unused"); },
    check: async () => availableUpdate,
    showMessageBox: async () => { approvals += 1; await tick(); return { response: 1 }; },
    download: async () => { downloads += 1; return "unused"; },
    launch: async () => undefined,
  });
  const first = service.install();
  assert.equal(service.install(), first);
  assert.equal((await first).status, "cancelled");
  assert.equal(approvals, 1);
  assert.equal(downloads, 0);
  const destroyed = new UpdateService({
    currentVersion: "0.2.8", updateDirectory: "C:\\Updates", getWindow: () => windowFixture(true),
    fetch: async () => { throw new Error("unused"); }, showMessageBox: async () => ({ response: 0 }),
    launch: async () => undefined,
  });
  assert.equal((await destroyed.install()).status, "error");
});

test("installer launch validates private paths and uses only injected host operations", async () => {
  const copies: string[][] = [];
  const spawns: string[][] = [];
  let unref = false;
  let quit = false;
  const updateDirectory = path.resolve("C:\\UserData\\updates");
  const installer = path.join(updateDirectory, "Kingdom Chronicle-0.2.9 Setup.exe");
  await launchVerifiedUpdate(availableUpdate, installer, updateDirectory, path.resolve("C:\\App\\app-0.2.8"),
    path.resolve("C:\\App"), 42, true, {
      exists: () => true,
      copy: async (...args) => { copies.push(args); },
      spawnDetached: (command, args) => { spawns.push([command, ...args]); return { unref: () => { unref = true; } }; },
      scheduleQuit: () => { quit = true; },
    });
  assert.equal(copies.length, 1);
  assert.deepEqual(spawns[0].slice(1), ["--complete-update", "42", installer, path.resolve("C:\\App")]);
  assert.equal(unref, true);
  assert.equal(quit, true);
  await assert.rejects(() => launchVerifiedUpdate(availableUpdate, path.resolve("C:\\escaped.exe"), updateDirectory,
    path.resolve("C:\\App\\app-0.2.8"), path.resolve("C:\\App"), 42, true, {
      exists: () => true, copy: async () => undefined,
      spawnDetached: () => ({ unref() {} }), scheduleQuit() {},
    }), /escaped/);
});

test("application shutdown owns services and platform window lifecycle", () => {
  const handlers = new Map<string, () => void>();
  let shutdowns = 0;
  let quits = 0;
  let creates = 0;
  const app = { on: (name: string, listener: () => void) => handlers.set(name, listener), quit: () => { quits += 1; } };
  registerApplicationLifecycle(app as never, {
    getMainWindow: () => null, getWindowCount: () => 0,
    createWindow: () => { creates += 1; }, shutdown: () => { shutdowns += 1; }, platform: "win32",
  });
  handlers.get("before-quit")?.();
  handlers.get("activate")?.();
  handlers.get("window-all-closed")?.();
  assert.equal(shutdowns, 1);
  assert.equal(creates, 1);
  assert.equal(quits, 1);
});

test("main is composition-only while IPC, preload, and BrowserWindow security stay stable", async () => {
  const [main, ipc, preload, windowSource] = await Promise.all([
    readFile(path.join(desktopRoot, "src/main.ts"), "utf8"),
    readFile(path.join(desktopRoot, "src/ipc-handlers.ts"), "utf8"),
    readFile(path.join(desktopRoot, "src/preload.ts"), "utf8"),
    readFile(path.join(desktopRoot, "src/main-window.ts"), "utf8"),
  ]);
  assert.ok(main.split(/\r?\n/).length < 150);
  assert.doesNotMatch(main, /ipcMain\.handle|new BrowserWindow|readLiveRuntime|downloadVerifiedInstaller/);
  for (const channel of ["kingdom:get-app-info", "kingdom:check-for-updates", "kingdom:get-update-state", "kingdom:download-update", "kingdom:restart-and-update",
    "kingdom:get-runtime", "kingdom:choose-instance", "kingdom:clear-cache"]) {
    assert.match(ipc, new RegExp(channel));
    assert.match(preload, new RegExp(channel));
  }
  assert.match(ipc, /assertTrustedSender/);
  assert.match(windowSource, /contextIsolation: true/);
  assert.match(windowSource, /nodeIntegration: false/);
  assert.match(windowSource, /sandbox: true/);
  assert.match(windowSource, /setWindowOpenHandler/);
  assert.match(windowSource, /will-navigate/);
  assert.match(main, /setPermissionCheckHandler\(\(\) => false\)/);
  assert.match(main, /setPermissionRequestHandler\([\s\S]*callback\(false\)/);
});
