// Records raw mainnet responses into test/fixtures/ so tests replay real data (I1).
// Uses plain fetch, not rpc.js, so the recording is independent of the code under test.
// Usage: node tools/capture-fixtures.mjs
import { writeFile, mkdir } from 'node:fs/promises';

const DATE = new Date().toISOString().slice(0, 10);
const DIR = new URL('../test/fixtures/', import.meta.url);
const FASTNEAR = 'https://free.rpc.fastnear.com';
const OTHERS = ['https://rpc.mainnet.near.org', 'https://near.drpc.org'];

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64');

async function post(endpoint, params) {
  const request = { jsonrpc: '2.0', id: 'docket', method: 'query', params };
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(request),
    signal: AbortSignal.timeout(15000),
  });
  const text = await res.text();
  let body; try { body = JSON.parse(text); } catch { body = text; }
  return { endpoint, captured_at: new Date().toISOString(), request, http_status: res.status, body };
}

const account = (id) => ({ request_type: 'view_account', finality: 'final', account_id: id });
const call = (id, m, args = {}) => ({ request_type: 'call_function', finality: 'final', account_id: id, method_name: m, args_base64: b64(args) });

const OWNER_GETTERS = ['get_owner', 'get_owner_id', 'get_config', 'get_metadata', 'get_contract_state'];
const CONTRACTS = ['contract.main.burrow.near', 'meta-pool.near', 'nearx.stader-labs.near', 'linear-protocol.near', 'v2.ref-finance.near'];
const DAOS = ['stnear', 'stader-nearx', 'linear', 'burrow', 'ref-finance'].map((d) => `${d}.sputnik-dao.near`);

const jobs = [];
for (const id of [...DAOS, 'sputnik-dao.near', 'docket-fixture-missing-account.near']) jobs.push([`view_account.${id}`, FASTNEAR, account(id)]);
jobs.push(['call.sputnik-dao.near.get_contracts_metadata', FASTNEAR, call('sputnik-dao.near', 'get_contracts_metadata')]);
jobs.push(['call.sputnik-dao.near.get_default_code_hash', FASTNEAR, call('sputnik-dao.near', 'get_default_code_hash')]);
for (const c of CONTRACTS) for (const g of OWNER_GETTERS) jobs.push([`call.${c}.${g}`, FASTNEAR, call(c, g)]);
jobs.push(["call.docket-fixture-missing-account.near.get_owner", FASTNEAR, call("docket-fixture-missing-account.near", "get_owner")]);
for (const d of DAOS) jobs.push([`call.${d}.get_factory_info`, FASTNEAR, call(d, 'get_factory_info')]);
// Error shapes from the failover endpoints, so rpc.js classifies them from data, not guesses.
for (const e of OTHERS) {
  const host = new URL(e).host;
  jobs.push([`${host}.call.meta-pool.near.get_owner`, e, call('meta-pool.near', 'get_owner')]);
  jobs.push([`${host}.view_account.docket-fixture-missing-account.near`, e, account('docket-fixture-missing-account.near')]);
  jobs.push([`${host}.view_account.stnear.sputnik-dao.near`, e, account('stnear.sputnik-dao.near')]);
}

await mkdir(DIR, { recursive: true });
for (const [name, endpoint, params] of jobs) {
  try {
    const rec = await post(endpoint, params);
    await writeFile(new URL(`${DATE}.${name}.json`, DIR), JSON.stringify(rec, null, 2) + '\n');
    console.log('ok  ', rec.http_status, name);
  } catch (e) {
    console.log('FAIL', name, e.message);
  }
}

// DefiLlama /protocols is several MB; keep only entries that report NEAR TVL. Entries are unmodified.
try {
  const all = await (await fetch('https://api.llama.fi/protocols', { signal: AbortSignal.timeout(30000) })).json();
  const near = all.filter((p) => p.chainTvls && typeof p.chainTvls.Near === 'number');
  const rec = { endpoint: 'https://api.llama.fi/protocols', captured_at: new Date().toISOString(),
    note: 'filtered to entries with a numeric chainTvls.Near; each entry is unmodified', body: near };
  await writeFile(new URL(`${DATE}.defillama.protocols.near.json`, DIR), JSON.stringify(rec, null, 2) + '\n');
  console.log('ok   defillama', near.length, 'entries');
} catch (e) { console.log('FAIL defillama', e.message); }
