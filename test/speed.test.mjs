// Speed without changing an answer: 429 cooldown failover (rpc.js, §9), the shared slim DefiLlama read
// (value.js; I1 read time kept, I2 failures never stored), parallel owner getters with the §6.2 order
// still deciding (resolve.js), and the account report drawn before DefiLlama lands (I2: "reading").
// Responses that mainnet would not produce on demand (429s) are SYNTHETIC.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRpc, ENDPOINTS } from '../web/assets/rpc.js';
import { fetchDefiLlama, slimProtocols, nearTvlFrom, categoryNearTvl, applyCoverageRule, LLAMA_CACHE_KEY, LLAMA_REUSE_MS } from '../web/assets/value.js';
import { resolveOwner } from '../web/assets/resolve.js';
import { valueAtStake } from '../web/assets/account-view.js';
import { replayFetch, jsonResponse, noSleep, loadFixture } from './helpers.mjs';

test('§9: an HTTP 429 fails over at once, and the limited endpoint is tried last until its cooldown ends (SYNTHETIC 429)', async () => {
  let t = 1_000;
  const f = replayFetch({ override: (p, ep) => (ep === ENDPOINTS[0] ? jsonResponse({}, 429) : undefined) });
  const rpc = createRpc({ fetch: f, sleep: noSleep, now: () => t, cacheMs: 0 });
  assert.equal((await rpc.viewFunction('v2.ref-finance.near', 'get_owner')).status, 'ok');
  assert.deepEqual(f.calls.map((c) => c.endpoint), [ENDPOINTS[0], ENDPOINTS[1]]); // no second try on a 429
  f.calls.length = 0;
  assert.equal((await rpc.viewFunction('v2.ref-finance.near', 'get_owner')).status, 'ok');
  assert.deepEqual(f.calls.map((c) => c.endpoint), [ENDPOINTS[1]]); // FastNear cooling: skipped
  t += 5_001; f.calls.length = 0;
  await rpc.viewFunction('v2.ref-finance.near', 'get_owner');
  assert.equal(f.calls[0].endpoint, ENDPOINTS[0]); // cooldown over: §9 order again
});

test('I2: every endpoint rate-limited is still unknown, never a value (SYNTHETIC 429)', async () => {
  const f = replayFetch({ override: () => jsonResponse({}, 429) });
  const r = await createRpc({ fetch: f, sleep: noSleep }).viewAccount('stnear.sputnik-dao.near');
  assert.equal(r.status, 'unknown');
  assert.equal(f.calls.length, 3); // one per endpoint, all three tried
});

test('value.js: the slim list answers every DefiLlama question exactly as the full list does', () => {
  const protocols = loadFixture('2026-11-06.defillama.protocols.near.json').body; // recorded 2026-11-06, NEAR protocols
  assert.ok(protocols.length > 40);
  const slim = slimProtocols(protocols);
  for (const slug of ['meta-pool', 'linear', 'stader', 'burrow-lending', 'no-such-slug']) assert.deepEqual(nearTvlFrom(slim, slug), nearTvlFrom(protocols, slug), slug);
  assert.deepEqual(categoryNearTvl(slim, 'Liquid Staking'), categoryNearTvl(protocols, 'Liquid Staking'));
  assert.deepEqual(applyCoverageRule(slim), applyCoverageRule(protocols));
});

function memoryStorage() { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), m }; }

test('I1: a reused DefiLlama read keeps the time it was actually read; after LLAMA_REUSE_MS it is read again', async () => {
  const storage = memoryStorage(); let n = 0;
  const fetch = async () => { n++; return jsonResponse([{ slug: 'meta-pool', name: 'Meta Pool', category: 'Liquid Staking', chainTvls: { Near: 5, Ethereum: 9 } }]); };
  const t0 = Date.parse('2026-11-09T10:00:00Z');
  const a = await fetchDefiLlama({ fetch, storage, now: t0 });
  const b = await fetchDefiLlama({ fetch, storage, now: t0 + 60_000 });
  assert.equal(n, 1);
  assert.equal(b.readAt, a.readAt); // the original read time, not the reuse time
  assert.equal(b.reused, true);
  assert.equal(nearTvlFrom(b.protocols, 'meta-pool').usd, 5);
  await fetchDefiLlama({ fetch, storage, now: t0 + LLAMA_REUSE_MS + 1 });
  assert.equal(n, 2);
});

test('I2: a failed DefiLlama read is never stored, so it is never reused', async () => {
  const storage = memoryStorage();
  const r = await fetchDefiLlama({ fetch: async () => jsonResponse({}, 503), storage, now: Date.now() });
  assert.equal(r.status, 'unknown');
  assert.equal(storage.getItem(LLAMA_CACHE_KEY), null);
});

test('§6.2: owner getters sent together still answer in order — an unknown earlier getter wins over a later owner (I2)', async () => {
  const f = replayFetch({ override: (p) => (p.method_name === 'get_owner' ? jsonResponse({}, 502) : undefined) });
  const r = await resolveOwner(createRpc({ fetch: f, sleep: noSleep }), 'v2.ref-finance.near');
  assert.equal(r.status, 'unknown');
  assert.equal(r.at, 'get_owner');
  const ok = await resolveOwner(createRpc({ fetch: replayFetch(), sleep: noSleep }), 'v2.ref-finance.near');
  assert.deepEqual([ok.status, ok.owner, ok.via], ['ok', 'ref-finance.sputnik-dao.near', 'get_owner']);
});

test('I2: while DefiLlama is still reading, the value is "reading", never a number', () => {
  const v = valueAtStake('meta-pool.near', { status: 'reading' });
  assert.equal(v.status, 'reading');
  assert.equal(v.usd, undefined);
  assert.match(v.label, /reading DefiLlama/);
});
