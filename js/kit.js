/* PumaMech -- the art kit: what every picture on the play screen
 * shares. The play screen is 480 by 300, scaled up by whole numbers; a tile
 * is 24 pixels. The view is the 1987 game's: overhead, tilted, looking
 * north, so anything with height shows its top and its south face. The sun
 * is low in the south-west: shadows fall to the north-east, drawn by each
 * sprite as a separate shadow canvas the renderer multiplies over the
 * ground in one pass.
 *
 * Every sprite canvas may carry .sh (its shadow, opaque, any colour: the
 * renderer paints it in the zone's shadow colour) at .shx, .shy from the
 * sprite's own top-left. js/ground.js, js/things.js and js/people.js draw
 * with this; js/render.js places what they draw. */
"use strict";
(() => {
  const K = PM.K = { TS: 24, VW: 480, VH: 300 };
  /* the shadow's lean: per pixel of height, this far east and this far north */
  K.SX = 1.05; K.SY = -0.42;
  K.OUT = "#1d1917";                       /* the outline round people and small things */

  const cache = new Map();
  K.cache = cache;
  K.mk = (w, h) => { const c = document.createElement("canvas"); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c; };
  K.get = (key, make) => { let c = cache.get(key); if (!c) { c = make(); cache.set(key, c); } return c; };
  K.clear = () => cache.clear();

  /* numbers that are the same every time for the same arguments */
  K.hash = (x, y) => { let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
  K.rng = (...k) => PM.mulberry(k.reduce((h, v) => Math.imul(h ^ (typeof v === "string" ? [...v].reduce((a, c) => a * 31 + c.charCodeAt(0), 7) : v | 0), 2654435761), 17));
  const sm = t => t * t * (3 - 2 * t);
  K.vn = (x, y) => { const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, a = K.hash(xi, yi), b = K.hash(xi + 1, yi), c = K.hash(xi, yi + 1), d = K.hash(xi + 1, yi + 1), u = sm(xf), v = sm(yf); return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v; };
  /* value noise in world pixels, so the ground runs on from tile to tile */
  K.fbm = (x, y) => K.vn(x / 46, y / 40) * 0.55 + K.vn(x / 18 + 31, y / 15 + 7) * 0.3 + K.vn(x / 6 + 91, y / 5 + 3) * 0.15;
  /* a 4x4 ordered dither, -0.5..0.5 */
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  K.bayer = (x, y) => BAYER[(y & 3) * 4 + (x & 3)] / 16 - 0.47;
  K.rgb = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  K.hex = ([r, g, b]) => "#" + [r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");
  K.mix = (a, b, t) => K.hex(K.rgb(a).map((v, i) => v + (K.rgb(b)[i] - v) * t));

  /* drawing, always on whole pixels */
  K.rect = (g, x, y, w, h, c) => { g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); };
  K.px = (g, x, y, c) => { g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), 1, 1); };
  /* a filled ellipse, row by row, crisp */
  K.disc = (g, cx, cy, rx, ry, c) => {
    if (c) g.fillStyle = c;
    cx = Math.round(cx); cy = Math.round(cy); rx = Math.max(0, Math.round(rx)); ry = Math.max(0, Math.round(ry));
    for (let y = -ry; y <= ry; y++) { const w = Math.round(rx * Math.sqrt(Math.max(0, 1 - (y * y) / ((ry + 0.5) * (ry + 0.5))))); g.fillRect(cx - w, cy + y, w * 2 + 1, 1); }
  };
  K.line = (g, x0, y0, x1, y1, c) => {
    g.fillStyle = c;
    const n = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))));
    for (let k = 0; k <= n; k++) g.fillRect(Math.round(x0 + (x1 - x0) * k / n), Math.round(y0 + (y1 - y0) * k / n), 1, 1);
  };
  /* a sprite from rows of letters and a palette: { a: "#hex", ... }; "." is clear */
  K.grid = (g, rows, x, y, pal, flip) => {
    rows.forEach((r, yy) => { for (let xx = 0; xx < r.length; xx++) { const c = pal[r[xx]]; if (!c) continue; g.fillStyle = c; g.fillRect(x + (flip ? r.length - 1 - xx : xx), y + yy, 1, 1); } });
  };
  /* a one-pixel ring round whatever is drawn on c */
  K.outline = (c, col = K.OUT, diag = false) => {
    const g = c.getContext("2d"), W = c.width, H = c.height, d = g.getImageData(0, 0, W, H).data, a = (x, y) => x >= 0 && y >= 0 && x < W && y < H && d[(y * W + x) * 4 + 3] > 40;
    const nb = diag ? [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]] : [[1, 0], [-1, 0], [0, 1], [0, -1]];
    g.fillStyle = col;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (!a(x, y) && nb.some(([dx, dy]) => a(x + dx, y + dy))) g.fillRect(x, y, 1, 1);
    return c;
  };
  /* a shadow for a sprite: its footprint (an ellipse rx, ry at the base)
   * stretched along the sun's lean for height h, tapering. Returns the
   * canvas and where it sits relative to the base point. */
  K.shadow = (rx, ry, h, taper = 0.5) => {
    const ex = Math.ceil(h * K.SX) + rx * 2 + 4, ey = Math.ceil(-h * K.SY) + ry * 2 + 4;
    const c = K.mk(ex, ey), g = c.getContext("2d"), ox = rx + 2, oy = ey - ry - 2;
    g.fillStyle = "#000";
    const n = Math.max(1, Math.ceil(h * K.SX));
    for (let i = 0; i <= n; i++) { const t = i / n, k = 1 - t * taper; K.disc(g, ox + t * h * K.SX, oy + t * h * K.SY, Math.max(1, rx * k), Math.max(1, ry * k)); }
    return { c, x: -ox, y: -oy };
  };
  /* attach a shadow to a sprite: base point (bx, by) inside the sprite */
  K.withShadow = (c, bx, by, rx, ry, h, taper) => { const s = K.shadow(rx, ry, h, taper); c.sh = s.c; c.shx = bx + s.x; c.shy = by + s.y; return c; };

  /* ---- the zones: ramps light to dark ---- */
  K.Z = {
    desert: {
      ground: ["#f6e4b9", "#eed49f", "#e4c38a", "#d7b075", "#c79a62", "#ae8150", "#8f6742"],
      dirt: ["#e4cfa8", "#d8c096", "#cbb085", "#bc9f76", "#a98b65", "#917554", "#775f45"],
      scrub: ["#9aa257", "#7d8a45", "#5e6b33", "#3f4a24"],
      rock: ["#e3c69c", "#c9a57a", "#a7835d", "#7d5f43", "#5a4331"],
      wall: ["#e6d3b0", "#d0b991", "#b0976f", "#8a7356", "#5f4e3b"],
      roof: ["#b49a72", "#9e8460", "#7c6649", "#5a4a36"],
      water: ["#8fc0d2", "#5f98b3", "#3f7590", "#2b546a"],
      ice: ["#e6f3f8", "#c4e1ee", "#9cc9e0", "#79abc6"],
      trench: ["#c9a46e", "#a8834f", "#7e6038", "#5a4328"],
      shadow: "#9893d2",
    },
    temperate: {
      ground: ["#c3d98a", "#a9c56f", "#94b55a", "#80a44c", "#6d9140", "#5b7e36", "#46672b"],
      dirt: ["#cdb890", "#bba57d", "#a99068", "#957d58", "#806a4a", "#6c593e", "#594933"],
      scrub: ["#7fae4c", "#56863a", "#3f6b2a", "#2b4a1d"],
      rock: ["#d4d0c4", "#b8b4a8", "#99958a", "#77736b", "#55524c"],
      wall: ["#ddd6c6", "#c9c2b3", "#a49d8f", "#7b7569", "#57524a"],
      roof: ["#c25b48", "#a3473a", "#7c3329", "#55241d"],
      water: ["#86bfd8", "#5f93b0", "#3f6f8c", "#294e63"],
      ice: ["#e6f3f8", "#c4e1ee", "#9cc9e0", "#79abc6"],
      trench: ["#9c845e", "#7e6948", "#5f4f36", "#433826"],
      shadow: "#8f9ab8",
    },
    arctic: {
      ground: ["#ffffff", "#f3f6fb", "#e6ecf4", "#d6dfeb", "#c3cfe0", "#aebdd2", "#95a7c0"],
      dirt: ["#eef2f7", "#dfe6ef", "#cdd7e4", "#b9c6d7", "#a3b3c9", "#8c9eb7", "#7487a2"],
      scrub: ["#7a917c", "#58705e", "#3c5144", "#26362c"],
      rock: ["#b9c1ca", "#9aa3ad", "#7b848f", "#5c6570", "#414851"],
      wall: ["#eef1f5", "#d7dce2", "#b1b8c1", "#878f9a", "#5e6670"],
      roof: ["#f5f8fb", "#dfe5ec", "#b7c0cc", "#8e99a8"],
      water: ["#6e9fc0", "#4f7fa3", "#365f80", "#22425c"],
      ice: ["#eef8fc", "#cfe8f4", "#a9d3e8", "#84b7d4"],
      trench: ["#c9d3e0", "#a6b3c6", "#8090a8", "#5d6c84"],
      shadow: "#9fb0d8",
    },
  };
  /* the enemy's kit and the ranger's, the same in every zone */
  K.MAT = {
    olive: ["#a9b37a", "#8a9560", "#6b764a", "#4e5735", "#353c25"],
    steel: ["#c9ced4", "#a3aab3", "#7f8792", "#5c636e", "#3d434c"],
    concrete: ["#d9d6cd", "#bdb9ae", "#9c988d", "#78756c", "#56534c"],
    wood: ["#c9a274", "#a9824f", "#8a6a48", "#6a4f36", "#4a3626"],
    canvas: ["#c4c79a", "#a6aa78", "#878b5c", "#686c43", "#4b4f30"],
    red: ["#f2a588", "#e07a5c", "#c0533a", "#8e3a24", "#5e2715"],
    fire: ["#fff4c2", "#ffd36b", "#ff9a3c", "#e4572e", "#9c2f1a"],
    smoke: ["#c8c2b8", "#a39d94", "#7d7870", "#56524d", "#35322f"],
    puma: ["#f6dcae", "#e3b77c", "#c8945a", "#a0703d", "#6f4a26"],
    cream: "#f7ecd6", tip: "#3a2618",
  };
  /* what the renderer and the HUD speak in, wherever art is not involved */
  K.UI = { text: "#e9e4d8", green: "#7fb069", amber: "#e8a33d", red: "#e4572e", panel: "rgba(20,22,28,.88)" };
})();
