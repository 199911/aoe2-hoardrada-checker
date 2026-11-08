# Hoardrada Checker

A read-only, in-browser checker for the Age of Empires II: DE **Hoardrada** achievement bug (The Viking Sagas).

Drop your `Player.nfp` on the page. It lists the 15 legendary items per chapter and flags any item that is
recorded as collected in one chapter but as **not collected (-1)** in another. That mismatch is the cause found
on one profile: replaying a mission updated Chapter 1's record, but the copies carried into Chapters 2 and 3 stayed at -1.

Nothing is uploaded. The page reads the file locally. It never modifies it.

## Use

Open `index.html` in a browser (Chrome 103+, Safari 16.4+ or Firefox 113+), or host the two files
(`index.html`, `parser.js`) on GitHub Pages.

## File format (reverse-engineered, unofficial)

- `Player.nfp` is a raw deflate stream.
- Inside, saved campaign decisions are repeated entries: `int64 key length | key text | int64 value` (little endian).
- Keys look like `PKEY:nocam3:TreasureE`. `nocam1`/`nocam2`/`nocam3` are the three chapters. Each chapter keeps its own
  running list of treasures: Chapter 1 has A-F, Chapter 2 has A-K, Chapter 3 has A-O.
- Values 1 and 2 are the two decision choices; -1 means not collected.
- `nocam1.xsdat` and `nocam2.xsdat` (in the local profile folder) carry the same lists between chapters as 4-byte integers.

## Status

Tested on one real profile (and a copy with the -1 values restored) using the parsing logic only. The browser
file-drop UI and `DecompressionStream` inflate step have not yet been exercised in a real browser.
This is not an official tool, and a game update can change the format.
