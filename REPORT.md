# DRAFT — not sent

> Status: draft for review (2026-11-06). Not sent to anyone. Per ARCHITECTURE.md
> §11 it goes to every recipient at the same time, before the repository is
> public. Every figure below is dated, and comes with the command that
> reproduces it.

---

**To:** the sputnik-dao-contract maintainers (including frol, author of PR #233);
NEAR security; Meta Pool; Stader Labs / RHEA LST (NearX); LiNEAR

**Subject:** The PR #233 auto-update fix is not deployed. Three liquid-staking DAOs are exposed until it is, and here is an opt-out

Hello all,

We're building Docket, a read-only tool that shows, for any NEAR account, who
can change it without a vote. While building it we followed one path from end
to end, and we'd like to share it before we publish. Everything here is a
public configuration fact. None of it is an exploit, and nothing below needs
an embargo. We're sending it because the people at the end of the path can't
currently see it, and because a fix already exists.

## 1. The fix exists and has not shipped

- [PR #233](https://github.com/near-daos/sputnik-dao-contract/pull/233),
  *"Factory auto-updates should not be applied immediately to counter the risk
  of taking control if the factory account is compromised"*, by frol, merged
  **2026-03-24** (merge commit `9e96c75410a9`). It makes a factory-initiated
  `update()` open an `UpgradeSelf` proposal and wait `TWO_WEEKS_NS` before
  deploying. Thank you for it. It is exactly the right instinct.
- The factory still publishes **v3.2, commit `2b0f34a38604`** (2026-02-25), as
  its default. `get_contracts_metadata` lists no build after v3.2. GitHub's
  compare puts the fix **2 commits ahead of, 0 behind** the deployed commit.

## 2. Who is exposed today

A Sputnik DAO that never wrote factory info reads `auto_update: true`. That is
the default in `internal_get_factory_info` (`upgrade.rs:95` at `2b0f34a38604`).
With `true`, the DAO's `update()` accepts the factory as caller, with no
proposal and no vote. The factory `sputnik-dao.near` is self-owned and holds
**three full-access keys**:

```
ed25519:2gtDEwdLuUBawzFLAnCS9gUso3Ph76bRzMpVrtb66f3J
ed25519:3z2MnvQqD3dsUPynZpV8CFtyXhFiTksjZhjDr26isEXv
ed25519:7ReZXfft58fzSLyCB6A5qQ719DCaDo8etYrat75KFXp3
```

So the path is: those keys → factory `update(account_id, code_hash)` → the
DAO's `update()` (no vote, `auto_update: true`) → the DAO's protocol contract.

| DAO | `auto_update` | code it runs | owner of | NEAR TVL (DefiLlama `chainTvls.Near`, 2026-11-06) |
|---|---|---|---|---|
| `stnear.sputnik-dao.near` | **true** | v3.2 (`global_contract_hash` DtHZ…XuF) | `meta-pool.near` (Meta Pool) | $79,933,156 |
| `stader-nearx.sputnik-dao.near` | **true** | v3.0 (`code_hash` 2Zof…HnK) | `nearx.stader-labs.near` (RHEA LST) | $69,171,320 |
| `linear.sputnik-dao.near` | **true** | v3.1 (`code_hash` 4zSo…ECp) | `linear-protocol.near` (LiNEAR) | $46,856,045 |
| | | | **total** | **$195,960,520** |

That is 99.4% of NEAR liquid-staking TVL on DefiLlama on the same date. For
comparison, `burrow.sputnik-dao.near` and `ref-finance.sputnik-dao.near` read
`auto_update: false` (they opted out on 2026-10-24, proposals #1725 and #968).

The mechanism has a real purpose: rescuing a bricked DAO. We don't suggest
otherwise. The concern is that the depositors can see neither the path nor
that a fix exists.

## 3. Shipping the fix does not close it by itself

Our reading of the source, which we'd be grateful if you'd correct:

1. **The fix's first delivery uses the ungated `update()`.** The two-week gate
   lives in the *new* code. Delivering that code to a DAO goes through the DAO's
   *current* `update()`, which is the same immediate check at v3.0, v3.1 and
   v3.2. So the upgrade that installs the gate is itself a no-vote,
   no-delay deploy from the factory keys.
2. **After the fix, the factory path is delayed and visible, but still needs no
   vote.** After two weeks the code deploys without one. The gate is skipped
   when the DAO's state cannot be read (the rescue case).
3. **A voted upgrade may be delayed too.** `UpgradeSelf` runs through
   `factory.update(self)`, so under PR #233 the DAO's `update()` sees the
   factory as caller and treats it as an auto-update. We have not run this.

## 4. The opt-out, and what it costs

Each DAO can opt out today with one `FactoryInfoUpdate` proposal:

```json
{ "proposal": {
    "description": "Opt out of factory auto-update. The factory will no longer be able to replace this DAO's code without a vote.",
    "kind": { "FactoryInfoUpdate": { "factory_info": {
        "factory_id": "sputnik-dao.near", "auto_update": false } } } } }
```

This exact shape has passed on twelve DAOs between 2026-10-05 and 2026-10-29,
seven on v3.1 (`burrow`, `ref-finance`, `ref-labs`, `rhea-conversion`,
`rhea-lostfound`, `rhea-ccdfm`, `rhea-airdrop`) and five on v3.2 (`rhea-lsd`,
`neardragons`, `testgfdg`, `unrlzd`, `nearlytrade`). Each now reads
`auto_update: false`. None of those twelve runs v3.0, which is what
`stader-nearx` runs. The source shape is identical at v3.0 (`86cc77a0808a`),
but it has not been exercised there.

Per DAO, read from `get_policy` on 2026-11-06:

| DAO | bond (`proposal_bond`, attached to `add_proposal`) | who can propose and approve `factory_info_update` |
|---|---|---|
| `stnear` | 1 NEAR | `council` holds `*:AddProposal` and `*:VoteApprove`, default threshold 55/100 |
| `linear` | 0.1 NEAR | `Council` holds `*:AddProposal` and `*:VoteApprove`, default threshold 1/2 |
| `stader-nearx` | 0.1 NEAR | **no role holds a permission matching `factory_info_update`.** A `policy` proposal granting it (the council holds `policy:AddProposal` / `policy:VoteApprove`) has to pass first |

**What it costs, honestly.**

- **The factory can no longer rescue the DAO** if a migration bricks it.
- **From the source, the DAO probably also loses `UpgradeSelf`.** At v3.0,
  v3.1, v3.2 and at the PR #233 commit, `UpgradeSelf` only calls
  `factory.update(dao, hash)`. The factory then calls the DAO's `update()` as
  the factory, which an opted-out DAO rejects with `ERR_MUST_BE_SELF_OR_FACTORY`.
  If so, upgrading an opted-out DAO takes three proposals:
  `FactoryInfoUpdate → true`, then `UpgradeSelf`, then `FactoryInfoUpdate → false`.
  While `true` is in force, the no-vote path is open again. None of the twelve
  opted-out DAOs has attempted an `UpgradeSelf` since opting out, so mainnet
  hasn't answered this yet. We will test it on our own demo DAO on
  2026-11-08 and send you the transaction either way.

In exchange, the opt-out is currently the only setting that puts a vote in
front of every code change. That stays true after PR #233 ships.

## 5. Reproduce

```bash
RPC=https://free.rpc.fastnear.com
viewa(){ curl -s -X POST $RPC -H 'Content-Type: application/json' \
 -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"query\",\"params\":{\"request_type\":\"call_function\",\"finality\":\"final\",\"account_id\":\"$1\",\"method_name\":\"$2\",\"args_base64\":\"$(printf '%s' "$3" | base64 -w0)\"}}" \
 | python3 -c 'import sys,json;r=json.load(sys.stdin)["result"];print(bytes(r["result"]).decode())'; }

viewa sputnik-dao.near get_owner '{}'                 # "sputnik-dao.near"
curl -s -X POST $RPC -H 'Content-Type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"query","params":{"request_type":"view_access_key_list","finality":"final","account_id":"sputnik-dao.near"}}'
viewa sputnik-dao.near get_default_code_hash '{}'     # DtHZA1mU…XuF = v3.2
viewa sputnik-dao.near get_contracts_metadata '{}'    # last entry v3.2, commit 2b0f34a38604
for d in stnear stader-nearx linear; do viewa $d.sputnik-dao.near get_factory_info '{}'; done
viewa meta-pool.near get_owner_id '{}'
viewa nearx.stader-labs.near get_owner_id '{}'
viewa linear-protocol.near get_owner_id '{}'
viewa stader-nearx.sputnik-dao.near get_policy '{}'
gh api repos/near-daos/sputnik-dao-contract/compare/2b0f34a38604...9e96c75410a9 --jq '{status,ahead_by,behind_by}'
```

`node tools/verify.mjs` in the Docket repository re-runs these checks and
prints the chain. It will link here once the repository is public.

## 6. What we'll do

- Publish on or after 2026-11-14 with the opt-out flow, and each response
  verbatim. Any reply, including none, will be shown as it is.
- Correct anything above you tell us is wrong before then, and credit you for it.
- Report the `UpgradeSelf` test result (§4) as soon as it runs.

Thank you for PR #233, and for reading this.

— the Docket team

---

<!-- Sources for every figure: ARCHITECTURE.md §2, §3.3, §3.4, §5, §16.2; reads of 2026-11-06. -->
