#!/usr/bin/env node
// guard-setup.mjs — the §17 delegate setup and demo on mainnet, as numbered transactions with a read-only
// pre-check before each (like demo-dao.mjs). Prints commands; signs nothing. Reads through rpc.js (§9).
//
//   node tools/guard-setup.mjs                 print T1–T9
//   node tools/guard-setup.mjs --pre <T>       re-read the chain; PASS only if the step's pre-condition holds
//
// Keys: T1 and T2 generate ed25519 keys straight into the OS keychain (near-cli autogenerate, --signature-scheme
// ed25519 so it does not prompt; save-to-keychain);
// no private key is ever printed (I13). T3 deletes the temporary full-access key, leaving the delegate one
// FunctionCall key: receiver = the demo DAO, methods = ["act_proposal"] (I17).
//
// Shapes from near-daos/sputnik-dao-contract at 2b0f34a38604 (proposals.rs): AddMemberToRole
// { member_id, role }, Transfer { token_id ("" = NEAR), receiver_id, amount, msg }, deny_unknown_fields.

import { pathToFileURL } from 'node:url';
import { createRpc } from '../web/assets/rpc.js';
import { accessKeys } from '../web/assets/resolve.js';
import { nearCli } from '../web/assets/optout.js';
import { delegateKeyOk } from '../agent/delegate.mjs';

export const HUMAN = 'docket-aditi.near';
export const GUARD = 'docket-guard.docket-aditi.near';
export const DAO = 'docket-demo.sputnik-dao.near';
export const HUMAN_KEY = 'ed25519:D5NbdgxoZ4qowoFqjZc4VPNTJhH8imKNqFtf5VUrcG3d';
export const FUNDING = '0.05 NEAR';
export const ALLOWANCE = '0.05 NEAR';
export const BOND = '0.1 NEAR';
export const TRANSFER_YOCTO = '10000000000000000000000'; // 0.01 NEAR
export const DESCRIPTION = 'Send 0.01 NEAR to docket-aditi.near (Docket test)';
const NEAR = 10n ** 24n;

export const KINDS = Object.freeze({
  seat: { AddMemberToRole: { member_id: GUARD, role: 'council' } },
  routine: { Transfer: { token_id: '', receiver_id: HUMAN, amount: TRANSFER_YOCTO, msg: null } },
  planted: { Transfer: { token_id: '', receiver_id: GUARD, amount: TRANSFER_YOCTO, msg: null } },
});

const add = (description, kind) => nearCli(DAO, 'add_proposal', { proposal: { description, kind } }, '100 Tgas', BOND, HUMAN);
const vote = (id, kind) => nearCli(DAO, 'act_proposal', { id, action: 'VoteApprove', proposal: kind }, '100 Tgas', '0 NEAR', HUMAN);

// The steps. ids follow get_last_proposal_id = 6 on 2026-11-07; --pre re-reads them, they are never assumed.
export const STEPS = Object.freeze([
  { t: 'T1', signer: HUMAN, what: `create ${GUARD} with a temporary full-access key, generated into the keychain; fund it ${FUNDING}`,
    cmd: `near account create-account fund-myself ${GUARD} '${FUNDING}' autogenerate-new-keypair --signature-scheme ed25519 save-to-keychain sign-as ${HUMAN} network-config mainnet sign-with-keychain send`,
    expect: `${GUARD} exists with exactly 1 key, FullAccess; balance ${FUNDING}` },
  { t: 'T2', signer: `${GUARD} (full-access key)`, what: `add the delegate's FunctionCall key (receiver ${DAO}, methods act_proposal), generated into the keychain`,
    cmd: `near account add-key ${GUARD} grant-function-call-access --allowance '${ALLOWANCE}' --contract-account-id ${DAO} --function-names act_proposal autogenerate-new-keypair --signature-scheme ed25519 save-to-keychain network-config mainnet sign-with-keychain send`,
    expect: `${GUARD} has 2 keys: the FullAccess one and a FunctionCall key for ${DAO}, ["act_proposal"]` },
  { t: 'T3', signer: `${GUARD} (full-access key)`, what: 'delete the temporary full-access key',
    cmd: `near account delete-keys ${GUARD} public-keys <the FullAccess public key printed by --pre T3> network-config mainnet sign-with-keychain send`,
    expect: `${GUARD} has exactly 1 key: FunctionCall, ${DAO}, ["act_proposal"] (I17)` },
  { t: 'T4', signer: HUMAN, what: `propose seating ${GUARD} in council`, cmd: add(`Seat ${GUARD} in council: the Docket delegate (ARCHITECTURE.md §17).`, KINDS.seat),
    expect: 'add_proposal returns 6' },
  { t: 'T5', signer: HUMAN, what: 'approve the seat (1 of 1); the council becomes 2 members, every proposal then needs 2 of 2', cmd: vote(6, KINDS.seat),
    expect: `get_policy: council = [${HUMAN}, ${GUARD}]` },
  { t: 'T6', signer: HUMAN, what: 'the routine proposal: 0.01 NEAR to docket-aditi.near', cmd: add(DESCRIPTION, KINDS.routine), expect: 'add_proposal returns 7' },
  { t: 'T7', signer: `${GUARD} (FunctionCall key, by the delegate)`, what: 'the delegate checks #7 and signs its own VoteApprove',
    cmd: `node agent/delegate.mjs --account ${GUARD} --state agent/state.json --once`,
    expect: '#7 APPROVE — signed · tx …; #7 has 1 approval and is still InProgress (2 of 2)' },
  { t: 'T8', signer: HUMAN, what: 'the human approval passes #7; 0.01 NEAR goes to docket-aditi.near', cmd: vote(7, KINDS.routine),
    expect: '#7 Approved; the DAO sends 0.01 NEAR to docket-aditi.near and returns the bond' },
  { t: 'T9', signer: HUMAN, what: 'the planted proposal: the same words, receiver docket-guard', cmd: add(DESCRIPTION, KINDS.planted),
    expect: 'add_proposal returns 8; then the delegate run escalates it (named-receiver, silent-reach, sibling-collision) and does not vote' },
]);

const read = async (rpc, acct, method, args) => rpc.viewFunction(acct, method, args);
const near = (y) => `${y / NEAR}.${String(y % NEAR).padStart(24, '0').slice(0, 4)}`;

// -> { ok: true | false | null, detail }   null = unknown (not passed)
export async function preCheck(t, { rpc = createRpc() } = {}) {
  const keysOf = (a) => accessKeys(rpc, a);
  const acct = (a) => rpc.viewAccount(a);
  const lastIs = async (n) => { const r = await read(rpc, DAO, 'get_last_proposal_id', {}); return r.status !== 'ok' ? { ok: null, detail: `get_last_proposal_id: ${r.reason ?? r.detail}` } : { ok: r.value === n, detail: `get_last_proposal_id = ${r.value} (must be ${n})` }; };
  const council = async () => { const p = await read(rpc, DAO, 'get_policy', {}); return p.status === 'ok' ? p.value.roles.find((r) => r.name === 'council')?.kind?.Group ?? null : null; };
  const open = async (id, kind) => {
    const p = await read(rpc, DAO, 'get_proposal', { id });
    if (p.status !== 'ok') return { ok: p.status === 'error' ? false : null, detail: `get_proposal(${id}): ${p.reason ?? p.detail}` };
    const same = JSON.stringify(p.value.kind) === JSON.stringify(kind);
    return { ok: same && p.value.status === 'InProgress', detail: `#${id} ${p.value.status}, kind ${same ? 'matches' : `DIFFERS: ${JSON.stringify(p.value.kind)}`}, votes ${JSON.stringify(p.value.votes)}` };
  };
  switch (t) {
    case 'T1': {
      const [g, h, hk] = await Promise.all([acct(GUARD), acct(HUMAN), keysOf(HUMAN)]);
      if (g.status === 'unknown' || h.status === 'unknown' || hk.status === 'unknown') return { ok: null, detail: 'a read failed' };
      const free = g.status === 'absent' && g.what === 'account';
      const bal = h.status === 'ok' ? BigInt(h.value.amount) : 0n;
      const key = hk.status === 'ok' && hk.keys.some((k) => k.publicKey === HUMAN_KEY && k.kind === 'FullAccess');
      return { ok: free && bal >= 6n * NEAR / 100n && key, detail: `${GUARD} ${free ? 'is free' : 'EXISTS'}; ${HUMAN} balance ${near(bal)} NEAR (needs >= 0.06); its full-access key ${HUMAN_KEY.slice(0, 16)}… ${key ? 'present' : 'MISSING'}` };
    }
    case 'T2': {
      const k = await keysOf(GUARD);
      if (k.status !== 'ok') return { ok: k.status === 'no-account' ? false : null, detail: `keys of ${GUARD}: ${k.status} ${k.reason ?? ''}` };
      const ok = k.keys.length === 1 && k.keys[0].kind === 'FullAccess';
      return { ok, detail: `${GUARD} keys: ${k.keys.map((x) => `${x.kind} ${x.publicKey.slice(0, 16)}…`).join(', ')} (must be exactly 1 FullAccess)` };
    }
    case 'T3': {
      const k = await keysOf(GUARD);
      if (k.status !== 'ok') return { ok: null, detail: `keys of ${GUARD}: ${k.status}` };
      const full = k.keys.filter((x) => x.kind === 'FullAccess');
      const fc = k.keys.filter((x) => x.kind === 'FunctionCall' && x.receiver === DAO && JSON.stringify(x.methods) === '["act_proposal"]');
      return { ok: k.keys.length === 2 && full.length === 1 && fc.length === 1,
        detail: `${GUARD} keys: ${k.keys.map((x) => `${x.kind}${x.receiver ? ` ${x.receiver} ${JSON.stringify(x.methods)}` : ''} ${x.publicKey}`).join(' | ')}${full.length === 1 ? `\n  delete this one (FullAccess): ${full[0].publicKey}` : ''}` };
    }
    case 'T4': {
      const [k, l, c] = await Promise.all([keysOf(GUARD), lastIs(6), council()]);
      const ko = delegateKeyOk(k, DAO);
      const solo = JSON.stringify(c) === JSON.stringify([HUMAN]);
      return { ok: ko.ok && l.ok === true && solo, detail: `I17 ${ko.ok ? 'holds' : `FAILS: ${ko.why}`}; ${l.detail}; council ${JSON.stringify(c)}` };
    }
    case 'T5': return open(6, KINDS.seat);
    case 'T6': { const [l, c] = await Promise.all([lastIs(7), council()]); const two = JSON.stringify([...(c ?? [])].sort()) === JSON.stringify([HUMAN, GUARD].sort()); return { ok: l.ok === true && two, detail: `${l.detail}; council ${JSON.stringify(c)}` }; }
    case 'T7': return open(7, KINDS.routine);
    case 'T8': {
      const r = await open(7, KINDS.routine);
      const p = await read(rpc, DAO, 'get_proposal', { id: 7 });
      const g = p.status === 'ok' && p.value.votes?.[GUARD] === 'Approve';
      return { ok: r.ok === true && g, detail: `${r.detail}; the delegate's approval ${g ? 'is recorded' : 'is MISSING'}` };
    }
    case 'T9': {
      const [l, p] = await Promise.all([lastIs(8), read(rpc, DAO, 'get_proposal', { id: 7 })]);
      const done = p.status === 'ok' && p.value.status === 'Approved';
      return { ok: l.ok === true && done, detail: `${l.detail}; #7 ${p.status === 'ok' ? p.value.status : 'unread'}` };
    }
    default: return { ok: null, detail: `no step ${t}` };
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const a = process.argv.slice(2); const i = a.indexOf('--pre');
  if (i >= 0) {
    const r = await preCheck(a[i + 1]);
    console.log(`${r.ok === true ? 'PASS' : r.ok === false ? 'FAIL' : 'UNKNOWN'}  before ${a[i + 1]}: ${r.detail}`);
    process.exit(r.ok === true ? 0 : 1);
  }
  console.log('Run each command in Git Bash, one at a time, after its --pre check prints PASS.\n');
  for (const s of STEPS) console.log(`# ${s.t}. ${s.what}\n#    signer: ${s.signer}\n#    before: node tools/guard-setup.mjs --pre ${s.t}\n${s.cmd}\n#    expect: ${s.expect}\n`);
}
