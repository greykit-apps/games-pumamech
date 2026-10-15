/* PumaMech -- the ground. Data only, DOM-free.
 *
 * One set of tile ids serves all three zones; js/art.js paints each one the
 * zone's way (sand, grass or snow under the same rules). The flags:
 *   walk   a ranger can stand on it
 *   enemy  the enemy will walk on it (they know where their own mines are)
 *   los    blocks every line of sight and every bullet
 *   low    hides a crawling ranger behind it, and stops bullets
 *   cover  a crawling ranger on it is hidden beyond a couple of tiles
 *   trench a ranger in it is hidden from anyone not in it too
 *   slow   speed multiplier
 */
"use strict";
PM.T = { OPEN: 0, ROUGH: 1, BUSH: 2, ROCK: 3, TREE: 4, WALL: 5, TRENCH: 6, WIRE: 7, MINE: 8, WATER: 9,
  ICE: 10, THIN: 11, BAD: 12, FLOOR: 13, ROAD: 14, TRAP: 15, CRATER: 16, PIPE: 17, HWALL: 18 };
PM.TILE = [];
(() => {
  const d = (id, name, o) => { PM.TILE[id] = Object.assign({ name, walk: true, enemy: true, los: false, low: false, cover: false, trench: false, slow: 1 }, o); };
  const T = PM.T;
  d(T.OPEN, "open", {});
  d(T.ROUGH, "rough", {});
  d(T.BUSH, "scrub", { cover: true, slow: 0.85 });
  d(T.ROCK, "boulder", { walk: false, enemy: false, low: true });
  d(T.TREE, "tree", { walk: false, enemy: false, los: true });
  d(T.WALL, "wall", { walk: false, enemy: false, low: true });
  d(T.TRENCH, "trench", { trench: true, slow: 0.8 });
  d(T.WIRE, "barbed wire", { walk: false, enemy: false });
  d(T.MINE, "minefield", { enemy: false });
  d(T.WATER, "water", { slow: 0.6 });
  d(T.ICE, "ice", {});
  d(T.THIN, "thin ice", {});
  d(T.BAD, "badlands", { walk: false, enemy: false, los: true });
  d(T.FLOOR, "floor", {});
  d(T.ROAD, "runway", {});
  d(T.TRAP, "tank trap", { walk: false, enemy: false });
  d(T.CRATER, "crater", { cover: true, slow: 0.85 });
  d(T.PIPE, "pipeline", { slow: 0.5, low: true });
  d(T.HWALL, "building", { walk: false, enemy: false, los: true });
})();

/* Things built on the ground: installations, targets, buildings. w and h in
 * tiles. armor: what kills it -- soft (a grenade or better), hard (a LAW or
 * a time bomb), heavy (only a time bomb), none (nothing). gun: it shoots.
 * blast: it goes up when it dies. los: it blocks sight. */
PM.OBJ = {
  bunker:     { name: "bunker", w: 3, h: 2, armor: "hard", los: true, gun: { range: 7, arc: 7, rate: 70, burst: 3, acc: 0.18 } },
  mg:         { name: "machine-gun nest", w: 2, h: 2, armor: "soft", gun: { range: 8, arc: 7, rate: 60, burst: 4, acc: 0.15 } },
  turret:     { name: "turret", w: 2, h: 2, armor: "hard", los: true, gun: { range: 8, arc: 16, rate: 80, burst: 3, acc: 0.16, turn: true } },
  minib:      { name: "mini-bunker", w: 1, h: 1, armor: "soft", gun: { range: 6, arc: 16, rate: 40, burst: 2, acc: 0.3, motion: true } },
  sam:        { name: "SAM launcher", w: 2, h: 2, armor: "soft", target: true },
  plane:      { name: "fighter", w: 3, h: 2, armor: "soft", target: true, hp: 12 },
  dish:       { name: "radar antenna", w: 2, h: 2, armor: "soft", target: true },
  guardhouse: { name: "guard house", w: 3, h: 2, armor: "soft", los: true },
  shack:      { name: "ammunition shack", w: 3, h: 2, armor: "soft", los: true, target: true },
  magazine:   { name: "explosives magazine", w: 3, h: 2, armor: "soft", los: true, target: true, blast: 2.8 },
  fuel:       { name: "fuel dump", w: 3, h: 2, armor: "soft", target: true, blast: 2.4 },
  pump:       { name: "pumping station", w: 4, h: 3, armor: "heavy", los: true, target: true, blast: 2.4 },
  radio:      { name: "communications post", w: 2, h: 2, armor: "none", los: true, target: true },
  door:       { name: "prison door", w: 2, h: 1, armor: "soft", los: true },
  pyramid:    { name: "pyramid", w: 2, h: 2, armor: "soft", los: true },
  lever:      { name: "controls", w: 1, h: 1, armor: "none" },
  pit:        { name: "tiger pit", w: 2, h: 1, armor: "none" },
  tent:       { name: "tent", w: 3, h: 2, armor: "soft", los: true },
  avfuel:     { name: "aviation fuel dump", w: 3, h: 2, armor: "heavy", target: true, blast: 3 },
  alarm:      { name: "alarm", w: 1, h: 1, armor: "none" },
  prox:       { name: "proximity bomb", w: 1, h: 1, armor: "soft", trap: true },
  craft:      { name: "experimental aircraft", w: 3, h: 2, armor: "none", target: true },
};
/* the template letters for each */
PM.OBJCH = { B: "bunker", M: "mg", U: "turret", K: "minib", S: "sam", P: "plane", D: "dish", G: "guardhouse", A: "shack",
  Z: "magazine", F: "fuel", Q: "pump", R: "radio", "@": "door", Y: "pyramid", L: "lever", W: "pit", E: "tent", V: "avfuel",
  C: "alarm", X: "prox", N: "craft" };
PM.TILECH = { ".": PM.T.OPEN, ",": PM.T.ROUGH, b: PM.T.BUSH, o: PM.T.ROCK, t: PM.T.TREE, "#": PM.T.WALL, "%": PM.T.HWALL,
  "=": PM.T.WIRE, T: PM.T.TRENCH, x: PM.T.MINE, "~": PM.T.WATER, _: PM.T.THIN, i: PM.T.ICE, f: PM.T.FLOOR, r: PM.T.ROAD,
  "+": PM.T.TRAP, "-": PM.T.PIPE };
/* template letters for the people in it */
PM.ACTCH = { g: "guard", p: "rifle", e: "elite", n: "officer", h: "hostage", k: "tank", a: "at", q: "flamer", s: "sniper" };
