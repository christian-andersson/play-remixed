// The C64 screen: a 40x25 buffer of screen codes and colours, the character set read from the
// C64 font, pixel-exact drawing into a 320x200 canvas, and sizing the screen and the TV to the window.
// Loaded first; the scripts share one scope and load in order: screen, player, ui, main.

/* ======================================================================================
   Screen: 40x25 cells of C64 screen codes and colours, drawn with the C64 character set.
   The font places screen code n (0-255, 128+ inverse) at U+EE00 + n.
   ====================================================================================== */
const W = 40, H = 25;
const BLACK = 0, WHITE = 1, CYAN = 3, BLUE = 6, YELLOW = 7, LRED = 10, DGREY = 11, LGREEN = 13, LBLUE = 14, LGREY = 15;
const codes = new Uint8Array(W * H), cols = new Uint8Array(W * H);
let hits = [], mouse = { x: -1, y: -1 }, px = 16;

// Unicode → screen code for the symbols used here and the box/block characters in song data.
const SYMBOLS = { "@": 0, "[": 27, "£": 28, "]": 29, "↑": 30, "^": 30, "←": 31, "_": 100, "|": 66, "─": 64, "━": 64,
  "│": 66, "┃": 66, "┌": 112, "┐": 110, "└": 109, "┘": 125, "├": 107, "┤": 115, "┬": 114, "┴": 113, "┼": 91,
  "╭": 85, "╮": 73, "╰": 74, "╯": 75, "╱": 78, "╲": 77, "\\": 77, "╳": 86, "▌": 97, "▄": 98, "▔": 99, "▁": 100,
  "▎": 101, "▒": 102, "▍": 117, "▂": 111, "▃": 121, "▖": 123, "▗": 108, "▘": 126, "▝": 124, "▚": 127, "◤": 105,
  "◥": 95, "●": 81, "•": 81, "○": 87, "♠": 65, "♣": 88, "♥": 83, "❤": 83, "♦": 90, "◆": 90, "π": 94, "█": 160,
  "‘": 39, "’": 39, "`": 39, "´": 39, "“": 34, "”": 34, "«": 60, "»": 62, "‐": 45, "–": 45, "—": 45, "~": 45,
  "…": 46, "·": 46, "{": 40, "}": 41, "×": 24, "ß": 19, "Ø": 15, "Æ": 1, "Œ": 15, "Ð": 4, "Þ": 16, "Ł": 12, "Đ": 4 };
function toCodes(s) {
  const out = [];
  for (const ch of String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase()) {
    const u = ch.codePointAt(0);
    if (u >= 65 && u <= 90) out.push(u - 64);                    // A-Z
    else if (u >= 32 && u <= 63) out.push(u);                    // space, digits, punctuation
    else out.push(SYMBOLS[ch] ?? 63);                            // anything else: symbol or "?"
  }
  return out;
}
const asCodes = v => Array.isArray(v) ? v : toCodes(v);
const pad = (v, n) => { const c = asCodes(v).slice(0, n); while (c.length < n) c.push(32); return c; };
const rpad = (v, n) => { const c = asCodes(v).slice(-n); while (c.length < n) c.unshift(32); return c; };

function put(x, y, c, col) { if (x >= 0 && x < W && y >= 0 && y < H) { codes[y * W + x] = c; cols[y * W + x] = col; } }
function text(x, y, v, col = LBLUE, rev = false) {
  const c = asCodes(v);
  c.forEach((k, i) => put(x + i, y, rev ? k ^ 128 : k, col));
  return c.length;
}
function fill(x, y, w, h, c = 32, col = LBLUE) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) put(x + i, y + j, c, col); }
function box(x, y, w, h, col = LBLUE, title = "", right = "") {
  fill(x + 1, y + 1, w - 2, h - 2);
  for (let i = 1; i < w - 1; i++) { put(x + i, y, 64, col); put(x + i, y + h - 1, 64, col); }
  for (let j = 1; j < h - 1; j++) { put(x, y + j, 66, col); put(x + w - 1, y + j, 66, col); }
  put(x, y, 112, col); put(x + w - 1, y, 110, col); put(x, y + h - 1, 109, col); put(x + w - 1, y + h - 1, 125, col);
  if (title) text(x + 2, y, pad(" " + title + " ", Math.min(w - 4, toCodes(title).length + 2)), WHITE);
  if (right) { const r = asCodes(" " + right + " "); text(x + w - 2 - r.length, y, r, LBLUE); }
}
const over = (x, y, w, h = 1) => mouse.x >= x && mouse.x < x + w && mouse.y >= y && mouse.y < y + h;
function hit(x, y, w, h, fn) { hits.push({ x, y, w, h, fn }); }
// Buttons are inverse text; hovered buttons turn white. Returns the x after the button and a gap.
function btn(x, y, label, fn, { col = LBLUE, disabled = false } = {}) {
  const c = asCodes(label);
  text(x, y, c, disabled ? DGREY : over(x, y, c.length) ? WHITE : col, !disabled);
  if (!disabled) hit(x, y, c.length, 1, fn);
  return x + c.length + 1;
}

const $ = id => document.getElementById(id);

// The screen is drawn as real pixels: a 320x200 image where each cell is the 8x8 bitmap of its
// screen code. The bitmaps (a copy of the C64 character ROM) are read from the font once at start-up.
// Palette as [r, g, b] for colours 0 black, 1 white, 2 red, 3 cyan, 4 purple, 5 green, 6 blue, 7 yellow,
// 8 orange, 9 brown, 10 light red, 11 dark grey, 12 grey, 13 light green, 14 light blue, 15 light grey.
// Read from the CSS variables --c0 to --c15 of the current colour scheme.
let PALETTE = [];
function readPalette() {
  const css = getComputedStyle(document.body);
  PALETTE = Array.from({ length: 16 }, (_, n) => {
    const h = css.getPropertyValue("--c" + n).trim();
    return [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  });
  shownCodes.fill(255);                                // repaint every cell in the new colours
}
const CHARSET = new Uint8Array(256 * 8);              // 8 bytes per screen code, bit 7 = leftmost pixel
let charsetReady = false;
async function loadCharset() {
  const S = 64, font = S + 'px "C64 Pro Mono"';
  await document.fonts.load(font, "\uEE00");
  const c = document.createElement("canvas"); c.width = c.height = S * 16;
  const g = c.getContext("2d", { willReadFrequently: true });
  g.font = font; g.fillStyle = "#fff";
  // the font's ascent is 7/8 em, so the baseline sits 56 of 64 pixels down each cell
  for (let n = 0; n < 256; n++) g.fillText(String.fromCharCode(0xEE00 + n), (n % 16) * S, Math.floor(n / 16) * S + S * 7 / 8);
  const data = g.getImageData(0, 0, c.width, c.height).data;
  for (let n = 0; n < 256; n++) for (let row = 0; row < 8; row++) {
    let bits = 0;
    for (let k = 0; k < 8; k++) {                       // sample the centre of each 8x8 block
      const x = (n % 16) * S + k * 8 + 4, y = Math.floor(n / 16) * S + row * 8 + 4;
      if (data[(y * c.width + x) * 4 + 3] > 127) bits |= 128 >> k;
    }
    CHARSET[n * 8 + row] = bits;
  }
  charsetReady = true;
  shownCodes.fill(255); render();
}

let screenCtx = null, frame = null;
const shownCodes = new Uint8Array(W * H).fill(255), shownCols = new Uint8Array(W * H);
function flush() {
  if (!charsetReady) return;
  if (!screenCtx) { screenCtx = $("screen").getContext("2d"); frame = screenCtx.createImageData(W * 8, H * 8); }
  const d = frame.data, bg = PALETTE[BLUE];
  let changed = false;
  for (let cell = 0; cell < W * H; cell++) {
    if (codes[cell] === shownCodes[cell] && cols[cell] === shownCols[cell]) continue;
    shownCodes[cell] = codes[cell]; shownCols[cell] = cols[cell]; changed = true;
    const fg = PALETTE[cols[cell]], cx = (cell % W) * 8, cy = Math.floor(cell / W) * 8;
    for (let row = 0; row < 8; row++) {
      const bits = CHARSET[codes[cell] * 8 + row];
      let i = ((cy + row) * W * 8 + cx) * 4;
      for (let k = 0; k < 8; k++, i += 4) {
        const c = bits & (128 >> k) ? fg : bg;
        d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255;
      }
    }
  }
  if (changed) screenCtx.putImageData(frame, 0, 0);
}

// Largest size that fits with a C64-like border; whole multiples of 8 px keep the 8x8 glyphs sharp.
// The TV is drawn in a 1500x990 viewBox; its glass spans this box. It is shown only when the window has room.
const TV = { w: 1500, h: 990, glass: { x: 160, y: 122.5, w: 932, h: 744 } };
// Each C64 pixel must cover a whole number of device pixels, so a character is a multiple of `unit`
// CSS pixels (8 device pixels). Only a screen too small for even that gets a fractional size.
function snapPx(best) {
  const unit = 8 / (devicePixelRatio || 1);
  return best >= unit ? Math.floor(best / unit) * unit : best;
}
// The TV is only shown when the screen inside it can still be drawn at a comfortable size;
// otherwise the screen fills the window with its border, which makes it larger.
const TV_MIN_PX = 12;
function fit() {
  const g = TV.glass, bw = 2, bh = 2;      // minimum border in the TV; it also keeps the screen clear of the curved glass
  // the largest whole-pixel screen that fits the glass of the largest TV the window allows
  const maxS = Math.min(innerWidth * 0.94 / TV.w, innerHeight * 0.92 / TV.h);
  const tvPx = snapPx(Math.min(g.w * maxS / (W + 2 * bw), g.h * maxS / (H + 2 * bh)));
  const tv = tvPx >= TV_MIN_PX && !document.body.classList.contains("c64-only");
  document.body.classList.toggle("tv", tv);
  if (!tv) setPower(true);                 // the power knob is part of the TV, so without it the screen stays on
  if (tv) {
    px = tvPx;
    // the TV shrinks until its glass just fits that screen and its border
    const s = Math.min(maxS, Math.max((W + 2 * bw) * px / g.w, (H + 2 * bh) * px / g.h));
    const left = (innerWidth - TV.w * s) / 2, top = (innerHeight - TV.h * s) / 2;
    for (const id of ["tv", "tv-glass"]) Object.assign($(id).style, { left: left + "px", top: top + "px", width: TV.w * s + "px", height: TV.h * s + "px" });
    Object.assign($("tube").style, { left: left + g.x * s + "px", top: top + g.y * s + "px", width: g.w * s + "px", height: g.h * s + "px" });
  } else {
    for (const k of ["left", "top", "width", "height"]) $("tube").style[k] = "";
    // a fixed border, so the screen can only shrink as the window shrinks
    px = snapPx(Math.min(innerWidth / (W + 4), innerHeight / (H + 4)));
  }
  Object.assign($("screen").style, { width: W * px + "px", height: H * px + "px" });
  // Put the screen's corner on a whole device pixel so the enlarged pixels stay even.
  const wrap = $("wrap"), dpr = devicePixelRatio || 1;
  wrap.style.transform = "";
  const r = $("screen").getBoundingClientRect();
  wrap.style.transform = "translate(" + (Math.round(r.left * dpr) / dpr - r.left) + "px," + (Math.round(r.top * dpr) / dpr - r.top) + "px)";
  render();
}
