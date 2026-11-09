// rpc.js — §9 behaviour and I2. Classification cases replay real mainnet responses (2026-11-05)
// from all three endpoints. Synthetic responses are used only for failures mainnet would not
// produce on demand (HTTP 5xx/429, -429 body, timeout, network error) and are marked SYNTHETIC.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRpc, classify, ENDPOINTS } from '../web/assets/rpc.js';
import { loadFixture, replayFetch, jsonResponse, noSleep } from './helpers.mjs';

const D = '2026-11-05';
const params = (rec) => rec.request.params;

test('failover order is FastNear → rpc.mainnet.near.org → near.drpc.org (§9)', () => {
  assert.deepEqual([...ENDPOINTS], ['https://free.rpc.fastnear.com', 'https://rpc.mainnet.near.org', 'https://near.drpc.org']);
});

test('classify: recorded MethodNotFound is absent/method on all three endpoints', () => {
  for (const name of [`${D}.call.meta-pool.near.get_owner.json`,
    `${D}.rpc.mainnet.near.org.call.meta-pool.near.get_owner.json`,
    `${D}.near.drpc.org.call.meta-pool.near.get_owner.json`]) {
    const r = classify(loadFixture(name).body, 'call_function');
    assert.equal(r.status, 'absent', name);
    assert.equal(r.what, 'method', name);
  }
});

test('classify: recorded UNKNOWN_ACCOUNT is absent/account on all three endpoints', () => {
  for (const name of [`${D}.view_account.docket-fixture-missing-account.near.json`,
    `${D}.rpc.mainnet.near.org.view_account.docket-fixture-missing-account.near.json`,
    `${D}.near.drpc.org.view_account.docket-fixture-missing-account.near.json`]) {
    const r = classify(loadFixture(name).body, 'view_account');
    assert.deepEqual([r.status, r.what], ['absent', 'account'], name);
  }
});

test('viewFunction decodes a recorded return (v2.ref-finance.near get_owner)', async () => {
  const rpc = createRpc({ fetch: replayFetch(), sleep: noSleep });
  const r = await rpc.viewFunction('v2.ref-finance.near', 'get_owner');
  assert.equal(r.status, 'ok');
  assert.equal(r.value, 'ref-finance.sputnik-dao.near');
});

test('transport failures fail over in order and then succeed', async () => {
  // SYNTHETIC: endpoint 1 network error, endpoint 2 HTTP 503; endpoint 3 answers from the recording.
  const f = replayFetch({ override: (p, ep) => {
    if (ep === ENDPOINTS[0]) throw new TypeError('fetch failed');
    if (ep === ENDPOINTS[1]) return jsonResponse({}, 503);
  } });
  const rpc = createRpc({ fetch: f, sleep: noSleep });
  const r = await rpc.viewAccount('stnear.sputnik-dao.near');
  assert.equal(r.status, 'ok');
  assert.equal(r.value.global_contract_hash, 'DtHZA1mUmGYeScEaUoUZYQGGFHSMpnjMCvkr5U9hJXuF');
  assert.deepEqual(f.calls.map((c) => c.endpoint), [ENDPOINTS[0], ENDPOINTS[0], ENDPOINTS[1], ENDPOINTS[1], ENDPOINTS[2]]);
});

test('a -429 JSON-RPC body is transport, not an answer (SYNTHETIC body)', async () => {
  const f = replayFetch({ override: (p, ep) => ep === ENDPOINTS[0]
    ? jsonResponse({ jsonrpc: '2.0', id: 'docket', error: { code: -429, message: 'Too Many Requests' } }) : undefined });
  const rpc = createRpc({ fetch: f, sleep: noSleep });
  const r = await rpc.viewFunction('v2.ref-finance.near', 'get_owner');
  assert.equal(r.status, 'ok');
  assert.equal(f.calls.at(-1).endpoint, ENDPOINTS[1]);
});

test('an answer (absent) does not fail over', async () => {
  const f = replayFetch();
  const rpc = createRpc({ fetch: f, sleep: noSleep });
  const r = await rpc.viewFunction('meta-pool.near', 'get_owner');
  assert.equal(r.status, 'absent');
  assert.equal(f.calls.length, 1);
});

test('I2: every endpoint failing yields unknown — never a value, never absent', async () => {
  const f = replayFetch({ override: () => jsonResponse({}, 502) });
  const rpc = createRpc({ fetch: f, sleep: noSleep });
  const r = await rpc.viewAccount('stnear.sputnik-dao.near');
  assert.equal(r.status, 'unknown');
  assert.equal(r.attempts.length, 6);
  assert.ok(!('value' in r));
});

test('I2: unknown is not cached — the next read retries', async () => {
  let fail = true;
  const f = replayFetch({ override: () => (fail ? jsonResponse({}, 502) : undefined) });
  const rpc = createRpc({ fetch: f, sleep: noSleep });
  assert.equal((await rpc.viewAccount('stnear.sputnik-dao.near')).status, 'unknown');
  fail = false;
  assert.equal((await rpc.viewAccount('stnear.sputnik-dao.near')).status, 'ok');
});

test('timeout is a transport failure (10s default; shortened here)', async () => {
  // SYNTHETIC: a fetch that never resolves until aborted.
  const hang = (_, init) => new Promise((_, rej) => init.signal.addEventListener('abort', () => rej(new DOMException('aborted', 'AbortError'))));
  const rpc = createRpc({ fetch: hang, sleep: noSleep, timeoutMs: 20, firstTimeoutMs: 20 });
  const r = await rpc.viewAccount('stnear.sputnik-dao.near');
  assert.equal(r.status, 'unknown');
  assert.match(r.reason, /timeout 20ms/);
  assert.equal(createRpc({ fetch: hang }).options.timeoutMs, 10_000);
});

test('concurrency never exceeds 6 (§9)', async () => {
  let active = 0, peak = 0;
  const base = replayFetch();
  const slow = async (ep, init) => { active++; peak = Math.max(peak, active); await new Promise((r) => setTimeout(r, 5)); try { return await base(ep, init); } finally { active--; } };
  const rpc = createRpc({ fetch: slow, sleep: noSleep });
  const ids = ['contract.main.burrow.near', 'meta-pool.near', 'nearx.stader-labs.near', 'linear-protocol.near', 'v2.ref-finance.near'];
  const getters = ['get_owner', 'get_owner_id', 'get_config', 'get_metadata', 'get_contract_state'];
  await Promise.all(ids.flatMap((id) => getters.map((g) => rpc.viewFunction(id, g))));
  assert.equal(peak, 6);
  assert.equal(rpc.stats.maxActive, 6);
});

test('identical reads within 8s are cached; after 8s they are re-read', async () => {
  let t = 0;
  const f = replayFetch();
  const rpc = createRpc({ fetch: f, sleep: noSleep, now: () => t });
  await rpc.viewAccount('stnear.sputnik-dao.near');
  t = 7_999; await rpc.viewAccount('stnear.sputnik-dao.near');
  assert.equal(f.calls.length, 1);
  t = 8_000; await rpc.viewAccount('stnear.sputnik-dao.near');
  assert.equal(f.calls.length, 2);
});

test('identical concurrent reads are coalesced into one request', async () => {
  const f = replayFetch();
  const rpc = createRpc({ fetch: f, sleep: noSleep });
  await Promise.all([1, 2, 3].map(() => rpc.viewAccount('stnear.sputnik-dao.near')));
  assert.equal(f.calls.length, 1);
});

test('rpc.js imports nothing Node-specific (browser-safe)', async () => {
  const { readFile } = await import('node:fs/promises');
  const src = await readFile(new URL('../web/assets/rpc.js', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /\bimport\b|\brequire\(|\bBuffer\b|\bprocess\./);
});

test('recorded fixture params match what rpc.js sends', () => {
  assert.deepEqual(params(loadFixture(`${D}.call.v2.ref-finance.near.get_owner.json`)).args_base64, 'e30=');
});
