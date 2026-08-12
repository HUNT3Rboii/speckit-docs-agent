/**
 * Draws resources/speckit.png, the extension's Marketplace and Extensions-view
 * logo.
 *
 * A generator rather than a checked-in binary nobody can edit: the glyph is the
 * same document-with-a-fold as resources/speckit.svg, so the Activity Bar icon
 * and the logo cannot drift apart. Rendered here rather than by a build
 * dependency because the whole job is a rounded rectangle, three line segments
 * and zlib - all of which Node already has.
 *
 *   node scripts/make-icon.mjs
 */

import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SIZE = 128;
/** Samples per axis. The glyph is all curves and diagonals; without this they stair-step. */
const SUPERSAMPLE = 4;

const BACKGROUND = [0x24, 0x2b, 0x54];
const GLYPH = [0xf5, 0xf7, 0xff];

// The glyph, in the 24x24 units resources/speckit.svg is drawn in, scaled up.
const UNIT = SIZE / 24;
const STROKE = 1.7 * UNIT;

const doc = { x0: 4.75 * UNIT, y0: 2.75 * UNIT, x1: 19.25 * UNIT, y1: 21.25 * UNIT, radius: 2.25 * UNIT };
// The folded corner: everything above this diagonal is cut away from the page.
const fold = { a: { x: 14 * UNIT, y: 2.75 * UNIT }, b: { x: 19.25 * UNIT, y: 8 * UNIT } };
const rules = [
  { a: { x: 8.25 * UNIT, y: 12.5 * UNIT }, b: { x: 15.75 * UNIT, y: 12.5 * UNIT } },
  { a: { x: 8.25 * UNIT, y: 16 * UNIT }, b: { x: 13 * UNIT, y: 16 * UNIT } },
];

/** Distance from a point to a line segment - every stroke is drawn from this. */
function distanceToSegment(px, py, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((px - a.x) * dx + (py - a.y) * dy) / lengthSquared));
  return Math.hypot(px - (a.x + t * dx), py - (a.y + t * dy));
}

/** Signed distance to a rounded rectangle's outline: negative inside. */
function distanceToRoundedRect(px, py, rect) {
  const cx = (rect.x0 + rect.x1) / 2;
  const cy = (rect.y0 + rect.y1) / 2;
  const halfWidth = (rect.x1 - rect.x0) / 2 - rect.radius;
  const halfHeight = (rect.y1 - rect.y0) / 2 - rect.radius;
  const qx = Math.max(Math.abs(px - cx) - halfWidth, 0);
  const qy = Math.max(Math.abs(py - cy) - halfHeight, 0);
  const outside = Math.hypot(qx, qy);
  const inside = Math.min(Math.max(Math.abs(px - cx) - halfWidth, Math.abs(py - cy) - halfHeight), 0);
  return outside + inside - rect.radius;
}

/** True where the sample lands on the drawn glyph. */
function isGlyph(px, py) {
  const half = STROKE / 2;

  // The page outline, minus the corner the fold cuts away.
  const cutAway = px - py > fold.a.x - fold.a.y;
  if (!cutAway && Math.abs(distanceToRoundedRect(px, py, doc)) <= half) {
    return true;
  }

  // The fold itself: the diagonal, and the two edges of the turned-back corner.
  const foldStrokes = [
    { a: fold.a, b: fold.b },
    { a: fold.a, b: { x: fold.a.x, y: fold.b.y } },
    { a: { x: fold.a.x, y: fold.b.y }, b: fold.b },
  ];
  for (const stroke of [...foldStrokes, ...rules]) {
    if (distanceToSegment(px, py, stroke.a, stroke.b) <= half) {
      return true;
    }
  }

  return false;
}

/** The rounded square the glyph sits on, so the logo reads as a tile at 32px. */
function isBackground(px, py) {
  return distanceToRoundedRect(px, py, { x0: 0, y0: 0, x1: SIZE, y1: SIZE, radius: 26 }) <= 0;
}

function render() {
  // One extra byte per row: PNG prefixes each scanline with its filter type.
  const raw = Buffer.alloc(SIZE * (SIZE * 4 + 1));

  for (let y = 0; y < SIZE; y++) {
    const rowStart = y * (SIZE * 4 + 1);
    raw[rowStart] = 0;

    for (let x = 0; x < SIZE; x++) {
      let glyphHits = 0;
      let backgroundHits = 0;

      for (let sy = 0; sy < SUPERSAMPLE; sy++) {
        for (let sx = 0; sx < SUPERSAMPLE; sx++) {
          const px = x + (sx + 0.5) / SUPERSAMPLE;
          const py = y + (sy + 0.5) / SUPERSAMPLE;
          if (isBackground(px, py)) {
            backgroundHits++;
            if (isGlyph(px, py)) {
              glyphHits++;
            }
          }
        }
      }

      const samples = SUPERSAMPLE * SUPERSAMPLE;
      const coverage = backgroundHits / samples;
      const glyph = glyphHits / samples;
      const offset = rowStart + 1 + x * 4;

      for (let channel = 0; channel < 3; channel++) {
        // Composite the glyph over the tile, then the tile over transparency.
        const mixed = BACKGROUND[channel] * (1 - glyph) + GLYPH[channel] * glyph;
        raw[offset + channel] = Math.round(mixed);
      }
      raw[offset + 3] = Math.round(coverage * 255);
    }
  }

  return raw;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  return c >>> 0;
});

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) {
    c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

const header = Buffer.alloc(13);
header.writeUInt32BE(SIZE, 0);
header.writeUInt32BE(SIZE, 4);
header[8] = 8; // bit depth
header[9] = 6; // RGBA
header[10] = 0;
header[11] = 0;
header[12] = 0;

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', header),
  chunk('IDAT', deflateSync(render(), { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);

const target = join(dirname(dirname(fileURLToPath(import.meta.url))), 'resources', 'speckit.png');
mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, png);
console.log(`wrote ${target} (${png.length} bytes)`);
