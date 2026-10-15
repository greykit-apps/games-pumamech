/* PumaMech -- sound, all of it synthesised: no audio files.
 *
 * Out in the world the sounds are the game's cues: footsteps, doors, the
 * till. In a fight every weapon has its own voice -- the laser's whine,
 * the ion lance's crack, cannon, rockets -- and every hit rings on armour.
 * The title has a march of our own. */
"use strict";
(() => {
  const A = PM.SFX = { ctx: null, muted: false, out: null, dry: null, wet: null, loops: {}, tune: null };
  let noiseBuf = null;

  A.unlock = () => {
    if (A.ctx) { if (A.ctx.state === "suspended") A.ctx.resume(); return; }
    try {
      const Ctx = globalThis.AudioContext || globalThis.webkitAudioContext;
      A.ctx = new Ctx();
    } catch (e) { A.ctx = null; return; }
    const a = A.ctx;
    A.out = a.createGain(); A.out.gain.value = A.muted ? 0 : 0.5; A.out.connect(a.destination);
    A.dry = a.createGain(); A.dry.connect(A.out);
    A.lp = a.createBiquadFilter(); A.lp.type = "lowpass"; A.lp.frequency.value = 900; A.lp.connect(A.out);
    noiseBuf = a.createBuffer(1, a.sampleRate * 1.5, a.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  };
  A.setMuted = m => { A.muted = m; if (A.out) A.out.gain.value = m ? 0 : 0.5; if (m) { A.stopTune(); for (const k of Object.keys(A.loops)) A.loop(k, 0); } };

  /* a note sliding from f0 to f1 */
  function tone(f0, f1, ms, type, vol, dest, at = 0) {
    const a = A.ctx, o = a.createOscillator(), g = a.createGain(), t = a.currentTime + 0.005 + at;
    o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + ms / 1000);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0008, t + ms / 1000);
    o.connect(g); g.connect(dest); o.start(t); o.stop(t + ms / 1000 + 0.02);
  }
  /* a burst of noise through a filter */
  function hiss(ms, vol, freq, dest, q = 0.8, at = 0, type = "lowpass") {
    const a = A.ctx, s = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain(), t = a.currentTime + 0.005 + at;
    s.buffer = noiseBuf; f.type = type; f.frequency.value = freq; f.Q.value = q;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0008, t + ms / 1000);
    s.connect(f); f.connect(g); g.connect(dest); s.start(t, Math.random()); s.stop(t + ms / 1000 + 0.02);
  }

  const SOUNDS = {
    shotP: d => { hiss(110, 0.55, 2600, d, 0.6); tone(220, 70, 60, "square", 0.12, d); },
    shotE: d => { hiss(130, 0.4, 1500, d, 0.6); tone(160, 60, 70, "square", 0.08, d); },
    boom: d => { hiss(900, 0.9, 500, d, 0.5); tone(90, 30, 600, "sine", 0.5, d); hiss(400, 0.4, 2400, d, 0.4, 0.03); },
    step: d => hiss(35, 0.08, 900, d, 1, 0, "bandpass"),
    splash: d => hiss(120, 0.12, 1800, d, 0.8, 0, "bandpass"),
    knife: d => { hiss(90, 0.15, 5000, d, 2, 0, "highpass"); },
    throw: d => hiss(160, 0.1, 3000, d, 1, 0, "bandpass"),
    rocket: d => { hiss(500, 0.4, 1200, d, 1, 0, "bandpass"); tone(400, 150, 400, "sawtooth", 0.06, d); },
    empty: d => tone(1600, 1500, 25, "square", 0.08, d),
    reload: d => { tone(900, 800, 30, "square", 0.08, d); tone(600, 550, 40, "square", 0.08, d, 0.12); },
    select: d => tone(1100, 1100, 20, "square", 0.05, d),
    pod: d => { tone(660, 660, 60, "square", 0.08, d); tone(990, 990, 90, "square", 0.08, d, 0.07); },
    podLost: d => tone(300, 120, 200, "square", 0.08, d),
    chute: d => hiss(400, 0.15, 600, d, 1),
    wound: d => { hiss(80, 0.4, 700, d); tone(300, 90, 250, "square", 0.16, d); },
    armor: d => { tone(1800, 900, 60, "square", 0.08, d); },
    clang: d => { tone(1300, 1250, 120, "triangle", 0.12, d); tone(1900, 1850, 90, "triangle", 0.06, d); },
    die: d => tone(500, 120, 180, "square", 0.08, d),
    spotted: d => { tone(880, 880, 50, "square", 0.08, d); },
    alert: d => { for (let i = 0; i < 3; i++) { tone(700, 700, 90, "square", 0.1, d, i * 0.2); tone(950, 950, 90, "square", 0.1, d, i * 0.2 + 0.1); } },
    beep: d => { for (let i = 0; i < 4; i++) tone(1200, 1200, 70, "square", 0.1, d, i * 0.18); },
    goal: d => { [523, 659, 784, 1047].forEach((f, i) => tone(f, f, 120, "square", 0.08, d, i * 0.11)); },
    fail: d => { [392, 330, 262].forEach((f, i) => tone(f, f, 180, "square", 0.08, d, i * 0.16)); },
    recall: d => { tone(1500, 1500, 60, "square", 0.06, d); tone(1500, 1500, 60, "square", 0.06, d, 0.12); hiss(250, 0.08, 3000, d, 1, 0.25, "bandpass"); },
    ladder: d => { for (let i = 0; i < 4; i++) tone(700 + i * 120, 700 + i * 120, 40, "square", 0.05, d, i * 0.1); },
    click: d => { hiss(30, 0.25, 4000, d, 1, 0, "highpass"); tone(2000, 1800, 20, "square", 0.04, d, 0.04); },
    lever: d => { tone(200, 140, 120, "square", 0.12, d); hiss(200, 0.2, 800, d); },
    ice: d => { hiss(260, 0.3, 3500, d, 1, 0, "highpass"); tone(1800, 600, 200, "triangle", 0.06, d); },
    mine: d => tone(1000, 1000, 40, "square", 0.08, d),
    flame: d => hiss(400, 0.3, 700, d, 0.4),
    menu: d => tone(900, 900, 18, "square", 0.05, d),
    jump: d => { hiss(500, 0.2, 400, d, 0.8); },
    laser: d => { tone(1800, 300, 220, "sawtooth", 0.07, d); tone(2400, 900, 160, "square", 0.03, d); },
    laserS: d => { tone(2200, 700, 120, "sawtooth", 0.05, d); },
    ion: d => { tone(140, 60, 420, "sawtooth", 0.12, d); hiss(380, 0.3, 2600, d, 2, 0, "bandpass"); tone(3000, 400, 300, "square", 0.03, d); },
    cannon: d => { hiss(260, 0.7, 900, d, 0.6); tone(120, 40, 260, "square", 0.2, d); },
    stomp: d => { tone(70, 40, 120, "sine", 0.3, d); hiss(90, 0.2, 300, d); },
    light: d => { tone(1320, 1320, 80, "square", 0.08, d); tone(1760, 1760, 120, "square", 0.08, d, 0.1); },
  };

  /* name; dist in tiles from the ranger (null: no fade); muffle: the snow */
  A.play = (name, dist = null, muffle = false) => {
    if (A.muted || !A.ctx || !SOUNDS[name]) return;
    let vol = 1;
    if (dist != null) { vol = Math.max(0, 1 - dist / 26); if (vol < 0.04) return; }
    const g = A.ctx.createGain();
    g.gain.value = vol;
    g.connect(muffle ? A.lp : A.dry);
    SOUNDS[name](g);
    setTimeout(() => g.disconnect(), 2500);
  };

  /* something that keeps sounding: level 0 is silence */
  A.loop = (name, level) => {
    if (!A.ctx) return;
    let L = A.loops[name];
    if (!L) {
      if (level <= 0 || A.muted) return;
      const a = A.ctx, g = a.createGain();
      g.gain.value = 0; g.connect(A.dry);
      if (name === "rotor") {
        const s = a.createBufferSource(), f = a.createBiquadFilter(), lfo = a.createOscillator(), lg = a.createGain();
        s.buffer = noiseBuf; s.loop = true; f.type = "lowpass"; f.frequency.value = 260;
        lfo.frequency.value = 11; lg.gain.value = 0.5; lfo.connect(lg); lg.connect(g.gain);
        s.connect(f); f.connect(g); s.start(); lfo.start();
        L = { g, stop: () => { s.stop(); lfo.stop(); } };
      } else {
        const o = a.createOscillator(); o.type = "sine"; o.frequency.value = 2900;
        const lfo = a.createOscillator(), lg = a.createGain(); lfo.frequency.value = 6; lg.gain.value = 60; lfo.connect(lg); lg.connect(o.frequency);
        o.connect(g); o.start(); lfo.start();
        L = { g, stop: () => { o.stop(); lfo.stop(); } };
      }
      A.loops[name] = L;
    }
    const v = A.muted ? 0 : Math.max(0, Math.min(1, level)) * (name === "whine" ? 0.035 : 0.5);
    L.g.gain.setTargetAtTime(v, A.ctx.currentTime, 0.1);
  };
  A.stopLoops = () => { for (const [k, L] of Object.entries(A.loops)) { try { L.stop(); } catch (e) { /* already */ } delete A.loops[k]; } };

  /* ---- the title march: ours, a minor-key march for square, triangle and noise ---- */
  const N = n => { const m = /^([A-G])(b|#)?(\d)$/.exec(n); const k = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[m[1]] + (m[2] === "b" ? -1 : m[2] === "#" ? 1 : 0); return 440 * Math.pow(2, (k + (+m[3] + 1) * 12 - 69) / 12); };
  const parse = s => s.split(/\s+/).filter(x => x && x !== "|").map(t => { const [n, l] = t.split(":"); return [n === "r" ? 0 : N(n), +l]; });
  const LEAD = parse(`E5:2 B4:1 E5:1 G5:2 F#5:2 | E5:3 D5:1 B4:4 | C5:2 E5:1 G5:1 A5:2 G5:2 | F#5:6 r:2 |
    E5:2 B4:1 E5:1 G5:2 B5:2 | A5:3 G5:1 F#5:2 E5:2 | D5:2 F#5:1 A5:1 G5:2 F#5:2 | E5:6 r:2 |
    G5:2 G5:1 A5:1 B5:2 G5:2 | A5:2 A5:1 B5:1 C6:2 A5:2 | B5:2 B5:1 C6:1 D6:2 B5:2 | E6:4 D6:2 B5:2 |
    C6:3 B5:1 A5:2 G5:2 | F#5:2 G5:1 A5:1 B5:2 F#5:2 | E5:2 G5:2 F#5:2 D#5:2 | E5:6 r:2`);
  const BASS = parse(`E3:2 B2:2 E3:2 B2:2 | C3:2 G2:2 C3:2 G2:2 | A2:2 E3:2 A2:2 E3:2 | B2:2 F#3:2 B2:2 D#3:2 |
    E3:2 B2:2 E3:2 B2:2 | C3:2 G3:2 C3:2 G2:2 | D3:2 A2:2 B2:2 F#3:2 | E3:2 B2:2 E3:4 |
    G2:2 D3:2 G2:2 D3:2 | A2:2 E3:2 A2:2 E3:2 | G2:2 D3:2 G2:2 D3:2 | C3:2 G2:2 C3:2 G2:2 |
    A2:2 E3:2 A2:2 E3:2 | B2:2 F#3:2 B2:2 F#3:2 | C3:2 A2:2 B2:2 B2:2 | E3:2 B2:2 E3:4`);
  A.startTune = () => {
    if (A.muted || !A.ctx || A.tune) return;
    const a = A.ctx, g = a.createGain(), eighth = 0.19;
    g.gain.value = 0.55; g.connect(A.dry);
    const total = LEAD.reduce((s, n) => s + n[1], 0);
    const st = { g, t0: a.currentTime + 0.1, next: 0, timer: null };
    const note = (f, at, dur, type, vol) => {
      if (!f) return;
      const o = a.createOscillator(), e = a.createGain();
      o.type = type; o.frequency.value = f;
      e.gain.setValueAtTime(0, at); e.gain.linearRampToValueAtTime(vol, at + 0.01); e.gain.setValueAtTime(vol, at + dur * 0.7); e.gain.linearRampToValueAtTime(0, at + dur * 0.95);
      o.connect(e); e.connect(g); o.start(at); o.stop(at + dur);
    };
    const drum = (at, snare) => {
      const s = a.createBufferSource(), f = a.createBiquadFilter(), e = a.createGain();
      s.buffer = noiseBuf; f.type = snare ? "highpass" : "lowpass"; f.frequency.value = snare ? 1800 : 160;
      e.gain.setValueAtTime(snare ? 0.18 : 0.5, at); e.gain.exponentialRampToValueAtTime(0.001, at + (snare ? 0.12 : 0.18));
      s.connect(f); f.connect(e); e.connect(g); s.start(at); s.stop(at + 0.2);
    };
    /* schedule a loop's worth at a time, a little ahead */
    const sched = () => {
      while (st.t0 + st.next * total * eighth < a.currentTime + 1.5) {
        const base = st.t0 + st.next * total * eighth;
        let t = 0;
        for (const [f, l] of LEAD) { note(f, base + t * eighth, l * eighth, "square", 0.06); t += l; }
        t = 0;
        for (const [f, l] of BASS) { note(f, base + t * eighth, l * eighth, "triangle", 0.22); t += l; }
        for (let i = 0; i < total; i++) { if (i % 4 === 0) drum(base + i * eighth, false); if (i % 4 === 2) drum(base + i * eighth, true); if (i % 8 === 7) drum(base + (i + 0.5) * eighth, true); }
        st.next++;
      }
    };
    sched();
    st.timer = setInterval(sched, 400);
    A.tune = st;
  };
  A.stopTune = () => {
    if (!A.tune) return;
    clearInterval(A.tune.timer);
    const g = A.tune.g, a = A.ctx;
    g.gain.setTargetAtTime(0, a.currentTime, 0.15);
    setTimeout(() => g.disconnect(), 1500);
    A.tune = null;
  };
})();
