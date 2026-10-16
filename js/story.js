/* PumaMech -- the story: who stands where, which ways are shut, what
 * happens when you step somewhere, the battles that are written rather
 * than met, and what the journal says to do next. DOM-free.
 *
 * Pardalis, a colony world at the edge of the Tawny Reach. The Bastion
 * trains its mech pilots; Commander Rane Sunclaw runs it. The Grey Pact,
 * the wolves' league from the next system out, has wanted Pardalis for a
 * generation. Under the High Spurs the colony's Founders sealed a vault of
 * their own mechs and a deep-signal array; nobody alive has found it. */
"use strict";
(() => {
  const St = PM.Story = {};
  const G = PM.Game;
  const has = (S, id) => S.party.includes(id);

  /* ---- people standing about the world ---- */
  const NPCS = [
    /* the Bastion, before the invasion */
    { id: "dorran", look: "instrB", x: 20, y: 16, when: S => !S.flags.invaded, f: 2 },
    { id: "pipB", look: "cadetR", x: 16, y: 19, when: S => !S.flags.invaded, f: 1 },
    { id: "cadetF", look: "civ0", x: 26, y: 12, when: S => !S.flags.invaded, f: 3 },
    { id: "cadetO", look: "civ3", x: 13, y: 13, when: S => !S.flags.invaded, f: 0 },
    { id: "gate", look: "instrX", x: 22, y: 26, when: S => !S.flags.invaded, f: 4 },
    /* the Bastion, held by the Pact until it is taken back */
    { id: "pactB1", look: "trooper", x: 19, y: 29, when: S => S.flags.invaded && !S.flags.bastionFree, f: 2 },
    { id: "pactB2", look: "trooper", x: 22, y: 29, when: S => S.flags.invaded && !S.flags.bastionFree, f: 2 },
    { id: "freedB", look: "instrB", x: 20, y: 16, when: S => S.flags.bastionFree, f: 2 },
    /* Portgate under occupation */
    { id: "pactW", look: "trooper", x: 47, y: 54, when: S => S.flags.invaded && !S.flags.portgateFree, f: 4 },
    { id: "pactE", look: "sergeant", x: 76, y: 54, when: S => S.flags.invaded && !S.flags.portgateFree, f: 0 },
    { id: "pactN", look: "trooper", x: 63, y: 45, when: S => S.flags.invaded && !S.flags.portgateFree, f: 6 },
    { id: "civP1", look: "civ1", x: 55, y: 56, when: S => S.flags.invaded, f: 2 },
    { id: "civP2", look: "civ4", x: 64, y: 54, when: S => S.flags.invaded, f: 4 },
    { id: "civP3", look: "civ6", x: 70, y: 55, when: S => S.flags.invaded, f: 3 },
    { id: "civP4", look: "civ9", x: 53, y: 63, when: S => S.flags.invaded, f: 1 },
    /* Fernwick */
    { id: "civF1", look: "civ2", x: 92, y: 34, when: S => S.flags.invaded, f: 2 },
    { id: "civF2", look: "civ7", x: 87, y: 39, when: S => S.flags.invaded, f: 0 },
    /* Kiln Hollow */
    { id: "civK1", look: "civ10", x: 20, y: 70, when: S => S.flags.invaded, f: 2 },
    { id: "civK2", look: "civ5", x: 26, y: 73, when: S => S.flags.invaded, f: 4 },
  ];
  St.npcs = S => S.pos.map !== "world" ? [] : NPCS.filter(n => n.when(S)).map(n => ({ ...n, mark: St.hasNews(S, n.id) ? "!" : null }));
  /* a "!" over someone with something new to say */
  St.hasNews = (S, id) => (id === "pipB" && !S.flags.pipTold) || (id === "dorran" && !S.flags.dorranTold);

  /* ---- ways that are shut ---- */
  St.gate = (S, x, y) => {
    if (S.pos.map !== "world") return null;
    const bas = PM.TOWNS.bastion, onGate = bas.gates.some(([gx, gy]) => gx === x && gy === y);
    if (onGate && !S.flags.invaded) return { t: "msg", block: true, text: "The gate sergeant waves you back. \"Cadets stay inside the wire until they graduate, Sunclaw. Hangar's that way.\"" };
    /* the Pact holds the Bastion's gate */
    if (onGate && S.flags.invaded && !S.flags.bastionFree) {
      return { t: "story", block: true, id: "bastionGate" };
    }
    return null;
  };

  /* ---- something happens when you step here ---- */
  St.onStep = S => {
    const ev = [];
    if (S.pos.map !== "world") return ev;
    const town = PM.townAt(S.pos.x, S.pos.y);
    if (town === "fernwick" && S.flags.invaded && !S.flags.fernRaid) ev.push({ t: "story", id: "fernRaid" });
    if (town === "portgate" && S.flags.invaded && !S.flags.portgateSeen) { S.flags.portgateSeen = true; ev.push({ t: "story", id: "portgateFirst" }); }
    if (town === "kiln" && !S.flags.kilnSeen) { S.flags.kilnSeen = true; ev.push({ t: "story", id: "kilnFirst" }); }
    /* the road up to the Vault, once you know where it is */
    if (S.flags.locator && !S.flags.vaultGuard && S.pos.y <= 16 && S.pos.x >= 96 && S.pos.x <= 104) ev.push({ t: "story", id: "vaultGuard" });
    return ev;
  };

  /* ---- battles that are written ---- */
  const M = (ch, pilot = "line", paint = "wolf", o = {}) => ({ t: "mech", ch, pilot, paint, ...o });
  const F = (foe, n = 1) => Array.from({ length: n }, () => ({ t: "foot", foe }));
  St.BATTLES = {
    sortie1: { name: "Sortie one: target drones", units: [M("drone", "green", "drone"), M("drone", "green", "drone")], o: { noRetreat: true, training: true } },
    sortie2: { name: "Sortie two: the drone pack", units: [M("drone", "green", "drone"), M("drone", "green", "drone"), M("drone", "line", "drone")], o: { noRetreat: true, training: true } },
    sortie3: { name: "Sortie three: graduation", units: [M("drone", "green", "drone"), M("drone", "green", "drone")], o: { noRetreat: true, training: true, invasion: true } },
    bastion: { name: "The Pact at the Bastion's gate", units: [M("marten", "green"), M("bulwark", "green"), ...F("trooper", 2)] },
    port: { name: "The Pact's landing field", units: [M("howler", "line"), M("bulwark", "green"), M("skink", "green"), ...F("trooper", 2)] },
    gatePatrol: { name: "A Pact checkpoint", units: [...F("trooper", 2)], o: { onFoot: true } },
    fernRaid: { name: "Raiders in Fernwick", units: [...F("raider", 5)], o: { onFoot: false } },
    vaultGuard: { name: "The Pact on the Vault road", units: [M("howler", "line"), M("heron", "line"), M("marten", "vet")] },
    finale: { name: "Marshal Greymane", units: [M("marshal", "vet", "wolf", { boss: true, name: "Greymane's Grey Marshal" }), M("ironhide", "line"), M("longreach", "line"), M("tusker", "line")], o: { noRetreat: true } },
  };
  /* the graduation sortie: at the start of round three, the drones die and the wolves arrive */
  St.roundHook = (S, B) => {
    const out = [];
    if (B.story === "sortie3" && B.round === 3 && !B.invaded) {
      B.invaded = true;
      for (const u of B.units) if (u.side === 1 && !u.out) { u.out = "destroyed"; out.push({ t: "boom", id: u.id, big: 1, wreck: 1 }); }
      out.push({ t: "say", text: "The drones blow apart. Those shots came from the tree line -- live rounds!", k: "bad" });
      const a = PM.Combat.spawn(S, B, M("skink", "green"), "north"), b = PM.Combat.spawn(S, B, M("gnat", "green"), "north");
      out.push({ t: "spawn", id: a.id }, { t: "spawn", id: b.id });
      out.push({ t: "say", text: "Two grey mechs with the Grey Pact's red on their flanks. This is no exercise.", k: "bad" });
    }
    return out;
  };

  /* ---- what the journal says to do next ---- */
  St.objective = S => {
    const f = S.flags;
    if (!f.invaded) {
      const n = (f.sortie1 ? 1 : 0) + (f.sortie2 ? 1 : 0);
      if (!f.metFather) return "Report to Commander Sunclaw in the Command building, north of the parade ground.";
      const left = G.cadetLessonsLeft(S);
      return `${left ? `Take your lessons in the Training Hall (east): ${left} left. Then fly` : "Fly"} your sorties from the Hangar: ${n} of 3 flown.`;
    }
    if (!f.relay) return "Get to Portgate, south-east across the river. Pip said to meet at the Rusty Lantern; the Relay may have word from your father.";
    if (!f.metBrock) return "Find Brock Tunnelson in Kiln Hollow, south-west across the bridge, and show him the signet.";
    if (!f.locator) return "Talk to Brock again.";
    if (!f.vaultIn) return "Follow the locator's arrow to the Founders' Vault, up the trail north of Fernwick into the High Spurs.";
    if (!f.signal) {
      const v = S.vault;
      if (!v.power) return "Inside the Vault: find a way to bring its power back.";
      if (!v.open[1]) return "Open the first sealed door: imprint a red, a blue and a yellow code on the card. The map table may say which.";
      if (!v.parts) return "Search the inner halls. The deep-signal array will need parts.";
      if (!v.open[2]) return "Open the door to the deep-signal array.";
      return "Send the signal from the deep-signal array.";
    }
    if (!f.won) return "The Pact is coming for the Vault. Get your lance out and hold the door.";
    return "Pardalis holds. The Sunclaws have a lance, a Vault, and a fleet on the way.";
  };

  /* ---- what townsfolk say: a line for where the story has got to ---- */
  St.gossip = (S, id) => {
    const f = S.flags;
    const pick = list => list[(S.day + id.length) % list.length];
    if (id.startsWith("civP")) return pick(f.locator ? [
      "They say the Pact's Marshal himself has come down from orbit. Greymane. Even his own troopers are scared of him.",
      "The Exchange went wild this morning. Everyone's buying Relay Orbital and nobody will say why.",
    ] : [
      "Keep your head down, love. The wolves stop anyone with a mech pilot's wings and ask questions with their rifles.",
      "Old Brock out at Kiln Hollow fought with the Founders' Guard, or so he tells it. Mad as a box of crickets.",
      "Tawny Arms is the only thing on the Exchange going up. Guns sell in an invasion. Ore and shipping, not so much.",
      "The Pact took the landing field first. Nobody gets on or off Pardalis now without their say.",
      "You want a mech fixed, the yard by the north wall. You want it fixed right, go to Fernwick and ask for Bracken.",
    ]);
    if (id.startsWith("civF")) return pick(f.fernRaid ? ["Bracken's workshop is the best this side of the river. She'll do your mechs cheaper than the city, too.", "The Spurs trail starts north of the inn. Old roads up there, older than the colony."] : ["Raiders!"]);
    if (id.startsWith("civK")) return pick(["Brock? First adobe on the left as you come in. Knock loud; he's deaf in one ear from the old wars.", "Drakes come down from the mesas at dusk. Don't walk the badlands on foot.", "Quill's at the cantina most nights. Best shot in the Hollow, and she knows it."]);
    return "...";
  };
  /* ---- a news line for the Exchange and the inns ---- */
  St.headline = S => (S.news[0] && S.news[0].text) || "Quiet on the Exchange.";
})();
