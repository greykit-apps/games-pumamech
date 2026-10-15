/* PumaMech -- walking the map: a step at a time, as in 1988.
 * DOM-free.
 *
 * PM.Explore.step(S, dx, dy) moves the party a tile, or says why not, and
 * returns what happened: a door walked up to, someone to talk to, a town
 * entered, the clock, and in the wilds now and then a fight. The fights
 * come from PM.Explore.encounter, by region and by how far the story has
 * gone: wild drakes and stoat raiders, then the Grey Pact's patrols and
 * lances, heavier as the Vault comes nearer. */
"use strict";
(() => {
  const E = PM.Explore = {};
  const G = PM.Game;
  const DIRS = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
  E.DIRS = DIRS;
  E.dirOf = (dx, dy) => DIRS.findIndex(([a, b]) => a === Math.sign(dx) && b === Math.sign(dy));

  E.map = S => PM.getMap(S.pos.map);
  /* who stands where in this map today: the story's people */
  E.npcs = S => (PM.Story ? PM.Story.npcs(S) : []);
  E.npcAt = (S, x, y) => E.npcs(S).find(n => n.x === x && n.y === y) || null;

  E.step = (S, dx, dy) => {
    const map = E.map(S), ev = [];
    const nx = S.pos.x + dx, ny = S.pos.y + dy;
    S.pos.f = E.dirOf(dx, dy);
    const npc = E.npcAt(S, nx, ny);
    if (npc) { ev.push({ t: "talk", npc }); return { moved: false, ev }; }
    if (map.id === "world") {
      const o = PM.doorAt(map, nx, ny) || (map.objs.find(o => o.door && o.door[0] === nx && o.door[1] === ny));
      if (o && dy <= 0) { ev.push({ t: "place", place: o.place, o }); return { moved: false, ev }; }
    } else if (map.id === "vault") {
      const o = PM.objAt(map, nx, ny);
      if (o && o.kind !== "light" && o.kind !== "rubble") {
        if (!(o.kind === "vdoor" && S.vault.open[o.n])) { ev.push({ t: "vault", o }); return { moved: false, ev }; }
      }
    }
    const tile = PM.tileAt(map, nx, ny);
    let ok = PM.TF[tile] && PM.TF[tile].walk;
    if (map.id === "vault") { const o = PM.objAt(map, nx, ny); if (o && o.kind === "vdoor" && S.vault.open[o.n]) ok = true; }
    if (!ok) { ev.push({ t: "bump" }); return { moved: false, ev }; }
    /* the story may hold a gate shut, or have something to say first */
    const gate = PM.Story && PM.Story.gate(S, nx, ny);
    if (gate) { ev.push(gate); if (gate.block) return { moved: false, ev }; }
    const wasTown = map.id === "world" ? PM.townAt(S.pos.x, S.pos.y) : null;
    S.pos.x = nx; S.pos.y = ny;
    if (map.id === "world") {
      G.see(S, nx, ny);
      const town = PM.townAt(nx, ny);
      if (town !== wasTown) ev.push(town ? { t: "enter", town } : { t: "leave", town: wasTown });
      const region = PM.regionAt(map, nx, ny);
      /* the clock runs in the wilds: half an hour a step */
      if (region !== 0) {
        S.half = (S.half || 0) + 1;
        if (S.half >= 2) { S.half = 0; ev.push(...G.advance(S, 1)); ev.push({ t: "hour" }); }
      }
      if (region === 7 && G.stage(S) >= 1) ev.push({ t: "spaceport" });
      else if (region !== 0) {
        const enc = E.roll(S, region, tile);
        if (enc) ev.push({ t: "encounter", group: enc });
      }
    } else if (map.id === "vault") {
      if (map.exit && nx === map.exit.x && ny === map.exit.y) ev.push({ t: "leaveVault" });
      else {
        const enc = E.roll(S, 6, tile);
        if (enc) ev.push({ t: "encounter", group: enc });
      }
    }
    if (PM.Story) ev.push(...PM.Story.onStep(S));
    return { moved: true, ev };
  };

  /* ---- encounters ---- */
  E.roll = (S, region, tile) => {
    const stage = G.stage(S);
    if (stage === 0) return null;
    S.steps = (S.steps || 0) + 1;
    if (S.flags.calm > 0) { S.flags.calm--; return null; }
    if (S.steps < 9) return null;
    const onRoad = tile === PM.T.DIRT || tile === PM.T.BRIDGE;
    let p = region === 6 ? 0.06 : 0.035;
    if (onRoad) p *= 0.5;
    p *= [0.7, 1, 1.25][S.diff] || 1;
    if (!G.chance(S, p)) return null;
    S.steps = 0;
    return E.encounter(S, PM.REGIONS[region].enc);
  };

  /* who you meet, by region and stage: a list of [weight, maker] */
  const M = (ch, pilot = "line", paint = "wolf") => ({ t: "mech", ch, pilot, paint });
  const F = (foe, n = 1) => Array.from({ length: n }, () => ({ t: "foot", foe }));
  const TABLE = {
    downs: [[3, s => ({ name: "A Pact patrol", units: [...F("trooper", 2 + G.roll(s, 2)), ...F("sergeant")] })],
            [2, s => ({ name: "A Pact scout", units: [M(G.roll(s, 2) ? "gnat" : "skink", "green")] })],
            [1, s => ({ name: "Scrub drakes", units: F("drake", 2 + G.roll(s, 2)) })]],
    plains: [[3, s => ({ name: "A Pact patrol", units: [...F("trooper", 2 + G.roll(s, 3)), ...F("sergeant")] })],
             [3, s => ({ name: "Pact scouts", units: [M(G.stage(s) >= 2 ? ["gnat", "skink", "marten"][G.roll(s, 3)] : ["gnat", "skink"][G.roll(s, 2)], "green"), ...(G.stage(s) >= 2 ? [M("skink")] : [])] })],
             [2, s => ({ name: "Stoat raiders", units: [...F("raider", 3 + G.roll(s, 2)), ...(G.roll(s, 3) === 0 ? [M("gnat", "green", "rogue")] : [])] })],
             [1, s => ({ name: "Scrub drakes", units: F("drake", 3) })],
             [1, s => G.stage(s) >= 2 ? { name: "A Pact strike lance", units: [M("howler"), M("marten"), ...F("trooper", 2)] } : { name: "A Pact patrol", units: F("trooper", 3) }]],
    forest: [[3, s => ({ name: "Stoat raiders", units: F("raider", 3 + G.roll(s, 3)) })],
             [2, s => ({ name: "Scrub drakes", units: F("drake", 3 + G.roll(s, 2)) })],
             [2, s => ({ name: "A Pact hunting party", units: [M(G.roll(s, 2) ? "marten" : "heron", G.stage(s) >= 2 ? "line" : "green"), ...F("trooper", 2)] })]],
    badlands: [[3, s => ({ name: "Stoat raiders", units: [...F("raider", 3), M(G.roll(s, 2) ? "gnat" : "skink", "green", "rogue")] })],
               [2, s => ({ name: "Scrub drakes", units: F("drake", 4) })],
               [2, s => ({ name: "A Pact column", units: [M(G.stage(s) >= 2 ? "bulwark" : "skink", "green"), ...F("trooper", 2)] })]],
    spurs: [[3, s => ({ name: "Ridge drakes", units: F("ridge", 2 + G.roll(s, 2)) })],
            [3, s => ({ name: "A Pact lance", units: [M("howler"), M(G.roll(s, 2) ? "heron" : "marten"), ...(G.stage(s) >= 2 ? [M("tusker", "vet")] : [])] })],
            [1, s => ({ name: "A Pact heavy patrol", units: [M("ironhide", "vet"), M("skink")] })]],
    vault: [[1, s => ({ name: "Founders' sentries", units: F("sentry", 2 + G.roll(s, 2)) })]],
  };
  E.encounter = (S, kind) => {
    const t = TABLE[kind] || TABLE.plains;
    const tot = t.reduce((a, [w]) => a + w, 0);
    let r = PM.rand(S) * tot;
    for (const [w, mk] of t) { if ((r -= w) < 0) return mk(S); }
    return t[0][1](S);
  };
})();
