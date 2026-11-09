// index-view.js / index.html — the finding on one screen. I1 (each figure dated by its read), I2 (an
// unknown term makes the sum unknown, never smaller), I19 (the badge comes from badge.js's live read).
// Recorded: mainnet responses and the DefiLlama snapshot of 2026-11-06. SYNTHETIC: the blocked fetches.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRpc } from '../web/assets/rpc.js';
import { indexReport, usd, share } from '../web/assets/index-view.js';
import { replayFetch, loadFixture, jsonResponse, noSleep } from './helpers.mjs';

const llamaFixture = async () => jsonResponse(loadFixture('2026-11-06.defillama.protocols.near.json').body);
const recorded = () => createRpc({ fetch: replayFetch(), sleep: noSleep });

test('recorded: the §19 sentence — Meta Pool + LiNEAR, both auto_update true, behind 3 factory keys; NearX in NEAR', async () => {
  const r = await indexReport(recorded(), { llamaFetch: llamaFixture });
  assert.equal(r.badge.state, 'not-shipped');
  assert.deepEqual(r.factoryKeys, { full: 3, total: 3 });
  assert.deepEqual(r.rows.map((x) => [x.name, x.owner, x.autoUpdate]), [
    ['Meta Pool', 'stnear.sputnik-dao.near', true], ['LiNEAR', 'linear.sputnik-dao.near', true], ['NearX', 'stader-nearx.sputnik-dao.near', true]]);
  assert.equal(usd(r.exposedUsd), '$126,665,546'); // the §3.3 headline, from the same snapshot
  assert.equal(share(r.exposedUsd, r.lsTotal), '64.4%');
  assert.equal(r.rows[2].usd, null);
  assert.match(r.rows[2].staked.near, /^2,553,885\./);
});

test('I2: DefiLlama unreachable -> the dollar figures are unknown, never 0; the chain rows still read', async () => {
  const r = await indexReport(recorded(), { llamaFetch: async () => { throw new TypeError('blocked'); } });
  assert.equal(r.exposedUsd, 'unknown');
  assert.equal(r.lsTotal, 'unknown');
  assert.equal(usd(r.exposedUsd), 'unknown');
  assert.equal(r.rows[0].autoUpdate, true);
});

test('I2: chain unreachable -> owners and auto_update unknown, the badge unknown, the sum unknown', async () => {
  const r = await indexReport(createRpc({ fetch: async () => { throw new TypeError('blocked'); }, sleep: noSleep }), { llamaFetch: llamaFixture });
  assert.equal(r.badge.state, 'unknown');
  assert.equal(r.factoryKeys, 'unknown');
  assert.ok(r.rows.every((x) => x.autoUpdate === 'unknown'));
  assert.equal(r.exposedUsd, 'unknown');
});

test('index.html: static, textContent only, the counter from the dated census with an on-demand chain recount (I20)', () => {
  const html = readFileSync(new URL('../web/index.html', import.meta.url), 'utf8');
  assert.doesNotMatch(html, /innerHTML|outerHTML|insertAdjacentHTML|document\.write/);
  assert.doesNotMatch(html, /<script[^>]+src=["']https?:/);
  // I20: the dated census is shown at once; the chain recount runs only on the reader's click
  assert.match(html, /addEventListener\('click', async \(\) => \{[\s\S]*?liveCounter\(rpc/);
  assert.equal((html.match(/liveCounter\(rpc/g) ?? []).length, 1);
  assert.match(html, /Recount from the chain now \(about 15 minutes\)/);
  assert.match(html, /census\(Object\.values\(g\.daos\)\)/);
  assert.match(html, /from '\.\/assets\/index-view\.js'/);
  assert.doesNotMatch(html, /\b1[0-9]\b opted out|\b12 opted/); // no stored counter
});

test('RECORDED (I1): the values shown before the live reads are exactly indexReport over the recorded fixtures, rounded; no recorded badge (I19)', async () => {
  const { RECORDED } = await import('../web/assets/index-view.js');
  const r = await indexReport(recorded(), { llamaFetch: llamaFixture });
  assert.deepEqual(RECORDED.factoryKeys, r.factoryKeys);
  assert.equal(RECORDED.exposedUsd, r.exposedUsd);
  assert.equal(RECORDED.lsTotal, r.lsTotal);
  assert.deepEqual(RECORDED.rows.map((x) => [x.name, x.contract, x.slug, x.owner, x.autoUpdate, x.usd, x.staked?.near ?? null]),
    r.rows.map((x) => [x.name, x.contract, x.slug, x.owner, x.autoUpdate, typeof x.usd === 'number' ? Math.round(x.usd) : x.usd, x.staked?.near ?? null]));
  assert.equal(RECORDED.llamaReadAt, loadFixture('2026-11-06.defillama.protocols.near.json').captured_at.replace(/\.\d+Z$/, 'Z'));
  assert.equal('badge' in RECORDED, false);
});

test('onRead: every read reports as it resolves (keys, badge, llama, each owner and factory info, NearX); a throwing callback changes nothing', async () => {
  const seen = [];
  const r = await indexReport(recorded(), { llamaFetch: llamaFixture, onRead: (e) => { seen.push(e.type + (e.i ?? '')); throw new Error('drawing failed'); } });
  for (const t of ['keys', 'badge', 'llama', 'owner0', 'owner1', 'owner2', 'factory-info0', 'factory-info1', 'factory-info2', 'staked2']) assert.ok(seen.includes(t), t);
  assert.equal(usd(r.exposedUsd), '$126,665,546');
});

test('headline (I2, I9): live numbers in plain words; unknown inputs say so; never "safe"', async () => {
  const { headline, RECORDED } = await import('../web/assets/index-view.js');
  assert.equal(headline(RECORDED), '$126.7M of NEAR liquid staking can be rewritten by three keys, without a vote.');
  assert.match(headline({ ...RECORDED, exposedUsd: 'unknown' }), /dollar figure is unknown/);
  assert.match(headline({ ...RECORDED, factoryKeys: 'unknown' }), /how many is unknown/);
  assert.equal(headline({ ...RECORDED, factoryKeys: { full: 1, total: 1 } }), '$126.7M of NEAR liquid staking can be rewritten by one key, without a vote.');
  for (const h of [headline(RECORDED), headline({ ...RECORDED, exposedUsd: 'unknown', factoryKeys: 'unknown' })]) assert.doesNotMatch(h, /\bsafe\b/i);
});

test('site: the stylesheet and the font are local; no page loads a remote stylesheet or font; red means no vote only', () => {
  const css = readFileSync(new URL('../web/assets/site.css', import.meta.url), 'utf8');
  assert.doesNotMatch(css, /url\(\s*["']?(https?:)?\/\//);
  assert.doesNotMatch(css, /@import/);
  assert.match(css, /url\("fonts\/schibsted-grotesk-latin\.woff2"\)/);
  for (const f of ['schibsted-grotesk-latin.woff2', 'schibsted-grotesk-latin-italic.woff2', 'OFL.txt']) assert.ok(readFileSync(new URL(`../web/assets/fonts/${f}`, import.meta.url)).length > 1000, f);
  const html = readFileSync(new URL('../web/index.html', import.meta.url), 'utf8');
  assert.doesNotMatch(html, /<link[^>]+href=["']https?:/);
  // the red token is used only by the no-vote classes
  const redRules = css.split('}').filter((rule) => /var\(--red\)/.test(rule)).map((rule) => rule.split('{')[0].trim());
  for (const sel of redRules) assert.match(sel, /novote|edge-label$/, sel);
});
