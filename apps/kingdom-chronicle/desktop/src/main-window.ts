import { BrowserWindow, type BrowserWindowConstructorOptions } from "electron";
import { existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;",
})[character]!);
const errorMessage = (error: unknown) => error instanceof Error ? error.message : String(error);

export function mainWindowOptions(executableDirectory: string, appPath: string, preloadPath: string): BrowserWindowConstructorOptions {
  const installedIcon = path.join(executableDirectory, "kingdom-chronicle.ico");
  return {
    width: 1380, height: 900, minWidth: 760, minHeight: 640, show: false,
    backgroundColor: "#eee9df", title: "Kingdom Chronicle",
    icon: existsSync(installedIcon) ? installedIcon : path.join(appPath, "assets", "kingdom-chronicle.ico"),
    webPreferences: { preload: preloadPath, contextIsolation: true, nodeIntegration: false, sandbox: true },
  };
}

export async function createMainWindow(options: {
  executableDirectory: string;
  appPath: string;
  preloadPath: string;
  developmentUrl?: string;
  rendererName: string;
  trace?: (message: string) => void;
  onCreated?: (window: BrowserWindow) => void;
  onConsole?: (message: string) => void;
}) {
  const trace = options.trace ?? (() => undefined);
  const window = new BrowserWindow(mainWindowOptions(options.executableDirectory, options.appPath, options.preloadPath));
  options.onCreated?.(window);
  window.webContents.on("console-message", (_event, level, message) => {
    if (level >= 2) options.onConsole?.(`Renderer ${level}: ${message}`);
  });
  window.once("ready-to-show", () => window.show());
  const showFallback = setTimeout(() => { if (!window.isDestroyed()) window.show(); }, 1_500);
  window.once("show", () => clearTimeout(showFallback));
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event, url) => {
    if (url !== window.webContents.getURL()) event.preventDefault();
  });
  try {
    trace("loading renderer");
    const rendererUrl = options.developmentUrl ?? pathToFileURL(path.join(
      __dirname, `../renderer/${options.rendererName}/index.html`,
    )).href;
    await window.loadURL(rendererUrl);
    trace("renderer loaded");
  } catch (error) {
    const detail = escapeHtml(errorMessage(error));
    const fallback = `<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><title>Kingdom Chronicle</title><style>body{font:16px system-ui;padding:40px;background:#eee9df;color:#29251f}main{max-width:720px;margin:auto}h1{font-family:Georgia,serif}code{display:block;padding:16px;background:#fff;border:1px solid #c8bda9;white-space:pre-wrap}</style><main><h1>Kingdom Chronicle could not open</h1><p>The desktop shell started, but its dashboard could not be loaded.</p><code>${detail}</code></main>`;
    await window.loadURL(`data:text/html,${encodeURIComponent(fallback)}`);
    window.show();
  }
  return window;
}
