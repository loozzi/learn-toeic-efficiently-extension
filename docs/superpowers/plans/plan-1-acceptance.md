# Plan 1 — manual acceptance run

**Status:** NOT RUN. Every item below needs a real Chrome profile and a real
provider API key, so none of it can be recorded from the implementation
session. Automated coverage (`npm test`: 19 files, 89 tests) and `npm run
build` are green; this checklist is the part that is still outstanding.

Fill in each line with PASS/FAIL plus a note after running it.

Chrome version: _______  ·  Provider / model used: _______  ·  Date: _______

| # | Check | Result |
|---|---|---|
| 1 | Click the extension icon with no API key set → the side panel shows onboarding, and its button opens the options page. | |
| 2 | In Settings, save a real provider config → the unencrypted-key warning is visible; "Test connection" reports success. | |
| 3 | Enter a deliberately wrong API key → "Test connection" reports the auth error in Vietnamese, not a raw code. | |
| 4 | Paste the block below into the Paste tab and press Parse → two questions appear in Review, and **no correct answer is visible anywhere on screen**. | |
| 5 | Tick a deliberately wrong answer on 101, leave 102 untouched, press Analyze → Result shows 101 as wrong with an explanation, and 102 marked against "not attempted". | |
| 6 | On the wrong card, press "Analyze my mistake", pick two reasons, add a note, submit → text streams in, then splits into diagnosis and fix advice. | |
| 7 | DevTools → Application → IndexedDB → `imen`: `sessions`, `questions`, `analyses`, `attempts` and `errorAnalyses` all hold rows, and `attempts` has `isRetry: false`. | |
| 8 | Every string seen on screen was Vietnamese. | |
| 9 | DevTools on the side panel → **no request went directly to the provider**. All provider traffic belongs to the service worker. | |

Item 9 must not be waved through — it is the plan's central invariant.

Fixture for item 4:

```
101. The manager ___ the quarterly report before Friday.
(A) submit  (B) submits  (C) submitted  (D) submitting

102. Please ___ our customer service team if you have questions.
(A) contact  (B) contacted  (C) contacting  (D) contacts
```

## Known snag for the run — resolved

The Task 1 spike button used to be injected into every page by
`src/content/index.ts`. Plan 2 replaced that file with the real selection
capture, so it is gone; ignore it if you see it in an older build of `dist/`.
