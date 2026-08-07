# IMEN

Chrome extension for AI-assisted TOEIC practice.

> Vietnamese version: [README.vi.md](README.vi.md)

## Installation

Chrome 116 or newer is required (the sidePanel API).

1. Go to the [Releases](https://github.com/loozzi/learn-toeic-efficiently-extension/releases)
   page and download the `.zip` asset from the latest release.
2. Unzip the downloaded file into its own folder (e.g. `imen-ext`).
3. Open `chrome://extensions` in Chrome.
4. Enable **Developer mode** using the toggle in the top-right corner.
5. Click **Load unpacked** and select the folder you unzipped in step 2.
6. IMEN should now appear in your extensions list and toolbar.

To update, download the new release, unzip it over the old folder (or a new
one), then click the refresh icon on the IMEN card in `chrome://extensions`.

## Features

**Shipped**

- **Selection capture** — select a block of TOEIC questions on any practice
  site and a floating button appears; clicking it opens the side panel with
  the text already captured.
- **Image capture** — screenshots/crops images near the selection (DOM scan →
  `captureVisibleTab` fallback), plus a manual drag-select "Snip region" tool
  for canvas-rendered or PDF-based practice sites.
- **Manual paste flow** — a "Paste" tab in the side panel for pasting text or
  clipboard images directly, for sites the content script can't run on.
- **Three-step AI pipeline** — parse questions → analyze and grade the
  answers you picked → on-demand error-psychology diagnosis for wrong
  answers, with streaming output and token-usage tracking.
- **OpenAI- and Gemini-compatible providers**, including custom Base URLs
  (OpenRouter, Groq, local LM Studio, ...), with a "Test connection" check.
- **History & Stats dashboard** — a filterable, searchable question history
  with free retries, accuracy by TOEIC part/topic/error reason, and an
  AI-generated weakness summary.
- **JSON export/import** of question history (additive import, API key never
  included).
- **Vietnamese UI** with a light/dark theme toggle; explanation language is
  configurable (Vietnamese / English / bilingual).

**In progress / not yet built**

- Manual, real-browser acceptance passes for the flows above are still
  outstanding — automated tests and the build are green, but the checklists
  in `docs/superpowers/plans/plan-*-acceptance.md` haven't all been run and
  recorded yet.
- Explicitly out of scope for now: spaced repetition (SRS), cloud sync /
  multi-device, Parts 1–4 listening audio, auto-detecting the answer you
  clicked on the page itself, user accounts, and Firefox support.

## Development

    npm install
    npm test          # Vitest
    npm run build     # outputs dist/

Load `dist/` via chrome://extensions → Developer mode → Load unpacked.
Chrome 116 or newer is required (the sidePanel API).

## Configuration

Open the extension's options page and set provider, API key and model.
Leave Base URL empty for the provider default; set it to point at
OpenRouter, Groq or a local LM Studio server.

The API key is stored unencrypted in chrome.storage.local. Anyone with
access to your Chrome profile can read it.

## Dashboard

The options page has three tabs: History, Stats and Settings.

Statistics count first attempts only by default, so redoing a question you
already know the answer to does not inflate your accuracy. Toggle "Include
retries" to see both.

Export produces a JSON backup of your question history. It never contains
your API key. Import is additive — re-importing the same file changes
nothing.

## Architecture

See `docs/superpowers/specs/2026-08-07-imen-ext-design.md`.
The API key lives only in the service worker; no other context may talk to a
provider.
