/* PumaMech -- the sheets that are not a place: starting a game, loading
 * one, Settings, Help, About, the pause menu, the party, the journal, the
 * map, what a fight came to, and the end. */
"use strict";
(() => {
  const esc = PM.esc, G = PM.Game, UI = PM.UI;
  const Sc = PM.Screens = {};
  const game = () => PM.game;
  const first = c => c.name.split(" ")[0];

  /* ---- a new game: name the cadet, pick how hard ---- */
  Sc.newGame = () => {
    let diff = 1, name = "Jace";
    UI.open("A new cadet", { wide: false, back: () => game().toTitle(),
      html: () => `<div class="newgame">${UI.face("cadet", 4, "the cadet")}<div>
        <p class="lede">Third-year cadet at the Bastion, Pardalis's mech academy. Commander Rane Sunclaw's only child. What do they call you?</p>
        <div class="row"><label class="sr" for="pm-name">The cadet's name</label><input id="pm-name" maxlength="14" value="${esc(name)}" autocomplete="off" spellcheck="false"></div>
        <h3>How hard</h3>
        <div class="diffs">${[["Recruit", "The Pact shoots worse and meets you less often."], ["Regular", "As it was meant to be played."], ["Veteran", "The Pact shoots straighter, and it is everywhere."]].map(([n, d], i) =>
          `<button data-diff="${i}" class="${i === diff ? "primary" : ""}"><b>${n}</b><span>${d}</span></button>`).join("")}</div>
        <div class="row end"><button class="primary" data-go>Report to the Bastion</button></div></div></div>`,
      onClick: (b, api) => {
        const i = document.getElementById("pm-name"); if (i) name = i.value.trim() || "Jace";
        if (b.dataset.diff) { diff = +b.dataset.diff; api.refresh(); return; }
        if (b.hasAttribute("data-go")) { UI.close(true); game().newGame({ name, diff }); }
      },
      onKey: ev => { if (ev.key === "Enter" && document.activeElement && document.activeElement.id === "pm-name") { ev.preventDefault(); const i = document.getElementById("pm-name"); name = i.value.trim() || "Jace"; UI.close(true); game().newGame({ name, diff }); return true; } return false; },
    });
  };

  /* ---- the saved games ---- */
  const describe = str => { try { const o = JSON.parse(str); return `${o.chars.hero.name} · day ${o.day} · ${o.party.length} in the party · ${PM.cr(o.money)}`; } catch (e) { return "damaged"; } };
  Sc.load = (back) => {
    const rows = [["Last save", "last"], ...[1, 2, 3].map(n => [`Slot ${n}`, n])].map(([n, k]) => [n, k, PM.Saves.read(k)]);
    UI.open("Load a game", { back: back || (() => game().toTitle()),
      html: () => `<div class="col">${rows.map(([n, k, v]) => `<button data-load="${k}" ${v ? "" : "disabled"}>${esc(n)} <span>${v ? esc(describe(v)) : "empty"}</span></button>`).join("")}</div>`,
      onClick: b => { if (b.dataset.load) { UI.close(true); game().loadFrom(b.dataset.load === "last" ? "last" : +b.dataset.load); } },
    });
  };
  Sc.saveSlots = back => {
    UI.open("Save the game", { back,
      html: () => `<p class="lede">The game also saves itself whenever you rest, enter a town, or win a fight.</p><div class="col">${[1, 2, 3].map(n => { const v = PM.Saves.read(n); return `<button data-slot="${n}">Slot ${n} <span>${v ? esc(describe(v)) : "empty"}</span></button>`; }).join("")}</div>`,
      onClick: async (b, api) => {
        if (!b.dataset.slot) return;
        game().save(+b.dataset.slot); game().save();
        game().toast(`Saved to slot ${b.dataset.slot}`, "green"); api.refresh();
      },
    });
  };

  /* ---- Settings: the game's own, sound, speed, this browser (STANDARD §7) ---- */
  Sc.settings = back => {
    const p = PM.prefs;
    UI.open("Settings", { back: back || null, closable: true,
      html: () => `<h3>The game</h3><table class="aids"><tbody>
          <tr><td>Damage numbers over heads in a fight</td><td class="act"><button class="pill${p.numbers ? " on" : ""}" data-p="numbers">${p.numbers ? "On" : "Off"}</button></td></tr>
          <tr><td>Show hit chances on the target card</td><td class="act"><button class="pill${p.odds ? " on" : ""}" data-p="odds">${p.odds ? "On" : "Off"}</button></td></tr>
          <tr><td>Scanlines over the field</td><td class="act"><button class="pill${p.scan ? " on" : ""}" data-p="scan">${p.scan ? "On" : "Off"}</button></td></tr></tbody></table>
        <h3>Sound</h3><div class="row"><button class="pill${!PM.SFX.muted ? " on" : ""}" data-snd="on">On</button><button class="pill${PM.SFX.muted ? " on" : ""}" data-snd="off">Off</button></div>
        <h3>Speed</h3><p class="note">How fast a round of a fight plays out, and how fast the party walks.</p><div class="row">${["Slow", "Normal", "Fast"].map((n, i) => `<button class="pill${p.speed === i ? " on" : ""}" data-speed="${i}">${n}</button>`).join("")}</div>
        <h3>This browser</h3><div class="row"><button class="danger" data-forget>Forget everything</button></div>
        <p class="note">Clears the saved game, the three save slots, these settings and the sound choice: everything PumaMech keeps in this browser.</p>`,
      onClick: async (b, api) => {
        if (b.dataset.p) { p[b.dataset.p] = !p[b.dataset.p]; PM.savePrefs(); game().applyPrefs(); api.refresh(); }
        if (b.dataset.snd) { if ((b.dataset.snd === "off") !== PM.SFX.muted) game().toggleMute(); api.refresh(); }
        if (b.dataset.speed) { p.speed = +b.dataset.speed; PM.savePrefs(); game().applyPrefs(); api.refresh(); }
        if (b.hasAttribute("data-forget")) {
          if (await UI.ask("Forget everything PumaMech has saved in this browser: the game in progress, the save slots, settings and sound? This cannot be undone.", "Forget everything")) forgetEverything();
        }
      },
    });
  };
  function forgetEverything() {
    for (const area of ["localStorage", "sessionStorage"]) {
      try {
        const s = window[area];
        for (let i = s.length - 1; i >= 0; i--) {
          const k = s.key(i);
          if (k && k.startsWith("pumamech")) s.removeItem(k);
        }
      } catch (e) { /* no storage */ }
    }
    location.reload();
  }

  /* ---- Help ---- */
  const KEYS = [["Arrows, WASD", "walk; in a fight, move the cursor"], ["Enter, Space", "talk, choose; in a fight, confirm"], ["P", "the party: people, mechs, kit"], ["J", "the journal: what to do next"], ["Tab", "the map"], ["Esc", "the menu; in a fight, back a step"], ["M", "sound on and off"]];
  const FKEYS = [["Enter", "move here / fire on this target"], ["Space", "stand still (move) / no attack (act)"], ["R", "run (further, hotter, harder to aim)"], ["J", "jump, for mechs with jump jets"], ["Tab, [ ]", "next or previous target"], ["F", "fire everything, or only what's cool"], ["K, U", "kick, punch (a mech, next to its target)"], ["X", "satchel charge (on foot, next to a mech)"], ["H", "medkit (on foot, self or a friend next to you)"], ["D", "take cover"], ["A", "let the unit decide for itself"], ["Q", "the whole lance tries to break off and retreat"]];
  Sc.help = back => UI.open("Help", { back: back || null, tabs: [
    ["How to play", `<p class="lede">You are a puma cadet at the Bastion, Pardalis's mech academy, a few days from your wings. Then the Grey Pact lands.</p>
      <p>Walk the world a tile at a time. Walk into a door to go in, into someone to talk to them. Towns have inns to rest and save, shops, a mech yard, a bank with a stock exchange, and people with things to say. Out in the wilds you will be found: by wild drakes, stoat raiders, and the Pact's patrols and lances.</p>
      <p>Fights are rounds of orders. For each of your people or mechs: <b>where to move</b> (walk, run or jump) and then <b>what to do</b> (fire on a target, kick, use a satchel charge or a medkit, take cover). Then the round plays out, everyone at once. Mechs are hit in a location; shoot one away and its weapons go with it. A head or centre torso shot through finishes a mech. Weapons and running make heat; a hot mech aims badly and shuts down.</p>
      <p>Beat a mech without blowing it apart -- its pilot ejects, or its legs go -- and you can <b>salvage</b> it. It is hauled to the mech yard, where you can repair it and give it a pilot, or sell it. Up to four mechs travel with you; six people.</p>
      <p>Money: salvage, what your enemies carry, and the <b>Exchange</b>, whose prices move every morning, and hard on the news.</p>
      <p>Lost? Press <kbd>J</kbd>.</p>`],
    ["Keys", `<table class="keys"><tbody>${KEYS.map(([k, d]) => `<tr><td>${esc(k)}</td><td>${esc(d)}</td></tr>`).join("")}</tbody></table><h3>In a fight</h3><table class="keys"><tbody>${FKEYS.map(([k, d]) => `<tr><td>${esc(k)}</td><td>${esc(d)}</td></tr>`).join("")}</tbody></table><p class="note">A gamepad works: the stick walks, A chooses, B goes back, Start is the menu.</p>`],
    ["Mechs", `<table class="shop"><tbody>${Object.entries(PM.CHASSIS).filter(([k]) => k !== "drone").map(([k, c]) => `<tr><td>${UI.mechImg(k, k === "marshal" || k === "howler" ? "wolf" : ["sunclaw", "sabre", "dawn"].includes(k) ? "founders" : "claw", 1)}</td><td><b>${esc(c.name)}</b> <span class="note">${esc(c.model)} · ${c.tons}t · walk ${c.walk}${c.jump ? ` · jump ${c.jump}` : ""}</span><br><span class="note">${esc(c.role)}</span></td></tr>`).join("")}</tbody></table>`],
    ["About", aboutHTML()],
  ] });
  function aboutHTML() {
    return `<p class="lede"><b>PumaMech</b>: a remake of <i>BattleTech: The Crescent Hawk's Inception</i> (Westwood Associates for Infocom, 1988; Commodore 64, 1989), with a puma cadet.</p>
      <p>Everything here is our own: the world of Pardalis, the Grey Pact, the mechs and their names, the story and every word of it. Only the shape of the game is the 1988 one: the academy and its sorties, the invasion, an occupied city, a lance gathered from misfits, rounds of orders, salvage, the stock market, and a cache under the mountains opened by colour-coded keys.</p>
      <p>Every picture is drawn and every sound made in the page. Nothing is fetched while you play.</p>
      <p class="gk-credit">${UI.CREDIT}</p>`;
  }
  Sc.about = back => UI.open("About", { back: back || null, html: aboutHTML });

  /* ---- the pause menu ---- */
  Sc.pause = () => {
    const S = game().S;
    UI.open("Paused", { popup: true, closable: true,
      html: () => `<h3 class="mname">${esc(PM.HUD.where(S)[0])}</h3><p class="meta">${G.clock(S)} · ${PM.cr(S.money)}</p>
        <div class="col"><button data-a="resume" class="primary">Resume</button><button data-a="party">Party</button><button data-a="journal">Journal</button><button data-a="map">Map</button><button data-a="save">Save</button><button data-a="load">Load</button><button data-a="settings">Settings</button><button data-a="help">Help</button><button data-a="quit">Quit to the title</button></div>
        <div class="keys"><kbd>P</kbd> party · <kbd>J</kbd> journal · <kbd>Tab</kbd> map · <kbd>M</kbd> sound</div>`,
      onClick: async b => {
        const a = b.dataset.a, back = () => Sc.pause();
        if (a === "resume") UI.close();
        if (a === "party") Sc.party(back);
        if (a === "journal") Sc.journal(back);
        if (a === "map") Sc.map(back);
        if (a === "save") Sc.saveSlots(back);
        if (a === "load") Sc.load(back);
        if (a === "settings") Sc.settings(back);
        if (a === "help") Sc.help(back);
        if (a === "quit") { UI.close(true); game().save(); game().toTitle(); }
      },
      onClose: () => game().afterPlace(),
    });
  };

  /* ---- the party ---- */
  Sc.party = back => {
    const S = game().S;
    let who = S.party[0];
    const open = () => UI.open("The party", { back: back || null, wide: true,
      html: () => {
        const c = S.chars[who], m = G.mechOf(S, c.id), A = PM.ARMS[c.weapon] || PM.ARMS.fists, R = PM.ARMOR[c.armor] || PM.ARMOR.none;
        return `<div class="row">${G.partyChars(S).map(p => `<button class="pill${p.id === who ? " on" : ""}" data-who="${p.id}">${esc(first(p))}</button>`).join("")}</div>
        <div class="member">${UI.face(c.look, 5, c.name)}<div>
          <h3 class="mname">${esc(c.name)}</h3><p class="meta">${esc(PM.CAST[c.id] ? PM.CAST[c.id].bio : "")}</p>
          <table class="shop"><tbody><tr><td>Health</td><td class="num">${c.hp} / ${c.hpMax}</td><td>${PM.HUD.bar(c.hp / c.hpMax, c.hp < c.hpMax / 3 ? "low" : "", 12)}</td></tr>
          <tr><td>Weapon</td><td colspan="2">${esc(A.name)} <span class="note">· ${A.dmg} damage, reach ${A.range}</span></td></tr>
          <tr><td>Armour</td><td colspan="2">${esc(R.name)} <span class="note">· stops ${R.def}</span></td></tr>
          ${PM.SKILLS.map(([k, n, d]) => `<tr><td>${n}</td><td class="num">${c.skills[k]}</td><td>${PM.HUD.bar(c.skills[k] / 10, "", 10)} <span class="note">${esc(d)}</span></td></tr>`).join("")}</tbody></table>
          ${c.id !== "hero" ? `<div class="row"><button data-leave="${c.id}" class="quiet">Leave ${esc(first(c))} at the inn</button></div>` : ""}
        </div><div class="mbox">${m ? `${UI.mechImg(m.ch, m.paint, 3, G.mechUsable(m) ? "stand" : "down")}<b>${esc(PM.CHASSIS[m.ch].name)}</b><span class="note">${Math.round(G.mechCondition(m) * 100)}% · ${esc(PM.CHASSIS[m.ch].model)}</span>${PM.HUD.doll(m, 64)}` : `<p class="note">No mech. Give ${esc(first(c))} one at a mech yard.</p>`}</div></div>
        <h3>Kit</h3><p>${Object.entries(S.items).map(([k, n]) => `${esc(PM.ITEMS[k].name)}: <b class="num">${n}</b>`).join(" · ")} · Crowns: <b class="num">${S.money.toLocaleString("en-US")}</b> in hand, <b class="num">${S.bank.toLocaleString("en-US")}</b> banked</p>
        ${S.items.repair > 0 && G.lance(S).length ? `<div class="row">${G.lance(S).map(x => `<button data-kit="${x.uid}">Field repair kit on the ${esc(PM.CHASSIS[x.ch].name)}</button>`).join("")}</div>` : ""}
        ${S.items.medkit > 0 ? `<div class="row"><button data-med>Use a medkit on ${esc(first(c))}</button></div>` : ""}`;
      },
      onClick: async (b, api) => {
        if (b.dataset.who) { who = b.dataset.who; api.refresh(); return; }
        if (b.dataset.kit) { const m = S.mechs.find(x => x.uid === +b.dataset.kit), mx = G.mechMax(m); let pool = 12; for (const l of PM.LOCS) { const put = Math.min(pool, mx.armor[l] - m.armor[l]); m.armor[l] += put; pool -= put; } S.items.repair--; PM.SFX.play("clang"); api.refresh(); return; }
        if (b.hasAttribute("data-med")) { const c = S.chars[who]; c.hp = Math.min(c.hpMax, c.hp + 10 + G.bestSkill(S, "medic") * 2); S.items.medkit--; PM.SFX.play("pod"); api.refresh(); return; }
        if (b.dataset.leave) {
          UI.sheet.el.hidden = true;
          const c = S.chars[b.dataset.leave];
          if (await UI.ask(`Leave ${c.name} behind? They will go back to where you found them, and you can ask them again.`, "Leave them")) {
            S.party = S.party.filter(id => id !== c.id);
            for (const m of S.mechs) if (m.pilot === c.id) m.pilot = null;
            who = S.party[0];
          }
          open();
        }
      },
      onClose: () => game().afterPlace(),
    });
    open();
  };

  /* ---- the journal ---- */
  Sc.journal = back => {
    const S = game().S, v = S.vault;
    UI.open("Journal", { back: back || null,
      html: () => `<h3>Next</h3><p class="lede">${esc(PM.Story.objective(S))}</p>
        ${S.flags.vaultIn ? `<h3>The Vault</h3><p>Power: <b>${v.power ? "on" : "off"}</b> · Card: <b class="c-red">${S.card.red || "—"}</b> <b class="c-blue">${S.card.blue || "—"}</b> <b class="c-yellow">${S.card.yellow || "—"}</b></p>
          ${v.map ? `<table class="codes"><tbody>${[1, 2, 3].map(n => `<tr><td>Door ${n}${v.open[n] ? " · open" : ""}</td><td class="c-red">${PM.VDOORS[n][0]}</td><td class="c-blue">${PM.VDOORS[n][1]}</td><td class="c-yellow">${PM.VDOORS[n][2]}</td></tr>`).join("")}</tbody></table>` : `<p class="note">You have not found the star table yet.</p>`}` : ""}
        <h3>News</h3>${S.news.length ? `<ul>${S.news.slice(0, 6).map(n => `<li><span class="note">Day ${n.day}:</span> ${esc(n.text)}</li>`).join("")}</ul>` : `<p class="note">Nothing yet.</p>`}
        <h3>Record</h3><p>${S.stats.battles} fights · ${S.stats.mechKills} mechs beaten · ${S.stats.kills} foes on foot · ${G.clock(S)}</p>`,
      onClose: () => game().afterPlace(),
    });
  };

  /* ---- the map: all that has been seen ---- */
  Sc.map = back => {
    const S = game().S, W = PM.maps.world;
    const cv = PM.K.mk(W.w * 4, W.h * 4), g = cv.getContext("2d");
    g.fillStyle = "#16181e"; g.fillRect(0, 0, cv.width, cv.height);
    const saved = S.pos.map;
    const tmp = document.createElement("canvas"); tmp.width = cv.width; tmp.height = cv.height; tmp.id = "h-mini-big";
    /* draw the world at four pixels a tile */
    const fake = { ...S, pos: { ...S.pos, map: "world", x: saved === "world" ? S.pos.x : W.vaultDoor.x, y: saved === "world" ? S.pos.y : W.vaultDoor.y } };
    const holder = document.createElement("div"); holder.appendChild(tmp);
    UI.open("Map of Pardalis", { back: back || null, wide: true,
      html: () => `<div class="bigmap"><canvas id="pm-bigmap" width="${W.w * 5}" height="${W.h * 5}"></canvas><div class="legend"><p class="lede">${esc(PM.Story.objective(S))}</p>
        <p class="note">Only what the party has seen is drawn. ${S.flags.locator ? "The amber square is the Vault." : ""}</p></div></div>`,
      onClose: () => game().afterPlace(),
    });
    const big = document.getElementById("pm-bigmap");
    if (big) {
      const gg = big.getContext("2d");
      const MC = (x, y) => { const t = PM.tileAt(W, x, y); return { [PM.T.WATER]: "#4f7fa3", [PM.T.ICE]: "#c4e1ee", [PM.T.TREE]: "#3e6534", [PM.T.BUSH]: "#6f9a48", [PM.T.BAD]: "#7d6a58", [PM.T.ROCK]: "#8f8b82", [PM.T.DIRT]: "#c7a36f", [PM.T.BRIDGE]: "#a98252", [PM.T.PAVE]: "#c3bfb4", [PM.T.BLDG]: "#9a4636", [PM.T.WALL]: "#e6d3b0", [PM.T.ROAD]: "#7f8284", [PM.T.FIELD]: "#c9b45a", [PM.T.WIRE]: "#ddd6c6" }[t] || ["#d7b075", "#86b24c", "#e6ecf4"][W.z[y * W.w + x]]; };
      gg.fillStyle = "#16181e"; gg.fillRect(0, 0, big.width, big.height);
      for (let y = 0; y < W.h; y++) for (let x = 0; x < W.w; x++) if (S.seen && S.seen[y * W.w + x]) { gg.fillStyle = MC(x, y); gg.fillRect(x * 5, y * 5, 5, 5); }
      gg.font = "600 13px 'Barlow Semi Condensed', sans-serif";
      for (const tw of Object.values(PM.TOWNS)) if (S.seen && S.seen[(tw.y + 2) * W.w + tw.x + 2]) { gg.fillStyle = "rgba(20,22,28,.85)"; gg.fillText(tw.name, tw.x * 5 + 1, tw.y * 5 - 3); gg.fillStyle = "#e9e4d8"; gg.fillText(tw.name, tw.x * 5, tw.y * 5 - 4); }
      if (S.flags.locator) { gg.strokeStyle = "#e8a33d"; gg.lineWidth = 2; gg.strokeRect(W.vaultDoor.x * 5 - 6, W.vaultDoor.y * 5 - 6, 12, 12); }
      const px = fake.pos.x * 5, py = fake.pos.y * 5;
      gg.fillStyle = "#14161c"; gg.fillRect(px - 3, py - 3, 11, 11); gg.fillStyle = "#ffffff"; gg.fillRect(px - 1, py - 1, 7, 7);
    }
  };

  /* ---- after a fight ---- */
  Sc.result = (r, B) => new Promise(resolve => {
    const S = game().S;
    const won = r.result === "won", fled = r.result === "fled";
    UI.open(won ? "Victory" : fled ? "Broken off" : "Defeat", { closable: false,
      html: () => `<h3 class="mname big ${won ? "ok" : fled ? "warn" : "danger"}">${esc(B.name)}</h3>
        <p class="meta">${won ? "The field is yours." : fled ? "You got clear. They'll still be out there." : ""}</p>
        <table class="merit"><tbody>
          ${won && r.loot ? `<tr><td>Crowns from the fallen</td><td class="num">${r.loot}</td></tr>` : ""}
          ${won && r.scrap ? `<tr><td>Scrap from the wrecks</td><td class="num">${r.scrap}</td></tr>` : ""}
          ${r.items.length ? `<tr><td>Found</td><td>${esc(r.items.join(", "))}</td></tr>` : ""}
          ${r.repaired ? `<tr><td>Armour patched in the field</td><td class="num">${r.repaired}</td></tr>` : ""}
          ${r.healed ? `<tr><td>Wounds dressed</td><td class="num">${r.healed}</td></tr>` : ""}
        </tbody></table>
        ${r.salvage.length ? `<h3>Salvage</h3><ul class="mechs">${r.salvage.map(m => `<li class="mechrow">${UI.mechImg(m.ch, m.paint, 2, PM.Game.mechLegless(m) ? "down" : "stand")}<div class="who"><b>${esc(PM.CHASSIS[m.ch].name)}</b><span class="note">${Math.round(G.mechCondition(m) * 100)}% · hauled to the yard</span></div><div></div><div></div></li>`).join("")}</ul>` : ""}
        ${r.ups.length ? `<h3>Learned</h3><p>${r.ups.map(esc).join(" · ")}</p>` : ""}
        <div class="row end"><button class="primary" data-ok>Go on</button></div>`,
      onClick: b => { if (b.hasAttribute("data-ok")) { UI.close(true); resolve(); } },
      onKey: ev => { if (ev.key === "Escape") { ev.preventDefault(); UI.close(true); resolve(); return true; } return false; },
    });
  });
  Sc.gameOver = () => {
    UI.open("Defeat", { closable: false,
      html: () => `<h3 class="mname big danger">The lance has fallen</h3><p class="lede">The Pact's troopers pick through the wreckage and haul away whoever is still breathing. Pardalis will have to wait for someone else.</p>
        <div class="row end"><button data-a="load" class="primary">Load the last save</button><button data-a="title">To the title</button></div>`,
      onClick: b => { UI.close(true); if (b.dataset.a === "load") game().loadFrom("last"); else game().toTitle(); },
    });
  };
  Sc.ending = () => {
    const S = game().S, h = S.chars.hero;
    /* who stood at the door: the lance as it actually is */
    const WHO = { pip: "a raccoon who picks locks", mags: "a bear who won't walk", bracken: "a fox with two wrenches", wren: "an otter surgeon", quill: "a hare with a rifle" };
    const rest = S.party.filter(id => WHO[id]).map(id => WHO[id]);
    const roll = ["a third-year cadet", ...rest].join(", ").replace(/, ([^,]*)$/, rest.length ? ", and $1" : "$1");
    const founders = S.mechs.filter(m => ["sunclaw", "sabre", "dawn"].includes(m.ch)).length;
    UI.say([
      { who: "Marshal Greymane", look: "marshalW", text: [`The Grey Marshal goes down on one knee in the snow and its cockpit opens. The wolf who climbs out is old, grey to the tips of his ears, and very calm. "Fourteen days," he says. "You know what my fleet can do in fourteen days, cub?"`, `"Less than you'd hope," says a voice behind you. You know it before you turn round.`] },
      { who: "Commander Rane Sunclaw", look: "father", text: [`He's thinner and he's limping and there's a Pact prisoner's tag still on his collar, but it's him. "Brock got word to the miners at the landing field. A hare called Ashby let the rest of us out of the crane sheds about an hour ago." He looks at you, then at your lance, then at you again. "I told you not to come alone."`, `"I didn't," you say.`] },
      { text: [`The Concord Fleet arrives on the thirteenth day, a day early, to find the Grey Pact already packing. Marshal Greymane surrenders his sword -- he actually has one -- to a puma cadet who never did get their wings.`, `They get something better. The Bastion re-opens with a new unit on its rolls, drawn up from ${roll}${founders ? `, and ${founders === 3 ? "three mechs" : founders === 2 ? "two mechs" : "a mech"} older than the colony` : ""}.`, `<b>The Sunclaws.</b>`] },
    ], { title: "The Sunclaws Rise" }).then(() => {
      S.flags.won = true; game().save();
      UI.open("The end", { closable: false, html: () => `<h3 class="mname big ok">The Sunclaws Rise</h3><p class="lede">${esc(h.name)} and the Sunclaws held the Founders' Vault, called the Concord Fleet, and saved Pardalis in ${S.day} days.</p>
        <p>${S.stats.battles} fights · ${S.stats.mechKills} mechs beaten · ${PM.cr(S.money + S.bank)} to the unit's name.</p><p class="note">Your game is saved: you can keep walking Pardalis, and the Exchange is still open.</p>
        <p class="gk-credit">${UI.CREDIT}</p><div class="row end"><button class="primary" data-a="go">Keep playing</button><button data-a="title">To the title</button></div>`,
        onClick: b => { UI.close(true); if (b.dataset.a === "title") game().toTitle(); else game().afterPlace(); } });
    });
  };
})();
