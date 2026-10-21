// The remix index, settings, favourites and playlists, the play queue and playback, the TV knobs,
// and library export/import. Uses screen.js; its functions are called from ui.js and main.js.

// The remix index lives in data/remixes.json (written by build.py) and is loaded at start-up.
let REMIXES = [], BY_ID = new Map(), BUILT = "";
// Unpacks the compact form: each song is [id step, title, arranger, composer, file?], where the file
// name is only given when it is not "<arranger> - <title>.mp3".
function unpackIndex({ built, arrangers, composers, songs }) {
  let id = 0;
  REMIXES = songs.map(([step, t, a, c, f]) => {
    id += step;
    return { i: id, t, a: arrangers[a], c: composers[c], f: f || arrangers[a] + " - " + t + ".mp3" };
  });
  BY_ID = new Map(REMIXES.map(r => [r.i, r]));
  BUILT = built || "";
  sortedAll = {};
}
const RKO = "https://remix.kwed.org";
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }
};
const fmt = s => !isFinite(s) ? "0:00" : Math.floor(s / 60) + ":" + String(Math.floor(s % 60)).padStart(2, "0");
// Keeps only ids that exist in the index, without duplicates.
const knownIds = list => [...new Set((Array.isArray(list) ? list : []).filter(i => BY_ID.has(i)))];
const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);


/* ======================================================================================
   Library, settings and play queue
   ====================================================================================== */
// view: what the library box shows ("browse", "favs", "playlists", "recent" or a playlist id).
// queue: what the player plays from; it only changes when the user starts playback somewhere.
const settings = Object.assign({ shuffle: true, repeat: "all", vol: 0.8, view: "browse", queue: { source: "all", filter: "" },
                                 sort: { key: "id", dir: "d" } },
                               store.get("settings", {}));
const saveSettings = () => store.set("settings", settings);
const searches = { browse: "", favs: "", playlist: "" };

// Favourites and playlists, stored by remix id. Loaded once the index is in, so unknown ids can be dropped.
let lib = { favs: [], playlists: [] };
function loadLibrary() {
  const saved = store.get("library", {});
  lib = {
    favs: knownIds(saved.favs),
    playlists: (Array.isArray(saved.playlists) ? saved.playlists : [])
      .filter(p => p && typeof p.name === "string")
      .map(p => ({ id: String(p.id || newId()), name: p.name.slice(0, 40), tracks: knownIds(p.tracks) }))
  };
}
const saveLib = () => store.set("library", lib);
const isFav = r => !!r && lib.favs.includes(r.i);
const playlist = id => lib.playlists.find(p => p.id === id);

let statusLine = { msg: "", col: YELLOW, until: 0 };
function setStatus(msg, col = YELLOW) { statusLine = { msg, col, until: Date.now() + 5000 }; render(); }

function toggleFav(r) {
  if (!r) return;
  const n = lib.favs.indexOf(r.i);
  n >= 0 ? lib.favs.splice(n, 1) : lib.favs.push(r.i);
  saveLib(); libraryChanged();
  setStatus(n >= 0 ? "REMOVED FROM FAVOURITES." : "ADDED TO FAVOURITES.", LGREEN);
}

function createPlaylist(name) {
  name = (name || "").trim().slice(0, 40);
  if (!name) return null;
  const p = { id: newId(), name, tracks: [] };
  lib.playlists.push(p); saveLib(); libraryChanged();
  return p;
}

function togglePlaylistTrack(p, r) {
  const n = p.tracks.indexOf(r.i);
  n >= 0 ? p.tracks.splice(n, 1) : p.tracks.push(r.i);
  saveLib(); libraryChanged();
  setStatus((n >= 0 ? "REMOVED FROM " : "ADDED TO ") + p.name, LGREEN);
}

// Two audio elements take turns: `player` plays the current tune while `preload` loads the next one.
// The next tune starts just before the current one ends and the two swap roles, so the sound never
// stops between tunes. Phones may suspend a page with a locked screen once it falls silent, which
// would keep the next tune from starting.
let player = new Audio(), preload = new Audio();
player.preload = preload.preload = "auto";
let preloaded = null;                 // the tune loaded in `preload`
const HANDOFF = 0.6;                  // seconds before the end at which the next tune starts
const PRELOAD_AHEAD = 30;             // seconds before the end at which the next tune starts loading
let order = [], pos = -1, current = null, uncounted = null, failures = 0, recent = [];

// Tunes are played from RKO's download link, which adds one to the tune's download count and redirects
// to the MP3, so each tune that is loaded is counted once, as if it were downloaded from the site.
const fileUrl = r => RKO + "/download.php/" + r.i + "/" + encodeURIComponent(r.f);

// Count a play as one GoatCounter event, if its script loaded. Every tune counts under the same name,
// so the statistics show the total number of plays, not which tunes were played. no_session counts
// every play; without it GoatCounter counts a visitor's repeated plays only once.
function countPlay() {
  window.goatcounter?.count?.({ path: "play", title: "Tune played", event: true, no_session: true });
}

// Sorting for Browse and Favourites (Recent keeps play order, playlists keep their own order).
// key: "id" (remix number = release order), "title" or "remixer"; dir: "u" (A-Z, oldest first) or "d".
const collator = new Intl.Collator("en", { sensitivity: "base", numeric: true });
const SORTS = {
  id: (a, b) => a.i - b.i,
  title: (a, b) => collator.compare(a.t, b.t) || a.i - b.i,
  remixer: (a, b) => collator.compare(a.a, b.a) || collator.compare(a.t, b.t) || a.i - b.i,
};
const sortedList = list => {
  const { key, dir } = settings.sort, cmp = SORTS[key] || SORTS.id;
  return list.slice().sort(dir === "d" ? (a, b) => cmp(b, a) : cmp);
};
let sortedAll = {};                                   // the whole catalogue per sort, computed once
const allSorted = () => { const k = settings.sort.key + settings.sort.dir; return sortedAll[k] || (sortedAll[k] = sortedList(REMIXES)); };
function setSort(key) {
  const s = settings.sort;
  settings.sort = s.key === key ? { key, dir: s.dir === "u" ? "d" : "u" } : { key, dir: key === "id" ? "d" : "u" };
  ui.sel[settings.view] = 0; ui.top[settings.view] = 0;
  saveSettings(); rebuildOrder(); render();
}

function tracksFor(source, filter) {
  const list = source === "all" ? allSorted()
             : source === "favs" ? sortedList(lib.favs.map(i => BY_ID.get(i)))
             : source === "recent" ? recent
             : (playlist(source) || { tracks: [] }).tracks.map(i => BY_ID.get(i));
  const q = (filter || "").trim().toLowerCase();
  return q ? list.filter(r => (r.t + " " + r.a + " " + r.c).toLowerCase().includes(q)) : list;
}

function sourceName(source) {
  return source === "all" ? "ALL REMIXES" : source === "favs" ? "FAVOURITES" : (playlist(source) || { name: "?" }).name;
}

function shuffled(list) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

// Rebuilds the play order from the queue source. With shuffle on, `first` (usually the playing
// track) goes to the front so the shuffled rest follows it.
function rebuildOrder(first = current) {
  const list = tracksFor(settings.queue.source, settings.queue.filter);
  if (settings.shuffle) {
    order = shuffled(list.filter(r => r !== first));
    if (first && list.includes(first)) order.unshift(first);
  } else {
    order = list.slice();
  }
  pos = current ? order.indexOf(current) : -1;
  warmNext();
}

// Points the player at a new source and starts it, optionally at a given track.
function playSource(source, filter, track) {
  if (source === "recent") source = "all";   // recent is a moving list; play a pick from it, then carry on with all
  settings.queue = { source, filter: filter || "" }; saveSettings();
  if (track) { rebuildOrder(track); pos = order.indexOf(track); return playTrack(track); }
  current = null; rebuildOrder(null); next();
}

function peekNext() {
  if (settings.repeat === "one") return null;
  if (pos + 1 < order.length) return order[pos + 1];
  return settings.repeat === "all" && !settings.shuffle ? order[0] : null;
}

// Load the next tune in `preload`, but only near the end of the current one: loading it counts it as a
// download on RKO, so it should only happen when it is about to play.
function warmNext() {
  const n = peekNext();
  if (!(player.duration - player.currentTime <= PRELOAD_AHEAD)) return;
  // leave `preload` alone while it is still playing the end of the previous tune
  if (!n || n === current || n === preloaded || (!preload.paused && !preload.ended)) return;
  preload.src = fileUrl(n); preload.load(); preloaded = n;
}

function playTrack(r) {
  current = r;
  if (r === preloaded && !preload.error) {
    // swap: the preloaded element becomes the player; the old one finishes its last moment, then idles
    [player, preload] = [preload, player];
    if (player.currentTime) player.currentTime = 0;
    const tail = preload.duration - preload.currentTime;
    if (!(tail > 0 && tail <= HANDOFF + 0.5)) preload.pause();
  } else {
    player.src = fileUrl(r);
  }
  preloaded = null;
  uncounted = r;
  player.play().catch(e => setStatus("?PLAYBACK BLOCKED. PRESS PLAY."));
  document.title = r.t + " - " + r.a;
  $("sr-now").textContent = "Now playing " + r.t + " by " + r.a;
  if ("mediaSession" in navigator) {
    navigator.mediaSession.metadata = new MediaMetadata({ title: r.t, artist: r.a, album: "Remix64 / " + (r.c || "C64") });
  }
  recent = [r, ...recent.filter(x => x !== r)].slice(0, 30);
  warmNext(); render();
}

// auto = true when the previous track ended on its own; repeat-one only applies then.
function next(auto = false) {
  if (auto && settings.repeat === "one" && current) { uncounted = current; player.currentTime = 0; player.play(); return; }
  if (!order.length) return setStatus("?NOTHING TO PLAY: THE LIST IS EMPTY.");
  if (pos + 1 < order.length) {
    pos++;
  } else if (settings.repeat === "all") {
    if (settings.shuffle) {   // fresh shuffle each lap, without repeating the last track straight away
      order = shuffled(order);
      if (order.length > 1 && order[0] === current) order.push(order.shift());
    }
    pos = 0;
  } else {
    player.pause();
    return setStatus("END OF LIST.");
  }
  playTrack(order[pos]);
}

function prev() {
  if (player.currentTime > 5 || pos <= 0) { player.currentTime = 0; return; }
  pos--; playTrack(order[pos]);
}

function togglePlay() {
  if (!current || (player.ended && pos >= order.length - 1)) {
    const v = settings.view;
    return v === "playlists" || v === "recent" ? playSource(settings.queue.source, settings.queue.filter)
                                               : playSource(viewSource(), searches[searchKey()]);
  }
  player.paused ? player.play() : player.pause();
}

function setVol(v) { v = Math.min(1, Math.max(0, Math.round(v * 10) / 10)); player.volume = preload.volume = v; settings.vol = v; saveSettings(); render(); }
// Colour schemes, one per TV channel; ids match the body[data-scheme] blocks in the CSS.
const SCHEMES = ["colodore", "pepto", "green", "bw"];
function setScheme(n) {
  n = ((n % SCHEMES.length) + SCHEMES.length) % SCHEMES.length;
  settings.scheme = n; saveSettings();
  if (n) document.body.dataset.scheme = SCHEMES[n]; else delete document.body.dataset.scheme;
  readPalette();
  // the knob handle is level in channel 1 and turns 45 degrees per channel
  document.querySelector("#knob-channel .knob-handle").style.transform = "rotate(" + n * 45 + "deg)";
  render();
}
// The knob belongs to the TV, not the C64, so changing it shows nothing on the C64 screen itself.
$("knob-channel").addEventListener("click", () => setScheme((settings.scheme || 0) + 1));
// Scrolling turns the knob like a detented knob: one channel per gesture, once enough scrolling has
// built up in one direction. Trackpads send many tiny events plus momentum, so the rest of the gesture
// is ignored until the events stop.
const knobWheel = { sum: 0, locked: false, quiet: 0 };
$("knob-channel").addEventListener("wheel", e => {
  e.preventDefault();
  clearTimeout(knobWheel.quiet);
  knobWheel.quiet = setTimeout(() => { knobWheel.sum = 0; knobWheel.locked = false; }, 200);
  if (knobWheel.locked) return;
  knobWheel.sum += wheelPixels(e);
  if (Math.abs(knobWheel.sum) >= 60) {
    setScheme((settings.scheme || 0) + Math.sign(knobWheel.sum));
    knobWheel.sum = 0; knobWheel.locked = true;
  }
}, { passive: false });

// The lower knob is the TV's power switch: vertical is on, horizontal is off. Off blacks out the
// picture and mutes the sound, but the music keeps running, so switching on again resumes mid-tune.
// While off the C64 cannot be seen, so clicks and keys are ignored. It always starts switched on.
let tvOn = true;
function setPower(on) {
  if (on === tvOn) return;
  tvOn = on;
  document.body.classList.toggle("tv-off", !on);
  player.muted = preload.muted = !on;
  const pic = $("picture");
  pic.classList.remove("crt-on");
  if (on) { void pic.offsetWidth; pic.classList.add("crt-on"); }      // restart the switch-on animation
  else stopEdit();
}
$("picture").addEventListener("animationend", e => { if (e.animationName === "crt-on") $("picture").classList.remove("crt-on"); });
$("knob-power").addEventListener("click", () => setPower(!tvOn));

// Wheel distance in pixels, whatever unit the device reports (pixels, lines or pages).
const wheelPixels = e => e.deltaY * (e.deltaMode === 1 ? 33 : e.deltaMode === 2 ? 400 : 1);

function toggleShuffle() { settings.shuffle = !settings.shuffle; saveSettings(); rebuildOrder(); render(); }
function cycleRepeat() { settings.repeat = { off: "all", all: "one", one: "off" }[settings.repeat]; saveSettings(); warmNext(); render(); }

// After favourites or playlists change: keep playing, but refresh the order if it came from them.
function libraryChanged() {
  if (settings.queue.source !== "all" && settings.queue.source !== "favs" && !playlist(settings.queue.source)) settings.queue = { source: "all", filter: "" };
  if (settings.queue.source !== "all") rebuildOrder();
  saveSettings(); render();
}


/* ---------- audio events ---------- */
// Both elements get the same handlers; only the one currently acting as `player` reacts, except that
// the other one, once it has finished the tail of the previous tune, may start loading the next.
function wireAudio(el) {
  el.addEventListener("playing", () => {
    if (el !== player) return;
    failures = 0;
    if (uncounted) { countPlay(); uncounted = null; }
    updateMediaSession();
  });
  el.addEventListener("play", () => { if (el === player) { updateMediaSession(); render(); } });
  el.addEventListener("pause", () => { if (el === player) { updateMediaSession(); render(); } });
  el.addEventListener("ended", () => { if (el === player) next(true); else warmNext(); });
  el.addEventListener("timeupdate", () => {
    if (el !== player) return;
    // start the next tune a moment early if it is loaded, so there is no silent gap
    const left = el.duration - el.currentTime;
    if (left > 0 && left <= HANDOFF && settings.repeat !== "one" && preloaded && preloaded === peekNext()
        && preload.readyState >= 3) next(true);
    else {
      if (left <= PRELOAD_AHEAD) warmNext();
      if (Math.floor(el.currentTime) % 5 === 0) updateMediaSession();
    }
  });
  el.addEventListener("error", () => {
    if (el !== player) { if (el === preload) preloaded = null; return; }   // a failed preload is retried on play
    // Skip broken files, but stop after several consecutive failures (likely offline).
    if (++failures > 5) return setStatus("?LOAD ERROR. CHECK CONNECTION.");
    setStatus("?FILE NOT FOUND ERROR. SKIPPING.");
    next(false);
  });
}
wireAudio(player); wireAudio(preload);

// Lock-screen and notification controls, and the position shown there. An active media session also
// helps phones keep the page running with the screen locked.
function updateMediaSession() {
  if (!("mediaSession" in navigator)) return;
  navigator.mediaSession.playbackState = current ? (player.paused ? "paused" : "playing") : "none";
  const d = player.duration, t = player.currentTime;
  if (navigator.mediaSession.setPositionState && isFinite(d) && d > 0 && t <= d) {
    try { navigator.mediaSession.setPositionState({ duration: d, position: t, playbackRate: player.playbackRate || 1 }); } catch {}
  }
}

/* ---------- export / import ---------- */
function exportLibrary() {
  const blob = new Blob([JSON.stringify({ app: "c64-radio", version: 1, ...lib }, null, 2)], { type: "application/json" });
  const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: "c64-radio-library.json" });
  a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  setStatus("SAVING \"C64-RADIO-LIBRARY.JSON\"", LGREEN);
}
$("lib-file").onchange = async e => {
  const file = e.target.files[0]; e.target.value = "";
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    let favs = 0, lists = 0;
    knownIds(data.favs).forEach(i => { if (!lib.favs.includes(i)) { lib.favs.push(i); favs++; } });
    (Array.isArray(data.playlists) ? data.playlists : []).forEach(p => {
      if (!p || typeof p.name !== "string") return;
      let name = p.name.slice(0, 40);
      while (lib.playlists.some(x => x.name === name)) name += " (IMPORTED)";
      lib.playlists.push({ id: newId(), name, tracks: knownIds(p.tracks) }); lists++;
    });
    saveLib(); libraryChanged();
    setStatus("LOADED " + favs + " FAVS AND " + lists + " LISTS.", LGREEN);
  } catch (err) {
    setStatus("?LOAD ERROR: NOT A LIBRARY FILE.");
  }
};

if ("mediaSession" in navigator) {
  const action = (name, fn) => { try { navigator.mediaSession.setActionHandler(name, fn); } catch {} };
  action("play", () => (current ? player.play() : togglePlay()));
  action("pause", () => player.pause());
  action("nexttrack", () => next(false));
  action("previoustrack", prev);
  action("seekto", e => { if (isFinite(player.duration)) { player.currentTime = e.seekTime; updateMediaSession(); } });
}
