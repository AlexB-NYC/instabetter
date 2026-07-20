# Instagram Better: Fullscreen Button Extension

A simple Chrome extension that adds a subtle fullscreen button (⛶) to Instagram web posts.

## What it does

- Adds an unobtrusive keyboard-focusable button to visible post/reel media on `instagram.com`.
- Opens the currently visible image or reel in an immersive fullscreen-style overlay.
- Works with carousel posts by opening whichever slide is currently visible; you can switch slides in Instagram and reopen fullscreen.
- Press `Esc`, click the backdrop, or click empty overlay space outside the media to close. Focus returns to the opener when possible.

## Install (Developer mode)

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select this folder.

## Automated build artifacts

Pull requests targeting `main` validate the Manifest V3 file, referenced content-script files, JavaScript syntax, and the packaged ZIP contents.

Every push to `main` also publishes `instabetter-<commit>.zip` in the workflow run's **Artifacts** section. The ZIP contains the unpacked extension files at its root and is retained for 30 days. These build artifacts are not GitHub Releases.

To install an artifact, download and extract the ZIP, then select the extracted folder with **Load unpacked** in `chrome://extensions`.

## Notes

Instagram changes DOM structure frequently. This extension is intentionally minimal, avoids generated class names, and uses visible media within the nearest post or dialog, but may need small updates over time.

## Diagnostics

Console diagnostics use the `[IGFS]` prefix and default to concise `info` output. Detailed debug logging is local browser-console output only and sends no data anywhere.

- Enable debug logging: `sessionStorage.setItem('igfs:log-level', 'debug'); location.reload();`
- Restore default info logging: `sessionStorage.removeItem('igfs:log-level'); location.reload();`
- Disable non-error diagnostics: `sessionStorage.setItem('igfs:log-level', 'off'); location.reload();`
- Request a side-effect-free diagnostic snapshot: `document.dispatchEvent(new Event('igfs:diagnose'));`

Diagnostic tables include `username`, `media`, `selected`, `carousel`, and `slides` fields. `username` is the normalized account path detected from a profile link, or `unknown` when a safe semantic source is unavailable. `media` describes the post-sized media found in the card (`image`, `video`, `mixed`, or `unknown`), while `selected` describes the active media chosen for the current scan or fullscreen request. `carousel` reports whether a reliable logical slide list was found, and `slides` is the logical slide count when known.

Diagnostics intentionally never log captions, complete profile hrefs, media source URLs, blob UUIDs, signed CDN URLs, or query strings.
