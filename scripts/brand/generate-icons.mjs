#!/usr/bin/env node
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
/**
 * Render the brand mark to the raster icons the browser and PWA need.
 *
 *   node scripts/brand/generate-icons.mjs
 *
 * The mark is simple geometry - a rounded plate and a ring split into four
 * quadrants - so it is drawn analytically here rather than by rasterising the
 * SVG. That keeps this runnable with no image library and no system tool, on
 * any machine, which the rsvg-convert version was not.
 *
 * Keep the constants below in step with apps/web/public/joydigi-mark.svg.
 */
import { deflateSync } from "node:zlib";

const PUBLIC_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "apps",
  "web",
  "public",
);

// Geometry in the SVG's 1024x1024 user space.
const VIEW = 1024;
const CORNER = 232;
const CENTRE = 512;
const R_OUTER = 420;
const R_INNER = 150;
const PLATE = [0xec, 0xf0, 0xee];
const QUADRANTS = {
  tr: [0xd0, 0x40, 0x2f],
  br: [0xf5, 0xa6, 0x23],
  bl: [0x12, 0xa0, 0x7d],
  tl: [0x6c, 0x3b, 0xf5],
};

/** Inside the rounded square? Corners are quarter circles of radius CORNER. */
function insidePlate(x, y) {
  if (x < 0 || y < 0 || x > VIEW || y > VIEW) return false;
  const cx = x < CORNER ? CORNER : x > VIEW - CORNER ? VIEW - CORNER : x;
  const cy = y < CORNER ? CORNER : y > VIEW - CORNER ? VIEW - CORNER : y;
  if (cx === x || cy === y) return true;
  return (x - cx) ** 2 + (y - cy) ** 2 <= CORNER ** 2;
}

/** Colour of a single sample, or null where the icon is transparent. */
function sample(x, y) {
  if (!insidePlate(x, y)) return null;
  const dx = x - CENTRE;
  const dy = y - CENTRE;
  const d2 = dx * dx + dy * dy;
  if (d2 < R_INNER ** 2 || d2 > R_OUTER ** 2) return PLATE;
  // SVG y grows downward, so negative dy is the top half.
  if (dy < 0) return dx >= 0 ? QUADRANTS.tr : QUADRANTS.tl;
  return dx >= 0 ? QUADRANTS.br : QUADRANTS.bl;
}

/** RGBA pixels at `size`, 4x4 supersampled so the curves are not jagged. */
function render(size) {
  const SS = 4;
  const scale = VIEW / size;
  const out = Buffer.alloc(size * size * 4);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let hits = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const colour = sample(
            (px + (sx + 0.5) / SS) * scale,
            (py + (sy + 0.5) / SS) * scale,
          );
          if (!colour) continue;
          r += colour[0];
          g += colour[1];
          b += colour[2];
          hits++;
        }
      }
      const i = (py * size + px) * 4;
      const total = SS * SS;
      if (hits === 0) continue; // transparent
      // Average the covered samples for colour, and use coverage as alpha so
      // the rounded corners fade out instead of stair-stepping.
      out[i] = Math.round(r / hits);
      out[i + 1] = Math.round(g / hits);
      out[i + 2] = Math.round(b / hits);
      out[i + 3] = Math.round((hits / total) * 255);
    }
  }
  return out;
}

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = -1;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/** Minimal 8-bit RGBA PNG. Filter type 0 on every scanline. */
function encodePng(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** ICO carrying PNG payloads, which every browser in use understands. */
function encodeIco(entries) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(entries.length, 4);
  const dir = Buffer.alloc(16 * entries.length);
  let offset = header.length + dir.length;
  entries.forEach(({ size, png }, i) => {
    const at = i * 16;
    dir[at] = size >= 256 ? 0 : size;
    dir[at + 1] = size >= 256 ? 0 : size;
    dir[at + 2] = 0; // palette
    dir[at + 3] = 0; // reserved
    dir.writeUInt16LE(1, at + 4); // colour planes
    dir.writeUInt16LE(32, at + 6); // bits per pixel
    dir.writeUInt32BE(0, at + 8);
    dir.writeUInt32LE(png.length, at + 8);
    dir.writeUInt32LE(offset, at + 12);
    offset += png.length;
  });
  return Buffer.concat([header, dir, ...entries.map((e) => e.png)]);
}

const targets = [
  [96, "favicon-96x96.png"],
  [180, "apple-touch-icon.png"],
  [192, "web-app-manifest-192x192.png"],
  [512, "web-app-manifest-512x512.png"],
];

for (const [size, name] of targets) {
  const png = encodePng(size, render(size));
  writeFileSync(join(PUBLIC_DIR, name), png);
  console.log(`  ${name} (${size}x${size}, ${png.length} bytes)`);
}

const ico = encodeIco(
  [16, 32, 48].map((size) => ({ size, png: encodePng(size, render(size)) })),
);
writeFileSync(join(PUBLIC_DIR, "favicon.ico"), ico);
console.log(`  favicon.ico (16/32/48, ${ico.length} bytes)`);
