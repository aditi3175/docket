#!/usr/bin/env node
// verify.mjs — re-derives ARCHITECTURE.md claims from mainnet. (§0)
//
// Exit codes:
//   0  every structural claim confirmed
//   1  at least one structural claim diverged from mainnet
//   2  nothing diverged, but at least one claim could not be verified (unknown after all
//      failovers), or verify.mjs itself crashed
// TVL (DefiLlama) is live, dated, and warn-only: drift or DefiLlama being down never changes the exit code.
//
// The claim set is fixed: every claim is reported on every run. A claim whose input could not be
// read is reported as unknown, never skipped, so the total never changes (I2).
//
// Enforces: I1 (every number printed traces to a call made in this run, with its date),
//           I2 (unknown is its own bucket), I3/I4/I12 via resolve.js.
//
// Coverage today: §2, §3.3 (auto_update + headline sum), §4, §5. Other sections: not yet.
// Never edit an expectation here to make a check pass — report the divergence (CLAUDE.md).

import { pathToFileURL } from 'node:url';
import { createRpc } from '../web/assets/rpc.js';
import { resolveOwner, codeIdentity, loadFactoryVersions, factoryInfo, ZERO_HASH } from '../web/assets/resolve.js';
import { fetchDefiLlama, nearTvlFrom, sumTvl, topByNearTvl } from '../web/assets/value.js';

const FACTORY = 'sputnik-dao.near';

// ---- expectations, as stated in ARCHITECTURE.md ----------------------------------------------
// §2 + §3.3. specTvl is the dated spec figure, used only for the drift warning.
const PROTOCOLS = [
  { name: 'Rhea Lend',  slug: 'rhea-lend',       contract: 'contract.main.burrow.near', dao: 'burrow.sputnik-dao.near',       via: 'get_config.owner_id', autoUpdate: false, specTvl: 158_689_681 },
  { name: 'Meta Pool',  slug: 'meta-pool-near',  contract: 'meta-pool.near',            dao: 'stnear.sputnik-dao.near',       via: 'get_owner_id',        autoUpdate: true,  specTvl: 80_306_704 },
  { name: 'RHEA LST',   slug: 'rhea-lst',        contract: 'nearx.stader-labs.near',    dao: 'stader-nearx.sputnik-dao.near', via: 'get_owner_id',        autoUpdate: true,  specTvl: 70_553_120 },
  { name: 'LiNEAR',     slug: 'linear-protocol', contract: 'linear-protocol.near',      dao: 'linear.sputnik-dao.near',       via: 'get_owner_id',        autoUpdate: true,  specTvl: 48_553_100 },
  { name: 'Rhea Dex',   slug: 'rhea-dex',        contract: 'v2.ref-finance.near',       dao: 'ref-finance.sputnik-dao.near',  via: 'get_owner',           autoUpdate: false, specTvl: 23_964_823 },
];
const SPEC_TVL_DATE = '2026-11-05';
const SPEC_HEADLINE = 199_412_924; // §3.3 — sum of the auto_update:true protocols
// TVL moves daily. Beyond this relative move from the spec figure verify.mjs warns; it never fails.
const TVL_DRIFT_WARN = 0.15;

// §5 — code identity per DAO (and the factory itself)
const CODE = [
  { account: 'stnear.sputnik-dao.near',       form: 'global_hash', hash: 'DtHZA1mUmGYeScEaUoUZYQGGFHSMpnjMCvkr5U9hJXuF', version: 'v3.2' },
  { account: 'stader-nearx.sputnik-dao.near', form: 'local',       hash: '2Zof1Tyy4pMeJM48mDSi5ww2QQhTz97b9S8h6W6r4HnK', version: 'v3.0' },
  { account: 'linear.sputnik-dao.near',       form: 'local',       hash: '4zSoHkLjJWZm34Psd4Eq2WUXHELt6LxtKmUXpsZWAECp', version: 'v3.1' },
  { account: 'burrow.sputnik-dao.near',       form: 'local',       hash: '4zSoHkLjJWZm34Psd4Eq2WUXHELt6LxtKmUXpsZWAECp', version: 'v3.1' },
  { account: 'ref-finance.sputnik-dao.near',  form: 'local',       hash: '4zSoHkLjJWZm34Psd4Eq2WUXHELt6LxtKmUXpsZWAECp', version: 'v3.1' },
  { account: FACTORY,                         form: 'local',       hash: 'BXd5idTXSnC7WRfxHmi7z4crw2F5WXQJ6MZUEv8DfnnY', version: null },
];
// §5 — get_contracts_metadata, in order
const FACTORY_VERSIONS = [
  ['8RMeZ5cXDap6TENxaJKtigRYf3n139iHmTRe8ZUNey6N', 'v2.0', 'c2cf1553b070'],
  ['8jmhwSkNeAWCRqsr2KoD7d8BzDYorEz3a3iHuM9Gykrg', 'v2.1', 'UNOFFICIAL_S'],
  ['2Zof1Tyy4pMeJM48mDSi5ww2QQhTz97b9S8h6W6r4HnK', 'v3.0', '86cc77a0808a'],
  ['4zSoHkLjJWZm34Psd4Eq2WUXHELt6LxtKmUXpsZWAECp', 'v3.1', '3d568f9517a8'],
  ['DtHZA1mUmGYeScEaUoUZYQGGFHSMpnjMCvkr5U9hJXuF', 'v3.2', '2b0f34a38604'],
];
const DEFAULT_CODE_HASH = 'DtHZA1mUmGYeScEaUoUZYQGGFHSMpnjMCvkr5U9hJXuF';

// §2 — "major NEAR DeFi", the denominator of the share. Set to a slug list only once the
// definition is unambiguous; until then the share prints as unknown (§2, §12.7).
const MAJOR_NEAR_DEFI = {
  slugs: null,
  reason: "DefiLlama's top 10 by NEAR-only TVL includes CEX and Canonical Bridge entries; " +
          'whether those count as "DeFi" is not defined',
};

// ---- collect: every claim, every run --------------------------------------------------------
// -> { claims, warnings, ...data }. Reads only through `rpc` and `llamaFetch`, so tests can inject both.
export async function collect({ rpc = createRpc(), llamaFetch } = {}) {
  const claims = [];
  const warnings = [];
  // unknownReason !== undefined -> unverifiable; otherwise exact comparison with the spec.
  const claim = (section, what, expected, actual, unknownReason) => {
    const status = unknownReason !== undefined ? 'unverifiable'
      : JSON.stringify(expected) === JSON.stringify(actual) ? 'confirmed' : 'diverged';
    claims.push({ kind: 'structural', section, what, expected, actual, status, unknownReason });
  };

  const started = new Date();
  const [factory, llama] = await Promise.all([
    loadFactoryVersions(rpc, FACTORY),
    fetchDefiLlama(llamaFetch ? { fetch: llamaFetch } : {}),
  ]);
  const [owners, infos, codes, stnearRaw] = await Promise.all([
    Promise.all(PROTOCOLS.map((p) => resolveOwner(rpc, p.contract))),
    Promise.all(PROTOCOLS.map((p) => factoryInfo(rpc, p.dao))),
    Promise.all(CODE.map((c) => codeIdentity(rpc, c.account, factory))),
    rpc.viewAccount('stnear.sputnik-dao.near'),
  ]);

  // §5 factory list
  {
    const what = `${FACTORY} get_contracts_metadata (hash, version, commit)`;
    if (factory.status !== 'ok') claim('§5', what, FACTORY_VERSIONS, null, factory.reason);
    else claim('§5', what, FACTORY_VERSIONS, [...factory.versions].map(([h, v]) => [h, v.version, (v.commit ?? '').slice(0, 12)]));
    const whatDef = 'get_default_code_hash = v3.2';
    if (factory.status !== 'ok') claim('§5', whatDef, DEFAULT_CODE_HASH, null, factory.reason);
    else if (factory.defaultHash === 'unknown') claim('§5', whatDef, DEFAULT_CODE_HASH, null, 'get_default_code_hash unread');
    else claim('§5', whatDef, DEFAULT_CODE_HASH, factory.defaultHash);
  }

  // §2 owners, §3.3 auto_update
  PROTOCOLS.forEach((p, i) => {
    const o = owners[i];
    const whatO = `${p.contract} owner + getter`;
    if (o.status === 'unknown') claim('§2', whatO, [p.dao, p.via], null, `${o.at}: ${o.reason}`);
    else claim('§2', whatO, [p.dao, p.via], o.status === 'ok' ? [o.owner, o.via] : [o.status]);
    const f = infos[i];
    const whatF = `${p.dao} get_factory_info`;
    if (f.status === 'unknown') claim('§3.3', whatF, [FACTORY, p.autoUpdate], null, f.reason);
    else claim('§3.3', whatF, [FACTORY, p.autoUpdate], f.status === 'ok' ? [f.factoryId, f.autoUpdate] : ['absent']);
  });

  // §4/§5 code identity — the version claim depends on the account read AND the factory read
  CODE.forEach((c, i) => {
    const id = codes[i];
    const whatC = `${c.account} code (form, hash)`;
    if (id.form === 'unknown') claim('§5', whatC, [c.form, c.hash], null, id.reason);
    else claim('§5', whatC, [c.form, c.hash], [id.form, id.hash ?? id.account]);
    if (!c.version) return;
    const whatV = `${c.account} version`;
    if (id.form === 'unknown') claim('§5', whatV, c.version, null, `view_account unread: ${id.reason}`);
    else if (id.versionStatus === 'unknown') claim('§5', whatV, c.version, null, `factory metadata unread: ${factory.reason ?? 'unknown'}`);
    else claim('§5', whatV, c.version, id.version);
  });

  // §4 specifically: the trap — zero code_hash, contract running anyway
  if (stnearRaw.status !== 'ok') claim('§4', 'stnear code_hash is 32 zero bytes', ZERO_HASH, null, stnearRaw.reason ?? stnearRaw.status);
  else claim('§4', 'stnear code_hash is 32 zero bytes', ZERO_HASH, stnearRaw.value.code_hash);

  // ---- TVL (warn-only) ----
  const tvl = PROTOCOLS.map((p) => (llama.status === 'ok' ? nearTvlFrom(llama.protocols, p.slug) : { status: 'unknown', slug: p.slug, reason: llama.reason }));
  if (llama.status !== 'ok') warnings.push(`DefiLlama unreachable (${llama.reason}) — TVL shown as unknown`);
  tvl.forEach((t, i) => {
    if (t.status !== 'ok') { if (llama.status === 'ok') warnings.push(`${PROTOCOLS[i].slug}: ${t.reason}`); return; }
    const drift = (t.usd - PROTOCOLS[i].specTvl) / PROTOCOLS[i].specTvl;
    if (Math.abs(drift) > TVL_DRIFT_WARN) warnings.push(`${PROTOCOLS[i].name} TVL moved ${(drift * 100).toFixed(1)}% from the spec figure (${SPEC_TVL_DATE})`);
  });

  // numerator: protocols whose live owner runs factory-published Sputnik code
  const codeOf = new Map(CODE.map((c, i) => [c.account, codes[i]]));
  const sputnikAdministered = PROTOCOLS.map((p, i) => {
    const o = owners[i];
    if (o.status !== 'ok') return 'unknown';
    const id = codeOf.get(o.owner);
    if (!id || id.versionStatus === 'unknown' || id.form === 'unknown') return 'unknown';
    return id.versionStatus === 'published';
  });
  const numTerms = PROTOCOLS.map((p, i) => sputnikAdministered[i] === true ? tvl[i]
    : sputnikAdministered[i] === 'unknown' ? { status: 'unknown', slug: p.slug } : null).filter(Boolean);
  const numerator = sumTvl(numTerms);

  // headline: protocols whose administering DAO reads auto_update: true, live
  const autoTrue = PROTOCOLS.map((p, i) => ({ p, f: infos[i], t: tvl[i], o: owners[i] }))
    .filter(({ f, o, p }) => f.status === 'ok' && f.autoUpdate === true && o.status === 'ok' && o.owner === p.dao);
  const headlineUnknown = infos.some((f) => f.status !== 'ok') || owners.some((o) => o.status !== 'ok');
  const headline = headlineUnknown ? { status: 'unknown' } : sumTvl(autoTrue.map((x) => x.t));

  return { started, claims, warnings, factory, llama, owners, infos, codes, tvl, numTerms, numerator, autoTrue, headline };
}

// Exit code from structural claims only; TVL never decides it.
export function exitCodeFor(claims) {
  const s = claims.filter((c) => c.kind === 'structural');
  return s.some((c) => c.status === 'diverged') ? 1 : s.some((c) => c.status === 'unverifiable') ? 2 : 0;
}

// ---- print ----------------------------------------------------------------------------------
const short = (h) => (h && h.length > 12 ? `${h.slice(0, 8)}…${h.slice(-3)}` : h ?? '—');
const usd = (n) => `$${Math.round(n).toLocaleString('en-US')}`;
const pad = (s, n) => String(s).padEnd(n);

function print(r, rpc) {
  const { claims, warnings, factory, llama, owners, codes, tvl, numTerms, numerator, autoTrue, headline } = r;
  const llamaDate = llama.readAt.slice(0, 10);
  console.log(`Docket verify — mainnet, ${r.started.toISOString()}\n`);
  console.log(`§2  who administers NEAR DeFi   (TVL: DefiLlama chainTvls.Near, read ${llama.readAt})\n`);
  console.log(`| protocol | TVL (DefiLlama, ${llamaDate}) | contract | administered by | resolved via |`);
  console.log('|---|---|---|---|---|');
  PROTOCOLS.forEach((p, i) => {
    const o = owners[i];
    const owner = o.status === 'ok' ? `\`${o.owner}\`` : `**${o.status}**`;
    const via = o.status === 'ok' ? `\`${o.via}\`` : (o.at ? `unknown at \`${o.at}\`` : '—');
    console.log(`| ${p.name} | ${tvl[i].status === 'ok' ? usd(tvl[i].usd) : 'unknown'} | \`${p.contract}\` | ${owner} | ${via} |`);
  });

  console.log();
  console.log(`Administered by Sputnik DAOs: ${numerator.status === 'ok' ? usd(numerator.usd) : 'unknown'}  (${numTerms.length} of ${PROTOCOLS.length} protocols, DefiLlama ${llamaDate})`);
  if (MAJOR_NEAR_DEFI.slugs && llama.status === 'ok') {
    const den = sumTvl(MAJOR_NEAR_DEFI.slugs.map((s) => nearTvlFrom(llama.protocols, s)));
    if (den.status === 'ok' && numerator.status === 'ok') console.log(`Share of major NEAR DeFi: ${(100 * numerator.usd / den.usd).toFixed(1)}% of ${usd(den.usd)} (${llamaDate})`);
    else console.log('Share of major NEAR DeFi: unknown (a term is unreadable)');
  } else {
    console.log(`Share of major NEAR DeFi: unknown — ${MAJOR_NEAR_DEFI.slugs ? 'DefiLlama unreachable' : MAJOR_NEAR_DEFI.reason}`);
  }
  if (llama.status === 'ok') {
    console.log(`\n  DefiLlama top 10 by NEAR-only TVL, ${llamaDate} (for the denominator definition):`);
    for (const t of topByNearTvl(llama.protocols, 10)) console.log(`    ${pad(usd(t.usd), 14)} ${pad(t.slug, 20)} ${t.category}`);
  }

  console.log(`\n§3.3  auto_update: true — factory can replace the code with no vote`);
  for (const { p, t } of autoTrue) console.log(`    ${pad(p.dao, 32)} ${pad(p.name, 10)} ${t.status === 'ok' ? usd(t.usd) : 'unknown'}`);
  console.log(`    headline: ${headline.status === 'ok' ? usd(headline.usd) : 'unknown'}  (DefiLlama, ${llamaDate}; spec says ${usd(SPEC_HEADLINE)} at ${SPEC_TVL_DATE})`);

  console.log(`\n§5  which code these DAOs run`);
  CODE.forEach((c, i) => {
    const id = codes[i];
    const where = id.form === 'global_hash' ? 'global_contract_hash' : id.form === 'global_account' ? 'global_contract_account_id' : id.form === 'local' ? 'code_hash' : id.form;
    const ver = id.versionStatus === 'published' ? `(${id.version}, commit ${id.commit.slice(0, 12)})` : `(${id.versionStatus})`;
    console.log(`    ${pad(c.account, 30)} ${pad(where, 21)} ${pad(short(id.hash ?? id.account), 14)} ${c.account === FACTORY ? '(factory)' : ver}${id.flags.length ? '  ⚠ ' + id.flags.join(', ') : ''}`);
  });
  if (factory.status === 'ok') {
    console.log(`\n    cross-referenced against ${FACTORY} :: get_contracts_metadata:`);
    for (const [h, v] of factory.versions) console.log(`    ${pad(short(h), 14)} ${pad(v.version, 5)} commit ${v.commit?.slice(0, 12)}${h === factory.defaultHash ? '   (= get_default_code_hash)' : ''}`);
  }

  const by = (s) => claims.filter((c) => c.status === s);
  const [ok, bad, unk] = [by('confirmed'), by('diverged'), by('unverifiable')];
  console.log(`\nClaims: ${claims.length} total — ${ok.length} confirmed, ${bad.length} diverged, ${unk.length} could not be verified`);
  for (const c of ok) console.log(`  ✓ ${c.section} ${c.what}`);
  for (const c of bad) console.log(`  ✗ DIVERGED ${c.section} ${c.what}\n      spec:    ${JSON.stringify(c.expected)}\n      mainnet: ${JSON.stringify(c.actual)}`);
  for (const c of unk) console.log(`  ? UNKNOWN  ${c.section} ${c.what} — ${c.unknownReason}`);
  if (warnings.length) {
    console.log(`\nWarnings — TVL movement or DefiLlama availability, not failed claims (exit code unaffected; drift threshold ${TVL_DRIFT_WARN * 100}%):`);
    for (const w of warnings) console.log(`  ! ${w}`);
  }
  if (rpc) console.log(`\nRPC: ${rpc.stats.requests} requests, max ${rpc.stats.maxActive} concurrent, ${rpc.stats.cacheHits} cache hits, ${rpc.stats.coalesced} coalesced`);
}

// ---- main (only when run directly, so tests can import collect) -----------------------------
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  // A crash verified nothing; it must not exit 1, which means "a claim diverged".
  for (const ev of ['uncaughtException', 'unhandledRejection']) {
    process.on(ev, (e) => {
      console.error(`\nverify.mjs crashed — no claim was verified:\n${e?.stack ?? e}`);
      process.exit(2);
    });
  }
  const rpc = createRpc();
  const r = await collect({ rpc });
  print(r, rpc);
  process.exitCode = exitCodeFor(r.claims);
}
