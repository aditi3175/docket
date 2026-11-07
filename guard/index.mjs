// @docket/guard — §17.1: the same resolver, decoder and linter as the web pages, for Node agents.
//
//   checkProposal(daoId, proposalId) -> { kind, target, value, flags[], unknowns[] }
//   checkAccount(accountId)          -> { codeIdentity, noVoteRoots[], owned[] }
//
// Enforces:
//   I9   there is no `safe` field, no verdict and no score. An empty flags[] means no check fired, nothing
//        more; a caller decides what to do with flags (agent/delegate.mjs, I16)
//   I2   a failed read is in unknowns[], never resolved in the proposal's favour
//   I7/I8/I10  through decode.js; §6.3 control set and §6.5 checks through lint.js, as on docket.html
// Reads only (I13): every call is a public view call through web/assets/rpc.js (§9).

import { createRpc } from '../web/assets/rpc.js';
import { decodeProposal } from '../web/assets/decode.js';
import { lintProposal, touched } from '../web/assets/lint.js';
import { resolveOwner, codeIdentity, loadFactoryVersions, authorityWalk, isAccountId } from '../web/assets/resolve.js';
import { VALUED } from '../web/assets/account-view.js';

export const SIBLING_WINDOW = 10; // proposals on each side compared by the same-words check (§6.5)

let shared;
const rpcOrDefault = (rpc) => rpc ?? (shared ??= createRpc());

// -> { dao, id, status, proposer, description, kind, target, value, actions, flags, unknowns, readAt }
export async function checkProposal(daoId, proposalId, { rpc, window } = {}) {
  rpc = rpcOrDefault(rpc);
  const readAt = new Date().toISOString();
  const unknowns = [];
  const base = { dao: daoId, id: proposalId, readAt };
  if (!isAccountId(daoId) || !Number.isInteger(proposalId) || proposalId < 0) {
    return { ...base, kind: null, target: null, value: null, actions: [], flags: [], unknowns: [`invalid input: ${daoId} #${proposalId}`] };
  }
  const from = window?.from ?? Math.max(0, proposalId - SIBLING_WINDOW);
  const limit = window?.limit ?? 2 * SIBLING_WINDOW + 1;
  const page = await rpc.viewFunction(daoId, 'get_proposals', { from_index: from, limit });
  let raw = page.status === 'ok' && Array.isArray(page.value) ? page.value : [];
  if (page.status !== 'ok') unknowns.push(`get_proposals from ${from}: ${page.reason ?? page.detail ?? page.status}`);
  let p = raw.find((x) => x.id === proposalId);
  if (!p) {
    const one = await rpc.viewFunction(daoId, 'get_proposal', { id: proposalId });
    if (one.status !== 'ok') {
      return { ...base, kind: null, target: null, value: null, actions: [], flags: [], unknowns: [...unknowns, `get_proposal(${proposalId}): ${one.reason ?? one.detail ?? one.status}`] };
    }
    p = one.value; raw = [...raw, p];
  }
  const decoded = await Promise.all(raw.map((x) => decodeProposal(rpc, x)));
  const d = decoded.find((x) => x.id === proposalId);

  // §6.3 control set, exactly as docket.html resolves it
  const accounts = [...new Set(decoded.flatMap((x) => [...touched(x)]))].filter((a) => a !== daoId);
  const owners = await Promise.all(accounts.map((a) => resolveOwner(rpc, a)));
  const controlled = new Set(accounts.filter((a, i) => owners[i].status === 'ok' && owners[i].owner === daoId));
  owners.forEach((o, i) => { if (o.status === 'unknown' && touched(d).has(accounts[i])) unknowns.push(`owner of ${accounts[i]} (${o.at}): ${o.reason}`); });

  const lint = await lintProposal(rpc, d, { dao: daoId, siblings: decoded, controlled });
  const receiverOwner = d.receiver ? owners[accounts.indexOf(d.receiver)] : null;
  return {
    ...base,
    status: d.status, proposer: d.proposer, description: d.description,
    kind: d.kind.status === 'ok' ? { name: d.kind.name, label: d.kind.label, risk: d.kind.risk, reaches: d.kind.reaches }
      : { name: d.kind.name ?? null, unknown: true, risk: 'critical' },
    proposalKind: p.kind, // the exact kind object read, for binding a vote to it (§17.2)
    target: d.receiver ? {
      account: d.receiver,
      owner: d.receiver === daoId ? daoId : receiverOwner?.status === 'ok' ? receiverOwner.owner : receiverOwner?.status === 'unknown' ? 'unknown' : null,
      insideControlSet: d.receiver === daoId || controlled.has(d.receiver),
    } : null,
    value: d.amount ? (d.amount.status === 'ok' ? { raw: d.amount.raw, decimals: d.amount.decimals, display: d.amount.display, symbol: d.amount.symbol ?? null, token: d.tokenId ?? null } : { unknown: d.amount.reason }) : null,
    actions: d.actions.map((a) => ({ method: a.method, args: a.args.status === 'json' || a.args.status === 'text' ? a.args.text : a.args.status, deposit: a.deposit ?? null })),
    flags: lint.flags,
    unknowns: [...new Set([...unknowns, ...lint.unknowns])],
  };
}

// -> { account, codeIdentity, noVoteRoots, voteGates, owned:{ floor, accounts }, unknowns, readAt }
export async function checkAccount(accountId, { rpc } = {}) {
  rpc = rpcOrDefault(rpc);
  const readAt = new Date().toISOString();
  if (!isAccountId(accountId)) return { account: accountId, codeIdentity: null, noVoteRoots: [], voteGates: [], owned: { floor: true, accounts: [] }, unknowns: ['invalid account id'], readAt };
  const factory = await loadFactoryVersions(rpc);
  const [code, walk] = await Promise.all([codeIdentity(rpc, accountId, factory), authorityWalk(rpc, accountId)]);
  return {
    account: accountId, readAt,
    codeIdentity: { form: code.form, hash: code.hash, account: code.account, version: code.version, commit: code.commit, versionStatus: code.versionStatus, flags: code.flags },
    noVoteRoots: walk.roots.map((r) => ({ account: r.account, kind: r.kind, publicKey: r.publicKey, receiver: r.receiver ?? null, methods: r.methods ?? null, path: r.path })),
    voteGates: walk.voteGates,
    // I5: a floor. Docket knows only the protocols it has mapped (§2); a full reverse owner lookup is not built.
    owned: { floor: true, accounts: VALUED.filter((v) => v.dao === accountId).map((v) => v.contract) },
    unknowns: walk.unknowns.map((u) => `${u.at} ${u.read}: ${u.reason}`).concat(code.form === 'unknown' ? [`view_account: ${code.reason}`] : []),
  };
}
