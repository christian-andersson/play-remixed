// Start-up: loads the remix index and the character set, then starts drawing. Loaded last.

/* ---------- start-up ---------- */
const boot = { state: "loading", error: "" };
async function loadIndex() {
  try {
    // no-cache: revalidate each time, so a rebuilt index shows up on the next visit
    const res = await fetch("data/remixes.json", { cache: "no-cache" });
    if (!res.ok) throw new Error("HTTP " + res.status + " " + res.statusText);
    unpackIndex(await res.json());
  } catch (err) {
    boot.state = "error"; boot.error = String(err && err.message || err);
    return render();
  }
  loadLibrary();
  // Settings saved by an earlier version of this page used `source`/`filter`/`target` keys.
  if (!settings.queue || typeof settings.queue.source !== "string") settings.queue = { source: "all", filter: "" };
  delete settings.source; delete settings.filter; delete settings.target;
  if (!playlist(settings.queue.source) && settings.queue.source !== "favs") settings.queue.source = "all";
  if (!TABS.includes(settings.view) && !playlist(settings.view)) settings.view = "browse";
  boot.state = "ready";
  render();
}

player.volume = preload.volume = settings.vol;
setScheme(settings.scheme || 0);
addEventListener("resize", fit);
setInterval(render, 100);              // cursor blink, scrolling titles and the progress bar
fit();
loadCharset();
loadIndex();
