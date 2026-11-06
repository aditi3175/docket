// §6.1 authority walk — I6 (terminates: cycle detection, depth cap 6), I2 (any unread input makes
// the walk unknown), I4 (global_contract_account_id is followed as an upgrade path).
// Recorded: the meta-pool and burrow chains, replayed from mainnet responses (2026-11-05).
// SYNTHETIC: every other account below is invented to exercise an edge no recorded account has.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRpc } from '../web/assets/rpc.js';
import { authorityWalk, accessKeys, WALK_MAX_DEPTH, POLICY_EDGE_LABELS } from '../web/assets/resolve.js';
import { replayFetch, jsonResponse, noSleep } from './helpers.mjs';

const recorded = (opts) => createRpc({ fetch: replayFetch(opts), sleep: noSleep });

test('recorded: meta-pool.near reaches the 3 full-access keys on sputnik-dao.near, with no vote', async () => {
  const w = await authorityWalk(recorded(), 'meta-pool.near');
  assert.equal(w.status, 'ok');
  assert.deepEqual(w.roots.map((r) => [r.account, r.kind]), Array(3).fill(['sputnik-dao.near', 'FullAccess']));
  assert.ok(w.roots.every((r) => r.path.join('>') === 'meta-pool.near>stnear.sputnik-dao.near>sputnik-dao.near'));
  assert.deepEqual(w.voteGates, []);
  // the factory owns itself: its owner edge ends in a cycle, not a further hop
  const dao = w.tree.edges.find((e) => e.to === 'stnear.sputnik-dao.near').node;
  const factory = dao.edges.find((e) => e.type === 'auto_update').node;
  assert.equal(factory.edges.find((e) => e.type.startsWith('owner')).node.terminal, 'cycle');
});

test('recorded: contract.main.burrow.near reaches no key; burrow.sputnik-dao.near is a vote gate', async () => {
  const w = await authorityWalk(recorded(), 'contract.main.burrow.near');
  assert.equal(w.status, 'ok');
  assert.deepEqual(w.roots, []);
  assert.deepEqual(w.voteGates, ['burrow.sputnik-dao.near']);
});

test('recorded: the policy edge is evaluated — stnear council needs 3 of 4, no edge is left unevaluated', async () => {
  const w = await authorityWalk(recorded(), 'meta-pool.near');
  assert.deepEqual(w.notEvaluated, []);
  const stnear = w.policies.find((p) => p.dao === 'stnear.sputnik-dao.near');
  assert.deepEqual(stnear.passers.map((p) => [p.role, p.k, p.n, p.labels.length]), [['council', 3n, 4n, POLICY_EDGE_LABELS.length]]);
  assert.deepEqual(stnear.unpassable, []);
  assert.deepEqual(stnear.ignored.map((g) => g.role), []); // `all` holds only *:AddProposal, no vote
  const dao = w.tree.edges.find((e) => e.to === 'stnear.sputnik-dao.near').node;
  assert.ok(dao.edges.some((e) => e.type === 'policy-vote' && e.k === 3n && e.n === 4n && e.needsVote));
  assert.equal(w.roots.length, 3); // still the factory's three keys, nothing added
  assert.deepEqual(w.policies.map((p) => p.dao), ['stnear.sputnik-dao.near']); // the factory has no get_policy
});

test('recorded: NearX — stader-nearx council 3 of 5; Everyone ignored; 5 kinds nobody can propose (incl. factory_info_update)', async () => {
  const w = await authorityWalk(recorded(), 'nearx.stader-labs.near');
  assert.equal(w.status, 'ok');
  const p = w.policies.find((x) => x.dao === 'stader-nearx.sputnik-dao.near');
  assert.deepEqual(p.passers.map((x) => [x.role, x.k, x.n, x.labels.length]), [['council', 3n, 5n, 7]]);
  assert.deepEqual(p.ignored.map((g) => g.role), ['all']);
  assert.deepEqual(p.unpassable, ['factory_info_update', 'policy_add_or_update_role', 'policy_remove_role',
    'policy_update_default_vote_policy', 'policy_update_parameters']);
});

test('recorded: burrow — auto_update:false vote gate, and the policy edge says the vote is council 3 of 5', async () => {
  const w = await authorityWalk(recorded(), 'contract.main.burrow.near');
  const p = w.policies.find((x) => x.dao === 'burrow.sputnik-dao.near');
  assert.deepEqual(p.passers.map((x) => [x.role, x.k, x.n]), [['council', 3n, 5n]]);
  assert.deepEqual(w.roots, []);
});

test('the policy edge covers exactly the 12 critical/high kinds of §6.4', () => {
  assert.equal(POLICY_EDGE_LABELS.length, 12);
  assert.ok(POLICY_EDGE_LABELS.includes('call') && POLICY_EDGE_LABELS.includes('factory_info_update'));
  assert.ok(!POLICY_EDGE_LABELS.includes('transfer') && !POLICY_EDGE_LABELS.includes('vote') && !POLICY_EDGE_LABELS.includes('config'));
});

test('I2: factory key list unreadable -> the walk is unknown, never "no roots"', async () => {
  const rpc = recorded({ override: (p) => (p.request_type === 'view_access_key_list' && p.account_id === 'sputnik-dao.near' ? jsonResponse({}, 503) : undefined) });
  const w = await authorityWalk(rpc, 'meta-pool.near');
  assert.equal(w.status, 'unknown');
  assert.deepEqual(w.unknowns.map((u) => [u.at, u.read]), [['sputnik-dao.near', 'view_access_key_list']]);
});

test('I2: an owner getter unreadable -> unknown, and the owner edge is not guessed', async () => {
  const rpc = recorded({ override: (p) => (p.account_id === 'meta-pool.near' && p.method_name === 'get_owner' ? jsonResponse({}, 503) : undefined) });
  const w = await authorityWalk(rpc, 'meta-pool.near');
  assert.equal(w.status, 'unknown');
  assert.deepEqual(w.roots, []);
  assert.ok(w.unknowns.some((u) => u.at === 'meta-pool.near' && /owner/.test(u.read)));
});

// ---- SYNTHETIC worlds ----
// world: { [account]: { keys?: [permission], owner?: id, factory?: {factory_id, auto_update}, globalAccount?: id,
//                       policy?: get_policy value | 'unreadable' } }
function synth(world) {
  const view = (body) => jsonResponse({ jsonrpc: '2.0', id: 'docket', result: { ...body, block_height: 1, block_hash: 'x' } });
  const bytes = (v) => [...new TextEncoder().encode(JSON.stringify(v))];
  const notFound = () => view({ error: 'wasm execution failed with error: MethodResolveError(MethodNotFound)', logs: [] });
  return createRpc({ sleep: noSleep, fetch: async (_e, init) => {
    const { params: p } = JSON.parse(init.body);
    const a = world[p.account_id];
    if (!a) return jsonResponse({ jsonrpc: '2.0', id: 'docket', error: { cause: { name: 'UNKNOWN_ACCOUNT' }, code: -32000 } });
    if (p.request_type === 'view_access_key_list') {
      return view({ keys: (a.keys ?? []).map((perm, i) => ({ public_key: `ed25519:synthetic-${p.account_id}-${i}`, access_key: { nonce: 0, permission: perm } })) });
    }
    if (p.request_type === 'view_account') {
      return view({ amount: '0', locked: '0', code_hash: 'SyntheticHash1111111111111111111', storage_usage: 1, storage_paid_at: 0,
        ...(a.globalAccount ? { global_contract_account_id: a.globalAccount } : {}) });
    }
    if (p.method_name === 'get_owner' && a.owner) return view({ result: bytes(a.owner), logs: [] });
    if (p.method_name === 'get_factory_info' && a.factory) return view({ result: bytes(a.factory), logs: [] });
    if (p.method_name === 'get_policy' && a.policy === 'unreadable') return jsonResponse({}, 503);
    if (p.method_name === 'get_policy' && a.policy) return view({ result: bytes(a.policy), logs: [] });
    return notFound();
  } });
}

test('I6 (SYNTHETIC): an owner cycle a -> b -> a terminates and reports the cycle', async () => {
  const w = await authorityWalk(synth({ 'a.near': { owner: 'b.near' }, 'b.near': { owner: 'a.near', keys: ['FullAccess'] } }), 'a.near');
  assert.equal(w.status, 'ok');
  assert.deepEqual(w.roots.map((r) => r.account), ['b.near']);
  const b = w.tree.edges[0].node;
  assert.equal(b.edges.find((e) => e.to === 'a.near').node.terminal, 'cycle');
});

test(`I6 (SYNTHETIC): a chain longer than depth ${WALK_MAX_DEPTH} stops and is unknown, not silently truncated`, async () => {
  const world = {};
  for (let i = 0; i < 10; i++) world[`c${i}.near`] = { owner: `c${i + 1}.near` };
  world['c10.near'] = { keys: ['FullAccess'] };
  const w = await authorityWalk(synth(world), 'c0.near');
  assert.equal(w.status, 'unknown');
  assert.match(w.unknowns[0].reason, /depth cap 6/);
  assert.deepEqual(w.roots, []); // c10's key is beyond the cap: never claimed
});

test('SYNTHETIC: a function-call key is a root, with its receiver and methods', async () => {
  const fc = { FunctionCall: { allowance: null, receiver_id: 'x.near', method_names: ['act_proposal'] } };
  const w = await authorityWalk(synth({ 'x.near': { keys: [fc] } }), 'x.near');
  assert.deepEqual(w.roots.map((r) => [r.kind, r.receiver, r.methods]), [['FunctionCall', 'x.near', ['act_proposal']]]);
  assert.equal(w.tree.edges[0].type, 'function-call-key');
});

test('I4 (SYNTHETIC): global_contract_account_id is followed; the publisher keys are roots', async () => {
  const w = await authorityWalk(synth({ 'app.near': { globalAccount: 'pub.near' }, 'pub.near': { keys: ['FullAccess'] } }), 'app.near');
  assert.equal(w.tree.edges[0].type, 'global_contract_account_id');
  assert.deepEqual(w.roots.map((r) => [r.account, r.path.join('>')]), [['pub.near', 'app.near>pub.near']]);
});

test('SYNTHETIC: a DAO with auto_update:false is a vote gate and the factory is not visited', async () => {
  const w = await authorityWalk(synth({
    'd.f.near': { factory: { factory_id: 'f.near', auto_update: false } },
    'f.near': { keys: ['FullAccess'] },
  }), 'd.f.near');
  assert.deepEqual([w.roots, w.voteGates], [[], ['d.f.near']]);
});

test('SYNTHETIC: a DAO with auto_update:true leads to the factory keys', async () => {
  const w = await authorityWalk(synth({
    'd.f.near': { factory: { factory_id: 'f.near', auto_update: true } },
    'f.near': { keys: ['FullAccess'] },
  }), 'd.f.near');
  assert.deepEqual(w.roots.map((r) => [r.account, r.path.join('>')]), [['f.near', 'd.f.near>f.near']]);
});

test('SYNTHETIC: an account with no keys and nothing to follow is locked', async () => {
  const w = await authorityWalk(synth({ 'l.near': {} }), 'l.near');
  assert.equal(w.tree.locked, true);
  assert.deepEqual(w.roots, []);
});

// ---- §6.1 policy edge (SYNTHETIC policies; the shapes are get_policy's, as recorded) ----
const vp = (threshold, quorum = '0', weight_kind = 'RoleWeight') => ({ weight_kind, quorum, threshold });
const policyOf = (roles, def = vp([1, 2])) => ({ roles, default_vote_policy: def, proposal_bond: '1', proposal_period: '1', bounty_bond: '1', bounty_forgiveness_period: '1' });
const council = (members, permissions = ['*:*'], vote_policy = {}) => ({ name: 'council', kind: { Group: members }, permissions, vote_policy });

test('policy edge (SYNTHETIC): a 1-member council passes code changes alone -> that member is a no-vote root', async () => {
  const w = await authorityWalk(synth({
    'd.f.near': { factory: { factory_id: 'f.near', auto_update: false }, policy: policyOf([council(['solo.near'])]) },
    'solo.near': { keys: ['FullAccess'] },
  }), 'd.f.near');
  assert.equal(w.status, 'ok');
  assert.deepEqual(w.roots.map((r) => [r.account, r.path.join('>')]), [['solo.near', 'd.f.near>solo.near']]);
  assert.deepEqual(w.voteGates, ['d.f.near']); // auto_update:false still gates the factory
  assert.match(w.tree.edges.find((e) => e.to === 'solo.near').type, /^policy: 1 of 1 in "council"/);
});

test('policy edge (SYNTHETIC): threshold Weight("1") of 3 -> each of the 3 members is a root', async () => {
  const w = await authorityWalk(synth({
    'd.f.near': { policy: policyOf([council(['a.near', 'b.near', 'c.near'])], vp('1')) },
    'a.near': { keys: ['FullAccess'] }, 'b.near': { keys: ['FullAccess'] }, 'c.near': { keys: ['FullAccess'] },
  }), 'd.f.near');
  assert.deepEqual(w.roots.map((r) => r.account).sort(), ['a.near', 'b.near', 'c.near']);
});

test('policy edge (SYNTHETIC): a per-kind vote_policy of 1 on upgrade_self alone is enough to make members roots', async () => {
  const w = await authorityWalk(synth({
    'd.f.near': { policy: policyOf([council(['a.near', 'b.near', 'c.near'], ['*:*'], { upgrade_self: vp('1') })]) },
    'a.near': { keys: ['FullAccess'] }, 'b.near': {}, 'c.near': {},
  }), 'd.f.near');
  assert.deepEqual(w.roots.map((r) => r.account), ['a.near']);
  const pe = w.policies[0];
  assert.deepEqual(pe.passers.find((p) => p.k === 1n).labels, ['upgrade_self']);
  assert.equal(pe.passers.find((p) => p.k === 2n).labels.length, 11);
});

test('policy edge (SYNTHETIC): 2 of 3 is a vote — no roots, a policy-vote edge', async () => {
  const w = await authorityWalk(synth({ 'd.f.near': { policy: policyOf([council(['a.near', 'b.near', 'c.near'])]) },
    'a.near': { keys: ['FullAccess'] } }), 'd.f.near');
  assert.deepEqual(w.roots, []);
  assert.ok(w.tree.edges.some((e) => e.type === 'policy-vote' && e.k === 2n && e.n === 3n));
});

test('policy edge (SYNTHETIC): Everyone with *:* never passes anything — ignored, no roots', async () => {
  const w = await authorityWalk(synth({ 'd.f.near': { policy: policyOf([{ name: 'all', kind: 'Everyone', permissions: ['*:*'], vote_policy: {} }]) } }), 'd.f.near');
  assert.equal(w.status, 'ok');
  assert.deepEqual(w.roots, []);
  assert.deepEqual(w.policies[0].ignored.map((g) => [g.role, g.labels.length]), [['all', 12]]);
});

test('policy edge (SYNTHETIC, I2): a token-weighted role or an unreadable policy makes the walk unknown', async () => {
  const tw = await authorityWalk(synth({ 'd.f.near': { policy: policyOf([council(['a.near'])], vp([1, 2], '0', 'TokenWeight')) } }), 'd.f.near');
  assert.equal(tw.status, 'unknown');
  assert.ok(tw.unknowns.some((u) => u.read === 'get_policy' && /TokenWeight/.test(u.reason)));
  const ur = await authorityWalk(synth({ 'd.f.near': { policy: 'unreadable' } }), 'd.f.near');
  assert.equal(ur.status, 'unknown');
  assert.deepEqual(ur.unknowns.map((u) => [u.at, u.read]), [['d.f.near', 'get_policy']]);
});

test('accessKeys: an unrecognised permission is unknown, not dropped (I2)', async () => {
  const k = await accessKeys(synth({ 'q.near': { keys: [{ SomethingNew: {} }] } }), 'q.near');
  assert.equal(k.status, 'unknown');
});
