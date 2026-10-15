/* PumaMech -- buildings, street furniture, and the Vault's fittings.
 *
 * PM.bldgArt(o)   a building from the map's objects ({ kind, style, w, h,
 *   door, sign }): its roof seen from above and its south face standing,
 *   the door and a hanging sign on that face. The canvas's (ax, ay) is the
 *   footprint's bottom-left corner; its shadow (c.sh) falls north-east.
 * PM.decorArt(kind)  lamps, crates, a fountain, a well, gantries, the Pact's
 *   dropships, the Vault's door in the mountain.
 * PM.vaultArt(o, state)  the Vault's sealed doors, terminals, panels.
 * PM.iconArt(name, col)  the small pixel icons used on signs and in the HUD. */
"use strict";
(() => {
  const K = PM.K, TS = K.TS, R = (g, x, y, w, h, c) => K.rect(g, x, y, w, h, c), px = (g, x, y, c) => K.px(g, x, y, c);
  const q = (r, L) => r[Math.max(0, Math.min(r.length - 1, Math.round(L)))];
  const mix = K.mix;

  /* ---- icons, 7x7: a letter map ---- */
  const ICON = {
    star:   ["...#...", "...#...", "#######", ".#####.", "..###..", ".##.##.", "##...##"],
    bed:    [".......", "##.....", "##.....", "#######", "#######", "#.....#", "......."],
    book:   ["###.###", "#.#.#.#", "#.#.#.#", "#.#.#.#", "#.#.#.#", "###.###", "...#..."],
    mug:    [".####..", ".#..###", ".#..#.#", ".#..#.#", ".#..###", ".####..", "......."],
    wrench: ["##...##", ".#...#.", ".##.##.", "..###..", "...#...", "...#...", "..###.."],
    coin:   ["..###..", ".#####.", "##.#.##", "##.####", "##.#.##", ".#####.", "..###.."],
    dish:   ["#....#.", ".#..#..", "..##...", "..##.#.", ".#..##.", "#....#.", "...###."],
    fist:   [".###...", "#####..", "######.", "######.", ".#####.", "..####.", "..###.."],
    gun:    ["......#", "#######", "#######", ".##....", ".##....", ".#.....", "......."],
    leaf:   ["....###", "..#####", ".######", ".#####.", ".####..", "#.#....", "#......"],
    paw:    [".#.#.#.", ".#.#.#.", ".......", "..###..", ".#####.", ".#####.", "..###.."],
    mech:   ["..###..", ".#####.", "#.###.#", "#.###.#", "..#.#..", "..#.#..", ".##.##."],
    person: ["..###..", "..###..", "...#...", ".#####.", "#.###.#", "..#.#..", ".##.##."],
    heat:   ["...#...", "..##...", "..###..", ".####..", ".#####.", "#######", ".#####."],
    clock:  ["..###..", ".#..##.", "#...#.#", "#..##.#", "#.....#", ".#...#.", "..###.."],
    key:    [".###...", "#...#..", "#...###", "#...#.#", ".###...", ".......", "......."],
  };
  PM.ICONS = Object.keys(ICON);
  PM.iconArt = (name, col = "#e9e4d8", scale = 1) => K.get(`icon:${name}:${col}:${scale}`, () => {
    const m = ICON[name] || ICON.star, c = K.mk(7 * scale, 7 * scale), g = c.getContext("2d");
    g.fillStyle = col;
    m.forEach((row, y) => [...row].forEach((ch, x) => { if (ch === "#") g.fillRect(x * scale, y * scale, scale, scale); }));
    return c;
  });

  /* ---- what each town builds with ---- */
  const STYLE = {
    bastion: { wall: ["#d9d6cd", "#c3bfb4", "#a7a397", "#8a867b", "#6b685f", "#4d4b45"], roof: ["#9aa06b", "#82875a", "#6b7049", "#565a3b", "#41442d", "#2e3020"], roofType: "metal", trim: "#e8c65c", H: 26 },
    port:    { wall: ["#e6d6b8", "#d5c3a1", "#bfab88", "#a08c6c", "#7d6c52", "#58493a"], roof: ["#d0705a", "#b85845", "#9a4636", "#7a3629", "#5a271e", "#3c1a14"], roofType: "tile", trim: "#7a5a3c", H: 26, brick: ["#b9765a", "#9f6049", "#844d3a", "#6a3c2d"] },
    fern:    { wall: ["#efe3c6", "#dccfae", "#c7b994", "#a99a76", "#857858", "#5e543d"], roof: ["#8fa35a", "#748a47", "#5d7239", "#495b2d", "#364322", "#252e17"], roofType: "shingle", trim: "#5a4128", H: 22, beam: ["#7a5a3a", "#5e432a", "#45301e"] },
    kiln:    { wall: ["#ecc99a", "#ddb47f", "#c99c67", "#ad8051", "#88633e", "#60452b"], roof: ["#e2bf8f", "#d2ab77", "#bb9363", "#9d784e", "#7b5c3b", "#56402a"], roofType: "flat", trim: "#6a4a2c", H: 22 },
  };
  /* a kind can change the style's walls or roof */
  const KIND = {
    hangar:   { H: 34, roofType: "arch", door: "bay", windows: 0 },
    yard:     { H: 30, roofType: "arch", door: "bay", windows: 1 },
    workshop: { H: 26, door: "bay", windows: 1 },
    office:   { H: 30, windows: 4, flag: 1 },
    barracks: { windows: 3 },
    hall:     { windows: 3 },
    mess:     { windows: 2, chimney: 1 },
    bank:     { H: 30, columns: 1, windows: 0 },
    relay:    { H: 30, tower: 1, windows: 1 },
    gym:      { windows: 2 },
    tavern:   { windows: 2, chimney: 1, awning: "#7a3a2a" },
    shop:     { windows: 2, awning: "#3d5c6e" },
    clinic:   { windows: 2, awning: "#4f7a4a" },
    inn:      { windows: 3, chimney: 1 },
    house:    { windows: 2, chimney: 1 },
    cottage:  { windows: 2, chimney: 1 },
    store:    { windows: 1, awning: "#7a6a3a" },
    adobe:    { windows: 2 },
    cantina:  { windows: 2, awning: "#a8462e" },
  };
  const DOOR = ["#8a6440", "#6e4e31", "#553b24", "#3d2a19"];
  const GLASS = ["#a9d3e6", "#6f9fbb", "#3f6a86", "#2a465a"];

  PM.bldgArt = o => K.get(`bldg:${o.kind}:${o.style}:${o.w}:${o.h}:${o.door ? o.door[0] - o.x : "x"}:${o.sign || ""}`, () => {
    const S = STYLE[o.style] || STYLE.port, k = KIND[o.kind] || {};
    const W = o.w * TS, D = o.h * TS, H = k.H || S.H, roofType = k.roofType || S.roofType;
    const rise = roofType === "flat" ? 3 : roofType === "metal" ? 6 : roofType === "arch" ? 14 : 12;
    const extra = (k.tower ? 30 : 0) + (k.chimney ? 6 : 0) + (k.flag ? 14 : 0);
    const top = H + rise + extra + 2;
    const c = K.mk(W, D + top - 0), g = c.getContext("2d");
    /* ground y of the footprint's south edge, in the canvas */
    const GY = D + top - 0, wallTop = GY - H, eaveBack = wallTop - D;
    c.ax = 0; c.ay = GY;
    const wall = S.wall, roof = S.roof;
    /* ---- the roof, from the back eave to the front eave ---- */
    const front = wallTop, back = eaveBack, mid = (front + back) / 2;
    for (let x = 0; x < W; x++) {
      const endW = x < 2 ? -0.8 : x > W - 3 ? 0.9 : 0;
      if (roofType === "flat") {
        for (let y = back; y < front; y++) {
          let L = 1.6 + K.bayer(x, y) * 0.6 + (K.hash(x, y) - 0.5) * 0.4 + endW;
          if (y < back + 2 || y > front - 3 || x < 2 || x > W - 3) L = y > front - 3 ? 0.4 : 0.8;
          if (y === back + 2 || x === 2 || x === W - 3) L = 3.4;
          px(g, x, y, q(roof, L));
        }
        /* beam ends poking out of the face */
        if (x % 12 === 6) { R(g, x, front + 4, 2, 2, S.trim); }
      } else if (roofType === "arch") {
        /* a barrel roof of corrugated sheet, ridges running north-south */
        const ripple = (x % 4 === 0) ? 1.3 : (x % 4 === 1) ? -0.5 : (x % 4 === 3) ? 0.6 : 0;
        for (let y = back - rise; y < front; y++) {
          const t = (y - (back - rise)) / (front - back + rise);
          /* the near half of the barrel faces the sun and the viewer; the far half falls away */
          let L = (t > 0.45 ? 1.2 + (t - 0.45) * 2.2 : 2.6 + (0.45 - t) * 2.4) + ripple * (t > 0.45 ? 1 : 0.6) + K.bayer(x, y) * 0.4 + endW;
          const rib = Math.round((y - (back - rise)) % 14) === 0;
          if (rib) L += 1.4;
          if (Math.abs(t - 0.45) < 0.02) L = 0.2;
          if (y > front - 3) L = 4.4;
          if (K.hash(x >> 3, (y / 14) | 0) > 0.93 && !rib) L += 0.8;
          px(g, x, y, q(roof, L));
        }
      } else {
        /* a pitched roof: the ridge runs east-west; the near slope faces the sun */
        const ridge = mid - rise;
        for (let y = back - 2; y < front; y++) {
          const near = y >= ridge;
          let L = near ? 1.4 : 3.1;
          if (roofType === "tile") { const row = near ? (y - ridge) % 4 : (ridge - y) % 3; const tj = ((x + (((y - ridge) / 4) | 0) * 3) % 6) === 0; L += row === 3 || row === 2 && !near ? 1.6 : 0; if (tj) L += 1; }
          if (roofType === "shingle") { const row = Math.abs(y - ridge) % 3; L += row === 2 ? 1.2 : 0; if (((x + ((Math.abs(y - ridge) / 3) | 0) * 2) % 5) === 0) L += 0.8; }
          if (roofType === "metal") { L += (x % 5 === 0) ? 1 : 0; }
          L += K.bayer(x, y) * 0.5 + (K.hash(x * 3, y) - 0.5) * 0.4 + endW;
          if (Math.abs(y - ridge) < 1) L = 0.2;
          if (y < back) L = 4.4;
          if (y >= front - 1) L = 4.6;
          px(g, x, y, q(roof, L));
        }
      }
    }
    /* ---- the south face ---- */
    for (let y = wallTop; y < GY; y++) for (let x = 0; x < W; x++) {
      const r = y - wallTop;
      let col;
      if (S.brick && r > 2 && r < H - 3) {
        const course = (r / 3) | 0, joint = r % 3 === 2 || ((x + (course & 1) * 4) % 8) === 0;
        col = joint ? wall[3] : q(S.brick, 0.6 + (K.hash((x + (course & 1) * 4) >> 3, course) - 0.5) * 1.4 + K.bayer(x, y) * 0.5);
      } else {
        col = q(wall, 1.3 + (K.vn(x / 6, y / 4) - 0.5) * 0.8 + K.bayer(x, y) * 0.5 + (K.hash(x, y + 7) - 0.5) * 0.3);
        if (o.style === "bastion" && (x % 24 === 0)) col = wall[3];
      }
      if (r === 0) col = wall[0];
      if (r === 1) col = roofType === "flat" ? wall[2] : wall[4];
      if (r >= H - 2) col = wall[4];
      if (x < 1) col = mix(col, wall[0], 0.5); if (x > W - 2) col = mix(col, wall[5], 0.5);
      px(g, x, y, col);
    }
    /* timber framing on a Fernwick cottage */
    if (S.beam) {
      for (let x = 0; x < W; x += 12) R(g, x, wallTop, 2, H, S.beam[1]);
      R(g, 0, wallTop + 1, W, 2, S.beam[0]); R(g, 0, GY - 3, W, 2, S.beam[2]);
    }
    /* ---- windows ---- */
    const dx = o.door ? (o.door[0] - o.x) * TS : -999;
    const nwin = k.windows ?? 2;
    const slots = [];
    for (let i = 0; i < W / 24; i++) { const cx = i * TS + 12; if (Math.abs(cx - (dx + 12)) > 16) slots.push(cx); }
    const pick = slots.filter((_, i) => i % Math.max(1, Math.round(slots.length / Math.max(1, nwin))) === 0).slice(0, nwin);
    for (const cx of pick) {
      const wy = wallTop + Math.round(H * 0.28), wh = Math.round(H * 0.36), ww = 8;
      R(g, cx - ww / 2 - 1, wy - 1, ww + 2, wh + 2, wall[4]);
      for (let y = 0; y < wh; y++) for (let x = 0; x < ww; x++) px(g, cx - ww / 2 + x, wy + y, q(GLASS, (y < wh / 2 ? 1 : 2) + (x === 1 || x === 2 ? -1 : 0) + K.bayer(x, y) * 0.3));
      R(g, cx - 1, wy, 1, wh, wall[3]);
      R(g, cx - ww / 2 - 1, wy + wh + 1, ww + 2, 1, wall[0]);
      /* a warm light in some */
      if (K.hash(cx, o.x + o.y) > 0.6) for (let y = 1; y < wh - 1; y++) px(g, cx + 2, wy + y, "#f2cf7a");
    }
    /* ---- columns on the bank ---- */
    if (k.columns) {
      R(g, 0, wallTop - 1, W, 3, wall[0]);
      for (let x = 6; x < W - 4; x += 10) if (Math.abs(x - (dx + 12)) > 9) { R(g, x, wallTop + 3, 4, H - 5, wall[0]); R(g, x + 3, wallTop + 3, 1, H - 5, wall[3]); R(g, x - 1, GY - 3, 6, 2, wall[2]); }
    }
    /* ---- an awning ---- */
    if (k.awning) {
      const ay = wallTop + 6;
      for (let x = 2; x < W - 2; x++) for (let y = 0; y < 5; y++) px(g, x, ay + y, (x >> 2) & 1 ? (y === 4 ? mix(k.awning, "#000", 0.4) : k.awning) : (y === 4 ? "#bdb3a0" : "#efe6d2"));
    }
    /* ---- the door ---- */
    if (o.door) {
      const big = k.door === "bay", dw = big ? Math.min(W - 16, 40) : 10, dh = big ? H - 6 : Math.min(18, H - 6);
      const x0 = Math.round(dx + 12 - dw / 2), y0 = GY - dh;
      R(g, x0 - 2, y0 - 2, dw + 4, dh + 2, S.trim);
      for (let y = 0; y < dh; y++) for (let x = 0; x < dw; x++) {
        let col;
        if (big) col = q(["#9aa0a8", "#7f858e", "#666b73", "#4f535a", "#3a3d43"], 1.2 + (y % 4 === 0 ? 1.6 : 0) + K.bayer(x, y) * 0.5 + (x < 2 ? -0.6 : 0));
        else col = q(DOOR, 1 + (x === 0 ? -0.6 : 0) + (x === dw - 1 ? 1.5 : 0) + (y === 0 ? 1.4 : 0) + ((x === 4 || x === 5) ? 0.6 : 0) + K.bayer(x, y) * 0.4);
        px(g, x0 + x, y0 + y, col);
      }
      if (big) { R(g, x0, y0 + dh - 2, dw, 2, "#2c2f34"); for (let x = 0; x < dw; x += 8) R(g, x0 + x, y0 + 2, 4, 2, "#e8c65c"); }
      else { px(g, x0 + dw - 3, y0 + dh / 2, "#e8c65c"); R(g, x0 - 3, GY - 1, dw + 6, 1, mix(wall[4], "#000", 0.2)); }
      /* the hanging sign beside it */
      if (o.sign) {
        const sx = x0 + dw + 4, sy = wallTop + 3;
        R(g, sx - 1, sy - 2, 13, 1, "#3a2d22"); R(g, sx, sy - 1, 1, 2, "#3a2d22"); R(g, sx + 10, sy - 1, 1, 2, "#3a2d22");
        R(g, sx - 1, sy + 1, 13, 11, "#2a211a"); R(g, sx, sy + 2, 11, 9, S.trim === "#e8c65c" ? "#3f4429" : "#e9dcc0");
        g.drawImage(PM.iconArt(o.sign, S.trim === "#e8c65c" ? "#e8c65c" : "#5a3a24"), sx + 2, sy + 3);
      }
    }
    /* ---- the extras: chimney, the relay's tower, the office's flag ---- */
    if (k.chimney) { const cx = W - 16, cy = mid - rise - 2; R(g, cx, cy - 8, 6, 12, wall[2]); R(g, cx, cy - 8, 6, 2, wall[4]); R(g, cx + 4, cy - 6, 2, 10, wall[3]); }
    if (k.tower) {
      const cx = Math.round(W / 2), base = mid - rise + 2;
      for (let y = base - 30; y < base; y++) { const w2 = 2 + Math.round((y - (base - 30)) / 10); R(g, cx - w2, y, w2 * 2, 1, (y & 3) === 0 ? "#6f7782" : "#9aa3ad"); }
      K.disc(g, cx + 1, base - 32, 7, 3, "#c9ced4"); K.disc(g, cx + 1, base - 31, 6, 2, "#9aa3ad"); px(g, cx + 1, base - 36, "#e4572e");
    }
    if (k.flag) { const fx = 8, fy = mid - rise - 14; R(g, fx, fy, 1, 18, "#cfd3d8"); R(g, fx + 1, fy, 10, 6, "#d77b2c"); R(g, fx + 1, fy + 2, 10, 1, "#f3e2bb"); px(g, fx + 5, fy + 1, "#f3e2bb"); }
    K.outline(c, "#1d1917");
    /* ---- the shadow: the block cast to the north-east ---- */
    const Ht = H + rise * 0.6, sw = W + Math.ceil(Ht * K.SX) + 4, shh = D + Math.ceil(Ht * -K.SY) + 4;
    const s = K.mk(sw, shh), sg = s.getContext("2d");
    sg.fillStyle = "#000";
    const oy = shh - D;
    for (let z = 0; z <= Ht; z += 1) sg.fillRect(Math.round(z * K.SX), Math.round(oy + z * K.SY), W, D);
    c.sh = s; c.shx = 0; c.shy = GY - D - oy;
    return c;
  });

  /* ---- street furniture and big things ---- */
  const shadowOf = (c, bx, by, rx, ry, h) => K.withShadow(c, bx, by, rx, ry, h, 0.4);
  const DECOR = {
    lamp: () => { const c = K.mk(10, 34), g = c.getContext("2d"); R(g, 4, 6, 2, 26, "#3d434c"); R(g, 4, 6, 1, 26, "#646a74"); R(g, 2, 2, 6, 5, "#2e3035"); R(g, 3, 3, 4, 3, "#ffe7a3"); R(g, 3, 31, 4, 2, "#30343b"); K.outline(c); c.ax = 5; c.ay = 32; return shadowOf(c, 5, 32, 1, 1, 26); },
    flag: () => { const c = K.mk(18, 46), g = c.getContext("2d"); R(g, 2, 2, 2, 42, "#cfd3d8"); R(g, 3, 2, 1, 42, "#8a9099"); R(g, 4, 3, 12, 8, "#d77b2c"); R(g, 4, 6, 12, 2, "#f3e2bb"); px(g, 9, 4, "#f3e2bb"); px(g, 10, 4, "#f3e2bb"); R(g, 0, 42, 6, 2, "#8a867b"); K.outline(c); c.ax = 3; c.ay = 43; return shadowOf(c, 3, 43, 2, 1, 40); },
    crates: () => { const c = K.mk(26, 24), g = c.getContext("2d"); const box = (x, y, w, h) => { R(g, x, y, w, h, "#a9824f"); R(g, x, y, w, 3, "#c9a274"); R(g, x, y + 3, w, 1, "#6a4f36"); R(g, x + w - 2, y + 3, 2, h - 3, "#8a6a48"); R(g, x + 2, y + 6, w - 4, 1, "#8a6a48"); }; box(1, 9, 12, 13); box(13, 11, 11, 11); box(5, 1, 11, 10); K.outline(c); c.ax = 12; c.ay = 22; return shadowOf(c, 12, 22, 10, 3, 14); },
    fountain: () => { const c = K.mk(52, 34), g = c.getContext("2d"); K.disc(g, 26, 22, 24, 9, "#a7a397"); K.disc(g, 26, 21, 22, 8, "#c3bfb4"); K.disc(g, 26, 21, 19, 6, "#3f7590"); K.disc(g, 25, 20, 17, 5, "#5f98b3"); R(g, 24, 6, 4, 15, "#c3bfb4"); R(g, 27, 6, 1, 15, "#8a867b"); K.disc(g, 26, 6, 5, 2, "#d9d6cd"); R(g, 25, 1, 2, 5, "#bfe3f2"); px(g, 22, 4, "#bfe3f2"); px(g, 30, 4, "#bfe3f2"); K.outline(c); c.ax = 26; c.ay = 30; return shadowOf(c, 26, 28, 22, 7, 8); },
    well: () => { const c = K.mk(26, 32), g = c.getContext("2d"); K.disc(g, 13, 24, 11, 5, "#8a867b"); K.disc(g, 13, 23, 9, 4, "#2a3540"); R(g, 3, 6, 2, 18, "#6a4f36"); R(g, 21, 6, 2, 18, "#6a4f36"); for (let x = 1; x < 25; x++) R(g, x, 3 + Math.abs(x - 13) / 4, 1, 3, x < 13 ? "#9a4636" : "#7a3629"); K.outline(c); c.ax = 13; c.ay = 28; return shadowOf(c, 13, 26, 10, 4, 20); },
    cart: () => { const c = K.mk(30, 22), g = c.getContext("2d"); R(g, 2, 6, 24, 9, "#a9824f"); R(g, 2, 6, 24, 2, "#c9a274"); R(g, 2, 13, 24, 2, "#6a4f36"); R(g, 4, 2, 18, 5, "#d4c27a"); K.disc(g, 7, 16, 4, 4, "#4a3626"); K.disc(g, 7, 16, 2, 2, "#8a6a48"); K.disc(g, 21, 16, 4, 4, "#4a3626"); K.disc(g, 21, 16, 2, 2, "#8a6a48"); R(g, 25, 10, 5, 2, "#6a4f36"); K.outline(c); c.ax = 14; c.ay = 20; return shadowOf(c, 14, 19, 12, 3, 10); },
    haystack: () => { const c = K.mk(26, 22), g = c.getContext("2d"); for (let y = 0; y < 18; y++) { const w = Math.round(11 * Math.sin((y + 2) / 21 * Math.PI)); for (let x = -w; x <= w; x++) px(g, 13 + x, 2 + y, q(["#f2d98a", "#dcbf66", "#c1a24c", "#9c8139"], 0.6 + (x + w) / (2 * w + 1) * 2.4 + K.bayer(x, y) * 0.6)); } K.outline(c); c.ax = 13; c.ay = 20; return shadowOf(c, 13, 19, 10, 3, 14); },
    minehead: () => { const c = K.mk(40, 56), g = c.getContext("2d"); for (let y = 4; y < 50; y++) { const w = 4 + Math.round((y - 4) / 3); R(g, 20 - w, y, 2, 1, "#6a4f36"); R(g, 18 + w, y, 2, 1, "#4a3626"); if (y % 8 === 0) R(g, 20 - w, y, w * 2, 1, "#8a6a48"); } K.disc(g, 20, 6, 6, 6, "#5c636e"); K.disc(g, 20, 6, 3, 3, "#a3aab3"); R(g, 12, 44, 16, 8, "#2a211a"); K.outline(c); c.ax = 20; c.ay = 52; return shadowOf(c, 20, 51, 10, 3, 46); },
    gantry: () => { const c = K.mk(34, 64), g = c.getContext("2d"); for (const x of [2, 28]) { R(g, x, 4, 4, 58, "#e8c65c"); R(g, x + 3, 4, 1, 58, "#a8862e"); for (let y = 8; y < 60; y += 10) R(g, x, y, 4, 1, "#3a3d43"); } R(g, 2, 2, 30, 4, "#e8c65c"); R(g, 2, 5, 30, 1, "#a8862e"); R(g, 6, 26, 22, 3, "#5c636e"); K.outline(c); c.ax = 17; c.ay = 62; return shadowOf(c, 17, 61, 14, 3, 56); },
    dropship: () => {
      /* the Pact's lander: a squat grey wedge on four feet, the wolf's red on its flank */
      const c = K.mk(130, 120), g = c.getContext("2d"), sl = ["#c6cdd9", "#a3acbb", "#828c9d", "#646d7e", "#49505e", "#313640"];
      for (let y = 0; y < 90; y++) { const t = y / 90, w = Math.round(30 + 32 * Math.sin(Math.min(1, t * 1.6) * Math.PI / 2)); for (let x = -w; x <= w; x++) { const L = 1 + (x / w) * 1.6 + (y > 70 ? 1.2 : 0) + K.bayer(x, y) * 0.5 + ((y % 14) === 0 ? 1 : 0); px(g, 65 + x, 12 + y, q(sl, L)); } }
      R(g, 50, 30, 30, 5, "#2a465a"); R(g, 52, 31, 8, 2, "#6f9fbb");
      R(g, 20, 70, 90, 4, "#b73e2d"); R(g, 30, 64, 70, 3, "#882a20");
      for (const [x, y] of [[14, 100], [110, 100], [34, 106], [92, 106]]) { R(g, x - 3, y - 18, 6, 18, "#474c55"); R(g, x - 6, y - 2, 12, 4, "#30343b"); }
      K.disc(g, 65, 104, 22, 6, "#49505e");
      K.outline(c); c.ax = 65; c.ay = 108;
      return shadowOf(c, 65, 106, 54, 14, 80);
    },
    vaultdoor: () => {
      /* a round door of old steel, half sunk in the mountain */
      const c = K.mk(80, 64), g = c.getContext("2d");
      K.disc(g, 40, 34, 34, 28, "#5c6570"); K.disc(g, 40, 34, 30, 25, "#9aa3ad"); K.disc(g, 40, 34, 26, 21, "#7b848f");
      for (let a = 0; a < 12; a++) { const t = a / 12 * Math.PI * 2; K.disc(g, 40 + Math.cos(t) * 28, 34 + Math.sin(t) * 23, 2, 2, "#c9ced4"); }
      R(g, 14, 32, 52, 4, "#414851"); R(g, 38, 10, 4, 48, "#414851");
      K.disc(g, 40, 34, 7, 6, "#3a3f48"); K.disc(g, 40, 34, 4, 3, "#9fe3ff");
      R(g, 4, 58, 72, 6, "#5c6570");
      K.outline(c); c.ax = 40; c.ay = 62;
      return c;
    },
    sign: () => { const c = K.mk(16, 24), g = c.getContext("2d"); R(g, 7, 8, 2, 16, "#6a4f36"); R(g, 1, 2, 14, 8, "#a9824f"); R(g, 1, 2, 14, 2, "#c9a274"); R(g, 3, 5, 10, 1, "#4a3626"); K.outline(c); c.ax = 8; c.ay = 23; return shadowOf(c, 8, 23, 1, 1, 16); },
  };
  PM.decorArt = kind => K.get(`decor:${kind}`, () => (DECOR[kind] || DECOR.crates)());

  /* ---- the Vault's fittings ---- */
  PM.vaultArt = (o, st = {}) => K.get(`vault:${o.kind}:${o.n || o.id || ""}:${st.open ? 1 : 0}:${st.on ? 1 : 0}:${st.used ? 1 : 0}`, () => {
    const c = K.mk(24, 48), g = c.getContext("2d");
    c.ax = 0; c.ay = 48;
    const metal = ["#b7bec7", "#9ea6b1", "#878f9b", "#6f7783", "#58606b", "#424852"];
    const glow = { red: "#ff6b5a", blue: "#6ab8ff", yellow: "#ffd35c" };
    switch (o.kind) {
      case "vdoor": {
        if (st.open) { R(g, 0, 20, 24, 28, "#0f1114"); R(g, 0, 20, 3, 28, metal[2]); R(g, 21, 20, 3, 28, metal[4]); R(g, 0, 18, 24, 3, metal[1]); }
        else {
          for (let y = 18; y < 48; y++) for (let x = 0; x < 24; x++) px(g, x, y, q(metal, 1.5 + (x === 11 || x === 12 ? 2.5 : 0) + (y % 8 === 0 ? 1 : 0) + K.bayer(x, y) * 0.4 + (x > 20 ? 1.2 : 0)));
          R(g, 0, 16, 24, 3, metal[0]);
          const cols = ["red", "blue", "yellow"];
          cols.forEach((k, i) => R(g, 4 + i * 6, 22, 4, 3, glow[k]));
          R(g, 9, 28, 6, 8, "#262a31"); R(g, 10, 29, 4, 2, "#7fd6c0");
          g.font = "bold 7px sans-serif";
        }
        break;
      }
      case "term": {
        const col = glow[PM.TERMINALS[o.id][0]];
        R(g, 4, 22, 16, 24, metal[3]); R(g, 4, 22, 16, 2, metal[1]); R(g, 18, 24, 2, 22, metal[5]);
        R(g, 6, 25, 12, 9, "#14171b"); if (st.on) { R(g, 7, 26, 10, 7, mix(col, "#000000", 0.55)); R(g, 8, 27, 8, 1, col); R(g, 8, 29, 5, 1, col); R(g, 8, 31, 7, 1, col); }
        R(g, 6, 37, 12, 3, metal[4]); for (let i = 0; i < 4; i++) px(g, 7 + i * 3, 38, st.on ? col : metal[2]);
        R(g, 3, 45, 18, 3, metal[4]);
        break;
      }
      case "power": R(g, 3, 18, 18, 28, metal[4]); R(g, 5, 20, 14, 22, metal[3]); R(g, 9, 24, 6, 14, "#262a31"); R(g, 10, st.on ? 25 : 31, 4, 6, st.on ? "#7fb069" : "#e4572e"); R(g, 6, 42, 12, 2, "#e8c65c"); break;
      case "startable": K.disc(g, 12, 38, 11, 6, metal[3]); K.disc(g, 12, 37, 10, 5, "#141a2a"); for (let i = 0; i < 14; i++) px(g, 4 + (K.hash(i, 3) * 16 | 0), 33 + (K.hash(i, 9) * 8 | 0), i % 4 ? "#cfe6ff" : "#ffd35c"); R(g, 10, 43, 4, 4, metal[4]); break;
      case "crates": for (const [x, y] of [[1, 34], [11, 36], [5, 26]]) { R(g, x, y, 11, 10, "#6b7049"); R(g, x, y, 11, 2, "#9aa06b"); R(g, x + 9, y + 2, 2, 8, "#41442d"); R(g, x + 3, y + 4, 5, 2, "#e8c65c"); } break;
      case "array": R(g, 2, 26, 20, 20, metal[3]); R(g, 2, 26, 20, 2, metal[1]); R(g, 4, 29, 16, 8, "#141a22"); if (st.on) { R(g, 5, 30, 14, 6, "#1d4a3f"); for (let x = 5; x < 19; x++) px(g, x, 33 + Math.round(Math.sin(x) * 2), "#7fd6c0"); } for (let i = 0; i < 6; i++) R(g, 4 + i * 3, 40, 2, 2, i & 1 ? "#ffd35c" : "#6ab8ff"); K.disc(g, 12, 16, 8, 4, metal[1]); R(g, 11, 18, 2, 8, metal[3]); break;
      case "note": R(g, 11, 24, 2, 22, "#6a4f36"); R(g, 6, 24, 12, 10, "#f3ecd8"); for (let y = 26; y < 33; y += 2) R(g, 7, y, 9, 1, "#9c9583"); px(g, 12, 25, "#e4572e"); break;
      case "bay": R(g, 0, 44, 24, 4, "#e8c65c"); for (let x = 0; x < 24; x += 6) R(g, x, 44, 3, 4, "#2e3035"); break;
      case "light": K.disc(g, 12, 44, 6, 2, "#c7ecff"); R(g, 11, 30, 2, 14, metal[3]); R(g, 9, 28, 6, 3, "#e9fbff"); break;
      default: break;
    }
    K.outline(c, "#1d1917");
    c.sh = null;
    return c;
  });
})();
