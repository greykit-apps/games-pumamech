/* PumaMech -- the sheets: every screen with words on it is a flat dark
 * panel over the dimmed field (Airborne Puma's, kept). One at a time; a
 * question can stand over one. Keys: Escape goes back or closes, Tab stays
 * inside, the arrows walk the buttons by where they sit.
 *
 * UI.open(title, { html, onClick, onKey, back, tabs, wide, popup, closable })
 * UI.ask(question, yes, title)  -> a promise, true on yes
 * UI.say(lines)                 a speaker and their words, one page at a time */
"use strict";
(() => {
  const esc = PM.esc;
  const UI = PM.UI = { sheet: null };
  UI.CREDIT = 'Built by <a href="https://greykit.com/" target="_blank" rel="noopener">greykit.com</a>';
  const ICON_BACK = '<svg class="ic" viewBox="0 0 12 12" width="12" height="12" aria-hidden="true"><path d="M7.5 2 L3.5 6 L7.5 10" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="square"/></svg>';
  const ICON_X = '<svg class="ic" viewBox="0 0 12 12" width="12" height="12" aria-hidden="true"><path d="M3 3 L9 9 M9 3 L3 9" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="square"/></svg>';

  /* a canvas as an image the sheets can show */
  const urls = new WeakMap();
  UI.url = c => { let u = urls.get(c); if (!u) { u = c.toDataURL(); urls.set(c, u); } return u; };
  UI.img = (c, scale = 2, cls = "px", alt = "") => `<img class="${cls}" src="${UI.url(c)}" width="${c.width * scale}" height="${c.height * scale}" alt="${esc(alt)}">`;
  /* a face for a look: the head and shoulders of its sprite */
  UI.faceArt = look => PM.K.get(`face:${look}`, () => {
    const src = PM.personArt(look, 8, "stand", 0), c = PM.K.mk(24, 22), g = c.getContext("2d");
    g.drawImage(src, -Math.round(src.width / 2 - 12), -1);
    return c;
  });
  UI.face = (look, scale = 3, alt = "") => `<img class="px face" src="${UI.url(UI.faceArt(look))}" width="${24 * scale}" height="${22 * scale}" alt="${esc(alt)}">`;
  UI.mechImg = (ch, paint, scale = 2, pose = "stand") => UI.img(PM.mechArt(ch, paint, 1, pose, 0), scale, "px mechpic", PM.CHASSIS[ch].name);

  UI.open = (title, { tabs, html, onClick, onClose, onKey, back, tab = 0, wide = false, closable = true, popup = false, cls = "" }) => {
    UI.close(true);
    const el = document.createElement("div");
    el.className = "pm-sheet " + (popup ? "pm-pop" : "full") + (wide ? " wide" : "") + (cls ? " " + cls : "");
    el.setAttribute("role", "dialog"); el.setAttribute("aria-modal", "true"); el.setAttribute("aria-label", title);
    const draw = () => {
      el.innerHTML = '<div class="' + (popup ? "pm-win" : "sh-box") + '"><header class="sh-head">' + (back ? '<button data-back title="Back (Esc)">' + ICON_BACK + "Back</button>" : "") + "<h2>" + esc(title) + "</h2>" +
        (closable && !back && !popup ? '<button data-x title="Close (Esc)">' + ICON_X + "Close</button>" : "") + "</header>" +
        (tabs ? '<div class="sh-tabs" role="tablist" aria-label="' + esc(title) + '">' + tabs.map(([t], i) => '<button role="tab" id="tab-' + i + '" data-tab="' + i + '" aria-selected="' + (i === tab) + '" aria-controls="tabpanel" tabindex="' + (i === tab ? 0 : -1) + '">' + esc(t) + "</button>").join("") + "</div>" : "") +
        '<div class="sh-body"' + (tabs ? ' id="tabpanel" role="tabpanel" aria-labelledby="tab-' + tab + '" tabindex="0"' : "") + '><div class="sh-in">' + (tabs ? (typeof tabs[tab][1] === "function" ? tabs[tab][1]() : tabs[tab][1]) : html()) + "</div></div></div>";
    };
    draw();
    const api = {
      refresh: () => {
        const b = el.querySelector(".sh-body"), y = b ? b.scrollTop : 0, f = document.activeElement && document.activeElement.dataset ? { ...document.activeElement.dataset } : null;
        draw();
        const nb = el.querySelector(".sh-body"); if (nb) nb.scrollTop = y;
        if (f) for (const k of Object.keys(f)) { const n = el.querySelector(`[data-${k}="${CSS.escape(f[k])}"]`); if (n) { n.focus({ preventScroll: true }); return; } }
        focusFirst();
      }, close: () => UI.close(), el, setTab: i => setTab(i),
    };
    const setTab = i => { tab = (i + tabs.length) % tabs.length; draw(); el.querySelector('[data-tab="' + tab + '"]').focus(); };
    el.addEventListener("click", ev => {
      if (popup && ev.target === el && closable) return UI.close();
      const b = ev.target.closest("button"); if (!b || b.disabled) return;
      PM.SFX.play("menu");
      if (b.hasAttribute("data-x")) return UI.close();
      if (b.hasAttribute("data-back")) return goBack();
      if (b.dataset.tab !== undefined) return setTab(+b.dataset.tab);
      if (onClick) onClick(b, api, ev);
    });
    function goBack() { UI.close(true); back(); }
    const focusFirst = () => { const n = el.querySelector("[autofocus]") || el.querySelector(".sh-body .primary:not(:disabled)") || el.querySelector('[role="tab"][aria-selected="true"]') || el.querySelector(".sh-body button:not(:disabled)") || el.querySelector("button"); if (n) n.focus({ preventScroll: true }); };
    document.body.appendChild(el);
    UI.sheet = { el, onClose, onKey, closable, back: back ? goBack : null, tabs: tabs ? setTab : null, tabAt: () => tab, api };
    for (const id of ["game", "title"]) { const n = document.getElementById(id); if (n) n.inert = true; }
    focusFirst();
    return api;
  };
  UI.close = quiet => {
    if (!UI.sheet) return;
    const s = UI.sheet; UI.sheet = null;
    s.el.remove();
    for (const id of ["game", "title"]) { const n = document.getElementById(id); if (n) n.inert = false; }
    if (s.onClose && !quiet) s.onClose();
    if (!quiet && PM.game && PM.game.mode === "title") PM.game.refreshTitle();
  };
  UI.walk = (root, key) => {
    const d = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] }[key], a = document.activeElement;
    if (!d || !a || !root.contains(a)) return false;
    const box = n => { const r = n.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, r }; }, o = box(a);
    let best = null, bestS = Infinity;
    for (const n of root.querySelectorAll("button:not(:disabled), summary, input")) {
      if (n === a || n.offsetParent === null || n.getAttribute("role") === "tab" || n.closest(".sh-head")) continue;
      const b = box(n), dx = b.x - o.x, dy = b.y - o.y, along = dx * d[0] + dy * d[1];
      if (along <= (d[0] ? o.r.width : o.r.height) / 4) continue;
      const s = along + Math.abs(d[0] ? dy : dx) * 3;
      if (s < bestS) { bestS = s; best = n; }
    }
    if (!best) return false;
    best.focus({ preventScroll: true }); best.scrollIntoView({ block: "nearest" });
    return true;
  };
  UI.key = ev => {
    const s = UI.sheet;
    if (s.onKey && s.onKey(ev)) return;
    if (ev.key === "Escape") { ev.preventDefault(); if (s.back) s.back(); else if (s.closable) UI.close(); return; }
    if (s.tabs && document.activeElement && document.activeElement.getAttribute("role") === "tab" && (ev.key === "ArrowRight" || ev.key === "ArrowLeft")) {
      ev.preventDefault(); s.tabs(s.tabAt() + (ev.key === "ArrowRight" ? 1 : -1)); return;
    }
    if (ev.key.startsWith("Arrow") && !(ev.target.closest && ev.target.closest("input")) && UI.walk(s.el, ev.key)) { ev.preventDefault(); return; }
    if (ev.key === "Tab") {
      const f = [...s.el.querySelectorAll('button:not(:disabled), input, summary, a[href], [tabindex]:not([tabindex="-1"])')].filter(n => n.offsetParent !== null);
      if (!f.length) return;
      ev.preventDefault();
      const i = f.indexOf(document.activeElement), d = ev.shiftKey ? -1 : 1;
      f[i < 0 ? 0 : (i + d + f.length) % f.length].focus();
    }
  };

  /* a question before something that cannot be undone */
  UI.ask = (question, yes, title = yes + "?", danger = true) => new Promise(resolve => {
    const back = document.activeElement;
    const el = document.createElement("div");
    el.className = "pm-ask";
    el.setAttribute("role", "alertdialog"); el.setAttribute("aria-modal", "true"); el.setAttribute("aria-label", title);
    el.innerHTML = '<div class="pm-win"><header class="sh-head"><h2>' + esc(title) + '</h2></header><div class="sh-body"><p>' + esc(question) +
      '</p><div class="row end"><button data-no class="' + (danger ? "primary" : "") + '">Cancel</button><button data-yes class="' + (danger ? "danger" : "primary") + '">' + esc(yes) + "</button></div></div></div>";
    const done = v => { document.removeEventListener("keydown", onKey, true); el.remove(); if (back && back.isConnected && back.focus) back.focus({ preventScroll: true }); resolve(v); };
    const onKey = ev => {
      if (ev.key === "Escape") { ev.preventDefault(); ev.stopPropagation(); done(false); return; }
      if (ev.key === "Tab" || ev.key === "ArrowLeft" || ev.key === "ArrowRight") { const bs = [...el.querySelectorAll("button")], i = bs.indexOf(document.activeElement); ev.preventDefault(); bs[(i + (ev.shiftKey || ev.key === "ArrowLeft" ? -1 : 1) + bs.length) % bs.length].focus(); }
      if (ev.key === "Enter" || ev.key === " ") return;
      ev.stopPropagation();
    };
    el.addEventListener("click", ev => { if (ev.target === el) return done(false); const b = ev.target.closest("button"); if (b) done(b.hasAttribute("data-yes")); });
    document.addEventListener("keydown", onKey, true);
    document.body.appendChild(el);
    el.querySelector(danger ? "[data-no]" : "[data-yes]").focus();
  });

  /* ---- someone speaks: a face, a name, their words; choices at the end ----
   * pages: [{ who, look, text, choices: [[label, value]] }]; resolves with
   * the value chosen (or true when the last page is read) */
  UI.say = (pages, { title, back } = {}) => new Promise(resolve => {
    pages = pages.filter(Boolean);
    let i = 0;
    const page = () => pages[i];
    const api = UI.open(title || page().who || "", { popup: false, cls: "talk", closable: false,
      html: () => {
        const p = page(), paras = (Array.isArray(p.text) ? p.text : [p.text]).map(t => `<p>${t}</p>`).join("");
        return `<div class="talk">${p.look ? `<figure>${UI.face(p.look, 4, p.who || "")}${p.who ? `<figcaption>${esc(p.who)}</figcaption>` : ""}</figure>` : ""}
          <div class="words">${paras}<div class="row end">${p.choices ? p.choices.map(([l, v], j) => `<button data-c="${j}" class="${j === 0 ? "primary" : ""}">${esc(l)}</button>`).join("") :
          `<button data-next class="primary">${i < pages.length - 1 ? "Go on" : "Done"}</button>`}</div></div></div>`;
      },
      onKey: ev => {
        if (ev.key === "Escape" && !page().choices) { ev.preventDefault(); finish(true); return true; }
        return false;
      },
      onClick: (b) => {
        if (b.hasAttribute("data-next")) { if (i < pages.length - 1) { i++; api.refresh(); } else finish(true); return; }
        if (b.dataset.c !== undefined) finish(page().choices[+b.dataset.c][1]);
      },
    });
    const finish = v => { UI.close(true); resolve(v); };
  });
  /* a notice: one paragraph or a few, and OK */
  UI.notice = (title, text) => UI.say([{ text }], { title });
})();
