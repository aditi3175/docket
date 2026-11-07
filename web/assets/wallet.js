// wallet.js — §16.3: NEAR Wallet Selector, loaded as a pinned ESM build (no bundler). Docket builds the
// add_proposal transaction; the user's own wallet shows it and signs it. Docket never holds a key.
//
// Enforces:
//   I13  nothing here signs. The only signing call is the wallet's signAndSendTransaction, made after
//        the user picks a wallet and approves the transaction inside it. Sign-in passes no contractId,
//        so the wallet adds no function-call key for Docket.
//   I15  the page confirms an opt-out by re-reading get_factory_info (optout.js confirmOptOut), never
//        from what the wallet returns
//
// §16.3 [verify] answered 2026-11-07 in Chrome (http://127.0.0.1, no bundler): core, modal-ui and the
// three wallet modules below load by dynamic import() from esm.sh at 10.1.4, and setupWalletSelector
// initialises on mainnet. Cost measured then: 236 requests to esm.sh, about 10.7 s, so the build is
// fetched only when the user asks to connect a wallet. Not yet run: an actual wallet signing.
// Action shape from @near-wallet-selector/core@10.1.4 src/lib/wallet/transactions.types.d.ts
// (FunctionCallAction { type, params: { methodName, args, gas, deposit } }), converted with the
// package's own exported internalActionToNaj.

export const WALLET_SELECTOR_VERSION = '10.1.4';
export const esm = (pkg, path = '') => `https://esm.sh/@near-wallet-selector/${pkg}@${WALLET_SELECTOR_VERSION}${path}`;
// Wallets with a mainnet module at this version that load without a bundler. MyNearWallet is not
// listed: it shut down on 2026-10-31.
export const WALLET_MODULES = Object.freeze([
  ['meteor-wallet', 'setupMeteorWallet'], ['here-wallet', 'setupHereWallet'], ['intear-wallet', 'setupIntearWallet'],
]);
export const MODAL_CSS = esm('modal-ui', '/styles.css');

const TGAS = 10n ** 12n;
// '100 Tgas' -> '100000000000000' (BigInt, I10)
export function tgasToGas(s) {
  const m = /^(\d+) Tgas$/.exec(String(s));
  if (!m) throw new Error(`not a whole Tgas amount: ${s}`);
  return String(BigInt(m[1]) * TGAS);
}

// The opt-out's first transaction, from optout.js planOptOut(). Only a 'draft' plan has one.
// -> { receiverId, actions: [FunctionCallAction] }
export function addProposalTransaction(plan, gas = '100 Tgas') {
  if (plan?.status !== 'draft') throw new Error(`nothing to submit: plan status is ${plan?.status}`);
  if (typeof plan.bond?.yocto !== 'bigint') throw new Error('bond unknown');
  return {
    receiverId: plan.dao,
    actions: [{ type: 'FunctionCall', params: { methodName: 'add_proposal', args: plan.proposal, gas: tgasToGas(gas), deposit: plan.bond.yocto.toString() } }],
  };
}

// Loads the pinned build and sets up the selector + modal. `importer` is injectable for tests.
export async function loadWalletSelector({ importer = (u) => import(u), document: doc = globalThis.document } = {}) {
  const [core, ui, ...mods] = await Promise.all([importer(esm('core')), importer(esm('modal-ui')), ...WALLET_MODULES.map(([pkg]) => importer(esm(pkg)))]);
  if (doc && !doc.querySelector(`link[href="${MODAL_CSS}"]`)) {
    const l = doc.createElement('link'); l.rel = 'stylesheet'; l.href = MODAL_CSS; doc.head.append(l);
  }
  const selector = await core.setupWalletSelector({ network: 'mainnet', modules: mods.map((m, i) => m[WALLET_MODULES[i][1]]()) });
  const modal = ui.setupModal(selector, {}); // no contractId: sign-in adds no key for Docket (I13)
  return { core, selector, modal };
}

// Hands the transaction to the connected wallet; the wallet asks the user and signs. Returns what the
// wallet returns. That is never the confirmation (I15).
export async function submitWithWallet({ core, selector }, tx) {
  const wallet = await selector.wallet();
  return wallet.signAndSendTransaction({ receiverId: tx.receiverId, actions: tx.actions.map((a) => core.internalActionToNaj(a)) });
}
