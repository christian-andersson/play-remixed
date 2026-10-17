// What is drawn on the C64 screen and how it reacts: views, selection, dialogs, drawing,
// mouse, touch and keyboard. Uses screen.js and player.js.

/* ======================================================================================
   Views, selection and modal boxes
   ====================================================================================== */
const LIST_Y = 13, LIST_H = 9;
const ui = { sel: {}, top: {}, edit: null, overlay: null, lastClick: { t: 0, i: -1 } };
const isPlaylistView = () => !!playlist(settings.view);
const isTrackView = () => settings.view !== "playlists";
const searchKey = () => isPlaylistView() ? "playlist" : settings.view;
const viewSource = () => settings.view === "browse" ? "all" : settings.view;
const viewList = () => isTrackView() ? tracksFor(viewSource(), searches[searchKey()] || "") : lib.playlists;
const canReorder = () => isPlaylistView() && !searches.playlist.trim();

// The selection belongs to a tune, not to a row on screen. Scrolling only moves the view, so the
// selected tune can scroll out of sight; moving the selection with the keyboard brings it back.
function sel() {
  const n = viewList().length, v = settings.view;
  ui.sel[v] = Math.max(0, Math.min(n - 1, ui.sel[v] || 0));
  ui.top[v] = Math.max(0, Math.min(ui.top[v] || 0, n - LIST_H));
  return ui.sel[v];
}
// Scrolls just enough to show the selected tune.
function reveal() {
  const v = settings.view, s = sel();
  if (s < ui.top[v]) ui.top[v] = s;
  if (s >= ui.top[v] + LIST_H) ui.top[v] = s - LIST_H + 1;
  sel();
}
function moveSel(d) { ui.sel[settings.view] = (ui.sel[settings.view] || 0) + d; reveal(); render(); }
// Wheel, trackpad and touch scrolling move the view only. (Browsers already apply the system's
// natural-scrolling setting to the events.)
function scrollRows(d) {
  const v = settings.view;
  ui.top[v] = (ui.top[v] || 0) + d; sel();
  render();
}
const selected = () => viewList()[sel()];

function showView(view) {
  if (playlist(view) && view !== settings.view) searches.playlist = "";
  settings.view = view; saveSettings(); stopEdit(); render();
}
const TABS = ["browse", "favs", "playlists", "recent"];
function nextTab(d) {
  const k = TABS.indexOf(isPlaylistView() ? "playlists" : settings.view);
  showView(TABS[(k + d + TABS.length) % TABS.length]);
}

// Activate the selected row: play a track, or open a playlist.
function activate() {
  const item = selected(); if (!item) return;
  if (!isTrackView()) return showView(item.id);
  playSource(viewSource(), searches[searchKey()], item);
}

function moveTrack(d) {
  const p = playlist(settings.view); if (!p || !canReorder()) return;
  const n = sel(), m = n + d;
  if (m < 0 || m >= p.tracks.length) return;
  [p.tracks[n], p.tracks[m]] = [p.tracks[m], p.tracks[n]];
  ui.sel[settings.view] = m; reveal(); saveLib(); libraryChanged();
}
function removeTrack() {
  const p = playlist(settings.view), r = selected(); if (!p || !r) return;
  p.tracks.splice(p.tracks.indexOf(r.i), 1); saveLib(); libraryChanged();
  setStatus("REMOVED FROM " + p.name, LGREEN);
}

/* --- text editing through the hidden input --- */
const kbd = $("kbd");
function startEdit(kind, value, onDone) {
  ui.edit = { kind, onDone };
  kbd.value = value; kbd.focus(); kbd.setSelectionRange(value.length, value.length);
  render();
}
function stopEdit() { if (ui.edit) { ui.edit = null; kbd.blur(); render(); } }
const startSearch = () => isTrackView() && settings.view !== "recent" && startEdit("search", searches[searchKey()]);
kbd.addEventListener("input", () => {
  if (ui.edit && ui.edit.kind === "search") { searches[searchKey()] = kbd.value; ui.sel[settings.view] = 0; ui.top[settings.view] = 0; }
  render();
});
kbd.addEventListener("keydown", e => {
  if (!ui.edit) return;
  if (e.key === "Enter" || e.key === "Escape" || (ui.edit.kind === "search" && (e.key === "ArrowDown" || e.key === "ArrowUp"))) {
    e.preventDefault(); e.stopPropagation();
    const done = ui.edit.onDone, ok = e.key !== "Escape";
    stopEdit();
    if (done) done(ok ? kbd.value : null);
    if (e.key === "ArrowDown") moveSel(1);
  }
});
kbd.addEventListener("blur", () => { if (ui.edit && ui.edit.kind === "search") { ui.edit = null; render(); } });

/* --- modal boxes: drawn over the screen; clicks outside close them --- */
function openPrompt(title, value, onOk) {
  ui.overlay = { kind: "prompt", title, x: 2, y: 9, w: 36, h: 6, cancel: closeOverlay };
  startEdit("prompt", value, v => { closeOverlay(); if (v !== null && v.trim()) onOk(v.trim()); });
}
function openConfirm(lines, onYes) {
  ui.overlay = { kind: "confirm", lines, x: 3, y: 9, w: 34, h: lines.length + 4, onYes, cancel: closeOverlay };
  render();
}
function openAddMenu(track) {
  if (!track) return;
  const rows = Math.min(10, lib.playlists.length + 1);
  ui.overlay = { kind: "menu", track, sel: 0, top: 0, x: 3, y: Math.max(1, 9 - Math.floor(rows / 2)), w: 34, h: rows + 7, cancel: closeOverlay };
  render();
}
function openHelp() { ui.overlay = { kind: "help", x: 1, y: 1, w: 38, h: 23, cancel: closeOverlay }; render(); }
function closeOverlay() { ui.overlay = null; stopEdit(); render(); }

function menuItems(o) { return [...lib.playlists, { newList: true }]; }
function menuActivate(o, item) {
  if (item.newList) {
    const track = o.track;
    return openPrompt("NEW LIST", "", name => { const p = createPlaylist(name); if (p) togglePlaylistTrack(p, track); openAddMenu(track); });
  }
  togglePlaylistTrack(item, o.track);
}

/* ======================================================================================
   Drawing
   ====================================================================================== */
function render() { draw(); flush(); placeKbd(); }

function draw() {
  codes.fill(32); cols.fill(LBLUE); hits = [];
  if (boot.state !== "ready") return drawBoot();
  drawHeader(); drawNow(); drawTabs(); drawLibrary(); drawStatus();
  if (ui.overlay) { hits = []; drawOverlay(ui.overlay); }
}

// Start-up screen while the index loads, in the style of the C64's own power-on screen.
function drawBoot() {
  text(4, 1, "**** COMMODORE 64 REMIX RADIO ****");
  text(1, 3, "64K RAM SYSTEM  38911 BASIC BYTES FREE");
  text(0, 5, "READY.");
  text(0, 6, 'LOAD "REMIXES",8,1');
  text(0, 8, "SEARCHING FOR REMIXES");
  if (boot.state === "loading") {
    text(0, 9, "LOADING");
    if (Math.floor(Date.now() / 400) % 2) put(0, 10, 160, LBLUE);
    return;
  }
  text(0, 9, "?FILE NOT FOUND  ERROR");
  text(0, 10, "READY.");
  [
    "THE REMIX INDEX (DATA/REMIXES.JSON)",
    "COULD NOT BE LOADED:",
    boot.error.toUpperCase().slice(0, 38),
    "",
    "BROWSERS DO NOT LET A PAGE OPENED AS A",
    "LOCAL FILE LOAD OTHER FILES. SERVE THE",
    "FOLDER INSTEAD:",
    "",
    "  ./SERVE.SH",
    "",
    "OR SEE TESTING.MD FOR OTHER WAYS.",
  ].forEach((l, k) => text(0, 12 + k, l, k === 8 ? WHITE : LBLUE));
  if (Math.floor(Date.now() / 400) % 2) put(0, 24, 160, LBLUE);
}

function drawHeader() {
  text(0, 0, pad(" **** C64 REMIX RADIO ****", 26).concat(rpad(REMIXES.length + " TUNES ", 11)), CYAN, true);
  btn(37, 0, " ? ", openHelp, { col: CYAN });
}

function marquee(v, n) {
  const c = asCodes(v);
  if (c.length <= n) return c;
  const loop = c.concat(toCodes("     "));
  const o = Math.floor(Date.now() / 300) % loop.length;
  return loop.concat(loop).slice(o, o + n);
}

function drawNow() {
  const q = settings.queue;
  box(0, 1, 40, 8, LBLUE, current || order.length ? "FROM " + sourceName(q.source) + (q.filter ? " / " + q.filter : "") : "NOW PLAYING");
  if (current) {
    text(1, 2, marquee(current.t, 38), WHITE);
    text(1, 3, pad("BY " + current.a, 38), LBLUE);
    const id = "#" + current.i;
    text(1, 4, pad(current.c ? "ORIG " + current.c : "", 37 - id.length), LGREY);
    const link = 39 - id.length;
    text(link, 4, id, over(link, 4, id.length) ? WHITE : CYAN);
    hit(link, 4, id.length, 1, () => window.open(RKO + "/remix/" + current.i, "_blank", "noopener"));
  } else {
    text(1, 2, "PRESS PLAY, OR PICK A TUNE BELOW", WHITE);
    text(1, 3, "AND PRESS RETURN. PRESS ? FOR HELP.", LBLUE);
  }
  // progress bar: half-cell resolution using full blocks and the left-half block
  const BAR = 26, d = player.duration, t = player.currentTime;
  const halves = d ? Math.round(Math.min(1, t / d) * BAR * 2) : 0;
  for (let i = 0; i < BAR; i++) {
    const h = halves - i * 2;
    put(1 + i, 5, h >= 2 ? 160 : h === 1 ? 97 : 102, h >= 1 ? WHITE : DGREY);
  }
  hit(1, 5, BAR, 1, x => { if (player.duration) player.currentTime = (x - 1 + 0.5) / BAR * player.duration; });
  text(28, 5, rpad(fmt(t) + "/" + fmt(d), 11), LBLUE);

  let x = btn(1, 6, "<<", prev);
  x = btn(x, 6, player.paused ? " PLAY " : "PAUSE ", togglePlay, { col: WHITE });
  x = btn(x, 6, ">>", () => next(false));
  x = btn(x + 1, 6, "SHUFFLE " + (settings.shuffle ? "ON " : "OFF"), toggleShuffle, { col: settings.shuffle ? LGREEN : LBLUE });
  btn(x, 6, "REPEAT " + settings.repeat.toUpperCase().padEnd(3), cycleRepeat, { col: settings.repeat !== "off" ? LGREEN : LBLUE });

  x = btn(1, 7, "♥ FAV", () => toggleFav(current), { disabled: !current, col: isFav(current) ? LRED : LBLUE });
  btn(x, 7, "+ LIST", () => openAddMenu(current), { disabled: !current });
  text(25, 7, "VOL", LBLUE);
  for (let i = 0; i < 10; i++) put(29 + i, 7, i < Math.round(settings.vol * 10) ? 160 : 102, i < Math.round(settings.vol * 10) ? WHITE : DGREY);
  hit(29, 7, 10, 1, x => setVol((x - 29 + 1) / 10));
}

function drawTabs() {
  const labels = { browse: "BROWSE", favs: "FAVS " + lib.favs.length, playlists: "LISTS " + lib.playlists.length, recent: "RECENT" };
  let x = 0;
  TABS.forEach(v => {
    const label = " " + labels[v] + " ", n = toCodes(label).length;
    const active = v === settings.view || (v === "playlists" && isPlaylistView());
    text(x, 9, label, over(x, 9, n) ? WHITE : LBLUE, active || over(x, 9, n));
    hit(x, 9, n, 1, () => showView(v));
    x += n + 1;
  });
}

function drawLibrary() {
  const list = viewList(), n = list.length, s = sel(), top = ui.top[settings.view];
  const p = playlist(settings.view);
  const title = settings.view === "browse" ? "BROWSE" : settings.view === "favs" ? "FAVOURITES"
              : settings.view === "recent" ? "RECENTLY PLAYED" : settings.view === "playlists" ? "PLAYLISTS" : "LIST " + p.name;
  box(0, 10, 40, 14, LBLUE, title.slice(0, 22), n + (isTrackView() ? " TUNES" : " LISTS"));
  put(0, 12, 107, LBLUE); put(39, 12, 115, LBLUE); for (let i = 1; i < 39; i++) put(i, 12, 64, LBLUE);
  // column headers in the divider: click to sort, click the active one again to flip U (up) / D (down)
  if (settings.view === "browse" || settings.view === "favs") {
    [["title", "TITLE", 2], ["remixer", "REMIXER", 25], ["id", "#", 36]].forEach(([key, label, hx]) => {
      const active = settings.sort.key === key, l = active ? label + " " + settings.sort.dir.toUpperCase() : label;
      text(hx, 12, l, over(hx, 12, l.length) ? WHITE : active ? WHITE : LBLUE, active || over(hx, 12, l.length));
      hit(hx, 12, l.length, 1, () => setSort(key));
    });
  }

  // row 11: search line or list tools
  if (isTrackView()) {
    let x = 1;
    if (p) x = btn(1, 11, "←", () => showView("playlists"));
    if (settings.view === "recent") text(x, 11, "THE LAST 30 TUNES YOU PLAYED", LGREY);
    else {
      const editing = ui.edit && ui.edit.kind === "search";
      const q = searches[searchKey()] || "";
      const fw = 29 - (x + 5);
      text(x, 11, "FIND:", over(x, 11, fw + 5) ? WHITE : LBLUE);
      const shown = q || editing ? asCodes(q).slice(-(fw - 1)) : toCodes("PRESS / OR CLICK");
      text(x + 5, 11, shown, q || editing ? WHITE : DGREY);
      if (editing && Math.floor(Date.now() / 400) % 2) put(x + 5 + shown.length, 11, 160, WHITE);
      hit(x, 11, fw + 5, 1, startSearch);
      ui.kbdField = { x: x + 5, y: 11, w: fw };
      btn(30, 11, "PLAY ALL", () => playSource(viewSource(), searches[searchKey()]), { disabled: !n });
    }
  } else {
    let x = btn(1, 11, "NEW LIST", newListPrompt);
    x = btn(x, 11, "EXPORT", exportLibrary);
    btn(x, 11, "IMPORT", () => $("lib-file").click());
  }

  // rows 13-21: the list
  for (let k = 0; k < LIST_H; k++) {
    const i = top + k, item = list[i], y = LIST_Y + k;
    if (!item) continue;
    const isSel = i === s, rev = isSel;
    if (isTrackView()) {
      const playing = item === current;
      put(1, y, playing ? 62 : 32, playing ? WHITE : LBLUE);
      text(2, y, pad(item.t, 22), playing || isSel ? WHITE : LGREY, rev);
      put(24, y, rev ? 160 : 32, WHITE);
      text(25, y, pad(item.a, 12), isSel ? WHITE : LBLUE, rev);
      put(37, y, rev ? 160 : 32, WHITE);
      const fav = isFav(item), fx = 38;
      put(fx, y, 83, over(fx, y, 1) ? WHITE : fav ? LRED : DGREY);
      hit(2, y, 36, 1, () => rowClick(i));
      hit(fx, y, 1, 1, () => { ui.sel[settings.view] = i; toggleFav(item); });
    } else {
      const playing = settings.queue.source === item.id && !!current;
      put(1, y, playing ? 62 : 32, WHITE);
      text(2, y, pad(item.name, 30), isSel ? WHITE : LGREY, rev);
      text(32, y, rpad(item.tracks.length + "", 7), isSel ? WHITE : LBLUE, rev);
      hit(2, y, 37, 1, () => rowClick(i));
    }
  }
  if (!n) {
    const q = (searches[searchKey()] || "").trim();
    const msg = q ? ["?NO TUNES MATCH " + q.toUpperCase().slice(0, 22)]
              : settings.view === "favs" ? ["NO FAVOURITES YET.", "PRESS ♥ ON ANY TUNE."]
              : settings.view === "recent" ? ["NOTHING PLAYED YET."]
              : settings.view === "playlists" ? ["NO LISTS YET.", "PRESS NEW LIST TO MAKE ONE."]
              : ["THIS LIST IS EMPTY.", "GO TO BROWSE, FIND TUNES AND", "PRESS + LIST TO ADD THEM HERE."];
    msg.forEach((m, k) => text(2, LIST_Y + 1 + k, m, LGREY));
  }
  // scrollbar in the right border: the thumb sits on whole cells, and each thumb position stands for
  // exactly one list position (see scrollTo), so dragging and scrolling always agree
  ui.scroll = null;
  if (n > LIST_H) {
    const th = Math.max(1, Math.round(LIST_H * LIST_H / n)), span = LIST_H - th;
    const ty = LIST_Y + Math.round(span * top / (n - LIST_H));
    for (let k = 0; k < LIST_H; k++) {
      const on = LIST_Y + k >= ty && LIST_Y + k < ty + th;
      put(39, LIST_Y + k, on ? 160 : 102, on ? WHITE : DGREY);
    }
    ui.scroll = { n, th, ty, span };
  }

  // row 22: actions for the selected row
  const item = list[s];
  let x = 1;
  if (isTrackView()) {
    x = btn(x, 22, "PLAY", activate, { disabled: !item });
    x = btn(x, 22, "♥", () => toggleFav(item), { disabled: !item, col: isFav(item) ? LRED : LBLUE });
    x = btn(x, 22, "+ LIST", () => openAddMenu(item), { disabled: !item });
    if (p) {
      x = btn(x, 22, "UP", () => moveTrack(-1), { disabled: !item || !canReorder() || s === 0 });
      x = btn(x, 22, "DN", () => moveTrack(1), { disabled: !item || !canReorder() || s === n - 1 });
      x = btn(x, 22, "DEL", removeTrack, { disabled: !item });
    }
  } else {
    x = btn(x, 22, "OPEN", activate, { disabled: !item });
    x = btn(x, 22, "PLAY", () => item.tracks.length ? playSource(item.id, "") : setStatus("?" + item.name + " IS EMPTY."), { disabled: !item });
    x = btn(x, 22, "RENAME", () => renamePrompt(item), { disabled: !item });
    x = btn(x, 22, "DELETE", () => deleteConfirm(item), { disabled: !item });
  }
  if (n) text(x, 22, rpad((s + 1) + "/" + n, 39 - x), DGREY);
}

function drawStatus() {
  if (statusLine.msg && Date.now() < statusLine.until) text(0, 24, pad(statusLine.msg, 40), statusLine.col);
}

function drawOverlay(o) {
  const { x, y, w, h } = o;
  // shadow, then the box
  for (let j = 1; j <= h; j++) put(x + w, y + j, 160, BLACK);
  for (let i = 1; i <= w; i++) put(x + i, y + h, 160, BLACK);
  if (o.kind === "prompt") {
    box(x, y, w, h, WHITE, o.title);
    text(x + 2, y + 2, "NAME:", LBLUE);
    const v = asCodes(kbd.value).slice(-(w - 10));
    text(x + 8, y + 2, v, WHITE);
    if (Math.floor(Date.now() / 400) % 2) put(x + 8 + v.length, y + 2, 160, WHITE);
    ui.kbdField = { x: x + 8, y: y + 2, w: w - 10 };
    hit(x + 1, y + 2, w - 2, 1, () => kbd.focus());
    let bx = btn(x + 2, y + 4, "  OK  ", () => { const v = kbd.value; const done = ui.edit && ui.edit.onDone; stopEdit(); done && done(v); });
    btn(bx, y + 4, "CANCEL", o.cancel);
  } else if (o.kind === "confirm") {
    box(x, y, w, h, WHITE, "ARE YOU SURE?");
    o.lines.forEach((l, k) => text(x + 2, y + 1 + k, pad(l, w - 4), WHITE));
    const by = y + h - 2;
    let bx = btn(x + 2, by, " YES ", () => { closeOverlay(); o.onYes(); }, { col: LRED });
    btn(bx, by, " NO ", o.cancel);
  } else if (o.kind === "menu") {
    const items = menuItems(o), rows = h - 7;
    o.sel = Math.max(0, Math.min(items.length - 1, o.sel));
    if (o.sel < o.top) o.top = o.sel;
    if (o.sel >= o.top + rows) o.top = o.sel - rows + 1;
    box(x, y, w, h, WHITE, "ADD TO LIST");
    text(x + 2, y + 1, marquee(o.track.t, w - 4), WHITE);
    text(x + 2, y + 2, pad("BY " + o.track.a, w - 4), LGREY);
    for (let k = 0; k < rows; k++) {
      const i = o.top + k, item = items[i], ry = y + 4 + k;
      if (!item) break;
      const isSel = i === o.sel;
      if (item.newList) text(x + 2, ry, pad("+ NEW LIST...", w - 4), CYAN, isSel || over(x + 2, ry, w - 4));
      else {
        const on = item.tracks.includes(o.track.i), hl = isSel || over(x + 2, ry, w - 4);
        text(x + 2, ry, pad((on ? "● " : "○ ") + item.name, w - 9), on || hl ? WHITE : LBLUE, hl);
        text(x + w - 7, ry, rpad(item.tracks.length + "", 5), on || hl ? WHITE : LBLUE, hl);
      }
      hit(x + 2, ry, w - 4, 1, () => { o.sel = i; menuActivate(o, item); });
    }
    btn(x + 2, y + h - 2, " CLOSE ", o.cancel);
    text(x + 11, y + h - 2, "RETURN TOGGLES", DGREY);
  } else if (o.kind === "help") {
    box(x, y, w, h, WHITE, "HELP");
    const lines = [
      ["MOUSE", "CLICK BUTTONS AND ♥"],
      ["", "DOUBLE-CLICK TUNE = PLAY"],
      ["CRSR U/D", "SELECT (PGUP/PGDN: PAGE)"],
      ["RETURN", "PLAY TUNE / OPEN LIST"],
      ["SPACE", "PLAY / PAUSE"],
      ["CRSR L/R", "PREVIOUS / NEXT TUNE"],
      ["/", "FIND (RETURN/ESC ENDS)"],
      ["F", "FAVOURITE SELECTED TUNE"],
      ["L", "ADD SELECTED TO A LIST"],
      ["S / R", "SHUFFLE / REPEAT"],
      ["+ / -", "VOLUME"],
      ["1-4 TAB", "SWITCH TABS"],
      ["N", "NEW LIST (IN LISTS TAB)"],
      ["DEL", "REMOVE TUNE / DELETE LIST"],
      ["SHFT U/D", "MOVE TUNE IN A LIST"],
      ["ESC", "BACK / CLOSE"],
    ];
    lines.forEach(([k, v], i) => { text(x + 2, y + 2 + i, k, WHITE); text(x + 11, y + 2 + i, v, LBLUE); });
    let by = y + 2 + lines.length + 1, bx = x + 2;
    bx = btn(bx, by, "REMIX.KWED.ORG", () => window.open(RKO, "_blank", "noopener"), { col: CYAN });
    btn(bx, by, "FONT: STYLE64.ORG", () => window.open("https://style64.org/c64-truetype", "_blank", "noopener"), { col: CYAN });
    text(x + 2, by + 2, "INDEX BUILT " + BUILT, DGREY);
    btn(x + w - 9, y + h - 2, " CLOSE ", o.cancel);
  }
}

// Keep the hidden input over the field being typed into, so taps and the phone keyboard line up.
function placeKbd() {
  const f = ui.edit && ui.kbdField;
  Object.assign(kbd.style, f ? { left: f.x * px + "px", top: f.y * px + "px", width: f.w * px + "px", height: px + "px" }
                             : { left: "0px", top: "0px", width: "1px", height: "1px" });
}

/* ======================================================================================
   Input
   ====================================================================================== */
function cellAt(e) {
  const r = $("screen").getBoundingClientRect();
  return { x: Math.floor((e.clientX - r.left) / px), y: Math.floor((e.clientY - r.top) / px) };
}
function rowClick(i) {
  const now = Date.now(), v = settings.view;
  const dbl = ui.lastClick.i === i && ui.lastClick.v === v && now - ui.lastClick.t < 450;
  ui.sel[v] = i; ui.lastClick = { t: now, i, v };
  if (dbl) activate(); else render();
}

// Scrollbar dragging. Thumb position p (0 = top cell) maps to list top round(p * (n - 9) / span), and
// drawing maps back with the same rounding, so the thumb lands on the cell it was dragged to.
let drag = null, dragEnded = 0;
function scrollTo(p) {
  const s = ui.scroll; if (!s) return;
  p = Math.max(0, Math.min(s.span, p));
  ui.top[settings.view] = Math.round(p * (s.n - LIST_H) / s.span);   // the selection stays on its tune
  render();
}
$("screen").addEventListener("pointerdown", e => {
  const s = ui.scroll, c = cellAt(e);
  if (boot.state !== "ready" || !tvOn || ui.overlay || !s || c.x !== 39 || c.y < LIST_Y || c.y >= LIST_Y + LIST_H) return;
  // grab the thumb where it was clicked; a click on the track jumps the thumb there
  drag = { grab: c.y >= s.ty && c.y < s.ty + s.th ? c.y - s.ty : Math.floor(s.th / 2), p: -1 };
  try { $("screen").setPointerCapture(e.pointerId); } catch {}
  dragTo(c.y);
});
function dragTo(y) {
  const p = y - drag.grab - LIST_Y;
  if (p !== drag.p) { drag.p = p; scrollTo(p); }
}
const endDrag = () => { if (drag) { drag = null; dragEnded = Date.now(); } };
$("screen").addEventListener("pointerup", endDrag);
$("screen").addEventListener("pointercancel", endDrag);
$("screen").addEventListener("pointermove", e => {
  const c = cellAt(e);
  if (drag) return dragTo(c.y);
  if (c.x !== mouse.x || c.y !== mouse.y) { mouse = c; render(); }
});
$("screen").addEventListener("mousedown", e => e.preventDefault());
$("screen").addEventListener("pointerleave", () => { mouse = { x: -1, y: -1 }; render(); });
$("screen").addEventListener("click", e => {
  if (boot.state !== "ready" || !tvOn || Date.now() - dragEnded < 100) return;   // off, or the click that ends a drag
  const c = cellAt(e); mouse = c;
  const o = ui.overlay;
  if (o && (c.x < o.x || c.x >= o.x + o.w || c.y < o.y || c.y >= o.y + o.h)) return o.cancel();
  const h = [...hits].reverse().find(h => c.x >= h.x && c.x < h.x + h.w && c.y >= h.y && c.y < h.y + h.h);
  if (ui.edit && ui.edit.kind === "search" && !(h && h.fn === startSearch)) stopEdit();
  if (h) h.fn(c.x, c.y); else render();
});
// Lists scroll one row per ~33 px of scrolling: three rows per mouse-wheel notch, and smoothly with a
// trackpad, which sends many small events.
let listWheel = 0;
$("screen").addEventListener("wheel", e => {
  e.preventDefault();
  if (boot.state !== "ready" || !tvOn || (ui.overlay && ui.overlay.kind !== "menu")) return;
  listWheel += wheelPixels(e);
  const rows = Math.trunc(listWheel / 33);
  if (!rows) return;
  listWheel -= rows * 33;
  if (ui.overlay) { ui.overlay.sel += rows; return render(); }
  scrollRows(rows);
}, { passive: false });
// Touch: drag up/down over the list to scroll it.
let touchY = null;
$("screen").addEventListener("touchstart", e => { touchY = e.touches[0].clientY; }, { passive: true });
$("screen").addEventListener("touchmove", e => {
  if (touchY === null || ui.overlay || drag) return;
  const dy = touchY - e.touches[0].clientY, step = px * 1.2;
  if (Math.abs(dy) >= step) { scrollRows(Math.trunc(dy / step)); touchY = e.touches[0].clientY; }
}, { passive: true });

document.addEventListener("keydown", e => {
  if (boot.state !== "ready" || !tvOn || e.target === kbd || e.metaKey || e.ctrlKey || e.altKey) return;
  const o = ui.overlay, k = e.key;
  const handled = () => { e.preventDefault(); };
  if (o) {
    if (k === "Escape") return handled(), o.cancel();
    if (o.kind === "confirm") { if (k === "y" || k === "Y" || k === "Enter") { handled(); closeOverlay(); o.onYes(); } else if (k === "n" || k === "N") { handled(); o.cancel(); } return; }
    if (o.kind === "menu") {
      const items = menuItems(o);
      if (k === "ArrowDown") { handled(); o.sel++; render(); }
      else if (k === "ArrowUp") { handled(); o.sel--; render(); }
      else if (k === "Enter" || k === " ") { handled(); menuActivate(o, items[Math.max(0, Math.min(items.length - 1, o.sel))]); }
      return;
    }
    if (o.kind === "help" && (k === "Enter" || k === "?")) { handled(); o.cancel(); }
    return;
  }
  const item = selected(), p = playlist(settings.view);
  switch (k) {
    case "ArrowDown": handled(); return e.shiftKey ? moveTrack(1) : moveSel(1);
    case "ArrowUp": handled(); return e.shiftKey ? moveTrack(-1) : moveSel(-1);
    case "PageDown": handled(); return moveSel(LIST_H);
    case "PageUp": handled(); return moveSel(-LIST_H);
    case "Home": handled(); ui.sel[settings.view] = 0; reveal(); return render();
    case "End": handled(); ui.sel[settings.view] = viewList().length - 1; reveal(); return render();
    case "Enter": handled(); return activate();
    case " ": handled(); return togglePlay();
    case "ArrowRight": handled(); return next(false);
    case "ArrowLeft": handled(); return prev();
    case "/": handled(); return startSearch();
    case "Tab": handled(); return nextTab(e.shiftKey ? -1 : 1);
    case "Escape":
      handled();
      if (p) return showView("playlists");
      if (searches[searchKey()]) { searches[searchKey()] = ""; return render(); }
      return;
    case "?": handled(); return openHelp();
    case "+": case "=": handled(); return setVol(settings.vol + 0.1);
    case "-": handled(); return setVol(settings.vol - 0.1);
    case "Delete": case "Backspace":
      handled();
      if (p) return removeTrack();
      if (settings.view === "playlists" && item) return deleteConfirm(item);
      return;
  }
  switch (k.toLowerCase()) {
    case "1": case "2": case "3": case "4": handled(); return showView(TABS[Number(k) - 1]);
    case "f": if (isTrackView()) { handled(); toggleFav(item); } return;
    case "l": if (isTrackView()) { handled(); openAddMenu(item); } return;
    case "s": handled(); return toggleShuffle();
    case "r": handled(); return cycleRepeat();
    case "n": if (settings.view === "playlists") { handled(); newListPrompt(); } return;
  }
});

function newListPrompt() {
  openPrompt("NEW LIST", "", name => { const p = createPlaylist(name); if (p) { ui.sel.playlists = lib.playlists.length - 1; if (settings.view === "playlists") reveal(); setStatus("CREATED " + p.name, LGREEN); } });
}
function renamePrompt(p) {
  openPrompt("RENAME LIST", p.name, name => { p.name = name.slice(0, 40); saveLib(); libraryChanged(); });
}
function deleteConfirm(p) {
  openConfirm(["DELETE LIST", p.name.toUpperCase().slice(0, 28), "(" + p.tracks.length + " TUNES)?"], () => {
    lib.playlists.splice(lib.playlists.indexOf(p), 1); saveLib(); libraryChanged(); setStatus("DELETED " + p.name, LGREEN);
  });
}
