// value.js — valuation. Today: DefiLlama NEAR-only TVL by hardcoded slug (§2).
// FT/native valuation lands with decode.js.
//
// Enforces:
//   I1  every TVL carries its source and the time it was read
//   I2  DefiLlama unreachable, or a slug missing, is 'unknown' — never 0
//
// USD TVL is a DefiLlama float, not a chain base-unit amount, so I10 does not apply to it.
// Sums are rounded to whole dollars once, at the end.

export const DEFILLAMA_PROTOCOLS = 'https://api.llama.fi/protocols';

// NEAR-only means chainTvls.Near: excludes Near-staking / Near-borrowed and other chains.
export function nearTvlFrom(protocols, slug) {
  const p = protocols.find((x) => x.slug === slug);
  if (!p) return { status: 'unknown', slug, reason: 'slug not listed by DefiLlama' };
  const v = p.chainTvls?.Near;
  if (typeof v !== 'number' || !Number.isFinite(v)) return { status: 'unknown', slug, reason: 'no chainTvls.Near' };
  return { status: 'ok', slug, name: p.name, category: p.category ?? null, usd: v };
}

// -> { status:'ok', readAt, protocols } | { status:'unknown', reason, readAt }
export async function fetchDefiLlama({ fetch: f = globalThis.fetch.bind(globalThis), timeoutMs = 30_000 } = {}) {
  const readAt = new Date().toISOString();
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await f(DEFILLAMA_PROTOCOLS, { signal: ctl.signal });
    if (!res.ok) return { status: 'unknown', reason: `HTTP ${res.status}`, readAt };
    const protocols = await res.json();
    if (!Array.isArray(protocols)) return { status: 'unknown', reason: 'unexpected shape', readAt };
    return { status: 'ok', readAt, protocols };
  } catch (e) {
    return { status: 'unknown', reason: ctl.signal.aborted ? `timeout ${timeoutMs}ms` : String(e?.message ?? e), readAt };
  } finally {
    clearTimeout(t);
  }
}

// Sum of NEAR-only TVL; unknown if any term is unknown (a partial sum is not a floor we can label).
export function sumTvl(items) {
  const bad = items.filter((i) => i.status !== 'ok');
  if (bad.length) return { status: 'unknown', missing: bad.map((b) => b.slug) };
  return { status: 'ok', usd: Math.round(items.reduce((s, i) => s + i.usd, 0)) };
}

// NEAR-only TVL of every protocol in one DefiLlama category (exact category string match).
// -> { status:'ok', usd, members:[{slug, usd}] }
export function categoryNearTvl(protocols, category) {
  const members = protocols
    .filter((p) => p.category === category && typeof p.chainTvls?.Near === 'number' && Number.isFinite(p.chainTvls.Near))
    .map((p) => ({ slug: p.slug, usd: p.chainTvls.Near }))
    .sort((a, b) => b.usd - a.usd);
  if (!members.length) return { status: 'unknown', reason: `no NEAR protocols in category "${category}"` };
  return { status: 'ok', usd: Math.round(members.reduce((s, m) => s + m.usd, 0)), members };
}

// §2 coverage rule: NEAR DeFi protocols at or above a NEAR-only TVL floor, excluding categories
// that are custody or chain-level rather than DeFi. Exclusions are returned too, so the filter is
// shown rather than trusted.
export const COVERAGE_RULE = Object.freeze({
  minUsd: 10_000_000,
  excludeCategories: Object.freeze(['CEX', 'Chain']), // exact match
  excludeCategorySubstring: 'Bridge',                  // Bridge, Canonical Bridge, any future *Bridge*
});

export function isExcludedCategory(category, rule = COVERAGE_RULE) {
  return rule.excludeCategories.includes(category) ||
    (typeof category === 'string' && category.includes(rule.excludeCategorySubstring));
}

// -> { included: [{slug,name,category,usd}], excluded: [...] }, each sorted by NEAR TVL desc,
//    both limited to protocols at or above rule.minUsd.
export function applyCoverageRule(protocols, rule = COVERAGE_RULE) {
  const above = protocols
    .filter((p) => typeof p.chainTvls?.Near === 'number' && p.chainTvls.Near >= rule.minUsd)
    .map((p) => ({ slug: p.slug, name: p.name, category: p.category ?? null, usd: p.chainTvls.Near }))
    .sort((a, b) => b.usd - a.usd);
  return {
    included: above.filter((p) => !isExcludedCategory(p.category, rule)),
    excluded: above.filter((p) => isExcludedCategory(p.category, rule)),
  };
}
