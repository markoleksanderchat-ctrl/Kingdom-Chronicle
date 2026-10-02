import { deflateSync, inflateSync } from "node:zlib";

const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
function chunk(type: string, data: Buffer) {
  const result = Buffer.alloc(data.length + 12);
  result.writeUInt32BE(data.length); result.write(type, 4); data.copy(result, 8);
  let crc = 0xffffffff;
  for (const byte of result.subarray(4, -4)) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  result.writeUInt32BE((crc ^ 0xffffffff) >>> 0, result.length - 4);
  return result;
}

// Minecraft's vertical animation strips can show their first frame without a game renderer.
export function firstTextureFrame(bytes: Buffer): Buffer | null {
  if (bytes.length < 33 || !bytes.subarray(0, 8).equals(signature) || bytes.toString("ascii", 12, 16) !== "IHDR") return null;
  const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20);
  if (!width || !height || width > 512 || height > 16384) return null;
  if (width === height) return bytes;
  if (height < width || height % width || bytes[28] !== 0) return null;
  const channels = ({ 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 } as Record<number, number>)[bytes[25]];
  const depth = bytes[24];
  if (!channels || ![1, 2, 4, 8, 16].includes(depth)) return null;
  const scanline = 1 + Math.ceil(width * channels * depth / 8);
  const compressed: Buffer[] = [], palette: Buffer[] = [];
  for (let offset = 8; offset + 12 <= bytes.length;) {
    const size = bytes.readUInt32BE(offset), end = offset + 12 + size;
    if (end > bytes.length) return null;
    const type = bytes.toString("ascii", offset + 4, offset + 8);
    if (type === "IDAT") compressed.push(bytes.subarray(offset + 8, end - 4));
    if (type === "PLTE" || type === "tRNS") palette.push(bytes.subarray(offset, end));
    offset = end;
  }
  if (!compressed.length || scanline * height > 16 * 1024 * 1024) return null;
  try {
    const pixels = inflateSync(Buffer.concat(compressed), { maxOutputLength: scanline * height });
    if (pixels.length !== scanline * height) return null;
    const header = Buffer.from(bytes.subarray(16, 29)); header.writeUInt32BE(width, 4);
    return Buffer.concat([signature, chunk("IHDR", header), ...palette, chunk("IDAT", deflateSync(pixels.subarray(0, scanline * width))), chunk("IEND", Buffer.alloc(0))]);
  } catch { return null; }
}
