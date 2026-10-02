import { open, rm } from "node:fs/promises";
import type { DesktopAvailableUpdate, DesktopUpdateProgress } from "./types";
import { MAX_INSTALLER_BYTES } from "./update-policy";

export type FetchInstaller = (url: string, init: RequestInit) => Promise<Response>;
export type ReportProgress = (progress: DesktopUpdateProgress) => void;

export async function downloadInstallerFile(update: DesktopAvailableUpdate, destination: string,
                                            fetchInstaller: FetchInstaller, reportProgress: ReportProgress,
                                            timeoutMilliseconds = 10 * 60_000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMilliseconds);
  try {
    const response = await fetchInstaller(update.downloadUrl, {
      method: "GET", cache: "no-store", redirect: "error", signal: controller.signal,
      headers: { accept: "application/vnd.microsoft.portable-executable" },
    });
    if (!response.ok) throw new Error(`The update download returned status ${response.status}.`);
    if (Number(response.headers.get("content-length")) !== update.sizeBytes) {
      throw new Error("The downloaded update size did not match the release manifest.");
    }
    if (!response.body) throw new Error("The update download was empty.");
    const file = await open(destination, "wx");
    const reader = response.body.getReader();
    let received = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        received += value.byteLength;
        if (received > update.sizeBytes || received > MAX_INSTALLER_BYTES) {
          throw new Error("The update download exceeded its declared size.");
        }
        let written = 0;
        while (written < value.byteLength) {
          const result = await file.write(value, written, value.byteLength - written);
          if (result.bytesWritten === 0) throw new Error("The update could not be saved to disk.");
          written += result.bytesWritten;
        }
        reportProgress({ stage: "downloading", receivedBytes: received, totalBytes: update.sizeBytes });
      }
    } finally {
      await reader.cancel().catch(() => undefined);
      await file.close();
    }
    if (received !== update.sizeBytes) throw new Error("The downloaded update size did not match the release manifest.");
    return received;
  } catch (error) {
    await rm(destination, { force: true });
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
