# Docket

**A NEAR account's power is not what it holds. It is what it can change, and who
can change it without asking.**

Docket reads that, for any account on NEAR mainnet, from the chain alone — and
then hands the DAO the one proposal that closes the gap.

**v2.** v1 was a reader. v2 adds three layers on the same chain reads: **Fix**
(a DAO opts out of no-vote upgrades in one proposal, §16), **Guard** (an AI
delegate that may hold a council seat but cannot vote past a Docket flag, §17)
and **Watch** (alerts with no server, §18).

---

## 0. How to read this document

Every factual claim below was produced by running a command against NEAR
mainnet, and the command is printed beside it. `tools/verify.mjs` re-runs all of
them and exits non-zero on any divergence. Nothing here is modelled, estimated,
or remembered. TVL figures are not quoted as static dashboard numbers: each one
is dated, and `verify.mjs` re-reads it live from DefiLlama's API
(`api.llama.fi/protocols`, `chainTvls.Near`). Figures marked illustrative are
explanation, dated, and not re-run.

Several claims in the first draft of this document were **wrong**, and they were
found wrong by running them. They are kept in §12 with what the error was,
because a specification that hides its own corrections is not a specification
anyone should build from.

§16–§18 are new in v2 and describe what will be built, not what has been
measured. Any statement there that depends on contract behaviour not yet
exercised on mainnet is marked **[verify]**, and the build order (§14) has a
step that removes each marker by running it. A **[verify]** that survives to
submission is a bug.

---

## 1. The findings

| # | finding | exposure | how it was established |
|---|---|---|---|
| 1 | **All 5 of 5** NEAR DeFi protocols with ≥ $10M NEAR-only TVL (excluding CEX, Chain and \*Bridge\* categories) are administered by a Sputnik DAO | **$382.1M** (2026-11-05) | owner resolution across 5 protocols; the rule and every exclusion in §2 |
| 2 | Sputnik's `auto_update` lets the factory replace a DAO's code with **no vote**, and **`true` is the default** | **$199.4M** (2026-11-05) verified, systemic in principle | deployed v3.2 source + on-chain census |
| 3 | The authority path from three private keys to $199.4M is public. NEAR core fixed it on 2026-03-24 (sputnik-dao-contract PR #233: a two-week delay plus a visible proposal), and **the factory has never shipped the fix** | — | `view_access_key_list` + `get_contracts_metadata` + `get_default_code_hash` + PR #233 (§3.4) |
| 4 | Reading an account's `code_hash` no longer tells you what code it runs | all of NEAR | NEP-591 global contracts |

Finding 2 is the headline. Finding 4 is the one that makes the tool non-trivial
to build correctly, and is the reason the first version of this spec was wrong.

---

## 2. Finding 1 — who administers NEAR DeFi

| protocol | TVL (DefiLlama `chainTvls.Near`, 2026-11-05) | contract | administered by | resolved via |
|---|---|---|---|---|
| Rhea Lend | $158,689,681 | `contract.main.burrow.near` | `burrow.sputnik-dao.near` | `get_config.owner_id` |
| Meta Pool | $80,306,704 | `meta-pool.near` | `stnear.sputnik-dao.near` | `get_owner_id` |
| RHEA LST | $70,553,120 | `nearx.stader-labs.near` | `stader-nearx.sputnik-dao.near` | `get_owner_id` |
| LiNEAR | $48,553,100 | `linear-protocol.near` | `linear.sputnik-dao.near` | `get_owner_id` |
| Rhea Dex | $23,964,823 | `v2.ref-finance.near` | `ref-finance.sputnik-dao.near` | `get_owner` |

**$382,067,428 is administered by Sputnik DAOs** (sum of the rows above,
DefiLlama `chainTvls.Near`, 2026-11-05).

**Coverage.** *All 5 of 5 NEAR DeFi protocols with ≥ $10M NEAR-only TVL are
administered by a Sputnik DAO.* The set is selected by a rule, not a list:

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

| slug | DefiLlama category | NEAR TVL, 2026-11-05 |
|---|---|---|
| `binance-cex` | CEX | $535,049,691 |
| `near-intents` | Bridge | $101,833,038 |
| `near-bridge` | Canonical Bridge | $47,755,516 |
| `bitget` | CEX | $19,200,701 |
| `kucoin` | CEX | $19,158,827 |
| `gate` | CEX | $17,340,693 |
| `bitfinex` | CEX | $11,798,610 |

`near-intents` is the exclusion that matters. Its category is `Bridge`, but
`intents.near` does hold deposits: it implements the NEP-245 multi-token ledger
(`mt_tokens` lists `nep141:wrap.near`, `nep141:usdt.tether-token.near`, …), and
on 2026-11-05 it held 16,750,153.99 wNEAR (`wrap.near ft_balance_of`, 24
decimals) and 634,981.18 USDt (`usdt.tether-token.near ft_balance_of`, 6
decimals). It is excluded because of its category, not because it is small or
safe. It also cannot be counted either way: `intents.near` and `wrap.near`
expose no owner through any §6.2 getter (all five return `MethodNotFound`;
`verify.mjs` checks both), and are excluded rather than guessed at.

Four different getters appear in five protocols. There is no ownership standard
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

| DAO | administers | TVL (DefiLlama, 2026-11-05) | `auto_update` |
|---|---|---|---|
| `stnear.sputnik-dao.near` | Meta Pool | $80,306,704 | **true** |
| `stader-nearx.sputnik-dao.near` | RHEA LST | $70,553,120 | **true** |
| `linear.sputnik-dao.near` | LiNEAR | $48,553,100 | **true** |
| `burrow.sputnik-dao.near` | Rhea Lend | $158,689,681 | false |
| `ref-finance.sputnik-dao.near` | Rhea Dex + DCL | $23,964,823 | false |

**$199,412,924 (DefiLlama, 2026-11-05) — 99.4% of NEAR liquid staking — is `true`.**

"NEAR liquid staking" is every protocol DefiLlama categorises as `Liquid Staking`,
NEAR-only TVL: $200,526,770 across six entries on 2026-11-05 (the three above,
plus `here-wallet-staking`, `trustake` and `stader` at $0). `verify.mjs`
recomputes the total and the share live and warns if either moves more than 15%.

**The population census.** `tools/crawl.mjs` resolved **1,786 of the factory's
2,065 DAOs** (279 unread, resumable — the crawl is paced to stay under the rate
limiter rather than to finish fast):

| bucket | count |
|---|---|
| `auto_update: true` — factory can replace the code, no vote | **1,405** |
| `auto_update: false` — opted out | **12** |
| no `get_factory_info` (pre-v2 contracts) | 369 — **unknown**, never folded into `false` |

**99.2% of the DAOs that answer are factory-upgradeable.**

The twelve exceptions are the most informative number here, because eight of
them are one organisation:

```
ref-finance · burrow · ref-labs · rhea-conversion
rhea-lostfound · rhea-ccdfm · rhea-lsd · rhea-airdrop      <- all Rhea/Ref
neardragons · testgfdg · unrlzd · nearlytrade
```

So opting out is achievable, is known, and exactly one team does it as policy.
The liquid-staking protocols holding $199.4M are not that team. This is what
turns §3.2 from a default-value curiosity into a finding: the safe setting is
reachable and almost nobody reaches it.

One outlier the crawl surfaced and the tool must handle: a DAO whose
`factory_id` is a **64-hex implicit account** rather than `sputnik-dao.near` —
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
        └── stnear / stader-nearx / linear .sputnik-dao.near
             └── owner of meta-pool.near, nearx.stader-labs.near, linear-protocol.near
                  └── $199,412,924 of user deposits (2026-11-05)
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
sputnik-dao.near  (factory)    code_hash BXd5idTX…nnY
```

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
| `A` is a Sputnik DAO, `auto_update: false` | `get_policy` | yes — `upgrade_self` under its vote policy |
| a role with `*:*` and a threshold its group can meet alone | `get_policy` | nominally yes, effectively no |
| `A.owner_id` | §6.2 resolvers | recurse |

Output: the **no-vote root set**. For `meta-pool.near` it is three keys on
`sputnik-dao.near`. Terminates on a locked account, a self-owned cycle, or
depth 6.

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

All five are needed: §2 uses four of them across five protocols.

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
  before and after

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

| check | rule | on #1741/#1743 |
|---|---|---|
| named receiver | account ids in the description must appear in the action, and vice versa | **fires** — neither description names its target |
| sibling collision | two proposals with equal descriptions but different `(receiver_id, method)` | **fires** — this is exactly that pair |
| named amounts | numerals in the description must match decoded amounts at the token's decimals | passes |
| silent reach | the action touches a contract the description never mentions | fires |
| cross-organisation | the action targets another DAO (e.g. `act_proposal`) | fires on marmaj #1016 |
| empty assertion | description empty, boilerplate, or below an entropy floor | fires on marmaj #1016 |
| authority change | the kind alters who can pass what | fires on all nine policy/role kinds |

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

`linear.sputnik-dao.near` ($49.7M) recently passed `AddMemberToRole` and
`RemoveMemberFromRole` proposals changing its Council — i.e. changing who may
approve future upgrades — including adding `hos-root.sputnik-dao.near`.

---

## 8. The product

Every *read* is a keyless view call. No backend, no key, no account, nothing to
deploy. The two things that write — the opt-out (§16) and the delegate (§17) —
are signed by the user's own wallet or by a key scoped to one method on one
DAO. Docket itself never holds a key (I13).

1. **Account report** — any NEAR account: the authority graph, the ownership
   graph, the no-vote root set, and which code it runs (§4/§5). For
   `meta-pool.near` this is the whole finding on one screen.
2. **The docket** — a DAO's proposals with the §6.3 semantic layer and §6.5
   flags.
3. **The register** — all 2,065 DAOs ranked by **reach**, with `auto_update`,
   code version, and no-vote root count as columns.
4. **Pre-flight lint** — paste a proposal id you are about to vote on, or a
   proposal you are about to submit, and get the same report before you sign.
5. **Opt-out** (§16) — for any DAO with `auto_update: true`, the drafted
   `FactoryInfoUpdate` proposal, what it costs, who must approve it, and a
   button that submits it from the member's wallet.
6. **Guard** (§17) — `@docket/guard`, the same checks as a JS library and an
   MCP server, so an agent runs Docket before it signs or votes; plus a live
   delegate agent on a Docket-owned mainnet DAO.
7. **Watch** (§18) — a scheduled re-read of the top DAOs that alerts on new
   critical proposals and on any change to a DAO's code identity.
8. **The counter** — "DAOs that opted out: 12 → N", recomputed from the chain on
   every page load, denominator shown (I20).

---

## 9. Architecture

```
docket/
  web/                    static; no build step, no bundler, no framework
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
  guard/                  §17: npm package @docket/guard
    index.mjs             checkProposal(), checkAccount() — reuses web/assets/*
    mcp.mjs               stdio MCP server exposing the two checks
  agent/                  §17: the delegate
    delegate.mjs          poll -> guard -> vote or escalate
    policy.json           what it may approve; everything else escalates
  tools/
    verify.mjs            re-runs every claim in this file against mainnet
    crawl.mjs             resumable census -> graph.json
    watch.mjs             §18: one watch pass -> feed.json + alerts
  .github/workflows/
    watch.yml             §18: runs watch.mjs on a schedule
  graph.json              committed crawl output, regenerable
```

**No backend, deliberately.** The claim is that anyone can check this
themselves; a server between reader and chain weakens exactly that. Watch (§18)
runs on GitHub's scheduler and publishes static files; the delegate (§17) runs
wherever its operator runs it. Neither sits between a reader and the chain. The crawl is
committed so a judge sees results instantly, and `verify.mjs` re-derives
everything live so they can prove the committed artifact honest.

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
identical reads. **An unreadable account is recorded as unknown and retried,
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
| I14 | The opt-out screen states what is given up (factory rescue of a bricked DAO) above the submit button | copy test |
| I15 | An opt-out is confirmed by re-reading `get_factory_info`, never by the transaction succeeding | `verify.mjs` on the demo DAO |
| I16 | The delegate never votes on a proposal carrying any critical or high flag, any **unknown** (I2/I7/I8), or a kind outside `policy.json` | synthetic proposals, one per flag |
| I17 | The delegate's key is `FunctionCall`, receiver = its one DAO, methods = `["act_proposal"]` | `verify.mjs` reads `view_access_key_list` |
| I18 | The optional LLM layer can add a flag and can never remove one; it is off by default; `verify.mjs` never calls it | test with a model stub that tries to clear |
| I19 | Watch detects code changes by re-reading code identity (§4), not by trusting a transaction feed | test with a swapped hash |
| I20 | The opted-out counter is recomputed from the chain with its denominator and unknown bucket, never stored as a number | copy + crawl test |

I7, I9 and I16 are the ones that matter. A security tool that says "safe" is worse
than no tool.

---

## 11. Reporting — the fix is undeployed

Finding 2 concerns $199.4M of live deposits (2026-11-05). The risk is not
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
and still not know it sets a risk parameter on a $154M lending market, that
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
fallback, carried over from Hallmark — **does not implement `query` at all**.
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
| Nov 6 | Authority walk (§6.1); `auto_update`; access keys | **gate:** the $199.4M chain prints from `node tools/verify.mjs`, cold |
| Nov 6 | Disclosure note sent (§11), with opt-out links | sent, timestamped |
| Nov 7 | `decode.js`, `lint.js` | I7, I8, I10 hold; fires on #1741/#1743 and marmaj #1016 |
| Nov 8 | §16 opt-out; create the demo DAO; opt it out through Docket | every §16 **[verify]** removed; I15 passes; counter reads 13 |
| Nov 9 | §17 `@docket/guard` + MCP server | Claude, given the MCP server, declines a planted #1741-style proposal |
| Nov 10 | §17 delegate on the demo DAO | one approve and one escalation recorded on mainnet; I16, I17 hold |
| Nov 11 | `account.html`, `docket.html`, `optout.html` | a stranger understands §3 without reading this file |
| Nov 12 | `crawl.mjs` census complete; `register.html`; §18 watch | feed.json updating on schedule; I19, I20 hold |
| Nov 13 | I1–I20 each have a test; README; clone into a clean machine and run the README cold | pre-screen would pass |
| Nov 14 | Demo video, X post, submit | repo public, links live, submitted by midday UTC |

The Nov 6 gate stands: if the authority walk does not reproduce the $199.4M
chain cold, stop before building anything else.

---

## 15. Submission

- Tracks: **Social Money** (Sputnik DAO is the named primitive; §16 is something
  a community does with it), **AI Security & Defense** (§17: function-call
  keys and a policy engine, which the track names) and **Open Innovation**.
  One submission, three shots.
- Public repo, MIT `LICENSE`, AI-tooling disclosure in the README — all required.
- README names the other project (Hallmark), per the two-project rule.
- Demo post on X tagging `@NEARProtocol` with `#NEARHackathon`.
- The AI pre-screen checks the repo runs and does what the README says, so the
  README's first command is `node tools/verify.mjs`, and it must print the
  $199.4M chain with no key, no account and no configuration.

---

## 16. Fix — the opt-out

The finding says the safe setting is reachable and almost nobody reaches it
(§3.3). This section makes it one proposal away.

### 16.1 What gets drafted

Sputnik v3.x has a `FactoryInfoUpdate` proposal kind (§6.4) gated by the
`factory_info_update` permission label. Docket drafts it with
`auto_update: false` and the DAO's existing `factory_id` unchanged:

```json
{ "proposal": {
    "description": "Opt out of factory auto-update (Docket). The factory will no longer be able to replace this DAO's code without a vote.",
    "kind": { "FactoryInfoUpdate": { "factory_info": {
        "factory_id": "sputnik-dao.near", "auto_update": false } } } } }
```

The shape matches the source at every v3.x build in §5:
`FactoryInfoUpdate { factory_info: FactoryInfo }` with
`FactoryInfo { factory_id: AccountId, auto_update: bool }`. This was checked at
`2b0f34a38604` (v3.2, `proposals.rs:112`, `lib.rs:54`), `3d568f9517a8` (v3.1,
`proposals.rs:107`, `upgrade.rs:24`) and `86cc77a0808a` (v3.0,
`proposals.rs:107`, `upgrade.rs:21`). v3.2 adds `#[serde(deny_unknown_fields)]`
to `FactoryInfo`, so the drafter must send exactly these two fields.

**[verify]** that a proposal of this shape is accepted by `add_proposal` and,
once approved, leaves `get_factory_info` reading `auto_update: false` on
mainnet (the demo DAO, §16.5). Reading the source is not the same as running
it. The drafter picks the shape by the DAO's resolved version and refuses to draft for a
version it has not been tested against.

### 16.2 What the screen shows, in order

1. The DAO's current `auto_update`, `factory_id` and code version (§5).
2. **What is given up** (I14): the factory can no longer rescue this DAO if a
   migration bricks it. After opting out, every upgrade needs `upgrade_self`
   under the DAO's own vote policy.
3. **Who must approve**: the roles whose permissions match
   `factory_info_update:AddProposal` and `factory_info_update:VoteApprove`
   (with wildcards), and the vote policy that applies, from `get_policy`.
4. **The cost**: `proposal_bond` from `get_policy`, attached as the deposit
   to `add_proposal`, refundable per the DAO's policy.
5. The submit button. Below it, the equivalent `near-cli` command, for members
   who will not connect a wallet to a page.

### 16.3 Signing

`wallet.js` connects through NEAR Wallet Selector, loaded as a pinned ESM build
so the no-bundler rule holds. **[verify]** that the pinned build loads
without a bundler; if it does not, ship the `near-cli` path only and say so on
the page. Docket builds the transaction; the wallet signs it (I13).

### 16.4 Confirmation

An opt-out counts only when `get_factory_info` on the DAO reads
`auto_update: false` (I15). A passed proposal whose effect cannot be re-read is
shown as **unknown**.

### 16.5 The demo DAO

Docket creates one DAO through `sputnik-dao.near`, reads `auto_update: true` on
it (confirming §3.2 on a fresh account), passes the opt-out through `optout.html`,
and re-reads `false`. `verify.mjs` checks the demo DAO on every run. That DAO
also hosts the delegate (§17).

---

## 17. Guard — an AI delegate that cannot vote past a flag

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

- **Seat.** An account added to the demo DAO's council by an
  `AddMemberToRole` proposal.
- **Key.** One `FunctionCall` access key: receiver = the demo DAO, methods =
  `["act_proposal"]`, a small gas allowance (I17). It cannot transfer, deploy,
  or call any other contract. `act_proposal` takes no deposit, so a function-call
  key can call it. **[verify]** on mainnet.
- **Loop.** Poll `get_last_proposal_id`; for each new proposal call
  `checkProposal`; vote `VoteApprove` only if the kind is in `policy.json` and
  there are no critical or high flags and no unknowns (I16). Otherwise do not
  vote and escalate: post the Docket report to the Watch channel (§18) and
  wait for a human.
- **Binding the vote to what was checked.** **[verify]** whether
  `act_proposal` in the deployed version takes the proposal kind as an
  argument. If it does, the delegate passes the exact kind it analysed, so a
  vote cannot land on a proposal that differs from the one checked. If it does
  not, the delegate re-reads the proposal immediately before voting and aborts
  on any difference.

### 17.3 `policy.json`

Starts narrow: `ChangeConfig`, and `Transfer` below a fixed cap where the
description's named amount matches the decoded amount (§6.5). Everything in
the critical and high rows of §6.4 is permanently outside it.

### 17.4 The optional LLM layer

A model (NEAR AI Cloud, if its API and attestation hold up — **[verify]**)
may compare a description with its decoded action and raise a
`semantic-mismatch` flag. It can only add flags (I18). It is off by default,
needs its own key, and nothing in `verify.mjs` touches it.

### 17.5 What the demo shows

One routine proposal the delegate approves, and one proposal that copies the
#1741/#1743 pattern — same description, different receiver — which it refuses
and escalates. Both are mainnet transactions on the demo DAO, linked from the
README.

---

## 18. Watch — alerts with no server

`watch.yml` runs `tools/watch.mjs` on GitHub Actions on a schedule (GitHub does
not guarantee exact timing; the feed shows its last run time). Each pass, for
the five DAOs in §2 and any listed in `watch.json`:

1. New proposals since the last pass → `checkProposal` → any critical flag is
   an alert.
2. Code identity (§4) re-read → any change in `code_hash`,
   `global_contract_hash` or `global_contract_account_id` is an alert (I19).
   This catches a factory `update()` without needing a transaction indexer.
3. `auto_update` re-read → any change is an alert.

Output: `feed.json` committed to the Pages branch, and one message per alert to
a public Telegram channel through a bot token held in Actions secrets.
Per-DAO subscriptions would need a server and are out of scope; the channel
message names the DAO and links its Docket page.

---

## 19. The sentence

> **$199.4M of NEAR liquid staking is governed by a vote that three keys can
> skip — and `true` was the default.**

And what makes it a report rather than an accusation:

> **NEAR core found this and fixed it on 24 March 2026, with a two-week delay and
> a visible proposal. The factory has never shipped the fix. None of the three DAOs
> over $199.4M runs it, and `get_default_code_hash` still returns the February
> build.**

(Not "$199.4M runs the February build". Only `stnear` runs v3.2.
`stader-nearx` runs v3.0 and `linear` runs v3.1 (§5). All three predate the fix.)

And the v2 sentence, once §16.5 is done:

> **Opting out is one proposal. Here it is.**
