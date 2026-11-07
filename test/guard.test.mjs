// @docket/guard — §17.1. I9 (no safe field, no score: flags and unknowns only), I2 (a failed read is an
// unknown, never a clean result). Recorded: burrow #1741–#1744 and meta-pool.near, replayed from mainnet.
// SYNTHETIC: the blocked fetch.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRpc } from '../web/assets/rpc.js';
import { checkProposal, checkAccount } from '../guard/index.mjs';
import { replayFetch, noSleep } from './helpers.mjs';

const recorded = () => createRpc({ fetch: replayFetch(), sleep: noSleep });
const W = { from: 1741, limit: 4 };

test('recorded: checkProposal(burrow, 1742) — the target is outside burrow\'s control set; the §6.5 flags fire high', async () => {
  const r = await checkProposal('burrow.sputnik-dao.near', 1742, { rpc: recorded(), window: W });
  assert.deepEqual(r.kind, { name: 'FunctionCall', label: 'call', risk: 'critical', reaches: 'any method on any contract' });
  assert.deepEqual([r.target.account, r.target.insideControlSet], ['br.private-mainnet.ref-dev-team.near', false]);
  const sev = Object.fromEntries(r.flags.map((f) => [`${f.check}:${f.severity}`, true]));
  for (const k of ['named-receiver:high', 'silent-reach:high', 'sibling-collision:high']) assert.ok(sev[k], k);
  assert.deepEqual(r.unknowns, []);
  assert.ok(r.proposalKind.FunctionCall, 'the exact kind object is returned, for binding a vote to it');
});

test('recorded: checkProposal(burrow, 1743) — its own contract, so named-receiver/silent-reach are low; sibling-collision stays high', async () => {
  const r = await checkProposal('burrow.sputnik-dao.near', 1743, { rpc: recorded(), window: W });
  assert.deepEqual([r.target.account, r.target.owner, r.target.insideControlSet], ['contract.main.burrow.near', 'burrow.sputnik-dao.near', true]);
  assert.deepEqual(r.flags.map((f) => `${f.check}:${f.severity}`).sort(), ['named-receiver:low', 'sibling-collision:high', 'silent-reach:low']);
});

test('I9: the result has no safe, verdict or score field — for a proposal and for an account', async () => {
  const p = await checkProposal('burrow.sputnik-dao.near', 1743, { rpc: recorded(), window: W });
  const a = await checkAccount('meta-pool.near', { rpc: recorded() });
  for (const o of [p, a]) for (const k of Object.keys(o)) assert.doesNotMatch(k, /safe|verdict|score|ok|clean|pass/i, k);
});

test('recorded: checkAccount(meta-pool.near) — the factory\'s 3 keys through stnear; owned is a floor', async () => {
  const a = await checkAccount('meta-pool.near', { rpc: recorded() });
  assert.equal(a.noVoteRoots.length, 3);
  assert.ok(a.noVoteRoots.every((r) => r.account === 'sputnik-dao.near' && r.kind === 'FullAccess'));
  assert.deepEqual(a.noVoteRoots[0].path, ['meta-pool.near', 'stnear.sputnik-dao.near', 'sputnik-dao.near']);
  assert.deepEqual(a.owned, { floor: true, accounts: [] });
  assert.deepEqual((await checkAccount('stnear.sputnik-dao.near', { rpc: recorded() })).owned, { floor: true, accounts: ['meta-pool.near'] });
});

test('I2: chain unreachable -> unknowns, no flags invented, no kind guessed', async () => {
  const blocked = createRpc({ fetch: async () => { throw new TypeError('blocked'); }, sleep: noSleep });
  const r = await checkProposal('burrow.sputnik-dao.near', 1743, { rpc: blocked });
  assert.equal(r.kind, null);
  assert.deepEqual(r.flags, []);
  assert.ok(r.unknowns.length >= 1);
  const a = await checkAccount('meta-pool.near', { rpc: blocked });
  assert.ok(a.unknowns.length >= 1);
  assert.equal((await checkProposal('Not A Dao', 1)).unknowns[0], 'invalid input: Not A Dao #1');
});
