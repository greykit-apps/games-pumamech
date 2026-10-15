/* PumaMech -- the game's state: the party, the mechs, money, time, the
 * market, and saving. DOM-free.
 *
 * Everything that is kept lives in one plain object, S, so a save is
 * JSON.stringify(S). Dice come from PM.rand(S), so a game replays the same
 * from the same seed and the same choices. */
"use strict";
(() => {
  const G = PM.Game = {};
  const R = S => PM.rand(S);
  G.roll = (S, n) => Math.floor(R(S) * n);
  G.chance = (S, p) => R(S) < p;

  /* ---- a mech, fresh from the factory (or the Vault) ---- */
  G.newMech = (S, ch, paint = "claw", o = {}) => {
    const C = PM.CHASSIS[ch], st = PM.structure(C.tons);
    const armor = {};
    for (const l of PM.LOCS) armor[l] = Math.round((l === "HD" ? 9 : st[l] * 2) * C.armor * PM.ARMOR_K);
    const m = { uid: (S.nextUid = (S.nextUid || 100) + 1), ch, paint, armor, struct: { ...st }, heat: 0,
      wpn: C.weapons.map(([w, loc]) => ({ w, loc, ammo: PM.WEAPONS[w].ammo || 0, dead: false })),
      pilot: null, at: o.at || "lance" };
    return m;
  };
  G.mechMax = m => {
    const C = PM.CHASSIS[m.ch], st = PM.structure(C.tons), a = {};
    for (const l of PM.LOCS) a[l] = Math.round((l === "HD" ? 9 : st[l] * 2) * C.armor * PM.ARMOR_K);
    return { armor: a, struct: st };
  };
  /* how whole it is, 0..1, and whether it can walk out of a yard */
  G.mechCondition = m => {
    const mx = G.mechMax(m);
    let have = 0, full = 0;
    for (const l of PM.LOCS) { have += m.armor[l] + m.struct[l] * 2; full += mx.armor[l] + mx.struct[l] * 2; }
    return have / full;
  };
  G.mechDestroyed = m => m.struct.CT <= 0 || m.struct.HD <= 0;
  G.mechLegless = m => m.struct.LL <= 0 && m.struct.RL <= 0;
  G.mechUsable = m => !G.mechDestroyed(m) && !G.mechLegless(m);
  /* what putting it right costs, before a tech's discount */
  G.repairCost = m => {
    const mx = G.mechMax(m);
    let c = 0;
    for (const l of PM.LOCS) c += (mx.armor[l] - m.armor[l]) * 25 + (mx.struct[l] - m.struct[l]) * 80;
    for (const w of m.wpn) { if (w.dead) c += PM.WEAPONS[w.w].cost * 0.6; const W = PM.WEAPONS[w.w]; if (W.ammo) c += (W.ammo - w.ammo) * Math.max(4, W.cost / 400); }
    return Math.round(c);
  };
  G.repairDays = m => Math.max(0, Math.ceil(G.repairCost(m) / 6000));
  G.repairAll = m => {
    const mx = G.mechMax(m);
    m.armor = { ...mx.armor }; m.struct = { ...mx.struct }; m.heat = 0;
    for (const w of m.wpn) { w.dead = false; w.ammo = PM.WEAPONS[w.w].ammo || 0; }
  };

  /* ---- people ---- */
  G.newChar = id => {
    const c = PM.CAST[id];
    return { id, name: c.name, species: c.species, look: c.look, hp: c.hp, hpMax: c.hp, move: c.move, weapon: c.weapon, armor: c.armor,
      skills: { ...c.skills }, xp: {} };
  };
  G.member = (S, id) => S.chars[id];
  G.partyChars = S => S.party.map(id => S.chars[id]);
  G.lance = S => S.mechs.filter(m => m.at === "lance");
  G.mechOf = (S, cid) => S.mechs.find(m => m.at === "lance" && m.pilot === cid) || null;
  G.bestSkill = (S, k) => Math.max(0, ...G.partyChars(S).filter(c => c.hp > 0).map(c => c.skills[k] || 0));
  /* Training Hall lessons someone has left: the cadet's never expire, each recruit has their own */
  G.lessonsLeft = (S, c) => Math.max(0, c.id === "hero" ? PM.CADET_LESSONS - (S.flags.cadetLessons || 0) : PM.RECRUIT_LESSONS - (c.hallLessons || 0));
  G.spendLesson = (S, c) => { if (c.id === "hero") S.flags.cadetLessons = (S.flags.cadetLessons || 0) + 1; else c.hallLessons = (c.hallLessons || 0) + 1; };
  /* lessons the cadet has left before graduation; once the Pact lands, nothing to graduate from */
  G.cadetLessonsLeft = S => S.flags.invaded ? 0 : G.lessonsLeft(S, S.chars.hero);
  G.techDiscount = S => 1 - Math.min(0.4, G.bestSkill(S, "tech") * 0.05);

  /* ---- a new game ---- */
  G.create = ({ name = "Jace", diff = 1, seed } = {}) => {
    const S = { v: 1, rs: (seed ?? (Math.random() * 2 ** 31)) | 0, diff, day: 1, hour: 8, money: 300, bank: 0,
      flags: {}, chars: {}, party: [], mechs: [], items: { medkit: 2, satchel: 0, repair: 0 },
      pos: { map: "world", x: PM.maps.world.start.x, y: PM.maps.world.start.y, f: 2 },
      explored: [], steps: 0, card: { red: null, blue: null, yellow: null },
      vault: { power: false, open: {}, used: {}, parts: false, map: false, signal: false, note: false, claimed: false },
      news: [], stats: { kills: 0, mechKills: 0, battles: 0 } };
    const hero = G.newChar("hero");
    hero.name = name;
    S.chars.hero = hero; S.party.push("hero");
    S.stocks = { price: {}, hist: {}, held: {}, push: {} };
    for (const st of PM.STOCKS) { S.stocks.price[st.id] = st.p; S.stocks.hist[st.id] = [st.p]; S.stocks.held[st.id] = 0; }
    /* the academy's trainer, signed out to the cadet */
    const tabby = G.newMech(S, "tabby", "academy");
    tabby.pilot = "hero"; tabby.at = "hangar";
    S.mechs.push(tabby);
    return S;
  };

  /* ---- the story's stage, for what the world throws at you ----
   * 0 at the academy, 1 the occupation, 2 on the Vault's trail, 3 the signal sent */
  G.stage = S => S.flags.signal ? 3 : S.flags.locator ? 2 : S.flags.invaded ? 1 : 0;

  /* ---- time ---- */
  G.advance = (S, hours) => {
    const out = [];
    S.hour += hours;
    while (S.hour >= 24) { S.hour -= 24; S.day++; out.push(...G.newDay(S)); }
    return out;
  };
  /* sleep until eight in the morning */
  G.restUntilMorning = S => G.advance(S, ((24 - S.hour) + 8) % 24 || 24);
  G.newDay = S => {
    const out = [];
    /* the bank pays a little */
    if (S.bank > 0) S.bank = Math.round(S.bank * 1.002);
    /* the market moves */
    for (const st of PM.STOCKS) {
      const P = S.stocks, push = P.push[st.id];
      let r = st.drift + (R(S) * 2 - 1) * st.vol * 1.4;
      if (push && push[1] > 0) { r += push[0]; push[1]--; }
      /* nothing goes to nothing: a floor, and a pull back toward the old price */
      const p0 = P.price[st.id], np = Math.max(2, p0 * (1 + r) + (st.p - p0) * 0.01);
      P.price[st.id] = Math.round(np * 100) / 100;
      const h = P.hist[st.id]; h.push(P.price[st.id]); if (h.length > 60) h.shift();
    }
    return out;
  };
  G.news = (S, id) => {
    const n = PM.NEWS[id];
    if (!n || S.flags["news_" + id]) return;
    S.flags["news_" + id] = true;
    for (const [k, v] of Object.entries(n.push)) S.stocks.push[k] = v.slice();
    S.news.unshift({ day: S.day, text: n.text });
  };
  G.clock = S => `Day ${S.day}, ${String(S.hour).padStart(2, "0")}:00`;

  /* ---- what the party knows of the map ---- */
  G.see = (S, x, y, r = 6) => {
    if (S.pos.map !== "world") return;
    const W = PM.maps.world.w, H = PM.maps.world.h;
    if (!S.seen) S.seen = new Uint8Array(W * H);
    for (let yy = y - r; yy <= y + r; yy++) for (let xx = x - r; xx <= x + r; xx++) {
      if (xx < 0 || yy < 0 || xx >= W || yy >= H || (xx - x) ** 2 + (yy - y) ** 2 > r * r + 1) continue;
      S.seen[yy * W + xx] = 1;
    }
  };

  /* ---- saving: the seen-map packed small ---- */
  const pack = a => { if (!a) return ""; let s = ""; for (let i = 0; i < a.length; i += 6) { let v = 0; for (let k = 0; k < 6; k++) v |= (a[i + k] ? 1 : 0) << k; s += String.fromCharCode(48 + v); } return s; };
  const unpack = (s, n) => { const a = new Uint8Array(n); for (let i = 0; i < s.length; i++) { const v = s.charCodeAt(i) - 48; for (let k = 0; k < 6; k++) if (v & (1 << k)) a[i * 6 + k] = 1; } return a; };
  G.serialize = S => { const o = { ...S, seen: pack(S.seen) }; delete o.bat; return JSON.stringify(o); };
  G.deserialize = str => {
    const S = JSON.parse(str), W = PM.maps.world;
    S.seen = unpack(S.seen || "", W.w * W.h);
    return S;
  };
  PM.KEY = { save: "pumamech_save_v1", slots: "pumamech_slots_v1", prefs: "pumamech_prefs_v1", muted: "pumamech_muted_v1" };
  /* the saves: "last" (the game saves itself there) and slots 1 to 3, kept together under one key */
  PM.Saves = {
    read(id) {
      try {
        if (id === "last") return globalThis.localStorage.getItem(PM.KEY.save);
        const all = JSON.parse(globalThis.localStorage.getItem(PM.KEY.slots) || "{}");
        return all[id] || null;
      } catch (e) { return null; }
    },
    write(id, str) {
      try {
        if (id === "last") { globalThis.localStorage.setItem(PM.KEY.save, str); return; }
        const all = JSON.parse(globalThis.localStorage.getItem(PM.KEY.slots) || "{}");
        all[id] = str;
        globalThis.localStorage.setItem(PM.KEY.slots, JSON.stringify(all));
      } catch (e) { /* no storage */ }
    },
    any() { return ["last", 1, 2, 3].some(id => !!PM.Saves.read(id)); },
  };
})();
