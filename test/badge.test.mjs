// badge.js — §18 "fix shipped?". I19: derived from a live read of get_contracts_metadata and
// get_default_code_hash; a new factory build is 'factory-changed', never assumed shipped; an unread
// factory is 'unknown'.
// Recorded: the factory's two reads, replayed from mainnet responses. SYNTHETIC: the changed factory.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRpc } from '../web/assets/rpc.js';
import { fixShipped, badgeFrom, KNOWN_BUILDS } from '../web/assets/badge.js';
import { replayFetch, noSleep } from './helpers.mjs';

test('recorded: the factory as read on mainnet -> not shipped, with the time of the read', async () => {
  const b = await fixShipped(createRpc({ fetch: replayFetch(), sleep: noSleep }));
  assert.equal(b.state, 'not-shipped');
  assert.match(b.text, /^Fix shipped\? No\. .*v3\.2 \(2b0f34a38604\).*PR #233 \(9e96c75410a9\)/);
  assert.match(b.readAt, /^\d{4}-\d\d-\d\dT/);
});

test('I19 (SYNTHETIC): a new build or a new default -> factory-changed, never "shipped"', () => {
  const versions = new Map(KNOWN_BUILDS.map(([h, v, c]) => [h, { version: v, commit: c }]));
  const withNew = new Map(versions); withNew.set('NEWHASH', { version: 'v3.3', commit: 'abcdef123456' });
  const a = badgeFrom({ status: 'ok', versions: withNew, defaultHash: 'NEWHASH' });
  assert.equal(a.state, 'factory-changed');
  assert.match(a.detail, /v3\.3, commit abcdef123456.*9e96c75410a9/);
  assert.doesNotMatch(a.text, /Fix shipped\? Yes/);
  assert.equal(badgeFrom({ status: 'ok', versions, defaultHash: '4zSoHkLjJWZm34Psd4Eq2WUXHELt6LxtKmUXpsZWAECp' }).state, 'factory-changed');
});

test('I19: an unread factory is unknown', async () => {
  const b = await fixShipped(createRpc({ fetch: async () => { throw new TypeError('blocked'); }, sleep: noSleep }));
  assert.equal(b.state, 'unknown');
  assert.equal(badgeFrom({ status: 'ok', versions: new Map(), defaultHash: 'unknown' }).state, 'unknown');
});
