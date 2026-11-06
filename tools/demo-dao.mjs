#!/usr/bin/env node
// demo-dao.mjs — the §16.5 demo DAO and the §16.2 UpgradeSelf test. Signs nothing, reads no key (I13):
// it prints each transaction for you to run from your own near-cli, and (with --check) makes the
// read-only checks that must pass before anything is signed.
//
// Usage: node tools/demo-dao.mjs <your-account.near> [dao-name] [--check]
//
// The test is a controlled pair, all steps required:
//   step 5  UpgradeSelf(v3.2) with auto_update:false  -> must FAIL with ERR_MUST_BE_SELF_OR_FACTORY
//   step 9  the same UpgradeSelf with auto_update:true -> must SUCCEED (DAO update + migrate)
// Only that pair confirms §16.2. Any other failure in step 5 (ERR_NO_HASH, "Must be contract created
// by factory", gas, ...) means STOP: it says nothing about auto_update. Evidence is the receipts
// (tools/receipts.mjs) and view_account — never the proposal's status, which reads "Approved" either way
// (the vote and bond refund are committed before the factory call runs). upgrade_using_factory ends in
// env::promise_return (upgrade.rs:177), so the transaction's final status follows the DAO's update():
// near-cli reports "Transaction failed" in step 5 (seen on mainnet, tx 772n4ZWM…FXnS) — still not the evidence.
//
// Shapes are from near-daos/sputnik-dao-contract at 2b0f34a38604 (v3.2, the factory's default):
//   factory  create(name, args: Base64VecU8); deposit >= 10 milliNEAR (factory_manager.rs MINIMAL_DEPOSIT)
//            get_code(code_hash) / update_contract both read storage_read(code_hash), else ERR_NO_HASH
//   DAO      new(config, policy) writes FactoryInfo { auto_update: true }
//            act_proposal(id, action, proposal: ProposalKind, memo)
//   Policy, RolePermission, VotePolicy are #[serde(deny_unknown_fields)]: exactly the fields below.

import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { nearCli, DESCRIPTION } from '../web/assets/optout.js';

export const FACTORY = 'sputnik-dao.near';
export const CREATE_DEPOSIT = '0.1 NEAR';             // >= 0.01 required; becomes the DAO's balance
export const BOND_YOCTO = '100000000000000000000000';   // 0.1 NEAR; returned on approval
export const V32_HASH = 'DtHZA1mUmGYeScEaUoUZYQGGFHSMpnjMCvkr5U9hJXuF'; // get_default_code_hash; what the DAO runs
const DAY_NS = 86_400_000_000_000n;
const ACCOUNT = /^(?=.{2,64}$)(([a-z\d]+[-_])*[a-z\d]+\.)*([a-z\d]+[-_])*[a-z\d]+$/;

export function createArgs(member, name = 'docket-demo') {
  if (!ACCOUNT.test(member)) throw new Error(`not a NEAR account id: ${member}`);
  const args = {
    config: { name, purpose: 'Docket demo DAO: opts out of factory auto-update and tests UpgradeSelf afterwards (ARCHITECTURE.md §16.5).', metadata: '' },
    policy: {
      // Council only: no Everyone role, so nobody else can add a proposal mid-test and shift the ids.
      roles: [
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

// The same builder optout.html uses: POSIX-shell quoting, refuses JSON containing a single quote.
const call = nearCli;

export function plan(member, name) {
  const c = createArgs(member, name);
  const fiu = (auto) => ({ FactoryInfoUpdate: { factory_info: { factory_id: FACTORY, auto_update: auto } } });
  const us = { UpgradeSelf: { hash: V32_HASH } };
  const add = (description, kind) => call(c.dao, 'add_proposal', { proposal: { description, kind } }, '100 Tgas', '0.1 NEAR', member);
  const act = (id, kind, gas) => call(c.dao, 'act_proposal', { id, action: 'VoteApprove', proposal: kind }, gas, '0 NEAR', member);
  const fi = (v) => `get_factory_info reads auto_update: ${v} (I15: re-read, not the tx status)`;
  // Read-only pre-conditions, checked by `--pre <n>` immediately before step n is signed:
  //   add: get_last_proposal_id must equal the id this step is about to create (ids are never assumed)
  //   act: get_proposal(id) must exist, be InProgress, and carry exactly the kind about to be approved
  const PRE = {
    2: { type: 'add', id: 0 }, 3: { type: 'act', id: 0, kind: fiu(false) },
    4: { type: 'add', id: 1 }, 5: { type: 'act', id: 1, kind: us },
    6: { type: 'add', id: 2 }, 7: { type: 'act', id: 2, kind: fiu(true) },
    8: { type: 'add', id: 3 }, 9: { type: 'act', id: 3, kind: us },
    10: { type: 'add', id: 4 }, 11: { type: 'act', id: 4, kind: fiu(false) },
  };
  return { ...c, pre: PRE, txs: [
    { n: 1, what: 'create the demo DAO', cmd: call(FACTORY, 'create', { name: c.name, args: c.argsBase64 }, '150 Tgas', CREATE_DEPOSIT, member),
      expect: `${c.dao} exists; view_account global_contract_hash = ${V32_HASH} (v3.2); ${fi(true)} (written by new())`,
      stop: 'the account does not exist, or runs anything but v3.2, or get_factory_info is not true' },
    { n: 2, what: 'opt-out proposal (#0), as drafted by optout.html', cmd: add(DESCRIPTION, fiu(false)),
      expect: 'add_proposal returns 0', stop: 'any other id, or ERR_MIN_BOND / ERR_PERMISSION_DENIED' },
    { n: 3, what: 'approve #0 (FactoryInfoUpdate false)', cmd: act(0, fiu(false), '100 Tgas'),
      expect: `${fi(false)}; opted-out count 12 -> 13`, stop: 'get_factory_info still reads true' },
    { n: 4, what: 'UpgradeSelf proposal (#1) to the v3.2 hash, while auto_update is false', cmd: add('Docket test: UpgradeSelf while auto_update is false (ARCHITECTURE.md §16.2).', us),
      expect: 'add_proposal returns 1', stop: 'any other id' },
    { n: 5, what: 'approve #1 — THE TEST: UpgradeSelf -> factory.update -> DAO update() with the factory as caller', cmd: act(1, us, '300 Tgas'),
      expect: `receipts (node tools/receipts.mjs <tx> ${member} --step 5): a ${FACTORY} "update" receipt succeeds and the following ${c.dao} "update" receipt FAILS with ERR_MUST_BE_SELF_OR_FACTORY; view_account unchanged`,
      stop: 'any other error (ERR_NO_HASH, "Must be contract created by factory", out of gas, ...) or no failure at all — tell the user before step 6' },
    { n: 6, what: 'control, step 1: auto_update back to true (#2)', cmd: add('Docket test control: auto_update true.', fiu(true)),
      expect: 'add_proposal returns 2', stop: 'any other id' },
    { n: 7, what: 'approve #2', cmd: act(2, fiu(true), '100 Tgas'), expect: fi(true), stop: 'still false' },
    { n: 8, what: 'control, step 2: the same UpgradeSelf (#3), now with auto_update true', cmd: add('Docket test control: UpgradeSelf with auto_update true.', us),
      expect: 'add_proposal returns 3', stop: 'any other id' },
    { n: 9, what: 'approve #3 — THE CONTROL: the same path must now succeed', cmd: act(3, us, '300 Tgas'),
      expect: `receipts (--step 9): the ${c.dao} "update" receipt and its "migrate" both succeed; view_account still ${V32_HASH} (same code re-applied)`,
      stop: 'any failure — then step 5 alone does not isolate auto_update' },
    { n: 10, what: 'control, step 3: auto_update back to false (#4)', cmd: add('Docket test control: auto_update false again.', fiu(false)),
      expect: 'add_proposal returns 4', stop: 'any other id' },
    { n: 11, what: 'approve #4 — leaves the demo DAO opted out', cmd: act(4, fiu(false), '100 Tgas'), expect: fi(false), stop: 'still true' },
  ] };
}

// ---- read-only pre-sign checks ---------------------------------------------------------------------
const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
export function base58(bytes) {
  let n = BigInt('0x' + (Buffer.from(bytes).toString('hex') || '0')); let s = '';
  while (n > 0n) { s = B58[Number(n % 58n)] + s; n /= 58n; }
  for (const b of bytes) { if (b === 0) s = '1' + s; else break; }
  return s;
}

async function query(params, rpcUrl) {
  const r = await (await fetch(rpcUrl, { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 'docket', method: 'query', params: { finality: 'final', ...params } }), signal: AbortSignal.timeout(30000) })).json();
  return r;
}

// -> [{ check, ok, detail }]   ok: true | false | null (unknown — treat as not passed)
export async function preSignChecks(member, name, { rpcUrl = 'https://free.rpc.fastnear.com' } = {}) {
  const c = createArgs(member, name);
  const out = [];
  try {
    const r = await query({ request_type: 'call_function', account_id: FACTORY, method_name: 'get_code',
      args_base64: Buffer.from(JSON.stringify({ code_hash: V32_HASH })).toString('base64') }, rpcUrl);
    if (r.error || r.result?.error) out.push({ check: `factory holds ${V32_HASH} in storage (get_code = update_contract's read)`, ok: false, detail: String(r.result?.error ?? JSON.stringify(r.error)).slice(0, 160) });
    else {
      const code = Buffer.from(r.result.result);
      const h = base58(createHash('sha256').update(code).digest());
      out.push({ check: `factory holds ${V32_HASH} in storage (get_code = update_contract's read)`, ok: h === V32_HASH, detail: `${code.length} bytes, sha256 ${h}, block ${r.result.block_height}` });
    }
  } catch (e) { out.push({ check: 'factory get_code', ok: null, detail: String(e.message ?? e) }); }
  for (const [check, acct, wantMissing] of [[`${c.dao} is free`, c.dao, true], [`${member} exists`, member, false]]) {
    try {
      const r = await query({ request_type: 'view_account', account_id: acct }, rpcUrl);
      const missing = r.error?.cause?.name === 'UNKNOWN_ACCOUNT';
      if (!missing && r.error) out.push({ check, ok: null, detail: JSON.stringify(r.error).slice(0, 120) });
      else out.push({ check, ok: wantMissing ? missing : !missing, detail: missing ? 'no such account' : `balance ${r.result.amount} yocto` });
    } catch (e) { out.push({ check, ok: null, detail: String(e.message ?? e) }); }
  }
  return out;
}

const viewJson = async (account, method, args, rpcUrl) => {
  const r = await query({ request_type: 'call_function', account_id: account, method_name: method,
    args_base64: Buffer.from(JSON.stringify(args)).toString('base64') }, rpcUrl);
  if (r.error) return { status: 'unknown', reason: JSON.stringify(r.error).slice(0, 160) };
  if (r.result?.error) return { status: 'error', reason: String(r.result.error).slice(0, 200) };
  return { status: 'ok', value: JSON.parse(Buffer.from(r.result.result).toString()), block: r.result.block_height };
};

// -> { ok: true | false | null, detail }   null = unknown (treat as not passed)
export async function preStepCheck(pre, dao, { rpcUrl = 'https://free.rpc.fastnear.com', read = viewJson } = {}) {
  if (!pre) return { ok: null, detail: 'no pre-condition defined for this step' };
  if (pre.type === 'add') {
    const r = await read(dao, 'get_last_proposal_id', {}, rpcUrl);
    if (r.status !== 'ok') return { ok: null, detail: `get_last_proposal_id unread: ${r.reason}` };
    return { ok: r.value === pre.id, detail: `get_last_proposal_id = ${r.value} (this add_proposal must create #${pre.id})${r.block ? `, block ${r.block}` : ''}` };
  }
  const r = await read(dao, 'get_proposal', { id: pre.id }, rpcUrl);
  if (r.status !== 'ok') return { ok: r.status === 'error' ? false : null, detail: `get_proposal(${pre.id}): ${r.reason}` };
  const sameKind = JSON.stringify(r.value.kind) === JSON.stringify(pre.kind);
  const live = r.value.status === 'InProgress';
  return { ok: sameKind && live, detail: `#${pre.id} status ${r.value.status}, kind ${sameKind ? 'matches' : `DIFFERS: ${JSON.stringify(r.value.kind)}`}, proposer ${r.value.proposer}${r.block ? `, block ${r.block}` : ''}` };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const argv = process.argv.slice(2);
  const check = argv.includes('--check');
  const pi = argv.indexOf('--pre'); const preStep = pi >= 0 ? Number(argv[pi + 1]) : null;
  const [member, name] = argv.filter((a, i) => a !== '--check' && a !== '--pre' && !(pi >= 0 && i === pi + 1));
  if (!member) { console.error('usage: node tools/demo-dao.mjs <your-account.near> [dao-name] [--check | --pre <step>]'); process.exit(2); }
  const p = plan(member, name);
  if (preStep !== null) {
    const r = await preStepCheck(p.pre[preStep], p.dao);
    console.log(`${r.ok === true ? 'PASS' : r.ok === false ? 'FAIL' : 'UNKNOWN'}  before step ${preStep}: ${r.detail}`);
    process.exit(r.ok === true ? 0 : 1);
  }
  if (check) {
    const r = await preSignChecks(member, name);
    for (const x of r) console.log(`${x.ok === true ? 'PASS' : x.ok === false ? 'FAIL' : 'UNKNOWN'}  ${x.check} — ${x.detail}`);
    process.exit(r.every((x) => x.ok === true) ? 0 : 1);
  }
  console.log(`Demo DAO: ${p.dao}   council: [${member}]   bond: 0.1 NEAR   create deposit: ${CREATE_DEPOSIT}`);
  console.log(`First: node tools/demo-dao.mjs ${member}${name ? ' ' + name : ''} --check   (must print PASS three times)`);
  console.log('Run every command below in Git Bash (or any POSIX shell). Windows PowerShell 5.1 strips the quotes inside json-args.\n');
  console.log('create args (decoded):\n' + JSON.stringify(p.args, null, 2) + '\n');
  for (const t of p.txs) {
    const before = p.pre[t.n] ? `#    before: node tools/demo-dao.mjs ${member}${name ? ' ' + name : ''} --pre ${t.n}   (must print PASS)\n` : '';
    console.log(`# ${t.n}. ${t.what}\n${before}${t.cmd}\n#    expect: ${t.expect}\n#    STOP if: ${t.stop}\n`);
  }
  console.log('All 11 steps are required. Proposal ids are never assumed: --pre re-reads get_last_proposal_id before each add_proposal, and get_proposal before each act_proposal.');
}
