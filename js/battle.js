/* PumaMech -- a fight on the screen: giving orders, and watching the round.
 *
 * It opens on the enemy, then comes back to yours. Orders, one unit of
 * yours at a time, as the 1988 game gave them. First the route: the tiles
 * it can reach this round are outlined (bone to walk, amber to run, blue to
 * jump); Enter lays a leg to the cursor and the next leg starts from there,
 * so a unit can zig-zag; a leg past this round's reach is drawn amber and
 * carries into the next round. Then the aims: Enter puts every weapon on
 * the enemy under the cursor, a number puts one weapon on it (or takes it
 * off). Aims hold from round to round until the target is gone, and a route
 * carries on, so a round where nothing changes is just G. Then the enemy
 * decides and the round plays: everyone walks at once, each weapon fires on
 * its own when its moment comes (js/engine/combat.js), and the cadet sums
 * it up in the log. Space hurries a round along. */
"use strict";
(() => {
  const C = PM.Combat, G = PM.Game, R = PM.Render, UI = PM.UI, esc = PM.esc, K = PM.K, TS = K.TS;
  const Bt = PM.Battle = { B: null, S: null, ui: null, fast: false };
  const $ = id => document.getElementById(id);
  const speed = () => [1.5, 1, 0.6][PM.prefs.speed ?? 1] * (Bt.fast ? 0.25 : 1);
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const wait = ms => sleep(ms * speed());
  /* the round's own clock: it runs while units walk and stands still while a volley plays */
  const clock = { t: 0, run: false, at: 0 };
  Bt.now = () => clock.run ? clock.t + performance.now() - clock.at : clock.t;
  const advance = async ms => { clock.at = performance.now(); clock.run = true; await sleep(ms); clock.t += performance.now() - clock.at; clock.run = false; };
  const STEP_MS = 150;
  /* for a screen reader: what the eye gets from the field */
  Bt.announce = text => { const live = $("live"); if (live) live.textContent = text; };
  const first = u => u.cid && Bt.S.chars[u.cid] ? Bt.S.chars[u.cid].name.split(" ")[0] : u.name;
  const andList = a => a.length > 1 ? a.slice(0, -1).join(", ") + " and " + a[a.length - 1] : a[0] || "";
  const NUM = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
  const plural = w => /[^aeiou]y$/.test(w) ? w.slice(0, -1) + "ies" : w.endsWith("s") ? w : w + "s";
  const count = (n, word) => `${NUM[n] || n} ${n === 1 ? word : plural(word)}`;
  /* "Scrub drake" reads "scrub drake" mid-sentence; the Pact and the Founders keep their capitals */
  const midSentence = name => /^(Pact|Founders)/.test(name) ? name : name[0].toLowerCase() + name.slice(1);
  /* a line in the log: kept with its colour, shown at once */
  const note = (text, k = "") => { Bt.B.log.push({ text, k }); Bt.log(text, k); };

  Bt.begin = (S, B, onEnd) => {
    Bt.S = S; Bt.B = B; Bt.onEnd = onEnd; Bt.fast = false;
    R.disp.clear(); R.fx = [];
    for (const u of B.units) R.disp.set(u.id, { x: u.x, y: u.y, f: u.f, out: u.out });
    /* the opening shot: on the enemy */
    const foes = C.live(B).filter(u => u.side === 1), at = mid(foes.map(u => [u.x, u.y])) || [B.units[0].x, B.units[0].y];
    Bt.ui = { step: "intro", cur: null, cursor: at.map(Math.round), mode: "walk", plan: null, legs: [], reach: null, far: null, aim: [], act: null, targets: [], ti: 0, focus: at, snap: true, done: [], round: null, heard: null };
    Bt.hud();
    /* the cadet's first look at them, and names for the mechs */
    const mechs = foes.filter(C.isMech), named = mechs.filter(u => C.NICKS.includes(u.name)), rest = {};
    for (const u of foes) if (!C.isMech(u)) rest[u.name] = (rest[u.name] || 0) + 1;
    const what = [mechs.length ? count(mechs.length, "mech") : null, ...Object.entries(rest).map(([n, c]) => count(c, midSentence(n)))].filter(Boolean);
    note(`Contact: ${andList(what)}.${named.length ? ` Calling ${named.length < mechs.length || what.length > 1 ? (named.length === 1 ? "the mech" : "the mechs") : named.length === 1 ? "it" : "them"} ${andList(named.map(u => u.name))}.` : ""}`, "warn");
    if (!S.flags.fightTips) {
      S.flags.fightTips = true;
      note("Sergeant Dorran's drill: a route for each of yours, then a target for each gun. The guns fire themselves once they're close. G when you're done.", "tip");
    }
    PM.SFX.play("alert");
    setTimeout(() => Bt.nextRound(), 1300 * speed());
  };

  /* ---- the round ---- */
  Bt.nextRound = async () => {
    const S = Bt.S, B = Bt.B;
    Bt.fast = false; Bt.ui.round = null;
    const hook = PM.Story.roundHook(S, B);
    if (hook.length) { Bt.ui.step = "play"; Bt.hud(); await Bt.play(hook); Bt.fast = false; C.checkEnd(S, B); if (B.result) return Bt.end(); }
    Bt.ui.step = "orders"; Bt.ui.done = [];
    Bt.pickNext();
  };
  const pending = () => C.live(Bt.B).filter(u => u.side === 0 && !Bt.ui.done.includes(u.id));
  Bt.pickNext = () => {
    const u = pending()[0];
    if (!u) return Bt.resolve();
    Bt.select(u);
  };
  const cur = () => C.unit(Bt.B, Bt.ui.cur);
  /* a unit's orders as they stand: what it was told this round, else what carries over
   * (a carried route that would end on someone now standing there stops short of them) */
  const standing = u => {
    if (u.order) return { plan: u.order.path || [[u.x, u.y]], mode: u.order.mode || "walk", act: u.order.act ? { act: u.order.act, target: u.order.target } : null };
    let plan = u.carry && u.carry[0][0] === u.x && u.carry[0][1] === u.y ? u.carry.slice() : [[u.x, u.y]];
    while (plan.length > 1 && Bt.B.units.some(w => !w.out && w !== u && w.x === plan[plan.length - 1][0] && w.y === plan[plan.length - 1][1])) plan.pop();
    return { plan, mode: u.carry ? u.carryMode || "walk" : "walk", act: null };
  };
  /* nothing plotted, nothing aimed, nothing else: such a unit is left to the computer when you fight */
  const idle = (plan, aim, act) => plan.length < 2 && aim.every(id => id == null) && !act;
  Bt.select = u => {
    const ui = Bt.ui, st = standing(u);
    ui.cur = u.id; ui.step = "move"; ui.plan = st.plan; ui.legs = st.plan.length > 1 ? [st.plan.length - 1] : []; ui.mode = st.mode; ui.act = st.act;
    if (ui.mode === "jump" && !(C.isMech(u) && C.mp(u, "jump") > 0)) { ui.mode = "walk"; ui.plan = [[u.x, u.y]]; ui.legs = []; }
    ui.aim = C.aims(u).slice();
    const end = planEnd();
    ui.cursor = end.slice(); ui.focus = end.slice();
    Bt.reachFrom();
    Bt.hud();
    Bt.announce(`Round ${Bt.B.round}. ${u.name}: route. ${C.mp(u, "walk")} to walk${ui.plan.length > 1 ? ", carrying on from last round" : ""}.`);
  };
  const planEnd = () => Bt.ui.plan[Bt.ui.plan.length - 1];
  /* what the plotted route costs, and what can still be reached from its end, this round and past it */
  const planCost = (u, plan, mode) => { let c = 0; for (let i = 1; i < plan.length; i++) c += mode === "jump" ? C.dist(plan[i - 1][0], plan[i - 1][1], plan[i][0], plan[i][1]) : C.cost(Bt.B, u, plan[i][0], plan[i][1]); return c; };
  Bt.reachFrom = () => {
    const ui = Bt.ui, u = cur(), [ex, ey] = planEnd(), left = C.mp(u, ui.mode) - planCost(u, ui.plan, ui.mode);
    ui.reach = left > 0 && (ui.mode !== "jump" || ui.plan.length === 1) ? C.reach(Bt.B, u, ui.mode, ex, ey, left) : new Map([[ex + "," + ey, { c: 0, p: null, x: ex, y: ey }]]);
    ui.far = ui.mode === "jump" || C.mp(u, ui.mode) <= 0 ? null : C.reach(Bt.B, u, ui.mode, ex, ey, 60);
  };
  /* the way to the cursor from the end of the route: this round's (lit), or past it (amber) */
  const legTo = (x, y) => {
    const ui = Bt.ui, k = x + "," + y;
    if (ui.reach.has(k)) return { path: C.pathTo(ui.reach, x, y), later: false };
    if (ui.far && ui.far.has(k)) return { path: C.pathTo(ui.far, x, y), later: true };
    return null;
  };
  /* why a tile can't be reached, in a word the player can act on */
  const BLOCK = { [PM.T.ROCK]: "a boulder", [PM.T.WALL]: "a wall", [PM.T.HWALL]: "a building", [PM.T.BLDG]: "a building", [PM.T.VWALL]: "the Vault's wall", [PM.T.FENCE]: "a fence", [PM.T.BAD]: "broken ground", [PM.T.THIN]: "thin ice", [PM.T.TRAP]: "tank traps", [PM.T.WIRE]: "barbed wire", [PM.T.WATER]: "deep water", [PM.T.TREE]: "the trees", [PM.T.PIPE]: "a pipeline" };
  const whyNot = (u, x, y) => {
    const B = Bt.B, ui = Bt.ui;
    if (!C.inArena(B, x, y)) return "That's outside the fight";
    if (C.mp(u, ui.mode) <= 0) return u.shut > 0 ? "It's shut down this round" : "It can't move";
    const w = B.units.find(v => !v.out && v !== u && v.x === x && v.y === y);
    if (w) return w.side === u.side ? `${first(w)}'s standing there` : `${w.name}'s standing there`;
    if (!C.cost(B, u, x, y)) return `There's ${BLOCK[PM.tileAt(PM.getMap(B.map), x, y)] || "something"} in the way`;
    if (ui.mode === "jump") return ui.plan.length > 1 ? "One jump a round" : `Too far to jump: ${C.mp(u, "jump")} at most`;
    return "No way through from here";
  };

  /* ---- input during orders ---- */
  Bt.key = ev => {
    const ui = Bt.ui, u = cur(), k = ev.key.length === 1 ? ev.key.toLowerCase() : ev.key;
    /* while a round plays: Space or Enter hurries it */
    if (ui.step === "play" || ui.step === "intro") { if (k === " " || k === "Enter") { if (!Bt.fast) { Bt.fast = true; Bt.hud(); } return true; } return false; }
    if (ui.step !== "move" && ui.step !== "aim") return false;
    const arrow = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] }[k];
    if (arrow) {
      const B = Bt.B;
      ui.cursor = [Math.max(B.ax, Math.min(B.ax + B.aw - 1, ui.cursor[0] + arrow[0])), Math.max(B.ay, Math.min(B.ay + B.ah - 1, ui.cursor[1] + arrow[1]))];
      if (ui.step === "aim") { const t = Bt.B.units.find(w => !w.out && w.x === ui.cursor[0] && w.y === ui.cursor[1]); if (t) { const i = ui.targets.indexOf(t); if (i >= 0) ui.ti = i; } }
      ui.focus = ui.cursor.slice();
      PM.SFX.play("select"); Bt.hud(); hear(); return true;
    }
    if (k === "g") { Bt.go(); return true; }
    if (k === "a") { PM.AI.give(u, PM.AI.orderFor(Bt.S, Bt.B, u)); if (!ui.done.includes(u.id)) ui.done.push(u.id); PM.SFX.play("menu"); Bt.pickNext(); return true; }
    if (k === "q") { Bt.retreat(); return true; }
    if (ui.step === "move") {
      if (k === "Enter") { Bt.leg(ui.cursor); return true; }
      if (k === " ") { Bt.aimStep(); return true; }
      if (k === "Backspace" || k === "Delete") { ui.plan = [[u.x, u.y]]; ui.legs = []; Bt.reachFrom(); PM.SFX.play("select"); Bt.hud(); Bt.announce("Route cleared: it stays put."); return true; }
      if (k === "r") { Bt.setMode(ui.mode === "run" ? "walk" : "run"); return true; }
      if (k === "j") { if (C.isMech(u) && C.mp(u, "jump") > 0) Bt.setMode(ui.mode === "jump" ? "walk" : "jump"); else toast(C.isMech(u) ? "This one has no jump jets" : "Only mechs with jump jets can jump"); return true; }
      if (k === "Escape") { if (ui.legs.length) Bt.unleg(); else Bt.undo(); return true; }
    } else {
      const t = Bt.B.units.find(w => !w.out && w.x === ui.cursor[0] && w.y === ui.cursor[1]);
      const foe = t && t.side !== u.side ? t : null;
      if (k === "Enter") { if (foe) Bt.aimAll(foe); else toast("Put the cursor on an enemy first: Tab finds one"); return true; }
      if (/^[1-9]$/.test(k)) { Bt.aimOne(+k - 1, foe); return true; }
      if (k === "0") { ui.aim = ui.aim.map(() => null); PM.SFX.play("select"); Bt.hud(); Bt.announce("Every weapon holding fire."); return true; }
      if (k === "Tab" || k === "]" || k === "[") { if (ui.targets.length) { ui.ti = (ui.ti + (k === "[" || ev.shiftKey ? -1 : 1) + ui.targets.length) % ui.targets.length; const n = ui.targets[ui.ti]; ui.cursor = [n.x, n.y]; ui.focus = [(n.x + planEnd()[0]) / 2, (n.y + planEnd()[1]) / 2]; Bt.hud(); hear(); } return true; }
      if (k === " ") { Bt.give(); return true; }
      if (k === "k" || k === "u") {
        if (!C.isMech(u)) toast("Kicks and punches are for mechs");
        else if (!foe) toast("Put the cursor on an enemy first");
        else if (!closeBy(u, foe)) toast(`This route never gets next to ${foe.name}`);
        else Bt.setAct(k === "k" ? "kick" : "punch", foe);
        return true;
      }
      if (k === "x") {
        if (C.isMech(u)) toast("Satchel charges are for people on foot");
        else if (!(Bt.S.items.satchel > 0)) toast("No satchel charges left");
        else if (!foe || !C.isMech(foe)) toast("Put the cursor on an enemy mech first");
        else if (!closeBy(u, foe)) toast(`This route never gets next to ${foe.name}`);
        else Bt.setAct("satchel", foe);
        return true;
      }
      if (k === "h") {
        if (C.isMech(u) || !(Bt.S.items.medkit > 0)) { toast(C.isMech(u) ? "Medkits are for people on foot" : "No medkits left"); return true; }
        const f = t && t.side === 0 && !C.isMech(t) ? t : u;
        Bt.setAct("medkit", f); return true;
      }
      if (k === "d") { if (C.isMech(u)) toast("A mech's cover is moving: plot a longer route"); else Bt.setAct("cover", u); return true; }
      if (k === "Escape") { ui.step = "move"; ui.cursor = planEnd().slice(); Bt.hud(); Bt.announce(`${u.name}: route.`); return true; }
    }
    return false;
  };
  const toast = text => { PM.HUD.toast(text, "", 2400); PM.SFX.play("empty"); };
  /* does this route ever take it next to t (if t stands still)? */
  const closeBy = (u, t) => C.track(Bt.B, u, Bt.ui.plan, Bt.ui.mode).some(([x, y]) => C.dist(x, y, t.x, t.y) <= 1);
  /* say what is under the cursor, once each time it changes */
  const hear = () => {
    const ui = Bt.ui, B = Bt.B, t = B.units.find(w => !w.out && w.x === ui.cursor[0] && w.y === ui.cursor[1]), key = t ? t.id : null;
    if (key === ui.heard) return;
    ui.heard = key;
    if (!t) return;
    const u = cur(), d = C.dist(ui.cursor[0], ui.cursor[1], u.x, u.y);
    Bt.announce(t.side === 1 ? `${Bt.tag(t)}: ${t.name}, ${C.isMech(t) ? PM.CHASSIS[t.m.ch].name : "on foot"}, ${d} tiles away.` : t === u ? `${u.name}, giving orders.` : `${t.name}, yours.`);
  };
  /* the mouse: hover moves the cursor, a click chooses; a click on another of yours gives it the orders */
  Bt.point = (tx, ty, click) => {
    const ui = Bt.ui, B = Bt.B;
    if (ui.step !== "move" && ui.step !== "aim") return;
    if (!C.inArena(B, tx, ty)) return;
    if (!click && ui.cursor[0] === tx && ui.cursor[1] === ty) return;
    ui.cursor = [tx, ty];
    const t = B.units.find(w => !w.out && w.x === tx && w.y === ty);
    if (ui.step === "aim" && t && ui.targets.includes(t)) ui.ti = ui.targets.indexOf(t);
    if (click) {
      const u = cur();
      if (t && t.side === 0 && t !== u) { Bt.switchTo(t); return; }
      if (ui.step === "move") { if (t === u && ui.plan.length === 1) Bt.aimStep(); else Bt.leg([tx, ty]); }
      else if (t && t.side !== u.side) Bt.aimAll(t);
      else if (t === u) Bt.give();
      return;
    }
    Bt.hud(); hear();
  };
  /* walking and running share a route (only the reach differs); a jump is its own */
  Bt.setMode = mode => {
    const ui = Bt.ui, u = cur(), was = ui.mode;
    ui.mode = mode;
    if (mode === "jump" || was === "jump") { ui.plan = [[u.x, u.y]]; ui.legs = []; }
    Bt.reachFrom(); PM.SFX.play("select"); Bt.hud();
    Bt.announce(`${mode === "run" ? "Running" : mode === "jump" ? "Jumping" : "Walking"}: ${C.mp(u, mode)} tiles this round.`);
  };
  /* a leg of the route, from its end to (x, y); on the end itself, the route is done */
  Bt.leg = ([x, y]) => {
    const ui = Bt.ui, u = cur(), [ex, ey] = planEnd();
    if (x === ex && y === ey) { Bt.aimStep(); return; }
    const l = legTo(x, y);
    if (!l) { toast(whyNot(u, x, y)); return; }
    ui.plan = ui.plan.concat(l.path.slice(1)); ui.legs.push(ui.plan.length - 1);
    Bt.reachFrom();
    PM.SFX.play("menu");
    Bt.announce(l.later ? "Leg laid; part of it carries into next round." : "Leg laid.");
    if (ui.mode === "jump") { Bt.aimStep(); return; }
    Bt.hud();
  };
  Bt.unleg = () => {
    const ui = Bt.ui;
    ui.legs.pop();
    ui.plan = ui.plan.slice(0, (ui.legs[ui.legs.length - 1] ?? 0) + 1);
    Bt.reachFrom(); ui.cursor = planEnd().slice(); PM.SFX.play("select"); Bt.hud();
  };
  /* where the route has it at the end of this round */
  const roundEnd = (u = cur()) => { const tm = C.timing(Bt.B, u, Bt.ui.plan, Bt.ui.mode); return tm.tiles[tm.tiles.length - 1]; };
  /* the enemy in letter order, which is the order Tab takes them in */
  const foesByTag = () => C.live(Bt.B).filter(t => t.side === 1).sort((a, b) => Bt.tag(a).localeCompare(Bt.tag(b)));
  Bt.aimStep = () => {
    const ui = Bt.ui, u = cur(), from = roundEnd(u);
    ui.step = "aim";
    /* the cursor starts on one it already aims at, or the nearest it can hit, or the nearest */
    const foes = foesByTag(), near = foes.slice().sort((a, b) => C.dist(from[0], from[1], a.x, a.y) - C.dist(from[0], from[1], b.x, b.y));
    ui.targets = foes;
    const aimed = near.find(t => ui.aim.includes(t.id)), canHit = near.find(t => ui.aim.some((_, i) => forecast(u, t, i)));
    ui.ti = Math.max(0, foes.indexOf(aimed || canHit || near[0]));
    const t = ui.targets[ui.ti];
    ui.cursor = t ? [t.x, t.y] : from.slice();
    ui.focus = t ? [(t.x + from[0]) / 2, (t.y + from[1]) / 2] : from.slice();
    PM.SFX.play("menu");
    Bt.hud();
    ui.heard = null; Bt.announce(`${u.name}: aiming.`); hear();
  };
  const forecast = (u, t, wi) => C.forecast(Bt.S, Bt.B, u, Bt.ui.plan, Bt.ui.mode, t, wi);
  const wname = (u, i) => C.isMech(u) ? PM.WEAPONS[u.m.wpn[i].w].name : C.arms(u).name;
  Bt.aimAll = t => {
    const ui = Bt.ui, u = cur();
    ui.aim = ui.aim.map((id, i) => !C.isMech(u) || C.armed(u.m.wpn[i]) ? t.id : id);
    PM.SFX.play("menu"); Bt.hud();
    Bt.announce(`Everything on ${Bt.tag(t)}, ${t.name}.`);
  };
  Bt.aimOne = (i, t) => {
    const ui = Bt.ui, u = cur();
    if (i >= ui.aim.length) return;
    if (C.isMech(u) && !C.armed(u.m.wpn[i])) { toast(u.m.wpn[i].dead ? "That weapon is gone" : "That one's out of ammunition"); return; }
    if (!t) { if (ui.aim[i] != null) { ui.aim[i] = null; PM.SFX.play("select"); Bt.hud(); Bt.announce(`${wname(u, i)} holding fire.`); } else toast("Put the cursor on an enemy first: Tab finds one"); return; }
    ui.aim[i] = ui.aim[i] === t.id ? null : t.id;
    PM.SFX.play("select"); Bt.hud();
    Bt.announce(ui.aim[i] != null ? `${wname(u, i)} on ${Bt.tag(t)}.` : `${wname(u, i)} holding fire.`);
  };
  Bt.setAct = (act, t) => {
    const ui = Bt.ui;
    ui.act = ui.act && ui.act.act === act && ui.act.target === t.id ? null : { act, target: t.id };
    PM.SFX.play("select"); Bt.hud();
    Bt.announce(ui.act ? `${act === "cover" ? "Taking cover" : act[0].toUpperCase() + act.slice(1) + " on " + (t === cur() ? "self" : Bt.tag(t) || t.name)}.` : `No ${act}.`);
  };
  const keep = () => { const ui = Bt.ui, u = cur(); u.order = { path: ui.plan.length > 1 ? ui.plan : null, mode: ui.mode, act: ui.act ? ui.act.act : null, target: ui.act ? ui.act.target : null }; u.aim = ui.aim.slice(); if (!ui.done.includes(u.id)) ui.done.push(u.id); };
  /* this unit's orders are given: on to the next */
  Bt.give = () => { keep(); PM.SFX.play("menu"); Bt.pickNext(); };
  /* straight to another of yours: this one keeps what it has so far */
  Bt.switchTo = t => {
    const ui = Bt.ui;
    keep();
    ui.done = ui.done.filter(id => id !== t.id);
    PM.SFX.play("menu");
    Bt.select(t);
  };
  /* the units the computer would take if you fought now */
  const toComputer = () => {
    const ui = Bt.ui, u = cur(), out = [];
    if ((ui.step === "move" || ui.step === "aim") && u && idle(ui.plan, ui.aim, ui.act)) out.push(u);
    for (const w of pending()) if (w !== u) { const st = standing(w); if (idle(st.plan, C.aims(w), null)) out.push(w); }
    return out;
  };
  /* begin the fight now: everyone keeps their orders; any with none at all go to the computer, and the log says who */
  Bt.go = () => {
    const ui = Bt.ui, auto = toComputer();
    if ((ui.step === "move" || ui.step === "aim") && !auto.includes(cur())) keep();
    for (const u of pending()) {
      if (auto.includes(u)) PM.AI.give(u, PM.AI.orderFor(Bt.S, Bt.B, u));
      else { const st = standing(u); u.order = { path: st.plan.length > 1 ? st.plan : null, mode: st.mode, act: null, target: null }; }
      ui.done.push(u.id);
    }
    if (auto.length) note(`${andList(auto.map(first))}: on instinct this round.`);
    PM.SFX.play("menu");
    Bt.resolve();
  };
  Bt.undo = () => {
    const ui = Bt.ui, last = ui.done.pop();
    if (last == null) return;
    const u = C.unit(Bt.B, last);
    Bt.select(u); u.order = null;
  };
  Bt.retreat = async () => {
    if (Bt.B.noRetreat) { PM.HUD.toast("There's no breaking off from this one", "red", 2400); return; }
    if (!(await UI.ask("Every one of yours tries to break off this round. It may fail, and nobody shoots while they run.", "Retreat", "Retreat?", false))) return;
    for (const u of C.live(Bt.B)) if (u.side === 0) u.order = { path: null, act: "retreat" };
    Bt.resolve();
  };

  /* ---- the round plays ---- */
  Bt.resolve = async () => {
    const S = Bt.S, B = Bt.B;
    Bt.ui.step = "play"; Bt.ui.cur = null; Bt.ui.round = B.round;
    PM.AI.orders(S, B, 1);
    const beats = C.resolve(S, B);
    Bt.hud();
    Bt.announce(`Round ${Bt.ui.round} plays.`);
    await Bt.play(beats);
    if (B.result) return Bt.end();
    Bt.nextRound();
  };
  /* where a unit is drawn (mid-stride, if it is walking) */
  const unitPos = id => { const d = R.disp.get(id); return d ? [d.rx ?? d.x, d.ry ?? d.y] : [0, 0]; };
  const heightOf = id => { const u = C.unit(Bt.B, id); return u && C.isMech(u) ? 24 : 10; };
  const mid = ps => ps.length ? [ps.reduce((a, p) => a + p[0], 0) / ps.length, ps.reduce((a, p) => a + p[1], 0) / ps.length] : null;
  /* a round's beats, step by step: the steps' moves start, the clock runs a step, the step's shots go off together */
  Bt.play = async beats => {
    const N = C.STEPS;
    const live = () => C.live(Bt.B).map(u => unitPos(u.id));
    for (let s = 0; s <= N + 1; s++) {
      const grp = beats.filter(b => s === 0 ? !(b.s >= 1) : s > N ? b.s > N : b.s === s), stepMs = STEP_MS * speed();
      if (s >= 1 && s <= N) {
        const moves = grp.filter(b => b.t === "move");
        for (const m of moves) {
          const d = R.disp.get(m.id);
          d.anim = { path: m.path, t0: Bt.now(), dur: Math.max(1, m.span) * stepMs * (m.mode === "jump" ? 0.85 : 1), jump: m.mode === "jump" };
          if (m.mode === "jump") PM.SFX.play("jump");
        }
        if (moves.length && s % 2) PM.SFX.play("step");
        const walking = [...R.disp.values()].some(d => d.anim && Bt.now() < d.anim.t0 + d.anim.dur);
        if (walking) { Bt.ui.focus = mid(live()) || Bt.ui.focus; await advance(stepMs); }
        const shots = grp.filter(b => b.t === "shot");
        if (shots.length) {
          Bt.ui.focus = mid(shots.flatMap(b => [unitPos(b.from), unitPos(b.to)]));
          await Promise.all(shots.map((b, i) => wait(i * 70).then(() => shot(b))));
        }
        for (const b of grp) if (b.t !== "move" && b.t !== "shot") await beat(b);
      } else for (const b of grp) b.t === "shot" ? await shot(b) : await beat(b);
    }
    for (const u of Bt.B.units) { const d = R.disp.get(u.id); if (d) { d.anim = null; d.x = u.x; d.y = u.y; d.f = u.f; } }
  };
  /* everything that is not a move or a shot */
  const beat = async b => {
    const now = performance.now();
    if (b.t === "say") { Bt.log(b.text, b.k); await wait(b.k === "sum" ? 260 : b.k ? 380 : 160); return; }
    if (b.t === "boom") {
      const [x, y] = unitPos(b.id), d = R.disp.get(b.id);
      R.addFx({ t: "boom", x, y, r: b.big ? 22 : 12, t0: now, dur: 1100 });
      PM.SFX.play("boom");
      if (b.wreck) { stop(b.id); d.out = "destroyed"; R.addFx({ t: "smoke", x: d.x, y: d.y, t0: now + 300, dur: 600000 }); }
      Bt.ui.focus = [x, y];
      await wait(420); return;
    }
    if (b.t === "fall") { stop(b.id); R.disp.get(b.id).out = "dead"; PM.SFX.play("die"); await wait(200); return; }
    if (b.t === "eject") { stop(b.id); const d = R.disp.get(b.id), [x, y] = unitPos(b.id); d.out = "ejected"; R.addFx({ t: "float", x, y, text: "EJECT", col: "#9fcf88", t0: now, dur: 1200 }); PM.SFX.play("jump"); await wait(300); return; }
    if (b.t === "spawn") { const u = C.unit(Bt.B, b.id); R.disp.set(u.id, { x: u.x, y: u.y, f: u.f, flash: now + 500 }); Bt.ui.focus = [u.x, u.y]; await wait(300); return; }
    if (b.t === "heal") { const [x, y] = unitPos(b.id); R.addFx({ t: "float", x, y, text: "+" + b.n, col: "#9fcf88", t0: now, dur: 1000 }); PM.SFX.play("pod"); await wait(250); return; }
    if (b.t === "shut") { const [x, y] = unitPos(b.id); R.addFx({ t: "float", x, y, text: "HOT", col: "#e8a33d", t0: now, dur: 1200 }); await wait(250); }
  };
  /* a unit beaten mid-stride stops where the round says it fell */
  const stop = id => { const u = C.unit(Bt.B, id), d = R.disp.get(id); if (d && u) { d.anim = null; d.x = u.x; d.y = u.y; d.rx = d.ry = null; } };
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
  const LOG_LINES = 6;
  Bt.log = (text, k) => {
    const el = $("b-log");
    Bt.announce(text);
    if (!el) return;
    el.hidden = false;
    const p = document.createElement("p"); p.className = k || ""; p.textContent = text;
    el.appendChild(p);
    while (el.children.length > LOG_LINES) el.firstChild.remove();
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
  /* the enemy, lettered in the order they came, so a weapon's aim can say which */
  Bt.tag = t => t && t.side === 1 ? "ABCDEFGHIJKLMNOP"[Bt.B.units.filter(w => w.side === 1).indexOf(t)] || "?" : t ? t.name.split(/[ ']/)[0] : "";
  const dot = (g, cx, cy, x, y, col, s = 4) => { g.fillStyle = col; g.fillRect(x * TS - cx + (TS - s) / 2, y * TS - cy + (TS - s) / 2, s, s); };
  /* a small dark label on the field, Pixelify, for letters and orders */
  const label = (g, text, x, y, fg, bg) => {
    g.font = "10px 'Pixelify Sans', monospace"; g.textBaseline = "top";
    const w = Math.max(9, Math.ceil(g.measureText(text).width) + 4);
    g.fillStyle = bg; g.fillRect(x, y, w, 10);
    g.fillStyle = fg; g.textAlign = "center"; g.fillText(text, x + w / 2, y + 1);
    g.textAlign = "start"; g.textBaseline = "alphabetic";
    return w;
  };
  const ACT_WORD = { kick: "KICK", punch: "PUNCH", satchel: "CHARGE", medkit: "MEDKIT", cover: "COVER" };
  Bt.view = () => {
    const B = Bt.B, ui = Bt.ui;
    if (!B) return null;
    const ordering = ui.step === "move" || ui.step === "aim";
    /* giving orders, the camera sits a tile high, so what matters clears the cards along the top */
    const focus = ordering ? [ui.focus[0], ui.focus[1] - 1] : ui.focus;
    return {
      S: Bt.S, B, focus, snap: ui.snap && !(ui.snap = false), clock: Bt.now(),
      ground: (g, cx, cy) => {
        /* outside the arena, darker */
        g.fillStyle = "rgba(12,13,17,.42)";
        const ax = B.ax * TS - cx, ay = B.ay * TS - cy, aw = B.aw * TS, ah = B.ah * TS;
        g.fillRect(0, 0, K.VW, Math.max(0, ay)); g.fillRect(0, ay + ah, K.VW, K.VH); g.fillRect(0, ay, Math.max(0, ax), ah); g.fillRect(ax + aw, ay, K.VW, ah);
        /* the routes of those already given orders */
        if (ordering) for (const u of B.units) if (!u.out && u.side === 0 && u.id !== ui.cur && ui.done.includes(u.id) && u.order && u.order.path) for (const [x, y] of u.order.path.slice(1)) dot(g, cx, cy, x, y, "rgba(242,246,236,.45)", 2);
        if (!ordering) return;
        const u = cur();
        if (ui.step === "move" && ui.reach) {
          const col = ui.mode === "run" ? "255,196,92" : ui.mode === "jump" ? "140,200,255" : "236,248,214";
          for (const [, v] of ui.reach) {
            const x = v.x * TS - cx, y = v.y * TS - cy;
            g.fillStyle = "rgba(248,250,240,.16)"; g.fillRect(x + 1, y + 1, TS - 2, TS - 2);
            g.fillStyle = `rgba(${col},.95)`;
            if (!ui.reach.has(v.x + "," + (v.y - 1))) g.fillRect(x, y, TS, 1);
            if (!ui.reach.has(v.x + "," + (v.y + 1))) g.fillRect(x, y + TS - 1, TS, 1);
            if (!ui.reach.has((v.x - 1) + "," + v.y)) g.fillRect(x, y, 1, TS);
            if (!ui.reach.has((v.x + 1) + "," + v.y)) g.fillRect(x + TS - 1, y, 1, TS);
          }
          /* the leg the cursor would add */
          const l = legTo(ui.cursor[0], ui.cursor[1]);
          if (l) for (const [x, y] of l.path.slice(1)) dot(g, cx, cy, x, y, l.later || !ui.reach.has(x + "," + y) ? "rgba(232,163,61,.8)" : "rgba(242,246,236,.75)", 3);
        }
        /* the route plotted: this round's part bright, what carries over amber, and where the round leaves it boxed */
        const tm = C.timing(B, u, ui.plan, ui.mode), n = tm.tiles.length;
        const route = ui.mode === "jump" && ui.plan.length > 1 ? tm.tiles : ui.plan;
        route.slice(1).forEach(([x, y], i) => dot(g, cx, cy, x, y, i + 1 < n ? "#f2f6ec" : "#e8a33d", 4));
        const [ex, ey] = tm.tiles[n - 1];
        g.strokeStyle = "rgba(242,246,236,.8)"; g.lineWidth = 1; g.strokeRect(ex * TS - cx + 2.5, ey * TS - cy + 2.5, TS - 5, TS - 5);
        if (route.length > n) { const [lx, ly] = route[route.length - 1]; label(g, "NEXT", lx * TS - cx + 2, ly * TS - cy + TS - 11, "#14161c", "#e8a33d"); }
        /* lines to what it aims at */
        const seen = new Set();
        for (const id of ui.aim) {
          if (id == null || seen.has(id)) continue; seen.add(id);
          const t = C.unit(B, id); if (!t || t.out) continue;
          g.strokeStyle = "rgba(255,122,92,.55)"; g.setLineDash([3, 3]); g.beginPath();
          g.moveTo(ex * TS - cx + TS / 2, ey * TS - cy + TS / 2); g.lineTo(t.x * TS - cx + TS / 2, t.y * TS - cy + TS / 2); g.stroke(); g.setLineDash([]);
        }
      },
      unitMark: (g, u, x, y, c) => {
        const d = R.disp.get(u.id);
        if (!d || d.out || ui.step === "over") return;
        const top = y - (c.ay || c.height) - 4, w = 16;
        /* a ring under the one giving orders */
        if (ui.cur === u.id && ordering) { g.strokeStyle = (R.frame >> 4) & 1 ? "#9fcf88" : "#7fb069"; g.lineWidth = 1; g.beginPath(); g.ellipse(x + 0.5, y + 1.5, 11, 5, 0, 0, Math.PI * 2); g.stroke(); }
        /* health, over each head (its length says it as well as its colour): your side green-edged, theirs red */
        let f;
        if (C.isMech(u)) { const mx = G.mechMax(u.m); f = (u.m.struct.CT + u.m.armor.CT) / (mx.struct.CT + mx.armor.CT); }
        else f = Math.max(0, u.hp) / u.hpMax;
        g.fillStyle = "#14161c"; g.fillRect(x - w / 2 - 1, top - 1, w + 2, 4);
        g.fillStyle = f > 0.66 ? "#7fb069" : f > 0.33 ? "#e8a33d" : "#e4572e"; g.fillRect(x - w / 2, top, Math.max(1, Math.round(w * f)), 2);
        g.fillStyle = u.side === 0 ? "#9fcf88" : "#ff7a5c"; g.fillRect(x - w / 2 - 3, top - 1, 2, 4);
        if (ordering && u.side === 0 && ui.done.includes(u.id)) { g.fillStyle = "#f2f6ec"; g.fillRect(x + w / 2 + 2, top - 1, 2, 2); }
        /* the enemy's letter; inverted on what the one giving orders aims at */
        if (u.side === 1) {
          const on = ordering && ui.aim.includes(u.id);
          label(g, Bt.tag(u), x + w / 2 + 3, top - 4, on ? "#14161c" : "#e9e4d8", on ? "#ff7a5c" : "#14161c");
        }
        /* a kick, a charge, a medkit or cover, written over who it is for */
        if (ordering && ui.act && ui.act.target === u.id) label(g, ACT_WORD[ui.act.act], x - 14, top - 16, "#14161c", "#e8a33d");
      },
      air: (g, cx, cy) => {
        if (!ordering) return;
        const [x, y] = ui.cursor, sx = x * TS - cx, sy = y * TS - cy, L = 6, col = ui.step === "aim" ? "#ff7a5c" : "#f2f6ec";
        g.fillStyle = "#14161c";
        for (const [ox, oy, dx, dy] of [[0, 0, 1, 1], [TS, 0, -1, 1], [0, TS, 1, -1], [TS, TS, -1, -1]]) { g.fillRect(sx + ox + (dx < 0 ? -L : 0), sy + oy + (dy < 0 ? -2 : 0) + 1, L, 2); g.fillRect(sx + ox + (dx < 0 ? -2 : 0) + 1, sy + oy + (dy < 0 ? -L : 0), 2, L); }
        g.fillStyle = col;
        for (const [ox, oy, dx, dy] of [[0, 0, 1, 1], [TS, 0, -1, 1], [0, TS, 1, -1], [TS, TS, -1, -1]]) { g.fillRect(sx + ox + (dx < 0 ? -L : 0), sy + oy + (dy < 0 ? -1 : 0), L, 1); g.fillRect(sx + ox + (dx < 0 ? -1 : 0), sy + oy + (dy < 0 ? -L : 0), 1, L); }
        /* enemies off the screen: an arrow at the edge, with the letter */
        const M = 12;
        for (const t of C.live(B)) {
          if (t.side !== 1) continue;
          const px = (t.x + 0.5) * TS - cx, py = (t.y + 0.5) * TS - cy;
          if (px >= 0 && px <= K.VW && py >= 0 && py <= K.VH) continue;
          const ex = Math.max(M, Math.min(K.VW - M, px)), ey = Math.max(M, Math.min(K.VH - M, py)), a = Math.atan2(py - ey, px - ex);
          g.fillStyle = "#ff7a5c"; g.beginPath();
          g.moveTo(ex + Math.cos(a) * 7, ey + Math.sin(a) * 7); g.lineTo(ex + Math.cos(a + 2.4) * 6, ey + Math.sin(a + 2.4) * 6); g.lineTo(ex + Math.cos(a - 2.4) * 6, ey + Math.sin(a - 2.4) * 6); g.fill();
          label(g, Bt.tag(t), ex - Math.cos(a) * 9 - 4.5, ey - Math.sin(a) * 9 - 5, "#e9e4d8", "#14161c");
        }
      },
    };
  };

  /* ---- the panels ---- */
  const kb = k => `<kbd>${k}</kbd>`, sep = `<span class="h-sep"></span>`;
  Bt.hud = () => {
    const el = $("hud"), B = Bt.B, S = Bt.S, ui = Bt.ui;
    if (!el || !B) return;
    const u = cur(), ordering = ui.step === "move" || ui.step === "aim";
    const tgt = ordering ? B.units.find(w => !w.out && w.x === ui.cursor[0] && w.y === ui.cursor[1] && w !== u) : null;
    const mine = C.live(B).filter(w => w.side === 0), idx = u ? mine.indexOf(u) + 1 : 0;
    const phase = ui.step === "move" ? "Route" : ui.step === "aim" ? "Aim" : ui.step === "play" ? (Bt.fast ? "Fight »" : "Fight") : ui.step === "over" ? (B.result === "won" ? "Won" : B.result === "fled" ? "Broke off" : "Lost") : "Contact";
    const mech = u && C.isMech(u);
    let keys = "";
    if (ordering) {
      const auto = toComputer().length, fight = `${kb("G")} fight${auto ? ` <i>(${auto} to the computer)</i>` : ""}`;
      const back = ui.step === "move" ? (ui.legs.length ? `${kb("Esc")} undo leg` : ui.done.length ? `${kb("Esc")} back a unit` : "") : `${kb("Esc")} route`;
      if (ui.step === "move") keys = `${kb("↑↓←→")} cursor ${kb("Enter")} route here ${kb("Space")} aim${sep}${kb("R")} ${ui.mode === "run" ? "walk" : "run"}${mech && C.mp(u, "jump") ? ` ${kb("J")} ${ui.mode === "jump" ? "walk" : "jump"}` : ""}${ui.plan.length > 1 ? ` ${kb("Bksp")} clear route` : ""}${sep}${kb("A")} computer ${fight} ${back}`;
      else {
        const foe = tgt && tgt.side === 1 ? tgt : null, n = ui.aim.length;
        const close = foe && closeBy(u, foe), extra = [];
        if (mech && close) extra.push(`${kb("K")} kick ${kb("U")} punch`);
        if (!mech && close && C.isMech(foe) && S.items.satchel > 0) extra.push(`${kb("X")} satchel`);
        if (!mech && S.items.medkit > 0) extra.push(`${kb("H")} medkit`);
        if (!mech) extra.push(`${kb("D")} cover`);
        keys = `${kb("Tab")} enemy ${n > 1 ? `${kb("Enter")} all on it ${kb("1")}–${kb(n)} one ${kb("0")} none` : `${kb("Enter")} aim ${kb("0")} hold`}${extra.length ? sep + extra.join(" ") : ""}${sep}${kb("Space")} next ${fight} ${back}`;
      }
    } else if (ui.step === "play" || ui.step === "intro") keys = Bt.fast ? "Hurrying…" : `${kb("Space")} hurry it along`;
    const card = ordering && u ? PM.HUD.unitCard(S, B, u, { orders: { aim: ui.aim, act: ui.act, vs: tgt && tgt.side === 1 ? tgt : null, odds: !!PM.prefs.odds, fc: (t, i) => forecast(u, t, i), tag: id => Bt.tag(C.unit(B, id)), moveHeat: mech ? C.moveHeat(ui.mode, C.timing(B, u, ui.plan, ui.mode).tiles.length - 1) : 0 } }) : "";
    const lines = B.log.slice(-LOG_LINES);
    el.innerHTML = `
      ${card ? `<div class="hp b-card" id="b-active">${card}</div>` : ""}
      ${tgt ? `<div class="hp b-card" id="b-target">${tgt.side === 1 ? `<span class="b-tag">${Bt.tag(tgt)}</span>` : `<span class="b-tag mine">yours</span>`}${PM.HUD.unitCard(S, B, tgt)}</div>` : ""}
      <div class="hp h-pill" id="b-round"><span class="lbl">Round</span><span class="num">${ui.round || B.round}</span><span class="h-sep"></span><span class="h-state">${phase}</span>${u && ordering ? `<span class="b-who">${esc(u.name)}${mine.length > 1 ? ` <i>${idx} of ${mine.length}</i>` : ""}</span>` : ""}</div>
      <div class="hp" id="b-log"${lines.length ? "" : " hidden"}>${lines.map(e => `<p class="${e.k || ""}">${esc(e.text)}</p>`).join("")}</div>
      ${keys ? `<div class="hp h-pill h-hint" id="b-keys">${keys}</div>` : ""}
      <div class="h-toasts"></div>`;
  };
})();
