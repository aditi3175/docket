// Records raw mainnet responses into test/fixtures/ so tests replay real data (I1).
// Uses plain fetch, not rpc.js, so the recording is independent of the code under test.
// Usage: node tools/capture-fixtures.mjs            record everything (incl. DefiLlama)
//        node tools/capture-fixtures.mjs <substr>…  record only RPC jobs whose name contains a
//                                                    substring; DefiLlama snapshot left as is
//                                                    unless one substring is `defillama`
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
// lst.rhealab.near is RHEA LST (DefiLlama projects/rhealst.js); nearx.stader-labs.near is NearX, read on chain only (§2, §12.10)
const CONTRACTS = ['contract.main.burrow.near', 'meta-pool.near', 'lst.rhealab.near', 'nearx.stader-labs.near', 'linear-protocol.near', 'v2.ref-finance.near'];
// §2: owners that are keys, not DAOs — the walk visits them
const KEY_OWNERS = ['rhealab.near'];
const DAOS = ['stnear', 'stader-nearx', 'linear', 'burrow', 'ref-finance'].map((d) => `${d}.sputnik-dao.near`);

const jobs = [];
for (const id of [...DAOS, 'sputnik-dao.near', 'docket-fixture-missing-account.near', ...CONTRACTS, ...KEY_OWNERS]) jobs.push([`view_account.${id}`, FASTNEAR, account(id)]);
jobs.push(['call.sputnik-dao.near.get_contracts_metadata', FASTNEAR, call('sputnik-dao.near', 'get_contracts_metadata')]);
jobs.push(['call.sputnik-dao.near.get_default_code_hash', FASTNEAR, call('sputnik-dao.near', 'get_default_code_hash')]);
for (const c of CONTRACTS) for (const g of OWNER_GETTERS) jobs.push([`call.${c}.${g}`, FASTNEAR, call(c, g)]);
jobs.push(["call.docket-fixture-missing-account.near.get_owner", FASTNEAR, call("docket-fixture-missing-account.near", "get_owner")]);
for (const d of DAOS) jobs.push([`call.${d}.get_factory_info`, FASTNEAR, call(d, 'get_factory_info')]);
// §2: accounts that expose no owner getter
for (const c of ['intents.near', 'wrap.near']) for (const g of OWNER_GETTERS) jobs.push([`call.${c}.${g}`, FASTNEAR, call(c, g)]);
// §6.1 authority walk (Nov 6): keys on every account the walk visits; owner getters and
// get_factory_info on the accounts not covered above.
const keys = (id) => ({ request_type: 'view_access_key_list', finality: 'final', account_id: id });
for (const id of [...CONTRACTS, ...DAOS, 'sputnik-dao.near', ...KEY_OWNERS]) jobs.push([`access_keys.${id}`, FASTNEAR, keys(id)]);
for (const id of [...DAOS, 'sputnik-dao.near', ...KEY_OWNERS]) for (const g of OWNER_GETTERS) jobs.push([`call.${id}.${g}`, FASTNEAR, call(id, g)]);
for (const id of [...CONTRACTS, 'sputnik-dao.near', ...KEY_OWNERS]) jobs.push([`call.${id}.get_factory_info`, FASTNEAR, call(id, 'get_factory_info')]);
// §2: NearX staked NEAR, read on chain (not on DefiLlama)
jobs.push(['call.nearx.stader-labs.near.get_total_staked_balance', FASTNEAR, call('nearx.stader-labs.near', 'get_total_staked_balance')]);
// §6.3/§6.5 (Nov 7): the proposals lint must fire on, and token metadata for amount decoding (I10)
jobs.push(['call.burrow.sputnik-dao.near.get_proposals.1741-1744', FASTNEAR, call('burrow.sputnik-dao.near', 'get_proposals', { from_index: 1741, limit: 4 })]);
jobs.push(['call.marmaj.sputnik-dao.near.get_proposal.1016', FASTNEAR, call('marmaj.sputnik-dao.near', 'get_proposal', { id: 1016 })]);
for (const t of ['meta-pool.near', 'lst.rhealab.near', 'usdt.tether-token.near', 'wrap.near']) jobs.push([`call.${t}.ft_metadata`, FASTNEAR, call(t, 'ft_metadata')]);
// §6.1 policy edge (Nov 7): get_policy on every account the walk visits — a DAO answers with its
// policy, anything else with MethodNotFound / CodeDoesNotExist. stader-nearx is also decode.js's
// real-policy test (its Everyone role holds policy:VoteApprove).
for (const id of [...CONTRACTS, ...DAOS, 'sputnik-dao.near', ...KEY_OWNERS]) jobs.push([`call.${id}.get_policy`, FASTNEAR, call(id, 'get_policy')]);
// Error shapes from the failover endpoints, so rpc.js classifies them from data, not guesses.
for (const e of OTHERS) {
  const host = new URL(e).host;
  jobs.push([`${host}.call.meta-pool.near.get_owner`, e, call('meta-pool.near', 'get_owner')]);
  jobs.push([`${host}.view_account.docket-fixture-missing-account.near`, e, account('docket-fixture-missing-account.near')]);
  jobs.push([`${host}.view_account.stnear.sputnik-dao.near`, e, account('stnear.sputnik-dao.near')]);
}

const only = process.argv.slice(2);
const selected = only.length ? jobs.filter(([name]) => only.some((s) => name.includes(s))) : jobs;

await mkdir(DIR, { recursive: true });
for (const [name, endpoint, params] of selected) {
  try {
    const rec = await post(endpoint, params);
    await writeFile(new URL(`${DATE}.${name}.json`, DIR), JSON.stringify(rec, null, 2) + '\n');
    console.log('ok  ', rec.http_status, name);
  } catch (e) {
    console.log('FAIL', name, e.message);
  }
}

// GitHub (§3.4), unauthenticated, recorded whole. Run with no filter, or with the filter `github`.
const GITHUB = [
  ['github.pulls.233', 'https://api.github.com/repos/near-daos/sputnik-dao-contract/pulls/233'],
  ['github.compare.2b0f34a38604...9e96c75410a9', 'https://api.github.com/repos/near-daos/sputnik-dao-contract/compare/2b0f34a3860460f285307ec2ccf36345acbe05a2...9e96c75410a97a2ea463ec777d7b14fb446c6f0e'],
];
if (!only.length || only.includes('github')) for (const [name, url] of GITHUB) try {
  const res = await fetch(url, { headers: { accept: 'application/vnd.github+json', 'user-agent': 'docket-verify' }, signal: AbortSignal.timeout(15000) });
  const rec = { endpoint: url, captured_at: new Date().toISOString(), http_status: res.status, body: await res.json() };
  await writeFile(new URL(`${DATE}.${name}.json`, DIR), JSON.stringify(rec, null, 2) + '\n');
  console.log('ok  ', res.status, name);
} catch (e) { console.log('FAIL', name, e.message); }

// DefiLlama /protocols is several MB; keep only entries that report NEAR TVL. Entries are unmodified.
if (!only.length || only.includes('defillama')) try {
  const all = await (await fetch('https://api.llama.fi/protocols', { signal: AbortSignal.timeout(30000) })).json();
  const near = all.filter((p) => p.chainTvls && typeof p.chainTvls.Near === 'number');
  const rec = { endpoint: 'https://api.llama.fi/protocols', captured_at: new Date().toISOString(),
    note: 'filtered to entries with a numeric chainTvls.Near; each entry is unmodified', body: near };
  await writeFile(new URL(`${DATE}.defillama.protocols.near.json`, DIR), JSON.stringify(rec, null, 2) + '\n');
  console.log('ok   defillama', near.length, 'entries');
} catch (e) { console.log('FAIL defillama', e.message); }
