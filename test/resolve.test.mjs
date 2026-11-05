// resolve.js — I2, I3, I4, I12 and §6.2, replaying mainnet responses recorded 2026-11-05.
// The only synthetic account response is the I4 global_contract_account_id case (no mainnet
// account in this project uses that form) and injected transport failures for I2.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRpc } from '../web/assets/rpc.js';
import { resolveOwner, codeIdentity, loadFactoryVersions, factoryInfo, OWNER_GETTERS, isAccountId } from '../web/assets/resolve.js';
import { replayFetch, jsonResponse, noSleep } from './helpers.mjs';

const rpcWith = (opts) => createRpc({ fetch: replayFetch(opts), sleep: noSleep });
const failOn = (pred) => ({ override: (p) => (pred(p) ? jsonResponse({}, 503) : undefined) });

test('§6.2 getter order', () => {
  assert.deepEqual(OWNER_GETTERS.map(([m]) => m), ['get_owner', 'get_owner_id', 'get_config', 'get_metadata', 'get_contract_state']);
  assert.deepEqual(OWNER_GETTERS[2][1], ['owner_id', 'owner', 'owner_account_id', 'admin_id']);
});

test('§2: all five owners and getters resolve from recorded mainnet responses', async () => {
  const rpc = rpcWith();
  const expect = {
    'contract.main.burrow.near': ['burrow.sputnik-dao.near', 'get_config.owner_id'],
    'meta-pool.near': ['stnear.sputnik-dao.near', 'get_owner_id'],
    'nearx.stader-labs.near': ['stader-nearx.sputnik-dao.near', 'get_owner_id'],
    'linear-protocol.near': ['linear.sputnik-dao.near', 'get_owner_id'],
    'v2.ref-finance.near': ['ref-finance.sputnik-dao.near', 'get_owner'],
  };
  for (const [c, [owner, via]] of Object.entries(expect)) {
    const r = await resolveOwner(rpc, c);
    assert.deepEqual([r.status, r.owner, r.via], ['ok', owner, via], c);
  }
});

test('I2: an earlier getter unreadable makes the owner unknown, even if a later one would answer', async () => {
  // meta-pool: get_owner is absent, get_owner_id answers. Make get_owner unreadable.
  const rpc = rpcWith(failOn((p) => p.account_id === 'meta-pool.near' && p.method_name === 'get_owner'));
  const r = await resolveOwner(rpc, 'meta-pool.near');
  assert.equal(r.status, 'unknown');
  assert.equal(r.at, 'get_owner');
  assert.ok(!('owner' in r));
});

test('I2: unreadable getter after the hit does not matter', async () => {
  const rpc = rpcWith(failOn((p) => p.account_id === 'meta-pool.near' && p.method_name === 'get_config'));
  assert.equal((await resolveOwner(rpc, 'meta-pool.near')).owner, 'stnear.sputnik-dao.near');
});

test('missing account is no-account, not none and not unknown', async () => {
  const rpc = rpcWith();
  assert.equal((await resolveOwner(rpc, 'docket-fixture-missing-account.near')).status, 'no-account');
});

test('factory versions load from recorded get_contracts_metadata', async () => {
  const fv = await loadFactoryVersions(rpcWith());
  assert.equal(fv.status, 'ok');
  assert.equal(fv.versions.size, 5);
  assert.equal(fv.defaultHash, 'DtHZA1mUmGYeScEaUoUZYQGGFHSMpnjMCvkr5U9hJXuF');
  assert.deepEqual(fv.versions.get(fv.defaultHash), { version: 'v3.2', commit: '2b0f34a3860460f285307ec2ccf36345acbe05a2' });
});

test('I3: stnear.sputnik-dao.near resolves as v3.2 via global_contract_hash, not "no contract"', async () => {
  const rpc = rpcWith();
  const id = await codeIdentity(rpc, 'stnear.sputnik-dao.near', await loadFactoryVersions(rpc));
  assert.equal(id.form, 'global_hash');
  assert.notEqual(id.form, 'none');
  assert.equal(id.hash, 'DtHZA1mUmGYeScEaUoUZYQGGFHSMpnjMCvkr5U9hJXuF');
  assert.deepEqual([id.version, id.commit.slice(0, 12), id.versionStatus], ['v3.2', '2b0f34a38604', 'published']);
  assert.equal(id.mutableByThirdParty, false);
});

test('I12: local code_hash DAOs join to factory versions', async () => {
  const rpc = rpcWith();
  const fv = await loadFactoryVersions(rpc);
  for (const [dao, v] of [['stader-nearx.sputnik-dao.near', 'v3.0'], ['linear.sputnik-dao.near', 'v3.1'],
    ['burrow.sputnik-dao.near', 'v3.1'], ['ref-finance.sputnik-dao.near', 'v3.1']]) {
    const id = await codeIdentity(rpc, dao, fv);
    assert.deepEqual([id.form, id.version, id.versionStatus], ['local', v, 'published'], dao);
  }
});

test('I12: a hash the factory never published is "unpublished", not an error', async () => {
  const rpc = rpcWith();
  const id = await codeIdentity(rpc, 'sputnik-dao.near', await loadFactoryVersions(rpc));
  assert.deepEqual([id.form, id.versionStatus, id.version], ['local', 'unpublished', null]);
});

test('I12/I2: factory metadata unreadable makes version unknown, not unpublished', async () => {
  const rpc = rpcWith(failOn((p) => p.method_name === 'get_contracts_metadata'));
  const fv = await loadFactoryVersions(rpc);
  assert.equal(fv.status, 'unknown');
  const id = await codeIdentity(rpc, 'linear.sputnik-dao.near', fv);
  assert.equal(id.versionStatus, 'unknown');
});

test('I4: global_contract_account_id is always flagged as a third-party upgrade path (SYNTHETIC)', async () => {
  const body = { jsonrpc: '2.0', id: 'docket', result: { amount: '0', block_hash: 'x', block_height: 1,
    code_hash: '11111111111111111111111111111111', global_contract_account_id: 'publisher.near',
    locked: '0', storage_paid_at: 0, storage_usage: 100 } };
  const rpc = createRpc({ fetch: async () => jsonResponse(body), sleep: noSleep });
  const id = await codeIdentity(rpc, 'some-dao.near', { status: 'ok', versions: new Map() });
  assert.equal(id.form, 'global_account');
  assert.equal(id.account, 'publisher.near');
  assert.equal(id.mutableByThirdParty, true);
  assert.ok(id.flags.includes('third-party-upgrade-path'));
});

test('I2: unreadable view_account is unknown code identity, never "none"', async () => {
  const rpc = rpcWith(failOn((p) => p.request_type === 'view_account'));
  const id = await codeIdentity(rpc, 'stnear.sputnik-dao.near', null);
  assert.equal(id.form, 'unknown');
});

test('§3.3: get_factory_info from recordings', async () => {
  const rpc = rpcWith();
  for (const [d, v] of [['stnear', true], ['stader-nearx', true], ['linear', true], ['burrow', false], ['ref-finance', false]]) {
    const r = await factoryInfo(rpc, `${d}.sputnik-dao.near`);
    assert.deepEqual([r.status, r.factoryId, r.autoUpdate], ['ok', 'sputnik-dao.near', v], d);
  }
});

test('I2: unreadable get_factory_info is unknown, never false', async () => {
  const rpc = rpcWith(failOn((p) => p.method_name === 'get_factory_info'));
  const r = await factoryInfo(rpc, 'stnear.sputnik-dao.near');
  assert.equal(r.status, 'unknown');
  assert.ok(!('autoUpdate' in r));
});

test('isAccountId', () => {
  for (const ok of ['sputnik-dao.near', 'a1', 'contract.main.burrow.near', 'a'.repeat(64)]) assert.ok(isAccountId(ok), ok);
  for (const bad of ['', 'A.near', 'a', '.near', 'a..near', 'a-.near', 'a'.repeat(65), 42, null, {}]) assert.ok(!isAccountId(bad), String(bad));
});
