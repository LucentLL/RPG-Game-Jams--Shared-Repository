/**
 * Let a plain `node dev/*.mjs` audit import the game's own modules.
 *
 * TWO things stand in the way, both of them Vite's and neither of them real
 * JavaScript. This hook substitutes what Vite would have inlined, so an audit
 * reads the REAL tables instead of a copy that drifts (which is the lesson
 * dev/check-volumes.mjs had to work around by hand).
 *
 *     node --import ./dev/register-vite-env.mjs dev/check-drawdist.mjs
 *
 * 1. `import.meta.env` — one reference in src/config/assets.js pulls down the
 *    whole art/map chain.
 * 2. `import.meta.glob` — src/guild/map-pack.js loads every content/maps/*.json
 *    through it, and delve-maps.js builds DELVE_MAPS from that. Without this
 *    substitution EVERY dev script that touches a chart dies at import, because
 *    the charts are no longer literals in the source.
 */
const ENV = '({BASE_URL:"./",MODE:"audit",DEV:false,PROD:true,SSR:false})';

/**
 * A synchronous stand-in for Vite's eager `import.meta.glob` over JSON.
 *
 * Substituted for the BARE TOKEN `import.meta.glob`, so the call's own argument
 * list supplies the pattern and the options object is accepted and ignored —
 * that keeps the substitution out of the business of balancing parentheses.
 * `import.meta.url` inside the arrow resolves in the HOST module, which is what
 * makes the relative pattern resolve from the right directory.
 *
 * JSON only, eager only. That is the only shape the game uses, and a glob that
 * quietly returned promises here would be worse than one that was never defined.
 * `process.getBuiltinModule` avoids adding imports to somebody else's module.
 */
const GLOB = `((__pat) => {
  const __fs = process.getBuiltinModule('node:fs');
  const __pa = process.getBuiltinModule('node:path');
  const __ur = process.getBuiltinModule('node:url');
  if (!__pat.endsWith('.json')) throw new Error('vite-env-hook: import.meta.glob stand-in is JSON-only, got ' + __pat);
  const __here = __pa.dirname(__ur.fileURLToPath(import.meta.url));
  const __rel = __pa.dirname(__pat);
  const __dir = __pa.resolve(__here, __rel);
  const __out = {};
  for (const __f of __fs.readdirSync(__dir).sort()) {
    if (!__f.endsWith('.json')) continue;
    __out[__rel + '/' + __f] = JSON.parse(__fs.readFileSync(__pa.join(__dir, __f), 'utf8'));
  }
  return __out;
})`;

export async function load(url, context, next) {
  const r = await next(url, context);
  if (r.format !== 'module' || !r.source) return r;
  const src = typeof r.source === 'string' ? r.source : Buffer.from(r.source).toString('utf8');
  if (!src.includes('import.meta.env') && !src.includes('import.meta.glob')) return r;
  // glob FIRST: its replacement text contains `import.meta.url`, and doing env
  // first would leave that alone anyway — but the order is stated so a future
  // substitution that touches `import.meta.` generally cannot silently reorder.
  let out = src.split('import.meta.glob').join(GLOB);
  out = out.split('import.meta.env').join(ENV);
  return { ...r, source: out };
}
