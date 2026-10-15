#!/usr/bin/env node
/* PumaMech -- how often each side wins the fights the story deals out,
 * with the AI playing both sides. For tuning, not for CI.
 *
 *   node tools/balance.js [--n 40] */
const PM = require("./load.js")(["util.js", "kit.js", "tiles.js", "data.js", "world.js", "engine/state.js", "engine/explore.js", "engine/combat.js", "engine/ai.js", "story.js"]);
const G = PM.Game, C = PM.Combat, args = process.argv.slice(2), N = +(args[args.indexOf("--n") + 1] || 40);
const M = (ch, pilot = "line", paint = "wolf") => ({ t: "mech", ch, pilot, paint });
const F = (foe, n = 1) => Array.from({ length: n }, () => ({ t: "foot", foe }));

/* a party: [cast id, chassis or null, armour fraction], skills raised by bump */
const party = (seed, members, bump = 0) => {
  const S = G.create({ name: "Test", seed });
  S.flags.invaded = true; S.mechs = []; S.party = [];
  for (const [id, ch, arm] of members) {
    S.chars[id] = G.newChar(id); S.party.push(id);
    for (const k of Object.keys(S.chars[id].skills)) S.chars[id].skills[k] = Math.min(10, S.chars[id].skills[k] + bump);
    if (ch) { const m = G.newMech(S, ch, "claw"); m.pilot = id; for (const l of PM.LOCS) m.armor[l] = Math.round(m.armor[l] * (arm ?? 1)); S.mechs.push(m); }
  }
  return S;
};
const run = (label, members, group, o = {}, bump = 0) => {
  let won = 0, rounds = 0, lostMechs = 0;
  for (let s = 1; s <= N; s++) {
    const S = party(s * 7919, members, bump);
    const B = C.start(S, group, { map: "world", cx: 60, cy: 30, ...o });
    let r = 0;
    while (!B.result && r < 80) { PM.AI.orders(S, B, 0); PM.AI.orders(S, B, 1); C.resolve(S, B); r++; }
    if (B.result === "won") won++;
    rounds += r;
    lostMechs += B.units.filter(u => u.side === 0 && u.kind === "mech" && u.out).length;
  }
  console.log(`${label.padEnd(44)} won ${String(Math.round(won / N * 100)).padStart(3)}%  ${(rounds / N).toFixed(1)} rounds  ${(lostMechs / N).toFixed(2)} mechs lost`);
};
const tabby = [["hero", "tabby", 0.5]];
run("Tabby (half armour) vs patrol", tabby, { units: [...F("trooper", 3), ...F("sergeant")] });
run("Tabby vs green Gnat", tabby, { units: [M("gnat", "green")] });
run("Tabby vs green Skink", tabby, { units: [M("skink", "green")] });
run("Tabby vs green Marten", tabby, { units: [M("marten", "green")] });
run("Tabby vs 3 drakes", tabby, { units: F("drake", 3) });
run("Tabby vs raiders + rogue Gnat", tabby, { units: [...F("raider", 3), M("gnat", "green", "rogue")] });
run("Tabby + Pip on foot vs green Bulwark + 2", [["hero", "tabby", 0.5], ["pip", null]], { units: [M("bulwark", "green"), ...F("trooper", 2)] });
run("Tabby + Pip vs Fernwick raiders", [["hero", "tabby", 0.6], ["pip", null]], St("fernRaid"));
run("On foot: hero+Pip+Mags vs checkpoint", [["hero", null], ["pip", null], ["mags", null]], St("gatePatrol"), { onFoot: true });
run("Tabby+Bulwark vs Bastion gate", [["hero", "tabby"], ["mags", "bulwark"]], St("bastion"));
run("3 mechs vs the Vault road", [["hero", "tabby"], ["mags", "bulwark"], ["quill", "marten"]], St("vaultGuard"));
run("3 mechs vs the landing field", [["hero", "tabby"], ["mags", "bulwark"], ["quill", "marten"]], St("port"));
run("Founders' lance vs Greymane", [["hero", "sunclaw"], ["mags", "sabre"], ["quill", "dawn"], ["pip", "bulwark"]], St("finale"), {}, 1);
run("Founders' lance vs Greymane, untrained", [["hero", "sunclaw"], ["mags", "sabre"], ["quill", "dawn"], ["pip", "bulwark"]], St("finale"));
function St(id) { const b = PM.Story.BATTLES[id]; return { name: b.name, units: b.units }; }
