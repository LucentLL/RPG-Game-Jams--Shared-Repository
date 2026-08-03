/**
 * Let a plain `node dev/*.mjs` audit import the game's own modules.
 *
 * The only thing standing in the way is `import.meta.env`, which is Vite's and
 * does not exist outside it — one reference in src/config/assets.js pulls down
 * the whole art/map chain. This substitutes the build-time constants Vite would
 * have inlined, so an audit reads the REAL tables instead of a copy that drifts
 * (which is the lesson dev/check-volumes.mjs had to work around by hand).
 *
 *     node --import ./dev/register-vite-env.mjs dev/check-drawdist.mjs
 */
const ENV = '({BASE_URL:"./",MODE:"audit",DEV:false,PROD:true,SSR:false})';

export async function load(url, context, next) {
  const r = await next(url, context);
  if (r.format !== 'module' || !r.source) return r;
  const src = typeof r.source === 'string' ? r.source : Buffer.from(r.source).toString('utf8');
  if (!src.includes('import.meta.env')) return r;
  return { ...r, source: src.split('import.meta.env').join(ENV) };
}
