import type { DesktopWindowLike } from "./window-state";

interface AppLifecycleLike {
  on(event: "second-instance" | "before-quit" | "activate" | "window-all-closed", listener: () => void): void;
  quit(): void;
}

export function registerApplicationLifecycle(app: AppLifecycleLike, options: {
  getMainWindow: () => DesktopWindowLike | null;
  getWindowCount: () => number;
  createWindow: () => Promise<unknown> | unknown;
  shutdown: () => void;
  platform?: NodeJS.Platform;
}) {
  app.on("second-instance", () => {
    const window = options.getMainWindow();
    if (!window || window.isDestroyed()) return;
    if (window.isMinimized?.()) window.restore?.();
    window.show();
    window.focus?.();
  });
  app.on("before-quit", options.shutdown);
  app.on("activate", () => { if (options.getWindowCount() === 0) void options.createWindow(); });
  app.on("window-all-closed", () => { if ((options.platform ?? process.platform) !== "darwin") app.quit(); });
}
