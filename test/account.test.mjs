// account-view.js / account.html — §8 item 1. I2 (a failed read is unknown, the roots shown are "reached
// so far"), I9 (no verdict: an empty root set is not a clearance), I3/I4 (code identity in words).
// Recorded: meta-pool.near, contract.main.burrow.near, lst.rhealab.near, replayed from mainnet responses.
// SYNTHETIC: the code-identity objects in the explainCode test, and the blocked fetch.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRpc } from '../web/assets/rpc.js';
import { accountReport, explainCode, hopsOf, CHECKED_BUILD } from '../web/assets/account-view.js';
import { replayFetch, noSleep } from './helpers.mjs';

const recorded = () => createRpc({ fetch: replayFetch(), sleep: noSleep });
const FACTORY_KEYS = ['ed25519:2gtDEwdLuUBawzFLAnCS9gUso3Ph76bRzMpVrtb66f3J', 'ed25519:3z2MnvQqD3dsUPynZpV8CFtyXhFiTksjZhjDr26isEXv', 'ed25519:7ReZXfft58fzSLyCB6A5qQ719DCaDo8etYrat75KFXp3'];

test('recorded: meta-pool.near — the §3.4 path in words: owner, then auto_update, then the factory\'s 3 keys', async () => {
  const r = await accountReport(recorded(), 'meta-pool.near');
  assert.equal(r.status, 'ok');
  assert.match(r.headline, /^3 keys, on 1 account, can change meta-pool\.near with no vote/);
  assert.equal(r.groups.length, 1);
  const g = r.groups[0];
  assert.deepEqual(g.path, ['meta-pool.near', 'stnear.sputnik-dao.near', 'sputnik-dao.near']);
  assert.deepEqual(g.hops.map((h) => h.type), ['owner via get_owner_id', 'auto_update']);
  assert.match(g.hops[1].text, /auto_update: true.*not a proposal: no vote/);
  assert.deepEqual(g.keys.map((k) => k.publicKey).sort(), FACTORY_KEYS);
  assert.ok(g.keys.every((k) => k.kind === 'FullAccess'));
  // the explainer: where the opt-out closes the path, the factory default read live, the DAO's own vote for contrast
  assert.deepEqual(r.optOut, ['stnear.sputnik-dao.near']);
  assert.equal(r.explainer.factoryDefault.version, 'v3.2');
  assert.ok(r.explainer.factoryDefault.commit.startsWith(CHECKED_BUILD));
  assert.deepEqual(r.votes.map((v) => [v.dao, v.role, String(v.k), String(v.n)]), [['stnear.sputnik-dao.near', 'council', '3', '4']]);
});

test('recorded: contract.main.burrow.near — no key reached, a vote gate; the headline is not a clearance (I9)', async () => {
  const r = await accountReport(recorded(), 'contract.main.burrow.near');
  assert.equal(r.status, 'ok');
  assert.deepEqual(r.groups, []);
  assert.deepEqual(r.gates, ['burrow.sputnik-dao.near']);
  assert.match(r.headline, /^No key reaches .*This is not a clearance/);
  assert.doesNotMatch(r.headline, /\bsafe\b/i);
  assert.equal(r.explainer, null);
});

test('recorded: lst.rhealab.near — one key on rhealab.near, through the owner edge; no Sputnik explainer', async () => {
  const r = await accountReport(recorded(), 'lst.rhealab.near');
  assert.match(r.headline, /^1 key, on 1 account/);
  assert.deepEqual(r.groups[0].path, ['lst.rhealab.near', 'rhealab.near']);
  assert.equal(r.explainer, null);
});

test('I2: every read blocked -> unknown, never "no key"; invalid and missing accounts say so', async () => {
  const blocked = createRpc({ fetch: async () => { throw new TypeError('blocked'); }, sleep: noSleep });
  const r = await accountReport(blocked, 'meta-pool.near');
  assert.equal(r.status, 'unknown');
  assert.match(r.headline, /^Unknown: \d+ reads failed/);
  assert.doesNotMatch(r.headline, /No key/);
  assert.ok(r.unknowns.length > 0);
  assert.match(explainCode(r.code), /^unknown/);
  assert.equal((await accountReport(recorded(), 'Not An Account')).status, 'invalid');
  assert.equal((await accountReport(recorded(), 'docket-fixture-missing-account.near')).status, 'no-account');
});

test('I3/I4/I12 in words (SYNTHETIC identities): a global contract by account is a third-party upgrade path; versions are joined', () => {
  assert.match(explainCode({ form: 'global_account', account: 'pub.near' }), /published by pub\.near.*third-party upgrade path/);
  assert.match(explainCode({ form: 'global_hash', hash: 'H', versionStatus: 'published', version: 'v3.2', commit: '2b0f34a3860460f2' }), /Sputnik v3\.2, commit 2b0f34a38604/);
  assert.match(explainCode({ form: 'local', hash: 'H', versionStatus: 'unpublished' }), /not one of the Sputnik builds/);
  assert.match(explainCode({ form: 'none' }), /no contract/);
  assert.equal(hopsOf({ account: 'a', edges: [] }, ['a', 'b']), null); // a path the tree does not contain is not invented
});

test('account.html: static, renders with textContent only, imports the model, says what it cannot see', () => {
  const html = readFileSync(new URL('../web/account.html', import.meta.url), 'utf8');
  assert.doesNotMatch(html, /innerHTML|outerHTML|insertAdjacentHTML|document\.write/);
  assert.match(html, /from '\.\/assets\/account-view\.js'/);
  assert.match(html, /What Docket cannot see/);
  assert.match(html, /never a statement that an account is safe/);
  assert.doesNotMatch(html, /<script[^>]+src=["']https?:/); // no remote script
});
