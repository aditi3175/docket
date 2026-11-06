// optout.js (§16) — I14 (what is given up, above submit), I15 (confirmed only by re-reading),
// §16.1 (drafts only for versions run on mainnet), and the demo-DAO create args (§16.5).
// Recorded mainnet responses (test/fixtures/), plus SYNTHETIC overrides where noted.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRpc } from '../web/assets/rpc.js';
import { planOptOut, confirmOptOut, screenModel, optOutKind, GIVEN_UP, TESTED_VERSIONS } from '../web/assets/optout.js';
import { createArgs, plan as demoPlan } from '../tools/demo-dao.mjs';
import { replayFetch, jsonResponse, noSleep } from './helpers.mjs';

const rpc = (o) => createRpc({ fetch: replayFetch(o), sleep: noSleep });
const factoryInfoAs = (dao, v) => (p) => (p.account_id === dao && p.method_name === 'get_factory_info'
  ? jsonResponse({ jsonrpc: '2.0', id: 'docket', result: { result: [...Buffer.from(JSON.stringify(v))], logs: [], block_height: 1, block_hash: 'x' } }) : undefined);

test('stnear (v3.2, recorded): one proposal, 1 NEAR bond, council 3 of 4, the exact two-field kind', async () => {
  const p = await planOptOut(rpc(), 'stnear.sputnik-dao.near');
  assert.equal(p.status, 'draft');
  assert.deepEqual([p.current.version, p.current.autoUpdate, p.steps, p.bond.near], ['v3.2', true, 1, '1']);
  assert.deepEqual(p.approve.passers.map((x) => [x.role, x.k, x.n]), [['council', 3n, 4n]]);
  assert.deepEqual(p.proposal.proposal.kind, { FactoryInfoUpdate: { factory_info: { factory_id: 'sputnik-dao.near', auto_update: false } } });
  assert.deepEqual(Object.keys(p.proposal.proposal.kind.FactoryInfoUpdate.factory_info), ['factory_id', 'auto_update']);
  assert.match(p.commands.add, /^near contract call-function as-transaction stnear\.sputnik-dao\.near add_proposal json-args '.*' prepaid-gas '100 Tgas' attached-deposit '1 NEAR' sign-as <your-account\.near> network-config mainnet sign-with-keychain send$/);
  assert.match(p.commands.approve, /act_proposal json-args '\{"id":"<id returned by add_proposal>","action":"VoteApprove","proposal":\{"FactoryInfoUpdate"/);
});

test('linear (v3.1, recorded): one proposal, 0.1 NEAR bond, Council 3 of 5', async () => {
  const p = await planOptOut(rpc(), 'linear.sputnik-dao.near');
  assert.deepEqual([p.status, p.current.version, p.bond.near], ['draft', 'v3.1', '0.1']);
  assert.deepEqual(p.approve.passers.map((x) => [x.role, x.k, x.n]), [['Council', 3n, 5n]]);
});

test('stader-nearx (v3.0, recorded): refused — the shape has not been run at v3.0', async () => {
  const p = await planOptOut(rpc(), 'stader-nearx.sputnik-dao.near');
  assert.equal(p.status, 'refused');
  assert.match(p.reason, /runs v3\.0/);
  assert.equal(p.commands, undefined);
  assert.deepEqual(TESTED_VERSIONS, ['v3.1', 'v3.2']);
});

test('stader-nearx with v3.0 counted as tested (SYNTHETIC): still refused — nobody can propose factory_info_update; two steps', async () => {
  const { TESTED_VERSIONS: T } = await import('../web/assets/optout.js');
  // simulate the v3.0 marker removed by planning against a v3.1-identified factory map
  const r = rpc();
  const { loadFactoryVersions } = await import('../web/assets/resolve.js');
  const fv = await loadFactoryVersions(r);
  const relabelled = { ...fv, versions: new Map([...fv.versions].map(([h, v]) => [h, v.version === 'v3.0' ? { ...v, version: 'v3.1' } : v])) };
  const p = await planOptOut(r, 'stader-nearx.sputnik-dao.near', { factory: relabelled });
  assert.equal(p.status, 'refused');
  assert.equal(p.steps, 2);
  assert.match(p.reason, /no role can propose factory_info_update.*ChangePolicy.*3 of 5 council/);
  assert.ok(T.length === 2);
});

test('burrow (recorded): already opted out — nothing drafted', async () => {
  const p = await planOptOut(rpc(), 'burrow.sputnik-dao.near');
  assert.equal(p.status, 'opted-out');
  assert.equal(p.proposal, undefined);
});

test('I2: an unread input makes the plan unknown, never a draft', async () => {
  const p = await planOptOut(rpc({ override: (q) => (q.method_name === 'get_policy' ? jsonResponse({}, 503) : undefined) }), 'stnear.sputnik-dao.near');
  assert.equal(p.status, 'unknown');
  const q = await planOptOut(rpc({ override: (x) => (x.method_name === 'get_factory_info' ? jsonResponse({}, 503) : undefined) }), 'stnear.sputnik-dao.near');
  assert.equal(q.status, 'unknown');
});

test('I15: confirmed only by re-reading get_factory_info — recorded true, recorded false, SYNTHETIC unread', async () => {
  assert.equal((await confirmOptOut(rpc(), 'stnear.sputnik-dao.near')).status, 'not-opted-out');
  assert.equal((await confirmOptOut(rpc(), 'burrow.sputnik-dao.near')).status, 'opted-out');
  assert.equal((await confirmOptOut(rpc({ override: factoryInfoAs('stnear.sputnik-dao.near', { factory_id: 'sputnik-dao.near', auto_update: false }) }), 'stnear.sputnik-dao.near')).status, 'opted-out');
  const u = await confirmOptOut(rpc({ override: (x) => (x.method_name === 'get_factory_info' ? jsonResponse({}, 503) : undefined) }), 'stnear.sputnik-dao.near');
  assert.equal(u.status, 'unknown');
  // optout.js has no code path from a transaction result to "opted-out"
  const src = readFileSync(new URL('../web/assets/optout.js', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /transaction_outcome|SuccessValue|status\.Success/);
});

test('I14 (copy): both things given up are stated, the second labelled source-only, and rendered above submit', async () => {
  assert.equal(GIVEN_UP.length, 2);
  assert.match(GIVEN_UP[0].text, /rescue/);
  assert.match(GIVEN_UP[1].text, /UpgradeSelf no longer works on its own.*three proposals.*no vote/);
  assert.match(GIVEN_UP[1].basis, /not yet run on mainnet/);
  for (const status of ['draft', 'refused', 'opted-out', 'unknown']) {
    const ids = screenModel({ status }).map((s) => s.id);
    assert.ok(ids.indexOf('givenUp') < ids.indexOf('submit'), status);
  }
  const html = readFileSync(new URL('../web/optout.html', import.meta.url), 'utf8');
  assert.match(html, /screenModel\(plan\)/); // the page renders in screenModel order
  assert.doesNotMatch(html, /innerHTML/);     // chain data never becomes markup
});

test('shell safety: no drafted JSON contains a single quote; the builder refuses one', async () => {
  const { nearCli, DESCRIPTION } = await import('../web/assets/optout.js');
  assert.ok(!DESCRIPTION.includes("'"));
  assert.throws(() => nearCli('d.near', 'add_proposal', { proposal: { description: "it's" } }, '1 Tgas', '0 NEAR', 'a.near'), /single quote/);
  for (const t of demoPlan('you.near').txs) {
    const json = t.cmd.match(/json-args '(.*?)' prepaid-gas/)[1];
    assert.doesNotThrow(() => JSON.parse(json), `step ${t.n}`);
    assert.ok(!json.includes("'"), `step ${t.n}`);
  }
});

test('demo DAO --pre: every add/act step has a pre-condition; ids and kinds are re-read, never assumed (SYNTHETIC reads)', async () => {
  const { preStepCheck } = await import('../tools/demo-dao.mjs');
  const p = demoPlan('you.near');
  for (let n = 2; n <= 11; n++) assert.ok(p.pre[n], `step ${n}`);
  assert.equal(p.pre[1], undefined); // step 1 is covered by --check
  const reads = (m) => async (_dao, method, args) => m[`${method} ${JSON.stringify(args)}`] ?? { status: 'unknown', reason: 'no read' };
  // add: last id must equal the id the step creates
  assert.equal((await preStepCheck(p.pre[4], p.dao, { read: reads({ 'get_last_proposal_id {}': { status: 'ok', value: 1 } }) })).ok, true);
  assert.equal((await preStepCheck(p.pre[4], p.dao, { read: reads({ 'get_last_proposal_id {}': { status: 'ok', value: 2 } }) })).ok, false);
  assert.equal((await preStepCheck(p.pre[4], p.dao, { read: reads({}) })).ok, null);
  // act: proposal must be InProgress with exactly the kind about to be approved
  const prop = (kind, status = 'InProgress') => ({ status: 'ok', value: { id: 1, kind, status, proposer: 'you.near' } });
  const us = { UpgradeSelf: { hash: 'DtHZA1mUmGYeScEaUoUZYQGGFHSMpnjMCvkr5U9hJXuF' } };
  assert.equal((await preStepCheck(p.pre[5], p.dao, { read: reads({ 'get_proposal {"id":1}': prop(us) }) })).ok, true);
  assert.equal((await preStepCheck(p.pre[5], p.dao, { read: reads({ 'get_proposal {"id":1}': prop(us, 'Approved') }) })).ok, false);
  const other = { UpgradeSelf: { hash: '8RMeZ5cXDap6TENxaJKtigRYf3n139iHmTRe8ZUNey6N' } };
  const d = await preStepCheck(p.pre[5], p.dao, { read: reads({ 'get_proposal {"id":1}': prop(other) }) });
  assert.deepEqual([d.ok, /DIFFERS/.test(d.detail)], [false, true]);
  // the recorded mainnet deviation: duplicate #4 is rejected (9r) and the closing pair uses id 5
  assert.deepEqual(p.pre['9r'], { type: 'act', id: 4, kind: us });
  assert.equal((await preStepCheck(p.pre[10], p.dao, { read: reads({ 'get_last_proposal_id {}': { status: 'ok', value: 5 } }) })).ok, true);
  assert.equal((await preStepCheck(p.pre[10], p.dao, { read: reads({ 'get_last_proposal_id {}': { status: 'ok', value: 4 } }) })).ok, false);
  assert.equal(p.pre[11].id, 5);
});

test('optOutKind: exactly factory_id + auto_update:false (v3.2 deny_unknown_fields)', () => {
  assert.deepEqual(optOutKind('sputnik-dao.near'), { FactoryInfoUpdate: { factory_info: { factory_id: 'sputnik-dao.near', auto_update: false } } });
});

test('demo DAO (§16.5): create args match the v3.2 field sets exactly; council-only, 1 member; 0.1 NEAR bond', async () => {
  const c = createArgs('you.near');
  assert.equal(c.dao, 'docket-demo.sputnik-dao.near');
  assert.deepEqual(Object.keys(c.args), ['config', 'policy']);
  assert.deepEqual(Object.keys(c.args.config), ['name', 'purpose', 'metadata']);
  assert.deepEqual(Object.keys(c.args.policy).sort(), ['bounty_bond', 'bounty_forgiveness_period', 'default_vote_policy', 'proposal_bond', 'proposal_period', 'roles']);
  for (const r of c.args.policy.roles) assert.deepEqual(Object.keys(r).sort(), ['kind', 'name', 'permissions', 'vote_policy']);
  // council only: no Everyone role, so only the council can add proposals (ids stay predictable)
  assert.deepEqual(c.args.policy.roles.map((r) => [r.name, r.kind]), [['council', { Group: ['you.near'] }]]);
  assert.ok(!c.args.policy.roles.some((r) => r.kind === 'Everyone'));
  // with decode.js's permission model: only council can AddProposal any kind
  const { rolesPermitting } = await import('../web/assets/decode.js');
  for (const label of ['factory_info_update', 'upgrade_self', 'call']) assert.deepEqual(rolesPermitting(c.args.policy, label, 'AddProposal'), ['council']);
  assert.equal(c.args.policy.proposal_bond, '100000000000000000000000');
  assert.deepEqual(JSON.parse(Buffer.from(c.argsBase64, 'base64').toString()), c.args);
  assert.throws(() => createArgs('Not An Account'));
  const p = demoPlan('you.near');
  assert.equal(p.txs.length, 12);
  assert.deepEqual(p.txs.map((t) => t.n), [1, 2, 3, 4, 5, 6, 7, 8, 9, '9r', 10, 11]);
  const r = p.txs[9];
  assert.match(r.cmd, /act_proposal json-args '{"id":4,"action":"VoteReject","proposal":{"UpgradeSelf":{"hash":"DtHZA1mU/);
  assert.ok(!p.txs.some((t) => t.n !== '9r' && /VoteReject/.test(t.cmd)), 'only 9r rejects');
  assert.ok(p.txs[11].cmd.includes('"id":5'));
  assert.ok(p.txs.every((t) => t.expect && t.stop), 'every step states what to expect and when to stop');
  assert.match(p.txs[4].expect, /FAILS with ERR_MUST_BE_SELF_OR_FACTORY/);
  assert.match(p.txs[4].stop, /ERR_NO_HASH/);
  assert.match(p.txs[8].expect, /both succeed/);
  assert.deepEqual([p.txs[4].cmd.includes('"id":1'), p.txs[8].cmd.includes('"id":3')], [true, true]);
  assert.match(p.txs[0].cmd, /^near contract call-function as-transaction sputnik-dao\.near create .* attached-deposit '0\.1 NEAR' sign-as you\.near network-config mainnet sign-with-keychain send$/);
  assert.match(p.txs[4].cmd, /act_proposal json-args '\{"id":1,"action":"VoteApprove","proposal":\{"UpgradeSelf":\{"hash":"DtHZA1mU/);
});
