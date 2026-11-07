// lint.js — §6.5 on recorded mainnet proposals: burrow #1741/#1743 and #1742/#1744, marmaj #1016.
// I9: flags only, never a clearance or a score.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRpc } from '../web/assets/rpc.js';
import { decodeProposal } from '../web/assets/decode.js';
import { lintProposal, numeralsInText, accountsInText, CHECKS } from '../web/assets/lint.js';
import { replayFetch, loadFixture, noSleep } from './helpers.mjs';

const rpc = () => createRpc({ fetch: replayFetch(), sleep: noSleep });
const callResult = (name) => JSON.parse(Buffer.from(loadFixture(name).body.result.result).toString());
const checks = (r) => r.flags.map((f) => f.check).sort();

async function burrow() {
  const r = rpc();
  const raw = callResult('2026-11-06.call.burrow.sputnik-dao.near.get_proposals.1741-1744.json');
  const decoded = await Promise.all(raw.map((p) => decodeProposal(r, p)));
  const linted = Object.fromEntries(await Promise.all(decoded.map(async (d) =>
    [d.id, await lintProposal(r, d, { dao: 'burrow.sputnik-dao.near', siblings: decoded })])));
  return { decoded, linted };
}

test('burrow #1741/#1743 and #1742/#1744: sibling collision, named receiver and silent reach fire on all four', async () => {
  const { linted } = await burrow();
  for (const id of [1741, 1742, 1743, 1744]) {
    assert.deepEqual(checks(linted[id]), ['named-receiver', 'sibling-collision', 'silent-reach'], `#${id}`);
    assert.deepEqual(linted[id].unknowns, [], `#${id}`);
  }
  const pair = (id) => linted[id].flags.find((f) => f.check === 'sibling-collision').evidence.siblings.map((s) => s.id);
  assert.deepEqual([pair(1741), pair(1743), pair(1742), pair(1744)], [[1743], [1741], [1744], [1742]]);
  const nr = linted[1741].flags.find((f) => f.check === 'named-receiver');
  assert.match(nr.detail, /does not name the receiver br\.private-mainnet\.ref-dev-team\.near/);
  assert.match(linted[1743].flags.find((f) => f.check === 'named-receiver').detail, /contract\.main\.burrow\.near/);
});

test('burrow: named amounts passes — "6M" and "15.5M" equal supplied_limit at 24 decimals (ft_metadata)', async () => {
  const { linted } = await burrow();
  for (const id of [1741, 1742, 1743, 1744]) assert.ok(!checks(linted[id]).includes('named-amounts'), `#${id}`);
});

test('marmaj #1016: cross-organisation and empty assertion fire', async () => {
  const r = rpc();
  const d = await decodeProposal(r, callResult('2026-11-06.call.marmaj.sputnik-dao.near.get_proposal.1016.json'));
  const l = await lintProposal(r, d, { dao: 'marmaj.sputnik-dao.near', siblings: [] });
  assert.ok(checks(l).includes('cross-organisation'));
  assert.ok(checks(l).includes('empty-assertion'));
  assert.equal(l.flags.find((f) => f.check === 'cross-organisation').severity, 'critical');
  assert.match(l.flags.find((f) => f.check === 'empty-assertion').detail, /3 words: "Solving the Upgrade"/);
});

test('named amounts fires when the description and the decoded amount disagree (SYNTHETIC Transfer, 6-dp token)', async () => {
  const r = rpc();
  const mk = (description, amount) => decodeProposal(r, { id: 9, description,
    kind: { Transfer: { token_id: 'usdt.tether-token.near', receiver_id: 'alice.near', amount, msg: null } } });
  const bad = await lintProposal(r, await mk('Pay alice.near 10 USDt via usdt.tether-token.near', '1000000'), { dao: 'x.sputnik-dao.near' });
  assert.ok(checks(bad).includes('named-amounts'));
  const ok = await lintProposal(r, await mk('Pay alice.near 1 USDt via usdt.tether-token.near', '1000000'), { dao: 'x.sputnik-dao.near' });
  assert.ok(!checks(ok).includes('named-amounts'));
});

test('authority change fires on every one of the nine policy/role kinds (SYNTHETIC)', async () => {
  const r = rpc();
  const kinds = { ChangePolicy: { policy: {} }, ChangePolicyUpdateDefaultVotePolicy: { vote_policy: {} },
    ChangePolicyUpdateParameters: { parameters: {} }, ChangePolicyAddOrUpdateRole: { role: {} },
    ChangePolicyRemoveRole: { role: 'x' }, AddMemberToRole: { member_id: 'a.near', role: 'council' },
    RemoveMemberFromRole: { member_id: 'a.near', role: 'council' }, SetStakingContract: { staking_id: 's.near' },
    FactoryInfoUpdate: { factory_info: { factory_id: 'sputnik-dao.near', auto_update: true } } };
  assert.equal(Object.keys(kinds).length, 9);
  for (const [name, body] of Object.entries(kinds)) {
    const d = await decodeProposal(r, { id: 1, description: 'A long enough description of the change', kind: { [name]: body } });
    assert.ok(checks(await lintProposal(r, d, { dao: 'x.sputnik-dao.near' })).includes('authority-change'), name);
  }
});

test('I7/I8 surface as critical flags: unknown kind, undecodable args', async () => {
  const r = rpc();
  const u = await lintProposal(r, await decodeProposal(r, { id: 1, description: 'Delegate the treasury to x.near now', kind: { DelegateTreasury: {} } }), { dao: 'd.sputnik-dao.near' });
  assert.equal(u.flags.find((f) => f.check === 'unknown-kind').severity, 'critical');
  const b = await lintProposal(r, await decodeProposal(r, { id: 2, description: 'Call m on a.near with some arguments',
    kind: { FunctionCall: { receiver_id: 'a.near', actions: [{ method_name: 'm', args: '!!', deposit: '0', gas: '1' }] } } }), { dao: 'd.sputnik-dao.near' });
  assert.equal(b.flags.find((f) => f.check === 'undecodable-args').severity, 'critical');
});

test('I9: the result is flags + unknowns only — no safe, verdict, score or clear field, even with no flags', async () => {
  const r = rpc();
  const d = await decodeProposal(r, { id: 3, description: 'Update the DAO name and purpose text', kind: { ChangeConfig: { config: {} } } });
  const l = await lintProposal(r, d, { dao: 'd.sputnik-dao.near' });
  assert.deepEqual(Object.keys(l).sort(), ['flags', 'unknowns']);
  assert.deepEqual(l.flags, []);
  for (const f of CHECKS) assert.ok(!/safe|clear|score/i.test(f));
});

test('I9 (copy): lint.js source never produces a safe/score/verdict field', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../web/assets/lint.js', import.meta.url), 'utf8').split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
  assert.doesNotMatch(src, /\b(safe|score|verdict|cleared?)\s*:/i);
});

test('text helpers: numerals and account ids', () => {
  assert.deepEqual(numeralsInText('to 6M, then 15.5M; vote #433; 1,000 and 2.5k').map((n) => n.text), ['6M', '15.5M', '1,000', '2.5k']);
  assert.deepEqual(accountsInText('Set stNEAR(meta-pool.near) and rNEAR(lst.rhealab.near).'), ['meta-pool.near', 'lst.rhealab.near']);
});

test('§6.3 control set (SYNTHETIC decoded proposal): a receiver the DAO owns lowers named-receiver and silent-reach to low; the flags stay (I9); outside stays high', async () => {
  const { lintProposal } = await import('../web/assets/lint.js');
  const { kindOf, decodeArgs } = await import('../web/assets/decode.js');
  const d = { id: 9, description: 'Set NEAR supplied_limit to 3.6M', status: 'Approved', kind: kindOf({ FunctionCall: {} }),
    receiver: 'own.near', actions: [{ method: 'update_asset_limit', args: decodeArgs(Buffer.from('{"token_id":"wrap.near"}').toString('base64')) }], unknowns: [] };
  const blocked = createRpc({ fetch: async () => { throw new TypeError('blocked'); }, sleep: async () => {} });
  const inside = await lintProposal(blocked, d, { dao: 'x.sputnik-dao.near', controlled: new Set(['own.near']) });
  const sev = (r) => r.flags.map((f) => `${f.check}:${f.severity}`).sort();
  // wrap.near is only an argument (token_id): a parameter, a low note either way
  assert.deepEqual(sev(inside), ['named-receiver:low', 'silent-reach:low', 'silent-reach:low']);
  assert.ok(inside.flags.some((f) => f.detail === 'mentions wrap.near in arguments; the description never names it'));
  assert.match(inside.flags.find((f) => f.check === 'named-receiver').detail, /its own contract, owned by x\.sputnik-dao\.near/);
  const outside = await lintProposal(blocked, d, { dao: 'x.sputnik-dao.near' });
  assert.deepEqual(sev(outside), ['named-receiver:high', 'silent-reach:high', 'silent-reach:low']);
  // same checks fire either way: only the severity moves
  assert.deepEqual([...new Set(inside.flags.map((f) => f.check))].sort(), [...new Set(outside.flags.map((f) => f.check))].sort());
});

test('silent reach (SYNTHETIC Transfer): the token contract that moves the funds is a call target, high when outside the control set', async () => {
  const { lintProposal } = await import('../web/assets/lint.js');
  const { kindOf } = await import('../web/assets/decode.js');
  const blocked = createRpc({ fetch: async () => { throw new TypeError('blocked'); }, sleep: async () => {} });
  const d = { id: 3, description: 'Pay alice.near for the audit', status: 'InProgress', kind: kindOf({ Transfer: {} }), receiver: 'alice.near', tokenId: 'tok.near', actions: [], unknowns: [] };
  const r = await lintProposal(blocked, d, { dao: 'x.sputnik-dao.near' });
  assert.deepEqual(r.flags.filter((f) => f.check === 'silent-reach').map((f) => [f.severity, f.evidence.silent]), [['high', ['tok.near']]]);
});
