// Every page's inline module script must parse. A syntax error leaves a page stuck on "reading…" with
// nothing in the tests to say so: it happened twice on 2026-11-07 (an apostrophe inside a single-quoted
// string), once caught by the cold run of the README. node --check parses each script as an ES module.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const WEB = new URL('../web/', import.meta.url);
const pages = readdirSync(WEB).filter((f) => f.endsWith('.html'));

test('every page has exactly one inline module script, and it parses', () => {
  const dir = mkdtempSync(join(tmpdir(), 'docket-pages-'));
  assert.ok(pages.length >= 5, pages.join(','));
  for (const p of pages) {
    const html = readFileSync(new URL(p, WEB), 'utf8');
    const scripts = [...html.matchAll(/<script type="module">([\s\S]*?)<\/script>/g)].map((m) => m[1]);
    assert.equal(scripts.length, 1, p);
    const file = join(dir, `${p}.mjs`);
    writeFileSync(file, scripts[0]);
    try { execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' }); }
    catch (e) { assert.fail(`${p}: ${String(e.stderr).split('\n').slice(0, 5).join(' | ')}`); }
  }
});

test('every module a page imports exists under web/assets/', () => {
  for (const p of pages) {
    const html = readFileSync(new URL(p, WEB), 'utf8');
    for (const [, path] of html.matchAll(/from '\.\/(assets\/[\w-]+\.js)'/g)) {
      assert.doesNotThrow(() => readFileSync(new URL(path, WEB)), `${p} imports ${path}`);
    }
  }
});
