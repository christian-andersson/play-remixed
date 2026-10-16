# play-remixed

A single-file web player for the Commodore 64 remixes on
[Remix64 / RKO (remix.kwed.org)](https://remix.kwed.org/). It plays the remixes back to back, like a radio,
with playlists, favourites, shuffle and repeat. There is no server and nothing to install: download
`index.html` and open it in a browser.

## Features

- **The whole catalogue:** all remixes on remix.kwed.org (5,255 when the list was last built).
- **Browse and search** by title, remixer or composer, for example `Hubbard`, `Galway` or `Commando`.
- **Playlists:** create, rename, delete, reorder and play them. The **+** button on any track adds it to
  one or more playlists without playing it.
- **Favourites:** the ♡ button on any track or on the one playing.
- **Player controls:** previous, play/pause, next, seek, volume, shuffle, and repeat (off, all or one).
  The keyboard's media keys work too.
- **Recently played:** the last 30 tracks.
- **Backup:** export favourites and playlists to a JSON file, and import them on another browser or
  computer.
- **Counts plays:** each played track is counted once on the site's download counter, so the remixers'
  numbers stay accurate.

## Usage

Open `index.html` in a browser, either as a local file or from any static web host.

Favourites, playlists and settings are stored in the browser's `localStorage`. They belong to that
browser only and are lost if you clear its site data, so use **Playlists → Export library** to keep a
backup.

## How it works

remix.kwed.org has no API, so the song list is collected ahead of time and built into the page.

1. `build.py` reads the site's normal listing pages (`?view=date&page=N`) one by one, waiting 0.4 s
   between each.
2. From each listing it takes the remix ID, title, remixer, composer and MP3 file name.
3. It stores the list in a compact form, inserts it into `template.html`, and writes the result to
   `index.html`. The compact form stores each remixer and composer name once, and leaves out file names
   that follow `Remixer - Title.mp3`. The page is about 300 KB.

When the page runs, the browser's built-in audio player streams each MP3 straight from
`https://remix.kwed.org/files/RKOfiles/…`; nothing goes through a proxy. The next track starts loading
early so tracks change quickly.

The site's `download.php/<id>` link redirects to the same file and also adds one to the download count.
When a track starts playing, the page sends one request to that link without following the redirect.
This counts the play once without downloading the MP3 a second time.

### Limits

- **No visualiser or equalizer:** remix.kwed.org does not allow other sites to read its audio data,
  which the Web Audio API needs to analyse or filter sound. Chrome and Firefox play it as silence.
- **The list is a snapshot:** new remixes appear only after you rebuild.

## Updating the song list

Requires Python 3 and no extra packages.

```sh
python3 build.py                  # read remix.kwed.org again (about 106 pages) and rebuild index.html
python3 build.py remixes.json     # rebuild from a saved list instead
```

Edit `template.html`, not `index.html`, which `build.py` overwrites.

## Files

| File | Purpose |
|---|---|
| `index.html` | The player, ready to open |
| `template.html` | Source of the page, with placeholders for the song list and build date |
| `build.py` | Reads the catalogue and builds `index.html` |

## License

The code is released under the [MIT License](LICENSE). The licence does not cover the music, the song
titles or other catalogue data; those belong to their creators and to Remix64 / RKO.

## Credits

The music belongs to the remixers and original composers. It is hosted and curated by
[Remix64 / RKO](https://remix.kwed.org/), and this player only links to it. If you enjoy the music,
visit the site to rate and review the remixes, or support it.
