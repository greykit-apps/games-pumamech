/* PumaMech -- how the other side decides. DOM-free.
 *
 * For each of its units: every tile it could walk (or run, or jump) to this
 * round is weighed -- what it could hit from there and how hard, what could
 * hit it back, the cover -- and it goes to the best. Then each weapon is
 * aimed: at the unit that best tile was chosen for when it reaches it, else
 * at whatever else it reaches, and held back if the heat won't bear it.
 * (The round fires each weapon at its moment along the way: js/engine/combat.js.)
 * Beasts just close in and bite. The same mind plays your side in the
 * tests (tools/sim-check.js), and for any of yours put on "auto". */
"use strict";
(() => {
  const A = PM.AI = {};
  const C = PM.Combat;
  /* what one weapon is worth against t from a tile: chance times damage */
  const worth = (S, B, u, t, wi, from) => {
    if (!C.canShoot(B, u, wi, from, [t.x, t.y])) return 0;
    if (C.isMech(u)) {
      const w = u.m.wpn[wi], W = PM.WEAPONS[w.w], p = C.hitChance(S, B, u, t, w, { from }) / 100;
      return p * W.dmg * (W.n ? W.n * 0.65 : 1) * (C.isMech(t) ? 1 : (W.foot || 2) * 0.8) * (C.close(u, wi, C.dist(from[0], from[1], t.x, t.y)) ? 1.15 : 1);
    }
    const W = C.arms(u), p = C.hitChance(S, B, u, t, null, { from }) / 100;
    return p * W.dmg * (C.isMech(t) ? 0.2 : 1);
  };
  const wlist = u => C.isMech(u) ? u.m.wpn.map((w, i) => i).filter(i => C.armed(u.m.wpn[i])) : [0];
  /* how much damage could come at a tile from the other side */
  const threat = (S, B, u, x, y) => {
    let v = 0;
    for (const e of C.live(B)) {
      if (e.side === u.side) continue;
      const d = C.dist(e.x, e.y, x, y);
      if (C.isMech(e)) { for (const w of e.m.wpn) if (!w.dead && PM.WEAPONS[w.w].range >= d) v += PM.WEAPONS[w.w].dmg * (PM.WEAPONS[w.w].n ? PM.WEAPONS[w.w].n * 0.5 : 1) * 0.5; }
      else { const W = C.arms(e); if (W.range >= d) v += W.dmg * 0.5; }
    }
    return v;
  };
  /* a foe's worth as a target: the hurt ones first */
  const want = t => C.isMech(t) ? 1 + (1 - t.m.struct.CT / PM.structure(PM.CHASSIS[t.m.ch].tons).CT) * 0.6 : t.hp < 8 ? 1.3 : 1;
  A.orderFor = (S, B, u) => {
    const foes = C.live(B).filter(e => e.side !== u.side);
    const aim = C.isMech(u) ? u.m.wpn.map(() => null) : [null];
    if (!foes.length || u.shut > 0) return { path: null, act: null, aim };
    const map = PM.getMap(B.map);
    const modes = C.isMech(u) ? ["walk", "run"].concat(C.mp(u, "jump") > 0 ? ["jump"] : []) : ["walk"];
    const melee = !C.isMech(u) && C.arms(u).melee, ws = wlist(u);
    let best = null;
    const nearest = (x, y) => Math.min(...foes.map(f => C.dist(x, y, f.x, f.y)));
    for (const mode of modes) {
      const reach = C.reach(B, u, mode);
      for (const [, v] of reach) {
        const from = [v.x, v.y];
        let top = 0, tgt = null;
        for (const t of foes) {
          let val = 0;
          for (const wi of ws) val += worth(S, B, u, t, wi, from);
          val *= want(t);
          if (val > top) { top = val; tgt = t; }
        }
        const cover = PM.TF[PM.tileAt(map, v.x, v.y)].cover || 0;
        let score = top - threat(S, B, u, v.x, v.y) * (u.beast ? 0 : 0.25) + cover * 0.12;
        if (!tgt) score = -nearest(v.x, v.y) * 1.5;
        if (mode === "run") score -= tgt ? 3 : 0;
        if (mode === "jump") score -= 2 + (u.m.heat > 8 ? 4 : 0);
        if (melee && tgt) score += 4;
        score += (PM.rand(S) - 0.5) * 0.8;
        if (!best || score > best.score) best = { score, x: v.x, y: v.y, mode, reach, tgt, c: v.c };
      }
    }
    const path = C.pathTo(best.reach, best.x, best.y);
    const o = { path: path && path.length > 1 ? path : null, mode: best.mode, act: null, target: null, aim };
    const from = [best.x, best.y], main = best.tgt || foes.slice().sort((a, b) => C.dist(from[0], from[1], a.x, a.y) - C.dist(from[0], from[1], b.x, b.y))[0];
    /* each weapon: on the main target if it reaches, else the best it does reach, else on the main one anyway */
    const picks = ws.map(wi => {
      let t = main, v = worth(S, B, u, main, wi, from);
      if (!v) for (const f of foes) { const fv = worth(S, B, u, f, wi, from) * want(f); if (fv > v) { v = fv; t = f; } }
      return { wi, t, v };
    });
    if (C.isMech(u)) {
      /* within its heat, the best value for the heat first; a cool enemy mech may let fly with everything */
      const all = u.side === 1 && u.m.heat <= 4 && PM.rand(S) < 0.35;
      let room = C.chassis(u).sinks + 6 - u.m.heat - C.moveHeat(best.mode, best.c);
      picks.sort((p, q) => q.v / (PM.WEAPONS[u.m.wpn[q.wi].w].heat + 1) - p.v / (PM.WEAPONS[u.m.wpn[p.wi].w].heat + 1));
      for (const p of picks) {
        const h = PM.WEAPONS[u.m.wpn[p.wi].w].heat;
        if (all || h <= room) { aim[p.wi] = p.t.id; room -= h; }
      }
      /* a foe at its feet: kick it too */
      const adj = foes.find(f => C.dist(from[0], from[1], f.x, f.y) <= 1);
      if (adj) { o.act = "kick"; o.target = adj.id; }
    } else aim[0] = picks[0].t.id;
    return o;
  };
  A.orders = (S, B, side) => { for (const u of C.live(B)) if (u.side === side) A.give(u, A.orderFor(S, B, u)); };
  A.give = (u, o) => { u.aim = o.aim; delete o.aim; u.order = o; };
})();
