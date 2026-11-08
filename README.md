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

## Optional fix

If stale items are found, the page can build a **fixed copy** (the original is never modified):

- Each stale `-1` is set to the value already recorded for that item in the chapter where it was collected.
- For `Player.nfp` it checks that only those 8-byte values changed, that the new file decompresses back to exactly
  the patched data, and that no stale items remain. If any check fails it refuses.
- Drop `nocam1.xsdat` / `nocam2.xsdat` (local profile folder) together with `Player.nfp` to fix those too.
- Before using the fixed files: quit the game and Steam, back up the originals, then replace the originals with the
  fixed copies (renamed back to their original names) in **both** the Steam cloud folder and the local profile
  folder, so Steam Cloud does not restore the old one.

There is no guarantee it works. It unlocked the achievement for the one profile it was tried on.

## Status

The parsing and patch logic were tested offline on one real profile and variants of it (stale items, missing items,
refusal cases). The page was also exercised in a real browser (on the live GitHub Pages site): analysing a profile with
a stale item, building the fixed `Player.nfp`, and re-opening it showed all items consistent. The `.xsdat` download
buttons were only checked offline, and the game itself has not been tested with a browser-built file.
Needs a browser with `deflate-raw` support (Chrome 103+, Safari 16.4+, Firefox 113+).
This is not an official tool, and a game update can change the format.
