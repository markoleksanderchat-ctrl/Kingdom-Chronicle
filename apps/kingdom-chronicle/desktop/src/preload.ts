import { contextBridge, ipcRenderer } from "electron";
import type { DesktopAppInfo, DesktopRuntimeState, DesktopUpdateState, KingdomDesktopApi } from "./types";

const api: KingdomDesktopApi = Object.freeze({
  rendererReady: () => ipcRenderer.invoke("kingdom:renderer-ready") as Promise<void>,
  getItemSprite: (id: string) => ipcRenderer.invoke("kingdom:get-item-sprite", id),
  getAppInfo: () => ipcRenderer.invoke("kingdom:get-app-info") as Promise<DesktopAppInfo>,
  getUpdateState: () => ipcRenderer.invoke("kingdom:get-update-state") as Promise<DesktopUpdateState>,
  checkForUpdates: () => ipcRenderer.invoke("kingdom:check-for-updates") as Promise<DesktopUpdateState>,
  downloadUpdate: () => ipcRenderer.invoke("kingdom:download-update") as Promise<DesktopUpdateState>,
  restartAndUpdate: () => ipcRenderer.invoke("kingdom:restart-and-update") as Promise<DesktopUpdateState>,
  getRuntimeState: () => ipcRenderer.invoke("kingdom:get-runtime") as Promise<DesktopRuntimeState>,
  chooseInstance: () => ipcRenderer.invoke("kingdom:choose-instance") as Promise<DesktopRuntimeState>,
  refresh: () => ipcRenderer.invoke("kingdom:get-runtime") as Promise<DesktopRuntimeState>,
  clearLocalCache: () => ipcRenderer.invoke("kingdom:clear-cache") as Promise<void>,
  onUpdateState: (callback: (state: DesktopUpdateState) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, state: DesktopUpdateState) => callback(state);
    ipcRenderer.on("kingdom:update-state", listener);
    return () => ipcRenderer.removeListener("kingdom:update-state", listener);
  },
  onRuntimeChanged: (callback: (state: DesktopRuntimeState) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, state: DesktopRuntimeState) => callback(state);
    ipcRenderer.on("kingdom:runtime-changed", listener);
    return () => ipcRenderer.removeListener("kingdom:runtime-changed", listener);
  },
});

contextBridge.exposeInMainWorld("kingdomDesktop", api);
