// docket-view.js / docket.html — §8 item 2. I9 (no verdict: "no check fired" is never a clearance),
// I7 (an unknown kind is shown as unknown and critical), I8 (undecodable args are a refusal), I10 (args
// shown as their original text; amounts from BigInt), I2 (a failed read is unknown).
// Recorded: burrow.sputnik-dao.near #1741–#1744 and its header reads, replayed from mainnet responses.
// SYNTHETIC: the decoded proposals in the proposalView tests, and the blocked fetch.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRpc } from '../web/assets/rpc.js';
import { docketReport, proposalView, headerSentence, policySentences } from '../web/assets/docket-view.js';
import { kindOf, decodeArgs } from '../web/assets/decode.js';
import { replayFetch, noSleep } from './helpers.mjs';

const recorded = () => createRpc({ fetch: replayFetch(), sleep: noSleep });

test('recorded: burrow #1741–#1744 — §7.1 pairs flagged, newest first, header says auto_update false (a vote gate)', async () => {
  const r = await docketReport(recorded(), 'burrow.sputnik-dao.near', { from: 1741, limit: 4 });
  assert.equal(r.status, 'ok', r.unknowns.join('; '));
  assert.deepEqual(r.proposals.map((p) => p.id), [1744, 1743, 1742, 1741]);
  for (const p of r.proposals) {
    assert.equal(p.kind.name, 'FunctionCall');
    assert.ok(p.flags.some((f) => f.check === 'sibling-collision'), `#${p.id}`);
    assert.equal(p.note, null);
  }
  assert.match(headerSentence(r.header, r.dao), /auto_update: false/);
  assert.deepEqual(policySentences(r.header.policy), ['3 of 5 in "council" can pass 12 of the 12 code- or rule-changing kinds.']);
  // I10: the supplied limit is shown exactly as it was proposed
  assert.ok(r.proposals.find((p) => p.id === 1742).actions[0].args.includes('"15500000000000000000000000000000"'));
});

const decoded = (over) => ({ id: 1, description: 'Transfer 5 NEAR to alice.near', status: 'InProgress', proposer: 'bob.near',
  kind: kindOf({ Vote: null }), receiver: null, actions: [], unknowns: [], ...over });

test('I9: no flag renders as "no check fired… not a clearance", never safe/clean/score', () => {
  const v = proposalView(decoded({ kind: kindOf('Vote') }), { flags: [], unknowns: [] });
  assert.match(v.note, /^No check fired\. That is not a clearance/);
  const src = readFileSync(new URL('../web/assets/docket-view.js', import.meta.url), 'utf8') + readFileSync(new URL('../web/docket.html', import.meta.url), 'utf8');
  assert.doesNotMatch(src.replace(/is not thereby safe|never "safe", "clean" or a score/g, ''), /\b(safe|clean|score)\b/i);
});

test('I7/I8: an unknown kind is shown unknown + critical; refused args are shown as REFUSED, never empty', () => {
  const u = proposalView(decoded({ kind: kindOf({ MintNewThing: {} }) }), { flags: [{ check: 'unknown-kind', severity: 'critical', detail: 'x' }], unknowns: [] });
  assert.deepEqual([u.kind.unknown, u.kind.risk], [true, 'critical']);
  const r = proposalView(decoded({ kind: kindOf({ FunctionCall: { receiver_id: 'x.near', actions: [] } }), actions: [{ method: 'm', args: decodeArgs('%%%') }] }),
    { flags: [{ check: 'undecodable-args', severity: 'critical', detail: 'x' }], unknowns: [] });
  assert.match(r.actions[0].args, /^REFUSED: /);
  assert.equal(r.actions[0].refused, true);
  assert.equal(proposalView(decoded({ actions: [{ method: 'm', args: decodeArgs('') }] }), { flags: [], unknowns: [] }).actions[0].args, '(no arguments)');
});

test('flags are ordered critical, high, medium, low', () => {
  const v = proposalView(decoded({}), { flags: ['low', 'critical', 'medium', 'high'].map((severity) => ({ check: severity, severity, detail: '' })), unknowns: [] });
  assert.deepEqual(v.flags.map((f) => f.severity), ['critical', 'high', 'medium', 'low']);
});

test('I2: every read blocked -> unknown, no proposals invented; invalid ids refused', async () => {
  const blocked = createRpc({ fetch: async () => { throw new TypeError('blocked'); }, sleep: noSleep });
  const r = await docketReport(blocked, 'burrow.sputnik-dao.near');
  assert.equal(r.status, 'unknown');
  assert.deepEqual(r.proposals, []);
  assert.match(headerSentence(r.header, r.dao), /^Unknown whether/);
  assert.deepEqual(policySentences(r.header.policy), ['unknown: the policy was not read']);
  assert.equal((await docketReport(recorded(), 'Not A Dao')).status, 'invalid');
});

test('docket.html: static, textContent only, no remote script', () => {
  const html = readFileSync(new URL('../web/docket.html', import.meta.url), 'utf8');
  assert.doesNotMatch(html, /innerHTML|outerHTML|insertAdjacentHTML|document\.write/);
  assert.doesNotMatch(html, /<script[^>]+src=["']https?:/);
  assert.match(html, /from '\.\/assets\/docket-view\.js'/);
});
