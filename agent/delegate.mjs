#!/usr/bin/env node
// delegate.mjs — §17.2: a council seat that cannot vote past a flag. For each new proposal on its DAO it
// runs @docket/guard's checkProposal and either votes VoteApprove, bound to the exact kind it checked, or
// escalates to a human with the Docket report. The vote is signed by the delegate's own FunctionCall key
// from the OS keychain, through near-cli: offline with --signer-public-key, then sent (signVote, below).
// Docket's code never sees a key (I13). --dry-run reads and prints the commands, and signs nothing.
// Every decision is logged with its Docket report.
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
import { existsSync, readFileSync, renameSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { createRpc } from '../web/assets/rpc.js';
import { accessKeys } from '../web/assets/resolve.js';
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

// The delegate's prepaid gas per vote. Its 0.05 NEAR is locked and its key's allowance is 0.05 NEAR, so
// 100 Tgas could not be sent: near-cli priced it at 0.1009 NEAR (T7, 2026-11-08). A vote that is not the
// deciding one runs nothing; the deciding vote on #6 (a whole act_proposal with its bond transfer) used 3.7 Tgas.
export const VOTE_GAS = '30 Tgas';
const VOTE_GAS_UNITS = 30n * 10n ** 12n;

// The vote, as a near-cli call (printed in the log). The delegate signs it offline, below.
export function voteCommand(dao, decision, account) {
  return nearCli(dao, 'act_proposal', { id: decision.id, action: 'VoteApprove', proposal: decision.proposalKind }, VOTE_GAS, '0 NEAR', account);
}
const voteJson = (decision) => JSON.stringify({ id: decision.id, action: 'VoteApprove', proposal: decision.proposalKind });

// Why offline: near-cli-rs 0.31.1 sign-with-keychain, online, considers only the signer's FullAccess keys
// (src/transaction_signature_options/sign_with_keychain/mod.rs, the access-key filter). The delegate has
// none (I17), so it signs --offline with --signer-public-key = its one FunctionCall key, which near-cli
// reads from the keychain by its exact entry name, and then sends the signed file. Docket never reads the key (I13).
//
// Step 1. Read, uncached, right before signing: the delegate's keys (I17), then that key's view_access_key,
// whose answer carries the nonce and the final block's hash and height. nonce = the key's current nonce + 1.
// -> { ok: true, publicKey, nonce (BigInt), blockHash, blockHeight } | { ok: false, why }
export async function signingContext(rpc, account, dao, { minHeight = 0 } = {}) {
  const keys = await accessKeys(rpc, account);
  const ko = delegateKeyOk(keys, dao);
  if (!ko.ok) return { ok: false, why: `I17: ${ko.why}` };
  const publicKey = keys.keys[0].publicKey;
  const r = await rpc.query({ request_type: 'view_access_key', finality: 'final', account_id: account, public_key: publicKey });
  if (r.status !== 'ok') return { ok: false, why: `view_access_key: ${r.status} ${r.reason ?? r.detail ?? ''}`.trim() };
  const { nonce, block_hash: blockHash, block_height: blockHeight } = r.value ?? {};
  if (!Number.isSafeInteger(nonce) || typeof blockHash !== 'string' || !Number.isSafeInteger(blockHeight)) return { ok: false, why: 'view_access_key: unexpected shape' };
  if (blockHeight < minHeight) return { ok: false, why: `block ${blockHeight} is older than the proposal read at ${minHeight}` };
  return { ok: true, publicKey, nonce: BigInt(nonce) + 1n, blockHash, blockHeight };
}

// Step 2. Sign offline with that exact key; near-cli writes the signed transaction to `file`.
export function signArgs(dao, decision, account, ctx, file) {
  return ['--offline', 'contract', 'call-function', 'as-transaction', dao, 'act_proposal', 'json-args', voteJson(decision),
    'prepaid-gas', VOTE_GAS, 'attached-deposit', '0 NEAR', 'sign-as', account, 'network-config', 'mainnet',
    'sign-with-keychain', '--signer-public-key', ctx.publicKey, '--nonce', String(ctx.nonce),
    '--block-hash', ctx.blockHash, '--block-height', String(ctx.blockHeight), 'save-to-file', file];
}
// Step 3. Send the signed file.
export function sendArgs(file) {
  return ['transaction', 'send-signed-transaction', 'file-with-base64-signed-transaction', file, 'network-config', 'mainnet', 'send'];
}

// JSON with object keys sorted, recursively: same keys, values and types compare equal whatever the key
// order; anything that does not parse is kept as an unparseable marker, so it never matches.
export function canonicalJson(text) {
  const sort = (v) => (Array.isArray(v) ? v.map(sort) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sort(v[k])])) : v);
  try { return JSON.stringify(sort(JSON.parse(text))); } catch { return `unparseable: ${text}`; }
}

const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
export function base58(bytes) {
  let n = 0n;
  for (const b of bytes) n = n * 256n + BigInt(b);
  let out = '';
  while (n > 0n) { out = B58[Number(n % 58n)] + out; n /= 58n; }
  for (const b of bytes) { if (b !== 0) break; out = '1' + out; }
  return out;
}

// Between steps 2 and 3: decode the signed transaction near-cli wrote ({"signed_transaction_as_base64"},
// borsh TransactionV0), and send it only if it is exactly the vote that was meant: the signer, key, nonce,
// receiver and block hash, one FunctionCall to act_proposal with these args, VOTE_GAS, and 0 deposit.
// -> { ok: true } | { ok: false, why }
export function checkSigned(text, { account, dao, decision, ctx }) {
  let b;
  try { b = Buffer.from(JSON.parse(text).signed_transaction_as_base64, 'base64'); } catch (e) { return { ok: false, why: `signed file unreadable: ${e.message}` }; }
  let o = 0;
  const take = (n) => { if (o + n > b.length) throw new Error('too short'); const v = b.subarray(o, o + n); o += n; return v; };
  const u32 = () => take(4).readUInt32LE(0);
  const str = () => take(u32()).toString('utf8');
  try {
    const got = {};
    got.signer = str();
    const keyType = take(1)[0];
    got.publicKey = keyType === 0 ? `ed25519:${base58(take(32))}` : `key type ${keyType}`;
    got.nonce = take(8).readBigUInt64LE(0);
    got.receiver = str();
    got.blockHash = base58(take(32));
    got.actions = u32();
    got.action = take(1)[0]; // 2 = FunctionCall
    got.method = str();
    got.args = canonicalJson(str()); // near-cli re-serialises the args with sorted keys (T7, 2026-11-08)
    got.gas = take(8).readBigUInt64LE(0);
    const dep = take(16);
    got.deposit = dep.readBigUInt64LE(0) + (dep.readBigUInt64LE(8) << 64n);
    const want = { signer: account, publicKey: ctx.publicKey, nonce: ctx.nonce, receiver: dao, blockHash: ctx.blockHash,
      actions: 1, action: 2, method: 'act_proposal', args: canonicalJson(voteJson(decision)), gas: VOTE_GAS_UNITS, deposit: 0n };
    const bad = Object.keys(want).filter((k) => got[k] !== want[k]);
    return bad.length ? { ok: false, why: `the signed transaction differs from the intended vote in: ${bad.map((k) => `${k} (${got[k]})`).join(', ')}` } : { ok: true };
  } catch (e) { return { ok: false, why: `the signed transaction is not decodable as TransactionV0: ${e.message}` }; }
}

const quote = (a) => (/^[A-Za-z0-9_./:@=+-]+$/.test(a) ? a : `'${a.replace(/'/g, `'\\''`)}'`);
export const shellLine = (bin, args) => [quote(bin), ...args.map(quote)].join(' ');

function exec(run, bin, args) {
  return new Promise((resolve) => {
    run(bin, args, { timeout: 120_000, maxBuffer: 4 << 20 }, (err, stdout, stderr) => {
      resolve({ ok: !err, output: (String(stdout ?? '') + String(stderr ?? '')).slice(-4000) });
    });
  });
}

const signedPath = (signedDir, dao, id) => `${signedDir}/${dao}-${id}.signed.json`;

// Steps 1 to 3. Never re-signs: if a signed file for this proposal is already there (an earlier send failed),
// it stops, and a human sends it or deletes it. A failure at any step returns ok: false with its stage.
// -> { ok, stage, why, txId, signedFile, commands, ctx, output }
export async function signVote({ dao, decision, account }, { bin = process.env.NEAR_CLI ?? 'near', run = execFile,
  freshRpc = () => createRpc(), signedDir = 'agent/signed', minHeight = 0 } = {}) {
  const file = signedPath(signedDir, dao, decision.id);
  const r = { ok: false, stage: null, why: null, txId: null, signedFile: null, commands: [], ctx: null, output: '' };
  const fail = (stage, why) => ({ ...r, stage, why });
  if (existsSync(file)) { r.signedFile = file; return fail('pending', `a signed transaction for #${decision.id} is already at ${file}; a human sends it or deletes it, and the delegate does not re-sign`); }
  const ctx = await signingContext(freshRpc(), account, dao, { minHeight }); // read right before signing
  if (!ctx.ok) return fail('context', ctx.why);
  r.ctx = ctx;
  await mkdir(signedDir, { recursive: true });
  const sa = signArgs(dao, decision, account, ctx, file);
  r.commands.push(shellLine(bin, sa));
  const s = await exec(run, bin, sa);
  r.output = s.output;
  if (!s.ok || !existsSync(file)) return fail('sign', 'near-cli did not write a signed transaction');
  r.signedFile = file;
  const c = checkSigned(readFileSync(file, 'utf8'), { account, dao, decision, ctx });
  if (!c.ok) return fail('check', `${c.why}; not sent`);
  const ta = sendArgs(file);
  r.commands.push(shellLine(bin, ta));
  const t = await exec(run, bin, ta);
  r.output = t.output;
  r.txId = (t.output.match(/Transaction ID: ([1-9A-HJ-NP-Za-km-z]{43,44})/) ?? [])[1] ?? null;
  if (!t.ok || !r.txId) return fail('send', `sending failed; the signed transaction is kept at ${file}`);
  const sent = file.replace(/\.signed\.json$/, '.sent.json');
  renameSync(file, sent);
  r.signedFile = sent;
  return { ...r, ok: true, stage: 'sent' };
}

// --dry-run: step 1 only (reads), then the commands that steps 2 and 3 would run. Signs nothing.
export async function previewVote({ dao, decision, account }, { bin = process.env.NEAR_CLI ?? 'near', freshRpc = () => createRpc(),
  signedDir = 'agent/signed', minHeight = 0 } = {}) {
  const file = signedPath(signedDir, dao, decision.id);
  const ctx = await signingContext(freshRpc(), account, dao, { minHeight });
  const shown = ctx.ok ? ctx : { publicKey: '<key>', nonce: '<nonce+1>', blockHash: '<block-hash>', blockHeight: '<block-height>' };
  return { ctx, commands: [shellLine(bin, signArgs(dao, decision, account, shown, file)), shellLine(bin, sendArgs(file))] };
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
export async function runOnce({ rpc = createRpc(), policy, account, state = { next: null }, logDir, dryRun = true, sign = signVote, preview = previewVote, signOpts = {} }) {
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
      const req = { dao: policy.dao, decision: d, account };
      const opts = { ...signOpts, minHeight: last.block_height ?? 0 };
      if (dryRun) { const p = await preview(req, opts); ev.signed = 'dry-run: not signed'; ev.commands = p.commands; ev.signing = p.ctx; }
      else {
        const s = await sign(req, opts);
        Object.assign(ev, { signed: s.ok ? 'signed' : 'FAILED', txId: s.txId, output: s.output, stage: s.stage, why: s.why,
          signedFile: s.signedFile, commands: s.commands, signing: s.ctx });
      }
    }
    ev.report = await logDecision(logDir, policy.dao, next, { decidedAt, account, decision: d,
      vote: ev.command ? { command: ev.command, commands: ev.commands ?? [], signing: ev.signing ?? null, signed: ev.signed,
        stage: ev.stage ?? null, why: ev.why ?? null, signedFile: ev.signedFile ?? null, txId: ev.txId ?? null, output: ev.output ?? null } : null, check });
    events.push(ev);
    if (ev.signed === 'FAILED') break; // stop, and do not advance: the failed proposal is retried on the next run, after a human looks
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
      if (e.type === 'approve') console.log(`#${e.id} APPROVE — ${e.signed}${e.txId ? ` · tx ${e.txId}` : ''}${e.signed === 'FAILED' ? ` at ${e.stage}: ${e.why}` : ''}\n  the vote: ${e.command}\n${(e.commands ?? []).map((c, i) => `  step ${i + 2}: ${c}`).join('\n')}${e.signedFile ? `\n  signed file: ${e.signedFile}` : ''}${e.signed === 'FAILED' ? `\n${e.output}` : ''}\n  log: ${e.report}`);
      else if (e.type === 'escalate') console.log(`#${e.id} ESCALATE — not voting; a human decides. log: ${e.report}\n  ${e.reasons.join('\n  ')}`);
      else console.log(`#${e.id ?? '-'} ${e.type}: ${(e.reasons ?? [e.reason]).join('; ')}`);
    }
    state = r.state; await writeFile(statePath, JSON.stringify(state) + '\n');
    if (a.includes('--once') || r.events.some((e) => e.signed === 'FAILED')) break;
    await new Promise((res) => setTimeout(res, 30_000));
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
