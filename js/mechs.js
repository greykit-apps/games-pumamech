/* PumaMech -- the mechs, drawn.
 *
 * PM.mechArt(chassis, paint, dir, pose, frame) -> a canvas, made once and
 * cached. dir is one of eight headings (0 east, 2 south, 4 west, 6 north);
 * pose is "stand", "walk" (frames 0-3), "down" (legs shot away) or "wreck".
 * The canvas's (c.ax, c.ay) is where the mech stands on the ground; its
 * shadow rides along as c.sh at (c.shx, c.shy), opaque, for the renderer's
 * one multiply pass, as everything else on the field.
 *
 * How: every chassis is a little model of boxes and limbs in its own space
 * (x to its right, y ahead, z up, in pixels), posed (the legs by two-bone
 * reach, so a step plants a foot), turned to the heading, and sampled over
 * its surfaces into a depth buffer. The view is the field's: overhead and
 * tilted, looking north, with a model's own depth halved so tops show and
 * south faces stand up. Each sample is lit by the low south-west sun from
 * its surface's normal, dithered into its material's ramp, and where a
 * nearer part crosses a farther one the farther pixel darkens, so parts
 * read apart. Then the outline, and the shadow cast north-east. */
"use strict";
(() => {
  const K = PM.K;
  const KY = 0.5;                                  /* a model's depth on screen, per pixel of depth */
  const L = (() => { const v = [-0.62, 0.45, 0.64], n = Math.hypot(...v); return v.map(a => a / n); })();

  /* ---- paint: ramps light to dark ---- */
  const RAMP = {
    sand:   ["#f3e2bb", "#dfc594", "#c6a571", "#a38352", "#7c613b", "#544028"],
    olive:  ["#b9be86", "#979c66", "#787d4c", "#5a5e37", "#3e4126", "#282a19"],
    slate:  ["#c6cdd9", "#a3acbb", "#828c9d", "#646d7e", "#49505e", "#313640"],
    night:  ["#737a87", "#5c616e", "#474b56", "#353841", "#26282f", "#18191e"],
    red:    ["#f39073", "#da5d44", "#b73e2d", "#882a20", "#5c1c16", "#3b120e"],
    orange: ["#ffc782", "#f59f4a", "#d77b2c", "#a7591d", "#743c14", "#49250c"],
    yellow: ["#fff2a6", "#f4d55e", "#dbaf31", "#b2881e", "#806015", "#513c0d"],
    ivory:  ["#f8f6ef", "#e4e0d3", "#c9c4b3", "#a5a08f", "#7d796a", "#56534b"],
    blue:   ["#a6d4ff", "#6eabeb", "#4985c6", "#356197", "#244168", "#172941"],
    steel:  ["#ccd1d7", "#a7aeb6", "#848b95", "#646a74", "#474c55", "#30343b"],
    gun:    ["#9da2aa", "#7b8089", "#5e636b", "#464a51", "#32353b", "#222428"],
    glass:  ["#c7ecff", "#86c0e2", "#4d87ad", "#2f5d80", "#1d405b", "#122a3e"],
    char:   ["#6b6460", "#55504c", "#433f3c", "#33302e", "#262423", "#1a1918"],
    rust:   ["#c99a74", "#a77650", "#855a3a", "#66432b", "#4a301f", "#2f1e13"],
  };
  /* who paints a mech how: hull, trim (joints, legs), accent (stripes), lamp (an eye) */
  const PAINT = {
    claw:     { hull: "sand", trim: "olive", accent: "orange", lamp: null },
    academy:  { hull: "olive", trim: "night", accent: "yellow", lamp: null },
    wolf:     { hull: "slate", trim: "night", accent: "red", lamp: "#ff5a3d" },
    drone:    { hull: "yellow", trim: "night", accent: "night", lamp: "#ff5a3d" },
    founders: { hull: "ivory", trim: "steel", accent: "blue", lamp: "#9fe3ff" },
    rogue:    { hull: "rust", trim: "night", accent: "olive", lamp: null },
  };
  PM.MECH_PAINTS = Object.keys(PAINT);

  /* ---- the chassis, as shapes ----
   * s scale; legs hum (knees forward) or bird (knees back); hipW half the
   * stance; up thigh+shin length; lr leg radius; torso w d h; cock where the
   * pilot sits (head, front, canopy); arms; pods (missile boxes on the
   * shoulders); jets; ears (the Sunclaw's); crest; snout (wolf designs) */
  const SHAPE = {
    tabby:    { s: 0.92, legs: "hum", hipW: 5, up: 15, lr: 2.2, torso: [17, 11, 13], cock: "head", arms: ["gun:laser", "gun:laser2"], pods: [], stripe: 1 },
    gnat:     { s: 0.78, legs: "bird", hipW: 4, up: 16, lr: 1.8, torso: [13, 13, 10], cock: "canopy", arms: ["pod:chain", "pod:chain"], pods: [], egg: 1 },
    skink:    { s: 0.82, legs: "hum", hipW: 4, up: 15, lr: 1.9, torso: [14, 10, 11], cock: "head", arms: ["gun:laser", "gun:laser"], pods: [0, 1], jets: 1 },
    marten:   { s: 0.86, legs: "hum", hipW: 4, up: 16, lr: 2, torso: [15, 10, 12], cock: "head", arms: ["gun:laser", "gun:laser"], pods: [1, 0], jets: 1, antenna: 1 },
    heron:    { s: 0.9, legs: "bird", hipW: 4, up: 19, lr: 2, torso: [15, 12, 12], cock: "canopy", arms: ["gun:lance", "gun:laser"], pods: [], jets: 1, antenna: 1 },
    howler:   { s: 0.96, legs: "bird", hipW: 5, up: 18, lr: 2.4, torso: [18, 14, 12], cock: "front", arms: ["gun:cannon", "gun:laser"], pods: [1, 0], snout: 1 },
    bulwark:  { s: 1.0, legs: "hum", hipW: 6, up: 15, lr: 2.6, torso: [20, 12, 14], cock: "head", arms: ["fist", "gun:cannon"], pods: [1, 0] },
    tusker:   { s: 1.02, legs: "hum", hipW: 6, up: 14, lr: 2.8, torso: [21, 13, 13], cock: "front", arms: ["gun:heavy", "fist"], pods: [0, 1], jets: 1, tusks: 1 },
    ironhide: { s: 1.06, legs: "hum", hipW: 6, up: 15, lr: 3, torso: [22, 13, 15], cock: "head", arms: ["fist", "gun:thumper"], pods: [1, 0] },
    longreach:{ s: 1.08, legs: "hum", hipW: 6, up: 14, lr: 3, torso: [20, 13, 13], cock: "head", arms: ["stub", "stub"], pods: [2, 2] },
    marshal:  { s: 1.14, legs: "hum", hipW: 7, up: 16, lr: 3.2, torso: [24, 14, 15], cock: "head", arms: ["gun:lance", "gun:lance"], pods: [1, 0], crest: 1, snout: 1 },
    drone:    { s: 0.76, legs: "bird", hipW: 4, up: 13, lr: 1.7, torso: [12, 11, 9], cock: "canopy", arms: ["pod:spark", "none"], pods: [], egg: 1, hazard: 1 },
    sunclaw:  { s: 1.1, legs: "hum", hipW: 6, up: 17, lr: 2.9, torso: [21, 13, 14], cock: "head", arms: ["gun:lance", "gun:lance"], pods: [0, 1], jets: 1, ears: 1, stripe: 1 },
    sabre:    { s: 1.0, legs: "hum", hipW: 5, up: 17, lr: 2.5, torso: [18, 12, 13], cock: "head", arms: ["gun:heavy", "gun:heavy"], pods: [], jets: 1, ears: 1, stripe: 1 },
    dawn:     { s: 0.94, legs: "bird", hipW: 5, up: 18, lr: 2.3, torso: [17, 13, 11], cock: "canopy", arms: ["gun:laser", "gun:laser"], pods: [1, 1], jets: 1, antenna: 1 },
  };
  PM.MECH_SHAPES = Object.keys(SHAPE);

  /* ---- primitives in model space ---- */
  const box = (P, x0, y0, z0, x1, y1, z1, m, part, o = {}) => P.push({ t: "box", a: [Math.min(x0, x1), Math.min(y0, y1), Math.min(z0, z1)], b: [Math.max(x0, x1), Math.max(y0, y1), Math.max(z0, z1)], m, part, ...o });
  const limb = (P, a, b, r, m, part, o = {}) => P.push({ t: "seg", a, b, r, m, part, ...o });

  /* two bones from hip h to foot f, lengths l1 l2, the knee bending forward
   * (sign +1) or back (-1) in the leg's own plane (y, z) */
  const knee = (h, f, l1, l2, sign) => {
    const dy = f[1] - h[1], dz = f[2] - h[2], d = Math.min(l1 + l2 - 0.01, Math.hypot(dy, dz));
    const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d), hh = Math.sqrt(Math.max(0, l1 * l1 - a * a));
    const ux = dy / (Math.hypot(dy, dz) || 1), uz = dz / (Math.hypot(dy, dz) || 1);
    const py = h[1] + ux * a, pz = h[2] + uz * a;
    /* the perpendicular in the plane, chosen so the knee goes forward (+y) or back */
    let ny = -uz, nz = ux;
    if (Math.sign(ny || 1) !== sign) { ny = -ny; nz = -nz; }
    return [h[0] + (f[0] - h[0]) * 0.5, py + ny * hh, pz + nz * hh];
  };

  /* the walk: per frame, each foot's reach ahead and lift, and the body's bob */
  const GAIT = [[4, -4, 0, 0, 0], [1, -1, 0, 2, 1], [-4, 4, 0, 0, 0], [-1, 1, 2, 0, 1]];

  const build = (id, pose, frame) => {
    const S = SHAPE[id] || SHAPE.bulwark, P = [], s = S.s;
    const [tw, td, th] = S.torso.map(v => v * s);
    const wreck = pose === "wreck", down = pose === "down" || wreck;
    const g = pose === "walk" ? GAIT[frame & 3] : [0, 0, 0, 0, 0];
    const up = S.up * s, l1 = up * 0.5, l2 = up * 0.52, hipW = S.hipW * s, lr = S.lr * s;
    const bird = S.legs === "bird";
    /* how high the hips ride: legs a little bent, lower when the legs are gone */
    const hipZ = down ? (wreck ? 4 : 7 * s) : up * 0.93 + 3 - g[4];
    const sink = wreck ? 3 : 0;
    /* ---- legs ---- */
    if (!down) {
      for (const side of [-1, 1]) {
        const reach = side < 0 ? g[0] : g[1], lift = side < 0 ? g[2] : g[3];
        const h = [side * hipW, bird ? -1 : 0, hipZ];
        const f = [side * (hipW + 0.5), reach * s + (bird ? 1 : 0), 3 + lift];
        const kn = knee(h, f, l1, l2, bird ? -1 : 1);
        limb(P, h, kn, lr * 1.15, "trim", "thigh" + side);
        limb(P, kn, f, lr, "trim", "shin" + side);
        box(P, kn[0] - lr * 0.9, kn[1] - lr * 0.9, kn[2] - lr * 0.9, kn[0] + lr * 0.9, kn[1] + lr * 0.9, kn[2] + lr * 0.9, "hull", "knee" + side);
        /* the foot: long ahead, a heel behind; a bird's spread toes */
        const fx = f[0], fy = f[1], fz = f[2] - 3, fw = lr * 1.2 + 0.6;
        box(P, fx - fw, fy - (bird ? 2.5 : 3) * s, fz, fx + fw, fy + (bird ? 5.5 : 5) * s, fz + 2.2, "trim", "foot" + side);
        if (bird) box(P, fx - fw - 1, fy + 3.5 * s, fz, fx + fw + 1, fy + 6 * s, fz + 1.6, "trim", "toe" + side);
        else box(P, fx - fw, fy + 3 * s, fz + 2.2, fx + fw, fy + 5 * s, fz + 3.2, "hull", "toecap" + side);
      }
    } else if (!wreck) {
      /* legs shot away: stumps, kneeling on them */
      for (const side of [-1, 1]) {
        box(P, side * hipW - lr, -3, 0, side * hipW + lr, 4, 4, "char", "stump" + side);
      }
    }
    /* ---- the pelvis and torso ---- */
    const tz = hipZ + 1.5 * s - sink;
    box(P, -hipW - lr, -3 * s, hipZ - 2.5 * s - sink, hipW + lr, 3 * s, hipZ + 2 * s - sink, "trim", "pelvis");
    const tilt = wreck ? 2 : 0;
    const T0 = [-tw / 2, -td / 2 + (bird ? -1 : 0), tz], T1 = [tw / 2, td / 2 + (bird ? -1 : 0), tz + th];
    if (S.egg) {
      /* an egg of a body: stacked slabs, narrower at top and bottom */
      for (let i = 0; i < 5; i++) {
        const k = [0.72, 0.92, 1, 0.92, 0.7][i], z0 = T0[2] + th * i / 5, z1 = T0[2] + th * (i + 1) / 5;
        box(P, -tw / 2 * k, T0[1] * k, z0, tw / 2 * k, T1[1] * k + (i >= 2 ? 1.5 : 0), z1, "hull", "body");
      }
      if (S.hazard) for (let i = -2; i <= 2; i += 2) box(P, i * tw / 10 - 1, T1[1] - 0.6, T0[2] + 1, i * tw / 10 + 1, T1[1] + 0.25, T0[2] + th * 0.5, "accent", "haz");
    } else {
      box(P, T0[0], T0[1], T0[2], T1[0], T1[1], T1[2] - tilt, "hull", "body");
      /* the chest plate and the side armour, a step out */
      box(P, -tw * 0.36, T1[1], T0[2] + th * 0.25, tw * 0.36, T1[1] + 1.4 * s, T1[2] - 1.5, "hull", "chest");
      if (S.stripe) box(P, -tw * 0.36, T1[1] + 1.4 * s, T0[2] + th * 0.45, tw * 0.36, T1[1] + 1.7 * s, T0[2] + th * 0.6, "accent", "stripe");
      box(P, T0[0] - 0.6, T0[1] + 1, T0[2] + 1, T0[0], T1[1] - 1, T1[2] - 2, "trim", "sideL");
      box(P, T1[0], T0[1] + 1, T0[2] + 1, T1[0] + 0.6, T1[1] - 1, T1[2] - 2, "trim", "sideR");
      /* the vents low on the back, a ridge on top */
      box(P, -tw * 0.3, T0[1] - 1.2, T0[2] + 1, tw * 0.3, T0[1], T0[2] + th * 0.45, "vent", "vent");
      box(P, -tw * 0.18, T0[1] + 1, T1[2] - tilt, tw * 0.18, T1[1] - 2, T1[2] + 1 - tilt, "trim", "ridge");
    }
    /* accent bands on the shoulders of a striped design */
    if (S.stripe && !S.egg) { box(P, T0[0] - 0.7, T0[1] + 2, T1[2] - 3, T0[0], T1[1] - 2, T1[2] - 1.5, "accent", "bandL"); box(P, T1[0], T0[1] + 2, T1[2] - 3, T1[0] + 0.7, T1[1] - 2, T1[2] - 1.5, "accent", "bandR"); }
    /* ---- where the pilot sits ---- */
    const top = T1[2] - tilt;
    if (S.cock === "head") {
      const hw = 3.6 * s, hd = 3.4 * s, hz = top, hy = T1[1] * 0.25;
      box(P, -hw, hy - hd, hz, hw, hy + hd, hz + 5 * s, "hull", "head");
      box(P, -hw + 0.8, hy + hd, hz + 2 * s, hw - 0.8, hy + hd + 0.6, hz + 4 * s, "glass", "visor");
      for (const sd of [-1, 1]) box(P, sd * (hw - 1.4) - 0.6, hy + hd + 0.5, hz + 2.6 * s, sd * (hw - 1.4) + 0.6, hy + hd + 0.9, hz + 3.6 * s, "lamp", "eye" + sd);
      if (S.ears) for (const sd of [-1, 1]) box(P, sd * hw * 0.55 - 1.1, hy - 1, hz + 5 * s, sd * hw * 0.55 + 1.1, hy + 1, hz + 7.6 * s, "accent", "ear" + sd, { taper: 1 });
      if (S.crest) box(P, -0.8, hy - hd - 2, hz + 4.5 * s, 0.8, hy + hd - 1, hz + 7 * s, "accent", "crest");
      if (S.snout) box(P, -hw * 0.5, hy + hd, hz + 0.5, hw * 0.5, hy + hd + 2.2 * s, hz + 2 * s, "hull", "snout");
    } else if (S.cock === "front") {
      box(P, -tw * 0.3, T1[1] + 1.2 * s, top - 6 * s, tw * 0.3, T1[1] + 2.4 * s, top - 1.5 * s, "glass", "visor");
      if (S.snout) box(P, -tw * 0.18, T1[1] + 2.4 * s, top - 7 * s, tw * 0.18, T1[1] + 4.8 * s, top - 4 * s, "hull", "snout");
      if (S.tusks) for (const sd of [-1, 1]) limb(P, [sd * tw * 0.3, T1[1] + 1, T0[2] + 2], [sd * tw * 0.36, T1[1] + 5 * s, T0[2] + 5], 0.9, "ivory", "tusk" + sd);
    } else {
      /* a canopy bubble on the front of the body */
      box(P, -tw * 0.26, T1[1] * 0.4, top - 1, tw * 0.26, T1[1] + 1.5, top + 2.4 * s, "glass", "visor");
    }
    if (S.antenna) limb(P, [tw * 0.34, T0[1] + 2, top], [tw * 0.4, T0[1] + 1, top + 9 * s], 0.45, "steel", "ant");
    if (S.jets) for (const sd of [-1, 1]) box(P, sd * tw * 0.28 - 1.6 * s, T0[1] - 2.4 * s, T0[2] + th * 0.35, sd * tw * 0.28 + 1.6 * s, T0[1], T0[2] + th * 0.85, "steel", "jet" + sd);
    /* ---- shoulders' missile boxes ---- */
    const pods = S.pods || [];
    pods.forEach((n, i) => {
      if (!n) return;
      const sd = i ? 1 : -1, w = (n === 2 ? 6.5 : 4.5) * s, x0 = sd > 0 ? tw / 2 - w * 0.9 : -tw / 2 - w * 0.1;
      box(P, x0, -td * 0.35, top - 1, x0 + w, td * 0.45, top + (n === 2 ? 6 : 4.2) * s, "hull", "pod" + sd);
      /* the tubes, a grid of dark mouths on its face */
      const rows = n === 2 ? 2 : 1, cols = n === 2 ? 3 : 2;
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        const cx = x0 + w * (c + 0.5) / cols, cz = top + ((n === 2 ? 6 : 4.2) * s) * (r + 0.5) / rows;
        box(P, cx - 0.7, td * 0.45, cz - 0.7, cx + 0.7, td * 0.45 + 0.4, cz + 0.7, "vent", "tube");
      }
    });
    /* ---- arms ---- */
    S.arms.forEach((a, i) => {
      const sd = i ? 1 : -1, [kind, gun] = a.split(":");
      if (kind === "none") return;
      if (wreck && i === 0) return;                      /* an arm torn off */
      const sx = sd * (tw / 2 + 1.6 * s), sz = top - 3 * s, sy = 0;
      box(P, sx - 2 * s, sy - 2.4 * s, sz - 2 * s, sx + 2 * s, sy + 2.4 * s, sz + 2.2 * s, "hull", "shoulder" + sd);
      if (kind === "stub") { box(P, sx - 1.5 * s, -1.5, sz - 7 * s, sx + 1.5 * s, 2.5, sz - 2 * s, "trim", "arm" + sd); return; }
      if (kind === "pod") {
        /* a gun pod hung on the body's side */
        box(P, sx - 1.8 * s, -3 * s, sz - 6 * s, sx + 1.8 * s, 5 * s, sz - 2 * s, "trim", "gpod" + sd);
        barrel(P, gun, sx, 5 * s, sz - 4 * s, s, sd);
        return;
      }
      const ez = sz - 6.5 * s, ey = 1.5 * s;
      limb(P, [sx, sy, sz - 1], [sx, ey, ez], 1.5 * s, "trim", "upper" + sd);
      if (kind === "fist") {
        limb(P, [sx, ey, ez], [sx, ey + 4.5 * s, ez - 1 * s], 1.7 * s, "trim", "fore" + sd);
        box(P, sx - 2 * s, ey + 4 * s, ez - 3 * s, sx + 2 * s, ey + 7.5 * s, ez + 1 * s, "hull", "fist" + sd);
        return;
      }
      /* a gun arm: the forearm is the gun's housing */
      const big = gun === "cannon" || gun === "thumper" || gun === "heavy" || gun === "lance";
      const hw = (big ? 2.4 : 1.8) * s;
      box(P, sx - hw, ey - 1.5 * s, ez - 2.2 * s, sx + hw, ey + 6.5 * s, ez + 1.6 * s, "hull", "fore" + sd);
      barrel(P, gun, sx, ey + 6.5 * s, ez - 0.3 * s, s, sd);
    });
    return P;
  };
  /* a weapon's barrel from its housing forward */
  const barrel = (P, gun, x, y, z, s, sd) => {
    const len = { laser: 6, laser2: 5, lance: 8, cannon: 7, thumper: 6, heavy: 7, chain: 4, spark: 3 }[gun] || 5;
    const r = { laser: 0.9, laser2: 0.9, lance: 1.3, cannon: 1.4, thumper: 2, heavy: 1.3, chain: 0.7, spark: 0.7 }[gun] || 0.9;
    if (gun === "chain") { for (const dx of [-0.8, 0.8]) limb(P, [x + dx * s, y, z], [x + dx * s, y + len * s, z], r * s, "gun", "brl"); return; }
    limb(P, [x, y, z], [x, y + len * s, z], r * s, "gun", "brl");
    if (gun === "lance") { box(P, x - 1.6 * s, y + len * s * 0.5, z - 1.6 * s, x + 1.6 * s, y + len * s * 0.62, z + 1.6 * s, "accent", "coil"); box(P, x - 1.6 * s, y + len * s * 0.78, z - 1.6 * s, x + 1.6 * s, y + len * s * 0.9, z + 1.6 * s, "accent", "coil2"); }
    if (gun === "laser" || gun === "heavy") box(P, x - 1.1 * s, y + len * s - 1.2, z - 1.1 * s, x + 1.1 * s, y + len * s, z + 1.1 * s, "trim", "muzzle");
    if (gun === "thumper") box(P, x - 2.3 * s, y + len * s - 1.4, z - 2.3 * s, x + 2.3 * s, y + len * s, z + 2.3 * s, "trim", "brake");
  };

  /* ---- sampling and drawing ---- */
  const BAY = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  const render = (prims, dir, paint, opts) => {
    const th = dir * Math.PI / 4, F = [Math.cos(th), Math.sin(th)], Rt = [-F[1], F[0]];
    const W = 96, H = 96, OX = 48, OY = 78;
    const depth = new Float32Array(W * H).fill(-1e9), col = new Array(W * H).fill(null), pid = new Int16Array(W * H).fill(-1);
    const shadow = [];
    const pal = PAINT[paint] || PAINT.claw;
    const rampOf = m => m === "hull" ? RAMP[pal.hull] : m === "trim" ? RAMP[pal.trim] : m === "accent" ? RAMP[pal.accent] : m === "glass" ? RAMP.glass : m === "gun" ? RAMP.gun : m === "steel" ? RAMP.steel : m === "char" ? RAMP.char : m === "ivory" ? RAMP.ivory : null;
    const burnt = opts.burnt;
    const plot = (mx, my, mz, nx, ny, nz, m, pi, u, v) => {
      const wx = mx * Rt[0] + my * F[0], wy = mx * Rt[1] + my * F[1];
      const wnx = nx * Rt[0] + ny * F[0], wny = nx * Rt[1] + ny * F[1];
      const sx = Math.round(OX + wx), sy = Math.round(OY + wy * KY - mz);
      shadow.push(wx, wy, mz);
      if (sx < 0 || sy < 0 || sx >= W || sy >= H) return;
      /* only what faces the viewer (south and up) is ever seen */
      const d = wy + mz * KY, i = sy * W + sx;
      if (d <= depth[i]) return;
      depth[i] = d; pid[i] = pi;
      if (m === "vent") { col[i] = ["#1d1917", 0]; return; }
      if (m === "lamp") { if (pal.lamp) { col[i] = [pal.lamp, 0]; return; } m = "glass"; }
      const I = wnx * L[0] + wny * L[1] + nz * L[2];
      let t = (1 - (I * 0.5 + 0.5)) * 5;
      if (m === "glass" && u !== undefined && u < 0.34 && v > 0.55) t -= 2;
      col[i] = [m, t];
    };
    prims.forEach((p, pi) => {
      const st = 0.5;
      if (p.t === "box") {
        const [x0, y0, z0] = p.a, [x1, y1, z1] = p.b;
        const tp = p.taper ? 1 : 0;
        /* five faces: never the bottom */
        for (let x = x0; x <= x1 + 1e-6; x += st) for (let y = y0; y <= y1 + 1e-6; y += st) {
          const k = tp ? 0.35 : 1, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
          plot(cx + (x - cx) * k, cy + (y - cy) * k, z1, 0, 0, 1, p.m, pi, (x - x0) / (x1 - x0 || 1), (y - y0) / (y1 - y0 || 1));
        }
        for (let z = z0; z <= z1 + 1e-6; z += st) {
          const k = tp ? 1 - 0.65 * (z - z0) / (z1 - z0 || 1) : 1, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
          const X0 = cx + (x0 - cx) * k, X1 = cx + (x1 - cx) * k, Y0 = cy + (y0 - cy) * k, Y1 = cy + (y1 - cy) * k, v = (z - z0) / (z1 - z0 || 1);
          for (let x = X0; x <= X1 + 1e-6; x += st) { plot(x, Y1, z, 0, 1, 0, p.m, pi, (x - X0) / (X1 - X0 || 1), v); plot(x, Y0, z, 0, -1, 0, p.m, pi); }
          for (let y = Y0; y <= Y1 + 1e-6; y += st) { plot(X1, y, z, 1, 0, 0, p.m, pi, (y - Y0) / (Y1 - Y0 || 1), v); plot(X0, y, z, -1, 0, 0, p.m, pi, (y - Y0) / (Y1 - Y0 || 1), v); }
        }
      } else {
        const [ax, ay, az] = p.a, [bx, by, bz] = p.b, len = Math.hypot(bx - ax, by - ay, bz - az) || 1;
        const d = [(bx - ax) / len, (by - ay) / len, (bz - az) / len];
        /* two directions square to the limb */
        let e1 = Math.abs(d[2]) < 0.9 ? [d[1], -d[0], 0] : [1, 0, 0];
        const n1 = Math.hypot(...e1); e1 = e1.map(v => v / n1);
        const e2 = [d[1] * e1[2] - d[2] * e1[1], d[2] * e1[0] - d[0] * e1[2], d[0] * e1[1] - d[1] * e1[0]];
        const steps = Math.max(2, Math.ceil(len / st)), ring = Math.max(8, Math.ceil(p.r * 2 * Math.PI / st));
        for (let i = 0; i <= steps; i++) {
          const t = i / steps, cx = ax + (bx - ax) * t, cy = ay + (by - ay) * t, cz = az + (bz - az) * t;
          for (let j = 0; j < ring; j++) {
            const a = j / ring * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
            const nx = e1[0] * c + e2[0] * s, ny = e1[1] * c + e2[1] * s, nz = e1[2] * c + e2[2] * s;
            plot(cx + nx * p.r, cy + ny * p.r, cz + nz * p.r, nx, ny, nz, p.m, pi);
          }
        }
        /* the end facing forward, capped */
        for (let rr = 0; rr < p.r; rr += st) for (let j = 0; j < 12; j++) {
          const a = j / 12 * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
          plot(bx + (e1[0] * c + e2[0] * s) * rr, by + (e1[1] * c + e2[1] * s) * rr, bz + (e1[2] * c + e2[2] * s) * rr, d[0], d[1], d[2], p.m === "gun" ? "vent" : p.m, pi);
        }
      }
    });
    /* where a nearer part crosses a farther one, the farther pixel darkens */
    const out = K.mk(W, H), g = out.getContext("2d"), img = g.createImageData(W, H), o = img.data;
    let minx = W, miny = H, maxx = 0, maxy = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x, c = col[i];
      if (!c) continue;
      let [m, t] = c, hex;
      if (typeof m === "string" && m[0] === "#") hex = m;
      else {
        for (const [dx, dy] of [[0, -1], [-1, 0], [1, 0], [0, 1]]) {
          const xx = x + dx, yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
          const j = yy * W + xx;
          if (col[j] && pid[j] !== pid[i] && depth[j] - depth[i] > 2.2) { t += 1.6; break; }
        }
        const r = burnt && m !== "glass" ? RAMP.char : rampOf(m) || RAMP.steel;
        t += (BAY[(y & 3) * 4 + (x & 3)] / 16 - 0.5) * 0.55;
        hex = r[Math.max(0, Math.min(r.length - 1, Math.round(t)))];
      }
      const rgb = K.rgb(hex), k = i * 4;
      o[k] = rgb[0]; o[k + 1] = rgb[1]; o[k + 2] = rgb[2]; o[k + 3] = 255;
      minx = Math.min(minx, x); maxx = Math.max(maxx, x); miny = Math.min(miny, y); maxy = Math.max(maxy, y);
    }
    g.putImageData(img, 0, 0);
    /* crop to what was drawn, with room for the outline */
    const x0 = Math.max(0, minx - 2), y0 = Math.max(0, miny - 2), cw = Math.min(W, maxx + 3) - x0, ch = Math.min(H, maxy + 3) - y0;
    const c = K.mk(cw, ch);
    c.getContext("2d").drawImage(out, -x0, -y0);
    K.outline(c);
    c.ax = OX - x0; c.ay = OY - y0;
    /* the shadow: every sample dropped to the ground along the sun's lean */
    const sw = cw + 70, sh = ch + 24, s = K.mk(sw, sh), sg = s.getContext("2d");
    sg.fillStyle = "#000";
    const sox = c.ax + 4, soy = c.ay + 6;
    for (let i = 0; i < shadow.length; i += 3) {
      const wx = shadow[i], wy = shadow[i + 1], z = shadow[i + 2];
      sg.fillRect(Math.round(sox + wx + z * K.SX), Math.round(soy + wy * KY + z * K.SY), 1, 1);
    }
    c.sh = s; c.shx = c.ax - sox; c.shy = c.ay - soy;
    return c;
  };

  PM.mechArt = (id, paint, dir, pose = "stand", frame = 0) => {
    dir = ((dir | 0) % 8 + 8) % 8;
    if (pose !== "walk") frame = 0;
    return K.get(`mech:${id}:${paint}:${dir}:${pose}:${frame & 3}`, () => render(build(id, pose, frame), dir, paint, { burnt: pose === "wreck" }));
  };
  /* ---- creatures: the drakes of the scrub and the ridges, and the
   * Founders' sentries, drawn the same way at a person's scale ---- */
  PAINT.drake = { hull: "olive", trim: "rust", accent: "yellow", lamp: "#ffd35c" };
  PAINT.ridge = { hull: "slate", trim: "night", accent: "ivory", lamp: "#ff8a3c" };
  PAINT.sentry = { hull: "ivory", trim: "steel", accent: "blue", lamp: "#ff5a3d" };
  RAMP.rust = RAMP.rust;
  const creature = (kind, pose, frame) => {
    const P = [], big = kind === "ridge", s = big ? 1.35 : 1, step = pose === "walk" ? [2, -2, -2, 2][frame & 3] : 0;
    if (pose === "dead") {
      limb(P, [-6 * s, -2, 2], [6 * s, 2, 2], 3 * s, "hull", "body");
      return P;
    }
    if (kind === "sentry") {
      /* a crawler: a plated dome on four short legs, an eye and a stinger */
      for (const [x, y, i] of [[-4, 3, 0], [4, 3, 1], [-4, -3, 2], [4, -3, 3]]) limb(P, [x * 0.6, y * 0.6, 6], [x, y + (i & 1 ? step : -step) * 0.5, 0.5], 1, "trim", "leg" + i);
      for (let i = 0; i < 3; i++) box(P, -4 + i, -4 + i, 5 + i * 2, 4 - i, 4 - i, 7 + i * 2, "hull", "dome");
      box(P, -1.2, 3.5, 7, 1.2, 4.6, 9, "lamp", "eye");
      limb(P, [0, -2, 10], [0, 3, 13], 0.7, "gun", "sting");
      return P;
    }
    /* a drake: a long low body, a head held up, a tail, four legs */
    const bz = 6 * s;
    limb(P, [0, -4 * s, bz], [0, 4 * s, bz + 1], 3.2 * s, "hull", "body");
    limb(P, [0, -4 * s, bz], [0, -12 * s, 2 * s], 1.6 * s, "hull", "tail");
    limb(P, [0, 4 * s, bz + 1], [0, 7 * s, bz + 5 * s], 1.8 * s, "hull", "neck");
    box(P, -2.2 * s, 6 * s, bz + 4 * s, 2.2 * s, 11 * s, bz + 7.5 * s, "hull", "head");
    box(P, -2.4 * s, 10 * s, bz + 4 * s, 2.4 * s, 11.2 * s, bz + 5 * s, "trim", "jaw");
    box(P, -1.6 * s, 9 * s, bz + 6.6 * s, -0.6 * s, 9.6 * s, bz + 7.6 * s, "lamp", "eyeL");
    box(P, 0.6 * s, 9 * s, bz + 6.6 * s, 1.6 * s, 9.6 * s, bz + 7.6 * s, "lamp", "eyeR");
    for (let i = 0; i < 4; i++) box(P, -0.6, -3 * s + i * 2.2 * s, bz + 3 * s, 0.6, -2 * s + i * 2.2 * s, bz + 4.4 * s, "accent", "spine" + i);
    for (const [x, y, i] of [[-3, 3, 0], [3, 3, 1], [-3, -3, 2], [3, -3, 3]]) limb(P, [x * s * 0.8, y * s, bz - 1], [x * s * 1.3, y * s + ((i ^ (i >> 1)) & 1 ? step : -step), 0.6], 1.1 * s, "trim", "leg" + i);
    return P;
  };
  PM.creatureArt = (u, dir, pose = "stand", frame = 0) => {
    const kind = u.foe === "ridge" ? "ridge" : u.foe === "sentry" ? "sentry" : "drake";
    dir = ((dir | 0) % 8 + 8) % 8;
    if (pose !== "walk") frame = 0;
    return K.get(`cre:${kind}:${dir}:${pose}:${frame & 3}`, () => render(creature(kind, pose, frame), dir, kind === "ridge" ? "ridge" : kind === "sentry" ? "sentry" : "drake", { burnt: pose === "dead" }));
  };

  /* the same mech, front-on and big, for the sheets */
  PM.mechPortrait = (id, paint) => K.get(`mechp:${id}:${paint}`, () => PM.mechArt(id, paint, 1, "stand", 0));
})();
