#!/usr/bin/env node
// crawl.mjs — the §3.3 census: every DAO the factory lists, read through rpc.js (§9: FastNear ->
// rpc.mainnet.near.org -> near.drpc.org, concurrency <= 6), written to graph.json.
//
// Resumable (§12.6): graph.json is rewritten every CHECKPOINT DAOs; a re-run reads the factory's list
// again and re-reads only DAOs that are new or have any unread field. `--fresh` re-reads every DAO.
//
// Enforces:
//   I2   a failed read is stored as 'unread', with its reason, never as a value
//   I11  census buckets true / false / unknown (no-factory-info, unread), with the denominator
//   I10  balances are yoctoNEAR strings (BigInt-safe); k and n are strings
//   I13  reads only: no key, no account
//
// Per DAO: get_factory_info, view_account (code identity + balance), view_access_key_list, get_policy
// (summarised with resolve.js policyEdge: who can pass a code- or rule-changing kind alone).
//
// Usage: node tools/crawl.mjs [--fresh] [--out graph.json]

import { readFile, writeFile, rename } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { createRpc } from '../web/assets/rpc.js';
import { factoryInfo, codeIdentity, accessKeys, loadFactoryVersions, policyEdge } from '../web/assets/resolve.js';
import { daoList, bucketOf, census, pct } from '../web/assets/census.js';

export const CHECKPOINT = 100;
export const FACTORY = 'sputnik-dao.near';

// One DAO -> its record. Every field is a value or 'unread' with a reason in `unread`.
export async function readDao(rpc, id, factory) {
  const unread = [];
  const [fi, code, keys, pol, acct] = await Promise.all([
    factoryInfo(rpc, id), codeIdentity(rpc, id, factory), accessKeys(rpc, id), rpc.viewFunction(id, 'get_policy'),
    rpc.viewAccount(id), // the same view_account codeIdentity makes; answered from rpc.js's cache
  ]);
  const autoUpdate = bucketOf(fi);
  if (autoUpdate === 'unread') unread.push(`get_factory_info: ${fi.reason}`);
  let codeRec;
  if (code.form === 'unknown') { codeRec = 'unread'; unread.push(`view_account: ${code.reason}`); }
  else codeRec = { form: code.form, hash: code.hash, account: code.account, version: code.version, commit: code.commit ? code.commit.slice(0, 12) : null, versionStatus: code.versionStatus };
  let keyRec;
  if (keys.status === 'ok') keyRec = { full: keys.keys.filter((k) => k.kind === 'FullAccess').length, functionCall: keys.keys.filter((k) => k.kind === 'FunctionCall').length };
  else if (keys.status === 'no-account') keyRec = 'no-account';
  else { keyRec = 'unread'; unread.push(`view_access_key_list: ${keys.reason}`); }
  let policy;
  if (pol.status === 'ok' && Array.isArray(pol.value?.roles) && pol.value?.default_vote_policy) {
    const pe = policyEdge(pol.value);
    policy = {
      passers: pe.passers.map((p) => ({ role: p.role, k: String(p.k), n: String(p.n), kinds: p.labels.length })),
      alone: [...new Set(pe.passers.filter((p) => p.k === 1n).flatMap((p) => p.members))].sort(),
      ignored: pe.ignored.map((g) => g.role), tokenWeighted: pe.unknown.map((u) => u.role), unpassable: pe.unpassable.length,
      bond: String(pol.value.proposal_bond ?? ''),
    };
  } else if (pol.status === 'absent' || pol.status === 'error') policy = 'absent';
  // The chain answered, but not with a Sputnik policy (seen 2026-11-07: seven DAOs on an unpublished
  // global contract answer `{}`). That is an answer, not a failed read: recorded as it came, never
  // summarised as roles it does not have.
  else if (pol.status === 'ok') policy = { unrecognised: JSON.stringify(pol.value).slice(0, 200) };
  else { policy = 'unread'; unread.push(`get_policy: ${pol.reason ?? pol.status}`); }
  return {
    id, autoUpdate, factoryId: fi.status === 'ok' ? fi.factoryId : null, code: codeRec,
    balance: acct.status === 'ok' && /^\d+$/.test(String(acct.value.amount)) ? String(acct.value.amount) : 'unread',
    keys: keyRec, policy, unread,
  };
}

function summary(graph) {
  const c = census(Object.values(graph.daos));
  return { ...c, falseIds: c.falseIds };
}

async function main() {
  const argv = process.argv.slice(2);
  const fresh = argv.includes('--fresh');
  const oi = argv.indexOf('--out'); const out = new URL(`../${oi >= 0 ? argv[oi + 1] : 'graph.json'}`, import.meta.url);
  const rpc = createRpc({ timeoutMs: 20_000 });

  let graph = { daos: {} };
  if (!fresh) { try { graph = JSON.parse(await readFile(out, 'utf8')); } catch { /* first run */ } }

  const factory = await loadFactoryVersions(rpc, FACTORY);
  if (factory.status !== 'ok') { console.error(`factory unread: ${factory.reason}`); process.exit(2); }
  const list = await daoList(rpc, FACTORY);
  if (list.status !== 'ok') { console.error(`DAO list unread: ${list.reason}`); process.exit(2); }

  const todo = list.ids.filter((id) => fresh || !graph.daos[id] || graph.daos[id].unread?.length);
  console.log(`factory lists ${list.number} DAOs; ${todo.length} to read${fresh ? ' (fresh)' : ''}`);
  // Nothing new and nothing unread: leave graph.json exactly as it is (a no-op run must not dirty the tree).
  if (!todo.length && Object.keys(graph.daos).length === list.number && list.ids.every((id) => graph.daos[id])) {
    const s0 = census(Object.values(graph.daos));
    console.log(`census of ${s0.denominator} DAOs already complete (last run ${graph.crawl?.lastRunAt}); graph.json unchanged. Use --fresh to re-read every DAO.`);
    process.exit(0);
  }
  const started = new Date().toISOString();
  const keep = Object.fromEntries(list.ids.filter((id) => graph.daos[id]).map((id) => [id, graph.daos[id]]));
  graph = { ...graph, daos: keep };

  const save = async (complete) => {
    graph.factory = FACTORY;
    graph.numberDaos = list.number;
    graph.factoryDefault = { hash: factory.defaultHash, version: factory.versions.get(factory.defaultHash)?.version ?? null };
    graph.crawl = { startedAt: graph.crawl?.startedAt && !fresh ? graph.crawl.startedAt : started, lastRunAt: new Date().toISOString(), complete };
    graph.daos = Object.fromEntries(list.ids.filter((id) => graph.daos[id]).map((id) => [id, graph.daos[id]]));
    const tmp = new URL(`${out.href}.tmp`);
    await writeFile(tmp, JSON.stringify(graph, null, 1) + '\n');
    await rename(tmp, out);
  };

  let done = 0;
  for (let i = 0; i < todo.length; i += CHECKPOINT) {
    const batch = todo.slice(i, i + CHECKPOINT);
    const recs = await Promise.all(batch.map((id) => readDao(rpc, id, factory)));
    for (const r of recs) { r.readAt = new Date().toISOString(); graph.daos[r.id] = r; }
    done += batch.length;
    await save(false);
    const unreadNow = Object.values(graph.daos).filter((d) => d.unread?.length).length;
    console.log(`${done}/${todo.length} read · ${Object.keys(graph.daos).length}/${list.number} recorded · ${unreadNow} with an unread field · rpc ${JSON.stringify(rpc.stats)}`);
  }
  const unreadDaos = Object.values(graph.daos).filter((d) => d.unread?.length).length;
  const complete = Object.keys(graph.daos).length === list.number && unreadDaos === 0;
  await save(complete);

  const s = summary(graph);
  console.log(`\ncensus of ${s.denominator} DAOs (${complete ? 'complete' : `INCOMPLETE: ${unreadDaos} DAOs with an unread field; re-run to resume`})`);
  for (const [b, n] of Object.entries(s.counts)) console.log(`  ${b.padEnd(16)} ${n}`);
  console.log(`  true of answered: ${s.counts.true} / ${s.answered} = ${pct(s.shareTrueOfAnswered)}`);
  console.log(`  false: ${s.falseIds.join(', ')}`);
  console.log(`  factory_id other than ${FACTORY}: ${s.otherFactories.map((o) => `${o.id} -> ${o.factoryId}`).join(', ') || 'none'}`);
  process.exit(complete ? 0 : 2);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
