// decode.js — the 17 Sputnik ProposalKind variants, their permission labels and risk (§6.4), the
// permission model and vote thresholds (§6.1, §16.2), and argument/amount decoding (§6.3).
// Runs unmodified in the browser and in Node: depends only on atob/TextDecoder.
//
// Every rule here is read from near-daos/sputnik-dao-contract at the deployed commits
// (v3.0 86cc77a0808a, v3.1 3d568f9517a8, v3.2 2b0f34a38604), not from memory:
//   ProposalKind + to_policy_label   proposals.rs (v3.2 lines 67–147; the same 17 variants at v3.0)
//   permission matching              policy.rs Policy::can_execute_action
//   thresholds                       policy.rs Policy::proposal_status + WeightOrRatio::to_weight
//   Action labels                    types.rs Action::to_policy_label (= the variant name)
//
// Enforces:
//   I7   the taxonomy is exhaustive over ProposalKind; an unknown variant is 'unknown' AND critical
//   I8   undecodable args are a refusal ({status:'refused'}), never empty, never silently dropped
//   I10  amounts are BigInt end to end and use ft_metadata decimals; Number never holds a base unit
//   I2   an unreadable ft_metadata makes the amount 'unknown' — 24 decimals is never assumed for a token

// ---- §6.4: the 17 kinds -------------------------------------------------------------------------
// risk: critical | high | medium | low | none. `reaches` is the §6.4 column.
export const KINDS = Object.freeze({
  FunctionCall:                        { label: 'call',                              risk: 'critical', reaches: 'any method on any contract' },
  UpgradeRemote:                       { label: 'upgrade_remote',                    risk: 'critical', reaches: "another contract's code" },
  UpgradeSelf:                         { label: 'upgrade_self',                      risk: 'critical', reaches: "the DAO's own code" },
  ChangePolicy:                        { label: 'policy',                            risk: 'critical', reaches: 'every future vote' },
  FactoryInfoUpdate:                   { label: 'factory_info_update',               risk: 'critical', reaches: 'auto_update itself' },
  ChangePolicyUpdateDefaultVotePolicy: { label: 'policy_update_default_vote_policy', risk: 'critical', reaches: 'every future vote' },
  ChangePolicyUpdateParameters:        { label: 'policy_update_parameters',          risk: 'high',     reaches: 'vote parameters' },
  ChangePolicyAddOrUpdateRole:         { label: 'policy_add_or_update_role',         risk: 'high',     reaches: 'who may propose/vote' },
  ChangePolicyRemoveRole:              { label: 'policy_remove_role',                risk: 'high',     reaches: 'who may propose/vote' },
  AddMemberToRole:                     { label: 'add_member_to_role',                risk: 'high',     reaches: 'who may vote' },
  RemoveMemberFromRole:                { label: 'remove_member_from_role',           risk: 'high',     reaches: 'who may vote' },
  SetStakingContract:                  { label: 'set_vote_token',                    risk: 'high',     reaches: 'vote weighting' },
  Transfer:                            { label: 'transfer',                          risk: 'medium',   reaches: 'treasury' },
  AddBounty:                           { label: 'add_bounty',                        risk: 'medium',   reaches: 'treasury' },
  BountyDone:                          { label: 'bounty_done',                       risk: 'medium',   reaches: 'treasury' },
  ChangeConfig:                        { label: 'config',                            risk: 'low',      reaches: 'DAO metadata' },
  Vote:                                { label: 'vote',                              risk: 'none',     reaches: 'nothing' },
});
export const KIND_COUNT = 17;

// The nine kinds that change who can pass what (§6.3 "authority delta", §6.5 "authority change").
export const AUTHORITY_KINDS = Object.freeze(['ChangePolicy', 'ChangePolicyUpdateDefaultVotePolicy',
  'ChangePolicyUpdateParameters', 'ChangePolicyAddOrUpdateRole', 'ChangePolicyRemoveRole',
  'AddMemberToRole', 'RemoveMemberFromRole', 'SetStakingContract', 'FactoryInfoUpdate']);

// types.rs Action — the label is the variant name.
// A proposal's `kind` as returned by get_proposal(s): an object with exactly one key, or the bare
// string "Vote" (a unit variant serialises as a string). Anything else is unknown (I7).
// -> { status:'ok', name, label, risk, reaches, body } | { status:'unknown', name, risk:'critical', reason }
export function kindOf(kind) {
  let name, body;
  if (typeof kind === 'string') { name = kind; body = null; }
  else if (kind && typeof kind === 'object' && !Array.isArray(kind) && Object.keys(kind).length === 1) {
    [name] = Object.keys(kind); body = kind[name];
  } else return { status: 'unknown', name: null, risk: 'critical', reason: 'proposal kind has an unrecognised shape' };
  const k = Object.hasOwn(KINDS, name) ? KINDS[name] : null;
  if (!k) return { status: 'unknown', name, risk: 'critical', reason: `ProposalKind "${name}" is not one of the 17 known variants` };
  return { status: 'ok', name, ...k, body };
}

// ---- permission model (policy.rs can_execute_action) -------------------------------------------
// A role permits (label, action) iff its permission set contains one of:
//   "{label}:{action}", "{label}:*", "*:{action}", "*:*"
export function permits(permissions, label, action) {
  const has = (s) => (permissions instanceof Set ? permissions.has(s) : permissions.includes(s));
  return has(`${label}:${action}`) || has(`${label}:*`) || has(`*:${action}`) || has('*:*');
}

// Roles (by name) whose permissions allow `action` on proposals labelled `label`.
export function rolesPermitting(policy, label, action) {
  return policy.roles.filter((r) => permits(r.permissions, label, action)).map((r) => r.name);
}

// ---- thresholds (policy.rs proposal_status, WeightOrRatio::to_weight) ---------------------------
// A role's vote policy for a label is role.vote_policy[label], else policy.default_vote_policy.
// threshold = max(quorum, to_weight(total)), where for RoleWeight on a Group, total = group size;
//   Weight(w)        -> min(w, total)
//   Ratio(num, den)  -> min(num * total / den + 1, total)        (integer division, as in Rust u128)
// RoleKind::Everyone is skipped ("doesn't provide a total size"): its votes never pass anything.
// Token-weighted roles and Member roles depend on token supply: not evaluated here -> unknown (I2).
// -> { status:'ok', k: BigInt, n: BigInt }      k of n members' approvals pass it
//  | { status:'ignored', reason }                 Everyone: never counts toward any threshold
//  | { status:'unknown', reason }
export function thresholdFor(policy, roleName, label) {
  const role = policy.roles.find((r) => r.name === roleName);
  if (!role) return { status: 'unknown', reason: `role "${roleName}" not in policy` };
  if (role.kind === 'Everyone') return { status: 'ignored', reason: 'Everyone role: skipped by proposal_status, its votes never reach a threshold' };
  const vp = role.vote_policy?.[label] ?? policy.default_vote_policy;
  if (!vp || typeof vp !== 'object') return { status: 'unknown', reason: 'no vote policy' };
  if (!role.kind || typeof role.kind !== 'object' || !Array.isArray(role.kind.Group)) {
    return { status: 'unknown', reason: `role kind ${JSON.stringify(role.kind)} is token-based: threshold depends on supply` };
  }
  if (vp.weight_kind !== 'RoleWeight') return { status: 'unknown', reason: `weight_kind ${vp.weight_kind}: threshold depends on token supply` };
  const n = BigInt(role.kind.Group.length);
  let w;
  const t = vp.threshold;
  if (Array.isArray(t) && t.length === 2) {
    const num = BigInt(t[0]); const den = BigInt(t[1]);
    if (den === 0n) return { status: 'unknown', reason: 'ratio with zero denominator' };
    w = num * n / den + 1n; if (w > n) w = n;
  } else if (typeof t === 'string' && /^\d+$/.test(t)) {
    w = BigInt(t); if (w > n) w = n;
  } else return { status: 'unknown', reason: `unrecognised threshold ${JSON.stringify(t)}` };
  const quorum = typeof vp.quorum === 'string' && /^\d+$/.test(vp.quorum) ? BigInt(vp.quorum) : null;
  if (quorum === null) return { status: 'unknown', reason: `unrecognised quorum ${JSON.stringify(vp.quorum)}` };
  const k = quorum > w ? quorum : w;
  return { status: 'ok', k, n };
}

// Who can get a proposal labelled `label` passed: the roles that may add it, and for each role that
// may VoteApprove it, how many of its members must approve. Proposals pass when ANY one role's
// approvals reach that role's threshold (proposal_status checks roles one at a time).
// -> { label, proposers:[role], passers:[{ role, members, k, n }], ignored:[{role, reason}], unknown:[{role, reason}] }
export function whoCanPass(policy, label) {
  const proposers = rolesPermitting(policy, label, 'AddProposal');
  const out = { label, proposers, passers: [], ignored: [], unknown: [] };
  if (!proposers.length) return out; // nobody can add it, so nobody can pass it
  for (const role of rolesPermitting(policy, label, 'VoteApprove')) {
    const t = thresholdFor(policy, role, label);
    const r = policy.roles.find((x) => x.name === role);
    if (t.status === 'ok') out.passers.push({ role, members: [...r.kind.Group], k: t.k, n: t.n });
    else if (t.status === 'ignored') out.ignored.push({ role, reason: t.reason });
    else out.unknown.push({ role, reason: t.reason });
  }
  return out;
}

// ---- arguments (I8) ------------------------------------------------------------------------------
const B64 = /^[A-Za-z0-9+/]*={0,2}$/;

// -> { status:'json', value, text } | { status:'text', text } | { status:'binary', bytes }
//  | { status:'empty' }                (valid base64 of zero bytes)
//  | { status:'refused', reason }      (I8: undecodable — never rendered as empty)
export function decodeArgs(b64) {
  if (typeof b64 !== 'string') return { status: 'refused', reason: 'args is not a base64 string' };
  if (b64 === '') return { status: 'empty' };
  if (b64.length % 4 !== 0 || !B64.test(b64)) return { status: 'refused', reason: 'args is not valid base64' };
  let bin;
  try { bin = atob(b64); } catch { return { status: 'refused', reason: 'args is not valid base64' }; }
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  let text;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { return { status: 'binary', bytes }; }
  try { return { status: 'json', value: parseJsonLossless(text), text }; } catch { return { status: 'text', text }; }
}

// JSON.parse, except every integer literal becomes a BigInt and every other number stays its exact
// source text, so no base-unit amount ever passes through Number (I10).
export function parseJsonLossless(text) {
  let i = 0;
  const ws = () => { while (i < text.length && ' \t\n\r'.includes(text[i])) i++; };
  const fail = (m) => { throw new SyntaxError(`${m} at ${i}`); };
  function value() {
    ws();
    const c = text[i];
    if (c === '{') {
      i++; const o = {}; ws();
      if (text[i] === '}') { i++; return o; }
      for (;;) {
        ws(); if (text[i] !== '"') fail('expected key');
        const k = str(); ws(); if (text[i++] !== ':') fail('expected :');
        o[k] = value(); ws();
        if (text[i] === ',') { i++; continue; }
        if (text[i] === '}') { i++; return o; }
        fail('expected , or }');
      }
    }
    if (c === '[') {
      i++; const a = []; ws();
      if (text[i] === ']') { i++; return a; }
      for (;;) {
        a.push(value()); ws();
        if (text[i] === ',') { i++; continue; }
        if (text[i] === ']') { i++; return a; }
        fail('expected , or ]');
      }
    }
    if (c === '"') return str();
    if (text.startsWith('true', i)) { i += 4; return true; }
    if (text.startsWith('false', i)) { i += 5; return false; }
    if (text.startsWith('null', i)) { i += 4; return null; }
    const m = /^-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?/.exec(text.slice(i));
    if (!m) fail('unexpected token');
    i += m[0].length;
    return m[2] || m[3] ? { $number: m[0] } : BigInt(m[0]);
  }
  function str() {
    const start = i; i++;
    while (i < text.length && text[i] !== '"') i += text[i] === '\\' ? 2 : 1;
    if (text[i] !== '"') fail('unterminated string');
    i++;
    return JSON.parse(text.slice(start, i));
  }
  const v = value(); ws();
  if (i !== text.length) fail('trailing data');
  return v;
}

// ---- amounts (I10) -------------------------------------------------------------------------------
// raw: a base-unit amount as a decimal string or BigInt. decimals: a non-negative integer.
// -> "6,000,000" / "634,981.18" style string, exact, no rounding.
export function formatUnits(raw, decimals) {
  const v = typeof raw === 'bigint' ? raw : BigInt(raw);
  const d = BigInt(decimals);
  const neg = v < 0n; const a = neg ? -v : v;
  const base = 10n ** d;
  const whole = (a / base).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  let frac = d > 0n ? (a % base).toString().padStart(Number(d), '0').replace(/0+$/, '') : '';
  return `${neg ? '-' : ''}${whole}${frac ? '.' + frac : ''}`;
}

export const NEAR_DECIMALS = 24;

// Decimals for a token: NEAR (Sputnik's "" / null token_id) is 24 by protocol; anything else is read
// from its ft_metadata. Unreadable -> unknown, never 24 (I2, I10).
// -> { status:'ok', decimals, symbol } | { status:'unknown', reason }
export async function tokenDecimals(rpc, tokenId) {
  if (tokenId === '' || tokenId === null || tokenId === undefined) return { status: 'ok', decimals: NEAR_DECIMALS, symbol: 'NEAR' };
  const r = await rpc.viewFunction(tokenId, 'ft_metadata');
  if (r.status !== 'ok') return { status: 'unknown', reason: `ft_metadata on ${tokenId}: ${r.reason ?? r.what ?? r.detail ?? r.status}` };
  const dec = r.value?.decimals;
  if (!Number.isInteger(dec) || dec < 0 || dec > 255) return { status: 'unknown', reason: `ft_metadata on ${tokenId}: decimals ${JSON.stringify(dec)}` };
  return { status: 'ok', decimals: dec, symbol: typeof r.value.symbol === 'string' ? r.value.symbol : null };
}

// -> { status:'ok', raw: BigInt, decimals, symbol, display } | { status:'unknown', raw, reason }
export async function tokenAmount(rpc, tokenId, raw) {
  let v;
  try { v = typeof raw === 'bigint' ? raw : BigInt(raw); } catch { return { status: 'unknown', raw, reason: `amount ${JSON.stringify(raw)} is not an integer` }; }
  const t = await tokenDecimals(rpc, tokenId);
  if (t.status !== 'ok') return { status: 'unknown', raw: v, reason: t.reason };
  return { status: 'ok', raw: v, decimals: t.decimals, symbol: t.symbol, display: formatUnits(v, t.decimals) };
}

// ---- a whole proposal ------------------------------------------------------------------------------
// -> { id, description, status, kind: kindOf(...), receiver, actions:[{ method, args: decodeArgs, deposit, gas }],
//      amount?: tokenAmount (Transfer), hash?, unknowns:[reason] }
export async function decodeProposal(rpc, proposal) {
  const kind = kindOf(proposal.kind);
  const out = { id: proposal.id, description: proposal.description ?? '', status: proposal.status, proposer: proposal.proposer,
    kind, receiver: null, actions: [], unknowns: [] };
  if (kind.status !== 'ok') { out.unknowns.push(kind.reason); return out; }
  const b = kind.body ?? {};
  switch (kind.name) {
    case 'FunctionCall':
      out.receiver = b.receiver_id ?? null;
      out.actions = (Array.isArray(b.actions) ? b.actions : []).map((a) => ({
        method: a.method_name, args: decodeArgs(a.args), deposit: a.deposit, gas: a.gas }));
      if (!Array.isArray(b.actions)) out.unknowns.push('FunctionCall has no actions array');
      for (const a of out.actions) if (a.args.status === 'refused') out.unknowns.push(`args of ${a.method}: ${a.args.reason}`);
      break;
    case 'UpgradeRemote':
      out.receiver = b.receiver_id ?? null; out.actions = [{ method: b.method_name, args: { status: 'empty' } }]; out.hash = b.hash; break;
    case 'UpgradeSelf': out.hash = b.hash; break;
    case 'Transfer':
      out.receiver = b.receiver_id ?? null;
      out.amount = await tokenAmount(rpc, b.token_id, b.amount);
      out.tokenId = b.token_id === '' ? null : b.token_id;
      if (out.amount.status !== 'ok') out.unknowns.push(out.amount.reason);
      break;
    case 'BountyDone': out.receiver = b.receiver_id ?? null; break;
    case 'AddMemberToRole': case 'RemoveMemberFromRole': out.member = b.member_id; out.role = b.role; break;
    case 'SetStakingContract': out.receiver = b.staking_id ?? null; break;
    default: break;
  }
  return out;
}
