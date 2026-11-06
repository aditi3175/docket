#!/usr/bin/env node
// receipts.mjs — read a transaction's receipts and judge the §16.2 UpgradeSelf test. Read-only: an RPC
// `tx` lookup, no key (I13). The verdict comes from the receipts, never from the proposal's status
// (an approved UpgradeSelf reads "Approved" whether or not the upgrade ran).
//
// Usage: node tools/receipts.mjs <tx-hash> <signer-account> [--step 5|9]
//
// step 5 (auto_update false):  CONFIRMED only if a receipt on the DAO fails with
//                              ERR_MUST_BE_SELF_OR_FACTORY and no other receipt fails. Anything else: STOP.
// step 9 (auto_update true):   CONFIRMED only if no receipt fails. Anything else: STOP.
//
// The RPC response shape (receipts_outcome[].outcome.{executor_id,status}) is read defensively: the
// failure text is searched in the whole status object, so an unexpected shape yields STOP, not a pass.

import { pathToFileURL } from 'node:url';

export const EXPECTED_STEP5 = 'ERR_MUST_BE_SELF_OR_FACTORY';

// -> [{ executor, failed, error }]
export function outcomes(txStatus) {
  const ro = txStatus?.receipts_outcome;
  if (!Array.isArray(ro)) return null;
  return ro.map((r) => {
    const st = r?.outcome?.status ?? {};
    const failed = typeof st === 'object' && 'Failure' in st;
    return { executor: r?.outcome?.executor_id ?? null, failed, error: failed ? JSON.stringify(st.Failure) : null };
  });
}

// -> { verdict: 'CONFIRMED' | 'STOP', reason, failures }
export function judge(txStatus, step, dao) {
  const o = outcomes(txStatus);
  if (!o) return { verdict: 'STOP', reason: 'no receipts_outcome in the RPC response', failures: [] };
  const failures = o.filter((x) => x.failed);
  if (step === 5) {
    const onDao = failures.filter((f) => f.executor === dao && f.error.includes(EXPECTED_STEP5));
    if (onDao.length === 1 && failures.length === 1) return { verdict: 'CONFIRMED', reason: `${dao} update() rejected the factory: ${EXPECTED_STEP5}`, failures };
    if (!failures.length) return { verdict: 'STOP', reason: 'no receipt failed: the upgrade path was NOT blocked by auto_update:false', failures };
    return { verdict: 'STOP', reason: `unexpected failure(s): ${failures.map((f) => `${f.executor}: ${f.error.slice(0, 200)}`).join(' | ')}`, failures };
  }
  if (step === 9) {
    return failures.length
      ? { verdict: 'STOP', reason: `the control failed: ${failures.map((f) => `${f.executor}: ${f.error.slice(0, 200)}`).join(' | ')}`, failures }
      : { verdict: 'CONFIRMED', reason: 'every receipt succeeded: with auto_update:true the same UpgradeSelf runs', failures };
  }
  return { verdict: failures.length ? 'STOP' : 'CONFIRMED', reason: failures.length ? 'a receipt failed' : 'no receipt failed', failures };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const a = process.argv.slice(2);
  const si = a.indexOf('--step'); const step = si >= 0 ? Number(a[si + 1]) : null;
  const [hash, signer] = a.filter((x, i) => x !== '--step' && i !== si + 1);
  if (!hash || !signer) { console.error('usage: node tools/receipts.mjs <tx-hash> <signer-account> [--step 5|9]'); process.exit(2); }
  const dao = 'docket-demo.sputnik-dao.near';
  const r = await (await fetch('https://free.rpc.fastnear.com', { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 'docket', method: 'tx', params: { tx_hash: hash, sender_account_id: signer, wait_until: 'FINAL' } }) })).json();
  if (r.error) { console.log('UNKNOWN —', JSON.stringify(r.error).slice(0, 300)); process.exit(2); }
  for (const x of outcomes(r.result) ?? []) console.log(`${x.failed ? 'FAIL' : 'ok  '}  ${x.executor}${x.error ? '  ' + x.error.slice(0, 300) : ''}`);
  const j = judge(r.result, step, dao);
  console.log(`\n${j.verdict}: ${j.reason}`);
  process.exit(j.verdict === 'CONFIRMED' ? 0 : 1);
}
