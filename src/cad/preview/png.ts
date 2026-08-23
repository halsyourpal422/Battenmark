import { deflateSync } from "node:zlib";

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function u32(n: number): Uint8Array {
  return Uint8Array.of((n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff);
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = Uint8Array.from(type, (ch) => ch.charCodeAt(0));
  const payload = new Uint8Array(typeBytes.length + data.length);
  payload.set(typeBytes, 0);
  payload.set(data, typeBytes.length);
  const crc = crc32(payload);
  const out = new Uint8Array(4 + payload.length + 4);
  out.set(u32(data.length), 0);
  out.set(payload, 4);
  out.set(u32(crc), 4 + payload.length);
  return out;
}

/** Encode an RGBA buffer as a PNG. Filter 0, 8-bit, non-interlaced. */
export function encodePng(width: number, height: number, rgba: Uint8Array): Buffer {
  if (rgba.length !== width * height * 4) {
    throw new Error(`RGBA length ${rgba.length} does not match ${width}×${height}`);
  }
  const row = width * 4;
  const filtered = Buffer.alloc((row + 1) * height);
  for (let y = 0; y < height; y++) {
    const dest = y * (row + 1);
    filtered[dest] = 0;
    filtered.set(rgba.subarray(y * row, y * row + row), dest + 1);
  }
  const ihdr = new Uint8Array(13);
  ihdr.set(u32(width), 0);
  ihdr.set(u32(height), 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const idat = deflateSync(filtered, { level: 9 });
  const signature = Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10);
  const parts = [signature, chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", new Uint8Array(0))];
  return Buffer.concat(parts);
}

export function readPngSize(buf: Buffer): { width: number; height: number } | null {
  if (buf.length < 24) return null;
  if (buf[0] !== 137 || buf[1] !== 80 || buf[2] !== 78 || buf[3] !== 71) return null;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

export function isPng(buf: Buffer): boolean {
  return buf.length >= 8 && buf[0] === 137 && buf[1] === 80 && buf[2] === 78 && buf[3] === 71;
}

export function pngHasIdat(buf: Buffer): boolean {
  let i = 8;
  while (i + 8 <= buf.length) {
    const len = buf.readUInt32BE(i);
    const type = buf.toString("ascii", i + 4, i + 8);
    if (type === "IDAT") return true;
    if (type === "IEND") break;
    i += 12 + len;
  }
  return false;
}
