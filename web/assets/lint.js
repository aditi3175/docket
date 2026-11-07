// lint.js — the §6.5 mismatch classifier: compares a proposal's description with its decoded action.
//
// Enforces:
//   I9  it flags and never clears. The result is { flags, unknowns }: no "safe", no verdict, no score.
//       An empty flag list means "no check fired", and is never presented as a clearance.
//   I7  an unknown ProposalKind is a critical flag
//   I8  undecodable args are a critical flag
//   I2  a comparison that needs a read that failed (e.g. ft_metadata) is reported in unknowns,
//       never resolved in the proposal's favour
//
// Input: proposals as returned by decode.js decodeProposal(). Siblings are other decoded proposals of
// the same DAO, for the sibling-collision check.

import { AUTHORITY_KINDS, tokenDecimals } from './decode.js';

export const CHECKS = Object.freeze(['named-receiver', 'sibling-collision', 'named-amounts', 'silent-reach',
  'cross-organisation', 'empty-assertion', 'authority-change', 'unknown-kind', 'undecodable-args']);

// Docket's own floor, not from any source: a description with fewer words than this, once UI markers
// are stripped, asserts too little to be compared with anything (§6.5 "empty assertion").
export const EMPTY_ASSERTION_MIN_WORDS = 4;

// Astro / Sputnik UIs append a marker such as "$$$$$$$$ProposeCustomFunctionCall" to descriptions.
const UI_MARKER = /\${4,}\S*/g;
// NEAR account ids as they appear in prose: named accounts ending in a known TLD, or 64-hex implicit.
const ACCOUNT_IN_TEXT = /(?<![\w.-])(?:[a-z0-9]+(?:[-_][a-z0-9]+)*\.)+(?:near|tg|aurora)(?![\w-])|(?<![0-9a-f])[0-9a-f]{64}(?![0-9a-f])/g;
const IS_ACCOUNT = /^(?=.{2,64}$)(([a-z\d]+[-_])*[a-z\d]+\.)*([a-z\d]+[-_])*[a-z\d]+$/;

export function accountsInText(text) {
  return [...new Set(String(text ?? '').match(ACCOUNT_IN_TEXT) ?? [])];
}

export function stripUiMarkers(text) {
  return String(text ?? '').replace(UI_MARKER, ' ').trim();
}

// Every string value in decoded JSON args that is an account id, and every integer (BigInt or digit
// string), with the key it sat under.
function walkArgs(v, key, out) {
  if (typeof v === 'bigint') out.ints.push({ key, raw: v });
  else if (typeof v === 'string') {
    if (/^\d+$/.test(v)) out.ints.push({ key, raw: BigInt(v) });
    else if (IS_ACCOUNT.test(v) && v.includes('.')) out.accounts.push({ key, id: v });
  } else if (Array.isArray(v)) v.forEach((x) => walkArgs(x, key, out));
  else if (v && typeof v === 'object' && !('$number' in v)) for (const [k, x] of Object.entries(v)) walkArgs(x, k, out);
  return out;
}

function argsOf(d) {
  const out = { ints: [], accounts: [] };
  for (const a of d.actions ?? []) if (a.args?.status === 'json') walkArgs(a.args.value, null, out);
  return out;
}

// The accounts the action touches: its receiver, and any account named in its args.
export function touched(d) {
  const set = new Set();
  if (d.receiver) set.add(d.receiver);
  if (d.tokenId) set.add(d.tokenId);
  for (const a of argsOf(d).accounts) set.add(a.id);
  return set;
}

// Amount-like numerals in prose: "6M", "15.5M", "1,000", "2.5k", "0.1". Not "#433" (an id).
// -> [{ text, digits: BigInt, scale: BigInt }]  value = digits / 10^scale, exactly
const NUMERAL = /(?<![#\w.])(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d+))?\s?([kKmMbB])?(?![\w.])/g;
const SUFFIX = { k: 3n, m: 6n, b: 9n };
export function numeralsInText(text) {
  const out = [];
  for (const m of String(text ?? '').matchAll(NUMERAL)) {
    const int = m[1].replace(/,/g, ''); const frac = m[2] ?? '';
    const mult = m[3] ? SUFFIX[m[3].toLowerCase()] : 0n;
    out.push({ text: m[0], digits: BigInt(int + frac), scale: BigInt(frac.length) - mult });
  }
  return out;
}

// Does numeral n equal raw base units at `decimals`?  n.digits * 10^(decimals - n.scale) == raw
function matches(n, raw, decimals) {
  const e = BigInt(decimals) - n.scale;
  return e >= 0n ? n.digits * 10n ** e === raw : n.digits === raw * 10n ** -e;
}

// -> { flags: [{ check, severity, detail, evidence }], unknowns: [string] }
export async function lintProposal(rpc, d, { dao, siblings = [], controlled = new Set() } = {}) {
  const flags = [];
  const unknowns = [...(d.unknowns ?? [])];
  const flag = (check, severity, detail, evidence = {}) => flags.push({ check, severity, detail, evidence });
  const desc = d.description ?? '';
  const named = accountsInText(stripUiMarkers(desc));

  // I7 / I8 — decode could not establish what this proposal does
  if (d.kind?.status !== 'ok') flag('unknown-kind', 'critical', d.kind?.reason ?? 'unknown proposal kind');
  for (const a of d.actions ?? []) if (a.args?.status === 'refused') flag('undecodable-args', 'critical', `args of ${a.method} could not be decoded: ${a.args.reason}`);

  // authority change — the nine kinds that alter who can pass what
  if (d.kind?.status === 'ok' && AUTHORITY_KINDS.includes(d.kind.name)) {
    flag('authority-change', d.kind.risk, `${d.kind.name} changes who can pass what (${d.kind.reaches})`);
  }

  // §6.3: is an account inside this DAO's own control set? `controlled` holds the accounts the caller
  // resolved as owned by this DAO (§6.2), or the DAO itself. Inside lowers named-receiver and
  // silent-reach to 'low' with a note; it never removes the flag (I9). Outside, or not resolved: 'high'.
  const own = (a) => a === dao || controlled.has(a);
  const ownNote = (a) => (a === dao ? 'the DAO itself' : `its own contract, owned by ${dao}`);
  const touches = touched(d);
  if (touches.size) {
    // named receiver — accounts in the description must appear in the action, and vice versa
    const notInAction = named.filter((a) => !touches.has(a));
    const receiverUnnamed = d.receiver && !named.includes(d.receiver);
    if (notInAction.length || receiverUnnamed) {
      const ownReceiverOnly = receiverUnnamed && !notInAction.length && own(d.receiver);
      flag('named-receiver', ownReceiverOnly ? 'low' : 'high',
        [receiverUnnamed && `the description does not name the receiver ${d.receiver}${own(d.receiver) ? ` (${ownNote(d.receiver)})` : ''}`,
          notInAction.length && `the description names ${notInAction.join(', ')}, which the action does not touch`].filter(Boolean).join('; '),
        { receiver: d.receiver, named, notInAction, ownReceiver: Boolean(d.receiver && own(d.receiver)) });
    }
    // silent reach — the action touches an account the description never mentions
    const silent = [...touches].filter((a) => !named.includes(a));
    const outside = silent.filter((a) => !own(a)); const inside = silent.filter(own);
    if (outside.length) flag('silent-reach', 'high', `the action touches ${outside.join(', ')}, which the description never mentions`, { silent: outside });
    if (inside.length) flag('silent-reach', 'low', `the action touches ${inside.map((a) => `${a} (${ownNote(a)})`).join(', ')}, which the description never mentions`, { silent: inside, own: true });
  }

  // cross-organisation — the action is aimed at another DAO
  const methods = (d.actions ?? []).map((a) => a.method);
  const otherDao = d.receiver && d.receiver !== dao && (/\.sputnik-dao\.near$/.test(d.receiver) || methods.some((m) => m === 'act_proposal' || m === 'add_proposal'));
  if (otherDao) flag('cross-organisation', 'critical', `the action targets another DAO, ${d.receiver}${methods.length ? ` (${methods.join(', ')})` : ''}`, { receiver: d.receiver, methods });

  // empty assertion — nothing to compare the action against
  const words = stripUiMarkers(desc).match(/[\p{L}\p{N}][\p{L}\p{N}._-]*/gu) ?? [];
  if (words.length < EMPTY_ASSERTION_MIN_WORDS) {
    flag('empty-assertion', 'medium', words.length ? `the description, without UI markers, is ${words.length} word${words.length > 1 ? 's' : ''}: "${words.join(' ')}"` : 'the description is empty', { words: words.length, min: EMPTY_ASSERTION_MIN_WORDS });
  }

  // sibling collision — same words, different (receiver, method)
  const key = (x) => `${x.receiver ?? ''} ${(x.actions ?? []).map((a) => a.method).join(',')}`;
  const norm = (s) => stripUiMarkers(s).replace(/\s+/g, ' ').toLowerCase();
  if (norm(desc)) {
    const twins = siblings.filter((s) => s.id !== d.id && norm(s.description) === norm(desc) && key(s) !== key(d));
    if (twins.length) {
      flag('sibling-collision', 'high', `same description as ${twins.map((s) => `#${s.id} (${s.receiver ?? '—'}, ${s.status ?? '?'})`).join(', ')}, different target`,
        { siblings: twins.map((s) => ({ id: s.id, receiver: s.receiver, status: s.status })) });
    }
  }

  // named amounts — numerals in the description must match a decoded amount at the token's decimals
  const nums = numeralsInText(stripUiMarkers(desc));
  if (nums.length) {
    const candidates = []; // { raw, decimals }
    if (d.amount?.status === 'ok') candidates.push({ raw: d.amount.raw, decimals: d.amount.decimals });
    else if (d.kind?.name === 'Transfer') unknowns.push(`named amounts: ${d.amount?.reason ?? 'transfer amount unknown'}`);
    const args = argsOf(d);
    const tokenKeys = args.accounts.filter((a) => /token/i.test(a.key ?? ''));
    const decs = [0];
    for (const t of tokenKeys) {
      const r = await tokenDecimals(rpc, t.id);
      if (r.status === 'ok') decs.push(r.decimals); else unknowns.push(`named amounts: ${r.reason}`);
    }
    for (const i of args.ints) for (const dec of decs) candidates.push({ raw: i.raw, decimals: dec });
    if (candidates.length) {
      const unmatched = nums.filter((n) => !candidates.some((c) => matches(n, c.raw, c.decimals)));
      if (unmatched.length) flag('named-amounts', 'high', `the description says ${unmatched.map((n) => `"${n.text}"`).join(', ')}, which matches no decoded amount`, { unmatched: unmatched.map((n) => n.text) });
    }
  }

  return { flags, unknowns };
}
