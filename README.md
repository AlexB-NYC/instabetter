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

## Notes

Instagram changes DOM structure frequently. This extension is intentionally minimal and uses resilient selectors, but may need small updates over time.
