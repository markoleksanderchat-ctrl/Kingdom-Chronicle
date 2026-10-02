import path from "node:path";
import { validItemId, type ItemSprite } from "@/lib/item-sprite";
import type { DesktopRuntimeState } from "./types";
import type { RuntimeService } from "./runtime-service";
import type { UpdateCoordinator } from "./update-coordinator";
import { assertTrustedSender, sendToActiveWindow, type DesktopWindowLike, type TrustedEventLike } from "./window-state";

interface IpcMainLike {
  handle(channel: string, listener: (event: TrustedEventLike, argument?: unknown) => unknown): void;
}

interface DesktopIpcDependencies {
  ipcMain: IpcMainLike;
  runtime: RuntimeService;
  updates: UpdateCoordinator;
  getWindow: () => DesktopWindowLike | null;
  appInfo: { name: string; version: string };
  defaultInstanceRoot: string;
  chooseDirectory: (window: DesktopWindowLike, options: Record<string, unknown>) => Promise<{ canceled: boolean; filePaths: string[] }>;
  clearCache: () => Promise<void>;
  itemSprite?: (id: string) => Promise<ItemSprite | null>;
  onRendererReady?: () => void;
}

export function registerDesktopApi(dependencies: DesktopIpcDependencies) {
  const trusted = (event: TrustedEventLike) => assertTrustedSender(dependencies.getWindow(), event);
  dependencies.ipcMain.handle("kingdom:renderer-ready", async (event) => {
    trusted(event);
    dependencies.onRendererReady?.();
  });
  dependencies.ipcMain.handle("kingdom:get-item-sprite", async (event, id) => {
    trusted(event);
    return validItemId(id) ? dependencies.itemSprite?.(id) ?? null : null;
  });
  const sendRuntime = (state: DesktopRuntimeState) => {
    sendToActiveWindow(dependencies.getWindow(), "kingdom:runtime-changed", state);
    return state;
  };
  dependencies.ipcMain.handle("kingdom:get-app-info", async (event) => {
    trusted(event);
    return { ...dependencies.appInfo, updates: "background" } as const;
  });
  dependencies.ipcMain.handle("kingdom:get-update-state", async (event) => {
    trusted(event);
    return dependencies.updates.current();
  });
  dependencies.ipcMain.handle("kingdom:check-for-updates", async (event) => {
    trusted(event);
    return dependencies.updates.check();
  });
  dependencies.ipcMain.handle("kingdom:download-update", async (event) => {
    trusted(event);
    return dependencies.updates.download();
  });
  dependencies.ipcMain.handle("kingdom:restart-and-update", async (event) => {
    trusted(event);
    return dependencies.updates.install();
  });
  dependencies.ipcMain.handle("kingdom:get-runtime", async (event) => {
    trusted(event);
    return sendRuntime(await dependencies.runtime.current());
  });
  dependencies.ipcMain.handle("kingdom:choose-instance", async (event) => {
    trusted(event);
    const window = dependencies.getWindow();
    if (!window || window.isDestroyed()) {
      return dependencies.runtime.emptyState("error", "The app window is unavailable.");
    }
    const result = await dependencies.chooseDirectory(window, {
      title: "Choose your Minecraft instance",
      defaultPath: dependencies.runtime.selectedInstancePath ?? dependencies.defaultInstanceRoot,
      properties: ["openDirectory"], buttonLabel: "Use this instance",
    });
    if (result.canceled || !result.filePaths[0]) return sendRuntime(await dependencies.runtime.current());
    return sendRuntime(await dependencies.runtime.select(path.resolve(result.filePaths[0])));
  });
  dependencies.ipcMain.handle("kingdom:clear-cache", async (event) => {
    trusted(event);
    await dependencies.clearCache();
  });
}
