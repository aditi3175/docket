# Docket

**A NEAR account's power is not what it holds. It is what it can change, and who
can change it without asking.**

Docket reads that, for any account on NEAR mainnet, from the chain alone — and
then hands the DAO the one proposal that closes the gap.

**v2.** v1 was a reader. v2 adds **Fix** (a DAO opts out of no-vote upgrades in
one proposal, §16) and a **"fix shipped?"** badge (§18), both on the same chain
reads. **Guard** (an AI delegate that may hold a council seat but cannot vote
past a Docket flag, §17) is a stretch goal, built only if everything else is
done, and cut the moment anything slips.

---

## 0. How to read this document

Every factual claim below came from a command run against NEAR mainnet, GitHub
or DefiLlama, and the command is printed beside it or in the second table below.
Nothing here is modelled, estimated, or remembered. **`tools/verify.mjs` re-runs
some of these claims, not all of them.** The first table lists what it re-runs.
The second lists what is documented but not re-run, each with the command that
reproduces it by hand. TVL figures are not quoted as static dashboard numbers: each one
is dated, and `verify.mjs` re-reads it live from DefiLlama's API
(`api.llama.fi/protocols`, `chainTvls.Near`). Figures marked illustrative are
explanation, dated, and not re-run.

`verify.mjs` reads from three sources and reports each in its own bucket:

| source | claims | decides the exit code |
|---|---|---|
| **chain** (NEAR mainnet RPC, §9) | owners (§2), including that `rhealab.near` has no contract and one full-access key; NearX's owner, walk, and that `get_total_staked_balance` reads as a U128 (§2); `auto_update` (§3.3), the twelve named opt-outs and the demo DAO, each reading `auto_update: false` with its approved opt-out proposal (§3.3, REPORT.md E1, §16.5), the factory's owner and keys and the §6.1 walk from each protocol (§3.4), the §6.1 policy edge of each of the five DAOs (who can pass code or rule changes alone), code identity (§4, §5), the factory's version list and default (§5) | yes: diverged → 1, unknown → 2. NearX's staked NEAR *amount* is warn-only, like TVL |
| **GitHub** (`api.github.com`, unauthenticated) | PR #233 merged and its merge commit; the fix two commits ahead of and none behind the deployed `2b0f34a38604`; both commit dates (§3.4) | yes, same rules; a failed read or rate limit is unknown → 2 |
| **DefiLlama** (`api.llama.fi`) | TVL, the coverage count, the liquid-staking share (§2, §3.3) | no — warn-only |

The chain says which build the factory publishes. GitHub says that build
predates the fix. Neither source alone establishes "the fix is undeployed".

**Documented, not re-run by `verify.mjs`.** These claims were produced by the
commands below, and are as current as the date beside them in the text. A
failure here does not change `verify.mjs`'s exit code, because `verify.mjs`
does not make these reads.

```bash
RPC=https://free.rpc.fastnear.com
viewa(){ curl -s -X POST $RPC -H 'Content-Type: application/json' \
 -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"query\",\"params\":{\"request_type\":\"call_function\",\"finality\":\"final\",\"account_id\":\"$1\",\"method_name\":\"$2\",\"args_base64\":\"$(printf '%s' "$3" | base64 -w0)\"}}" \
 | python3 -c 'import sys,json;r=json.load(sys.stdin)["result"];print(bytes(r["result"]).decode())'; }
SRC=https://raw.githubusercontent.com/near-daos/sputnik-dao-contract
```

| claim class | section | reproduce with |
|---|---|---|
| census: DAO count, resolved count, the `true` / `false` / unknown buckets, the implicit-account `factory_id` outlier | §3.3 | `node tools/crawl.mjs --fresh` (about 25 minutes; writes `graph.json`). By hand: `viewa sputnik-dao.near get_number_daos '{}'`, `viewa sputnik-dao.near get_daos '{"from_index":0,"limit":100}'` (page on), then `viewa <dao> get_factory_info '{}'` on each |
| burrow #1741–#1744 | §7.1 | the `get_proposals` command in §7.1 |
| marmaj #1016 | §7.2 | `viewa marmaj.sputnik-dao.near get_proposal '{"id":1016}'` |
| linear council changes | §7.3 | `viewa linear.sputnik-dao.near get_proposals '{"from_index":0,"limit":100}'` (page on), filter `AddMemberToRole` / `RemoveMemberFromRole` |
| `intents.near` holdings | §2 | `viewa intents.near mt_tokens '{"from_index":"0","limit":10}'`; `viewa wrap.near ft_balance_of '{"account_id":"intents.near"}'`; `viewa usdt.tether-token.near ft_balance_of '{"account_id":"intents.near"}'` |
| deployed `update()` and the `auto_update: true` default | §3.1, §3.2 | `curl -s $SRC/2b0f34a38604/sputnikdao2/src/upgrade.rs` (`internal_get_factory_info` at line 95, `update` at 117) |
| what PR #233 changes (`UpgradeSelf` proposal, `TWO_WEEKS_NS`) | §3.4 | `curl -s $SRC/9e96c75410a9/sputnikdao2/src/upgrade.rs \| grep -n TWO_WEEKS_NS`. `verify.mjs` re-runs where the fix commit sits, not what it contains |
| 17 `ProposalKind` variants and their labels | §6.4 | `curl -s $SRC/2b0f34a38604/sputnikdao2/src/proposals.rs \| sed -n 125,147p` |
| `FactoryInfoUpdate` / `FactoryInfo` shape at v3.0, v3.1, v3.2 | §16.1 | `curl -s $SRC/<commit>/sputnikdao2/src/proposals.rs` and `.../upgrade.rs` at the lines §16.1 names |
| the UIs decode `args` | §12.1 | read the files §12.1 names in `near-daos/sputnik-dao-ui` and `near-daos/astro-ui` |
| figures marked illustrative | §12.7 | not re-run by design |

Several claims in the first draft of this document were **wrong**, and they were
found wrong by running them. They are kept in §12 with what the error was,
because a specification that hides its own corrections is not a specification
anyone should build from.

§16–§18 are new in v2 and describe what will be built, not what has been
measured. §17 is a stretch goal (§14). Any statement there that depends on contract behaviour not yet
exercised on mainnet is marked **[verify]**, and the build order (§14) has a
step that removes each marker by running it. A **[verify]** that survives to
submission is a bug.

---

## 1. The findings

| # | finding | exposure | how it was established |
|---|---|---|---|
| 1 | **4 of 5** NEAR DeFi protocols with ≥ $10M NEAR-only TVL (excluding CEX, Chain and \*Bridge\* categories) are administered by a Sputnik DAO. The fifth, RHEA LST, is administered by **one full-access key** on `rhealab.near` | all 5 named, by rule — dollar figures in §2 | owner resolution across 5 protocols; the rule and every exclusion in §2 |
| 2 | Sputnik's `auto_update` lets the factory replace a DAO's code with **no vote**, and **`true` is the default** | **$126.7M** (DefiLlama, 2026-11-06), plus NearX's 2,553,885 NEAR read on chain; systemic in principle | deployed v3.2 source + on-chain census |
| 3 | The authority path from three private keys to $126.7M (DefiLlama, 2026-11-06) is public. NEAR core fixed it on 2026-03-24 (sputnik-dao-contract PR #233: a two-week delay plus a visible proposal), and **the factory has never shipped the fix** | — | `view_access_key_list` + `get_contracts_metadata` + `get_default_code_hash` + PR #233 (§3.4) |
| 4 | Reading an account's `code_hash` no longer tells you what code it runs | all of NEAR | NEP-591 global contracts |

Finding 2 is the headline. Finding 4 is the one that makes the tool non-trivial
to build correctly, and is the reason the first version of this spec was wrong.

---

## 2. Finding 1 — who administers NEAR DeFi

| protocol | TVL (DefiLlama `chainTvls.Near`, 2026-11-06) | contract (the one DefiLlama's adapter reads) | administered by | resolved via |
|---|---|---|---|---|
| Rhea Lend | $148,139,658 | `contract.main.burrow.near` | `burrow.sputnik-dao.near` | `get_config.owner_id` |
| Meta Pool | $79,933,156 | `meta-pool.near` | `stnear.sputnik-dao.near` | `get_owner_id` |
| RHEA LST | $68,799,804 | `lst.rhealab.near` (rNEAR) | **`rhealab.near` — one full-access key, no contract** | `get_owner_id` |
| LiNEAR | $46,732,391 | `linear-protocol.near` | `linear.sputnik-dao.near` | `get_owner_id` |
| Rhea Dex | $23,000,991 | `v2.ref-finance.near` | `ref-finance.sputnik-dao.near` | `get_owner` |

**$297,806,196 is administered by Sputnik DAOs** (the four DAO rows above,
DefiLlama `chainTvls.Near`, 2026-11-06). The figures are from the recorded
snapshot `test/fixtures/2026-11-06.defillama.protocols.near.json`, which
`npm test` replays and `verify.mjs` re-reads live.

The contract column is the account DefiLlama's own adapter reads
(`DefiLlama-Adapters/projects/`: `burrow.cash`, `metapool`, `rhealst`,
`linear-near`, `reffinance`), so each TVL belongs to the contract beside it.
An earlier version of this table got that wrong for RHEA LST (§12.10).

**RHEA LST is a non-Sputnik no-vote root:** the §6.1 walk from `lst.rhealab.near` ends at one full-access key on `rhealab.near`, with no vote on the path (2026-11-06).

**NearX is Sputnik-administered and not on DefiLlama.** `nearx.stader-labs.near`
is owned by `stader-nearx.sputnik-dao.near` (`get_owner_id`, `auto_update: true`,
§3.3). DefiLlama values no contract for it (its `stader` entry reads $0), so it is
read on chain and stated in NEAR: **2,553,885 NEAR staked** (`get_total_staked_balance`,
block 223289531, 2026-11-06). At $3.6912 per NEAR (coins.llama.fi, 2026-11-06T08:10Z),
that is about $9.4M. That figure is the **on-chain amount × price, not DefiLlama**,
illustrative and not in any total above. `verify.mjs` re-reads the NEAR amount
as a chain claim on every run.

**Coverage.** *4 of 5 NEAR DeFi protocols with ≥ $10M NEAR-only TVL are
administered by a Sputnik DAO; the fifth, RHEA LST, by one key.* The set is
selected by a rule, not a list:

> DefiLlama `/protocols`, NEAR-only TVL (`chainTvls.Near`) ≥ $10,000,000,
> excluding the categories `CEX` and `Chain` (exact) and any category containing
> `Bridge`.

`verify.mjs` applies the rule live, names every protocol it selects with its
owner, and reports "M of N" — a protocol whose contract Docket has not mapped,
whose owner is unreadable, or whose owner does not run factory-published Sputnik
code is named and not counted. No share is stated: the rule picks the
denominator, so any percentage would measure the category boundaries (§12.7).

**Excluded by the rule**, every entry ≥ $10M, so the filter is visible rather
than trusted:

| slug | DefiLlama category | NEAR TVL, 2026-11-06 |
|---|---|---|
| `binance-cex` | CEX | $515,305,177 |
| `near-intents` | Bridge | $98,426,587 |
| `near-bridge` | Canonical Bridge | $46,948,186 |
| `kucoin` | CEX | $19,005,510 |
| `bitget` | CEX | $18,659,641 |
| `gate` | CEX | $16,426,383 |
| `bitfinex` | CEX | $10,610,677 |

`near-intents` is the exclusion that matters. Its category is `Bridge`, but
`intents.near` does hold deposits: it implements the NEP-245 multi-token ledger
(`mt_tokens` lists `nep141:wrap.near`, `nep141:usdt.tether-token.near`, …), and
on 2026-11-05 it held 16,750,153.99 wNEAR (`wrap.near ft_balance_of`, 24
decimals) and 634,981.18 USDt (`usdt.tether-token.near ft_balance_of`, 6
decimals). It is excluded because of its category, not because it is small or
safe. It also cannot be counted either way: `intents.near` and `wrap.near`
expose no owner through any §6.2 getter (all five return `MethodNotFound`;
`verify.mjs` checks both), and are excluded rather than guessed at.

Three different getters appear in five protocols (`get_config.owner_id`,
`get_owner_id` three times, `get_owner`). There is no ownership standard
on NEAR, which is exactly why this table did not exist before. §6.2 handles it.

```bash
RPC=https://free.rpc.fastnear.com
view(){ curl -s -X POST $RPC -H 'Content-Type: application/json' \
 -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"query\",\"params\":{\"request_type\":\"call_function\",\"finality\":\"final\",\"account_id\":\"$1\",\"method_name\":\"$2\",\"args_base64\":\"e30=\"}}" \
 | python3 -c 'import sys,json;r=json.load(sys.stdin)["result"];print(bytes(r["result"]).decode())'; }
view contract.main.burrow.near get_config
view v2.ref-finance.near       get_owner
```

---

## 3. Finding 2 — the vote that can be skipped

### 3.1 The deployed code

From `near-daos/sputnik-dao-contract` at commit `2b0f34a38604`, which the factory
reports as **v3.2** and is the code these DAOs run (§5):

```rust
pub fn update() {
    let factory_info = internal_get_factory_info();
    let current_id = env::current_account_id();
    assert!(
        env::predecessor_account_id() == current_id
            || (env::predecessor_account_id() == factory_info.factory_id
                && factory_info.auto_update),
        "{}", ERR_MUST_BE_SELF_OR_FACTORY
    );
    ...
    let new_contract_code_hash = env::sha256_array(&new_contract_code);
    let promise_id = env::promise_batch_create(&current_id);
    env::promise_batch_action_use_global_contract(promise_id, &new_contract_code_hash);
    env::promise_batch_action_function_call_weight(
        promise_id, "migrate", &[], NO_DEPOSIT, Gas::from_gas(0), GasWeight::default());
    env::promise_return(promise_id);
}
```

Three things matter and all three are easy to get wrong:

1. **`update` is not a proposal kind.** It is a bare function guarded only by that
   assertion. There is no quorum, threshold, council, proposal id or
   `act_proposal`. Nothing a member could vote against, or see coming.
2. **It switches the account to a different *global* contract by hash**
   (`use_global_contract`), batched with a `migrate` call so a failed migration
   reverts the swap. It is not a classic `deploy_contract`.
3. **The caller supplies the code**, and the hash is `sha256` of that input.

### 3.2 `auto_update: true` is the default

The same file:

```rust
/// By design not using contract STATE to allow for upgrade of stuck contracts from factory.
pub(crate) fn internal_get_factory_info() -> FactoryInfo {
    env::storage_read(FACTORY_KEY)
        .map(|value| FactoryInfo::try_from_slice(&value).expect("INTERNAL_FAIL"))
        .unwrap_or_else(|| FactoryInfo {
            factory_id: get_default_factory_id(),   // parsed from the DAO's own name
            auto_update: true,                      // <-- the default
        })
}
```

**A DAO that never explicitly wrote factory info is factory-upgradeable.** This
inverts the finding: the DAOs with `auto_update: true` did not opt *in* to risk,
they failed to opt *out*. The two that are `false` deliberately set it.

That is also the comment's stated intent — to rescue bricked DAOs — which is a
real operational need, not negligence. The problem is not the mechanism. It is
that nobody downstream can see it.

### 3.3 The census

| DAO | administers | value (2026-11-06) | `auto_update` |
|---|---|---|---|
| `stnear.sputnik-dao.near` | Meta Pool | $79,933,156 (DefiLlama) | **true** |
| `linear.sputnik-dao.near` | LiNEAR | $46,732,391 (DefiLlama) | **true** |
| `stader-nearx.sputnik-dao.near` | NearX | 2,553,885 NEAR staked (chain; not on DefiLlama, §2) | **true** |
| `burrow.sputnik-dao.near` | Rhea Lend | $148,139,658 (DefiLlama) | false |
| `ref-finance.sputnik-dao.near` | Rhea Dex + DCL | $23,000,991 (DefiLlama) | false |

**$126,665,546 (DefiLlama, 2026-11-06), Meta Pool plus LiNEAR, is `true`.**
That is 64.4% of NEAR liquid staking. NearX's 2,553,885 NEAR is `true` as well,
and is stated in NEAR because DefiLlama does not value it.

"NEAR liquid staking" is every protocol DefiLlama categorises as `Liquid Staking`,
NEAR-only TVL: $196,547,976 across six entries on 2026-11-06 (`meta-pool-near`,
`rhea-lst`, `linear-protocol`, `here-wallet-staking`, `trustake`, and `stader` at
$0). `rhea-lst` ($68,799,804) is in the denominator and not the numerator: it is
administered by a key, not a Sputnik DAO (§2). `verify.mjs` recomputes the total
and the share live and warns if either moves more than 15%.

**The population census — measured 2026-11-07.** `tools/crawl.mjs` read every DAO
the factory lists, **2,086 of 2,086**, between 10:14 and 10:37 UTC, through
`rpc.js` (§9). The first run left 20 DAOs with a field unread (13 rate limits,
and 7 `get_policy` answers that are not a Sputnik policy, now recorded as
such); the resume re-read them, and none is unread. The output is committed as
`graph.json`; re-running `node tools/crawl.mjs --fresh` regenerates it.
`verify.mjs` does not re-run the crawl (§0). The live counter on `index.html`
re-reads every DAO's `get_factory_info` on demand (I20).

| bucket | count (`graph.json`, read 2026-11-07) |
|---|---|
| `auto_update: true` — factory can replace the code, no vote | **1,607** |
| `auto_update: false` — opted out | **13** |
| no `get_factory_info` (457 on v2.0, 9 on an unpublished global contract) | 466 — **unknown**, never folded into `false` |
| unread | 0 |
| **total (denominator)** | **2,086** |

**99.2% of the DAOs that answer are factory-upgradeable**: 1,607 of the 1,620
that read `true` or `false`. The 466 that have no `get_factory_info` are not
in that ratio, and not in its complement.

**What the 1,607 `true` DAOs run** (`graph.json`, 2026-11-07; denominator
1,607): v3.2 on 743, v3.0 on 727 and v3.1 on 137, each joined to the factory's
own version list (§5).

**A second no-vote path.** In **1,066 of the 1,607** `true` DAOs, some role lets
a single member's approval pass at least one of the 12 code- or rule-changing
kinds (§6.1 policy edge, `graph.json`, 2026-11-07). For those DAOs that member
is a no-vote root alongside the factory's keys. One of the 1,607 has no
`get_policy` answer and is counted as not having such a role.

The census does not measure size or activity: balances, members, proposals
over time. Many of the 1,066 may be small or idle DAOs. The figure says how
the policies are written, not how much they govern.

An earlier crawl, read on or before 2026-11-05 and not in this repository,
resolved 1,786 of 2,065 (279 unread): 1,405 `true`, 12 `false`, 369 without
`get_factory_info`. It was quoted here as illustrative until the census above
replaced it, and it agrees with the census.

The thirteen are the twelve below plus `docket-demo.sputnik-dao.near`, which
Docket created and opted out on 2026-11-06 (§16.5). The twelve exceptions are
the most informative number here, because eight of
them are one organisation. Unlike the counts, each of the twelve was read
individually on 2026-11-06: each reads `auto_update: false`, set by an approved
`FactoryInfoUpdate` (§16.1). Since 2026-11-07 `verify.mjs` re-reads all twelve,
plus the demo DAO (§16.5), on every run: `get_factory_info` and the opt-out
proposal (names and ids: REPORT.md E1). That they are the *only* twelve, apart
from the demo DAO, is what the 2026-11-07 census measured.

```
ref-finance · burrow · ref-labs · rhea-conversion
rhea-lostfound · rhea-ccdfm · rhea-lsd · rhea-airdrop      <- all Rhea/Ref
neardragons · testgfdg · unrlzd · nearlytrade
```

So opting out is achievable, is known, and exactly one team does it as policy.
The DAOs administering Meta Pool, LiNEAR and NearX are not that team. This is what
turns §3.2 from a default-value curiosity into a finding: the safe setting is
reachable and almost nobody reaches it.

One outlier the crawl surfaced and the tool must handle: a DAO whose
`factory_id` is a **64-hex implicit account** rather than `sputnik-dao.near`.
On 2026-11-07 there is exactly one: `c8b26744.sputnik-dao.near`, whose
`factory_id` is
`0b0725e029607729bfcf336e3d9235151de4d9ba5eb7dadc7b53e36ebaa7ac43` —
i.e. a DAO whose code can be replaced by a bare keypair with no named owner at
all. Docket flags a non-`sputnik-dao.near` factory as its own risk class.

**The headline figure remains the five protocols in the table above, each read
individually.** The census is supporting evidence and is always shown with its
denominator and its unknown bucket (I11).

### 3.4 The root

```bash
view sputnik-dao.near get_owner        # -> "sputnik-dao.near"  (self-owned)
curl -s -X POST $RPC -H 'Content-Type: application/json' -d '{"jsonrpc":"2.0","id":1,
 "method":"query","params":{"request_type":"view_access_key_list","finality":"final",
 "account_id":"sputnik-dao.near"}}'    # -> 3 keys, all FullAccess
```

The factory is **self-owned**, so its access keys are its only authority, and it
holds **three full-access keys**. Not a DAO. Not a multisig contract.

```
3 full-access keys on sputnik-dao.near
   └── update(code) → use_global_contract(sha256(code))     [no vote; auto_update]
        └── stnear / linear / stader-nearx .sputnik-dao.near
             └── owner of meta-pool.near, linear-protocol.near, nearx.stader-labs.near
                  └── $126,665,546 of user deposits (DefiLlama, 2026-11-06: Meta Pool + LiNEAR)
                      + 2,553,885 NEAR staked in NearX (chain, 2026-11-06; not on DefiLlama)
```

Every edge is a public view call. `auto_update` is a documented field, the
contract is open source, and the rescue-a-bricked-DAO rationale is sound.

**NEAR core has seen this edge, and has fixed it.**

```bash
gh api repos/near-daos/sputnik-dao-contract/pulls/233 \
  --jq '{user:.user.login,head:.head.ref,merged_at,merge_commit_sha}'
  # -> frol, feat/delay-auto-updates, 2026-03-24T21:43:46Z, 9e96c75410a97a2ea463ec777d7b14fb446c6f0e
gh api repos/near-daos/sputnik-dao-contract/compare/2b0f34a38604...9e96c75410a9 \
  --jq '{status,ahead_by,behind_by}'
  # -> "ahead", 2, 0   (the fix is not in the deployed commit)
view sputnik-dao.near get_default_code_hash
  # -> "DtHZA1mUmGYeScEaUoUZYQGGFHSMpnjMCvkr5U9hJXuF"   (v3.2, commit 2b0f34a38604)
```

PR #233, *"Factory auto-updates should not be applied immediately to counter the
risk of taking control if the factory account is compromised"*, changes
`update()` in `sputnikdao2/src/upgrade.rs`. When the factory starts an update, the DAO
first creates an `UpgradeSelf` proposal for the incoming code hash. The code
deploys only after that proposal has been `InProgress` for at least two weeks
(`TWO_WEEKS_NS`). The fix **delays the upgrade and makes it visible. It does not add a
vote**: after two weeks the code still deploys without one. The gate is skipped
when the DAO's state cannot be read, which is the rescue case.

**The fix has never reached the factory.** The deployed v3.2 build is commit
`2b0f34a38604`, dated 2026-02-25. The fix is commit `9e96c75410a9`, dated
2026-03-24, a month later. `get_contracts_metadata` lists no build after v3.2,
and `get_default_code_hash` still returns v3.2. `verify.mjs` checks both (§5).

So the finding is not that the path is unknown. **An acknowledged,
already-fixed risk is undeployed**, and the depositors at the end of the path
can see neither the risk nor that it was fixed. The prior work was found by
the §14 novelty check, via an external review. §12.9 records what this
paragraph used to say.

**Prior discussion, novelty check part 2 (2026-11-06).** Only pages that were
opened are cited.

- **NEAR governance forum.** `gov.near.org/search.json` for `auto_update`,
  `FactoryInfoUpdate`, `UpgradeSelf`, `sputnik factory upgrade`,
  `auto-update sputnik` and `sputnik-dao-contract 233`. No post discusses the
  Sputnik `auto_update` flag, `FactoryInfoUpdate`, `UpgradeSelf` or PR #233.
  `auto_update` matches only unrelated threads. The one recent hit,
  [*Trezu for NEAR storage*](https://gov.near.org/t/trezu-for-near-storage-security-team-audits-and-real-user-experiences/42679)
  (2026-10-12), asks in general terms whether there are "factory,
  administrator, or emergency powers users should understand", and does not
  name `sputnik-dao.near`.
- **The repository documents the default.** The sputnik-dao-contract
  [README](https://github.com/near-daos/sputnik-dao-contract/blob/main/README.md)
  says of `FactoryInfoUpdate`: "By default, the factory has permission to
  upgrade the DAO, but this can be modified by using `FactoryInfoUpdate`." The
  mechanism is documented. Who is exposed by it, and through which keys, is not.
- **A different, earlier factory bug.** BlockSec found that the factory's
  `update()` had no caller check, so anyone could upgrade any DAO
  ([Odaily, 2022-04-03](https://www.odaily.news/en/post/5177656)). The article
  says that code had not reached mainnet. It was fixed by
  [`518ad1d`](https://github.com/near-daos/sputnik-dao-contract/commit/518ad1d97614fff4b945aba75b6c8bd2483187a2)
  (2022-03-11, "add assert check on update method inside the factory"). That
  check is the `caller_id == self.get_owner() || caller_id == account_id`
  quoted above. It is why the factory's owner, which is its own three keys,
  is the authority today.
- **The repository's issues and PRs.** GitHub search for `auto_update` and
  `FactoryInfoUpdate` returns nothing. `auto update` and `factory compromised`
  return [PR #233](https://github.com/near-daos/sputnik-dao-contract/pull/233),
  whose body and comment thread are both empty.

Not found: any public note of the twelve opt-outs in §3.3, all made between
2026-10-05 and 2026-10-29 (§16.2).

### 3.5 Why publishing this is safe

Publishing enables nothing. The keys are already the authority; naming them
grants no one access. No private key, no unpublished vulnerability and no
exploit primitive appears anywhere in this project. The only thing that changes
is that the people at the end of the chain can see it. §11 covers disclosure,
which happens before the repository is public.

---

## 4. Finding 4 — `code_hash` lies now

This broke the first version of this document and would have broken the product.

`stnear.sputnik-dao.near` returns:

```json
{ "code_hash": "11111111111111111111111111111111",
  "global_contract_hash": "DtHZA1mUmGYeScEaUoUZYQGGFHSMpnjMCvkr5U9hJXuF",
  "storage_usage": 853 }
```

`11111…1` is 32 zero bytes in base58 — the historical "no contract deployed"
marker. **The account runs a contract anyway.** Under NEP-591 global contracts,
code can be published once and *referenced* by many accounts, and the reference
lives in `global_contract_hash` or `global_contract_account_id`, not `code_hash`.
That hash is the factory's `get_default_code_hash`, i.e. Sputnik v3.2.

The two reference forms are not equivalent, and the difference is a security
property:

| form | field | mutability |
|---|---|---|
| by hash | `global_contract_hash` | **immutable** — the code is pinned; nobody can change what that hash means |
| by account | `global_contract_account_id` | **mutable** — whoever controls that account can change the code for *every* account referencing it |

So **"what code does this account run, and who can change it" has three answers
now**, and any tool that reads only `code_hash` gets one of them wrong:

1. local `code_hash` — changeable by a `DeployContract` from the account's own keys
2. `global_contract_hash` — pinned, changeable only by switching the reference
3. `global_contract_account_id` — **changeable by a third party, silently, for everyone**

Docket must resolve all three, and must flag (3) as a shared upgrade path. No
existing NEAR explorer or DAO UI does this.

---

## 5. Which code these DAOs actually run

```
stnear.sputnik-dao.near        global_contract_hash DtHZ…XuF   (v3.2)
stader-nearx.sputnik-dao.near  code_hash 2Zof1Tyy…HnK           (v3.0)
linear.sputnik-dao.near        code_hash 4zSoHkLj…ECp           (v3.1)
burrow.sputnik-dao.near        code_hash 4zSoHkLj…ECp           (v3.1)
ref-finance.sputnik-dao.near   code_hash 4zSoHkLj…ECp           (v3.1)
sputnik-dao.near  (factory)    code_hash BXd5idTX…nnY           factory code: not in its own metadata, commit unknown
```

The factory's own hash is not in `get_contracts_metadata`, which lists DAO
builds only, so nothing on chain joins it to a commit. Docket shows it as
**commit unknown** (I2, I12: "where one exists") and does not guess one.

cross-referenced against `sputnik-dao.near :: get_contracts_metadata`:

```
8RMeZ5cX…ey6N  v2.0   commit c2cf1553b070
8jmhwSkN…krg   v2.1   commit UNOFFICIAL_S…
2Zof1Tyy…HnK   v3.0   commit 86cc77a0808a
4zSoHkLj…ECp   v3.1   commit 3d568f9517a8
DtHZA1mU…XuF   v3.2   commit 2b0f34a38604   (= get_default_code_hash)
```

**Every DAO above runs a code hash the factory published**, which is what makes
the §3.1 source quote binding on them rather than a quote from `main`. Docket
performs this join — hash → factory version → commit — and shows it, because
"this DAO runs v3.1, published at commit 3d568f95" is a far stronger statement
than a bare hash, and it is the only honest way to know which source governs.

---

## 6. What Docket computes

Three things. The base64 decode is **not** one of them (§12.1).

### 6.1 The authority graph — *who can change this without asking*

For an account `A`, the minimal set of keys and accounts that can alter `A`'s
code or rules **without a vote**.

| edge | read from | needs a vote? |
|---|---|---|
| full-access key on `A` | `view_access_key_list` | **no** |
| function-call key on `A` | `view_access_key_list` | no, within its method allowlist |
| `A` uses `global_contract_account_id` | `view_account` | **no** — the publisher can swap it |
| `A` is a Sputnik DAO with `auto_update: true` | `get_factory_info` | **no** — factory `update()` |
| the factory's own keys | recurse on `factory_id` | **no** |
| `A` is a Sputnik DAO, `auto_update: false` | `get_policy` | yes — a `factory_info_update` vote back to `true` under its vote policy, then `UpgradeSelf` (confirmed on mainnet at v3.2, §16.2) |
| a role that can pass a code- or rule-changing kind, where **one member's** approval meets the threshold | `get_policy` | **no** — each member of that role is a root, and the walk follows them |
| a role that can pass it with `k > 1` of `n` approvals | `get_policy` | yes — a vote of `k` of `n`, shown as such |
| `A.owner_id` | §6.2 resolvers | recurse |

**The policy edge** (`policyEdge` in `web/assets/resolve.js`, built on the
`decode.js` permission model). The code- or rule-changing kinds are the 12
rated critical or high in §6.4: `call`, `upgrade_remote`, `upgrade_self`,
`policy` and the four `policy_*` kinds, `add_member_to_role`,
`remove_member_from_role`, `set_vote_token` and `factory_info_update`. For each
one, a role can pass it alone if some role may `AddProposal` it and this role
may `VoteApprove` it (exact, `kind:*`, `*:action` or `*:*`, as in
`can_execute_action`). Sputnik checks each role against its own threshold
(`proposal_status`), so roles are evaluated one at a time:
`k = max(quorum, to_weight(group size))`, where `Ratio(a, b)` gives
`min(a·n/b + 1, n)` and `Weight(w)` gives `min(w, n)`, using the per-kind
`vote_policy` if one is set. Two cases from the source decide what counts:

- **An `Everyone` role never counts.** `proposal_status` skips it
  (`RoleKind::Everyone => continue`: policy.rs:409 at v3.0 and v3.1, which are
  byte-identical, and :405 at v3.2). Its members can vote, but those votes
  never pass anything.
- **A token-weighted role (`TokenWeight`, or a `Member` role) is not decided
  here.** Its threshold depends on token supply. The walk reports it as
  unknown (I2), so it is never counted as no root.

On 2026-11-06, none of the five DAOs on the §2 paths lets one member change
code or rules alone. `verify.mjs` checks each as a chain claim: `stnear`
council 3 of 4, and `linear`, `burrow`, `ref-finance` and `stader-nearx`
councils 3 of 5. In `stader-nearx`, five of the 12 kinds, including
`factory_info_update`, cannot even be proposed (§16.2).

Output: the no-vote root set, with every edge above evaluated
(`WALK_NOT_EVALUATED` is empty). It is complete only for on-chain authority:
it is blind to key custody and multisig-by-convention (§13), and it becomes
unknown, not smaller, when a read fails or a role is token-weighted. For
`meta-pool.near` it is three keys on `sputnik-dao.near`, plus a 3-of-4 council
vote that is a vote, not a root. Terminates on a locked account, a self-owned
cycle, or depth 6.

### 6.2 The ownership graph — *what does this control, and what is it worth*

There is no ownership standard, so an owner is resolved by trying, in order, and
taking the first that yields an account id:

```
get_owner           -> AccountId
get_owner_id        -> AccountId
get_config          -> .owner_id | .owner | .owner_account_id | .admin_id
get_metadata        -> .owner_id
get_contract_state  -> .owner_id
```

§2 uses three of them across five protocols. `get_metadata` and
`get_contract_state` stay in the order, but no §2 protocol needs them as of
2026-11-06.

Candidate contracts come from three unioned sources:

1. **DefiLlama** `/protocols` filtered to NEAR — supplies valuation.
2. **The DAO's own proposal history** — every `FunctionCall.receiver_id`,
   `UpgradeRemote.receiver_id` and `Transfer.token_id` it has ever addressed.
   Highest signal, and free: it comes from `get_proposals`, already being read.
3. A seed list of known NEAR protocol accounts.

**This is a reachability graph, not a proof of exhaustiveness.** Docket may say
"controls at least these, worth at least this." It may never say "and nothing
else." The UI states this on the same screen, not in a footnote.

### 6.3 The semantic layer — *what does this proposal actually do*

The decoders exist (§12.1). What does not exist, anywhere, is the context that
makes a decoded argument mean something. For every proposal Docket resolves:

- **the target**: what `receiver_id` is, who owns it, what it is worth, and
  whether it is inside this DAO's own control set
- **the amounts**: through `ft_metadata` decimals, in BigInt, never assumed 24
- **the code**: `UpgradeRemote`/`UpgradeSelf` hashes joined to factory versions
  and commits (§5), and diffed against the target's live hash
- **the reach**: for `FunctionCall`, that it can call *any* method on *any*
  contract, including another DAO's `act_proposal`
- **the authority delta**: for the nine policy/role kinds, who could pass what
  before and after. The nine are `ChangePolicy`,
  `ChangePolicyUpdateDefaultVotePolicy`, `ChangePolicyUpdateParameters`,
  `ChangePolicyAddOrUpdateRole`, `ChangePolicyRemoveRole`, `AddMemberToRole`,
  `RemoveMemberFromRole`, `SetStakingContract` (vote weighting) and
  `FactoryInfoUpdate` (`auto_update`). In code: `AUTHORITY_KINDS` in
  `web/assets/decode.js`

### 6.4 The risk taxonomy

Exhaustive over all **17** `ProposalKind` variants in deployed v3.2 — verified
by parsing the enum at commit `2b0f34a38604`, not by listing from memory. Each
kind is gated by a permission string `{kind_label}:{action_label}`, matched with
wildcards `kind:*`, `*:action` and `*:*`. All 17 have an explicit label in
`to_policy_label()` (`sputnikdao2/src/proposals.rs`, lines 125–147 at
`2b0f34a38604`). None falls through to a default.

| kind | policy label | reaches | risk |
|---|---|---|---|
| `FunctionCall` | `call` | **any method on any contract** | critical |
| `UpgradeRemote` | `upgrade_remote` | another contract's code | critical |
| `UpgradeSelf` | `upgrade_self` | the DAO's own code | critical |
| `ChangePolicy` | `policy` | every future vote | critical |
| `FactoryInfoUpdate` | `factory_info_update` | **`auto_update` itself** | critical |
| `ChangePolicyUpdateDefaultVotePolicy` | `policy_update_default_vote_policy` | every future vote | critical |
| `ChangePolicyUpdateParameters` | `policy_update_parameters` | vote parameters | high |
| `ChangePolicyAddOrUpdateRole` | `policy_add_or_update_role` | who may propose/vote | high |
| `ChangePolicyRemoveRole` | `policy_remove_role` | who may propose/vote | high |
| `AddMemberToRole` | `add_member_to_role` | who may vote | high |
| `RemoveMemberFromRole` | `remove_member_from_role` | who may vote | high |
| `SetStakingContract` | `set_vote_token` | vote weighting | high |
| `Transfer` | `transfer` | treasury | medium |
| `AddBounty` | `add_bounty` | treasury | medium |
| `BountyDone` | `bounty_done` | treasury | medium |
| `ChangeConfig` | `config` | DAO metadata | low |
| `Vote` | `vote` | nothing | none |

`FactoryInfoUpdate` exists, which means **a DAO can vote to hand its own code to
the factory.** Docket treats any proposal of that kind as critical regardless of
its description, and shows the before/after of `auto_update`.

`Transfer` carries a nuance worth getting right: for FT transfers the proposal's
**description is written on-chain as the transfer memo**
(`ft_transfer(receiver, amount, Some(memo))`, where `memo` is the description).
So for this one kind the description is partly binding, and Docket says so
rather than flagging it like the others.

### 6.5 The mismatch classifier

Compares the description against the decoded action. It flags; it never clears.

| check | rule | on #1741/#1743 and #1742/#1744 |
|---|---|---|
| named receiver | account ids in the description must appear in the action, and vice versa | **fires** — neither description names its target |
| sibling collision | two proposals with equal descriptions but different `(receiver_id, method)` | **fires** — on both pairs, which is exactly that shape twice |
| named amounts | numerals in the description must match decoded amounts at the token's decimals | passes |
| silent reach | the action touches a contract the description never mentions | fires |
| cross-organisation | the action targets another DAO (e.g. `act_proposal`) | fires on marmaj #1016 |
| empty assertion | description empty, or under 4 words once UI markers such as Astro's `$$$$$$$$ProposeCustomFunctionCall` are stripped | fires on marmaj #1016, whose description is 3 words: "Solving the Upgrade" |
| authority change | the kind is one of the nine that alter who can pass what: `ChangePolicy`, `ChangePolicyUpdateDefaultVotePolicy`, `ChangePolicyUpdateParameters`, `ChangePolicyAddOrUpdateRole`, `ChangePolicyRemoveRole`, `AddMemberToRole`, `RemoveMemberFromRole`, `SetStakingContract`, `FactoryInfoUpdate` (§6.3) | fires on all nine |

**Severity follows the control set (§6.3); the flag never goes away.** Before
the checks run, `docket.html` resolves the owner (§6.2) of every account the
page's proposals touch. An account owned by this DAO, or the DAO itself, is
inside its control set.

- **Inside:** named receiver and silent reach still fire, at **low**, with the
  note "its own contract, owned by <dao>".
- **Outside**, or if its owner could not be read: they stay **high**.
- **Unchanged by the control set:** sibling collision, and every other check.

On burrow, `contract.main.burrow.near` is inside (its `get_config.owner_id` is
`burrow.sputnik-dao.near`). So #1743/#1744 carry named receiver and silent
reach at low, while #1741/#1742, aimed at `br.private-mainnet.ref-dev-team.near`,
keep them at high. All four keep sibling collision at high.

**A parameter is not a call target.** An account that appears only inside
the arguments is a parameter, such as `token_id` in `update_asset_limit`.
Silent reach notes it at low ("mentions wrap.near in arguments"), whoever owns
it. Silent reach stays high, outside the control set, only for the call
targets: the receiver, and for a `Transfer` the token contract that moves the
funds. (An `ft_transfer` call's receiver *is* that token contract.)

On burrow, this leaves #1737–#1740 (`supplied_limit` changes for one token
each) with low notes only, while #1741/#1742 keep high. `lint.js` takes the
resolved set as `controlled`, and only the severity moves (I9).

**The empty-assertion cutoff is a chosen setting, not a measurement.** "Under 4
words" (`EMPTY_ASSERTION_MIN_WORDS` in `web/assets/lint.js`) is Docket's choice.
It doesn't come from the Sputnik source or from any measured set of
descriptions. It is set so that a bare title fires and a sentence naming its
target does not. On the recorded data, marmaj #1016 has 3 words and fires, and
burrow #1741–#1744 have 6 words each and do not.

**No score.** A single number nobody can audit is the thing this project exists
to argue against.

---

## 7. The evidence, in production

### 7.1 Two pairs of proposals, same words, different target

`burrow.sputnik-dao.near`, the DAO that administers Rhea Lend (§2):

```bash
curl -s -X POST https://free.rpc.fastnear.com -H 'Content-Type: application/json' \
 -d '{"jsonrpc":"2.0","id":1,"method":"query","params":{"request_type":"call_function",
 "finality":"final","account_id":"burrow.sputnik-dao.near","method_name":"get_proposals",
 "args_base64":"'$(printf '{"from_index":1740,"limit":5}' | base64)'"}}'
```

```
#1741  FunctionCall  FAILED    "Set stNEAR(meta-pool.near) supplied_limit to 6M"
       receiver: br.private-mainnet.ref-dev-team.near   method: update_asset_limit
#1742  FunctionCall  FAILED    "Set rNEAR(lst.rhealab.near) supplied_limit to 15.5M"
       receiver: br.private-mainnet.ref-dev-team.near   method: update_asset_limit
#1743  FunctionCall  APPROVED  "Set stNEAR(meta-pool.near) supplied_limit to 6M"
       receiver: contract.main.burrow.near              method: update_asset_limit
#1744  FunctionCall  APPROVED  "Set rNEAR(lst.rhealab.near) supplied_limit to 15.5M"
       receiver: contract.main.burrow.near              method: update_asset_limit
```

**Two pairs**, each with an identical description, method and arguments but
**different target contracts**. In each pair, one proposal pointed at a dev
account and failed, and the other pointed at the live lending contract and
passed. Two pairs make this a repeated pattern rather than a single anecdote,
and both are inputs to §6.5's sibling-collision check. `update_asset_limit` sets a risk
parameter on the live lending market. A decoder shows you the arguments. It does not
tell you that a proposal you approved last week said the same words and went
somewhere else.

### 7.2 A vote cast inside another organisation

`marmaj.sputnik-dao.near` #1016, approved:

```
description: "Solving the Upgrade$$$$$$$$ProposeCustomFunctionCall"
receiver:    creatives.sputnik-dao.near      <- a different DAO
method:      act_proposal
args:        {"id": 433, "action": "VoteApprove"}
```

### 7.3 The authority of the moment

`linear.sputnik-dao.near` (LiNEAR, $46,732,391, DefiLlama 2026-11-06) recently passed `AddMemberToRole` and
`RemoveMemberFromRole` proposals changing its Council — i.e. changing who may
approve future upgrades — including adding `hos-root.sputnik-dao.near`.

---

## 8. The product

Every *read* is a keyless view call. No backend, no key, no account, nothing to
deploy. The two things that write — the opt-out (§16) and the delegate (§17) —
are signed by the user's own wallet or by a key scoped to one method on one
DAO. Docket itself never holds a key (I13).

**Presentation, decided 2026-11-09.** The homepage is a React app in `app/`,
built with Vite to static files in `dist/`. The four tool pages are the plain
`web/*.html` pages, which the build copies in, so every link resolves. Both are
presentation only: every read, rule and figure comes from the dependency-free
modules in `web/assets/`, imported unchanged. No page adds logic of its own,
holds a key or needs a server.

The homepage is a vault. It has one keyhole per full-access key on
`sputnik-dao.near`, counted from the live key read. When the keys turn, the
"DAO vote" light reads bypassed and the door opens on the value at stake. An
`auto_update: false` replay shows the mainnet opt-out test: the update is
rejected and the door stays shut. Below the vault, the census is drawn as one square
per DAO, in three labelled blocks. Each tool page has one diagram of its own, drawn by
`web/assets/diagrams.js` from answers already read: the account path as a tower (the
value on top, each account a floor, the keys as the foundation, a crack from the keys
up to the account), the docket's flags as stamps on each proposal, the register's
administered value as a treemap coloured by `auto_update`, and the opt-out as the
fourth lock beside the factory's three keys, shut only when `get_factory_info` reads
false. Recorded values (`RECORDED`, tested equal to the fixtures) show at once,
labelled as recorded, and live reads replace them as they land. The page's
styles are `web/assets/home.css`, shared with the static `web/index.html`. The
commit before the React switch is tagged `static-site-backup`.

1. **Account report** — any NEAR account: the authority graph, the ownership
   graph, the no-vote root set, and which code it runs (§4/§5). For
   `meta-pool.near` this is the whole finding on one screen.
2. **The docket** — a DAO's proposals with the §6.3 semantic layer and §6.5
   flags.
3. **The register** — every DAO the factory lists (2,086 on 2026-11-07) ranked by **reach**, with `auto_update`,
   code version, and no-vote root count as columns.
4. **Pre-flight lint** — paste a proposal id you are about to vote on, or a
   proposal you are about to submit, and get the same report before you sign.
5. **Opt-out** (§16) — for any DAO with `auto_update: true`, the drafted
   `FactoryInfoUpdate` proposal, what it costs, who must approve it, and a
   button that submits it from the member's wallet.
6. **Fix shipped?** (§18) — one badge: has the factory published a build
   containing PR #233, read live from the factory on every page load.
7. **Guard** (§17, *stretch*) — `@docket/guard`, the same checks as a JS library
   and an MCP server, plus a live delegate on a Docket-owned mainnet DAO. Only
   if §14's stretch row is reached.
8. **The counter**: "DAOs that opted out: 12 → N", with its denominator and
   unknown bucket (I20). `index.html` shows the dated census from the
   committed `graph.json` at once, and recounts from the chain only when the
   reader clicks "Recount from the chain now", which takes about 15 minutes
   under FastNear's rate limit. It is also recounted by `tools/crawl.mjs`, and
   `verify.mjs` re-reads the thirteen opted-out DAOs by name.

---

## 9. Architecture

```
docket/
  app/                    the homepage: React + Vite, presentation only, its own pinned
                          package.json + package-lock.json (the root stays dependency-free)
    src/lib/finding.js    turns web/assets results and onRead events into React state; computes nothing
    src/Home.jsx          the homepage: the vault, the deposits, the keys, the census field, the fix
    vite.config.js        builds to ../dist; copies graph.json and web/'s tool pages and assets in
  dist/                   build output (npm run build), static, ready for Vercel/Netlify; not committed
  web/                    the logic, plain ES modules with no dependencies; and the original static
                          pages, kept until each is replaced in app/
    index.html            the finding, with live numbers
    account.html          the authority + ownership report
    docket.html           a DAO's proposals, decoded and contextualised
    register.html         all DAOs by reach
    assets/
      rpc.js              queue, failover, cache
      resolve.js          owner resolution (§6.2), authority walk (§6.1), code identity (§4/§5)
      decode.js           the 17 kinds + permission model (§6.4)
      lint.js             the classifier (§6.5)
      value.js            DefiLlama + FT/native valuation
      optout.js           §16: drafts FactoryInfoUpdate, reads bond + policy
      wallet.js           §16: wallet connection, pinned ESM import, signs nothing itself
    optout.html           §16: the fix for one DAO
  guard/                  §17 (stretch): npm package @docket/guard
    index.mjs             checkProposal(), checkAccount() — reuses web/assets/*
    mcp.mjs               stdio MCP server exposing the two checks
  agent/                  §17 (stretch): the delegate
    delegate.mjs          poll -> guard -> vote or escalate
    policy.json           what it may approve; everything else escalates
  tools/
    verify.mjs            re-runs the claims §0's first table lists
    crawl.mjs             resumable census -> graph.json
  graph.json              committed crawl output, regenerable
```

**Two layers, two rules.** The logic (`web/assets/`, `tools/`, `guard/`,
`agent/`) has no dependencies and runs in Node 22 or a browser as-is. `node
tools/verify.mjs` and `npm test` need no install. The presentation (`app/`) may
use pinned npm packages (today: React, React DOM, Vite and its React plugin), but it only renders: it imports the logic and never
reimplements a read, a figure or a rule. `test/app.test.mjs` checks four things:
the pins, that the app imports its logic from `web/assets/`, that it renders no
raw HTML and loads no remote fonts or styles, and the copy rules (never "safe";
coral only for no-vote).

**No backend, deliberately.** The claim is that anyone can check this
themselves; a server between reader and chain weakens exactly that. The §18
badge is computed in the reader's browser and by `verify.mjs` from the same
reads; the delegate (§17, stretch) runs wherever its operator runs it. Neither
sits between a reader and the chain. The crawl is
to be committed so a judge sees results instantly, and re-running `crawl.mjs`
regenerates it so they can prove the committed artifact honest. `verify.mjs`
re-runs the claims §0's first table lists, and no others.

**RPC, measured rather than assumed:**

| endpoint | result |
|---|---|
| `free.rpc.fastnear.com` | works; rate-limits under concurrency > ~6 |
| `rpc.mainnet.near.org` | works, but intermittently returns `-429` with a deprecation notice |
| `near.drpc.org` | works |
| `1rpc.io/near` | **does not implement the `query` method at all** |
| `near.blockpi.network`, `near.lava.build`, `rpc.web4.near.page` | need a key, discontinued, or not JSON-RPC |

Failover order: FastNear → `rpc.mainnet.near.org` → `near.drpc.org`. Concurrency
capped at 6 (24 trips the limiter; 6 does not). Backoff, failover, 8s cache for
identical reads. A 429 (HTTP, or `-429` in the body) fails over at once rather
than backing off, and that endpoint moves to the back of the order for 5 s; all
three are still tried before a read is unknown. A first attempt that has not
answered in 2.5 s is treated as stalled and retried with the full 10 s (answers
take 0.3–1.4 s; on 2026-11-09 six first requests to FastNear hung until the 10 s
timeout and held every slot).

**Answers shown before the live read (`memo.js`).** The account and docket pages
draw an answer already read at once and replace it with the live read: one this
browser read in the last 24 h, or, for the pages' own examples, one recorded by
`tools/seed.mjs` into `web/assets/seed.json`. Each is labelled with where it came
from and when it was read (I1); only complete answers are kept or seeded (I2);
amounts come back as BigInt (I10). `test/memo.test.mjs`. **An unreadable account is recorded as unknown and retried,
never counted as a value** — §3.3 depends on that distinction.

---

## 10. Invariants

| # | invariant | enforced by |
|---|---|---|
| I1 | No number is invented; each traces to a call or a named source with a date | `verify.mjs` |
| I2 | A failed read renders as "unknown", never as zero, absent, or false | resolver tests |
| I3 | Code identity reads `code_hash`, `global_contract_hash` **and** `global_contract_account_id` | test against `stnear.sputnik-dao.near` |
| I4 | `global_contract_account_id` is always flagged as a third-party upgrade path | test |
| I5 | The ownership graph is labelled a floor, on screen, never a total | copy test |
| I6 | The authority walk terminates: cycle detection, depth cap 6 | synthetic cycle test |
| I7 | The taxonomy is exhaustive over `ProposalKind`; an unknown variant renders **unknown and dangerous** | synthetic 18th-variant test |
| I8 | Undecodable `args` render as a refusal, never as empty | malformed-base64 test |
| I9 | The classifier flags and never clears; no "safe" verdict and no score | copy test |
| I10 | Amounts use `ft_metadata` decimals and BigInt; `Number` never touches a base-unit value | 6-dp and 24-dp token tests |
| I11 | Census buckets are `true` / `false` / `unknown`, with the denominator shown | crawl test |
| I12 | Every code hash shown is joined to a factory version and commit where one exists | test |
| I13 | Docket never signs. No private key exists anywhere under `web/` or `guard/` | grep test + review |
| I14 | The opt-out screen states both things given up, above the submit button: (a) factory rescue of a bricked DAO; (b) `UpgradeSelf` — upgrading then takes a vote back to `auto_update: true`, the `UpgradeSelf`, and a vote back to `false`, with the no-vote path open in between. (b) is labelled **confirmed on mainnet at v3.2** (§16.2: steps 5 and 9 of the demo-DAO test, §16.5) | copy test |
| I15 | An opt-out is confirmed by re-reading `get_factory_info`, never by the transaction succeeding | `verify.mjs` on the demo DAO |
| I16 | The delegate never votes on a proposal carrying any critical or high flag, any **unknown** (I2/I7/I8), or a kind outside `policy.json` | synthetic proposals, one per flag |
| I17 | The delegate's key is `FunctionCall`, receiver = its one DAO, methods = `["act_proposal"]` | `verify.mjs` reads `view_access_key_list` |
| I18 | *Withdrawn.* It governed an optional LLM layer, which was not built (§17.4). The number is kept so that I19 and I20 keep theirs | — |
| I19 | The "fix shipped?" badge is derived from a live read of the factory's `get_contracts_metadata` and `get_default_code_hash`, never from a stored value or a transaction feed; an unread factory renders **unknown** | test with a synthetic new factory build, and with the factory unreadable |
| I20 | The opted-out counter is always computed from reads, with its denominator and unknown bucket, and never stored as a bare number: from `graph.json`'s per-DAO records (dated), recounted from the chain on demand on `index.html`, by `crawl.mjs`, and, for the thirteen by name, by `verify.mjs` | copy + crawl test |

I7, I9 and I16 are the ones that matter. A security tool that says "safe" is worse
than no tool.

---

## 11. Reporting — the fix is undeployed

Finding 2 concerns $126.7M of live deposits (DefiLlama, 2026-11-06), plus
NearX's 2,553,885 NEAR read on chain (§2). The risk is not
unknown. NEAR core acknowledged it and fixed it in PR #233 (§3.4), and the fix
has never been published to the factory. So this is **reporting, not
disclosure**: Docket reports that an existing fix is undeployed, says who is
exposed until it ships, and gives the opt-out that covers the gap. The aim is
to work with the maintainers, not against them.

1. Write the note: PR #233 and its merge date; the deployed build
   (`2b0f34a38604`) and `get_default_code_hash`, showing the fix is absent; the
   `auto_update: true` default; the three affected DAOs and their TVL; the
   factory's three full-access keys. Include reproduction commands for each.
2. Send it at the same time to the sputnik-dao-contract maintainers (including
   the PR #233 author), NEAR's security contact, Meta Pool, Stader and LiNEAR,
   with a link to the opt-out flow (§16) for each DAO. The note says: *your fix
   is not deployed, these DAOs are affected, and this opt-out works until it
   is.* Every fact in it is a public configuration fact, so no embargo is needed.
   Sending before the repository is public is still the courteous order.
3. Publish at submission with every response included verbatim, including
   "no response".

---

## 12. Corrections — claims that were wrong, and how they were caught

Kept because they are the strongest evidence that the rest was checked.

### 12.1 "Members vote on base64." **Wrong.**

The first draft claimed the UIs leave `args` encoded. They do not.
`near-daos/sputnik-dao-ui`'s `FunctionCallView.tsx` base64-decodes args, pretty-
prints JSON, and classifies binary/text/empty. `near-daos/astro-ui` decodes at
`ViewProposal/helpers.tsx` lines 327, 475 and 563 and handles token decimals.

Caught by reading the repositories instead of trusting a feature request.

**What survives, and is better:** decoding was always the trivial part. A voter
can read `{"token_id":"meta-pool.near","supplied_limit":"6000000000000000000000000000000"}`
and still not know it sets a risk parameter on the Rhea Lend market (TVL in §2), that
`contract.main.burrow.near` is that market, or that proposal #1741 said the
identical words and pointed somewhere else. **The gap is semantic, not
encoding** — which is why §6.1 and §6.2, not the decoder, are the product.

### 12.2 "`stnear.sputnik-dao.near` has no contract." **Wrong.**

Its `code_hash` is 32 zero bytes, which has meant "no contract" for NEAR's whole
history. It runs Sputnik v3.2 by `global_contract_hash`. `verify.mjs` had this
bug. Caught by noticing that a contract-less account was answering view calls —
i.e. by disbelieving a reading that contradicted another reading. Became §4.

### 12.3 "`rpc.mainnet.near.org` is deprecated and dead." **Overstated.**

It returns `-429` with a deprecation notice under load and serves correctly
otherwise. Meanwhile `1rpc.io/near` — which the first draft listed as a healthy
fallback — **does not implement `query` at all**.
Caught by calling all seven endpoints instead of trusting a list.

### 12.4 "Three protocols chose `auto_update: true`." **Backwards.**

`true` is the default when `FACTORY_KEY` is unset. They did not opt in; the two
`false` DAOs opted out. Caught by reading `internal_get_factory_info` rather than
only `update`. This made the finding systemic.

### 12.5 "The ownership table came from `upgrade.rs` on `main`." **Insufficient.**

`main` is not what these accounts run. Now pinned to the deployed commit
`2b0f34a38604` and joined through `get_contracts_metadata` (§5).

### 12.6 The census was reported from a partial read. **Fixed.**

An early run resolved 666 of 2,065 and would have been quoted as a percentage of
everything. 1,399 were rate-limit failures, not data. `crawl.mjs` is now
resumable and separates `unknown` from `false` (I11).

### 12.7 "79% of $486.4M." **No stated denominator.**

79% / $486.4M had no stated denominator. The old denominator minus the old
numerator is $101,834,700, within $2K of `near-intents`' NEAR TVL on 2026-11-05
($101,833,038), so it was probably "the five plus NEAR Intents" — but it never
said so, which is the error.

**How it was resolved: the share was dropped.** Any percentage here depends on
where the category boundaries fall, and moving one boundary moves the answer
across the whole range. On the 2026-11-05 snapshot: DefiLlama's literal top 10 is
dominated by `binance-cex`; keeping `near-bridge` (category `Canonical Bridge`,
not `Bridge`) gives 88.9% (illustrative, 2026-11-05 snapshot, not checked by
`verify.mjs`); excluding every `*Bridge*` category gives 100% (illustrative,
2026-11-05 snapshot, not checked by `verify.mjs`) — by
construction, because the rule then selects exactly the five protocols being
measured. A number that the choice of filter decides is not a finding.
Both percentages were also computed with the RHEA LST mapping that §12.10
corrects. They are kept as the record of what was said, not recomputed.

It is replaced by two things `verify.mjs` recomputes live: the **coverage claim**
("All N of N NEAR DeFi protocols ≥ $10M, excluding CEX, Chain and \*Bridge\*, are
administered by a Sputnik DAO", reported as "M of N" with names when short), and
the **exclusion list** beside it, so a reader sees what the filter removed —
including `near-intents`, which holds deposits and is excluded only by category
(§2).

Caught by trying to make `verify.mjs` recompute it and finding nothing to
recompute it from; the replacement was caught by noticing that the rule's 100%
was circular.

### 12.8 "$206.5M." **A stale constant.**

The headline was DefiLlama on 2026-11-03, written into the text as a number.
`verify.mjs` now derives it live: the NEAR-only TVL of every §2 protocol whose
administering DAO reads `auto_update: true` from `get_factory_info` in the same
run. On 2026-11-05 that is $199,412,924 (−3.4%). The structural claim — which
three DAOs, and that they are `true` — is unchanged and verified; the dollar
figure moved. Every $206.5M in this file is now $199.4M, dated, and `verify.mjs`
warns when the live figure moves more than 15% from the spec — a warning about
TVL movement, never a failed claim.

*Superseded by §12.10:* $199.4M was itself wrong, and not because TVL moved. It
counted RHEA LST's TVL against the wrong contract.

### 12.9 "The path has never been assembled, and nothing surfaces it." **Wrong.**

§1 finding 3 said nothing surfaces the path. §3.4 said "the path has never been
assembled". Both were false. NEAR core assembled the path and fixed it:
`near-daos/sputnik-dao-contract` PR #233 (`frol`, branch
`feat/delay-auto-updates`, merged 2026-03-24, merge commit `9e96c75410a9`) adds a
two-week delay and a visible `UpgradeSelf` proposal before a factory auto-update
can deploy.

**What survives, and is stronger:** the dates. The deployed v3.2 is
`2b0f34a38604`, dated 2026-02-25, a month *before* the fix. `get_contracts_metadata`
stops at v3.2, and `get_default_code_hash` still returns it. The fix has never been
published to the factory. The finding changes from "an unseen risk" to "an
acknowledged, fixed risk whose fix is undeployed", and §11 changes from
disclosure to reporting.

Caught by an external review (2026-11-05) that ran the §14 novelty check this
spec had scheduled but not yet completed. Every fact the review supplied was
re-run before it was written here (§3.4 has the commands). The review also caught that §6.4 listed
`ChangePolicyUpdateDefaultVotePolicy` as *(default label)*. It has an explicit
label, `policy_update_default_vote_policy`, at `2b0f34a38604`.

### 12.10 "RHEA LST is `nearx.stader-labs.near`, $69.2M, `auto_update: true`." **Wrong.**

§2 paired DefiLlama's `rhea-lst` entry with `nearx.stader-labs.near`, and so
with `stader-nearx.sputnik-dao.near`. Every figure built on that pairing was
wrong: the $199.4M headline (§3.3, §19), "99.4% of NEAR liquid staking", "All 5
of 5" (§1, §2), and the $69.2M against `stader-nearx` in the draft report.

DefiLlama's RHEA LST adapter
([`projects/rhealst.js`](https://github.com/DefiLlama/DefiLlama-Adapters/blob/main/projects/rhealst.js))
reads one contract, `lst.rhealab.near` (rNEAR), via `get_summary` →
`total_staked_near_amount`. On 2026-11-06 that is 18,797,463 NEAR, about $69.4M
at the day's price, which matches DefiLlama's $68.8M–$69.2M. NearX is a
different contract, and no DefiLlama entry values it.

**What it changes.**

| | was | is (2026-11-06) |
|---|---|---|
| RHEA LST administered by | `stader-nearx.sputnik-dao.near` | `rhealab.near`: no contract, one full-access key |
| finding 1 | All 5 of 5 | **4 of 5** |
| `auto_update: true` headline (DefiLlama) | $199.4M (Nov 5) | **$126,665,546**: Meta Pool + LiNEAR |
| share of NEAR liquid staking | 99.4% | **64.4%** |
| NearX | counted as $69.2M | **2,553,885 NEAR** staked, read on chain; ~$9.4M is on-chain amount × price, not DefiLlama |

**What survives.** Every structural claim. The same three DAOs read
`auto_update: true`, the same three keys reach them, and the fix is still
undeployed. Only the value attached to one of the three DAOs was wrong, and
it was wrong by a factor of seven.

**Why `verify.mjs` did not catch it.** It checked that `nearx.stader-labs.near`
is owned by `stader-nearx`, which is true, and that DefiLlama's `rhea-lst`
has a TVL, which is also true. It never checked that the two belong together.
The pairing was an expectation written into `verify.mjs` with no read behind
it. It has been corrected, not loosened (commit `9a51160`): the RHEA LST row
now names `lst.rhealab.near`, and five structural claims were added, including
NearX as its own on-chain entry.

**How it was caught.** While sourcing a contact for each recipient of the
§11 report, Rhea Finance's audit page described its LST as "rNEAR", and §7.1
already names rNEAR as `lst.rhealab.near`, which is a different contract from
the one §2 named. Reading the DefiLlama adapter settled it. The user then
checked `rhealst.js` independently.

**The lesson, applied.** A TVL is attributed to a contract only by reading
the adapter that produces it. §2's contract column now says so, for all five
rows.

---

## 13. What Docket is not

- **Not an audit.** It reports reachability and disagreement. It never says safe.
- **Not exhaustive on ownership** (§6.2) — a floor, not a total.
- **Not a judgement about intent.** `auto_update` has a legitimate purpose, stated
  in the source. The finding is invisibility, not malice.
- **Not a replacement for AstroDAO.** It drafts exactly one kind of proposal
  (the opt-out) and its delegate votes on exactly one DAO. Everything else is
  read-only.
- **Not an autonomous voter for other people's DAOs.** The delegate runs on a
  DAO Docket created for the demo. Anyone may run it on their own DAO; Docket
  does not offer to.
- **Blind to off-chain authority** — key custody, multisig-by-convention,
  hardware. No chain read reaches those.
- **Static valuation.** DefiLlama TVL is external and point-in-time, shown with
  its date.

---

## 14. Build order

Development closes **14 Nov 2026, 23:59 UTC**. Submission is planned for midday
that day, not the last hour.

| date | deliverable | done when |
|---|---|---|
| Nov 5 | Novelty check: sputnik-dao-contract issues/PRs and NEAR gov forum for `auto_update` / `FactoryInfoUpdate`. RPC layer (§9); owner resolvers; code identity (§4) | §2 regenerates; `stnear` resolves as v3.2 global; prior discussion, if any, cited in §3 |
| Nov 6 | Authority walk (§6.1); `auto_update`; access keys | **gate:** the §3.4 chain prints from `node tools/verify.mjs`, cold. Passed 2026-11-06, then printing $199.4M; the figure was wrong and is now $126.7M (§12.10) |
| Nov 6 | Report sent (§11), with opt-out links | sent, timestamped. **Done 2026-11-06 for 3 of 4** (UTC): NEAR security 09:07 (automated ack), Meta Pool 09:17, Stader 09:20. **LiNEAR pending**: X DMs are verified-only, so another channel is being sought. The opt-out flow isn't built yet (Nov 8), so the report carried the proposal JSON instead of a link. Send log: `REPORT.md` |
| Nov 7 | `decode.js`, `lint.js`; the §6.1 `*:*` / self-sufficient-role edge, using `decode.js` permission matching | I7, I8, I10 hold; fires on #1741/#1743, #1742/#1744 and marmaj #1016; the walk evaluates the policy edge |
| Nov 8 | §16 opt-out; create the demo DAO; opt it out through Docket; then attempt `UpgradeSelf` on it (§16.2) | every §16 **[verify]** removed; I15 passes; counter reads 13; the `UpgradeSelf` outcome recorded. **Done 2026-11-06/07**: demo DAO created and left opted out (§16.5); I15 re-reads after steps 3, 7, 11; §16.2 [verify] removed with mainnet evidence (steps 5 and 9). The §16.1 v3.0 [verify] stays: this test does not exercise it. The §16.3 [verify] was removed 2026-11-07: the Wallet Selector build loads in Chrome with no bundler. The counter reads 13 of 2,086 (census, 2026-11-07, §3.3) |
| Nov 9 | `account.html`, `docket.html`, `optout.html` | a stranger understands §3 without reading this file. **Done 2026-11-07** (IST): `account.html` (the path in words, then drawn, the keys at its end, the value at stake), `docket.html` (proposals decoded and flagged, with the §6.3 control set), `optout.html` (the draft, then I15's re-read). Each was checked in Chrome. The Wallet Selector path loads (§16.3), but no opt-out has been signed through it. Whether a stranger understands §3 is the author's judgement, not a test. Commits: `0a453e0` (account), `402452e` (docket), `1bedb1e` (opt-out), `26f0778` (wallet), `81f0e4c` and `c6095bc` (path diagram, value at stake) |
| Nov 10 | `crawl.mjs` census complete; `register.html`; §18 badge | I19, I20 hold. **Done 2026-11-07** (IST): the census is complete in `graph.json`: 2,086 DAOs, read 2026-11-07 10:14–10:37 UTC, 0 unread (§3.3). `register.html` lists them by reach. The badge on `index.html` reads "not shipped" from a live read (I19, `test/badge.test.mjs`). The counter is computed from the census, and recounted on the reader's click (I20, `test/census.test.mjs`). Commits: `71b402c` (crawl, `graph.json`), `6978ab8` (§3.3 census), `159fb72` (register), `956b8b0` and `2862fc3` (index, badge, counter) |
| Nov 11 | Each of I1–I15, I19, I20 has a test; README; clone into a clean machine and run the README cold | pre-screen would pass. **Done 2026-11-07** (IST): each of I1–I15, I19 and I20 is named by at least one test (`npm test`, 201 passing on 2026-11-09). The README was run cold from fresh clones. The first cold run caught an inline-script error in a page, which `test/pages.test.mjs` now guards against; the second ran clean. Whether a pre-screen would pass is not something Docket can test. Commits: `3f2b6f1` (I1), `be559ca` (I13), `ae3b2d0` (README), `bbcd6e6` (the page-script guard), `b09dd5b` (fixes from the cold run) |
| Nov 12 | Demo video, X post drafted | both reviewed against the README |
| Nov 12–13 | **Stretch, only if every row above is done:** §17 `@docket/guard` + MCP server, then the delegate on the demo DAO | a planted proposal in the #1741/#1743 pattern is declined; one approve and one escalation on mainnet; I16–I18 hold. Otherwise §17 stays unbuilt and its track is not entered (§15) | **Done 2026-11-07/08** (IST): `@docket/guard` (`250ddd8`) and its MCP server (`bbce794`); the delegate and `policy.json` (`ab35362`, `c009e9d`, `62522e4`, `5a56bbd`, `a148641`). On mainnet (§17.5): setup T1–T6 (`7d1507a`, `7613f12`, `ce5ea73`); the delegate's approval of #7 (`4fd9e41`), passed by the human vote (`97aecd6`); the planted #8 escalated with three high flags and no vote (`302f665`). I16 and I17 hold; `verify.mjs` re-reads I17 and both outcomes (`037bbf5`, `4e6db95`). I18 was withdrawn with the LLM layer, which was not built (§17.4) |
| Nov 14 | Submit | repo public, links live, submitted by midday UTC. **Moved to 2026-11-12**: the author submits early, so publication moved from "on or after 2026-11-14" (the report, §11) to 2026-11-12; NEAR security, Stader and Meta Pool were told on 2026-11-12 at 00:52 IST (`REPORT.md`, Follow-up 3) |

The Nov 6 gate stands: if the authority walk does not reproduce the §3.4
chain cold, stop before building anything else. §17 is the first thing cut if
any row slips; it is not moved later to make room.

---

## 15. Submission

- Tracks: **Social Money** (Sputnik DAO is the named primitive; §16 is something
  a community does with it), **Open Innovation**, and **AI Security & Defense**.
  The last is §17: an agent whose only key is a function-call key for one
  method on one DAO, and a policy engine it cannot vote past. It is entered
  because §17 shipped complete before its cutoff (§14). More tracks are more
  chances at one prize, not more prizes.
- Public repo, MIT `LICENSE`, AI-tooling disclosure in the README — all required.
- Demo post on X tagging `@NEARProtocol` with `#NEARHackathon`, saying it was
  built at NEAR HACKATHON, with the video attached (rules re-read 2026-11-10 at
  nearhackathon.com/HACKATHON.md; a hosted demo is a plus, Q-012). The form also
  takes a mainnet payout account, chosen by the author, and its `website` field
  must stay empty. The repo must be public by 2026-11-14 23:59 UTC. The report
  promised publication on or after 2026-11-14; the author submits early, so it
  moved to 2026-11-12, and the recipients were told first (2026-11-12 00:52 IST,
  `REPORT.md`, Follow-up 3). LiNEAR still has no private channel; NEAR security
  was asked to forward the report (Follow-up 2).
- The AI pre-screen checks the repo runs and does what the README says, so the
  README's first command is `node tools/verify.mjs`, and it must print the
  §3.4 chain with no key, no account and no configuration.

---

## 16. Fix — the opt-out

The finding says the safe setting is reachable and almost nobody reaches it
(§3.3). This section makes it one proposal away for a DAO whose policy already
lets some role propose and approve `factory_info_update`, and two proposals away
for a DAO whose policy does not. `stader-nearx.sputnik-dao.near` is the second
kind (§16.2).

The opt-out is not a stopgap that PR #233 will make redundant. Even once the fix
ships, a factory update deploys **with no vote** after its two-week delay
(§3.4). The delay gives members time to notice, not a vote. Setting
`auto_update: false` is the only path that restores a vote: with it,
the DAO's `update()` rejects the factory as caller, so the factory alone can no
longer change the DAO's code.

It also changes how the DAO upgrades itself. **Confirmed on mainnet** at v3.2
(§16.2, the demo-DAO test in §16.5): `UpgradeSelf` also reaches `update()`
through the factory, and an opted-out DAO rejects it the same way. Upgrading an opted-out DAO therefore takes three proposals: a vote back to
`auto_update: true`, then `UpgradeSelf`, then a vote back to `false`. While
`true` is in force, the factory's keys can replace the code with no vote. New
code still needs a proposal the DAO passes, which is the first of the three,
but it does not arrive only through that proposal.

### 16.1 What gets drafted

Sputnik v3.x has a `FactoryInfoUpdate` proposal kind (§6.4) gated by the
`factory_info_update` permission label. Docket drafts it with
`auto_update: false` and the DAO's existing `factory_id` unchanged:

```json
{ "proposal": {
    "description": "Opt out of factory auto-update (Docket). The factory will no longer be able to replace the code of this DAO without a vote.",
    "kind": { "FactoryInfoUpdate": { "factory_info": {
        "factory_id": "sputnik-dao.near", "auto_update": false } } } } }
```

The description has no apostrophe, because the near-cli command (§16.2 item 5)
wraps the JSON in single quotes. That command is for a POSIX shell: Windows
PowerShell 5.1 strips the double quotes inside the JSON before near-cli sees
it. Tested 2026-11-06 with a read-only call, which near-cli rejected with "Data
not in JSON format"; the same call worked in Git Bash.

The shape matches the source at every v3.x build in §5:
`FactoryInfoUpdate { factory_info: FactoryInfo }` with
`FactoryInfo { factory_id: AccountId, auto_update: bool }`. This was checked at
`2b0f34a38604` (v3.2, `proposals.rs:112`, `upgrade.rs:54`), `3d568f9517a8` (v3.1,
`proposals.rs:107`, `upgrade.rs:24`) and `86cc77a0808a` (v3.0,
`proposals.rs:107`, `upgrade.rs:21`). v3.2 adds `#[serde(deny_unknown_fields)]`
to `FactoryInfo`, so the drafter must send exactly these two fields.

**Run on mainnet at v3.1 and v3.2.** Twelve DAOs have passed exactly this
`kind` (read 2026-11-06, `get_proposal` then `get_factory_info`). Each
proposal reads `Approved`, and each DAO now reads `{"factory_id":
"sputnik-dao.near","auto_update":false}`:

| code today | DAO and proposal |
|---|---|
| v3.1 | `ref-finance` #968, `burrow` #1725, `ref-labs` #285, `rhea-conversion` #8, `rhea-lostfound` #2, `rhea-ccdfm` #9, `rhea-airdrop` #13 |
| v3.2 | `rhea-lsd` #4, `neardragons` #0, `testgfdg` #0, `unrlzd` #1, `nearlytrade` #8 |

**Limitation: untested at v3.0.** `stader-nearx.sputnik-dao.near` runs v3.0
(§5). None of the twelve DAOs above does. The source shape is the same at
`86cc77a0808a`, but reading the source is not the same as running it. Docket
cannot run it either: the factory creates only v3.2 DAOs, so a v3.0 test DAO
cannot be made. The drafter picks the shape by the DAO's resolved version and
refuses any version it has not been run against, v3.0 included
(`TESTED_VERSIONS`, `web/assets/optout.js`). For stader-nearx, Docket shows
the refusal and its reason, and drafts no transaction.

### 16.2 What the screen shows, in order

1. The DAO's current `auto_update`, `factory_id` and code version (§5).
2. **What is given up** (I14), both stated above the submit button:
   (a) the factory can no longer rescue this DAO if a migration bricks it;
   (b) `UpgradeSelf` no longer works on its own. Upgrading takes a vote back to
   `auto_update: true`, then `UpgradeSelf`, then a vote back to `false`, and the
   no-vote path is open in between. (b) is labelled *confirmed on mainnet at
   v3.2* (§16.5).

   **Confirmed on mainnet at v3.2; v3.0, v3.1 and the PR #233 fix from the
   source.** The source says the DAO also gives up `UpgradeSelf`. At v3.0
   (`86cc77a0808a`), v3.1 (`3d568f9517a8`), v3.2 (`2b0f34a38604`) and the
   PR #233 fix (`9e96c75410a9`), an approved `UpgradeSelf` runs only
   `upgrade_using_factory`: the DAO calls `factory.update(dao, hash)`, and the
   factory calls the DAO's `update(code)` with **the factory as predecessor**.
   The DAO's `update()` accepts that caller only when `auto_update` is `true`, so
   an opted-out DAO panics with `ERR_MUST_BE_SELF_OR_FACTORY`. No other proposal
   path reaches `update()`: its self-caller branch reads `promise_result(0)`,
   which nothing in the DAO chains, and the direct-deploy `upgrade_self` is dead
   code at v3.0/v3.1 and absent at v3.2. So upgrading an
   opted-out DAO takes three proposals: `FactoryInfoUpdate` to `true`, then
   `UpgradeSelf`, then `FactoryInfoUpdate` to `false`. While `true` is in force, the
   factory's keys can again replace the code with no vote.

   None of the twelve `false` DAOs (§3.3) has an `UpgradeSelf` proposal after
   its opt-out (chain, read 2026-11-06), so the answer comes from
   `docket-demo.sputnik-dao.near` (v3.2, §16.5), as a controlled pair: the same
   `UpgradeSelf` to the code the DAO already runs (`DtHZA1mU…XuF`), with only
   `auto_update` changed between the two.
   - `auto_update: false`, step 5, `772n4ZWMRtmXwsWuVTSP5F1UkbZ27UNyM9SqVzgXnXFS`: the
     `sputnik-dao.near → docket-demo.sputnik-dao.near update` receipt failed with
     `Smart contract panicked: panicked at sputnikdao2/src/upgrade.rs:122:5:
     ERR_MUST_BE_SELF_OR_FACTORY`. The proposal still reads Approved and the bond
     was returned, which is why only the receipts count (I15).
   - `auto_update: true`, step 9, `EZw51V5kCMeCCMsmNw5WqDsSUK8R2CHs4WyeK4jTtB1b`: the same receipt
     succeeded, followed by `UseGlobalContract` + `migrate` on the DAO.
   Checked with `node tools/receipts.mjs <tx> docket-aditi.near --step 5|9`.
3. **Who must approve**: the roles whose permissions match
   `factory_info_update:AddProposal` and `factory_info_update:VoteApprove`
   (with wildcards), and the vote policy that applies, from `get_policy`.

   **If no role matches**, the screen says so before anything else: *this DAO's
   policy lets no one propose or approve an opt-out, so a `policy` proposal
   granting `factory_info_update` has to pass first.* It names the roles whose
   permissions match `policy:AddProposal` and `policy:VoteApprove`, and shows
   two steps, not one. It never drafts a `FactoryInfoUpdate` that no role can
   pass.

   On mainnet: `stader-nearx.sputnik-dao.near` (NearX) is this case.
   `get_policy`, read 2026-11-06, has two roles, `all` (Everyone) and `council`
   (a 5-member Group). Neither holds `*:*`, `*:AddProposal`, `*:VoteApprove`
   or any `factory_info_update:*` permission. `council`'s only wildcard is
   `*:Finalize`. Both roles hold `policy:AddProposal` and `policy:VoteApprove`,
   but only `council`'s approvals can pass the policy change, and it needs 3 of
   5. `all` is an Everyone role, and `proposal_status` never counts Everyone
   votes toward a threshold, at v3.0 (which `stader-nearx` runs) or at any later
   version (§6.1). The screen says so, so that a member does not read `all`'s
   permission as "anyone can pass it".
   By contrast, `stnear` and `linear` give their councils `*:AddProposal` and
   `*:VoteApprove`, so for them it is one proposal.
4. **The cost**: `proposal_bond` from `get_policy`, attached as the deposit
   to `add_proposal`, refundable per the DAO's policy.
5. The submit button. Below it, the equivalent `near-cli` command, for members
   who will not connect a wallet to a page.

### 16.3 Signing

`wallet.js` connects through NEAR Wallet Selector, loaded as a pinned ESM build
so the no-bundler rule holds. Docket builds the transaction; the wallet signs it
(I13).

**Loads without a bundler (checked in Chrome, 2026-11-07).**
`@near-wallet-selector/core`, `modal-ui`, `meteor-wallet`, `here-wallet` and
`intear-wallet`, all at **10.1.4** (the npm `latest` for each, published
2025-12-04), load by dynamic `import()` from `esm.sh` on a page served from
`127.0.0.1`. `setupWalletSelector({ network: 'mainnet' })` initialises with all
three wallet modules available, and the modal lists them. MyNearWallet is
absent: it shut down on 2026-10-31.

- **Cost.** 236 requests to `esm.sh`, about 10.7 s, so the build is fetched
  only when the user clicks "Connect a wallet".
- **Sign-in.** Sign-in passes no `contractId`, so the wallet adds no
  function-call key for Docket.
- **The transaction.** `add_proposal` is built in the 10.1.4
  `FunctionCallAction` shape and converted with the package's own
  `internalActionToNaj`.
- **Trust.** The pin fixes the top-level version. The transitive builds are
  whatever `esm.sh` serves for that version, so `esm.sh` is trusted for this
  one, opt-in step.
- **Not yet run:** a wallet actually signing an opt-out. The `near-cli` path is
  the one run on mainnet (§16.5), and the page says so.

### 16.4 Confirmation

An opt-out counts only when `get_factory_info` on the DAO reads
`auto_update: false` (I15). A passed proposal whose effect cannot be re-read is
shown as **unknown**.

### 16.5 The demo DAO

Docket creates one DAO through `sputnik-dao.near`, reads `auto_update: true` on
it (confirming §3.2 on a fresh account), passes the opt-out through `optout.html`,
and re-reads `false`. `verify.mjs` checks the demo DAO on every run. That DAO
also hosts the delegate, if §17 is built.

**Run log** (mainnet, signed by `docket-aditi.near`, the only council member;
each step checked by re-reading the chain before the next):

| Step | Transaction | On-chain result |
|---|---|---|
| 1 create | `2dB1gehLJV4pghTBhPYRFdi3LqWnx3XdTbVCbTJWLctk` | `docket-demo.sputnik-dao.near` created; `global_contract_hash` `DtHZA1mUmGYeScEaUoUZYQGGFHSMpnjMCvkr5U9hJXuF` (v3.2); `on_create` returned `true`, no refund, the 0.1 NEAR deposit is the DAO's balance; `get_factory_info` → `{"factory_id":"sputnik-dao.near","auto_update":true}`; `get_policy` = council `[docket-aditi.near]` only; 0.0077514 NEAR burnt |
| 2 add #0 | `D3k5f1MrHcVWdCrb4MnHUw2mNvafdC63sxaa1SRbfDNa` | returned `0`; `get_proposal(0)` InProgress, proposer `docket-aditi.near`, kind `{"FactoryInfoUpdate":{"factory_info":{"factory_id":"sputnik-dao.near","auto_update":false}}}`; 0.1 NEAR bond attached; 0.0002255 NEAR burnt |
| 3 approve #0 | `Fx39dSVT61HJ8hfNymAgRqjF8gG9xczPcgF59wu16Vkh` | all receipts succeeded; #0 Approved, `vote_counts` `{"council":["1","0","0"]}`; 0.1 NEAR bond transferred back to `docket-aditi.near`; re-read (I15) at block 223342856: `get_factory_info` → `{"factory_id":"sputnik-dao.near","auto_update":false}`; 0.0003030 NEAR burnt |
| 4 add #1 | `DQDntucBH9jVBWzWQUnbqdr2DL8WmDLFUEAnvT5EDaTN` | returned `1`; `get_proposal(1)` InProgress, kind `{"UpgradeSelf":{"hash":"DtHZA1mUmGYeScEaUoUZYQGGFHSMpnjMCvkr5U9hJXuF"}}`; before-snapshot of `view_account` at block 223343543: `code_hash` `1111…1111`, `global_contract_hash` `DtHZA1mU…XuF`, `storage_usage` 1480, `amount` 0.2 NEAR; 0.0002283 NEAR burnt |
| 5 approve #1 (the test) | `772n4ZWMRtmXwsWuVTSP5F1UkbZ27UNyM9SqVzgXnXFS` | receipts: `docket-aditi.near → DAO act_proposal` ok; `DAO → sputnik-dao.near update {"account_id":"docket-demo.sputnik-dao.near","code_hash":"DtHZA1mU…XuF"}` ok; `sputnik-dao.near → DAO update` (444,088-byte code) **failed**: `Smart contract panicked: panicked at sputnikdao2/src/upgrade.rs:122:5: ERR_MUST_BE_SELF_OR_FACTORY`. `receipts.mjs --step 5`: CONFIRMED. #1 Approved, `vote_counts` `{"council":["1","0","0"]}`; 0.1 NEAR bond transferred back. `view_account` at block 223344863: `code_hash` and `global_contract_hash` unchanged; `amount` 0.2 → 0.1 NEAR (the bond); `storage_usage` 1480 → 1607 (the vote record). Transaction status is `Failure`, because `upgrade_using_factory` ends in `env::promise_return` (`upgrade.rs:177`). 0.0035899 NEAR burnt |
| 6 add #2 | `J3iMTWDAHiRb1EC29sKxuDS9zbzSsmZdcMaV2RX4Cesj` | returned `2`; `get_proposal(2)` InProgress, kind `{"FactoryInfoUpdate":{"factory_info":{"factory_id":"sputnik-dao.near","auto_update":true}}}`; 0.0002281 NEAR burnt |
| 7 approve #2 | `8edVVvLsuD8DPfUWdeNpX7CQLhfFEPs1EUziexKRM6G6` | all receipts succeeded; #2 Approved; bond returned; re-read at block 223348699: `get_factory_info` → `{"factory_id":"sputnik-dao.near","auto_update":true}`; 0.0003055 NEAR burnt |
| 8 add #3 | `FPKu4wXYkodEqzDbadhqW46cvZDJTsdoFW2TWbrZaJ6A` | returned `3`; `get_proposal(3)` InProgress, kind `{"UpgradeSelf":{"hash":"DtHZA1mUmGYeScEaUoUZYQGGFHSMpnjMCvkr5U9hJXuF"}}`; before-snapshot of `view_account` at block 223350304: `1111…1111` / `DtHZA1mU…XuF`, `storage_usage` 2166; 0.0002313 NEAR burnt |
| — #4, accidental | transaction not identified | **An accidental duplicate of step 8.** `get_proposal(4)`: proposer `docket-aditi.near`, the same kind and description as #3, added at block 223351097, about 18 blocks before step 9 executed; the 0.1 NEAR bond is held. Most likely `step8.sh` was re-run. Only the council (one member) can add, so nobody else could have. Caught by `--pre 10`: `get_last_proposal_id = 5 (this add_proposal must create #4)`. Rejected in step 9r; the closing pair moves to id 5 |
| 9 approve #3 (the control) | `EZw51V5kCMeCCMsmNw5WqDsSUK8R2CHs4WyeK4jTtB1b` | `receipts.mjs --step 9` (strict): CONFIRMED. `DAO → sputnik-dao.near update` ok; `sputnik-dao.near → DAO update` (444,088 bytes) **ok** (receipt `AfwLX3iKV4YnKp4T1jtV8tAu3LfqemScwiB9sVGKYQU9`); `DAO → DAO UseGlobalContract + migrate` ok (receipt `CAS4qx737KYBmhWhAQZX9cEESTdXkdkN2DX9a49qonGg`). Transaction status `SuccessValue`. #3 Approved; bond returned. `view_account` at block 223351307: `code_hash` and `global_contract_hash` unchanged (the same code re-applied); `storage_usage` 2166 → 2523; `amount` 0.2 NEAR (#4's bond replaces #3's). 0.0052024 NEAR burnt |

| 9r reject #4 | `2aK2y7wQC6TVQScDP8RttYw9kqA9FMn3PLPS7oyZPtNY` | `VoteReject` on #4: `get_proposal(4)` Rejected, `vote_counts` `{"council":["0","1","0"]}`; the DAO sent 0.1 NEAR back to `docket-aditi.near`; no receipt to `sputnik-dao.near` (nothing executed); 0.0002989 NEAR burnt |
| 10 add #5 | `ARpLsUmRgwfifoYUmQgYPqVuSpBoNnnXpGndyHoFh4jp` | returned `5` (`--pre 10`: last id 5); `get_proposal(5)` InProgress, kind `{"FactoryInfoUpdate":{"factory_info":{"factory_id":"sputnik-dao.near","auto_update":false}}}`; 0.0002326 NEAR burnt |
| 11 approve #5 | `7AaKHUxnCx1XdHUrrfMzHk6xUCMSYz9xm5j5Bi2gy36X` | all receipts succeeded; #5 Approved, `vote_counts` `{"council":["1","0","0"]}`; bond returned; re-read (I15) at block 223357651: `get_factory_info` → `{"factory_id":"sputnik-dao.near","auto_update":false}`. The demo DAO is left opted out; it holds 0.1 NEAR, `storage_usage` 2986, code `1111…1111` / `DtHZA1mU…XuF`; 0.0003100 NEAR burnt |

Final state: proposals #0–#5 read Approved, Approved, Approved, Approved,
Rejected, Approved. `docket-aditi.near` went from 2.242418588 to 2.123279754
NEAR: 0.1 NEAR is the demo DAO's balance, and about 0.0191 NEAR was gas.

**Counter: 13.** The census of 2026-11-07 (§3.3) read every DAO the factory
lists: 13 of 2,086 read `auto_update: false`, and they are exactly the twelve
named in REPORT.md E1 plus the demo DAO. 1,607 read `true`, 466 have no
`get_factory_info` (unknown), and none is unread. `verify.mjs` checks the
thirteen by name on every run, and `index.html` recounts from the chain on
demand (I20).

**§16.2 result.** Steps 5 and 9 are the same `UpgradeSelf` to the same hash,
with only `auto_update` different. With `false`, the factory's `update` call
on the DAO was rejected with `ERR_MUST_BE_SELF_OR_FACTORY`; with `true`, it
ran, followed by `UseGlobalContract` + `migrate`.

Step 5 alone does not settle §16.2. The `UpgradeSelf` targets the code the
DAO already runs, so an unchanged hash is what a successful upgrade would show
as well; the failed receipt is the evidence. Step 9 is the control: the same
`UpgradeSelf` with `auto_update: true`, where that receipt must succeed.

The on-chain description of #0 is `Opt out of factory auto-update(Docket). The
factory will no longer be able to replace the code of this DAO without a vote.`
It is missing the space before `(Docket)`, because the space was lost when the
command was pasted. That is not a mismatch: only the kind is checked (`--pre`
and `act_proposal` both compare the kind, not the description).

---

## 17. Guard — an AI delegate that cannot vote past a flag

> **Stretch.** Built only if every non-stretch row of §14 is done, and cut the
> moment anything slips. Nothing in §1–§16 or §18 depends on it. If it is not
> built, the AI Security & Defense track is not entered (§15).

The track asks how to give AI money without giving it the keys to everything.
For a DAO the equivalent question is how to give an agent a council seat
without giving it the authority path in §3.4.

### 17.1 `@docket/guard`

The same resolver, decoder and linter as the web pages, packaged for Node:

```
checkProposal(daoId, proposalId) -> { kind, target, value, flags[], unknowns[] }
checkAccount(accountId)          -> { codeIdentity, noVoteRoots[], owned[] }
```

There is no `safe` field and no score (I9). `mcp.mjs` exposes both as MCP
tools over stdio, so any MCP-capable agent can call Docket before it acts.

### 17.2 The delegate

- **Seat.** `docket-guard.docket-aditi.near`, added to the demo DAO's
  `council` by an `AddMemberToRole` proposal.

  **After the seat, the council has 2 members, so every proposal needs both
  approvals.** The demo DAO's threshold `[1, 2]` gives min(1·2/2 + 1, 2) = 2
  (`decode.js` `whoCanPass`, which follows `policy.rs`). From then on the
  demo DAO can pass only what the delegate approves, and the delegate approves
  only `policy.json` kinds (§17.3). A `FactoryInfoUpdate` is never one of
  them. **The demo DAO's `auto_update` can therefore never be switched back to
  `true`.** A proposal the delegate refuses cannot be rejected by one member
  either. It stays open until it expires (`proposal_period`, 7 days), and its
  bond comes back with a `Finalize` after that.
- **Key.** One `FunctionCall` access key: receiver = the demo DAO, methods =
  `["act_proposal"]`, a small gas allowance (I17). It cannot transfer, deploy,
  or call any other contract. `act_proposal` takes no deposit, so a function-call
  key can call it. On mainnet, the delegate's first vote did:
  `HnMopqHKJaJ7jJNY4sWkHoYJH6TLwZnVFmNzPh9ur6wZ` (§17.5, T7) was signed by
  `ed25519:6Qzjy94h…`, ran with every receipt `SuccessValue`, and recorded
  `{"docket-guard.docket-aditi.near":"Approve"}` on #7.

  The key is generated into the operator's OS keychain by near-cli; Docket's
  code never handles it (I13). The account is created with a temporary
  full-access key, which is deleted once the function-call key is added. **After
  that, the account's 0.05 NEAR is locked:** with no full-access key, nothing
  can transfer it out, and it only pays the gas for the delegate's votes.

  **What a vote costs.** Each vote prepays `VOTE_GAS` = 30 Tgas
  (`agent/delegate.mjs`). On 2026-11-08 `gas_price` returned `100000000`
  yocto per gas, but the receipt of T7 was bought at `gas_price` `1000000000`.
  That is `min_gas_price` from `EXPERIMENTAL_protocol_config`, and the price
  near-cli used. So sending a vote needs about 0.031 NEAR, in both the balance and
  the key's allowance. That is why 100 Tgas (0.1009 NEAR) could not be sent
  (§17.5, T7).

  What a vote actually spends is only the gas it burns. On T7 the unused part,
  `30662407318791700000000`, came back to the balance. The balance and the
  allowance each fell by exactly the tokens burnt, `257599833004800000000`
  (about 0.00026 NEAR). After T7:
  - allowance `49742400166995200000000`
  - balance `49659738511134600000000`

  The delegate can keep voting while both stay above about 0.031 NEAR.
- **Loop** (`agent/delegate.mjs`). Poll `get_last_proposal_id`. For each new
  proposal, call `checkProposal`. Vote `VoteApprove` only if the kind is in
  `policy.json` and there are no critical or high flags and no unknowns (I16).
  The vote is signed by the delegate's own function-call key, from the keychain;
  `--dry-run` reads and prints the commands instead.

  **It signs offline, with the exact key.** near-cli-rs 0.31.1 `sign-with-keychain`,
  online, signs only with the signer's FullAccess keys from the keychain. It reads
  the account's keys from the network and keeps only `FullAccess` ones
  (`src/transaction_signature_options/sign_with_keychain/mod.rs` at `v0.31.1`).
  The delegate has none (I17), so the first T7 run failed before signing (§17.5).
  So the delegate (`signVote`) does three steps:
  1. Right before signing, it re-reads its keys (I17) and its key's
     `view_access_key`, uncached. That answer gives the nonce and a final block's
     hash and height. The block must be no older than the proposal read, and the
     nonce is the key's current nonce + 1.
  2. It signs `--offline` with `sign-with-keychain --signer-public-key <its
     FunctionCall key>`, which near-cli looks up in the keychain by its exact
     entry name, and writes the signed transaction to `agent/signed/`
     (gitignored).
  3. It decodes that file and sends it (`transaction send-signed-transaction`)
     only if it is exactly the intended vote: signer, key, nonce, receiver, block
     hash, one `act_proposal` call with the checked arguments, and 0 deposit.

  If the send fails, the signed file is kept, its path is logged, and the run
  stops without advancing. The delegate never re-signs a proposal that has a
  signed file waiting; a human sends it or deletes it.

  Otherwise it
  does not vote, and escalates for a human to decide. Every decision, approval
  or escalation, is written to `agent/log/<dao>-<id>.json` with its Docket
  report, and the log is linked from the README.
- **Binding the vote to what was checked.** In v3.2, the version the demo DAO
  runs, `act_proposal(id, action, proposal: ProposalKind, memo)` takes the
  proposal kind as a required argument. It asserts
  `proposal.kind == input_proposal_kind` with `ERR_WRONG_KIND`
  (`sputnikdao2/src/proposals.rs:598,616` at `2b0f34a38604`). On mainnet,
  step 3 of the demo-DAO run (`Fx39dSVT61HJ8hfNymAgRqjF8gG9xczPcgF59wu16Vkh`,
  §16.5) passed the kind and was accepted. So the delegate passes the exact
  kind it analysed, and a vote cannot land on a proposal of a different kind.
  The kind is the only thing compared: the description is not checked
  (§16.5 run log, #0). The rejection of a mismatched kind is known from the
  source only and has not been triggered on mainnet.

### 17.3 `policy.json`

Starts narrow: `ChangeConfig`, and `Transfer` below a fixed cap where the
description's named amount matches the decoded amount (§6.5). Everything in
the critical and high rows of §6.4 is permanently outside it:
`loadPolicy` refuses a `policy.json` that lists one.

**The cap is 0.5 NEAR, native NEAR only. That is a chosen setting, not a
measurement** (`maxYocto` in `agent/policy.json`). The description must name
an amount, and the named-amounts check must not fire.

### 17.4 The optional LLM layer — not built

**Not built.** The plan was a model that compares a description with its
decoded action and can only add flags. It was cut. The delegate decides from
Docket's deterministic checks alone (§6.3–§6.5), and no model is called
anywhere in Docket.

### 17.5 What the demo shows

One routine proposal the delegate approves, and one proposal that copies the
pattern of #1741/#1743 and #1742/#1744 — same description, different receiver — which it refuses
and escalates. Both are mainnet transactions on the demo DAO, linked from the
README.

Both are `Transfer`s of 0.01 NEAR with the description "Send 0.01 NEAR to
docket-aditi.near (Docket test)":

- **The routine one** goes to `docket-aditi.near`. The delegate approves it,
  and the human council member's approval passes it.
- **The planted one** goes to `docket-guard.docket-aditi.near`. Its kind is
  allowed and it is under the cap, so only Docket's checks can refuse it, and
  they do: named receiver, silent reach and sibling collision all fire at high.

The checks were rehearsed with the real decoder, linter and `decide()` before
anything was proposed (`test/delegate.test.mjs`).

The setup and the demo, on mainnet (`tools/guard-setup.mjs`, each step after
its `--pre` check printed PASS):

| Step | Transaction | On-chain result |
|---|---|---|
| T1 create docket-guard | `CvqdjRZH6NBscoETQoyTXNHB3HxzHkZDUMYWJSd7gDEE` | signed by `docket-aditi.near`; FINAL, both receipts `SuccessValue`; `view_account`: `docket-guard.docket-aditi.near` holds `50000000000000000000000` (0.05 NEAR), code hash `11111111111111111111111111111111`; one key, FullAccess `ed25519:2J6p9TXuqff3GS53Kp5UjpWRSDBKy3CjtENW861dyLTH` (ed25519, generated into the keychain) |
| T2 add the delegate key | `AK6yt5vhopdjfnSne2vq7qbatLJZKc8tVbeRQWVGJQjP` | signed by docket-guard's T1 full-access key; FINAL, `SuccessValue`; `view_access_key_list` at block 223527354: exactly 2 keys — FullAccess `ed25519:2J6p9TXu…`, and FunctionCall `ed25519:6Qzjy94hpju5qHvLkth44zbFzCTKjNp5WcUT71DyQALQ` with `receiver_id` `docket-demo.sputnik-dao.near`, `method_names` `["act_proposal"]`, `allowance` `50000000000000000000000` (0.05 NEAR) |
| T3 delete the full-access key | `FuGVSXSs96anEW5dExCS2ARGnUyjSiFXZyanqFsyM4C9` | signed by the FullAccess key it deletes, `ed25519:2J6p9TXu…`; FINAL, `SuccessValue`; `view_access_key_list` at block 223527713: exactly 1 key, FunctionCall `ed25519:6Qzjy94h…`, `docket-demo.sputnik-dao.near`, `["act_proposal"]`, allowance 0.05 NEAR. I17 holds (`--pre T4`: PASS). docket-guard can now do nothing but call `act_proposal` on the demo DAO, and its 0.05 NEAR is locked |
| T4 add #6 (the seat) | `G7ftru1NcybuTXiYUzPo1vjpc1nUES6KomTbUchUeY7P` | signed by `docket-aditi.near`, 0.1 NEAR bond; FINAL, returned `6`; `get_proposal(6)` at block 223528118: InProgress, proposer `docket-aditi.near`, kind `{"AddMemberToRole":{"member_id":"docket-guard.docket-aditi.near","role":"council"}}`, description as sent |
| T5 approve #6 | `9KbSn4Ts4N5zSB5Wchk1WgWvquVrBB81M1ad5inuRPXJ` | FINAL, every receipt `SuccessValue`, including `docket-demo.sputnik-dao.near → docket-aditi.near` Transfer `100000000000000000000000` (the bond back); #6 Approved, `vote_counts` `{"council":["1","0","0"]}`. `get_policy` at block 223528504: council `Group` `["docket-guard.docket-aditi.near","docket-aditi.near"]`, no role `vote_policy`, `default_vote_policy` RoleWeight, quorum 0, threshold `[1,2]` → min(2·1/2 + 1, 2) = **2 of 2**. `get_last_proposal_id` 7 |
| T6 add #7 (the routine Transfer) | `6nQXPhpAMaySKVYZoFmV4vCp9vfNdM3UuKiZd1meh6xu` | signed by `docket-aditi.near`, 0.1 NEAR bond; FINAL, returned `7`; `--pre T7`: #7 InProgress, kind matches, votes `{}` |
| T7, first attempt | none: nothing was signed | the delegate decided `VoteApprove` (no flags, no unknowns). near-cli `sign-with-keychain` found no key: "no access keys found in keychain, trying legacy keychain", then no `~/.near-credentials/mainnet/docket-guard.docket-aditi.near.json`. Online it uses only FullAccess keys (§17.2). The key was in the keychain under the name near-cli looks up. The run had advanced the delegate's state past #7; it was reset to 7, and a failed signature no longer advances it. #7 still had no votes |
| T7, second attempt | none: signed offline, not sent | `signVote` signed `--offline` with `--signer-public-key ed25519:6Qzjy94h…`, nonce `223527283000001`, block `tEFLjjGrz7jGAMSnDFZwoZ8hM5zHnT8bNeA98Sc9Aiv` (223530305). The pre-send check refused it on `args` alone: near-cli re-serialises the JSON args with sorted keys. The check now compares args as key-sorted JSON (keys, values and types still exact); the fixed check passes on that file. The file was deleted unsent; the key nonce stayed `223527283000000`, #7 had no votes, and the state stayed 7 |
| T7, third attempt | none: signed offline, checked, refused by near-cli before sending | signed with nonce `223527283000001`, block `C76ZPjEZg65aWLYZgdj1H34k7eGGz2m85wxV1eszGpVc` (223530928), 100 Tgas prepaid; the pre-send check passed. `send-signed-transaction` refused it: "does not have enough balance (0.0499173383441394 NEAR) to cover TX cost (0.1009200071517965 NEAR)". Re-read: key nonce `223527283000000`, allowance `50000000000000000000000`, balance `49917338344139400000000`, #7 votes `{}`, state 7. The delegate's prepaid gas is now 30 Tgas (`VOTE_GAS`), and the pre-send check requires exactly that. The unsent file was deleted |
| T7 the delegate approves #7 | `HnMopqHKJaJ7jJNY4sWkHoYJH6TLwZnVFmNzPh9ur6wZ` | run by `agent/delegate.mjs` after `--pre T7` PASS: `VoteApprove`, no flags, no unknowns. Signed offline by docket-guard's FunctionCall key `ed25519:6Qzjy94h…`, nonce `223527283000001`, block `HWoN632CbYYybd6mSmF1iPtKkFFNB9KGNd5TCaGP4mqu` (223531247), 30 Tgas; the pre-send check passed. FINAL, receipts `SuccessValue`. The `act_proposal` receipt was bought at gas price `1000000000`; `30662407318791700000000` was refunded to the balance; `257599833004800000000` was burnt in all. Re-read: key nonce `223527283000001`, allowance `49742400166995200000000`, balance `49659738511134600000000`. `get_proposal(7)` at block 223531289: InProgress, `vote_counts` `{"council":["1","0","0"]}`, votes `{"docket-guard.docket-aditi.near":"Approve"}`. Delegate state `{"next":8}`. Log: `agent/log/docket-demo.sputnik-dao.near-7.json` |
| T8 the human approval passes #7 | `41FThx6G6n8osp4bRqtPfvpCa4VRr83Wu6obUosvcG72` | signed by `docket-aditi.near` (`ed25519:D5Nbdgxo…`) after `--pre T8` PASS; FINAL, every receipt successful: `docket-demo.sputnik-dao.near → docket-aditi.near` Transfer `10000000000000000000000` (the 0.01 NEAR), `on_proposal_callback`, then Transfer `100000000000000000000000` (the bond back). `get_proposal(7)` at block 223531601: **Approved**, `vote_counts` `{"council":["2","0","0"]}`, votes from both council members. The demo DAO's balance is `90000000000000000000000` |
| T9 add #8 (the planted Transfer) | `oE8yyRjDfWRLLWj6usvaxiVFawZLHcS9UTZ76v4JGfH` | signed by `docket-aditi.near`, 0.1 NEAR bond, after `--pre T9` PASS; FINAL, returned `8`. `get_proposal(8)` at block 223531770: InProgress, votes `{}`, description "Send 0.01 NEAR to docket-aditi.near (Docket test)" (the same as #7), receiver `docket-guard.docket-aditi.near` |
| the delegate on #8 | none: it does not vote | `node agent/delegate.mjs … --once --dry-run` against the real state and log (an escalation signs nothing, and `--dry-run` guarantees it): **#8 ESCALATE**, with three high flags: `named-receiver` (the description names docket-aditi.near, which the action does not touch), `silent-reach` (the action touches docket-guard.docket-aditi.near, which the description never mentions) and `sibling-collision` (same description as #7, Approved, different target). The kind is allowed and the amount is under the cap, so only Docket's checks refused it. State `{"next":9}`. Log: `agent/log/docket-demo.sputnik-dao.near-8.json` |

---

## 18. Watch — reduced to one badge: "fix shipped?"

The scheduled watcher, its feed and its alert channel are cut. What remains
answers one question: **has the factory published a build containing PR
#233?** It uses reads `verify.mjs` already makes (§0, §5). No scheduler,
no server and no stored state are added.

- **not shipped** — `get_contracts_metadata` is exactly the §5 list, which ends
  at v3.2 (`2b0f34a38604`), and `get_default_code_hash` is v3.2. GitHub's
  compare (§3.4) puts the fix after that commit. Shown with the time of the read.
- **factory changed — re-check** — the metadata list or the default hash differs
  from §5. `verify.mjs` already reports this as a diverged §5 claim (exit 1). A
  new build is not assumed to contain the fix. Whether it does is a question
  for its `commit_id` against `9e96c75410a9`, and until that is answered
  the badge does not say "shipped".
- **unknown** — the factory could not be read (I2, I19).

Shown in two places from the same logic: a line in `verify.mjs`'s output, and a
badge on `index.html` computed in the reader's browser from
`loadFactoryVersions` (`web/assets/resolve.js`).

---

## 19. The sentence

> **$126.7M of NEAR liquid staking (DefiLlama, 2026-11-06) is governed by a vote
> that three keys can skip — and `true` was the default.**

(Meta Pool and LiNEAR. NearX's 2,553,885 NEAR is behind the same three keys, and
is not in the dollar figure because DefiLlama does not value it, §2.)

And what makes it a report rather than an accusation:

> **NEAR core found this and fixed it on 24 March 2026, with a two-week delay and
> a visible proposal. The factory has never shipped the fix. None of the three
> exposed DAOs runs it, and `get_default_code_hash` still returns the February
> build.**

(Not "$126.7M runs the February build". Only `stnear` runs v3.2.
`linear` runs v3.1 and `stader-nearx` runs v3.0 (§5). All three predate the fix.)

And the v2 sentence, once §16.5 is done:

> **Opting out is one proposal. Here it is.**
