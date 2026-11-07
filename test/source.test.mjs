// Public pages cite the source, not the spec: no "§" or "ARCHITECTURE.md" in anything a page renders,
// and every source link is pinned to the factory's default commit with a line anchor.
// Line numbers were read from raw.githubusercontent.com at 2b0f34a38604 on 2026-11-07 (web/assets/source.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { SOURCE, SPUTNIK_COMMIT } from '../web/assets/source.js';

const code = (f) => readFileSync(new URL(`../web/${f}`, import.meta.url), 'utf8')
  .split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).map((l) => l.replace(/\s\/\/\s.*$/, '')).join('\n');

test('no spec references in rendered text: pages and the modules whose strings they render', () => {
  const files = [...readdirSync(new URL('../web/', import.meta.url)).filter((f) => f.endsWith('.html')),
    ...readdirSync(new URL('../web/assets/', import.meta.url)).filter((f) => f.endsWith('.js')).map((f) => `assets/${f}`)];
  for (const f of files) assert.doesNotMatch(code(f), /§\d|ARCHITECTURE\.md/, f);
});

test('source links: pinned to 2b0f34a38604, a file and a line anchor', () => {
  assert.equal(SPUTNIK_COMMIT, '2b0f34a38604');
  for (const s of Object.values(SOURCE)) assert.match(s.href, /^https:\/\/github\.com\/near-daos\/sputnik-dao-contract\/blob\/2b0f34a38604\/sputnikdao2\/src\/\w+\.rs#L\d+(-L\d+)?$/);
  assert.match(SOURCE.updateAssert.href, /upgrade\.rs#L117-L128$/);
  assert.match(SOURCE.defaultTrue.href, /upgrade\.rs#L94-L100$/);
});
