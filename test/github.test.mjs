// github.mjs — I1 (every result carries its URL and read time), I2 (every failed read is unknown,
// never a default). Offline: fetch is injected.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { githubGet } from '../tools/github.mjs';
import { githubReplay, jsonResponse } from './helpers.mjs';

const PR = '/repos/near-daos/sputnik-dao-contract/pulls/233';

test('recorded response: ok, with url and readAt (I1)', async () => {
  const r = await githubGet(PR, { fetch: githubReplay() });
  assert.equal(r.status, 'ok');
  assert.equal(r.url, `https://api.github.com${PR}`);
  assert.ok(!Number.isNaN(Date.parse(r.readAt)));
  assert.equal(r.body.merge_commit_sha, '9e96c75410a97a2ea463ec777d7b14fb446c6f0e');
});

test('no token is ever sent', async () => {
  let seen;
  await githubGet(PR, { fetch: async (url, init) => { seen = init.headers; return jsonResponse({}); } });
  assert.deepEqual(Object.keys(seen).map((k) => k.toLowerCase()).sort(), ['accept', 'user-agent']);
});

const unknownCases = [
  ['network failure', async () => { throw new TypeError('blocked'); }, /network: blocked/],
  ['rate limit, 403 with remaining 0', async () => new Response('{}', { status: 403, headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '1793900000' } }), /rate limit.*403.*resets/],
  ['rate limit, 429', async () => new Response('{}', { status: 429 }), /rate limit.*429/],
  ['404', async () => jsonResponse({ message: 'Not Found' }, 404), /HTTP 404/],
  ['unparseable body', async () => new Response('<html>', { status: 200 }), /unparseable/],
  ['non-object body', async () => jsonResponse(null), /not a JSON object/],
];
for (const [name, fetch, reason] of unknownCases) {
  test(`${name} -> unknown, never a default (I2)`, async () => {
    const r = await githubGet(PR, { fetch });
    assert.equal(r.status, 'unknown');
    assert.match(r.reason, reason);
    assert.equal(r.body, undefined);
  });
}
