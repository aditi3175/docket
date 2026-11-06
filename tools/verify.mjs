#!/usr/bin/env node
// verify.mjs — re-derives ARCHITECTURE.md claims from mainnet. (§0)
//
// Exit codes:
//   0  every structural claim confirmed
//   1  at least one structural claim diverged from mainnet
//   2  nothing diverged, but at least one claim could not be verified (unknown after all
//      failovers), or verify.mjs itself crashed
// GitHub claims (§3.4) are a separate bucket with the same exit rules as structural claims:
// diverged -> 1, unknown (network failure, rate limit) -> 2. GitHub is read unauthenticated.
// TVL (DefiLlama) is live, dated, and warn-only: drift or DefiLlama being down never changes the exit code.
//
// The claim set is fixed: every claim is reported on every run. A claim whose input could not be
// read is reported as unknown, never skipped, so the total never changes (I2).
//
// Enforces: I1 (every number printed traces to a call made in this run, with its date),
//           I2 (unknown is its own bucket), I3/I4/I12 via resolve.js.
//
// Coverage today: chain — §1/§2 (owners), §3.3 (auto_update), §3.4 (factory owner + keys, §6.1 walk), §4, §5; GitHub — §3.4 (PR #233 and
// where the fix sits relative to the deployed commit); DefiLlama — §1/§2 coverage, §3.3 headline sum
// and liquid-staking share. Other sections: not yet.
// Never edit an expectation here to make a check pass — report the divergence (CLAUDE.md).

import { pathToFileURL } from 'node:url';
import { createRpc } from '../web/assets/rpc.js';
import { resolveOwner, codeIdentity, loadFactoryVersions, factoryInfo, accessKeys, authorityWalk, WALK_NOT_EVALUATED, ZERO_HASH } from '../web/assets/resolve.js';
import { githubGet } from './github.mjs';
import { fetchDefiLlama, nearTvlFrom, sumTvl, categoryNearTvl, applyCoverageRule, COVERAGE_RULE } from '../web/assets/value.js';

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
// §3.3 — NEAR liquid staking: DefiLlama category "Liquid Staking", chainTvls.Near (2026-11-05)
const LIQUID_STAKING = 'Liquid Staking';
const SPEC_LS_TOTAL = 200_526_770;
const SPEC_LS_SHARE = 0.994; // share held by the auto_update:true protocols, as written in §3.3 (99.4%)

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

// §1/§2 — coverage: "All 5 of 5 NEAR DeFi protocols >= $10M (COVERAGE_RULE) are administered by
// a Sputnik DAO". N is computed live from DefiLlama; no share is computed (§12.7).
const SPEC_COVERAGE_N = 5;
// §2 — contracts that expose no owner through any §6.2 getter, and are excluded rather than guessed at
const NO_OWNER = ['intents.near', 'wrap.near'];

// §3.4 — the root: the factory is self-owned and holds three full-access keys
const FACTORY_KEYS = ['FullAccess', 'FullAccess', 'FullAccess'];
// §3.4/§6.1 — no-vote roots per protocol: [roots "account kind", paths "a>b>c", vote gates].
// auto_update:true -> the factory's three keys through the DAO; false -> no root, the DAO is a vote gate.
const walkExpect = (p) => (p.autoUpdate
  ? [FACTORY_KEYS.map((k) => `${FACTORY} ${k}`), [`${p.contract}>${p.dao}>${FACTORY}`], []]
  : [[], [], [p.dao]]);

// §3.4 — GitHub: PR #233, and where its merge commit sits relative to the deployed v3.2 commit
const REPO = '/repos/near-daos/sputnik-dao-contract';
const DEPLOYED_SHA = '2b0f34a3860460f285307ec2ccf36345acbe05a2'; // v3.2, per get_contracts_metadata (§5)
const FIX_SHA = '9e96c75410a97a2ea463ec777d7b14fb446c6f0e';
const FIX_PR = 233;
const SPEC_FIX_PR = [true, '2026-03-24T21:43:46Z', FIX_SHA];             // merged, merged_at, merge_commit_sha
const SPEC_FIX_COMPARE = ['ahead', 2, 0];                               // status, ahead_by, behind_by
const SPEC_FIX_DATES = ['2026-02-25T22:10:34Z', '2026-03-24T21:43:46Z']; // committer dates: deployed, fix

function usdFmt(n) { return `$${Math.round(n).toLocaleString('en-US')}`; }
const pctFmt = (x) => `${(100 * x).toFixed(1)}%`;

// ---- collect: every claim, every run --------------------------------------------------------
// -> { claims, warnings, ...data }. Reads only through `rpc` and `llamaFetch`, so tests can inject both.
export async function collect({ rpc = createRpc(), llamaFetch, githubFetch } = {}) {
  const claims = [];
  const warnings = [];
  // unknownReason !== undefined -> unverifiable; otherwise exact comparison with the spec.
  const claim = (section, what, expected, actual, unknownReason) => {
    const status = unknownReason !== undefined ? 'unverifiable'
      : JSON.stringify(expected) === JSON.stringify(actual) ? 'confirmed' : 'diverged';
    claims.push({ kind: 'structural', section, what, expected, actual, status, unknownReason });
  };

  const started = new Date();
  const gh = githubFetch ? { fetch: githubFetch } : {};
  const [factory, llama, ghPr, ghCompare] = await Promise.all([
    loadFactoryVersions(rpc, FACTORY),
    fetchDefiLlama(llamaFetch ? { fetch: llamaFetch } : {}),
    githubGet(`${REPO}/pulls/${FIX_PR}`, gh),
    githubGet(`${REPO}/compare/${DEPLOYED_SHA}...${FIX_SHA}`, gh),
  ]);
  const [owners, infos, codes, stnearRaw, noOwner, factoryOwner, factoryKeys, walks] = await Promise.all([
    Promise.all(PROTOCOLS.map((p) => resolveOwner(rpc, p.contract))),
    Promise.all(PROTOCOLS.map((p) => factoryInfo(rpc, p.dao))),
    Promise.all(CODE.map((c) => codeIdentity(rpc, c.account, factory))),
    rpc.viewAccount('stnear.sputnik-dao.near'),
    Promise.all(NO_OWNER.map((id) => resolveOwner(rpc, id))),
    resolveOwner(rpc, FACTORY),
    accessKeys(rpc, FACTORY),
    Promise.all(PROTOCOLS.map((p) => authorityWalk(rpc, p.contract))),
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

  // §2 — no owner through any §6.2 getter
  NO_OWNER.forEach((id, i) => {
    const o = noOwner[i];
    const what = `${id} exposes no owner via the §6.2 getters`;
    if (o.status === 'unknown') claim('§2', what, 'none', null, `${o.at}: ${o.reason}`);
    else claim('§2', what, 'none', o.status === 'ok' ? `${o.owner} via ${o.via}` : o.status);
  });

  // §3.4 — the root, and §6.1 — the walk from each protocol contract (cold: nothing assumed)
  {
    const whatO = `${FACTORY} owner + getter (self-owned)`;
    if (factoryOwner.status === 'unknown') claim('§3.4', whatO, [FACTORY, 'get_owner'], null, `${factoryOwner.at}: ${factoryOwner.reason}`);
    else claim('§3.4', whatO, [FACTORY, 'get_owner'], factoryOwner.status === 'ok' ? [factoryOwner.owner, factoryOwner.via] : [factoryOwner.status]);
    const whatK = `${FACTORY} access keys (view_access_key_list)`;
    if (factoryKeys.status === 'unknown') claim('§3.4', whatK, FACTORY_KEYS, null, factoryKeys.reason);
    else claim('§3.4', whatK, FACTORY_KEYS, factoryKeys.status === 'ok' ? factoryKeys.keys.map((k) => k.kind).sort() : [factoryKeys.status]);
  }
  PROTOCOLS.forEach((p, i) => {
    const w = walks[i];
    const what = `${p.contract} no-vote roots, paths, vote gates (§6.1 walk)`;
    if (w.status === 'unknown') { const u = w.unknowns[0]; claim('§3.4', what, walkExpect(p), null, `${u.at} ${u.read}: ${u.reason}`); return; }
    claim('§3.4', what, walkExpect(p), [
      w.roots.map((r) => `${r.account} ${r.kind}`).sort(),
      [...new Set(w.roots.map((r) => r.path.join('>')))].sort(),
      [...w.voteGates].sort(),
    ]);
  });

  // ---- GitHub (§3.4): same exit rules as structural; any failed read is unknown (I2) ----
  const ghClaim = (what, expected, read, pick) => {
    const actual = read.status === 'ok' ? pick(read.body) : null;
    const status = read.status !== 'ok' ? 'unverifiable'
      : JSON.stringify(expected) === JSON.stringify(actual) ? 'confirmed' : 'diverged';
    claims.push({ kind: 'github', section: '§3.4', what, expected, actual, status,
      unknownReason: read.status === 'ok' ? undefined : read.reason, url: read.url, readAt: read.readAt });
  };
  ghClaim(`PR #${FIX_PR} merged (merged, merged_at, merge_commit_sha)`, SPEC_FIX_PR, ghPr,
    (b) => [b.merged ?? null, b.merged_at ?? null, b.merge_commit_sha ?? null]);
  ghClaim(`fix ${FIX_SHA.slice(0, 12)} vs deployed ${DEPLOYED_SHA.slice(0, 12)} (status, ahead_by, behind_by)`, SPEC_FIX_COMPARE, ghCompare,
    (b) => [b.status ?? null, b.ahead_by ?? null, b.behind_by ?? null]);
  ghClaim('committer dates (deployed v3.2, fix)', SPEC_FIX_DATES, ghCompare,
    (b) => [b.base_commit?.sha === DEPLOYED_SHA ? b.base_commit.commit?.committer?.date ?? null : null,
      (b.commits ?? []).find((c) => c.sha === FIX_SHA)?.commit?.committer?.date ?? null]);

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

  // ---- TVL claims: live, dated, warn-only. 'read' within TVL_DRIFT_WARN of the spec, 'moved' beyond.
  const tvlClaim = (section, what, expected, actual, fmt, unknownReason) => {
    let status = 'unverifiable';
    if (unknownReason === undefined) {
      const drift = (actual - expected) / expected;
      status = Math.abs(drift) > TVL_DRIFT_WARN ? 'moved' : 'read';
      if (status === 'moved') warnings.push(`${what}: ${fmt(actual)} vs spec ${fmt(expected)} (${(drift * 100).toFixed(1)}%)`);
    }
    claims.push({ kind: 'tvl', section, what, expected, actual, status, unknownReason, fmt });
  };

  // §3.3 liquid staking: sector total, and the share held by auto_update:true protocols in that category
  const ls = llama.status === 'ok' ? categoryNearTvl(llama.protocols, LIQUID_STAKING) : { status: 'unknown', reason: llama.reason };
  const lsMembers = new Set(ls.status === 'ok' ? ls.members.map((m) => m.slug) : []);
  const lsTrue = headline.status === 'ok' ? sumTvl(autoTrue.filter((x) => lsMembers.has(x.p.slug)).map((x) => x.t)) : { status: 'unknown' };
  tvlClaim('§3.3', `NEAR liquid staking total (DefiLlama "${LIQUID_STAKING}", NEAR-only)`, SPEC_LS_TOTAL,
    ls.usd, usdFmt, ls.status === 'ok' ? undefined : ls.reason);
  const lsShareUnknown = ls.status !== 'ok' ? ls.reason
    : lsTrue.status !== 'ok' ? 'auto_update:true set, or its TVL, unknown' : undefined;
  tvlClaim('§3.3', 'share of NEAR liquid staking held by auto_update:true protocols', SPEC_LS_SHARE,
    lsShareUnknown ? undefined : lsTrue.usd / ls.usd, pctFmt, lsShareUnknown);

  // §1/§2 coverage: every protocol the rule selects, checked for a Sputnik owner. Never rounded up:
  // a protocol with no mapped contract, an unreadable owner, or a non-Sputnik owner is named and
  // not counted. Warn-only because N moves with TVL; the owner claims above stay structural.
  const coverage = llama.status === 'ok' ? applyCoverageRule(llama.protocols) : null;
  const bySlug = new Map(PROTOCOLS.map((p, i) => [p.slug, i]));
  const covRows = (coverage?.included ?? []).map((e) => {
    const i = bySlug.get(e.slug);
    if (i === undefined) return { ...e, sputnik: false, why: 'owner unknown: no contract mapped for this slug' };
    const o = owners[i];
    if (sputnikAdministered[i] === true) return { ...e, sputnik: true, owner: o.owner };
    if (sputnikAdministered[i] === 'unknown') return { ...e, sputnik: false, why: `owner unknown${o.status === 'unknown' ? ` (${o.at}: ${o.reason})` : ''}` };
    return { ...e, sputnik: false, why: o.status === 'ok' ? `owner ${o.owner} does not run factory-published Sputnik code` : `no owner (${o.status})` };
  });
  const covM = covRows.filter((r) => r.sputnik).length;
  const covN = covRows.length;
  {
    const what = `NEAR DeFi protocols >= $${COVERAGE_RULE.minUsd / 1e6}M (NEAR-only, excl. ${COVERAGE_RULE.excludeCategories.join(', ')}, *${COVERAGE_RULE.excludeCategorySubstring}*) administered by a Sputnik DAO`;
    const fmt = ([m, n]) => `${m} of ${n}`;
    let status = 'unverifiable';
    if (coverage) {
      status = covM === covN && covN === SPEC_COVERAGE_N ? 'read' : 'moved';
      if (status === 'moved') {
        const gaps = covRows.filter((r) => !r.sputnik).map((r) => `${r.slug}: ${r.why}`);
        warnings.push(`coverage is ${covM} of ${covN} (spec: ${SPEC_COVERAGE_N} of ${SPEC_COVERAGE_N})${gaps.length ? ' — ' + gaps.join('; ') : ''}`);
      }
    }
    claims.push({ kind: 'tvl', section: '§1/§2', what, expected: [SPEC_COVERAGE_N, SPEC_COVERAGE_N],
      actual: coverage ? [covM, covN] : undefined, status, unknownReason: coverage ? undefined : llama.reason, fmt });
  }

  return { started, claims, warnings, factory, llama, owners, infos, codes, tvl, numTerms, numerator, autoTrue, headline, ls, lsTrue, coverage, covRows, covM, covN, noOwner, factoryOwner, factoryKeys, walks };
}

// Exit code from structural and GitHub claims; TVL never decides it.
export function exitCodeFor(claims) {
  const s = claims.filter((c) => c.kind === 'structural' || c.kind === 'github');
  return s.some((c) => c.status === 'diverged') ? 1 : s.some((c) => c.status === 'unverifiable') ? 2 : 0;
}

// ---- print ----------------------------------------------------------------------------------
const short = (h) => (h && h.length > 12 ? `${h.slice(0, 8)}…${h.slice(-3)}` : h ?? '—');
const usd = usdFmt;
const pad = (s, n) => String(s).padEnd(n);

// §3.4 — the chain, assembled from this run's reads only. A protocol is on it when its §6.1 walk
// reaches a full-access key on the factory; its TVL is summed only then. Any unknown walk makes the
// total unknown (I2) rather than a smaller number.
function printChain({ walks, tvl, factoryOwner, factoryKeys, llama }) {
  const date = llama.readAt.slice(0, 10);
  console.log('§3.4  the chain — every edge a public view call, read in this run\n');
  const nKeys = factoryKeys.status === 'ok' ? factoryKeys.keys.filter((k) => k.kind === 'FullAccess') : null;
  const owner = factoryOwner.status === 'ok' ? `get_owner -> ${factoryOwner.owner}${factoryOwner.owner === FACTORY ? ' (self-owned)' : ''}` : `owner ${factoryOwner.status}`;
  console.log(`  ${nKeys ? nKeys.length : 'unknown'} full-access keys on ${FACTORY}   [${owner}]`);
  if (nKeys) console.log(`    ${nKeys.map((k) => `${k.publicKey.slice(0, 18)}…`).join('  ')}`);
  const onChain = PROTOCOLS.map((p, i) => ({ p, w: walks[i], t: tvl[i] }))
    .filter(({ w }) => w.roots.some((x) => x.account === FACTORY && x.kind === 'FullAccess'));
  console.log(`   └── update(code) → DAO update(), no vote: auto_update: true on`);
  onChain.forEach(({ p, t }, i) => {
    const branch = i === onChain.length - 1 ? '└──' : '├──';
    console.log(`        ${branch} ${pad(p.dao, 30)} owner of ${pad(p.contract, 24)} ${t.status === 'ok' ? usd(t.usd) : 'unknown'}`);
  });
  const anyUnknown = walks.some((w) => w.status !== 'ok');
  const total = anyUnknown ? { status: 'unknown' } : sumTvl(onChain.map((x) => x.t));
  console.log(`  = ${total.status === 'ok' ? usd(total.usd) : 'unknown'} of user deposits (DefiLlama ${date}) reachable from ${nKeys ? nKeys.length : 'unknown'} keys with no vote`);
  const gated = PROTOCOLS.map((p, i) => ({ p, w: walks[i] })).filter(({ w }) => w.status === 'ok' && w.voteGates.length && !w.roots.length);
  if (gated.length) console.log(`  needs a vote (auto_update: false): ${gated.map(({ p, w }) => `${w.voteGates.join(', ')} (${p.name})`).join('; ')}`);
  for (const w of walks.filter((x) => x.status !== 'ok')) console.log(`  ? ${w.account}: walk unknown — ${w.unknowns.map((u) => `${u.at} ${u.read}: ${u.reason}`).join('; ')}`);
  console.log(`  a floor, not a total: not yet evaluated — ${WALK_NOT_EVALUATED.join('; ')}\n`);
}

function print(r, rpc) {
  const { claims, warnings, factory, llama, owners, codes, tvl, numTerms, numerator, autoTrue, headline, ls, lsTrue, coverage, covRows, covM, covN, noOwner } = r;
  const llamaDate = llama.readAt.slice(0, 10);
  console.log(`Docket verify — mainnet, ${r.started.toISOString()}\n`);
  printChain(r);
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
  NO_OWNER.forEach((id, i) => console.log(`No owner via any §6.2 getter: \`${id}\` -> ${noOwner[i].status}`));

  const rule = `NEAR-only TVL >= ${usd(COVERAGE_RULE.minUsd)}, excluding DefiLlama categories ${COVERAGE_RULE.excludeCategories.join(', ')} and any category containing "${COVERAGE_RULE.excludeCategorySubstring}"`;
  console.log(`\nCoverage — rule: ${rule} (DefiLlama ${llamaDate})`);
  if (!coverage) console.log(`  unknown — DefiLlama unreachable (${llama.reason})`);
  else {
    const all = covM === covN;
    console.log(`  ${all ? 'All ' : ''}${covM} of ${covN} NEAR DeFi protocols selected by the rule are administered by a Sputnik DAO.`);
    for (const c of covRows) console.log(`    ${c.sputnik ? '✓' : '✗'} ${pad(c.slug, 20)} ${pad(c.category, 16)} ${pad(usd(c.usd), 14)} ${c.sputnik ? c.owner : c.why}`);
    console.log(`  Excluded by the rule (>= ${usd(COVERAGE_RULE.minUsd)}), shown so the filter is visible:`);
    for (const c of coverage.excluded) console.log(`    - ${pad(c.slug, 20)} ${pad(c.category, 16)} ${usd(c.usd)}`);
  }

  console.log(`\n§3.3  auto_update: true — factory can replace the code with no vote`);
  for (const { p, t } of autoTrue) console.log(`    ${pad(p.dao, 32)} ${pad(p.name, 10)} ${t.status === 'ok' ? usd(t.usd) : 'unknown'}`);
  console.log(`    headline: ${headline.status === 'ok' ? usd(headline.usd) : 'unknown'}  (DefiLlama, ${llamaDate}; spec says ${usd(SPEC_HEADLINE)} at ${SPEC_TVL_DATE})`);
  if (ls.status === 'ok') {
    console.log(`\n    NEAR liquid staking (DefiLlama "${LIQUID_STAKING}", NEAR-only, ${llamaDate}): ${usd(ls.usd)}`);
    for (const m of ls.members) console.log(`      ${pad(usd(m.usd), 14)} ${pad(m.slug, 22)}${autoTrue.some((x) => x.p.slug === m.slug) ? 'auto_update: true' : ''}`);
    console.log(`    held by auto_update:true protocols: ${lsTrue.status === 'ok' ? pctFmt(lsTrue.usd / ls.usd) : 'unknown'}`);
  } else console.log(`\n    NEAR liquid staking: unknown (${ls.reason})`);

  console.log(`\n§5  which code these DAOs run`);
  CODE.forEach((c, i) => {
    const id = codes[i];
    const where = id.form === 'global_hash' ? 'global_contract_hash' : id.form === 'global_account' ? 'global_contract_account_id' : id.form === 'local' ? 'code_hash' : id.form;
    const ver = id.versionStatus === 'published' ? `(${id.version}, commit ${id.commit.slice(0, 12)})` : `(${id.versionStatus})`;
    console.log(`    ${pad(c.account, 30)} ${pad(where, 21)} ${pad(short(id.hash ?? id.account), 14)} ${c.account === FACTORY && id.versionStatus === 'unpublished' ? 'factory code: not in its own metadata, commit unknown' : c.account === FACTORY ? `${ver} factory code` : ver}${id.flags.length ? '  ⚠ ' + id.flags.join(', ') : ''}`);
  });
  if (factory.status === 'ok') {
    console.log(`\n    cross-referenced against ${FACTORY} :: get_contracts_metadata:`);
    for (const [h, v] of factory.versions) console.log(`    ${pad(short(h), 14)} ${pad(v.version, 5)} commit ${v.commit?.slice(0, 12)}${h === factory.defaultHash ? '   (= get_default_code_hash)' : ''}`);
  }

  const st = claims.filter((c) => c.kind === 'structural');
  const gh = claims.filter((c) => c.kind === 'github');
  const tv = claims.filter((c) => c.kind === 'tvl');
  const by = (s) => st.filter((c) => c.status === s);
  const [ok, bad, unk] = [by('confirmed'), by('diverged'), by('unverifiable')];
  console.log(`\nClaims: ${claims.length} total = ${st.length} structural (chain) + ${gh.length} GitHub + ${tv.length} TVL`);
  console.log(`Structural, chain (decide the exit code): ${ok.length} confirmed, ${bad.length} diverged, ${unk.length} could not be verified`);
  for (const c of ok) console.log(`  ✓ ${c.section} ${c.what}`);
  for (const c of bad) console.log(`  ✗ DIVERGED ${c.section} ${c.what}\n      spec:    ${JSON.stringify(c.expected)}\n      mainnet: ${JSON.stringify(c.actual)}`);
  for (const c of unk) console.log(`  ? UNKNOWN  ${c.section} ${c.what} — ${c.unknownReason}`);
  const gby = (s) => gh.filter((c) => c.status === s);
  console.log(`GitHub, unauthenticated (decide the exit code, same rules; read ${gh[0]?.readAt ?? 'unknown'}): ${gby('confirmed').length} confirmed, ${gby('diverged').length} diverged, ${gby('unverifiable').length} could not be verified`);
  for (const c of gby('confirmed')) console.log(`  ✓ ${c.section} ${c.what}`);
  for (const c of gby('diverged')) console.log(`  ✗ DIVERGED ${c.section} ${c.what}\n      spec:   ${JSON.stringify(c.expected)}\n      GitHub: ${JSON.stringify(c.actual)}  (${c.url})`);
  for (const c of gby('unverifiable')) console.log(`  ? UNKNOWN  ${c.section} ${c.what} — ${c.unknownReason}`);
  const n = (s) => tv.filter((c) => c.status === s).length;
  console.log(`TVL (warn-only, DefiLlama ${llamaDate}): ${n('read')} read, ${n('moved')} moved >${TVL_DRIFT_WARN * 100}%, ${n('unverifiable')} unknown`);
  for (const c of tv) {
    if (c.status === 'unverifiable') console.log(`  ? ${c.section} ${c.what} — unknown: ${c.unknownReason}`);
    else console.log(`  ${c.status === 'moved' ? '!' : '·'} ${c.section} ${c.what}: ${c.fmt(c.actual)} (spec ${c.fmt(c.expected)})`);
  }
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
