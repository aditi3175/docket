// app/ — the React + Vite presentation layer. It may present, never compute: every read and
// rule is imported from web/assets (dependency-free, tested elsewhere). These tests hold the app to the
// rules the static pages kept: textContent-equivalent rendering (no raw HTML), no remote fonts or
// styles, red-equivalent coral only for no-vote, never "safe" (I9), the census counter computed from
// graph.json with the chain recount only on click (I20), and pinned, reproducible dependencies.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const APP = new URL('../app/', import.meta.url);
const read = (p) => readFileSync(new URL(p, APP), 'utf8');
function walk(dir) {
  const out = [];
  for (const f of readdirSync(dir)) { const p = join(dir, f); if (statSync(p).isDirectory()) out.push(...walk(p)); else out.push(p); }
  return out;
}
const SRC = walk(new URL('src/', APP).pathname.replace(/^\/([A-Za-z]:)/, '$1')).filter((p) => /\.(jsx?|css)$/.test(p));
const all = SRC.map((p) => [p, readFileSync(p, 'utf8')]);

test('app: dependencies pinned to exact versions, with a lockfile', () => {
  const pkg = JSON.parse(read('package.json'));
  for (const [name, v] of Object.entries({ ...pkg.dependencies, ...pkg.devDependencies })) assert.match(v, /^\d+\.\d+\.\d+$/, `${name} ${v} is not an exact version`);
  assert.ok(existsSync(new URL('package-lock.json', APP)), 'app/package-lock.json');
  const lock = JSON.parse(read('package-lock.json'));
  for (const [name, v] of Object.entries(pkg.dependencies)) assert.equal(lock.packages[`node_modules/${name}`]?.version, v, name);
});

test('app: the root project stays dependency-free (verify.mjs and npm test need no install)', () => {
  const root = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(root.dependencies, undefined);
  assert.equal(root.devDependencies, undefined);
});

test('app: presentation only — reads and rules come from web/assets; no raw HTML; no remote fonts or styles', () => {
  const finding = read('src/lib/finding.js');
  for (const m of ['rpc.js', 'index-view.js', 'census.js', 'value.js']) assert.match(finding, new RegExp(`from '\\.\\./\\.\\./\\.\\./web/assets/${m.replace('.', '\\.')}'`), m);
  for (const [p, s] of all) {
    assert.doesNotMatch(s, /dangerouslySetInnerHTML|innerHTML|outerHTML|insertAdjacentHTML|document\.write/, p);
    assert.doesNotMatch(s, /@import\s+url\(|fonts\.googleapis|fonts\.gstatic|api\.fontshare/, p);
    assert.doesNotMatch(s, /\bfetch\(\s*['"`]https?:/, p); // remote reads only through web/assets
  }
  assert.doesNotMatch(read('index.html'), /<(script|link)[^>]+(src|href)=["']https?:/);
});

test('app: copy rules — never "safe" (I9); coral only in no-vote styling', () => {
  for (const [p, s] of all) assert.doesNotMatch(s.replace(/\/\/.*$/gm, ''), /\bsafe\b/i, p);
  const home = read('src/Home.jsx');
  // every coral utility in the homepage marks the no-vote claim or count
  for (const m of home.matchAll(/[^\n]*(text|bg)-coral[^\n]*/g)) assert.match(m[0], /without a vote|k\.true|i === 1|novote|bg-coral" style/, m[0].trim().slice(0, 120));
});

test('app: I20 — census from graph.json records; the chain recount only on the reader\'s click', () => {
  const finding = read('src/lib/finding.js');
  assert.match(finding, /census\(Object\.values\(g\.daos\)\)/);
  const home = read('src/Home.jsx');
  assert.equal((home.match(/liveCounter\(/g) ?? []).length, 1);
  assert.match(home, /const recount = async \(\) => \{[\s\S]*?liveCounter\(createRpc\(\)/);
  assert.match(home, /onClick=\{recount\}/);
  assert.match(home, /Recount from the chain now \(about 15 minutes\)/);
  assert.doesNotMatch(home, /\b1[0-9]\b opted out|\b13 (read|opted)/); // no stored counter
});

test('app: the build is static and self-contained (graph.json copied in)', () => {
  const cfg = read('vite.config.js');
  assert.match(cfg, /outDir: '\.\.\/dist'/);
  assert.match(cfg, /fileName: 'graph\.json'/);
});
