/* PumaMech -- a fight on the screen: giving orders, and watching the round.
 *
 * Orders, one unit of yours at a time: first where it goes (the tiles it
 * can reach are lit: green to walk, amber to run, blue to jump), then what
 * it does there (the cursor jumps to targets it could hit, and the target
 * card shows the chance for every weapon). Then the enemy decides and the
 * round plays: everyone moves, then the shooting, beat by beat. */
"use strict";
(() => {
  const C = PM.Combat, G = PM.Game, R = PM.Render, UI = PM.UI, esc = PM.esc, K = PM.K, TS = K.TS;
  const Bt = PM.Battle = { B: null, S: null, ui: null };
  const $ = id => document.getElementById(id);
  const speed = () => [1.5, 1, 0.6][PM.prefs.speed ?? 1];
  const wait = ms => new Promise(r => setTimeout(r, ms * speed()));

  Bt.begin = (S, B, onEnd) => {
    Bt.S = S; Bt.B = B; Bt.onEnd = onEnd;
    R.disp.clear(); R.fx = [];
    for (const u of B.units) R.disp.set(u.id, { x: u.x, y: u.y, f: u.f, out: u.out });
    Bt.ui = { step: "intro", cur: null, cursor: [B.units[0].x, B.units[0].y], mode: "walk", reach: null, dest: null, targets: [], ti: 0, wsel: "all", focus: [B.units[0].x, B.units[0].y], snap: true, done: [] };
    Bt.hud();
    PM.SFX.play("alert");
    setTimeout(() => Bt.nextRound(), 500 * speed());
  };

  /* ---- the round ---- */
  Bt.nextRound = async () => {
    const S = Bt.S, B = Bt.B;
    const hook = PM.Story.roundHook(S, B);
    if (hook.length) { Bt.ui.step = "play"; Bt.hud(); await Bt.play(hook); C.checkEnd(S, B); if (B.result) return Bt.end(); }
    Bt.ui.step = "orders"; Bt.ui.done = [];
    Bt.pickNext();
  };
  const pending = () => C.live(Bt.B).filter(u => u.side === 0 && !u.order);
  Bt.pickNext = () => {
    const u = pending()[0];
    if (!u) return Bt.resolve();
    const ui = Bt.ui;
    ui.cur = u.id; ui.mode = "walk"; ui.dest = null; ui.step = "move"; ui.cursor = [u.x, u.y]; ui.focus = [u.x, u.y]; ui.wsel = "all";
    ui.reach = C.reach(Bt.B, u, "walk");
    ui.reachRun = C.isMech(u) || u.move ? C.reach(Bt.B, u, "run") : null;
    Bt.hud();
  };
  const cur = () => C.unit(Bt.B, Bt.ui.cur);

  /* ---- input during orders ---- */
  Bt.key = ev => {
    const ui = Bt.ui, u = cur(), k = ev.key.length === 1 ? ev.key.toLowerCase() : ev.key;
    if (ui.step !== "move" && ui.step !== "act") return false;
    const arrow = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] }[k];
    if (arrow) {
      const B = Bt.B;
      ui.cursor = [Math.max(B.ax, Math.min(B.ax + B.aw - 1, ui.cursor[0] + arrow[0])), Math.max(B.ay, Math.min(B.ay + B.ah - 1, ui.cursor[1] + arrow[1]))];
      if (ui.step === "act") { const t = Bt.B.units.find(w => !w.out && w.x === ui.cursor[0] && w.y === ui.cursor[1]); if (t) { const i = ui.targets.indexOf(t); if (i >= 0) ui.ti = i; } }
      ui.focus = ui.cursor.slice();
      PM.SFX.play("select"); Bt.hud(); return true;
    }
    if (ui.step === "move") {
      if (k === "Enter") { Bt.chooseDest(ui.cursor); return true; }
      if (k === " ") { Bt.chooseDest([u.x, u.y]); return true; }
      if (k === "r") { ui.mode = ui.mode === "run" ? "walk" : "run"; ui.reach = C.reach(Bt.B, u, ui.mode); Bt.hud(); return true; }
      if (k === "j") { if (C.isMech(u) && C.mp(u, "jump") > 0) { ui.mode = ui.mode === "jump" ? "walk" : "jump"; ui.reach = C.reach(Bt.B, u, ui.mode); Bt.hud(); } else PM.HUD.toast("No jump jets", "", 1200); return true; }
      if (k === "a") { u.order = PM.AI.orderFor(Bt.S, Bt.B, u); PM.SFX.play("menu"); Bt.pickNext(); return true; }
      if (k === "q") { Bt.retreat(); return true; }
      if (k === "Escape") { Bt.undo(); return true; }
    } else {
      if (k === "Enter") { const t = ui.targets[ui.ti]; if (t && Bt.inSight(u, t)) Bt.give("fire", t); else if (t && t.side === 0) Bt.give("medkit", t); else PM.HUD.toast("Nothing in range there", "", 1200); return true; }
      if (k === "Tab" || k === "]" || k === "[") { if (ui.targets.length) { ui.ti = (ui.ti + (k === "[" || ev.shiftKey ? -1 : 1) + ui.targets.length) % ui.targets.length; const t = ui.targets[ui.ti]; ui.cursor = [t.x, t.y]; ui.focus = [(t.x + ui.dest[0]) / 2, (t.y + ui.dest[1]) / 2]; Bt.hud(); } return true; }
      if (k === " ") { Bt.give(null); return true; }
      if (k === "d") { Bt.give("defend"); return true; }
      if (k === "f") { ui.wsel = ui.wsel === "all" ? "cool" : "all"; Bt.hud(); return true; }
      if (k === "k" || k === "u") { const t = ui.targets[ui.ti]; if (C.isMech(u) && t && t.side !== u.side && C.dist(ui.dest[0], ui.dest[1], t.x, t.y) <= 1) Bt.give(k === "k" ? "kick" : "punch", t); else PM.HUD.toast("Too far to reach", "", 1200); return true; }
      if (k === "x") { const t = ui.targets[ui.ti]; if (!C.isMech(u) && t && C.isMech(t) && C.dist(ui.dest[0], ui.dest[1], t.x, t.y) <= 1 && Bt.S.items.satchel > 0) Bt.give("satchel", t); else PM.HUD.toast(Bt.S.items.satchel > 0 ? "Get next to a mech first" : "No satchel charges", "", 1400); return true; }
      if (k === "h") {
        if (C.isMech(u) || !(Bt.S.items.medkit > 0)) { PM.HUD.toast("No medkit to hand", "", 1200); return true; }
        const t = Bt.B.units.find(w => !w.out && w.side === 0 && !C.isMech(w) && w.x === ui.cursor[0] && w.y === ui.cursor[1]) || u;
        if (C.dist(ui.dest[0], ui.dest[1], t.x, t.y) <= 1 || t === u) Bt.give("medkit", t); else PM.HUD.toast("Get next to them first", "", 1200);
        return true;
      }
      if (k === "a") { u.order = PM.AI.orderFor(Bt.S, Bt.B, u); Bt.pickNext(); return true; }
      if (k === "Escape") { ui.step = "move"; ui.dest = null; Bt.hud(); return true; }
    }
    return false;
  };
  /* the mouse: hover moves the cursor, a click chooses */
  Bt.point = (tx, ty, click) => {
    const ui = Bt.ui, B = Bt.B;
    if (ui.step !== "move" && ui.step !== "act") return;
    if (!C.inArena(B, tx, ty)) return;
    if (!click && ui.cursor[0] === tx && ui.cursor[1] === ty) return;
    ui.cursor = [tx, ty];
    if (ui.step === "act") { const t = B.units.find(w => !w.out && w.x === tx && w.y === ty); if (t && ui.targets.includes(t)) ui.ti = ui.targets.indexOf(t); }
    if (click) { if (ui.step === "move") Bt.chooseDest([tx, ty]); else { const t = B.units.find(w => !w.out && w.x === tx && w.y === ty); if (t && t.side !== cur().side && Bt.inSight(cur(), t)) Bt.give("fire", t); else if (t === cur()) Bt.give(null); } return; }
    Bt.hud();
  };
  Bt.chooseDest = ([x, y]) => {
    const ui = Bt.ui, u = cur(), v = ui.reach.get(x + "," + y);
    if (!v) { PM.HUD.toast(ui.mode === "walk" && ui.reachRun && ui.reachRun.get(x + "," + y) ? "Too far to walk: R to run" : "Can't get there this round", "", 1400); PM.SFX.play("empty"); return; }
    ui.dest = [x, y]; ui.path = C.pathTo(ui.reach, x, y);
    ui.step = "act";
    /* who it could do something to from there: enemies first, nearest first */
    const from = ui.dest;
    const foes = C.live(Bt.B).filter(t => t.side !== u.side).sort((a, b) => C.dist(from[0], from[1], a.x, a.y) - C.dist(from[0], from[1], b.x, b.y));
    ui.targets = foes;
    const inSight = foes.filter(t => Bt.inSight(u, t));
    ui.ti = inSight.length ? foes.indexOf(inSight[0]) : 0;
    const t = ui.targets[ui.ti];
    ui.cursor = t ? [t.x, t.y] : from;
    ui.focus = t ? [(t.x + from[0]) / 2, (t.y + from[1]) / 2] : from.slice();
    PM.SFX.play("menu");
    Bt.hud();
  };
  /* can it shoot t from where it will stand? */
  Bt.inSight = (u, t) => {
    const from = Bt.ui.dest || [u.x, u.y];
    if (C.isMech(u)) return C.weaponsAt(Bt.S, Bt.B, u, t, from).length > 0;
    const A = PM.ARMS[u.weapon] || PM.ARMS.fists, d = C.dist(from[0], from[1], t.x, t.y);
    return d <= A.range && (A.melee || C.los(Bt.B, from[0], from[1], t.x, t.y));
  };
  Bt.give = (act, t) => {
    const ui = Bt.ui, u = cur();
    u.order = { path: ui.path && ui.path.length > 1 ? ui.path : null, mode: ui.mode, act, target: t ? t.id : null, wsel: ui.wsel };
    ui.done.push(u.id);
    PM.SFX.play("menu");
    Bt.pickNext();
  };
  Bt.undo = () => {
    const ui = Bt.ui, last = ui.done.pop();
    if (last == null) return;
    const u = C.unit(Bt.B, last); u.order = null;
    Bt.pickNext();
  };
  Bt.retreat = async () => {
    if (Bt.B.noRetreat) { PM.HUD.toast("There's no breaking off from this one", "red", 1600); return; }
    if (!(await UI.ask("Every one of yours tries to break off this round. It may fail, and nobody shoots while they run.", "Retreat", "Retreat?", false))) return;
    for (const u of C.live(Bt.B)) if (u.side === 0) u.order = { path: null, act: "retreat" };
    Bt.resolve();
  };

  /* ---- the round plays ---- */
  Bt.resolve = async () => {
    const S = Bt.S, B = Bt.B;
    Bt.ui.step = "play"; Bt.ui.cur = null;
    PM.AI.orders(S, B, 1);
    const beats = C.resolve(S, B);
    Bt.hud();
    await Bt.play(beats);
    if (B.result) return Bt.end();
    Bt.nextRound();
  };
  const unitPos = id => { const d = R.disp.get(id); return d ? [d.x, d.y] : [0, 0]; };
  const heightOf = id => { const u = C.unit(Bt.B, id); return u && C.isMech(u) ? 24 : 10; };
  Bt.play = async beats => {
    const now = () => performance.now();
    for (let i = 0; i < beats.length; i++) {
      const b = beats[i];
      if (b.t === "move") {
        /* everyone's moves at once */
        let dur = 0;
        let j = i;
        while (j < beats.length && beats[j].t === "move") {
          const m = beats[j], d = R.disp.get(m.id), du = Math.max(1, m.path.length - 1) * 130 * speed() * (m.mode === "jump" ? 0.7 : 1);
          d.anim = { path: m.path, t0: now(), dur: du, jump: m.mode === "jump" };
          if (m.mode === "jump") PM.SFX.play("jump");
          dur = Math.max(dur, du); j++;
        }
        const ids = beats.slice(i, j).map(m => m.id);
        Bt.ui.focus = unitPos(ids[0]);
        PM.SFX.play("step");
        await new Promise(r => setTimeout(r, dur + 60));
        for (const id of ids) { const u = C.unit(Bt.B, id), d = R.disp.get(id); d.anim = null; d.x = u.x; d.y = u.y; d.f = u.f; }
        i = j - 1;
        continue;
      }
      if (b.t === "say") { Bt.log(b.text, b.k); await wait(b.k ? 380 : 160); continue; }
      if (b.t === "shot") { await shot(b); continue; }
      if (b.t === "boom") {
        const [x, y] = unitPos(b.id), d = R.disp.get(b.id);
        R.addFx({ t: "boom", x, y, r: b.big ? 22 : 12, t0: now(), dur: 1100 });
        PM.SFX.play("boom");
        if (b.wreck) { d.out = "destroyed"; R.addFx({ t: "smoke", x, y, t0: now() + 300, dur: 600000 }); }
        Bt.ui.focus = [x, y];
        await wait(420); continue;
      }
      if (b.t === "fall") { const d = R.disp.get(b.id); d.out = "dead"; PM.SFX.play("die"); await wait(200); continue; }
      if (b.t === "eject") { const d = R.disp.get(b.id), [x, y] = unitPos(b.id); d.out = "ejected"; R.addFx({ t: "float", x, y, text: "EJECT", col: "#9fcf88", t0: now(), dur: 1200 }); PM.SFX.play("jump"); await wait(300); continue; }
      if (b.t === "spawn") { const u = C.unit(Bt.B, b.id); R.disp.set(u.id, { x: u.x, y: u.y, f: u.f, flash: now() + 500 }); Bt.ui.focus = [u.x, u.y]; await wait(300); continue; }
      if (b.t === "heal") { const [x, y] = unitPos(b.id); R.addFx({ t: "float", x, y, text: "+" + b.n, col: "#9fcf88", t0: now(), dur: 1000 }); PM.SFX.play("pod"); await wait(250); continue; }
      if (b.t === "shut") { const [x, y] = unitPos(b.id); R.addFx({ t: "float", x, y, text: "HOT", col: "#e8a33d", t0: now(), dur: 1200 }); await wait(250); continue; }
      if (b.t === "end") continue;
    }
    for (const u of Bt.B.units) { const d = R.disp.get(u.id); if (d && !d.anim) { d.x = u.x; d.y = u.y; } }
  };
  const SHOT = {
    beam: { fx: "beam", ms: 230, snd: "laser" }, ion: { fx: "beam", ms: 320, snd: "ion" }, pbeam: { fx: "beam", ms: 180, snd: "laserS" },
    shell: { fx: "bolt", ms: 220, snd: "cannon", size: 3 }, gun: { fx: "bolt", ms: 140, snd: "shotP", n: 3 }, bullet: { fx: "bolt", ms: 150, snd: "shotE", n: 1 },
    rocket: { fx: "bolt", ms: 260, snd: "rocket", trail: 1, n: 3 }, missile: { fx: "bolt", ms: 420, snd: "rocket", trail: 1, n: 5, arc: 26 },
    flame: { fx: "bolt", ms: 200, snd: "flame", n: 4, col: "#ff9a3c" }, melee: { fx: "none", ms: 160, snd: "clang" }, satchel: { fx: "none", ms: 200, snd: "click" },
  };
  const shot = async b => {
    const now = performance.now(), sp = SHOT[b.kind] || SHOT.beam;
    const [x0, y0] = unitPos(b.from), [x1, y1] = unitPos(b.to), h0 = heightOf(b.from) * 0.7, h1 = heightOf(b.to) * 0.5;
    const da = R.disp.get(b.from); if (da && !(x0 === x1 && y0 === y1)) da.f = C.dirTo(x0, y0, x1, y1);
    const mx = b.hit ? 0 : (Math.random() - 0.5) * 30, my = b.hit ? 0 : (Math.random() - 0.5) * 18;
    Bt.ui.focus = [(x0 + x1) / 2, (y0 + y1) / 2];
    if (sp.fx === "beam") R.addFx({ t: "beam", kind: b.kind, x0, y0, x1, y1, h0, h1, hit: b.hit, mx, my, t0: now, dur: sp.ms * speed() });
    else if (sp.fx === "bolt") for (let i = 0; i < (sp.n || 1); i++) R.addFx({ t: "bolt", x0, y0, x1, y1, h0, h1, hit: b.hit, mx: mx + (i ? (Math.random() - 0.5) * 10 : 0), my: my + (i ? (Math.random() - 0.5) * 8 : 0), arc: sp.arc, trail: sp.trail, col: sp.col || (b.kind === "shell" ? "#ffe0a0" : b.kind === "rocket" || b.kind === "missile" ? "#e9e4d8" : "#fff2a8"), size: sp.size, t0: now + i * 60 * speed(), dur: sp.ms * speed() });
    PM.SFX.play(sp.snd);
    await wait(sp.ms + (sp.n ? sp.n * 40 : 0));
    if (b.hit) {
      const d = R.disp.get(b.to); if (d) d.flash = performance.now() + 140;
      R.addFx({ t: "spark", x: x1, y: y1, h: h1, t0: performance.now(), dur: 260 });
      if (PM.prefs.numbers && b.dmg) R.addFx({ t: "float", x: x1, y: y1, text: String(b.dmg), col: "#ffffff", t0: performance.now(), dur: 900 });
      PM.SFX.play(C.isMech(C.unit(Bt.B, b.to)) ? "armor" : "wound");
    } else if (PM.prefs.numbers) R.addFx({ t: "float", x: x1, y: y1, text: "MISS", col: "#aaa69c", t0: performance.now(), dur: 700 });
    await wait(90);
  };
  Bt.log = (text, k) => {
    const el = $("b-log");
    const live = $("live"); if (live) live.textContent = text;
    if (!el) return;
    const p = document.createElement("p"); p.className = k || ""; p.textContent = text;
    el.appendChild(p);
    while (el.children.length > 5) el.firstChild.remove();
  };

  Bt.end = async () => {
    const S = Bt.S, B = Bt.B;
    Bt.ui.step = "over"; Bt.hud();
    await wait(500);
    PM.SFX.play(B.result === "won" ? "goal" : "fail");
    const onEnd = Bt.onEnd;
    Bt.B = null;
    onEnd(B);
  };

  /* ---- what the battle draws: under the units, on the units, over them ---- */
  Bt.view = () => {
    const B = Bt.B, ui = Bt.ui;
    if (!B) return null;
    return {
      S: Bt.S, B, focus: ui.focus, snap: ui.snap && !(ui.snap = false),
      ground: (g, cx, cy) => {
        /* outside the arena, darker */
        g.fillStyle = "rgba(12,13,17,.42)";
        const ax = B.ax * TS - cx, ay = B.ay * TS - cy, aw = B.aw * TS, ah = B.ah * TS;
        g.fillRect(0, 0, K.VW, Math.max(0, ay)); g.fillRect(0, ay + ah, K.VW, K.VH); g.fillRect(0, ay, Math.max(0, ax), ah); g.fillRect(ax + aw, ay, K.VW, ah);
        if (ui.step === "move" && ui.reach) {
          const col = ui.mode === "run" ? "255,196,92" : ui.mode === "jump" ? "140,200,255" : "236,248,214";
          for (const [, v] of ui.reach) {
            const x = v.x * TS - cx, y = v.y * TS - cy;
            g.fillStyle = 'rgba(248,250,240,.16)'; g.fillRect(x + 1, y + 1, TS - 2, TS - 2);
            g.fillStyle = `rgba(${col},.95)`;
            if (!ui.reach.has(v.x + ',' + (v.y - 1))) g.fillRect(x, y, TS, 1);
            if (!ui.reach.has(v.x + ',' + (v.y + 1))) g.fillRect(x, y + TS - 1, TS, 1);
            if (!ui.reach.has((v.x - 1) + ',' + v.y)) g.fillRect(x, y, 1, TS);
            if (!ui.reach.has((v.x + 1) + ',' + v.y)) g.fillRect(x + TS - 1, y, 1, TS);
          }
          const p = C.pathTo(ui.reach, ui.cursor[0], ui.cursor[1]);
          if (p) for (const [x, y] of p.slice(1)) { g.fillStyle = "#f2f6ec"; g.fillRect(x * TS - cx + 10, y * TS - cy + 10, 4, 4); }
        }
        /* the planned moves of those already given orders */
        for (const u of B.units) if (!u.out && u.side === 0 && u.order && u.order.path) for (const [x, y] of u.order.path.slice(1)) { g.fillStyle = "rgba(242,246,236,.45)"; g.fillRect(x * TS - cx + 11, y * TS - cy + 11, 2, 2); }
        if (ui.step === "act" && ui.dest) { g.strokeStyle = "rgba(242,246,236,.8)"; g.lineWidth = 1; g.strokeRect(ui.dest[0] * TS - cx + 2.5, ui.dest[1] * TS - cy + 2.5, TS - 5, TS - 5); }
      },
      unitMark: (g, u, x, y, c) => {
        const d = R.disp.get(u.id);
        if (!d || d.out) return;
        const top = y - (c.ay || c.height) - 4, w = 16;
        /* a ring under the one giving orders */
        if (ui.cur === u.id && (ui.step === "move" || ui.step === "act")) { g.strokeStyle = (R.frame >> 4) & 1 ? "#9fcf88" : "#7fb069"; g.lineWidth = 1; g.beginPath(); g.ellipse(x + 0.5, y + 1.5, 11, 5, 0, 0, Math.PI * 2); g.stroke(); }
        /* health, over each head: your side green-edged, theirs red */
        let f;
        if (C.isMech(u)) { const mx = G.mechMax(u.m); f = (u.m.struct.CT + u.m.armor.CT) / (mx.struct.CT + mx.armor.CT); }
        else f = Math.max(0, u.hp) / u.hpMax;
        if (ui.step === "move" || ui.step === "act" || ui.step === "intro") {
          g.fillStyle = "#14161c"; g.fillRect(x - w / 2 - 1, top - 1, w + 2, 4);
          g.fillStyle = f > 0.66 ? "#7fb069" : f > 0.33 ? "#e8a33d" : "#e4572e"; g.fillRect(x - w / 2, top, Math.max(1, Math.round(w * f)), 2);
          g.fillStyle = u.side === 0 ? "#9fcf88" : "#ff7a5c"; g.fillRect(x - w / 2 - 3, top - 1, 2, 4);
          if (u.order && u.side === 0) { g.fillStyle = "#f2f6ec"; g.fillRect(x + w / 2 + 2, top - 1, 2, 2); }
        }
      },
      air: (g, cx, cy) => {
        if (ui.step !== "move" && ui.step !== "act") return;
        const [x, y] = ui.cursor, sx = x * TS - cx, sy = y * TS - cy, L = 6, col = ui.step === "act" ? "#ff7a5c" : "#f2f6ec";
        g.fillStyle = "#14161c";
        for (const [ox, oy, dx, dy] of [[0, 0, 1, 1], [TS, 0, -1, 1], [0, TS, 1, -1], [TS, TS, -1, -1]]) { g.fillRect(sx + ox + (dx < 0 ? -L : 0), sy + oy + (dy < 0 ? -2 : 0) + 1, L, 2); g.fillRect(sx + ox + (dx < 0 ? -2 : 0) + 1, sy + oy + (dy < 0 ? -L : 0), 2, L); }
        g.fillStyle = col;
        for (const [ox, oy, dx, dy] of [[0, 0, 1, 1], [TS, 0, -1, 1], [0, TS, 1, -1], [TS, TS, -1, -1]]) { g.fillRect(sx + ox + (dx < 0 ? -L : 0), sy + oy + (dy < 0 ? -1 : 0), L, 1); g.fillRect(sx + ox + (dx < 0 ? -1 : 0), sy + oy + (dy < 0 ? -L : 0), 1, L); }
      },
    };
  };

  /* ---- the panels ---- */
  Bt.hud = () => {
    const el = $("hud"), B = Bt.B, S = Bt.S, ui = Bt.ui;
    if (!el || !B) return;
    const u = cur();
    let tgt = null;
    if (ui.step === "act") tgt = ui.targets[ui.ti];
    else if (ui.step === "move") tgt = B.units.find(w => !w.out && w.side === 1 && w.x === ui.cursor[0] && w.y === ui.cursor[1]);
    const mine = C.live(B).filter(w => w.side === 0), idx = u ? mine.indexOf(u) + 1 : 0;
    const phase = ui.step === "move" ? "Move" : ui.step === "act" ? "Act" : ui.step === "play" ? "Fire" : ui.step === "over" ? (B.result === "won" ? "Won" : B.result === "fled" ? "Broke off" : "Lost") : "Contact";
    const keys = ui.step === "move" ? `<kbd>↑↓←→</kbd> where <kbd>Enter</kbd> go <kbd>Space</kbd> stay <kbd>R</kbd> ${ui.mode === "run" ? "walk" : "run"}${u && C.isMech(u) && C.mp(u, "jump") ? ` <kbd>J</kbd> jump` : ""} <kbd>A</kbd> auto <kbd>Q</kbd> retreat${ui.done.length ? " <kbd>Esc</kbd> undo" : ""}`
      : ui.step === "act" ? `<kbd>Tab</kbd> target <kbd>Enter</kbd> fire${u && C.isMech(u) ? ` <kbd>F</kbd> ${ui.wsel === "all" ? "everything" : "cool only"} <kbd>K</kbd> kick <kbd>U</kbd> punch` : ` <kbd>H</kbd> medkit <kbd>X</kbd> satchel`} <kbd>D</kbd> cover <kbd>Space</kbd> nothing <kbd>Esc</kbd> back`
      : "";
    const vs = ui.step === "act" && tgt && tgt.side !== (u && u.side) ? tgt : null;
    const sel = u && C.isMech(u) && vs && ui.wsel === "cool" ? C.coolSet(u, C.weaponsAt(S, B, u, vs, ui.dest), C.moveHeat(ui.mode, ui.path ? ui.path.length - 1 : 0)).map(x => x.i) : null;
    el.innerHTML = `
      ${u && (ui.step === "move" || ui.step === "act") ? `<div class="hp b-card" id="b-active">${PM.HUD.unitCard(S, B, u, { vs: PM.prefs.odds ? vs : null, from: ui.dest, sel })}</div>` : ""}
      ${tgt && (ui.step === "move" || ui.step === "act") ? `<div class="hp b-card" id="b-target">${PM.HUD.unitCard(S, B, tgt)}</div>` : ""}
      <div class="hp h-pill" id="b-round"><span class="lbl">Round</span><span class="num">${B.round}</span><span class="h-sep"></span><span class="h-state">${phase}</span>${u && ui.step !== "play" ? `<span class="b-who">${esc(u.name)}${mine.length > 1 ? ` <i>${idx} of ${mine.length}</i>` : ""}</span>` : ""}</div>
      <div class="hp" id="b-log">${B.log.slice(-5).map(t => `<p>${esc(t)}</p>`).join("")}</div>
      ${keys ? `<div class="hp h-pill h-hint" id="b-keys">${keys}</div>` : ""}
      <div class="h-toasts"></div>`;
  };
})();
