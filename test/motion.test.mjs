// motion.js and the diagrams are presentation: they may add classes and draw shapes, never write a figure.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = (p) => readFileSync(new URL(`../web/assets/${p}`, import.meta.url), 'utf8');

test('I2: motion.js writes no text: no textContent, innerHTML, innerText or insertAdjacent*', () => {
  const s = src('motion.js').replace(/\/\/[^\n]*/g, '');
  assert.doesNotMatch(s, /textContent|innerHTML|innerText|insertAdjacent|\.append\(|\.prepend\(/);
});

test('motion is off for prefers-reduced-motion, in the script and in both stylesheets', () => {
  assert.match(src('motion.js'), /prefers-reduced-motion: reduce\)'\)\.matches[^;]*return/);
  for (const css of ['site.css', 'home.css']) {
    const s = src(css);
    // the hidden-before-reveal state exists only inside a no-preference block
    assert.match(s, /@media \(prefers-reduced-motion: no-preference\)[\s\S]*\.rv \{ opacity: 0/, css);
    assert.doesNotMatch(s.replace(/@media \(prefers-reduced-motion: no-preference\) \{[\s\S]*?\n\}/g, ''), /\.rv \{ opacity: 0/, css);
  }
});

test('every page and the homepage start motion.js', () => {
  for (const p of ['account', 'docket', 'register', 'optout', 'index']) {
    const html = readFileSync(new URL(`../web/${p}.html`, import.meta.url), 'utf8');
    assert.match(html, /import \{[^}]*startMotion[^}]*\} from '\.\/assets\/motion\.js'/, p);
    assert.match(html, /startMotion\(\)/, p);
  }
  assert.match(readFileSync(new URL('../app/src/Home.jsx', import.meta.url), 'utf8'), /startMotion\(\)/);
});

test('diagrams.js: text only through textContent, never markup; each page draws its own diagram', () => {
  const s = src('diagrams.js');
  assert.doesNotMatch(s, /innerHTML|outerHTML|insertAdjacentHTML|document\.write/);
  const uses = { 'account.html': 'drawTower', 'register.html': 'drawTreemap', 'optout.html': 'drawLock', 'index.html': 'drawWaffle' };
  for (const [page, fn] of Object.entries(uses)) {
    const html = readFileSync(new URL(`../web/${page}`, import.meta.url), 'utf8');
    assert.match(html, new RegExp(String.raw`import \{[^}]*${fn}[^}]*\} from '\./assets/diagrams\.js'`), page);
  }
  assert.match(readFileSync(new URL('../app/src/Home.jsx', import.meta.url), 'utf8'), /drawWaffle\(ref\.current, records, counts\)/);
});

test('I20: the waffle draws the same graph.json records the counts come from, on both homepages', () => {
  assert.match(readFileSync(new URL('../web/index.html', import.meta.url), 'utf8'), /drawWaffle\(\$\('waffle'\), recs, k\)/);
  assert.match(readFileSync(new URL('../app/src/Home.jsx', import.meta.url), 'utf8'), /<Waffle records=\{c\.records\} counts=\{k\} \/>/);
});

test('iso.js (the 3D scenes): text only through textContent, never markup; red only on no-vote classes', () => {
  const s = src('iso.js');
  assert.doesNotMatch(s, /innerHTML|outerHTML|insertAdjacentHTML|document\.write/);
  const css = src('iso.css');
  const red = css.split('}').filter((r) => /var\(--red\)/.test(r)).map((r) => r.split('{')[0].trim());
  assert.ok(red.length > 0);
  for (const sel of red) assert.match(sel, /novote/, sel);
  for (const p of ['account', 'docket', 'register', 'optout']) assert.match(readFileSync(new URL(`../web/${p}.html`, import.meta.url), 'utf8'), /drawSteps\(document\.getElementById\('how'\)/, p);
  assert.match(readFileSync(new URL('../app/src/Home.jsx', import.meta.url), 'utf8'), /drawPathScene\(ref\.current, model\)/);
});
