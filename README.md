# Instagram Better: Fullscreen Button Extension

A simple Chrome extension that adds subtle fullscreen (⛶) and download (↓) buttons to Instagram web posts.

## What it does

- Adds unobtrusive keyboard-focusable fullscreen and download buttons to visible post/reel media on `instagram.com`.
- Opens the currently visible image or reel in an immersive fullscreen-style overlay.
- Works with carousel posts by preserving slide order for fullscreen navigation and indexed media downloads.
- Press `Esc`, click the backdrop, or click empty overlay space outside the media to close. Focus returns to the opener when possible.

## Install (Developer mode)

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Run `npm run build`.
4. Click **Load unpacked**.
5. Select the generated `dist/` folder, which directly contains the built `manifest.json`. Do not select the repository root unless you are intentionally loading source files during development.

## Build and validation

- Build the unpacked extension: `npm run build`
- Validate the built manifest and referenced files: `npm run validate:extension`
- Run JavaScript syntax and helper checks: `npm run validate && npm test`

The production unpacked extension directory is `dist/`. Its Manifest V3 background service worker is emitted as `dist/background.js` and referenced from `dist/manifest.json` as `background.service_worker`.

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
