// register-view.js — the model behind register.html (§8 item 3): every DAO the factory lists, from
// graph.json (tools/crawl.mjs), ranked by reach.
//
// Reach, as decided 2026-11-07: first the DAOs Docket has mapped to a protocol (§2), by the value
// they administer (DefiLlama, or "not valued"); then every other DAO by its own NEAR balance. The
// whole table is a floor: Docket only knows the protocols it has mapped (I5).
//
// Enforces:
//   I5   labelled a floor, never a total
//   I11  every DAO is a row, in its census bucket; unknown stays unknown (no-factory-info, unread)
//   I10  balances are BigInt yoctoNEAR; ordering and display never pass through Number
//   I2   DefiLlama unreachable -> administered value 'unknown', never 0

import { nearTvlFrom } from './value.js';
import { formatUnits } from './decode.js';

export const FLOOR = 'A floor: Docket only knows the protocols it has mapped.';

// §2: the Sputnik DAOs that administer a mapped protocol. slug null = not valued by DefiLlama.
export const MAPPED = Object.freeze([
  { dao: 'stnear.sputnik-dao.near', protocol: 'Meta Pool', contract: 'meta-pool.near', slug: 'meta-pool-near' },
  { dao: 'linear.sputnik-dao.near', protocol: 'LiNEAR', contract: 'linear-protocol.near', slug: 'linear-protocol' },
  { dao: 'stader-nearx.sputnik-dao.near', protocol: 'NearX', contract: 'nearx.stader-labs.near', slug: null },
  { dao: 'burrow.sputnik-dao.near', protocol: 'Rhea Lend', contract: 'contract.main.burrow.near', slug: 'rhea-lend' },
  { dao: 'ref-finance.sputnik-dao.near', protocol: 'Rhea Dex', contract: 'v2.ref-finance.near', slug: 'rhea-dex' },
]);

const yocto = (b) => (typeof b === 'string' && /^\d+$/.test(b) ? BigInt(b) : null);
export const nearWhole = (b) => { const y = yocto(b); return y === null ? 'unknown' : formatUnits(String(y - (y % 10n ** 24n)), 24).replace(/\.0+$/, ''); };

// No-vote roots one hop out, from the crawl: the factory (if auto_update is true), full-access keys
// on the DAO itself, and members who can pass a code- or rule-changing kind alone. The account page
// follows the full path; this column does not.
export function rootsOf(d, factoryKeys) {
  const parts = [];
  if (d.autoUpdate === 'true') parts.push(`factory's ${typeof factoryKeys === 'number' ? factoryKeys : '?'} keys (auto_update)`);
  if (d.keys === 'unread') parts.push('keys unread');
  else if (d.keys?.full) parts.push(`${d.keys.full} full-access key${d.keys.full > 1 ? 's' : ''} on the DAO`);
  if (d.policy === 'unread') parts.push('policy unread');
  else if (d.policy?.alone?.length) parts.push(`${d.policy.alone.length} member${d.policy.alone.length > 1 ? 's' : ''} alone`);
  else if (d.policy?.tokenWeighted?.length) parts.push('token-weighted: unknown');
  else if (d.policy?.unrecognised !== undefined) parts.push('policy not Sputnik: unknown');
  return parts.length ? parts.join(' · ') : (d.autoUpdate === 'false' ? 'none one hop out (a vote is required)' : 'none one hop out');
}

// graph: graph.json; llama: fetchDefiLlama() result; factoryKeys: number | 'unknown'
// -> { rows:[{ rank, dao, protocol, administered, balance, autoUpdate, version, roots }], crawl, floor }
export function registerRows(graph, llama, factoryKeys) {
  const daos = graph?.daos ?? {};
  const mapped = MAPPED.filter((m) => daos[m.dao]).map((m) => {
    let administered;
    if (!m.slug) administered = { label: 'not valued (not on DefiLlama)', usd: null };
    else if (llama?.status !== 'ok') administered = { label: 'unknown (DefiLlama unread)', usd: null };
    else { const t = nearTvlFrom(llama.protocols, m.slug); administered = t.status === 'ok' ? { label: `$${Math.round(t.usd).toLocaleString('en-US')}`, usd: t.usd } : { label: `unknown (${t.reason})`, usd: null }; }
    return { d: daos[m.dao], protocol: m.protocol, contract: m.contract, administered };
  }).sort((a, b) => (b.administered.usd ?? -1) - (a.administered.usd ?? -1));
  const mappedIds = new Set(MAPPED.map((m) => m.dao));
  const rest = Object.values(daos).filter((d) => !mappedIds.has(d.id)).sort((a, b) => {
    const x = yocto(a.balance); const y = yocto(b.balance);
    if (x === null || y === null) return x === null ? (y === null ? a.id.localeCompare(b.id) : 1) : -1;
    return x === y ? a.id.localeCompare(b.id) : (y > x ? 1 : -1);
  }).map((d) => ({ d, protocol: null, contract: null, administered: { label: '—', usd: null } }));
  const rows = [...mapped, ...rest].map((r, i) => ({
    rank: i + 1, dao: r.d.id, protocol: r.protocol, contract: r.contract, administered: r.administered.label,
    balance: nearWhole(r.d.balance), autoUpdate: r.d.autoUpdate,
    version: r.d.code === 'unread' ? 'unread' : (r.d.code.version ?? `${r.d.code.form}${r.d.code.versionStatus === 'unpublished' ? ', unpublished' : ''}`),
    roots: rootsOf(r.d, factoryKeys),
  }));
  return { rows, crawl: graph?.crawl ?? null, numberDaos: graph?.numberDaos ?? null, floor: FLOOR };
}
