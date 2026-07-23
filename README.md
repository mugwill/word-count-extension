# Auto Word Count for Google Docs

https://chromewebstore.google.com/detail/auto-word-count-for-googl/iolffodbgeomobafonhdhblonclindhj?authuser=0&hl=en

A tiny Chromium (Chrome / Edge / Brave) extension that **automatically turns on the
built-in Google Docs live word counter** on every document — so your word count is
always shown as you type, without opening **Tools → Word count** each time.

## Why

Google Docs already has a live word counter (**Tools → Word count → "Display word count
while typing"**), but there is **no global default**: the toggle is remembered per
document, so every new/blank doc starts with it hidden. This extension flips it on for
you, silently, on each doc.

## How it works

Since ~2021 the Google Docs document body is painted to a `<canvas>`, so the text isn't
in the DOM and can't be reliably scraped. The **menus and dialogs are still ordinary
DOM**, though — so this extension doesn't count anything itself. It just drives Google's
*own* native setting: when the editor loads, it checks whether the live word-count badge
is showing and, if not, opens **Tools → Word count**, ticks the checkbox, and closes the
dialog. Google does the counting.

- **No word counting of our own**, no network requests, **no data collected**.
- **Zero extra permissions** — a content script scoped to `docs.google.com/document/*`.
- Re-applies automatically when you switch between docs (Docs is a single-page app).

See [`PRIVACY.md`](PRIVACY.md) for the full privacy statement.

## Install (developer / load-unpacked)

1. Clone or download this repo.
2. Open `chrome://extensions` (or `edge://extensions`, `brave://extensions`).
3. Enable **Developer mode** (top-right).
4. Click **Load unpacked** and select this project folder.
5. Open any Google Doc — the word count badge should appear automatically (bottom-left).

## Project structure

```
manifest.json      # MV3 manifest, content script only, no permissions
src/content.js     # detection + native-toggle automation + SPA re-apply
icons/             # 16 / 48 / 128 px toolbar icons
PRIVACY.md         # privacy policy
```

## License

MIT — see [`LICENSE`](LICENSE).
