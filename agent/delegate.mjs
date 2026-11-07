#!/usr/bin/env node
// delegate.mjs — §17.2: a council seat that cannot vote past a flag. For each new proposal on its DAO it
// runs @docket/guard's checkProposal and either votes VoteApprove, bound to the exact kind it checked, or
// escalates to a human with the Docket report. The vote is signed by the delegate's own FunctionCall key
// from the OS keychain, through near-cli (sign-with-keychain): Docket's code never sees a key (I13).
// --dry-run prints the command instead of running it. Every decision is logged with its Docket report.
//
// Enforces:
//   I16  never votes on a proposal carrying any critical or high flag, any unknown (I2/I7/I8), or a kind
//        outside policy.json; kinds rated critical or high in §6.4 are refused even if policy.json lists
//        them, and policy.json cannot be loaded with one
//   I17  delegateKeyOk(): the delegate's only key is FunctionCall, receiver = its DAO, methods = act_proposal
//   I18  the optional LLM layer can add a flag and never remove or lower one; off by default (llm.mjs)
//
// Usage: node agent/delegate.mjs --account <delegate.near> [--policy agent/policy.json] [--state agent/state.json]
//                               [--log agent/log] [--once] [--dry-run]

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { createRpc } from '../web/assets/rpc.js';
import { KINDS } from '../web/assets/decode.js';
import { numeralsInText, stripUiMarkers } from '../web/assets/lint.js';
import { nearCli } from '../web/assets/optout.js';
import { checkProposal } from '../guard/index.mjs';
import { mergeLlmFlags } from './llm.mjs';

export const BLOCKING = Object.freeze(['critical', 'high']);

// Refuse a policy that would let the delegate approve a critical or high kind (§17.3).
export function loadPolicy(p) {
  const allow = p?.allow ?? {};
  for (const kind of Object.keys(allow)) {
    const k = KINDS[kind];
    if (!k) throw new Error(`policy.json: unknown kind ${kind}`);
    if (BLOCKING.includes(k.risk)) throw new Error(`policy.json: ${kind} is rated ${k.risk} (§6.4) and is permanently outside the delegate's policy`);
  }
  if (allow.Transfer && !/^\d+$/.test(String(allow.Transfer.maxYocto ?? ''))) throw new Error('policy.json: Transfer needs maxYocto (a yoctoNEAR integer string)');
  return { dao: p.dao, allow, llm: { enabled: p?.llm?.enabled === true } };
}

// check: a checkProposal() result. -> { action:'VoteApprove', id, proposalKind, reasons:[] } | { action:'escalate'|'skip', reasons }
export function decide(check, policy, { llmFlags = [] } = {}) {
  const reasons = [];
  if (check.status && check.status !== 'InProgress') return { action: 'skip', reasons: [`status ${check.status}: nothing to vote on`] };
  const flags = mergeLlmFlags(check.flags ?? [], policy.llm?.enabled ? llmFlags : []);
  for (const u of check.unknowns ?? []) reasons.push(`unknown: ${u}`);
  if (!check.kind || check.kind.unknown) reasons.push(`kind unknown${check.kind?.name ? ` (${check.kind.name})` : ''}`);
  else {
    const rule = policy.allow[check.kind.name];
    if (!rule) reasons.push(`kind ${check.kind.name} is outside policy.json`);
    if (BLOCKING.includes(check.kind.risk)) reasons.push(`kind ${check.kind.name} is rated ${check.kind.risk}`);
    if (rule && check.kind.name === 'Transfer') {
      const v = check.value;
      if (!v || v.unknown || typeof v.raw !== 'bigint') reasons.push(`transfer amount unknown${v?.unknown ? `: ${v.unknown}` : ''}`);
      else {
        if (rule.nativeNearOnly && v.token) reasons.push(`transfer of ${v.token}: policy allows native NEAR only`);
        if (v.raw > BigInt(rule.maxYocto)) reasons.push(`transfer of ${v.raw} yocto is over the cap of ${rule.maxYocto}`);
      }
      if (rule.descriptionMustNameAmount && !numeralsInText(stripUiMarkers(check.description ?? '')).length) reasons.push('the description names no amount');
    }
  }
  for (const f of flags) if (BLOCKING.includes(f.severity)) reasons.push(`${f.severity} flag ${f.check}: ${f.detail}`);
  if (reasons.length) return { action: 'escalate', reasons };
  // bound to what was checked: act_proposal asserts the stored kind equals this one (ERR_WRONG_KIND, §17.2)
  return { action: 'VoteApprove', id: check.id, proposalKind: check.proposalKind, reasons: [] };
}

// I17 — the delegate's keys, from resolve.js accessKeys(): exactly one, FunctionCall, receiver = dao,
// methods = ["act_proposal"]. -> { ok: true } | { ok: false, why }
export function delegateKeyOk(keys, dao) {
  if (keys?.status !== 'ok') return { ok: false, why: `keys unread: ${keys?.reason ?? keys?.status}` };
  if (keys.keys.length !== 1) return { ok: false, why: `${keys.keys.length} keys; exactly one is allowed` };
  const k = keys.keys[0];
  if (k.kind !== 'FunctionCall') return { ok: false, why: `the key is ${k.kind}` };
  if (k.receiver !== dao) return { ok: false, why: `receiver ${k.receiver}, not ${dao}` };
  if (JSON.stringify(k.methods) !== JSON.stringify(['act_proposal'])) return { ok: false, why: `methods ${JSON.stringify(k.methods)}` };
  return { ok: true };
}

// The vote, as a near-cli command (printed) and as the argument list near-cli runs with (no shell).
export function voteCommand(dao, decision, account) {
  return nearCli(dao, 'act_proposal', { id: decision.id, action: 'VoteApprove', proposal: decision.proposalKind }, '100 Tgas', '0 NEAR', account);
}
export function voteArgs(dao, decision, account) {
  return ['contract', 'call-function', 'as-transaction', dao, 'act_proposal', 'json-args',
    JSON.stringify({ id: decision.id, action: 'VoteApprove', proposal: decision.proposalKind }),
    'prepaid-gas', '100 Tgas', 'attached-deposit', '0 NEAR', 'sign-as', account, 'network-config', 'mainnet', 'sign-with-keychain', 'send'];
}

// Runs near-cli; the OS keychain holds the delegate's FunctionCall key. -> { ok, txId, output }
export function signVote(args, { bin = process.env.NEAR_CLI ?? 'near', run = execFile } = {}) {
  return new Promise((resolve) => {
    run(bin, args, { timeout: 120_000, maxBuffer: 4 << 20 }, (err, stdout, stderr) => {
      const output = String(stdout ?? '') + String(stderr ?? '');
      const txId = (output.match(/Transaction ID: ([1-9A-HJ-NP-Za-km-z]{43,44})/) ?? [])[1] ?? null;
      resolve({ ok: !err && Boolean(txId), txId, output: output.slice(-4000) });
    });
  });
}

const bigintSafe = (v) => JSON.stringify(v, (_k, x) => (typeof x === 'bigint' ? x.toString() : x), 2);

async function logDecision(logDir, dao, id, entry) {
  if (!logDir) return null;
  await mkdir(logDir, { recursive: true });
  const path = `${logDir}/${dao}-${id}.json`;
  await writeFile(path, bigintSafe(entry) + '\n');
  return path;
}

// One pass over the proposals created since `state.next`. dryRun defaults to true: signing is opt-in.
export async function runOnce({ rpc = createRpc(), policy, account, state = { next: null }, logDir, dryRun = true, sign = signVote }) {
  const last = await rpc.viewFunction(policy.dao, 'get_last_proposal_id');
  if (last.status !== 'ok' || typeof last.value !== 'number') return { state, events: [{ type: 'unknown', reason: `get_last_proposal_id: ${last.reason ?? last.detail}` }] };
  const events = [];
  let next = state.next ?? last.value; // first run: only proposals created from now on
  for (; next < last.value; next++) {
    const check = await checkProposal(policy.dao, next, { rpc });
    const d = decide(check, policy);
    const decidedAt = new Date().toISOString();
    const ev = { type: d.action === 'VoteApprove' ? 'approve' : d.action, id: next, reasons: d.reasons };
    if (d.action === 'VoteApprove') {
      ev.command = voteCommand(policy.dao, d, account);
      if (dryRun) ev.signed = 'dry-run: not signed';
      else { const s = await sign(voteArgs(policy.dao, d, account)); ev.signed = s.ok ? 'signed' : 'FAILED'; ev.txId = s.txId; ev.output = s.output; }
    }
    ev.report = await logDecision(logDir, policy.dao, next, { decidedAt, account, decision: d,
      vote: ev.command ? { command: ev.command, signed: ev.signed, txId: ev.txId ?? null, output: ev.output ?? null } : null, check });
    events.push(ev);
    if (ev.signed === 'FAILED') { next++; break; } // stop after a failed signature: a human looks first
  }
  return { state: { next }, events };
}

async function main() {
  const a = process.argv.slice(2); const opt = (n, dflt) => { const i = a.indexOf(n); return i >= 0 ? a[i + 1] : dflt; };
  const account = opt('--account');
  if (!account) { console.error('usage: node agent/delegate.mjs --account <delegate.near> [--policy agent/policy.json] [--state agent/state.json] [--log agent/log] [--once] [--dry-run]'); process.exit(2); }
  const policy = loadPolicy(JSON.parse(await readFile(opt('--policy', 'agent/policy.json'), 'utf8')));
  const statePath = opt('--state', 'agent/state.json');
  const dryRun = a.includes('--dry-run');
  let state; try { state = JSON.parse(await readFile(statePath, 'utf8')); } catch { state = { next: null }; }
  const rpc = createRpc();
  console.log(`delegate ${account} on ${policy.dao}${dryRun ? ' (dry run: prints, signs nothing)' : ' (signs its own votes with its FunctionCall key)'}`);
  for (;;) {
    const r = await runOnce({ rpc, policy, account, state, logDir: opt('--log', 'agent/log'), dryRun });
    for (const e of r.events) {
      if (e.type === 'approve') console.log(`#${e.id} APPROVE — ${e.signed}${e.txId ? ` · tx ${e.txId}` : ''}\n${e.command}${e.signed === 'FAILED' ? `\n${e.output}` : ''}\n  log: ${e.report}`);
      else if (e.type === 'escalate') console.log(`#${e.id} ESCALATE — not voting; a human decides. log: ${e.report}\n  ${e.reasons.join('\n  ')}`);
      else console.log(`#${e.id ?? '-'} ${e.type}: ${(e.reasons ?? [e.reason]).join('; ')}`);
    }
    state = r.state; await writeFile(statePath, JSON.stringify(state) + '\n');
    if (a.includes('--once') || r.events.some((e) => e.signed === 'FAILED')) break;
    await new Promise((res) => setTimeout(res, 30_000));
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
