/* PumaMech -- the ground, and what stands on it.
 *
 * PM.tileArt(zone, id, v, n, tx, ty)   a 24x24 opaque canvas: the ground of
 *   one tile. v is the variant 0..3, n the neighbours of the same kind
 *   (1 north, 2 east, 4 south, 8 west), so trenches, banks, roads, floors,
 *   rough ground and minefields join up and only show an edge where the run
 *   ends. tx, ty: the tile's place in the world. Given, the ground is painted
 *   from world-space noise and its pebbles and tufts scattered by world
 *   position, so open ground never repeats; those tiles are kept in a cache
 *   of their own, emptied by PM.groundReset() (on a new map) or when full.
 *   Without them every continuous field is periodic over the tile, and a
 *   variant only changes the tile's middle, never its rim.
 * PM.groundReset()             forget the tiles painted for the last map.
 * PM.standArt(zone, id, v, n)  null for flat ground, or the upright part of a
 *   tile: a canvas whose (c.ax, c.ay) sits on the tile's bottom-left corner,
 *   sorted by the tile's south edge, with its shadow in c.sh at (c.shx, c.shy)
 *   from the canvas's top-left.
 * PM.tileArtSmall(zone, id, v) a 12x12 canvas for the fly-over map.
 *
 * Light from the low south-west sun: tops and west faces lit, shadows to the
 * north-east. Lifted from the approved mock (.impeccable/mocks/decision/
 * canon-tilted.html): the sand and its ripples, the trench, the terraced
 * ledge, the scrub, the boulders, the palms, the wire and the sandbags. */
"use strict";
(() => {
  const K = PM.K, T = PM.T, TS = K.TS, SX = K.SX, SY = K.SY;
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const sm = t => t * t * (3 - 2 * t);
  const frac = t => t - Math.floor(t);
  const TAU = Math.PI * 2;
  const mix = K.mix;
  const RGB = new Map();
  const rgb = h => { let c = RGB.get(h); if (!c) { c = K.rgb(h); RGB.set(h, c); } return c; };
  const q = (ramp, L) => ramp[clamp(Math.round(L), 0, ramp.length - 1)];
  const hs = (x, y, s = 0) => K.hash(x * 3 + s * 1013, y * 5 - s * 7919);

  /* ---- colours this file adds, in the character of the kit's ramps ---- */
  const W5 = K.MAT.wood;
  const X = {
    desert: {
      leaf: ["#c3c86f", "#94a147", "#6d7a33", "#4c5726", "#232912"],
      needle: ["#94a147", "#6d7a33", "#4c5726", "#33401c", "#1c2410"],
      bark: ["#a38353", "#8a6a44", "#5e4530", "#3e2c1b", "#2e2015"],
      tar: ["#a39a8a", "#8c8476", "#787064", "#655e55", "#4e4943"],
      floor: ["#efe4cb", "#e2d5b9", "#d3c4a5", "#bfae8e", "#a08f72", "#7b6d57"],
      foam: "#eef5ee", snow: null, scorch: ["#4a3c32", "#342a25", "#241e1c"],
    },
    temperate: {
      leaf: ["#b6d66a", "#86b24c", "#5f8f3a", "#3f6b2a", "#1d3416"],
      needle: ["#7da35a", "#5a8444", "#3e6534", "#2a4a26", "#132313"],
      bark: ["#9c7f5f", "#7d6247", "#5c4734", "#3f3125", "#2a2019"],
      tar: ["#959899", "#7f8284", "#6b6e70", "#585a5d", "#434547"],
      floor: [W5[0], mix(W5[0], W5[1], 0.5), W5[1], W5[2], W5[3], W5[4]],
      foam: "#e8f3f2", snow: null, scorch: ["#3e3a30", "#2c2924", "#1e1c1a"],
    },
    arctic: {
      leaf: ["#7a917c", "#58705e", "#3c5144", "#26362c", "#141e18"],
      needle: ["#6c8a73", "#4d6b57", "#34503f", "#22372b", "#111c16"],
      bark: ["#8a7564", "#6c5a4c", "#4f4238", "#352d27", "#221d19"],
      tar: ["#a0a7b1", "#8a919c", "#757c87", "#616772", "#4a4f58"],
      floor: ["#eef2f6", "#dce2ea", "#c7cfda", "#aeb8c6", "#919dae", "#717d8f"],
      foam: "#f6fbfd", snow: ["#ffffff", "#eef3f9", "#d6e0ec", "#b4c3d6"], scorch: ["#4b4648", "#343034", "#232024"],
    },
  };
  const PAINT = "#f3ecd8", WARN = K.MAT.red;

  /* ---- a pixel buffer ---- */
  const Buf = (w, h) => {
    const d = new Uint8ClampedArray(w * h * 4);
    return {
      w, h, d,
      set(x, y, c) {
        if (!c) return;
        x = Math.round(x); y = Math.round(y);
        if (x < 0 || y < 0 || x >= w || y >= h) return;
        if (typeof c === "string") c = rgb(c);
        const i = (y * w + x) * 4; d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255;
      },
      rect(x, y, ww, hh, c) { for (let j = 0; j < hh; j++) for (let i = 0; i < ww; i++) this.set(x + i, y + j, c); },
      on(x, y) { return x >= 0 && y >= 0 && x < w && y < h && d[(y * w + x) * 4 + 3] > 0; },
      canvas() { const c = K.mk(w, h); c.getContext("2d").putImageData(new ImageData(d, w, h), 0, 0); return c; },
    };
  };

  /* ---- where the tile lies in the world, while one is being painted ----
   * When the renderer says where a tile is (tx, ty), it is painted in WORLD
   * mode: every field below reads world pixels (WX + x, WY + y), so open
   * ground runs on across tiles with no grid; GL holds the tile's ground
   * level (dither included), GM marks the pixels that are plain ground
   * (where the scattered pebbles and tufts may land). Without a position the
   * old tile-periodic fields are used. */
  let WORLD = false, WX = 0, WY = 0;
  const GL = new Float32Array(TS * TS), GM = new Uint8Array(TS * TS);
  /* a random stream for a tile's own things: by position when it has one */
  const rngT = (...k) => WORLD ? K.rng(...k, WX, WY) : K.rng(...k);

  /* ---- noise that repeats every tile (so any tile meets any other) ---- */
  const hP = (i, j, p, s) => K.hash(((i % p) + p) % p + s * 101, ((j % p) + p) % p + s * 57);
  const vnP = (x, y, p, s) => {
    const xi = Math.floor(x), yi = Math.floor(y), u = sm(x - xi), w = sm(y - yi);
    const a = hP(xi, yi, p, s), b = hP(xi + 1, yi, p, s), c = hP(xi, yi + 1, p, s), d = hP(xi + 1, yi + 1, p, s);
    return a + (b - a) * u + (c - a) * w + (a - b - c + d) * u * w;
  };
  const pfbm = (x, y, s) => WORLD
    ? K.vn((WX + x) / 8 + s * 31.7, (WY + y) / 8 + s * 17.3) * 0.62 + K.vn((WX + x) / 4 - s * 13.1, (WY + y) / 4 + s * 7.9) * 0.38
    : vnP(x / 8, y / 8, 3, s) * 0.62 + vnP(x / 4, y / 4, 6, s + 1) * 0.38;
  /* 0 on the tile's rim, 1 in its middle: where a variant may differ (in the
     world there is no rim to keep: the fields run on) */
  const edgeW = (x, y) => { if (WORLD) return 1; const d = Math.min(x + 0.5, TS - 0.5 - x, y + 0.5, TS - 0.5 - y); return sm(clamp((d - 1.5) / 6, 0, 1)); };
  const vmid = (x, y, v, s = 0) => WORLD ? K.vn((WX + x) / 8 + s * 5.1 + 61, (WY + y) / 7 - s * 3.7 + 29) : K.vn(x / 8 + v * 17.3 + s * 5.1, y / 7 + v * 9.1 - s * 3.7);
  /* 0 on an edge whose neighbour is a different kind, 1 at r pixels in */
  const inner = (n, x, y, r) => {
    let d = r;
    if (!(n & 1)) d = Math.min(d, y + 0.5); if (!(n & 4)) d = Math.min(d, TS - 0.5 - y);
    if (!(n & 8)) d = Math.min(d, x + 0.5); if (!(n & 2)) d = Math.min(d, TS - 0.5 - x);
    return d / r;
  };
  /* a wobble along an edge that repeats every tile */
  const wob = (t, s) => Math.sin(TAU * t / TS + s) * 0.9 + Math.sin(TAU * 2 * t / TS + s * 2.3 + 1.3) * 0.6;

  /* ---- the open ground of each zone ---- */
  const ZP = {
    desert:    { base: 2.4, amp: 1.3, vamp: 2.0, rip: 1, rk: [1, 5], dith: 0.85, spk: 0.3 },
    temperate: { base: 3.0, amp: 1.5, vamp: 1.9, rip: 0, rk: [1, 5], dith: 0.85, spk: 0.7 },
    arctic:    { base: 1.6, amp: 1.2, vamp: 1.7, rip: 0.7, rk: [-2, 3], dith: 0.75, spk: 0.2 },
  };
  const RIPV = [1, 0.15, 0.75, 0.4];
  const gL = (zone, v, x, y) => {
    if (WORLD) return GL[clamp(y | 0, 0, TS - 1) * TS + clamp(x | 0, 0, TS - 1)];
    const p = ZP[zone], w = edgeW(x, y);
    let L = p.base + (pfbm(x, y, 1) - 0.5) * p.amp + w * (vmid(x, y, v) - 0.5) * p.vamp;
    if (p.rip) {
      /* sand ripples (snow sastrugi in the arctic): bands that repeat across tiles */
      const ph = (p.rk[0] * x + p.rk[1] * y) / TS + pfbm(x, y, 5) * 1.6;
      const s = p.rip * (0.5 + w * (RIPV[v] - 0.5)), f = frac(ph);
      if (f < 0.16) L -= 0.85 * s; else if (f < 0.32) L += 0.75 * s;
    }
    L += (K.hash(x * 7 + v * 131 + 3, y * 11 + v * 71) - 0.5) * p.spk;
    return L + K.bayer(x, y) * p.dith;
  };
  /* fe: feather dL in over 4 pixels from edges whose neighbour differs */
  const fillGround = (b, zone, v, dL = 0, ramp, fe) => {
    const r = ramp || K.Z[zone].ground;
    if (WORLD) {
      const R = rampRGB(r), top = R.length - 1, d = b.d;
      for (let y = 0, i = 0; y < TS; y++) for (let x = 0; x < TS; x++, i++) {
        const L = GL[i] + (fe === undefined ? dL : dL * inner(fe, x, y, 4));
        const k = L < 0 ? 0 : L > top ? top : Math.round(L), c = R[k], o = i * 4;
        d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; d[o + 3] = 255; GM[i] = 1;
      }
      return;
    }
    for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) b.set(x, y, q(r, gL(zone, v, x, y) + dL));
  };

  /* ================= the ground in world space ================= */
  const RAMPS = new WeakMap();
  const rampRGB = r => { let o = RAMPS.get(r); if (!o) { o = r.map(K.rgb); RAMPS.set(r, o); } return o; };
  const vn = K.vn, hash = K.hash;
  const fbm = (x, y) => vn(x / 46, y / 40) * 0.55 + vn(x / 18 + 31, y / 15 + 7) * 0.3 + vn(x / 6 + 91, y / 5 + 3) * 0.15;
  /* the mock's sand: broad swells, long dune bands, fields of ripples (a
     dark trough under a lit crest) that come and go */
  const levelDesert = (x, y) => {
    const big = vn(x / 72 + 5, y / 60 + 9);
    let L = 2.4 + (fbm(x, y) - 0.5) * 2.6 + Math.sin((x * 0.3 - y * 1.4) / 22 + big * 5.5) * 0.75;
    if (vn(x / 42 + 20, y / 36 + 40) > 0.42) {
      const ph = (x * 0.16 + y + vn(x / 24, y / 20) * 9) / 4.2, f = ph - Math.floor(ph);
      if (f < 0.16) L -= 0.85; else if (f < 0.32) L += 0.75;
    }
    return L;
  };
  /* grass: lush and dry patches, a sward combed by the wind, and blades:
     a dark stroke with its lit tip above it */
  const blade = (x, y) => hash(x * 7 + 13, y * 11 + 5) < 0.12;
  const levelTemperate = (x, y) => {
    let L = 3.0 + (fbm(x, y) - 0.5) * 2.2 + (vn(x / 64 + 3, y / 52 + 11) - 0.5) * 1.4;
    L += Math.sin((x * 0.55 + y) / 7 + vn(x / 30, y / 26) * 6) * 0.3;
    if (blade(x, y)) L += 1.1; else if (blade(x, y + 1)) L -= 1.0;
    return L;
  };
  /* snow scoured by a west wind: long polished streaks with a blue lee line
     under each, and fields of sastrugi */
  const levelArctic = (x, y) => {
    let L = 1.5 + (fbm(x, y) - 0.5) * 2.0;
    const u = x * 0.94 + y * 0.34, w = -x * 0.34 + y * 0.94;
    if (vn(u / 22 + 7, w / 2.6 + 3) > 0.69) L -= 0.9;
    else if (vn(u / 22 + 7, (w - 0.94) / 2.6 + 3) > 0.69) L += 1.25;
    if (vn(x / 40 + 20, y / 34 + 40) > 0.55) {
      const ph = (x * 0.3 + y + vn(x / 20, y / 18) * 7) / 5.5, f = ph - Math.floor(ph);
      if (f < 0.14) L += 0.9; else if (f < 0.28) L -= 0.6;
    }
    return L;
  };
  const ZW = {
    desert: { f: levelDesert, dith: 0.9, spk: 0.25 },
    temperate: { f: levelTemperate, dith: 0.8, spk: 0.45 },
    arctic: { f: levelArctic, dith: 0.75, spk: 0.2 },
  };
  const BAY = Float32Array.from({ length: 16 }, (_, i) => K.bayer(i & 3, i >> 2));
  const fillGL = zone => {
    const z = ZW[zone], f = z.f;
    for (let y = 0, i = 0; y < TS; y++) for (let x = 0; x < TS; x++, i++) {
      const wx = WX + x, wy = WY + y;
      GL[i] = f(wx, wy) + (hash(wx * 7 + 3, wy * 11 + 1) - 0.5) * z.spk + BAY[(y & 3) * 4 + (x & 3)] * z.dith;
    }
  };

  /* ---- things scattered over the ground in world space ----
   * One chance per 8x8 world cell, at a spot jittered by a hash of the cell;
   * a tile draws every thing that reaches into it (anchors up to 4 px
   * outside), so they cross tile edges whole. They land only on pixels the
   * tile marked as plain ground (GM). */
  const CELL = 8;
  const SCAT = {
    desert: {
      tuft: ["#dccb88", "#b5a35c", "#8f6c45"], pebble: ["#9c774c", "#f7e6bf"], pebble2: ["#a67f52", "#efdcb2"], grain: "#b8955f",
      p: [0.2, 0.3, 0.36, 0.45, 0.5],
    },
    temperate: {
      tuft: ["#c4df7a", "#6f9e3e", "#3d5c27"], pebble: ["#77736b", "#d4d0c4"], pebble2: ["#99958a", "#e2ded2"], grain: "#806a4a",
      p: [0.03, 0.05, 0.09, 0.25, 0.28], flower: ["#efd25a", "#f4eed6", "#e7a0b8"],
    },
    arctic: {
      tuft: ["#d8c99a", "#9c8a5e", "#7487a2"], pebble: ["#5c6570", "#ffffff"], pebble2: ["#7b848f", "#ffffff"], grain: "#ffffff",
      p: [0.05, 0.065, 0.15, 0.18, 0.21],
    },
  };
  const SHM = {};
  for (const z in K.Z) SHM[z] = K.rgb(K.Z[z].shadow).map(c => c / 255);
  const scatter = (b, zone) => {
    const S = SCAT[zone], p = S.p, d = b.d, sh = SHM[zone], g = K.Z[zone].ground, rk = K.Z[zone].rock;
    const put = (x, y, c) => {
      if (x < 0 || y < 0 || x >= TS || y >= TS) return;
      const i = y * TS + x; if (!GM[i]) return;
      if (typeof c === "string") c = rgb(c);
      const o = i * 4; d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2];
    };
    const shade = (x, y) => {
      if (x < 0 || y < 0 || x >= TS || y >= TS) return;
      const i = y * TS + x; if (!GM[i]) return;
      const o = i * 4; d[o] *= sh[0]; d[o + 1] *= sh[1]; d[o + 2] *= sh[2];
    };
    const ax0 = WX - 4, ax1 = WX + TS, ay0 = WY - 1, ay1 = WY + TS + 3;
    for (let cy = Math.floor(ay0 / CELL); cy <= Math.floor(ay1 / CELL); cy++) for (let cx = Math.floor(ax0 / CELL); cx <= Math.floor(ax1 / CELL); cx++) {
      const h = hash(cx * 31 + 17, cy * 47 + 5);
      if (h >= p[4]) continue;
      const wx = cx * CELL + (hash(cx * 13 + 3, cy * 7 + 1) * CELL | 0), wy = cy * CELL + (hash(cx * 5 + 11, cy * 17 + 9) * CELL | 0);
      if (wx < ax0 || wx > ax1 || wy < ay0 || wy > ay1) continue;
      const x = wx - WX, y = wy - WY, k = hash(cx + 7, cy * 3 + 2);
      if (h < p[0]) { put(x, y, S.pebble[0]); put(x, y - 1, S.pebble[1]); }
      else if (h < p[1]) { put(x, y, S.pebble2[0]); put(x + 1, y, S.pebble2[0]); put(x, y - 1, S.pebble2[1]); put(x + 1, y - 1, S.pebble2[1]); }
      else if (h < p[2]) {
        if (zone === "temperate") { const f = S.flower[k * 3 | 0]; put(x, y, f); put(x, y + 1, g[5]); if (k > 0.5) { put(x + 2, y + 1, f); put(x + 2, y + 2, g[5]); } }
        else if (zone === "arctic") { put(x, y - 1, g[0]); put(x + 1, y - 1, g[0]); put(x + 2, y - 1, g[0]); put(x, y, g[3]); put(x + 1, y, g[4]); put(x + 2, y, g[3]); put(x + 1, y + 1, g[4]); }
        else put(x, y, S.grain);
      } else if (h < p[3]) {
        /* a tuft standing up: 2 or 3 px of blades, lit tips, a dark root,
           its little shadow to the north-east */
        const [a, m, r] = S.tuft;
        if (k < 0.55) {
          shade(x + 2, y - 1); shade(x + 3, y - 1); shade(x + 2, y);
          put(x - 1, y, r); put(x, y, r); put(x + 1, y, r);
          put(x - 1, y - 1, m); put(x - 1, y - 2, a); put(x, y - 1, a); put(x + 1, y - 1, m); put(x + 1, y - 2, a);
        } else {
          shade(x + 3, y - 1); shade(x + 4, y - 1); shade(x + 3, y - 2); shade(x + 3, y);
          put(x - 1, y, r); put(x, y, r); put(x + 1, y, r); put(x + 2, y, r);
          put(x - 1, y - 1, m); put(x - 1, y - 2, a); put(x, y - 1, m); put(x, y - 2, m); put(x, y - 3, a);
          put(x + 1, y - 1, a); put(x + 2, y - 1, m); put(x + 2, y - 2, a);
        }
      } else {
        /* a small stone, lit from the top */
        const top = zone === "arctic" ? "#ffffff" : mix(rk[0], "#ffffff", 0.3);
        shade(x + 3, y); shade(x + 3, y - 1); shade(x + 1, y + 1); shade(x + 2, y + 1);
        put(x, y - 1, top); put(x + 1, y - 1, rk[0]); put(x + 2, y - 1, rk[1]);
        put(x, y, rk[1]); put(x + 1, y, rk[2]); put(x + 2, y, rk[3]);
      }
    }
  };
  /* rough ground's own stones: by the tile's position; one may cross an
     edge only into more rough ground (both sides know that edge), never a
     corner */
  const stoneList = (tx, ty) => {
    const r = K.rng("rstone", tx, ty), out = [], m = 6 + (r() * 4 | 0);
    for (let i = 0; i < m; i++) {
      const x = -1 + (r() * 25 | 0), y = r() * 25 | 0, s = r();
      const [x1, y0, y1] = s < 0.5 ? [x, y - 1, y] : s < 0.82 ? [x + 3, y - 1, y + 1] : [x + 4, y - 2, y + 1];
      const e = (y0 < 0 ? 1 : 0) | (x1 > TS - 1 ? 2 : 0) | (y1 > TS - 1 ? 4 : 0) | (x < 0 ? 8 : 0);
      out.push([x, y, s, e]);
    }
    return out;
  };
  const stoneAt = (b, zone, x, y, s) => {
    const rk = K.Z[zone].rock, top = zone === "arctic" ? "#ffffff" : mix(rk[0], "#ffffff", 0.3), sh = K.Z[zone].ground[5];
    if (s < 0.5) { b.set(x, y, rk[3]); b.set(x, y - 1, top); }
    else if (s < 0.82) { b.set(x, y - 1, top); b.set(x + 1, y - 1, rk[0]); b.set(x + 2, y - 1, rk[1]); b.set(x, y, rk[1]); b.set(x + 1, y, rk[2]); b.set(x + 2, y, rk[3]); b.set(x + 3, y, sh); b.rect(x, y + 1, 3, 1, sh); }
    else {
      b.set(x + 1, y - 2, top); b.set(x + 2, y - 2, rk[0]);
      b.set(x, y - 1, top); b.set(x + 1, y - 1, rk[0]); b.set(x + 2, y - 1, rk[1]); b.set(x + 3, y - 1, rk[2]);
      b.set(x, y, rk[2]); b.set(x + 1, y, rk[2]); b.set(x + 2, y, rk[3]); b.set(x + 3, y, rk[4]);
      b.rect(x, y + 1, 4, 1, sh); b.set(x + 4, y, sh);
    }
  };
  const ONE = { 1: 1, 2: 1, 4: 1, 8: 1 };
  const roughStones = (b, zone, n) => {
    const tx = WX / TS, ty = WY / TS;
    for (const [x, y, s, e] of stoneList(tx, ty)) if (!e || (ONE[e] && (n & e))) stoneAt(b, zone, x, y, s);
    for (const [bit, dx, dy, back] of [[1, 0, -1, 4], [2, 1, 0, 8], [4, 0, 1, 1], [8, -1, 0, 2]]) {
      if (!(n & bit)) continue;
      for (const [x, y, s, e] of stoneList(tx + dx, ty + dy)) if (e === back) stoneAt(b, zone, x + dx * TS, y + dy * TS, s);
    }
  };

  /* pebbles, blades, sparkle: point things, so they never make a seam */
  const dress = (b, zone, v, amt = 1) => {
    if (WORLD) { scatter(b, zone); return; }
    const Z = K.Z[zone], g = Z.ground, r = K.rng("dress", zone, v);
    if (zone === "desert") {
      const n = Math.round((2 + r() * 3) * amt);
      for (let i = 0; i < n; i++) {
        const x = 1 + (r() * 21 | 0), y = 2 + (r() * 20 | 0), k = r();
        if (k < 0.55) { b.set(x, y, "#9c774c"); b.set(x, y - 1, "#f7e6bf"); }
        else if (k < 0.85) { b.rect(x, y, 2, 1, "#a67f52"); b.rect(x, y - 1, 2, 1, "#efdcb2"); }
        else b.set(x, y, "#b8955f");
      }
      if (v === 3 && amt >= 1) {           /* a dry tuft, flat */
        const x = 8 + (r() * 8 | 0), y = 9 + (r() * 8 | 0);
        b.set(x, y, "#9a8a4c"); b.set(x - 1, y + 1, "#b5a35c"); b.set(x + 1, y - 1, "#c2b06a"); b.set(x + 2, y, "#8a7a42"); b.rect(x - 1, y + 2, 4, 1, g[4]);
      }
    } else if (zone === "temperate") {
      const n = Math.round(42 * amt);
      for (let i = 0; i < n; i++) {
        const x = r() * 24 | 0, y = r() * 23 | 0, L = gL(zone, v, x, y);
        b.set(x, y, q(g, L - 1.2)); b.set(x, y + 1, q(g, L + 1));
      }
      if (v === 2 && amt >= 1) for (let i = 0; i < 4; i++) { const x = 3 + (r() * 18 | 0), y = 3 + (r() * 18 | 0); b.set(x, y, i & 1 ? "#f4eed6" : "#efd25a"); b.set(x, y + 1, g[5]); }
      if (v === 0 && amt >= 1) for (let i = 0; i < 3; i++) { const x = 3 + (r() * 17 | 0), y = 4 + (r() * 16 | 0); b.set(x, y, "#9c8a66"); b.set(x + 1, y, "#7e6d50"); b.set(x, y - 1, "#c7b892"); }
    } else {
      const n = Math.round(10 * amt);
      for (let i = 0; i < n; i++) { const x = r() * 24 | 0, y = r() * 24 | 0; b.set(x, y, "#ffffff"); }
      const m = Math.round((1 + r() * 2) * amt);
      for (let i = 0; i < m; i++) {               /* wind scoops */
        const x = 3 + (r() * 16 | 0), y = 4 + (r() * 16 | 0);
        b.rect(x, y, 3, 1, g[3]); b.set(x + 1, y + 1, g[4]); b.rect(x, y - 1, 3, 1, g[0]);
      }
      if (v === 1 && amt >= 1) { const x = 6 + (r() * 10 | 0), y = 7 + (r() * 10 | 0); b.set(x, y, "#6c5a4c"); b.set(x + 1, y - 1, "#4f4238"); b.set(x - 1, y - 1, "#8a7564"); b.set(x, y + 1, g[3]); }
    }
  };
  /* small stones, lit from the top */
  const stones = (b, zone, r, n, lo = 2, hi = 21) => {
    const rk = K.Z[zone].rock, top = zone === "arctic" ? "#ffffff" : mix(rk[0], "#ffffff", 0.3), sh = K.Z[zone].ground[5];
    for (let i = 0; i < n; i++) {
      const x = lo + (r() * (hi - lo) | 0), y = lo + (r() * (hi - lo) | 0), s = r();
      if (s < 0.5) { b.set(x, y, rk[3]); b.set(x, y - 1, top); }
      else if (s < 0.82) { b.set(x, y - 1, top); b.set(x + 1, y - 1, rk[0]); b.set(x + 2, y - 1, rk[1]); b.set(x, y, rk[1]); b.set(x + 1, y, rk[2]); b.set(x + 2, y, rk[3]); b.set(x + 3, y, sh); b.rect(x, y + 1, 3, 1, sh); }
      else {
        b.set(x + 1, y - 2, top); b.set(x + 2, y - 2, rk[0]);
        b.set(x, y - 1, top); b.set(x + 1, y - 1, rk[0]); b.set(x + 2, y - 1, rk[1]); b.set(x + 3, y - 1, rk[2]);
        b.set(x, y, rk[2]); b.set(x + 1, y, rk[2]); b.set(x + 2, y, rk[3]); b.set(x + 3, y, rk[4]);
        b.rect(x, y + 1, 4, 1, sh); b.set(x + 4, y, sh);
      }
    }
  };

  /* the ground of each tile */
  const P = [];
  P[T.OPEN] = (b, zone, v) => { fillGround(b, zone, v); dress(b, zone, v); };

  P[T.ROUGH] = (b, zone, v, n) => {
    const Z = K.Z[zone], r = rngT("rough", zone, v);
    if (WORLD) {
      /* stony ground: bare patches (pale hardpan in the desert, earth in the
         grass, frozen ground under the snow) strewn with gravel, thinning out
         where smooth ground starts */
      const dr = rampRGB(Z.dirt), gr = rampRGB(Z.ground), d = b.d, bare = { desert: -0.3, temperate: 0.3, arctic: 0.4 }[zone];
      const FE = new Float32Array(TS * TS);
      for (let y = 0, i = 0; y < TS; y++) for (let x = 0; x < TS; x++, i++) {
        const wx = WX + x, wy = WY + y, fe = FE[i] = inner(n, x, y, 5);
        const m = vn(wx / 5 + 3, wy / 4.5 + 1) * 0.7 + vn(wx / 13 + 7, wy / 11 + 3) * 0.3 - (1 - fe) * 0.45;
        const c = m > 0.47 ? dr[clamp(Math.round(GL[i] + bare + (m - 0.47) * 2.5), 0, 6)] : gr[clamp(Math.round(GL[i] + 0.3 * fe), 0, 6)], o = i * 4;
        d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; d[o + 3] = 255; GM[i] = 1;
      }
      /* gravel: a dark grain with its lit top above it */
      const rk = rampRGB(Z.rock), lit = zone === "arctic" ? [255, 255, 255] : K.rgb(mix(Z.rock[0], "#ffffff", 0.35));
      for (let y = 1, i = TS; y < TS; y++) for (let x = 0; x < TS; x++, i++) {
        const wx = WX + x, wy = WY + y, dens = (0.1 + 0.14 * vn(wx / 9 + 40, wy / 8 + 12)) * FE[i];
        const h = hash(wx * 5 + 1, wy * 3 + 7);
        if (h >= dens) continue;
        const c = rk[h < dens * 0.5 ? 4 : 3], o = i * 4, u = o - TS * 4;
        d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; d[u] = lit[0]; d[u + 1] = lit[1]; d[u + 2] = lit[2];
        /* each grain throws a pixel of shade to the north-east */
        if (x < TS - 1) { const e = u + 4; d[e] = d[e] * 0.78; d[e + 1] = d[e + 1] * 0.74; d[e + 2] = d[e + 2] * 0.82; }
      }
      if (zone !== "arctic") for (let k = 0; k < 2; k++) {
        let x = 7 + r() * 9, y = 6 + r() * 10;
        for (let s = 0; s < 6; s++) { b.set(x, y, Z.dirt[5]); x += r() < 0.5 ? 1 : -1; y += r() < 0.6 ? 1 : 0; }
      }
      scatter(b, zone);
      roughStones(b, zone, n);
      return;
    }
    for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
      const w = edgeW(x, y), m = w * K.vn(x / 5 + v * 7.7, y / 4.5 + v * 3.3) + (K.hash(x + v * 9, y * 3 + 1) - 0.5) * 0.18;
      const L = gL(zone, v, x, y);
      b.set(x, y, m > 0.36 ? q(Z.dirt, L + 0.9 + (m - 0.36) * 4) : q(Z.ground, L + 0.5));
    }
    if (zone !== "arctic") {                       /* dry cracks in the bare patches */
      for (let k = 0; k < 2; k++) {
        let x = 6 + r() * 12, y = 6 + r() * 12;
        for (let s = 0; s < 6; s++) { b.set(x, y, Z.dirt[5]); x += r() < 0.5 ? 1 : -1; y += r() < 0.6 ? 1 : 0; }
      }
    }
    stones(b, zone, r, 6 + (v & 1) * 3);
    dress(b, zone, v, 0.5);
  };

  P[T.MINE] = (b, zone, v, n) => {
    const Z = K.Z[zone], r = rngT("mine", zone, v);
    fillGround(b, zone, v, 0.35, null, WORLD ? n : undefined);
    if (WORLD) scatter(b, zone);
    /* disturbed earth, raked over */
    for (let k = 0; k < 3; k++) {
      const cx = 5 + r() * 14, cy = 5 + r() * 14, rx = 2.5 + r() * 1.8, ry = 1.5 + r() * 0.8;
      for (let y = Math.floor(cy - ry - 2); y <= cy + ry + 1; y++) for (let x = Math.floor(cx - rx - 2); x <= cx + rx + 2; x++) {
        const d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;
        if (d < 1) b.set(x, y, q(Z.dirt, 3.2 + (y - cy) / ry * 0.9 + K.bayer(x, y) * 0.8));
        else if (d < 1.7 && y <= cy) b.set(x, y, q(Z.ground, 1 + K.bayer(x, y)));
      }
    }
    /* the mines themselves: half-buried pressure plates, every other variant */
    const metal = zone === "arctic" ? K.MAT.steel : K.MAT.olive;
    const mines = v === 1 ? 0 : v === 3 ? 2 : 1;
    for (let k = 0; k < mines; k++) {
      const x = 6 + (r() * 11 | 0), y = 7 + (r() * 10 | 0);
      b.rect(x - 1, y + 1, 6, 1, Z.dirt[5]); b.set(x - 1, y, Z.dirt[4]); b.set(x + 4, y, Z.dirt[4]);
      b.set(x + 1, y - 1, metal[0]); b.set(x + 2, y - 1, metal[1]);
      b.set(x, y, metal[1]); b.set(x + 1, y, metal[0]); b.set(x + 2, y, metal[2]); b.set(x + 3, y, metal[3]);
      b.set(x + 1, y + 1, metal[3]); b.set(x + 2, y + 1, metal[4]);
      b.set(x + 1, y - 2, K.MAT.steel[4]);
    }
    /* warning markers where the field ends */
    const flag = (x, y) => {
      b.set(x + 1, y + 1, Z.ground[6]); b.rect(x, y - 3, 1, 4, "#4a3626"); b.set(x, y - 4, "#8a6a48");
      b.set(x + 1, y - 4, WARN[1]); b.set(x + 2, y - 4, WARN[2]); b.set(x + 1, y - 3, WARN[3]);
    };
    const a = v & 1 ? 5 : 15;
    if (!(n & 1)) flag(a, 5);
    if (!(n & 4)) flag(a + 3, 22);
    if (!(n & 8)) flag(2, 13);
    if (!(n & 2)) flag(20, 11);
  };

  /* a shell hole: a crisp lip of thrown-up earth, lit on the south-west where
     it faces the sun; the inner wall to the north-east dark under it; a
     darker, scorched floor; clods thrown round it. A hole to hide in. */
  P[T.CRATER] = (b, zone, v) => {
    const Z = K.Z[zone], sc = X[zone].scorch, r = rngT("crater", zone, v), snow = zone === "arctic";
    const dirt = snow ? K.Z.temperate.dirt : Z.dirt, g = Z.ground;
    fillGround(b, zone, v);
    const j = WORLD ? hash(WX + 5, WY + 9) : (v & 1) * 0.5;
    const cx = 11.5 + (j - 0.5) * 1.5 + (v & 1) * 0.5, cy = 12 + ((v >> 1) & 1) * 0.5, rx = 8.4 + (v === 2 ? 0.6 : 0), ry = 5.8;
    /* the wall and floor, dark to light */
    const pit = [dirt[3], dirt[4], dirt[5], dirt[6], sc[0], sc[1], sc[2]];
    const lipLit = snow ? "#ffffff" : mix(g[0], "#ffffff", 0.35), lipMid = snow ? g[2] : mix(g[1], dirt[1], 0.5), lipDim = snow ? g[5] : dirt[3];
    for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
      const nx = (x + 0.5 - cx) / rx, ny = (y + 0.5 - cy) / ry, rr = Math.sqrt(nx * nx + ny * ny) || 1e-3;
      /* distance in pixels from the crest, negative inside */
      const gr = Math.sqrt((nx / rx) ** 2 + (ny / ry) ** 2) / rr, dp = (rr - 1) / gr;
      /* towards the sun (south-west) +1, away (north-east) -1 */
      const sd = (-nx + ny) / rr * 0.7071;
      const bay = K.bayer(x, y), i = y * TS + x;
      if (dp > 3.6) continue;
      if (dp > 0.9) {
        /* the outer mound: earth thrown up, lit to the sun, dim away from it
           (gone before the tile's edge, so the next tile meets plain ground) */
        const t = (1 - (dp - 0.9) / 2.7) * clamp(Math.min(x, TS - 1 - x, y, TS - 1 - y) / 2.5, 0, 1);
        let L = gL(zone, v, x, y) + (0.25 - sd * 1.5) * t;
        /* the back of the rim, in its own shade: a crisp ring to the north-east */
        if (dp < 1.9 && sd < -0.15) L = Math.max(L, (snow ? 4.6 : 4.2) + bay * 0.5);
        /* on snow the lit lip needs a line to stand off the white */
        else if (snow && dp < 1.7 && sd >= -0.15) L = Math.max(L, 3);
        b.set(x, y, q(g, L));
        continue;
      }
      GM[i] = 0;
      let c;
      if (dp > -0.4) c = sd > 0.25 ? lipLit : sd > -0.35 ? lipMid : lipDim;                     /* the lip */
      else if (dp > -1.5 && sd < 0.35) c = sc[1];                                                 /* under the far lip */
      else if (rr > 0.42) c = q(pit, 3.1 - sd * 2.1 + (rr - 0.42) * 0.8 + bay * 0.8);             /* the inner wall */
      else c = q(pit, 3.9 - sd * 0.6 + (K.hash(x + 3, y * 7 + v) - 0.5) * 0.9 + bay * 0.7);         /* the floor */
      b.set(x, y, c);
    }
    if (WORLD) scatter(b, zone);
    /* clods thrown out, lit on top; a few stones on the floor */
    for (let i = 0; i < 9; i++) {
      const a = r() * TAU, d = 1.18 + r() * 0.4, x = Math.round(cx + Math.cos(a) * rx * d), y = Math.round(cy + Math.sin(a) * ry * d);
      if (x < 1 || y < 2 || x > 22 || y > 22) continue;
      b.set(x, y, dirt[5]); b.set(x, y - 1, snow ? "#ffffff" : dirt[1]); if (r() < 0.4) { b.set(x + 1, y, dirt[6]); b.set(x + 1, y - 1, dirt[2]); }
    }
    for (let i = 0; i < 3; i++) {
      const x = Math.round(cx + (r() - 0.5) * rx * 0.7), y = Math.round(cy + (r() - 0.2) * ry * 0.5);
      b.set(x, y, dirt[2]); b.set(x, y + 1, sc[2]);
    }
  };

  /* water, ice, thin ice: a bank only where the next tile is not the same */
  const banks = (n, x, y, s) => {
    let d = 99, north = false;
    if (!(n & 1)) { const e = y - (2.6 + wob(x, 0.3 + s) * s); if (e < d) { d = e; north = true; } }
    if (!(n & 4)) { const e = TS - 1 - y - (2 + wob(x, 2.1 + s) * s * 0.8); if (e < d) { d = e; north = false; } }
    if (!(n & 8)) { const e = x - (2 + wob(y, 0.9 + s) * s * 0.8); if (e < d) { d = e; north = false; } }
    if (!(n & 2)) { const e = TS - 1 - x - (2 + wob(y, 3.4 + s) * s * 0.8); if (e < d) { d = e; north = false; } }
    return [d, north];
  };
  P[T.WATER] = (b, zone, v, n) => {
    const Z = K.Z[zone], wa = Z.water, r = rngT("water", zone, v), arctic = zone === "arctic";
    const D = new Float32Array(TS * TS);
    for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
      const [d, north] = banks(n, x, y, 1);
      D[y * TS + x] = d;
      let c;
      if (d < 0) {
        if (north && d > -2.4) c = arctic ? (d > -1.2 ? Z.ice[1] : Z.ground[3]) : (d > -1.2 ? Z.dirt[5] : Z.dirt[3]);
        else { c = q(Z.ground, gL(zone, v, x, y) + (d > -1.5 ? 0.6 : 0)); if (d <= -1.5) GM[y * TS + x] = 1; }
      } else if (d < 1) c = arctic ? Z.ice[2] : mix(Z.dirt[6], wa[3], 0.5);
      else if (d < 2) c = arctic ? Z.ice[0] : (K.hash(x + v * 7, y) > 0.3 ? X[zone].foam : wa[0]);
      else {
        const w = edgeW(x, y);
        const L = 1.75 + (pfbm(x, y, 7) - 0.5) * 1.1 + w * (vmid(x, y, v, 2) - 0.5) * 0.9 + K.bayer(x, y) * 0.6 - (d < 4 ? 0.8 : 0);
        c = q(wa, L);
      }
      b.set(x, y, c);
    }
    if (WORLD) scatter(b, zone);
    /* wavelets: a lit crest over a dark trough */
    const nw = 5 + (v & 1) * 2;
    for (let i = 0; i < nw; i++) {
      const x = 1 + (r() * 19 | 0), y = 2 + (r() * 20 | 0), L = 2 + (r() * 3 | 0);
      let ok = true; for (let k = -1; k <= L; k++) if (D[y * TS + clamp(x + k, 0, 23)] < 3 || D[(y + 1) * TS + clamp(x + k, 0, 23)] < 3) ok = false;
      if (!ok) continue;
      b.rect(x, y, L, 1, wa[0]); b.rect(x + 1, y + 1, Math.max(1, L - 1), 1, wa[3]);
    }
    if (v === 2) { const x = 6 + (r() * 10 | 0), y = 6 + (r() * 10 | 0); if (D[y * TS + x] > 4) b.set(x, y, "#ffffff"); }
  };
  const iceSheet = (b, zone, v, n, thin) => {
    const Z = K.Z[zone], ic = Z.ice, wa = Z.water, r = rngT(thin ? "thin" : "ice", zone, v);
    const ramp = thin ? [mix(ic[1], wa[0], 0.35), mix(ic[2], wa[0], 0.45), mix(ic[3], wa[1], 0.45), mix(wa[1], ic[3], 0.3)] : ic;
    for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
      const [d] = banks(n, x, y, 0.45), w = edgeW(x, y);
      let c;
      if (d < -0.6) { c = q(Z.ground, gL(zone, v, x, y)); GM[y * TS + x] = 1; }
      else if (d < 0.6) c = thin ? ic[3] : ic[0];
      else {
        let L = (thin ? 1.3 : 1.15) + (pfbm(x, y, 3) - 0.5) * 1.0 + w * (vmid(x, y, v, 4) - 0.5) * 1.3 + K.bayer(x, y) * 0.7;
        c = q(ramp, L);
        if (!thin && w * K.vn(x / 5 + v * 3, y / 4 - v) > 0.6) c = mix(ic[0], Z.ground[0], 0.6);
      }
      b.set(x, y, c);
    }
    if (WORLD) scatter(b, zone);
    /* scratches on the ice, lit */
    for (let i = 0; i < 3; i++) {
      let x = 4 + r() * 14, y = 5 + r() * 14; const L = 3 + r() * 5;
      for (let s = 0; s < L; s++) { b.set(x, y, thin ? ic[1] : "#ffffff"); x += 1; y -= 0.5; }
    }
    if (thin) {
      /* cracks: dark open water lines with a lit lip */
      for (let k = 0; k < 2 + (v & 1); k++) {
        let x = 5 + r() * 14, y = 5 + r() * 14, dx = r() < 0.5 ? 1 : -1;
        for (let s = 0; s < 7 + r() * 6; s++) {
          if (x < 2 || y < 2 || x > 21 || y > 21) break;
          b.set(x, y, wa[3]); if (!(s & 1)) b.set(x - 1, y - 1, ic[0]);
          if (r() < 0.6) x += dx; else y += r() < 0.5 ? 1 : -1;
          if (r() < 0.15) dx = -dx;
        }
      }
      if (v === 2) { const x = 9 + (r() * 6 | 0), y = 10 + (r() * 5 | 0); b.rect(x, y, 3, 2, wa[2]); b.rect(x, y - 1, 3, 1, ic[0]); b.set(x + 1, y + 1, wa[3]); }
    } else for (let i = 0; i < 4; i++) { const x = 3 + (r() * 18 | 0), y = 3 + (r() * 18 | 0); b.set(x, y, ic[2]); }
  };
  P[T.ICE] = (b, zone, v, n) => iceSheet(b, zone, v, n, false);
  P[T.THIN] = (b, zone, v, n) => iceSheet(b, zone, v, n, true);

  /* a sunken trench: the north wall face terraced, a shaded floor on duckboards */
  P[T.TRENCH] = (b, zone, v, n) => {
    const Z = K.Z[zone], tr = Z.trench, g = Z.ground, O = K.OUT;
    const fl = [mix(tr[2], tr[3], 0.5), tr[3], mix(tr[3], O, 0.4), mix(tr[3], O, 0.62)];
    const board = zone === "arctic" ? [W5[2], W5[3]] : [mix(W5[3], tr[3], 0.3), W5[4]];
    const hasN = n & 1, hasE = n & 2, hasS = n & 4, hasW = n & 8, vert = (n & 5) && !(n & 10);
    const top = [], bot = hasS ? TS : 21;
    for (let x = 0; x < TS; x++) top[x] = hasN ? 0 : 9 + Math.round(Math.sin(TAU * x / TS + 0.5) * 0.7 + Math.sin(TAU * 3 * x / TS) * 0.4);
    for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
      let c = q(fl, 1 + (pfbm(x, y, 4) - 0.5) * 1.1 + K.bayer(x, y) * 0.6 + (K.hash(x + v * 5, y) - 0.5) * 0.3);
      if (!hasN && y < top[x]) {
        const r = y, tx = K.hash(x * 3, y * 5);
        if (r === 0) c = mix(g[0], "#ffffff", 0.2);
        else if (r < 4) c = tx > 0.82 ? tr[2] : (r === 1 ? tr[0] : mix(tr[0], tr[1], 0.55));
        else if (r === 4) c = tx > 0.5 ? mix(tr[0], g[1], 0.5) : tr[0];
        else c = tx > 0.8 ? tr[3] : (r === 5 ? tr[2] : mix(tr[2], tr[3], 0.4));
        if (r > 0 && r !== 4 && (x & 7) === 3) c = r < 4 ? mix(tr[2], tr[3], 0.5) : tr[3];
      } else if (!hasN && y === top[x]) c = fl[3];
      else if (!hasN && y === top[x] + 1) c = fl[2];
      b.set(x, y, c);
    }
    /* side walls: the west wall faces east (shade), the east one west (lit) */
    for (let y = 0; y < TS; y++) {
      if (!hasW && (hasN || y >= top[0])) { b.set(0, y, g[2]); b.set(1, y, tr[2]); b.set(2, y, fl[3]); }
      if (!hasE && (hasN || y >= top[23])) { b.set(23, y, g[2]); b.set(22, y, tr[0]); b.set(21, y, tr[1]); }
    }
    /* duckboards along the run */
    const fy0 = hasN ? 0 : 11, fy1 = bot;
    if (!vert) {
      const by = Math.round((fy0 + fy1) / 2);
      for (let x = hasW ? 0 : 3; x < (hasE ? TS : 21); x++) { const gap = (x & 3) === 0; b.set(x, by, gap ? fl[3] : board[0]); b.set(x, by + 1, gap ? fl[3] : board[1]); }
    } else {
      for (let y = fy0 + 1; y < fy1; y++) { const gap = (y & 3) === 0; b.set(11, y, gap ? fl[3] : board[0]); b.set(12, y, gap ? fl[3] : board[1]); }
    }
    /* the near lip */
    if (!hasS) for (let x = 0; x < TS; x++) {
      const j = Math.round(Math.sin(TAU * x / TS + 1.7) * 0.5);
      b.set(x, 21 + j, tr[2]); for (let y = 22 + j; y < TS; y++) b.set(x, y, y === 22 + j ? g[1] : g[2]);
    }
    if (zone === "arctic" && !hasN) for (let x = 0; x < TS; x++) if (K.hash(x, 7 + v) > 0.4) b.set(x, 1, "#ffffff");
  };

  /* concrete or plank floor inside a compound; drifted ground where it ends */
  P[T.FLOOR] = (b, zone, v, n) => {
    const fl = X[zone].floor, Z = K.Z[zone], r = rngT("floor", zone, v), planks = zone === "temperate";
    for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
      const w = edgeW(x, y);
      let L;
      if (planks) {
        const row = y >> 2, py = y & 3, joint = (x === (row * 9 + 5) % TS);
        L = 1.6 + (K.hash(row, 3) - 0.5) * 0.8 + (K.hash(x >> 2, row * 7 + 1) - 0.5) * 0.3 + K.bayer(x, y) * 0.5;
        if (py === 0) L -= 0.6; if (py === 3 || joint) L = 4.6;
        if (!joint && py === 1 && ((x + row * 9 + 5) % TS === 2 || (x + row * 9 + 5) % TS === 21)) L = 4;
      } else {
        L = 1.7 + (pfbm(x, y, 6) - 0.5) * 0.9 + w * (vmid(x, y, v, 6) - 0.5) * 1.0 + (K.hash(x + v * 13, y * 3) - 0.5) * 0.4 + K.bayer(x, y) * 0.55;
        if ((n & 2) && x === 23) L = 3.6; if ((n & 4) && y === 23) L = 3.6;
        if ((n & 8) && x === 0) L -= 0.8; if ((n & 1) && y === 0) L -= 0.8;
      }
      b.set(x, y, q(fl, L));
    }
    if (!planks) {
      if (v === 1) {                                   /* an oil stain */
        const cx = 8 + r() * 8, cy = 8 + r() * 8;
        for (let y = -3; y <= 3; y++) for (let x = -4; x <= 4; x++) { const d = (x / 4) ** 2 + (y / 2.6) ** 2 + (K.hash(x + 40, y) - 0.5) * 0.4; if (d < 1) b.set(cx + x, cy + y, d < 0.45 ? fl[4] : fl[3]); }
      } else if (v === 2) {                            /* a crack */
        let x = 3 + r() * 6, y = 4 + r() * 4;
        for (let s = 0; s < 14; s++) { b.set(x, y, fl[5]); b.set(x, y + 1, fl[1]); x += 1; y += r() < 0.45 ? 1 : r() < 0.3 ? -1 : 0; }
      } else if (v === 3) for (let i = 0; i < 6; i++) { const x = 3 + (r() * 18 | 0), y = 3 + (r() * 18 | 0); b.set(x, y, fl[4]); }
    }
    /* drift: the ground blown onto the floor where it ends */
    for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
      let d = 99;
      if (!(n & 1)) d = Math.min(d, y - wob(x, 0.4) * 0.8);
      if (!(n & 4)) d = Math.min(d, TS - 1 - y - wob(x, 1.9) * 0.8);
      if (!(n & 8)) d = Math.min(d, x - wob(y, 2.6) * 0.8);
      if (!(n & 2)) d = Math.min(d, TS - 1 - x - wob(y, 4.1) * 0.8);
      if (d < 0.5 || (d < 2.2 && K.bayer(x, y) + 0.47 > (d - 0.5) / 1.7)) { b.set(x, y, q(Z.ground, gL(zone, v, x, y) + (d > 0.5 ? -0.3 : 0.3))); if (d < 0.5) GM[y * TS + x] = 1; }
      else if (d < 3 && !planks) b.set(x, y, fl[3]);
    }
    if (WORLD) scatter(b, zone);
    if (zone === "arctic") for (let i = 0; i < 5; i++) { const x = r() * 24 | 0, y = r() * 24 | 0; b.rect(x, y, 2, 1, "#ffffff"); }
  };

  /* road and runway: tarmac, painted edge lines, a centre line, shoulders */
  P[T.ROAD] = (b, zone, v, n) => {
    const tar = X[zone].tar, Z = K.Z[zone], r = rngT("road", zone, v);
    const horiz = (n & 10) || !(n & 5);
    /* in road terms: a runs along, c across; A/B the sides, E0/E1 the ends */
    const sA = horiz ? !(n & 1) : !(n & 8), sB = horiz ? !(n & 4) : !(n & 2);
    const e0 = horiz ? !(n & 8) : !(n & 1), e1 = horiz ? !(n & 2) : !(n & 4);
    for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
      const a = horiz ? x : y, c = horiz ? y : x, w = edgeW(x, y);
      let col = q(tar, 1.9 + (pfbm(x, y, 8) - 0.5) * 0.8 + w * (vmid(x, y, v, 8) - 0.5) * 0.8 + (K.hash(x + v * 3, y * 7) - 0.5) * 0.6 + K.bayer(x, y) * 0.5);
      if (K.hash(x * 5 + v, y * 3 + 2) > 0.95) col = tar[0];
      if (v === 1 && (c === 8 || c === 15) && K.vn(a / 3, c) > 0.45) col = tar[4];      /* tyre marks */
      const cw = 1.6 + wob(a, horiz ? 0.2 : 1.1) * 0.6;
      const sh = (sA && c < cw) || (sB && c > TS - 1 - cw) || (e0 && a < 2) || (e1 && a > 21);
      if (sh) col = zone === "arctic" ? q(Z.ground, 0.6 + K.bayer(x, y)) : q(Z.dirt, 2.4 + K.bayer(x, y) * 0.9 + (K.hash(x, y + 9) - 0.5));
      else if ((sA && c < cw + 1) || (sB && c > TS - 2 - cw)) col = tar[4];
      else if (((sA && c === 4) || (sB && c === 19)) && !(e0 && a < 3) && !(e1 && a > 20) && K.hash(x, y + v) > 0.1) col = PAINT;
      /* the centre line: on a single-width road in the middle, on a pair along their seam */
      const dash = (a % 12) < 6 && K.hash(a + v, c) > 0.12;
      if (dash && ((sA && sB && (c === 11 || c === 12)) || (!sA && sB && c === 0) || (sA && !sB && c === 23))) col = PAINT;
      b.set(x, y, col);
    }
    if (v === 2) {                                       /* a patched pothole */
      const x0 = 6 + (r() * 8 | 0), y0 = 7 + (r() * 6 | 0);
      for (let y = 0; y < 4; y++) for (let x = 0; x < 6; x++) b.set(x0 + x, y0 + y, x === 0 || y === 0 ? tar[4] : q(tar, 2.8 + K.bayer(x, y)));
    }
    if (zone === "arctic") for (let i = 0; i < 4; i++) { const x = 3 + (r() * 16 | 0), y = 3 + (r() * 16 | 0); b.rect(x, y, horiz ? 3 : 1, horiz ? 1 : 3, Z.ground[1]); }
  };

  /* scree at the foot of the badlands, seen where the cliff edge is ragged */
  P[T.BAD] = (b, zone, v) => {
    const rk = K.Z[zone].rock, r = K.rng("scree", zone, v);
    for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) b.set(x, y, q(rk, 2.3 + (pfbm(x, y, 2) - 0.5) * 1.4 + K.bayer(x, y) * 0.9 + (K.hash(x, y + v) - 0.5) * 0.7));
    stones(b, zone, r, 8, 1, 22);
  };
  P[T.HWALL] = (b, zone, v) => { fillGround(b, zone, v, 0.8, K.Z[zone].dirt); };
  P[T.PIPE] = (b, zone, v, n) => {
    fillGround(b, zone, v); dress(b, zone, v, 0.6);
    const Z = K.Z[zone], horiz = (n & 10) || !(n & 5);
    /* the gravel bed under the supports */
    for (let i = -4; i <= 4; i++) for (let j = -2; j <= 2; j++) {
      const x = horiz ? 12 + i : 12 + j, y = horiz ? 14 + j : 12 + i;
      if (K.hash(x * 3 + v, y) > 0.35) b.set(x, y, q(Z.dirt, 3 + K.bayer(x, y) + (K.hash(x, y) - 0.5) * 1.5));
    }
  };
  /* under trees, bushes, rocks, walls, wire and traps: the open ground */
  const SAME_AS_OPEN = new Set([T.BUSH, T.ROCK, T.TREE, T.WALL, T.WIRE, T.TRAP]);
  /* the tiles that look at their neighbours */
  const USES_N = new Set([T.TRENCH, T.WATER, T.ICE, T.THIN, T.FLOOR, T.ROAD, T.MINE, T.PIPE]);

  /* covered by what stands on them: one shared picture is enough */
  const SHARED = new Set([T.HWALL, T.BAD]);
  /* the tiles that do not read the ground level */
  const NO_GL = new Set([T.TRENCH, T.ROAD]);
  /* tiles painted for a place in the world: a map's worth, then let go */
  const WC = new Map(), WC_MAX = 6000, ZI = { desert: 0, temperate: 1, arctic: 2 };

  /* PM.tileArt(zone, id, v, n, tx, ty): with the tile's world position the
     ground is painted for that place (cached until PM.groundReset()), so open
     ground runs on unbroken; without it, the tile-periodic picture. */
  PM.tileArt = (zone, id, v = 0, n = 0, tx, ty) => {
    if (!K.Z[zone]) zone = "desert";
    if (!P[id] && !SAME_AS_OPEN.has(id)) id = T.OPEN;
    if (SAME_AS_OPEN.has(id)) id = T.OPEN;
    v &= 3;
    const world = tx != null && ty != null && !SHARED.has(id);
    n = USES_N.has(id) || (world && id === T.ROUGH) ? n & 15 : 0;
    if (!world) return K.get(`gr:${zone}:${id}:${v}:${n}`, () => { const b = Buf(TS, TS); P[id](b, zone, v, n); return b.canvas(); });
    tx |= 0; ty |= 0;
    const key = (((((tx + 32768) * 65536 + (ty + 32768)) * 32 + id) * 16 + n) * 4 + v) * 4 + ZI[zone];
    let c = WC.get(key);
    if (c) return c;
    if (WC.size >= WC_MAX) WC.clear();
    const b = Buf(TS, TS);
    WORLD = true; WX = tx * TS; WY = ty * TS; GM.fill(0);
    try {
      if (!NO_GL.has(id)) fillGL(zone);
      P[id](b, zone, v, n);
    } finally { WORLD = false; }
    c = b.canvas();
    WC.set(key, c);
    return c;
  };
  /* a new map: the ground painted for the last one can go */
  PM.groundReset = () => WC.clear();

  /* =================== standing things =================== */

  /* a sprite canvas with the tile's top-left at (ox, oy) inside it */
  const Spr = (w, h, ox, oy) => {
    const c = K.mk(w, h), g = c.getContext("2d");
    g.translate(ox, oy); c.ax = ox; c.ay = oy + TS;
    return { c, g };
  };
  /* a shadow pad over tile coordinates (x0, y0, w, h); things lifted by hgt */
  const Pad = (x0, y0, w, h) => {
    const c = K.mk(w, h), g = c.getContext("2d");
    g.fillStyle = "#000";
    const p = {
      c, g,
      dot(gx, gy, hgt = 0, ww = 1, hh = 1) { g.fillRect(Math.round(gx + hgt * SX - x0), Math.round(gy + hgt * SY - y0), ww, hh); },
      disc(gx, gy, rx, ry, hgt = 0) { K.disc(g, gx + hgt * SX - x0, gy + hgt * SY - y0, rx, ry, "#000"); },
      sweep(gx, gy, rx, ry, h0, h1, taper = 0) {
        const n = Math.max(1, Math.ceil((h1 - h0) * SX));
        for (let i = 0; i <= n; i++) { const t = i / n, k = 1 - t * taper; p.disc(gx, gy, Math.max(1, rx * k), Math.max(1, ry * k), h0 + (h1 - h0) * t); }
      },
      attach(s) { s.sh = c; s.shx = x0 + s.ax; s.shy = y0 + s.ay - TS; return s; },
    };
    return p;
  };
  /* the mock's blob: a union of discs, shaded pixel by pixel */
  const blob = (g, cx, cy, parts, shade, sq = 1) => {
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    for (const p of parts) { x0 = Math.min(x0, cx + p[0] - p[2] - 1); x1 = Math.max(x1, cx + p[0] + p[2] + 1); y0 = Math.min(y0, cy + p[1] - p[2] - 1); y1 = Math.max(y1, cy + p[1] + p[2] + 1); }
    const ins = (x, y) => parts.some(p => { const dx = x - (cx + p[0]), dy = (y - (cy + p[1])) * sq; return dx * dx + dy * dy <= p[2] * p[2]; });
    for (let y = Math.floor(y0); y <= y1; y++) for (let x = Math.floor(x0); x <= x1; x++) {
      if (!ins(x, y)) continue;
      const e = !ins(x - 1, y) || !ins(x + 1, y) || !ins(x, y - 1) || !ins(x, y + 1);
      const c = shade(x, y, e, x - cx, y - cy);
      if (c) { g.fillStyle = c; g.fillRect(x, y, 1, 1); }
    }
  };
  const R = (g, x, y, w, h, c) => K.rect(g, x, y, w, h, c);

  /* ---- a block raised from a footprint: its top, and its south face ----
   * mask: 24x24 footprint; H: height. The canvas is 24 x (24 + H) and its
   * bottom-left sits on the tile's bottom-left. top(x, y) and face(x, y, r)
   * (r = 0 just under the top edge, H - 1 at the ground) give colours. */
  const inMask = (m, x, y, n) => {
    if (x < 0) return !!(n & 8); if (x >= TS) return !!(n & 2);
    if (y < 0) return !!(n & 1); if (y >= TS) return !!(n & 4);
    return !!m[y * TS + x];
  };
  const extrude = (m, H, n, top, face) => {
    const b = Buf(TS, TS + H);
    for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
      if (!m[y * TS + x]) continue;
      const open = !inMask(m, x, y + 1, n);
      if (open) for (let r = 0; r < H; r++) b.set(x, y + 1 + r, face(x, y, r));
      b.set(x, y, top(x, y));
    }
    const c = b.canvas(); c.ax = 0; c.ay = TS + H;
    const up = Math.ceil(H * -SY) + 1, sb = Buf(TS + Math.ceil(H * SX) + 2, TS + up), steps = Math.ceil(H * SX) * 2;
    for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
      if (!m[y * TS + x]) continue;
      for (let i = 0; i <= steps; i++) { const t = i / steps * H; sb.set(x + t * SX, y + t * SY + up, "#000"); }
    }
    c.sh = sb.canvas(); c.shx = 0; c.shy = H - up;
    return c;
  };
  /* a wall's footprint: a ribbon along its runs */
  const ribbon = (n, lo, hi) => {
    const m = new Uint8Array(TS * TS), hz = (n & 10) || !(n & 5), vt = n & 5;
    const fill = (x0, y0, x1, y1) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) m[y * TS + x] = 1; };
    if (hz) fill((n & 8) ? 0 : vt ? lo : 2, lo, (n & 2) ? 23 : vt ? hi : 21, hi);
    if (vt) fill(lo, (n & 1) ? 0 : lo, hi, (n & 4) ? 23 : hi);
    return m;
  };
  /* a ragged full block (the badlands) */
  const ragged = n => {
    const m = new Uint8Array(TS * TS);
    for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
      let on = true;
      if (!(n & 4) && y > 22 - Math.round(1.4 + wob(x, 0.6) * 1.3)) on = false;
      if (!(n & 1) && y < Math.round(1.4 + wob(x, 2.2) * 1.2)) on = false;
      if (!(n & 8) && x < Math.round(1.4 + wob(y, 1.4) * 1.2)) on = false;
      if (!(n & 2) && x > 22 - Math.round(1.4 + wob(y, 3.3) * 1.2)) on = false;
      m[y * TS + x] = on ? 1 : 0;
    }
    return m;
  };
  /* where a block's top or face meets the open: for rims and end shading */
  const rim = (m, n, x, y) => ({ N: !inMask(m, x, y - 1, n), S: !inMask(m, x, y + 1, n), W: !inMask(m, x - 1, y, n), E: !inMask(m, x + 1, y, n) });

  /* ---- walls: sandbags (desert, arctic), dry stone (temperate) ---- */
  const wallArt = (zone, v, n) => {
    const Z = K.Z[zone], w = Z.wall, g = Z.ground, H = 12, m = ribbon(n, 8, 15), snow = zone === "arctic";
    const stone = zone === "temperate", moss = Z.scrub;
    const bagFace = (x, y, r) => {
      const cr = (r / 4) | 0, qq = r & 3, bx = (x + (cr & 1) * 4 + 1) & 7, e = rim(m, n, x, y);
      let c = bx === 7 ? w[4] : qq === 0 ? ((bx === 0 || bx === 6) ? w[2] : w[0]) : qq === 1 ? w[1] : qq === 2 ? mix(w[1], w[2], 0.5) : w[3];
      if (bx !== 7 && qq === 1 && K.hash(x, r + v * 9) > 0.86) c = w[2];
      if (r === H - 1) c = w[4];
      if (e.E) c = mix(c, w[4], 0.35); else if (e.W) c = mix(c, w[0], 0.3);
      if (snow && (r === 0 || (r === 1 && K.hash(x, 3 + v) > 0.45) || (r === 2 && K.hash(x, 5 + v) > 0.85))) c = r === 0 ? "#ffffff" : g[2];
      return c;
    };
    const bagTop = (x, y) => {
      const e = rim(m, n, x, y);
      if (snow) { let c = q(g, 0.6 + K.bayer(x, y) * 0.8 + (((x + ((y >> 2) & 1) * 4) & 7) === 7 ? 1.4 : 0)); if (e.S) c = g[0]; if (e.E) c = g[3]; return c; }
      const qq = y & 3, bx = (x + ((y >> 2) & 1) * 4) & 7;
      let c = bx === 7 || qq === 3 ? w[2] : qq === 0 ? w[0] : mix(w[0], w[1], 0.5);
      if (e.N) c = w[0]; if (e.S) c = mix(w[0], "#ffffff", 0.25); if (e.E) c = w[2];
      return c;
    };
    const stoneFace = (x, y, r) => {
      const cr = (r / 3) | 0, qq = r % 3, sx = x + cr * 5 + ((K.hash(cr, 1) * 7) | 0), sid = Math.floor(sx / 6), bx = ((sx % 6) + 6) % 6, e = rim(m, n, x, y);
      const tone = K.hash(sid, cr + 11);
      let c = bx === 5 || (qq === 2 && K.hash(sid, cr) > 0.3) ? w[4] : qq === 0 ? (tone > 0.5 ? w[0] : w[1]) : tone > 0.6 ? w[1] : tone > 0.25 ? w[2] : mix(w[2], w[3], 0.5);
      if (r === H - 1) c = w[4];
      if (r < 2 && K.hash(x, r + 31) > 0.78) c = moss[r];
      if (e.E) c = mix(c, w[4], 0.35); else if (e.W) c = mix(c, w[0], 0.25);
      return c;
    };
    const stoneTop = (x, y) => {
      const e = rim(m, n, x, y), sid = Math.floor((x + ((y >> 2) & 1) * 3) / 5) + (y >> 2) * 7;
      let c = ((x + ((y >> 2) & 1) * 3) % 5 === 4 || (y & 3) === 3) ? w[2] : K.hash(sid, 5) > 0.5 ? w[0] : w[1];
      if (K.vn(x / 3 + v * 4, y / 3) > 0.68) c = K.hash(x, y) > 0.5 ? moss[0] : moss[1];
      if (e.S) c = mix(c, "#ffffff", 0.3); if (e.E) c = w[2];
      return c;
    };
    return extrude(m, H, n, stone ? stoneTop : bagTop, stone ? stoneFace : bagFace);
  };

  /* ---- a building's wall: a tall block, a roof on top ---- */
  const hwallArt = (zone, v, n) => {
    const Z = K.Z[zone], w = Z.wall, rf = Z.roof, H = 22, m = new Uint8Array(TS * TS).fill(1);
    const win = v === 1 || v === 3, tiled = zone === "temperate", snow = zone === "arctic";
    const face = (x, y, r) => {
      const e = rim(m, n, x, y);
      let c;
      if (r === 0) c = snow ? "#ffffff" : w[0];
      else if (r === 1) c = snow && K.hash(x, v + 2) > 0.5 ? X.arctic.snow[2] : w[3];
      else if (r >= H - 3) c = r === H - 1 ? w[4] : w[3];
      else {
        const course = ((r - 2) / 4) | 0, joint = ((r - 2) & 3) === 3 || ((x + (course & 1) * 4) & 7) === 0;
        c = joint && K.hash(x, r) > 0.35 ? mix(w[1], w[2], 0.6) : w[1];
        if (K.hash(x * 7 + v, r * 3) > 0.94) c = w[2];
      }
      if (win && r >= 6 && r <= 14 && x >= 8 && x <= 15) {
        const lx = x - 8, ly = r - 6;
        c = ly === 8 ? w[0] : lx === 0 || ly === 0 ? w[4] : ly === 1 ? "#1a1514" : "#2a2422";
        if (v === 3 && ly > 0 && ly < 8 && (lx === 3 || lx === 5)) c = K.MAT.steel[3];
        if (ly === 7 && lx > 0) c = w[3];
      }
      if (v === 2 && r > 4 && r < H - 4 && K.hash(x * 5, r * 7) > 0.93) c = w[4];          /* bullet scars */
      if (e.E) c = mix(c, w[4], 0.4); else if (e.W) c = mix(c, w[0], 0.25);
      return c;
    };
    const top = (x, y) => {
      const e = rim(m, n, x, y);
      const edge = (e.N && y < 2) || (e.S && y > 21) || (e.W && x < 2) || (e.E && x > 21);
      if (edge) return snow ? "#ffffff" : (e.E && x > 21) || (e.S && y > 21) ? w[1] : w[0];
      const inner = (e.N && y === 2) || (e.W && x === 2) || (e.S && y === 21) || (e.E && x === 21);
      if (inner) return snow ? X.arctic.snow[2] : w[3];
      if (tiled) { const row = y % 3, tj = ((x + ((y / 3) | 0) * 2) % 5) === 0; return row === 2 ? rf[2] : tj ? rf[1] : q(rf, 0.4 + K.bayer(x, y) * 0.6 + (K.hash(x, y) - 0.5) * 0.4); }
      return q(rf, 1 + (pfbm(x, y, 11) - 0.5) * 1.2 + K.bayer(x, y) * 0.7 + (K.hash(x + v, y) - 0.5) * 0.4);
    };
    return extrude(m, H, n, top, face);
  };

  /* ---- badlands: a raised block of rough rock, terraced cliff faces ---- */
  const badArt = (zone, v, n) => {
    const Z = K.Z[zone], rk = Z.rock, g = Z.ground, H = 16, m = ragged(n), snow = zone === "arctic", grass = zone === "temperate";
    const face = (x, y, r) => {
      const f = r / H, tx = K.hash(x * 5, (y + r) * 3 + v);
      let c;
      if (r === 0) c = snow ? "#ffffff" : mix(rk[0], "#ffffff", 0.25);
      else if (f < 0.42) c = tx > 0.8 ? rk[3] : (r === 1 ? rk[1] : mix(rk[1], rk[2], 0.5));
      else if (f < 0.52) c = snow ? (tx > 0.3 ? "#ffffff" : g[2]) : grass && tx > 0.55 ? Z.scrub[1] : tx > 0.4 ? rk[0] : mix(rk[0], rk[1], 0.5);
      else c = tx > 0.82 ? rk[4] : mix(rk[2], rk[3], 0.45);
      if ((x * 7 + Math.floor(r / 3) * 13) % 23 === 0 && f < 0.9 && r > 0) c = rk[4];
      if (r === H - 1) c = mix(rk[4], K.OUT, 0.3);
      const e = rim(m, n, x, y);
      if (e.E) c = mix(c, rk[4], 0.35); else if (e.W) c = mix(c, rk[0], 0.2);
      return c;
    };
    const top = (x, y) => {
      const e = rim(m, n, x, y), w = edgeW(x, y);
      /* fine, even rubble with no shapes of its own: a block of these tiles
         must not show the grid they are cut from */
      const h = K.hash(x * 13 + v * 7, y * 29 + v * 3);
      let c = q(rk, 1.7 + (h - 0.5) * 1.1 + K.bayer(x, y) * 0.55 + (pfbm(x, y, 12) - 0.5) * 0.5 + (w - 0.5) * 0.2);
      if (h > 0.965) c = rk[3];
      if (snow) c = h > 0.86 ? (h > 0.95 ? rk[2] : rk[1]) : q(g, 1.4 + K.bayer(x, y) * 1.2 + (h - 0.5) * 0.8);
      else if (grass && h < 0.12) c = Z.scrub[2];
      if (e.N) c = snow ? "#ffffff" : mix(rk[0], "#ffffff", 0.35);
      else if (e.W) c = snow ? g[1] : rk[0];
      else if (e.E) c = rk[3];
      else if (e.S) c = snow ? g[0] : mix(rk[0], "#ffffff", 0.2);
      return c;
    };
    return extrude(m, H, n, top, face);
  };

  /* ---- boulders (the mock's rock) ---- */
  const rockPal = zone => {
    const r = K.Z[zone].rock, s = zone === "arctic";
    return { top: s ? ["#ffffff", "#eef3f9", "#cfdae7"] : [mix(r[0], "#ffffff", 0.42), r[0], mix(r[1], r[2], 0.5)], edge: s ? "#ffffff" : mix(r[0], "#ffffff", 0.3), side: [r[1], r[2], r[3]], out: mix(r[4], K.OUT, 0.45) };
  };
  const drawRock = (g, cx, base, r, seed, pal) => {
    const qr = PM.mulberry(seed * 7 + 1), cy = base - Math.round(r * 0.55), parts = [[0, 0, r]];
    for (let i = 0; i < 3; i++) parts.push([Math.round((qr() - 0.5) * r), Math.round((qr() - 0.5) * r * 0.4), Math.max(2, Math.round(r * (0.5 + qr() * 0.3)))]);
    const topEdge = cy - Math.round(r * 0.15);
    blob(g, cx, cy, parts, (x, y, e, lx) => {
      if (y > base) return null;
      if (e) return pal.out;
      const k = lx / r + K.bayer(x, y) * 0.5 + (K.hash(x * 5 + seed, y * 3) - 0.5) * 0.4;
      if (y < topEdge) return k < -0.3 ? pal.top[0] : k < 0.35 ? pal.top[1] : pal.top[2];
      if (y === topEdge) return pal.edge;
      return k < -0.4 ? pal.side[0] : k < 0.2 ? pal.side[1] : pal.side[2];
    }, 1.25);
  };
  const rockArt = (zone, v) => {
    const { c, g } = Spr(34, 32, 5, 8), pal = rockPal(zone), pad = Pad(-6, -16, 52, 44);
    const big = [8, 10, 7, 9][v], cx = 12 + (v === 2 ? -2 : 0), base = 20;
    if (v === 2) { drawRock(g, cx + 9, base - 3, 4, 40 + v, pal); pad.sweep(cx + 9, base - 4, 4, 2, 0, 4, 0.5); }
    pad.sweep(cx, base - 1, big, Math.max(1, Math.round(big * 0.45)), 0, big, 0.5);
    drawRock(g, cx, base, big, 11 + v * 5 + zone.length, pal);
    if (v === 3) { drawRock(g, cx - 9, base + 2, 3, 70, pal); pad.sweep(cx - 9, base + 1, 3, 1, 0, 3, 0.5); }
    return pad.attach(c);
  };

  /* ---- scrub: the mock's bush; hedges in temperate, snowy shrubs in arctic ---- */
  const bushShade = (zone, seed, r, base) => {
    const L = X[zone].leaf, snow = X[zone].snow;
    return (x, y, e, lx, ly) => {
      if (y > base) return null;
      if (e) return (lx < -1 && ly > -r * 0.4) ? L[3] : L[4];
      if (K.hash(x + seed * 13, y * 7) > 0.95) return zone === "arctic" ? L[4] : "#8a6a44";
      const k = (lx * 0.85 + ly * 0.55) / r + (K.hash(x * 3 + seed, y * 5) - 0.5) * 0.9 + K.bayer(x, y) * 0.6 + (y > base - 2 ? 0.6 : 0);
      if (snow) return k < -0.55 ? snow[0] : k < -0.2 ? snow[1] : k < 0.05 ? snow[2] : k < 0.5 ? L[1] : L[2];
      return k < -0.7 ? L[0] : k < -0.15 ? L[1] : k < 0.45 ? L[2] : L[3];
    };
  };
  const drawBush = (g, zone, cx, base, r, seed, extra) => {
    const qr = PM.mulberry(seed), cy = base - Math.round(r * 0.85), parts = [[0, 0, r]];
    for (let i = 0; i < 6; i++) { const a = qr() * TAU; parts.push([Math.round(Math.cos(a) * r * 0.7), Math.round(Math.sin(a) * r * 0.5) - 1, Math.max(2, Math.round(r * (0.42 + qr() * 0.3)))]); }
    if (extra) parts.push(...extra);
    blob(g, cx, cy, parts, bushShade(zone, seed, r, base), 1.05);
    R(g, cx - 1, base, 3, 1, zone === "arctic" ? "#5d6c84" : "#3a2a1c");
  };
  const bushArt = (zone, v, n) => {
    const { c, g } = Spr(48, 36, 12, 12), pad = Pad(-14, -20, 64, 48);
    if (zone === "temperate") {
      /* a hedge: reaches into the next bush along the row */
      const r = 9, base = 20, cy = base - Math.round(r * 0.85), ex = [];
      if (n & 2) ex.push([8, -1, 8], [13, 0, 7]);
      if (n & 8) ex.push([-8, -1, 8], [-13, 0, 7]);
      if (n & 1) ex.push([1, -7, 8]);
      pad.sweep(12 + ((n & 2) ? 4 : 0) - ((n & 8) ? 4 : 0), base - 1, r + ((n & 10) ? 6 : 0), 4, 0, r * 1.5, 0.6);
      drawBush(g, zone, 12, base, r, 30 + v * 7, ex);
      void cy;
    } else {
      const set = [[[12, 20, 8]], [[9, 19, 6], [17, 21, 4]], [[12, 19, 7]], [[7, 18, 5], [16, 21, 5]]][v];
      if (zone === "arctic" && v === 1) set.push([4, 22, 3]);
      for (const [x, b, r] of set) pad.sweep(x, b - 1, r, Math.max(1, Math.round(r * 0.45)), 0, r * 1.5, 0.6);
      set.slice().sort((a, b) => a[1] - b[1]).forEach(([x, b, r], i) => drawBush(g, zone, x, b, r, 11 + v * 5 + i * 3));
    }
    return pad.attach(c);
  };

  /* ---- trees ---- */
  const palm = (g, x, base, h, seed) => {
    const pts = []; for (let i = 0; i <= h; i++) { const t = i / h; pts.push([x + Math.sin(t * 1.4) * 7, base - i]); }
    pts.forEach((p, i) => { const ring = i % 4 === 0; R(g, p[0] - 1, p[1], 1, 1, ring ? "#5a4228" : "#3e2c1b"); R(g, p[0], p[1], 1, 1, ring ? "#a07a4c" : "#8a6a44"); R(g, p[0] + 1, p[1], 1, 1, ring ? "#7a5a38" : "#5e4530"); R(g, p[0] + 2, p[1], 1, 1, "#2e2015"); });
    R(g, x - 2, base, 5, 1, "#3e2c1b");
    const [tx, ty] = pts[pts.length - 1], qr = PM.mulberry(seed * 31);
    for (let a = 0; a < 4; a++) { const sx = (a - 1.5) * 2.5; for (let s = 0; s < 8; s++) R(g, tx + sx + Math.round(s * 0.25 * (a - 1.5)), ty + 1 + s, 1, 1, s % 2 ? "#7a5a38" : "#a38353"); R(g, tx + sx + Math.round(8 * 0.25 * (a - 1.5)), ty + 9, 1, 1, "#4a3622"); }
    const FR = []; for (let k = 0; k < 11; k++) { const an = -Math.PI + k * (TAU / 11) + (qr() - 0.5) * 0.3; FR.push([an, 15 + qr() * 5]); }
    FR.sort((A, B) => Math.sin(A[0]) - Math.sin(B[0]));
    FR.forEach(([an, L]) => {
      const ca = Math.cos(an), sa = Math.sin(an), lit = ca < 0.3;
      const sp = s => { const u = s / L; return [tx + ca * s * 1.2, ty - 2 + sa * s * 0.5 - Math.sin(u * Math.PI) * 3 + u * u * L * 0.45]; };
      for (let s = 1; s <= L; s++) {
        const u = s / L, [px, py] = sp(s), len = Math.max(1, Math.round((1 - u) * 4.5));
        for (let d = 1; d <= len; d++) { const lx = px + (ca > 0 ? -1 : 1) * d * 0.3 * (sa < 0 ? 1 : 0.6), ly = py + d; R(g, lx, ly, 1, 1, d === len ? (lit ? "#4c5726" : "#323a18") : (lit ? (d < 2 ? "#94a147" : "#6d7a33") : "#4c5726")); }
        R(g, px, py, 1, 1, lit ? (u < 0.6 ? "#c3c86f" : "#a8b452") : "#6d7a33");
        if (s % 2 === 0) R(g, px, py - 1, 1, 1, lit ? "#d7dd8a" : "#7f8c3c");
      }
      const [ex, ey] = sp(L); R(g, ex, ey + 1, 1, 1, "#2c3415");
    });
    R(g, tx - 1, ty - 3, 3, 2, "#5d4a2a"); R(g, tx, ty - 4, 1, 1, "#8c6b3e"); R(g, tx + 1, ty - 1, 2, 2, "#4a3a22"); R(g, tx + 1, ty - 1, 1, 1, "#7a5a38");
  };
  const palmShadow = (pad, x, b, h) => {
    for (let t = 0; t <= 1; t += 0.02) { const lean = Math.sin(t * 1.4) * 7; pad.dot(x + lean * 0.2 + t * h * SX, b + t * h * SY, 0, 2, 1); }
    const tx = x + 7 + h * SX, ty = b + h * SY;
    for (let a = 0; a < 7; a++) { const an = a / 7 * TAU; for (let s = 0; s < 16; s++) pad.disc(tx + Math.cos(an) * s * 1.1, ty + Math.sin(an) * s * 0.45, 1, 1); }
  };
  const broadleaf = (g, pad, zone, cx, base, h, seed) => {
    const L = X[zone].leaf, bk = X[zone].bark, r = 10 + (seed % 3), ccy = base - h + r;
    for (let y = ccy; y <= base; y++) { R(g, cx - 1, y, 1, 1, bk[1]); R(g, cx, y, 1, 1, bk[2]); R(g, cx + 1, y, 1, 1, bk[3]); }
    R(g, cx - 2, base, 5, 1, bk[3]); R(g, cx - 2, base - 1, 1, 1, bk[2]); R(g, cx + 2, base - 1, 1, 1, bk[4]);
    const qr = PM.mulberry(seed * 13 + 5), parts = [[0, 0, r]];
    for (let i = 0; i < 7; i++) { const a = qr() * TAU; parts.push([Math.round(Math.cos(a) * r * 0.62), Math.round(Math.sin(a) * r * 0.48), Math.max(3, Math.round(r * (0.45 + qr() * 0.25)))]); }
    blob(g, cx, ccy, parts, (x, y, e, lx, ly) => {
      if (e) return (lx < -2 && ly < 0) ? L[3] : L[4];
      const clump = K.vn(x / 2.6 + seed, y / 2.2) - 0.5;
      const k = (lx * 0.8 + ly * 0.65) / r + clump * 1.1 + K.bayer(x, y) * 0.5 + (K.hash(x * 3 + seed, y * 5) - 0.5) * 0.4;
      return k < -0.75 ? L[0] : k < -0.2 ? L[1] : k < 0.35 ? L[2] : L[3];
    }, 1.12);
    for (let t = 0; t <= h - r; t += 1) pad.dot(cx - 1, base, t, 3, 1);
    pad.sweep(cx, base, r, Math.round(r * 0.5), h - r * 1.6, h - r * 0.2, 0.3);
  };
  const conifer = (g, pad, zone, cx, base, h, seed) => {
    const N = X[zone].needle, bk = X[zone].bark, snow = X[zone].snow, tiers = 5, qr = PM.mulberry(seed * 17 + 3);
    R(g, cx - 1, base - 3, 3, 4, bk[2]); R(g, cx - 1, base - 3, 1, 4, bk[1]); R(g, cx - 2, base, 5, 1, bk[3]);
    const span = h - 5;
    for (let i = 0; i < tiers; i++) {
      const yb = base - 3 - Math.round(i * span / tiers * 0.95), th = Math.round(span / tiers * 1.55), wb = (tiers - i) / tiers * 9 + 2.5;
      for (let yy = yb - th; yy <= yb + 1; yy++) {
        const t = (yb - yy) / th;
        for (let xx = Math.floor(cx - wb - 1); xx <= cx + wb + 1; xx++) {
          const lx = xx - cx, droop = K.hash(xx + seed, i) < 0.35 ? 1 : 0;
          if (yy > yb + droop - (Math.abs(lx) < wb * 0.4 ? 1 : 0)) continue;
          const half = wb * Math.pow(Math.max(0, 1 - t), 0.85) + (K.hash(xx, yy + seed) - 0.5) * 1.2;
          if (Math.abs(lx) > half) continue;
          const edge = Math.abs(lx) > half - 1 || yy >= yb + droop;
          const k = lx / (wb + 1) * 0.9 + (0.5 - t) * 0.6 + (K.hash(xx * 3 + seed, yy * 5) - 0.5) * 0.6 + K.bayer(xx, yy) * 0.5;
          let c = edge ? (lx < 0 && !(yy >= yb + droop) ? N[3] : N[4]) : k < -0.45 ? N[0] : k < 0 ? N[1] : k < 0.4 ? N[2] : N[3];
          if (snow && !edge && t > 0.3 && k < 0.15 + t * 0.2 && K.hash(xx + 7, yy + seed) > 0.25) c = k < -0.3 ? snow[0] : k < 0 ? snow[1] : snow[2];
          if (snow && yy === Math.round(yb - th * 0.98) && Math.abs(lx) < half) c = snow[0];
          R(g, xx, yy, 1, 1, c);
        }
      }
    }
    R(g, cx, base - h, 1, 3, snow ? snow[1] : N[1]); R(g, cx, base - h + 2, 1, 1, N[3]);
    void qr;
    pad.sweep(cx, base, 9, 4, 3, h, 0.85);
  };
  const treeArt = (zone, v) => {
    if (zone === "desert") {
      const h = [44, 50, 38, 47][v], x = 10 + (v & 1), base = 20;
      const { c, g } = Spr(60, 72, 12, 48), pad = Pad(-12, -40, 100, 68);
      palmShadow(pad, x, base, h);
      palm(g, x, base, h, v + 1);
      return pad.attach(c);
    }
    const { c, g } = Spr(48, 64, 12, 40), pad = Pad(-14, -40, 96, 68);
    if (zone === "temperate" && v < 2) broadleaf(g, pad, zone, 12, 20, 34 + v * 5, v * 11 + 3);
    else conifer(g, pad, zone, 12, 20, [38, 44, 40, 46][v] - (zone === "arctic" ? 0 : 2), v * 7 + 1);
    return pad.attach(c);
  };

  /* ---- barbed wire: concertina coils on pickets, joining both ways ---- */
  const wireArt = (zone, v, n) => {
    const { c, g } = Spr(28, 40, 2, 16), pad = Pad(-4, -14, 56, 42), snow = zone === "arctic";
    const hz = (n & 10) || !(n & 5), vt = n & 5;
    const FRONT = "#ddd6c6", BACK = "#6f695f", HI = "#fff7e8", POST = ["#b39268", "#8a6a48", "#4a3626"];
    const gy = 15;
    const picket = (x, y) => {
      R(g, x, y - 13, 1, 14, POST[1]); R(g, x + 1, y - 13, 1, 14, POST[2]); R(g, x, y - 14, 2, 1, snow ? "#ffffff" : POST[0]);
      R(g, x - 1, y - 13, 1, 13, "rgba(30,20,14,.45)");
      for (let hgt = 0; hgt <= 14; hgt++) pad.dot(x, y, hgt, 2, 1);
    };
    const loop = (cx, cy, rx, ry, part) => {
      for (let a = 0; a < 360; a += 10) {
        const t = a * Math.PI / 180, px = Math.round(cx + Math.cos(t) * rx), py = Math.round(cy + Math.sin(t) * ry);
        const front = Math.sin(t) > -0.2 && Math.cos(t) < 0.6;
        if (front !== part) continue;
        R(g, px, py, 1, 1, front ? FRONT : BACK);
        if (front && ((a / 10) | 0) % 6 === 2) { R(g, px - 1, py, 1, 1, BACK); R(g, px + 1, py, 1, 1, BACK); }
      }
      if (part) R(g, cx - Math.round(rx * 0.7), cy - ry + 1, 1, 1, snow ? "#ffffff" : HI);
    };
    if (hz) {
      const x0 = (n & 8) ? -2 : 3, x1 = (n & 2) ? 25 : 21;
      for (const px of [6, 18]) if (px >= x0 - 1 && px <= x1 + 1) picket(px, gy - 2);
      for (let x = Math.max(0, x0 - 2); x <= Math.min(23, x1 + 2); x++) for (const hgt of [6, 11]) {
        R(g, x, gy - 2 - hgt, 1, 1, ((x + hgt) & 3) === 0 ? "#6e685e" : "#cbc4b4");
        if (((x + hgt * 3) % 6) === 0) { R(g, x, gy - 3 - hgt, 1, 1, "#575148"); R(g, x, gy - 1 - hgt, 1, 1, "#575148"); }
        if (x & 1) pad.dot(x, gy - 2, hgt);
      }
      const cs = []; for (let x = x0; x <= x1; x += 3) cs.push(x);
      cs.forEach(x => loop(x, gy - 4, 3.5, 5, false));
      cs.forEach(x => loop(x, gy - 4, 3.5, 5, true));
      for (let x = Math.max(0, x0 - 3); x <= Math.min(23, x1 + 3); x++) for (let hgt = 1; hgt <= 9; hgt += 2) if ((x + hgt) & 1) pad.dot(x, gy, hgt);
    }
    if (vt) {
      const y0 = (n & 1) ? -2 : (hz ? gy : 4), y1 = (n & 4) ? 25 : (hz ? gy : 20);
      for (let y = y0; y <= y1; y += 4) {
        picket(16, y);
        loop(12, y - 4, 4, 4, false); loop(12, y - 4, 4, 4, true);
        for (let hgt = 1; hgt <= 8; hgt += 2) for (let x = 8; x <= 16; x += 2) pad.dot(x, y, hgt);
      }
    }
    return pad.attach(c);
  };

  /* ---- tank traps: steel hedgehogs, three beams crossing ---- */
  const trapArt = (zone, v) => {
    const { c, g } = Spr(32, 40, 4, 16), pad = Pad(-6, -16, 52, 44), st = K.MAT.steel, snow = zone === "arctic";
    const rust = zone === "desert" ? "#9a5a32" : zone === "temperate" ? "#7e4a2c" : null;
    const rot = v * 0.42 - 0.3, co = Math.cos(rot), si = Math.sin(rot), cx = 12, gy = 16, s = v === 2 ? 0.85 : 1;
    const P3 = ([x, y, z]) => [x * co - y * si * 0.9, x * si * 0.9 + y * co, z].map((k, i) => i < 2 ? k * s : k * s);
    const beams = [[[-8, -3, 0], [8, 3, 11]], [[8, -3, 0], [-8, 3, 11]], [[0, 7, 0], [0, -7, 11]]].map(([a, b]) => [P3(a), P3(b)]);
    beams.sort((A, B) => (A[0][1] + A[1][1]) - (B[0][1] + B[1][1]));
    for (const [A, B] of beams) {
      const len = Math.ceil(Math.hypot(B[0] - A[0], B[1] - A[1], B[2] - A[2]) * 1.5);
      const sx = (B[0] - A[0]) - (B[1] - A[1] - (B[2] - A[2])), lit = sx < 0;
      for (let i = 0; i <= len; i++) {
        const t = i / len, x = A[0] + (B[0] - A[0]) * t, y = A[1] + (B[1] - A[1]) * t, z = A[2] + (B[2] - A[2]) * t;
        const px = cx + x, py = gy + y - z;
        let top = lit ? st[0] : st[1], und = lit ? st[2] : st[3];
        if (rust && K.hash(Math.round(px) * 3 + v, Math.round(py)) > 0.8) { top = rust; und = mix(rust, st[4], 0.5); }
        if (snow && z > 8) top = "#ffffff";
        R(g, px, py, 2, 1, top); R(g, px, py + 1, 2, 1, und);
        pad.dot(cx + x, gy + y, z, 2, 1);
      }
    }
    K.outline(c);
    R(g, cx - 9, gy + 1, 3, 1, "rgba(0,0,0,0)");
    return pad.attach(c);
  };

  /* ---- a pipeline raised on concrete saddles ---- */
  const pipeArt = (zone, v, n) => {
    const { c, g } = Spr(28, 48, 2, 20), pad = Pad(-4, -16, 52, 46), st = K.MAT.steel, cc = K.MAT.concrete, snow = zone === "arctic";
    const hz = (n & 10) || !(n & 5), vt = n & 5;
    const PR = [snow ? "#ffffff" : mix(st[0], "#ffffff", 0.3), st[0], st[1], st[2], st[3], st[4]];
    const saddle = (x, y) => {
      R(g, x - 3, y - 5, 7, 6, cc[2]); R(g, x - 3, y - 5, 7, 1, cc[0]); R(g, x - 3, y - 4, 1, 5, cc[1]); R(g, x + 3, y - 4, 1, 5, cc[3]); R(g, x - 3, y, 7, 1, cc[4]);
      pad.disc(x, y, 3, 2, 2);
    };
    if (hz) {
      const x0 = (n & 8) ? 0 : (vt ? 9 : 2), x1 = (n & 2) ? 23 : (vt ? 15 : 21), gy = 14, z = 7;
      if (x0 <= 12 && x1 >= 12) saddle(12, gy);
      for (let x = x0; x <= x1; x++) {
        const y0 = gy - z - 4;
        const ring = (x === 0 && (n & 8)) || (x === 23 && (n & 2)) || x === x0 || x === x1;
        for (let r = 0; r < 8; r++) {
          let col = r === 0 ? PR[1] : r === 1 ? PR[0] : r < 4 ? PR[2] : r < 6 ? PR[3] : r === 6 ? PR[4] : PR[5];
          if (ring) col = r < 2 ? PR[1] : r < 6 ? PR[3] : PR[5];
          if (!ring && zone !== "arctic" && K.hash(x * 3 + v, r) > 0.94) col = mix(col, "#8e5a3a", 0.5);
          R(g, x, y0 + r, 1, 1, col);
        }
        if (ring) { R(g, x, y0 - 1, 1, 1, PR[2]); R(g, x, y0 + 8, 1, 1, PR[5]); }
        for (let k = -3; k <= 3; k++) pad.dot(x, gy + k, z, 1, 1);
      }
    }
    if (vt) {
      const y0 = (n & 1) ? 0 : (hz ? 14 : 3), y1 = (n & 4) ? 23 : (hz ? 14 : 20), z = 7, cx = 12;
      if (!hz && y0 <= 14 && y1 >= 14) saddle(cx, 16);
      for (let y = y0; y <= y1; y++) {
        const ring = (y === 0 && (n & 1)) || (y === 23 && (n & 4)) || y === 12;
        for (let k = -4; k <= 4; k++) {
          let col = k < -2 ? PR[2] : k < -1 ? PR[0] : k < 1 ? PR[1] : k < 3 ? PR[3] : PR[4];
          if (Math.abs(k) === 4) col = PR[5];
          if (ring) col = Math.abs(k) === 4 ? PR[5] : k < 0 ? PR[1] : PR[3];
          R(g, cx + k, y - z, 1, 1, col);
        }
        for (let k = -3; k <= 3; k++) pad.dot(cx + k, y, z);
      }
      if (!(n & 4) && !hz) {                     /* the open south end: a flanged cap */
        const ey = y1 - z + 1;
        K.disc(g, cx, ey, 4, 3, PR[5]); K.disc(g, cx, ey, 3, 2, PR[3]); K.disc(g, cx - 1, ey - 1, 1, 1, PR[1]);
      }
    }
    return pad.attach(c);
  };

  const STAND = {
    [T.TREE]: treeArt, [T.ROCK]: rockArt, [T.BUSH]: bushArt, [T.WALL]: wallArt, [T.HWALL]: hwallArt,
    [T.WIRE]: wireArt, [T.TRAP]: trapArt, [T.PIPE]: pipeArt, [T.BAD]: badArt,
  };
  const STAND_N = new Set([T.BUSH, T.WALL, T.HWALL, T.WIRE, T.PIPE, T.BAD]);
  PM.standArt = (zone, id, v = 0, n = 0) => {
    const f = STAND[id];
    if (!f) return null;
    if (!K.Z[zone]) zone = "desert";
    v &= 3; n = STAND_N.has(id) ? n & 15 : 0;
    if (id === T.BUSH && zone !== "temperate") n = 0;
    return K.get(`st:${zone}:${id}:${v}:${n}`, () => f(zone, v, n));
  };

  /* =================== the fly-over map: 12 pixels a tile =================== */
  const SMALL_N = { [T.TRENCH]: 10, [T.WATER]: 15, [T.ICE]: 15, [T.THIN]: 15, [T.FLOOR]: 15, [T.ROAD]: 15, [T.MINE]: 15, [T.PIPE]: 10 };
  PM.tileArtSmall = (zone, id, v = 0) => {
    if (!K.Z[zone]) zone = "desert";
    v &= 3;
    return K.get(`sm:${zone}:${id}:${v}`, () => {
      const src = PM.tileArt(zone, id, v, SMALL_N[id] ?? 0), sd = src.getContext("2d").getImageData(0, 0, TS, TS).data;
      const c = K.mk(12, 12), g = c.getContext("2d"), out = g.createImageData(12, 12), o = out.data;
      for (let y = 0; y < 12; y++) for (let x = 0; x < 12; x++) for (let k = 0; k < 3; k++) {
        const i = ((y * 2) * TS + x * 2) * 4 + k;
        o[(y * 12 + x) * 4 + k] = (sd[i] + sd[i + 4] + sd[i + TS * 4] + sd[i + TS * 4 + 4]) / 4;
        o[(y * 12 + x) * 4 + 3] = 255;
      }
      g.putImageData(out, 0, 0);
      const Z = K.Z[zone], Xz = X[zone], snow = zone === "arctic", sh = Z.ground[5];
      const dot = (x, y, col) => K.px(g, x, y, col);
      switch (id) {
        case T.TREE:
          if (zone === "desert") { [[6, 3], [4, 4], [8, 4], [3, 5], [9, 5], [5, 3], [7, 3], [6, 5]].forEach(([x, y], i) => dot(x, y, i < 5 ? "#94a147" : "#6d7a33")); dot(6, 4, "#5d4a2a"); dot(7, 8, sh); dot(6, 7, "#8a6a44"); }
          else { K.disc(g, 7, 6, 3, 3, sh); K.disc(g, 6, 5, 3, 3, Xz.needle[2]); K.disc(g, 5, 4, 2, 1, snow ? "#ffffff" : Xz.needle[0]); dot(7, 7, Xz.needle[4]); }
          break;
        case T.BUSH: K.disc(g, 7, 7, 3, 2, sh); K.disc(g, 6, 6, 3, 2, Xz.leaf[2]); K.disc(g, 5, 5, 1, 1, snow ? "#ffffff" : Xz.leaf[0]); break;
        case T.ROCK: { const p = rockPal(zone); K.disc(g, 7, 7, 3, 2, sh); K.disc(g, 6, 6, 3, 2, p.side[1]); K.disc(g, 5, 5, 2, 1, p.top[0]); break; }
        case T.WALL: R(g, 0, 4, 12, 2, Z.wall[0]); R(g, 0, 6, 12, 2, Z.wall[2]); R(g, 0, 8, 12, 1, sh); break;
        case T.HWALL: R(g, 0, 0, 12, 9, Z.roof[1]); R(g, 0, 0, 12, 1, Z.wall[0]); R(g, 0, 9, 12, 3, Z.wall[2]); R(g, 0, 11, 12, 1, Z.wall[4]); break;
        case T.WIRE: for (let x = 0; x < 12; x++) dot(x, 6 + (x & 1), x % 3 ? "#ddd6c6" : "#6f695f"); dot(3, 5, "#4a3626"); dot(9, 5, "#4a3626"); break;
        case T.TRAP: for (let k = -2; k <= 2; k++) { dot(6 + k, 6 + k, K.MAT.steel[1]); dot(6 + k, 6 - k, K.MAT.steel[2]); } dot(8, 9, sh); break;
        case T.PIPE: R(g, 0, 4, 12, 1, K.MAT.steel[0]); R(g, 0, 5, 12, 2, K.MAT.steel[2]); R(g, 0, 7, 12, 1, K.MAT.steel[4]); R(g, 0, 8, 12, 1, sh); break;
        case T.BAD: for (let y = 0; y < 12; y++) for (let x = 0; x < 12; x++) dot(x, y, y < 8 ? q(Z.rock, 1.4 + K.bayer(x, y) * 1.4 + (K.hash(x + v, y) - 0.5)) : y === 8 ? (snow ? "#ffffff" : Z.rock[0]) : Z.rock[3]); break;
        case T.MINE: dot(5 + (v & 1) * 2, 6, WARN[1]); break;
      }
      return c;
    });
  };
  /* PumaMech: the painters and helpers above, for js/town.js to add the
   * ground of towns, roads and the Vault to the same tables */
  PM.GK = { P, STAND, STAND_N, USES_N, SAME_AS_OPEN, SHARED, NO_GL, SMALL_N, X, Buf, fillGround, dress, stones, Spr, Pad, blob, extrude, inMask, q, R, inner, hs, rgb, mix, wob, rampRGB, fillGL, treeArt, rockArt, bushArt, wallArt, hwallArt, badArt };
})();
