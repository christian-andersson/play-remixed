# play-remixed

A web player for the Commodore 64 remixes on [Remix64 / RKO (remix.kwed.org)](https://remix.kwed.org/),
built as a real C64 screen of 40 × 25 characters inside an old TV. It plays the remixes back to back,
like a radio, with playlists, favourites, shuffle and repeat. There is no server and nothing to install.

**▶ Play it here: https://christian-andersson.github.io/play-remixed/**, or run it locally with
`./serve.sh` (see [TESTING.md](TESTING.md)).

## Features

- **The whole catalogue:** all remixes on remix.kwed.org (5,255 when the list was last built).
- **A C64 screen:** everything is drawn with the C64 character set and its 16 colours on a 40 × 25 grid.
  Frames and buttons are made from characters, not HTML elements.
- **TV channels:** the TV's upper knob switches between four colour schemes: Colodore, Pepto, a green
  phosphor monitor and a black-and-white TV.
- **Fullscreen:** the TV's middle knob, or `Z`, switches between the window, fullscreen with the TV, and
  fullscreen with only the C64 screen. Esc leaves fullscreen. On an iPhone, where pages cannot go
  fullscreen, it switches between the TV and the C64 screen alone.
- **TV power:** the lower knob switches the TV off and on, with a CRT-style switch-off. The sound is muted
  while it is off, but the music keeps playing, so switching on again resumes mid-tune.
- **Browse and search** by title, remixer or composer, for example `Hubbard`, `Galway` or `Commando`.
- **Sort** Browse and Favourites by clicking the column headers in the divider line: `TITLE`, `REMIXER`
  or `#` (release order). Clicking the active header again flips the direction, shown as `U` (up: A–Z,
  oldest first) or `D` (down), because the C64 character set has no down arrow.
- **Playlists:** create, rename, delete, reorder and play them. **+ LIST** adds any tune to one or more
  lists without playing it.
- **Favourites:** ♥ on any tune or on the one playing.
- **Player controls:** previous, play/pause, next, seek, volume, shuffle, and repeat (off, all or one).
  The keyboard's media keys work too.
- **Recently played:** the last 30 tunes.
- **Backup:** export favourites and playlists to a JSON file, and import them on another browser or
  computer.
- **Counts plays:** each played tune is counted once on the site's download counter, so the remixers'
  numbers stay accurate.

## Usage

Serve the folder from any static web host, such as GitHub Pages, and open `index.html`. It needs the
`css/`, `js/`, `data/` and `fonts/` folders next to it. Opening `index.html` straight from disk does not work, because
browsers block it from loading `data/remixes.json`. For local testing, run `./serve.sh`; see
[TESTING.md](TESTING.md).

**Mouse:** click buttons and ♥. Double-click a tune to play it. Scroll the list with the wheel or
trackpad, or drag the scrollbar on the right; clicking the scrollbar's track jumps there. Click or scroll
on the TV's upper knob to change channel (colour scheme), click the middle knob for fullscreen, and
click the lower knob to switch the TV off or on.

| Key | Action |
|---|---|
| ↑ ↓, PgUp PgDn, Home End | Select |
| Return | Play the selected tune, or open the selected list |
| Space | Play / pause |
| ← → | Previous / next tune |
| `/` | Search (Return or Esc ends it) |
| `F` | Favourite the selected tune |
| `L` | Add the selected tune to a list |
| `S` / `R` | Shuffle / repeat |
| `Z` | Fullscreen with the TV, fullscreen with only the C64 screen, back to the window |
| `+` / `-` | Volume |
| `1`–`4`, Tab | Switch tabs |
| `N` | New list (in the Lists tab) |
| Del | Remove the tune from the list, or delete the list |
| Shift + ↑ ↓ | Move a tune within a list |
| Esc | Back / close |
| `?` | Help |

The TV appears when the window is large enough for the screen inside it to use characters of at least
12 px. The TV is then sized to fit snugly around the screen. On smaller windows and phones, the screen
fills the window with the C64 border around it.

Favourites, playlists and settings are stored in the browser's `localStorage`. They belong to that
browser only and are lost if you clear its site data, so use **LISTS → EXPORT** to keep a backup.

## How it works

### The song list

The song list, `data/remixes.json`, is built when the site is published, from a private export that
the remix.kwed.org owner provides: a tab-separated file with the remix ID, title, remixer, composer
and download link of each remix. The full list is not kept in the repository; the repository's
`data/remixes.json` is a sample of 44 remixes for local testing.

1. Once a day, and on every push to `main`, the publishing workflow downloads the export with the
   private link and login, which are stored as Actions secrets.
2. `build.py --feed` decodes HTML entities, trims stray spaces, takes the MP3 file name from the
   download link, and writes the list in a compact form of about 280 KB. The compact form stores each
   remixer and composer name once, and leaves out file names that follow `Remixer - Title.mp3`.
3. Before publishing, the workflow compares the new list with the live one. It refuses to publish if
   the list is the sample, nearly empty, or more than 10% shorter than the live list, so a broken or
   truncated export never replaces a good list. A failed run keeps the previous version online.

The page loads that file at start-up, while showing a C64 power-on screen, and asks the server for a
fresh copy each time, so a rebuilt list shows up on the next visit. The page and its code together are
about 60 KB.

### Playback

When the page runs, the browser's built-in audio player streams each MP3 from remix.kwed.org; nothing
goes through a proxy. It plays each tune from the site's download link, `download.php/<id>/<file>`,
which adds one to the tune's download count and redirects to the MP3. So each tune counts as one
download, just like downloading it from the site, and replaying it from the browser's memory does not
count again.

The next tune starts loading 30 seconds before the current one ends, so tunes change without a gap.
It does not load earlier, because loading counts as a download, and a tune that is loaded early is
more likely to be skipped.

### Statistics

The page uses [GoatCounter](https://www.goatcounter.com/) to count visits, and counts tunes played as
one event named `play`: the total number of plays, not which tunes. Each play is counted, also repeated
plays by the same visitor. GoatCounter sets no cookies and stores no personal data; it records the page,
the referrer, and the browser, screen width and country. The counting script, `js/goatcounter.js`, is
GoatCounter's `count.js` kept in this repository, so the page loads no code from other sites. If the
counter is blocked, for example by an ad blocker, nothing is counted and the player works the same. GoatCounter does not count visits from
`localhost` or local network addresses.

### The screen

The interface is a 40 × 25 buffer of C64 screen codes (0–255, where 128 and up are inverse) and colours,
drawn like the real machine:

1. **The character set:** at start-up the page draws each of the 256 characters of C64 Pro Mono once.
   That font places screen code *n* at U+EE00 + *n*. The page then reads back each character's 8 × 8
   pixel pattern, which gives an exact copy of the C64 character ROM.
2. **Each frame:** the page draws the buffer into a 320 × 200 pixel image, which is the C64's
   resolution, using those bitmaps and the colour of each cell. Only changed cells are redrawn.
3. **On screen:** a `<canvas>` enlarges the image with `image-rendering: pixelated`. Each C64 pixel
   always covers a whole number of device pixels (1×, 2×, 3×…), and the canvas corner sits on a whole
   device pixel, so every character is pixel-perfect. The screen therefore grows in steps: 8, 16 and
   24 px characters on a normal screen, and 8, 12, 16 and 20 px on a Retina screen.

Drawing pixels instead of laying out text avoids the rounding seams that browsers leave between
characters. Clicks are mapped to the character cell under the pointer.

### Colours

The 16 C64 colours are CSS variables on `body`, `--c0` to `--c15`. Each colour scheme is one
`body[data-scheme="…"]` block. The page border and screen use those variables, and the pixel renderer
reads its palette from them whenever the scheme changes. To add a scheme, add a CSS block and its id to
`SCHEMES` in the script. The green and black-and-white schemes are derived from the brightness of each
Colodore colour, so the screen reads the same in every scheme.

### Scrolling

Trackpads send many small scroll events plus momentum, so scrolling is measured in distance: the list
moves one row per 33 px. The channel knob turns one step per gesture, once 60 px of scrolling has built
up in one direction, and ignores the rest of that gesture.

Scrolling moves the view, not the selection, as in Finder. The selected tune can scroll out of sight;
the arrow keys, PgUp/PgDn, Home and End move the selection and bring it back into view.

The scrollbar thumb always sits on whole character cells. Each thumb position stands for exactly one
list position, so dragging moves one cell at a time, and the thumb lands in the cell it was dragged to.

Typing goes through a hidden input field, so the phone keyboard also works.

### Limits

- **No visualiser or equalizer:** remix.kwed.org does not allow other sites to read its audio data,
  which the Web Audio API needs to analyse or filter sound. Chrome and Firefox play it as silence.
- **Character set only:** the C64 has no accented letters, so accents are removed (Bachliński shows as
  BACHLINSKI). It also has no ↓ or → characters.
- **Phones:** 40 columns on a phone screen come out at about 9–10 px per character.
- **Locked phone screens:** a tune that is playing keeps playing when the screen locks, and the lock
  screen controls work, but the browser may stop after a tune or two because phones restrict web pages
  in the background. On Android, setting the browser's battery use to **Unrestricted** (Settings → Apps →
  Chrome → Battery) may help. The player already starts each next tune before the current one ends, so
  the sound never stops between tunes.
- **The list is a snapshot:** new remixes appear only after the list is rebuilt from the export.

## Updating the song list

The published list updates itself daily. It needs three repository secrets (Settings → Secrets and
variables → Actions): `RKO_FEED_URL` (the private link), `RKO_FEED_USER` and `RKO_FEED_PASSWORD`. Until
they are set, the workflow republishes the list that is already live, which was built from the site's
public listing pages before the export existed. To update right away, run the workflow from the
Actions tab (Deploy to GitHub Pages → Run workflow).

GitHub pauses scheduled workflows in public repositories after 60 days without activity in the
repository. The site stays online, but the daily update stops until it is switched on again in the
Actions tab.

To build a list by hand (Python 3, no extra packages):

```sh
python3 build.py --feed export.csv.gz --out /tmp/remixes.json
```

The export link, its login and full exports must never be committed. Keep `data/remixes.json` in the
repository as the small sample.

### The code

The scripts are plain JavaScript with no build step. They share one scope and load in order with
`defer`: `screen.js`, `player.js`, `ui.js`, then `main.js`, which starts everything. Only `main.js`
runs code straight away; the others define functions and event handlers.

`index.html` links them as `css/style.css?v=dev` and `js/….js?v=dev`. When GitHub Pages publishes the
site, the workflow replaces `dev` with the commit id. Browsers cache these files for a while, so the new
id makes them load the new versions together with the new page.

The workflow's actions are pinned by [`actions.lock`](.github/workflows/actions.lock), a
[GitHub Actions workflow lockfile](https://docs.github.com/actions/concepts/security/workflow-dependency-lockfiles)
that GitHub enforces when a job starts. The workflow refers to actions by version tag, and the lockfile
holds the exact commit for each, including actions that other actions use internally. Its first job runs
`gh actions-lock --verify`, so the site is only published if the lockfile is complete and every locked
commit still matches its tag and repository. After adding, removing or changing an action, update the
lockfile:

```sh
gh extension install github/gh-actions-lock   # once
gh actions-lock                               # update .github/workflows/actions.lock
gh actions-lock --verify                      # check it, as the workflow does
```

## Files

| File | Purpose |
|---|---|
| `index.html` | The page: markup and the TV drawing (SVG, inline so its knobs can be scripted) |
| `css/style.css` | Colour schemes, layout, the TV and the CRT power effect |
| `js/screen.js` | The 40 × 25 screen: character set, pixel drawing, sizing the screen and the TV |
| `js/player.js` | Remix index, settings, favourites and playlists, play queue, playback, TV knobs, export/import |
| `js/ui.js` | Views, dialogs, drawing, mouse, touch and keyboard |
| `js/main.js` | Start-up |
| `js/goatcounter.js` | GoatCounter's counting script, unchanged (ISC licence, see below) |
| `.github/workflows/pages.yml` | Publishes the site to GitHub Pages on every push to `main` |
| `.github/workflows/goatcounter.yml` | Fails once a week if GoatCounter has changed `count.js`, so the copy can be updated |
| `.github/workflows/actions.lock` | Pins every action the workflow uses, including transitive ones, to an exact commit |
| `data/remixes.json` | A 44-remix sample of the index for local testing; the full list is built when publishing |
| `build.py` | Reads the remix export and writes the index |
| `favicon.svg` | The Commodore logo, used as the browser tab icon (CC BY-SA 4.0, see below) |
| `serve.sh` | Starts a local web server and opens the player |
| `TESTING.md` | How to test locally |
| `fonts/` | The C64 Pro Mono font by Style, with its licence (see below) |

## License

The code is released under the [MIT License](LICENSE). The licence does not cover the music, the song
titles or other catalogue data; those belong to their creators and to Remix64 / RKO.

The MIT licence does not cover the font either. `fonts/C64_Pro_Mono-STYLE.woff2` and `.woff` are
**C64 Pro Mono © 2010–2019 [Style](https://style64.org/c64-truetype)**. They are included unmodified and
under their original file names, and loaded with `@font-face`, as
[their licence](https://style64.org/c64-truetype/license) (`fonts/license.txt`) allows. Do not rename or
modify them, and get your own copy from style64.org instead of downloading it from this repository.

`favicon.svg` is not covered by the MIT licence either. It is the
[Commodore C= logo by Alien426](https://commons.wikimedia.org/wiki/File:Commodore_C%3D_logo.svg), licensed
[CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). It was changed to work as a favicon: a
square `viewBox` so it scales, and white instead of navy in dark mode. The changed file is shared under
the same licence. The Commodore logo is a trademark of its owner.

`js/goatcounter.js` is GoatCounter's [`count.js`](https://www.goatcounter.com/help/countjs-host),
released under the [ISC licence](https://opensource.org/licenses/ISC) as its first lines state. It is
included unchanged; to update it, replace it with the current `https://gc.zgo.at/count.js`. A weekly
workflow fails when the two differ, and shows the changes in its summary.

## Credits

- **Music:** belongs to the remixers and original composers. It is hosted and curated by
  [Remix64 / RKO](https://remix.kwed.org/), and this player only links to it. If you enjoy the music,
  visit the site to rate and review the remixes, or support it.
- **Font:** [C64 Pro Mono](https://style64.org/c64-truetype) by Style.
- **TV:** redrawn as SVG after "Old TV Vector" from [Shmector.com](https://shmector.com/), released under
  CC0 1.0.
- **Colours:** the Colodore palette by Philip "Pepto" Timmermann.
- **Tab icon:** the Commodore C= logo by Alien426 on Wikimedia Commons, CC BY-SA 4.0.
