// value.js — I1/I2 for TVL, replaying DefiLlama /protocols recorded 2026-11-05 (NEAR entries).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nearTvlFrom, sumTvl, topByNearTvl, fetchDefiLlama, categoryNearTvl } from '../web/assets/value.js';
import { loadFixture, jsonResponse } from './helpers.mjs';

const protocols = loadFixture('2026-11-05.defillama.protocols.near.json').body;
const SLUGS = ['rhea-lend', 'meta-pool-near', 'rhea-lst', 'linear-protocol', 'rhea-dex'];

test('all five §2 slugs exist and read chainTvls.Near', () => {
  for (const s of SLUGS) {
    const t = nearTvlFrom(protocols, s);
    assert.equal(t.status, 'ok', s);
    assert.equal(t.usd, protocols.find((p) => p.slug === s).chainTvls.Near);
  }
});

test('NEAR-only: rhea-lst excludes Near-staking, meta-pool-near excludes Aurora', () => {
  const lst = protocols.find((p) => p.slug === 'rhea-lst');
  assert.ok('Near-staking' in lst.chainTvls);
  assert.equal(nearTvlFrom(protocols, 'rhea-lst').usd, lst.chainTvls.Near);
  const mp = protocols.find((p) => p.slug === 'meta-pool-near');
  assert.ok(mp.chains.includes('Aurora'));
  assert.equal(nearTvlFrom(protocols, 'meta-pool-near').usd, mp.chainTvls.Near);
});

test('I2: an unlisted slug is unknown, never 0, and makes the sum unknown', () => {
  const t = nearTvlFrom(protocols, 'docket-no-such-slug');
  assert.equal(t.status, 'unknown');
  assert.ok(!('usd' in t));
  assert.equal(sumTvl([nearTvlFrom(protocols, 'rhea-lend'), t]).status, 'unknown');
});

test('name matching would be wrong: "Stader" is a different, non-NEAR protocol', () => {
  const stader = protocols.find((p) => p.slug === 'stader');
  assert.equal(stader.chainTvls.Near, 0);
});

test('categoryNearTvl: "Liquid Staking" on NEAR, exact category match', () => {
  const ls = categoryNearTvl(protocols, 'Liquid Staking');
  assert.equal(ls.status, 'ok');
  assert.deepEqual(ls.members.map((m) => m.slug),
    ['meta-pool-near', 'rhea-lst', 'linear-protocol', 'here-wallet-staking', 'trustake', 'stader']);
  assert.equal(ls.usd, 200_526_770);
  assert.ok(!ls.members.some((m) => m.slug === 'allstake')); // "Restaking" is a different category
  assert.equal(categoryNearTvl(protocols, 'No Such Category').status, 'unknown');
});

test('topByNearTvl is sorted descending', () => {
  const top = topByNearTvl(protocols, 10);
  assert.equal(top.length, 10);
  for (let i = 1; i < top.length; i++) assert.ok(top[i - 1].usd >= top[i].usd);
});

test('I2: DefiLlama down is unknown with a reason and a timestamp (I1)', async () => {
  const down = await fetchDefiLlama({ fetch: async () => jsonResponse({}, 503) });
  assert.equal(down.status, 'unknown');
  assert.match(down.reason, /503/);
  assert.ok(!Number.isNaN(Date.parse(down.readAt)));
  const net = await fetchDefiLlama({ fetch: async () => { throw new TypeError('fetch failed'); } });
  assert.equal(net.status, 'unknown');
});
