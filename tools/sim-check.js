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
