// census.js — §3.3 census buckets from crawled DAO records (tools/crawl.mjs -> graph.json), and the live
// opted-out counter (§8 item 8). Shared by crawl.mjs, register.html and index.html.
//
// Enforces:
//   I11  buckets are true / false / unknown, always with the denominator. "unknown" is split into its
//        two causes, and neither is ever folded into false:
//          no-factory-info  the DAO answered, but has no get_factory_info (pre-v2 code): what the
//                           factory can do to it is not decided by this read
//          unread           the read failed after failover (I2)
//   I20  the counter is computed from reads, never stored as a number: liveCounter() re-reads every
//        DAO's get_factory_info from the chain on each call. graph.json's figure is a dated snapshot
//        and is labelled as one.

import { factoryInfo } from './resolve.js';

export const BUCKETS = Object.freeze(['true', 'false', 'no-factory-info', 'unread']);

// One get_factory_info result -> its bucket.
export function bucketOf(fi) {
  if (fi?.status === 'ok') return fi.autoUpdate ? 'true' : 'false';
  if (fi?.status === 'absent') return 'no-factory-info';
  return 'unread';
}

// records: [{ id, autoUpdate: 'true'|'false'|'no-factory-info'|'unread', factoryId }]
// -> { denominator, counts:{true,false,'no-factory-info',unread}, answered, shareTrueOfAnswered, falseIds, otherFactories }
export function census(records) {
  const counts = Object.fromEntries(BUCKETS.map((b) => [b, 0]));
  const falseIds = []; const otherFactories = [];
  for (const r of records) {
    counts[r.autoUpdate] = (counts[r.autoUpdate] ?? 0) + 1;
    if (r.autoUpdate === 'false') falseIds.push(r.id);
    if (r.factoryId && r.factoryId !== 'sputnik-dao.near') otherFactories.push({ id: r.id, factoryId: r.factoryId });
  }
  const answered = counts.true + counts.false; // DAOs whose get_factory_info gave a value
  return {
    denominator: records.length, counts, answered,
    // a ratio of the DAOs that answered, never of all DAOs (§12.6, §12.7): both sides are shown
    shareTrueOfAnswered: answered ? { num: counts.true, den: answered } : null,
    falseIds: falseIds.sort(), otherFactories,
  };
}

export const pct = (r, digits = 1) => (r ? `${(100 * r.num / r.den).toFixed(digits)}%` : 'unknown');

// The factory's DAO list, paged. -> { status:'ok', ids, number } | { status:'unknown', reason }
export async function daoList(rpc, factory = 'sputnik-dao.near', page = 500) {
  const n = await rpc.viewFunction(factory, 'get_number_daos');
  if (n.status !== 'ok' || typeof n.value !== 'number') return { status: 'unknown', reason: `get_number_daos: ${n.reason ?? n.detail ?? 'unexpected shape'}` };
  const ids = [];
  for (let from = 0; from < n.value; from += page) {
    const r = await rpc.viewFunction(factory, 'get_daos', { from_index: from, limit: page });
    if (r.status !== 'ok' || !Array.isArray(r.value)) return { status: 'unknown', reason: `get_daos from ${from}: ${r.reason ?? r.detail ?? 'unexpected shape'}` };
    ids.push(...r.value);
  }
  if (ids.length !== n.value) return { status: 'unknown', reason: `get_daos returned ${ids.length}, get_number_daos says ${n.value}` };
  return { status: 'ok', ids, number: n.value };
}

// I20 — the counter, from the chain, now. onProgress({ done, total, counts }) after each read.
export async function liveCounter(rpc, { factory = 'sputnik-dao.near', onProgress = () => {}, signal } = {}) {
  const list = await daoList(rpc, factory);
  if (list.status !== 'ok') return { status: 'unknown', reason: list.reason };
  const records = []; let done = 0;
  const counts = Object.fromEntries(BUCKETS.map((b) => [b, 0]));
  await Promise.all(list.ids.map(async (id) => {
    if (signal?.aborted) return;
    const fi = await factoryInfo(rpc, id);
    const b = bucketOf(fi);
    records.push({ id, autoUpdate: b, factoryId: fi.factoryId ?? null });
    counts[b]++; done++;
    onProgress({ done, total: list.ids.length, counts: { ...counts } });
  }));
  return { status: 'ok', readAt: new Date().toISOString(), ...census(records) };
}
