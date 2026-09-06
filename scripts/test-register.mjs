/* ------------------------------------------------------------------ */
/* node:test bootstrap — teaches bare Node the "@/" path alias.        */
/*                                                                     */
/* jsconfig.json maps "@/*" -> "./src/*". Next.js/Turbopack understand */
/* it; `node --test` does not, so any module that imports "@/..."      */
/* (src/lib/format.js, seo.js, indexnow.js, every component) would be  */
/* untestable without this hook. Loaded via                            */
/*   node --import ./scripts/test-register.mjs --test "src/**\/*.test.js"  */
/*                                                                     */
/* module.registerHooks is synchronous and in-thread (Node >= 22.15 /  */
/* 24), so it needs no worker and adds no measurable startup cost.     */
/* ------------------------------------------------------------------ */

import { registerHooks } from 'node:module';
import { existsSync, globSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'src');

/** The glob `npm test` passes to `node --test`. Keep the two in step. */
const TEST_GLOB = 'src/**/*.test.js';

/* ------------------------------------------------------------------ */
/* Guard: `node --test <glob>` exits 0 when the glob matches NOTHING,  */
/* so a renamed folder or a broken pattern would read as a green run   */
/* forever. Fail loudly instead. (`node --test src` is not an option:  */
/* Node resolves a positional as a module path, not a directory.)      */
/* ------------------------------------------------------------------ */
const found = globSync(TEST_GLOB, { cwd: ROOT });
if (found.length === 0) {
  console.error(`\n  No test file matched ${TEST_GLOB} under ${ROOT}.`);
  console.error('  Unit tests live next to the module they cover, e.g. src/lib/pricing.test.js.\n');
  process.exit(1);
}

/** Extensions tried when the alias import has none, in resolution order. */
const EXTENSIONS = ['', '.js', '.mjs', '.json', '/index.js', '/index.mjs'];

/**
 * Resolve "@/lib/format" to an absolute file URL under src/.
 * Returns null when nothing on disk matches, so the caller can fall through
 * to Node's own error instead of inventing a misleading one.
 * @param {string} specifier
 * @returns {string|null}
 */
function resolveAlias(specifier) {
  const target = path.join(SRC, specifier.slice(2));
  for (const extension of EXTENSIONS) {
    const candidate = target + extension;
    if (existsSync(candidate)) return pathToFileURL(candidate).href;
  }
  return null;
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('@/')) {
      const url = resolveAlias(specifier);
      if (url) return { url, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});
