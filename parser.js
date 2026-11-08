// Read-only parser for the AoE2:DE profile file (Player.nfp).
// Format (reverse-engineered, not official): the whole file is a raw deflate
// stream. Inside it, saved campaign decisions are stored as repeated entries:
//   int64 key length | key text ("PKEY:<campaign>:<name>") | int64 value
// All integers are little-endian.

const TREASURES = [
  // [letter, chapter, mission title, item]
  ["A", 1, "Blood Under a Blackened Sky", "Reindeer Coat of Thorir the Hound"],
  ["B", 1, "In the Land of the Rus'", "Sword of Rurik"],
  ["C", 1, "Fires of the Whale-Road", "Hastein's Mead Horn"],
  ["D", 1, "Death's Handmaid", "Helmet of Bjorn Ironside"],
  ["E", 1, "The Bulgar-Burner", "Ulfberht Sword"],
  ["F", 1, "The Warrior Who Fed the Wolves", "Zoe's Diadem"],
  ["G", 2, "Kings and Cowards", "Crucifix of Harald Bluetooth"],
  ["H", 2, "Through the Slaughter-Reeds", "Bone Flute of Bragi"],
  ["I", 2, "The Wayward Men of Norway", "Sun Stone of Leif Ericsson"],
  ["J", 2, "Blades Dyed Crimson", "Beard Comb of Sweyn Forkbeard"],
  ["K", 2, "The Battle of Nisa", "Sigrid the Haughty's Bracelet"],
  ["L", 3, "Westward, the Carrion's Call", "Alfred Jewel"],
  ["M", 3, "The Storm-Driver of the North", "Axe of Ragnar Lothbrok"],
  ["N", 3, "Fulford Gate", "Chain Mail of Ivar the Boneless"],
  ["O", 3, "The Battle of Stamford Bridge", "Aslaug's Shirt"],
];

async function inflateRaw(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

// Returns Map<"campaign:name", bigint> of every PKEY entry.
function readEntries(data) {
  const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const marker = new TextEncoder().encode("PKEY:");
  let start = -1;
  outer: for (let i = 8; i < data.length - marker.length; i++) {
    for (let j = 0; j < marker.length; j++) if (data[i + j] !== marker[j]) continue outer;
    start = i - 8;
    break;
  }
  if (start < 0) throw new Error("No saved-decision entries (PKEY) found. Is this a Player.nfp from AoE2:DE?");
  const entries = new Map();
  entries.offsets = new Map(); // key -> byte offset of the 8-byte value (for patching)
  const dec = new TextDecoder("latin1");
  let pos = start;
  while (pos + 16 <= data.length) {
    const len = Number(dv.getBigInt64(pos, true));
    if (len <= 5 || len > 200) break;
    const key = dec.decode(data.subarray(pos + 8, pos + 8 + len));
    if (!key.startsWith("PKEY:")) break;
    if (pos + 16 + len > data.length) break;
    entries.set(key.slice(5), dv.getBigInt64(pos + 8 + len, true));
    entries.offsets.set(key.slice(5), pos + 8 + len);
    pos += 16 + len;
  }
  if (entries.size === 0) throw new Error("Could not read any saved decisions from this file.");
  return entries;
}

// chapterLists: { 1: {A: 2, ...}, 2: {...}, 3: {...} } (numbers, -1 = not collected)
function analyse(entries) {
  const lists = { 1: {}, 2: {}, 3: {} };
  for (const [key, val] of entries) {
    const m = /^nocam([123]):Treasure([A-O])$/.exec(key);
    if (m) lists[m[1]][m[2]] = Number(val);
  }
  const present = [1, 2, 3].filter((c) => Object.keys(lists[c]).length > 0);
  const rows = TREASURES.map(([letter, chapter, mission, item]) => {
    const vals = {};
    for (const c of [1, 2, 3]) vals[c] = letter in lists[c] ? lists[c][letter] : null;
    const seen = [1, 2, 3].map((c) => vals[c]).filter((v) => v !== null);
    const collectedSomewhere = seen.some((v) => v > 0);
    const missingSomewhere = seen.some((v) => v === -1);
    const differs = new Set(seen).size > 1;
    let status = "ok";
    if (seen.length === 0) status = "none";
    else if (!collectedSomewhere) status = "missing";
    else if (missingSomewhere) status = "stale";
    else if (differs) status = "differs";
    return { letter, chapter, mission, item, vals, status };
  });
  return { rows, present, lists };
}

// The value an item should have everywhere: the first collected (>0) value found, Chapter 1 first.
function targetValues(lists) {
  const target = {};
  for (const [letter] of TREASURES) {
    for (const c of [1, 2, 3]) {
      const v = lists[c][letter];
      if (v !== undefined && v > 0) { target[letter] = v; break; }
    }
  }
  return target;
}

// Which -1 values would be changed, and to what.
function planProfileFix(result) {
  const target = targetValues(result.lists);
  const changes = [];
  for (const c of [1, 2, 3]) {
    for (const [letter, v] of Object.entries(result.lists[c])) {
      if (v === -1 && target[letter] !== undefined) changes.push({ chapter: c, letter, from: -1, to: target[letter] });
    }
  }
  return { changes, target };
}

async function deflateRaw(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function sameBytes(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

// Returns a fixed copy of the profile. Never touches the input. Throws if any safety check fails.
async function patchProfile(arrayBuffer) {
  const original = await inflateRaw(new Uint8Array(arrayBuffer));
  const entries = readEntries(original);
  const { changes } = planProfileFix(analyse(entries));
  if (changes.length === 0) throw new Error("Nothing to fix in this profile.");

  const patched = original.slice();
  const dv = new DataView(patched.buffer);
  const allowed = [];
  for (const ch of changes) {
    const off = entries.offsets.get(`nocam${ch.chapter}:Treasure${ch.letter}`);
    if (off === undefined || dv.getBigInt64(off, true) !== -1n) throw new Error("Unexpected data layout; refusing to patch.");
    dv.setBigInt64(off, BigInt(ch.to), true);
    allowed.push([off, off + 8]);
  }

  // Safety checks: only the planned bytes differ, and the new file decompresses back to exactly the patched data.
  for (let i = 0; i < original.length; i++) {
    if (original[i] !== patched[i] && !allowed.some(([a, b]) => i >= a && i < b)) throw new Error("Safety check failed (unexpected change); refusing.");
  }
  const bytes = await deflateRaw(patched);
  const back = await inflateRaw(bytes);
  if (!sameBytes(back, patched)) throw new Error("Safety check failed (re-compression did not round-trip); refusing.");
  const after = analyse(readEntries(back));
  if (after.rows.some((r) => r.status === "stale")) throw new Error("Safety check failed (items still stale after patch); refusing.");
  return { bytes, changes };
}

async function parseProfile(arrayBuffer) {
  const raw = new Uint8Array(arrayBuffer);
  let data;
  try {
    data = await inflateRaw(raw);
  } catch (e) {
    throw new Error("This file is not a compressed profile the checker understands.");
  }
  return analyse(readEntries(data));
}

if (typeof module !== "undefined") module.exports = { parseProfile, analyse, readEntries, inflateRaw, deflateRaw, planProfileFix, patchProfile, TREASURES };
