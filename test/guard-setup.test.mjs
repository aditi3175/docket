// tools/guard-setup.mjs — the §17 mainnet steps. The commands carry the v3.2 shapes exactly, no private key
// can be printed (I13: every generated key goes to the keychain), and the pre-checks never pass on an
// unread chain (I2). SYNTHETIC: the blocked fetch.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRpc } from '../web/assets/rpc.js';
import { STEPS, KINDS, preCheck, GUARD, DAO } from '../tools/guard-setup.mjs';
import { noSleep } from './helpers.mjs';

test('the steps: T1-T9 in order; keys only ever saved to the keychain; JSON args parse; v3.2 kind shapes', () => {
  assert.deepEqual(STEPS.map((s) => s.t), ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8', 'T9']);
  for (const s of STEPS) {
    assert.doesNotMatch(s.cmd, /print-to-terminal|seed-phrase|private|secret/i, s.t);
    const j = s.cmd.match(/json-args '(.*?)' prepaid-gas/);
    if (j) assert.doesNotThrow(() => JSON.parse(j[1]), s.t);
  }
  assert.match(STEPS[0].cmd, /autogenerate-new-keypair save-to-keychain sign-as docket-aditi\.near/);
  assert.match(STEPS[1].cmd, new RegExp(`--contract-account-id ${DAO} --function-names act_proposal autogenerate-new-keypair save-to-keychain`));
  assert.deepEqual(Object.keys(KINDS.seat.AddMemberToRole), ['member_id', 'role']);
  assert.deepEqual(Object.keys(KINDS.routine.Transfer), ['token_id', 'receiver_id', 'amount', 'msg']);
  assert.equal(KINDS.planted.Transfer.receiver_id, GUARD);
  assert.equal(KINDS.routine.Transfer.amount, KINDS.planted.Transfer.amount);
  assert.match(STEPS[6].cmd, /agent\/delegate\.mjs --account docket-guard\.docket-aditi\.near/);
});

test('I2: every pre-check on an unreadable chain is unknown or fail, never PASS', async () => {
  const rpc = createRpc({ fetch: async () => { throw new TypeError('blocked'); }, sleep: noSleep });
  for (const s of STEPS) assert.notEqual((await preCheck(s.t, { rpc })).ok, true, s.t);
});
