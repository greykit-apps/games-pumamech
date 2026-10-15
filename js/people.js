/* PumaMech -- the people: the ranger (a puma), the enemy (wolves in
 * slate uniform), and the hostages and prisoners he comes for.
 *
 * PM.personArt(look, f, pose, frame) -> a canvas, drawn once and cached.
 * The FEET are at (width / 2, height - 3); c.ax, c.ay say so too. A shadow
 * rides along as c.sh at c.shx, c.shy (opaque black; the renderer paints it
 * in the zone's shadow colour in its one multiply pass).
 *
 * How a figure is made: every part (legs, torso, arms, weapon, tail, back
 * kit) is placed by a small rig for each of five headings -- south, south-
 * east, east, north-east, north -- and the other three are mirror images.
 * Heads are hand-drawn letter maps. Parts are painted into a grid of
 * "material + tone" cells, not colours; after mirroring, one lighting pass
 * brightens the west edge of every part and darkens its east edge, so the
 * low sun stays in the south-west whichever way a figure faces. Then the
 * look's ramps turn tones into colours and a 1px outline goes round. */
"use strict";
(() => {
  const K = PM.K;

  /* ---- ramps, light to dark ---- */
  const R = {
    fur:   ["#fde4b5", "#f2c78b", "#e2ab6b", "#ca8d50", "#a46b38", "#774c26"],
    muz:   ["#fffbf2", "#f7ecd6", "#e6d5b6", "#cdb892"],
    wolf:  ["#cfcfd1", "#aeaeb2", "#8f8f95", "#727279", "#57575e", "#3e3e45"],
    wmuz:  ["#f7f5ef", "#e6e3da", "#cbc8bf", "#adaaa2"],
    olive: ["#bcc77e", "#a0ad64", "#87944f", "#6f7c40", "#566131", "#3f4824"],
    camoA: ["#a98a62", "#8e6e49", "#755839", "#5d442c", "#463220", "#322316"],
    camoB: ["#5d6840", "#4a5432", "#3b4428", "#2e351f", "#222816", "#171b0e"],
    slate: ["#ced6e2", "#aeb9c8", "#909cad", "#748092", "#586377", "#40495b"],
    slateC:["#b9c3d2", "#98a4b6", "#7b889b", "#606c80", "#485366", "#343c4c"],
    navy:  ["#8a93a8", "#6c768d", "#556076", "#424b60", "#31384a", "#22283a"],
    offc:  ["#b8b79a", "#9c9b7e", "#828166", "#6a6951", "#53523f", "#3d3c2d"],
    ghil:  ["#d4ca96", "#baae79", "#9e9460", "#837a4b", "#68603a", "#4c462a"],
    shirt: ["#f6f8f9", "#dce7ee", "#bdcfdc", "#9db3c5", "#7f96ab", "#62788e"],
    trou:  ["#a58e6c", "#8b7558", "#735f47", "#5d4c39", "#483a2c", "#342a20"],
    faded: ["#d9d6bf", "#c3c0a6", "#aba88e", "#929076", "#78765f", "#5e5c49"],
    helm:  ["#b7bd94", "#9ba17a", "#82885f", "#6a704c", "#53583b", "#3b3f2a"],
    beret: ["#d6705f", "#b84f42", "#963b33", "#742b27", "#521d1b", "#361212"],
    capO:  ["#a7ad9a", "#8a917d", "#717865", "#5b6151", "#464b3e", "#33372c"],
    skin:  ["#f5d0aa", "#e6b68d", "#d19c73", "#b5805b", "#916344", "#6b4630"],
    hair:  ["#7d5e46", "#614836", "#4b3729", "#39291e", "#291d15", "#1c130d"],
    boot:  ["#836a55", "#685443", "#524234", "#403328", "#2f261d", "#211a14"],
    web:   ["#8f8a6a", "#757054", "#5f5b44", "#4c4836", "#3b3829", "#2a281d"],
    webE:  ["#77706a", "#615b55", "#4d4843", "#3d3935", "#2e2b28", "#201e1c"],
    gun:   ["#a8acb3", "#80848c", "#5d6067", "#43464c", "#2e3035", "#1e1f23"],
    wood:  ["#c4986b", "#a67d53", "#886340", "#6b4d32", "#503825", "#38271a"],
    tank:  ["#d3d7b4", "#b3b892", "#949973", "#777b57", "#5b5e40", "#40432d"],
    tube:  ["#adb681", "#929b67", "#798252", "#626a41", "#4a5031", "#353922"],
    head:  ["#8a9a6c", "#6f7f55", "#586643", "#454f34", "#333a26", "#23281a"],
    pack:  ["#a6b06e", "#8c9658", "#747e47", "#5d6638", "#464d2a", "#32371e"],
    /* PumaMech: the other peoples of Pardalis, and what they wear */
    fox:   ["#f9bf86", "#ee9a58", "#d97a3d", "#b35d2b", "#86441f", "#5a2c14"],
    bear:  ["#c99f77", "#ab8058", "#8b6441", "#6d4c31", "#513824", "#372619"],
    hare:  ["#e6d8c2", "#cfbca0", "#b39f80", "#958064", "#73624c", "#514536"],
    otter: ["#b08b6c", "#927055", "#75583f", "#5c4431", "#443224", "#2e2218"],
    racc:  ["#cdc8c0", "#aea89f", "#908a82", "#726d66", "#56534e", "#3b3936"],
    badger:["#d6d3cd", "#b4b0a9", "#928f88", "#73706a", "#54524e", "#393836"],
    owl:   ["#dcc6a3", "#c2a982", "#a38963", "#836c4c", "#635139", "#443727"],
    capy:  ["#cda57c", "#b08961", "#926c4b", "#765439", "#593f2a", "#3d2b1c"],
    stoat: ["#dda96c", "#c28b51", "#a26f3e", "#81552e", "#603e21", "#402816"],
    mouse: ["#d3c9bb", "#b8ab9a", "#9b8e7d", "#7e7262", "#61574a", "#453e34"],
    hedge: ["#b59a78", "#977d5d", "#7a6247", "#5f4b36", "#463727", "#2f251a"],
    wfur:  ["#fffdf8", "#f2ede2", "#ddd6c7", "#c2baa8"],
    blueo: ["#a9c1d8", "#86a2bf", "#6984a3", "#526a87", "#3d506a", "#2b3a4f"],
    coat:  ["#fbfcfc", "#e6ecef", "#cdd7dd", "#aebcc6", "#8e9eaa", "#6f7f8b"],
    brown: ["#b88c62", "#9b734d", "#7f5c3c", "#64472e", "#4b3422", "#332317"],
    green: ["#8fbf8a", "#6fa26b", "#548652", "#3f6a3f", "#2e4f2f", "#1f3620"],
    rust:  ["#d98a64", "#bd6c49", "#9c5437", "#7a4029", "#582e1d", "#3b1e13"],
    plum:  ["#b493b8", "#977699", "#7a5b7d", "#5f4462", "#463148", "#2f2031"],
    teal:  ["#8cc4be", "#6aa69f", "#4f8981", "#3b6c65", "#2b504b", "#1d3633"],
    cream: ["#f4ead2", "#e2d4b5", "#c9b994", "#aa9a76", "#877958", "#62573e"],
    pact:  ["#9aa3b4", "#7d8698", "#636c7e", "#4c5466", "#383f4f", "#262b38"],
    red2:  ["#d9705a", "#bf5642", "#9e4131", "#7c3125", "#5a231a", "#3c1711"],
  };
  const C = {
    eye: "#1a120c", glint: "#fffaf0", amber: "#f2b233", earP: "#e3a497", earW: "#7d6a6a",
    nose: "#d48c80", noseD: "#4a2a22", wnose: "#1f1d20", tip: "#3a2618", wtip: "#2f2f35",
    red: "#d24c30", gold: "#e8c65c", rope: "#e0cf9f", ropeD: "#a8946a", band: "#f7f2e8",
    bandD: "#d6cdbb", visor: "#1f1c1a", flame: "#ff9a3c", flameHi: "#fff1b8", lens: "#9fe3ff",
    guard: "#2e3035", blade: "#e8edf1", tipB: "#aab4bf",
  };

  /* ---- who wears what ----
   * pal maps a part's material to a ramp; head: puma | wolf | human;
   * hat, tail, arms (how the hands are busy), gun, gear (what is strapped
   * on the front), back (what rides on the back). */
  const WOLF = { skin: "wolf", muz: "wmuz", boot: "boot", web: "webE", hat: "helm" };
  const LOOK = {
    ranger:   { head: "puma", tail: "puma", arms: "gun", gun: "carbine", gear: "lbe", back: "ruck", camo: ["camoA", "camoB"],
                pal: { uni: "olive", pant: "olive", skin: "fur", muz: "muz", boot: "boot", web: "web" } },
    disguise: { head: "puma", hat: "fieldcap", tail: "puma", arms: "gun", gun: "carbine", gear: "enemy",
                pal: { uni: "slate", pant: "slate", skin: "fur", muz: "muz", boot: "boot", web: "webE", hat: "slateC" } },
    rifle:    { head: "wolf", hat: "helmet", tail: "wolf", arms: "gun", gun: "rifle", gear: "enemy",
                pal: { ...WOLF, uni: "slate", pant: "slate" } },
    elite:    { head: "wolf", hat: "beret", tail: "wolf", arms: "gun", gun: "rifle", gear: "vest",
                pal: { ...WOLF, uni: "navy", pant: "navy", hat: "beret" } },
    officer:  { head: "wolf", hat: "peaked", tail: "wolf", arms: "pistol", gun: "pistol", gear: "officer",
                pal: { ...WOLF, uni: "offc", pant: "offc", hat: "capO" } },
    at:       { head: "wolf", hat: "helmet", tail: "wolf", arms: "tube", gun: "tube", gear: "enemy",
                pal: { ...WOLF, uni: "slate", pant: "slate" } },
    flamer:   { head: "wolf", hat: "helmet", tail: "wolf", arms: "gun", gun: "wand", gear: "enemy", back: "tanks",
                pal: { ...WOLF, uni: "slate", pant: "slate" } },
    sniper:   { head: "wolf", hat: "boonie", tail: "wolf", arms: "gun", gun: "sniper", gear: "scrim", camo: ["camoA", "olive"],
                pal: { ...WOLF, uni: "ghil", pant: "ghil", hat: "ghil" } },
    hostage:  { head: "human", arms: "bound", gear: "civ",
                pal: { uni: "shirt", pant: "trou", skin: "skin", hair: "hair", boot: "boot", web: "trou" } },
    pow:      { head: "human", hat: "bandage", arms: "free", gear: "none",
                pal: { uni: "faded", pant: "faded", skin: "skin", hair: "hair", boot: "boot", web: "web" } },
  };
  LOOK.guard = LOOK.rifle;
  /* ---- PumaMech's people ----
   * a look is a head (one of PM.HEADS), what they wear, a tail if they
   * have one; arms free. "<look>@<weapon>" is the same look holding a
   * personal weapon (js/data.js PM.ARMS), made when first asked for. */
  const folk = (head, uni, pant, o = {}) => {
    const skin = { puma: "fur", wolf: "wolf", human: "skin" }[head] || head, muz = { puma: "muz", wolf: "wmuz", bear: "muz", otter: "muz", capy: "muz", hedge: "muz", human: "muz" }[head] || "wfur";
    return Object.assign({ head, arms: "free", gear: "civ", pal: { uni, pant, skin, muz, boot: "boot", web: "web", hat: o.hatPal || "capO" } }, o);
  };
  Object.assign(LOOK, {
    cadet:    folk("puma", "olive", "olive", { tail: "puma", gear: "lbe" }),
    cadetR:   folk("racc", "olive", "olive", { tail: "wolf", tip: "#3b3936", gear: "lbe" }),
    merc:     folk("bear", "brown", "olive", { gear: "vest" }),
    tech:     folk("fox", "blueo", "blueo", { tail: "wolf", tip: "#fffdf8" }),
    doctor:   folk("otter", "coat", "teal", { tail: "puma", tip: "#443224" }),
    scout:    folk("hare", "olive", "olive", { gear: "lbe", camo: ["camoA", "camoB"], hat: "boonie", hatPal: "ghil" }),
    father:   folk("puma", "olive", "olive", { tail: "puma", gear: "officer", hat: "peaked", hatPal: "capO" }),
    instrB:   folk("bear", "olive", "olive", { gear: "lbe", hat: "fieldcap", hatPal: "olive" }),
    instrO:   folk("owl", "olive", "olive", { gear: "officer" }),
    instrH:   folk("hare", "blueo", "blueo", {}),
    instrX:   folk("badger", "olive", "olive", { gear: "lbe", hat: "fieldcap", hatPal: "olive" }),
    brock:    folk("badger", "faded", "brown", { gear: "lbe", hat: "fieldcap", hatPal: "faded" }),
    keeper:   folk("owl", "plum", "plum", {}),
    banker:   folk("owl", "navy", "navy", { gear: "officer" }),
    capy:     folk("capy", "green", "brown", {}),
    hedge:    folk("hedge", "rust", "brown", {}),
    innM:     folk("mouse", "cream", "brown", { tail: "puma", tip: "#e7a8a0" }),
    coach:    folk("bear", "red2", "navy", {}),
    aunt:     folk("racc", "plum", "brown", { tail: "wolf", tip: "#3b3936" }),
    elder:    folk("hare", "cream", "brown", {}),
    raider:   folk("stoat", "rust", "brown", { tail: "puma", tip: "#3e2715" }),
    trooper:  Object.assign({}, LOOK.rifle, { arms: "free", gun: null }),
    sergeant: Object.assign({}, LOOK.elite, { arms: "free", gun: null }),
    officerW: Object.assign({}, LOOK.officer, { arms: "free", gun: null }),
    marshalW: Object.assign({}, LOOK.officer, { arms: "free", gun: null, pal: { ...LOOK.officer.pal, uni: "pact", pant: "pact", hat: "red2" } }),
  });
  /* townsfolk: one of each people, in everyday clothes */
  const CIV = [["fox", "teal"], ["bear", "cream"], ["hare", "plum"], ["otter", "rust"], ["racc", "green"], ["capy", "blueo"], ["mouse", "red2"], ["hedge", "cream"], ["puma", "teal"], ["badger", "brown"], ["stoat", "green"], ["owl", "cream"]];
  CIV.forEach(([h, u], i) => { LOOK["civ" + i] = folk(h, u, i & 1 ? "brown" : "navy", { tail: h === "puma" || h === "otter" || h === "mouse" ? "puma" : h === "fox" || h === "racc" ? "wolf" : undefined, tip: h === "fox" ? "#fffdf8" : undefined }); });
  PM.CIV_LOOKS = CIV.map((_, i) => "civ" + i);
  const ARMED = { rifle: ["gun", "rifle"], lrifle: ["gun", "rifle"], pistol: ["pistol", "pistol"], lpistol: ["pistol", "pistol"], knife: ["free", null], blade: ["free", null], fists: ["free", null] };
  const lookOf = look => {
    if (LOOK[look]) return LOOK[look];
    const [base, w] = look.split("@"), B = LOOK[base];
    if (!B) return LOOK.rifle;
    const [arms, gun] = ARMED[w] || ["free", null];
    return (LOOK[look] = Object.assign({}, B, { arms, gun }));
  };
  PM.personLooks = ["ranger", "disguise", "rifle", "elite", "officer", "at", "flamer", "sniper", "hostage", "pow"];

  /* ---- the cell grid ----
   * a cell: g span group (parts light separately), r material, t tone,
   * x fixed (the lighting pass leaves it alone), k an exact colour, m camo */
  const grid = (w, h) => ({ w, h, c: new Array(w * h).fill(null) });
  const at = (B, x, y) => (x < 0 || y < 0 || x >= B.w || y >= B.h) ? null : B.c[y * B.w + x];
  const put = (B, x, y, cell) => { x = Math.round(x); y = Math.round(y); if (x >= 0 && y >= 0 && x < B.w && y < B.h) B.c[y * B.w + x] = { ...cell }; };
  const camo = (x, y) => { const v = K.vn(x / 2.2 + 7, y / 1.7 + 13); return v < 0.32 ? 1 : v > 0.7 ? 2 : 0; };
  const flip = (B, ax) => { const N = grid(B.w, B.h); for (let y = 0; y < B.h; y++) for (let x = 0; x < B.w; x++) { const d = at(B, x, y); if (d) put(N, 2 * ax - x, y, d); } return N; };

  /* the sun from the south-west: along every row, each part's west end a
   * tone lighter and its east end a tone darker */
  const light = B => {
    for (let y = 0; y < B.h; y++) {
      let x = 0;
      while (x < B.w) {
        const c = at(B, x, y);
        if (!c || c.x) { x++; continue; }
        const g = c.g, list = [];
        let e = x;
        while (e < B.w) { const d = at(B, e, y); if (!d) break; if (!d.x) { if (d.g !== g) break; list.push(d); } e++; }
        const n = list.length, kL = n >= 3 ? (n >= 8 ? 2 : 1) : 0, kR = n >= 2 ? (n >= 6 ? 2 : 1) : 0;
        list.forEach((d, i) => { if (i < kL) d.t -= 1; else if (i >= n - kR) d.t += 1; });
        x = e;
      }
    }
  };
  const paint = (B, L) => {
    const c = K.mk(B.w, B.h), g = c.getContext("2d");
    for (let y = 0; y < B.h; y++) for (let x = 0; x < B.w; x++) {
      const d = at(B, x, y);
      if (!d) continue;
      let col = d.k;
      if (!col) {
        let rk = L.pal[d.r] || d.r;
        if (d.m && L.camo && (d.r === "uni" || d.r === "pant")) rk = L.camo[d.m - 1];
        const ramp = R[rk] || R.gun;
        col = ramp[Math.max(0, Math.min(ramp.length - 1, d.t))];
      }
      g.fillStyle = col; g.fillRect(x, y, 1, 1);
    }
    return c;
  };

  /* ---- heads: 11 wide, 10 tall, chin on the bottom row ----
   * F f j fur/skin (light, mid, shade), J dark line, E D I ears (fur, dark
   * back, inside: these are stamped again over any hat), w e eye (glint,
   * pupil), y a wolf's amber eye, m M muzzle, n N nose, s S skin, a hair */
  const HEAD = {
    puma: {
      S:  [".EE.....EE.", "EIEE...EEIE", ".FFFFFFFFF.", "FFFFFFFFFFF", "FFweFFFweFF", "fFeeFFFeeFf", "fFFFmnmFFFf", ".fJmmNmmJf.", "..fmmmmmf..", "...MMMMM..."],
      SE: ["..EE....EE.", ".EIEE..EEIE", ".FFFFFFFFF.", "FFFFFFFFFFF", "FFFFweFFweF", "fFFFeeFFeeF", "fFFFFFmnmmF", ".fFFFJmNmJ.", "..fFFfmmm..", "...jfMMM..."],
      E:  ["..DD.EE....", ".DDFEIE....", ".FFFFFFFF..", "FFFFFFFFFF.", "FFFFFFweFF.", "fFFFFFeeFmn", "fFFFFFFFJmN", ".fFFFFFJmmm", "..jfFFfjMM.", "...jfff...."],
      NE: ["..DD....DD.", ".DDFF..FDDD", ".FFFFFFFFFF", "FFFFFFFFFFF", "FFFFFFFFFFF", "fFFFFFFFFFm", "fFFFFFFFFJm", ".fFFFFFFFf.", "..ffffffj..", "...jfff...."],
      N:  [".DD.....DD.", "DDDF...FDDD", ".FFFFFFFFF.", "FFFFFFFFFFF", "FFFFFFFFFFF", "fFFFFFFFFFf", "fFFFFFFFFFf", ".fFFFFFFFf.", "..fffffff..", "...jfffj..."],
    },
    wolf: {
      S:  ["E.........E", "EE.......EE", "EIE.....EIE", ".FFFFFFFFF.", "FFFFFFFFFFF", "fFJyFFFyJFf", "fFFFmNmFFFf", ".fFmmmmmFf.", "..fmmmmmf..", "...mMMMm..."],
      SE: ["E........E.", "EE......EE.", "EIE....EIE.", ".FFFFFFFFF.", "FFFFFFFFFFF", "fFFFJyFFyJF", "fFFFFFFmmmN", ".fFFFFmmmmm", "..fFFmmmmM.", "...fmmMM..."],
      E:  ["...E.E.....", "..EIEE.....", ".FFFFFF....", "FFFFFFFF...", "FFFFFFFF...", "FFFFFJyFF..", "fFFFFFFFFFN", ".fFFFFmmmmJ", "..jfFmmmJ..", "...jmmm...."],
      NE: ["D........D.", "DD......DD.", "DDF....FDD.", ".FFFFFFFFFF", "FFFFFFFFFFF", "fFFFFFFFFFF", "fFFFFFFFFmm", ".fFFFFFFFmN", "..ffffffj..", "...jfff...."],
      N:  ["D.........D", "DD.......DD", "DDF.....FDD", ".FFFFFFFFF.", "FFFFFFFFFFF", "fFFFFFFFFFf", "fFFFFFFFFFf", ".fFFFFFFFf.", "..fffffff..", "...jfffj..."],
    },
    human: {
      S:  ["", "", "...aaaaa...", "..aaaaaaa..", ".aaaaaaaaa.", ".aasssssaa.", ".ssesssess.", "..sssssss..", "..sssSsss..", "...sssss..."],
      SE: ["", "", "...aaaaa...", "..aaaaaaa..", ".aaaaaaaaa.", ".aaassssss.", ".asssesses.", ".asssssssss", "..ssssSsss.", "...ssssss.."],
      E:  ["", "", "...aaaaa...", "..aaaaaaa..", ".aaaaaaaaa.", ".aaaasssss.", ".aaasssses.", "..assssssss", "..sssssSss.", "...sssss..."],
      NE: ["", "", "...aaaaa...", "..aaaaaaa..", ".aaaaaaaaa.", ".aaaaaaaas.", ".aaaaaaass.", "..aaaaasss.", "..sssssss..", "...sssss..."],
      N:  ["", "", "...aaaaa...", "..aaaaaaa..", ".aaaaaaaaa.", ".aaaaaaaaa.", ".saaaaaaas.", "..aaaaaaa..", "..sssssss..", "...sssss..."],
    },
  };
  /* hats, in the head's frame: front (S, SE), side (E), back (N, NE).
   * h H x the hat's material, q its dark band or brim, ~ shades what is
   * under it, k a black visor, r red, o gold, Z z bandage */
  const HAT = {
    helmet: {
      F: ["...hhhhh...", "..hhhhhhh..", ".hhhhhhhhh.", ".hhhhhhhhh.", "qqqqqqqqqqq", ".q~~~~~~~q."],
      S: ["..hhhhh....", ".hhhhhhhh..", "hhhhhhhhhh.", "hhhhhhhhhh.", "qqqqqqqqqqq", ".q~~~~~~~~."],
      B: ["...hhhhh...", "..hhhhhhh..", ".hhhhhhhhh.", ".hhhhhhhhh.", "qqqqqqqqqqq", ".qhhhhhhhq."],
    },
    beret: {
      F: ["", "", "..hhhhhh...", ".hhhhhhhhh.", "hhhhhhhohh.", ".qqqqqqqqq."],
      S: ["", "", "..hhhhhh...", ".hhhhhhhhh.", "hhhhhhhhhh.", ".qqqqqqqq.."],
      B: ["", "", "...hhhhhh..", ".hhhhhhhhh.", ".hhhhhhhhhh", ".qqqqqqqqq."],
    },
    peaked: {
      F: [".hhhhhhhhh.", "hhhhhhhhhhh", ".hhhhohhhh.", ".rrrrrrrrr.", ".kkkkkkkkk.", "..~~~~~~~.."],
      S: ["..hhhhhhh..", ".hhhhhhhhhh", "..hhhhhhho.", "..rrrrrrrr.", "..qqqqqqkkk", "...~~~~~~.."],
      B: [".hhhhhhhhh.", "hhhhhhhhhhh", ".hhhhhhhhh.", ".rrrrrrrrr.", ".qqqqqqqqq."],
    },
    boonie: {
      F: ["", "...hhhhh...", "..hhhhhhh..", "..qqqqqqq..", "hhhhhhhhhhh", "h~~~~~~~~~h"],
      S: ["", "...hhhhh...", "..hhhhhhh..", "..qqqqqqq..", "hhhhhhhhhhh", "h~~~~~~~~~h"],
      B: ["", "...hhhhh...", "..hhhhhhh..", "..qqqqqqq..", "hhhhhhhhhhh", "h.........h"],
    },
    fieldcap: {
      F: ["", "...hhhhh...", "..hhhrhhh..", "..qqqqqqq..", "..~~~~~~~.."],
      S: ["", "..hhhhh....", ".hhhhhhrh..", ".hhhhhhhqqq", "..~~~~~~.."],
      B: ["", "...hhhhh...", "..hhhhhhh..", "..hhhhhhh.."],
    },
    bandage: {
      F: ["", "", "", "", "", ".ZZZZZZZZZ."],
      S: ["", "", "", "", "", "zZZZZZZZZZ.", "z.........."],
      B: ["", "", "", "", "", ".ZZZZZZZZZ.", "....zZz...."],
    },
  };
  /* ---- PumaMech: the peoples' heads ----
   * a front (S) map each; three-quarter (SE) is the front slid a pixel
   * east; side and back views are the puma's (or the wolf's) with each
   * people's ears. Maps may run taller than ten rows (a hare's ears). */
  const FRONT = {
    fox:    ["x.........x", "EE.......EE", "EIE.....EIE", "FFFFFFFFFFF", "FFweFFFweFF", "fFeeFFFeeFf", "WWFFmNmFFWW", ".WWmmmmmWW.", "..WmmmmmW..", "...WWWWW..."],
    bear:   ["EE.......EE", "EIE.....EIE", "FFFFFFFFFFF", "FFFFFFFFFFF", "FFweFFFweFF", "fFeeFFFeeFf", "fFFmmNmmFFf", "fFmmmmmmmFf", ".ffmmmmmff.", "..ffMMMff.."],
    hare:   ["..EE...EE..", "..EI...IE..", "..EI...IE..", "..EI...IE..", ".FFFFFFFFF.", "FFFFFFFFFFF", "FFweFFFweFF", "fFeeFFFeeFf", ".fFFmnmFFf.", "..fmmNmmf..", "...MMMMM..."],
    otter:  ["...........", ".EE.....EE.", "EFFFFFFFFFE", "FFFFFFFFFFF", "FFweFFFweFF", "FFeeFFFeeFF", "fWWWmNmWWWf", ".WWmmmmmWW.", "..WWmmmWW..", "...WWWWW..."],
    racc:   [".WE.....EW.", ".EIE...EIE.", ".FFFFFFFFF.", "FFFFFFFFFFF", "FxwexWxwexF", "fxeexWxeexf", "fFFWmNmWFFf", ".fWmmmmmWf.", "..fmmmmmf..", "...MMMMM..."],
    badger: ["...........", ".xE.....Ex.", "xxWWWWWWWxx", "xxxWWWWWxxx", "xwexWWWxwex", "xeexWWWxeex", "xxxWmNmWxxx", ".xWmmmmmWx.", "..WmmmmmW..", "...WWWWW..."],
    owl:    ["E.........E", "EE.......EE", ".FFFFFFFFF.", "FWWWFFFWWWF", "WyeWFFFWyeW", "WeeWFFFWeeW", "fWWFFnFFWWf", ".fFFFNFFFf.", "..fFFFFFf..", "...fffff..."],
    capy:   ["...........", ".EE.....EE.", ".FFFFFFFFF.", "FFFFFFFFFFF", "FFweFFFweFF", "fFeeFFFeeFf", "fFFFFFFFFFf", "fFFFmNmFFFf", ".fFFFFFFFf.", "..fffffff.."],
    stoat:  ["...........", ".EE.....EE.", ".EFFFFFFFE.", "FFFFFFFFFFF", "FFweFFFweFF", "fFeeFFFeeFf", "fWWWmNmWWWf", ".WWmmmmmWW.", "..WWWWWWW..", "...WWWWW..."],
    mouse:  ["EEE.....EEE", "EIIE...EIIE", "EIEFFFFFEIE", ".FFFFFFFFF.", "FFweFFFweFF", "fFeeFFFeeFf", "fFFFmnmFFFf", ".fFmmNmmFf.", "..fmmmmmf..", "...MMMMM..."],
    hedge:  [".x.x.x.x.x.", "xxxxxxxxxxx", "xxEFFFFFExx", "xFFFFFFFFFx", "FFweFFFweFF", "fFeeFFFeeFf", "fFFmmNmmFFf", ".fFmmmmmFf.", "..fmmmmmf..", "...MMMMM..."],
  };
  /* ears for the side and back views: [side rows 0-1, back rows 0-1] */
  const EARS = {
    round: [["..DD.......", ".DDFF......"], [".DD.....DD.", "DDDF...FDDD"]],
    tiny:  [["...........", "..DD......."], ["...........", ".DD.....DD."]],
    tuft:  [["..E........", "..EE......."], ["E.........E", "EE.......EE"]],
    big:   [[".EEE.......", "EIIE......."], ["DDD.....DDD", "DDDD...DDDD"]],
  };
  const EARK = { bear: "round", racc: "round", capy: "tiny", otter: "tiny", stoat: "tiny", badger: "tiny", owl: "tuft", mouse: "big", hedge: "tiny" };
  /* inside of the ear, nose, and the ramps a head paints in */
  PM.HEADS = {
    puma:  { skin: "fur", muz: "muz", ear: "#e3a497", nose: "#4a2a22" },
    wolf:  { skin: "wolf", muz: "wmuz", ear: "#7d6a6a", nose: "#1f1d20" },
    fox:   { skin: "fox", muz: "wfur", ear: "#3a2618", nose: "#1f1d20" },
    bear:  { skin: "bear", muz: "muz", ear: "#6d4c31", nose: "#2a1c14" },
    hare:  { skin: "hare", muz: "wfur", ear: "#e3a497", nose: "#d48c80" },
    otter: { skin: "otter", muz: "muz", ear: "#443224", nose: "#2a1c14" },
    racc:  { skin: "racc", muz: "wfur", ear: "#3b3936", nose: "#1f1d20" },
    badger:{ skin: "badger", muz: "wfur", ear: "#393836", nose: "#1f1d20" },
    owl:   { skin: "owl", muz: "wfur", ear: "#635139", nose: "#e8b84a" },
    capy:  { skin: "capy", muz: "muz", ear: "#593f2a", nose: "#2a1c14" },
    stoat: { skin: "stoat", muz: "wfur", ear: "#603e21", nose: "#2a1c14" },
    mouse: { skin: "mouse", muz: "wfur", ear: "#e7a8a0", nose: "#d48c80" },
    hedge: { skin: "hedge", muz: "muz", ear: "#463727", nose: "#1f1d20" },
    human: { skin: "skin", muz: "muz", ear: "#e3a497", nose: "#4a2a22" },
  };
  for (const [k, S] of Object.entries(FRONT)) {
    const xtra = S.length - 10, slide = row => row[0] + row.slice(0, 10);
    const SE = S.map((row, i) => i < xtra ? row : slide(row));
    if (k === "fox") { HEAD.fox = { S, SE, E: HEAD.wolf.E, NE: HEAD.wolf.NE, N: HEAD.wolf.N }; continue; }
    const pu = HEAD.puma;
    if (k === "hare") {
      HEAD.hare = { S, SE, E: ["..EE.......", "..EI.......", "..EIE......", ...pu.E.slice(2)].concat([]),
        NE: ["..DD...DD..", "..DD...DD..", "..DD...DD..", ...pu.NE.slice(2)], N: ["..DD...DD..", "..DD...DD..", "..DD...DD..", ...pu.N.slice(2)] };
      /* eleven rows each, as the front has */
      for (const v of ["E", "NE", "N"]) HEAD.hare[v] = HEAD.hare[v].slice(0, 3).concat(pu[v].slice(2)).slice(0, 11);
      continue;
    }
    const [side, back] = EARS[EARK[k]];
    HEAD[k] = { S, SE, E: [...side, ...pu.E.slice(2)], NE: [...back, ...pu.NE.slice(2)], N: [...back, ...pu.N.slice(2)] };
  }

  const LEGEND = {
    F: { g: "hd", r: "skin", t: 1 }, f: { g: "hd", r: "skin", t: 2 }, j: { g: "hd", r: "skin", t: 3 }, J: { r: "skin", t: 4, x: 1 },
    s: { g: "hd", r: "skin", t: 1 }, S: { g: "hd", r: "skin", t: 2 }, a: { g: "hr", r: "hair", t: 2 },
    E: { g: "ear", r: "skin", t: 2 }, D: { r: "skin", t: 4, x: 1 },
    w: { k: C.glint, x: 1 }, e: { k: C.eye, x: 1 }, y: { k: C.amber, x: 1 },
    m: { r: "muz", t: 1, x: 1 }, M: { r: "muz", t: 2, x: 1 }, n: { k: C.nose, x: 1 },
    h: { g: "ht", r: "hat", t: 2 }, q: { r: "hat", t: 4, x: 1 }, k: { k: C.visor, x: 1 },
    r: { k: C.red, x: 1 }, o: { k: C.gold, x: 1 }, Z: { k: C.band, x: 1 }, z: { k: C.bandD, x: 1 },
    x: { r: "skin", t: 5, x: 1 }, W: { r: "muz", t: 0, x: 1 },
  };
  const stamp = (B, rows, x0, y0, legend, only) => rows.forEach((row, yy) => {
    for (let xx = 0; xx < row.length; xx++) {
      const ch = row[xx];
      if (ch === "." || (only && !only.includes(ch))) continue;
      if (ch === "~") { const d = at(B, x0 + xx, y0 + yy); if (d && !d.x) d.t += 1; continue; }
      const cell = legend[ch];
      if (cell) put(B, x0 + xx, y0 + yy, cell);
    }
  });
  const drawHead = (B, L, key, x0, y0, closed) => {
    const kind = HEAD[L.head] ? L.head : "puma", base = HEAD[kind][key], hs = PM.HEADS[kind] || PM.HEADS.puma;
    const leg = { ...LEGEND,
      I: { k: hs.ear, x: 1 },
      N: { k: hs.nose, x: 1 },
    };
    const lift = base.length - 10;
    y0 -= lift;
    let rows = base;
    if (closed) rows = base.map((row, yy) => [...row].map((ch, xx) => {
      if (ch === "w") return "F";
      if (ch === "e") return (base[yy + 1] || "")[xx] === "e" ? "F" : "J";
      if (ch === "y") return "J";
      return ch;
    }).join(""));
    stamp(B, rows, x0, y0, leg);
    if (L.hat) {
      stamp(B, HAT[L.hat][{ S: "F", SE: "F", E: "S", NE: "B", N: "B" }[key]], x0, y0 + lift, leg);
      stamp(B, rows, x0, y0, leg, "EDI");
    }
  };

  /* ---- the standing rig, x right of the feet, z up from the ground ----
   * Five headings; SW, W, NW are SE, E, NE mirrored. A arm is the
   * figure's right (the trigger hand), B its left. stab: the knife hand
   * drawn back, then driven home, which way the blade points, and the gun
   * carried low in the other hand meanwhile (like gun). */
  const W = 36, H = 34, CX = 18, FY = 31;
  const RIG = {
    S:  { dir: [0, 1], hw: 3, hx: 0, gun: [-3, 12, 0.36, -0.55], A: [[-5, 14], [-5, 11]], B: [[4, 14], [4, 10]],
          tube: [-6, 18, -6, 12], pistol: [-3, 9], bound: [0, 9], stab: [[-6, 11], [-5, 7], [-0.2, -1], [4, 12, 0.12, -1]],
          order: ["tail", "back", "legs", "torso", "head", "gun", "A", "B"] },
    SE: { dir: [Math.SQRT1_2, Math.SQRT1_2], hw: 3, hx: 0, gun: [-1, 11, 0.8, -0.45], A: [[-4, 14], [-4, 11]], B: [[3, 14], [4, 11]],
          tube: [-5, 16, 6, 12], pistol: [3, 10], bound: [1, 9], stab: [[-5, 10], [4, 9], [0.85, -0.5], [2, 12, 0.05, -1]],
          order: ["tail", "back", "legs", "B", "torso", "head", "gun", "A"] },
    E:  { dir: [1, 0], hw: 2, hx: 1, gun: [-2, 11, 1, -0.05], A: [[0, 14], [-1, 11]], B: [[1, 14], [3, 11]],
          tube: [-6, 15, 8, 15], pistol: [5, 12], bound: [2, 9], stab: [[-3, 11], [6, 12], [1, 0], [2, 12, 0.3, -0.95]],
          order: ["B", "tail", "back", "legs", "torso", "head", "gun", "A"] },
    NE: { dir: [Math.SQRT1_2, -Math.SQRT1_2], hw: 3, hx: 0, gun: [0, 11, 0.8, 0.45], A: [[3, 14], [4, 11]], B: [[-4, 14], [-4, 11]],
          tube: [-3, 13, 6, 18], pistol: [4, 12], bound: [1, 10], stab: [[0, 12], [7, 15], [0.8, 0.6], [-4, 12, -0.15, -1]],
          order: ["gun", "B", "legs", "torso", "back", "head", "A", "tail"] },
    N:  { dir: [0, -1], hw: 3, hx: 0, gun: [1, 10, 0.55, 0.55], A: [[4, 14], [4, 11]], B: [[-5, 14], [-5, 11]],
          tube: [5, 13, 6, 20], pistol: [3, 12], bound: [0, 10], stab: [[5, 12], [7, 17], [0.25, 1], [-5, 12, -0.1, -1]],
          order: ["gun", "A", "B", "legs", "torso", "back", "head", "tail"] },
  };
  /* gun lengths and where the two hands hold them */
  const GUN = { carbine: [10, 2.5, 6], rifle: [11, 2.5, 6.5], sniper: [15, 3, 8], wand: [9, 2, 5.5] };
  /* tails: points (x, z), drawn behind the body or in front of it */
  const TAIL = {
    puma: { S: [[-2, 8], [-5, 7], [-7, 6], [-9, 7], [-10, 9], [-10, 11]], SE: [[-2, 8], [-5, 7], [-7, 6], [-9, 7], [-10, 9], [-10, 11]],
            E: [[-2, 8], [-4, 7], [-6, 6], [-8, 6], [-9, 8], [-9, 10]], NE: [[-1, 8], [-2, 6], [-4, 4], [-6, 4], [-7, 6], [-7, 8]],
            N: [[0, 8], [1, 6], [2, 4], [4, 3], [6, 4], [7, 6]] },
    wolf: { S: [[-2, 8], [-4, 7], [-6, 5], [-7, 3]], SE: [[-2, 8], [-4, 7], [-6, 5], [-7, 3]],
            E: [[-2, 9], [-4, 8], [-6, 6], [-7, 3]], NE: [[-1, 8], [-2, 6], [-3, 4], [-4, 2]],
            N: [[0, 8], [0, 6], [1, 4], [1, 2]] },
  };
  /* the walk: [right foot, left foot] along the heading, which foot is lifted, the body's bob */
  const STEP = [[2.8, -2.8, 0, 0, 0], [0.7, -0.7, 0, 1, 1], [-2.8, 2.8, 0, 0, 0], [-0.7, 0.7, 1, 0, 1]];
  /* the stab: the right foot goes forward with the blow */
  const LUNGE = [[0.7, -0.7, 0, 0, 0], [2.6, -1.8, 0, 0, 0], [1.5, -1.1, 0, 0, 0]];

  const U = (g, t, x, y, r = "uni") => ({ g, r, t, m: camo(x, y) });
  const brush = (B, x, y, w, h, cell, cam) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) put(B, x + i, y + j, cam ? { ...cell, m: camo(x + i, y + j) } : cell); };
  const seg = (B, x0, y0, x1, y1, w, h, cell, cam) => {
    const n = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) * 2));
    for (let k = 0; k <= n; k++) brush(B, Math.round(x0 + (x1 - x0) * k / n), Math.round(y0 + (y1 - y0) * k / n), w, h, cell, cam);
  };
  const fixed = (r, t) => ({ r, t, x: 1 });

  /* a weapon from (x0, y0) to (x1, y1) in canvas pixels */
  const weapon = (B, kind, x0, y0, x1, y1) => {
    const n = Math.max(2, Math.ceil(Math.hypot(x1 - x0, y1 - y0))), steep = Math.abs(y1 - y0) > Math.abs(x1 - x0);
    const ox = steep ? 1 : 0, oy = steep ? 0 : 1, P = t => [Math.round(x0 + (x1 - x0) * t), Math.round(y0 + (y1 - y0) * t)];
    if (kind === "tube") {
      for (let i = 0; i <= n; i++) {
        const t = i / n, [x, y] = P(t), head = t > 0.78, rear = t < 0.1;
        const r = head ? "head" : rear ? "gun" : "tube", t0 = rear ? 3 : 1;
        put(B, x - ox, y - oy, fixed(r, t0)); put(B, x, y, fixed(r, t0 + 1)); put(B, x + ox, y + oy, fixed(r, t0 + 2));
        if (head && t > 0.84 && t < 0.97) { put(B, x - 2 * ox, y - 2 * oy, fixed(r, 1)); put(B, x + 2 * ox, y + 2 * oy, fixed(r, 3)); }
      }
      return;
    }
    if (kind === "pistol") { for (let i = 0; i <= n; i++) { const [x, y] = P(i / n); put(B, x, y, fixed("gun", 4)); } return; }
    for (let i = 0; i <= n; i++) {
      const t = i / n, [x, y] = P(t);
      let top, bot = null;
      if (kind === "wand") { top = fixed("gun", t > 0.85 ? 0 : 2); if (t < 0.25) bot = fixed("gun", 4); }
      else if (t < 0.28) { const wd = kind !== "carbine"; top = fixed(wd ? "wood" : "gun", wd ? 1 : 3); bot = fixed(wd ? "wood" : "gun", wd ? 3 : 4); }
      else if (t < 0.6) { top = fixed("gun", 1); bot = fixed("gun", 4); }
      else if (t < 0.78 && kind !== "carbine") { top = fixed(kind === "sniper" ? "gun" : "wood", 2); bot = fixed(kind === "sniper" ? "gun" : "wood", 4); }
      else if (t < 0.74) { top = fixed("gun", 2); bot = fixed("gun", 4); }
      else top = fixed("gun", kind === "sniper" ? 3 : 2);
      put(B, x, y, top);
      if (bot) put(B, x + ox, y + oy, bot);
    }
    if (kind === "rifle" || kind === "carbine") {
      const [mx, my] = P(0.5), cx = steep ? -1 : 0, cy = steep ? 0 : 1;
      put(B, mx + cx * 2, my + cy * 2, fixed("gun", 4));
      put(B, mx + cx * 3 + (kind === "rifle" ? (x1 > x0 ? 1 : -1) * (steep ? 0 : 1) : 0), my + cy * 3, fixed("gun", 4));
    }
    if (kind === "sniper") {
      for (let i = Math.round(n * 0.34); i <= Math.round(n * 0.56); i++) { const [x, y] = P(i / n); put(B, x - ox, y - oy, fixed("gun", 4)); }
      const [lx, ly] = P(0.57); put(B, lx - ox, ly - oy, { k: C.lens, x: 1 });
    }
    if (kind === "wand") {
      const dx = (x1 - x0) / n, dy = (y1 - y0) / n;
      put(B, x1 + dx, y1 + dy, { k: C.flame, x: 1 }); put(B, x1 + dx * 2, y1 + dy * 2, { k: C.flameHi, x: 1 });
    }
  };

  const tail = (B, L, pts, ox, oy, sway, flat) => {
    const wolf = L.tail === "wolf", n = pts.length - 1;
    const P = pts.map(([x, z], i) => [ox + x + (i > n - 3 ? sway * (i - n + 3) / 3 : 0), oy - z]);
    let len = 0; const seglen = [];
    for (let i = 0; i < n; i++) { const l = Math.hypot(P[i + 1][0] - P[i][0], P[i + 1][1] - P[i][1]); seglen.push(l); len += l; }
    let run = 0;
    for (let i = 0; i < n; i++) {
      const [ax, ay] = P[i], [bx, by] = P[i + 1], steps = Math.max(1, Math.ceil(seglen[i] * 2));
      for (let k = 0; k <= steps; k++) {
        const u = (run + seglen[i] * k / steps) / len, x = ax + (bx - ax) * k / steps, y = ay + (by - ay) * k / steps;
        const tipC = wolf ? (u > 0.8 ? { k: L.tip || C.wtip, x: 1 } : null) : (u > 0.84 ? { k: L.tip || C.tip, x: 1 } : null);
        const cell = tipC || { g: "tail", r: "skin", t: u < 0.5 ? 1 : 2 };
        const r = wolf ? (u < 0.15 ? 0.8 : u < 0.85 ? 1.6 : 1.1) : (u < 0.8 ? 0.9 : 0.6);
        for (let j = -2; j <= 2; j++) for (let q = -2; q <= 2; q++) if (q * q + j * j <= r * r + 0.3) put(B, Math.round(x) + q, Math.round(y) + j, cell);
      }
      run += seglen[i];
    }
    if (wolf && !flat) { const [tx, ty] = P[n]; put(B, tx, ty + 1, { k: L.tip || C.wtip, x: 1 }); }
  };

  /* ---- a standing or walking figure, into a grid ---- */
  const standing = (L, key, pose, frame, deadArms) => {
    const B = grid(W, H), rig = RIG[key], [dx, dy] = rig.dir, rx = -dy, ry = dx;
    const walk = pose === "walk", stab = pose === "stab" ? Math.min(2, frame) : -1;
    const st = walk ? STEP[frame & 3] : stab >= 0 ? LUNGE[stab] : [0.7, -0.7, 0, 0, 0], bob = st[4];
    const Y = z => FY - z - bob, X = x => CX + x;
    const hw = rig.hw, wolfish = L.head === "wolf";
    const g = L.gun ? GUN[L.gun] : null;
    const gp = stab >= 0 ? rig.stab[3] : rig.gun, gx0 = gp[0], gz0 = gp[1], gvx = gp[2], gvz = gp[3];
    const along = d => [gx0 + gvx * d, gz0 + gvz * d];
    const swing = walk ? [0, 1, 0, -1][frame & 3] : 0;

    const parts = {
      legs() {
        const legs = [[2, st[0], st[2]], [-2, st[1], st[3]]].map(([b, fa, lift]) => ({ b, fa, lift, depth: b * ry + fa * dy }));
        legs.sort((p, q) => p.depth - q.depth);
        legs.forEach((l, i) => {
          const far = i === 0, grp = far ? "legF" : "legN";
          const hx = CX + Math.round(l.b * rx), hy = FY - 7 - bob + Math.round(l.b * ry * 0.5);
          const fx = CX + Math.round(l.b * rx + l.fa * dx), sole = FY - 1 + Math.round((l.fa * dy + l.b * ry) * 0.5) - l.lift;
          const top = Math.min(hy, sole - 2);
          for (let y = top; y <= sole - 2; y++) {
            const u = sole - 2 === top ? 1 : (y - top) / (sole - 2 - top), x = Math.round(hx + (fx - hx) * u);
            for (let q = -1; q <= 1; q++) put(B, x + q, y, { g: grp, r: "pant", t: 2 + (far ? 1 : 0), m: camo(x + q, y + bob) });
          }
          const toe = key === "S" || key === "N" ? 0 : 1;
          for (let q = -1; q <= 1 + toe; q++) { put(B, fx + q, sole - 1, { g: grp + "b", r: "boot", t: 1 + (far ? 1 : 0) }); put(B, fx + q, sole, { g: grp + "b", r: "boot", t: 3 }); }
        });
      },
      torso() {
        for (let z = 9; z <= 14; z++) for (let x = -hw; x <= hw; x++) {
          if (z === 14 && Math.abs(x) === hw) continue;
          put(B, X(x), Y(z), U("body", z === 14 ? 1 : z === 9 ? 3 : 2, x, z));
        }
        for (let x = -hw; x <= hw; x++) put(B, X(x), Y(8), { g: "belt", r: "web", t: 2 });
        gear();
      },
      head() {
        drawHead(B, L, key, X(-5 + rig.hx), Y(23), deadArms);
      },
      back() {
        if (!L.back) return;
        const tanks = L.back === "tanks";
        const box = (x0, x1, z0, z1, r, cap) => {
          for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
            if (cap && z === z1 && (x === x0 || x === x1)) continue;
            put(B, X(x), Y(z), { g: "pk" + x0, r, t: z === z1 ? 1 : z === z0 ? 3 : 2 });
          }
        };
        if (key === "N") { if (tanks) { box(-3, -1, 8, 16, "tank", 1); box(1, 3, 8, 16, "tank", 1); put(B, X(-2), Y(12), { k: C.red, x: 1 }); put(B, X(2), Y(12), { k: C.red, x: 1 }); } else { box(-2, 2, 9, 15, "pack", 1); for (let x = -2; x <= 2; x++) put(B, X(x), Y(13), fixed("pack", 4)); } }
        else if (key === "NE") { if (tanks) { box(-4, -2, 8, 16, "tank", 1); box(-1, 1, 8, 16, "tank", 1); } else { box(-3, 1, 9, 15, "pack", 1); for (let x = -3; x <= 1; x++) put(B, X(x), Y(13), fixed("pack", 4)); } }
        else if (key === "E") { if (tanks) { box(-5, -3, 8, 16, "tank", 1); put(B, X(-4), Y(12), { k: C.red, x: 1 }); } else box(-4, -3, 9, 15, "pack", 1); }
        else if (tanks) { box(-4, -3, 15, 16, "tank", 1); box(3, 4, 15, 16, "tank", 1); }
      },
      tail() {
        if (!L.tail) return;
        tail(B, L, TAIL[L.tail][key], CX, FY - bob, walk ? [1, 0, -1, 0][frame & 3] : 0);
      },
      gun() {
        if (!L.gun || deadArms) return;
        if (L.gun === "tube") { const t = rig.tube; weapon(B, "tube", X(t[0]), Y(t[1]), X(t[2]), Y(t[3])); return; }
        if (L.gun === "pistol") return;
        const [x1, z1] = along(g[0]);
        if (L.gun === "wand") { // the hose, from the tanks round to the wand
          const [hx, hz] = along(1.5);
          seg(B, X(key === "N" || key === "NE" ? -1 : -hw - 1), Y(10), X(hx), Y(hz - 1), 1, 1, fixed("head", 3));
        }
        weapon(B, L.gun, X(gx0), Y(gz0), X(x1), Y(z1));
      },
      A() { arm("A"); },
      B() { arm("B"); },
    };
    /* the knife in the fist at (x, z): the guard, then the blade, v the way it points */
    const knife = (x, z, v, len) => {
      const x0 = X(x) + (v[0] > 0.3 ? 1 : 0), y0 = Y(z);
      for (let i = 1; i <= len; i++) put(B, Math.round(x0 + v[0] * i), Math.round(y0 - v[1] * i), { k: i === 1 ? C.guard : i === len ? C.tipB : C.blade, x: 1 });
    };
    /* an arm: shoulder, elbow, hand */
    const hand = (x, z) => { const c = { r: "skin", t: 2, x: 1 }; put(B, X(x), Y(z), c); put(B, X(x) + 1, Y(z), c); };
    const arm = which => {
      const [sh, el] = rig[which], grp = "arm" + which;
      const far = parts.__far === which;
      let hx, hz, ex = el[0], ez = el[1];
      const mode = deadArms ? "dead" : stab >= 0 && which === "A" ? "stab" : L.arms;
      if (mode === "stab") { const [w, s] = rig.stab, k = [0, 1, 0.55][stab]; hx = w[0] + (s[0] - w[0]) * k; hz = w[1] + (s[1] - w[1]) * k; if (stab) { ex = (sh[0] + hx) / 2; ez = (sh[1] + hz) / 2 - 1; } }
      else if (mode === "dead") { const s = Math.sign(sh[0]) || 1; ex = sh[0] + s * 2; ez = 12; hx = sh[0] + s * 3; hz = 10; }
      else if (mode === "gun") { [hx, hz] = along(which === "A" || stab >= 0 ? g[1] : g[2]); }
      else if (mode === "tube") { const t = rig.tube, u = which === "A" ? 0.45 : 0.68; hx = t[0] + (t[2] - t[0]) * u; hz = t[1] + (t[3] - t[1]) * u - 1; ez = Math.min(ez, hz); }
      else if (mode === "pistol" && which === "A") { [hx, hz] = rig.pistol; }
      else if (mode === "bound") { hx = rig.bound[0] + (which === "A" ? -1 : 0); hz = rig.bound[1]; }
      else { hx = el[0] + (key === "E" || key === "SE" || key === "NE" ? swing * (which === "A" ? 1 : -1) : 0); hz = el[1] - 2; ez = el[1]; ex = el[0] + (hx - el[0]) * 0.4; }
      const cell = { g: grp, r: "uni", t: far ? 3 : 2 };
      seg(B, X(sh[0]), Y(sh[1]), X(ex), Y(ez), 2, 2, cell, true);
      seg(B, X(ex), Y(ez), X(hx) - 0.5, Y(hz), 2, 2, cell, true);
      if (L.gear === "enemy" || L.gear === "vest") put(B, X(sh[0]), Y(12), { k: C.red, x: 1 }), put(B, X(sh[0]) + 1, Y(12), { k: C.red, x: 1 });
      if (L.gear === "officer") put(B, X(sh[0]), Y(14), { k: C.gold, x: 1 }), put(B, X(sh[0]) + 1, Y(14), { k: C.gold, x: 1 });
      if (L.gear === "civ") put(B, X(sh[0]) + 1, Y(9), { r: "uni", t: 1, x: 1 });
      hand(Math.round(hx - 0.5), Math.round(hz));
      if (mode === "stab") knife(Math.round(hx - 0.5), Math.round(hz), rig.stab[2], stab === 1 ? 5 : 4);
      if (mode === "pistol" && which === "A") {
        const v = [gvx, gvz], px = Math.round(hx - 0.5), pz = Math.round(hz);
        weapon(B, "pistol", X(px + Math.sign(v[0]) * (Math.abs(v[0]) > 0.3 ? 2 : 0)), Y(pz), X(px + v[0] * 4 + (v[0] > 0.3 ? 2 : 0)), Y(pz + v[1] * 4));
      }
      if (mode === "bound" && which === "B") { put(B, X(rig.bound[0]) - 1, Y(rig.bound[1]) - 1, { k: C.rope, x: 1 }); put(B, X(rig.bound[0]), Y(rig.bound[1]) - 1, { k: C.rope, x: 1 }); put(B, X(rig.bound[0]), Y(rig.bound[1]) + 1, { k: C.ropeD, x: 1 }); }
    };
    parts.__far = key === "E" || key === "SE" ? "B" : key === "NE" ? "B" : null;
    /* what is strapped on the front: webbing, insignia, the shirt's collar */
    const front = key === "S" || key === "SE", back = key === "N" || key === "NE";
    const gear = () => {
      const G = L.gear;
      if (wolfish && front) { const c = { r: "muz", t: 1, x: 1 }; put(B, X(0 + (key === "SE" ? 1 : 0)), Y(13), c); put(B, X(-1 + (key === "SE" ? 1 : 0)), Y(13), c); put(B, X(1 + (key === "SE" ? 1 : 0)), Y(13), c); put(B, X(key === "SE" ? 1 : 0), Y(12), c); }
      if (G === "lbe") {
        if (front || back) for (const sx of key === "SE" ? [-1, 2] : [-2, 2]) for (let z = 9; z <= 14; z++) put(B, X(sx), Y(z), fixed("web", 3));
        if (front) { put(B, X(-3), Y(9), fixed("web", 2)); put(B, X(3), Y(9), fixed("web", 2)); put(B, X(key === "SE" ? 1 : 0), Y(8), { k: C.gold, x: 1 }); }
        if (key === "E") { for (let z = 9; z <= 14; z++) put(B, X(0), Y(z), fixed("web", 3)); put(B, X(1), Y(9), fixed("web", 2)); }
      } else if (G === "enemy" || G === "vest") {
        if (G === "vest") for (let z = 10; z <= 12; z++) for (let x = -hw; x <= hw; x++) put(B, X(x), Y(z), { g: "vest", r: "webE", t: z === 12 ? 1 : 2 });
        if (front) { for (const sx of key === "SE" ? [-2, 0, 2] : [-3, -2, 2, 3]) put(B, X(sx), Y(9), fixed("webE", 1)); put(B, X(key === "SE" ? 1 : 0), Y(8), { k: C.gold, x: 1 }); }
        if (G === "vest" && front) { put(B, X(-1), Y(11), fixed("webE", 4)); put(B, X(1 + (key === "SE" ? 1 : 0)), Y(11), fixed("webE", 4)); }
      } else if (G === "officer") {
        if (front) { const o = key === "SE" ? 1 : 0; put(B, X(o), Y(12), { k: C.gold, x: 1 }); put(B, X(o), Y(10), { k: C.gold, x: 1 }); for (let i = 0; i < 6; i++) put(B, X(-hw + i + o), Y(14 - i), fixed("web", 3)); put(B, X(o), Y(8), { k: C.gold, x: 1 }); }
        if (key !== "N") { put(B, X(hw), Y(8), fixed("web", 4)); put(B, X(hw), Y(7), fixed("web", 4)); } // the holster
      } else if (G === "scrim") {
        const r = K.rng("scrim", key);
        for (let i = 0; i < 7; i++) { const x = Math.round((r() * 2 - 1) * (hw + 1)), z = 9 + Math.floor(r() * 6); put(B, X(x), Y(z), { r: r() < 0.5 ? "camoA" : "olive", t: 1 + Math.floor(r() * 3), x: 1 }); }
        put(B, X(-hw - 1), Y(13), fixed("olive", 2)); put(B, X(hw + 1), Y(12), fixed("camoA", 2));
      } else if (G === "civ") {
        if (front) { put(B, X(-1 + (key === "SE" ? 1 : 0)), Y(13), fixed("uni", 0)); put(B, X(1 + (key === "SE" ? 1 : 0)), Y(13), fixed("uni", 0)); put(B, X(key === "SE" ? 1 : 0), Y(11), fixed("uni", 3)); put(B, X(key === "SE" ? 1 : 0), Y(9), fixed("uni", 3)); }
      }
    };
    /* while the knife is out, the far hand's gun goes behind the body with it */
    let order = rig.order;
    if (stab >= 0 && order.indexOf("B") < order.indexOf("torso")) { order = order.filter(p => p !== "gun"); order.splice(order.indexOf("B") + 1, 0, "gun"); }
    for (const p of order) parts[p]();
    return B;
  };

  /* ---- prone: crawling, chin up, elbows working ---- */
  const CW = 44, CH = 30;
  const prone = (L, key, frame) => {
    const T = grid(CW, 46), ox = CW / 2, oy = 28;
    const [dx, dy] = RIG[key].dir, rx = -dy, ry = dx, k = 0.55;
    const P = (t, s, z = 0) => [ox + t * dx + s * rx, oy + (t * dy + s * ry) * k - z];
    const depth = (t, s) => t * dy + s * ry;
    const ph = [0, 1, 2, 1][frame & 3], reachL = [4.5, 2.2, 0][ph], reachR = 4.5 - reachL, sway = [-0.7, 0, 0.7, 0][frame & 3];
    const sg = (t0, s0, z0, t1, s1, z1, w, cell, cam) => { const [a, b] = P(t0, s0, z0), [c, d] = P(t1, s1, z1); seg(T, a - (w - 1) / 2, b - (w - 1) / 2, c - (w - 1) / 2, d - (w - 1) / 2, w, w, cell, cam); };
    const items = [];
    const add = (dep, f) => items.push([dep, f]);
    /* legs: the driving knee drawn up and out */
    const leg = (side, drive) => add(depth(-7, side * 2), () => {
      const grp = "leg" + side, ks = side * (drive ? 3.8 : 1.6) + sway, fs = side * (drive ? 2.6 : 1.4) + sway, ft = drive ? -7.5 : -10, kt = drive ? -5 : -6.8;
      const c = { g: grp, r: "pant", t: 2 };
      sg(-3.5, side * 1.3 + sway * 0.6, 1, kt, ks, 1, 2, c, true); sg(kt, ks, 1, ft, fs, 1, 2, c, true);
      const [bx, by] = P(ft - 0.8, fs, 1); brush(T, Math.round(bx) - 1, Math.round(by) - 1, 2, 2, { g: grp + "b", r: "boot", t: 2 });
    });
    leg(-1, ph === 2); leg(1, ph === 0);
    /* the torso: a low slab, its sunlit top over a shaded side */
    add(0, () => {
      for (let z = 1; z <= 3; z++) for (let t = -4; t <= 3.5; t += 0.4) for (let s = -2.4; s <= 2.4; s += 0.4) {
        if (z === 3 && Math.abs(s) > 1.6) continue;
        const ss = s + sway * (0.5 - (t + 4) / 15);
        const [x, y] = P(t, ss, z);
        put(T, x, y, { g: "body", r: "uni", t: z === 1 ? 3 : z === 2 ? 2 : 1, m: camo(t * 1.6, s * 1.6) });
      }
      for (let s = -2.4; s <= 2.4; s += 0.4) { const [x, y] = P(-3.4, s + sway * 0.5, 2.5); put(T, x, y, { g: "belt", r: "web", t: 2 }); }
      if (L.back === "ruck") for (let t = -1.5; t <= 1.8; t += 0.4) for (let s = -1.4; s <= 1.4; s += 0.4) { const [x, y] = P(t, s, 4); put(T, x, y, { g: "pk", r: "pack", t: t > 1.4 ? 1 : 2 }); }
      if (L.back === "tanks") for (const sc of [-1.3, 1.3]) for (let t = -2.5; t <= 1.5; t += 0.4) for (let s = -0.8; s <= 0.8; s += 0.4) { const [x, y] = P(t, sc + s, 4); put(T, x, y, { g: "tk" + sc, r: "tank", t: 2 }); }
    });
    /* arms: elbows out, the reaching hand forward */
    const arm = (side, reach) => add(depth(4, side * 3), () => {
      const et = 3.4 + reach * 0.5, es = side * (3.6 - reach * 0.25), ht = 4.4 + reach, hs = side * 1.4, c = { g: "arm" + side, r: "uni", t: 2 };
      sg(2.6, side * 2, 1.5, et, es, 1, 2, c, true); sg(et, es, 1, ht, hs, 1, 2, c, true);
      const [hx, hy] = P(ht + 0.5, hs, 1); put(T, hx, hy, { r: "skin", t: 2, x: 1 });
    });
    if (L.arms === "bound") { add(depth(4, 0), () => { const c = { g: "arm", r: "uni", t: 2 }; sg(2.6, -2, 1.5, 5, -0.5, 1, 2, c); sg(2.6, 2, 1.5, 5, 0.5, 1, 2, c); const [hx, hy] = P(5.6, 0, 1); put(T, hx, hy, { r: "skin", t: 2, x: 1 }); put(T, hx + 1, hy, { k: C.rope, x: 1 }); }); }
    else { arm(-1, reachL); arm(1, reachR); }
    /* the weapon, carried forward */
    if (L.gun && L.gun !== "pistol") add(depth(8, 1), () => {
      if (L.gun === "tube") { const [a, b] = P(-4, -1.8, 4.5), [c, d] = P(6, -1.8, 4.5); weapon(T, "tube", a, b, c, d); return; }
      const len = GUN[L.gun][0] * 0.85, [a, b] = P(3.5, 1, 2.5), [c, d] = P(3.5 + len, 1, 2.5);
      weapon(T, L.gun, a, b, c, d);
    });
    /* the tail, flat on the ground and swinging */
    if (L.tail) add(depth(-9, 0), () => {
      const sw = [1, 0, -1, 0][frame & 3], pts = L.tail === "puma" ? [[-4, 0], [-7, 1 + sw], [-10, 2.5 + sw * 1.5], [-12, 3 + sw * 1.6]] : [[-4, 0], [-6.5, 0.6 + sw * 0.5], [-9, 1 + sw]];
      const sc = pts.map(([t, s]) => { const [x, y] = P(t, s, 1); return [x - ox, oy - y]; });
      tail(T, L, sc, ox, oy, 0, true);
    });
    /* the head, chin up, at the front */
    add(depth(6.5, 0) + 0.6, () => { const [hx, hy] = P(6.6, 0, 0); drawHead(T, L, key, Math.round(hx) - 5, Math.round(hy) - 10); });
    items.sort((a, b) => a[0] - b[0]).forEach(([, f]) => f());
    /* a little dust behind, while moving */
    if (frame & 1) { const [x, y] = P(-11.5, (frame & 2) ? 2.5 : -2.5, 0); put(T, x, y, { k: "#d9c49a", x: 1 }); }
    return settle(T, CW, CH);
  };

  /* move what was drawn so its lowest row sits just above the anchor */
  const settle = (T, w, h) => {
    let lo = 0, x0 = T.w, x1 = 0;
    for (let y = 0; y < T.h; y++) for (let x = 0; x < T.w; x++) if (at(T, x, y)) { lo = y; x0 = Math.min(x0, x); x1 = Math.max(x1, x); }
    const B = grid(w, h), sy = (h - 4) - lo, sx = Math.round(w / 2 - (T.w / 2));
    for (let y = 0; y < T.h; y++) for (let x = 0; x < T.w; x++) { const d = at(T, x, y); if (d) put(B, x + sx, y + sy, d); }
    return B;
  };

  /* ---- dead: the front view laid flat, arms flung out, eyes shut ---- */
  const DW = 44, DH = 24;
  const fallen = (L, east) => {
    const S = standing(L, "S", "stand", 0, true);
    /* turn it a quarter: head to the east, or to the west */
    const T = grid(S.h, S.w);
    for (let y = 0; y < S.h; y++) for (let x = 0; x < S.w; x++) {
      const d = at(S, x, y); if (!d) continue;
      if (east) put(T, S.h - 1 - y, x, d); else put(T, y, S.w - 1 - x, d);
    }
    const B = settle(T, DW, DH);
    if (L.gun && L.gun !== "pistol") {
      const N = grid(DW, DH), kind = L.gun, len = kind === "tube" ? 12 : GUN[kind][0], gx = DW / 2 + (east ? -12 : 2);
      weapon(N, kind, gx, DH - 4, gx + len, DH - 5);
      for (let i = 0; i < B.c.length; i++) if (B.c[i]) N.c[i] = B.c[i];
      return N;
    }
    return B;
  };

  /* ---- shadows ---- */
  const standShadow = (c, cx, fy) => {
    const W2 = c.width + 32, H2 = 16, s = K.mk(W2, H2), g = s.getContext("2d"), d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
    g.fillStyle = "#000";
    for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) {
      if (d[(y * c.width + x) * 4 + 3] < 40) continue;
      const z = Math.max(0, fy - y);
      g.fillRect(Math.round(x + z * K.SX), Math.round(13 + z * K.SY), 2, 1);
    }
    K.disc(g, cx + 1, 13, 4, 1, "#000");
    c.sh = s; c.shx = 0; c.shy = fy - 13;
  };
  const flatShadow = (c, lift) => {
    const s = K.mk(c.width + 6, c.height + 4), g = s.getContext("2d"), d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
    g.fillStyle = "#000";
    for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) {
      if (d[(y * c.width + x) * 4 + 3] < 40) continue;
      for (let z = 1; z <= lift; z++) g.fillRect(Math.round(x + z * K.SX), Math.round(y + 3 + z * K.SY), 1, 1);
    }
    c.sh = s; c.shx = 0; c.shy = -3;
  };

  const OCT = [["E", 0], ["SE", 0], ["S", 0], ["SE", 1], ["E", 1], ["NE", 1], ["N", 0], ["NE", 0]];
  PM.personArt = (look, f, pose, frame) => {
    const L = lookOf(look), o = (((Math.round((f | 0) / 4)) % 8) + 8) % 8;
    if (pose !== "walk" && pose !== "crawl" && pose !== "stab") frame = 0;
    if (pose === "dead") { const east = PM.DIR32[(f | 0) & 31][0] >= 0; return K.get(`pd${look}${east ? 1 : 0}`, () => make(L, () => fallen(L, east), c => flatShadow(c, 2))); }
    const [key, mir] = OCT[o];
    if (pose === "crawl") return K.get(`pc${look}${o}${frame & 3}`, () => make(L, () => { const B = prone(L, key, frame); return mir ? flip(B, CW / 2) : B; }, c => flatShadow(c, 4)));
    const p = pose === "walk" || pose === "stab" ? pose : "stand";
    return K.get(`ps${look}${o}${p}${p === "stand" ? 0 : frame & 3}`, () => make(L, () => { const B = standing(L, key, p, frame); return mir ? flip(B, CX) : B; }, c => standShadow(c, CX, FY)));
  };
  const make = (L, build, shade) => {
    const B = build();
    light(B);
    const c = paint(B, L);
    K.outline(c);
    shade(c);
    c.ax = c.width / 2; c.ay = c.height - 3;
    return c;
  };
})();
