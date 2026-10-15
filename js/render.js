/* PumaMech -- the field: 480 by 300, scaled up square-pixelled to fit the
 * window, in Airborne Puma's tilted overhead view, looking north.
 *
 * The ground goes down first, then every shadow at once (multiplied in the
 * zone's cool shade), then everything standing up -- walls, trees,
 * buildings, mechs, people -- back to front by where it meets the ground,
 * then what is in the air (beams, missiles, fire, smoke) and the marks a
 * player needs (the arena's edge, where a unit can go, the cursor).
 *
 * Exploring, the party walks a tile at a time and is drawn sliding between
 * tiles; whoever follows walks in the leader's footsteps. In a town the
 * lance waits on the pads by the mech yard. In a fight, units are drawn
 * where the battle screen says they are while a round plays out. */
"use strict";
(() => {
  const K = PM.K, TS = K.TS, VW = K.VW, VH = K.VH, T = PM.T;
  const R = PM.Render = { cv: null, g: null, cam: { x: 0, y: 0 }, frame: 0, hist: [], walk: { k: 1 }, fx: [], disp: new Map() };
  let shc, shg, tnc, tng;
  R.setTarget = cv => { R.cv = cv; R.g = cv.getContext("2d"); R.g.imageSmoothingEnabled = false; };
  R.init = cv => {
    R.setTarget(cv);
    shc = K.mk(VW, VH); shg = shc.getContext("2d");
    tnc = K.mk(VW, VH); tng = tnc.getContext("2d");
  };
  /* ---- neighbours of the same kind: 1 north, 2 east, 4 south, 8 west ---- */
  const GROUP = {};
  const grp = (ids, k) => ids.forEach(i => { GROUP[i] = k; });
  grp([T.WATER, T.ICE, T.THIN], "water");
  grp([T.DIRT, T.BRIDGE, T.ROAD], "road");
  grp([T.PAVE, T.BLDG, T.WALL], "pave");
  const kindOf = id => GROUP[id] || id;
  const nb = (map, x, y) => {
    const k = kindOf(PM.tileAt(map, x, y)), s = (dx, dy) => kindOf(PM.tileAt(map, x + dx, y + dy)) === k;
    return (s(0, -1) ? 1 : 0) | (s(1, 0) ? 2 : 0) | (s(0, 1) ? 4 : 0) | (s(-1, 0) ? 8 : 0);
  };
  /* a wall stands on its own: only walls join walls */
  const nbStand = (map, x, y) => {
    const k = PM.tileAt(map, x, y), s = (dx, dy) => PM.tileAt(map, x + dx, y + dy) === k;
    return (s(0, -1) ? 1 : 0) | (s(1, 0) ? 2 : 0) | (s(0, 1) ? 4 : 0) | (s(-1, 0) ? 8 : 0);
  };
  const nbRoad = (map, x, y) => {
    /* a road's ruts follow other road, a bridge, or a town's paving */
    const ok = (dx, dy) => { const t = PM.tileAt(map, x + dx, y + dy); return t === T.DIRT || t === T.BRIDGE || t === T.PAVE || t === T.ROAD; };
    return (ok(0, -1) ? 1 : 0) | (ok(1, 0) ? 2 : 0) | (ok(0, 1) ? 4 : 0) | (ok(-1, 0) ? 8 : 0);
  };
  const variant = (x, y) => ((x * 7 + y * 13 + ((x * y) >> 2)) & 3);
  const ax = c => c.ax ?? c.width / 2, ay = c => c.ay ?? c.height - 3;

  /* where on the field (in pixels) a tile's centre-bottom stands */
  R.toScreen = (x, y) => [Math.round(x * TS + TS / 2 - R.cam.x), Math.round(y * TS + TS - 3 - R.cam.y)];
  /* which tile a point on the screen is over */
  R.tileAtScreen = (sx, sy) => [Math.floor((sx + R.cam.x) / TS), Math.floor((sy + R.cam.y) / TS)];

  R.aim = (map, fx, fy, snap) => {
    const tx = Math.max(0, Math.min(map.w * TS - VW, fx * TS + TS / 2 - VW / 2)), ty = Math.max(0, Math.min(map.h * TS - VH, fy * TS + TS / 2 - VH / 2));
    if (snap) { R.cam.x = tx; R.cam.y = ty; return; }
    R.cam.x += (tx - R.cam.x) * 0.18; R.cam.y += (ty - R.cam.y) * 0.18;
    if (Math.abs(tx - R.cam.x) < 0.4) R.cam.x = tx; if (Math.abs(ty - R.cam.y) < 0.4) R.cam.y = ty;
  };

  /* ---- the party walking ---- */
  R.STEP_MS = 150;
  R.resetWalk = S => { R.hist = [[S.pos.x, S.pos.y]]; R.walk = { k: 1, t0: 0 }; };
  R.stepped = (S, now) => {
    R.hist.unshift([S.pos.x, S.pos.y]);
    if (R.hist.length > 12) R.hist.length = 12;
    R.walk = { k: 0, t0: now };
  };
  const lerp = (a, b, k) => a + (b - a) * k;
  /* the i-th walker's place now: between where the leader was i+1 steps ago and i steps ago */
  const walkerAt = i => {
    const h = R.hist, a = h[Math.min(i + 1, h.length - 1)], b = h[Math.min(i, h.length - 1)];
    return [lerp(a[0], b[0], R.walk.k), lerp(a[1], b[1], R.walk.k), PM.Explore.dirOf(b[0] - a[0], b[1] - a[1])];
  };

  /* ---- who the party shows: people, or their mechs out in the wilds ---- */
  R.partyShows = S => {
    const map = PM.getMap(S.pos.map);
    const inTown = map.id !== "world" || PM.townAt(S.pos.x, S.pos.y);
    const out = [];
    for (const id of S.party) {
      const c = S.chars[id], m = PM.Game.mechOf(S, id);
      if (!inTown && m && PM.Game.mechUsable(m) && S.flags.invaded) out.push({ mech: m });
      else out.push({ look: c.look, c });
    }
    return out;
  };

  /* ---- drawing ---- */
  R.draw = (view, now) => {
    const g = R.g, S = view.S, B = view.B;
    R.frame++;
    const map = PM.getMap(B ? B.map : S.pos.map);
    if (R.mapRef !== map) { R.mapRef = map; PM.groundReset(); }
    if (!B && R.walk.k < 1) { R.walk.k = Math.min(1, (now - R.walk.t0) / R.STEP_MS); }
    /* the camera: the leader, or the battle's focus */
    if (view.cam) { R.cam.x = view.cam[0]; R.cam.y = view.cam[1]; }
    else if (B) R.aim(map, view.focus[0], view.focus[1], view.snap);
    else { const [lx, ly] = walkerAt(0); R.aim(map, lx, ly - 0.5, view.snap); }
    const cx = Math.round(R.cam.x), cy = Math.round(R.cam.y);
    const tx0 = Math.floor(cx / TS), ty0 = Math.floor(cy / TS), tx1 = Math.ceil((cx + VW) / TS), ty1 = Math.ceil((cy + VH) / TS);
    const zc = PM.zoneAt(map, Math.floor((cx + VW / 2) / TS), Math.floor((cy + VH / 2) / TS));
    /* ground */
    for (let ty = ty0; ty < ty1; ty++) for (let tx = tx0; tx < tx1; tx++) {
      const id = PM.tileAt(map, tx, ty), zone = PM.zoneAt(map, tx, ty);
      const n = id === T.DIRT || id === T.BRIDGE ? nbRoad(map, tx, ty) : nb(map, tx, ty);
      g.drawImage(PM.tileArt(zone, id, variant(tx, ty), n, tx, ty), tx * TS - cx, ty * TS - cy);
    }
    /* overlays that lie on the ground: the arena, where a unit may go */
    if (view.ground) view.ground(g, cx, cy);
    /* everything standing: [ground y, canvas, x, y, extra draw] */
    const list = [];
    for (let ty = ty0 - 1; ty < ty1 + 3; ty++) for (let tx = tx0 - 3; tx < tx1 + 1; tx++) {
      const id = PM.tileAt(map, tx, ty), zone = PM.zoneAt(map, tx, ty);
      if (id === T.BLDG) continue;
      const c = PM.standArt(zone, id, variant(tx, ty), nbStand(map, tx, ty));
      if (c) list.push([ty + 0.98, c, tx * TS - ax(c) - cx, (ty + 1) * TS - ay(c) - cy]);
    }
    for (const o of map.objs) {
      if ((o.x + o.w + 4) * TS < cx || (o.x - 4) * TS > cx + VW || (o.y + o.h + 2) * TS < cy || (o.y - 4) * TS > cy + VH) continue;
      let c;
      if (o.k === "bldg") c = PM.bldgArt(o);
      else if (o.k === "decor") c = PM.decorArt(o.kind);
      else if (o.k === "obj") c = PM.objArt(o.kind, false, PM.zoneAt(map, o.x, o.y), 0);
      else if (o.k === "vault") c = PM.vaultArt(o, vaultState(S, o));
      if (!c) continue;
      let px, py;
      if (o.k === "bldg" || o.k === "vault") { px = o.x * TS - c.ax - cx; py = (o.y + o.h) * TS - c.ay - cy; }
      else if (o.k === "obj") { px = o.x * TS - (c.ax || 0) - cx; py = o.y * TS - (c.ay || 0) - cy; }
      else { px = Math.round((o.x + o.w / 2) * TS - c.ax - cx); py = (o.y + o.h) * TS - 2 - c.ay - cy; }
      list.push([o.y + o.h - 0.02, c, px, py]);
      /* a Founders' mech in its bay, until it is claimed */
      if (o.kind === "bay" && !S.vault.claimed) {
        const mc = PM.mechArt(o.mech, "founders", 2, "stand", 0);
        list.push([o.y + 0.99, mc, Math.round((o.x + 0.5) * TS - mc.ax - cx), Math.round((o.y + 1) * TS - 3 - mc.ay - cy)]);
      }
    }
    /* the story's people */
    if (S && !B && !view.noNpcs) for (const n of PM.Explore.npcs(S)) {
      if (n.x < tx0 - 2 || n.x > tx1 + 2 || n.y < ty0 - 2 || n.y > ty1 + 3) continue;
      const c = n.mech ? PM.mechArt(n.mech, n.paint || "wolf", n.f ?? 2, "stand", 0) : PM.personArt(n.look, (n.f ?? 2) * 4, "stand", 0);
      list.push([n.y + 0.5, c, Math.round((n.x + 0.5) * TS - ax(c) - cx), Math.round((n.y + 1) * TS - 3 - ay(c) - cy)]);
      if (n.mark) list.push([n.y + 0.51, PM.markArt(n.mark), Math.round((n.x + 0.5) * TS - 3 - cx), Math.round(n.y * TS - 18 - cy)]);
    }
    if (B) battleUnits(view, list, cx, cy, now);
    else if (S && !view.noParty) {
      /* the lance parked in town */
      const town = map.id === "world" ? PM.townAt(S.pos.x, S.pos.y) : null;
      if (town && S.flags.invaded) {
        const pads = map.pads[town] || [];
        PM.Game.lance(S).slice(0, pads.length).forEach((m, i) => {
          const [px, py] = pads[i], c = PM.mechArt(m.ch, m.paint, 2, G_usable(m) ? "stand" : "down", 0);
          list.push([py + 0.5, c, Math.round((px + 0.5) * TS - ax(c) - cx), Math.round((py + 1) * TS - 3 - ay(c) - cy)]);
        });
      }
      /* the party, in the leader's footsteps */
      const shows = R.partyShows(S), moving = R.walk.k < 1;
      shows.forEach((p, i) => {
        if (i >= R.hist.length && i > 0) return;
        const [x, y, f0] = walkerAt(i), f = i === 0 && !moving ? S.pos.f : (f0 >= 0 ? f0 : S.pos.f);
        const fr = moving ? Math.min(3, Math.floor(R.walk.k * 4)) : 0;
        const c = p.mech ? PM.mechArt(p.mech.ch, p.mech.paint, f, moving ? "walk" : "stand", fr) : PM.personArt(p.look, f * 4, moving ? "walk" : "stand", fr);
        list.push([y + 0.5 - i * 0.001, c, Math.round((x + 0.5) * TS - ax(c) - cx), Math.round((y + 1) * TS - 3 - ay(c) - cy)]);
      });
    }
    if (view.extra) view.extra(list, cx, cy, now);
    list.sort((a, b) => a[0] - b[0]);
    /* the shadows, gathered and laid down in one pass */
    shg.clearRect(0, 0, VW, VH);
    for (const [, c, x, y] of list) if (c && c.sh) shg.drawImage(c.sh, Math.round(x + c.shx), Math.round(y + c.shy));
    tng.globalCompositeOperation = "source-over"; tng.clearRect(0, 0, VW, VH);
    tng.fillStyle = map.id === "vault" ? "#4a4f63" : K.Z[zc].shadow; tng.fillRect(0, 0, VW, VH);
    tng.globalCompositeOperation = "destination-in"; tng.drawImage(shc, 0, 0);
    g.globalCompositeOperation = "multiply"; g.drawImage(tnc, 0, 0); g.globalCompositeOperation = "source-over";
    for (const [, c, x, y, extra] of list) { if (c) g.drawImage(c, x, y); if (extra) extra(g); }
    /* in a fight, whoever stands among trees still shows through them, faintly */
    if (B) { g.globalAlpha = 0.32; for (const [c, x, y] of ghosts) g.drawImage(c, x, y); g.globalAlpha = 1; }
    /* the Vault is dark at its edges */
    if (map.id === "vault") { g.fillStyle = "rgba(10,12,20,.22)"; g.fillRect(0, 0, VW, VH); }
    /* the air: beams, missiles, fire, words */
    drawFx(g, cx, cy, now);
    if (view.air) view.air(g, cx, cy);
  };
  const G_usable = m => PM.Game.mechUsable(m);
  const vaultState = (S, o) => {
    const v = S.vault;
    if (o.kind === "vdoor") return { open: !!v.open[o.n] };
    if (o.kind === "term") return { on: v.power, used: !!v.used[o.id] };
    if (o.kind === "power") return { on: v.power };
    if (o.kind === "array") return { on: v.power && v.parts };
    return {};
  };

  /* ---- a battle's units, where the battle screen says they stand ---- */
  let ghosts = [];
  const battleUnits = (view, list, cx, cy, now) => {
    const B = view.B;
    ghosts = [];
    for (const u of B.units) {
      const d = R.disp.get(u.id) || { x: u.x, y: u.y, f: u.f };
      if (d.gone) continue;
      let x = d.x, y = d.y, pose = "stand", fr = 0;
      if (d.anim && d.anim.path.length > 1) {
        const k = Math.max(0, Math.min(1, (now - d.anim.t0) / d.anim.dur)), path = d.anim.path, segs = path.length - 1;
        const s = Math.min(segs - 1, Math.floor(k * segs)), kk = k * segs - s;
        const [x0, y0] = path[s], [x1, y1] = path[s + 1];
        x = lerp(x0, x1, kk); y = lerp(y0, y1, kk);
        if (d.anim.jump) y -= Math.sin(k * Math.PI) * 1.4;
        d.f = PM.Combat.dirTo(x0, y0, x1, y1);
        pose = "walk"; fr = Math.floor(k * segs * 4) & 3;
        if (k >= 1) { d.x = path[segs][0]; d.y = path[segs][1]; d.anim = null; x = d.x; y = d.y; pose = "stand"; }
      }
      let c;
      if (u.kind === "mech") {
        const m = u.m, wreck = d.out === "destroyed" || d.out === "head";
        c = PM.mechArt(m.ch, m.paint, d.f, wreck ? "wreck" : d.out === "ejected" ? "stand" : PM.Game.mechLegless(m) ? "down" : pose, fr);
      } else if (d.out) c = PM.creatureArt ? PM.creatureArt(u, d.f, "dead") : PM.personArt(u.look, d.f * 4, "dead", 0);
      else c = PM.creatureArt && (u.beast || u.machine) ? PM.creatureArt(u, d.f, pose, fr) : PM.personArt(lookWithArms(u), d.f * 4, pose, fr);
      const sx = Math.round((x + 0.5) * TS - ax(c) - cx), sy = Math.round((y + 1) * TS - 3 - ay(c) - cy);
      if (!d.out) ghosts.push([c, sx, sy]);
      const flash = d.flash && now < d.flash;
      list.push([y + (d.out ? 0.2 : 0.5), c, sx, sy, g => {
        if (flash) { g.globalCompositeOperation = "lighter"; g.globalAlpha = 0.6; g.drawImage(c, sx, sy); g.globalAlpha = 1; g.globalCompositeOperation = "source-over"; }
        if (view.unitMark) view.unitMark(g, u, Math.round((x + 0.5) * TS - cx), Math.round((y + 1) * TS - 3 - cy), c);
      }]);
    }
  };
  const lookWithArms = u => u.weapon ? `${u.look}@${u.weapon}` : u.look;

  /* ---- effects ---- */
  R.addFx = f => { R.fx.push(f); };
  const COL = { beam: ["#ff6b5a", "#ffd0c8"], ion: ["#7fd6ff", "#e8fbff"], pbeam: ["#ff8a6a", "#ffe0d0"] };
  const drawFx = (g, cx, cy, now) => {
    R.fx = R.fx.filter(f => now < f.t0 + f.dur);
    for (const f of R.fx) {
      const k = Math.max(0, (now - f.t0) / f.dur);
      if (now < f.t0) continue;
      const X = v => v * TS + TS / 2 - cx, Y = v => v * TS + TS / 2 - 4 - cy;
      if (f.t === "beam") {
        const col = COL[f.kind] || COL.beam, x0 = X(f.x0), y0 = Y(f.y0) - (f.h0 || 0), x1 = X(f.x1), y1 = Y(f.y1) - (f.h1 || 0);
        const ex = f.hit ? x1 : x1 + (f.mx || 0), ey = f.hit ? y1 : y1 + (f.my || 0);
        g.globalAlpha = 1 - k * 0.6;
        K.line(g, x0, y0 + 1, ex, ey + 1, col[0]); K.line(g, x0, y0, ex, ey, col[1]);
        if (f.kind === "ion") { K.line(g, x0, y0 - 1, ex, ey - 1, col[0]); }
        g.globalAlpha = 1;
        if (f.hit) { g.fillStyle = col[1]; K.disc(g, ex, ey, 2 + (1 - k) * 2, 2 + (1 - k) * 2); }
      } else if (f.t === "bolt") {
        /* a shell, tracer or rocket in flight */
        const x0 = X(f.x0), y0 = Y(f.y0) - (f.h0 || 0), x1 = X(f.x1) + (f.hit ? 0 : f.mx || 0), y1 = Y(f.y1) - (f.h1 || 0) + (f.hit ? 0 : f.my || 0);
        const arc = f.arc ? Math.sin(k * Math.PI) * f.arc : 0, x = lerp(x0, x1, k), y = lerp(y0, y1, k) - arc;
        if (f.trail) for (let i = 1; i < 6; i++) { const kk = Math.max(0, k - i * 0.04); const tx = lerp(x0, x1, kk), ty = lerp(y0, y1, kk) - (f.arc ? Math.sin(kk * Math.PI) * f.arc : 0); g.fillStyle = i < 2 ? "#ffd36b" : "#a39d94"; g.fillRect(Math.round(tx), Math.round(ty), i < 3 ? 2 : 1, i < 3 ? 2 : 1); }
        g.fillStyle = f.col || "#fff2a8"; g.fillRect(Math.round(x) - 1, Math.round(y) - 1, f.size || 2, f.size || 2);
      } else if (f.t === "boom") PM.drawBoom(g, X(f.x), Y(f.y) + 6, f.r, k);
      else if (f.t === "spark") { g.fillStyle = k < 0.5 ? "#fff2a8" : "#ff9a3c"; for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2 + f.x; g.fillRect(Math.round(X(f.x) + Math.cos(a) * k * 8), Math.round(Y(f.y) - (f.h || 0) + Math.sin(a) * k * 6), 1, 1); } }
      else if (f.t === "float") {
        const x = X(f.x), y = Y(f.y) - 26 - k * 14;
        g.globalAlpha = k > 0.7 ? (1 - k) / 0.3 : 1;
        pixText(g, f.text, Math.round(x), Math.round(y), f.col || "#ffffff");
        g.globalAlpha = 1;
      } else if (f.t === "smoke") PM.drawSmoke(g, X(f.x), Y(f.y) + 4, (now - f.t0) / 16);
    }
  };
  /* ---- a tiny pixel font for numbers over heads ---- */
  const GL = {
    "0": "111101101101111", "1": "010110010010111", "2": "111001111100111", "3": "111001111001111", "4": "101101111001001",
    "5": "111100111001111", "6": "111100111101111", "7": "111001010010010", "8": "111101111101111", "9": "111101111001111",
    "+": "000010111010000", "-": "000000111000000", M: "101111101101101", I: "111010010010111", S: "111100111001111",
    H: "101101111101101", E: "111100110100111", A: "111101111101101", T: "111010010010010", O: "111101101101111", F: "111100110100100", L: "100100100100111", D: "110101101101110", N: "110101101101101", " ": "000000000000000",
  };
  const pixText = R.pixText = (g, s, x, y, col) => {
    s = String(s).toUpperCase();
    const w = s.length * 4 - 1;
    x -= Math.floor(w / 2);
    g.fillStyle = "#1d1917";
    for (let pass = 0; pass < 2; pass++) {
      if (pass) g.fillStyle = col;
      [...s].forEach((ch, i) => {
        const m = GL[ch] || GL[" "];
        for (let j = 0; j < 15; j++) if (m[j] === "1") {
          const px = x + i * 4 + (j % 3), py = y + Math.floor(j / 3);
          if (pass) g.fillRect(px, py, 1, 1); else g.fillRect(px - 1, py - 1, 3, 3);
        }
      });
    }
  };
})();
