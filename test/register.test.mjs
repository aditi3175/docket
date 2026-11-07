// register-view.js / register.html — §8 item 3. Reach: mapped DAOs (§2) by administered value, then
// every other DAO by its own NEAR balance. I5 (labelled a floor), I11 (every DAO a row, unknown kept
// unknown), I10 (balances BigInt), I2 (DefiLlama unread -> unknown, never 0).
// Recorded: graph.json (the 2026-11-07 census) and the DefiLlama snapshot of 2026-11-06.
// SYNTHETIC: the small graph in the ordering test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerRows, rootsOf, nearWhole, FLOOR, MAPPED } from '../web/assets/register-view.js';
import { loadFixture } from './helpers.mjs';

const graph = JSON.parse(readFileSync(new URL('../graph.json', import.meta.url), 'utf8'));
const llama = { status: 'ok', protocols: loadFixture('2026-11-06.defillama.protocols.near.json').body };

test('recorded census: every DAO is a row; the five mapped DAOs first, by administered value; NearX "not valued"', () => {
  const r = registerRows(graph, llama, 3);
  assert.equal(r.rows.length, Object.keys(graph.daos).length);
  assert.equal(r.rows.length, graph.numberDaos);
  assert.deepEqual(r.rows.slice(0, 5).map((x) => x.dao), ['burrow.sputnik-dao.near', 'stnear.sputnik-dao.near', 'linear.sputnik-dao.near', 'ref-finance.sputnik-dao.near', 'stader-nearx.sputnik-dao.near']);
  assert.equal(r.rows[1].administered, '$79,933,156');
  assert.match(r.rows[4].administered, /^not valued/);
  assert.equal(r.rows[1].autoUpdate, 'true');
  assert.match(r.rows[1].roots, /factory's 3 keys/);
  assert.equal(r.floor, FLOOR);
  assert.equal(FLOOR, 'A floor: Docket only knows the protocols it has mapped.');
});

test('I10: the rest are ordered by own balance, BigInt, descending', () => {
  const r = registerRows(graph, llama, 3).rows.slice(MAPPED.length);
  for (let i = 1; i < r.length; i++) {
    const a = graph.daos[r[i - 1].dao].balance; const b = graph.daos[r[i].dao].balance;
    if (/^\d+$/.test(a) && /^\d+$/.test(b)) assert.ok(BigInt(a) >= BigInt(b), `${r[i - 1].dao} before ${r[i].dao}`);
  }
  assert.equal(nearWhole('1999999999999999999999999'), '1');
  assert.equal(nearWhole('unread'), 'unknown');
});

test('I2: DefiLlama unread -> administered value unknown, never $0; order still puts mapped DAOs first', () => {
  const r = registerRows(graph, { status: 'unknown', reason: 'blocked' }, 'unknown');
  assert.ok(r.rows.slice(0, 4).every((x) => /^unknown|^not valued/.test(x.administered)));
  assert.doesNotMatch(JSON.stringify(r.rows.slice(0, 5)), /\$0\b/);
  assert.match(r.rows.find((x) => x.dao === 'stnear.sputnik-dao.near').roots, /factory's \? keys/);
});

test('I11 (SYNTHETIC): unknown buckets stay unknown in the roots column; false says a vote is required', () => {
  assert.equal(rootsOf({ autoUpdate: 'false', keys: { full: 0 }, policy: { alone: [] } }, 3), 'none one hop out (a vote is required)');
  assert.equal(rootsOf({ autoUpdate: 'unread', keys: 'unread', policy: 'unread' }, 3), 'keys unread · policy unread');
  assert.equal(rootsOf({ autoUpdate: 'true', keys: { full: 2 }, policy: { alone: ['a.near'] } }, 3), "factory's 3 keys (auto_update) · 2 full-access keys on the DAO · 1 member alone");
});

test('register.html: says it is a floor, textContent only, no remote script', () => {
  const html = readFileSync(new URL('../web/register.html', import.meta.url), 'utf8');
  assert.match(html, /textContent = FLOOR/);
  assert.doesNotMatch(html, /innerHTML|outerHTML|insertAdjacentHTML|document\.write/);
  assert.doesNotMatch(html, /<script[^>]+src=["']https?:/);
});
