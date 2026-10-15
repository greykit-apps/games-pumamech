/* PumaMech -- the things built on the ground, the kit that flies, and
 * the bangs. Drawn in code in the tilted overhead view (see js/kit.js): the
 * ground is a flat map, anything with height shows its top and its south
 * face, the sun is low in the south-west and every sprite carries its own
 * shadow (.sh at .shx, .shy) for the renderer's one multiply pass.
 *
 *   PM.objArt(k, dead, zone, extra)  an installation on its footprint; .ax, .ay
 *                                    is the footprint's top-left on the ground
 *   PM.tankArt(f, frame)             the minitank; .ax, .ay its ground centre
 *   PM.ospreyArt(frame, small, leaving)
 *   PM.chuteArt(), PM.podArt(chute), PM.miscArt(k), PM.markArt(ch)
 *   PM.drawBoom(g, x, y, r, k), PM.drawSmoke(g, x, y, t), PM.FX
 *
 * Everything but the two draw functions is cached the first time it is
 * asked for; those two draw straight onto the play screen and allocate
 * nothing per frame. */
"use strict";
(() => {
  const K = PM.K, M = K.MAT, OUT = K.OUT, SX = K.SX, SY = K.SY;
  const R = K.rect, P = K.px, hash = K.hash, bay = K.bayer, vn = K.vn;
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const zoneOf = z => K.Z[z] ? z : "desert";
  const seedOf = s => [...String(s)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 9973, 7);

  /* ---------- painters: whole pixels only ---------- */
  function inPoly(px, py, Q) {
    let c = false;
    for (let i = 0, j = Q.length - 1; i < Q.length; j = i++) {
      const xi = Q[i][0], yi = Q[i][1], xj = Q[j][0], yj = Q[j][1];
      if ((yi > py) !== (yj > py) && px < (xj - xi) * (py - yi) / (yj - yi) + xi) c = !c;
    }
    return c;
  }
  /* a polygon, filled pixel by pixel: fn(x, y) gives the colour, or a string */
  function poly(g, Q, fn) {
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    for (const [x, y] of Q) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    for (let y = Math.floor(y0); y <= Math.ceil(y1); y++) for (let x = Math.floor(x0); x <= Math.ceil(x1); x++)
      if (inPoly(x + 0.5, y + 0.5, Q)) { const c = typeof fn === "string" ? fn : fn(x, y); if (c) P(g, x, y, c); }
  }
  /* an ellipse, pixel by pixel, fn(x, y, nx, ny) with nx, ny -1..1 */
  function ell(g, cx, cy, rx, ry, fn) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const nx = (x + 0.5 - cx) / rx, ny = (y + 0.5 - cy) / ry;
      if (nx * nx + ny * ny > 1) continue;
      const c = typeof fn === "string" ? fn : fn(x, y, nx, ny); if (c) P(g, x, y, c);
    }
  }
  /* a lumpy shape from overlapping circles (the mockup's blob) */
  function blob(g, cx, cy, parts, shade, sq = 1) {
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    for (const p of parts) { x0 = Math.min(x0, cx + p[0] - p[2] - 1); x1 = Math.max(x1, cx + p[0] + p[2] + 1); y0 = Math.min(y0, cy + p[1] - p[2] - 1); y1 = Math.max(y1, cy + p[1] + p[2] + 1); }
    const ins = (x, y) => parts.some(p => { const dx = x - (cx + p[0]), dy = (y - (cy + p[1])) * sq; return dx * dx + dy * dy <= p[2] * p[2]; });
    for (let y = Math.floor(y0); y <= y1; y++) for (let x = Math.floor(x0); x <= x1; x++) {
      if (!ins(x, y)) continue;
      const e = !ins(x - 1, y) || !ins(x + 1, y) || !ins(x, y - 1) || !ins(x, y + 1);
      const c = shade(x, y, e, x - cx, y - cy); if (c) P(g, x, y, c);
    }
  }
  /* a sprite from rows of letters, with its own outline */
  function spr(g, rows, pal, x, y, O, flip) {
    const w = Math.max(...rows.map(r => r.length)), h = rows.length;
    const on = (i, j) => j >= 0 && j < h && i >= 0 && i < w && !!rows[j][i] && rows[j][i] !== ".";
    const X = i => flip ? x + w - 1 - i : x + i;
    if (O) for (let j = -1; j <= h; j++) for (let i = -1; i <= w; i++) if (!on(i, j) && (on(i - 1, j) || on(i + 1, j) || on(i, j - 1) || on(i, j + 1))) P(g, X(i), y + j, O);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if (on(i, j)) P(g, X(i), y + j, pal[rows[j][i]]);
  }
  const line = (g, x0, y0, x1, y1, c) => K.line(g, x0, y0, x1, y1, c);
  const lineW = (g, x0, y0, x1, y1, w, c) => { const n = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)))); for (let k = 0; k <= n; k++) R(g, x0 + (x1 - x0) * k / n - (w - 1) / 2, y0 + (y1 - y0) * k / n - (w - 1) / 2, w, w, c); };
  /* the mockup's puff: a dark underside, the body, a lit cap */
  function puff(g, cx, cy, r, a, base, hi, lo) {
    const ry = Math.max(1, Math.round(r * 0.9));
    g.globalAlpha = a;
    g.fillStyle = lo; K.disc(g, cx + 1, cy + 1, r, ry);
    g.fillStyle = base; K.disc(g, cx, cy, r, ry);
    g.fillStyle = hi; K.disc(g, cx - Math.round(r * 0.35), cy - Math.round(r * 0.35), Math.max(1, Math.round(r * 0.5)), Math.max(1, Math.round(r * 0.4)));
    g.globalAlpha = 1;
  }

  /* ---------- shadows: the convex hull of a solid's corners, leant to the north-east ---------- */
  function hull(pts) {
    const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    if (p.length < 3) return p;
    const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lo = [], up = [];
    for (const q of p) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
    for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
    return lo.slice(0, -1).concat(up.slice(0, -1));
  }
  const shHull = (s, pts3) => poly(s, hull(pts3.map(([x, y, z]) => [x + z * SX, y + z * SY])), "#000");
  const boxPts = (x0, y0, x1, y1, h, z0 = 0) => { const a = []; for (const z of [z0, h]) for (const [x, y] of [[x0, y0], [x1, y0], [x0, y1], [x1, y1]]) a.push([x, y, z]); return a; };
  const cylPts = (cx, cy, rx, ry, h, z0 = 0) => { const a = []; for (let k = 0; k < 20; k++) { const t = k / 20 * Math.PI * 2; for (const z of [z0, h]) a.push([cx + Math.cos(t) * rx, cy + Math.sin(t) * ry, z]); } return a; };
  /* a thin upright thing: a post, a mast */
  const shPost = (s, x, y, w, h, z0 = 0) => shHull(s, boxPts(x, y - 1, x + w, y + 1, h, z0));

  /* ---------- wreckage ---------- */
  /* char what is drawn: soot toward (cx, cy), noisy, the odd ember */
  function burn(c, cx, cy, rad, pow, seed) {
    const g = c.getContext("2d"), W = c.width, H = c.height, im = g.getImageData(0, 0, W, H), d = im.data;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      if (d[i + 3] < 128) continue;
      const dist = Math.hypot(x - cx, (y - cy) * 1.2) / rad;
      const b = pow * (1.3 - dist) + (vn(x / 3.5 + seed, y / 3.5 - seed) - 0.5) * 1.1 + bay(x, y) * 0.25;
      if (b <= 0.08) continue;
      const t = Math.min(0.92, b), L = (d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11) / 255;
      d[i] += (24 + L * 70 - d[i]) * t; d[i + 1] += (19 + L * 56 - d[i + 1]) * t; d[i + 2] += (17 + L * 46 - d[i + 2]) * t;
      if (b > 1.05 && hash(x * 7 + seed, y * 13) > 0.972) { const e = hash(x, y * 3 + seed) > 0.5; d[i] = 255; d[i + 1] = e ? 143 : 210; d[i + 2] = e ? 58 : 122; }
    }
    g.putImageData(im, 0, 0);
  }
  /* blackened ground round a ruin, drawn under it */
  function scorch(g, cx, cy, rx, ry, seed) {
    g.save(); g.globalCompositeOperation = "destination-over";
    for (let y = Math.floor(cy - ry - 3); y <= cy + ry + 3; y++) for (let x = Math.floor(cx - rx - 4); x <= cx + rx + 4; x++) {
      const d = Math.hypot((x - cx) / rx, (y - cy) / ry) + (vn(x / 3 + seed, y / 3 + seed) - 0.5) * 0.6 + bay(x, y) * 0.16;
      if (d >= 1) continue;
      g.fillStyle = d < 0.45 ? "rgba(24,17,13,.6)" : d < 0.75 ? "rgba(32,23,17,.4)" : "rgba(42,31,22,.2)";
      g.fillRect(x, y, 1, 1);
    }
    g.restore();
  }
  function rubble(g, x0, x1, y0, y1, n, cols, seed) {
    const r = K.rng("rubble", seed, n | 0), list = [];
    for (let i = 0; i < n; i++) list.push([Math.round(x0 + r() * (x1 - x0)), Math.round(y0 + r() * (y1 - y0)), 1 + (r() * 3 | 0), 1 + (r() * 2 | 0), r()]);
    list.sort((a, b) => a[1] - b[1]);
    for (const [x, y, w, h, q] of list) {
      R(g, x, y - h, w, h + 1, cols[1]); R(g, x, y - h, w, 1, cols[0]); P(g, x + w - 1, y, cols[2]);
      if (q > 0.72) P(g, x + w, y, cols[3] || OUT);
    }
  }
  /* a box building with its roof gone: the back wall's inner face, a floor
   * of wreckage, the stubs of the side walls, a broken front */
  function ruinBox(g, x0, x1, yN, yS, h, wall, mat, seed) {
    const hs = x => Math.max(1, Math.round(h * (0.2 + 0.6 * vn(x / 4 + seed, seed * 0.37)))), hn = x => Math.max(2, Math.round(h * (0.5 + 0.45 * vn(x / 5 + seed + 9, seed))));
    for (let x = x0; x <= x1; x++) { const t = yN - hn(x); for (let y = t; y < yN + 1; y++) P(g, x, y, y === t ? mat[0] : hash(x * 3, y * 7) > 0.84 ? mat[3] : mat[2]); }
    for (let y = yN + 1; y < yS; y++) for (let x = x0; x <= x1; x++) { const q = hash(x * 5 + seed, y * 3); P(g, x, y, q > 0.8 ? mat[2] : q > 0.42 ? mat[3] : "#2a2320"); }
    for (let y = yN - hn(x0); y < yS; y++) { P(g, x0, y, mat[1]); P(g, x0 + 1, y, mat[2]); }
    for (let y = yN - hn(x1); y < yS; y++) { P(g, x1, y, mat[3]); P(g, x1 - 1, y, mat[2]); }
    rubble(g, x0 + 3, x1 - 3, yN + 4, yS - 1, (x1 - x0) / 2.5, [mat[1], mat[3], "#1c1714"], seed);
    for (let x = x0; x <= x1; x++) { const t = yS - hs(x); for (let y = t; y < yS; y++) P(g, x, y, y === t ? mat[0] : wall(x, y, y - (yS - h))); }
  }

  /* ---------- shared kit ---------- */
  const BAGS = {
    desert: [{ T: "#ecdcb2", t: "#d6c395", F: "#bca878", f: "#9b865f" }, "#55472f"],
    temperate: [{ T: "#d9d2a8", t: "#bfb78b", F: "#a59d72", f: "#837b56" }, "#433d29"],
    arctic: [{ T: "#f6f8fa", t: "#dfe5ec", F: "#c5cdd8", f: "#9faabb" }, "#4b5464"],
  };
  const BAG = [".TTTTT.", "TTTtTTT", "FFFFFFf", "fFFFFff"];
  const bag = (g, x, base, zone, torn) => { const [p, O] = BAGS[zone]; spr(g, torn ? [".TTt...", "TTTtTT.", "FFFFFf.", "fFFff.."] : BAG, p, Math.round(x) - 3, Math.round(base) - 4, O); };
  const DRUM = [".TTTTTTT.", "TttOtttTT", ".TTTTTTT.", "LLMMMMDDX", "lLmmmmddX", "LLMMMMDDX", "LLMMMMDDX", "LLMMMMDDX", "lLmmmmddX", "LLMMMMDDX", ".LMMMMDD."];
  const DRUMSIDE = ["..lLLLLLLLl..", ".TLMMMMMMMMDX", "TtLmMMMmMMMDX", "TOLMMMMMMMMDX", "TtLmMMMmMMMDX", ".TdddddddddX.", "..XXXXXXXXX.."];
  const DRUMPAL = {
    red: { T: "#ef9a7c", t: "#c96d50", O: "#5e2715", L: "#e07a5c", M: "#b8533a", D: "#86391f", X: "#5e2715", l: "#f2a588", m: "#9a442b", d: "#6e2c18" },
    olive: { T: "#c0ca8f", t: "#8f9c5e", O: "#3b4428", L: "#a2ae6c", M: "#76834a", D: "#55603a", X: "#3b4428", l: "#c3cc8e", m: "#606c3c", d: "#434c2c" },
  };
  const drum = (g, cx, base, red) => spr(g, DRUM, DRUMPAL[red ? "red" : "olive"], Math.round(cx) - 4, Math.round(base) - 11, "#1e1a14");
  /* the enemy's armour: a grey olive */
  const ARM = ["#c3c9b0", "#a1a88d", "#7f876c", "#5f664f", "#40453a"];
  const STL = M.steel, CON = M.concrete, WOOD = M.wood;
  const SOOT = "#1c1613", GLOW = ["#ffe7a8", "#ffd27a", "#ff8f3a", "#e4572e"];
  const flames = (g, x, y, n, seed) => { const r = K.rng("fl", seed, x, y); for (let i = 0; i < n; i++) { const dx = Math.round((r() - 0.5) * 6), h = 1 + (r() * 4 | 0); for (let j = 0; j < h; j++) P(g, x + dx, y - j, GLOW[Math.min(3, j + (r() * 2 | 0))]); } };
  /* an upright cylinder: side shaded across, a cap; band(x, y, v, nx) may repaint the side */
  function cyl(g, cx, base, rx, ry, h, ramp, cap, band) {
    const n = ramp.length;
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const nx = (x + 0.5 - cx) / rx; if (nx <= -1 || nx >= 1) continue;
      const e = Math.sqrt(1 - nx * nx) * ry, y0 = Math.round(base - h + e), y1 = Math.round(base + e);
      for (let y = y0; y <= y1; y++) {
        let t = (nx + 1) / 2 * (n - 1.6) + 0.35 + bay(x, y) * 0.6; if (nx < -0.82) t += 1.1;
        let col = ramp[clamp(Math.round(t), 0, n - 1)];
        if (band) { const b = band(x, y, y - y0, nx); if (b) col = b; }
        P(g, x, y, col);
      }
    }
    if (cap) ell(g, cx, base - h, rx, ry, typeof cap === "function" ? cap : (x, y, nx, ny) => nx * nx + ny * ny > 0.62 ? ramp[1] : ramp[0]);
  }
  /* the corrugated iron of a shed roof, ridges running north-south */
  const tin = (x, y, top, bot, x0, zone) => {
    const k = (x - x0) % 3;
    let c = k === 0 ? "#6d6f69" : k === 1 ? "#b0b2a8" : "#8e9088";
    if (y === top) c = k === 0 ? "#a2a49c" : "#d8dad0";
    if (y >= bot - 1) c = "#4a4b46";
    if (zone !== "arctic" && hash(x >> 1, y >> 1) > 0.9) c = k === 1 ? "#b98a5e" : "#8a5a36";
    if (zone === "arctic" && vn(x / 5, y / 3) + (y - top) * 0.006 > 0.42 && y < bot - 1) c = k === 0 ? "#cfd8e2" : "#f4f7fa";
    return c;
  };
  /* a gabled roof over x0..x1, ridge east-west */
  function gable(g, x0, x1, yN, yS, h, r, roof) {
    const ym = (yN + yS) / 2, tN = yN - h, tR = Math.round(ym - h - r), tS = yS - h;
    for (let x = x0 - 2; x <= x1 + 2; x++) for (let y = tN - 1; y <= tS + 1; y++) {
      let c;
      if (y < tR) { c = (tR - y) % 3 === 0 ? roof[3] : roof[2]; if (y === tN - 1) c = roof[1]; }
      else {
        const v = y - tR;
        c = v % 4 === 3 ? roof[2] : ((x + (v >> 2) * 2) % 5 === 0 ? roof[1] : roof[0]);
        if (v > 0 && v % 4 !== 3 && hash(x * 3, y * 5) > 0.93) c = roof[1];
        if (y === tS + 1) c = roof[3];
      }
      if (y === tR) c = roof[0];
      if (y === tR - 1) c = roof[3];
      if (x === x0 - 2 && y >= tR) c = roof[1];
      if (x === x1 + 2) c = roof[3];
      P(g, x, y, c);
    }
  }
  function door(g, x, yb, w, h, open) {
    R(g, x - 1, yb - h - 1, w + 2, h + 1, "#2b2119");
    if (open) { R(g, x, yb - h, w, h, "#120d0b"); R(g, x, yb - h, 2, h, WOOD[1]); return; }
    R(g, x, yb - h, w, h, WOOD[2]); R(g, x, yb - h, 1, h, WOOD[1]); R(g, x + w - 1, yb - h, 1, h, WOOD[3]);
    for (let y = yb - h + 2; y < yb; y += 4) R(g, x + 1, y, w - 2, 1, WOOD[3]);
    P(g, x + w - 2, yb - (h >> 1), "#e2c27a");
  }
  function window_(g, x, y, w, h, frame, glow) {
    R(g, x - 1, y - 1, w + 2, h + 2, frame);
    R(g, x, y, w, h, glow ? "#3a1a10" : "#26303a");
    if (glow) { R(g, x + 1, y + 1, w - 2, h - 2, "#e4572e"); R(g, x + 2, y + 1, 2, 1, "#ffd27a"); return; }
    P(g, x, y, "#9fb4c4"); P(g, x + 1, y, "#6d8396");
    for (let i = 2; i < w; i += 3) R(g, x + i, y, 1, h, "#59606a");
    R(g, x - 1, y + h + 1, w + 2, 1, "#00000044");
  }
  const placard = (g, dx, dy, col) => {
    for (const [px, py] of [[0, -3], [-1, -2], [0, -2], [1, -2], [-2, -1], [-1, -1], [0, -1], [1, -1], [2, -1], [-3, 0], [-2, 0], [-1, 0], [0, 0], [1, 0], [2, 0], [3, 0], [-2, 1], [-1, 1], [0, 1], [1, 1], [2, 1], [-1, 2], [0, 2], [1, 2], [0, 3]]) P(g, dx + px, dy + py, "#2a1712");
    for (const [px, py] of [[0, -2], [-1, -1], [0, -1], [1, -1], [-2, 0], [-1, 0], [1, 0], [2, 0], [-1, 1], [0, 1], [1, 1], [0, 2]]) P(g, dx + px, dy + py, col || "#e86a3c");
    P(g, dx, dy, "#2a1712");
  };
  const crate = (g, x, base) => {
    const w = 12, top = base - 12;
    for (let i = 0; i < w; i++) for (let j = 0; j < 5; j++) P(g, x + i, top + j, j === 0 ? "#b7b67a" : (i % 4 === 0 ? "#7c7c48" : "#9c9c62"));
    for (let i = 0; i < w; i++) for (let j = 5; j < 12; j++) { let c = j === 5 ? "#4d4c2b" : (i === 0 ? "#8a8a52" : i % 5 === 0 ? "#55542f" : "#6c6b3d"); if (j === 11) c = "#3e3d22"; P(g, x + i, top + j, c); }
    R(g, x + 4, top + 7, 4, 2, "#d9c78c"); R(g, x + 5, top + 7, 2, 1, "#efe0a8");
  };

  /* =================== the installations =================== */
  /* each: up (rows above the footprint), pl/pr/pb pads, draw(g, s, o) in
   * footprint coordinates (0, 0 the footprint's north-west corner, y = H
   * its south edge on the ground); s is the shadow, in the same coordinates */
  const SPEC = {};

  SPEC.bunker = { up: 20, draw(g, s, o) {
    const C = CON, x0 = 3, x1 = 68, yN = 10, yS = 45, h = 14, top = yN - h, eave = yS - h, Zg = o.Z.ground;
    shHull(s, boxPts(x0, yN, x1 + 1, yS, h));
    const wall = (x, y, w) => {
      let c = C[1];
      if (w === 0) c = C[0];
      if ((x - x0) % 17 === 8 && w > 1) c = C[2];
      if (hash(x * 3, y * 5) > 0.93) c = C[2];
      if (w >= h - 1) c = C[3];
      if (x >= x1 - 2) c = w === 0 ? C[1] : C[3];
      return c;
    };
    if (o.dead) {
      ruinBox(g, x0, x1, yN, yS, h, wall, [C[1], C[2], C[3], C[4]], o.seed);
      for (const x of [14, 22, 47, 55]) { line(g, x, eave + 3, x + 2, eave - 4, "#7a4a2a"); P(g, x + 2, eave - 5, "#a8683a"); }
      rubble(g, x0 - 2, x1 + 2, yS - 1, yS + 3, 26, [C[0], C[2], C[4]], o.seed + 1);
      o.burn(36, eave, 40, 0.75); o.scorch(36, yS - 6, 40, 16);
      return;
    }
    for (let y = top; y < eave; y++) for (let x = x0; x <= x1; x++) {
      const ex = Math.min(x - x0, x1 - x, y - top, eave - 1 - y);
      let c;
      if (ex < 2) { c = y >= eave - 2 ? C[0] : x > x1 - 2 ? C[3] : x < x0 + 2 ? C[0] : C[1]; if (y === top) c = C[1]; }
      else {
        const nx = (x - (x0 + x1) / 2) / ((x1 - x0) / 2), ny = (y - (top + eave) / 2) / ((eave - top) / 2);
        const li = -nx * 0.8 + ny * 0.45 - (nx * nx + ny * ny) * 0.5 + (K.fbm(x * 3, y * 3) - 0.5) * 1.1 + bay(x, y) * 0.55;
        c = Zg[clamp(Math.round(2.6 - li * 1.6), 0, 6)];
        if (o.zone !== "arctic" && hash(x * 7, y * 3) > 0.95) c = o.Z.scrub[hash(x, y) > 0.5 ? 1 : 2];
      }
      P(g, x, y, c);
    }
    for (let y = eave; y < yS; y++) for (let x = x0; x <= x1; x++) P(g, x, y, wall(x, y, y - eave));
    /* the firing slit, shadowed under its lip */
    R(g, x0 + 11, eave + 3, x1 - x0 - 21, 1, C[3]); R(g, x0 + 11, eave + 4, x1 - x0 - 21, 4, "#120f0d"); R(g, x0 + 11, eave + 8, x1 - x0 - 21, 1, C[0]);
    R(g, 33, eave + 6, 5, 1, "#3d434c"); P(g, 32, eave + 6, "#7f8792");
    /* a periscope and a vent on the roof */
    R(g, 52, top + 8, 2, 5, STL[3]); P(g, 52, top + 8, STL[1]); R(g, 51, top + 7, 4, 1, STL[4]);
    R(g, 15, top + 11, 4, 3, STL[2]); R(g, 15, top + 11, 4, 1, STL[0]);
    shPost(s, 52, top + 12 + h, 2, 6, h);
  } };

  SPEC.mg = { up: 8, draw(g, s, o) {
    const cx = 24, cy = 26, pts = [];
    shHull(s, cylPts(cx, cy, 20, 13, 7));
    for (let k = 0; k < 14; k++) { const a = k / 14 * Math.PI * 2; pts.push([cx + Math.cos(a) * 18, cy + Math.sin(a) * 11]); }
    const pit = o.zone === "arctic" ? ["#a3b3c9", "#8c9eb7"] : ["#6b4f36", "#57402c"];
    ell(g, cx, cy + 1, 15, 9, pit[0]); ell(g, cx, cy, 11, 6, pit[1]);
    if (o.dead) {
      pts.filter((p, i) => p[1] < cy && i % 3 !== 1).forEach(p => bag(g, p[0], p[1], o.zone, hash(p[0], p[1]) > 0.5));
      /* the gun tipped over, a helmet */
      lineW(g, 18, 30, 31, 25, 2, "#1f2024"); line(g, 19, 29, 30, 25, "#4a4d54");
      ell(g, 30, 33, 3, 2, "#5a6052"); P(g, 29, 32, "#8a907c");
      pts.filter((p, i) => p[1] >= cy && i % 4 !== 2).forEach(p => bag(g, p[0] + (hash(p[0], 3) - 0.5) * 4, p[1] + 3, o.zone, true));
      rubble(g, 4, 44, 36, 44, 14, ["#d6c395", "#9b865f", "#55472f"], o.seed);
      o.burn(24, 28, 22, 0.55); o.scorch(24, 30, 24, 14);
      return;
    }
    pts.filter(p => p[1] < cy).sort((a, b) => a[1] - b[1]).forEach(p => bag(g, p[0], p[1], o.zone));
    /* the gunner behind his gun: helmet and shoulders */
    ell(g, 26, 22, 5, 3, "#5d6474"); ell(g, 26, 21, 4, 2, "#7d8490");
    ell(g, 26, 16, 4, 3, "#686d53"); ell(g, 25, 15, 3, 2, "#8e9474"); R(g, 22, 18, 9, 1, "#464a39");
    R(g, 25, 19, 3, 2, "#ab7552");
    pts.filter(p => p[1] >= cy).sort((a, b) => a[1] - b[1]).forEach(p => { bag(g, p[0], p[1] + 2, o.zone); bag(g, p[0], p[1] - 2, o.zone); });
    /* the machine gun on the front bags, aimed south-west */
    R(g, 23, 30, 6, 3, "#1f2024"); R(g, 24, 30, 4, 1, "#6a6e76");
    for (let k = 0; k < 12; k++) { P(g, 22 - k, 32 + Math.round(k * 0.5), "#1f2024"); P(g, 22 - k, 31 + Math.round(k * 0.5), k % 3 === 0 ? "#8a8e96" : "#3a3c41"); }
    P(g, 29, 32, "#d6ad4c"); P(g, 30, 33, "#b8902f"); P(g, 31, 34, "#d6ad4c");
    R(g, 32, 31, 5, 3, "#4d532f"); R(g, 32, 31, 5, 1, "#6e7542");
  } };

  SPEC.turret = { up: 22, draw(g, s, o) {
    const cx = 24, cy = 27, C = CON;
    shHull(s, cylPts(cx, cy, 20, 12, 7)); shHull(s, cylPts(cx, cy - 2, 12, 8, 17, 7));
    /* the concrete ring it turns in */
    cyl(g, cx, cy, 20, 12, 7, [C[0], C[1], C[1], C[2], C[3]], (x, y, nx, ny) => nx * nx + ny * ny > 0.7 ? (ny > 0 ? C[0] : C[2]) : "#3f3c37");
    if (o.dead) {
      ell(g, cx, cy - 7, 13, 7, "#1a1513"); ell(g, cx - 1, cy - 8, 10, 5, "#2c241f");
      /* the dome, blown off and lying askew */
      ell(g, 39, 38, 9, 5, (x, y, nx, ny) => nx + ny * 0.5 < -0.3 ? ARM[1] : nx < 0.4 ? ARM[2] : ARM[3]);
      ell(g, 40, 38, 5, 2, "#2a2421");
      lineW(g, 33, 39, 22, 44, 2, ARM[4]);
      rubble(g, 2, 46, 36, 46, 18, [C[0], C[2], C[4]], o.seed);
      o.burn(24, 22, 24, 0.7); o.scorch(24, 30, 26, 14);
      return;
    }
    /* the steel dome */
    const dy = cy - 9;
    ell(g, cx, dy, 13, 9, (x, y, nx, ny) => {
      if (ny > 0.55 && y > dy + 3) return null;
      const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny)), li = -0.6 * nx + 0.2 * (1 + ny) + 0.75 * nz - 0.25;
      return ARM[clamp(Math.round((1 - li) * 2.6 + bay(x, y) * 0.8), 0, 4)];
    });
    R(g, cx - 12, dy + 3, 25, 1, ARM[4]);
    for (let x = cx - 12; x <= cx + 12; x++) { const nx = (x + 0.5 - cx) / 13, e = Math.round(Math.sqrt(Math.max(0, 1 - nx * nx)) * 4); for (let y = dy + 4; y <= dy + 4 + e; y++) P(g, x, y, nx < -0.4 ? ARM[2] : nx < 0.4 ? ARM[3] : ARM[4]); }
    R(g, cx - 4, dy - 6, 6, 3, ARM[0]); R(g, cx - 4, dy - 4, 6, 1, ARM[3]); P(g, cx - 3, dy - 6, "#e9ecdf");
    R(g, cx - 12, dy + 1, 25, 1, "#b8452e");
    /* the gun, aimed south-west down the approach */
    R(g, cx - 5, dy + 3, 5, 4, "#2a2c30");
    for (let k = 0; k < 13; k++) { P(g, cx - 6 - k, dy + 6 + Math.round(k * 0.55), "#1f2024"); P(g, cx - 6 - k, dy + 5 + Math.round(k * 0.55), k % 4 === 0 ? "#8a8e96" : "#45484e"); }
    R(g, cx - 20, dy + 11, 3, 3, "#1f2024");
  } };

  SPEC.minib = { up: 12, draw(g, s, o) {
    const cx = 12, cy = 16, C = CON;
    shHull(s, cylPts(cx, cy, 10, 7, 9));
    if (o.dead) {
      ell(g, cx, cy, 10, 6, "#2a2320");
      for (let x = 2; x <= 22; x++) { const nx = (x - cx) / 10, hh = Math.round((1 - nx * nx) * 5 * (0.4 + vn(x / 2, 9) * 0.8)); for (let y = cy + 3 - hh; y <= cy + 4; y++) P(g, x, y, y === cy + 3 - hh ? C[0] : nx < 0 ? C[1] : C[3]); }
      rubble(g, 0, 24, 18, 23, 9, [C[0], C[2], C[4]], o.seed);
      o.burn(12, 12, 12, 0.6); o.scorch(12, 17, 12, 7);
      return;
    }
    ell(g, cx, cy - 2, 10, 10, (x, y, nx, ny) => {
      if (y > cy + 4) return null;
      const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny)), li = -0.6 * nx + 0.25 * (1 + ny) + 0.75 * nz - 0.25;
      return C[clamp(Math.round((1 - li) * 2.4 + bay(x, y) * 0.8), 0, 4)];
    });
    R(g, 5, cy - 1, 14, 2, "#120f0d"); R(g, 5, cy + 1, 14, 1, C[0]); R(g, 5, cy - 2, 14, 1, C[3]);
    P(g, 11, cy - 1, "#3d434c"); P(g, 12, cy - 1, "#7f8792");
    P(g, 16, cy - 7, "#e4572e"); P(g, 16, cy - 8, "#ff9a7c");
  } };

  SPEC.sam = { up: 26, draw(g, s, o) {
    const A = ARM;
    shHull(s, boxPts(7, 24, 41, 42, 7));
    const plat = () => {
      for (let y = 17; y < 35; y++) for (let x = 7; x <= 41; x++) P(g, x, y, y === 17 ? A[0] : (x - 7) % 9 === 0 ? A[2] : hash(x, y * 3) > 0.92 ? A[2] : A[1]);
      for (let y = 35; y < 42; y++) for (let x = 7; x <= 41; x++) P(g, x, y, y === 35 ? A[1] : y === 41 ? A[4] : x > 38 ? A[4] : A[3]);
      for (const wx of [12, 36]) { ell(g, wx, 41, 3, 3, "#26262a"); P(g, wx - 1, 40, "#6a6a70"); }
      R(g, 20, 37, 8, 2, "#e2b33c"); for (let x = 20; x < 28; x += 2) P(g, x, 37 + (x & 2 ? 1 : 0), "#2b2622");
    };
    if (o.dead) {
      plat();
      lineW(g, 22, 28, 30, 16, 3, A[4]); lineW(g, 23, 27, 28, 19, 1, A[2]);
      /* a missile down on the ground, broken */
      lineW(g, 2, 46, 18, 38, 3, "#d6d2c6"); line(g, 3, 45, 17, 38, "#f4f2ec"); line(g, 3, 47, 18, 40, "#8f8a7e");
      lineW(g, 22, 45, 30, 43, 3, "#c9c4b6"); R(g, 31, 42, 3, 3, "#c0533a");
      rubble(g, 4, 44, 40, 47, 12, [A[0], A[2], A[4]], o.seed);
      o.burn(24, 26, 24, 0.75); o.scorch(24, 32, 26, 14);
      return;
    }
    plat();
    /* the launcher: a pivot, two rails, two missiles climbing north */
    R(g, 19, 12, 10, 8, A[3]); R(g, 19, 12, 10, 2, A[1]);
    shHull(s, [[16, 34, 8], [20, 34, 8], [16, 6, 30], [20, 6, 30], [28, 34, 8], [32, 34, 8], [28, 6, 30], [32, 6, 30]]);
    for (const mx of [17, 29]) {
      const yb = 24, yt = -24;
      R(g, mx + 1, yt + 6, 3, yb - yt - 2, "#2d3033");
      for (let y = yt; y <= yb; y++) {
        const fromNose = y - yt;
        const w = fromNose < 2 ? 1 : fromNose < 4 ? 2 : fromNose < 6 ? 3 : 4;
        const x0 = mx + 2 - (w >> 1);
        for (let i = 0; i < w; i++) {
          let c = i === 0 ? "#f4f2ec" : i === w - 1 ? "#8f8a7e" : i === 1 ? "#dcd8cc" : "#b9b4a6";
          if (fromNose < 7) c = i === 0 ? "#f2a588" : i === w - 1 ? "#8e3a24" : "#c0533a";
          if (fromNose === 15 || fromNose === 16) c = i === 0 ? "#6a6e76" : "#3d434c";
          P(g, x0 + i, y, c);
        }
      }
      for (const fy of [-6, yb - 4]) { R(g, mx - 1, fy, 2, 4, "#8f8a7e"); R(g, mx + 4, fy, 2, 4, "#5c5a52"); P(g, mx - 1, fy, "#dcd8cc"); }
      R(g, mx, yb + 1, 4, 1, "#26262a");
    }
  } };

  SPEC.plane = { up: 20, pl: 4, pr: 4, draw(g, s, o) {
    const dead = o.dead, gz = dead ? 0 : 4, cx = 36;
    const L = ["#d9dddc", "#c0c5c5", "#a7adae", "#8b9192", "#6c7273", "#4d5355"], camo = "#8f9886";
    const U = (Q, dz = 0) => Q.map(([x, y]) => [x, y - gz - dz]);
    const wingL = [[32, 33], [5, 17], [5, 13], [32, 12]], wingR = wingL.map(([x, y]) => [72 - x, y]);
    const tailL = [[33, 9], [22, 4], [22, 1], [33, 2]], tailR = tailL.map(([x, y]) => [72 - x, y]);
    const fus = [[36, 47], [39, 41], [40, 31], [40, 5], [38, 0], [34, 0], [32, 5], [32, 31], [33, 41]];
    const brokeR = [[40, 31], [52, 25], [55, 15], [40, 12]];
    const parts = dead ? [wingL, brokeR, tailL, tailR] : [wingL, wingR, tailL, tailR];
    for (const q of parts.concat([fus])) shHull(s, q.map(([x, y]) => [x, y, gz + 2]));
    /* thickness: the silhouette a little lower, dark */
    for (const q of parts) poly(g, U(q, -1), L[5]);
    poly(g, U(fus, -3), L[5]);
    const skin = (x, y) => {
      let c = L[2];
      if (vn(x / 7 + 3, y / 5) > 0.58) c = camo;
      if (hash(x * 3, y * 7) > 0.95) c = L[3];
      return c;
    };
    for (const q of parts) poly(g, U(q), (x, y) => {
      const lead = !inPoly(x + 0.5, y + 1.5, U(q));
      const trail = !inPoly(x + 0.5, y - 0.5, U(q));
      return lead ? L[0] : trail ? L[4] : skin(x, y);
    });
    poly(g, U(fus), (x, y) => { const dx = x - cx; return dx <= -3 ? L[1] : dx === -2 ? L[0] : dx >= 3 ? L[4] : dx >= 2 ? L[3] : skin(x, y); });
    /* intakes, canopy, nose cone, roundels */
    R(g, 30, 30 - gz, 2, 4, "#26292c"); R(g, 41, 30 - gz, 2, 4, "#26292c");
    if (!dead) {
      ell(g, cx, 38 - gz - 1, 2.6, 4.5, (x, y, nx, ny) => nx < -0.2 && ny < 0 ? "#bfe0ee" : ny < 0.3 ? "#3f6f8c" : "#294e63");
      P(g, cx - 1, 35 - gz - 1, "#f4fbff");
    }
    R(g, cx - 1, 44 - gz, 3, 3, "#3c4146"); P(g, cx - 1, 44 - gz, "#6f767c");
    for (const [rx, ry] of dead ? [[16, 21]] : [[16, 21], [56, 21]]) { ell(g, rx, ry - gz, 2.6, 2.2, "#f2efe6"); ell(g, rx, ry - gz, 1.3, 1.2, "#c0533a"); }
    /* the fin, standing up at the tail */
    for (let y = 2; y <= 11; y++) {
      const zt = 4 + Math.round((11 - y) * 1.1), y0 = y - gz - 2;
      for (let z = 0; z < zt; z++) { P(g, cx - 1, y0 - z, z === zt - 1 ? L[0] : L[2]); P(g, cx, y0 - z, z === zt - 1 ? L[1] : L[4]); }
    }
    shPost(s, cx - 1, 6, 2, gz + 14, gz + 2);
    if (!dead) {
      for (const [gx, gy] of [[cx, 42], [31, 23], [41, 23]]) { R(g, gx, gy - gz + 1, 1, gz, "#2a2d30"); R(g, gx - 1, gy, 3, 1, "#1a1c1e"); }
      return;
    }
    /* the broken wing on the ground, the tail fallen; burnt through */
    poly(g, [[58, 36], [70, 30], [71, 33], [60, 40]], (x, y) => hash(x, y) > 0.5 ? L[3] : L[4]);
    R(g, 34, 22, 5, 2, "#120d0b");
    flames(g, 36, 26, 6, o.seed); flames(g, 46, 20, 4, o.seed + 3);
    rubble(g, 4, 68, 34, 46, 20, [L[2], L[4], "#1a1714"], o.seed);
    o.burn(36, 22, 34, 0.9); o.scorch(36, 26, 38, 20);
  } };

  SPEC.dish = { up: 42, draw(g, s, o) {
    const C = CON, S = STL;
    ell(g, 24, 33, 17, 9, (x, y, nx, ny) => nx * nx + ny * ny > 0.75 ? (ny > 0 ? C[2] : C[0]) : (hash(x, y) > 0.9 ? C[2] : C[1]));
    if (o.dead) {
      /* the mast snapped, the dish down on the ground, crumpled */
      for (let y = 18; y <= 32; y++) { P(g, 22, y, S[1]); P(g, 26 + Math.round((32 - y) * 0.25), y, S[3]); if (y % 3 === 0) line(g, 22, y, 26 + Math.round((32 - y) * 0.25), y - 2, S[2]); }
      line(g, 22, 18, 27, 15, S[2]);
      shPost(s, 22, 32, 5, 14);
      ell(g, 13, 40, 12, 5, (x, y, nx, ny) => { const k = nx - ny * 0.6 + (hash(x * 3, y) - 0.5) * 0.8; return k < -0.5 ? "#dfe3e6" : k < 0.2 ? "#b4bcc4" : "#7f8792"; });
      for (let i = 0; i < 4; i++) line(g, 6 + i * 5, 37 + (i & 1), 9 + i * 5, 42, "#5c636e");
      rubble(g, 2, 46, 38, 46, 14, [S[0], S[2], S[4]], o.seed);
      o.burn(18, 34, 20, 0.6); o.scorch(20, 36, 22, 12);
      return;
    }
    /* an equipment cabinet beside the mast */
    shHull(s, boxPts(31, 26, 41, 34, 8));
    for (let y = 18; y < 26; y++) for (let x = 31; x <= 41; x++) P(g, x, y, y === 18 ? ARM[0] : ARM[1]);
    for (let y = 26; y < 34; y++) for (let x = 31; x <= 41; x++) P(g, x, y, y === 33 ? ARM[4] : x === 41 ? ARM[4] : (x - 31) % 5 === 0 ? ARM[3] : ARM[2]);
    P(g, 33, 28, "#7fb069"); P(g, 35, 28, "#e8a33d");
    /* the lattice mast */
    const mt = -2, mb = 31;
    shPost(s, 21, 31, 6, 32);
    for (let y = mt; y <= mb; y++) {
      const sp = Math.round((y - mt) / (mb - mt) * 2);
      P(g, 22 - sp, y, S[0]); P(g, 26 + sp, y, S[3]);
      if ((y - mt) % 6 === 0) line(g, 22 - sp, y, 26 + sp, y, S[2]);
      if ((y - mt) % 6 === 3) { line(g, 22 - sp, y - 3, 26 + sp, y + 3, S[3]); }
    }
    /* the dish: its back shell, the bowl shaded inside, the rim, the feed on three struts */
    const dx = 24, dy = -14;
    shHull(s, cylPts(dx, dy + 14 + 30, 15, 6, 44, 34));
    ell(g, dx + 1, dy - 2, 16, 12, S[4]);
    ell(g, dx, dy, 16, 12, (x, y, nx, ny) => {
      const r2 = nx * nx + ny * ny;
      if (r2 > 0.8) return nx - ny < 0 ? "#f1f3f5" : S[2];
      const k = (nx - ny) * 0.5 + r2 * 0.35 + bay(x, y) * 0.35;
      return k > 0.45 ? "#e9edf0" : k > 0.1 ? S[0] : k > -0.25 ? S[1] : S[2];
    });
    for (let a = 0; a < 3; a++) { const t = -Math.PI / 2 + a * Math.PI * 2 / 3; line(g, dx + Math.cos(t) * 14, dy + Math.sin(t) * 10, dx - 1, dy + 5, S[3]); }
    R(g, dx - 3, dy + 4, 4, 4, S[4]); R(g, dx - 2, dy + 4, 2, 2, S[1]);
    P(g, dx + 14, dy - 8, "#e4572e");
  } };

  /* plaster or painted plank walls for the guard house, by zone */
  SPEC.guardhouse = { up: 34, draw(g, s, o) {
    const Wl = o.Z.wall, Rf = o.Z.roof, x0 = 3, x1 = 68, yN = 8, yS = 45, h = 17, eave = yS - h;
    const wall = (x, y, w) => {
      let c = Wl[1];
      if (hash(x * 3, y * 7) > 0.9) c = Wl[hash(x, y) > 0.5 ? 0 : 2];
      if (w < 2) c = Wl[3];
      if (w >= h - 2) c = Wl[2];
      if (x >= x1 - 1) c = Wl[3];
      if (x <= x0 + 1) c = Wl[0];
      return c;
    };
    shHull(s, boxPts(x0, yN, x1 + 1, yS, h)); shHull(s, [[x0, (yN + yS) / 2, h + 9], [x1, (yN + yS) / 2, h + 9], [x0, yN, h], [x1, yS, h]]);
    if (o.dead) {
      ruinBox(g, x0, x1, yN, yS, h, wall, [Wl[0], Wl[2], Wl[3], Wl[4]], o.seed);
      for (const [a, b] of [[10, 22], [40, 50]]) lineW(g, a, eave + 2, b, eave - 12, 2, Rf[3]);
      R(g, 28, yS - 10, 9, 10, "#120d0b");
      rubble(g, x0, x1, yS - 1, yS + 3, 22, [Rf[1], Rf[3], "#1c1714"], o.seed + 2);
      o.burn(34, eave - 4, 38, 0.8); o.scorch(36, yS - 8, 40, 18);
      return;
    }
    for (let y = eave; y < yS; y++) for (let x = x0; x <= x1; x++) P(g, x, y, wall(x, y, y - eave));
    gable(g, x0, x1, yN, yS, h, 9, Rf);
    door(g, 28, yS, 9, 12);
    window_(g, 10, eave + 5, 9, 6, Wl[4]); window_(g, 48, eave + 5, 9, 6, Wl[4]);
    R(g, 31, eave + 1, 3, 2, "#2b2119"); P(g, 32, eave + 2, "#ffd27a");
    R(g, x0, yS - 1, x1 - x0 + 1, 1, Wl[4]);
    if (o.zone === "arctic") for (let x = x0; x <= x1; x += 1 + (hash(x, 5) * 3 | 0)) { R(g, x, eave + 1, 1, 1 + (hash(x, 9) * 3 | 0), "#cfe8f4"); }
  } };

  SPEC.shack = { up: 26, draw(g, s, o) {
    const x0 = 3, x1 = 68, yN = 9, yS = 45, h = 17, rt = yN - h, wt = yS - h;
    shHull(s, boxPts(x0, yN, x1 + 1, yS, h));
    if (o.dead) {
      /* the mockup's burnt shack: charred planks, a hole burnt through the roof, the door blown, the window glowing */
      for (let x = x0; x <= x1; x++) for (let y = wt; y < yS; y++) {
        const k = (x - x0) % 5; let c = k === 0 ? "#3a2b20" : k < 3 ? "#7a5b3e" : "#6a4e35";
        const b = hash(x >> 1, y >> 2) + (Math.abs(x - 36) < 14 ? 0.5 : 0) - (y - wt) * 0.012;
        if (b > 0.95) c = k === 0 ? "#1c1512" : "#2e2420"; else if (b > 0.8) c = k === 0 ? "#2a201a" : "#4a3a2e";
        if (y === yS - 1) c = "#2a1f17"; if (y === wt || y === wt + 1) c = "#1e1714";
        P(g, x, y, c);
      }
      R(g, 9, yS - 13, 10, 13, "#120d0b"); R(g, 8, yS - 13, 1, 13, "#a07c55"); R(g, 19, yS - 12, 2, 12, "#5a4330");
      window_(g, 44, wt + 5, 12, 6, "#1a1210", true);
      for (let y = rt; y < wt; y++) for (let x = x0 - 1; x <= x1 + 1; x++) {
        let c = tin(x, y, rt, wt, x0, o.zone);
        const hx = x - 36, hy = (y - (rt + 15)) * 1.3, hd = Math.sqrt(hx * hx + hy * hy) + (hash(x, y) - 0.5) * 3.4;
        if (hd < 9) { const q = hash(x * 7, y * 3); c = q > 0.86 ? (q > 0.94 ? "#ffd27a" : "#ff8f3a") : (q > 0.5 ? "#2b1e18" : "#160f0d"); if ((x === 31 || x === 41) && q < 0.7) c = "#4a3a30"; }
        else if (hd < 10 && hash(x, y + 3) > 0.4) c = "#d5cfc0";
        else if (hd < 14) c = (x - x0) % 3 === 0 ? "#26221f" : "#3a3431";
        else if (hd < 19) c = (x - x0) % 3 === 0 ? "#4a4743" : "#615e58";
        P(g, x, y, c);
      }
      for (const [fx, fy, c] of [[33, 6, "#ff8f3a"], [34, 5, "#ffd27a"], [37, 7, "#ff8f3a"], [36, 4, "#ffe7a8"], [39, 8, "#e4572e"], [31, 8, "#e4572e"], [35, 3, "#ff8f3a"], [38, 5, "#ffd27a"]]) P(g, fx, rt + fy, c);
      const q = K.rng("debris", o.seed);
      for (let i = 0; i < 18; i++) { const x = Math.round(-6 + q() * 82), y = Math.round(yS + q() * 4); if (q() < 0.6) { R(g, x, y, 3, 1, "#3b2d22"); R(g, x, y - 1, 2, 1, "#6a4e35"); } else { R(g, x, y, 2, 1, "#9a9c94"); R(g, x, y + 1, 2, 1, "#4a4743"); } }
      o.scorch(36, yS - 6, 42, 18);
      return;
    }
    for (let x = x0; x <= x1; x++) for (let y = wt; y < yS; y++) {
      const k = (x - x0) % 5; let c = k === 0 ? WOOD[4] : k < 3 ? WOOD[1] : WOOD[2];
      if (k === 1 && hash(x, y >> 2) > 0.7) c = WOOD[0];
      if (hash(x * 5, y) > 0.95) c = WOOD[3];
      if (y === wt || y === wt + 1) c = WOOD[4];
      if (y === yS - 1) c = "#3a2a1c";
      P(g, x, y, c);
    }
    door(g, 9, yS, 10, 13);
    window_(g, 44, wt + 5, 12, 6, WOOD[4]);
    placard(g, 29, wt + 9, "#e8a33d");
    for (let y = rt; y < wt; y++) for (let x = x0 - 1; x <= x1 + 1; x++) {
      let c = tin(x, y, rt, wt, x0, o.zone);
      if (x === x0 - 1) c = "#c4c6bc"; if (x === x1 + 1) c = "#4a4b46";
      P(g, x, y, c);
    }
    /* a stove pipe */
    R(g, 54, rt + 3, 3, 9, "#2b2c2e"); R(g, 55, rt + 4, 1, 7, "#9a9da0"); R(g, 53, rt + 2, 5, 2, "#2b2c2e");
    shPost(s, 54, rt + 12 + h, 3, h + 9, h);
  } };

  SPEC.magazine = { up: 8, draw(g, s, o) {
    /* the mockup's earth-covered bunker: a mound, a concrete face with steel doors, hazard stripes, a placard, a vent */
    const cx = 36, cy = 29, rx = 35, ry = 27, gr = o.Z.ground;
    const MR = o.zone === "desert" ? ["#efd9a8", "#e0c28c", "#cfad77", "#bb9563", "#a07a4f", "#7f5e3d"] : gr.slice(0, 6);
    const rim = o.zone === "desert" ? "#4f3a28" : K.mix(gr[6], "#000000", 0.45);
    shHull(s, cylPts(cx, 28, rx, 18, 24).concat(boxPts(2, 26, 70, 47, 18)));
    const fx0 = 2, fx1 = 70, ft = 28, fb = 47;
    const mound = (dead) => {
      for (let y = cy - ry; y <= cy; y++) for (let x = cx - rx - 1; x <= cx + rx + 1; x++) {
        const nx = (x - cx) / rx, ny = (y - cy) / ry, r2 = nx * nx + ny * ny; if (r2 > 1) continue;
        const nz = Math.sqrt(1 - r2), li = -0.55 * nx + 0.25 * (1 + ny) + 0.75 * nz - 0.25;
        let idx = clamp(Math.round((1 - li) * 3 + bay(x, y) * 0.9), 0, 5);
        if (r2 > 0.9) idx = Math.max(idx, nx > 0 ? 5 : 4);
        let c = MR[idx]; const q = hash(x * 3, y * 11);
        if (q > 0.93 && r2 < 0.85) c = o.zone === "arctic" ? (q > 0.97 ? "#9aa3ad" : "#7b848f") : q > 0.97 ? "#a3ae5a" : "#748038";
        if (dead) { const cr = Math.hypot((x - 38) / 22, (y - 16) / 13) + (vn(x / 3, y / 3) - 0.5) * 0.5; if (cr < 1) c = cr < 0.55 ? (hash(x, y) > 0.8 ? "#3a2c24" : "#1a1412") : cr < 0.8 ? "#4a3a2e" : MR[5]; }
        P(g, x, y, c);
      }
      for (let x = cx - rx - 1; x <= cx + rx + 1; x++) for (let y = cy - ry - 1; y <= cy; y++) { const nx = (x - cx) / rx, ny = (y - cy) / ry, r2 = nx * nx + ny * ny; if (r2 > 1 && r2 < 1.12) P(g, x, y, rim); }
    };
    const face = (dead) => {
      for (let y = ft; y <= fb; y++) for (let x = fx0; x <= fx1; x++) {
        if (dead && y < ft + 2 + Math.round(vn(x / 3, 5) * 7) * (Math.abs(x - 36) < 20 ? 1 : 0.3)) continue;
        let c = "#bdb4a0";
        if (y === ft) c = "#e6dfcc"; else if (y === ft + 1) c = "#cfc6b2"; else if (y === fb) c = "#7b7363"; else if ((y - ft) % 6 === 0 || (x - fx0) % 12 === 0) c = "#a49b87";
        if (x === fx0) c = "#d8d0bc"; if (x === fx1) c = "#7a7262"; if (x > fx1 - 6) c = y === ft ? "#c9c1ad" : "#958c79";
        if (hash(x, y) > 0.94) c = "#8f8673";
        P(g, x, y, c);
      }
      if (!dead) { R(g, fx0 - 1, ft - 1, 1, fb - ft + 2, "#3a342c"); R(g, fx1 + 1, ft - 1, 1, fb - ft + 2, "#3a342c"); R(g, fx0 - 1, ft - 1, fx1 - fx0 + 3, 1, "#3a342c"); }
    };
    if (o.dead) {
      mound(true); face(true);
      R(g, 24, 33, 24, 15, "#120d0b"); R(g, 25, 34, 22, 3, "#2a1d17");
      /* a door blown out, lying on the ground */
      poly(g, [[48, 44], [60, 40], [63, 46], [51, 50]], (x, y) => (x + y) % 4 === 0 ? "#3a4148" : "#56606a");
      rubble(g, 0, 72, 44, 50, 30, ["#e6dfcc", "#a49b87", "#3a342c"], o.seed);
      flames(g, 34, 36, 5, o.seed); flames(g, 40, 16, 4, o.seed + 1);
      o.burn(36, 30, 34, 0.85); o.scorch(36, 40, 42, 18);
      return;
    }
    mound(false); face(false);
    R(g, 25, 32, 22, 16, "#23272b"); R(g, 26, 33, 20, 15, "#56606a");
    for (let y = 33; y < 48; y++) { P(g, 26, y, "#7d8892"); P(g, 35, y, "#2b3034"); P(g, 36, y, "#76818b"); P(g, 45, y, "#3a4148"); if (y % 4 === 0) { R(g, 27, y, 8, 1, "#4a535c"); R(g, 37, y, 8, 1, "#4a535c"); } }
    R(g, 33, 40, 1, 2, "#d4d8dc"); R(g, 38, 40, 1, 2, "#d4d8dc");
    for (let x = 24; x <= 47; x++) for (let y = 29; y <= 30; y++) P(g, x, y, ((x + y) >> 1) % 2 ? "#e2b33c" : "#2b2622");
    placard(g, 58, 37);
    R(g, 10, 35, 1, 5, "#5a5446"); R(g, 11, 35, 2, 1, "#5a5446"); P(g, 12, 37, "#5a5446"); R(g, 11, 39, 2, 1, "#5a5446");
    R(g, 50, 5, 3, 8, "#2b2c2e"); R(g, 51, 6, 1, 6, "#9a9da0"); R(g, 50, 6, 1, 6, "#c4c7c8"); R(g, 49, 4, 5, 2, "#2b2c2e"); R(g, 50, 4, 3, 1, "#8c8f91");
  } };

  SPEC.fuel = { up: 6, draw(g, s, o) {
    shHull(s, boxPts(2, 4, 70, 46, 11));
    const red = (r, c) => hash(r * 7 + 3, c * 13 + 1) > 0.66;
    if (o.dead) {
      const q = K.rng("drums", o.seed);
      for (let r = 0; r < 3; r++) for (let c = 0; c < 7; c++) {
        const x = 6 + c * 10 + (r % 2 ? 4 : 0), b = 15 + r * 11, k = q();
        if (k < 0.3) continue;
        if (k < 0.62) spr(g, DRUMSIDE, DRUMPAL[red(r, c) ? "red" : "olive"], x - 6, b - 7, "#1e1a14", q() > 0.5);
        else { drum(g, x, b, red(r, c)); if (k > 0.85) { ell(g, x, b - 10, 3, 1, "#120d0b"); flames(g, x, b - 11, 5, r * 9 + c); } }
      }
      for (let x = 2; x <= 70; x += 7) if (hash(x, 3) > 0.35) bag(g, x, 47, o.zone, hash(x, 7) > 0.5);
      rubble(g, 2, 70, 30, 46, 18, ["#c3cc8e", "#606c3c", "#1e1a14"], o.seed);
      o.burn(36, 26, 36, 0.85); o.scorch(36, 28, 44, 24);
      return;
    }
    for (let r = 0; r < 3; r++) { const b = 15 + r * 11; for (let c = 0; c < (r % 2 ? 6 : 7); c++) drum(g, 6 + c * 10 + (r % 2 ? 4 : 0), b, red(r, c)); }
    for (let x = 2; x <= 70; x += 7) bag(g, x, 47, o.zone);
    for (let x = 5; x <= 67; x += 7) bag(g, x, 43, o.zone);
  } };

  SPEC.pump = { up: 34, draw(g, s, o) {
    const C = CON, S = STL;
    /* the pump house, back left */
    const x0 = 3, x1 = 52, yN = 8, yS = 38, h = 18, eave = yS - h;
    const wall = (x, y, w) => { let c = C[1]; if (w === 0) c = C[0]; if ((x - x0) % 12 === 0) c = C[2]; if (hash(x * 3, y * 5) > 0.94) c = C[2]; if (w >= h - 1) c = C[3]; if (x >= x1 - 1) c = C[3]; return c; };
    shHull(s, boxPts(x0, yN, x1 + 1, yS, h));
    /* the tank, back right */
    const tx = 74, tb = 26;
    shHull(s, cylPts(tx, tb, 15, 8, 28));
    /* the manifold: two pipes east-west on supports */
    shHull(s, boxPts(0, 50, 96, 62, 7, 2));
    if (o.dead) {
      ruinBox(g, x0, x1, yN, yS, h, wall, [C[0], C[2], C[3], C[4]], o.seed);
      cyl(g, tx, tb, 15, 8, 14, [S[2], S[3], S[3], S[4], "#2a2d31"], false, (x, y, v) => v < 3 + Math.round(vn(x / 2, 3) * 5) ? (v === 0 ? S[1] : "#1a1513") : null);
      ell(g, tx, tb - 14, 13, 6, "#120d0b");
      flames(g, tx - 3, tb - 15, 6, o.seed); flames(g, tx + 5, tb - 14, 4, o.seed + 2);
      for (const py of [53, 60]) { lineW(g, 0, py, 30, py, 4, S[3]); lineW(g, 46, py + 1, 96, py, 4, S[3]); }
      ell(g, 40, 64, 12, 4, "#16120f");
      rubble(g, 0, 96, 40, 70, 40, [C[0], C[2], C[4]], o.seed + 5);
      o.burn(44, 34, 50, 0.85); o.scorch(48, 40, 50, 30);
      return;
    }
    for (let y = eave; y < yS; y++) for (let x = x0; x <= x1; x++) P(g, x, y, wall(x, y, y - eave));
    for (let y = yN - h; y < eave; y++) for (let x = x0; x <= x1; x++) {
      const e = Math.min(x - x0, x1 - x, y - (yN - h), eave - 1 - y);
      P(g, x, y, e === 0 ? (y === eave - 1 ? C[0] : x === x1 ? C[3] : C[1]) : e === 1 ? C[2] : hash(x * 7, y * 3) > 0.92 ? C[3] : C[2 - (vn(x / 6, y / 6) > 0.6 ? 1 : 0)]);
    }
    /* roof vents */
    for (const vx of [14, 30]) { ell(g, vx, eave - 14, 5, 3, S[3]); ell(g, vx, eave - 15, 4, 2, S[1]); line(g, vx - 3, eave - 15, vx + 3, eave - 15, S[4]); line(g, vx, eave - 17, vx, eave - 13, S[4]); }
    door(g, 8, yS, 12, 14);
    R(g, 7, yS - 15, 14, 1, "#e2b33c");
    window_(g, 28, eave + 4, 6, 4, C[4]); window_(g, 40, eave + 4, 6, 4, C[4]);
    /* the storage tank, banded, a ladder */
    cyl(g, tx, tb, 15, 8, 28, ["#e4e7e8", S[0], S[1], S[2], S[3], S[4]], (x, y, nx, ny) => nx * nx + ny * ny > 0.65 ? S[1] : (nx + ny < -0.4 ? "#f1f3f4" : S[0]),
      (x, y, v, nx) => v === 6 || v === 7 ? (nx < -0.2 ? "#e07a5c" : nx < 0.4 ? "#c0533a" : "#8e3a24") : (v > 10 && (v - 10) % 8 === 0 ? S[2] : null));
    for (let y = tb - 26; y < tb + 6; y++) { P(g, 66, y, S[4]); P(g, 69, y, S[4]); if (y % 3 === 0) R(g, 66, y, 4, 1, S[3]); }
    /* the pump: a motor on a skid, a flywheel */
    shHull(s, boxPts(40, 40, 62, 50, 9));
    for (let y = 31; y < 41; y++) for (let x = 40; x <= 62; x++) P(g, x, y, y === 31 ? ARM[0] : ARM[1]);
    for (let y = 41; y < 50; y++) for (let x = 40; x <= 62; x++) P(g, x, y, y === 49 ? ARM[4] : x > 60 ? ARM[4] : (x - 40) % 4 === 0 ? ARM[3] : ARM[2]);
    ell(g, 37, 43, 4, 6, (x, y, nx, ny) => nx * nx + ny * ny > 0.5 ? "#2a2d31" : nx < 0 ? S[1] : S[3]);
    /* the manifold: pipes running out both sides, valves, a red wheel */
    for (const [py, pr] of [[54, 3], [62, 3]]) {
      for (let x = 0; x < 96; x++) for (let k = -pr; k <= pr; k++) P(g, x, py + k, k === -pr ? S[0] : k === -pr + 1 ? S[1] : k >= pr - 1 ? S[4] : S[2]);
      for (let x = 6; x < 96; x += 22) { R(g, x, py - pr - 1, 3, pr * 2 + 3, S[3]); R(g, x, py - pr - 1, 1, pr * 2 + 3, S[1]); R(g, x + 1, py + pr + 1, 1, 3, "#2a2d31"); }
    }
    for (const vx of [28, 70]) { R(g, vx, 46, 2, 6, S[3]); ell(g, vx + 1, 45, 4, 2, "#c0533a"); ell(g, vx + 1, 45, 2, 1, "#5e2715"); P(g, vx - 2, 44, "#f2a588"); }
    line(g, 44, 50, 44, 51, S[4]);
    R(g, 82, 26, 3, 25, S[2]); R(g, 82, 26, 1, 25, S[0]);
  } };

  SPEC.radio = { up: 54, draw(g, s, o) {
    const Wl = o.Z.wall, x0 = 3, x1 = 31, yN = 14, yS = 42, h = 13, eave = yS - h;
    shHull(s, boxPts(x0, yN, x1 + 1, yS, h));
    for (let y = eave; y < yS; y++) for (let x = x0; x <= x1; x++) P(g, x, y, y === eave ? Wl[0] : y === yS - 1 ? Wl[4] : x >= x1 - 1 ? Wl[3] : (hash(x, y) > 0.92 ? Wl[2] : Wl[1]));
    for (let y = yN - h; y < eave; y++) for (let x = x0 - 1; x <= x1 + 1; x++) P(g, x, y, y === eave - 1 ? ARM[3] : x === x1 + 1 ? ARM[3] : y === yN - h ? ARM[0] : ARM[1 + (hash(x * 3, y) > 0.9 ? 1 : 0)]);
    door(g, 7, yS, 7, 10);
    window_(g, 19, eave + 3, 7, 4, Wl[4]);
    /* a whip antenna on the roof, a cable */
    line(g, 26, yN - h + 4, 26, -18, STL[2]); P(g, 26, -19, "#e4572e");
    line(g, 30, eave + 2, 40, 30, "#26272b");
    /* the mast and its guys */
    const mx = 40, mb = 30, mt = -48;
    shPost(s, mx - 1, mb, 4, mb - mt);
    for (const [gx, gy] of [[46, 46], [33, 44], [46, 18]]) { line(g, mx, mt + 14, gx, gy, "#8f949a"); R(g, gx - 1, gy, 2, 1, "#3d434c"); }
    for (let y = mt; y <= mb; y++) { P(g, mx - 1, y, STL[0]); P(g, mx + 1, y, STL[3]); if ((y - mt) % 4 === 0) R(g, mx - 1, y, 3, 1, (y >> 2) & 1 ? "#e4572e" : "#f2f0ea"); else P(g, mx, y, (y - mt) % 4 === 2 ? STL[2] : null || STL[4]); }
    R(g, mx - 3, mt + 2, 7, 1, STL[2]); R(g, mx - 2, mt + 8, 5, 1, STL[2]);
    P(g, mx, mt - 1, "#ff6a4a"); P(g, mx, mt - 2, "#ffd27a");
    ell(g, mx, mb + 1, 4, 2, CON[2]);
  } };

  SPEC.door = { up: 30, pl: 6, pr: 6, draw(g, s, o) {
    const yb = 14, hgt = 24, W = WOOD;
    const post = x => { R(g, x, yb - hgt - 2, 4, hgt + 3, W[2]); R(g, x, yb - hgt - 2, 1, hgt + 3, W[0]); R(g, x + 3, yb - hgt - 2, 1, hgt + 3, W[4]); R(g, x, yb - hgt - 3, 4, 1, W[1]); shPost(s, x, yb, 4, hgt + 2); };
    const leaf = Q => {
      poly(g, Q, (x, y) => ((x + y) % 4 === 0 || (x - y + 400) % 4 === 0) ? "#8e9096" : null);
      for (let i = 0; i < 4; i++) { const a = Q[i], b = Q[(i + 1) % 4]; lineW(g, a[0], a[1], b[0], b[1], 2, W[3]); line(g, a[0], a[1] - 1, b[0], b[1] - 1, W[1]); }
      lineW(g, Q[0][0], Q[0][1], Q[2][0], Q[2][1], 2, W[3]);
      shHull(s, [[Q[0][0], yb, 0], [Q[1][0], yb + (Q[1][1] - Q[0][1]), 0], [Q[0][0], yb, hgt], [Q[1][0], yb + (Q[1][1] - Q[0][1]), hgt]]);
    };
    post(-2); post(46);
    if (o.dead) {
      /* swung open, one leaf hanging off its hinge */
      leaf([[2, yb - 2], [12, yb - 15], [12, yb - 15 - hgt + 4], [2, yb - hgt]]);
      leaf([[46, yb - 2], [38, yb - 18], [37, yb - 18 - hgt + 8], [46, yb - hgt + 4]]);
      line(g, 2, yb - hgt - 4, 46, yb - hgt - 4, "#5c5852");
      rubble(g, 10, 40, yb + 3, yb + 8, 8, [W[0], W[2], W[4]], o.seed);
      o.scorch(24, yb + 2, 16, 6);
      return;
    }
    leaf([[2, yb], [23, yb], [23, yb - hgt + 2], [2, yb - hgt + 2]]);
    leaf([[25, yb], [46, yb], [46, yb - hgt + 2], [25, yb - hgt + 2]]);
    /* chain and padlock, barbed strands over the top */
    R(g, 22, yb - 12, 5, 2, "#575148"); R(g, 23, yb - 10, 3, 3, "#c9a24a"); P(g, 24, yb - 9, "#5a4320");
    for (let x = -2; x <= 50; x++) for (const k of [0, 4]) { const y = yb - hgt - 5 - k; P(g, x, y, (x + k) % 4 === 0 ? "#6e685e" : "#cbc4b4"); if ((x + k * 3) % 6 === 0) { P(g, x, y - 1, "#575148"); P(g, x, y + 1, "#575148"); } }
    /* a sign */
    R(g, 8, yb - 17, 10, 7, "#2a1d17"); R(g, 9, yb - 16, 8, 5, "#efe6d2"); R(g, 9, yb - 16, 8, 1, "#d24c30"); R(g, 10, yb - 14, 6, 1, "#5a5248"); R(g, 10, yb - 12, 4, 1, "#5a5248");
  } };

  SPEC.pyramid = { up: 22, draw(g, s, o) {
    const C = CON, bx0 = 6, bx1 = 42, yN = 10, yS = 44;
    const ax = 24, ay = 27, hgt = o.dead ? 0 : 26, apex = [ax, ay - hgt];
    shHull(s, [[bx0, yN, 0], [bx1, yN, 0], [bx0, yS, 0], [bx1, yS, 0], [ax, ay, o.dead ? 14 : 26]]);
    const tex = (x, y, base) => { const q = hash(x * 3, y * 5); return q > 0.93 ? C[Math.min(4, base + 1)] : q < 0.05 ? C[Math.max(0, base - 1)] : C[base]; };
    if (o.dead) {
      /* the top knocked off: a stump with a broken crown */
      const top = 14, cut = [[13, 18 - top], [36, 19 - top], [36, 30 - top], [13, 30 - top]];
      poly(g, [[bx0, yS], [bx0, yN], [13, 18 - top], [13, 30 - top]], (x, y) => tex(x, y, 0));
      poly(g, [[bx1, yS], [bx1, yN], [36, 19 - top], [36, 30 - top]], (x, y) => tex(x, y, 3));
      poly(g, [[bx0, yS], [bx1, yS], [36, 30 - top], [13, 30 - top]], (x, y) => tex(x, y, 1));
      poly(g, cut, (x, y) => hash(x, y) > 0.6 ? C[2] : C[1]);
      ell(g, 30, 12, 3, 2, "#3a3631");
      rubble(g, 0, 48, 40, 47, 18, [C[0], C[2], C[4]], o.seed);
      o.burn(24, 14, 22, 0.35); o.scorch(24, 34, 22, 12);
      return;
    }
    poly(g, [[bx0, yN], [bx0, yS], apex], (x, y) => { const c = tex(x, y, 0); return o.zone === "arctic" && y < 16 + (x - bx0) * 0.5 && hash(x, y) > 0.3 ? "#ffffff" : c; });
    poly(g, [[bx1, yN], [bx1, yS], apex], (x, y) => tex(x, y, 3));
    poly(g, [[bx0, yS], [bx1, yS], apex], (x, y) => { const c = tex(x, y, 1); return (y - apex[1]) % 9 === 8 ? C[2] : c; });
    line(g, apex[0], apex[1], bx0, yS, "#efece4"); line(g, apex[0], apex[1], bx1, yS, C[2]);
    line(g, apex[0], apex[1], bx0, yN, C[0]);
    R(g, bx0, yS, bx1 - bx0 + 1, 1, C[4]);
  } };

  SPEC.lever = { up: 22, draw(g, s, o) {
    const pulled = o.extra === 1, A = ARM;
    shHull(s, boxPts(5, 12, 18, 18, 10));
    for (let y = 2; y < 8; y++) for (let x = 5; x <= 18; x++) P(g, x, y, y === 2 ? A[0] : A[1]);
    for (let y = 8; y < 18; y++) for (let x = 5; x <= 18; x++) P(g, x, y, y === 17 ? A[4] : x === 18 ? A[4] : x === 5 ? A[1] : A[2]);
    R(g, 7, 10, 5, 3, "#1f2226"); P(g, 8, 11, pulled ? "#7fb069" : "#e4572e"); P(g, 10, 11, pulled ? "#7fb069" : "#3a3c41");
    ell(g, 14, 12, 2, 2, "#e9e4d8"); P(g, 14, 12, "#1f2226"); P(g, 15, 11, "#1f2226");
    R(g, 7, 14, 9, 1, "#e2b33c");
    R(g, 11, 18, 2, 3, "#26272b");
    /* the lever on the right flank, up or pulled down */
    R(g, 18, 9, 2, 3, A[4]);
    const [hx, hy] = pulled ? [22, 15] : [21, -6];
    lineW(g, 19, 10, hx, hy, 1, "#8a8e96"); line(g, 20, 10, hx + 1, hy, "#3a3c41");
    ell(g, hx, hy, 2, 2, "#c0533a"); P(g, hx - 1, hy - 1, "#f2a588");
    shPost(s, 19, 12, 2, 16, 4);
  } };

  SPEC.pit = { up: 2, noOutline: true, draw(g, s, o) {
    const z = o.zone, Zs = o.Z.scrub;
    const st = z === "desert" ? ["#c2a46a", "#9a7e4f", "#6e5636"] : z === "temperate" ? ["#9c8456", "#7a6640", "#56472c"] : ["#8a7656", "#6a5a40", "#4a3e2c"];
    const leaf = z === "desert" ? ["#a8a35a", "#7d8a45", "#5e6b33"] : z === "temperate" ? ["#7fae4c", "#56863a", "#3f6b2a"] : ["#ffffff", "#e6ecf4", "#c3cfe0"];
    /* disturbed earth round the edge, the dark of the hole between the sticks, then sticks and leaves */
    const inside = (x, y) => Math.abs((x - 24) / 21) ** 4 + Math.abs((y - 12) / 9) ** 4 + (vn(x / 3, y / 3) - 0.5) * 0.35 < 1;
    for (let y = 1; y < 24; y++) for (let x = 1; x < 48; x++) {
      if (!inside(x, y)) { if (inside(x, y - 1) || inside(x - 1, y) || inside(x + 1, y)) P(g, x, y, o.Z.dirt[4]); else if (inside(x, y + 2) && hash(x, y) > 0.4) P(g, x, y, o.Z.dirt[2]); continue; }
      P(g, x, y, "#1a130e");
    }
    const r = K.rng("pit", z);
    for (let i = 0; i < 26; i++) {
      const x = 3 + r() * 42, y = 2 + r() * 20, a = (r() - 0.5) * 0.9 + (i & 1 ? 0 : Math.PI / 2 * 0.25), L = 6 + r() * 12;
      const x1 = x + Math.cos(a) * L, y1 = y + Math.sin(a) * L * 0.6;
      for (let k = 0; k <= L; k++) { const px = Math.round(x + (x1 - x) * k / L), py = Math.round(y + (y1 - y) * k / L); if (inside(px, py)) { P(g, px, py, st[k % 5 === 0 ? 2 : 1]); if (inside(px, py - 1)) P(g, px, py - 1, st[0]); } }
    }
    for (let i = 0; i < 70; i++) { const x = Math.round(3 + r() * 42), y = Math.round(2 + r() * 20); if (!inside(x, y)) continue; const c = leaf[r() * 3 | 0]; P(g, x, y, c); if (r() > 0.5) P(g, x + 1, y, leaf[Math.min(2, (r() * 3 | 0) + 1)]); }
    if (z === "arctic") for (let i = 0; i < 40; i++) { const x = Math.round(3 + r() * 42), y = Math.round(2 + r() * 20); if (inside(x, y)) R(g, x, y, 2, 1, "#f3f6fb"); }
    void Zs;
  } };

  SPEC.tent = { up: 30, pl: 9, pr: 9, draw(g, s, o) {
    const T = o.zone === "arctic"
      ? { l: "#e9eef3", ls: "#d3dbe4", lh: "#f8fbfd", r: "#aebccb", rs: "#9aa9ba", ridge: "#ffffff", f1: "#c9d3de", f2: "#b8c3cf", b1: "#bdc7d2", b2: "#aab5c2", fl: "#f1f5f8", fr: "#93a1b3", O: "#3a4452" }
      : { l: "#a3aa69", ls: "#8d945a", lh: "#b5bc7b", r: "#61683d", rs: "#4f5531", ridge: "#c3c98a", f1: "#8f965c", f2: "#7e854f", b1: "#80874f", b2: "#6f7645", fl: "#b9bf7d", fr: "#5c6339", O: "#262a19" };
    const L = 4, Rr = 68, B = 44, PX = 36, h = 28, PT = B - h, BK = 8 - h, BB = 8;
    shHull(s, [[L, BB, 0], [Rr, BB, 0], [L, B, 0], [Rr, B, 0], [PX, B, h], [PX, BB, h]]);
    if (o.dead) {
      /* fallen in, burnt: a heap of canvas with the poles sticking up */
      blob(g, 36, 30, [[0, 0, 15], [-16, 4, 11], [16, 3, 12], [-6, -8, 10], [9, -6, 9]], (x, y, e, lx, ly) => {
        if (e) return T.O;
        const k = (lx * 0.6 + ly) / 14 + (hash(x * 3, y * 5) - 0.5) * 0.9 + bay(x, y) * 0.5;
        return k < -0.4 ? T.lh : k < 0.1 ? T.l : k < 0.5 ? T.f2 : T.r;
      }, 1.6);
      lineW(g, 24, 32, 18, 14, 2, "#3b2e21"); lineW(g, 46, 32, 53, 18, 2, "#3b2e21");
      flames(g, 30, 26, 5, o.seed);
      o.burn(36, 28, 26, 0.95); o.scorch(36, 34, 40, 14);
      return;
    }
    poly(g, [[L, B], [PX, PT], [PX, BK], [L, BB]], (x, y) => (x - L + y + 100) % 5 === 0 ? T.ls : x < L + 3 ? T.lh : T.l);
    poly(g, [[Rr, B], [PX, PT], [PX, BK], [Rr, BB]], (x, y) => (Rr - x + y + 100) % 5 === 0 ? T.rs : T.r);
    for (let y = BK; y <= PT; y++) P(g, PX, y, T.ridge);
    for (let t = 0; t <= 1; t += 0.02) { P(g, L + (PX - L) * t, BB + (BK - BB) * t, T.O); P(g, Rr + (PX - Rr) * t, BB + (BK - BB) * t, T.O); }
    R(g, L, BB, 1, B - BB, T.O); R(g, Rr, BB, 1, B - BB, T.O);
    /* the front, its door open, the flaps rolled */
    poly(g, [[L, B], [PX, PT], [Rr, B]], (x, y) => (y - PT) % 5 === 4 ? (x < PX ? T.b1 : T.b2) : (x < PX ? T.f1 : T.f2));
    const DL = 26, DR = 46, DT = 27;
    poly(g, [[DL, B], [PX, DT], [DR, B]], (x, y) => y > B - 2 ? "#14160d" : x < PX ? "#23271a" : "#1b1e13");
    for (let t = 0; t <= 1; t += 0.05) { R(g, DL + (PX - DL) * t - 1, B + (DT - B) * t, 2, 1, T.fl); R(g, DR + (PX - DR) * t, B + (DT - B) * t, 2, 1, T.fr); }
    for (let t = 0; t <= 1; t += 0.02) { P(g, L + (PX - L) * t, B + (PT - B) * t, T.O); P(g, Rr + (PX - Rr) * t, B + (PT - B) * t, T.O); }
    R(g, L, B, Rr - L + 1, 1, T.O); R(g, PX, PT - 3, 1, 3, "#3b2e21"); R(g, PX, BK - 3, 1, 3, "#3b2e21");
    const rope = (ax, ay, bx, by) => { for (let k = 0; k <= 1; k += 0.1) P(g, ax + (bx - ax) * k, ay + (by - ay) * k, "#ddd0ad"); R(g, bx, by, 1, 2, "#3b2e21"); };
    rope(PX, PT - 2, PX - 9, B + 3); rope(L + 2, BB + 2, L - 8, BB + 10); rope(Rr - 2, BB + 2, Rr + 8, BB + 10); rope(L + 1, B - 6, L - 7, B + 2); rope(Rr - 1, B - 6, Rr + 7, B + 2);
  } };

  SPEC.avfuel = { up: 30, draw(g, s, o) {
    const S = STL, ramp = ["#f4f6f6", "#dfe3e4", "#c3c9cc", "#9ca4aa", "#727b82", "#4e555b"], gr = o.zone === "arctic" ? o.Z.ground : o.Z.dirt;
    const tanks = [[19, 28], [53, 28]], rx = 15, ry = 7, h = 24;
    for (const [tx, tb] of tanks) shHull(s, cylPts(tx, tb, rx, ry, h));
    /* the berm round the front */
    const berm = () => {
      for (let x = 0; x < 72; x++) { const top = 40 + Math.round(Math.sin(x / 7) * 0.8); for (let y = top; y < 47; y++) P(g, x, y, y === top ? gr[0] : y === top + 1 ? gr[1] : y > 44 ? gr[5] : gr[3]); }
      shHull(s, boxPts(0, 41, 72, 47, 6));
    };
    if (o.dead) {
      for (const [tx, tb] of tanks) {
        const hh = tx < 30 ? 10 : 16;
        cyl(g, tx, tb, rx, ry, hh, [ramp[3], ramp[4], ramp[4], ramp[5], "#2a2d31", "#1d1f22"], false, (x, y, v) => v < 1 + Math.round(vn(x / 2.5, tx) * 6) ? (v === 0 ? ramp[2] : "#16120f") : null);
        ell(g, tx, tb - hh, rx - 2, ry - 2, "#120d0b");
        flames(g, tx - 4, tb - hh - 1, 7, tx); flames(g, tx + 4, tb - hh, 5, tx + 1);
      }
      berm();
      rubble(g, 0, 72, 36, 47, 24, [ramp[2], ramp[4], "#1a1714"], o.seed);
      o.burn(36, 20, 40, 0.95); o.scorch(36, 30, 46, 22);
      return;
    }
    for (const [tx, tb] of tanks) {
      cyl(g, tx, tb, rx, ry, h, ramp, (x, y, nx, ny) => { const r2 = nx * nx + ny * ny; return r2 > 0.7 ? ramp[2] : r2 < 0.08 ? S[3] : nx + ny < -0.3 ? "#ffffff" : ramp[1]; },
        (x, y, v, nx) => v >= 4 && v <= 6 ? (nx < -0.3 ? "#e07a5c" : nx < 0.5 ? "#c0533a" : "#8e3a24") : v === 13 && Math.abs(nx) < 0.5 ? "#4e555b" : null);
      for (let y = tb - h + 2; y < tb + 5; y++) { P(g, tx + 9, y, S[4]); P(g, tx + 12, y, S[4]); if (y % 3 === 0) R(g, tx + 9, y, 4, 1, S[3]); }
      R(g, tx - 6, tb - 10, 6, 1, "#4e555b"); R(g, tx - 6, tb - 8, 4, 1, "#4e555b");
    }
    berm();
    placard(g, 36, 43, "#e8a33d");
  } };

  SPEC.alarm = { up: 34, draw(g, s, o) {
    const S = STL;
    if (o.dead) {
      R(g, 11, 6, 2, 10, S[3]); P(g, 11, 6, S[1]); line(g, 12, 6, 15, 2, S[2]);
      ell(g, 7, 19, 4, 2, "#7d3a28"); ell(g, 7, 18, 3, 1, "#c0533a"); R(g, 3, 19, 3, 2, S[3]);
      P(g, 15, 1, "#ffd27a"); P(g, 16, 0, "#ff8f3a");
      shPost(s, 11, 16, 2, 10);
      o.scorch(12, 17, 8, 4);
      return;
    }
    shPost(s, 11, 16, 2, 30);
    R(g, 11, -14, 2, 31, S[1]); R(g, 12, -14, 1, 31, S[3]);
    R(g, 9, 4, 6, 5, ARM[2]); R(g, 9, 4, 6, 1, ARM[0]); P(g, 13, 6, "#7fb069");
    R(g, 10, 16, 4, 1, "#26272b");
    /* the siren: a red drum with a horn to the south-west, an amber beacon */
    ell(g, 12, -16, 5, 3, (x, y, nx, ny) => nx < -0.3 ? "#e07a5c" : nx < 0.4 ? "#c0533a" : "#8e3a24");
    for (let k = 0; k < 6; k++) R(g, 6 - k, -15 + Math.round(k * 0.3) - (k >> 1), 2, 3 + k, k === 5 ? "#3a1a10" : k & 1 ? "#a3aab3" : "#c9ced4");
    R(g, 10, -21, 4, 3, "#e8a33d"); R(g, 10, -21, 2, 1, "#ffd27a"); R(g, 10, -18, 4, 1, "#5e2715");
  } };

  SPEC.prox = { up: 16, draw(g, s, o) {
    if (o.dead) {
      R(g, 11, 12, 2, 4, WOOD[3]); P(g, 11, 12, WOOD[1]); P(g, 12, 11, WOOD[4]);
      rubble(g, 6, 18, 15, 19, 5, [WOOD[1], WOOD[3], OUT], o.seed);
      o.scorch(12, 16, 9, 5);
      return;
    }
    shPost(s, 11, 16, 2, 10); shHull(s, boxPts(7, 15, 17, 17, 16, 9));
    R(g, 11, 4, 2, 13, WOOD[2]); R(g, 11, 4, 1, 13, WOOD[0]);
    /* the charge: an olive canister on the stake, a yellow band, a red eye, a feeler wire */
    ell(g, 12, 2, 5, 2, ARM[0]);
    for (let y = 2; y < 8; y++) for (let x = 7; x <= 17; x++) P(g, x, y, y === 4 ? "#e2b33c" : x < 9 ? ARM[1] : x > 15 ? ARM[4] : ARM[2]);
    ell(g, 12, 2, 4, 1, ARM[1]);
    P(g, 12, 6, "#e4572e"); P(g, 13, 6, "#ff9a7c");
    line(g, 16, 1, 20, -6, "#8a8e96"); P(g, 20, -7, "#cfd3d8");
  } };

  SPEC.craft = { up: 16, draw(g, s, o) {
    const net = o.extra === 1, gz = 3;
    const C = ["#6b7179", "#565c64", "#454a51", "#363a40", "#282b30", "#1c1e22"];
    const body = [[36, 47], [69, 15], [62, 9], [54, 14], [46, 6], [36, 11], [26, 6], [18, 14], [10, 9], [3, 15]];
    const U = (Q, d = 0) => Q.map(([x, y]) => [x, y - gz - d]);
    shHull(s, body.map(([x, y]) => [x, y, gz + 2]));
    poly(g, U(body, -2), C[5]);
    poly(g, U(body), (x, y) => {
      const dx = x - 36, lead = !inPoly(x + 0.5, y + 1.5, U(body));
      if (lead) return dx < 0 ? "#8a919a" : C[2];
      let c = dx < -1 ? C[1] : dx > 1 ? C[3] : C[0];
      if (Math.abs(dx) < 8 && y < 36 - gz) c = dx < 0 ? C[0] : C[2];
      if ((Math.abs(dx) + y) % 11 === 0) c = C[4];
      return c;
    });
    /* engine humps, the canopy, a test-range stripe */
    for (const ex of [29, 43]) { ell(g, ex, 22 - gz, 3, 7, (x, y, nx) => nx < -0.3 ? C[0] : nx < 0.4 ? C[1] : C[3]); R(g, ex - 2, 14 - gz, 4, 1, C[5]); }
    ell(g, 36, 36 - gz - 1, 3, 4, (x, y, nx, ny) => nx < -0.2 && ny < 0 ? "#f3d98a" : ny < 0.3 ? "#9c7a2e" : "#5e4818");
    R(g, 34, 42 - gz, 5, 1, "#e9e4d8"); P(g, 36, 44 - gz, "#e4572e");
    if (!net) return;
    /* the camouflage net: poles, a sagging mesh, scraps of the zone's colours knotted in */
    const pal = o.zone === "desert" ? ["#d7b075", "#c79a62", "#ae8150", "#e4c38a"] : o.zone === "temperate" ? ["#6d9140", "#5b7e36", "#46672b", "#80a44c"] : ["#ffffff", "#e6ecf4", "#c3cfe0", "#d6dfeb"];
    const poles = [[12, 12], [36, 6], [60, 12], [22, 38], [50, 38]];
    shHull(s, [[0, 4, 0], [72, 4, 0], [0, 46, 0], [72, 46, 0], [36, 6, 12], [12, 12, 9], [60, 12, 9]]);
    const inside = (x, y) => x > 0 && x < 72 && y > -6 && y < 46 && Math.abs(x - 36) / 37 + Math.max(0, (y - 20) / 27) < 1.05;
    for (let y = -10; y < 48; y++) for (let x = 0; x < 72; x++) {
      if (!inside(x, y)) continue;
      const sag = Math.min(...poles.map(([px, py]) => Math.hypot(x - px, (y - py) * 1.3))) / 3;
      const yy = y - Math.round(Math.max(0, 9 - sag));
      const n = vn(x / 4, y / 3) + bay(x, y) * 0.3, mesh = (x + y) % 3 === 0 || (x - y + 300) % 3 === 0;
      if (n > 0.55) P(g, x, yy, pal[(hash(x >> 1, y >> 1) * 4) | 0]);
      else if (mesh) P(g, x, yy, n > 0.4 ? pal[2] : "#4a4436");
    }
    for (const [px, py] of poles) { R(g, px, py - 9, 1, 9, WOOD[3]); P(g, px, py - 10, WOOD[1]); }
  } };

  /* anything unknown: a crate, so a typo shows rather than crashes */
  SPEC.crate = { up: 4, draw(g, s, o) { shHull(s, boxPts(4, 8, 16, 20, 8)); crate(g, 6, 20); } };

  function build(k, dead, zone, extra) {
    const d = PM.OBJ[k] || { w: 1, h: 1 }, sp = SPEC[k] || SPEC.crate;
    const W = d.w * K.TS, H = d.h * K.TS, pl = sp.pl ?? 4, pr = sp.pr ?? 4, pb = sp.pb ?? 5, up = sp.up;
    const c = K.mk(pl + W + pr, up + H + pb), g = c.getContext("2d");
    const tall = up + 14, SR = Math.ceil(tall * SX) + 8, ST = Math.ceil(tall * -SY) + 6;
    const sh = K.mk(c.width + SR, c.height + ST), s = sh.getContext("2d");
    s.translate(pl, up + ST); g.translate(pl, up);
    const seed = seedOf(k + zone);
    const o = { k, W, H, zone, Z: K.Z[zone], dead, extra, seed, post: [], after: [] };
    o.burn = (cx, cy, rad, pow) => o.post.push(cv => burn(cv, cx + pl, cy + up, rad, pow, seed));
    o.scorch = (cx, cy, rx, ry) => o.after.push(gg => scorch(gg, cx, cy, rx, ry, seed));
    sp.draw(g, s, o);
    g.setTransform(1, 0, 0, 1, 0, 0);
    for (const f of o.post) f(c);
    if (!sp.noOutline) K.outline(c);
    g.translate(pl, up);
    for (const f of o.after) f(g);
    g.setTransform(1, 0, 0, 1, 0, 0);
    c.ax = pl; c.ay = up; c.up = up; c.fw = W; c.fh = H;
    c.sh = sh; c.shx = 0; c.shy = -ST;
    return c;
  }
  const NODEAD = new Set(["lever", "pit", "radio", "craft"]);
  PM.objArt = (k, dead, zone, extra) => {
    zone = zoneOf(zone); dead = !!dead && !NODEAD.has(k); extra = extra | 0;
    return K.get(`obj:${k}:${dead ? 1 : 0}:${zone}:${extra}`, () => build(k, dead, zone, extra));
  };

  /* =================== the minitank, stacked in layers =================== */
  /* Boxes in the tank's own frame (u forward, v to its right, z up), cut
   * into one-pixel slices and stacked: each slice drawn a pixel higher than
   * the last, so the top shows and the south flanks show below it. Sixteen
   * headings; the treads crawl with the frame. */
  const TANKP = { top: ARM[0], side: [ARM[1], ARM[2], ARM[3], ARM[4]], tread: ["#2b2a26", "#4b4840", "#6c685c"] };
  const KY = 0.8;
  function tankBoxes() {
    return [
      { u0: -9, u1: 9, v0: -6.6, v1: -3.4, z0: 0, z1: 3, k: "track" },
      { u0: -9, u1: 9, v0: 3.4, v1: 6.6, z0: 0, z1: 3, k: "track" },
      { u0: -9, u1: 8.8, v0: -6.8, v1: 6.8, z0: 4, z1: 4, k: "deck" },
      { u0: -8, u1: 7.5, v0: -4.2, v1: 4.2, z0: 1, z1: 6, k: "hull", slope: 4.5 },
      { cu: -1.5, cv: 0, r: 4, z0: 7, z1: 9, k: "turret" },
    ];
  }
  function tank(q, fr) {
    const a = q / 16 * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
    const W = 40, H = 34, ox = 20, oy = 22;
    const c = K.mk(W, H), g = c.getContext("2d");
    const sh = K.mk(W + 14, H + 6), s = sh.getContext("2d");
    const Lx = -0.8, Ly = 0.6;
    const boxes = tankBoxes();
    const inBox = (b, u, v, z) => {
      if (z < b.z0 || z > b.z1) return false;
      if (b.k === "turret") return Math.hypot(u - b.cu, v - b.cv) <= b.r - (z === b.z1 ? 0.8 : 0);
      if (u < b.u0 || u > b.u1 || v < b.v0 || v > b.v1) return false;
      if (b.k === "track" && (z === 0 || z === b.z1) && (u < b.u0 + 1 || u > b.u1 - 1)) return false;
      if (b.slope != null && u > b.slope && z > b.z1 - (u - b.slope) * 1.1) return false;
      return true;
    };
    const top = (b, u, z) => z === b.z1 || (b.slope != null && u > b.slope && z >= Math.floor(b.z1 - (u - b.slope) * 1.1));
    const side = (b, u, v) => {
      let nu = 0, nv = 0;
      if (b.k === "turret") { const d = Math.hypot(u - b.cu, v - b.cv) || 1; nu = (u - b.cu) / d; nv = (v - b.cv) / d; }
      else { const m = Math.min(u - b.u0, b.u1 - u, v - b.v0, b.v1 - v); if (m === u - b.u0) nu = -1; else if (m === b.u1 - u) nu = 1; else if (m === v - b.v0) nv = -1; else nv = 1; }
      const wx = nu * ca - nv * sa, wy = nu * sa + nv * ca;
      return wx * Lx + wy * Ly;
    };
    const ZMAX = 10;
    for (let z = 0; z <= ZMAX; z++) {
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const gx = x + 0.5 - ox, gy = (y + 0.5 - oy + z) / KY, u = gx * ca + gy * sa, v = -gx * sa + gy * ca;
        for (const b of boxes) {
          if (!inBox(b, u, v, z)) continue;
          let col;
          if (b.k === "track") {
            const t = ((Math.floor(u + 20 + fr * 1.5) % 3) + 3) % 3;
            col = top(b, u, z) ? (t === 0 ? TANKP.tread[2] : TANKP.tread[1]) : (z === 1 || z === 2) && Math.abs(((u + 20) % 4.5) - 2.2) < 1 ? "#6e6a5e" : t === 0 ? TANKP.tread[0] : TANKP.tread[1];
          } else if (top(b, u, z)) {
            col = b.k === "turret" ? TANKP.top : ARM[1];
            if (b.k === "turret" && Math.hypot(u - b.cu + 1.5, v - b.cv + 1.3) < 1.3) col = ARM[3];
            if (b.k === "hull" && u < -5) col = (Math.floor(v + 10) & 1) ? ARM[2] : ARM[3];
            if (b.k === "deck") col = ARM[2];
          } else {
            const l = side(b, u, v);
            col = TANKP.side[l > 0.45 ? 0 : l > -0.1 ? 1 : l > -0.6 ? 2 : 3];
            if (b.k === "turret" && z === 8) col = l > -0.1 ? "#c0533a" : "#8e3a24";
          }
          P(g, x, y, col);
          s.fillStyle = "#000"; s.fillRect(Math.round(x + z * SX), Math.round(y + z + z * SY), 1, 1);
        }
      }
      if (z === 8) {
        /* the gun, from the turret's face forward */
        const bz = 8.5;
        for (let k = 2.5; k <= 14; k += 0.5) {
          const gx = ox + k * ca, gy = oy + k * sa * KY - bz;
          P(g, gx, gy, k > 12.5 ? "#26272b" : (sa < 0 ? ARM[2] : ARM[3])); P(g, gx, gy + 1, ARM[4]);
          s.fillStyle = "#000"; s.fillRect(Math.round(gx + bz * SX), Math.round(gy + bz + bz * SY), 1, 2);
        }
      }
    }
    K.outline(c);
    c.ax = ox; c.ay = oy; c.sh = sh; c.shx = 0; c.shy = 0;
    return c;
  }
  PM.tankArt = (f, frame) => {
    const q = ((Math.round((f | 0) / 2) % 16) + 16) % 16, fr = (frame | 0) & 1;
    return K.get(`tank:${q}:${fr}`, () => tank(q, fr));
  };

  /* =================== the Osprey =================== */
  const OSP = ["#dfe3e6", "#c3c9ce", "#a6aeb5", "#8a939b", "#6c757e", "#4e565f", "#353b42"];
  /* hovering over the pickup, proprotors up, from above and in front. The
   * ladder hangs from c.ladder; the ground point below its middle is c.ax, c.ay */
  function ospreyBig(frame) {
    const W = 96, H = 64, cx = 48, c = K.mk(W, H), g = c.getContext("2d"), O = OSP;
    /* the tail: a stabiliser and two fins at the north end */
    for (const fx of [36, 60]) { R(g, fx - 1, 1, 3, 13, O[2]); R(g, fx - 1, 1, 1, 13, O[0]); R(g, fx + 1, 1, 1, 13, O[4]); }
    R(g, 35, 10, 27, 4, O[2]); R(g, 35, 10, 27, 1, O[0]); R(g, 35, 13, 27, 1, O[5]);
    /* the fuselage: its back seen from above, then its rounded nose toward us */
    for (let y = 12; y <= 50; y++) {
      const t = (y - 12) / 38, half = Math.round(y < 16 ? 3 + (y - 12) : y < 40 ? 7 : 7 - (y - 40) * 0.45);
      for (let x = cx - half; x <= cx + half; x++) {
        const nx = (x - cx) / Math.max(1, half);
        let col;
        if (y < 36) col = nx < -0.7 ? O[1] : nx < -0.2 ? O[0] : nx < 0.5 ? O[1] : nx < 0.85 ? O[3] : O[4];
        else col = nx < -0.6 ? O[2] : nx < 0.3 ? O[2] : nx < 0.75 ? O[4] : O[5];
        if (y >= 36 && y <= 40 && Math.abs(nx) < 0.85) col = y === 36 ? O[5] : nx < -0.3 && y === 37 ? "#bfe0ee" : y < 40 ? "#2b546a" : O[4];
        if (y === 38 && Math.abs(nx + 0.1) < 0.12) col = O[3];
        if (y > 46) col = nx < 0 ? O[4] : O[5];
        P(g, x, y, col);
      }
      void t;
    }
    /* sponsons along the lower flanks */
    for (const sx of [-1, 1]) for (let y = 26; y <= 42; y++) for (let k = 7; k <= 10; k++) { const x = cx + sx * k; if (y > 40 && k > 8) continue; P(g, x, y, sx < 0 ? (k === 10 ? O[2] : O[1]) : k === 10 ? O[5] : O[4]); }
    R(g, cx + 8, 34, 3, 4, O[6]);
    /* the refuelling probe */
    line(g, cx + 5, 40, cx + 9, 50, O[5]); P(g, cx + 9, 51, O[6]);
    /* the wing across the top, the nacelles standing at its tips */
    for (let x = 16; x <= 80; x++) for (let y = 20; y <= 27; y++) P(g, x, y, y === 20 ? O[0] : y >= 26 ? O[5] : (x > cx + 8 ? O[2] : O[1]));
    for (const nx0 of [18, 78]) {
      for (let x = nx0 - 4; x <= nx0 + 4; x++) for (let y = 8; y <= 32; y++) {
        const k = (x - nx0) / 4.5;
        let col = k < -0.6 ? O[1] : k < 0 ? O[0] : k < 0.5 ? O[2] : O[4];
        if (y > 29) col = k < 0 ? O[3] : O[5];
        if (y === 8) col = O[1];
        P(g, x, y, col);
      }
      R(g, nx0 - 4, 18, 9, 1, O[4]);
    }
    /* the rotors: hubs, a blurred disc and three blades each, turning opposite ways */
    for (const [hx, dir] of [[18, 1], [78, -1]]) {
      const hy = 7;
      g.globalAlpha = 0.16; g.fillStyle = "#f4f7fa"; K.disc(g, hx, hy, 20, 8); g.globalAlpha = 0.3;
      for (let k = 0; k < 64; k++) { const t = k / 64 * Math.PI * 2; P(g, hx + Math.cos(t) * 20, hy + Math.sin(t) * 8, "#ffffff"); }
      for (let b = 0; b < 3; b++) for (let sm = 0; sm < 3; sm++) {
        const t = dir * (frame / 8 * Math.PI * 2 / 3) + b * Math.PI * 2 / 3 - dir * sm * 0.16;
        g.globalAlpha = [0.85, 0.4, 0.18][sm];
        line(g, hx, hy, hx + Math.cos(t) * 19, hy + Math.sin(t) * 7.6, "#2a2f35");
      }
      g.globalAlpha = 1;
      ell(g, hx, hy, 3, 2, (x, y, nx) => nx < 0 ? O[1] : O[4]); P(g, hx - 1, hy - 1, "#ffffff");
    }
    /* lights: red port, green starboard, a white strobe that blinks */
    P(g, 15, 22, "#e4572e"); P(g, 81, 22, "#7fb069");
    if ((frame & 7) < 2) { P(g, cx, 11, "#ffffff"); P(g, cx - 1, 11, "#ffe7a8"); P(g, cx + 1, 11, "#ffe7a8"); }
    /* the cargo door, open, where the ladder hangs */
    R(g, cx - 3, 44, 6, 3, O[6]); R(g, cx - 2, 45, 4, 1, "#e8a33d");
    const s = K.mk(W, H + 30), sg = s.getContext("2d");
    sg.fillStyle = "#000"; R(sg, 16, 20, 65, 8, "#000"); R(sg, cx - 8, 12, 17, 40, "#000"); R(sg, 34, 10, 29, 4, "#000");
    sg.globalAlpha = 0.45; K.disc(sg, 18, 8, 20, 8); K.disc(sg, 78, 8, 20, 8); sg.globalAlpha = 1;
    c.ax = cx; c.ay = 47 + 54; c.ladder = { x: cx, y: 47 };
    c.sh = s; c.shx = Math.round(54 * SX); c.shy = Math.round(54 * -SY) + 47 + 54 - 47 - Math.round(54 * -SY) * 2 + 0;
    /* the shadow sits where the sun puts it: 54 pixels up, leant north-east */
    c.shx = Math.round(54 * SX); c.shy = Math.round(54 + 54 * SY);
    return c;
  }
  /* from straight above at half scale, nose south, proprotors forward */
  function ospreySmall(frame) {
    const W = 44, H = 34, cx = 22, c = K.mk(W, H), g = c.getContext("2d"), O = OSP;
    for (const fx of [16, 28]) R(g, fx, 1, 1, 5, O[4]);
    R(g, 15, 3, 15, 2, O[2]); R(g, 15, 3, 15, 1, O[0]);
    for (let y = 2; y <= 31; y++) { const half = y < 5 ? 1 : y > 27 ? Math.max(1, 3 - (y - 27) * 0.6) : 3; for (let x = Math.round(cx - half); x <= Math.round(cx + half); x++) P(g, x, y, x < cx - 1 ? O[1] : x < cx + 1 ? O[0] : O[3]); }
    R(g, cx - 1, 27, 3, 2, "#2b546a"); P(g, cx - 1, 27, "#bfe0ee");
    R(g, 8, 13, 29, 4, O[1]); R(g, 8, 13, 29, 1, O[0]); R(g, 8, 16, 29, 1, O[4]);
    for (const nx of [8, 36]) {
      R(g, nx - 2, 10, 4, 10, O[2]); R(g, nx - 2, 10, 1, 10, O[0]); R(g, nx + 1, 10, 1, 10, O[4]);
      R(g, nx - 1, 20, 2, 2, O[3]);
      /* the prop disc, edge-on: a blur with the blades flicking through it */
      g.globalAlpha = 0.35; R(g, nx - 9, 22, 19, 1, "#f4f7fa"); g.globalAlpha = 1;
      for (let b = 0; b < 3; b++) { const t = (frame / 8 + b / 3) * Math.PI * 2; const bx = Math.round(nx + Math.cos(t) * 9); P(g, bx, 22, "#2a2f35"); }
    }
    P(g, 6, 15, "#e4572e"); P(g, 38, 15, "#7fb069");
    K.outline(c, OUT);
    const s = K.mk(W, H), sg = s.getContext("2d");
    sg.fillStyle = "#000"; R(sg, 8, 13, 29, 4, "#000"); R(sg, cx - 3, 2, 7, 29, "#000"); R(sg, 15, 3, 15, 2, "#000"); R(sg, 6, 10, 4, 10, "#000"); R(sg, 34, 10, 4, 10, "#000");
    c.ax = cx; c.ay = 17; c.sh = s; c.shx = 14; c.shy = -6;
    return c;
  }
  const flipV = (a, key) => K.get(key, () => {
    const c = K.mk(a.width, a.height), g = c.getContext("2d");
    g.translate(0, a.height); g.scale(1, -1); g.drawImage(a, 0, 0);
    const s = K.mk(a.sh.width, a.sh.height), sg = s.getContext("2d");
    sg.translate(0, a.sh.height); sg.scale(1, -1); sg.drawImage(a.sh, 0, 0);
    c.ax = a.ax; c.ay = a.height - a.ay; c.sh = s; c.shx = a.shx; c.shy = a.height - a.shy - a.sh.height;
    return c;
  });
  PM.ospreyArt = (frame, small, leaving) => {
    const f = (frame | 0) & 7;
    if (small) {
      const a = K.get(`osp:s:${f}`, () => ospreySmall(f));
      return leaving ? flipV(a, `osp:s:${f}:n`) : a;
    }
    return K.get(`osp:b:${f}`, () => ospreyBig(f));
  };

  /* =================== the parafoil, the pods =================== */
  PM.chuteArt = () => K.get("chute", () => {
    const W = 34, H = 24, c = K.mk(W, H), g = c.getContext("2d"), cx = 17;
    const arc = x => { const n = (x + 0.5 - cx) / 16; return Math.round(n * n * 5); };
    /* lines from the leading edge down to the risers */
    g.globalAlpha = 0.85;
    for (const lx of [3, 8, 13, 21, 26, 31]) line(g, lx, 10 + arc(lx), cx + (lx < cx ? -1 : 1), H - 1, "#e9e2cc");
    g.globalAlpha = 1;
    for (let x = 1; x < W - 1; x++) {
      const a = arc(x), cell = Math.floor((x - 1) / 4.6), cl = cell & 1, edge = (x - 1) % 4.6 < 1;
      for (let y = 1 + a; y <= 8 + a; y++) {
        const v = y - 1 - a;
        let col;
        if (v < 6) col = cl ? (v < 1 ? "#f6b98a" : v < 4 ? "#e07a3c" : "#c0602f") : (v < 1 ? "#fffaf0" : v < 4 ? "#f1ead8" : "#d9cfb6");
        else col = (x % 2) ? "#3a2b22" : cl ? "#9a4a24" : "#a99e84";
        if (edge && v < 6) col = cl ? "#a8522a" : "#c7bca0";
        if (x < 4 || x > W - 5) col = K.mix(col, "#5e4a3a", 0.25);
        P(g, x, y, col);
      }
    }
    /* the stabiliser panels at the tips */
    for (const [x, d] of [[1, 1], [W - 2, -1]]) { R(g, x, 9 + arc(x), 1, 3, "#b8ad90"); P(g, x + d, 11 + arc(x), "#b8ad90"); }
    K.outline(c);
    c.ax = cx; c.ay = H - 1;
    return c;
  });
  /* a crate of supplies; with its round canopy while it falls */
  function podCrate(g, x, base) {
    const w = 12, top = base - 11;
    for (let i = 0; i < w; i++) for (let j = 0; j < 4; j++) P(g, x + i, top + j, j === 0 ? "#b6bd78" : (i % 4 === 1 ? "#7f8749" : "#9ba15d"));
    for (let i = 0; i < w; i++) for (let j = 4; j < 11; j++) { let c = j === 4 ? "#454a2a" : (i === 0 ? "#7c834a" : "#5d6237"); if (i === 3 || i === 8) c = "#3a3e24"; if (j === 10) c = "#353a20"; P(g, x + i, top + j, c); }
    R(g, x + 5, top + 6, 3, 1, "#e6e0c4"); R(g, x + 6, top + 5, 1, 3, "#e6e0c4");
    R(g, x + 10, top - 2, 1, 2, "#2c3a22"); P(g, x + 10, top - 3, "#c8f2a8");
  }
  PM.podArt = chute => K.get(`pod:${chute ? 1 : 0}`, () => {
    const W = 22, H = chute ? 36 : 17, c = K.mk(W, H), g = c.getContext("2d"), cx = 11, base = H - 2;
    if (chute) {
      for (const [a, b] of [[3, 6], [19, 16]]) line(g, a, 9, b, base - 11, "#e9e2cc");
      line(g, 9, 10, 9, base - 11, "#e9e2cc"); line(g, 13, 10, 13, base - 11, "#e9e2cc");
      ell(g, cx, 8, 10, 8, (x, y, nx, ny) => {
        if (y > 9) return null;
        const gore = Math.floor((Math.atan2(ny * 1.5, nx) + Math.PI) / (Math.PI / 4)) & 1;
        const k = nx * 0.6 - ny * 0.4 + bay(x, y) * 0.3;
        return gore ? (k < -0.2 ? "#f2a06a" : k < 0.4 ? "#d9804a" : "#b8663a") : (k < -0.3 ? "#fffaf0" : k < 0.3 ? "#ece4d0" : "#cfc6ac");
      });
      R(g, 1, 9, 21, 1, "#9a8e72");
    }
    podCrate(g, cx - 6, base);
    K.outline(c);
    const s = K.mk(W + 12, 16), sg = s.getContext("2d");
    shHull(sg, boxPts(cx - 6, 6, cx + 6, 14, 9));
    c.sh = s; c.shx = 0; c.shy = base - 14;
    c.ax = cx; c.ay = base;
    return c;
  });

  /* =================== small things =================== */
  PM.miscArt = k => K.get(`misc:${k}`, () => {
    let c, g;
    if (k === "cross") {
      c = K.mk(11, 11); g = c.getContext("2d");
      const W = "#fff8ec";
      R(g, 5, 1, 1, 3, W); R(g, 5, 7, 1, 3, W); R(g, 1, 5, 3, 1, W); R(g, 7, 5, 3, 1, W); P(g, 5, 5, "#e4572e");
      K.outline(c, OUT, true);
      c.ax = 5; c.ay = 5;
    } else if (k === "nade") {
      c = K.mk(5, 6); g = c.getContext("2d");
      spr(g, [".s.", "lgg", "gmd", ".d."], { s: "#a3aab3", l: "#a9b37a", g: "#6b764a", m: "#4e5735", d: "#353c25" }, 1, 1, OUT);
      c.ax = 2; c.ay = 3;
    } else if (k === "bomb" || k === "bomb0") {
      c = K.mk(12, 10); g = c.getContext("2d");
      spr(g, ["..w.....", "TTTTTTTT", "FFkkkkFF", "FFkrrkFf", "ffkkkkff", "ffffffff"], { w: "#c0533a", T: "#d8cf9e", F: "#b5ab78", f: "#8f875c", k: "#1f2226", r: "#e4572e" }, 2, 2, OUT);
      if (k === "bomb") { P(g, 4, 1, "#ff6a4a"); P(g, 4, 2, "#ffd27a"); } else P(g, 4, 2, "#5e2715");
      line(g, 5, 3, 7, 2, "#3d434c");
      c.ax = 6; c.ay = 8;
    } else if (k === "ladder") {
      c = K.mk(8, 56); g = c.getContext("2d");
      for (let y = 0; y < 56; y++) { const sw = Math.round(Math.sin(y / 9) * 0.6); P(g, 1 + sw, y, y % 3 ? "#cbb27e" : "#8a6f45"); P(g, 6 + sw, y, y % 3 ? "#b59c6a" : "#7a6038"); }
      for (let y = 3; y < 56; y += 5) { const sw = Math.round(Math.sin(y / 9) * 0.6); R(g, 2 + sw, y, 4, 1, "#9a7444"); R(g, 2 + sw, y - 1, 4, 1, "#c79a62"); P(g, 1 + sw, y, OUT); P(g, 6 + sw, y, OUT); }
      c.ax = 4; c.ay = 0;
    } else {
      c = K.mk(1, 1); c.ax = 0; c.ay = 0;
    }
    return c;
  });

  /* the bubble over a soldier: ? amber, he wonders; ! red, he has seen you */
  const GLYPH = { "!": [".X.", ".X.", ".X.", "...", ".X."], "?": ["XX.", "..X", ".X.", "...", ".X."] };
  PM.markArt = ch => K.get(`mark:${ch}`, () => {
    const c = K.mk(9, 13), g = c.getContext("2d"), cx = 4, top = 1, O = "#1c1412";
    const [bg, hi] = ch === "!" ? ["#e4572e", "#f2865f"] : ["#e8a33d", "#f6c873"];
    R(g, cx - 4, top, 9, 9, O); R(g, cx - 3, top - 1, 7, 11, O); R(g, cx - 3, top, 7, 9, bg); R(g, cx - 3, top, 7, 1, hi);
    R(g, cx - 1, top + 10, 3, 1, O); P(g, cx, top + 11, O); R(g, cx, top + 9, 1, 2, bg);
    const m = GLYPH[ch] || GLYPH["?"], gw = m[0].length;
    for (let j = 0; j < 5; j++) for (let i = 0; i < gw; i++) if (m[j][i] === "X") P(g, cx - ((gw - 1) >> 1) + i, top + 2 + j, "#fff8ec");
    c.ax = cx; c.ay = 12;
    return c;
  });

  /* =================== bangs and smoke, drawn straight onto the screen =================== */
  const FIRE = M.fire, SMK = M.smoke;
  /* the shape of every explosion: puffs at fixed offsets (dx, dy, size, delay), rays, debris */
  const BALL = [], SMOKEP = [], BITS = [];
  (() => {
    const r = PM.mulberry(1987);
    for (let i = 0; i < 9; i++) { const a = i / 9 * Math.PI * 2 + r() * 0.5, d = i === 0 ? 0 : 0.35 + r() * 0.3; BALL.push([Math.cos(a) * d, Math.sin(a) * d * 0.7 - 0.1, 0.45 + r() * 0.3 - (i ? 0.1 : 0), r() * 0.12]); }
    for (let i = 0; i < 8; i++) { const a = r() * Math.PI * 2, d = r() * 0.5; SMOKEP.push([Math.cos(a) * d, Math.sin(a) * d * 0.6, 0.35 + r() * 0.3, 0.15 + r() * 0.2, r()]); }
    for (let i = 0; i < 10; i++) { const a = -Math.PI * (0.1 + r() * 0.8); BITS.push([Math.cos(a) * (0.6 + r() * 0.8), Math.sin(a) * (0.8 + r() * 0.9), r()]); }
  })();
  const heat = h => h > 0.85 ? 0 : h > 0.65 ? 1 : h > 0.42 ? 2 : h > 0.2 ? 3 : 4;
  PM.drawBoom = (g, x, y, r, k) => {
    if (!(k >= 0 && k <= 1) || !(r > 0)) return;
    x = Math.round(x); y = Math.round(y);
    const sa = g.globalAlpha;
    /* dust ring along the ground */
    if (k > 0.06) {
      const dr = r * (0.55 + k * 0.75), a = (1 - k) * 0.55;
      g.globalAlpha = a; g.fillStyle = SMK[0];
      for (let i = 0; i < 40; i++) { const t = i / 40 * Math.PI * 2, j = 0.85 + ((i * 7) % 5) * 0.06; g.fillRect(Math.round(x + Math.cos(t) * dr * j), Math.round(y + Math.sin(t) * dr * 0.42 * j), 2, 1); }
      g.globalAlpha = a * 0.5; g.fillStyle = SMK[1]; K.disc(g, x, y, dr * 0.8, dr * 0.32);
    }
    /* smoke climbing off the top */
    if (k > 0.22) {
      const kk = (k - 0.22) / 0.78;
      for (let i = SMOKEP.length - 1; i >= 0; i--) {
        const [dx, dy, s, lag, q] = SMOKEP[i], t = Math.max(0, kk - lag * 0.4);
        const pr = Math.max(1, Math.round(r * s * (0.5 + t * 0.9))), px = Math.round(x + dx * r + t * r * 0.35), py = Math.round(y - r * 0.35 + dy * r - t * r * (1 + q * 0.6));
        const a = Math.min(1, t * 4) * (1 - kk) * 0.8;
        if (a <= 0.02) continue;
        puff(g, px, py, pr, a, kk < 0.4 ? SMK[3] : SMK[2], kk < 0.4 ? SMK[2] : SMK[1], SMK[4]);
      }
    }
    /* the fireball */
    if (k < 0.62) {
      const kk = k / 0.62;
      for (let i = BALL.length - 1; i >= 0; i--) {
        const [dx, dy, s, lag] = BALL[i], t = Math.max(0, kk - lag);
        const grow = Math.min(1, t / 0.25), pr = Math.max(1, Math.round(r * s * (0.35 + grow * 0.65) * (1 - Math.max(0, t - 0.7)))), px = Math.round(x + dx * r), py = Math.round(y - r * 0.38 + dy * r - t * r * 0.35);
        const h = 1 - t - (i ? 0.08 : 0), c = heat(h);
        g.globalAlpha = 1; g.fillStyle = c < 4 ? FIRE[Math.min(4, c + 1)] : SMK[3]; K.disc(g, px + 1, py + 1, pr, pr * 0.9);
        g.fillStyle = c < 4 ? FIRE[c] : SMK[2]; K.disc(g, px, py, pr, pr * 0.9);
        g.fillStyle = FIRE[Math.max(0, c - 1)]; K.disc(g, px - Math.round(pr * 0.3), py - Math.round(pr * 0.3), Math.max(1, Math.round(pr * 0.5)), Math.max(1, Math.round(pr * 0.4)));
      }
      /* debris thrown out on arcs */
      g.fillStyle = "#2a201a";
      for (const [vx, vy, q] of BITS) { const t = kk * (0.8 + q * 0.4); g.fillRect(Math.round(x + vx * r * t * 1.2), Math.round(y - r * 0.3 + vy * r * t * 1.4 + t * t * r * 1.3), q > 0.5 ? 2 : 1, 1); }
    }
    /* the flash */
    if (k < 0.14) {
      const f = 1 - k / 0.14, fr = Math.max(2, Math.round(r * (0.5 + (1 - f) * 0.3)));
      g.globalAlpha = f; g.fillStyle = FIRE[1]; K.disc(g, x, y - Math.round(r * 0.3), fr, fr * 0.8);
      g.fillStyle = "#ffffff"; K.disc(g, x, y - Math.round(r * 0.3), fr * 0.55, fr * 0.45);
      g.fillStyle = FIRE[0];
      for (let i = 0; i < 8; i++) { const t = i / 8 * Math.PI * 2, L = r * (0.9 + (i & 1) * 0.4); for (let d = fr; d < L; d += 2) g.fillRect(Math.round(x + Math.cos(t) * d), Math.round(y - r * 0.3 + Math.sin(t) * d * 0.7), 1, 1); }
    }
    g.globalAlpha = sa;
  };
  /* a thin column off a ruin, drifting north-east; t in ticks */
  PM.drawSmoke = (g, x, y, t) => {
    x = Math.round(x); y = Math.round(y);
    const N = 8, PER = 150, b = ((t / PER) % 1 + 1) % 1, sa = g.globalAlpha;
    const top = Math.ceil((1 - b) * N) - 1;
    for (let n = 0; n < N; n++) {
      const i = ((top - n) % N + N) % N, ph = (b + i / N) % 1;
      const r = Math.max(1, Math.round(1.5 + ph * 6.5)), px = Math.round(x + ph * 16 + Math.sin(ph * 7 + i) * 2), py = Math.round(y - 4 - ph * 52);
      const a = (1 - ph) * Math.min(1, ph * 7) * 0.75;
      if (a <= 0.02) continue;
      const dark = ph < 0.35;
      puff(g, px, py, r, a, dark ? "#4d474d" : "#8a848c", dark ? "#6e676d" : "#b4aeb4", dark ? "#2f2a2e" : "#5f5960");
    }
    g.globalAlpha = 1;
    for (let i = 0; i < 3; i++) if (hash((t >> 3) + i * 17, i) > 0.45) { g.fillStyle = i & 1 ? "#ffd27a" : "#ff8f3a"; g.fillRect(x - 2 + i * 2, y - 3 - ((t >> 2) + i * 3) % 6, 1, 1); }
    g.globalAlpha = sa;
  };

  PM.FX = { tracerP: "#fff2a8", tracerE: "#ff6b4a", flame: [FIRE[0], FIRE[1], FIRE[2], FIRE[3], FIRE[2], FIRE[1]] };
})();
