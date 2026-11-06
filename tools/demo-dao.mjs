#!/usr/bin/env node
// demo-dao.mjs — prints the transactions for the §16.5 demo DAO. Signs nothing, reads no key (I13):
// you run each printed command yourself, from your own near-cli.
//
// Usage: node tools/demo-dao.mjs <your-account.near> [dao-name]      (default dao-name: docket-demo)
//
// Shapes are from near-daos/sputnik-dao-contract at 2b0f34a38604 (v3.2, the factory's default):
//   factory  create(name: AccountId, args: Base64VecU8); attached deposit >= 10 milliNEAR
//            (factory_manager.rs MINIMAL_DEPOSIT), transferred to the new DAO account
//   DAO      new(config: Config, policy: VersionedPolicy) — writes FactoryInfo { auto_update: true }
//   Policy, RolePermission, VotePolicy are #[serde(deny_unknown_fields)]: exactly the fields below.

import { pathToFileURL } from 'node:url';

export const FACTORY = 'sputnik-dao.near';
export const CREATE_DEPOSIT = '0.1 NEAR';           // >= 0.01 required; the rest is the DAO's storage/balance
export const BOND_YOCTO = '100000000000000000000000'; // 0.1 NEAR; returned on approval
const DAY_NS = 86_400_000_000_000n;

export function createArgs(member, name = 'docket-demo') {
  if (!/^(?=.{2,64}$)(([a-z\d]+[-_])*[a-z\d]+\.)*([a-z\d]+[-_])*[a-z\d]+$/.test(member)) throw new Error(`not a NEAR account id: ${member}`);
  const args = {
    config: { name, purpose: 'Docket demo DAO: opts out of factory auto-update and tests UpgradeSelf afterwards (ARCHITECTURE.md §16.5).', metadata: '' },
    policy: {
      roles: [
        { name: 'all', kind: 'Everyone', permissions: ['*:AddProposal'], vote_policy: {} },
        { name: 'council', kind: { Group: [member] }, permissions: ['*:AddProposal', '*:VoteApprove', '*:VoteReject', '*:VoteRemove', '*:Finalize'], vote_policy: {} },
      ],
      default_vote_policy: { weight_kind: 'RoleWeight', quorum: '0', threshold: [1, 2] },
      proposal_bond: BOND_YOCTO,
      proposal_period: String(7n * DAY_NS),
      bounty_bond: BOND_YOCTO,
      bounty_forgiveness_period: String(DAY_NS),
    },
  };
  return { name, dao: `${name}.${FACTORY}`, args, argsBase64: Buffer.from(JSON.stringify(args)).toString('base64') };
}

const call = (contract, method, args, gas, deposit, signer) =>
  `near contract call-function as-transaction ${contract} ${method} json-args '${JSON.stringify(args)}' prepaid-gas '${gas}' attached-deposit '${deposit}' sign-as ${signer} network-config mainnet sign-with-keychain send`;

export function plan(member, name) {
  const c = createArgs(member, name);
  const fiu = (auto) => ({ FactoryInfoUpdate: { factory_info: { factory_id: FACTORY, auto_update: auto } } });
  const v32 = 'DtHZA1mUmGYeScEaUoUZYQGGFHSMpnjMCvkr5U9hJXuF'; // get_default_code_hash = v3.2 (the code the DAO already runs)
  const us = { UpgradeSelf: { hash: v32 } };
  const add = (description, kind) => call(c.dao, 'add_proposal', { proposal: { description, kind } }, '100 Tgas', '0.1 NEAR', member);
  const act = (id, kind, gas) => call(c.dao, 'act_proposal', { id, action: 'VoteApprove', proposal: kind }, gas, '0 NEAR', member);
  return { ...c, txs: [
    { n: 1, what: 'create the demo DAO', cmd: call(FACTORY, 'create', { name: c.name, args: c.argsBase64 }, '150 Tgas', CREATE_DEPOSIT, member) },
    { n: 2, what: 'opt-out proposal (#0) — submit through optout.html or this command', cmd: add("Opt out of factory auto-update (Docket). The factory will no longer be able to replace this DAO's code without a vote.", fiu(false)) },
    { n: 3, what: 'approve #0 (executes FactoryInfoUpdate)', cmd: act(0, fiu(false), '100 Tgas') },
    { n: 4, what: 'UpgradeSelf proposal (#1) to the v3.2 hash, while opted out', cmd: add('Docket test: UpgradeSelf while auto_update is false (ARCHITECTURE.md §16.2).', us) },
    { n: 5, what: 'approve #1 (executes UpgradeSelf -> factory.update -> DAO update())', cmd: act(1, us, '300 Tgas') },
    { n: 6, what: 'optional workaround, step 1: auto_update back to true (#2)', cmd: add('Docket test: workaround step 1, auto_update true.', fiu(true)) },
    { n: 7, what: 'approve #2', cmd: act(2, fiu(true), '100 Tgas') },
    { n: 8, what: 'optional workaround, step 2: UpgradeSelf (#3)', cmd: add('Docket test: workaround step 2, UpgradeSelf with auto_update true.', us) },
    { n: 9, what: 'approve #3', cmd: act(3, us, '300 Tgas') },
    { n: 10, what: 'optional workaround, step 3: auto_update back to false (#4)', cmd: add('Docket test: workaround step 3, auto_update false.', fiu(false)) },
    { n: 11, what: 'approve #4', cmd: act(4, fiu(false), '100 Tgas') },
  ] };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [member, name] = process.argv.slice(2);
  if (!member) { console.error('usage: node tools/demo-dao.mjs <your-account.near> [dao-name]'); process.exit(2); }
  const p = plan(member, name);
  console.log(`Demo DAO: ${p.dao}   council: [${member}]   bond: 0.1 NEAR   create deposit: ${CREATE_DEPOSIT}\n`);
  console.log('create args (decoded):\n' + JSON.stringify(p.args, null, 2) + '\n');
  for (const t of p.txs) console.log(`# ${t.n}. ${t.what}\n${t.cmd}\n`);
  console.log('Proposal ids assume a fresh DAO (ids start at 0). Check each id in the add_proposal result before approving.');
}
