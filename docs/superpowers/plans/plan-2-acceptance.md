# Plan 2 — manual acceptance run

**Status:** NOT RUN. Every item needs a real Chrome profile, real practice
sites and a real provider key, so none of it can be recorded from the
implementation session. Automated coverage (`npm test`: 37 files, 207 tests),
`npx tsc -b` and `npm run build` are green; this checklist is what remains.

Fill in each line with PASS/FAIL plus a note after running it.

Chrome version: _______  ·  Provider / model used: _______  ·  Date: _______

| # | Check | Result |
|---|---|---|
| 1 | Select a two-question block on a real TOEIC site → the floating button appears just below the **end** of the selection, not at the start. | |
| 2 | Scroll → the button disappears. Press Esc → disappears. Click elsewhere → disappears. | |
| 3 | Select a 5-character fragment → no button (below `minSelectionChars`). | |
| 4 | Click the button → the panel opens directly (spike PASS) **or** the toast appears with a red dot on the icon (spike FAIL). Either way, opening the panel shows Review with the captured questions. | |
| 5 | Select a Part 1 question whose photo sits **above** the text → the photo reaches the model. Confirm by asking something only the image answers. | |
| 6 | Select on a site rendering questions into a `<canvas>` → the screenshot fallback produces a usable image. | |
| 7 | Paste tab → "Chụp vùng", drag a box → region attached; drag a 3-pixel box → nothing attached; Esc mid-drag → nothing attached. | |
| 8 | Repeat 7 on HiDPI or at 150% zoom → the crop matches the region drawn, not an offset or half-size slice. **devicePixelRatio check; do not wave through.** | |
| 9 | Open `chrome://extensions` → no floating button, no console errors. | |
| 10 | Open a `.pdf` URL → no floating button; Paste + snip still work. | |
| 11 | Select 25 questions → the `TOO_MANY` message appears in Vietnamese, nothing charged beyond the parse call. | |
| 12 | DevTools on the page → **no image fetch originated from the page context.** All image traffic belongs to the service worker. | |

Items 8 and 12 must not be waved through.

## Note on item 4 — the spike is still unresolved

`spike-sidepanel-result.md` records the browser verdict as *pending*: nobody
has yet confirmed whether `chrome.sidePanel.open()` succeeds when called from
the worker in response to an in-page click. The code takes both paths without
needing to know: `openPanelFor` returns false instead of throwing, the capture
is stored either way, and the content script shows the toast whenever
`panelOpened` comes back false. Record which branch actually fired here, and
update the spike file while you are at it.
