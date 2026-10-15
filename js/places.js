/* PumaMech -- inside the buildings: the academy, the mech yards, the bank
 * and its Exchange, the shops, inns and the clinic, the Rusty Lantern, the
 * Relay, Brock's house, and the Vault's terminals and doors.
 *
 * PM.Places.visit(place) opens what is behind a door. Each place is a
 * sheet; money, time and the party change as you choose. */
"use strict";
(() => {
  const esc = PM.esc, G = PM.Game, UI = PM.UI;
  const P = PM.Places = {};
  const game = () => PM.game, St = () => PM.game.S;
  const cr = PM.cr;
  const done = () => { UI.close(true); game().afterPlace(); };
  const say = (pages, o) => UI.say(pages, o);
  const L = { father: "father", dorran: "instrB", pip: "cadetR", mags: "merc", bracken: "tech", wren: "doctor", quill: "scout", brock: "brock", keeper: "keeper",
    banker: "banker", capy: "capy", hedge: "hedge", inn: "innM", coach: "coach", aunt: "aunt", elder: "elder", owl: "instrO", hare: "instrH", badger: "instrX" };
  const hero = () => St().chars.hero;
  const first = c => c.name.split(" ")[0];
  const words = (n, cap) => { const w = ["no", "one", "two", "three", "four", "five", "six"][n] ?? String(n); return cap ? w[0].toUpperCase() + w.slice(1) : w; };
  const join = async id => {
    const S = St();
    if (S.party.includes(id)) return;
    if (S.party.length >= PM.PARTY_MAX) { await UI.notice("The party is full", "Six is as many as can travel together. Leave someone at an inn first: open the party (P) and choose who stays."); return false; }
    S.chars[id] = S.chars[id] || G.newChar(id);
    S.party.push(id);
    PM.SFX.play("goal");
    game().toast(`${S.chars[id].name} joins the lance`, "green");
    return true;
  };
  P.join = join;

  /* ---- the generic services ---- */
  /* a night's rest: everyone mended, the morning, the game saved */
  const rest = async (price, where) => {
    const S = St();
    if (price && S.money < price) { await UI.notice(where, `A room is ${cr(price)}. You have ${cr(S.money)}.`); return; }
    S.money -= price;
    G.restUntilMorning(S);
    for (const c of G.partyChars(S)) c.hp = c.hpMax;
    S.flags.calm = 6;
    game().save();
    await UI.notice(where, `You sleep through to morning. Everyone is rested and whole.<br><span class="note">${G.clock(S)} · the game is saved.</span>`);
  };
  P.rest = rest;

  /* buying a weapon or armour: who gets it; what they had goes back for a little */
  const giveGear = async (kind, key) => {
    const S = St(), T = kind === "arms" ? PM.ARMS : PM.ARMOR, item = T[key];
    const who = await say([{ text: `Who takes the ${esc(item.name.toLowerCase())}?`, choices: [...G.partyChars(S).map(c => [`${first(c)} (has ${(kind === "arms" ? PM.ARMS[c.weapon] : PM.ARMOR[c.armor]).name.toLowerCase()})`, c.id]), ["Nobody", null]] }], { title: item.name });
    if (!who) return false;
    const c = S.chars[who], old = kind === "arms" ? c.weapon : c.armor, back = Math.round((T[old] ? T[old].cost : 0) * 0.4);
    S.money -= item.cost; S.money += back;
    if (kind === "arms") c.weapon = key; else c.armor = key;
    game().toast(`${first(c)} takes the ${item.name.toLowerCase()}${back ? ` (${cr(back)} for the old)` : ""}`, "green");
    return true;
  };
  P.shop = (title, ownerLook, ownerName, stock, intro) => {
    const S = St();
    UI.open(title, { wide: true,
      html: () => {
        const row = (kind, key, it) => `<tr><td><b>${esc(it.name)}</b>${kind === "arms" ? `<span class="note"> · ${it.dmg} damage, reach ${it.range}</span>` : kind === "armor" ? `<span class="note"> · stops ${it.def}</span>` : `<span class="note"> · ${esc(it.note)}</span>`}</td>
          <td class="num">${cr(it.cost)}</td><td>${kind === "items" ? `<span class="note">have ${S.items[key] || 0}</span>` : ""}</td><td><button data-buy="${kind}:${key}" ${S.money < it.cost ? "disabled" : ""}>Buy</button></td></tr>`;
        return `<div class="shopkeep">${UI.face(ownerLook, 3, ownerName)}<p>${intro}</p></div><p class="meta">You have <b>${cr(S.money)}</b>.</p>
          <table class="shop"><tbody>${stock.arms.map(k => row("arms", k, PM.ARMS[k])).join("")}${stock.armor.map(k => row("armor", k, PM.ARMOR[k])).join("")}${stock.items.map(k => row("items", k, PM.ITEMS[k])).join("")}</tbody></table>`;
      },
      onClick: async (b, api) => {
        if (!b.dataset.buy) return;
        const [kind, key] = b.dataset.buy.split(":");
        if (kind === "items") { const it = PM.ITEMS[key]; if (S.money >= it.cost) { S.money -= it.cost; S.items[key] = (S.items[key] || 0) + 1; PM.SFX.play("pod"); } api.refresh(); return; }
        const el = UI.sheet && UI.sheet.el; if (el) el.hidden = true;
        await giveGear(kind, key);
        P.shop(title, ownerLook, ownerName, stock, intro);
      },
      onClose: () => game().afterPlace(),
    });
  };

  /* lessons: pick who, and what; the Training Hall's are counted per person (o.budget) */
  P.train = (title, ownerLook, intro, priceOf, cap, o = {}) => {
    const S = St();
    let who = S.party[0];
    const left = c => o.budget ? G.lessonsLeft(S, c) : Infinity;
    UI.open(title, { wide: true,
      html: () => {
        const c = S.chars[who], n = left(c), none = n <= 0;
        return `<div class="shopkeep">${UI.face(ownerLook, 3)}<p>${intro}</p></div>
          <div class="row">${G.partyChars(S).map(p => `<button class="pill${p.id === who ? " on" : ""}" data-who="${p.id}">${esc(first(p))}${o.budget ? ` <span class="note">${left(p)}</span>` : ""}</button>`).join("")}</div>
          <p class="meta">${esc(c.name)} · you have <b>${cr(S.money)}</b>${o.budget ? ` · <b>${n}</b> ${n === 1 ? "lesson" : "lessons"} left${S.flags.invaded ? "" : " before graduation"}` : ""}</p>
          <table class="shop"><tbody>${PM.SKILLS.map(([k, n, d]) => {
            const lv = c.skills[k], price = priceOf(lv), maxed = lv >= cap;
            return `<tr><td><b>${n}</b> <span class="num">${lv}</span><span class="note"> · ${d}</span></td><td class="num">${maxed ? "—" : price ? cr(price) : "free"}</td>
              <td><button data-learn="${k}" ${maxed || none || S.money < price ? "disabled" : ""}>${maxed ? "As far as here goes" : none ? "No lessons left" : "Take the lesson"}</button></td></tr>`;
          }).join("")}</tbody></table>`;
      },
      onClick: (b, api) => {
        if (b.dataset.who) { who = b.dataset.who; api.refresh(); return; }
        if (b.dataset.learn) {
          const c = S.chars[who], k = b.dataset.learn, price = priceOf(c.skills[k]);
          if (S.money < price || c.skills[k] >= cap || left(c) <= 0) return;
          S.money -= price; c.skills[k]++;
          if (o.budget) G.spendLesson(S, c);
          if (S.flags.lessons !== undefined) S.flags.lessons++; else S.flags.lessons = 1;
          PM.SFX.play("goal");
          game().toast(`${first(c)}: ${PM.SKILL_NAME[k]} ${c.skills[k]}`, "green");
          api.refresh();
        }
      },
      onClose: () => game().afterPlace(),
    });
  };

  /* ---- the mech yard: the lance, storage, repairs, buying and selling ---- */
  P.yard = (title, ownerLook, ownerName, o = {}) => {
    const S = St(), disc = G.techDiscount(S) * (o.cheap ? 0.75 : 1);
    let tab = 0;
    const cost = m => Math.round(G.repairCost(m) * disc);
    const pilotName = m => m.pilot && S.chars[m.pilot] ? first(S.chars[m.pilot]) : "no pilot";
    const mechRow = (m, acts) => {
      const ch = PM.CHASSIS[m.ch], cond = G.mechCondition(m);
      return `<li class="mechrow">${UI.mechImg(m.ch, m.paint, 2, G.mechUsable(m) ? "stand" : G.mechDestroyed(m) ? "wreck" : "down")}<div class="who"><b>${esc(ch.name)} <span class="note">${esc(ch.model)} · ${ch.tons}t</span></b>
        <span class="note">${Math.round(cond * 100)}% · ${G.mechUsable(m) ? "ready" : G.mechDestroyed(m) ? "wrecked" : "can't walk"} · ${m.at === "lance" ? esc(pilotName(m)) : "in storage"}${cost(m) ? ` · repairs ${cr(cost(m))}` : ""}</span>
        <span class="note">${esc(ch.weapons.map(([w]) => PM.WEAPONS[w].name).join(", "))}</span></div>${H.doll(m, 40)}<div class="act">${acts}</div></li>`;
    };
    const H = PM.HUD;
    const tabs = () => [
      ["Your lance", () => {
        const lance = G.lance(S);
        return `<p class="lede">Up to four mechs travel with the party. Each needs a pilot from the party; whoever has none walks.</p>
          ${lance.length ? `<ul class="mechs">${lance.map(m => mechRow(m, `<button data-pilot="${m.uid}">Pilot: ${esc(pilotName(m))}</button>${cost(m) ? `<button data-fix="${m.uid}" ${S.money < cost(m) ? "disabled" : ""}>Repair</button>` : ""}<button data-store="${m.uid}" class="quiet">Store</button>`)).join("")}</ul>` : `<p class="note">No mechs with the party.</p>`}
          ${lance.some(m => cost(m)) ? `<div class="row"><button class="primary" data-fixall ${S.money < lance.reduce((a, m) => a + cost(m), 0) ? "disabled" : ""}>Repair the whole lance: ${cr(lance.reduce((a, m) => a + cost(m), 0))}</button></div>` : ""}`;
      }],
      ["Storage", () => {
        const st = S.mechs.filter(m => m.at === "yard");
        return `<p class="lede">Salvage is hauled here after every fight you win, and mechs you leave wait here. ${o.cheap ? "Bracken can reach this storage from Fernwick." : ""}</p>
          ${st.length ? `<ul class="mechs">${st.map(m => mechRow(m, `${cost(m) ? `<button data-fix="${m.uid}" ${S.money < cost(m) ? "disabled" : ""}>Repair</button>` : ""}<button data-take="${m.uid}" ${G.lance(S).length >= PM.LANCE_MAX ? "disabled" : ""}>To the lance</button><button data-sell="${m.uid}" class="quiet">Sell ${cr(sellPrice(m))}</button>`)).join("")}</ul>` : `<p class="note">Nothing in storage.</p>`}`;
      }],
      ...(o.sells ? [["Buy a mech", () => `<p class="lede">You have <b>${cr(S.money)}</b>. Everything here is used, and priced like it isn't.</p><ul class="mechs">${o.sells.map(ch => {
        const c = PM.CHASSIS[ch], price = PM.mechValue(ch);
        return `<li class="mechrow">${UI.mechImg(ch, "claw", 2)}<div class="who"><b>${esc(c.name)} <span class="note">${esc(c.model)} · ${c.tons}t · walks ${c.walk}${c.jump ? `, jumps ${c.jump}` : ""}</span></b><span class="note">${esc(c.role)}</span><span class="note">${esc(c.weapons.map(([w]) => PM.WEAPONS[w].name).join(", "))}</span></div><div></div><div class="act"><button data-buy="${ch}" ${S.money < price ? "disabled" : ""}>Buy ${cr(price)}</button></div></li>`;
      }).join("")}</ul>`]] : []),
    ];
    const sellPrice = m => Math.round(PM.mechValue(m.ch) * 0.45 * Math.max(0.25, G.mechCondition(m)));
    const open = () => {
      const T = tabs();
      UI.open(title, { wide: true, tab, tabs: T.map(([n, f]) => [n, f]),
        onClick: async (b, api) => {
          tab = UI.sheet.tabAt();
          const m = b.dataset.pilot || b.dataset.fix || b.dataset.store || b.dataset.take || b.dataset.sell ? S.mechs.find(x => x.uid === +(b.dataset.pilot || b.dataset.fix || b.dataset.store || b.dataset.take || b.dataset.sell)) : null;
          if (b.dataset.fix) { const c = cost(m); if (S.money >= c) { S.money -= c; G.repairAll(m); G.advance(S, Math.max(1, G.repairDays(m)) * 3); PM.SFX.play("clang"); } return reopen(); }
          if (b.hasAttribute("data-fixall")) { for (const x of G.lance(S)) { const c = cost(x); if (c && S.money >= c) { S.money -= c; G.repairAll(x); } } G.advance(S, 12); PM.SFX.play("clang"); return reopen(); }
          if (b.dataset.store) { m.at = "yard"; m.pilot = null; return reopen(); }
          if (b.dataset.take) { m.at = "lance"; m.pilot = null; return reopen(); }
          if (b.dataset.sell) {
            UI.sheet.el.hidden = true;
            if (await UI.ask(`Sell the ${PM.CHASSIS[m.ch].name} for ${cr(sellPrice(m))}?`, "Sell")) { S.money += sellPrice(m); S.mechs.splice(S.mechs.indexOf(m), 1); }
            return reopen();
          }
          if (b.dataset.buy) {
            const price = PM.mechValue(b.dataset.buy);
            if (S.money < price) return;
            UI.sheet.el.hidden = true;
            if (await UI.ask(`Buy a ${PM.CHASSIS[b.dataset.buy].name} for ${cr(price)}? It goes ${G.lance(S).length < PM.LANCE_MAX ? "to the lance" : "into storage"}.`, "Buy", "Buy a mech?", false)) {
              S.money -= price;
              const nm = G.newMech(S, b.dataset.buy, "claw", { at: G.lance(S).length < PM.LANCE_MAX ? "lance" : "yard" });
              S.mechs.push(nm); PM.SFX.play("goal");
            }
            return reopen();
          }
          if (b.dataset.pilot) {
            UI.sheet.el.hidden = true;
            const pick = await say([{ text: `Who pilots the ${esc(PM.CHASSIS[m.ch].name)}?`, choices: [...G.partyChars(S).map(c => { const cur = G.mechOf(S, c.id); return [`${first(c)} · piloting ${c.skills.pilot}, gunnery ${c.skills.gun}${cur && cur !== m ? ` (leaves the ${PM.CHASSIS[cur.ch].name})` : ""}`, c.id]; }), ["Nobody", "none"]] }], { title: "Pilot" });
            if (pick === "none") m.pilot = null;
            else if (pick) { for (const x of S.mechs) if (x.pilot === pick) x.pilot = null; m.pilot = pick; }
            return reopen();
          }
        },
        onClose: () => game().afterPlace(),
      });
    };
    const reopen = () => { game().refreshHud(); open(); };
    open();
  };

  /* ---- the bank: an account and the Mercantile Exchange ---- */
  const spark = h => {
    const w = 90, hh = 22, lo = Math.min(...h), hi = Math.max(...h), d = hi - lo || 1;
    const pts = h.map((v, i) => `${(i / Math.max(1, h.length - 1) * w).toFixed(1)},${(hh - 2 - (v - lo) / d * (hh - 4)).toFixed(1)}`).join(" ");
    const up = h[h.length - 1] >= h[0];
    return `<svg class="spark" viewBox="0 0 ${w} ${hh}" width="${w}" height="${hh}" aria-hidden="true"><polyline points="${pts}" fill="none" stroke="${up ? "#7fb069" : "#e4572e"}" stroke-width="1.5"/></svg>`;
  };
  P.bank = () => {
    const S = St();
    let tab = 0;
    const open = () => UI.open("Pardalis Mercantile", { wide: true, tab, tabs: [
      ["Your account", () => `<div class="shopkeep">${UI.face(L.banker, 3, "Ilsa Plume")}<p>Ilsa Plume, chief clerk, looks at you over her spectacles. "Deposits pay a fifth of a crown in the hundred, every day. The Pact has not yet thought to rob us. Yet."</p></div>
        <table class="shop"><tbody><tr><td>In hand</td><td class="num"><b>${cr(S.money)}</b></td></tr><tr><td>In the bank</td><td class="num"><b>${cr(S.bank)}</b></td></tr></tbody></table>
        <h3>Deposit</h3><div class="row">${[100, 1000, 10000].map(n => `<button data-dep="${n}" ${S.money < n ? "disabled" : ""}>${cr(n)}</button>`).join("")}<button data-dep="all" ${S.money <= 0 ? "disabled" : ""}>All of it</button></div>
        <h3>Withdraw</h3><div class="row">${[100, 1000, 10000].map(n => `<button data-wd="${n}" ${S.bank < n ? "disabled" : ""}>${cr(n)}</button>`).join("")}<button data-wd="all" ${S.bank <= 0 ? "disabled" : ""}>All of it</button></div>`],
      ["The Exchange", () => `<p class="lede">${esc(PM.Story.headline(S))}</p><p class="meta">Prices move every morning. You have <b>${cr(S.money)}</b> in hand.</p>
        <table class="shop exch"><thead><tr><td>Company</td><td>Price</td><td>Last days</td><td>Held</td><td>Worth</td><td></td></tr></thead><tbody>${PM.STOCKS.map(st => {
          const p = S.stocks.price[st.id], h = S.stocks.hist[st.id], held = S.stocks.held[st.id], ch = h.length > 1 ? (p / h[h.length - 2] - 1) * 100 : 0;
          return `<tr><td><b>${esc(st.id)}</b><span class="note"> ${esc(st.name)}</span></td><td class="num">${p.toFixed(2)} <span class="${ch >= 0 ? "ok" : "bad"}">${ch >= 0 ? "+" : ""}${ch.toFixed(1)}%</span></td><td>${spark(h.slice(-20))}</td>
            <td class="num">${held}</td><td class="num">${cr(held * p)}</td><td class="act">${[1, 10, 100].map(n => `<button data-sb="${st.id}:${n}" ${S.money < p * n ? "disabled" : ""}>+${n}</button>`).join("")}<button data-ss="${st.id}" ${held ? "" : "disabled"} class="quiet">Sell all</button></td></tr>`;
        }).join("")}</tbody></table><p class="note">A share bought is a share's price; a share sold is the same, less nothing at all. The Mercantile is generous like that.</p>`],
    ], onClick: (b) => {
      tab = UI.sheet.tabAt();
      if (b.dataset.dep) { const n = b.dataset.dep === "all" ? S.money : +b.dataset.dep; S.money -= n; S.bank += n; }
      if (b.dataset.wd) { const n = b.dataset.wd === "all" ? S.bank : +b.dataset.wd; S.bank -= n; S.money += n; }
      if (b.dataset.sb) { const [id, n] = b.dataset.sb.split(":"), c = Math.round(S.stocks.price[id] * +n); if (S.money >= c) { S.money -= c; S.stocks.held[id] += +n; PM.SFX.play("pod"); } }
      if (b.dataset.ss) { const id = b.dataset.ss; S.money += Math.round(S.stocks.held[id] * S.stocks.price[id]); S.stocks.held[id] = 0; PM.SFX.play("pod"); }
      game().refreshHud(); open();
    }, onClose: () => game().afterPlace() });
    open();
  };

  /* ---- the places, by name ---- */
  const V = {};
  /* -- the Bastion -- */
  V.b_office = async () => {
    const S = St(), f = S.flags, h = hero();
    if (f.invaded) {
      await say([{ text: "Rane Sunclaw's office is a wreck: papers everywhere, the desk overturned, the window shot out. Whatever the Pact was looking for, it took the whole filing cabinet with it.", choices: [["Search the desk", 1]] }]);
      if (!f.deskSearched) { f.deskSearched = true; S.money += 1200; S.items.medkit += 2; await say([{ text: "Taped under the drawer: your father's emergency pay, <b>1,200 crowns</b>, and two medkits. Of course he had one of these.", look: L.father }], { title: "The Commander's desk" }); }
      return done();
    }
    if (!f.metFather) {
      f.metFather = true;
      await say([
        { who: "Commander Rane Sunclaw", look: L.father, text: [`"Cadet ${esc(h.name)}." Your father doesn't look up from the map table straight away; he never does. "At ease. In here I'm the Commander and you're a third-year with a Tabby signed out in your name. Out there I'm your father. Don't mix them up and we'll get on."`] },
        { who: "Commander Rane Sunclaw", look: L.father, text: [`"Three sorties stand between you and your wings. Drones, then a pack of drones, then the graduation run. The Hangar keeps the board."`, `"Before that: the Training Hall. Lessons are free for cadets, and there's time for ${words(PM.CADET_LESSONS)} before graduation: spend them well. Gunnery and Piloting will keep you alive in a mech. Small arms and Melee keep you alive out of one, which is where most pilots die. Tech and Medic keep everyone else alive."`] },
        { who: "Commander Rane Sunclaw", look: L.father, text: [`He finally looks up. "And keep your ears open. The Pact's been sniffing round the edge of the system for a month. Probably nothing." He says it the way he says everything is probably nothing.`] },
      ]);
    } else await say([{ who: "Commander Rane Sunclaw", look: L.father, text: [f.sortie2 ? `"One more sortie, cadet. Make it clean." He taps a signet ring on the map table without seeming to notice he's doing it.` : `"Lessons, then sorties. The Hangar's on the east side of the parade ground." He goes back to his map: the High Spurs, you notice, ringed in grease pencil.`] }]);
    done();
  };
  V.b_barracks = async () => {
    const S = St();
    const c = await say([{ text: S.flags.invaded ? "The barracks are cold and empty. Bunks stripped, lockers open. Yours still has your spare socks in it." : "Your bunk in the third-year barracks. Pip's side is a disaster, as usual.", choices: [["Sleep until morning", "rest"], ["Leave", null]] }], { title: "Barracks" });
    if (c === "rest") await rest(0, "Barracks");
    done();
  };
  V.b_hall = () => {
    const S = St();
    P.train("Training Hall", L.dorran, S.flags.invaded ? `Sergeant Dorran Ashgrove is back at his post as if nothing happened. "Lessons are still free. ${words(PM.RECRUIT_LESSONS, true)} apiece for your recruits, and whatever you skipped before graduation. The Pact won't wait for more."` : `Sergeant Dorran Ashgrove runs the Hall like a drill field. "There's time for ${words(PM.CADET_LESSONS)} lessons before your graduation run, cadet. Pick something you're bad at."`, () => 0, 6, { budget: true });
  };
  V.b_mess = async () => {
    const S = St();
    await say([{ text: S.flags.invaded ? "The mess hall smells of cold stew and smoke. Someone has written THE SUNCLAWS WILL BE BACK on the wall in jam." : `The mess hall. Somebody's arguing about whether a Gnat can outrun a Marten (it can't; it only thinks it can). A bowl of stew costs nothing and tastes like it.`, choices: [["Eat (heals the party)", 1], ["Leave", 0]] }], { title: "Mess Hall" }) && G.partyChars(S).forEach(c => { c.hp = Math.min(c.hpMax, c.hp + 6); });
    done();
  };
  V.b_hangar = async () => {
    const S = St(), f = S.flags;
    const tabby = S.mechs.find(m => m.ch === "tabby");
    if (f.invaded) { P.yard("Bastion Hangar", L.badger, "the Hangar", { cheap: true }); return; }
    G.repairAll(tabby);
    const next = !f.sortie1 ? "sortie1" : !f.sortie2 ? "sortie2" : "sortie3";
    const words = { sortie1: "Sortie one: two target drones out on the south range. They shoot back with training lasers -- it stings, it won't kill you.", sortie2: "Sortie two: three drones, one of them set to Line. Keep moving and use the trees.", sortie3: "Sortie three: the graduation run. Two drones and your father watching from the tower. Make it clean." }[next];
    const c = await say([{ who: "Hangar chief Tamsin Burrow", look: L.badger, text: [`Your Tabby's on the gantry, patched and cooled. "${esc(words)}"`, `<span class="note">In a fight, give each mech its orders -- where to move, then what to shoot -- and the round plays out. Enter chooses, Space stands still, R runs.</span>`], choices: [["Fly the sortie", "go"], ["Not yet", null]] }], { title: "Hangar" });
    const owed = G.cadetLessonsLeft(S);
    if (c === "go" && next === "sortie3" && owed) {
      const w = await say([{ who: "Hangar chief Tamsin Burrow", look: L.badger, text: [`She doesn't lower the gantry. "Ashgrove tells me you've still got ${owed === 1 ? "a lesson" : `${owed} lessons`} waiting at the Training Hall. You really should go to class before the graduation run, cadet."`], choices: [["Go to class first", null], ["Fly anyway", "go"]] }], { title: "Hangar" });
      if (w !== "go") return done();
    }
    if (c === "go") { UI.close(true); game().storyBattle(next, { party: [{ cid: "hero", mech: tabby.uid }], cx: 22, cy: 49 }); return; }
    done();
  };
  /* -- Portgate -- */
  V.p_yard = () => P.yard("Thistle's Mech Yard", L.hedge, "Barnaby Thistle", { sells: ["gnat", "skink", "marten", "heron", "bulwark", "tusker"] });
  V.p_bank = () => P.bank();
  V.p_arms = () => P.shop("Brass & Barrel", L.capy, "Coco Bramble", { arms: ["knife", "blade", "pistol", "lpistol", "rifle", "lrifle"], armor: ["vest", "jacket", "suit"], items: ["medkit", "satchel", "repair"] },
    `Coco Bramble sets down a rifle she was polishing. "Pact's banned civilian arms. I'm a civilian, and these are arms, and here we both are. What'll it be?"`);
  V.p_gym = () => P.train("Iron Paw Gym", L.coach, `Coach Rumble cracks his knuckles. "I can teach anyone anything if they pay and sweat. Price goes up as you get better. So does the sweat."`, lv => 150 * (lv + 1), 8);
  V.p_inn = async () => { const c = await say([{ text: `The Sleeping Cat. The innkeeper, a mouse in a flour-dusted apron, keeps one eye on the door for Pact boots. "Thirty crowns a night, love. Breakfast included, questions not."`, choices: [["Take a room (30 cr)", 1], ["Leave", 0]] }], { title: "The Sleeping Cat" }); if (c) await rest(30, "The Sleeping Cat"); done(); };
  V.p_house = async () => { await UI.notice("A house", "You knock. Someone inside goes very quiet. Nobody answers."); done(); };
  V.p_clinic = async () => {
    const S = St(), hurt = G.partyChars(S).reduce((a, c) => a + (c.hpMax - c.hp), 0), price = hurt * 4;
    const pages = [{ who: "Dr. Wren Otterly", look: L.wren, text: [hurt ? `An otter in a white coat looks your lot over. "That's ${hurt} points of hurt between you. Four crowns a point, and I'm cheap."` : `An otter in a white coat. "Nobody bleeding? Then out. I've real patients."`] }];
    const choices = [];
    if (hurt) choices.push([`Patch everyone up (${cr(price)})`, "heal"]);
    if (S.flags.invaded && !S.party.includes("wren")) {
      pages.push({ who: "Dr. Wren Otterly", look: L.wren, text: [S.flags.wrenAsked ? `"Still eight hundred crowns. The Pact's levy doesn't pay itself and neither does my morphine supplier."` : `She lowers her voice. "You're the Commander's kid. I can tell: same jaw, same terrible posture. Listen -- the Pact has slapped a levy on my clinic I can't pay. Clear it, eight hundred crowns, and I'll come with you. A lance needs a medic more than this street does, and Doc Hazel next door can manage."`] });
      S.flags.wrenAsked = true;
      choices.push(["Pay her levy (800 cr)", "wren"]);
    }
    choices.push(["Leave", null]);
    pages[pages.length - 1].choices = choices;
    const c = await say(pages, { title: "Portgate Clinic" });
    if (c === "heal") { if (S.money >= price) { S.money -= price; for (const p of G.partyChars(S)) p.hp = p.hpMax; game().toast("Everyone patched up", "green"); } else await UI.notice("Portgate Clinic", "You don't have the crowns."); }
    if (c === "wren") { if (S.money >= 800) { S.money -= 800; if (await join("wren")) await say([{ who: "Dr. Wren Otterly", look: L.wren, text: [`She hangs her coat on the hook and takes down a field bag. "Right. Who's first to get shot?"`] }]); else S.money += 800; } else await UI.notice("Portgate Clinic", "You don't have eight hundred crowns."); }
    done();
  };
  V.p_lantern = async () => {
    const S = St(), f = S.flags;
    const pages = [{ who: "Juniper Hollis", look: L.aunt, text: [f.invaded ? `The Rusty Lantern is half empty and very quiet. Juniper Hollis, Pip's aunt, polishes a glass that has been clean for an hour. "${esc(PM.Story.headline(S))}"` : "The Rusty Lantern."] }];
    if (f.invaded && !S.party.includes("pip")) {
      pages.push({ who: "Pip Hollis", look: L.pip, text: [`A raccoon in a torn cadet jumpsuit nearly knocks you flat. "You made it! I knew you'd make it. I said, if anyone gets out of the Bastion it's the one with the training mech and the famous dad." Pip's grin falters. "Did -- has anyone heard from the Commander?"`, `"Doesn't matter. I'm with you. Where are we going?"`] });
    }
    const choices = [["Ask about rumours", "rum"]];
    if (f.invaded && !S.party.includes("mags")) choices.push(["Talk to the bear in the corner", "mags"]);
    choices.push(["Leave", null]);
    pages[pages.length - 1].choices = choices;
    const join1 = f.invaded && !S.party.includes("pip");
    let c = await say(pages, { title: "The Rusty Lantern" });
    if (join1) await join("pip");
    while (c) {
      if (c === "rum") await say([{ who: "Juniper Hollis", look: L.aunt, text: [!f.relay ? `"If your father left word for anyone, it'd be at the Relay. The owls up by the north gate keep messages for anyone who can prove who they are."` : !f.metBrock ? `"Brock Tunnelson? Kiln Hollow, past the bridge and south-west. Pip's grandad served with him. Bring him something to drink and don't mention his knee."` : f.locator ? `"Everyone's saying the Pact has sent for its Marshal. Greymane. You don't want to meet Greymane, love."` : `"The Exchange is a madhouse. Tawny Arms is through the roof; buy low, sell to the war, my old dad used to say."`, `"And mind the Pact's landing field east of town. They've got a whole garrison camped on it."`] }]);
      if (c === "mags") {
        const spare = S.mechs.find(m => m.at === "lance" && !m.pilot && G.mechUsable(m));
        const r = await say([{ who: "Mags Ironpaw", look: L.mags, text: [`A big brown bear in a mercenary's flight jacket doesn't look up from her drink. "Mags Ironpaw. Thirty-one contracts, twenty-nine mechs. The two I lost weren't my fault." She looks at you. "You're putting together a lance. I'm a pilot. I don't walk, and I don't work free."`, spare ? `"That ${esc(PM.CHASSIS[spare.ch].name)} of yours with nobody in it. I'll take that, and call it even."` : `"Get me a mech nobody's sitting in, or fifteen hundred crowns, and I'm yours."`], choices: [...(spare ? [["Give her the " + PM.CHASSIS[spare.ch].name, "mech"]] : []), ["Pay her (1,500 cr)", "pay"], ["Not now", null]] }]);
        if (r === "mech" && spare) { if (await join("mags")) spare.pilot = "mags"; }
        if (r === "pay") { if (S.money >= 1500) { S.money -= 1500; if (!(await join("mags"))) S.money += 1500; } else await UI.notice("Mags Ironpaw", `"Fifteen hundred," she says. "Not fourteen-ninety. I can count."`); }
      }
      c = S.party.includes("mags") ? await say([{ who: "Juniper Hollis", look: L.aunt, text: ["Anything else, love?"], choices: [["Ask about rumours", "rum"], ["Leave", null]] }]) : await say([{ who: "Juniper Hollis", look: L.aunt, text: ["Anything else, love?"], choices: [["Ask about rumours", "rum"], ["Talk to the bear in the corner", "mags"], ["Leave", null]] }]);
    }
    done();
  };
  V.p_relay = async () => {
    const S = St(), f = S.flags, h = hero();
    if (!f.invaded) { await UI.notice("The Relay", "Closed."); return done(); }
    if (!f.relay) {
      f.relay = true;
      await say([
        { who: "Keeper Ondine", look: L.keeper, text: [`The Relay's keeper is an old owl in plum robes, and she has been expecting you. "Commander Sunclaw lodged a sealed message for his child, the night before the dropships. The seal opens to the signet he gave you." She holds out a reader. Your father's ring -- the one he pressed into your paw over the radio -- fits it exactly.`] },
        { who: "Commander Rane Sunclaw", look: L.father, text: [`"${esc(h.name)}. If this is playing, the Bastion has fallen and I'm either taken or doing something stupid. Don't come looking. Listen instead."`, `"The Pact isn't here for the farms or the ore. It's here for the Founders' Vault: a cache of the colony's first mechs and a deep-signal array that can call the Concord Fleet. I've spent ten years looking for it. I found the road."`] },
        { who: "Commander Rane Sunclaw", look: L.father, text: [`"Go to Kiln Hollow. Find Brock Tunnelson; he was Founders' Guard before any of us were born. Show him the signet. He'll give you the rest."`, `"Build yourself a lance first. Don't go alone. You never listen to that part. Listen to it this time."`] },
      ], { title: "The Relay" });
      PM.Game.news(S, "vault");
    } else await say([{ who: "Keeper Ondine", look: L.keeper, text: [f.signal ? `"The whole sky is ringing with that signal of yours. The Concord Fleet has answered: fourteen days." She almost smiles. "Fourteen days is a long time to hold a door."` : `"Messages wait here until they're wanted. Yours is wanted elsewhere, I think." She looks pointedly south-west, toward Kiln Hollow.`] }]);
    done();
  };
  /* -- Fernwick -- */
  V.f_shop = async () => {
    const S = St();
    if (!S.party.includes("bracken") && S.flags.fernRaid) {
      const c = await say([{ who: "Bracken Vale", look: L.bracken, text: [`A fox in grease-black overalls is waiting at the workshop door with a wrench in each paw. "You're the lot who ran those stoats off. Bracken Vale. I fix mechs." She looks past you at whatever's walking behind you. "And by the sound of that, you need me to."`, `"I'll do your repairs a quarter cheaper than Thistle in the city, and I can reach his storage over the wire. Or --" she twirls a wrench -- "I could just come with you. A lance in the field needs a wright more than Fernwick needs another tractor fixed."`], choices: [["Ask her to join", "join"], ["Just the workshop", null]] }], { title: "Bracken's Workshop" });
      if (c === "join") await join("bracken");
    }
    P.yard("Bracken's Workshop", L.bracken, "Bracken Vale", { cheap: true });
  };
  V.f_inn = async () => { const c = await say([{ text: "The Hen and Harrow: low beams, a fire, and a hare behind the bar who doesn't ask where you've been. Twenty crowns a night.", choices: [["Take a room (20 cr)", 1], ["Leave", 0]] }], { title: "The Hen and Harrow" }); if (c) await rest(20, "The Hen and Harrow"); done(); };
  V.f_store = () => P.shop("Fernwick Supply", L.capy, "Ottie", { arms: ["knife", "pistol", "rifle"], armor: ["vest"], items: ["medkit", "repair"] }, `"We mostly sell seed and fence wire," says the capybara behind the counter. "But we've a few things for drakes. And other pests."`);
  V.f_house = async () => { await UI.notice("A cottage", "Someone's grandmother waves at you from the window and draws the curtain."); done(); };
  V.f_elder = async () => {
    const S = St();
    await say([{ who: "Elder Maple", look: L.elder, text: [S.flags.locator ? `"So Brock gave it to you." The old hare taps the locator in your paw. "The Founders cut a road into the Spurs north of here. It's still there, under three hundred years of rockfall. Follow the trail past the inn and keep climbing until the snow."` : `"The Founders came down out of the sky in the High Spurs, children. Their road still runs up into the snow north of us. Nobody goes up it now. Drakes, and the cold, and the Pact's patrols."`] }], { title: "Elder Maple" });
    done();
  };
  /* -- Kiln Hollow -- */
  V.k_brock = async () => {
    const S = St(), f = S.flags, h = hero();
    if (!f.relay) { await say([{ who: "Brock Tunnelson", look: L.brock, text: [`An old badger opens the door a crack and looks you up and down. "Don't know you. Don't want to. Go away." The door shuts.`] }], { title: "Brock's House" }); return done(); }
    if (!f.metBrock) {
      f.metBrock = true; f.locator = true;
      await say([
        { who: "Brock Tunnelson", look: L.brock, text: [`An old badger opens the door a crack. You hold up the signet. He looks at it a long time, then at you, then opens the door all the way. "Rane's kid. You've got his ears. Come in before the drakes smell you."`] },
        { who: "Brock Tunnelson", look: L.brock, text: [`"Founders' Guard, me. Last of it. When the colony was young they sealed their mechs and their deep-signal array in the Spurs, against the day something like the Pact came. Then everyone who knew where it was got old and died, except me, and I'm deaf and lame and nobody listens."`, `"Your father listened."`] },
        { who: "Brock Tunnelson", look: L.brock, text: [`He puts two things in your paws. "The locator: it points to the Vault's door, a bit north of the Fernwood and up into the snow. It'll show on your map."`, `"And this: a Guard code card. The Vault's doors each want three codes on the card -- one red, one blue, one yellow. Terminals inside put the codes on. The card only holds one of each colour at a time, and every door takes different ones. There's a star table in there that tells you which go where. Find it first."`] },
        { who: "Brock Tunnelson", look: L.brock, text: [`"The Pact knows the Vault's up there somewhere. They don't know where. Now you do." He scratches his ear. "And take Quill from the cantina with you. Best shot in the Hollow, and she's been itching to shoot a wolf since they took her brother."`] },
      ], { title: "Brock's House" });
      PM.Game.news(S, "vault");
      game().toast("The locator: the Vault is on your map", "green");
    } else await say([{ who: "Brock Tunnelson", look: L.brock, text: [f.signal ? `"You did it. You actually did it." He has to sit down. "Rane'd be proud. Rane'd also tell you to stop standing about and hold that door."` : `"Red, blue, yellow, one of each on the card. The star table tells you which. And mind the sentries; the Founders built them to last, and they did."`] }], { title: "Brock's House" });
    done();
  };
  V.k_cantina = async () => {
    const S = St(), f = S.flags;
    if (f.metBrock && !S.party.includes("quill")) {
      const c = await say([{ who: "Quill Ashby", look: L.quill, text: [`A lean hare with a long rifle across her knees looks up from a game of dice. "Brock sent you. Course he did." She stands. "Quill Ashby. I scout, I shoot, and I don't talk much. The Pact took my brother to the landing field to work their cranes. I'd like to be there when somebody takes it back."`], choices: [["Ask her to join", "join"], ["Not yet", null]] }], { title: "The Dry Well Cantina" });
      if (c === "join") await join("quill");
      return done();
    }
    await say([{ text: `The Dry Well Cantina. It's dark, cool, and smells of cactus beer. ${PM.Story.gossip(S, "civK1")}` }], { title: "The Dry Well Cantina" });
    done();
  };
  V.k_store = () => P.shop("Hollow Provisions", L.capy, "Dusty", { arms: ["knife", "blade", "pistol", "lpistol", "rifle"], armor: ["vest", "jacket"], items: ["medkit", "satchel"] }, `"Satchel charges," says the capybara, patting a crate. "Meant for blasting rock. Works on mech legs too, I'm told. By people who are now very rich or very flat."`);
  V.k_inn = async () => { const c = await say([{ text: "The Kiln Hollow boarding house: thick adobe walls, cool in the day and warm at night. Fifteen crowns.", choices: [["Take a room (15 cr)", 1], ["Leave", 0]] }], { title: "Boarding House" }); if (c) await rest(15, "Kiln Hollow"); done(); };
  V.k_house = async () => { await UI.notice("A house", "A dog barks somewhere inside. Nobody comes."); done(); };
  /* -- the Vault's door in the mountain -- */
  V.v_door = async () => {
    const S = St(), f = S.flags;
    if (!f.locator) { await UI.notice("A steel door in the mountain", "A great round door of old steel, half-buried in the scree. It doesn't move, it doesn't answer, and there's no keyhole you can see."); return done(); }
    if (f.signal && !f.won) { UI.close(true); game().storyBattle("finale", { cx: 100, cy: 14, foeAt: "south" }); return; }
    const c = await say([{ text: f.vaultIn ? "The Vault's door stands open, a dark round mouth in the mountain. Your mechs won't fit the passages: you'll go in on foot." : "The locator's arrow points straight at it: a great round door of old steel. You hold Brock's card to the plate. Somewhere deep in the mountain, something old wakes up, and the door rolls aside.<br><span class=\"note\">Your mechs won't fit the passages. You go in on foot.</span>", choices: [["Go in", 1], ["Not now", 0]] }], { title: "The Founders' Vault" });
    if (c) { f.vaultIn = true; UI.close(true); game().enterVault(); return; }
    done();
  };

  /* ---- the Vault inside ---- */
  P.vault = async o => {
    const S = St(), v = S.vault, card = S.card;
    const cardTxt = () => `Your card: <b class="c-red">red ${card.red || "—"}</b>, <b class="c-blue">blue ${card.blue || "—"}</b>, <b class="c-yellow">yellow ${card.yellow || "—"}</b>`;
    if (o.kind === "note") {
      v.note = true;
      await say([{ who: "A note pinned to a post", look: L.father, text: [`It's addressed to you, in your father's square handwriting.`, `"${esc(hero().name)} -- the key to getting to the cache is the code card. Each door needs a red, a blue and a yellow code, and each terminal imprints a single code. No code is used twice, and the card holds only one of each colour at a time.`, `When you get to the map room, read the star table. It will tell you what you need. I couldn't get the power on. You'll do better. -- R."`, `<span class="note">He was here. He got this far.</span>`] }], { title: "A note" });
    } else if (o.kind === "power") {
      if (v.power) await UI.notice("Power", "The breaker hums. The Vault's lights are on.");
      else {
        const c = await say([{ text: "A great breaker lever, red-painted, as tall as you. A brass plate: MAIN BUS. Your father couldn't move it alone. With the whole party on it...", choices: [["Throw the lever", 1], ["Leave it", 0]] }], { title: "Power" });
        if (c) { v.power = true; PM.SFX.play("lever"); await UI.notice("Power", "It goes over with a bang that shakes dust from the ceiling. One by one, down every corridor, lights flicker and come on. Somewhere, machines begin to hum -- and something begins to move."); }
      }
    } else if (o.kind === "startable") {
      v.map = true;
      await say([{ who: "The star table", text: [`A round table, its top a map of the Reach in pinpricks of light. Three of the Vault's doors are marked on it, and beside each, three constellations in three colours.`,
        `<table class="codes"><tbody>${[1, 2, 3].map(n => `<tr><td>Door ${n}${n === 1 ? " · the inner halls" : n === 2 ? " · the deep-signal array" : " · the mech bays"}</td><td class="c-red">${PM.VDOORS[n][0]}</td><td class="c-blue">${PM.VDOORS[n][1]}</td><td class="c-yellow">${PM.VDOORS[n][2]}</td></tr>`).join("")}</tbody></table>`,
        `<span class="note">You copy it into the journal.</span>`] }], { title: "The map room" });
    } else if (o.kind === "term") {
      const [colour, code] = PM.TERMINALS[o.id];
      if (!v.power) await UI.notice("A terminal", "It's dead. It seems that the power to these terminals is turned off.");
      else if (v.used[o.id]) await UI.notice("A terminal", "This terminal has already been used.");
      else {
        const c = await say([{ text: [`The screen glows ${colour}. One word on it: <b class="c-${colour}">${code.toUpperCase()}</b>.`, cardTxt()], choices: [[`Imprint ${code} on the card`, 1], ["Leave it", 0]] }], { title: "A code terminal" });
        if (c) { card[colour] = code; PM.SFX.play("click"); game().toast(`${colour}: ${code}`, "green"); }
      }
    } else if (o.kind === "vdoor") {
      const need = PM.VDOORS[o.n], ok = card.red === need[0] && card.blue === need[1] && card.yellow === need[2];
      const c = await say([{ text: [`A sealed door, its edges three lit strips: red, blue, yellow. ${v.map ? `The star table said: <b class="c-red">${need[0]}</b>, <b class="c-blue">${need[1]}</b>, <b class="c-yellow">${need[2]}</b>.` : "A slot waits for a card."}`, cardTxt()], choices: [["Put in the card", 1], ["Leave", 0]] }], { title: `Door ${o.n}` });
      if (c) {
        if (!v.power) await UI.notice(`Door ${o.n}`, "Nothing. The door is dead without power.");
        else if (ok) {
          v.open[o.n] = true;
          for (const [id, [col, code]] of Object.entries(PM.TERMINALS)) if (need.includes(code)) v.used[id] = true;
          card.red = card.blue = card.yellow = null;
          PM.SFX.play("goal");
          await UI.notice(`Door ${o.n}`, "Correct sequence. The strips go white, the card comes back blank, and the door grinds open.");
        } else { PM.SFX.play("fail"); await UI.notice(`Door ${o.n}`, "Incorrect sequence. The card comes back out, untouched."); }
      }
    } else if (o.kind === "crates") {
      if (!v.parts) { v.parts = true; S.items.repair += 2; await say([{ text: ["Crates stencilled FOUNDERS' GUARD -- MAINTENANCE. These boxes contain mech gyros! Myomer bundles, coolant cells, and -- in the last crate, wrapped in oilcloth -- the coupling the deep-signal array is missing. The cache of parts must be nearby.", `<span class="note">Two field repair kits, too.</span>`] }], { title: "Spare parts" }); }
      else await UI.notice("Spare parts", "Empty crates, and the smell of old grease.");
    } else if (o.kind === "array") {
      if (S.flags.signal) await UI.notice("The deep-signal array", "The array hums with its message, over and over, to the stars.");
      else if (!v.power) await UI.notice("The deep-signal array", "Dark.");
      else if (!v.parts) await UI.notice("The deep-signal array", "You want to raise the Concord Fleet, but you haven't found the spare parts yet. A coupling is missing from the main feed.");
      else {
        const c = await say([{ text: ["The deep-signal array: a console under a dish that goes up through the mountain. With the coupling fitted, every light on it goes green. One switch is marked CONCORD -- GENERAL CALL.", `<span class="note">Once it is sent, the Pact will know exactly where you are.</span>`], choices: [["Send the call", 1], ["Not yet", 0]] }], { title: "The deep-signal array" });
        if (c) {
          S.flags.signal = true; PM.SFX.play("recall"); PM.Game.news(S, "signal");
          await say([{ text: ["The dish turns. The mountain shivers. For a long moment nothing happens -- and then, faint and far, a reply: CONCORD FLEET ACKNOWLEDGES. FOURTEEN DAYS. HOLD.", "And then another signal, much closer: the Pact's command frequency, suddenly very busy.", `<span class="note">Get back to the door. Greymane is coming.</span>`] }], { title: "The deep-signal array" });
        }
      }
    } else if (o.kind === "bay") {
      if (!v.claimed) {
        v.claimed = true;
        for (const ch of PM.CACHE_MECHS) S.mechs.push(G.newMech(S, ch, "founders", { at: "yard" }));
        PM.SFX.play("goal");
        await say([{ text: ["Three mechs stand in their bays as if they were parked yesterday: a Sunclaw, a Sabrecat and a Dawnstrider, the Founders' own, ivory and blue, every one of them perfect.", "There's a gantry crane, a tool wall and a bay door to the mountainside. The Guard thought of everything.", `<span class="note">They're yours. Choose who pilots what at the mech bay (here or at any yard).</span>`] }], { title: "The mech bays" });
      }
      P.yard("The Founders' mech bays", L.badger, "the bays", { cheap: true });
      return;
    }
    done();
  };

  /* ---- talking to people outside ---- */
  P.talk = async n => {
    const S = St(), f = S.flags;
    const t = {
      dorran: [{ who: "Sgt. Dorran Ashgrove", look: L.dorran, text: [f.dorranTold ? `"Gunnery's the one, cadet. Piloting keeps you alive, but Gunnery ends fights."` : `"Sunclaw! Your father wants you in the Command building, sharpish. North side of the parade ground. Then the Training Hall -- that's me -- and the Hangar."`] }],
      pipB: [{ who: "Pip Hollis", look: L.pip, text: [`"Third sortie tomorrow? I flunked my second. Twice." Pip leans in. "Hey -- if anything ever goes sideways here, I'm not hanging about. My aunt runs the Rusty Lantern in Portgate. Meet me there. Promise?"`] }],
      cadetF: [{ who: "A cadet", look: "civ0", text: ["\"The Tabby's slow but she's got a heavy laser. Get close and let it rip. Mind your heat, though: hot mechs miss.\""] }],
      cadetO: [{ who: "A cadet", look: "civ3", text: ["\"Did you see the Commander's face at breakfast? Something's up. My cousin on the landing field says the Pact's been running ships in and out of the outer system all week.\""] }],
      gate: [{ who: "Gate Sergeant", look: "instrX", text: ["\"Nobody leaves until graduation, Sunclaw. Not even you.\""] }],
      freedB: [{ who: "Sgt. Dorran Ashgrove", look: L.dorran, text: [`"You took it back." He looks round at the Bastion, the smoke still clearing. "Hall's open again, cadet. Bring your recruits: ${words(PM.RECRUIT_LESSONS)} lessons each, free. They always were for Sunclaws."`] }],
      pactB1: null, pactB2: null,
    }[n.id];
    if (n.id === "pipB") f.pipTold = true;
    if (n.id === "dorran") f.dorranTold = true;
    if (n.id.startsWith("pact")) {
      const r = await say([{ who: "Pact trooper", look: n.look, text: [n.id.startsWith("pactB") ? `"The Bastion belongs to the Grey Pact now, cat. Keep walking."` : `A wolf in Pact grey blocks your way, rifle across his chest. "Papers. No? Then move along, kitten, before I find a reason."`], choices: [["Move along", 0], ["Pick a fight", 1]] }]);
      if (r) { UI.close(true); game().storyBattle(n.id.startsWith("pactB") ? "bastion" : "gatePatrol", {}); return; }
      return done();
    }
    if (n.id.startsWith("civ")) { await say([{ who: "A local", look: n.look, text: [`"${esc(PM.Story.gossip(S, n.id))}"`] }]); return done(); }
    if (t) await say(t);
    done();
  };
  P.visit = place => (V[place] || (async () => { await UI.notice("Closed", "Nobody's home."); done(); }))();
})();
