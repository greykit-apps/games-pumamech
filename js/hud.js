/* PumaMech -- the panels over the field: flat, dark, at its corners.
 *
 * Exploring: where you are and when, the crowns in hand, a map of what the
 * party has seen (with the locator's arrow once Brock has given it), and
 * the party along the bottom, each with their wounds and their mech.
 * Fighting: the unit giving orders, the one it aims at, the round, the
 * log, and the keys (js/battle.js fills them). */
"use strict";
(() => {
  const esc = PM.esc, G = PM.Game, UI = PM.UI;
  const H = PM.HUD = { el: null, toasts: [] };
  const $ = id => document.getElementById(id);
  H.init = () => { H.el = $("hud"); };

  /* ---- bits ---- */
  const bar = (frac, cls = "", segs = 10) => {
    const n = Math.max(0, Math.min(segs, Math.round(frac * segs)));
    return `<span class="h-bar ${cls}">${Array.from({ length: segs }, (_, i) => `<i class="${i < n ? "on" : ""}"></i>`).join("")}</span>`;
  };
  H.bar = bar;
  const tone = f => f > 0.66 ? "#7fb069" : f > 0.33 ? "#e8a33d" : f > 0 ? "#e4572e" : "#2a2c33";
  /* a mech's plate, as a little figure: head, torso, arms, legs */
  H.doll = (m, w = 54) => {
    const mx = G.mechMax(m), f = l => (m.armor[l] + m.struct[l]) / (mx.armor[l] + mx.struct[l]);
    const L = { HD: [21, 0, 12, 8], LA: [0, 10, 10, 20], LT: [11, 10, 10, 18], CT: [22, 10, 10, 20], RT: [33, 10, 10, 18], RA: [44, 10, 10, 20], LL: [12, 31, 13, 20], RL: [29, 31, 13, 20] };
    const h = Math.round(w * 52 / 54);
    return `<svg class="doll" viewBox="0 0 54 52" width="${w}" height="${h}" aria-hidden="true">${Object.entries(L).map(([l, [x, y, ww, hh]]) => {
      const v = f(l), dead = m.struct[l] <= 0;
      return `<rect x="${x}" y="${y}" width="${ww}" height="${hh}" rx="1.5" fill="${tone(v)}" ${dead ? 'opacity=".5"' : ""}/>${m.struct[l] < PM.structure(PM.CHASSIS[m.ch].tons)[l] && !dead ? `<rect x="${x + 2}" y="${y + hh - 4}" width="${ww - 4}" height="2" fill="#14161c" opacity=".55"/>` : ""}${dead ? `<path d="M${x + 2} ${y + 2}L${x + ww - 2} ${y + hh - 2}M${x + ww - 2} ${y + 2}L${x + 2} ${y + hh - 2}" stroke="#e9e4d8" stroke-width="1.5"/>` : ""}`;
    }).join("")}</svg>`;
  };
  H.icon = (name, col, scale = 2) => UI.img(PM.iconArt(name, col, 1), scale, "px ico");

  /* ---- toasts: a word in the lower middle ---- */
  H.toast = (text, kind = "", ms = 2200) => {
    const box = H.el && H.el.querySelector(".h-toasts");
    const live = $("live"); if (live) live.textContent = text;
    if (!box) return;
    const t = document.createElement("div");
    t.className = "hp h-toast " + kind;
    t.textContent = text;
    box.appendChild(t);
    while (box.children.length > 3) box.firstChild.remove();
    setTimeout(() => t.remove(), ms);
  };

  /* ---- exploring ---- */
  H.where = S => {
    if (S.pos.map === "vault") return ["The Vault", "Under the High Spurs"];
    const town = PM.townAt(S.pos.x, S.pos.y);
    if (town) return [PM.TOWNS[town].name, S.flags.invaded && (town === "portgate" || (town === "bastion" && !S.flags.bastionFree)) ? "Occupied" : "Town"];
    const r = PM.regionAt(PM.maps.world, S.pos.x, S.pos.y);
    return [PM.REGIONS[r].name || "Pardalis", "The wilds"];
  };
  H.explore = S => {
    if (!H.el) return;
    const [place, kind] = H.where(S);
    const shows = S.party.map(id => S.chars[id]);
    const party = shows.map(c => {
      const m = G.mechOf(S, c.id);
      return `<div class="h-mem${c.hp <= c.hpMax * 0.34 ? " hurt" : ""}">${UI.face(c.look, 2, c.name)}<div class="h-mi"><b>${esc(c.name.split(" ")[0])}</b>${bar(c.hp / c.hpMax, c.hp <= c.hpMax * 0.34 ? "low" : "", 8)}
        ${m ? `<span class="h-mm${G.mechUsable(m) ? "" : " dead"}">${esc(PM.CHASSIS[m.ch].name)} <i>${Math.round(G.mechCondition(m) * 100)}%</i></span>` : `<span class="h-mm none">on foot</span>`}</div></div>`;
    }).join("");
    H.el.innerHTML = `
      <div class="hp" id="h-where"><div class="h-place">${esc(place)}</div><div class="h-kind lbl">${esc(kind)}</div>
        <div class="h-row"><span class="num h-time">${String(S.hour).padStart(2, "0")}:00</span><span class="lbl">Day</span><span class="num">${S.day}</span></div>
        <div class="h-row"><span class="lbl">Crowns</span><span class="num h-cash">${S.money.toLocaleString("en-US")}</span></div></div>
      <div class="hp" id="h-mapbox"><canvas id="h-mini" width="224" height="140"></canvas>${S.flags.locator && S.pos.map === "world" && !S.flags.vaultIn ? `<div class="h-loc"><span class="lbl">Locator</span> <b>${H.bearing(S)}</b></div>` : ""}</div>
      <div class="hp" id="h-party">${party}</div>
      <div class="hp h-pill h-hint"><kbd>↑↓←→</kbd> walk <kbd>P</kbd> party <kbd>J</kbd> journal <kbd>Tab</kbd> map <kbd>Esc</kbd> menu</div>
      <div class="h-toasts"></div>`;
    H.mini(S);
  };
  /* the way to the Vault, as a compass word */
  H.bearing = S => {
    const v = PM.maps.world.vaultDoor, dx = v.x - S.pos.x, dy = v.y - S.pos.y, d = Math.max(Math.abs(dx), Math.abs(dy));
    if (d <= 2) return "here";
    const a = Math.atan2(dy, dx), names = ["east", "south-east", "south", "south-west", "west", "north-west", "north", "north-east"];
    return `${names[((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8]}, ${d} leagues`;
  };
  /* the minimap: a pixel a tile, what has been seen, the party a blinking dot */
  const MC = { [PM.T.WATER]: "#4f7fa3", [PM.T.ICE]: "#c4e1ee", [PM.T.TREE]: "#3e6534", [PM.T.BUSH]: "#6f9a48", [PM.T.BAD]: "#7d6a58", [PM.T.ROCK]: "#8f8b82",
    [PM.T.DIRT]: "#c7a36f", [PM.T.BRIDGE]: "#a98252", [PM.T.PAVE]: "#c3bfb4", [PM.T.BLDG]: "#9a4636", [PM.T.WALL]: "#e6d3b0", [PM.T.ROAD]: "#7f8284", [PM.T.FIELD]: "#c9b45a",
    [PM.T.VFLOOR]: "#878f9b", [PM.T.GRATE]: "#58606b", [PM.T.VWALL]: "#262a31", [PM.T.WIRE]: "#ddd6c6" };
  const ZC = ["#d7b075", "#86b24c", "#e6ecf4"];
  H.mini = S => {
    const cv = $("h-mini");
    if (!cv) return;
    const g = cv.getContext("2d"), map = PM.getMap(S.pos.map), W = cv.width, Hh = cv.height;
    const sc = map.id === "vault" ? 5 : 2;
    const ox = Math.round(Math.max(0, Math.min(map.w * sc - W, S.pos.x * sc - W / 2))), oy = Math.round(Math.max(0, Math.min(map.h * sc - Hh, S.pos.y * sc - Hh / 2)));
    g.fillStyle = "#16181e"; g.fillRect(0, 0, W, Hh);
    const x0 = Math.floor(ox / sc), y0 = Math.floor(oy / sc), x1 = Math.ceil((ox + W) / sc), y1 = Math.ceil((oy + Hh) / sc);
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      if (map.id === "world" && S.seen && !S.seen[y * map.w + x]) continue;
      const t = PM.tileAt(map, x, y);
      g.fillStyle = MC[t] || (map.id === "world" ? ZC[map.z[y * map.w + x]] : "#878f9b");
      g.fillRect(x * sc - ox, y * sc - oy, sc, sc);
    }
    /* towns' names, small */
    if (map.id === "world") for (const tw of Object.values(PM.TOWNS)) {
      if (!S.seen || !S.seen[(tw.y + 2) * map.w + tw.x + 2]) continue;
      g.font = "600 9px 'Barlow Semi Condensed', sans-serif"; g.fillStyle = "rgba(20,22,28,.85)";
      const tx = tw.x * sc - ox, ty = tw.y * sc - oy - 2;
      g.fillText(tw.name, tx + 1, ty + 1); g.fillStyle = "#e9e4d8"; g.fillText(tw.name, tx, ty);
    }
    /* the Vault, once you know */
    if (map.id === "world" && S.flags.locator) {
      const v = map.vaultDoor, vx = v.x * sc - ox, vy = v.y * sc - oy;
      g.strokeStyle = "#e8a33d"; g.lineWidth = 1.5; g.strokeRect(vx - 4, vy - 4, 8, 8);
      if (vx < 0 || vx > W || vy < 0 || vy > Hh) {
        const cx = S.pos.x * sc - ox, cy = S.pos.y * sc - oy, a = Math.atan2(vy - cy, vx - cx), r = 30;
        g.fillStyle = "#e8a33d"; g.beginPath(); g.moveTo(cx + Math.cos(a) * (r + 8), cy + Math.sin(a) * (r + 8)); g.lineTo(cx + Math.cos(a + 0.4) * r, cy + Math.sin(a + 0.4) * r); g.lineTo(cx + Math.cos(a - 0.4) * r, cy + Math.sin(a - 0.4) * r); g.fill();
      }
    }
    g.fillStyle = "#14161c"; g.fillRect(S.pos.x * sc - ox - 2, S.pos.y * sc - oy - 2, sc + 4, sc + 4);
    g.fillStyle = "#ffffff"; g.fillRect(S.pos.x * sc - ox - 1, S.pos.y * sc - oy - 1, sc + 2, sc + 2);
  };

  /* ---- fighting: a unit's card ----
   * o.vs: the unit it aims at (adds a hit chance to each weapon); o.from: where it will stand */
  H.unitCard = (S, B, u, o = {}) => {
    if (!u) return "";
    const C = PM.Combat;
    if (u.kind === "mech") {
      const m = u.m, ch = PM.CHASSIS[m.ch], who = u.side === 0 ? S.chars[u.cid] : null;
      const heat = Math.min(1, m.heat / 30);
      const ws = m.wpn.map((w, i) => {
        const W = PM.WEAPONS[w.w];
        let hit = "";
        if (o.vs && !w.dead) {
          const save = [u.x, u.y]; if (o.from) { u.x = o.from[0]; u.y = o.from[1]; }
          const inR = C.weaponsAt(S, B, u, o.vs).some(x => x.i === i);
          hit = inR ? `${C.hitChance(S, B, u, o.vs, w)}%` : "—";
          u.x = save[0]; u.y = save[1];
        }
        return `<li class="${w.dead ? "dead" : ""}${o.sel && !o.sel.includes(i) ? " off" : ""}"><span>${esc(W.name)}</span><i>${W.n ? `${W.n}×${W.dmg}` : W.dmg} · ${W.range}</i>${W.ammo ? `<em class="num">${w.ammo}</em>` : "<em></em>"}${o.vs ? `<b class="num">${hit}</b>` : ""}</li>`;
      }).join("");
      return `<div class="h-uc"><div class="h-uh">${who ? UI.face(who.look, 2, who.name) : UI.img(PM.mechArt(m.ch, m.paint, 1, "stand", 0), 1, "px mface")}
        <div><b>${esc(u.name)}</b><span class="lbl">${esc(ch.name)} ${esc(ch.model)} · ${ch.tons}t${u.out ? " · " + esc(u.out) : u.shut > 0 ? " · shut down" : ""}</span></div></div>
        <div class="h-ub">${H.doll(m, 54)}<div class="h-us"><div class="h-row"><span class="lbl">Heat</span>${bar(heat, heat > 0.6 ? "hot" : heat > 0.3 ? "warm" : "", 10)}<span class="num">${m.heat}</span></div>
        <div class="h-row"><span class="lbl">Move</span><span class="num">${C.mp(u, "walk")}</span><span class="lbl">run</span><span class="num">${C.mp(u, "run")}</span>${ch.jump ? `<span class="lbl">jump</span><span class="num">${C.mp(u, "jump")}</span>` : ""}</div>
        ${who ? `<div class="h-row"><span class="lbl">Pilot</span><span>gun <b class="num">${who.skills.gun}</b> pilot <b class="num">${who.skills.pilot}</b></span></div>` : `<div class="h-row"><span class="lbl">Pilot</span><span>gun <b class="num">${u.pilot.gun}</b> pilot <b class="num">${u.pilot.pilot}</b></span></div>`}</div></div>
        <ul class="h-ws">${ws}</ul></div>`;
    }
    const A = PM.ARMS[u.weapon] || PM.ARMS.fists, look = u.look;
    const art = u.beast || u.machine ? UI.img(PM.creatureArt(u, 1, "stand", 0), 2, "px mface") : UI.face(look, 2, u.name);
    let hit = "";
    if (o.vs) { const save = [u.x, u.y]; if (o.from) { u.x = o.from[0]; u.y = o.from[1]; } const d = C.dist(u.x, u.y, o.vs.x, o.vs.y); hit = d <= A.range ? `${C.hitChance(S, B, u, o.vs)}%` : "—"; u.x = save[0]; u.y = save[1]; }
    return `<div class="h-uc"><div class="h-uh">${art}<div><b>${esc(u.name)}</b><span class="lbl">${u.beast ? "beast" : u.machine ? "machine" : "on foot"}${u.out ? " · " + esc(u.out) : ""}</span></div></div>
      <div class="h-row"><span class="lbl">Health</span>${bar(Math.max(0, u.hp) / u.hpMax, u.hp < u.hpMax * 0.34 ? "low" : "", 10)}<span class="num">${Math.max(0, u.hp)}</span></div>
      <ul class="h-ws"><li><span>${esc(A.name)}</span><i>${A.dmg} · ${A.range}</i><em></em>${o.vs ? `<b class="num">${hit}</b>` : ""}</li>
      ${u.armor && u.armor !== "none" ? `<li><span>${esc(PM.ARMOR[u.armor].name)}</span><i>-${PM.ARMOR[u.armor].def}</i><em></em></li>` : ""}</ul></div>`;
  };
})();
