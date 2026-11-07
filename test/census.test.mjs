// census.js + crawl.mjs — §3.3. I11 (buckets true / false / unknown with the denominator; unknown split
// into no-factory-info and unread, never folded into false), I20 (the counter is computed from reads on
// each call, never a stored number), I2 (a failed read is 'unread', never a value).
// Recorded: stnear and burrow, replayed from mainnet responses. SYNTHETIC: the census records, the
// counter's fake chain, and the blocked fetch.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRpc } from '../web/assets/rpc.js';
import { census, bucketOf, liveCounter, pct, BUCKETS } from '../web/assets/census.js';
import { loadFactoryVersions } from '../web/assets/resolve.js';
import { readDao } from '../tools/crawl.mjs';
import { replayFetch, jsonResponse, noSleep } from './helpers.mjs';

test('I11: four buckets, the denominator is every DAO, the share is of the DAOs that answered', () => {
  const recs = [
    ...Array(5).fill(0).map((_, i) => ({ id: `t${i}`, autoUpdate: 'true', factoryId: 'sputnik-dao.near' })),
    { id: 'f1', autoUpdate: 'false', factoryId: 'sputnik-dao.near' },
    { id: 'old', autoUpdate: 'no-factory-info', factoryId: null },
    { id: 'x', autoUpdate: 'unread', factoryId: null },
    { id: 'imp', autoUpdate: 'true', factoryId: 'a'.repeat(64) },
  ];
  const c = census(recs);
  assert.equal(c.denominator, 9);
  assert.deepEqual(c.counts, { true: 6, false: 1, 'no-factory-info': 1, unread: 1 });
  assert.deepEqual(c.shareTrueOfAnswered, { num: 6, den: 7 });
  assert.equal(pct(c.shareTrueOfAnswered), '85.7%');
  assert.deepEqual(c.falseIds, ['f1']);
  assert.deepEqual(c.otherFactories, [{ id: 'imp', factoryId: 'a'.repeat(64) }]);
  assert.deepEqual(BUCKETS, ['true', 'false', 'no-factory-info', 'unread']);
});

test('I2/I11: an unread or absent get_factory_info is never false', () => {
  assert.equal(bucketOf({ status: 'unknown', reason: 'x' }), 'unread');
  assert.equal(bucketOf({ status: 'absent' }), 'no-factory-info');
  assert.equal(bucketOf(undefined), 'unread');
  assert.equal(bucketOf({ status: 'ok', autoUpdate: false }), 'false');
});

test('recorded: readDao on stnear and burrow — buckets, v3 code joined to the factory list, policy summarised', async () => {
  const rpc = createRpc({ fetch: replayFetch(), sleep: noSleep });
  const f = await loadFactoryVersions(rpc);
  const s = await readDao(rpc, 'stnear.sputnik-dao.near', f);
  assert.deepEqual([s.autoUpdate, s.factoryId, s.unread], ['true', 'sputnik-dao.near', []]);
  assert.deepEqual(s.policy.passers, [{ role: 'council', k: '3', n: '4', kinds: 12 }]);
  assert.deepEqual(s.policy.alone, []);
  assert.match(s.balance, /^\d+$/);
  const b = await readDao(rpc, 'burrow.sputnik-dao.near', f);
  assert.equal(b.autoUpdate, 'false');
});

test('I2: every read blocked -> each field unread with a reason, nothing guessed', async () => {
  const rpc = createRpc({ fetch: async () => { throw new TypeError('blocked'); }, sleep: noSleep });
  const r = await readDao(rpc, 'stnear.sputnik-dao.near', { status: 'unknown', reason: 'blocked' });
  assert.equal(r.autoUpdate, 'unread');
  assert.deepEqual([r.code, r.keys, r.policy, r.balance], ['unread', 'unread', 'unread', 'unread']);
  assert.equal(r.unread.length, 4);
});

test('I20 (SYNTHETIC chain): the counter re-reads every DAO on each call; a change on chain changes the count', async () => {
  const state = { 'a.sputnik-dao.near': true, 'b.sputnik-dao.near': true, 'c.sputnik-dao.near': false };
  const reply = (v) => jsonResponse({ jsonrpc: '2.0', id: 'docket', result: { result: [...Buffer.from(JSON.stringify(v))], logs: [], block_height: 1, block_hash: 'x' } });
  let reads = 0;
  const fetch = async (_e, init) => {
    const { params: p } = JSON.parse(init.body);
    if (p.method_name === 'get_number_daos') return reply(3);
    if (p.method_name === 'get_daos') return reply(Object.keys(state));
    if (p.method_name === 'get_factory_info') { reads++; return reply({ factory_id: 'sputnik-dao.near', auto_update: state[p.account_id] }); }
    throw new Error(`unexpected ${p.method_name}`);
  };
  const rpc = () => createRpc({ fetch, sleep: noSleep, cacheMs: 0 });
  const progress = [];
  const one = await liveCounter(rpc(), { onProgress: (p) => progress.push(p.done) });
  assert.deepEqual([one.counts.false, one.denominator, reads], [1, 3, 3]);
  assert.deepEqual(progress, [1, 2, 3]);
  state['b.sputnik-dao.near'] = false;
  const two = await liveCounter(rpc());
  assert.deepEqual([two.counts.false, reads], [2, 6]);
  assert.match(two.readAt, /^\d{4}-\d\d-\d\dT/);
});

test('I2 (SYNTHETIC answer): a get_policy that answers but is not a Sputnik policy is recorded as unrecognised, not unread', async () => {
  const rpc = createRpc({ fetch: replayFetch({ override: (p) => (p.method_name === 'get_policy'
    ? jsonResponse({ jsonrpc: '2.0', id: 'docket', result: { result: [...Buffer.from('{}')], logs: [], block_height: 1, block_hash: 'x' } }) : undefined) }), sleep: noSleep });
  const r = await readDao(rpc, 'stnear.sputnik-dao.near', await loadFactoryVersions(rpc));
  assert.deepEqual(r.policy, { unrecognised: '{}' });
  assert.deepEqual(r.unread, []);
});
