// index-view.js — the model behind index.html: the finding (§1, §3.4, §19) on one screen, every number
// read on page load. Plain data; the page renders it with textContent only.
//
// Enforces:
//   I1   every figure carries its source and the time it was read (chain, DefiLlama); the recorded
//        values shown before the live reads arrive are labelled recorded, with their dates
//   I2   a failed read is 'unknown', never 0; a sum with an unknown term is unknown, not a smaller sum
//   I9   the headline states what can happen, never that anything is safe
//   I10  NearX's staked amount is BigInt yoctoNEAR, shown with formatUnits
//   I19  the "fix shipped?" badge is badge.js, from a live factory read; it has no recorded value
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

const keysOf = (keys) => (keys.status === 'ok' ? { full: keys.keys.filter((k) => k.kind === 'FullAccess').length, total: keys.keys.length } : 'unknown');

// onRead(event), optional: called as each read resolves, so a page can draw the path edge by edge as the
// data arrives. Events: { type: 'badge', badge } | { type: 'keys', factoryKeys } | { type: 'llama', status }
// (with readAt and protocols) | { type: 'owner', i, owner, reason } | { type: 'factory-info', i, autoUpdate, reason } | { type: 'staked', i, staked }.
// A throwing onRead never changes what was read.
// -> { readAt, badge, factoryKeys, rows:[{ name, contract, owner, autoUpdate, usd|null, staked|null }], exposedUsd, lsTotal, llama }
export async function indexReport(rpc, { llamaFetch, onRead = () => {} } = {}) {
  const readAt = new Date().toISOString();
  const tell = (e) => { try { onRead(e); } catch { /* drawing is not reading */ } };
  const [badge, keys, llama, rows] = await Promise.all([
    fixShipped(rpc, FACTORY).then((b) => { tell({ type: 'badge', badge: b }); return b; }),
    accessKeys(rpc, FACTORY).then((k) => { tell({ type: 'keys', factoryKeys: keysOf(k) }); return k; }),
    fetchDefiLlama(llamaFetch ? { fetch: llamaFetch } : {}).then((l) => { tell({ type: 'llama', status: l.status, readAt: l.readAt, protocols: l.protocols ?? null, reason: l.reason }); return l; }),
    Promise.all(LIQUID_STAKING.map(async (p, i) => {
      const o = await resolveOwner(rpc, p.contract);
      const owner = o.status === 'ok' ? o.owner : null;
      tell({ type: 'owner', i, owner: owner ?? (o.status === 'unknown' ? 'unknown' : 'none'), reason: o.reason });
      const fi = owner ? await factoryInfo(rpc, owner) : null;
      const autoUpdate = fi ? (fi.status === 'ok' ? fi.autoUpdate : 'unknown') : 'unknown';
      tell({ type: 'factory-info', i, autoUpdate, reason: fi?.reason });
      let staked = null;
      if (p.stakedMethod) {
        const s = await rpc.viewFunction(p.contract, p.stakedMethod);
        staked = s.status === 'ok' && /^\d+$/.test(String(s.value)) ? { yocto: BigInt(s.value), near: formatUnits(String(s.value), 24) } : { unknown: s.reason ?? s.detail ?? 'unexpected shape' };
        tell({ type: 'staked', i, staked });
      }
      return {
        name: p.name, contract: p.contract, slug: p.slug,
        owner: owner ?? (o.status === 'unknown' ? 'unknown' : 'none'),
        autoUpdate,
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
    factoryKeys: keysOf(keys),
    rows, exposedUsd,
    lsTotal: ls.status === 'ok' ? ls.usd : 'unknown',
    llama: { status: llama.status, readAt: llama.readAt, reason: llama.reason },
  };
}

export const usd = (n) => (typeof n === 'number' ? `$${Math.round(n).toLocaleString('en-US')}` : 'unknown');
export const share = (a, b) => (typeof a === 'number' && typeof b === 'number' && b > 0 ? `${(100 * a / b).toFixed(1)}%` : 'unknown');
// $126.7M: the headline's short form. The exact figure is always shown beside it (I1).
export const usdShort = (n) => (typeof n !== 'number' ? 'unknown' : n >= 1e9 ? `$${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : usd(n));
const WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
export const countWord = (n) => (Number.isInteger(n) && n >= 0 && n < WORDS.length ? WORDS[n] : String(n));

// The one-sentence finding. An unknown input makes it say so (I2); it never says safe (I9).
export function headline(r) {
  const n = r.factoryKeys === 'unknown' ? null : r.factoryKeys.full;
  const who = n === null ? 'the factory’s keys (how many is unknown right now)' : `${countWord(n)} key${n === 1 ? '' : 's'}`;
  if (typeof r.exposedUsd === 'number') return `${usdShort(r.exposedUsd)} of NEAR liquid staking can be rewritten by ${who}, without a vote.`;
  return `NEAR liquid staking can be rewritten by ${who}, without a vote. The dollar figure is unknown right now.`;
}

// The last recorded values, shown at once so the page never starts blank. They are labelled recorded,
// with their dates, and replaced by the live reads as they arrive. They are indexReport() over the
// fixtures in test/fixtures, rounded to the dollar, and test/index.test.mjs checks that they still
// match: DefiLlama captured 2026-11-06 08:14 UTC; the chain reads recorded 2026-11-05 and 2026-11-06.
// There is no recorded badge: the badge is only ever a live read (I19).
export const RECORDED = Object.freeze({
  llamaReadAt: '2026-11-06T08:14:19Z',
  chainRecordedOn: '2026-11-06',
  factoryKeys: { full: 3, total: 3 },
  exposedUsd: 126665546,
  lsTotal: 196547976,
  rows: [
    { name: 'Meta Pool', contract: 'meta-pool.near', slug: 'meta-pool-near', owner: 'stnear.sputnik-dao.near', autoUpdate: true, usd: 79933156, staked: null },
    { name: 'LiNEAR', contract: 'linear-protocol.near', slug: 'linear-protocol', owner: 'linear.sputnik-dao.near', autoUpdate: true, usd: 46732391, staked: null },
    { name: 'NearX', contract: 'nearx.stader-labs.near', slug: null, owner: 'stader-nearx.sputnik-dao.near', autoUpdate: true, usd: null, staked: { near: '2,553,885.164638852928252117432243' } },
  ],
});
