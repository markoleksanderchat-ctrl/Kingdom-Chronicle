import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { UpdateCoordinator } from "../src/update-coordinator";
import { UpdatesPanel } from "../src/renderer/updates-panel";
import type { DesktopUpdateState } from "../src/types";

function harness() {
  let checks = 0, downloads = 0, installs = 0;
  let finishCheck!: () => void, finishDownload!: () => void;
  const updater = Object.assign(new EventEmitter(), {
    checkForUpdates: () => { checks++; return new Promise<void>(resolve => { finishCheck = resolve; }); },
    downloadUpdate: () => { downloads++; return new Promise<void>(resolve => { finishDownload = resolve; }); },
    quitAndInstall: (silent: boolean, relaunch: boolean) => { assert.equal(silent, true); assert.equal(relaunch, true); installs++; },
  });
  const emitted: DesktopUpdateState[] = [];
  const service = new UpdateCoordinator({ version: "0.3.2", updater, enabled: true, emit: state => emitted.push(state), log() {}, beforeInstall: async () => undefined });
  return { service, updater, emitted, counts: () => ({ checks, downloads, installs }), finishCheck: () => finishCheck(), finishDownload: () => finishDownload() };
}
test("checks and downloads serialize; ready remains ready when a new release appears", async () => {
  const h = harness();
  const check = h.service.check(); assert.equal(h.service.check(), check);
  h.updater.emit("update-available", { version: "0.3.3" }); h.finishCheck(); await check;
  const download = h.service.download(); assert.equal(h.service.download(), download);
  await h.service.check(); assert.equal(h.counts().checks, 1);
  h.updater.emit("update-available", { version: "0.3.4" });
  h.updater.emit("download-progress", { percent: 50, transferred: 50, total: 100, bytesPerSecond: 10 });
  h.updater.emit("update-downloaded", { version: "0.3.3" }); h.finishDownload(); await download;
  assert.equal(h.service.current().phase, "ready"); assert.equal(h.service.current().latestVersion, "0.3.3");
  await h.service.check(); assert.equal(h.counts().checks, 1);
  const install = h.service.install(); assert.equal(h.service.install(), install); await install;
  assert.equal(h.counts().installs, 1); assert.equal(h.service.current().phase, "installing");
});
test("download errors discard progress and ready events cannot overwrite them", async () => {
  const h = harness(), check = h.service.check();
  h.updater.emit("update-available", { version: "0.3.3" }); h.finishCheck(); await check;
  const download = h.service.download();
  h.updater.emit("download-progress", { percent: 100, transferred: 100, total: 100, bytesPerSecond: 10 });
  h.updater.emit("error", new Error("checksum mismatch"));
  h.updater.emit("update-downloaded", { version: "0.3.3" }); h.finishDownload(); await download;
  const state = h.service.current(); assert.equal(state.phase, "error"); assert.equal(state.error?.operation, "download"); assert.equal(state.progress, undefined);
});
test("a full download fallback resumes progress after differential verification", async () => {
  const h = harness(), check = h.service.check();
  h.updater.emit("update-available", { version: "0.3.3" }); h.finishCheck(); await check;
  const download = h.service.download();
  h.updater.emit("download-progress", { percent: 100, transferred: 10, total: 10, bytesPerSecond: 10 });
  assert.equal(h.service.current().phase, "verifying");
  h.updater.emit("download-progress", { percent: 5, transferred: 5, total: 100, bytesPerSecond: 10 });
  assert.equal(h.service.current().phase, "downloading"); assert.equal(h.service.current().progress?.percent, 5);
  h.updater.emit("update-downloaded", { version: "0.3.3" }); h.finishDownload(); await download;
  assert.equal(h.service.current().phase, "ready");
});
test("an installer handoff failure returns a usable error state without success progress", async () => {
  const h = harness(), check = h.service.check();
  h.updater.emit("update-available", { version: "0.3.3" }); h.finishCheck(); await check;
  const download = h.service.download();
  h.updater.emit("update-downloaded", { version: "0.3.3" }); h.finishDownload(); await download;
  h.updater.quitAndInstall = () => { throw new Error("Installer could not start"); };
  const result = await h.service.install();
  assert.equal(result.phase, "error"); assert.equal(result.error?.operation, "install");
  assert.equal(result.currentVersion, "0.3.2"); assert.equal(result.progress, undefined);
  const retry = h.service.check(); h.updater.emit("update-not-available"); h.finishCheck();
  assert.equal((await retry).phase, "current");
});
test("all UI phases have one title and error never renders ready progress", () => {
  const noop = () => undefined;
  for (const phase of ["idle", "checking", "current", "available", "downloading", "verifying", "ready", "installing", "error"] as const) {
    const state: DesktopUpdateState = { phase, revision: 1, currentVersion: "0.3.2", latestVersion: "0.3.3",
      error: phase === "error" ? { operation: "install", message: "Retry safely", detail: "Failure" } : undefined };
    const html = renderToStaticMarkup(createElement(UpdatesPanel, { state, onCheck: noop, onDownload: noop, onRestart: noop, onLater: noop }));
    assert.equal((html.match(/<h3>/g) ?? []).length, 1);
    if (phase === "error") { assert.match(html, /Update failed/); assert.doesNotMatch(html, /<progress|ready to install|Verified and ready/); }
    if (phase === "ready") assert.match(html, /Restart and update/);
  }
});
