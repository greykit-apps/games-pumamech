/* PumaMech -- the ground this game adds: town paving, dirt roads, the
 * bridge, crop fields, and the Vault's deck plates, grating and walls.
 * Painted into js/ground.js's own tables (PM.GK), so they are cached,
 * placed and lit like every other tile. */
"use strict";
(() => {
  const K = PM.K, T = PM.T, TS = K.TS, G = PM.GK;
  const { P, STAND, STAND_N, USES_N, q, mix, inner, extrude, fillGround, dress } = G;
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;

  /* stone setts in offset rows: Portgate and the Bastion */
  const SETT = { desert: ["#efe0c0", "#ddc9a3", "#c8b289", "#ad9670", "#8b7656", "#665641"],
    temperate: ["#d6d1c4", "#c0baab", "#a8a191", "#8c8677", "#6d685c", "#504c43"],
    arctic: ["#e7ebf1", "#d1d7e0", "#b8c0cc", "#9aa3b2", "#7a8393", "#5b6372"] };
  P[T.PAVE] = (b, zone, v, n) => {
    const s = SETT[zone];
    for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
      const row = (y / 4) | 0, py = y & 3, ox = (row & 1) * 3, px = (x + ox) % 6, id = ((x + ox) / 6 | 0) + row * 7;
      let L = 1.4 + (K.hash(id, row + v * 3) - 0.5) * 1.1 + K.bayer(x, y) * 0.45;
      if (py === 0) L -= 0.5;
      if (py === 3 || px === 5) L = 4.2;
      if (px === 0 && py !== 3) L -= 0.3;
      b.set(x, y, q(s, L));
    }
    /* a kerb where the paving stops */
    const g = K.Z[zone].ground;
    for (let i = 0; i < TS; i++) {
      if (!(n & 1)) { b.set(i, 0, s[0]); b.set(i, 1, s[3]); }
      if (!(n & 4)) { b.set(i, 23, s[5]); b.set(i, 22, s[1]); }
      if (!(n & 8)) { b.set(0, i, s[0]); b.set(1, i, s[3]); }
      if (!(n & 2)) { b.set(23, i, s[5]); b.set(22, i, s[2]); }
    }
    if (v === 3) for (let i = 0; i < 3; i++) { const x = 4 + ((K.hash(i, 9) * 15) | 0), y = 4 + ((K.hash(i, 3) * 15) | 0); b.set(x, y, g[2]); b.set(x + 1, y, g[3]); }
  };
  P[T.BLDG] = (b, zone, v) => { const s = SETT[zone]; for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) b.set(x, y, q(s, 3 + K.bayer(x, y))); };

  /* a dirt road: packed earth, two wheel ruts along it, grass creeping in at the sides */
  P[T.DIRT] = (b, zone, v, n) => {
    const Z = K.Z[zone], d = Z.dirt;
    fillGround(b, zone, v);
    const horiz = (n & 10) || !(n & 5), vert = (n & 5) || !(n & 10);
    for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
      /* how far into the road this pixel is: 0 at an open side, 1 well inside */
      const k = inner(n, x, y, 6) + (K.hash(x * 3 + 1, y * 5 + v) - 0.5) * 0.5 + K.bayer(x, y) * 0.4;
      if (k < 0.45) continue;
      let L = 2.2 + (K.vn(x / 5 + v * 3, y / 5) - 0.5) * 1.2 + K.bayer(x, y) * 0.6 + (K.hash(x, y + 3) - 0.5) * 0.5;
      const a = horiz ? y : x, b2 = vert ? x : y;
      if ((horiz && (a === 8 || a === 15)) || (vert && !horiz && (b2 === 8 || b2 === 15))) L += 1.3;
      if ((horiz && (a === 9 || a === 16)) || (vert && !horiz && (b2 === 9 || b2 === 16))) L -= 0.6;
      if (vert && horiz && (x === 8 || x === 15)) L += 1;
      b.set(x, y, q(d, L));
    }
    const r = K.rng("dirt", zone, v);
    for (let i = 0; i < 4; i++) { const x = 3 + (r() * 18 | 0), y = 3 + (r() * 18 | 0); b.set(x, y, d[5]); b.set(x, y - 1, d[0]); }
  };

  /* the bridge: planks across, a rail along each side, the river under its ends */
  const PLANK = ["#d9b583", "#c39c69", "#a98252", "#8a6740", "#6a4d30", "#4a3523"];
  P[T.BRIDGE] = (b, zone, v, n) => {
    const water = K.Z[zone].water;
    const ew = !!(n & 10) || !(n & 5);
    for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
      const a = ew ? x : y, c = ew ? y : x;
      if (c < 2 || c > 21) { b.set(x, y, q(water, 1.6 + K.bayer(x, y) + (K.hash(x, y) - 0.5))); continue; }
      let L = 1.3 + (K.hash((a / 4) | 0, v + 5) - 0.5) * 1 + K.bayer(x, y) * 0.5 + (K.hash(a, c) - 0.5) * 0.3;
      if (a % 4 === 3) L = 4.3;
      if (c === 2 || c === 21) L = 5;
      if (c === 3 || c === 20) L = 0.3;
      if ((c === 4 || c === 19) && a % 8 === 1) L = 5;               /* nail heads */
      b.set(x, y, q(PLANK, L));
    }
  };

  /* crops in rows: a furrow, a row of green, gold where it is ripe */
  P[T.FIELD] = (b, zone, v, n) => {
    const d = K.Z[zone].dirt, crop = zone === "desert" ? ["#e8d48a", "#cdb466", "#a8904a", "#7d6a36"] : ["#c9dc7c", "#9fbf55", "#77983d", "#536f2c"];
    for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
      const row = y % 6;
      let c;
      if (row < 2) c = q(d, 3 + K.bayer(x, y) + (K.hash(x, y) - 0.5) * 0.6);
      else {
        const sprig = K.hash(x, ((y / 6) | 0) + v * 9) > 0.25;
        c = sprig ? q(crop, (row === 2 ? 0.2 : row === 5 ? 2.6 : 1.3) + K.bayer(x, y) * 0.7 + (K.hash(x * 3, y) - 0.5) * 0.6) : q(d, 2 + K.bayer(x, y));
        if (v === 2 && row === 2 && K.hash(x, y) > 0.8) c = "#f0d35c";
      }
      if (inner(n, x, y, 2) < 0.5) c = q(d, 2.2 + K.bayer(x, y));
      b.set(x, y, c);
    }
  };

  /* ---- the Vault: deck plates, grating, walls ---- */
  const DECK = ["#b7bec7", "#9ea6b1", "#878f9b", "#6f7783", "#58606b", "#424852", "#2e333a"];
  P[T.VFLOOR] = (b, zone, v) => {
    for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
      const px = x % 12, py = y % 12;
      let L = 2.4 + (K.vn(x / 9 + v * 5, y / 9) - 0.5) * 0.7 + K.bayer(x, y) * 0.45 + (K.hash(x + v, y) - 0.5) * 0.25;
      if (px === 0 || py === 0) L = 1.2; if (px === 11 || py === 11) L = 4.6;
      if ((px === 2 || px === 9) && (py === 2 || py === 9)) L = 5.2;
      b.set(x, y, q(DECK, L));
    }
    if (v === 1) for (let i = 0; i < 5; i++) b.set(5 + i * 3, 17 - (i & 1), DECK[5]);      /* scuffs */
  };
  P[T.GRATE] = (b, zone, v) => {
    for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
      const bar = x % 3 === 0 || y % 6 === 0;
      b.set(x, y, bar ? q(DECK, 2 + K.bayer(x, y) * 0.5) : (y % 6 === 1 ? DECK[6] : "#1d2227"));
    }
    /* a faint glow in the dark under it */
    if (v === 2) for (let x = 4; x < 20; x += 3) b.set(x + 1, 10, "#3f6a5c");
  };
  USES_N.add(T.PAVE); USES_N.add(T.DIRT); USES_N.add(T.BRIDGE); USES_N.add(T.FIELD);
  G.NO_GL.add(T.PAVE); G.NO_GL.add(T.BRIDGE); G.NO_GL.add(T.FIELD); G.NO_GL.add(T.BLDG); G.NO_GL.add(T.VFLOOR); G.NO_GL.add(T.GRATE);
  G.SHARED.add(T.BLDG); G.SHARED.add(T.VFLOOR); G.SHARED.add(T.GRATE); G.SHARED.add(T.PAVE); G.SHARED.add(T.BRIDGE); G.SHARED.add(T.FIELD);

  /* the Vault's walls: blocks of dark plate, a lit strip along the top of each face */
  const WALLC = ["#8d96a3", "#727b88", "#5c6470", "#484e59", "#363b44", "#262a31"];
  const vwallArt = (zone, v, n) => {
    const H = 26, m = new Uint8Array(TS * TS).fill(1);
    const face = (x, y, r) => {
      const e = { E: !(n & 2) && x === 23, W: !(n & 8) && x === 0 };
      let c;
      if (r === 0) c = WALLC[0];
      else if (r === 3) c = v === 1 && x > 4 && x < 19 ? "#7fd6c0" : WALLC[3];
      else if (r === H - 1) c = WALLC[5];
      else if (r > H - 4) c = WALLC[4];
      else {
        const panel = (x % 12 === 0) || (r - 4) % 11 === 0;
        c = panel ? WALLC[4] : q(WALLC, 2 + K.bayer(x, r) * 0.5 + (K.hash(x, r + v) - 0.5) * 0.3);
        if ((x % 12 === 2 || x % 12 === 9) && ((r - 4) % 11 === 2 || (r - 4) % 11 === 9)) c = WALLC[0];
      }
      if (e.E) c = mix(c, WALLC[5], 0.45); else if (e.W) c = mix(c, WALLC[0], 0.3);
      return c;
    };
    const top = (x, y) => {
      const edge = (!(n & 1) && y < 1) || (!(n & 4) && y > 22) || (!(n & 8) && x < 1) || (!(n & 2) && x > 22);
      if (edge) return (!(n & 2) && x > 22) || (!(n & 4) && y > 22) ? WALLC[2] : WALLC[0];
      return q(["#3a3f48", "#33373f", "#2c3037", "#25292f"], 1 + K.bayer(x, y) * 0.8 + (K.vn(x / 6, y / 6) - 0.5));
    };
    return extrude(m, H, n, top, face);
  };
  STAND[T.VWALL] = vwallArt; STAND_N.add(T.VWALL);
  G.SHARED.add(T.VWALL);
  P[T.VWALL] = (b) => { for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) b.set(x, y, "#202329"); };
})();
