"""Builds data/remixes.json, the remix index the player loads, from the remix.kwed.org catalogue.

Usage:
  python3 build.py --feed FILE_OR_URL [--out FILE]   read the remix feed (tab-separated, optionally .gz)
                                                      and write the index (default: data/remixes.json)

The feed is a private export from remix.kwed.org. For a feed URL, the basic-auth username and
password come from the RKO_FEED_USER and RKO_FEED_PASSWORD environment variables, never from the
command line or the code, and only HTTPS URLs are accepted.
"""
import argparse, base64, datetime, gzip, html, json, os, re, sys, urllib.parse, urllib.request
from pathlib import Path

HERE = Path(__file__).parent
UA = {"User-Agent": "personal-c64-radio-builder"}
FEED_URL = re.compile(r"https://remix\.kwed\.org/download\.php/(\d+)/(.+)$")


def read_feed(source):
    """Reads the remix feed: one remix per line, tab-separated, without a header:
    id, title, remixer, composer, download URL (https://remix.kwed.org/download.php/<id>/<file name>).
    Text fields may contain HTML entities and stray spaces."""
    if re.match(r"https?://", source):
        if not source.startswith("https://"):
            sys.exit("build.py: the feed URL must use https, so the password is not sent in clear text")
        user, password = os.environ.get("RKO_FEED_USER"), os.environ.get("RKO_FEED_PASSWORD")
        if not user or not password:
            sys.exit("build.py: set RKO_FEED_USER and RKO_FEED_PASSWORD to read the feed")
        auth = base64.b64encode(f"{user}:{password}".encode()).decode()
        req = urllib.request.Request(source, headers={**UA, "Authorization": "Basic " + auth})
        try:
            data = urllib.request.urlopen(req, timeout=60).read()
        except (OSError, ValueError) as e:      # report the error without the private URL
            sys.exit(f"build.py: could not download the feed: {getattr(e, 'code', '')} {getattr(e, 'reason', type(e).__name__)}")
    else:
        data = Path(source).read_bytes()
    if data[:2] == b"\x1f\x8b":                       # gzip, whatever the name says
        data = gzip.decompress(data)
    remixes, skipped = {}, 0
    for n, line in enumerate(data.decode("utf-8").splitlines(), 1):
        if not line.strip():
            continue
        fields = line.split("\t")
        m = FEED_URL.match(fields[4].strip()) if len(fields) == 5 else None
        if not m or m.group(1) != fields[0].strip():
            skipped += 1
            print(f"feed line {n}: skipped, not id/title/remixer/composer/url", file=sys.stderr)
            continue
        rid = int(m.group(1))
        t, a, c = (html.unescape(f).strip() for f in fields[1:4])
        remixes[rid] = {"i": rid, "t": t, "a": a, "c": c, "f": urllib.parse.unquote(m.group(2))}
    if not remixes:
        sys.exit("build.py: the feed had no usable lines")
    if skipped:
        print(f"feed: {skipped} lines skipped", file=sys.stderr)
    return sorted(remixes.values(), key=lambda r: r["i"])


def compact(remixes):
    """Shrinks the list for the player; unpacked by unpackIndex() in index.html.

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
    return {"built": datetime.date.today().isoformat(), "count": len(songs),
            "arrangers": arrangers, "composers": composers, "songs": songs}


args = argparse.ArgumentParser(description=__doc__.splitlines()[0])
args.add_argument("--feed", metavar="FILE_OR_URL", required=True, help="the remix feed: a local file or an HTTPS URL")
args.add_argument("--out", default=str(HERE / "data" / "remixes.json"), help="where to write the index")
args = args.parse_args()
remixes = read_feed(args.feed)
out = Path(args.out)
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(json.dumps(compact(remixes), ensure_ascii=False, separators=(",", ":")) + "\n")
print(f"{out}: {len(remixes)} remixes, {out.stat().st_size // 1024} KB")
