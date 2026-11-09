// memo.js — an answer already read is shown at once, labelled with when it was read, while the live read
// runs; the live answer then replaces it. Two sources: this browser (answers it read before, up to
// MEMO_MAX_AGE_MS old) and seed.json (answers for the pages' examples, recorded by tools/seed.mjs).
//
// Enforces:
//   I1   every recalled answer carries the time it was read and where it came from; the page shows both
//   I2   only a complete answer (status 'ok') is ever stored or seeded, so an unknown is never shown as
//        if it were known; a recalled answer is never presented as live
//   I10  base-unit amounts are BigInt and come back as BigInt (tagged {$bigint:"…"}), never Number

export const MEMO_MAX_AGE_MS = 24 * 60 * 60_000;
const PREFIX = 'docket.memo.v1.';

export const encode = (x) => JSON.stringify(x, (k, v) => (typeof v === 'bigint' ? { $bigint: v.toString() } : v));
export const decode = (s) => JSON.parse(s, (k, v) => (v && typeof v === 'object' && typeof v.$bigint === 'string' && Object.keys(v).length === 1 && /^-?\d+$/.test(v.$bigint) ? BigInt(v.$bigint) : v));

const store = (s) => s ?? globalThis.localStorage ?? null;

// -> { report, readAt, source: 'browser' | 'recorded' } | null
export function recall(kind, key, { storage, seed, now = Date.now() } = {}) {
  try {
    const raw = store(storage)?.getItem(PREFIX + kind + ':' + key);
    if (raw) {
      const m = decode(raw);
      if (m?.report?.status === 'ok' && typeof m.readAt === 'string' && now - Date.parse(m.readAt) < MEMO_MAX_AGE_MS) return { report: m.report, readAt: m.readAt, source: 'browser' };
    }
  } catch { /* an unreadable memo is a miss */ }
  const s = seed?.[kind]?.[key];
  if (s?.report?.status === 'ok' && typeof s.readAt === 'string') return { report: decode(encode(s.report)), readAt: s.readAt, source: 'recorded' };
  return null;
}

export function remember(kind, key, report, readAt, { storage } = {}) {
  if (report?.status !== 'ok' || typeof readAt !== 'string') return false;
  try { store(storage)?.setItem(PREFIX + kind + ':' + key, encode({ readAt, report })); return true; } catch { return false; }
}

// The same answer, apart from when it was read and the value (DefiLlama moves every minute)?
export function sameAnswer(a, b) {
  const strip = (r) => encode({ ...r, value: undefined });
  return strip(a) === strip(b);
}

// seed.json, loaded once; a missing or unreadable file is simply no seed.
let seedP = null;
export function loadSeed(url = new URL('./seed.json', import.meta.url)) {
  seedP ??= fetch(url).then((r) => (r.ok ? r.text() : null)).then((t) => (t ? decode(t) : null)).catch(() => null);
  return seedP;
}
