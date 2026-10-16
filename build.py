"""Builds index.html: scrapes the Remix64 catalogue.

Usage: python3 build.py [remixes.json]   (without an argument it scrapes the site and saves remixes.json)
"""
import datetime, html, json, re, sys, time, urllib.parse, urllib.request
from pathlib import Path

HERE = Path(__file__).parent
UA = {"User-Agent": "personal-c64-radio-builder"}
ROW = re.compile(r'title="([^"]*)" href="/download\.php/(\d+)/([^"]+)" class="download">(.*?)</a>\s*</td>\s*<td>(.*?)</td>\s*<td>(.*?)</td>', re.S)
TAGS = re.compile(r"<[^>]+>")


def get(url):
    return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30).read().decode("utf-8", "replace")


def text(s):
    return html.unescape(TAGS.sub("", s)).strip()


def scrape_remixes():
    items = {}
    for page in range(1, 1000):
        found = 0
        for meta, rid, fname, title, arr, comp in ROW.findall(get(f"https://remix.kwed.org/?chart=&view=date&page={page}")):
            d = re.search(r"([\d:]+) minutes", meta)
            items[int(rid)] = {"i": int(rid), "f": urllib.parse.unquote(html.unescape(fname)), "t": text(title),
                               "a": text(arr), "c": text(comp), "d": d.group(1) if d else ""}
            found += 1
        print(f"page {page}: {found}", file=sys.stderr)
        if not found:
            break
        time.sleep(0.4)
    return sorted(items.values(), key=lambda x: x["i"])


def compact(remixes):
    """Shrinks the list for embedding; decoded where REMIXES is defined in template.html.

    Each song is [id step, title, arranger index, composer index] plus the file name only when it
    is not "<arranger> - <title>.mp3". Ids are stored as the step from the previous id.
    """
    arrangers = sorted({r["a"] for r in remixes})
    composers = sorted({r["c"] for r in remixes})
    a_idx = {a: n for n, a in enumerate(arrangers)}
    c_idx = {c: n for n, c in enumerate(composers)}
    songs, prev = [], 0
    for r in remixes:
        song = [r["i"] - prev, r["t"], a_idx[r["a"]], c_idx[r["c"]]]
        if r["f"] != f'{r["a"]} - {r["t"]}.mp3':
            song.append(r["f"])
        songs.append(song)
        prev = r["i"]
    return {"arrangers": arrangers, "composers": composers, "songs": songs}


if len(sys.argv) > 1:
    remixes = json.loads(Path(sys.argv[1]).read_text())
else:
    remixes = scrape_remixes()
    (HERE / "remixes.json").write_text(json.dumps(remixes, ensure_ascii=False))   # reuse with: build.py remixes.json
page = (HERE / "template.html").read_text()
page = page.replace("__REMIXES__", json.dumps(compact(remixes), ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/"))
page = page.replace("__BUILT__", datetime.date.today().isoformat())
(HERE / "index.html").write_text(page)
print(f"index.html: {len(remixes)} remixes")
