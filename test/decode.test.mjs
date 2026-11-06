// decode.js — I7 (exhaustive taxonomy, unknown is dangerous), I8 (undecodable args are a refusal),
// I10 (BigInt + ft_metadata decimals), and the permission/threshold model from policy.rs.
// Real proposals and token metadata replay from test/fixtures/ (recorded on mainnet 2026-11-06).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRpc } from '../web/assets/rpc.js';
import { KINDS, KIND_COUNT, kindOf, permits, rolesPermitting, thresholdFor, whoCanPass, decodeArgs,
  parseJsonLossless, formatUnits, tokenAmount, tokenDecimals, decodeProposal } from '../web/assets/decode.js';
import { replayFetch, loadFixture, jsonResponse, noSleep } from './helpers.mjs';

const rpc = () => createRpc({ fetch: replayFetch(), sleep: noSleep });
const callResult = (name) => JSON.parse(Buffer.from(loadFixture(name).body.result.result).toString());

// to_policy_label() at 2b0f34a38604, proposals.rs lines 125–147, in source order.
const SOURCE_LABELS = [
  ['ChangeConfig', 'config'], ['ChangePolicy', 'policy'], ['AddMemberToRole', 'add_member_to_role'],
  ['RemoveMemberFromRole', 'remove_member_from_role'], ['FunctionCall', 'call'], ['UpgradeSelf', 'upgrade_self'],
  ['UpgradeRemote', 'upgrade_remote'], ['Transfer', 'transfer'], ['SetStakingContract', 'set_vote_token'],
  ['AddBounty', 'add_bounty'], ['BountyDone', 'bounty_done'], ['Vote', 'vote'], ['FactoryInfoUpdate', 'factory_info_update'],
  ['ChangePolicyAddOrUpdateRole', 'policy_add_or_update_role'], ['ChangePolicyRemoveRole', 'policy_remove_role'],
  ['ChangePolicyUpdateDefaultVotePolicy', 'policy_update_default_vote_policy'], ['ChangePolicyUpdateParameters', 'policy_update_parameters'],
];

// ---- I7 ----
test('I7: exactly the 17 deployed ProposalKind variants, each with its source label', () => {
  assert.equal(Object.keys(KINDS).length, KIND_COUNT);
  assert.equal(SOURCE_LABELS.length, 17);
  assert.deepEqual(Object.keys(KINDS).sort(), SOURCE_LABELS.map(([k]) => k).sort());
  for (const [k, label] of SOURCE_LABELS) assert.equal(KINDS[k].label, label, k);
  for (const k of Object.values(KINDS)) assert.ok(['critical', 'high', 'medium', 'low', 'none'].includes(k.risk));
});

test('I7: a SYNTHETIC 18th variant is unknown and critical, never a known kind', () => {
  const k = kindOf({ DelegateTreasury: { to: 'x.near' } });
  assert.equal(k.status, 'unknown');
  assert.equal(k.risk, 'critical');
  assert.match(k.reason, /not one of the 17/);
  assert.equal(kindOf({ Transfer: {}, FunctionCall: {} }).status, 'unknown'); // two keys
  assert.equal(kindOf(null).status, 'unknown');
  assert.equal(kindOf(42).risk, 'critical');
  assert.equal(kindOf('toString').status, 'unknown'); // no prototype leakage
});

test('I7: "Vote" arrives as a bare string (unit variant) and is known', () => {
  assert.deepEqual([kindOf('Vote').status, kindOf('Vote').label], ['ok', 'vote']);
});

// ---- permissions + thresholds (policy.rs) ----
test('permits: exact, kind:*, *:action, *:* — and nothing else', () => {
  assert.ok(permits(['call:VoteApprove'], 'call', 'VoteApprove'));
  assert.ok(permits(['call:*'], 'call', 'VoteApprove'));
  assert.ok(permits(['*:VoteApprove'], 'call', 'VoteApprove'));
  assert.ok(permits(['*:*'], 'call', 'VoteApprove'));
  assert.ok(!permits(['call:VoteReject', 'policy:VoteApprove', '*:Finalize'], 'call', 'VoteApprove'));
  assert.ok(permits(new Set(['upgrade_self:AddProposal']), 'upgrade_self', 'AddProposal'));
});

test('thresholds match to_weight: [1,2] of 5 -> 3, [55,100] of 4 -> 3, Weight caps at n, quorum wins', () => {
  const pol = (threshold, n, quorum = '0') => ({ default_vote_policy: { weight_kind: 'RoleWeight', quorum, threshold },
    roles: [{ name: 'c', kind: { Group: Array.from({ length: n }, (_, i) => `m${i}.near`) }, permissions: ['*:*'], vote_policy: {} }] });
  assert.deepEqual(thresholdFor(pol([1, 2], 5), 'c', 'call'), { status: 'ok', k: 3n, n: 5n });
  assert.deepEqual(thresholdFor(pol([55, 100], 4), 'c', 'call'), { status: 'ok', k: 3n, n: 4n });
  assert.deepEqual(thresholdFor(pol([1, 2], 1), 'c', 'call'), { status: 'ok', k: 1n, n: 1n });
  assert.deepEqual(thresholdFor(pol('1', 5), 'c', 'call'), { status: 'ok', k: 1n, n: 5n });
  assert.deepEqual(thresholdFor(pol('9', 5), 'c', 'call'), { status: 'ok', k: 5n, n: 5n });
  assert.deepEqual(thresholdFor(pol([1, 2], 5, '4'), 'c', 'call'), { status: 'ok', k: 4n, n: 5n });
});

test('a per-label vote_policy overrides the default', () => {
  const p = { default_vote_policy: { weight_kind: 'RoleWeight', quorum: '0', threshold: [1, 2] },
    roles: [{ name: 'c', kind: { Group: ['a.near', 'b.near', 'c.near'] }, permissions: ['*:*'],
      vote_policy: { upgrade_self: { weight_kind: 'RoleWeight', quorum: '0', threshold: '1' } } }] };
  assert.equal(thresholdFor(p, 'c', 'upgrade_self').k, 1n);
  assert.equal(thresholdFor(p, 'c', 'call').k, 2n);
});

test('Everyone never reaches a threshold (proposal_status: RoleKind::Everyone => continue); token roles are unknown', () => {
  const p = { default_vote_policy: { weight_kind: 'RoleWeight', quorum: '0', threshold: [1, 2] },
    roles: [{ name: 'all', kind: 'Everyone', permissions: ['*:*'], vote_policy: {} },
      { name: 'holders', kind: { Member: '1000' }, permissions: ['*:*'], vote_policy: {} }] };
  assert.equal(thresholdFor(p, 'all', 'policy').status, 'ignored');
  assert.equal(thresholdFor(p, 'holders', 'policy').status, 'unknown');
  const w = whoCanPass(p, 'policy');
  assert.deepEqual(w.passers, []);
  assert.deepEqual(w.ignored.map((x) => x.role), ['all']);
  assert.deepEqual(w.unknown.map((x) => x.role), ['holders']);
});

test('stader-nearx (recorded get_policy): only council can pass `policy`, 3 of 5; `all` is ignored; nobody can add factory_info_update', () => {
  const policy = callResult('2026-11-06.call.stader-nearx.sputnik-dao.near.get_policy.json');
  assert.deepEqual(rolesPermitting(policy, 'policy', 'VoteApprove').sort(), ['all', 'council']);
  const w = whoCanPass(policy, 'policy');
  assert.deepEqual(w.passers.map((p) => [p.role, p.k, p.n]), [['council', 3n, 5n]]);
  assert.deepEqual(w.ignored.map((x) => x.role), ['all']);
  const f = whoCanPass(policy, 'factory_info_update');
  assert.deepEqual([f.proposers, f.passers], [[], []]);
});

// ---- I8 ----
test('I8: malformed base64 is refused, never empty', () => {
  for (const bad of ['%%%', 'abc', 'ew0KICAiaWQiOiA0MzMsDQogICJhY3Rpb24iOiAiVm90ZUFwcHJvdmUiDQp', 'e30=e30=', 7, null]) {
    const r = decodeArgs(bad);
    assert.equal(r.status, 'refused', String(bad));
    assert.ok(r.reason);
  }
});

test('I8: valid base64 decodes to json / text / binary; zero bytes is "empty", explicitly', () => {
  assert.equal(decodeArgs('').status, 'empty');
  assert.equal(decodeArgs(Buffer.from('hello').toString('base64')).status, 'text');
  assert.equal(decodeArgs(Buffer.from([0xff, 0xfe, 0x00]).toString('base64')).status, 'binary');
  assert.equal(decodeArgs('e30=').status, 'json');
});

test('I8: a proposal whose args are undecodable carries the refusal in unknowns', async () => {
  const d = await decodeProposal(rpc(), { id: 1, description: 'x', kind: { FunctionCall: { receiver_id: 'a.near',
    actions: [{ method_name: 'm', args: 'not base64!', deposit: '0', gas: '1' }] } } });
  assert.equal(d.actions[0].args.status, 'refused');
  assert.ok(d.unknowns.some((u) => /not valid base64/.test(u)));
});

// ---- I10 ----
test('I10: integer literals parse to BigInt, exactly; non-integers keep their source text', () => {
  const v = parseJsonLossless('{"a":15500000000000000000000000000000,"b":1.5,"c":[1,"2"],"d":-3}');
  assert.equal(v.a, 15500000000000000000000000000000n);
  assert.deepEqual(v.b, { $number: '1.5' });
  assert.deepEqual(v.c, [1n, '2']);
  assert.equal(v.d, -3n);
  assert.throws(() => parseJsonLossless('{"a":1,}'));
});

test('I10: formatUnits is exact BigInt arithmetic', () => {
  assert.equal(formatUnits('6000000000000000000000000000000', 24), '6,000,000');
  assert.equal(formatUnits(15500000000000000000000000000000n, 24), '15,500,000');
  assert.equal(formatUnits('634981180000', 6), '634,981.18');
  assert.equal(formatUnits('1', 24), '0.000000000000000000000001');
  assert.equal(formatUnits('0', 6), '0');
});

test('I10: 6-dp token (usdt.tether-token.near) and 24-dp token (wrap.near) from recorded ft_metadata', async () => {
  const r = rpc();
  const usdt = await tokenAmount(r, 'usdt.tether-token.near', '1234567');
  assert.deepEqual([usdt.status, usdt.decimals, usdt.display, typeof usdt.raw], ['ok', 6, '1.234567', 'bigint']);
  const wnear = await tokenAmount(r, 'wrap.near', '1234567000000000000000000');
  assert.deepEqual([wnear.status, wnear.decimals, wnear.display], ['ok', 24, '1.234567']);
  const near = await tokenAmount(r, '', '1000000000000000000000000');
  assert.deepEqual([near.decimals, near.display], [24, '1']);
});

test('I10/I2: unreadable ft_metadata is unknown — 24 is never assumed for a token', async () => {
  const blocked = createRpc({ fetch: async () => { throw new TypeError('blocked'); }, sleep: noSleep });
  const t = await tokenDecimals(blocked, 'usdt.tether-token.near');
  assert.equal(t.status, 'unknown');
  const a = await tokenAmount(blocked, 'usdt.tether-token.near', '1000000');
  assert.equal(a.status, 'unknown');
  assert.equal(a.display, undefined);
  const bad = createRpc({ fetch: replayFetch({ override: (p) => (p.method_name === 'ft_metadata'
    ? jsonResponse({ jsonrpc: '2.0', id: 'docket', result: { result: [...Buffer.from('{"decimals":"6"}')], logs: [], block_height: 1, block_hash: 'x' } })
    : undefined) }), sleep: noSleep });
  assert.equal((await tokenDecimals(bad, 'usdt.tether-token.near')).status, 'unknown');
});

// ---- real proposals ----
test('burrow #1741 (recorded): FunctionCall to the dev account, args decoded, supplied_limit exact', async () => {
  const [p1741] = callResult('2026-11-06.call.burrow.sputnik-dao.near.get_proposals.1741-1744.json');
  const d = await decodeProposal(rpc(), p1741);
  assert.deepEqual([d.id, d.kind.name, d.kind.risk, d.receiver], [1741, 'FunctionCall', 'critical', 'br.private-mainnet.ref-dev-team.near']);
  assert.equal(d.actions[0].method, 'update_asset_limit');
  assert.equal(d.actions[0].args.status, 'json');
  assert.deepEqual(d.actions[0].args.value, { token_id: 'meta-pool.near', supplied_limit: '6000000000000000000000000000000' });
  assert.deepEqual(d.unknowns, []);
});

test('marmaj #1016 (recorded): act_proposal on another DAO, args {id: 433, action: VoteApprove}', async () => {
  const d = await decodeProposal(rpc(), callResult('2026-11-06.call.marmaj.sputnik-dao.near.get_proposal.1016.json'));
  assert.equal(d.receiver, 'creatives.sputnik-dao.near');
  assert.equal(d.actions[0].method, 'act_proposal');
  assert.deepEqual(d.actions[0].args.value, { id: 433n, action: 'VoteApprove' });
});
