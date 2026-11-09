// tools/seed.mjs — records, from NEAR mainnet and DefiLlama, the answers the pages open with (their
// examples), into web/assets/seed.json. A page shows a seeded answer at once, labelled "recorded <time>",
// and replaces it with its live read (memo.js). Only complete answers are written (I2); every one
// carries the time it was read (I1); amounts keep BigInt (I10).
//
//   node tools/seed.mjs
import { writeFile } from 'node:fs/promises';
import { createRpc } from '../web/assets/rpc.js';
import { accountReport } from '../web/assets/account-view.js';
import { docketReport } from '../web/assets/docket-view.js';
import { fetchDefiLlama } from '../web/assets/value.js';
import { encode } from '../web/assets/memo.js';

// exactly the inputs the pages offer: the account examples, the docket examples and its default
export const SEED_ACCOUNTS = ['meta-pool.near', 'linear-protocol.near', 'contract.main.burrow.near', 'lst.rhealab.near'];
export const SEED_DOCKETS = [['burrow.sputnik-dao.near', 1741, 4], ['stnear.sputnik-dao.near', null, null]];
export const docketKey = (dao, from, limit) => `${dao}|${from ?? ''}|${limit ?? ''}`;

const rpc = createRpc();
const llama = await fetchDefiLlama();
if (llama.status !== 'ok') { console.error(`DefiLlama unread (${llama.reason}); nothing written`); process.exit(1); }
const seed = { generatedAt: new Date().toISOString(), account: {}, docket: {} };
let skipped = 0;
for (const a of SEED_ACCOUNTS) {
  const readAt = new Date().toISOString();
  const r = await accountReport(rpc, a, { llama });
  if (r.status === 'ok') seed.account[a] = { readAt, report: r }; else { skipped++; console.error(`account ${a}: ${r.status}, not seeded`); }
}
for (const [dao, from, limit] of SEED_DOCKETS) {
  const readAt = new Date().toISOString();
  const r = await docketReport(rpc, dao, from === null ? {} : { from, limit });
  if (r.status === 'ok') seed.docket[docketKey(dao, from, limit)] = { readAt, report: r }; else { skipped++; console.error(`docket ${dao}: ${r.status}, not seeded`); }
}
await writeFile(new URL('../web/assets/seed.json', import.meta.url), encode(seed) + '\n');
console.log(`seed.json: ${Object.keys(seed.account).length} accounts, ${Object.keys(seed.docket).length} dockets, ${skipped} skipped, read ${seed.generatedAt}`);
