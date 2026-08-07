# IMEN

Chrome extension for AI-assisted TOEIC practice.

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

## Architecture

See `docs/superpowers/specs/2026-08-07-imen-ext-design.md`.
The API key lives only in the service worker; no other context may talk to a
provider.
