// finding.js — the homepage's data, as React state. Every read and rule comes from ../web/assets
// unchanged (index-view.js, census.js, value.js, rpc.js); this file only turns their results and
// onRead events into state the components draw. Nothing here computes a figure of its own.
//
// Carried over: I1 (each figure dated by its read; recorded values labelled recorded), I2 (a failed
// read is unknown, never a value; the headline keeps the recorded values and names what failed),
// I19 (the badge exists only as a live read), I20 (the census is computed from graph.json's records;
// the chain recount runs only on the reader's click, in the component).
import { useEffect, useState } from 'react';
import { createRpc } from '../../../web/assets/rpc.js';
import { indexReport, headline, RECORDED, LIQUID_STAKING, usd, share, usdShort } from '../../../web/assets/index-view.js';
import { nearTvlFrom } from '../../../web/assets/value.js';
import { census } from '../../../web/assets/census.js';

const rowsFrom = (r) => r.rows.map((x) => ({
  name: x.name, contract: x.contract, slug: x.slug, owner: x.owner, autoUpdate: x.autoUpdate,
  usd: x.usd, stakedNear: x.staked?.near ?? null, stakedUnknown: x.staked?.unknown ?? null,
}));

function initial() {
  return {
    recorded: true,
    headlineOf: RECORDED,
    rows: rowsFrom(RECORDED).map((x) => ({ ...x, edges: { value: 'recorded', owner: 'recorded', factory: 'recorded' } })),
    keys: { count: RECORDED.factoryKeys.full, state: 'recorded' },
    badge: null,
    readAt: null, llamaReadAt: null, gaps: [], failed: null,
  };
}

// The hero: recorded values at once, then each read as it lands.
export function useFinding() {
  const [s, set] = useState(initial);
  useEffect(() => {
    let alive = true;
    const rpc = createRpc();
    const patchRow = (i, f) => set((p) => ({ ...p, rows: p.rows.map((x, j) => (j === i ? f(x) : x)) }));
    const onRead = (e) => {
      if (!alive) return;
      if (e.type === 'keys') set((p) => ({ ...p, keys: e.factoryKeys === 'unknown' ? { count: null, state: 'unknown' } : { count: e.factoryKeys.full, state: 'live' } }));
      else if (e.type === 'badge') set((p) => ({ ...p, badge: e.badge }));
      else if (e.type === 'owner') patchRow(e.i, (x) => ({ ...x, owner: e.owner, ownerReason: e.reason, edges: { ...x.edges, owner: e.owner === 'unknown' || e.owner === 'none' ? 'unknown' : 'live' } }));
      else if (e.type === 'factory-info') patchRow(e.i, (x) => ({ ...x, autoUpdate: e.autoUpdate, edges: { ...x.edges, factory: e.autoUpdate === 'unknown' ? 'unknown' : 'live' } }));
      else if (e.type === 'staked') patchRow(e.i, (x) => ({ ...x, stakedNear: e.staked?.near ?? null, stakedUnknown: e.staked?.unknown ?? null, edges: { ...x.edges, value: e.staked?.unknown ? 'unknown' : 'live' } }));
      else if (e.type === 'llama') {
        LIQUID_STAKING.forEach((p, i) => {
          if (!p.slug) return;
          const t = e.status === 'ok' && e.protocols ? nearTvlFrom(e.protocols, p.slug) : { status: 'unknown' };
          patchRow(i, (x) => ({ ...x, usd: t.status === 'ok' ? t.usd : 'unknown', edges: { ...x.edges, value: t.status === 'ok' ? 'live' : 'unknown' } }));
        });
      }
    };
    indexReport(rpc, { onRead }).then((r) => {
      if (!alive) return;
      const gaps = [];
      if (r.factoryKeys === 'unknown') gaps.push('the factory keys');
      r.rows.forEach((x) => { if (x.autoUpdate === 'unknown') gaps.push(x.owner === 'unknown' ? `${x.contract} owner` : x.owner); });
      if (r.llama.status !== 'ok') gaps.push(`DefiLlama (${r.llama.reason})`);
      else if (r.exposedUsd === 'unknown') gaps.push('a DefiLlama value');
      // I2: with any gap the headline stays on the recorded values, and says what failed
      set((p) => (gaps.length ? { ...p, gaps, readAt: r.readAt } : { ...p, recorded: false, headlineOf: r, readAt: r.readAt, llamaReadAt: r.llama.readAt, gaps }));
    }).catch((err) => { if (alive) set((p) => ({ ...p, failed: String(err?.message ?? err) })); });
    return () => { alive = false; };
  }, []);
  return s;
}

// The census, from the committed graph.json (I20: computed from its records, never a stored number).
export function useCensus() {
  const [c, set] = useState({ status: 'reading' });
  useEffect(() => {
    let alive = true;
    fetch(`${import.meta.env.BASE_URL}graph.json`).then((r) => (r.ok ? r.json() : Promise.reject(new Error(`graph.json: HTTP ${r.status}`))))
      .then((g) => { if (alive) set({ status: 'ok', c: census(Object.values(g.daos)), when: g.crawl?.lastRunAt ?? null, complete: g.crawl?.complete === true }); })
      .catch((e) => { if (alive) set({ status: 'unknown', reason: String(e?.message ?? e) }); });
    return () => { alive = false; };
  }, []);
  return c;
}

export { headline, usd, share, usdShort, RECORDED };
const NBH = '‑'; const NBSP = ' ';
export const time = (iso) => (iso ? `${iso.slice(0, 10).replace(/-/g, NBH)}${NBSP}${iso.slice(11, 16)}${NBSP}UTC` : 'unknown');
export const nearShort = (v) => { const whole = String(v).split('.')[0]; const n = Number(whole.replace(/,/g, '')); return n >= 1e6 ? `${(n / 1e6).toFixed(2)}M NEAR` : `${whole} NEAR`; };
export const pct0 = (a, b) => (typeof a === 'number' && typeof b === 'number' && b > 0 ? `${Math.round((100 * a) / b)}%` : 'unknown');
