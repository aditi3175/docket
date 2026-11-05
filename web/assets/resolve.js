// resolve.js — owner resolution (§6.2) and code identity (§4, §5).
// The authority walk (§6.1) lands here on Nov 6.
//
// Enforces:
//   I2   any read that fails after failover makes the answer 'unknown' — never "no owner",
//        never "no contract"
//   I3   code identity reads code_hash, global_contract_hash AND global_contract_account_id
//   I4   global_contract_account_id is always flagged as a third-party upgrade path
//   I12  every code hash is joined to a factory version + commit where one exists

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
