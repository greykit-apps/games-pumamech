#!/usr/bin/env node
/* PumaMech -- a headless playthrough: the story stage by stage, walked with
 * the game's own PM.Explore.step, checking that every door, everyone to talk
 * to and every fitting in the Vault can be reached -- and reached by a way
 * the player can see, not one hidden under a roof or a wall's top.
 *
 *   node tools/playthrough.js [-v] */
"use strict";
const load = require("./load.js");
const PM = load(["util.js", "kit.js", "tiles.js", "data.js", "world.js", "engine/state.js", "engine/explore.js", "engine/combat.js", "engine/ai.js", "story.js"]);
const G = PM.Game, E = PM.Explore, T = PM.T, W = PM.maps.world, V = PM.maps.vault;
const verbose = process.argv.includes("-v");
let fails = 0, checks = 0;
const ok = (c, msg) => { checks++; if (!c) { fails++; console.error("FAIL", msg); } else if (verbose) console.log("ok  ", msg); };
const D4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];

/* how many rows above its footprint a building's roof hides, measured from
 * js/buildings.js's art at the feet line (the rest hide one) */
const ROOF = { office: 2, hangar: 2, yard: 2, bank: 2, relay: 2 };
/* tiles whose art stands a tile taller than the ground and hides the tile north of them
 * (the town walls are low: people show over them) */
const CAPS = new Set([T.VWALL, T.BAD]);

/* where the eye cannot follow the party: under a roof or a wall's top; and,
 * if asked, where people, street furniture and the parked lance stand */
const hidden = map => {
  const h = new Uint8Array(map.w * map.h);
  for (let y = 0; y < map.h; y++) for (let x = 0; x < map.w; x++) if (CAPS.has(PM.tileAt(map, x, y + 1))) h[y * map.w + x] = 1;
  for (const o of map.objs) if (o.k === "bldg") for (let r = 1; r <= (ROOF[o.kind] || 1); r++) for (let x = o.x; x < o.x + o.w; x++) if (o.y - r >= 0) h[(o.y - r) * map.w + x] = 1;
  return h;
};
const HIDDEN = { world: hidden(W), vault: hidden(V) };
const inWay = S => {
  const map = E.map(S), shut = new Uint8Array(map.w * map.h);
  if (map.id !== "world") return shut;
  for (const o of map.objs) if (o.k === "decor") for (let y = o.y; y < o.y + o.h; y++) for (let x = o.x; x < o.x + o.w; x++) shut[y * map.w + x] = 1;
  if (S.flags.invaded) for (const pads of Object.values(W.pads)) for (const [x, y] of pads.slice(0, G.lance(S).length)) shut[y * W.w + x] = 1;
  return shut;
};

/* where the party can get to from where it stands, a step at a time as the game allows */
const reach = (S, visual) => {
  const map = E.map(S), seen = new Int32Array(map.w * map.h).fill(-1);
  const shut = visual ? inWay(S) : new Uint8Array(map.w * map.h), hid = visual ? HIDDEN[map.id] : null;
  const npc = new Set(PM.Story.npcs(S).map(n => n.y * map.w + n.x));
  const s0 = S.pos.y * map.w + S.pos.x, q = [s0];
  seen[s0] = s0;
  for (let k = 0; k < q.length; k++) {
    const i = q[k], x = i % map.w, y = (i / map.w) | 0;
    for (const [dx, dy] of D4) {
      const nx = x + dx, ny = y + dy, j = ny * map.w + nx;
      if (nx < 0 || ny < 0 || nx >= map.w || ny >= map.h || seen[j] >= 0 || shut[j] || npc.has(j) || (hid && hid[j])) continue;
      let walk = PM.TF[PM.tileAt(map, nx, ny)].walk;
      if (map.id === "vault") {
        const o = PM.objAt(map, nx, ny);
        if (o && o.kind === "vdoor") walk = !!S.vault.open[o.n];
        if (nx === map.exit.x && ny === map.exit.y) walk = false;
      } else {
        const g = PM.Story.gate(S, nx, ny);
        if (g && g.block) walk = false;
        /* stepping onto the landing field starts its fight; walk round it */
        if (PM.regionAt(map, nx, ny) === 7 && !S.flags.portRaided) walk = false;
      }
      if (!walk) continue;
      seen[j] = i; q.push(j);
    }
  }
  return seen;
};
const pathTo = (S, seen, x, y) => {
  const map = E.map(S);
  if (x < 0 || y < 0 || x >= map.w || y >= map.h) return null;
  let i = y * map.w + x;
  if (seen[i] < 0) return null;
  const p = [];
  while (seen[i] !== i) { p.push([i % map.w, (i / map.w) | 0]); i = seen[i]; }
  return p.reverse();
};
/* walk a path with the game's own step, then one more step, into the target */
const walk = (S, path, last) => {
  for (const [x, y] of path) {
    const r = E.step(S, x - S.pos.x, y - S.pos.y);
    if (!r.moved) return { stuck: [x, y], ev: r.ev };
  }
  return last ? E.step(S, last[0], last[1]) : { moved: true, ev: [] };
};
const clone = S => G.deserialize(G.serialize(S));

/* something you bump into: a door from the south, a person or a fitting from any side */
const UP = [[0, -1]];
const tryReach = (S, label, tx, ty, want, sides = D4) => {
  const map = E.map(S);
  ok(!HIDDEN[map.id][ty * map.w + tx] || map.id === "world" && PM.doorAt(map, tx, ty), `${label}: stands where it can be seen`);
  for (const visual of [false, true]) {
    const seen = reach(S, visual);
    let got = null;
    for (const [dx, dy] of sides) {
      const p = pathTo(S, seen, tx - dx, ty - dy);
      if (!p) continue;
      const r = walk(clone(S), p, [dx, dy]);
      if (!r.stuck && r.ev.some(want)) { got = true; break; }
      got = r.stuck ? { stuck: r.stuck } : { ev: r.ev.map(e => e.t) };
    }
    if (!visual && got !== true) { ok(false, `${label}: cannot be reached ${got ? JSON.stringify(got) : "(no way there)"}`); return; }
    if (visual) ok(got === true, `${label}: no way there the player can see (only under a roof, behind a wall, or through people and things)`);
  }
};
const checkDoors = (S, town, stage) => {
  for (const o of W.objs) if (o.k === "bldg" && o.door && o.town === town) tryReach(S, `${stage}: the door of ${o.place}`, o.door[0], o.door[1], e => e.t === "place" && e.place === o.place, UP);
};
const checkPeople = (S, stage) => {
  for (const n of PM.Story.npcs(S)) tryReach(S, `${stage}: talking to ${n.id}`, n.x, n.y, e => e.t === "talk" && e.npc.id === n.id);
};
const at = (S, x, y, map = "world") => { S.pos = { map, x, y, f: 2 }; return S; };
const begin = flags => { const S = G.create({ name: "Test", seed: 3 }); Object.assign(S.flags, flags, { calm: 1e9 }); return S; };
const lance = S => {
  S.mechs[0].at = "lance";
  for (const [id, ch] of [["pip", "bulwark"], ["mags", "marten"], ["bracken", "skink"]]) {
    S.chars[id] = G.newChar(id); S.party.push(id);
    const m = G.newMech(S, ch, "claw"); m.at = "lance"; m.pilot = id; S.mechs.push(m);
  }
  return S;
};
const AFTER = { invaded: true, metFather: true, sortie1: true, sortie2: true, sortie3: true };

/* ---- 1. the academy ---- */
{
  const S = begin({});
  checkDoors(S, "bastion", "academy");
  checkPeople(S, "academy");
  const seen = reach(S, false), [gx, gy] = PM.TOWNS.bastion.gates[0], p = pathTo(S, seen, gx, gy - 1);
  ok(p, "academy: the gate can be walked up to");
  if (p) { const r = walk(clone(S), p, [0, 1]); ok(!r.moved && r.ev.some(e => e.t === "msg"), "academy: the gate turns cadets back"); }
  ok(!pathTo(S, seen, 21, 33), "academy: nobody leaves before graduation");
}
/* ---- 2. the Pact holds the Bastion: the towns, the gate, the landing field, the Vault's door ---- */
for (const [stage, flags, full] of [
  ["the invasion, alone", AFTER, false],
  ["the invasion, a lance", AFTER, true],
  ["after Fernwick and the Relay", { ...AFTER, fernRaid: true, relay: true }, true],
  ["after the landing field", { ...AFTER, fernRaid: true, relay: true, portRaided: true }, true],
]) {
  const S = at(begin(flags), 21, 33);
  S.mechs[0].at = "lance";
  if (full) lance(S);
  ok(PM.TF[PM.tileAt(W, 21, 33)].walk, `${stage}: you come to on open ground`);
  for (const t of ["portgate", "kiln", "fernwick"]) checkDoors(S, t, stage);
  checkPeople(S, stage);
  const [gx, gy] = PM.TOWNS.bastion.gates[0];
  tryReach(S, `${stage}: the Bastion's gate`, gx, gy, e => e.t === "story" && e.id === "bastionGate", UP);
  if (!flags.portRaided) {
    const seen = reach(S, true);
    let found = false;
    for (let y = PM.PORT.y; y < PM.PORT.y + PM.PORT.h && !found; y++) {
      const p = pathTo(S, seen, PM.PORT.x - 1, y);
      if (p && walk(clone(S), p, [1, 0]).ev.some(e => e.t === "spaceport")) found = true;
    }
    ok(found, `${stage}: the landing field can be walked onto`);
  }
  tryReach(S, `${stage}: the Vault's door`, W.vaultDoor.x, W.vaultDoor.y - 1, e => e.t === "place" && e.place === "v_door", UP);
  /* Portgate's gates, two tiles each: a way through at least one you can see */
  const seen = reach(S, true), gates = PM.TOWNS.portgate.gates;
  for (let i = 0; i < gates.length; i += 2) ok(gates.slice(i, i + 2).some(([x, y]) => seen[y * W.w + x] >= 0), `${stage}: Portgate's gate at ${gates[i]} can be seen and walked through`);
}
/* ---- 3. the Bastion taken back ---- */
{
  const S = lance(at(begin({ ...AFTER, bastionFree: true }), 21, 33));
  for (const t of ["bastion", "portgate", "kiln", "fernwick"]) checkDoors(S, t, "the Bastion retaken");
  checkPeople(S, "the Bastion retaken");
}
/* ---- 4. the locator: the Vault road, its guard, the door ---- */
{
  const S = at(begin({ ...AFTER, relay: true, metBrock: true, locator: true, fernRaid: true }), 21, 33);
  S.mechs[0].at = "lance";
  const p = pathTo(S, reach(S, true), W.vaultDoor.x, W.vaultDoor.y);
  ok(p, "the locator: a way up to the Vault's door");
  if (p) {
    const T2 = clone(S); let guard = false;
    for (const [x, y] of p) if (E.step(T2, x - T2.pos.x, y - T2.pos.y).ev.some(e => e.t === "story" && e.id === "vaultGuard")) { guard = true; break; }
    ok(guard, "the locator: the Pact lance waits on the Vault road");
  }
  S.flags.vaultGuard = true;
  tryReach(S, "the locator: the Vault's door", W.vaultDoor.x, W.vaultDoor.y - 1, e => e.t === "place" && e.place === "v_door", UP);
}
/* ---- 5. the Vault, door by door ---- */
{
  const S = at(begin({ ...AFTER, relay: true, metBrock: true, locator: true, vaultGuard: true, vaultIn: true, fernRaid: true }), V.start.x, V.start.y, "vault");
  ok(PM.TF[PM.tileAt(V, V.start.x, V.start.y)].walk && !HIDDEN.vault[V.start.y * V.w + V.start.x], "the Vault: you come in where you can be seen");
  ok(!HIDDEN.vault[V.exit.y * V.w + V.exit.x], "the Vault: the way out can be seen");
  { const r = E.step(clone(S), V.exit.x - S.pos.x, V.exit.y - S.pos.y); ok(r.ev.some(e => e.t === "leaveVault"), "the Vault: the way out leads out"); }
  const kind = k => V.objs.filter(o => o.kind === k), door = n => V.objs.find(o => o.kind === "vdoor" && o.n === n);
  const term = code => V.objs.find(o => o.kind === "term" && PM.TERMINALS[o.id][1] === code);
  const name = o => `${o.kind}${o.id ? " " + o.id : o.n ? " " + o.n : o.mech ? " " + o.mech : ""}`;
  const fitting = (o, stage) => tryReach(S, `the Vault, ${stage}: ${name(o)}`, o.x, o.y, e => e.t === "vault" && e.o === o);
  const sealed = (o, stage) => { const seen = reach(S, false); ok(!D4.some(([dx, dy]) => seen[(o.y - dy) * V.w + o.x - dx] >= 0), `the Vault, ${stage}: ${name(o)} is still behind a door`); };
  const codes = n => PM.VDOORS[n].map(term);
  for (const o of [...kind("power"), ...kind("startable"), ...kind("note"), ...codes(1), door(1)]) fitting(o, "before door 1");
  for (const o of [...kind("crates"), ...kind("array"), ...kind("bay")]) sealed(o, "before door 1");
  S.vault.power = true; S.vault.open[1] = true;
  for (const o of [...kind("crates"), ...codes(2), ...codes(3), door(2), door(3)]) fitting(o, "door 1 open");
  for (const o of [...kind("array"), ...kind("bay")]) sealed(o, "door 1 open");
  S.vault.open[2] = true;
  for (const o of kind("array")) fitting(o, "door 2 open");
  S.vault.open[3] = true;
  for (const o of [...kind("bay"), ...kind("term")]) fitting(o, "every door open");
  ok(pathTo(S, reach(S, true), V.start.x, V.start.y) !== null || (S.pos.x === V.start.x && S.pos.y === V.start.y), "the Vault: the way back out");
}
/* ---- 6. the signal sent: back out to the door, and Greymane ---- */
{
  const S = at(begin({ ...AFTER, locator: true, vaultGuard: true, vaultIn: true, signal: true }), W.vaultDoor.x, W.vaultDoor.y + 1);
  ok(PM.TF[PM.tileAt(W, S.pos.x, S.pos.y)].walk, "the finale: you come out of the Vault on open ground");
  tryReach(S, "the finale: the Vault's door", W.vaultDoor.x, W.vaultDoor.y - 1, e => e.t === "place" && e.place === "v_door", UP);
}
console.log(`${checks - fails}/${checks} checks passed`);
process.exit(fails ? 1 : 0);
