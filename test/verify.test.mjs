// verify.mjs — the claim set is fixed (I2): an unreadable input makes its claims unknown, never
// skipped. Runs offline: RPC and DefiLlama are injected.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRpc } from '../web/assets/rpc.js';
import { collect, exitCodeFor } from '../tools/verify.mjs';
import { replayFetch, githubReplay, loadFixture, jsonResponse, noSleep } from './helpers.mjs';

const STRUCTURAL = 73; // 38 + the §6.1 policy edge for 5 DAOs + 2 × 13 named opt-outs (§3.3 E1 + the demo DAO) + 4 §17 delegate claims
const GITHUB = 3;
const TVL = 3;
const AMOUNT = 1; // NearX staked NEAR, read on chain (§2)
const TOTAL = STRUCTURAL + GITHUB + TVL + AMOUNT;
const blocked = async () => { throw new TypeError('blocked'); };
const llamaFixture = async () => jsonResponse(loadFixture('2026-11-06.defillama.protocols.near.json').body);
const structural = (r) => r.claims.filter((c) => c.kind === 'structural');

test('recorded mainnet responses: every structural claim confirmed, exit 0', async () => {
  const r = await collect({ rpc: createRpc({ fetch: replayFetch(), sleep: noSleep }), llamaFetch: llamaFixture, githubFetch: githubReplay() });
  assert.equal(structural(r).length, STRUCTURAL);
  assert.deepEqual(structural(r).filter((c) => c.status !== 'confirmed').map((c) => c.what), []);
  assert.equal(exitCodeFor(r.claims), 0);
  assert.equal(r.headline.usd, 126_665_546);
});

test('§3.3 liquid staking from the recorded DefiLlama snapshot: 64.4% held by auto_update:true', async () => {
  const r = await collect({ rpc: createRpc({ fetch: replayFetch(), sleep: noSleep }), llamaFetch: llamaFixture, githubFetch: githubReplay() });
  const tvl = r.claims.filter((c) => c.kind === 'tvl');
  assert.equal(tvl.length, TVL);
  assert.deepEqual(tvl.map((c) => c.status), ['read', 'read', 'read']);
  assert.equal(r.ls.usd, 196_547_976);
  assert.equal((100 * r.lsTrue.usd / r.ls.usd).toFixed(1), '64.4');
});

test('§1/§2 coverage on the snapshot: 4 of 5 — RHEA LST is administered by a key, not a DAO; exclusions listed', async () => {
  const r = await collect({ rpc: createRpc({ fetch: replayFetch(), sleep: noSleep }), llamaFetch: llamaFixture, githubFetch: githubReplay() });
  assert.deepEqual([r.covM, r.covN], [4, 5]);
  const gap = r.covRows.find((c) => !c.sputnik);
  assert.equal(gap.slug, 'rhea-lst');
  assert.match(gap.why, /rhealab.near does not run factory-published Sputnik code/);
  assert.equal(r.claims.find((c) => c.section === '§1/§2').status, 'read');
  assert.ok(r.coverage.excluded.some((e) => e.slug === 'near-intents' && e.category === 'Bridge'));
  assert.deepEqual(r.noOwner.map((o) => o.status), ['none', 'none']);
});

test('coverage: an unreadable owner is named and not counted — 3 of 5, never rounded up', async () => {
  const f = replayFetch({ override: (p) => (p.account_id === 'meta-pool.near' ? jsonResponse({}, 503) : undefined) });
  const r = await collect({ rpc: createRpc({ fetch: f, sleep: noSleep }), llamaFetch: llamaFixture, githubFetch: githubReplay() });
  assert.deepEqual([r.covM, r.covN], [3, 5]);
  const gap = r.covRows.find((c) => c.slug === 'meta-pool-near');
  assert.equal(gap.sputnik, false);
  assert.match(gap.why, /owner unknown/);
  assert.equal(r.claims.find((c) => c.section === '§1/§2').status, 'moved');
  assert.ok(r.warnings.some((w) => /3 of 5/.test(w) && /meta-pool-near/.test(w)));
  assert.equal(exitCodeFor(r.claims), 2); // the structural owner claim is unknown
});

test('§17 I17 (recorded, then SYNTHETIC second key): a full-access key added to the delegate diverges, exit 1; unreadable keys are unknown, exit 2', async () => {
  const GUARD = 'docket-guard.docket-aditi.near';
  const rec = loadFixture('2026-11-07.access_keys.docket-guard.docket-aditi.near.json').body;
  const added = { ...rec, result: { ...rec.result, keys: [...rec.result.keys, { public_key: 'ed25519:11111111111111111111111111111111', access_key: { nonce: 0, permission: 'FullAccess' } }] } };
  const f = replayFetch({ override: (p) => (p.request_type === 'view_access_key_list' && p.account_id === GUARD ? jsonResponse(added) : undefined) });
  const r = await collect({ rpc: createRpc({ fetch: f, sleep: noSleep }), llamaFetch: llamaFixture, githubFetch: githubReplay() });
  const i17 = r.claims.find((c) => c.section === '§17' && /\(I17\)/.test(c.what));
  assert.equal(i17.status, 'diverged');
  assert.equal(i17.actual.length, 2);
  assert.equal(exitCodeFor(r.claims), 1);
  const down = replayFetch({ override: (p) => (p.account_id === GUARD ? jsonResponse({}, 503) : undefined) });
  const u = await collect({ rpc: createRpc({ fetch: down, sleep: noSleep }), llamaFetch: llamaFixture, githubFetch: githubReplay() });
  assert.equal(u.claims.find((c) => c.section === '§17' && /\(I17\)/.test(c.what)).status, 'unverifiable');
  assert.equal(exitCodeFor(u.claims), 2);
});

test('coverage: a protocol the rule selects but Docket has no contract for is named — 4 of 6', async () => {
  // SYNTHETIC DefiLlama entry added to the recorded snapshot
  const body = [...loadFixture('2026-11-06.defillama.protocols.near.json').body,
    { slug: 'docket-synthetic-lend', name: 'Synthetic', category: 'Lending', chainTvls: { Near: 12_000_000 } }];
  const r = await collect({ rpc: createRpc({ fetch: replayFetch(), sleep: noSleep }), llamaFetch: async () => jsonResponse(body), githubFetch: githubReplay() });
  assert.deepEqual([r.covM, r.covN], [4, 6]);
  assert.match(r.covRows.find((c) => c.slug === 'docket-synthetic-lend').why, /no contract mapped/);
  assert.equal(exitCodeFor(r.claims), 0); // coverage is warn-only
});

test('TVL and chain-amount claims never decide the exit code, even when they move', async () => {
  const r = await collect({ rpc: createRpc({ fetch: replayFetch(), sleep: noSleep }), llamaFetch: llamaFixture, githubFetch: githubReplay() });
  const moved = r.claims.map((c) => (c.kind === 'tvl' || c.kind === 'amount' ? { ...c, status: 'moved' } : c));
  assert.equal(exitCodeFor(moved), 0);
});

// ---- §2 / §12.10: RHEA LST is lst.rhealab.near (one key); NearX is read on chain ----
test('§2 RHEA LST: lst.rhealab.near, owned by rhealab.near — no contract, one full-access key, walk ends there', async () => {
  const r = await collect({ rpc: createRpc({ fetch: replayFetch(), sleep: noSleep }), llamaFetch: llamaFixture, githubFetch: githubReplay() });
  const by = (what) => structural(r).find((c) => c.what === what);
  assert.deepEqual(by('lst.rhealab.near owner + getter').actual, ['rhealab.near', 'get_owner_id']);
  assert.equal(by('rhealab.near has no contract (a key, not a DAO)').actual, 'none');
  assert.deepEqual(by('rhealab.near access keys (view_access_key_list)').actual, ['FullAccess']);
  assert.deepEqual(by('lst.rhealab.near no-vote roots, paths, vote gates (§6.1 walk)').actual,
    [['rhealab.near FullAccess'], ['lst.rhealab.near>rhealab.near'], []]);
  assert.ok(!r.autoTrue.some((x) => x.p.slug === 'rhea-lst'), 'RHEA LST is not in the auto_update:true headline');
});

test('§2 NearX: owned by stader-nearx (auto_update true), walks to the factory keys; staked NEAR is BigInt (I10)', async () => {
  const r = await collect({ rpc: createRpc({ fetch: replayFetch(), sleep: noSleep }), llamaFetch: llamaFixture, githubFetch: githubReplay() });
  const by = (what) => structural(r).find((c) => c.what === what);
  assert.deepEqual(by('nearx.stader-labs.near owner + getter').actual, ['stader-nearx.sputnik-dao.near', 'get_owner_id']);
  assert.equal(by('stader-nearx.sputnik-dao.near get_factory_info').status, 'confirmed');
  assert.equal(by('nearx.stader-labs.near no-vote roots, paths, vote gates (§6.1 walk)').status, 'confirmed');
  assert.equal(by('nearx.stader-labs.near get_total_staked_balance returns a U128 (yoctoNEAR)').status, 'confirmed');
  const [row] = r.stakedRows;
  assert.equal(typeof row.near, 'bigint');
  assert.equal(row.near, 2_553_885n);
  assert.equal(r.claims.find((c) => c.kind === 'amount').status, 'read');
});

test('§2 NearX staked NEAR moves >15% (SYNTHETIC): a warning, never a failed claim', async () => {
  const f = replayFetch({ override: (p) => (p.account_id === 'nearx.stader-labs.near' && p.method_name === 'get_total_staked_balance'
    ? jsonResponse({ jsonrpc: '2.0', id: 'docket', result: { result: [...Buffer.from('"1000000000000000000000000000000"')], logs: [], block_height: 1, block_hash: 'x' } })
    : undefined) });
  const r = await collect({ rpc: createRpc({ fetch: f, sleep: noSleep }), llamaFetch: llamaFixture, githubFetch: githubReplay() });
  assert.equal(r.claims.find((c) => c.kind === 'amount').status, 'moved');
  assert.ok(r.warnings.some((w) => /NearX staked NEAR/.test(w) && /1,000,000 NEAR/.test(w)));
  assert.equal(exitCodeFor(r.claims), 0);
});

test('all RPCs blocked: N unknown, N = full claim count, exit 2', async () => {
  const r = await collect({ rpc: createRpc({ fetch: blocked, sleep: noSleep }), llamaFetch: blocked, githubFetch: blocked });
  assert.equal(r.claims.length, TOTAL);
  const unknown = r.claims.filter((c) => c.status === 'unverifiable');
  assert.equal(unknown.length, r.claims.length);
  assert.equal(exitCodeFor(r.claims), 2);
});

test('only the factory unreadable: version claims become unknown, totals unchanged', async () => {
  const f = replayFetch({ override: (p) => (p.account_id === 'sputnik-dao.near' ? jsonResponse({}, 503) : undefined) });
  const r = await collect({ rpc: createRpc({ fetch: f, sleep: noSleep }), llamaFetch: llamaFixture, githubFetch: githubReplay() });
  assert.equal(structural(r).length, STRUCTURAL);
  const unknown = r.claims.filter((c) => c.status === 'unverifiable').map((c) => c.what);
  // 2 factory claims + 5 DAO version claims + the factory's own code claim
  // + §3.4 factory owner and keys + the 3 walks that reach the factory (auto_update:true)
  assert.equal(unknown.length, 13, unknown.join('\n'));
  assert.ok(unknown.every((w) => /sputnik-dao\.near|get_default_code_hash|version|§6\.1 walk/.test(w)));
  assert.deepEqual(unknown.filter((w) => /§6\.1 walk/.test(w)).sort(),
    ['linear-protocol.near', 'meta-pool.near', 'nearx.stader-labs.near'].map((c) => `${c} no-vote roots, paths, vote gates (§6.1 walk)`));
});

test('claim names are the same whether or not reads succeed', async () => {
  const ok = await collect({ rpc: createRpc({ fetch: replayFetch(), sleep: noSleep }), llamaFetch: llamaFixture, githubFetch: githubReplay() });
  const bad = await collect({ rpc: createRpc({ fetch: blocked, sleep: noSleep }), llamaFetch: blocked, githubFetch: blocked });
  assert.deepEqual(structural(bad).map((c) => c.what), structural(ok).map((c) => c.what));
});

test('DefiLlama down never changes the exit code', async () => {
  const r = await collect({ rpc: createRpc({ fetch: replayFetch(), sleep: noSleep }), llamaFetch: blocked, githubFetch: githubReplay() });
  assert.equal(exitCodeFor(r.claims), 0);
  assert.ok(r.warnings.some((w) => /DefiLlama unreachable/.test(w)));
});

// ---- GitHub bucket (§3.4): same exit rules as structural ----
const github = (r) => r.claims.filter((c) => c.kind === 'github');
const rpcOk = () => createRpc({ fetch: replayFetch(), sleep: noSleep });

test('GitHub, recorded: PR #233 merged, fix 2 ahead / 0 behind the deployed commit, dates; exit 0', async () => {
  const r = await collect({ rpc: rpcOk(), llamaFetch: llamaFixture, githubFetch: githubReplay() });
  assert.equal(github(r).length, GITHUB);
  assert.deepEqual(github(r).map((c) => c.status), ['confirmed', 'confirmed', 'confirmed']);
  assert.ok(github(r).every((c) => c.url.startsWith('https://api.github.com/') && c.readAt));
  assert.equal(exitCodeFor(r.claims), 0);
});

test('GitHub rate-limited: its claims are unknown, chain claims unaffected, exit 2 (I2)', async () => {
  const limited = async () => new Response('{}', { status: 403, headers: { 'x-ratelimit-remaining': '0' } });
  const r = await collect({ rpc: rpcOk(), llamaFetch: llamaFixture, githubFetch: limited });
  assert.equal(r.claims.length, TOTAL);
  assert.ok(github(r).every((c) => c.status === 'unverifiable' && /rate limit/.test(c.unknownReason)));
  assert.ok(structural(r).every((c) => c.status === 'confirmed'));
  assert.equal(exitCodeFor(r.claims), 2);
});

test('GitHub diverges (SYNTHETIC: the fix reported as merged into the deployed commit): exit 1', async () => {
  const rec = loadFixture('2026-11-05.github.compare.2b0f34a38604...9e96c75410a9.json');
  const f = githubReplay({ override: (url) => (url.includes('/compare/') ? jsonResponse({ ...rec.body, status: 'identical', ahead_by: 0 }) : undefined) });
  const r = await collect({ rpc: rpcOk(), llamaFetch: llamaFixture, githubFetch: f });
  const d = github(r).filter((c) => c.status === 'diverged');
  assert.equal(d.length, 1);
  assert.deepEqual(d[0].actual, ['identical', 0, 0]);
  assert.equal(exitCodeFor(r.claims), 1);
});

test('GitHub claim names are the same whether or not GitHub answers', async () => {
  const ok = await collect({ rpc: rpcOk(), llamaFetch: llamaFixture, githubFetch: githubReplay() });
  const bad = await collect({ rpc: rpcOk(), llamaFetch: llamaFixture, githubFetch: blocked });
  assert.deepEqual(github(bad).map((c) => c.what), github(ok).map((c) => c.what));
});

test('§3.3 E1: the twelve named opt-outs and the demo DAO each read auto_update:false, set by an approved FactoryInfoUpdate (recorded 2026-11-07)', async () => {
  const r = await collect({ rpc: createRpc({ fetch: replayFetch(), sleep: noSleep }), llamaFetch: llamaFixture, githubFetch: githubReplay() });
  const e1 = structural(r).filter((c) => /§3.3 E1/.test(c.what));
  assert.equal(e1.length, 26);
  assert.deepEqual(e1.filter((c) => c.status !== 'confirmed').map((c) => c.what), []);
  assert.ok(e1.some((c) => c.what === 'docket-demo.sputnik-dao.near opted out: get_factory_info (§3.3 E1)'));
  assert.ok(e1.some((c) => c.what === 'docket-demo.sputnik-dao.near #5 is the approved opt-out (§3.3 E1)'));
});

test('§3.3 E1 (SYNTHETIC): a named DAO back on auto_update:true is a divergence, exit 1; unreadable is unknown, exit 2', async () => {
  const flip = replayFetch({ override: (p) => (p.account_id === 'rhea-lsd.sputnik-dao.near' && p.method_name === 'get_factory_info'
    ? jsonResponse({ jsonrpc: '2.0', id: 'docket', result: { result: [...Buffer.from('{"factory_id":"sputnik-dao.near","auto_update":true}')], logs: [], block_height: 1, block_hash: 'x' } })
    : undefined) });
  const r = await collect({ rpc: createRpc({ fetch: flip, sleep: noSleep }), llamaFetch: llamaFixture, githubFetch: githubReplay() });
  assert.deepEqual(structural(r).filter((c) => c.status === 'diverged').map((c) => c.what), ['rhea-lsd.sputnik-dao.near opted out: get_factory_info (§3.3 E1)']);
  assert.equal(exitCodeFor(r.claims), 1);
  const gone = replayFetch({ override: (p) => (p.account_id === 'unrlzd.sputnik-dao.near' ? jsonResponse({}, 503) : undefined) });
  const g = await collect({ rpc: createRpc({ fetch: gone, sleep: noSleep }), llamaFetch: llamaFixture, githubFetch: githubReplay() });
  assert.deepEqual(g.claims.filter((c) => c.status === 'unverifiable').map((c) => c.what).sort(),
    ['unrlzd.sputnik-dao.near #1 is the approved opt-out (§3.3 E1)', 'unrlzd.sputnik-dao.near opted out: get_factory_info (§3.3 E1)']);
  assert.equal(exitCodeFor(g.claims), 2);
});

test('I1: every claim names the spec section it checks and the read behind it; every read carries its time', async () => {
  const r = await collect({ rpc: createRpc({ fetch: replayFetch(), sleep: noSleep }), llamaFetch: llamaFixture, githubFetch: githubReplay() });
  const ISO = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d+)?Z$/;
  assert.ok(r.claims.length > 0);
  for (const c of r.claims) {
    assert.match(c.section, /^§\d/, c.what);
    assert.ok(typeof c.what === 'string' && c.what.length > 0);
    assert.ok('expected' in c, c.what);
    // a value is either read (actual present) or unknown with its reason, never filled in
    if (c.status === 'unverifiable') assert.ok(c.unknownReason, c.what);
    else assert.ok(c.actual !== undefined, c.what);
  }
  for (const c of r.claims.filter((x) => x.kind === 'github')) { assert.match(c.url, /^https:\/\/api\.github\.com\//); assert.match(c.readAt, ISO); }
  assert.match(r.llama.readAt, ISO); // DefiLlama figures are dated by their read
  assert.ok(r.started instanceof Date); // chain reads are dated by the run
});
