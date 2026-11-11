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

test('flowcharts: each tool page draws its three-box flowchart; the homepage draws the proof as two lanes, each linked to its transaction', () => {
  for (const p of ['account', 'register', 'optout']) {
    const html = readFileSync(new URL(`../web/${p}.html`, import.meta.url), 'utf8');
    assert.match(html, /drawFlow\(document\.getElementById\('how'\)/, p);
  }
  const home = readFileSync(new URL('../app/src/Home.jsx', import.meta.url), 'utf8');
  assert.match(home, /className=\{`ends\$\{play \? ' play' : ''\}`\}/);
  // the two lanes are the mainnet opt-out test (ARCHITECTURE.md §16.5): true ran (step 9), false was
  // rejected (step 5), each linked by its transaction; "See the proof" scrolls to them
  assert.match(home, /const TX_TRUE = 'EZw51V5kCMeCCMsmNw5WqDsSUK8R2CHs4WyeK4jTtB1b';/);
  assert.match(home, /const TX_FALSE = '772n4ZWMRtmXwsWuVTSP5F1UkbZ27UNyM9SqVzgXnXFS';/);
  assert.match(home, /<b>Replaced\.<\/b>[^\n]*href=\{TX\(TX_TRUE\)\}/);
  assert.match(home, /<b>Rejected:<\/b>[^\n]*ERR_MUST_BE_SELF_OR_FACTORY[^\n]*href=\{TX\(TX_FALSE\)\}/);
  assert.match(home, /id="proof"/);
  assert.match(home, /href="#proof">See the proof/);
});
