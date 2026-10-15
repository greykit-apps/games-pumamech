/* PumaMech -- how the other side decides. DOM-free.
 *
 * For each of its units: every tile it could walk (or run, or jump) to this
 * round is weighed -- what it could hit from there and how hard, what could
 * hit it back, the cover -- and it goes to the best and fires at whoever
 * that best shot was on, within what its heat allows. Beasts just close in
 * and bite. The same mind plays your side in the tests (tools/sim-check.js). */
"use strict";
(() => {
  const A = PM.AI = {};
  const C = PM.Combat;
  const exp = (S, B, u, t, from, moveHeat) => {
    if (C.isMech(u)) {
      let list = C.weaponsAt(S, B, u, t, from);
      list = C.coolSet(u, list, moveHeat);
      let v = 0;
      for (const { w } of list) { const W = PM.WEAPONS[w.w], p = C.hitChance(S, B, u, t, w, from) / 100; v += p * W.dmg * (W.n ? W.n * 0.65 : 1) * (C.isMech(t) ? 1 : (W.foot || 2) * 0.8); }
      return { v, list };
    }
    const W = PM.ARMS[u.weapon] || PM.ARMS.fists, d = C.dist(from[0], from[1], t.x, t.y);
    if (d > W.range || (!W.melee && !C.los(B, from[0], from[1], t.x, t.y))) return { v: 0 };
    const save = [u.x, u.y]; u.x = from[0]; u.y = from[1];
    const p = C.hitChance(S, B, u, t) / 100; u.x = save[0]; u.y = save[1];
    return { v: p * W.dmg * (C.isMech(t) ? 0.2 : 1) };
  };
  /* how much damage could come at a tile from the other side */
  const threat = (S, B, u, x, y) => {
    let v = 0;
    for (const e of C.live(B)) {
      if (e.side === u.side) continue;
      const d = C.dist(e.x, e.y, x, y);
      if (C.isMech(e)) { for (const w of e.m.wpn) if (!w.dead && PM.WEAPONS[w.w].range >= d) v += PM.WEAPONS[w.w].dmg * (PM.WEAPONS[w.w].n ? PM.WEAPONS[w.w].n * 0.5 : 1) * 0.5; }
      else { const W = PM.ARMS[e.weapon] || PM.ARMS.fists; if (W.range >= d) v += W.dmg * 0.5; }
    }
    return v;
  };
  A.orderFor = (S, B, u) => {
    const foes = C.live(B).filter(e => e.side !== u.side);
    if (!foes.length || u.shut > 0) return { path: null, act: null };
    const map = PM.getMap(B.map);
    const modes = C.isMech(u) ? ["walk", "run"].concat(C.mp(u, "jump") > 0 ? ["jump"] : []) : ["walk"];
    const melee = !C.isMech(u) && (PM.ARMS[u.weapon] || PM.ARMS.fists).melee;
    let best = null;
    const nearest = (x, y) => Math.min(...foes.map(f => C.dist(x, y, f.x, f.y)));
    for (const mode of modes) {
      const reach = C.reach(B, u, mode);
      for (const [, v] of reach) {
        const mh = C.isMech(u) ? C.moveHeat(mode, v.c) : 0;
        let top = 0, tgt = null;
        for (const t of foes) {
          const e = exp(S, B, u, t, [v.x, v.y], mh);
          let val = e.v;
          if (C.isMech(t)) val *= 1 + (1 - t.m.struct.CT / PM.structure(PM.CHASSIS[t.m.ch].tons).CT) * 0.6;
          else val *= t.hp < 8 ? 1.3 : 1;
          if (val > top) { top = val; tgt = t; }
        }
        const cover = PM.TF[PM.tileAt(map, v.x, v.y)].cover || 0;
        let score = top * 1.0 - threat(S, B, u, v.x, v.y) * (u.beast ? 0 : 0.25) + cover * 0.12;
        if (!tgt) score = -nearest(v.x, v.y) * 1.5;
        if (mode === "run") score -= tgt ? 3 : 0;
        if (mode === "jump") score -= 2 + (u.m.heat > 8 ? 4 : 0);
        if (melee && tgt) score += 4;
        score += (PM.rand(S) - 0.5) * 0.8;
        if (!best || score > best.score) best = { score, x: v.x, y: v.y, mode, reach, tgt };
      }
    }
    const path = best ? C.pathTo(best.reach, best.x, best.y) : null;
    const o = { path: path && path.length > 1 ? path : null, mode: best ? best.mode : "walk", act: null, target: null, wsel: "cool" };
    if (best && best.tgt) { o.act = "fire"; o.target = best.tgt.id; }
    /* a mech with no shot but a foe at its feet: kick */
    if (C.isMech(u) && (!best || !best.tgt)) {
      const ex = best ? best.x : u.x, ey = best ? best.y : u.y;
      const adj = foes.find(f => C.dist(ex, ey, f.x, f.y) <= 1);
      if (adj) { o.act = "kick"; o.target = adj.id; }
    }
    /* a cool mech fires everything it has */
    if (C.isMech(u) && u.m.heat <= 4 && u.side === 1 && PM.rand(S) < 0.35) o.wsel = "all";
    return o;
  };
  A.orders = (S, B, side) => { for (const u of C.live(B)) if (u.side === side) u.order = A.orderFor(S, B, u); };
})();
