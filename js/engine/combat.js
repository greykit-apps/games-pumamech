/* PumaMech -- a fight. DOM-free.
 *
 * The 1988 game's fights were rounds of orders: each of your people and
 * mechs is told what to do, then the round plays out. So here. A fight
 * happens on the ground where it was met: a stretch of the map around the
 * party (the arena), with its trees, walls, water and buildings.
 *
 * Each round:
 *  1. Orders. For each of yours: where to go (walk, run, or jump), and
 *     what to do when there: fire on a target (all its weapons, or only
 *     those it can afford in heat), kick or punch, a satchel charge, a
 *     medkit, or take cover. The enemy decides too (PM.AI).
 *  2. Movement, everyone at once, quickest pilot first where two want the
 *     same tile.
 *  3. Fire, everyone at once: every shot is rolled from where everyone
 *     stood when the shooting started. Hits land in a location, armour
 *     first; a location shot through takes its weapons with it; a head or
 *     a centre torso shot through and the mech is finished, its pilot out.
 *     Pilots of a beaten mech may climb out and run (ejected): the mech is
 *     left standing, and can be salvaged.
 *  4. Heat: weapons and running heat a mech; its sinks shed so much a
 *     round. Run it hot and it shoots worse, walks slower, shuts down.
 *
 * Every roll is PM.rand(S). PM.Combat.resolve returns "beats" -- moves,
 * shots, explosions, words -- for the screen to play; the state is already
 * final when it returns. */
"use strict";
(() => {
  const C = PM.Combat = {};
  const G = PM.Game;
  const R = S => PM.rand(S);
  const DIRS = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
  const dist = (a, b, c, d) => Math.max(Math.abs(a - c), Math.abs(b - d));
  C.dist = dist;
  C.dirTo = (x0, y0, x1, y1) => { const a = Math.atan2(y1 - y0, x1 - x0); return ((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8; };
  const AW = 22, AH = 14;

  /* ---- building a fight ----
   * group: { name, units: [{ t: "mech", ch, pilot, paint } | { t: "foot", foe }] }
   * o: { map, cx, cy, onFoot (everyone on foot), story, noRetreat, party (override: [{cid, mech uid | null}]) } */
  C.start = (S, group, o = {}) => {
    const map = PM.getMap(o.map || S.pos.map), cx = o.cx ?? S.pos.x, cy = o.cy ?? S.pos.y;
    const x0 = Math.max(0, Math.min(map.w - AW, cx - (AW >> 1))), y0 = Math.max(0, Math.min(map.h - AH, cy - (AH >> 1)));
    const B = { map: map.id, ax: x0, ay: y0, aw: Math.min(AW, map.w), ah: Math.min(AH, map.h), units: [], round: 1, phase: "orders",
      log: [], name: group.name, story: o.story || null, noRetreat: !!o.noRetreat, training: !!o.training, result: null, uid: 1, salvage: [], loot: 0, xp: {}, events: [] };
    /* yours: each in their mech if they have a working one and the ground allows, else on foot */
    const roster = o.party || G.partyChars(S).filter(c => c.hp > 0).map(c => {
      const m = G.mechOf(S, c.id);
      return { cid: c.id, mech: !o.onFoot && m && G.mechUsable(m) ? m.uid : null };
    });
    const home = spots(S, B, map, cx, Math.min(cy + 2, y0 + B.ah - 2), roster.length);
    roster.forEach((r, i) => {
      const c = S.chars[r.cid], [x, y] = home[i] || [cx, cy];
      if (r.mech) {
        const m = S.mechs.find(mm => mm.uid === r.mech);
        add(B, { side: 0, kind: "mech", name: `${c.name.split(" ")[0]}'s ${PM.CHASSIS[m.ch].name}`, cid: c.id, mref: m.uid, m, x, y, f: 6 });
      } else add(B, footOf(c, 0, x, y));
    });
    /* theirs, across the arena */
    const foeSide = o.foeAt || "north";
    const fy = foeSide === "north" ? y0 + 1 : y0 + B.ah - 2;
    const there = spots(S, B, map, cx + (G.roll(S, 7) - 3), fy, group.units.length, true);
    group.units.forEach((u, i) => {
      const [x, y] = there[i] || [cx, y0 + 1];
      if (u.t === "mech") {
        const m = G.newMech(S, u.ch, u.paint || "wolf", { at: "battle" });
        const pl = { ...(PM.PILOTS[u.pilot] || PM.PILOTS.line) };
        pl.gun += [-1, 0, 1][S.diff] || 0;
        if (u.damaged) for (const l of PM.LOCS) m.armor[l] = Math.round(m.armor[l] * u.damaged);
        add(B, { side: 1, kind: "mech", name: u.name || `${PM.CHASSIS[u.ch].name}`, m, pilot: pl, x, y, f: 2, boss: !!u.boss, scripted: u.scripted || u.ch === "drone" });
      } else {
        const F = PM.FOES[u.foe];
        add(B, { side: 1, kind: "foot", name: F.name, foe: u.foe, look: F.look, hp: F.hp, hpMax: F.hp, move: F.move, weapon: F.weapon, armor: F.armor,
          skill: F.skill + ([-1, 0, 1][S.diff] || 0), beast: !!F.beast, machine: !!F.machine, big: !!F.big, x, y, f: 2 });
      }
    });
    for (const u of B.units) u.f = C.dirTo(u.x, u.y, B.ax + B.aw / 2, B.ay + B.ah / 2);
    S.bat = B;
    S.stats.battles++;
    return B;
  };
  const footOf = (c, side, x, y) => ({ side, kind: "foot", name: c.name.split(" ")[0], cid: c.id, look: c.look, hp: c.hp, hpMax: c.hpMax, move: c.move,
    weapon: c.weapon, armor: c.armor, x, y, f: 6 });
  const add = (B, u) => { u.id = B.uid++; u.order = null; u.out = null; u.moved = 0; u.jumped = false; u.shut = 0; B.units.push(u); return u; };

  /* free standing places near (cx, cy), for n units */
  const spots = (S, B, map, cx, cy, n, foe) => {
    const out = [], seen = new Set(), q = [[cx, cy]];
    const ok = (x, y) => inArena(B, x, y) && PM.TF[PM.tileAt(map, x, y)].m > 0 && PM.TF[PM.tileAt(map, x, y)].f > 0 && !B.units.some(u => u.x === x && u.y === y) && !out.some(p => p[0] === x && p[1] === y);
    while (q.length && out.length < n) {
      const [x, y] = q.shift(), k = x + "," + y;
      if (seen.has(k)) continue; seen.add(k);
      if (ok(x, y) && (out.length === 0 || out.every(p => dist(p[0], p[1], x, y) >= 2) || seen.size > 200)) out.push([x, y]);
      for (const [dx, dy] of foe ? [[1, 0], [-1, 0], [0, 1], [0, -1]] : [[0, 1], [1, 0], [-1, 0], [0, -1]]) if (inArena(B, x + dx, y + dy)) q.push([x + dx, y + dy]);
    }
    return out;
  };
  const inArena = (B, x, y) => x >= B.ax && y >= B.ay && x < B.ax + B.aw && y < B.ay + B.ah;
  C.inArena = inArena;

  /* a unit arriving mid-fight, at an edge of the arena */
  C.spawn = (S, B, u, edge = "north") => {
    const map = PM.getMap(B.map), x = B.ax + (B.aw >> 1) + G.roll(S, 9) - 4, y = edge === "north" ? B.ay + 1 : B.ay + B.ah - 2;
    const [sx, sy] = spots(S, B, map, x, y, 1, true)[0] || [x, y];
    const m = G.newMech(S, u.ch, u.paint || "wolf", { at: "battle" }), pl = { ...(PM.PILOTS[u.pilot] || PM.PILOTS.line) };
    return add(B, { side: 1, kind: "mech", name: u.name || PM.CHASSIS[u.ch].name, m, pilot: pl, x: sx, y: sy, f: 2 });
  };

  /* ---- what a unit is and can do ---- */
  C.live = B => B.units.filter(u => !u.out);
  C.unit = (B, id) => B.units.find(u => u.id === id);
  C.isMech = u => u.kind === "mech";
  C.chassis = u => PM.CHASSIS[u.m.ch];
  C.pilotOf = (S, u) => u.side === 0 ? S.chars[u.cid].skills : u.pilot;
  C.footSkill = (S, u, melee) => u.side === 0 ? S.chars[u.cid].skills[melee ? "melee" : "arms"] : u.skill;
  /* how far it can go this round */
  C.mp = (u, mode) => {
    if (u.shut > 0) return 0;
    if (!C.isMech(u)) return mode === "run" ? u.move + 1 : u.move;
    const ch = C.chassis(u), m = u.m;
    let w = ch.walk;
    if (m.struct.LL <= 0) w = Math.floor(w / 2);
    if (m.struct.RL <= 0) w = Math.floor(w / 2);
    if (m.heat >= 14) w -= 1;
    if (m.heat >= 20) w -= 1;
    w = Math.max(0, w);
    if (mode === "run") return Math.ceil(w * 1.5);
    if (mode === "jump") return m.struct.LL > 0 && m.struct.RL > 0 ? ch.jump : 0;
    return w;
  };
  C.cost = (B, u, x, y) => {
    if (!inArena(B, x, y)) return 0;
    const t = PM.TF[PM.tileAt(PM.getMap(B.map), x, y)];
    return C.isMech(u) ? t.m : t.f;
  };
  const occupied = (B, x, y, except) => B.units.some(u => !u.out && u !== except && u.x === x && u.y === y);
  /* every tile it can reach this round: Map "x,y" -> { c cost, p previous key } */
  C.reach = (B, u, mode) => {
    const mp = C.mp(u, mode), out = new Map([[u.x + "," + u.y, { c: 0, p: null, x: u.x, y: u.y }]]);
    if (mp <= 0) return out;
    if (mode === "jump") {
      for (let y = u.y - mp; y <= u.y + mp; y++) for (let x = u.x - mp; x <= u.x + mp; x++) {
        if ((x === u.x && y === u.y) || C.cost(B, u, x, y) === 0 || occupied(B, x, y, u)) continue;
        out.set(x + "," + y, { c: dist(u.x, u.y, x, y), p: u.x + "," + u.y, x, y });
      }
      return out;
    }
    const q = [[u.x, u.y, 0]];
    while (q.length) {
      q.sort((a, b) => a[2] - b[2]);
      const [x, y, c] = q.shift();
      for (const [dx, dy] of DIRS) {
        const nx = x + dx, ny = y + dy, k = C.cost(B, u, nx, ny);
        if (!k) continue;
        /* no slipping diagonally between two blocked tiles */
        if (dx && dy && !C.cost(B, u, x + dx, y) && !C.cost(B, u, x, y + dy)) continue;
        /* through friends, never through foes */
        if (B.units.some(w => !w.out && w !== u && w.x === nx && w.y === ny && w.side !== u.side)) continue;
        const nc = c + k, key = nx + "," + ny, prev = out.get(key);
        if (nc > mp || (prev && prev.c <= nc)) continue;
        out.set(key, { c: nc, p: x + "," + y, x: nx, y: ny });
        q.push([nx, ny, nc]);
      }
    }
    /* nowhere to stop on top of someone */
    for (const [k, v] of out) if (k !== u.x + "," + u.y && occupied(B, v.x, v.y, u)) out.delete(k);
    return out;
  };
  C.pathTo = (reach, x, y) => {
    const path = [];
    let k = x + "," + y;
    while (k) { const v = reach.get(k); if (!v) return null; path.unshift([v.x, v.y]); k = v.p; }
    return path;
  };

  /* is there a clear line from a to b? trees, walls of buildings and cliffs block it */
  C.los = (B, x0, y0, x1, y1) => {
    const map = PM.getMap(B.map), n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
    let trees = 0;
    for (let i = 1; i < n; i++) {
      const x = Math.round(x0 + (x1 - x0) * i / n), y = Math.round(y0 + (y1 - y0) * i / n);
      const t = PM.tileAt(map, x, y);
      if (t === PM.T.TREE) { if (++trees >= 2) return false; continue; }
      if (PM.TF[t].los) return false;
    }
    return true;
  };

  /* ---- the chance to hit, 5 to 95 ---- */
  C.hitChance = (S, B, a, t, w, from) => {
    const [ax, ay] = from || [a.x, a.y], d = dist(ax, ay, t.x, t.y);
    let p;
    if (C.isMech(a)) {
      const W = PM.WEAPONS[w.w];
      if (d > W.range) return 0;
      p = 52 + C.pilotOf(S, a).gun * 6;
      if (d <= W.short) p += 8; else if (d > (W.short + W.range) / 2) p -= 14;
      if (W.min && d < W.min) p -= 20;
      if (a.m.heat >= 10) p -= 8; if (a.m.heat >= 16) p -= 8;
      if (!C.isMech(t)) p -= t.big ? 10 : 18;
    } else {
      const A = PM.ARMS[a.weapon] || PM.ARMS.fists;
      if (d > A.range) return 0;
      p = (A.melee ? 52 : 44) + C.footSkill(S, a, A.melee) * 6;
      if (!A.melee && d > A.range / 2) p -= 12;
      if (C.isMech(t)) p += 22;
    }
    /* how they moved */
    if (a.moved) p -= a.jumped ? 15 : a.ran ? 10 : 4;
    if (t.moved) p -= Math.min(12, t.moved * 2) + (t.jumped ? 8 : 0);
    if (t.order && t.order.act === "defend") p -= 15;
    if (t.shut > 0) p += 20;
    p -= PM.TF[PM.tileAt(PM.getMap(B.map), t.x, t.y)].cover || 0;
    return Math.max(5, Math.min(95, Math.round(p)));
  };
  /* the weapons it could fire at t this round, from where it will stand */
  C.weaponsAt = (S, B, a, t, from) => {
    if (!C.isMech(a)) return [];
    const [ax, ay] = from || [a.x, a.y];
    if (!C.los(B, ax, ay, t.x, t.y)) return [];
    return a.m.wpn.map((w, i) => ({ w, i })).filter(({ w }) => !w.dead && (!PM.WEAPONS[w.w].ammo || w.ammo > 0) && PM.WEAPONS[w.w].range >= dist(ax, ay, t.x, t.y));
  };
  /* the heat a set of weapons would cost, and what is cool enough to fire */
  C.coolSet = (a, list, moveHeat) => {
    const sinks = C.chassis(a).sinks, room = Math.max(0, sinks + 6 - a.m.heat - moveHeat);
    const out = [];
    let h = 0;
    for (const x of list.slice().sort((p, q) => PM.WEAPONS[q.w.w].dmg * (PM.WEAPONS[q.w.w].n || 1) / (PM.WEAPONS[q.w.w].heat + 1) - PM.WEAPONS[p.w.w].dmg * (PM.WEAPONS[p.w.w].n || 1) / (PM.WEAPONS[p.w.w].heat + 1))) {
      const wh = PM.WEAPONS[x.w.w].heat;
      if (h + wh <= room) { out.push(x); h += wh; }
    }
    return out;
  };
  C.moveHeat = (mode, n) => mode === "jump" ? Math.max(3, n) : mode === "run" ? 2 : n > 0 ? 1 : 0;

  /* ---- resolving a round ---- */
  C.resolve = (S, B) => {
    const beats = [];
    const say = (text, k = "") => { B.log.push(text); beats.push({ t: "say", text, k }); };
    const live = C.live(B);
    B.phase = "resolve";
    /* the retreat: tried before anything else moves */
    const yours = live.filter(u => u.side === 0);
    if (yours.length && yours.every(u => u.order && u.order.act === "retreat")) {
      const near = live.filter(u => u.side === 1 && yours.some(y => dist(u.x, u.y, y.x, y.y) <= 4)).length;
      const pil = yours.reduce((a, u) => a + (C.isMech(u) ? C.pilotOf(S, u).pilot : u.move), 0) / yours.length;
      const p = Math.max(0.15, Math.min(0.9, 0.5 + pil * 0.04 - near * 0.08));
      if (R(S) < p) { say("You break off and get clear.", "go"); B.result = "fled"; B.phase = "over"; beats.push({ t: "end" }); return beats; }
      say("They are on you: no way out this round.", "bad");
      for (const u of yours) u.order = { path: null, act: null };
    }
    for (const u of live) { u.moved = 0; u.jumped = false; u.ran = false; }
    /* 1. movement, quickest first */
    const init = live.map(u => [u, (C.isMech(u) ? C.pilotOf(S, u).pilot : u.move) + R(S) * 6]).sort((a, b) => b[1] - a[1]).map(p => p[0]);
    for (const u of init) {
      const o = u.order;
      if (!o || !o.path || o.path.length < 2 || u.shut > 0) continue;
      const path = [o.path[0]];
      for (let i = 1; i < o.path.length; i++) {
        const [x, y] = o.path[i];
        /* someone got there first: stop short */
        if (B.units.some(w => !w.out && w !== u && w.x === x && w.y === y) && i === o.path.length - 1) break;
        if (B.units.some(w => !w.out && w !== u && w.side !== u.side && w.x === x && w.y === y)) break;
        path.push([x, y]);
      }
      while (path.length > 1 && B.units.some(w => !w.out && w !== u && w.x === path[path.length - 1][0] && w.y === path[path.length - 1][1])) path.pop();
      if (path.length < 2) continue;
      const [ex, ey] = path[path.length - 1], [px, py] = path[path.length - 2];
      u.f = C.dirTo(px, py, ex, ey);
      u.moved = path.length - 1; u.jumped = o.mode === "jump"; u.ran = o.mode === "run";
      u.x = ex; u.y = ey;
      if (C.isMech(u)) u.m.heat += C.moveHeat(o.mode, u.moved);
      beats.push({ t: "move", id: u.id, path, mode: o.mode || "walk" });
      if (u.side === 0) xp(B, u, C.isMech(u) ? "pilot" : null);
    }
    /* 2. fire: everyone who stands when it starts gets their shots */
    const firing = C.live(B).filter(u => u.order && u.order.act && u.order.act !== "defend" && u.order.act !== "retreat" && u.shut <= 0);
    const strikes = [];
    for (const a of firing) {
      const o = a.order, t = o.target != null ? C.unit(B, o.target) : null;
      if (o.act === "medkit") { strikes.push(() => medkit(S, B, a, t || a, beats, say)); continue; }
      if (!t || t.out) { if (a.side === 0) say(`${a.name}: no target left.`); continue; }
      if (t.side === a.side) continue;
      a.f = C.dirTo(a.x, a.y, t.x, t.y);
      if (o.act === "fire") {
        if (C.isMech(a)) {
          let list = C.weaponsAt(S, B, a, t);
          if (o.wsel === "cool") list = C.coolSet(a, list, 0);
          else if (Array.isArray(o.wsel)) list = list.filter(x => o.wsel.includes(x.i));
          if (!list.length) { if (a.side === 0) say(`${a.name}: out of range.`); continue; }
          for (const x of list) {
            const W = PM.WEAPONS[x.w.w], hit = C.hitChance(S, B, a, t, x.w);
            a.m.heat += W.heat;
            if (W.ammo) x.w.ammo--;
            strikes.push(() => mechShot(S, B, a, t, x.w, hit, beats, say));
          }
          xp(B, a, "gun");
        } else {
          const A = PM.ARMS[a.weapon] || PM.ARMS.fists, d = dist(a.x, a.y, t.x, t.y);
          if (d > A.range || (!A.melee && !C.los(B, a.x, a.y, t.x, t.y))) { if (a.side === 0) say(`${a.name}: can't reach ${t.name}.`); continue; }
          const hit = C.hitChance(S, B, a, t);
          strikes.push(() => footShot(S, B, a, t, A, hit, beats, say));
          xp(B, a, A.melee ? "melee" : "arms");
        }
      } else if (o.act === "kick" || o.act === "punch") {
        if (dist(a.x, a.y, t.x, t.y) > 1) { if (a.side === 0) say(`${a.name} can't reach to ${o.act}.`); continue; }
        strikes.push(() => physical(S, B, a, t, o.act, beats, say));
        xp(B, a, "pilot");
      } else if (o.act === "satchel") {
        if (dist(a.x, a.y, t.x, t.y) > 1 || !C.isMech(t) || !(S.items.satchel > 0)) { say(`${a.name} can't place the charge.`); continue; }
        S.items.satchel--;
        strikes.push(() => satchel(S, B, a, t, beats, say));
      }
    }
    /* shuffle the order the shots land in a little, so no side always lands first */
    for (let i = strikes.length - 1; i > 0; i--) { const j = Math.floor(R(S) * (i + 1)); [strikes[i], strikes[j]] = [strikes[j], strikes[i]]; }
    for (const s of strikes) s();
    /* 3. heat, shutdowns, nerves */
    for (const u of C.live(B)) {
      if (!C.isMech(u)) continue;
      const m = u.m, ch = C.chassis(u);
      if (u.shut > 0) u.shut--;
      if (m.heat >= 26 && R(S) < 0.25) ammoBlast(S, B, u, beats, say, "Heat cooks off its ammunition");
      if (u.out) continue;
      if (m.heat >= 30 || (m.heat >= 20 && R(S) < 0.35)) { if (u.shut <= 0) { u.shut = 1; say(`${u.name} overheats and shuts down!`, "warn"); beats.push({ t: "shut", id: u.id }); } }
      m.heat = Math.max(0, m.heat - ch.sinks);
      /* the enemy's nerve: a pilot in a wreck may climb out */
      if (u.side === 1 && !u.boss && !u.scripted) {
        const ct = m.struct.CT / PM.structure(ch.tons).CT, legs = m.struct.LL <= 0 || m.struct.RL <= 0;
        if ((ct < 0.45 || legs || m.struct.HD < 2) && R(S) < (legs ? 0.3 : 0.22)) {
          u.out = "ejected"; say(`${u.name}'s pilot ejects!`, "go"); beats.push({ t: "eject", id: u.id });
        }
      }
    }
    for (const u of B.units) if (!u.out) u.order = null;
    B.round++;
    C.checkEnd(S, B, beats);
    if (!B.result) B.phase = "orders";
    return beats;
  };
  C.checkEnd = (S, B, beats) => {
    const mine = C.live(B).filter(u => u.side === 0), theirs = C.live(B).filter(u => u.side === 1);
    if (!theirs.length) { B.result = "won"; B.phase = "over"; beats && beats.push({ t: "end" }); }
    else if (!mine.length) { B.result = "lost"; B.phase = "over"; beats && beats.push({ t: "end" }); }
  };
  const xp = (B, u, k) => { if (!k || u.side !== 0) return; const key = u.cid + ":" + k; B.xp[key] = (B.xp[key] || 0) + 1; };

  /* ---- shots ---- */
  const locRoll = S => { let r = R(S) * 100; for (const [l, w] of PM.HIT_TABLE) { if ((r -= w) < 0) return l; } return "CT"; };
  const INWARD = { LA: "LT", RA: "RT", LL: "LT", RL: "RT", LT: "CT", RT: "CT", HD: null, CT: null };
  /* damage into a mech at a location, armour then bones, the rest inward */
  const damageMech = (S, B, t, loc, dmg, beats, say) => {
    const m = t.m;
    let l = loc;
    while (dmg > 0 && l) {
      if (m.struct[l] <= 0) { l = INWARD[l]; continue; }
      const a = Math.min(m.armor[l], dmg); m.armor[l] -= a; dmg -= a;
      if (dmg <= 0) break;
      const s = Math.min(m.struct[l], dmg); m.struct[l] -= s; dmg -= s;
      /* a hit through the armour may find the ammunition */
      if (s > 0 && m.wpn.some(w => w.loc === l && !w.dead && PM.WEAPONS[w.w].ammo && w.ammo > 0) && R(S) < 0.07) { ammoBlast(S, B, t, beats, say, "A hit finds the ammunition"); return; }
      if (m.struct[l] <= 0) {
        for (const w of m.wpn) if (w.loc === l) w.dead = true;
        if (l === "LT") { m.struct.LA = 0; for (const w of m.wpn) if (w.loc === "LA") w.dead = true; }
        if (l === "RT") { m.struct.RA = 0; for (const w of m.wpn) if (w.loc === "RA") w.dead = true; }
        if (l === "HD" || l === "CT") { finish(S, B, t, l === "HD" ? "head" : "core", beats, say); return; }
        say(`${t.name}'s ${PM.LOC_NAME[l]} is shot away.`, t.side ? "go" : "bad");
        if (G.mechLegless(m)) say(`${t.name} is down on its stumps.`, t.side ? "go" : "bad");
      }
      l = INWARD[l];
    }
    if (loc === "HD" && t.side === 0 && !t.out) { const c = S.chars[t.cid]; c.hp = Math.max(1, c.hp - 2); }
  };
  const ammoBlast = (S, B, u, beats, say, why) => {
    const m = u.m;
    for (const w of m.wpn) if (PM.WEAPONS[w.w].ammo) w.ammo = 0;
    say(`${why}: ${u.name} is torn open!`, u.side ? "go" : "bad");
    beats.push({ t: "boom", id: u.id, big: 1 });
    m.struct.CT = Math.max(0, m.struct.CT - 12);
    if (m.struct.CT <= 0) finish(S, B, u, "core", beats, say);
  };
  /* a mech finished: its pilot out, if they can be */
  const finish = (S, B, u, how, beats, say) => {
    if (u.out) return;
    u.out = how === "head" ? "head" : "destroyed";
    beats.push({ t: "boom", id: u.id, big: 1, wreck: 1 });
    say(`${u.name} is destroyed!`, u.side ? "go" : "bad");
    if (u.side === 1) { S.stats.mechKills++; return; }
    /* yours climbs out, hurt, and fights on foot */
    const c = S.chars[u.cid];
    c.hp = Math.max(1, c.hp - (how === "head" ? 10 : 5));
    const spot = [[0, 1], [1, 0], [-1, 0], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]].map(([dx, dy]) => [u.x + dx, u.y + dy]).find(([x, y]) => C.cost(B, { kind: "foot" }, x, y) > 0 && !occupied(B, x, y));
    if (spot) {
      const f = add(B, footOf(c, 0, spot[0], spot[1]));
      f.hp = c.hp;
      say(`${f.name} ejects and lands on foot.`, "warn");
      beats.push({ t: "spawn", id: f.id });
    }
  };
  const mechShot = (S, B, a, t, w, hit, beats, say) => {
    const W = PM.WEAPONS[w.w];
    if (t.out) return;
    if (R(S) * 100 >= hit) { beats.push({ t: "shot", from: a.id, to: t.id, kind: W.kind, w: w.w, hit: false }); return; }
    let dmg = W.dmg, groups;
    if (W.n) {
      /* a salvo: some of it hits */
      const n = Math.max(1, Math.round(W.n * (0.35 + R(S) * 0.65)));
      dmg = n * W.dmg;
      groups = [];
      for (let left = dmg; left > 0; left -= 5) groups.push(Math.min(5, left));
    } else groups = [dmg];
    if (!C.isMech(t)) {
      const d = Math.round(dmg * (W.foot || 2) * (t.big ? 0.6 : 1));
      beats.push({ t: "shot", from: a.id, to: t.id, kind: W.kind, w: w.w, hit: true, dmg: d });
      hurt(S, B, t, d, beats, say);
      return;
    }
    const locs = groups.map(() => locRoll(S));
    beats.push({ t: "shot", from: a.id, to: t.id, kind: W.kind, w: w.w, hit: true, dmg, loc: locs[0] });
    groups.forEach((gdmg, i) => { if (!t.out) damageMech(S, B, t, locs[i], gdmg, beats, say); });
    if (W.tHeat && !t.out) t.m.heat += W.tHeat;
  };
  /* hurt someone on foot */
  const hurt = (S, B, t, d, beats, say) => {
    if (t.out) return;
    const arm = (PM.ARMOR[t.armor] || PM.ARMOR.none).def;
    d = Math.max(1, d - arm);
    t.hp -= d;
    if (t.side === 0) S.chars[t.cid].hp = Math.max(0, t.hp);
    if (t.hp <= 0) {
      t.out = t.side === 0 ? "down" : "dead";
      beats.push({ t: "fall", id: t.id });
      say(t.side === 0 ? `${t.name} is down!` : t.beast ? `The ${t.name.toLowerCase()} falls.` : t.machine ? `A ${t.name.toLowerCase()} sparks and stops.` : `${t.name} goes down.`, t.side ? "go" : "bad");
      if (t.side === 1) { S.stats.kills++; const F = PM.FOES[t.foe]; if (F && F.drop[1]) B.loot += F.drop[0] + Math.floor(R(S) * (F.drop[1] - F.drop[0])); }
    }
  };
  const footShot = (S, B, a, t, A, hit, beats, say) => {
    if (t.out) return;
    const kind = A.melee ? "melee" : a.weapon && a.weapon[0] === "l" ? "pbeam" : "bullet";
    if (R(S) * 100 >= hit) { beats.push({ t: "shot", from: a.id, to: t.id, kind, hit: false }); return; }
    let d = A.dmg + Math.floor(R(S) * 3) - 1;
    if (a.side === 0 && A.melee) d += Math.floor(C.footSkill(S, a, true) / 3);
    beats.push({ t: "shot", from: a.id, to: t.id, kind, hit: true, dmg: d });
    if (C.isMech(t)) { damageMech(S, B, t, locRoll(S), Math.max(1, Math.round(d / 5)), beats, say); return; }
    hurt(S, B, t, d, beats, say);
  };
  const physical = (S, B, a, t, how, beats, say) => {
    if (t.out) return;
    const tons = C.chassis(a).tons, pil = C.pilotOf(S, a).pilot;
    if (how === "punch" && !a.m.wpn.some(w => (w.loc === "LA" || w.loc === "RA") && !w.dead) && a.m.struct.LA <= 0 && a.m.struct.RA <= 0) { say(`${a.name} has no arm left to punch with.`); return; }
    const hit = Math.max(10, Math.min(92, 50 + pil * 5 + (C.isMech(t) ? 0 : -15)));
    if (R(S) * 100 >= hit) { beats.push({ t: "shot", from: a.id, to: t.id, kind: "melee", hit: false }); say(`${a.name}'s ${how} misses.`); return; }
    const dmg = Math.round(how === "kick" ? tons / 5 : tons / 10);
    beats.push({ t: "shot", from: a.id, to: t.id, kind: "melee", hit: true, dmg });
    if (!C.isMech(t)) { hurt(S, B, t, dmg * 2, beats, say); return; }
    const loc = how === "kick" ? (R(S) < 0.5 ? "LL" : "RL") : ["LA", "RA", "LT", "RT", "CT", "HD"][Math.floor(R(S) * 6)];
    damageMech(S, B, t, loc, dmg, beats, say);
  };
  const satchel = (S, B, a, t, beats, say) => {
    if (t.out) return;
    const hit = 70 + C.footSkill(S, a, true) * 3;
    beats.push({ t: "shot", from: a.id, to: t.id, kind: "satchel", hit: R(S) * 100 < hit });
    if (!beats[beats.length - 1].hit) { say(`${a.name}'s charge slides off and bursts in the dirt.`); return; }
    beats.push({ t: "boom", id: t.id });
    say(`${a.name} packs a charge against ${t.name}'s leg. It goes off!`, "go");
    damageMech(S, B, t, R(S) < 0.5 ? "LL" : "RL", 15, beats, say);
  };
  const medkit = (S, B, a, t, beats, say) => {
    if (!(S.items.medkit > 0) || t.out || C.isMech(t)) { say(`${a.name}: no medkit to use.`); return; }
    S.items.medkit--;
    const med = a.side === 0 ? S.chars[a.cid].skills.medic : 2, heal = 10 + med * 2;
    t.hp = Math.min(t.hpMax, t.hp + heal);
    if (t.side === 0) S.chars[t.cid].hp = t.hp;
    beats.push({ t: "heal", id: t.id, n: heal });
    say(`${a.name} patches up ${t === a ? "their own wounds" : t.name}: +${heal}.`, "go");
  };

  /* ---- after the fight ---- */
  C.finishBattle = (S, B) => {
    const out = { result: B.result, loot: 0, salvage: [], scrap: 0, repaired: 0, healed: 0, ups: [], items: [] };
    if (B.result === "won" && !B.training) {
      out.loot = B.loot;
      for (const u of B.units) if (u.side === 1 && C.isMech(u)) {
        if (u.out === "ejected" || u.out === "head" || (u.out && G.mechLegless(u.m) && u.m.struct.CT > 0)) {
          u.m.at = "yard"; u.m.heat = 0; u.m.pilot = null;
          if (!S.mechs.includes(u.m)) S.mechs.push(u.m);
          out.salvage.push(u.m);
        } else if (u.out) out.scrap += Math.round(PM.mechValue(u.m.ch) * 0.06);
      }
      /* a pocketful from the field */
      if (R(S) < 0.3) { S.items.medkit++; out.items.push("a medkit"); }
      S.money += out.loot + out.scrap;
    }
    if (B.result !== "lost") {
      /* field repairs and first aid */
      const tech = G.bestSkill(S, "tech"), med = G.bestSkill(S, "medic");
      let pool = tech * 4;
      for (const m of G.lance(S)) {
        m.heat = 0;
        if (G.mechDestroyed(m)) continue;
        const mx = G.mechMax(m);
        for (const l of PM.LOCS) { const need = mx.armor[l] - m.armor[l], put = Math.min(need, pool); m.armor[l] += put; pool -= put; out.repaired += put; }
      }
      for (const c of G.partyChars(S)) {
        if (c.hp <= 0) c.hp = 1;
        const h = Math.min(c.hpMax - c.hp, med * 2); c.hp += h; out.healed += h;
      }
      /* what they learned */
      for (const [k, n] of Object.entries(B.xp)) {
        const [cid, sk] = k.split(":"), c = S.chars[cid];
        if (!c) continue;
        c.xp[sk] = (c.xp[sk] || 0) + Math.min(3, n);
        const need = (c.skills[sk] + 1) * 4;
        if (c.xp[sk] >= need && c.skills[sk] < 10) { c.xp[sk] -= need; c.skills[sk]++; out.ups.push(`${c.name.split(" ")[0]}: ${PM.SKILL_NAME[sk]} ${c.skills[sk]}`); }
      }
    }
    delete S.bat;
    return out;
  };
})();
