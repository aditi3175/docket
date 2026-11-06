// I13 — Docket never signs, and no private key exists anywhere in the repository.
// Checks every tracked file (git ls-files) and the .gitignore that keeps key stores out.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const ROOT = new URL('../', import.meta.url);
const tracked = execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean);

// A NEAR ed25519 secret key is 64 bytes: ~86-88 base58 chars after "ed25519:". Public keys are 32
// bytes (43-44 chars) and are expected (e.g. the factory's three keys in the spec).
const SECRET_KEY = /ed25519:[1-9A-HJ-NP-Za-km-z]{80,90}\b/;
const KEY_FIELDS = /"(private_key|secret_key)"\s*:/;
const SEED = /\b(seed[_ ]?phrase|mnemonic)\b\s*[:=]\s*["'][a-z]+( [a-z]+){11,}/i;

test('I13: no tracked file contains a NEAR secret key, a private_key/secret_key field or a seed phrase', () => {
  const hits = [];
  for (const f of tracked) {
    const text = readFileSync(new URL(f, ROOT), 'utf8');
    if (SECRET_KEY.test(text)) hits.push(`${f}: ed25519 secret-key-length string`);
    if (KEY_FIELDS.test(text)) hits.push(`${f}: private_key/secret_key field`);
    if (SEED.test(text)) hits.push(`${f}: seed phrase`);
  }
  assert.deepEqual(hits, []);
});

test('I13: key stores are gitignored, and none is tracked', () => {
  const ignore = readFileSync(new URL('.gitignore', ROOT), 'utf8').split('\n').map((l) => l.trim());
  for (const p of ['.env', '*.key', '.near-credentials/']) assert.ok(ignore.includes(p), p);
  assert.deepEqual(tracked.filter((f) => /(^|\/)\.near-credentials\/|\.key$|(^|\/)\.env$/.test(f)), []);
});

test('I13: nothing under web/ can sign — no key handling or signing calls', () => {
  const web = tracked.filter((f) => f.startsWith('web/'));
  for (const f of web) {
    const text = readFileSync(new URL(f, ROOT), 'utf8');
    assert.doesNotMatch(text, /KeyPair|fromSecretKey|signTransaction|InMemoryKeyStore|nacl\.sign|ed25519\.sign/, f);
  }
});
