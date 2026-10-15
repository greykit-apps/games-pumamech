/* PumaMech -- the tables: weapons, chassis, personal kit, the cast, the
 * enemy, the market. Data only, DOM-free (tools/sim-check.js loads it).
 *
 * Everything here is ours. The 1988 game's mechs, weapons and people belong
 * to their owners; these are new designs that play the same parts: a
 * trainer you learn in, light scouts, a missile boat, heavies, and three
 * old designs waiting in the Founders' Vault. Numbers are guesses tuned by
 * play; they are marked where they matter. */
"use strict";
(() => {
  /* ---- mech weapons ----
   * dmg per hit (per missile for racks and pods, n of them), heat, range in
   * tiles, short: inside this it is easier to hit, min: too close to aim,
   * ammo: shots carried (none: energy), foot: damage multiplier against
   * people on foot (2 when not given: a mech's gun is meant for armour,
   * and whoever it hits is not wearing any), tHeat: heat it puts into the mech it hits */
  PM.WEAPONS = {
    chain:   { name: "Chain gun", dmg: 2, heat: 0, range: 3, short: 1, ammo: 20, foot: 3, kind: "gun", cost: 900 },
    spark:   { name: "Spark laser", dmg: 3, heat: 1, range: 3, short: 1, kind: "beam", cost: 1100, foot: 1.5 },
    laser:   { name: "Laser", dmg: 5, heat: 3, range: 6, short: 3, kind: "beam", cost: 4000 },
    hlaser:  { name: "Heavy laser", dmg: 8, heat: 8, range: 9, short: 4, kind: "beam", cost: 10000 },
    lance:   { name: "Ion lance", dmg: 10, heat: 10, range: 10, short: 5, min: 2, kind: "ion", cost: 20000 },
    lcannon: { name: "Light cannon", dmg: 5, heat: 1, range: 10, short: 4, min: 2, ammo: 20, kind: "shell", cost: 6000 },
    cannon:  { name: "Cannon", dmg: 10, heat: 3, range: 8, short: 3, ammo: 10, kind: "shell", cost: 12000 },
    thumper: { name: "Thumper", dmg: 20, heat: 7, range: 5, short: 2, ammo: 5, kind: "shell", cost: 20000 },
    pod2:    { name: "Rocket pod 2", dmg: 2, n: 2, heat: 2, range: 5, short: 2, ammo: 25, kind: "rocket", cost: 3000 },
    pod4:    { name: "Rocket pod 4", dmg: 2, n: 4, heat: 3, range: 5, short: 2, ammo: 25, kind: "rocket", cost: 6000 },
    pod6:    { name: "Rocket pod 6", dmg: 2, n: 6, heat: 4, range: 5, short: 2, ammo: 15, kind: "rocket", cost: 9000 },
    rack5:   { name: "Missile rack 5", dmg: 1, n: 5, heat: 2, range: 13, short: 6, min: 4, ammo: 24, kind: "missile", cost: 5000 },
    rack10:  { name: "Missile rack 10", dmg: 1, n: 10, heat: 4, range: 13, short: 6, min: 4, ammo: 12, kind: "missile", cost: 10000 },
    rack15:  { name: "Missile rack 15", dmg: 1, n: 15, heat: 5, range: 13, short: 6, min: 4, ammo: 8, kind: "missile", cost: 15000 },
    rack20:  { name: "Missile rack 20", dmg: 1, n: 20, heat: 6, range: 13, short: 6, min: 4, ammo: 6, kind: "missile", cost: 20000 },
    flamer:  { name: "Flamer", dmg: 2, heat: 3, range: 2, short: 1, tHeat: 4, foot: 3, kind: "flame", cost: 3000 },
  };

  /* ---- where a mech is hit ---- */
  PM.LOCS = ["HD", "CT", "LT", "RT", "LA", "RA", "LL", "RL"];
  PM.LOC_NAME = { HD: "head", CT: "centre torso", LT: "left torso", RT: "right torso", LA: "left arm", RA: "right arm", LL: "left leg", RL: "right leg" };
  /* out of 100: the body is the big target */
  PM.HIT_TABLE = [["HD", 4], ["CT", 24], ["LT", 16], ["RT", 16], ["LA", 12], ["RA", 12], ["LL", 8], ["RL", 8]];
  /* the bones of a mech, by its weight */
  PM.structure = tons => ({ HD: 3, CT: Math.round(tons * 0.32), LT: Math.round(tons * 0.24), RT: Math.round(tons * 0.24),
    LA: Math.round(tons * 0.16), RA: Math.round(tons * 0.16), LL: Math.round(tons * 0.24), RL: Math.round(tons * 0.24) });

  /* ---- chassis ----
   * tons; walk: tiles a round (running is half as far again); jump: tiles a
   * jump (0: none); sinks: heat shed a round; armor: how much of its frame's
   * most it carries; weapons [kind, location]; shape: how js/mechs.js draws
   * it; side: who builds it (both sides field most designs) */
  PM.CHASSIS = {
    drone:     { name: "Target Drone", model: "TD-0", tons: 20, walk: 4, jump: 0, sinks: 10, armor: 0.35, shape: "drone", weapons: [["spark", "RA"]],
                 role: "An academy target on legs. It shoots back, gently." },
    gnat:      { name: "Gnat", model: "GN-2", tons: 20, walk: 6, jump: 0, sinks: 10, armor: 0.55, shape: "gnat", weapons: [["laser", "CT"], ["chain", "LA"], ["chain", "RA"]],
                 role: "A scout: all legs and nerve. Quick to run down infantry." },
    skink:     { name: "Skink", model: "SK-3", tons: 25, walk: 6, jump: 4, sinks: 10, armor: 0.55, shape: "skink", weapons: [["laser", "LA"], ["laser", "RA"], ["pod2", "LT"]],
                 role: "A light raider that jumps. Cheap to run, easy to lose." },
    marten:    { name: "Marten", model: "MR-1", tons: 30, walk: 5, jump: 5, sinks: 11, armor: 0.62, shape: "marten", weapons: [["laser", "LA"], ["laser", "RA"], ["laser", "CT"], ["pod4", "RT"]],
                 role: "A light hunter on jump jets. Three lasers and a rocket pod." },
    tabby:     { name: "Tabby", model: "TB-3", tons: 35, walk: 4, jump: 0, sinks: 12, armor: 0.6, shape: "tabby", weapons: [["hlaser", "RA"], ["laser", "LA"], ["laser", "CT"], ["chain", "LT"]],
                 role: "The Bastion's trainer. Forgiving, honest and slow." },
    heron:     { name: "Heron", model: "HR-2", tons: 35, walk: 5, jump: 5, sinks: 12, armor: 0.6, shape: "heron", weapons: [["lance", "LA"], ["laser", "RA"], ["chain", "CT"]],
                 role: "A long-legged sniper with an ion lance. Hot when it fires." },
    howler:    { name: "Howler", model: "HW-1", tons: 45, walk: 5, jump: 0, sinks: 12, armor: 0.66, shape: "howler", weapons: [["lcannon", "LA"], ["laser", "RA"], ["rack10", "LT"], ["laser", "CT"]],
                 role: "The Grey Pact's own design: a long snout and a missile rack." },
    bulwark:   { name: "Bulwark", model: "BW-1", tons: 50, walk: 4, jump: 0, sinks: 12, armor: 0.72, shape: "bulwark", weapons: [["cannon", "RA"], ["rack10", "LT"], ["laser", "CT"], ["laser", "LA"]],
                 role: "A line mech: a cannon, a missile rack, a fist." },
    tusker:    { name: "Tusker", model: "TK-3", tons: 55, walk: 4, jump: 3, sinks: 14, armor: 0.7, shape: "tusker", weapons: [["hlaser", "LA"], ["pod6", "RT"], ["laser", "CT"], ["laser", "LT"]],
                 role: "A brawler that jumps into the fight and stays there." },
    ironhide:  { name: "Ironhide", model: "IH-2", tons: 60, walk: 4, jump: 0, sinks: 13, armor: 0.78, shape: "ironhide", weapons: [["thumper", "RA"], ["laser", "LT"], ["laser", "CT"], ["pod4", "LT"]],
                 role: "Thick plate and a Thumper. Close the range and hit." },
    longreach: { name: "Longreach", model: "LR-1", tons: 65, walk: 3, jump: 0, sinks: 15, armor: 0.7, shape: "longreach", weapons: [["rack20", "LT"], ["rack20", "RT"], ["laser", "LA"], ["laser", "RA"]],
                 role: "A missile boat. Keep it back, keep it fed." },
    marshal:   { name: "Grey Marshal", model: "GM-X", tons: 75, walk: 3, jump: 0, sinks: 18, armor: 0.85, shape: "marshal", weapons: [["lance", "LA"], ["lance", "RA"], ["rack15", "LT"], ["laser", "CT"], ["laser", "RT"]],
                 role: "Marshal Greymane's own. There is only one." },
    /* the Founders' designs, sealed in the Vault: better sinks, better plate */
    sunclaw:   { name: "Sunclaw", model: "SC-1", tons: 70, walk: 4, jump: 4, sinks: 22, armor: 0.9, shape: "sunclaw", weapons: [["lance", "LA"], ["lance", "RA"], ["laser", "LT"], ["laser", "RT"], ["pod6", "CT"]],
                 role: "A Founders' heavy, old as the colony and better than anything since." },
    sabre:     { name: "Sabrecat", model: "SB-2", tons: 55, walk: 5, jump: 5, sinks: 18, armor: 0.85, shape: "sabre", weapons: [["hlaser", "LA"], ["hlaser", "RA"], ["laser", "CT"], ["laser", "CT"]],
                 role: "A Founders' medium: twin heavy lasers and the sinks to fire them." },
    dawn:      { name: "Dawnstrider", model: "DS-3", tons: 45, walk: 6, jump: 6, sinks: 16, armor: 0.78, shape: "dawn", weapons: [["laser", "LA"], ["laser", "RA"], ["rack10", "LT"], ["laser", "RT"]],
                 role: "A Founders' skirmisher. Nothing on Pardalis outruns it." },
  };
  /* how much of its frame's plate a mech carries, across the board: fights of a dozen rounds, not thirty */
  PM.ARMOR_K = 0.8;
  /* what a mech is worth, whole and undamaged */
  PM.mechValue = id => { const c = PM.CHASSIS[id]; return Math.round(c.tons * 520 + c.weapons.reduce((a, [w]) => a + PM.WEAPONS[w].cost * 0.4, 0) + (c.jump ? c.tons * 60 : 0)) * 10 / 10; };

  /* ---- personal kit ---- */
  PM.ARMS = {
    fists:   { name: "Bare paws", dmg: 2, range: 1, melee: true, cost: 0 },
    knife:   { name: "Knife", dmg: 4, range: 1, melee: true, cost: 40 },
    blade:   { name: "Hum-blade", dmg: 9, range: 1, melee: true, cost: 450 },
    pistol:  { name: "Pistol", dmg: 5, range: 4, cost: 150 },
    lpistol: { name: "Laser pistol", dmg: 7, range: 5, cost: 600 },
    rifle:   { name: "Rifle", dmg: 7, range: 7, cost: 400 },
    lrifle:  { name: "Laser rifle", dmg: 10, range: 8, cost: 1400 },
    beak:    { name: "Beak and claws", dmg: 5, range: 1, melee: true, cost: 0 },
    stinger: { name: "Stinger", dmg: 4, range: 3, cost: 0 },
  };
  PM.ARMOR = {
    none:   { name: "Fatigues", def: 0, cost: 0 },
    vest:   { name: "Flak vest", def: 2, cost: 180 },
    jacket: { name: "Ablative jacket", def: 3, cost: 520 },
    suit:   { name: "Combat suit", def: 5, cost: 1600 },
  };
  PM.ITEMS = {
    medkit:  { name: "Medkit", cost: 60, note: "Heals a wound: 12 points, more with a medic's paws." },
    satchel: { name: "Satchel charge", cost: 260, note: "Packed against a mech's leg: 15 damage. Thrown from beside it." },
    repair:  { name: "Field repair kit", cost: 450, note: "Puts back 12 points of a mech's armour, between fights." },
  };

  /* ---- skills, 0 to 10 ---- */
  PM.SKILLS = [
    ["gun", "Gunnery", "Hitting with a mech's weapons."],
    ["pilot", "Piloting", "Moving a mech well: dodging, kicking, keeping it upright."],
    ["arms", "Small arms", "Pistols and rifles, on foot."],
    ["melee", "Melee", "Knives, blades and paws."],
    ["tech", "Tech", "Repairs: cheaper, and some done in the field after a fight."],
    ["medic", "Medic", "Wounds: dressed after a fight, and medkits that do more."],
  ];
  PM.SKILL_NAME = Object.fromEntries(PM.SKILLS.map(([k, n]) => [k, n]));

  /* ---- who they are ---- */
  PM.SPECIES = {
    puma: "puma", wolf: "wolf", fox: "fox", bear: "bear", hare: "hare", otter: "otter", raccoon: "raccoon", badger: "badger",
    owl: "owl", hedgehog: "hedgehog", capybara: "capybara", stoat: "stoat", mouse: "mouse", drake: "drake",
  };
  /* the lance: the cadet, and those who may join */
  PM.CAST = {
    hero:    { name: "Cadet", species: "puma", look: "cadet", hp: 24, move: 3, weapon: "pistol", armor: "none",
               skills: { gun: 2, pilot: 2, arms: 2, melee: 2, tech: 1, medic: 1 }, bio: "Third-year cadet at the Bastion. Commander Rane Sunclaw's only child." },
    pip:     { name: "Pip Hollis", species: "raccoon", look: "cadetR", hp: 20, move: 3, weapon: "pistol", armor: "vest",
               skills: { gun: 4, pilot: 3, arms: 3, melee: 1, tech: 3, medic: 0 }, bio: "Your bunkmate at the Bastion. Talks fast, shoots straight, picks locks." },
    mags:    { name: "Mags Ironpaw", species: "bear", look: "merc", hp: 34, move: 3, weapon: "rifle", armor: "jacket",
               skills: { gun: 5, pilot: 6, arms: 3, melee: 6, tech: 2, medic: 0 }, bio: "A mercenary pilot between contracts. Has opinions about every mech ever built." },
    bracken: { name: "Bracken Vale", species: "fox", look: "tech", hp: 20, move: 3, weapon: "lpistol", armor: "vest",
               skills: { gun: 3, pilot: 3, arms: 3, melee: 2, tech: 7, medic: 2 }, bio: "Fernwick's mech wright. Can fix anything twice and charge you once." },
    wren:    { name: "Wren Otterly", species: "otter", look: "doctor", hp: 20, move: 3, weapon: "pistol", armor: "none",
               skills: { gun: 2, pilot: 2, arms: 2, melee: 1, tech: 2, medic: 7 }, bio: "Portgate's best surgeon, and its most stubborn." },
    quill:   { name: "Quill Ashby", species: "hare", look: "scout", hp: 22, move: 4, weapon: "rifle", armor: "vest",
               skills: { gun: 5, pilot: 5, arms: 6, melee: 3, tech: 1, medic: 1 }, bio: "A hill scout from Kiln Hollow. Quick, quiet, and a very good shot." },
  };
  PM.PARTY_MAX = 6;
  PM.LANCE_MAX = 4;

  /* ---- what they fight ----
   * foot: people and beasts, hp, weapon, armour, skill (arms or melee);
   * look: js/people.js; drop: crowns they carry */
  PM.FOES = {
    trooper: { name: "Pact trooper", species: "wolf", look: "trooper", hp: 14, move: 3, weapon: "rifle", armor: "vest", skill: 3, drop: [10, 40] },
    sergeant:{ name: "Pact sergeant", species: "wolf", look: "sergeant", hp: 18, move: 3, weapon: "lrifle", armor: "jacket", skill: 5, drop: [30, 80] },
    officer: { name: "Pact officer", species: "wolf", look: "officerW", hp: 16, move: 3, weapon: "lpistol", armor: "jacket", skill: 4, drop: [60, 160] },
    raider:  { name: "Stoat raider", species: "stoat", look: "raider", hp: 12, move: 4, weapon: "pistol", armor: "none", skill: 3, drop: [15, 60] },
    drake:   { name: "Scrub drake", species: "drake", look: "drake", hp: 16, move: 4, weapon: "beak", armor: "none", skill: 4, drop: [0, 0], beast: true },
    ridge:   { name: "Ridge drake", species: "drake", look: "drakeBig", hp: 30, move: 3, weapon: "beak", armor: "vest", skill: 5, drop: [0, 0], beast: true, big: true },
    sentry:  { name: "Founders' sentry", species: "machine", look: "sentry", hp: 18, move: 3, weapon: "stinger", armor: "jacket", skill: 5, drop: [0, 0], machine: true },
  };
  /* a pilot's skills for the enemy's mechs, by how good the unit is */
  PM.PILOTS = { green: { gun: 3, pilot: 3 }, line: { gun: 4, pilot: 4 }, vet: { gun: 6, pilot: 5 }, ace: { gun: 7, pilot: 7 } };

  /* ---- the Mercantile Exchange: five companies, prices in crowns ---- */
  PM.STOCKS = [
    { id: "PORE", name: "Pardalis Ore & Rail", p: 42, vol: 0.035, drift: 0.002 },
    { id: "TAWN", name: "Tawny Arms Works", p: 58, vol: 0.05, drift: 0.003 },
    { id: "BRIG", name: "Brightwater Agro", p: 21, vol: 0.03, drift: 0.001 },
    { id: "RELY", name: "Relay Orbital", p: 95, vol: 0.025, drift: 0.0015 },
    { id: "KEST", name: "Kestrel Shipping", p: 33, vol: 0.06, drift: 0.0 },
  ];
  /* what the news does to them: [stock, daily push for days] */
  PM.NEWS = {
    invasion: { text: "The Grey Pact lands on Pardalis. Shipping halts; arms makers soar.", push: { PORE: [-0.06, 4], KEST: [-0.09, 5], TAWN: [0.07, 6], BRIG: [-0.03, 3] } },
    fernwick: { text: "Raiders driven out of Fernwick. The farms are shipping again.", push: { BRIG: [0.05, 4] } },
    vault:    { text: "Rumours of a Founders' cache in the High Spurs. Relay Orbital denies everything.", push: { RELY: [0.06, 4], TAWN: [-0.03, 3] } },
    signal:   { text: "A deep signal from the High Spurs. The Concord Fleet is said to be coming.", push: { KEST: [0.08, 5], PORE: [0.05, 5], TAWN: [-0.05, 4] } },
  };

  PM.CREDIT_NAME = "crowns";
  PM.cr = n => `${Math.round(n).toLocaleString("en-US")} cr`;
})();
