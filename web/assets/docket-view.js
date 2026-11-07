// docket-view.js — the model behind docket.html (§8 item 2): one Sputnik DAO's proposals, each decoded
// (§6.3) and checked (§6.5), under a header that says whether the factory can bypass all of them (§3).
// Plain data; the page renders it with textContent only.
//
// Enforces:
//   I9   flags only, never a verdict: a proposal no check fired on says exactly that ("no check fired"),
//        never "safe", "clean" or a score
//   I7   an unknown ProposalKind is shown as unknown and critical (decode.js kindOf + lint.js)
//   I8   undecodable args are shown as a refusal, never as empty (decode.js decodeArgs)
//   I10  amounts are shown from BigInt at the token's ft_metadata decimals; args are shown as their
//        original text, so no integer passes through Number
//   I2   a failed read is 'unknown' — the header, a page of proposals, or one comparison

import { decodeProposal } from './decode.js';
import { lintProposal } from './lint.js';
import { factoryInfo, policyEdge, codeIdentity, loadFactoryVersions, isAccountId } from './resolve.js';

export const PAGE = 20;
const SEVERITY = ['critical', 'high', 'medium', 'low'];

// One proposal, ready to render.
export function proposalView(d, lint) {
  const k = d.kind;
  const flags = [...lint.flags].sort((a, b) => SEVERITY.indexOf(a.severity) - SEVERITY.indexOf(b.severity));
  return {
    id: d.id, status: d.status, proposer: d.proposer, description: d.description,
    kind: k.status === 'ok' ? { name: k.name, label: k.label, risk: k.risk, reaches: k.reaches }
      : { name: k.name ?? 'unknown', label: null, risk: 'critical', reaches: 'unknown', unknown: true },
    receiver: d.receiver, hash: d.hash ?? null, member: d.member ?? null, role: d.role ?? null,
    amount: d.amount ? (d.amount.status === 'ok' ? `${d.amount.display}${d.amount.symbol ? ` ${d.amount.symbol}` : ''}` : `unknown (${d.amount.reason})`) : null,
    actions: (d.actions ?? []).map((a) => ({
      method: a.method,
      args: a.args.status === 'json' || a.args.status === 'text' ? a.args.text
        : a.args.status === 'empty' ? '(no arguments)'
        : a.args.status === 'binary' ? `(binary, ${a.args.bytes.length} bytes)`
        : `REFUSED: ${a.args.reason}`,
      refused: a.args.status === 'refused',
      deposit: a.deposit ?? null,
    })),
    flags,
    unknowns: lint.unknowns,
    // I9: the absence of flags is reported as what it is, nothing more
    note: flags.length ? null : 'No check fired. That is not a clearance: the checks compare the description with the action, and cannot see intent.',
  };
}

// -> { dao, status, header, page:{ from, to, last }, proposals:[proposalView], unknowns }
//    status ∈ 'invalid' | 'not-a-dao' | 'ok' | 'unknown'
export async function docketReport(rpc, daoId, { from = null, limit = PAGE } = {}) {
  const dao = String(daoId ?? '').trim();
  if (!isAccountId(dao)) return { dao, status: 'invalid', headline: `"${dao}" is not a NEAR account id.` };
  const unknowns = [];

  const [fi, pol, factory] = await Promise.all([factoryInfo(rpc, dao), rpc.viewFunction(dao, 'get_policy'), loadFactoryVersions(rpc)]);
  const code = await codeIdentity(rpc, dao, factory);
  if (code.form === 'no-account') return { dao, status: 'invalid', headline: `${dao} does not exist on NEAR mainnet.` };
  if (pol.status === 'absent') return { dao, status: 'not-a-dao', headline: `${dao} is not a Sputnik DAO (it has no get_policy).` };

  const header = { code, autoUpdate: null, factoryId: null, policy: null };
  if (fi.status === 'ok') { header.autoUpdate = fi.autoUpdate; header.factoryId = fi.factoryId; }
  else unknowns.push(`get_factory_info: ${fi.reason ?? fi.detail ?? fi.status}`);
  if (pol.status === 'ok' && Array.isArray(pol.value?.roles)) header.policy = policyEdge(pol.value);
  else unknowns.push(`get_policy: ${pol.reason ?? pol.detail ?? 'unexpected shape'}`);

  // The page of proposals: the newest `limit` unless `from` is given.
  let start = from;
  let last = null;
  if (start === null) {
    const l = await rpc.viewFunction(dao, 'get_last_proposal_id');
    if (l.status !== 'ok' || typeof l.value !== 'number') {
      unknowns.push(`get_last_proposal_id: ${l.reason ?? l.detail ?? 'unexpected shape'}`);
      return { dao, status: 'unknown', header, page: null, proposals: [], unknowns };
    }
    last = l.value;
    start = Math.max(0, last - limit);
  }
  const ps = await rpc.viewFunction(dao, 'get_proposals', { from_index: start, limit });
  if (ps.status !== 'ok' || !Array.isArray(ps.value)) {
    unknowns.push(`get_proposals from ${start}: ${ps.reason ?? ps.detail ?? 'unexpected shape'}`);
    return { dao, status: 'unknown', header, page: { from: start, last }, proposals: [], unknowns };
  }
  const decoded = await Promise.all(ps.value.map((p) => decodeProposal(rpc, p)));
  const linted = await Promise.all(decoded.map((d) => lintProposal(rpc, d, { dao, siblings: decoded })));
  const proposals = decoded.map((d, i) => proposalView(d, linted[i])).sort((a, b) => b.id - a.id);
  const ids = ps.value.map((p) => p.id);
  return {
    dao, status: unknowns.length ? 'unknown' : 'ok', header,
    page: { from: start, to: ids.length ? Math.max(...ids) : null, last, count: ids.length }, proposals, unknowns,
  };
}

// The header sentence that ties this DAO to §3.
export function headerSentence(h, dao) {
  if (h.autoUpdate === true) return `${dao} reads auto_update: true. Its factory, ${h.factoryId}, can replace this DAO's code with no proposal and no vote, so none of the votes below can stop that.`;
  if (h.autoUpdate === false) return `${dao} reads auto_update: false. Its factory cannot replace its code; a code change needs a proposal this DAO passes.`;
  return `Unknown whether ${dao}'s factory can replace its code: get_factory_info was not read.`;
}

// Who can pass a code- or rule-changing proposal, in words (§6.1 policy edge).
export function policySentences(pe) {
  if (!pe) return ['unknown: the policy was not read'];
  const out = pe.passers.map((p) => `${p.k} of ${p.n} in "${p.role}" can pass ${p.labels.length} of the 12 code- or rule-changing kinds${p.k === 1n ? ' — one member alone' : ''}.`);
  if (pe.ignored.length) out.push(`${pe.ignored.map((g) => `"${g.role}"`).join(', ')} may vote, but as an Everyone role its votes never count toward a threshold.`);
  if (pe.unknown.length) out.push(`Not decided here (token-weighted): ${pe.unknown.map((u) => `"${u.role}"`).join(', ')}.`);
  if (pe.unpassable.length) out.push(`No role can even propose: ${pe.unpassable.join(', ')}.`);
  return out;
}
