// github.mjs — unauthenticated, read-only GitHub REST reads for verify.mjs (§0, §3.4).
//
// Enforces: I1 — every result carries the URL it came from and the time it was read.
//           I2 — any failure (network, timeout, rate limit, non-200, unparseable body) is
//                { status: 'unknown', reason }, never a default value. A rate limit is unknown,
//                not a divergence: GitHub refusing to answer says nothing about the claim.
//
// No token is read or sent, so verify.mjs runs with no account and no config (60 requests/hour
// per IP, GitHub's unauthenticated limit; verify.mjs makes 2).

export const GITHUB_API = 'https://api.github.com';

export async function githubGet(path, { fetch = globalThis.fetch, timeoutMs = 15000 } = {}) {
  const url = `${GITHUB_API}${path}`;
  const readAt = new Date().toISOString();
  const unknown = (reason) => ({ status: 'unknown', url, readAt, reason });
  let res;
  try {
    res = await fetch(url, {
      headers: { accept: 'application/vnd.github+json', 'user-agent': 'docket-verify' },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (e) {
    return unknown(`network: ${e?.message ?? e}`);
  }
  if (res.status === 429 || (res.status === 403 && res.headers.get('x-ratelimit-remaining') === '0')) {
    const reset = Number(res.headers.get('x-ratelimit-reset'));
    return unknown(`GitHub rate limit (HTTP ${res.status})${reset ? `, resets ${new Date(reset * 1000).toISOString()}` : ''}`);
  }
  if (!res.ok) return unknown(`HTTP ${res.status}`);
  let body;
  try { body = await res.json(); } catch { return unknown('unparseable body'); }
  if (body === null || typeof body !== 'object') return unknown('body is not a JSON object');
  return { status: 'ok', url, readAt, body };
}
