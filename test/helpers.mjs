// Test helpers: replay recorded mainnet responses (test/fixtures/) through a fake fetch.
import { readdirSync, readFileSync } from 'node:fs';

const DIR = new URL('./fixtures/', import.meta.url);

export function loadFixture(name) {
  return JSON.parse(readFileSync(new URL(name, DIR), 'utf8'));
}

// All FastNear recordings, keyed by the exact query params that produced them.
export function fastnearRecordings() {
  const byParams = new Map();
  for (const f of readdirSync(DIR)) {
    if (!f.endsWith('.json') || f.includes('defillama')) continue;
    const rec = JSON.parse(readFileSync(new URL(f, DIR), 'utf8'));
    if (rec.endpoint !== 'https://free.rpc.fastnear.com') continue;
    byParams.set(JSON.stringify(rec.request.params), rec);
  }
  return byParams;
}

export const jsonResponse = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

// fetch that answers from recordings. `override(params, endpoint)` may return a Response, throw,
// or return undefined to fall through to the recording.
export function replayFetch({ override } = {}) {
  const recs = fastnearRecordings();
  const calls = [];
  const f = async (endpoint, init) => {
    const { params } = JSON.parse(init.body);
    calls.push({ endpoint, params });
    if (override) {
      const r = await override(params, endpoint, init);
      if (r !== undefined) return r;
    }
    const rec = recs.get(JSON.stringify(params));
    if (!rec) throw new Error(`no recording for ${JSON.stringify(params)}`);
    return jsonResponse(rec.body, rec.http_status);
  };
  f.calls = calls;
  return f;
}

export const noSleep = async () => {};
