# Plan 3 — manual acceptance run

**Status:** NOT RUN. Every item needs a real Chrome profile, a real provider
API key, and a history built up by actually answering questions, so none of it
can be recorded from the implementation session. Automated coverage (`npm
test`: 28 files, 147 tests), `npx tsc -b` and `npm run build` are green; this
checklist is what is still outstanding.

Fill in each line with PASS/FAIL plus a note after running it.

Chrome version: _______  ·  Provider / model used: _______  ·  Date: _______

| # | Check | Result |
|---|---|---|
| 1 | With an empty database, open the dashboard → History says "no questions yet", Stats says "not enough data". Neither crashes. | |
| 2 | Analyse ~10 questions, getting some deliberately wrong → History lists all of them, newest first. | |
| 3 | Filter to wrong answers → only the wrong ones remain. Combine with a part filter → the intersection, not the union. | |
| 4 | Search a word that appears in a choice, not the stem → the question is found. | |
| 5 | Open a question captured with an image → the image renders from IndexedDB, not a broken icon. | |
| 6 | Click "Làm lại câu này" → **the correct answer is not visible on screen.** Answer correctly → the "you fixed it" message appears. | |
| 7 | Stats: accuracy did **not** improve after that retry. Tick "Include retries" → it changes. **Anti-inflation rule; do not wave through.** | |
| 8 | "Most-missed topics" names real grammar points, not one-off phrasings. Drifting `topic` strings are a prompt problem in `analyze.ts` worth reporting. | |
| 9 | Click "AI tổng kết điểm yếu" → text streams in and names topics that actually appear in the table above it. | |
| 10 | DevTools: the weakness summary request **contains counts only, no question text.** | |
| 11 | Export without images → open the JSON and search for your API key. **It must not be there.** | |
| 12 | Export with images → the file is much larger and re-imports cleanly. | |
| 13 | Import the same file twice → the second import reports everything skipped and the History count does not double. | |
| 14 | Wipe all history → History empties, but Settings still holds the API key. | |

Items 7, 10 and 11 must not be waved through.

## Notes for the run

- **Item 5 needs Plan 2.** Nothing writes to the `images` store yet — image
  capture is Plan 2's job — so `imageIds` is always empty and no image can
  render. Treat item 5 as blocked, not failed, until Plan 2 ships.
- **Item 6, what "not visible" covers.** The retry hides the correct-answer
  line and the bolding of the correct choice, but the plan deliberately keeps
  the explanation text visible so it can be reread. Most explanations name the
  answer outright, so in practice the answer is still readable a few lines
  below the retry buttons. Worth deciding whether that is acceptable.
