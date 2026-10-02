export interface DesktopWindowLike {
  isDestroyed(): boolean;
  isMinimized?(): boolean;
  restore?(): void;
  show(): void;
  focus?(): void;
  webContents: { id: number; mainFrame: unknown; send(channel: string, payload: unknown): void };
}

export interface TrustedEventLike {
  sender: { id: number };
  senderFrame: unknown;
}

export function assertTrustedSender(window: DesktopWindowLike | null, event: TrustedEventLike) {
  if (!window || window.isDestroyed() || event.sender.id !== window.webContents.id
    || event.senderFrame !== window.webContents.mainFrame) {
    throw new Error("Rejected an untrusted desktop request.");
  }
}

export function sendToActiveWindow(window: DesktopWindowLike | null, channel: string, payload: unknown) {
  if (!window || window.isDestroyed()) return false;
  window.webContents.send(channel, payload);
  return true;
}
