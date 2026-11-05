// verify.mjs — the claim set is fixed (I2): an unreadable input makes its claims unknown, never
// skipped. Runs offline: RPC and DefiLlama are injected.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRpc } from '../web/assets/rpc.js';
import { collect, exitCodeFor } from '../tools/verify.mjs';
import { replayFetch, loadFixture, jsonResponse, noSleep } from './helpers.mjs';

const STRUCTURAL = 26;
const TVL = 3;
const TOTAL = STRUCTURAL + TVL;
const blocked = async () => { throw new TypeError('blocked'); };
const llamaFixture = async () => jsonResponse(loadFixture('2026-11-05.defillama.protocols.near.json').body);
const structural = (r) => r.claims.filter((c) => c.kind === 'structural');

test('recorded mainnet responses: every structural claim confirmed, exit 0', async () => {
  const r = await collect({ rpc: createRpc({ fetch: replayFetch(), sleep: noSleep }), llamaFetch: llamaFixture });
  assert.equal(structural(r).length, STRUCTURAL);
  assert.deepEqual(structural(r).filter((c) => c.status !== 'confirmed').map((c) => c.what), []);
  assert.equal(exitCodeFor(r.claims), 0);
  assert.equal(r.headline.usd, 199_412_924);
});

test('§3.3 liquid staking from the recorded DefiLlama snapshot: 99.4% held by auto_update:true', async () => {
  const r = await collect({ rpc: createRpc({ fetch: replayFetch(), sleep: noSleep }), llamaFetch: llamaFixture });
  const tvl = r.claims.filter((c) => c.kind === 'tvl');
  assert.equal(tvl.length, TVL);
  assert.deepEqual(tvl.map((c) => c.status), ['read', 'read', 'read']);
  assert.equal(r.ls.usd, 200_526_770);
  assert.equal((100 * r.lsTrue.usd / r.ls.usd).toFixed(1), '99.4');
});

test('§1/§2 coverage on the snapshot: all 5 of 5, exclusions listed', async () => {
  const r = await collect({ rpc: createRpc({ fetch: replayFetch(), sleep: noSleep }), llamaFetch: llamaFixture });
  assert.deepEqual([r.covM, r.covN], [5, 5]);
  assert.ok(r.coverage.excluded.some((e) => e.slug === 'near-intents' && e.category === 'Bridge'));
  assert.deepEqual(r.noOwner.map((o) => o.status), ['none', 'none']);
});

test('coverage: an unreadable owner is named and not counted — 4 of 5, never rounded up', async () => {
  const f = replayFetch({ override: (p) => (p.account_id === 'meta-pool.near' ? jsonResponse({}, 503) : undefined) });
  const r = await collect({ rpc: createRpc({ fetch: f, sleep: noSleep }), llamaFetch: llamaFixture });
  assert.deepEqual([r.covM, r.covN], [4, 5]);
  const gap = r.covRows.find((c) => !c.sputnik);
  assert.equal(gap.slug, 'meta-pool-near');
  assert.match(gap.why, /owner unknown/);
  assert.equal(r.claims.find((c) => c.section === '§1/§2').status, 'moved');
  assert.ok(r.warnings.some((w) => /4 of 5/.test(w) && /meta-pool-near/.test(w)));
  assert.equal(exitCodeFor(r.claims), 2); // the structural owner claim is unknown
});

test('coverage: a protocol the rule selects but Docket has no contract for is named — 5 of 6', async () => {
  // SYNTHETIC DefiLlama entry added to the recorded snapshot
  const body = [...loadFixture('2026-11-05.defillama.protocols.near.json').body,
    { slug: 'docket-synthetic-lend', name: 'Synthetic', category: 'Lending', chainTvls: { Near: 12_000_000 } }];
  const r = await collect({ rpc: createRpc({ fetch: replayFetch(), sleep: noSleep }), llamaFetch: async () => jsonResponse(body) });
  assert.deepEqual([r.covM, r.covN], [5, 6]);
  assert.match(r.covRows.find((c) => c.slug === 'docket-synthetic-lend').why, /no contract mapped/);
  assert.equal(exitCodeFor(r.claims), 0); // coverage is warn-only
});

test('TVL claims never decide the exit code, even when they move', async () => {
  const r = await collect({ rpc: createRpc({ fetch: replayFetch(), sleep: noSleep }), llamaFetch: llamaFixture });
  const moved = r.claims.map((c) => (c.kind === 'tvl' ? { ...c, status: 'moved' } : c));
  assert.equal(exitCodeFor(moved), 0);
});

test('all RPCs blocked: N unknown, N = full claim count, exit 2', async () => {
  const r = await collect({ rpc: createRpc({ fetch: blocked, sleep: noSleep }), llamaFetch: blocked });
  assert.equal(r.claims.length, TOTAL);
  const unknown = r.claims.filter((c) => c.status === 'unverifiable');
  assert.equal(unknown.length, r.claims.length);
  assert.equal(exitCodeFor(r.claims), 2);
});

test('only the factory unreadable: version claims become unknown, totals unchanged', async () => {
  const f = replayFetch({ override: (p) => (p.account_id === 'sputnik-dao.near' ? jsonResponse({}, 503) : undefined) });
  const r = await collect({ rpc: createRpc({ fetch: f, sleep: noSleep }), llamaFetch: llamaFixture });
  assert.equal(structural(r).length, STRUCTURAL);
  const unknown = r.claims.filter((c) => c.status === 'unverifiable').map((c) => c.what);
  // 2 factory claims + 5 DAO version claims + the factory's own code claim
  assert.equal(unknown.length, 8, unknown.join('\n'));
  assert.ok(unknown.every((w) => /sputnik-dao\.near|get_default_code_hash|version/.test(w)));
});

test('claim names are the same whether or not reads succeed', async () => {
  const ok = await collect({ rpc: createRpc({ fetch: replayFetch(), sleep: noSleep }), llamaFetch: llamaFixture });
  const bad = await collect({ rpc: createRpc({ fetch: blocked, sleep: noSleep }), llamaFetch: blocked });
  assert.deepEqual(structural(bad).map((c) => c.what), structural(ok).map((c) => c.what));
});

test('DefiLlama down never changes the exit code', async () => {
  const r = await collect({ rpc: createRpc({ fetch: replayFetch(), sleep: noSleep }), llamaFetch: blocked });
  assert.equal(exitCodeFor(r.claims), 0);
  assert.ok(r.warnings.some((w) => /DefiLlama unreachable/.test(w)));
});
