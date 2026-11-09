// optout.js — §16: draft the FactoryInfoUpdate opt-out for one Sputnik DAO, say who must approve it,
// what it costs and what is given up, and confirm it by re-reading the chain. Signs nothing (I13).
//
// Enforces:
//   I14  the plan states what is given up — factory rescue, and UpgradeSelf on its own (confirmed on
//        mainnet at v3.2, §16.2/§16.5) — and the page renders it above the submit control
//   I15  an opt-out counts only when get_factory_info re-reads auto_update:false; a transaction's
//        success is never evidence
//   I2   any unread input makes the plan 'unknown'; nothing is drafted from a guess
//   §16.1 drafts only for versions run on mainnet (TESTED_VERSIONS); refuses every other version

import { factoryInfo, codeIdentity, loadFactoryVersions } from './resolve.js';
import { whoCanPass, formatUnits } from './decode.js';
import { SOURCE } from './source.js';

// §16.1: the FactoryInfoUpdate shape has passed on mainnet at these versions (12 DAOs, 2026-11-06).
// v3.0 is the same shape in source but untested: the factory creates only v3.2 DAOs, so it cannot be run.
// It is refused, and no transaction is drafted (the §16.1 limitation).
export const TESTED_VERSIONS = Object.freeze(['v3.1', 'v3.2']);

// No apostrophe: the near-cli command wraps the JSON in single quotes (§16.2 step 5 "the equivalent
// near-cli command"), and a ' would end the shell string. nearCli() refuses any JSON containing one.
export const DESCRIPTION = 'Opt out of factory auto-update (Docket). The factory will no longer be able to replace the code of this DAO without a vote.';

// I14 — shown above the submit control, in this order.
export const GIVEN_UP = Object.freeze([
  { text: 'The factory can no longer rescue this DAO if a migration bricks it.', basis: 'from the source: update() accepts the factory only while auto_update is true', link: SOURCE.updateAssert },
  { text: 'UpgradeSelf no longer works on its own. Upgrading takes three proposals: auto_update back to true, then UpgradeSelf, then auto_update back to false. While true is in force, the factory\'s keys can replace the code with no vote.',
    basis: 'confirmed on mainnet at v3.2: with auto_update false the factory update was rejected (tx 772n4ZWMRtmXwsWuVTSP5F1UkbZ27UNyM9SqVzgXnXFS); with true the same UpgradeSelf ran (tx EZw51V5kCMeCCMsmNw5WqDsSUK8R2CHs4WyeK4jTtB1b)', link: SOURCE.updateAssert },
]);

// Prepaid gas ceilings Docket chooses; unused gas is refunded by the protocol.
export const GAS = Object.freeze({ add_proposal: '100 Tgas', act_proposal: '100 Tgas' });

export function optOutKind(factoryId) {
  // v3.2 FactoryInfo has #[serde(deny_unknown_fields)]: exactly these two fields (§16.1)
  return { FactoryInfoUpdate: { factory_info: { factory_id: factoryId, auto_update: false } } };
}

// A POSIX-shell command (bash, zsh, Git Bash). Windows PowerShell 5.1 strips the double quotes inside
// the JSON before near-cli sees it (tested 2026-11-06: "Data not in JSON format"), so the page says so.
export function nearCli(contract, method, args, gas, deposit, signer) {
  const json = JSON.stringify(args);
  if (json.includes("'")) throw new Error('JSON args contain a single quote, which would break the shell command');
  return `near contract call-function as-transaction ${contract} ${method} json-args '${json}' prepaid-gas '${gas}' attached-deposit '${deposit}' sign-as ${signer} network-config mainnet sign-with-keychain send`;
}

// -> { status: 'draft' | 'opted-out' | 'refused' | 'unknown', dao, reason?, current, steps, approve, bond, givenUp, commands }
export async function planOptOut(rpc, dao, { factory } = {}) {
  const fv = factory ?? await loadFactoryVersions(rpc);
  const [fi, code, pol] = await Promise.all([factoryInfo(rpc, dao), codeIdentity(rpc, dao, fv), rpc.viewFunction(dao, 'get_policy')]);
  const base = { dao, givenUp: GIVEN_UP };
  if (fi.status === 'unknown') return { ...base, status: 'unknown', reason: `get_factory_info unread: ${fi.reason}` };
  if (fi.status !== 'ok') return { ...base, status: 'refused', reason: 'no get_factory_info: not a Sputnik v3 DAO' };
  if (code.form === 'unknown' || code.versionStatus === 'unknown') return { ...base, status: 'unknown', reason: `code version unread: ${code.reason ?? fv.reason ?? 'unknown'}` };
  const current = { autoUpdate: fi.autoUpdate, factoryId: fi.factoryId, version: code.version, versionStatus: code.versionStatus, form: code.form };
  if (fi.autoUpdate === false) return { ...base, status: 'opted-out', current, reason: 'get_factory_info already reads auto_update: false' };
  if (code.versionStatus !== 'published' || !TESTED_VERSIONS.includes(code.version)) {
    return { ...base, status: 'refused', current, reason: `runs ${code.version ?? code.form} (${code.versionStatus}); the opt-out shape has been run on mainnet only at ${TESTED_VERSIONS.join(' and ')}` };
  }
  if (pol.status === 'unknown') return { ...base, status: 'unknown', current, reason: `get_policy unread: ${pol.reason}` };
  if (pol.status !== 'ok' || !Array.isArray(pol.value?.roles)) return { ...base, status: 'unknown', current, reason: 'unexpected get_policy shape' };
  const policy = pol.value;

  const bondRaw = String(policy.proposal_bond);
  if (!/^\d+$/.test(bondRaw)) return { ...base, status: 'unknown', current, reason: `proposal_bond ${JSON.stringify(policy.proposal_bond)}` };
  const bond = { yocto: BigInt(bondRaw), near: formatUnits(bondRaw, 24), refund: 'returned to the proposer when the proposal is approved (internal_return_bonds)' };

  const fiu = whoCanPass(policy, 'factory_info_update');
  const approve = { proposers: fiu.proposers, passers: fiu.passers.map((p) => ({ role: p.role, k: p.k, n: p.n, members: p.members })),
    ignored: fiu.ignored.map((g) => g.role), unknown: fiu.unknown };
  const kind = optOutKind(fi.factoryId);
  const proposal = { proposal: { description: DESCRIPTION, kind } };

  if (!fiu.proposers.length || !fiu.passers.length) {
    const pc = whoCanPass(policy, 'policy');
    return { ...base, status: 'refused', current, bond, approve,
      reason: `no role can ${fiu.proposers.length ? 'approve' : 'propose'} factory_info_update. A ChangePolicy granting it must pass first${pc.passers.length ? ` (${pc.passers.map((p) => `${p.k} of ${p.n} ${p.role}`).join(' or ')} can pass that)` : ', and no role can pass that either'}. Docket does not draft ChangePolicy: it has not been run on mainnet`,
      steps: 2 };
  }
  const signer = '<your-account.near>';
  return { ...base, status: 'draft', current, steps: 1, bond, approve, proposal,
    commands: {
      add: nearCli(dao, 'add_proposal', proposal, GAS.add_proposal, `${bond.near} NEAR`, signer),
      // v3.2 act_proposal takes the kind it votes on (proposals.rs act_proposal(id, action, proposal, memo))
      approve: nearCli(dao, 'act_proposal', { id: '<id returned by add_proposal>', action: 'VoteApprove', proposal: kind }, GAS.act_proposal, '0 NEAR', signer),
    } };
}

// I15 — the only evidence of an opt-out is a re-read of get_factory_info.
// -> { status: 'opted-out' | 'not-opted-out' | 'unknown', readAt }
export async function confirmOptOut(rpc, dao) {
  const fi = await factoryInfo(rpc, dao);
  const readAt = new Date().toISOString();
  if (fi.status !== 'ok') return { status: 'unknown', readAt, reason: fi.reason ?? fi.detail ?? fi.status };
  return { status: fi.autoUpdate === false ? 'opted-out' : 'not-opted-out', readAt };
}

// The screen, in §16.2 order. The page renders exactly these sections, in this order (I14: givenUp
// precedes submit).
export function screenModel(plan) {
  return [
    { id: 'current', title: 'This DAO now' },
    { id: 'givenUp', title: 'What is given up' },
    { id: 'approve', title: 'Who must approve' },
    { id: 'cost', title: 'What it costs' },
    { id: 'submit', title: plan.status === 'draft' ? 'Submit' : 'Nothing to submit' },
    { id: 'cli', title: 'The same, with near-cli' },
  ];
}
