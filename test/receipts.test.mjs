// receipts.mjs — the §16.2 verdict comes only from receipts: step 5 must fail on the DAO with
// ERR_MUST_BE_SELF_OR_FACTORY and nothing else; step 9 must not fail at all.
// SYNTHETIC: these tx-status objects are minimal shapes (receipts_outcome[].outcome.{executor_id,status});
// the first real step-5 transaction will be recorded as a fixture on Nov 8.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { judge, outcomes } from '../tools/receipts.mjs';
import { base58 } from '../tools/demo-dao.mjs';

const DAO = 'docket-demo.sputnik-dao.near';
const ok = (executor) => ({ outcome: { executor_id: executor, status: { SuccessValue: '' } } });
const panic = (executor, msg) => ({ outcome: { executor_id: executor, status: { Failure: { ActionError: { index: 0, kind: { FunctionCallError: { ExecutionError: `Smart contract panicked: ${msg}` } } } } } } });
const tx = (...ro) => ({ receipts_outcome: ro });

test('step 5 CONFIRMED only for ERR_MUST_BE_SELF_OR_FACTORY on the DAO, alone', () => {
  assert.equal(judge(tx(ok(DAO), ok('sputnik-dao.near'), panic(DAO, 'ERR_MUST_BE_SELF_OR_FACTORY')), 5, DAO).verdict, 'CONFIRMED');
});

test('step 5 STOP on ERR_NO_HASH, on "Must be contract created by factory", on no failure, on an extra failure', () => {
  assert.equal(judge(tx(ok(DAO), panic('sputnik-dao.near', 'ERR_NO_HASH')), 5, DAO).verdict, 'STOP');
  assert.equal(judge(tx(ok(DAO), panic('sputnik-dao.near', 'Must be contract created by factory')), 5, DAO).verdict, 'STOP');
  const none = judge(tx(ok(DAO), ok('sputnik-dao.near'), ok(DAO)), 5, DAO);
  assert.equal(none.verdict, 'STOP');
  assert.match(none.reason, /NOT blocked/);
  assert.equal(judge(tx(panic(DAO, 'ERR_MUST_BE_SELF_OR_FACTORY'), panic(DAO, 'Exceeded the prepaid gas')), 5, DAO).verdict, 'STOP');
  assert.equal(judge(tx(panic('other.near', 'ERR_MUST_BE_SELF_OR_FACTORY')), 5, DAO).verdict, 'STOP'); // wrong executor
});

test('step 9 (control) CONFIRMED only when no receipt fails', () => {
  assert.equal(judge(tx(ok(DAO), ok('sputnik-dao.near'), ok(DAO), ok(DAO)), 9, DAO).verdict, 'CONFIRMED');
  assert.equal(judge(tx(ok(DAO), panic(DAO, 'ERR_CONTRACT_IS_NOT_INITIALIZED')), 9, DAO).verdict, 'STOP');
});

test('an unexpected RPC shape is STOP, never a pass', () => {
  assert.equal(outcomes({}), null);
  assert.equal(judge({}, 5, DAO).verdict, 'STOP');
  assert.equal(judge(null, 9, DAO).verdict, 'STOP');
});

test('base58: 32 zero bytes is the 32-"1" hash; small vectors', () => {
  assert.equal(base58(new Uint8Array(32)), '11111111111111111111111111111111');
  assert.equal(base58(Uint8Array.from([57])), 'z');
  assert.equal(base58(Uint8Array.from([58])), '21');
  assert.equal(base58(Uint8Array.from([0, 1])), '12');
});
