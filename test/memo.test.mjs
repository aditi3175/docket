// memo.js: an answer shown before the live read is labelled (I1), only complete answers are kept (I2),
// and amounts come back as BigInt (I10). seed.json is checked against the same rules.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { recall, remember, encode, decode, sameAnswer, MEMO_MAX_AGE_MS } from '../web/assets/memo.js';

function memoryStorage() { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) }; }
const ok = { status: 'ok', headline: 'h', votes: [{ k: 3n, n: 4n }], value: { status: 'ok', usd: 5 } };

test('I10: BigInt survives the round trip as BigInt, never Number', () => {
  const back = decode(encode({ a: 10n ** 30n, b: [1n], c: '7', d: { $bigint: 'x' } }));
  assert.equal(back.a, 10n ** 30n);
  assert.equal(typeof back.b[0], 'bigint');
  assert.equal(back.c, '7');
  assert.deepEqual(back.d, { $bigint: 'x' }); // not a number string: left alone
});

test('I2: only a complete answer is remembered; unknown and partial answers are not', () => {
  const s = memoryStorage();
  assert.equal(remember('account', 'x.near', { ...ok, status: 'unknown' }, '2026-11-09T10:00:00.000Z', { storage: s }), false);
  assert.equal(recall('account', 'x.near', { storage: s }), null);
  assert.equal(remember('account', 'x.near', ok, '2026-11-09T10:00:00.000Z', { storage: s }), true);
});

test('I1: a recalled answer carries its read time and its source; it expires after MEMO_MAX_AGE_MS', () => {
  const s = memoryStorage(); const t = Date.parse('2026-11-09T10:00:00Z');
  remember('account', 'x.near', ok, new Date(t).toISOString(), { storage: s });
  const m = recall('account', 'x.near', { storage: s, now: t + 60_000 });
  assert.deepEqual([m.source, m.readAt], ['browser', '2026-11-09T10:00:00.000Z']);
  assert.equal(m.report.votes[0].k, 3n);
  assert.equal(recall('account', 'x.near', { storage: s, now: t + MEMO_MAX_AGE_MS + 1 }), null);
});

test('the seed is used only when this browser has nothing, and is labelled recorded', () => {
  const seed = { account: { 'x.near': { readAt: '2026-11-09T09:00:00.000Z', report: ok } } };
  const m = recall('account', 'x.near', { storage: memoryStorage(), seed });
  assert.deepEqual([m.source, m.readAt], ['recorded', '2026-11-09T09:00:00.000Z']);
  assert.equal(recall('account', 'x.near', { storage: memoryStorage(), seed: { account: { 'x.near': { readAt: 'x', report: { status: 'unknown' } } } } }), null);
});

test('sameAnswer ignores only the value (DefiLlama moves); any chain difference is a different answer', () => {
  assert.ok(sameAnswer(ok, { ...ok, value: { status: 'ok', usd: 6 } }));
  assert.ok(!sameAnswer(ok, { ...ok, votes: [{ k: 2n, n: 4n }] }));
});

test('I1/I2: seed.json holds only complete answers, each with the time it was read', () => {
  const seed = decode(readFileSync(new URL('../web/assets/seed.json', import.meta.url), 'utf8'));
  assert.match(seed.generatedAt, /^\d{4}-\d\d-\d\dT/);
  const all = [...Object.values(seed.account), ...Object.values(seed.docket)];
  assert.ok(all.length >= 6);
  for (const x of all) { assert.equal(x.report.status, 'ok'); assert.match(x.readAt, /^\d{4}-\d\d-\d\dT\d\d:\d\d/); }
});

test('the account and docket pages label a recalled answer and then the live one', () => {
  for (const p of ['account', 'docket']) {
    const h = readFileSync(new URL(`../web/${p}.html`, import.meta.url), 'utf8');
    assert.match(h, /fresh\(recalledText\(prior\), 'is-recalled'\)/, p);
    assert.match(h, /Live: read from NEAR mainnet/, p);
    assert.match(h, /remember\('(account|docket)'/, p);
  }
});
