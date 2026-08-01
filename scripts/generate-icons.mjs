// Generates the approved two-Adulto/Casa mark as standard and maskable PNGs.
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, "..", "public");

const CREAM = [252, 250, 246, 255];
const SOFT_CREAM = [238, 230, 219, 255];
const OLIVE = [78, 93, 50, 255];
const OLIVE_STRONG = [63, 77, 42, 255];
const TERRACOTTA = [216, 139, 99, 255];

function crc32(buf) {
  let c;
  const table = crc32.table ?? (crc32.table = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      c = n;
      for (let k = 0; k < 8; k++) {
        c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      }
      t[n] = c;
    }
    return t;
  })());
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, "ascii");
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function inTriangle(px, py, [ax, ay], [bx, by], [cx, cy]) {
  const d1 = (px - bx) * (ay - by) - (ax - bx) * (py - by);
  const d2 = (px - cx) * (by - cy) - (bx - cx) * (py - cy);
  const d3 = (px - ax) * (cy - ay) - (cx - ax) * (py - ay);
  const hasNegative = d1 < 0 || d2 < 0 || d3 < 0;
  const hasPositive = d1 > 0 || d2 > 0 || d3 > 0;
  return !(hasNegative && hasPositive);
}

function pixelAt(x, y, size, maskable) {
  const safeScale = maskable ? 0.72 : 0.82;
  const nx = (x / size - 0.5) * (64 / safeScale) + 32;
  const ny = (y / size - 0.5) * (64 / safeScale) + 32;

  const circle = (cx, cy, radius) => (nx - cx) ** 2 + (ny - cy) ** 2 <= radius ** 2;
  const rectangle = (left, top, right, bottom) =>
    nx >= left && nx <= right && ny >= top && ny <= bottom;

  if (circle(18, 13, 6)) return OLIVE;
  if (circle(46, 13, 6)) return TERRACOTTA;
  if (inTriangle(nx, ny, [7, 35], [27, 19], [32, 23])) return OLIVE;
  if (inTriangle(nx, ny, [57, 35], [37, 19], [32, 23])) return TERRACOTTA;
  if (rectangle(14, 34, 50, 59)) {
    if (rectangle(14, 34, 16, 59) || rectangle(48, 34, 50, 59) || rectangle(14, 57, 50, 59)) {
      return OLIVE_STRONG;
    }
    if (rectangle(28, 44, 36, 59)) return OLIVE;
    if (rectangle(20, 41, 25, 46) || rectangle(39, 41, 44, 46)) return CREAM;
    return SOFT_CREAM;
  }
  return CREAM;
}

export function generatePng(size, { maskable = false } = {}) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  let offset = 0;
  for (let y = 0; y < size; y++) {
    raw[offset++] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixelAt(x, y, size, maskable);
      raw[offset++] = r;
      raw[offset++] = g;
      raw[offset++] = b;
      raw[offset++] = a;
    }
  }

  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const idat = deflateSync(raw);

  return Buffer.concat([
    signature,
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function main() {
  mkdirSync(publicDir, { recursive: true });
  const sizes = [
    ["icon-192.png", 192, false],
    ["icon-512.png", 512, false],
    ["icon-maskable-192.png", 192, true],
    ["icon-maskable-512.png", 512, true],
    ["apple-touch-icon.png", 180, false],
  ];
  for (const [name, size, maskable] of sizes) {
    writeFileSync(join(publicDir, name), generatePng(size, { maskable }));
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
