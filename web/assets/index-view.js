// index-view.js — the model behind index.html: the finding (§1, §3.4, §19) on one screen, every number
// read on page load. Plain data; the page renders it with textContent only.
//
// Enforces:
//   I1   every figure carries its source and the time it was read (chain, DefiLlama)
//   I2   a failed read is 'unknown', never 0; a sum with an unknown term is unknown, not a smaller sum
//   I10  NearX's staked amount is BigInt yoctoNEAR, shown with formatUnits
//   I19  the "fix shipped?" badge is badge.js, from a live factory read
//
// The protocols are the three §2 liquid-staking entries whose administering DAO is a Sputnik DAO.
// Which contract each one is comes from the DefiLlama adapters (ARCHITECTURE.md §2, §12.10).

import { resolveOwner, factoryInfo, accessKeys } from './resolve.js';
import { fetchDefiLlama, nearTvlFrom, categoryNearTvl } from './value.js';
import { formatUnits } from './decode.js';
import { fixShipped } from './badge.js';

export const FACTORY = 'sputnik-dao.near';
export const LIQUID_STAKING = Object.freeze([
  { name: 'Meta Pool', contract: 'meta-pool.near', slug: 'meta-pool-near' },
  { name: 'LiNEAR', contract: 'linear-protocol.near', slug: 'linear-protocol' },
  { name: 'NearX', contract: 'nearx.stader-labs.near', slug: null, stakedMethod: 'get_total_staked_balance' }, // not on DefiLlama (§2)
]);

// -> { readAt, badge, factoryKeys, rows:[{ name, contract, owner, autoUpdate, usd|null, staked|null }], exposedUsd, lsTotal, llama }
export async function indexReport(rpc, { llamaFetch } = {}) {
  const readAt = new Date().toISOString();
  const [badge, keys, llama, rows] = await Promise.all([
    fixShipped(rpc, FACTORY),
    accessKeys(rpc, FACTORY),
    fetchDefiLlama(llamaFetch ? { fetch: llamaFetch } : {}),
    Promise.all(LIQUID_STAKING.map(async (p) => {
      const o = await resolveOwner(rpc, p.contract);
      const owner = o.status === 'ok' ? o.owner : null;
      const fi = owner ? await factoryInfo(rpc, owner) : null;
      let staked = null;
      if (p.stakedMethod) {
        const s = await rpc.viewFunction(p.contract, p.stakedMethod);
        staked = s.status === 'ok' && /^\d+$/.test(String(s.value)) ? { yocto: BigInt(s.value), near: formatUnits(String(s.value), 24) } : { unknown: s.reason ?? s.detail ?? 'unexpected shape' };
      }
      return {
        name: p.name, contract: p.contract, slug: p.slug,
        owner: owner ?? (o.status === 'unknown' ? 'unknown' : 'none'),
        autoUpdate: fi ? (fi.status === 'ok' ? fi.autoUpdate : 'unknown') : 'unknown',
        factoryId: fi?.status === 'ok' ? fi.factoryId : null,
        staked,
      };
    })),
  ]);

  for (const r of rows) {
    if (!r.slug) { r.usd = null; continue; }
    if (llama.status !== 'ok') { r.usd = 'unknown'; continue; }
    const t = nearTvlFrom(llama.protocols, r.slug);
    r.usd = t.status === 'ok' ? t.usd : 'unknown';
  }
  // The headline sum: DefiLlama-valued protocols whose DAO reads auto_update:true. Unknown if any term
  // that should be in it is unknown (I2).
  const terms = rows.filter((r) => r.slug && r.autoUpdate !== false);
  const exposedUsd = terms.some((r) => r.autoUpdate === 'unknown' || r.usd === 'unknown') ? 'unknown'
    : Math.round(terms.filter((r) => r.autoUpdate === true).reduce((s, r) => s + r.usd, 0));
  const ls = llama.status === 'ok' ? categoryNearTvl(llama.protocols, 'Liquid Staking') : { status: 'unknown' };
  return {
    readAt, badge,
    factoryKeys: keys.status === 'ok' ? { full: keys.keys.filter((k) => k.kind === 'FullAccess').length, total: keys.keys.length } : 'unknown',
    rows, exposedUsd,
    lsTotal: ls.status === 'ok' ? ls.usd : 'unknown',
    llama: { status: llama.status, readAt: llama.readAt, reason: llama.reason },
  };
}

export const usd = (n) => (typeof n === 'number' ? `$${Math.round(n).toLocaleString('en-US')}` : 'unknown');
export const share = (a, b) => (typeof a === 'number' && typeof b === 'number' && b > 0 ? `${(100 * a / b).toFixed(1)}%` : 'unknown');
