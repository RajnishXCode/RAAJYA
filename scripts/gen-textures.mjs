/**
 * RAAJYA texture generator (dependency-free).
 *
 * Produces original, coherent Minecraft-style pixel art as real PNG files:
 *   - pack icons (BP + RP)
 *   - Commander Stone item icon (16x16)
 *   - Royal Soldier Spawner block face (16x16)
 *   - Royal Guard entity skin (64x64, standard humanoid UV layout)
 *
 * Run once with: node scripts/gen-textures.mjs
 * The generated PNGs are committed as source assets (they are not build
 * artifacts); this script exists so they are reproducible/editable.
 */

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// ---------------------------------------------------------------------------
// Minimal PNG encoder (RGBA, 8-bit, filter 0)
// ---------------------------------------------------------------------------
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBuf = Buffer.from(type, "ascii");
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function encodePNG(width, height, rgba) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  const raw = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    const row = y * (1 + width * 4);
    raw[row] = 0; // filter: none
    for (let x = 0; x < width; x++) {
      const src = (y * width + x) * 4;
      const dst = row + 1 + x * 4;
      raw[dst] = rgba[src];
      raw[dst + 1] = rgba[src + 1];
      raw[dst + 2] = rgba[src + 2];
      raw[dst + 3] = rgba[src + 3];
    }
  }
  return Buffer.concat([
    signature,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

class Canvas {
  constructor(width, height, fill = [0, 0, 0, 0]) {
    this.w = width;
    this.h = height;
    this.data = new Uint8Array(width * height * 4);
    if (fill[3] > 0) this.rect(0, 0, width, height, fill);
  }
  set(x, y, color) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const [r, g, b, a = 255] = color;
    const i = (y * this.w + x) * 4;
    this.data[i] = r;
    this.data[i + 1] = g;
    this.data[i + 2] = b;
    this.data[i + 3] = a;
  }
  rect(x, y, w, h, color) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, color);
  }
  frame(x, y, w, h, t, color) {
    this.rect(x, y, w, t, color);
    this.rect(x, y + h - t, w, t, color);
    this.rect(x, y, t, h, color);
    this.rect(x + w - t, y, t, h, color);
  }
  save(file) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, encodePNG(this.w, this.h, this.data));
    console.log(`  wrote ${path.relative(ROOT, file)} (${this.w}x${this.h})`);
  }
}

// ---------------------------------------------------------------------------
// Royal/fantasy palette
// ---------------------------------------------------------------------------
const P = {
  navy: [24, 38, 84, 255],
  blue: [37, 78, 158, 255],
  blueLight: [78, 132, 214, 255],
  blueDark: [26, 52, 112, 255],
  gold: [212, 175, 55, 255],
  goldLight: [247, 224, 132, 255],
  goldDark: [150, 116, 30, 255],
  skin: [224, 178, 126, 255],
  skinDark: [188, 142, 94, 255],
  white: [244, 246, 252, 255],
  black: [18, 22, 38, 255],
  dark: [16, 20, 36, 255],
  stone: [58, 62, 82, 255],
  stoneDark: [40, 44, 62, 255],
  emerald: [46, 168, 118, 255],
  transparent: [0, 0, 0, 0],
};

// ---------------------------------------------------------------------------
// Pack icon: gold crown on a deep-blue field with a gold border.
// ---------------------------------------------------------------------------
function drawPackIcon(size) {
  const c = new Canvas(size, size, P.navy);
  const s = size / 64; // design in a 64x64 grid, scaled up
  const px = (n) => Math.round(n * s);
  const R = (x, y, w, h, col) => c.rect(px(x), px(y), Math.max(1, px(w)), Math.max(1, px(h)), col);

  // Outer gold frame + inner navy inset.
  c.frame(0, 0, size, size, Math.max(2, px(2)), P.gold);
  c.frame(px(4), px(4), size - px(8), size - px(8), Math.max(1, px(1)), P.goldDark);

  // Crown: base band + three/five points with gems.
  R(14, 38, 36, 9, P.gold);          // crown band
  R(14, 36, 36, 2, P.goldLight);     // band highlight
  R(12, 44, 40, 4, P.goldDark);      // band shadow
  // Points
  R(14, 22, 7, 16, P.gold);
  R(28, 16, 8, 22, P.gold);
  R(43, 22, 7, 16, P.gold);
  R(14, 20, 7, 3, P.goldLight);
  R(28, 14, 8, 3, P.goldLight);
  R(43, 20, 7, 3, P.goldLight);
  // Point caps
  R(16, 18, 3, 3, P.goldLight);
  R(30, 12, 4, 3, P.goldLight);
  R(45, 18, 3, 3, P.goldLight);
  // Gems on the band
  R(18, 40, 4, 4, P.emerald);
  R(30, 40, 4, 4, P.blueLight);
  R(42, 40, 4, 4, P.emerald);
  // Small "R" monogram below the crown
  R(26, 50, 3, 8, P.gold);
  R(29, 50, 6, 2, P.gold);
  R(33, 52, 3, 3, P.gold);
  R(29, 55, 5, 2, P.gold);
  R(33, 56, 3, 2, P.gold);
  return c;
}

// ---------------------------------------------------------------------------
// Commander Stone: a gold-framed royal gem (16x16, transparent corners).
// ---------------------------------------------------------------------------
function drawCommanderStone() {
  const c = new Canvas(16, 16, P.transparent);

  // Octagonal gold rim (clip the four corners for a gem silhouette).
  for (let y = 1; y <= 14; y++) {
    for (let x = 2; x <= 13; x++) {
      const corner = (x <= 3 && y <= 2) || (x >= 12 && y <= 2) || (x <= 3 && y >= 13) || (x >= 12 && y >= 13);
      if (corner) continue;
      c.set(x, y, P.gold);
    }
  }
  // Blue gem field.
  for (let y = 3; y <= 12; y++) {
    for (let x = 4; x <= 11; x++) {
      const corner = (x <= 4 && y <= 3) || (x >= 11 && y <= 3) || (x <= 4 && y >= 12) || (x >= 11 && y >= 12);
      if (corner) continue;
      c.set(x, y, P.blue);
    }
  }
  // Faceted inner diamond (lighter).
  for (let y = 4; y <= 11; y++) {
    for (let x = 5; x <= 10; x++) {
      const d = Math.abs(x - 7.5) + Math.abs(y - 7.5);
      if (d <= 4) c.set(x, y, P.blueLight);
    }
  }
  // Central gold crown glyph + sparkle.
  c.set(7, 5, P.goldLight);
  c.rect(6, 6, 5, 1, P.goldLight);
  c.rect(6, 7, 1, 2, P.goldLight);
  c.set(8, 7, P.goldLight);
  c.set(10, 7, P.goldLight);
  c.rect(6, 9, 5, 1, P.goldLight);
  c.set(11, 4, P.white);
  c.set(12, 5, P.white);
  // Highlight along top edge.
  c.rect(5, 2, 6, 1, P.goldLight);
  return c;
}

// ---------------------------------------------------------------------------
// Royal Soldier Spawner: dark stone, gold frame, crown-with-emerald emblem.
// ---------------------------------------------------------------------------
function drawSpawner() {
  const c = new Canvas(16, 16, P.stoneDark);

  // Mottled stone base.
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      if ((x * 7 + y * 13) % 11 < 4) c.set(x, y, P.stone);
    }
  }
  // Gold frame.
  c.frame(0, 0, 16, 16, 1, P.gold);
  c.frame(1, 1, 14, 14, 1, P.goldDark);
  // Inner royal-blue field.
  c.rect(2, 2, 12, 12, P.navy);
  c.frame(3, 3, 10, 10, 1, P.blueDark);
  // Crown emblem.
  c.rect(5, 9, 6, 2, P.gold);        // band
  c.rect(5, 6, 2, 3, P.gold);        // left point
  c.rect(7, 5, 2, 4, P.gold);        // middle point
  c.rect(9, 6, 2, 3, P.gold);        // right point
  c.set(7, 4, P.goldLight);
  c.set(5, 5, P.goldLight);
  c.set(10, 5, P.goldLight);
  // Emerald gem in the band.
  c.set(7, 9, P.emerald);
  c.set(8, 9, P.emerald);
  c.set(7, 10, P.emerald);
  c.set(8, 10, P.emerald);
  // Corner rivets.
  c.set(2, 2, P.goldLight);
  c.set(13, 2, P.goldLight);
  c.set(2, 13, P.goldLight);
  c.set(13, 13, P.goldLight);
  return c;
}

// ---------------------------------------------------------------------------
// Royal Guard skin (64x64). Fill the WHOLE sheet with valid opaque pixels so
// no UV region can ever sample a missing/transparent colour; then paint the
// standard Steve-layout regions with a coherent blue+gold uniform.
// ---------------------------------------------------------------------------
function drawRoyalGuard() {
  const c = new Canvas(64, 64, P.blue); // fully opaque base everywhere

  // Gold micro-trim grid so every region reads as "royal uniform".
  for (let y = 0; y < 64; y += 8) {
    for (let x = 0; x < 64; x++) {
      c.set(x, y, P.blueDark);
    }
  }

  // ---- HEAD (0,0)-(32,16) : skin face + gold helmet ----
  c.rect(0, 0, 32, 8, P.gold);          // helmet dome (top half)
  c.rect(0, 8, 32, 8, P.skin);          // face (bottom half)
  // Helmet shading / crest on top.
  c.rect(8, 0, 16, 2, P.goldLight);
  c.rect(0, 6, 32, 2, P.goldDark);      // helmet rim
  c.rect(14, 2, 4, 4, P.goldLight);     // crest
  // Front face is at (8,8)-(16,16): eyes, brows, mouth.
  c.rect(9, 10, 2, 2, P.white);         // eye whites
  c.rect(13, 10, 2, 2, P.white);
  c.set(10, 11, P.black);               // pupils
  c.set(14, 11, P.black);
  c.rect(9, 9, 2, 1, P.skinDark);       // brows
  c.rect(13, 9, 2, 1, P.skinDark);
  c.rect(11, 13, 2, 1, P.skinDark);     // mouth
  // Cheeks shading on side faces.
  c.rect(0, 12, 8, 4, P.skinDark);
  c.rect(16, 12, 16, 4, P.skinDark);

  // ---- BODY (16,16)-(40,32) : tunic + gold belt ----
  c.rect(16, 16, 24, 16, P.blue);
  c.rect(20, 20, 8, 12, P.blueLight);   // front panel
  c.rect(16, 24, 24, 2, P.gold);        // belt
  c.rect(20, 20, 8, 2, P.goldLight);    // collar
  c.rect(23, 20, 2, 12, P.gold);        // center placket
  c.set(23, 24, P.goldLight);
  c.set(24, 24, P.goldLight);

  // ---- RIGHT ARM (40,16)-(56,32) : sleeve + gold cuff ----
  c.rect(40, 16, 16, 16, P.blue);
  c.rect(40, 28, 16, 4, P.gold);        // cuff
  c.rect(40, 27, 16, 1, P.goldDark);
  c.rect(44, 18, 8, 8, P.blueLight);    // shoulder plate

  // ---- RIGHT LEG (0,16)-(16,32) : trousers + boot ----
  c.rect(0, 16, 16, 16, P.navy);
  c.rect(0, 28, 16, 4, P.goldDark);     // boot
  c.rect(0, 27, 16, 1, P.gold);

  // ---- LEFT LEG (16,48)-(32,64) ----
  c.rect(16, 48, 16, 16, P.navy);
  c.rect(16, 60, 16, 4, P.goldDark);
  c.rect(16, 59, 16, 1, P.gold);

  // ---- LEFT ARM (32,48)-(48,64) ----
  c.rect(32, 48, 16, 16, P.blue);
  c.rect(32, 60, 16, 4, P.gold);
  c.rect(32, 59, 16, 1, P.goldDark);
  c.rect(36, 50, 8, 8, P.blueLight);

  return c;
}

// ---------------------------------------------------------------------------
console.log("Generating RAAJYA textures...");
const bpIcon = path.join(ROOT, "behavior_pack", "pack_icon.png");
const rpIcon = path.join(ROOT, "resource_pack", "pack_icon.png");
const icon = drawPackIcon(128);
icon.save(bpIcon);
icon.save(rpIcon);
drawCommanderStone().save(path.join(ROOT, "resource_pack", "textures", "items", "commander_stone.png"));
drawSpawner().save(path.join(ROOT, "resource_pack", "textures", "blocks", "royal_soldier_spawner.png"));
drawRoyalGuard().save(path.join(ROOT, "resource_pack", "textures", "entity", "royal_guard.png"));
console.log("Done.");
