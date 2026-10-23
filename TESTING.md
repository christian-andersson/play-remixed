# Testing locally

The player loads its remix index, `data/remixes.json`, with `fetch()`. Locally that is a sample of
44 remixes; the full list is only built when the site is published. Browsers block that for pages
opened straight from disk (`file://…`), so double-clicking `index.html` shows a C64 boot screen ending
in `?FILE NOT FOUND ERROR`. To test locally, serve the folder over HTTP.

## Quick start

```sh
./serve.sh
```

This starts a web server on http://localhost:8000/ and opens the player in your default browser.
Press **Ctrl+C** to stop it.

| Option | Effect |
|---|---|
| `./serve.sh 8080` | Use another port |
| `./serve.sh --lan` | Also accept connections from other devices on your network (see below) |
| `./serve.sh --no-open` | Do not open a browser |
| `./serve.sh --help` | Show the options |

`serve.sh` uses the first web server it finds: Python 3, Python, PHP, Ruby, BusyBox, or Node's
`npx http-server`. The Node option may download the `http-server` package the first time. macOS and most
Linux systems already have Python 3.

## Without the script

Any static web server works. Run it from the repository root:

```sh
python3 -m http.server 8000          # Python 3
php -S localhost:8000                # PHP
npx http-server -p 8000 -c-1         # Node
```

Then open http://localhost:8000/.

## On a phone or tablet

1. Run `./serve.sh --lan`. It prints an address such as `http://192.168.1.23:8000/`.
2. Open that address on a device on the same Wi-Fi network.
3. If the device cannot connect, allow incoming connections for Python, or whichever server is used,
   in your computer's firewall.

On small screens the TV is hidden and the C64 screen fills the window.

## After changing things

- **`index.html`, `css/` or `js/`:** reload the page. If an old version shows, do a hard reload
  (Cmd+Shift+R on macOS, Ctrl+Shift+R elsewhere).
- **The remix index:** locally it is the 44-remix sample. To try the player with a full list, build
  one into `data/remixes.json` from an export, but do not commit it:
  ```sh
  python3 build.py --feed export.csv.gz
  git checkout data/remixes.json        # put the sample back afterwards
  ```

## Starting from a clean state

Favourites, playlists and settings are kept in the browser's `localStorage`, per address:
`localhost:8000` and `localhost:8080` have separate data. To reset:

- **DevTools:** Application → Storage → Local storage → `http://localhost:8000` → delete the `library`
  and `settings` keys.
- **Console:** `localStorage.clear()`, then reload.

Use **LISTS → EXPORT** first if you want to keep anything.

## Things to check by hand

- [ ] The boot screen shows briefly, then the player appears.
- [ ] A tune plays (press Space or Return), and the next one starts when it ends.
- [ ] Search with `/`, favourite with `F`, add to a list with `L`, open the help with `?`.
- [ ] Lists: create, rename, reorder (Shift+↑↓), delete.
- [ ] Export, then import the file on a clean browser.
- [ ] The TV shows on a large window and disappears on a small one; text stays sharp.
- [ ] The middle knob (or `Z`): fullscreen with the TV, then only the C64 screen, then back to the
      window. Esc in fullscreen goes back to the window, and the knob turns back too.
- [ ] On a phone: tapping works, and the keyboard opens for search.

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| `?FILE NOT FOUND ERROR` with `FAILED TO FETCH` | The page was opened as a file. Use `./serve.sh`. |
| `?FILE NOT FOUND ERROR` with `HTTP 404` | `data/remixes.json` is missing, or the server runs in another folder. Restore it with `git checkout data/remixes.json`, and start the server from the repository root. |
| `Address already in use` | Another program uses the port. Try `./serve.sh 8080`. |
| Tunes do not play | The MP3s stream from remix.kwed.org, so check your internet connection. Browsers also block sound until you click or press a key once. |
| Text looks blurry | Browser zoom is not at 100 %, or the window is very small. |
