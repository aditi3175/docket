// wallet.js — §16.3. I13 (nothing in Docket signs: the only signing call is the wallet's own
// signAndSendTransaction; sign-in requests no key), I10 (gas and deposit built from BigInt), and the
// pin (every import is @near-wallet-selector/*@10.1.4).
// SYNTHETIC: the importer below returns stand-in modules, so no network and no wallet are involved.
// The real build was loaded in Chrome on 2026-11-07 (see the header of web/assets/wallet.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { tgasToGas, addProposalTransaction, loadWalletSelector, submitWithWallet, esm, WALLET_MODULES, WALLET_SELECTOR_VERSION } from '../web/assets/wallet.js';

const draft = { status: 'draft', dao: 'x.sputnik-dao.near', bond: { yocto: 1_000_000_000_000_000_000_000_000n },
  proposal: { proposal: { description: 'd', kind: { FactoryInfoUpdate: { factory_info: { factory_id: 'sputnik-dao.near', auto_update: false } } } } } };

test('the add_proposal transaction: receiver = the DAO, deposit = the bond in yocto, gas from Tgas, args = the drafted proposal', () => {
  assert.equal(tgasToGas('100 Tgas'), '100000000000000');
  assert.throws(() => tgasToGas('1.5 Tgas'));
  const tx = addProposalTransaction(draft);
  assert.equal(tx.receiverId, 'x.sputnik-dao.near');
  assert.deepEqual(tx.actions, [{ type: 'FunctionCall', params: { methodName: 'add_proposal', args: draft.proposal, gas: '100000000000000', deposit: '1000000000000000000000000' } }]);
  for (const status of ['opted-out', 'refused', 'unknown']) assert.throws(() => addProposalTransaction({ ...draft, status }), /nothing to submit/);
});

test('pin: every module is @near-wallet-selector/<pkg>@10.1.4 on esm.sh; sign-in passes no contractId (I13)', async () => {
  const asked = []; let modalOpts = null; let setupArgs = null;
  const fakes = {
    core: { setupWalletSelector: async (o) => { setupArgs = o; return { id: 'selector' }; } },
    'modal-ui': { setupModal: (s, o) => { modalOpts = o; return { id: 'modal' }; } },
  };
  for (const [pkg, fn] of WALLET_MODULES) fakes[pkg] = { [fn]: () => ({ module: pkg }) };
  const importer = async (url) => { asked.push(url); return fakes[url.match(/@near-wallet-selector\/([a-z-]+)@/)[1]]; };
  const r = await loadWalletSelector({ importer, document: null });
  assert.equal(WALLET_SELECTOR_VERSION, '10.1.4');
  assert.deepEqual(asked.sort(), ['core', 'modal-ui', ...WALLET_MODULES.map(([p]) => p)].map((p) => esm(p)).sort());
  assert.ok(asked.every((u) => u.startsWith('https://esm.sh/@near-wallet-selector/') && u.endsWith('@10.1.4')));
  assert.equal(setupArgs.network, 'mainnet');
  assert.deepEqual(setupArgs.modules.map((m) => m.module), WALLET_MODULES.map(([p]) => p));
  assert.deepEqual(modalOpts, {}); // no contractId -> no function-call key is added for Docket
  assert.deepEqual([r.selector.id, r.modal.id], ['selector', 'modal']);
});

test('I13: submitting hands the converted actions to the wallet once; the wallet signs, Docket does not', async () => {
  const calls = [];
  const core = { internalActionToNaj: (a) => ({ naj: a.params.methodName }) };
  const selector = { wallet: async () => ({ signAndSendTransaction: async (p) => { calls.push(p); return 'outcome'; } }) };
  assert.equal(await submitWithWallet({ core, selector }, addProposalTransaction(draft)), 'outcome');
  assert.deepEqual(calls, [{ receiverId: 'x.sputnik-dao.near', actions: [{ naj: 'add_proposal' }] }]);
  const src = readFileSync(new URL('../web/assets/wallet.js', import.meta.url), 'utf8');
  const code = src.split('\n').filter((l) => !l.trim().startsWith('//')).map((l) => l.replace(/\s\/\/\s.*$/, '')).join('\n');
  assert.deepEqual(code.match(/\.sign\w*\(/g), ['.signAndSendTransaction(']);
  assert.doesNotMatch(code, /contractId|privateKey|secretKey|KeyPair|keyStore/i);
});

test('optout.html: the wallet build is fetched only on click, and the page says it has not yet signed an opt-out', () => {
  const html = readFileSync(new URL('../web/optout.html', import.meta.url), 'utf8');
  assert.match(html, /b\.onclick = async \(\) => \{[\s\S]*?loadWalletSelector\(\)/);
  assert.doesNotMatch(html.split('b.onclick')[0], /loadWalletSelector\(/);
  assert.match(html, /no opt-out has yet been signed through it/);
  assert.match(html, /That is not the confirmation/);
});
