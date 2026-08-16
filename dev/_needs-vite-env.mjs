/**
 * A DEV SCRIPT THAT FORGOT ITS HOOK SHOULD SAY SO.
 *
 * Import this FIRST — before anything that reaches into src/ — in any dev script
 * that imports the game's own modules:
 *
 *     import './_needs-vite-env.mjs';
 *     import { … } from '../src/guild/…';
 *
 * ESM evaluates a module's imports in source order, so the guard runs before the
 * chain that would otherwise throw.
 *
 * WHY THIS EXISTS. src/config/assets.js reads `import.meta.env.BASE_URL`, and
 * src/guild/map-pack.js reads `import.meta.glob` — both are Vite's, neither
 * exists under plain node. dev/vite-env-hook.mjs substitutes them, and
 * `--import ./dev/register-vite-env.mjs` installs it. Without it the failure is
 * a bare `TypeError: Cannot read properties of undefined (reading 'BASE_URL')`
 * pointing at a line of GAME source, which reads like the game is broken rather
 * than like the command was short a flag.
 *
 * That cost something real on 2026-08-16: `dev/sync-map-pack.mjs` was run without
 * the hook while bundling three new Wilds charts into Unity, crashed with exactly
 * that message inside a chained command, and the Unity build was one step from
 * shipping without the maps. The EditMode fixture caught it — "no chart
 * 'blackpine'" — but the fixture is the LAST net, not the first, and a clear
 * error here is cheaper than a red suite three commands later.
 */
if (typeof process !== 'undefined' && process?.versions?.node) {
  const armed = (process.execArgv || []).some((a) => /register-vite-env/.test(a))
    || /register-vite-env/.test(process.env.NODE_OPTIONS || '');
  if (!armed) {
    const me = process.argv[1] ? process.argv[1].replace(/\\/g, '/').split('/').pop() : 'this script';
    console.error(
      `\n${me} imports the game's own modules, which need Vite's import.meta.env`
      + ` and import.meta.glob.\n\nRun it with the hook:\n\n`
      + `    node --import ./dev/register-vite-env.mjs dev/${me}\n\n`
      + `(see dev/vite-env-hook.mjs — it stands in for both.)\n`,
    );
    process.exit(2);
  }
}
