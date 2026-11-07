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

test('index.html: static, textContent only, the counter recomputed on load (I20), the badge from badge.js (I19)', () => {
  const html = readFileSync(new URL('../web/index.html', import.meta.url), 'utf8');
  assert.doesNotMatch(html, /innerHTML|outerHTML|insertAdjacentHTML|document\.write/);
  assert.doesNotMatch(html, /<script[^>]+src=["']https?:/);
  assert.match(html, /liveCounter\(rpc/);
  assert.match(html, /from '\.\/assets\/index-view\.js'/);
  assert.doesNotMatch(html, /\b1[0-9]\b opted out|\b12 opted/); // no stored counter
});
