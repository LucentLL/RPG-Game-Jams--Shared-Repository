/**
 * THE MAP PACK, BUNDLED FOR THE PLAYER — content/maps/*.json → Unity.
 *
 * The Unity port's charts were fifteen hand-typed C# literals. This bundles the
 * pack (`content/maps/<id>.json`, one file per map, filename === id) into ONE
 * TextAsset the player can actually load:
 *
 *     Guild Rancher/Assets/Resources/Maps/pack.json     {"maps":[ … ]}
 *
 *     node --import ./dev/register-vite-env.mjs dev/sync-map-pack.mjs
 *     node --import ./dev/register-vite-env.mjs dev/sync-map-pack.mjs --src DIR --out FILE
 *
 * WHY A RESOURCES TEXTASSET AND NOT A FILE READ. The EditMode idiom
 * `File.ReadAllText(Path.Combine(Application.dataPath, …))` is Editor-only:
 * `Application.dataPath` in a player points at the install and `Assets/` is not
 * shipped, so a loader written that way passes every test and dies in the APK.
 * This project has shipped that exact class of bug twice (the stripped shader,
 * the null themeStyleSheet). Resources/ is compiled INTO the player, so
 * MapPack.cs reads `Resources.Load<TextAsset>("Maps/pack")` and the Editor test
 * and the phone take the same path.
 *
 * WHY THE WRAPPER OBJECT. JsonUtility cannot parse a top-level array, so the
 * bundle is `{"maps":[…]}`.
 *
 * ─── WHAT THIS SCRIPT DOES NOT DECIDE ──────────────────────────────────────
 * IT OWNS NO RULES. The schema — the closed key sets, the grid vocabulary, the
 * id shape, the ONE HARD RULE that a prop carries no width — belongs to
 * `src/guild/map-pack-validate.js`, which is the same module the game's own
 * loader (`src/guild/map-pack.js`) and the auditor (`dev/check-maps.mjs`) gate
 * on, and the width derivation belongs to `src/guild/prop-width.js`. Both are
 * IMPORTED here. A bundler that re-typed those rules would be a fourth copy of
 * them, and a fourth copy is a third chance to drift — which is the exact
 * failure the pack exists to end. This file bundles, and audits the two things
 * only IT can see:
 *
 *   1. THE JsonUtility SHAPE. Unity's serializer is not a JSON library. It
 *      cannot express an array of arrays, and it does not complain — it hands
 *      back an empty field. `locks` and `water` are arrays of [x,y] pairs, so
 *      they hit that hole, and an empty `locks` is a locked door that opens.
 *      MapPack.cs lifts those two out of the raw text by hand; this audit is
 *      what keeps the list of fields needing that lift from growing in silence.
 *
 *   2. THE C# DTO's REACH. A key the pack authors that MapPack.cs's DTO has no
 *      field for is dropped by the port without a word. The known-handled key
 *      sets are listed below and diffed against what the pack actually carries,
 *      so a schema that grows on the web side shows up HERE rather than as a
 *      missing prop on a phone.
 * ───────────────────────────────────────────────────────────────────────────
 *
 * IT ALSO WRITES THE .meta FILES. A TextAsset with no .meta is invisible to a
 * headless build, so `pack.json.meta` (TextScriptImporter) and the containing
 * `Maps.meta` (folderAsset) are hand-authored beside it, structure copied from
 * Assets/Tests/EditMode/*.json.meta and Assets/Resources/Art.meta. Their guids
 * are DERIVED from the asset path (md5), so re-running is idempotent and two
 * machines produce the same guid. An existing .meta is never rewritten — once
 * Unity has seen a guid, it owns it.
 */
import './_needs-vite-env.mjs';   // must come first — see that file
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, basename } from 'node:path';
import { createHash } from 'node:crypto';

import { checkPackMap } from '../src/guild/map-pack-validate.js';
import { lawfulWidth } from '../src/guild/prop-width.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const UNITY = join(ROOT, '..', '..', '..', '..', 'Guild Rancher');

const argv = process.argv.slice(2);
const flag = (name, dflt) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : dflt; };
const SRC = flag('--src', join(ROOT, 'content', 'maps'));
const OUT = flag('--out', join(UNITY, 'Assets', 'Resources', 'Maps', 'pack.json'));

/**
 * The keys MapPack.cs's DTOs actually have a field for. NOT a schema — a
 * statement about the PORT, kept here because this is the only place that can
 * compare the two. Anything in the pack and not in here is dropped by Unity.
 * `cls` is listed as knowingly-dropped rather than handled (a CSS animation
 * class means nothing there, and the loader says so at load).
 */
// VERIFIED AGAINST THE DTO, 2026-08-16 — this list had gone stale and was
// reporting `walls` and prop `facing` as SILENTLY DROPPED when MapPack.cs
// carries both (JProp at MapPack.cs:96 has `facing`; JMap at :179 has `walls`).
// A drop-detector that cries wolf is worse than none: the next real drop reads
// as more noise. Re-check this against MapPack.cs whenever the schema grows.
const CS_MAP_KEYS = new Set(['schema', 'kind', 'id', 'name', 'theme', 'grid', 'entry',
  'exitStairs', 'props', 'portals', 'spawns', 'regions', 'walls', 'paint', 'water', 'locks']);
const CS_PROP_KEYS = new Set(['art', 'x', 'y', 'facing', 'use', 'label']);
// 'paint' LEFT THIS SET on 2026-08-16: the port carries it now (MapPack.ToChart),
// because the crown ruling made a standable top read the ground channel and an
// unread channel meant the grass stayed. Only 'cls' is still a real drop.
const CS_KNOWN_DROPS = new Set(['cls']);   // dropped ON PURPOSE, and reported by the loader

// ── Read and validate ───────────────────────────────────────────────────────
if (!existsSync(SRC)) {
  console.error(`sync-map-pack: no pack directory at ${SRC}`);
  process.exit(1);
}
const files = readdirSync(SRC).filter((n) => n.endsWith('.json')).sort();
if (!files.length) { console.error(`sync-map-pack: ${SRC} holds no .json maps`); process.exit(1); }

const raws = [];
for (const file of files) {
  try { raws.push([file, basename(file, '.json'), JSON.parse(readFileSync(join(SRC, file), 'utf8'))]); }
  catch (e) { console.error(`sync-map-pack: ${file} is not JSON — ${e.message}`); process.exit(1); }
}
const ids = new Set(raws.map(([, , m]) => m && m.id).filter(Boolean));

const errors = [], warns = [];
for (const [file, stem, raw] of raws) {
  const { errors: e, warnings: w } = checkPackMap(raw, stem, { ids });
  for (const m of e) errors.push(`${file}: ${m}`);
  for (const m of w) warns.push(`${file}: ${m}`);
}

// ── The two audits only the bundler can run ─────────────────────────────────
const shape = new Set(), unreached = new Set();
for (const [, , m] of raws) {
  for (const k of Object.keys(m)) {
    if (Array.isArray(m[k]) && m[k].some(Array.isArray)) shape.add(`maps[].${k}[] — an ARRAY OF ARRAYS`);
    if (m[k] === null) shape.add(`maps[].${k} is null — JsonUtility has no nullable primitive`);
    if (!CS_MAP_KEYS.has(k) && !CS_KNOWN_DROPS.has(k)) unreached.add(`chart key '${k}'`);
  }
  for (const p of m.props ?? [])
    for (const k of Object.keys(p))
      if (!CS_PROP_KEYS.has(k) && !CS_KNOWN_DROPS.has(k)) unreached.add(`prop key '${k}'`);
}

if (errors.length) {
  console.error('sync-map-pack: REFUSING to bundle —');
  for (const e of errors) console.error(`  ${e}`);
  process.exit(1);
}

// ── Write ───────────────────────────────────────────────────────────────────
const maps = raws.map(([, , m]) => m).sort((a, b) => a.id.localeCompare(b.id));   // deterministic order
const json = JSON.stringify({ maps }, null, 1) + '\n';
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, json);

// ── The stamp: a GREPPABLE proof that the data reached the build ────────────
//
// The deploy check for this game is to download the deployed WebGL.data and
// grep it for a string only the new build has (reference-unity-webgl-deploy),
// because GitHub Pages stamps every file with the same Last-Modified and
// timestamps prove nothing.
//
// THAT CHECK ONLY SEES CODE. IL2CPP puts C# string literals in WebGL.data, but
// a Resources TextAsset is PACKED — measured 2026-08-16: hollowvein's grid row
// has shipped for weeks and greps 0, while "Hollowvein Mine" (a C# literal)
// greps 1. So every map ever added is invisible to the one check that proves a
// deploy, and "the maps are live" was an inference from the source file plus a
// payload size delta rather than an observation of the artifact.
//
// This closes it. The manifest is a compile-time literal GENERATED FROM THE
// PACK, so it cannot drift from what shipped: grep the deployed payload for a
// map's id and a hit means that map's data is genuinely in that build.
const packIds = maps.map((m) => m.id);
const stamp = `// GENERATED by dev/sync-map-pack.mjs — do not edit by hand.
//
// Exists so a deployed build can be PROVEN to carry a given map. A Resources
// TextAsset is packed inside WebGL.data and cannot be grepped; a C# string
// literal can. This manifest is generated from the pack itself, so it is a
// witness that cannot lie about what was bundled beside it.
//
//     curl -so d.data <url>/Build/WebGL.data && grep -ac "map-pack:thornwood" d.data
namespace Arena
{
    public static class MapPackStamp
    {
        /// <summary>Every map id in the bundled pack, comma-separated, each one
        /// prefixed so a grep for a short id cannot collide with other text.</summary>
        public const string Manifest = "${packIds.map((i) => `map-pack:${i}`).join(',')}";

        /// <summary>How many maps the pack held when it was bundled.</summary>
        public const int Count = ${packIds.length};
    }
}
`;
const STAMP = join(dirname(OUT), '..', '..', 'Scripts', 'Delve', 'MapPackStamp.cs');
mkdirSync(dirname(STAMP), { recursive: true });
writeFileSync(STAMP, stamp);

/** A stable guid for an asset path — same input, same guid, every machine. */
const guidFor = (s) => createHash('md5').update(`guild-rancher:${s}`).digest('hex');
const metaWritten = [];
function meta(path, body) {
  if (existsSync(path)) return;
  writeFileSync(path, body);
  metaWritten.push(basename(path));
}
meta(OUT + '.meta',
  `fileFormatVersion: 2\nguid: ${guidFor('Assets/Resources/Maps/pack.json')}\n` +
  'TextScriptImporter:\n  externalObjects: {}\n  userData: \n  assetBundleName: \n  assetBundleVariant: \n');
meta(dirname(OUT) + '.meta',
  `fileFormatVersion: 2\nguid: ${guidFor('Assets/Resources/Maps')}\nfolderAsset: yes\n` +
  'DefaultImporter:\n  externalObjects: {}\n  userData: \n  assetBundleName: \n  assetBundleVariant: \n');

// ── Report ──────────────────────────────────────────────────────────────────
const byKind = {};
for (const m of maps) (byKind[m.kind] ??= []).push(m.id);
console.log(`sync-map-pack  ${SRC}\n            →  ${OUT}`);
console.log(`  ${maps.length} maps, ${(json.length / 1024).toFixed(1)} KB`);
for (const [kind, list] of Object.entries(byKind)) console.log(`    ${kind} (${list.length}): ${list.join(', ')}`);

const props = maps.flatMap((m) => (m.props ?? []).map((p) => p.art));
const arts = [...new Set(props)].sort();
const noRung = arts.filter((a) => lawfulWidth(a) == null);
console.log(`  ${props.length} props over ${arts.length} art ids — every width DERIVED at load, none authored`);
if (noRung.length) console.log(`  NO LADDER RUNG (no width can be derived): ${noRung.join(', ')}`);
console.log('  ' + arts.map((a) => `${a}=${lawfulWidth(a)}`).join(' '));

if (metaWritten.length) console.log(`  wrote meta: ${metaWritten.join(', ')}`);
if (shape.size) {
  console.log('  JsonUtility CANNOT parse these shapes — MapPack.cs lifts them from the raw text by hand:');
  for (const s of shape) console.log(`    ${s}`);
} else console.log('  JsonUtility shape: clean');
if (unreached.size) {
  console.log('  THE UNITY DTO HAS NO FIELD FOR — these are dropped by the port in SILENCE:');
  for (const s of unreached) console.log(`    ${s}`);
  console.log('    Add the field to MapPack.cs, or add the key to CS_KNOWN_DROPS with a reason.');
} else console.log('  Unity DTO reach: every key the pack authors has a home (or a named drop)');
if (warns.length) { console.log(`  ${warns.length} warnings:`); for (const w of warns) console.log(`    ${w}`); }
else console.log('  0 warnings');
