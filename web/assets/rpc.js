// rpc.js — NEAR JSON-RPC: queue, failover, concurrency cap, backoff, timeout, 8s cache. (§9)
// Runs unmodified in the browser and in Node >= 18: depends only on fetch, AbortController,
// TextEncoder/TextDecoder, btoa.
//
// Enforces:
//   I2  A failed read is { status: 'unknown' }, never a value, never "absent". Unknowns are not cached.
//
// Every read resolves to exactly one of:
//   { status: 'ok',      value }                 the chain answered with data
//   { status: 'absent',  what, detail }          the chain answered "does not exist"
//                                                what ∈ 'account' | 'method' | 'code'
//   { status: 'error',   detail }                the chain answered with a deterministic contract
//                                                error (e.g. a view method panicked)
//   { status: 'unknown', reason, attempts }      no endpoint produced an answer (I2)
//
// Classification is from responses recorded on mainnet 2026-11-05 (test/fixtures/), identical on
// all three endpoints:
//   missing method  -> 200, result.error = "wasm execution failed with error: MethodResolveError(MethodNotFound)"
//   missing account -> 200, error.cause.name = "UNKNOWN_ACCOUNT"
// Anything not recognised as an answer is treated as a transport failure: retry, fail over, and
// in the end report unknown. Unrecognised never becomes a value.

export const ENDPOINTS = Object.freeze([
  'https://free.rpc.fastnear.com',
  'https://rpc.mainnet.near.org',
  'https://near.drpc.org',
]);

const DEFAULTS = {
  endpoints: ENDPOINTS,
  concurrency: 6,        // §9: 24 trips the FastNear limiter; 6 does not
  timeoutMs: 10_000,
  cacheMs: 8_000,
  attemptsPerEndpoint: 2,
  backoffBaseMs: 300,
  backoffMaxMs: 4_000,
  cooldownMs: 5_000,     // an endpoint that rate-limits (429) is tried last for this long
};

const ANSWER_ERRORS = {
  UNKNOWN_ACCOUNT: 'account',
  NO_CONTRACT_CODE: 'code',
};

class Transport extends Error {}

function toBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

// Turn one parsed JSON-RPC body into an answer, or throw Transport.
export function classify(body, requestType) {
  if (!body || typeof body !== 'object') throw new Transport('non-JSON body');
  if (body.error) {
    const name = body.error.cause?.name;
    if (name && ANSWER_ERRORS[name]) {
      return { status: 'absent', what: ANSWER_ERRORS[name], detail: body.error.data ?? name };
    }
    throw new Transport(`rpc error ${body.error.code ?? ''} ${name ?? body.error.name ?? ''}`.trim());
  }
  const r = body.result;
  if (!r || typeof r !== 'object') throw new Transport('no result');
  if (requestType === 'call_function') {
    if (typeof r.error === 'string') {
      if (r.error.includes('MethodNotFound')) return { status: 'absent', what: 'method', detail: r.error };
      if (r.error.includes('CodeDoesNotExist')) return { status: 'absent', what: 'code', detail: r.error };
      if (r.error.includes('wasm execution failed')) return { status: 'error', detail: r.error };
      throw new Transport(`unrecognised call error: ${r.error.slice(0, 120)}`);
    }
    if (!Array.isArray(r.result)) throw new Transport('call_function result is not a byte array');
  }
  return { status: 'ok', value: r };
}

export function createRpc(opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const doFetch = o.fetch ?? globalThis.fetch.bind(globalThis);
  const sleep = o.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  const now = o.now ?? (() => Date.now());
  const random = o.random ?? Math.random;

  // --- concurrency gate: at most o.concurrency HTTP requests in flight, process-wide per instance
  let active = 0;
  const waiting = [];
  const stats = { requests: 0, maxActive: 0, cacheHits: 0, coalesced: 0 };
  async function withSlot(fn) {
    if (active >= o.concurrency) await new Promise((r) => waiting.push(r));
    active++;
    stats.maxActive = Math.max(stats.maxActive, active);
    try { return await fn(); } finally { active--; waiting.shift()?.(); }
  }

  async function once(endpoint, payload) {
    return withSlot(async () => {
      stats.requests++;
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), o.timeoutMs);
      try {
        const res = await doFetch(endpoint, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
          signal: ctl.signal,
        });
        if (!res.ok) throw new Transport(`HTTP ${res.status}`);
        let body;
        try { body = await res.json(); } catch { throw new Transport('unparseable JSON'); }
        return classify(body, payload.params.request_type);
      } catch (e) {
        if (e instanceof Transport) throw e;
        throw new Transport(ctl.signal.aborted ? `timeout ${o.timeoutMs}ms` : `network: ${e?.message ?? e}`);
      } finally {
        clearTimeout(timer);
      }
    });
  }

  // Rate limits: a 429 (HTTP 429, or JSON-RPC -429 from rpc.mainnet.near.org, §9) fails over at once
  // instead of backing off on the same endpoint, and that endpoint goes to the back of the §9 order
  // for cooldownMs. Every endpoint is still tried, in §9 order among the healthy ones; a read that
  // none answers is unknown exactly as before (I2).
  const cooling = new Map(); // endpoint -> time its cooldown ends
  const isLimited = (e) => /(^|\D)-?429(\D|$)/.test(e.message);
  const order = () => {
    const t = now();
    const hot = (ep) => (cooling.get(ep) ?? 0) > t;
    return [...o.endpoints.filter((ep) => !hot(ep)), ...o.endpoints.filter(hot)];
  };

  async function uncached(params) {
    const payload = { jsonrpc: '2.0', id: 'docket', method: 'query', params };
    const attempts = [];
    for (const endpoint of order()) {
      for (let i = 0; i < o.attemptsPerEndpoint; i++) {
        try {
          return await once(endpoint, payload);
        } catch (e) {
          if (!(e instanceof Transport)) throw e; // a bug, not a network condition
          attempts.push({ endpoint, reason: e.message });
          if (isLimited(e)) { cooling.set(endpoint, now() + o.cooldownMs); stats.limited = (stats.limited ?? 0) + 1; break; }
          const isLast = i === o.attemptsPerEndpoint - 1;
          if (!isLast) {
            const base = Math.min(o.backoffMaxMs, o.backoffBaseMs * 2 ** i);
            await sleep(base / 2 + random() * base / 2);
          }
        }
      }
    }
    return { status: 'unknown', reason: attempts.at(-1)?.reason ?? 'no endpoints', attempts };
  }

  // --- cache (answers only) + coalescing of identical in-flight reads
  const cache = new Map();     // key -> { at, result }
  const inflight = new Map();  // key -> Promise
  async function query(params) {
    const key = JSON.stringify(params);
    const hit = cache.get(key);
    if (hit && now() - hit.at < o.cacheMs) { stats.cacheHits++; return hit.result; }
    if (inflight.has(key)) { stats.coalesced++; return inflight.get(key); }
    const p = uncached(params).then((result) => {
      if (result.status !== 'unknown') cache.set(key, { at: now(), result });
      else cache.delete(key);
      return result;
    }).finally(() => inflight.delete(key));
    inflight.set(key, p);
    return p;
  }

  async function viewAccount(accountId, finality = 'final') {
    const r = await query({ request_type: 'view_account', finality, account_id: accountId });
    if (r.status !== 'ok') return r;
    const { block_hash, block_height, ...account } = r.value;
    return { status: 'ok', value: account, block_height };
  }

  // Calls a view method with JSON args and parses the JSON return.
  async function viewFunction(accountId, methodName, args = {}, finality = 'final') {
    const r = await query({
      request_type: 'call_function', finality, account_id: accountId,
      method_name: methodName, args_base64: toBase64(JSON.stringify(args)),
    });
    if (r.status !== 'ok') return r;
    const text = new TextDecoder().decode(Uint8Array.from(r.value.result));
    if (text === '') return { status: 'ok', value: null, block_height: r.value.block_height };
    try {
      // I10: NEAR U128 amounts are JSON strings and stay strings here. A contract that returns a bare
      // JSON number would lose precision in JSON.parse, so `raw` is kept for callers that need exactness.
      return { status: 'ok', value: JSON.parse(text), raw: text, block_height: r.value.block_height };
    } catch {
      return { status: 'error', detail: 'return value is not JSON', raw: text };
    }
  }

  return { query, viewAccount, viewFunction, stats, options: o };
}
