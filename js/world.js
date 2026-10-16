/* PumaMech -- the world of Pardalis, and the Vault under the High Spurs.
 * Data and generation, DOM-free.
 *
 * One continent, laid out by hand and filled in by noise from a fixed seed,
 * so it is the same world every game: the Bastion (the academy) in the
 * north-west, Portgate and its spaceport in the middle, Fernwick in the
 * eastern woods, Kiln Hollow in the south-western badlands, and the snowy
 * High Spurs in the north-east, where the Founders' Vault is hidden. Roads
 * join them; a river runs down between them with one bridge.
 *
 * A map: { id, w, h, t (tiles), z (zone: 0 desert, 1 temperate, 2 arctic),
 * r (region), objs (buildings and things standing on the ground: each with
 * a place to visit, maybe), npcs, pads (where parked mechs stand), towns }. */
"use strict";
(() => {
  const T = PM.T;
  /* the tiles this game adds to Airborne Puma's set */
  Object.assign(T, { PAVE: 19, DIRT: 20, BRIDGE: 21, FIELD: 22, BLDG: 23, VFLOOR: 24, VWALL: 25, FENCE: 26, GRATE: 27 });
  PM.ZONES = ["desert", "temperate", "arctic"];

  /* ---- what each tile allows ----
   * walk: the party may walk on it while exploring; m and f: what a step on
   * it costs a mech and a person in a fight (0: they cannot); cover: how
   * much harder someone standing in it is to hit; los: it blocks a shot */
  const TF = PM.TF = [];
  const f = (id, o) => { TF[id] = Object.assign({ walk: true, m: 1, f: 1, cover: 0, los: false }, o); };
  f(T.OPEN, {}); f(T.ROUGH, {}); f(T.FLOOR, {}); f(T.ROAD, {}); f(T.PAVE, {}); f(T.DIRT, {}); f(T.BRIDGE, {}); f(T.VFLOOR, {}); f(T.GRATE, {});
  f(T.BUSH, { cover: 10 }); f(T.FIELD, { cover: 5 }); f(T.CRATER, { cover: 10 }); f(T.TRENCH, { cover: 15 });
  f(T.ROCK, { walk: false, m: 0, f: 0 }); f(T.TREE, { walk: false, m: 2, f: 2, cover: 20, los: true });
  f(T.WALL, { walk: false, m: 0, f: 0 }); f(T.HWALL, { walk: false, m: 0, f: 0, los: true });
  f(T.BAD, { walk: false, m: 0, f: 0, los: true }); f(T.BLDG, { walk: false, m: 0, f: 0, los: true });
  f(T.VWALL, { walk: false, m: 0, f: 0, los: true }); f(T.FENCE, { walk: false, m: 0, f: 0 });
  f(T.WATER, { walk: false, m: 3, f: 0 }); f(T.ICE, { walk: true, m: 2, f: 2 }); f(T.THIN, { walk: false, m: 0, f: 0 });
  f(T.WIRE, { walk: false, m: 1, f: 0 }); f(T.MINE, {}); f(T.TRAP, { walk: false, m: 0, f: 0 }); f(T.PIPE, { walk: false, m: 2, f: 2 });

  PM.tileAt = (map, x, y) => (x < 0 || y < 0 || x >= map.w || y >= map.h) ? (map.edge ?? T.BAD) : map.t[y * map.w + x];
  PM.zoneAt = (map, x, y) => PM.ZONES[(x < 0 || y < 0 || x >= map.w || y >= map.h) ? map.zdef : map.z[y * map.w + x]];

  /* ---- the regions, for names and for what lives there ---- */
  PM.REGIONS = [
    { name: "", enc: null },
    { name: "Bastion Downs", enc: "downs" },
    { name: "Greenreach", enc: "plains" },
    { name: "Fernwood", enc: "forest" },
    { name: "Kiln Badlands", enc: "badlands" },
    { name: "High Spurs", enc: "spurs" },
    { name: "The Vault", enc: "vault" },
    { name: "Portgate Spaceport", enc: "spaceport" },
  ];

  /* ---- the towns ----
   * b: buildings [place, kind, x, y, w, h, door x (absolute), sign]; kinds
   * are js/buildings.js's; a place with no door is scenery. pads: where the
   * lance parks while the party is in town. */
  PM.TOWNS = {
    bastion: { name: "The Bastion", x: 8, y: 8, w: 26, h: 20, style: "bastion", wall: true, gates: [[20, 27], [21, 27]], zone: 1,
      b: [
        ["b_office", "office", 17, 10, 7, 3, 20, "star"],
        ["b_barracks", "barracks", 10, 15, 6, 3, 12, "bed"],
        ["b_hall", "hall", 25, 15, 6, 3, 27, "book"],
        ["b_mess", "mess", 10, 21, 5, 3, 12, "mug"],
        ["b_hangar", "hangar", 22, 20, 9, 4, 26, "wrench"],
      ],
      pads: [[23, 25], [25, 25], [27, 25], [29, 25]],
      trees: [[9, 9], [9, 11], [32, 9], [32, 11], [32, 13], [9, 25], [15, 25], [16, 12], [24, 11], [31, 22], [31, 19]],
      decor: [["flag", 20, 14], ["lamp", 17, 18], ["lamp", 23, 18], ["crates", 31, 24], ["gantry", 21, 24]],
    },
    portgate: { name: "Portgate", x: 46, y: 44, w: 32, h: 24, style: "port", wall: true, gates: [[46, 55], [46, 56], [77, 55], [77, 56], [61, 44], [62, 44]], zone: 1,
      b: [
        ["p_yard", "yard", 48, 46, 8, 4, 52, "wrench"],
        ["p_bank", "bank", 58, 46, 5, 3, 60, "coin"],
        ["p_relay", "relay", 65, 45, 4, 4, 66, "dish"],
        ["p_gym", "gym", 71, 46, 5, 3, 73, "fist"],
        ["p_lantern", "tavern", 48, 59, 6, 3, 50, "mug"],
        ["p_arms", "shop", 57, 59, 5, 3, 59, "gun"],
        ["p_clinic", "clinic", 64, 59, 5, 3, 66, "leaf"],
        ["p_inn", "inn", 70, 59, 6, 3, 72, "bed"],
        ["p_house", "house", 49, 64, 4, 2, null],
        ["p_house", "house", 56, 64, 4, 2, null],
        ["p_house", "house", 65, 64, 4, 2, null],
        ["p_house", "house", 71, 64, 5, 2, null],
        ["p_house", "house", 66, 51, 4, 2, null],
        ["p_house", "house", 71, 51, 4, 2, null],
      ],
      pads: [[48, 51], [50, 51], [52, 51], [54, 51]],
      trees: [[47, 53], [56, 51], [63, 50], [76, 50], [76, 62], [47, 66], [55, 66], [63, 66], [69, 66]],
      decor: [["fountain", 60, 53], ["lamp", 57, 55], ["lamp", 65, 57], ["lamp", 52, 57], ["lamp", 70, 57], ["crates", 56, 47], ["cart", 57, 53]],
    },
    fernwick: { name: "Fernwick", x: 83, y: 27, w: 19, h: 15, style: "fern", wall: false, zone: 1,
      b: [
        ["f_shop", "workshop", 87, 29, 6, 3, 90, "wrench"],
        ["f_inn", "inn", 95, 29, 5, 3, 97, "bed"],
        ["f_store", "store", 85, 35, 4, 3, 86, "gun"],
        ["f_house", "cottage", 92, 36, 4, 2, null],
        ["f_house", "cottage", 97, 36, 4, 2, null],
        ["f_elder", "cottage", 98, 32, 3, 2, 99, null],
      ],
      pads: [[88, 33], [90, 33], [92, 33], [94, 33]],
      trees: [[84, 28], [101, 28], [84, 40], [101, 40], [93, 40], [89, 40]],
      decor: [["well", 93, 33], ["lamp", 95, 34], ["cart", 90, 38], ["haystack", 100, 34]],
    },
    kiln: { name: "Kiln Hollow", x: 11, y: 63, w: 19, h: 15, style: "kiln", wall: false, zone: 0,
      b: [
        ["k_brock", "adobe", 13, 65, 5, 3, 15, "star"],
        ["k_cantina", "cantina", 21, 65, 6, 3, 24, "mug"],
        ["k_store", "adobe", 13, 71, 5, 3, 15, "gun"],
        ["k_inn", "adobe", 22, 71, 5, 3, 24, "bed"],
        ["k_house", "adobe", 18, 75, 4, 2, null],
      ],
      pads: [[19, 69], [21, 69], [23, 69], [25, 69]],
      trees: [],
      decor: [["minehead", 28, 64], ["well", 19, 72], ["crates", 27, 70], ["cart", 28, 73]],
    },
  };

  /* the spaceport, east of Portgate: the Pact's landing field */
  const PORT = { x: 79, y: 46, w: 14, h: 18 };

  /* ---- the overworld ---- */
  const W = 112, H = 84;
  const buildWorld = () => {
    const t = new Uint8Array(W * H).fill(T.OPEN), z = new Uint8Array(W * H).fill(1), r = new Uint8Array(W * H).fill(2);
    const map = { id: "world", w: W, h: H, t, z, r, objs: [], npcs: [], pads: {}, towns: PM.TOWNS, edge: T.BAD, zdef: 1 };
    const at = (x, y) => (x < 0 || y < 0 || x >= W || y >= H) ? -1 : y * W + x;
    const set = (x, y, v) => { const i = at(x, y); if (i >= 0) t[i] = v; };
    const get = (x, y) => { const i = at(x, y); return i < 0 ? T.BAD : t[i]; };
    const K = PM.K, vn = (x, y, s) => K.vn(x / s + 13.1, y / s + 7.7);
    const nz = (x, y) => vn(x, y, 9) * 0.6 + vn(x + 50, y + 30, 4) * 0.4;
    const rnd = PM.mulberry(1988);

    /* zones: the badlands to the south-west, the snow to the north-east */
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x, n = (nz(x, y) - 0.5) * 8;
      if (x + n < 36 && y - n > 54) z[i] = 0;
      if (x - n > 74 && y + n < 25) z[i] = 2;
    }
    /* mountains: a ridge along the north, peaks in the snow, mesas in the badlands */
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x, n = nz(x, y);
      if (y < 3 + n * 5 || x < 1 + n * 3 || x > W - 2 - n * 3 || y > H - 2 - n * 3) t[i] = T.BAD;
      else if (z[i] === 2 && n > 0.56) t[i] = T.BAD;
      else if (z[i] === 0 && n > 0.66) t[i] = T.BAD;
    }
    /* woods: the Fernwood east, copses elsewhere; scrub at their edges; rocks */
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (t[i] !== T.OPEN) continue;
      const w = vn(x, y, 5) * 0.65 + vn(x + 9, y - 4, 2.2) * 0.35;
      const fern = x > 76 && x < 108 && y > 16 && y < 56 ? 0.16 : 0;
      const cold = z[i] === 2 ? -0.05 : z[i] === 0 ? -0.2 : 0;
      if (w + fern + cold > 0.66) t[i] = T.TREE;
      else if (w + fern + cold > 0.6) t[i] = T.BUSH;
      else if (rnd() < (z[i] === 0 ? 0.035 : 0.012)) t[i] = T.ROCK;
      else if (rnd() < (z[i] === 0 ? 0.03 : 0.02)) t[i] = T.BUSH;
    }
    /* the river, two wide, from the northern ridge to the southern edge */
    const RIVER = [[41, 2], [42, 14], [41, 26], [43, 38], [43, 52], [43, 60], [46, 68], [56, 74], [70, 78], [84, 82], [92, 84]];
    const line = (pts, fn) => {
      for (let k = 0; k < pts.length - 1; k++) {
        const [x0, y0] = pts[k], [x1, y1] = pts[k + 1], n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) * 2;
        for (let s = 0; s <= n; s++) fn(Math.round(x0 + (x1 - x0) * s / n), Math.round(y0 + (y1 - y0) * s / n));
      }
    };
    line(RIVER, (x, y) => { for (let d = 0; d < 2; d++) { set(x + d, y, T.WATER); } if (nz(x, y) > 0.6) set(x + 2, y, T.WATER); });
    /* a lake in the Fernwood, and an icy tarn in the Spurs */
    const pond = (cx, cy, rx, ry, v) => { for (let y = -ry; y <= ry; y++) for (let x = -rx; x <= rx; x++) if ((x * x) / (rx * rx) + (y * y) / (ry * ry) <= 1 + (nz(cx + x, cy + y) - 0.5) * 0.6) set(cx + x, cy + y, v); };
    pond(70, 24, 6, 4, T.WATER);
    pond(88, 14, 4, 3, T.ICE);

    /* ---- the towns, cleared and built ---- */
    for (const [id, tw] of Object.entries(PM.TOWNS)) {
      for (let y = tw.y - 1; y <= tw.y + tw.h; y++) for (let x = tw.x - 1; x <= tw.x + tw.w; x++) {
        const i = at(x, y); if (i < 0) continue;
        const inside = x >= tw.x && x < tw.x + tw.w && y >= tw.y && y < tw.y + tw.h;
        t[i] = inside ? (tw.style === "fern" ? T.OPEN : tw.style === "kiln" ? T.ROUGH : T.PAVE) : T.OPEN;
        z[i] = tw.zone;
        if (inside) r[i] = 0;
      }
      if (tw.wall) {
        for (let x = tw.x; x < tw.x + tw.w; x++) { set(x, tw.y, T.WALL); set(x, tw.y + tw.h - 1, T.WALL); }
        for (let y = tw.y; y < tw.y + tw.h; y++) { set(tw.x, y, T.WALL); set(tw.x + tw.w - 1, y, T.WALL); }
        for (const [gx, gy] of tw.gates) set(gx, gy, T.PAVE);
      }
      for (const [x, y] of tw.trees) set(x, y, T.TREE);
      for (const b of tw.b) {
        const [place, kind, x, y, w, h, door, sign] = b;
        for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) set(xx, yy, T.BLDG);
        map.objs.push({ k: "bldg", kind, style: tw.style, place, x, y, w, h, door: door == null ? null : [door, y + h - 1], sign, town: id });
      }
      for (const [k, x, y] of tw.decor) map.objs.push({ k: "decor", kind: k, x, y, w: 1, h: 1, town: id });
      map.pads[id] = tw.pads;
    }
    /* the Pact's landing field */
    for (let y = PORT.y; y < PORT.y + PORT.h; y++) for (let x = PORT.x; x < PORT.x + PORT.w; x++) { set(x, y, T.ROAD); r[at(x, y)] = 7; z[at(x, y)] = 1; }
    for (let x = PORT.x; x < PORT.x + PORT.w; x++) { set(x, PORT.y - 1, T.WIRE); set(x, PORT.y + PORT.h, T.WIRE); }
    for (let y = PORT.y - 1; y <= PORT.y + PORT.h; y++) set(PORT.x + PORT.w, y, T.WIRE);
    map.objs.push({ k: "decor", kind: "dropship", x: PORT.x + 6, y: PORT.y + 2, w: 5, h: 4, solid: true });
    map.objs.push({ k: "decor", kind: "dropship", x: PORT.x + 6, y: PORT.y + 10, w: 5, h: 4, solid: true });
    map.objs.push({ k: "obj", kind: "bunker", x: PORT.x + 1, y: PORT.y + 7, w: 3, h: 2 });
    map.objs.push({ k: "obj", kind: "turret", x: PORT.x + 2, y: PORT.y + 2, w: 2, h: 2 });
    map.objs.push({ k: "obj", kind: "turret", x: PORT.x + 2, y: PORT.y + 13, w: 2, h: 2 });
    map.objs.push({ k: "obj", kind: "radio", x: PORT.x + 11, y: PORT.y + 7, w: 2, h: 2 });
    for (const o of map.objs) if (o.solid || o.k === "obj") for (let y = o.y; y < o.y + o.h; y++) for (let x = o.x; x < o.x + o.w; x++) set(x, y, T.BLDG);

    /* ---- roads ---- */
    const road = pts => line(pts, (x, y) => {
      const v = get(x, y);
      if (v === T.WATER || v === T.ICE) set(x, y, T.BRIDGE);
      else if (v !== T.PAVE && v !== T.BLDG && v !== T.WALL) set(x, y, T.DIRT);
      /* clear what would block the way, a tile either side */
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const w = get(x + dx, y + dy); if (w === T.TREE || w === T.ROCK || w === T.BAD) set(x + dx, y + dy, T.BUSH); }
    });
    /* the Bastion's gate south to the crossroads by the bridge */
    road([[20, 28], [20, 36], [28, 44], [38, 54], [42, 56], [46, 56]]);
    road([[21, 28], [21, 36]]);
    /* the crossroads west to Kiln Hollow */
    road([[38, 54], [33, 58], [26, 60], [24, 63]]);
    /* Portgate's north gate to Fernwick */
    road([[61, 43], [62, 38], [70, 34], [80, 34], [84, 34]]);
    /* Portgate's east gate to the landing field */
    road([[78, 55], [79, 55]]);
    /* a trail from Fernwick up into the Spurs, to the Vault */
    road([[95, 27], [96, 22], [99, 18], [100, 14], [100, 12]]);
    /* the Vault's door, cut into the mountain */
    for (let y = 2; y < 12; y++) for (let x = 95; x < 106; x++) set(x, y, T.BAD);
    for (let y = 11; y < 13; y++) for (let x = 98; x < 103; x++) set(x, y, T.ROUGH);
    map.objs.push({ k: "decor", kind: "vaultdoor", x: 99, y: 9, w: 3, h: 2, solid: true, place: "v_door", door: [100, 10] });
    for (let x = 99; x < 102; x++) for (let y = 9; y < 11; y++) set(x, y, T.BLDG);
    map.vaultDoor = { x: 100, y: 11 };

    /* ---- regions ---- */
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (r[i] === 0 || r[i] === 7) continue;
      r[i] = z[i] === 0 ? 4 : z[i] === 2 ? 5 : x > 76 && y < 58 ? 3 : y < 40 && x < 40 ? 1 : 2;
    }
    /* fields round Fernwick and below Portgate */
    for (let y = 42; y < 47; y++) for (let x = 84; x < 101; x++) if (get(x, y) === T.OPEN || get(x, y) === T.BUSH) set(x, y, T.FIELD);
    for (let y = 69; y < 73; y++) for (let x = 50; x < 66; x++) if (get(x, y) === T.OPEN || get(x, y) === T.BUSH) set(x, y, T.FIELD);
    map.start = { x: 12, y: 18 };
    return map;
  };

  /* ---- the Vault ----
   * # wall, . floor, : grating, = the way out; 1 2 3 the sealed doors;
   * a-i the code terminals; M the map room's star table; P the power;
   * S the crates of spare parts; H the deep-signal console; C a bay with a
   * Founders' mech in it; N the note; r rubble; L a light */
  const VAULT = [
    "##########################################",
    "####.........##############.........######",
    "####.C..C..C.##############...H.....######",
    "####.........##############.........######",
    "########3#######################2#########",
    "####..................................####",
    "####..e.......r...........:.......f...####",
    "####...................L..............####",
    "####..S.....######:#######.....g......####",
    "####........#.....:......#............####",
    "####...h....#..........i.#.....r......####",
    "####........#############.............####",
    "##############################1###########",
    "####.........#.......:.......#........####",
    "####...a.....:...............:....d...####",
    "####.........#.......L.......#........####",
    "####.........#####:.:.:#######........####",
    "####...M.....#..............b.#.......####",
    "####.........:................:...c...####",
    "####....P....#.......N........#.......####",
    "#######################.##################",
    "######################.=.#################",
    "##########################################",
  ].map(r => r.padEnd(42, "#").slice(0, 42));
  /* what each terminal imprints: [colour, constellation] */
  PM.TERMINALS = {
    a: ["red", "Lantern"], b: ["blue", "Hawk"], c: ["yellow", "Crown"], d: ["red", "Anvil"],
    e: ["blue", "Serpent"], f: ["yellow", "Wheel"], g: ["red", "Ember"], h: ["blue", "Tide"], i: ["yellow", "Arrow"],
  };
  /* what each door wants: red, blue, yellow */
  PM.VDOORS = { 1: ["Lantern", "Hawk", "Crown"], 2: ["Anvil", "Serpent", "Wheel"], 3: ["Ember", "Tide", "Arrow"] };
  PM.CACHE_MECHS = ["sunclaw", "sabre", "dawn"];

  const buildVault = () => {
    const h = VAULT.length, w = VAULT[0].length;
    const map = { id: "vault", w, h, t: new Uint8Array(w * h), z: new Uint8Array(w * h).fill(1), r: new Uint8Array(w * h).fill(6), objs: [], npcs: [], pads: {}, edge: T.VWALL, zdef: 1 };
    let cache = 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const ch = VAULT[y][x], i = y * w + x;
      map.t[i] = ch === "#" ? T.VWALL : ch === ":" ? T.GRATE : T.VFLOOR;
      if (ch === "=") map.exit = { x, y };
      else if ("123".includes(ch)) map.objs.push({ k: "vault", kind: "vdoor", n: +ch, x, y, w: 1, h: 1 });
      else if (PM.TERMINALS[ch]) map.objs.push({ k: "vault", kind: "term", id: ch, x, y, w: 1, h: 1 });
      else if (ch === "M") map.objs.push({ k: "vault", kind: "startable", x, y, w: 1, h: 1 });
      else if (ch === "P") map.objs.push({ k: "vault", kind: "power", x, y, w: 1, h: 1 });
      else if (ch === "S") map.objs.push({ k: "vault", kind: "crates", x, y, w: 1, h: 1 });
      else if (ch === "H") map.objs.push({ k: "vault", kind: "array", x, y, w: 1, h: 1 });
      else if (ch === "N") map.objs.push({ k: "vault", kind: "note", x, y, w: 1, h: 1 });
      else if (ch === "C") map.objs.push({ k: "vault", kind: "bay", mech: PM.CACHE_MECHS[cache++], x, y, w: 1, h: 1 });
      else if (ch === "r") map.objs.push({ k: "vault", kind: "rubble", x, y, w: 1, h: 1 });
      else if (ch === "L") map.objs.push({ k: "vault", kind: "light", x, y, w: 1, h: 1 });
    }
    /* things you walk up to are solid; the light and the rubble are not in the way of anything */
    for (const o of map.objs) if (o.kind !== "light") map.t[o.y * w + o.x] = o.kind === "vdoor" ? T.BLDG : o.kind === "rubble" ? T.ROCK : T.BLDG;
    map.start = { x: map.exit.x, y: map.exit.y - 1 };
    return map;
  };

  let world = null, vault = null;
  PM.maps = {
    get world() { return world || (world = buildWorld()); },
    get vault() { return vault || (vault = buildVault()); },
  };
  PM.getMap = id => PM.maps[id];

  /* which town a tile is in, or null */
  PM.townAt = (x, y) => {
    for (const [id, tw] of Object.entries(PM.TOWNS)) if (x >= tw.x && x < tw.x + tw.w && y >= tw.y && y < tw.y + tw.h) return id;
    return null;
  };
  PM.inPort = (x, y) => x >= PORT.x && x < PORT.x + PORT.w && y >= PORT.y && y < PORT.y + PORT.h;
  PM.PORT = PORT;
  PM.regionAt = (map, x, y) => map.r[y * map.w + x] | 0;
  /* the building whose door is at (x, y) */
  PM.doorAt = (map, x, y) => map.objs.find(o => o.door && o.door[0] === x && o.door[1] === y) || null;
  PM.objAt = (map, x, y) => map.objs.find(o => x >= o.x && x < o.x + o.w && y >= o.y && y < o.y + o.h) || null;
})();
