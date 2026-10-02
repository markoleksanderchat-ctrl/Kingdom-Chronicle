import { createHash } from "node:crypto";
import { lstat, open } from "node:fs/promises";

export async function verifyInstaller(filePath: string, expectedSize: number, expectedSha256: string) {
  const info = await lstat(filePath);
  if (!info.isFile() || info.isSymbolicLink() || info.size !== expectedSize) return false;
  const file = await open(filePath, "r");
  try {
    const hash = createHash("sha256");
    const buffer = Buffer.allocUnsafe(1024 * 1024);
    let position = 0;
    while (position < info.size) {
      const { bytesRead } = await file.read(buffer, 0, Math.min(buffer.length, info.size - position), position);
      if (bytesRead === 0) break;
      hash.update(buffer.subarray(0, bytesRead));
      position += bytesRead;
    }
    const after = await lstat(filePath);
    return after.isFile() && !after.isSymbolicLink() && after.size === info.size && after.mtimeMs === info.mtimeMs
      && position === info.size && hash.digest("hex") === expectedSha256;
  } finally {
    await file.close();
  }
}
