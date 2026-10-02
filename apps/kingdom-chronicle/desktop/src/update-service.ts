import path from "node:path";
import type { DesktopAvailableUpdate, DesktopUpdateInstallResult } from "./types";
import { checkForDesktopUpdate } from "./update-check";
import { downloadVerifiedInstaller } from "./update-installer";
import type { DesktopWindowLike } from "./window-state";
import { sendToActiveWindow } from "./window-state";

interface MessageBoxResult { response: number }
interface UpdateServiceDependencies {
  currentVersion: string;
  updateDirectory: string;
  getWindow: () => DesktopWindowLike | null;
  fetch: (url: string, init: RequestInit) => Promise<Response>;
  showMessageBox: (window: DesktopWindowLike, options: Record<string, unknown>) => Promise<MessageBoxResult>;
  launch: (update: DesktopAvailableUpdate, installer: string) => Promise<void>;
  check?: typeof checkForDesktopUpdate;
  download?: typeof downloadVerifiedInstaller;
}

export class UpdateService {
  private installRead: Promise<DesktopUpdateInstallResult> | null = null;
  constructor(private readonly dependencies: UpdateServiceDependencies) {}

  check() {
    return (this.dependencies.check ?? checkForDesktopUpdate)(
      this.dependencies.currentVersion, this.dependencies.fetch,
    );
  }

  install(): Promise<DesktopUpdateInstallResult> {
    if (this.installRead) return this.installRead;
    const current = this.performInstall();
    this.installRead = current;
    void current.finally(() => { if (this.installRead === current) this.installRead = null; }).catch(() => undefined);
    return current;
  }

  private async performInstall(): Promise<DesktopUpdateInstallResult> {
    const window = this.dependencies.getWindow();
    if (!window || window.isDestroyed()) return { status: "error", message: "The app window is unavailable." };
    const update = await this.check();
    if (update.status === "error") return { status: "error", message: update.message };
    if (update.status !== "available") {
      return { status: "not-available", message: "Kingdom Chronicle is already up to date." };
    }
    const approval = await this.dependencies.showMessageBox(window, {
      type: "info", title: "Install Kingdom Chronicle update",
      message: `Install Kingdom Chronicle ${update.latestVersion}?`,
      detail: `${update.summary}\n\nDownload size: ${(update.sizeBytes / 1024 / 1024).toFixed(1)} MB. The update is verified before it can run.`,
      buttons: ["Download and install", "Not now"], defaultId: 0, cancelId: 1, noLink: true,
    });
    if (approval.response !== 0) return { status: "cancelled", message: "The update was not installed." };
    try {
      const installer = await (this.dependencies.download ?? downloadVerifiedInstaller)(
        update, this.dependencies.updateDirectory, this.dependencies.fetch,
        (progress) => sendToActiveWindow(this.dependencies.getWindow(), "kingdom:update-progress", progress),
      );
      const readyWindow = this.dependencies.getWindow();
      if (!readyWindow || readyWindow.isDestroyed()) {
        return { status: "error", message: "The app window closed before installation could begin." };
      }
      const ready = await this.dependencies.showMessageBox(readyWindow, {
        type: "info", title: "Update verified",
        message: `Kingdom Chronicle ${update.latestVersion} is ready to install.`,
        detail: "Kingdom Chronicle will close and restart. Your colony reports and selected Minecraft instance will stay in place.",
        buttons: ["Install and restart", "Not now"], defaultId: 0, cancelId: 1, noLink: true,
      });
      if (ready.response !== 0) {
        return { status: "cancelled", message: "The verified update is saved. Check again when you are ready to install it." };
      }
      await this.dependencies.launch(update, installer);
      return { status: "launching-installer", message: `Installing Kingdom Chronicle ${update.latestVersion}.` };
    } catch (error) {
      return { status: "error", message: error instanceof Error && error.name === "AbortError"
        ? "The update download timed out. Try again when the connection is stable."
        : error instanceof Error ? error.message : "The update could not be installed." };
    }
  }
}

export function updateDirectory(userDataPath: string) {
  return path.join(userDataPath, "updates");
}
