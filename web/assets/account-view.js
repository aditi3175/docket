// account-view.js — the model behind account.html (§8 item 1): who can change one account without a
// vote, by which path, and which code it runs. Plain data; the page renders it with textContent only.
//
// Enforces:
//   I2   a walk with any failed read is 'unknown': the keys shown are labelled "reached so far", never
//        the whole set, and every failed read is listed
//   I9   no verdict: an empty root set says "no key reached", never "safe", and states what Docket
//        cannot see (§13)
//   I3, I4, I12  through codeIdentity(): all three code fields read; a global_contract_account_id is
//        flagged as a third-party upgrade path; a hash is joined to a factory version where one exists
//
// Every sentence that states a fact about the account is built from a read made on this page load.
// The two fixed facts it repeats (PR #233's merge commit, update() not being a proposal kind) are
// sourced in ARCHITECTURE.md §3.1 and §3.4 and re-checked by tools/verify.mjs.

import { authorityWalk, codeIdentity, loadFactoryVersions, isAccountId } from './resolve.js';

export const FACTORY = 'sputnik-dao.near';
export const FIX = Object.freeze({ pr: 233, mergeCommit: '9e96c75410a9', merged: '2026-03-24' });
// The factory build whose relation to the fix was checked on GitHub (2 behind, ARCHITECTURE.md §3.4). The
// page says "does not contain the fix" only while the factory's live default is this commit.
export const CHECKED_BUILD = '2b0f34a38604';

// One hop of a path, in words. `type` is the edge type from authorityWalk's tree.
export function explainHop(from, to, type) {
  if (type === 'auto_update') {
    return `${from} is a Sputnik DAO that reads auto_update: true, so its factory ${to} can replace its code by calling update(). That is not a proposal: no vote, no quorum, no waiting period.`;
  }
  if (type.startsWith('owner via ')) {
    return `${to} is the owner of ${from} (${from}'s ${type.slice('owner via '.length)} returns it).`;
  }
  if (type === 'global_contract_account_id') {
    return `${from} runs a global contract published by ${to}. Whoever controls ${to} can swap that code for every account that uses it.`;
  }
  if (type.startsWith('policy: ')) {
    return `In ${from}'s policy, ${type.slice('policy: '.length)}: ${to} is a member of that role, so ${to} alone can change ${from}'s code or rules.`;
  }
  return `${from} → ${to} (${type})`;
}

export function explainKey(root) {
  if (root.kind === 'FullAccess') return `a full-access key on ${root.account}: it can sign any transaction as ${root.account}, with no vote.`;
  return `a function-call key on ${root.account}: it can call ${root.methods?.length ? root.methods.join(', ') : 'any method'} on ${root.receiver}, with no vote.`;
}

// The edge types between consecutive accounts of a root's path, read from the walk's tree.
export function hopsOf(tree, path) {
  const hops = [];
  let node = tree;
  for (let i = 1; i < path.length; i++) {
    const e = node?.edges?.find((x) => x.to === path[i]);
    if (!e) return null;
    hops.push({ from: path[i - 1], to: path[i], type: e.type, text: explainHop(path[i - 1], path[i], e.type) });
    node = e.node;
  }
  return hops;
}

// Sputnik DAOs on the way whose auto_update is true: each one is where an opt-out (§16) closes the path.
const autoUpdateDaos = (groups) => [...new Set(groups.flatMap((g) => g.hops.filter((h) => h.type === 'auto_update').map((h) => h.from)))];

// -> { account, status, headline, code, groups:[{ path, hops, keys }], gates, votes, unknowns, factory, optOut, explainer }
//    status ∈ 'invalid' | 'no-account' | 'ok' | 'unknown'
export async function accountReport(rpc, accountId) {
  const account = String(accountId ?? '').trim();
  if (!isAccountId(account)) return { account, status: 'invalid', headline: `"${account}" is not a NEAR account id.` };

  const factory = await loadFactoryVersions(rpc, FACTORY);
  const [walk, code] = await Promise.all([authorityWalk(rpc, account), codeIdentity(rpc, account, factory)]);
  if (code.form === 'no-account') return { account, status: 'no-account', headline: `${account} does not exist on NEAR mainnet.` };

  // Group roots by the path that reaches them: one path, its hops, the keys at its end.
  const byPath = new Map();
  for (const r of walk.roots) {
    const k = r.path.join('>');
    if (!byPath.has(k)) byPath.set(k, { path: r.path, hops: hopsOf(walk.tree, r.path), keys: [] });
    byPath.get(k).keys.push({ account: r.account, kind: r.kind, publicKey: r.publicKey, receiver: r.receiver, methods: r.methods, text: explainKey(r) });
  }
  const groups = [...byPath.values()].sort((a, b) => a.path.length - b.path.length);

  const votes = [];
  (function collect(n) {
    if (!n) return;
    for (const e of n.edges ?? []) {
      if (e.type === 'policy-vote') votes.push({ dao: n.account, role: e.role, k: e.k, n: e.n, kinds: e.labels.length });
      if (e.node) collect(e.node);
    }
  })(walk.tree);

  const nKeys = walk.roots.length;
  const nAccounts = new Set(walk.roots.map((r) => r.account)).size;
  const incomplete = walk.status !== 'ok';
  let headline;
  if (nKeys) {
    headline = `${nKeys} key${nKeys > 1 ? 's' : ''}, on ${nAccounts} account${nAccounts > 1 ? 's' : ''}, can change ${account} with no vote anywhere on the way.`;
    if (incomplete) headline += ` That is what was reached: ${walk.unknowns.length} read${walk.unknowns.length > 1 ? 's' : ''} failed, so there may be more.`;
  } else if (incomplete) {
    headline = `Unknown: ${walk.unknowns.length} read${walk.unknowns.length > 1 ? 's' : ''} failed, so Docket cannot say who can change ${account} without a vote.`;
  } else {
    headline = `No key reaches ${account} without a vote on the way. This is not a clearance: Docket sees on-chain authority only, not who holds a key or what a multisig agrees off-chain.`;
  }

  const optOut = autoUpdateDaos(groups);
  const explainer = optOut.length ? {
    daos: optOut,
    factoryDefault: factory.status === 'ok' && factory.defaultHash !== 'unknown'
      ? { hash: factory.defaultHash, ...(factory.versions.get(factory.defaultHash) ?? { version: 'unpublished', commit: null }) }
      : null,
    factoryReason: factory.status === 'ok' ? (factory.defaultHash === 'unknown' ? 'get_default_code_hash unread' : null) : factory.reason,
  } : null;

  return {
    account, status: incomplete ? 'unknown' : 'ok', headline,
    code, groups, gates: walk.voteGates, votes, unknowns: walk.unknowns, policies: walk.policies,
    factory: factory.status, optOut, explainer,
  };
}

// How the page reads the code identity, in words (I3, I4, I12).
export function explainCode(c) {
  if (!c) return 'unknown';
  switch (c.form) {
    case 'unknown': return `unknown: ${c.reason ?? 'view_account unread'}`;
    case 'none': return 'no contract: this account is controlled by its keys alone.';
    case 'local': case 'global_hash': {
      const where = c.form === 'local' ? `its own code, hash ${c.hash}` : `a global contract by hash, ${c.hash}`;
      const ver = c.versionStatus === 'published' ? ` That is Sputnik ${c.version}, commit ${String(c.commit ?? '').slice(0, 12)}, as the factory lists it.`
        : c.versionStatus === 'unpublished' ? ' It is not one of the Sputnik builds the factory lists.' : ' Its Sputnik version is unknown (the factory list was not read).';
      return `${where}.${ver}`;
    }
    case 'global_account': return `a global contract by account, published by ${c.account}. Whoever controls ${c.account} can change this code (a third-party upgrade path).`;
    default: return `unknown form ${c.form}`;
  }
}
