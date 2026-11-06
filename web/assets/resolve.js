// resolve.js — owner resolution (§6.2), the authority walk (§6.1) and code identity (§4, §5).
//
// Enforces:
//   I2   any read that fails after failover makes the answer 'unknown' — never "no owner",
//        never "no contract", never "no keys"; a walk with any unknown read is itself unknown
//   I6   the authority walk terminates: cycle detection, depth cap 6
//   I3   code identity reads code_hash, global_contract_hash AND global_contract_account_id
//   I4   global_contract_account_id is always flagged as a third-party upgrade path
//   I12  every code hash is joined to a factory version + commit where one exists

import { KINDS, whoCanPass } from './decode.js';

export const ZERO_HASH = '11111111111111111111111111111111'; // 32 zero bytes, base58

// NEAR account id rules: 2..64 chars, lowercase alnum separated by single - _ or .
const ACCOUNT_RE = /^(?=.{2,64}$)(([a-z\d]+[-_])*[a-z\d]+\.)*([a-z\d]+[-_])*[a-z\d]+$/;
export const isAccountId = (s) => typeof s === 'string' && ACCOUNT_RE.test(s);

// §6.2, in order. Each getter lists the fields to try, in order; '' means the return itself.
export const OWNER_GETTERS = Object.freeze([
  ['get_owner', ['']],
  ['get_owner_id', ['']],
  ['get_config', ['owner_id', 'owner', 'owner_account_id', 'admin_id']],
  ['get_metadata', ['owner_id']],
  ['get_contract_state', ['owner_id']],
]);

// -> { status:'ok', owner, via }                 first getter that yields an account id
//  | { status:'none', tried }                      every getter definitively yielded nothing
//  | { status:'no-account' }                       the account does not exist
//  | { status:'unknown', reason, at }              a read failed before an owner was found (I2)
//
// I2 rule: if getter k is unknown, the answer is unknown even if getter k+1 would succeed —
// otherwise a flaky read silently changes which getter (and possibly which owner) is reported.
export async function resolveOwner(rpc, accountId) {
  const tried = [];
  for (const [method, fields] of OWNER_GETTERS) {
    const r = await rpc.viewFunction(accountId, method);
    if (r.status === 'unknown') return { status: 'unknown', reason: r.reason, at: method };
    if (r.status === 'absent' && r.what === 'account') return { status: 'no-account' };
    if (r.status === 'ok') {
      for (const f of fields) {
        const v = f === '' ? r.value : r.value?.[f];
        if (isAccountId(v)) return { status: 'ok', owner: v, via: f === '' ? method : `${method}.${f}` };
      }
      tried.push({ method, result: 'no account id in return' });
    } else {
      tried.push({ method, result: r.what ? `absent ${r.what}` : 'contract error' });
    }
  }
  return { status: 'none', tried };
}

// get_contracts_metadata -> Map(hash -> { version: 'v3.2', commit }), plus the default hash.
// Recorded shape (2026-11-05): [[hash, { version: [3,2], commit_id, changelog_url }], ...]
export async function loadFactoryVersions(rpc, factory = 'sputnik-dao.near') {
  const [meta, def] = await Promise.all([
    rpc.viewFunction(factory, 'get_contracts_metadata'),
    rpc.viewFunction(factory, 'get_default_code_hash'),
  ]);
  if (meta.status !== 'ok') return { status: 'unknown', reason: meta.reason ?? meta.status, factory };
  if (!Array.isArray(meta.value)) return { status: 'unknown', reason: 'unexpected get_contracts_metadata shape', factory };
  const versions = new Map();
  for (const entry of meta.value) {
    const [hash, m] = Array.isArray(entry) ? entry : [];
    if (typeof hash !== 'string' || !Array.isArray(m?.version)) {
      return { status: 'unknown', reason: 'unexpected get_contracts_metadata entry', factory };
    }
    versions.set(hash, { version: `v${m.version.join('.')}`, commit: m.commit_id ?? null });
  }
  return {
    status: 'ok', factory, versions,
    defaultHash: def.status === 'ok' && typeof def.value === 'string' ? def.value : 'unknown',
  };
}

// -> { form, hash, account, mutableByThirdParty, flags, version, commit, versionStatus }
//   form ∈ 'local' | 'global_hash' | 'global_account' | 'none' | 'no-account' | 'unknown'
//   versionStatus ∈ 'published' (joined) | 'unpublished' (factory never listed it)
//                 | 'unknown' (factory unread, or hash not visible from view_account)
//                 | 'n/a' (no code)
export async function codeIdentity(rpc, accountId, factory) {
  const base = { accountId, hash: null, account: null, mutableByThirdParty: false, flags: [],
    version: null, commit: null, versionStatus: 'n/a' };
  const r = await rpc.viewAccount(accountId);
  if (r.status === 'unknown') return { ...base, form: 'unknown', reason: r.reason, versionStatus: 'unknown' };
  if (r.status === 'absent') return { ...base, form: 'no-account' };
  if (r.status !== 'ok') return { ...base, form: 'unknown', reason: r.detail, versionStatus: 'unknown' };

  const a = r.value;
  if (!('code_hash' in a)) return { ...base, form: 'unknown', reason: 'view_account has no code_hash', versionStatus: 'unknown' };

  let id;
  if (a.global_contract_account_id) {
    // I4: whoever controls that account changes the code for every account referencing it.
    // The hash it currently points to is not in view_account, so the version is unknown here.
    id = { ...base, form: 'global_account', account: a.global_contract_account_id,
      mutableByThirdParty: true, flags: ['third-party-upgrade-path'], versionStatus: 'unknown' };
    if (a.global_contract_hash) id.flags.push('both-global-fields-set');
    return id;
  }
  if (a.global_contract_hash) id = { ...base, form: 'global_hash', hash: a.global_contract_hash };
  else if (a.code_hash && a.code_hash !== ZERO_HASH) id = { ...base, form: 'local', hash: a.code_hash };
  else return { ...base, form: 'none' };

  // I12: join to factory version
  if (!factory || factory.status !== 'ok') return { ...id, versionStatus: 'unknown' };
  const v = factory.versions.get(id.hash);
  return v ? { ...id, ...v, versionStatus: 'published' } : { ...id, versionStatus: 'unpublished' };
}

// Sputnik DAO factory info. -> { status:'ok', factoryId, autoUpdate } | { status:'absent'|'unknown', ... }
// Recorded shape (2026-11-05): { factory_id: 'sputnik-dao.near', auto_update: true }
export async function factoryInfo(rpc, daoId) {
  const r = await rpc.viewFunction(daoId, 'get_factory_info');
  if (r.status === 'unknown') return { status: 'unknown', reason: r.reason };
  if (r.status !== 'ok') return { status: 'absent', detail: r.detail ?? r.what };
  const { factory_id, auto_update } = r.value ?? {};
  if (typeof auto_update !== 'boolean' || !isAccountId(factory_id)) {
    return { status: 'unknown', reason: 'unexpected get_factory_info shape' };
  }
  return { status: 'ok', factoryId: factory_id, autoUpdate: auto_update };
}

// view_access_key_list -> { status:'ok', keys:[{ publicKey, kind:'FullAccess' }
//                                         | { publicKey, kind:'FunctionCall', receiver, methods }] }
//   | { status:'no-account' } | { status:'unknown', reason }
// Recorded shape (2026-11-05): { keys: [{ public_key, access_key: { nonce, permission } }] },
// permission = "FullAccess" | { FunctionCall: { allowance, receiver_id, method_names } }
export async function accessKeys(rpc, accountId) {
  const r = await rpc.query({ request_type: 'view_access_key_list', finality: 'final', account_id: accountId });
  if (r.status === 'unknown') return { status: 'unknown', reason: r.reason };
  if (r.status === 'absent' && r.what === 'account') return { status: 'no-account' };
  if (r.status !== 'ok' || !Array.isArray(r.value?.keys)) return { status: 'unknown', reason: 'unexpected view_access_key_list shape' };
  const keys = [];
  for (const k of r.value.keys) {
    const perm = k?.access_key?.permission;
    if (perm === 'FullAccess') keys.push({ publicKey: k.public_key, kind: 'FullAccess' });
    else if (perm?.FunctionCall) {
      keys.push({ publicKey: k.public_key, kind: 'FunctionCall', receiver: perm.FunctionCall.receiver_id,
        methods: perm.FunctionCall.method_names ?? [] });
    } else return { status: 'unknown', reason: 'unrecognised access key permission' };
  }
  return { status: 'ok', keys };
}

export const WALK_MAX_DEPTH = 6;
// §6.1 edges this walk does not evaluate. Empty since the policy edge (Nov 7). A token-weighted
// role is not "not evaluated": it is reported as unknown on the walk that meets it (I2).
export const WALK_NOT_EVALUATED = Object.freeze([]);

// The kinds whose passing changes the DAO's code, its rules, or anything it controls: every §6.4 kind
// rated critical or high (12 of 17). FunctionCall is among them: it can call any method on any
// contract, including the contracts the DAO owns.
export const POLICY_EDGE_LABELS = Object.freeze(Object.values(KINDS)
  .filter((k) => k.risk === 'critical' || k.risk === 'high').map((k) => k.label).sort());

// §6.1 policy edge — for a Sputnik policy, who can pass a code- or rule-changing proposal alone.
// A role passes a proposal when its own approvals reach its own threshold (policy.rs proposal_status
// checks roles one at a time), so each role is evaluated on its own.
// -> { passers:   [{ role, k, n, members, labels }]   k of n members suffice; k === 1n -> each member alone
//      unpassable: [label]                            no role may even add it
//      ignored:   [{ role, labels }]                  Everyone roles: their votes never count
//      unknown:   [{ role, labels, reason }] }        token-weighted / unrecognised: not decided here (I2)
export function policyEdge(policy) {
  const passers = new Map(); const ignored = new Map(); const unknown = new Map(); const unpassable = [];
  const add = (m, key, init, label) => { if (!m.has(key)) m.set(key, { ...init, labels: [] }); m.get(key).labels.push(label); };
  for (const label of POLICY_EDGE_LABELS) {
    const w = whoCanPass(policy, label);
    if (!w.proposers.length) { unpassable.push(label); continue; }
    for (const p of w.passers) add(passers, `${p.role} ${p.k}`, { role: p.role, k: p.k, n: p.n, members: p.members }, label);
    for (const g of w.ignored) add(ignored, g.role, { role: g.role }, label);
    for (const u of w.unknown) add(unknown, u.role, { role: u.role, reason: u.reason }, label);
  }
  return { passers: [...passers.values()], unpassable, ignored: [...ignored.values()], unknown: [...unknown.values()] };
}

// §6.1 — who can change `accountId` without a vote.
// -> { status:'ok'|'unknown', account, tree, roots, voteGates, policies, unknowns, notEvaluated }
//   roots      — keys that act with no vote, deduplicated, each with the account path that reaches it
//   voteGates  — Sputnik DAOs on the way that read auto_update:false (a vote is required past them)
//   policies   — every Sputnik DAO visited, with its policyEdge(): who can pass code/rule changes alone
//   unknowns   — every read that failed; non-empty means status 'unknown' (I2): the roots shown are
//                what was reached, never presented as the whole set
// Edges followed: keys on the account; global_contract_account_id (the publisher can swap the
// code, I4); get_factory_info auto_update:true -> the factory; the §6.2 owner; and the policy edge:
// a role in which ONE member's approval passes a code- or rule-changing proposal makes each of its
// members a no-vote root, and the walk follows them. A role that needs k > 1 approvals is a vote
// (k of n). Terminates on a cycle, at depth WALK_MAX_DEPTH, or with nothing further to follow (I6).
export async function authorityWalk(rpc, accountId, { maxDepth = WALK_MAX_DEPTH } = {}) {
  const roots = new Map(); // `${account} ${publicKey}` -> root
  const voteGates = new Set();
  const policies = new Map(); // dao -> policyEdge
  const unknowns = [];

  async function visit(account, depth, path) {
    if (path.includes(account)) return { account, depth, terminal: 'cycle', edges: [] };
    if (depth > maxDepth) {
      unknowns.push({ at: account, read: 'walk', reason: `depth cap ${maxDepth} reached` });
      return { account, depth, terminal: 'depth', edges: [] };
    }
    const here = [...path, account];
    const [keys, code, fi, owner, pol] = await Promise.all([
      accessKeys(rpc, account), codeIdentity(rpc, account, null), factoryInfo(rpc, account), resolveOwner(rpc, account),
      rpc.viewFunction(account, 'get_policy'),
    ]);
    const node = { account, depth, edges: [], keys: keys.status === 'ok' ? keys.keys : null };
    const children = [];

    if (keys.status === 'unknown') unknowns.push({ at: account, read: 'view_access_key_list', reason: keys.reason });
    else if (keys.status === 'ok') {
      for (const k of keys.keys) {
        roots.set(`${account} ${k.publicKey}`, { account, path: here, ...k });
        node.edges.push({ type: k.kind === 'FullAccess' ? 'full-access-key' : 'function-call-key', key: k, needsVote: false });
      }
    }
    if (code.form === 'unknown') unknowns.push({ at: account, read: 'view_account', reason: code.reason });
    else if (code.form === 'global_account') children.push(['global_contract_account_id', code.account]);
    if (fi.status === 'unknown') unknowns.push({ at: account, read: 'get_factory_info', reason: fi.reason });
    else if (fi.status === 'ok') {
      if (fi.autoUpdate) children.push(['auto_update', fi.factoryId]);
      else { voteGates.add(account); node.edges.push({ type: 'vote', via: 'auto_update:false', needsVote: true }); }
    }
    if (owner.status === 'unknown') unknowns.push({ at: account, read: `owner (${owner.at})`, reason: owner.reason });
    else if (owner.status === 'ok') children.push([`owner via ${owner.via}`, owner.owner]);

    // §6.1 policy edge. get_policy absent (no method / no code) = not a Sputnik DAO: no edge.
    if (pol.status === 'unknown') unknowns.push({ at: account, read: 'get_policy', reason: pol.reason });
    else if (pol.status === 'ok') {
      if (!Array.isArray(pol.value?.roles) || !pol.value?.default_vote_policy) {
        unknowns.push({ at: account, read: 'get_policy', reason: 'unexpected get_policy shape' });
      } else {
        const pe = policyEdge(pol.value);
        policies.set(account, pe);
        for (const u of pe.unknown) unknowns.push({ at: account, read: 'get_policy', reason: `role "${u.role}": ${u.reason}` });
        for (const p of pe.passers) {
          if (p.k === 1n) for (const m of p.members) children.push([`policy: 1 of ${p.n} in "${p.role}" passes ${p.labels.length} code/rule kinds alone`, m]);
          else node.edges.push({ type: 'policy-vote', role: p.role, k: p.k, n: p.n, labels: p.labels, needsVote: true });
        }
      }
    }

    const kids = await Promise.all(children.map(([, to]) => visit(to, depth + 1, here)));
    children.forEach(([type, to], i) => node.edges.push({ type, to, needsVote: false, node: kids[i] }));
    node.locked = keys.status === 'ok' && node.edges.length === 0;
    return node;
  }

  const tree = await visit(accountId, 0, []);
  return {
    status: unknowns.length ? 'unknown' : 'ok', account: accountId, tree,
    roots: [...roots.values()], voteGates: [...voteGates],
    policies: [...policies].map(([dao, pe]) => ({ dao, ...pe })), unknowns, notEvaluated: WALK_NOT_EVALUATED,
  };
}
