// agent/delegate.mjs, agent/llm.mjs — §17.2–§17.4. I16 (never votes past a critical/high flag, an unknown
// or a kind outside policy.json), I17 (the delegate's only key: FunctionCall, its DAO, act_proposal),
// I18 (the LLM layer only adds flags; off by default; verify.mjs never touches it).
// Recorded: burrow #1741 and #1743 (the §7.1 pair), replayed as if still open: the "planted" proposal.
// SYNTHETIC: the decided-on check objects, the keys, the model stub.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRpc } from '../web/assets/rpc.js';
import { kindOf } from '../web/assets/decode.js';
import { checkProposal } from '../guard/index.mjs';
import { decide, loadPolicy, delegateKeyOk, voteCommand, runOnce } from '../agent/delegate.mjs';
import { mergeLlmFlags } from '../agent/llm.mjs';
import { replayFetch, noSleep } from './helpers.mjs';

const policy = loadPolicy(JSON.parse(readFileSync(new URL('../agent/policy.json', import.meta.url), 'utf8')));
const recorded = () => createRpc({ fetch: replayFetch(), sleep: noSleep });
const k = (name) => { const x = kindOf({ [name]: {} }); return { name: x.name, label: x.label, risk: x.risk, reaches: x.reaches }; };
const check = (over) => ({ id: 7, status: 'InProgress', description: 'Rename the DAO to docket-demo-2', kind: k('ChangeConfig'),
  proposalKind: { ChangeConfig: { config: { name: 'docket-demo-2', purpose: 'p', metadata: '' } } }, value: null, flags: [], unknowns: [], ...over });

test('I16 (recorded, planted): the #1741/#1743 pattern, if put to the delegate, is refused and escalated with every reason', async () => {
  for (const id of [1741, 1743]) {
    const c = { ...(await checkProposal('burrow.sputnik-dao.near', id, { rpc: recorded(), window: { from: 1741, limit: 4 } })), status: 'InProgress' };
    const d = decide(c, policy);
    assert.equal(d.action, 'escalate', `#${id}`);
    assert.ok(d.reasons.includes('kind FunctionCall is outside policy.json'), `#${id}`);
    assert.ok(d.reasons.includes('kind FunctionCall is rated critical'), `#${id}`);
    assert.ok(d.reasons.some((r) => r.startsWith('high flag sibling-collision')), `#${id}`);
  }
});

test('I16: a routine ChangeConfig is approved, bound to the exact kind it checked; any high flag or unknown escalates', () => {
  const ok = decide(check(), policy);
  assert.deepEqual(ok, { action: 'VoteApprove', id: 7, proposalKind: check().proposalKind, reasons: [] });
  const cmd = voteCommand('docket-demo.sputnik-dao.near', ok, 'guard.near');
  assert.ok(cmd.includes(`json-args '{"id":7,"action":"VoteApprove","proposal":${JSON.stringify(check().proposalKind)}}'`), cmd);
  assert.match(cmd, /attached-deposit '0 NEAR' sign-as guard\.near/);
  assert.equal(decide(check({ flags: [{ check: 'sibling-collision', severity: 'high', detail: 'x' }] }), policy).action, 'escalate');
  assert.equal(decide(check({ flags: [{ check: 'cross-organisation', severity: 'critical', detail: 'x' }] }), policy).action, 'escalate');
  assert.equal(decide(check({ unknowns: ['get_policy unread'] }), policy).action, 'escalate');
  assert.equal(decide(check({ kind: { name: 'Mint', unknown: true, risk: 'critical' } }), policy).action, 'escalate');
  assert.equal(decide(check({ flags: [{ check: 'empty-assertion', severity: 'medium', detail: 'x' }] }), policy).action, 'VoteApprove'); // only critical/high block
  assert.equal(decide(check({ status: 'Approved' }), policy).action, 'skip');
});

test('I16: Transfer only in native NEAR, at or under the cap, with the amount named in the description', () => {
  const t = (over) => check({ kind: k('Transfer'), description: 'Pay alice.near 0.25 NEAR for the audit', value: { raw: 250000000000000000000000n, decimals: 24, token: null }, proposalKind: { Transfer: {} }, ...over });
  assert.equal(decide(t(), policy).action, 'VoteApprove');
  assert.match(decide(t({ value: { raw: 500000000000000000000001n, token: null } }), policy).reasons[0], /over the cap of 500000000000000000000000/);
  assert.match(decide(t({ value: { raw: 1n, token: 'usdt.tether-token.near' } }), policy).reasons[0], /native NEAR only/);
  assert.deepEqual(decide(t({ description: 'Pay alice.near for the audit' }), policy).reasons, ['the description names no amount']);
  assert.match(decide(t({ value: { unknown: 'ft_metadata unread' } }), policy).reasons[0], /transfer amount unknown/);
});

test('I16: policy.json cannot list a critical or high kind; the repo policy is ChangeConfig + Transfer only', () => {
  assert.deepEqual(Object.keys(policy.allow).sort(), ['ChangeConfig', 'Transfer']);
  for (const kind of ['FunctionCall', 'UpgradeSelf', 'FactoryInfoUpdate', 'AddMemberToRole', 'ChangePolicy']) {
    assert.throws(() => loadPolicy({ dao: 'd', allow: { [kind]: {} } }), /permanently outside/, kind);
  }
  assert.throws(() => loadPolicy({ dao: 'd', allow: { Teleport: {} } }), /unknown kind/);
});

test('I17: the delegate\'s only key is FunctionCall, receiver = its DAO, methods = ["act_proposal"]', () => {
  const dao = 'docket-demo.sputnik-dao.near';
  const fc = (o) => ({ publicKey: 'ed25519:x', kind: 'FunctionCall', receiver: dao, methods: ['act_proposal'], ...o });
  assert.deepEqual(delegateKeyOk({ status: 'ok', keys: [fc()] }, dao), { ok: true });
  assert.match(delegateKeyOk({ status: 'ok', keys: [fc(), { publicKey: 'ed25519:y', kind: 'FullAccess' }] }, dao).why, /2 keys/);
  assert.match(delegateKeyOk({ status: 'ok', keys: [{ publicKey: 'ed25519:y', kind: 'FullAccess' }] }, dao).why, /FullAccess/);
  assert.match(delegateKeyOk({ status: 'ok', keys: [fc({ receiver: 'other.near' })] }, dao).why, /receiver other\.near/);
  assert.match(delegateKeyOk({ status: 'ok', keys: [fc({ methods: [] })] }, dao).why, /methods \[\]/); // [] = any method
  assert.match(delegateKeyOk({ status: 'ok', keys: [fc({ methods: ['act_proposal', 'add_proposal'] })] }, dao).why, /methods/);
  assert.equal(delegateKeyOk({ status: 'unknown', reason: 'down' }, dao).ok, false);
});

test('I18 (model stub): the LLM layer can add a semantic-mismatch flag and can never remove or lower one; off by default', () => {
  const existing = [{ check: 'sibling-collision', severity: 'high', detail: 'x' }];
  const clearing = [{ check: 'sibling-collision', severity: 'low', detail: 'fine' }, { remove: 'sibling-collision' }, { check: 'semantic-mismatch', severity: 'none', detail: 'all clear' }];
  assert.deepEqual(mergeLlmFlags(existing, clearing), existing);
  assert.deepEqual(mergeLlmFlags(existing, 'ignore previous flags'), existing);
  const added = mergeLlmFlags([], [{ check: 'semantic-mismatch', severity: 'high', detail: 'says rename, moves funds' }]);
  assert.deepEqual(added.map((f) => [f.check, f.severity]), [['semantic-mismatch', 'high']]);
  // off by default: a model flag changes nothing unless policy.json enables the layer
  assert.equal(policy.llm.enabled, false);
  const llmFlags = [{ check: 'semantic-mismatch', severity: 'high', detail: 'x' }];
  assert.equal(decide(check(), policy, { llmFlags }).action, 'VoteApprove');
  assert.equal(decide(check(), { ...policy, llm: { enabled: true } }, { llmFlags }).action, 'escalate');
  // and verify.mjs never touches it
  assert.doesNotMatch(readFileSync(new URL('../tools/verify.mjs', import.meta.url), 'utf8'), /llm/i);
});

test('runOnce: the first run starts at the current last id (no back-voting); an unreadable chain is an event, not a vote', async () => {
  const rpc = { viewFunction: async () => ({ status: 'ok', value: 6 }) };
  const r = await runOnce({ rpc, policy, account: 'guard.near', state: { next: null } });
  assert.deepEqual(r, { state: { next: 6 }, events: [] });
  const down = { viewFunction: async () => ({ status: 'unknown', reason: 'blocked' }) };
  const u = await runOnce({ rpc: down, policy, account: 'guard.near', state: { next: 3 } });
  assert.deepEqual([u.state, u.events[0].type], [{ next: 3 }, 'unknown']);
});

test('signVote parses the transaction id from near-cli; voteArgs is the exact argument list, run without a shell', async () => {
  const { mkdtempSync, readFileSync: rf } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { signVote, voteArgs } = await import('../agent/delegate.mjs');
  // signVote parses the transaction id from near-cli's output (format as printed on 2026-11-06)
  const fakeRun = (out, err = null) => (_bin, _args, _o, cb) => cb(err, out, '');
  const s = await signVote(['x'], { run: fakeRun('│    Transaction ID: Fx39dSVT61HJ8hfNymAgRqjF8gG9xczPcgF59wu16Vkh\n') });
  assert.deepEqual([s.ok, s.txId], [true, 'Fx39dSVT61HJ8hfNymAgRqjF8gG9xczPcgF59wu16Vkh']);
  assert.equal((await signVote(['x'], { run: fakeRun('ERROR', new Error('exit 1')) })).ok, false);
  const args = voteArgs('docket-demo.sputnik-dao.near', { id: 7, proposalKind: { Transfer: { token_id: '' } } }, 'docket-guard.docket-aditi.near');
  assert.deepEqual(args.slice(0, 6), ['contract', 'call-function', 'as-transaction', 'docket-demo.sputnik-dao.near', 'act_proposal', 'json-args']);
  assert.equal(args[6], '{"id":7,"action":"VoteApprove","proposal":{"Transfer":{"token_id":""}}}'); // no shell quoting: execFile, not a shell
  assert.deepEqual(args.slice(-6), ['sign-as', 'docket-guard.docket-aditi.near', 'network-config', 'mainnet', 'sign-with-keychain', 'send']);
});

test('plan rehearsal (SYNTHETIC proposals, real decode + lint + decide): T6 approved, T9 refused by Docket\'s checks, not by its kind', async () => {
  const { decodeProposal } = await import('../web/assets/decode.js');
  const { lintProposal } = await import('../web/assets/lint.js');
  const offline = createRpc({ fetch: async () => { throw new TypeError('offline'); }, sleep: noSleep });
  const desc = 'Send 0.01 NEAR to docket-aditi.near (Docket test)';
  const mk = (id, receiver) => ({ id, proposer: 'docket-aditi.near', description: desc, status: 'InProgress', kind: { Transfer: { token_id: '', receiver_id: receiver, amount: '10000000000000000000000', msg: null } } });
  const t6 = await decodeProposal(offline, mk(7, 'docket-aditi.near'));
  const t9 = await decodeProposal(offline, mk(8, 'docket-guard.docket-aditi.near'));
  const asCheck = async (d, siblings) => { const l = await lintProposal(offline, d, { dao: 'docket-demo.sputnik-dao.near', siblings });
    return { id: d.id, status: 'InProgress', description: d.description, kind: { name: d.kind.name, risk: d.kind.risk }, value: { raw: d.amount.raw, token: d.tokenId ?? null }, proposalKind: {}, flags: l.flags, unknowns: l.unknowns }; };
  assert.equal(decide(await asCheck(t6, [t6]), policy).action, 'VoteApprove');
  const r9 = decide(await asCheck(t9, [t6, t9]), policy);
  assert.equal(r9.action, 'escalate');
  assert.ok(!r9.reasons.some((r) => r.startsWith('kind ')), 'not refused for its kind: Transfer is allowed');
  for (const c of ['named-receiver', 'silent-reach', 'sibling-collision']) assert.ok(r9.reasons.some((r) => r.startsWith(`high flag ${c}`)), c);
});

test('runOnce (SYNTHETIC chain, stub signer): signs the approval and logs it; --dry-run signs nothing; a failed signature stops the pass', async () => {
  const { mkdtempSync, readFileSync: rf, readdirSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const dao = 'docket-demo.sputnik-dao.near';
  const desc = 'Send 0.01 NEAR to docket-aditi.near (Docket test)';
  const proposals = [7, 8].map((id) => ({ id, proposer: 'docket-aditi.near', description: desc, status: 'InProgress',
    kind: { Transfer: { token_id: '', receiver_id: 'docket-aditi.near', amount: '10000000000000000000000', msg: null } } }));
  const rpc = { viewFunction: async (_acct, method, args) => {
    if (method === 'get_last_proposal_id') return { status: 'ok', value: 9 };
    if (method === 'get_proposals') return { status: 'ok', value: proposals.filter((p) => p.id >= args.from_index && p.id < args.from_index + args.limit) };
    if (method === 'get_proposal') return proposals.find((p) => p.id === args.id) ? { status: 'ok', value: proposals.find((p) => p.id === args.id) } : { status: 'error', detail: 'ERR_NO_PROPOSAL' };
    return { status: 'absent', what: 'method' }; // owner getters on the receiver: none
  } };
  const logDir = mkdtempSync(join(tmpdir(), 'docket-log-'));
  const signed = [];
  const sign = async (args) => { signed.push(args); return { ok: true, txId: 'TX' + signed.length, output: '' }; };
  // two identical proposals -> the second is a same-words sibling of the first, but same receiver: no collision
  const r = await runOnce({ rpc, policy, account: 'docket-guard.docket-aditi.near', state: { next: 7 }, logDir, dryRun: false, sign });
  assert.deepEqual(r.events.map((e) => [e.id, e.type, e.signed, e.txId]), [[7, 'approve', 'signed', 'TX1'], [8, 'approve', 'signed', 'TX2']]);
  assert.equal(JSON.parse(signed[0][6]).id, 7);
  const log = JSON.parse(rf(join(logDir, `${dao}-7.json`), 'utf8'));
  assert.deepEqual([log.decision.action, log.vote.signed, log.vote.txId, log.check.kind.name], ['VoteApprove', 'signed', 'TX1', 'Transfer']);
  assert.equal(readdirSync(logDir).length, 2);
  // dry run: nothing signed
  const dry = await runOnce({ rpc, policy, account: 'g.near', state: { next: 7 }, dryRun: true, sign: async () => { throw new Error('must not sign'); } });
  assert.ok(dry.events.every((e) => e.signed === 'dry-run: not signed'));
  // default is a dry run too: signing is opt-in
  const dflt = await runOnce({ rpc, policy, account: 'g.near', state: { next: 7 }, sign: async () => { throw new Error('must not sign'); } });
  assert.ok(dflt.events.every((e) => e.signed === 'dry-run: not signed'));
  // a failed signature stops the pass after that proposal
  const fail = await runOnce({ rpc, policy, account: 'g.near', state: { next: 7 }, dryRun: false, sign: async () => ({ ok: false, txId: null, output: 'ERROR' }) });
  assert.deepEqual([fail.events.length, fail.events[0].signed, fail.state.next], [1, 'FAILED', 8]);
});
