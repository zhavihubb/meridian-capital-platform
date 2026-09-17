/* ============================================================
   Build step for Cloudflare Pages.
   Copies ONLY the static site into ./dist so that server/,
   functions/, node_modules/ and data/ are never published.
   ============================================================ */
import { cp, rm, mkdir, writeFile, readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(process.cwd());
const DIST = path.join(ROOT, 'dist');

/* Top-level HTML pages to publish */
const HTML_GLOBS = (await readdir(ROOT)).filter((f) => f.endsWith('.html'));
/* Static asset directories to publish */
const DIRS = ['assets', 'admin', 'user', 'legal'];

async function main() {
  await rm(DIST, { recursive: true, force: true });
  await mkdir(DIST, { recursive: true });

  for (const f of HTML_GLOBS) {
    await cp(path.join(ROOT, f), path.join(DIST, f));
  }
  for (const d of DIRS) {
    const src = path.join(ROOT, d);
    if (existsSync(src)) await cp(src, path.join(DIST, d), { recursive: true });
  }

  /* Route only /api/* through Pages Functions; serve everything else statically. */
  await writeFile(path.join(DIST, '_routes.json'), JSON.stringify({
    version: 1,
    include: ['/api/*'],
    exclude: []
  }, null, 2));

  /* SPA-ish fallback not needed (multi-page site), but keep 404 clean. */
  console.log('Build complete → dist/');
  console.log('  HTML pages:', HTML_GLOBS.length);
  console.log('  Asset dirs:', DIRS.filter((d) => existsSync(path.join(ROOT, d))).join(', '));
}

main().catch((e) => { console.error(e); process.exit(1); });
