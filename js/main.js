/* PumaMech -- boot, title, the walk, and everything between.
 *
 * The greykit.games boot (the canon @gk-title block, STANDARD.md §3), then
 * the game's own title over a living picture of the Bastion: the name, the
 * menu (§6's items and keys, read by the block's own key lookup), the
 * credit. Then the world, a step at a time, and the fights it brings. */
"use strict";
(() => {
  const G = PM.Game, UI = PM.UI, Sc = PM.Screens, R = PM.Render, C = PM.Combat, esc = PM.esc, $ = id => document.getElementById(id);
  const game = PM.game = { mode: "boot", S: null, titleT: 0, held: [], busy: false };
  const SMALL = matchMedia("(max-width: 759px), (max-height: 479px)");

  /* ---- preferences ---- */
  PM.prefs = Object.assign({ numbers: true, odds: true, scan: false, speed: 1 }, PM.store.get(PM.KEY.prefs, {}) || {});
  PM.savePrefs = () => PM.store.set(PM.KEY.prefs, PM.prefs);
  game.applyPrefs = () => { $("stage").classList.toggle("scan", !!PM.prefs.scan); R.STEP_MS = [190, 150, 110][PM.prefs.speed ?? 1]; };

  /* ---- sound on and off (STANDARD.md §8) ---- */
  const readMuted = () => { try { return globalThis.localStorage.getItem("pumamech_muted_v1") === "1"; } catch (e) { return false; } };
  PM.SFX.muted = readMuted();
  game.toggleMute = () => {
    PM.SFX.unlock();
    PM.SFX.setMuted(!PM.SFX.muted);
    try { globalThis.localStorage.setItem("pumamech_muted_v1", PM.SFX.muted ? "1" : "0"); } catch (e) { /* no storage */ }
    syncSound();
    if (!PM.SFX.muted) { PM.SFX.play("menu"); if (game.mode === "title" && !SMALL.matches) PM.SFX.startTune(); }
    game.toast(PM.SFX.muted ? "Sound off" : "Sound on", "", 1200);
  };
  function syncSound() { const b = $("snd"); if (b) { b.setAttribute("aria-pressed", String(!PM.SFX.muted)); b.classList.toggle("muted", PM.SFX.muted); } }
  game.toast = (t, k, ms) => PM.HUD.toast(t, k, ms);

  /* ---- saving ---- */
  game.save = (id = "last") => { if (!game.S || game.mode === "battle") return; PM.Saves.write(id, G.serialize(game.S)); };
  const hasSave = () => !!PM.Saves.read("last");

  /* ---- the title ---- */
  function titleCfg() {
    let meta = "";
    try { const o = JSON.parse(PM.Saves.read("last")); meta = `${o.chars.hero.name}, day ${o.day}`; } catch (e) { /* none */ }
    const any = PM.Saves.any();
    return {
      name: "PumaMech", primary: hasSave() ? "resume" : "new",
      items: [
        hasSave() && { act: "resume", label: "Resume game", key: "R", meta },
        { act: "new", label: "New game", key: "N", meta: "a cadet at the Bastion" },
        { act: "load", label: "Load game", key: "L", meta: any ? "three slots and the last save" : "" },
        "gap",
        { act: "settings", label: "Settings", key: "S" },
        { act: "help", label: "Help", key: "?" },
        { act: "about", label: "About", key: "A" },
      ],
    };
  }
  function titleHTML(cfg) {
    const items = cfg.items.filter(Boolean), gap = items.indexOf("gap");
    const main = items.slice(0, gap), util = items.slice(gap + 1);
    let i = 0;
    const btn = (it, big) => `<button data-act="${it.act}" class="pr${it.act === cfg.primary ? " dflt" : ""}" style="--i:${i++}"><kbd>${esc(it.key)}</kbd><span class="lbl">${esc(it.label)}</span>` + (big && it.meta ? `<span class="meta">${esc(it.meta)}</span>` : "") + "</button>";
    return `<div class="pm-title">
      <canvas class="pm-scene" width="480" height="300" aria-hidden="true"></canvas><div class="pm-shade" aria-hidden="true"></div>
      <main>
        <h1 class="pm-mark" aria-label="PumaMech"><span class="puma">Puma</span><span>Mech</span></h1>
        <p class="pm-sub">The Sunclaws Rise</p>
        <nav class="pm-menu" aria-label="Main menu">${main.map(it => btn(it, true)).join("")}<div class="util">${util.map(it => btn(it, false)).join("")}</div></nav>
      </main>
      <footer class="pm-foot"><span class="gk-credit">${UI.CREDIT}</span></footer>
    </div>`;
  }
  function openTitle() {
    game.mode = "title";
    const el = $("title");
    el.innerHTML = titleHTML(titleCfg());
    el.hidden = false; $("game").hidden = true;
    document.body.classList.add("on-title");
  }
  function revealTitle(print = true) {
    const t = document.querySelector("#title .pm-title");
    if (!t) return;
    if (print) { t.classList.add("pm-print"); game.titleT = 0; }
    const b = t.querySelector(".pm-menu .dflt") || t.querySelector(".pm-menu button");
    if (b) b.focus({ preventScroll: true });
  }
  game.refreshTitle = () => { if (game.mode !== "title") return; openTitle(); revealTitle(false); };
  game.toTitle = () => {
    UI.close(true);
    game.S = null; PM.Battle.B = null;
    PM.SFX.stopLoops();
    game.held = [];
    openTitle(); revealTitle();
    if (!SMALL.matches) PM.SFX.startTune();
  };
  function titleAct(a) {
    PM.SFX.unlock();
    if (a === "resume") return game.loadFrom("last");
    if (a === "new") return Sc.newGame();
    if (a === "load") return Sc.load();
    if (a === "settings") return Sc.settings();
    if (a === "help") return Sc.help();
    if (a === "about") return Sc.about();
  }
  function titleKey(ev) {
    const k = ev.key.length === 1 ? ev.key.toLowerCase() : ev.key;
    if (k === "Enter" || k === " " || k === "Tab" || k === "Shift") return;
    const menu = document.querySelector("#title .pm-menu"), hit = menu && titleKeyButton(menu, k);
    if (hit) { ev.preventDefault(); titleAct(hit.dataset.act); return; }
    if (menu) titleArrow(menu, ev);
  }
  /* the picture: the Bastion's parade ground, cadets' mechs walking out to the range */
  const TITLE_S = { pos: { map: "world", x: 20, y: 22, f: 2 }, flags: {}, party: [], chars: {}, mechs: [], items: {}, vault: {} };
  const WALKERS = [["tabby", "academy", 0], ["marten", "academy", 9], ["bulwark", "academy", 19], ["gnat", "academy", 27]];
  function titleScene(cv, t) {
    const prev = R.cv;
    R.setTarget(cv);
    const cam = [Math.round(12 * 24 + Math.sin(t / 2400) * 30), Math.round(15.6 * 24)];
    R.draw({ S: TITLE_S, cam, noParty: true, noNpcs: true, extra: (list, cx, cy, now) => {
      for (const [ch, paint, off] of WALKERS) {
        const k = ((t / 70 + off * 9) % 260) / 260, x = 10 + k * 26, y = 26.2, fr = Math.floor(t / 9 + off) & 3;
        const c = PM.mechArt(ch, paint, 0, "walk", fr);
        list.push([y + 0.5, c, Math.round(x * 24 - c.ax - cx), Math.round(y * 24 - c.ay - cy)]);
      }
      const c = PM.personArt("cadet", 8, "stand", 0);
      list.push([22.5, c, Math.round(21.5 * 24 - c.ax - cx), Math.round(23 * 24 - 3 - c.ay - cy)]);
    } }, performance.now());
    if (prev) R.setTarget(prev);
  }

  /* ---- starting and loading ---- */
  game.newGame = async ({ name, diff }) => {
    const S = G.create({ name, diff });
    G.see(S, S.pos.x, S.pos.y, 9);
    startWorld(S);
    game.save();
    await UI.say([
      { text: [`<b>Pardalis, the Tawny Reach.</b> A farming world, an ore world, a world with one good spaceport and one mech academy. The academy is called the Bastion, and you have lived there most of your life.`, `Your father, Commander Rane Sunclaw, runs it. In a few days you will have your wings -- if you pass your sorties.`] },
      { who: S.chars.hero.name, look: "cadet", text: [`<span class="note">Walk with the arrows. Walk into a door to go in, into someone to talk. <kbd>J</kbd> is the journal: it always says what to do next. <kbd>P</kbd> is the party; <kbd>Esc</kbd> the menu.</span>`] },
    ], { title: "PumaMech" });
    game.afterPlace();
  };
  game.loadFrom = key => {
    const str = PM.Saves.read(key);
    if (!str) { UI.notice("Load", "There is nothing saved there."); return; }
    let S;
    try { S = G.deserialize(str); } catch (e) { UI.notice("Load", "That save is damaged and cannot be read."); return; }
    UI.close(true);
    startWorld(S);
    if (key !== "last") game.save();
    game.toast(G.clock(S), "", 1600);
  };
  function startWorld(S) {
    game.S = S; game.mode = "explore";
    PM.SFX.stopTune();
    $("title").hidden = true; $("title").innerHTML = "";
    document.body.classList.remove("on-title");
    $("game").hidden = false;
    R.setTarget($("screen"));
    R.resetWalk(S);
    G.see(S, S.pos.x, S.pos.y);
    fit();
    R.draw({ S, snap: true }, performance.now());
    game.refreshHud();
  }
  game.refreshHud = () => { if (game.mode === "explore" && game.S) PM.HUD.explore(game.S); };
  game.afterPlace = () => { if (game.mode === "explore") { game.refreshHud(); game.busy = false; } };

  /* ---- walking ---- */
  const DIR = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0], KeyW: [0, -1], KeyS: [0, 1], KeyA: [-1, 0], KeyD: [1, 0] };
  async function stepOnce(dx, dy) {
    const S = game.S;
    const res = PM.Explore.step(S, dx, dy);
    if (res.moved) { R.stepped(S, performance.now()); if (PM.townAt(S.pos.x, S.pos.y) || S.pos.map === "vault") { if (R.frame & 1) PM.SFX.play("step"); } else PM.SFX.play(R.partyShows(S)[0] && R.partyShows(S)[0].mech ? "stomp" : "step"); }
    let hud = res.moved;
    for (const e of res.ev) {
      if (e.t === "hour" || e.t === "bump") continue;
      game.held = [];
      game.busy = true;
      await handle(e);
      if (game.mode !== "explore") return;
      hud = true;
    }
    if (hud) game.refreshHud();
    game.busy = !!UI.sheet;
  }
  async function handle(e) {
    const S = game.S;
    switch (e.t) {
      case "place": return PM.Places.visit(e.place);
      case "talk": return PM.Places.talk(e.npc);
      case "vault": return PM.Places.vault(e.o);
      case "msg": await UI.notice("", e.text); return game.afterPlace();
      case "enter": {
        const tw = PM.TOWNS[e.town];
        game.toast(tw.name, "", 1600);
        game.save();
        return;
      }
      case "leave": return;
      case "encounter": return encounter(e.group);
      case "spaceport": {
        if (S.flags.portRaided) return;
        const c = await UI.say([{ text: ["The Pact's landing field: two dropships on their feet, bunkers, a turret, and a garrison that has seen you coming. This is no place to wander into by accident.", "<span class=\"note\">Hit it, and it will be a hard fight. Win it, and the Pact's stores are yours.</span>"], choices: [["Attack the landing field", 1], ["Back off", 0]] }], { title: "The landing field" });
        if (c) return game.storyBattle("port", {});
        /* step back out */
        S.pos.x -= 1; R.resetWalk(S);
        return game.afterPlace();
      }
      case "leaveVault": {
        S.pos = { map: "world", x: PM.maps.world.vaultDoor.x, y: PM.maps.world.vaultDoor.y + 1, f: 2 };
        R.resetWalk(S); R.draw({ S, snap: true }, performance.now());
        game.save();
        if (S.flags.signal && !S.flags.won) {
          await UI.say([{ text: ["You come out into the snow -- and the snow is full of grey mechs climbing the trail. At their head, a heavy grey mech with a crest like a wolf's hackles, and on its flank a rank-mark you have only heard about: a <b>Marshal's</b>.", "\"Cubs,\" says a calm voice on every frequency at once. \"You have called a fleet you will not live to see. Step away from the door.\""] }], { title: "Greymane" });
          return game.storyBattle("finale", { cx: 100, cy: 14, foeAt: "south" });
        }
        return game.afterPlace();
      }
      case "story": return storyEvent(e.id);
    }
  }
  async function storyEvent(id) {
    const S = game.S;
    if (id === "bastionGate") {
      const c = await UI.say([{ who: "Pact trooper", look: "trooper", text: ["\"Halt. The Bastion belongs to the Grey Pact.\" Behind the gate, two mechs turn their heads toward you.", "<span class=\"note\">Take the Bastion back, and its Training Hall and barracks are yours again.</span>"], choices: [["Take it back", 1], ["Not yet", 0]] }], { title: "The Bastion's gate" });
      if (c) return game.storyBattle("bastion", { cx: 21, cy: 31 });
      return game.afterPlace();
    }
    if (id === "fernRaid") {
      await UI.say([{ text: ["Smoke over Fernwick. Stoat raiders -- a whole gang of them -- are kicking in doors and loading a cart, bold as brass now the Pact has the militia locked up.", "They see you. They've got guns. They don't think much of yours."] }], { title: "Fernwick" });
      return game.storyBattle("fernRaid", {});
    }
    if (id === "portgateFirst") { await UI.notice("Portgate", "Portgate under occupation: Pact checkpoints at the gates, wolves on the corners, shutters down. People hurry and don't meet your eye. The Rusty Lantern is on the west side, near the gate. The Relay's tower is on the north."); return game.afterPlace(); }
    if (id === "kilnFirst") { await UI.notice("Kiln Hollow", "Kiln Hollow: adobe and dust, a mine head, a cantina, and a lot of people who mind their own business. The first house on the left has a badger's name on the door: TUNNELSON."); return game.afterPlace(); }
    if (id === "vaultGuard") {
      await UI.say([{ text: ["Up the trail the snow is trampled flat by mech feet. A Pact lance is camped across the road, sweeping the slopes with searchlights: they know the Vault is somewhere up here.", "They've seen you."] }], { title: "The Vault road" });
      return game.storyBattle("vaultGuard", {});
    }
  }
  /* a fight met on the road */
  async function encounter(group) {
    const S = game.S;
    PM.SFX.play("alert");
    const onFoot = S.pos.map === "vault" || !!PM.townAt(S.pos.x, S.pos.y);
    game.toast(group.name, "red", 1800);
    await new Promise(r => setTimeout(r, 450));
    beginBattle(C.start(S, group, { onFoot }), null);
  }
  game.storyBattle = (id, o = {}) => {
    const S = game.S, def = PM.Story.BATTLES[id];
    const onFoot = o.onFoot ?? (def.o && def.o.onFoot) ?? S.pos.map === "vault";
    const B = C.start(S, { name: def.name, units: def.units }, { ...(def.o || {}), ...o, onFoot, story: id });
    beginBattle(B, id);
  };
  function beginBattle(B, story) {
    const S = game.S;
    UI.close(true);
    game.mode = "battle"; game.held = [];
    PM.Battle.begin(S, B, async B => {
      const def = story ? PM.Story.BATTLES[story] : null;
      /* a lost training sortie is a lesson, not the end */
      if (B.result === "lost" && def && def.o && def.o.training && !def.o.invasion) {
        delete S.bat;
        for (const c of G.partyChars(S)) c.hp = Math.max(c.hp, Math.ceil(c.hpMax / 2));
        game.mode = "explore"; R.resetWalk(S);
        await UI.notice("Sortie failed", "The drones win this one. The hangar crew drags your Tabby back, tuts, and patches it up. Try again when you're ready.");
        return game.afterPlace();
      }
      if (B.result === "lost" && !(def && def.o && def.o.invasion)) { delete S.bat; game.mode = "explore"; Sc.gameOver(); return; }
      const r = C.finishBattle(S, B);
      game.mode = "explore";
      R.resetWalk(S); R.draw({ S, snap: true }, performance.now());
      game.refreshHud();
      if (!(def && def.o && def.o.invasion)) await Sc.result(r, B);
      await afterStory(story, B);
      game.save();
      game.afterPlace();
    });
  }
  async function afterStory(id, B) {
    const S = game.S, f = S.flags;
    if (!id) return;
    if (id === "sortie1" || id === "sortie2") { f[id] = true; S.mechs.forEach(m => m.ch === "tabby" && G.repairAll(m)); return; }
    if (id === "sortie3") {
      f.sortie3 = true; f.invaded = true;
      const tabby = S.mechs.find(m => m.ch === "tabby");
      tabby.at = "lance"; tabby.pilot = "hero";
      for (const l of PM.LOCS) tabby.armor[l] = Math.floor(tabby.armor[l] * 0.5);
      if (!G.mechUsable(tabby)) { tabby.struct.LL = Math.max(1, tabby.struct.LL); tabby.struct.RL = Math.max(1, tabby.struct.RL); tabby.struct.CT = Math.max(2, tabby.struct.CT); tabby.struct.HD = Math.max(1, tabby.struct.HD); }
      G.news(S, "invasion");
      S.money += 1500;
      S.pos = { map: "world", x: 21, y: 33, f: 2 };
      R.resetWalk(S); G.see(S, S.pos.x, S.pos.y, 8);
      R.draw({ S, snap: true }, performance.now());
      await UI.say([
        { who: "Commander Rane Sunclaw", look: "father", text: [`Your radio crackles. Behind your father's voice: alarms, gunfire, the scream of dropship engines. "${esc(S.chars.hero.name)}. Listen. The Pact is landing on the Bastion -- four dropships, maybe more. We can't hold it."`] },
        { who: "Commander Rane Sunclaw", look: "father", text: [`"Do not come back here. That's an order, cadet, and it's also your father asking. Get to Portgate. Go to the Relay; I've left something for you. You have the signet?"`, `Your paw goes to the ring he gave you this morning, "for luck". It's still there.`, `"Good. Keep it safe. I'm --" The channel fills with static and doesn't clear.`] },
        { text: [`Smoke rises over the Bastion behind you. Grey mechs stand on its walls.`, `In the Tabby's cockpit locker you find an envelope in your father's writing: <i>For emergencies. This is one.</i> Inside, <b>1,500 crowns</b>.`, `Your Tabby is scorched and limping, its heat-sinks ticking. Portgate is south and east, across the river.`, `<span class="note">The journal (<kbd>J</kbd>) knows where to go. In the wilds the Pact's patrols will find you now: you'll fight in your Tabby, and on foot in the towns.</span>`] },
      ], { title: "The invasion" });
      return;
    }
    if (id === "bastion") { f.bastionFree = true; G.news(S, "invasion"); await UI.notice("The Bastion", "The Pact pulls back from the Bastion, dragging its wounded. The gate is yours again: the Training Hall, the barracks and the hangar are open to you."); return; }
    if (id === "port") { f.portRaided = true; S.money += 4000; S.items.medkit += 3; S.items.satchel += 2; await UI.notice("The landing field", "The garrison breaks and runs for its dropships. In the Pact's stores: <b>4,000 crowns</b> in payroll, three medkits and two satchel charges. And a lot of very relieved crane-drivers."); return; }
    if (id === "fernRaid") { f.fernRaid = true; G.news(S, "fernwick"); S.money += 300; await UI.notice("Fernwick", "The last of the raiders bolt for the woods. Fernwick comes out of its houses to cheer, and the elder presses a purse of <b>300 crowns</b> on you. A fox in grease-black overalls is watching from the workshop door."); return; }
    if (id === "vaultGuard") { f.vaultGuard = true; return; }
    if (id === "finale") { f.won = true; Sc.ending(); return; }
  }
  /* for tests in the console: a step as if a key were pressed */
  game.step = (dx, dy) => stepOnce(dx, dy);
  game.enterVault = () => {
    const S = game.S, v = PM.maps.vault;
    S.pos = { map: "vault", x: v.start.x, y: v.start.y, f: 6 };
    R.resetWalk(S); R.draw({ S, snap: true }, performance.now());
    game.save();
    game.afterPlace();
    game.toast("The Founders' Vault", "", 1800);
  };

  /* ---- the loop ---- */
  function frame(now) {
    requestAnimationFrame(frame);
    if (game.mode === "title") {
      const cv = document.querySelector("#title .pm-scene");
      if (cv && !UI.sheet) { titleScene(cv, game.titleT); }
      game.titleT += 1;
      return;
    }
    if (!game.S) return;
    if (game.mode === "explore") {
      if (!UI.sheet && !game.busy && game.held.length && R.walk.k >= 1) {
        const [dx, dy] = DIR[game.held[game.held.length - 1]];
        game.busy = true;
        stepOnce(dx, dy).finally(() => { if (!UI.sheet) game.busy = false; });
      }
      pollPad();
      R.draw({ S: game.S }, now);
    } else if (game.mode === "battle") {
      const v = PM.Battle.view();
      if (v) R.draw(v, now);
      pollPad();
    }
  }

  /* ---- keys ---- */
  document.addEventListener("keydown", ev => {
    PM.SFX.unlock();
    if (game.mode === "title" && !PM.SFX.tune && !SMALL.matches && !UI.sheet) PM.SFX.startTune();
    if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
    if (UI.sheet) { UI.key(ev); return; }
    if (document.querySelector(".pm-ask")) return;
    const k = ev.key.length === 1 ? ev.key.toLowerCase() : ev.key;
    if (k === "m" && !(ev.target.closest && ev.target.closest("input"))) { ev.preventDefault(); game.toggleMute(); return; }
    if (game.mode === "title") { titleKey(ev); return; }
    if (game.mode === "battle") { if (PM.Battle.key(ev)) ev.preventDefault(); else if (k === "Escape") { ev.preventDefault(); } return; }
    if (game.mode !== "explore" || game.busy) { if (DIR[ev.code]) ev.preventDefault(); return; }
    if (DIR[ev.code]) { ev.preventDefault(); if (!game.held.includes(ev.code)) game.held.push(ev.code); return; }
    if (k === "Escape" || k === "p" && false) { ev.preventDefault(); Sc.pause(); return; }
    if (k === "p") { ev.preventDefault(); Sc.party(); return; }
    if (k === "j") { ev.preventDefault(); Sc.journal(); return; }
    if (k === "Tab") { ev.preventDefault(); Sc.map(); return; }
    if (k === "Enter" || k === " ") {
      ev.preventDefault();
      const [dx, dy] = PM.Explore.DIRS[game.S.pos.f] || [0, -1];
      game.busy = true; stepOnce(dx, dy).finally(() => { if (!UI.sheet) game.busy = false; });
    }
  });
  document.addEventListener("keyup", ev => { const i = game.held.indexOf(ev.code); if (i >= 0) game.held.splice(i, 1); });
  addEventListener("blur", () => { game.held = []; });
  document.addEventListener("pointerdown", () => { PM.SFX.unlock(); if (game.mode === "title" && !PM.SFX.tune && !SMALL.matches) PM.SFX.startTune(); }, true);
  document.addEventListener("pointerover", ev => {
    if (ev.pointerType !== "mouse") return;
    const b = ev.target.closest && ev.target.closest("button:not(:disabled), summary");
    if (!b || b === document.activeElement || !b.closest(".pm-sheet, .pm-ask, #title") || b.closest(".sh-head")) return;
    const a = document.activeElement;
    if (a && a.matches("input")) return;
    if (document.querySelector(".pm-ask") && !b.closest(".pm-ask")) return;
    b.focus({ preventScroll: true });
  });
  $("title").addEventListener("click", ev => { const b = ev.target.closest("[data-act]"); if (b) titleAct(b.dataset.act); });
  $("snd").addEventListener("click", () => game.toggleMute());
  $("pausebtn").addEventListener("click", () => { if (game.mode === "explore" && !UI.sheet) Sc.pause(); });
  /* the mouse on the field: in a fight, the cursor */
  const tileOf = ev => { const r = $("screen").getBoundingClientRect(); return R.tileAtScreen((ev.clientX - r.left) / r.width * PM.K.VW, (ev.clientY - r.top) / r.height * PM.K.VH); };
  $("screen").addEventListener("pointermove", ev => { if (game.mode === "battle" && ev.pointerType === "mouse") { const [x, y] = tileOf(ev); PM.Battle.point(x, y, false); } });
  $("screen").addEventListener("pointerdown", ev => { if (game.mode === "battle" && ev.button === 0) { const [x, y] = tileOf(ev); PM.Battle.point(x, y, true); } });
  $("screen").addEventListener("contextmenu", ev => ev.preventDefault());

  /* ---- a gamepad: the stick or d-pad walks, A chooses, B backs, Start pauses ---- */
  let padPrev = {};
  function pollPad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const p = pads && [...pads].find(Boolean);
    if (!p) return;
    const ax = p.axes[0] || 0, ay = p.axes[1] || 0, b = i => !!(p.buttons[i] && p.buttons[i].pressed);
    const now = { up: ay < -0.5 || b(12), down: ay > 0.5 || b(13), left: ax < -0.5 || b(14), right: ax > 0.5 || b(15), a: b(0), b: b(1), start: b(9), y: b(3), x: b(2) };
    const fresh = k => now[k] && !padPrev[k];
    const send = key => document.dispatchEvent(new KeyboardEvent("keydown", { key, code: { ArrowUp: "ArrowUp", ArrowDown: "ArrowDown", ArrowLeft: "ArrowLeft", ArrowRight: "ArrowRight" }[key] || "", bubbles: true }));
    if (game.mode === "explore" && !UI.sheet) {
      game.held = [];
      for (const [k, code] of [["up", "ArrowUp"], ["down", "ArrowDown"], ["left", "ArrowLeft"], ["right", "ArrowRight"]]) if (now[k]) game.held.push(code);
    } else for (const [k, key] of [["up", "ArrowUp"], ["down", "ArrowDown"], ["left", "ArrowLeft"], ["right", "ArrowRight"]]) if (fresh(k)) send(key);
    if (fresh("a")) { if (document.activeElement && document.activeElement.click && UI.sheet) document.activeElement.click(); else send("Enter"); }
    if (fresh("b")) send("Escape");
    if (fresh("start")) send("Escape");
    if (fresh("y")) send(game.mode === "battle" ? "Tab" : "j");
    if (fresh("x")) send(game.mode === "battle" ? " " : "p");
    padPrev = now;
  }

  /* ---- the stage, as big as fits, square pixels ---- */
  function fit() {
    const VW = PM.K.VW, VH = PM.K.VH, s0 = Math.min(innerWidth / VW, innerHeight / VH), si = Math.floor(s0);
    const s = si >= 2 && si / s0 > 0.86 ? si : s0;
    const st = $("stage"), w = Math.floor(VW * s), h = Math.floor(VH * s);
    st.style.width = w + "px"; st.style.height = h + "px";
    st.style.left = Math.floor((innerWidth - w) / 2) + "px"; st.style.top = Math.floor((innerHeight - h) / 2) + "px";
    st.style.setProperty("--k", (s / 3).toFixed(3));
  }
  addEventListener("resize", fit);

  /* ---- boot ---- */
  function boot() {
    R.init($("screen"));
    PM.HUD.init();
    game.applyPrefs(); syncSound();
    injectTitleCSS();
    fit();
    const run = SMALL.matches ? { finish: async () => {} } : runBoot({ lines: [bootReloadLine(), "chassis: ok", "lance on the gantry"] });
    openTitle();
    run.finish([hasSave() ? "a game in progress" : "no cadet on the rolls"]).then(() => {
      revealTitle();
      const q = new URLSearchParams(location.search);
      /* debug: ?quick=1 starts a new game at once; ?at=x,y places the party; &invaded=1 skips the academy */
      if (q.has("quick")) {
        const S = G.create({ name: "Jace", diff: 1, seed: 7 });
        if (q.has("invaded")) { S.flags.invaded = S.flags.metFather = S.flags.sortie1 = S.flags.sortie2 = S.flags.sortie3 = true; const t = S.mechs[0]; t.at = "lance"; S.pos = { map: "world", x: 21, y: 33, f: 2 }; }
        if (q.has("at")) { const [x, y] = q.get("at").split(",").map(Number); S.pos.x = x; S.pos.y = y; }
        if (q.has("lance")) { S.flags.invaded = true; for (const id of ["pip", "mags", "bracken"]) { S.chars[id] = G.newChar(id); S.party.push(id); } for (const [ch, who] of [["bulwark", "pip"], ["marten", "mags"], ["skink", "bracken"]]) { const m = G.newMech(S, ch, "claw"); m.pilot = who; S.mechs.push(m); } S.mechs[0].at = "lance"; }
        if (q.has("money")) S.money = +q.get("money");
        if (q.has("vault")) { S.flags.relay = S.flags.metBrock = S.flags.locator = S.flags.vaultIn = true; }
        startWorld(S);
        if (q.has("vault")) game.enterVault();
        if (q.get("fight")) game.storyBattle(q.get("fight"), {});
      }
    });
    requestAnimationFrame(frame);
  }
  boot();
})();
