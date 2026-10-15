#!/usr/bin/env node
/* PumaMech -- headless checks: the rules and the story's machinery, with no
 * page. Battles are fought by the AI on both sides; they must end, and the
 * same seed must give the same fight.
 *
 *   node tools/sim-check.js [--seeds n] [--verbose] */
const load = require("./load.js");
const PM = load(["util.js", "kit.js", "tiles.js", "data.js", "world.js", "engine/state.js", "engine/explore.js", "engine/combat.js", "engine/ai.js",
  ...(require("fs").existsSync(require("path").join(__dirname, "../js/story.js")) ? ["story.js"] : [])]);
const args = process.argv.slice(2), seeds = +(args[args.indexOf("--seeds") + 1] || 5), verbose = args.includes("--verbose");
let fails = 0, checks = 0;
const ok = (c, msg) => { checks++; if (!c) { fails++; console.error("FAIL", msg); } };
const G = PM.Game, C = PM.Combat;

/* a party of n, each in a mech of the given chassis */
const party = (seed, chs, foot = 0) => {
  const S = G.create({ name: "Test", seed });
  S.flags.invaded = true;
  S.mechs = [];
  ["pip", "mags", "bracken", "wren", "quill"].slice(0, chs.length + foot - 1).forEach(id => { S.chars[id] = G.newChar(id); S.party.push(id); });
  chs.forEach((ch, i) => { const m = G.newMech(S, ch, "claw"); m.pilot = S.party[i]; S.mechs.push(m); });
  return S;
};
const fight = (S, group, o) => {
  const B = C.start(S, group, o);
  let rounds = 0;
  while (!B.result && rounds < 60) {
    PM.AI.orders(S, B, 0); PM.AI.orders(S, B, 1);
    C.resolve(S, B); rounds++;
  }
  return { B, rounds };
};

for (let seed = 1; seed <= seeds; seed++) {
  const scen = [
    [["tabby"], { name: "drones", units: [{ t: "mech", ch: "drone", pilot: "green", paint: "drone" }, { t: "mech", ch: "drone", pilot: "green", paint: "drone" }] }],
    [["bulwark", "marten"], { name: "patrol", units: [{ t: "mech", ch: "howler" }, { t: "foot", foe: "trooper" }, { t: "foot", foe: "trooper" }] }],
    [["sunclaw", "sabre", "dawn", "longreach"], { name: "finale", units: [{ t: "mech", ch: "marshal", pilot: "ace", boss: true }, { t: "mech", ch: "ironhide", pilot: "vet" }, { t: "mech", ch: "longreach", pilot: "vet" }, { t: "mech", ch: "tusker", pilot: "vet" }] }],
    [[], { name: "on foot", units: [{ t: "foot", foe: "trooper" }, { t: "foot", foe: "raider" }] }, 3],
  ];
  for (const [chs, grp, foot] of scen) {
    const S = party(seed, chs, foot || 0);
    const { B, rounds } = fight(S, grp, { map: "world", cx: 60, cy: 30 });
    ok(!!B.result, `seed ${seed} ${grp.name}: ended (${rounds} rounds)`);
    const r = C.finishBattle(S, B);
    if (verbose) console.log(`seed ${seed} ${grp.name}: ${B.result} in ${rounds}, loot ${r.loot}, salvage ${r.salvage.map(m => m.ch).join(",")}, ups ${r.ups.join("; ")}`);
    /* the same seed, the same fight */
    const S2 = party(seed, chs, foot || 0), { B: B2, rounds: r2 } = fight(S2, grp, { map: "world", cx: 60, cy: 30 });
    ok(B2.result === B.result && r2 === rounds, `seed ${seed} ${grp.name}: deterministic`);
  }
}
/* the round in steps: weapons wait for a close shot, aim at more than one foe, routes carry over */
{
  const S = party(11, ["tabby"]);
  const B = C.start(S, { name: "steps", units: [{ t: "mech", ch: "bulwark", pilot: "green" }, { t: "mech", ch: "gnat", pilot: "green" }] }, { map: "world", cx: 60, cy: 30 });
  const [me, a, b] = B.units;
  /* clear ground, everyone placed by hand */
  const map = PM.getMap(B.map), open = (x, y) => PM.TF[PM.tileAt(map, x, y)].m === 1 && PM.TF[PM.tileAt(map, x, y)].los === false;
  let row = null;
  for (let y = B.ay + 2; y < B.ay + B.ah - 2 && !row; y++) for (let x = B.ax; x + 12 < B.ax + B.aw && !row; x++) {
    let okRow = true; for (let i = 0; i <= 12; i++) if (!open(x + i, y) || !open(x + i, y + 1)) okRow = false;
    if (okRow) row = [x, y];
  }
  ok(!!row, "steps: found open ground for the test");
  if (row) {
    const [x0, y0] = row;
    me.x = x0; me.y = y0; a.x = x0 + 10; a.y = y0; b.x = x0 + 9; b.y = y0 + 1;
    me.m.heat = 0;
    const route = []; for (let i = 0; i <= 8; i++) route.push([x0 + i, y0]);
    /* heavy laser on the Bulwark (A), the rest on the Gnat (B); a route of 8 for a walker of 4 */
    me.aim = me.m.wpn.map((w, i) => i === 0 ? a.id : b.id);
    me.order = { path: route, mode: "walk", act: null, target: null };
    a.order = { path: null, act: null }; b.order = { path: null, act: null }; a.aim = [null, null, null, null]; b.aim = [null, null, null];
    const W = PM.WEAPONS.hlaser, tm = C.timing(B, me, route, "walk");
    /* where the close shot comes: the first step it is within the heavy laser's short range */
    let expect = null; for (let s = 1; s <= C.STEPS && expect == null; s++) { const p = C.track(B, me, route, "walk")[s]; if (C.dist(p[0], p[1], a.x, a.y) <= W.short) expect = s; }
    const beats = C.resolve(S, B);
    const shots = beats.filter(x => x.t === "shot" && x.from === me.id);
    ok(tm.tiles.length === 5 && me.carry && me.carry.length === 5, `steps: walk of 4 gets 4 tiles and carries 4 (${tm.tiles.length - 1}, ${me.carry && me.carry.length - 1})`);
    ok(shots.some(x => x.to === a.id) && shots.some(x => x.to === b.id), "steps: weapons fire at two different targets");
    const hl = shots.find(x => x.to === a.id);
    ok(hl && (expect == null ? hl.s >= 1 : hl.s === expect), `steps: heavy laser waits for short range (step ${hl && hl.s}, expected ${expect})`);
    ok(beats.filter(x => x.t === "move" && x.id === me.id).length === 4, "steps: the walk plays tile by tile");
    ok(me.aim[0] === (a.out ? null : a.id), "steps: aims hold into the next round");
  }
  /* a weapon with nothing it can reach costs no heat */
  const S2 = party(12, ["tabby"]);
  const B2 = C.start(S2, { name: "far", units: [{ t: "mech", ch: "drone", pilot: "green" }] }, { map: "world", cx: 60, cy: 30 });
  const [m2, d2] = B2.units;
  d2.x = B2.ax + B2.aw - 1; d2.y = B2.ay; m2.x = B2.ax; m2.y = B2.ay + B2.ah - 1; m2.m.heat = 0;
  m2.aim = m2.m.wpn.map((w, i) => PM.WEAPONS[w.w].range < 6 ? d2.id : null);
  m2.order = { path: null, act: null }; d2.order = { path: null, act: null }; d2.aim = [null];
  C.resolve(S2, B2);
  ok(m2.m.heat === 0, `steps: no shot, no heat (${m2.m.heat})`);
}
/* the world: towns' doors stand on building tiles, the start is walkable */
const W = PM.maps.world;
ok(PM.TF[PM.tileAt(W, W.start.x, W.start.y)].walk, "start walkable");
for (const o of W.objs) if (o.door) ok(PM.tileAt(W, o.door[0], o.door[1]) === PM.T.BLDG && PM.TF[PM.tileAt(W, o.door[0], o.door[1] + 1)].walk, `door of ${o.place} reachable from the south`);
/* every place the story sends you can be walked to from outside the Bastion's gate */
{
  const seen = new Uint8Array(W.w * W.h), q = [[21, 30]];
  seen[30 * W.w + 21] = 1;
  while (q.length) {
    const [x, y] = q.pop();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy, i = ny * W.w + nx;
      if (nx < 0 || ny < 0 || nx >= W.w || ny >= W.h || seen[i] || !PM.TF[PM.tileAt(W, nx, ny)].walk) continue;
      seen[i] = 1; q.push([nx, ny]);
    }
  }
  for (const o of W.objs) if (o.door && o.town !== "bastion") ok(seen[(o.door[1] + 1) * W.w + o.door[0]], `can walk to the door of ${o.place}`);
  ok(seen[(W.vaultDoor.y + 1) * W.w + W.vaultDoor.x] || seen[W.vaultDoor.y * W.w + W.vaultDoor.x], "can walk to the Vault's door");
  ok(seen[(PM.PORT.y + 5) * W.w + PM.PORT.x + 3], "can walk to the landing field");
}
/* the Vault's doors want codes its terminals give, in the right colours */
for (const [n, codes] of Object.entries(PM.VDOORS)) ["red", "blue", "yellow"].forEach((col, i) => ok(Object.values(PM.TERMINALS).some(([c, code]) => c === col && code === codes[i]), `door ${n} ${col} code exists`));
console.log(`${checks - fails}/${checks} checks passed`);
process.exit(fails ? 1 : 0);
