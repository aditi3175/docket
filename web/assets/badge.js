// badge.js — §18 "fix shipped?": has the factory published a build containing PR #233? One answer, from
// two live reads (get_contracts_metadata, get_default_code_hash, via resolve.js loadFactoryVersions).
// Shown on index.html (computed in the reader's browser) and as a line in tools/verify.mjs's output.
//
// Enforces:
//   I19  derived from a live read on each call, never from a stored value or a transaction feed; an
//        unread factory is 'unknown'. A changed factory is 'factory-changed', never assumed 'shipped':
//        whether a new build contains the fix is a question for its commit_id against the fix's
//        merge commit, which this badge does not answer.

import { loadFactoryVersions } from './resolve.js';

// §5: the factory's published list, in order, as read 2026-11-05 and re-checked by verify.mjs.
export const KNOWN_BUILDS = Object.freeze([
  ['8RMeZ5cXDap6TENxaJKtigRYf3n139iHmTRe8ZUNey6N', 'v2.0', 'c2cf1553b070'],
  ['8jmhwSkNeAWCRqsr2KoD7d8BzDYorEz3a3iHuM9Gykrg', 'v2.1', 'UNOFFICIAL_S'],
  ['2Zof1Tyy4pMeJM48mDSi5ww2QQhTz97b9S8h6W6r4HnK', 'v3.0', '86cc77a0808a'],
  ['4zSoHkLjJWZm34Psd4Eq2WUXHELt6LxtKmUXpsZWAECp', 'v3.1', '3d568f9517a8'],
  ['DtHZA1mUmGYeScEaUoUZYQGGFHSMpnjMCvkr5U9hJXuF', 'v3.2', '2b0f34a38604'],
]);
export const KNOWN_DEFAULT = 'DtHZA1mUmGYeScEaUoUZYQGGFHSMpnjMCvkr5U9hJXuF'; // v3.2
export const FIX_MERGE_COMMIT = '9e96c75410a9'; // PR #233, merged 2026-03-24 (GitHub, §3.4)

// -> { state: 'not-shipped' | 'factory-changed' | 'unknown', readAt, text, detail }
export function badgeFrom(factory, readAt = new Date().toISOString()) {
  if (!factory || factory.status !== 'ok' || factory.defaultHash === 'unknown') {
    return { state: 'unknown', readAt, text: 'Fix shipped? Unknown: the factory could not be read.', detail: factory?.reason ?? 'get_default_code_hash unread' };
  }
  const now = [...factory.versions].map(([h, v]) => [h, v.version, String(v.commit ?? '').slice(0, 12)]);
  const sameList = JSON.stringify(now) === JSON.stringify(KNOWN_BUILDS);
  if (sameList && factory.defaultHash === KNOWN_DEFAULT) {
    return { state: 'not-shipped', readAt,
      text: `Fix shipped? No. The factory still publishes v3.2 (2b0f34a38604) as its default and lists no later build; PR #233 (${FIX_MERGE_COMMIT}) comes after that commit.`,
      detail: `read ${readAt}` };
  }
  const d = factory.versions.get(factory.defaultHash);
  return { state: 'factory-changed', readAt,
    text: 'Fix shipped? The factory has changed: re-check. A new build is not assumed to contain the fix.',
    detail: `default ${factory.defaultHash} (${d ? `${d.version}, commit ${String(d.commit ?? '').slice(0, 12)}` : 'not in its own list'}); ${now.length} builds listed. Compare its commit with ${FIX_MERGE_COMMIT}.` };
}

export async function fixShipped(rpc, factoryId = 'sputnik-dao.near') {
  return badgeFrom(await loadFactoryVersions(rpc, factoryId));
}
