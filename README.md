# Instagram Better: Fullscreen Button Extension

A simple Chrome extension that adds a subtle fullscreen button (⛶) to Instagram web posts.

## What it does

- Adds an unobtrusive button to post/reel media on `instagram.com`.
- Opens the currently visible image or reel in an immersive fullscreen-style overlay.
- Works with carousel posts by opening whichever slide is currently visible; you can switch slides in Instagram and reopen fullscreen.
- Press `Esc` or click outside media to close.

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

Instagram changes DOM structure frequently. This extension is intentionally minimal and uses resilient selectors, but may need small updates over time.
