# Send log

Sent 2026-11-06, before the repository is public (ARCHITECTURE.md §11). The
three sends went out within 13 minutes of each other. Times are as reported by
the sender, in IST (UTC+05:30), with UTC beside them.

| recipient | channel | sent (IST) | sent (UTC) | response |
|---|---|---|---|---|
| NEAR security, asked to forward to the sputnik-dao-contract maintainers and frol | security@near.org | 2026-11-06 14:37 | 09:07 | automated acknowledgement: the inbox is monitored, and code bugs go to HackenProof |
| Meta Pool | bug-bounty form | 2026-11-06 14:47 | 09:17 | none yet |
| Stader | admin@staderlabs.com | 2026-11-06 14:50 | 09:20 | none yet |
| LiNEAR | X DM to @LinearProtocol | **not reached** | — | **pending.** The X DM is blocked because the account accepts DMs from verified accounts only. Contact requested instead, with no details of the finding: a public X reply to @LinearProtocol at 2026-11-06 15:07 IST (09:37 UTC; time as reported, read as PM); and [linear-protocol/LiNEAR#215](https://github.com/linear-protocol/LiNEAR/issues/215), *"Request: private security contact for LiNEAR"*, opened 2026-11-06 15:11 IST (09:41:29 UTC, `gh issue view`). The report itself is not yet sent |

**Follow-up 1: the `UpgradeSelf` mainnet result promised in section 5.** Sent
2026-11-07 to the three recipients above. LiNEAR was not sent it, because it
has no private contact yet. Times are as reported by the sender, in IST, with
UTC beside them. The text that was sent is under "Follow-up 1" at the end of
this file.

| recipient | channel | sent (IST) | sent (UTC) | response |
|---|---|---|---|---|
| NEAR security | security@near.org | 2026-11-07 14:44 | 09:14 | none yet |
| Stader | admin@staderlabs.com | 2026-11-07 14:47 | 09:17 | none yet |
| Meta Pool | bug-bounty form | 2026-11-07 14:50 | 09:20 | none yet |

Every response will be published verbatim at submission, including "no
response" (§11). Everything between the first two `✂` lines is the report text that was
sent.

✂ ----------------------------------------------------------------------------

Hello,

We're building Docket, a read-only tool that shows, for any NEAR account, who
can change it without a vote. While building it we traced one path end to end,
and we'd like to share it with you before we publish. Everything below is a
public configuration fact with the command that reproduces it (section 6).
None of it is an exploit, and it needs no embargo. We're writing because the
depositors at the end of the path can't currently see it, and because a fix
already exists. Docket is a NEAR Hackathon project, which is why we plan to
publish on or after 2026-11-14.

All chain reads and figures are from **2026-11-06** unless another date is
given.

## 1. The fix exists and has not shipped

- **PR #233** in near-daos/sputnik-dao-contract, *"Factory auto-updates should
  not be applied immediately to counter the risk of taking control if the
  factory account is compromised"*, by frol, merged **2026-03-24**, merge
  commit `9e96c75410a9`. A factory-initiated `update()` then waits for an
  `UpgradeSelf` proposal to have been open for two weeks (`TWO_WEEKS_NS`)
  before it deploys. [A1, A2] Thank you for it. It is the right instinct.
- The factory `sputnik-dao.near` still publishes **v3.2, commit
  `2b0f34a38604`** (committed 2026-02-25), as its default. `get_contracts_metadata`
  lists no build after v3.2. GitHub's compare puts the fix **2 commits ahead,
  0 behind** that commit. [A3, A4]

## 2. Who is exposed today

A Sputnik DAO that never wrote factory info reads `auto_update: true`. That is
the default in `internal_get_factory_info`. [B1] With `true`, the DAO's
`update()` accepts the factory as caller, with no proposal and no vote. [B2]
The factory is self-owned, and its only authority is **three full-access
keys** [B3]:

```
ed25519:2gtDEwdLuUBawzFLAnCS9gUso3Ph76bRzMpVrtb66f3J
ed25519:3z2MnvQqD3dsUPynZpV8CFtyXhFiTksjZhjDr26isEXv
ed25519:7ReZXfft58fzSLyCB6A5qQ719DCaDo8etYrat75KFXp3
```

The path: those keys → factory `update(account_id, code_hash)` [B4] → the
DAO's `update()` (no vote while `auto_update: true`) → the protocol contract
the DAO owns.

| DAO | `auto_update` [C1] | code it runs [C2] | owner of [C3] | value |
|---|---|---|---|---|
| `stnear.sputnik-dao.near` | **true** | v3.2 | `meta-pool.near` (Meta Pool) | $79,933,156 (DefiLlama) [C4] |
| `linear.sputnik-dao.near` | **true** | v3.1 | `linear-protocol.near` (LiNEAR) | $46,732,391 (DefiLlama) [C4] |
| `stader-nearx.sputnik-dao.near` | **true** | v3.0 | `nearx.stader-labs.near` (NearX) | 2,553,885 NEAR staked (on chain) [C5] |

**$126,665,546** (DefiLlama, Meta Pool + LiNEAR) plus **2,553,885 NEAR** in
NearX. DefiLlama doesn't value NearX, so it's stated in NEAR. At $3.69 per NEAR
that is about $9.4M (on-chain amount × price, not a DefiLlama figure).

The mechanism has a real purpose: rescuing a bricked DAO. We don't suggest
otherwise. The concern is that depositors can see neither the path nor that
a fix exists.

## 3. Shipping the fix does not close it by itself

This is our reading of the source. We'd be grateful for corrections.

1. **The fix's first delivery uses the ungated `update()`.** The two-week gate
   lives in the *new* code. Delivering that code to a DAO goes through the
   DAO's *current* `update()`, which has the same immediate check at v3.0,
   v3.1 and v3.2 [B2]. So the upgrade that installs the gate is itself a
   no-vote, no-delay deploy from the factory keys.
2. **After the fix, a factory update is delayed and visible, but still needs
   no vote.** After two weeks the code deploys without one. The gate is
   skipped when the DAO's state can't be read, which is the rescue case. [D1]
3. **A voted upgrade may be delayed too.** `UpgradeSelf` reaches `update()`
   through the factory (section 4), so under PR #233 the DAO sees the factory
   as caller and treats it as an auto-update [D1]. We have not run this.

One caveat on our own reading: the factory's own code hash
(`BXd5idTX…nnY`) is not in its `get_contracts_metadata`, so we can't confirm
which commit the factory runs. We read its `update()` at `2b0f34a38604`. [B4]

## 4. The opt-out, and what it costs

A DAO opts out with one `FactoryInfoUpdate` proposal:

```json
{ "proposal": {
    "description": "Opt out of factory auto-update. The factory will no longer be able to replace this DAO's code without a vote.",
    "kind": { "FactoryInfoUpdate": { "factory_info": {
        "factory_id": "sputnik-dao.near", "auto_update": false } } } } }
```

Twelve DAOs passed exactly this kind between 2026-10-05 and 2026-10-29, and
each now reads `auto_update: false`. Seven run v3.1 and five run v3.2. They
include `burrow` (#1725) and `ref-finance` (#968). [E1] None of them runs
v3.0, which is what `stader-nearx` runs. The source shape is the same at v3.0
(`86cc77a0808a`), but it has not been run there.

Per DAO [E2]:

| DAO | bond (`proposal_bond`) | who can propose and approve it | steps |
|---|---|---|---|
| `stnear` | 1 NEAR | `council` (4 members) holds `*:AddProposal` and `*:VoteApprove`; default threshold 55/100 | **1 proposal.** `stnear` has never had a proposal (`get_last_proposal_id` = 0), so this would be its first [E3] |
| `linear` | 0.1 NEAR | `Council` (5 members) holds `*:AddProposal` and `*:VoteApprove`; default threshold 1/2 | **1 proposal** |
| `stader-nearx` | 0.1 NEAR | **No role holds any permission matching `factory_info_update`.** The council holds `policy:AddProposal` and `policy:VoteApprove`, but not `policy_add_or_update_role` | **2 proposals:** first a `ChangePolicy` that grants `factory_info_update`, then the opt-out |

### What opting out costs

1. **The factory can no longer rescue the DAO** if a migration bricks it.
2. **Upgrading becomes a three-proposal process, and the no-vote path reopens
   during it.** This is from the source and has not yet been run on mainnet.
   At v3.0, v3.1, v3.2 and at the PR #233 commit, an approved `UpgradeSelf`
   does only one thing: the DAO calls `factory.update(dao, hash)`. The factory
   then calls the DAO's `update(code)` *as the factory*, and an opted-out DAO
   rejects that call (`ERR_MUST_BE_SELF_OR_FACTORY`). [F1, B2, B4] So an
   opted-out DAO upgrades like this:

   1. a `FactoryInfoUpdate` proposal setting `auto_update: true`;
   2. an `UpgradeSelf` proposal for the new code;
   3. a `FactoryInfoUpdate` proposal setting `auto_update: false`.

   Between steps 1 and 3, the factory's three keys can again replace the
   code with no vote.

   None of the twelve opted-out DAOs has tried an `UpgradeSelf` since opting
   out, so mainnet hasn't answered this yet [E1]. We will test it on our own
   demo DAO on 2026-11-08 and send you the transaction either way.

In exchange, opting out is the only setting today that puts a vote in front
of every code change, and that stays true after PR #233 ships.

## 5. What we'll do

- Publish on or after 2026-11-14, including each response verbatim. Any
  reply, including none, will be shown as it is.
- Correct anything above that you tell us is wrong before then, and credit
  you for it.
- Send you the `UpgradeSelf` test result (section 4) as soon as it runs.

## 6. Reproduce

```bash
RPC=https://free.rpc.fastnear.com
viewa(){ curl -s -X POST $RPC -H 'Content-Type: application/json' \
 -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"query\",\"params\":{\"request_type\":\"call_function\",\"finality\":\"final\",\"account_id\":\"$1\",\"method_name\":\"$2\",\"args_base64\":\"$(printf '%s' "$3" | base64 -w0)\"}}" \
 | python3 -c 'import sys,json;r=json.load(sys.stdin)["result"];print(bytes(r["result"]).decode())'; }
rpcq(){ curl -s -X POST $RPC -H 'Content-Type: application/json' \
 -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"query\",\"params\":{\"request_type\":\"$1\",\"finality\":\"final\",\"account_id\":\"$2\"}}"; echo; }
GH=https://api.github.com/repos/near-daos/sputnik-dao-contract
SRC=https://raw.githubusercontent.com/near-daos/sputnik-dao-contract

# A1  PR #233: merged, merged_at, merge commit
curl -s $GH/pulls/233 | python3 -c 'import sys,json;p=json.load(sys.stdin);print(p["merged"],p["merged_at"],p["merge_commit_sha"])'
# A2  the gate in the fix
curl -s $SRC/9e96c75410a9/sputnikdao2/src/upgrade.rs | grep -n TWO_WEEKS_NS
# A3  factory versions and default (last entry v3.2, commit 2b0f34a38604; default = DtHZA1mU…XuF)
viewa sputnik-dao.near get_contracts_metadata '{}'
viewa sputnik-dao.near get_default_code_hash '{}'
# A4  fix vs deployed: status, ahead_by, behind_by, deployed commit date
curl -s $GH/compare/2b0f34a38604...9e96c75410a9 | python3 -c 'import sys,json;c=json.load(sys.stdin);print(c["status"],c["ahead_by"],c["behind_by"],c["base_commit"]["commit"]["committer"]["date"])'

# B1  the auto_update: true default (v3.2)
curl -s $SRC/2b0f34a38604/sputnikdao2/src/upgrade.rs | sed -n 95,101p
# B2  the DAO's update() caller check (v3.0 / v3.1 / v3.2)
curl -s $SRC/86cc77a0808a/sputnikdao2/src/upgrade.rs | sed -n 64,70p
curl -s $SRC/3d568f9517a8/sputnikdao2/src/upgrade.rs | sed -n 67,73p
curl -s $SRC/2b0f34a38604/sputnikdao2/src/upgrade.rs | sed -n 122,128p
# B3  the factory: self-owned, three full-access keys
viewa sputnik-dao.near get_owner '{}'
rpcq view_access_key_list sputnik-dao.near
# B4  the factory's update(): caller must be its owner or the DAO itself
curl -s $SRC/2b0f34a38604/sputnikdao-factory2/src/lib.rs | sed -n 109,121p

# C1  auto_update on the three DAOs
for d in stnear linear stader-nearx; do viewa $d.sputnik-dao.near get_factory_info '{}'; done
# C2  code each runs (global_contract_hash / code_hash -> versions in A3)
for d in stnear linear stader-nearx; do rpcq view_account $d.sputnik-dao.near; done
# C3  ownership
viewa meta-pool.near get_owner_id '{}'; viewa linear-protocol.near get_owner_id '{}'; viewa nearx.stader-labs.near get_owner_id '{}'
# C4  DefiLlama NEAR-only TVL, and that its adapters read these contracts
curl -s https://api.llama.fi/protocols | python3 -c 'import sys,json;d={p["slug"]:p for p in json.load(sys.stdin)};[print(s,d[s]["chainTvls"]["Near"]) for s in ["meta-pool-near","linear-protocol"]]'
curl -s https://raw.githubusercontent.com/DefiLlama/DefiLlama-Adapters/main/projects/metapool.js | grep -n "meta-pool.near"
curl -s https://raw.githubusercontent.com/DefiLlama/DefiLlama-Adapters/main/projects/linear-near.js | grep -n LINA   # LINA = linear-protocol.near
# C5  NearX staked, yoctoNEAR (24 decimals)
viewa nearx.stader-labs.near get_total_staked_balance '{}'

# D1  the PR #233 gate: is_auto_update, the state-unreadable skip, the two-week check
curl -s $SRC/9e96c75410a9/sputnikdao2/src/upgrade.rs | sed -n '160,167p;187,192p'

# E1  the twelve opt-outs: proposal kind + status, then factory info now
for p in ref-finance:968 burrow:1725 ref-labs:285 rhea-conversion:8 rhea-lostfound:2 rhea-ccdfm:9 \
         rhea-airdrop:13 rhea-lsd:4 neardragons:0 testgfdg:0 unrlzd:1 nearlytrade:8; do
  d=${p%%:*}.sputnik-dao.near; viewa $d get_proposal "{\"id\":${p##*:}}"; viewa $d get_factory_info '{}'; done
# E2  bonds, roles, permissions
for d in stnear linear stader-nearx; do viewa $d.sputnik-dao.near get_policy '{}'; done
# E3  stnear has never had a proposal
viewa stnear.sputnik-dao.near get_last_proposal_id '{}'

# F1  UpgradeSelf runs only upgrade_using_factory, which calls the factory's update
curl -s $SRC/2b0f34a38604/sputnikdao2/src/proposals.rs | sed -n 394,397p
curl -s $SRC/2b0f34a38604/sputnikdao2/src/upgrade.rs | sed -n 162,178p
```

Thank you for PR #233, and for reading this.

Aditi (Docket, built for the NEAR Hackathon)
Reply to: aditigupta3175@gmail.com

✂ ----------------------------------------------------------------------------

## Send list (not part of the pasted text)

| recipient | channel | subject |
|---|---|---|
| NEAR security, asked to forward to the sputnik-dao-contract maintainers and frol | security@near.org ([nearcore SECURITY.md](https://github.com/near/nearcore/blob/master/SECURITY.md)) | Sputnik factory: PR #233's auto-update fix is undeployed — please forward to the sputnik-dao-contract maintainers and frol |
| Meta Pool | bug-bounty form https://forms.gle/F5BhExYc6GRjByyQ9 ([bug bounty page](https://docs.metapool.app/master/contribute-to-meta-pool/bug-bounty-program)) | stnear.sputnik-dao.near (owner of meta-pool.near) can be upgraded by the Sputnik factory with no vote |
| Stader | admin@staderlabs.com ([GitHub org profile](https://github.com/stader-labs)) | stader-nearx.sputnik-dao.near (owner of NearX) can be upgraded by the Sputnik factory with no vote |
| LiNEAR | X DM to @LinearProtocol | linear.sputnik-dao.near (owner of linear-protocol.near) can be upgraded by the Sputnik factory with no vote |

Until LiNEAR has the report, anything public, such as a GitHub issue asking for
a contact, may only ask for a private security contact. It must carry no
detail of the finding.

Sent: see the send log at the top. LiNEAR is pending.

## Follow-up 1 (sent 2026-11-07; not part of the report text above)

To: NEAR security (security@near.org), Meta Pool (bug-bounty form; a new
submission if the form gave no thread to reply to), Stader
(admin@staderlabs.com). Not LiNEAR: no private contact yet.

Subject: Docket follow-up: UpgradeSelf on an opted-out Sputnik DAO, mainnet result

Everything between the two `✂` lines below is the text that was sent. It
is the draft with one paragraph reworded before sending: the one starting
"One detail matters". The new wording explains why an explorer shows the
step 5 transaction as failed. The reproduce command and its expected output
were run against mainnet on 2026-11-07.

✂ ----------------------------------------------------------------------------

Hello,

In our report of 2026-11-06, section 4 said that opting out of factory
auto-update also stops UpgradeSelf from working on its own. We said this came
from the source and had not been run on mainnet, and that we would send you
the transaction either way. It has now run on mainnet, and the source holds.

We created docket-demo.sputnik-dao.near through sputnik-dao.near. It runs
v3.2 (code hash DtHZA1mUmGYeScEaUoUZYQGGFHSMpnjMCvkr5U9hJXuF), and its only
council member is our own account, docket-aditi.near. We approved the same
UpgradeSelf twice, to the code the DAO already runs, and changed only
auto_update between the two:

- auto_update: false, 2026-11-06 17:02 UTC
  772n4ZWMRtmXwsWuVTSP5F1UkbZ27UNyM9SqVzgXnXFS
  The factory's call to the DAO's update() failed:
  "panicked at sputnikdao2/src/upgrade.rs:122:5: ERR_MUST_BE_SELF_OR_FACTORY"

- auto_update: true, 2026-11-06 18:08 UTC
  EZw51V5kCMeCCMsmNw5WqDsSUK8R2CHs4WyeK4jTtB1b
  The same call succeeded, followed by migrate.

So an opted-out DAO upgrades the way section 4 describes: a proposal to set
auto_update back to true, then UpgradeSelf, then a proposal to set it back to
false. While true is in force, the factory's three keys can replace the code
with no vote.

One detail matters for anyone checking an upgrade: in the auto_update: false
case, the proposal still reads Approved and the bond is returned. Only the
receipts show that the upgrade did not happen. (An explorer shows the step 5 transaction itself as failed, because UpgradeSelf returns the factory’s call as its result; the proposal state alone would not tell you.)

The demo DAO is opted out again (7AaKHUxnCx1XdHUrrfMzHk6xUCMSYz9xm5j5Bi2gy36X).
Its get_factory_info reads auto_update: false.

To reproduce (bash with curl and python3, like section 6 of the report):

RPC=https://free.rpc.fastnear.com
txr(){ curl -s -X POST $RPC -H 'Content-Type: application/json' \
 -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"EXPERIMENTAL_tx_status\",\"params\":{\"tx_hash\":\"$1\",\"sender_account_id\":\"docket-aditi.near\",\"wait_until\":\"FINAL\"}}" \
 | python3 -c '
import sys,json; r=json.load(sys.stdin)["result"]; out={x["id"]:x["outcome"]["status"] for x in r["receipts_outcome"]}
for x in r["receipts"]:
  calls=[a["FunctionCall"]["method_name"] for a in x["receipt"].get("Action",{}).get("actions",[]) if isinstance(a,dict) and "FunctionCall" in a]
  if calls: s=out[x["receipt_id"]]; print(x["predecessor_id"],"->",x["receiver_id"],",".join(calls),"FAILED: "+json.dumps(s["Failure"])[-90:] if "Failure" in s else "ok")'; }
txr 772n4ZWMRtmXwsWuVTSP5F1UkbZ27UNyM9SqVzgXnXFS
txr EZw51V5kCMeCCMsmNw5WqDsSUK8R2CHs4WyeK4jTtB1b

Expected output:

docket-aditi.near -> docket-demo.sputnik-dao.near act_proposal ok
docket-demo.sputnik-dao.near -> sputnik-dao.near update ok
sputnik-dao.near -> docket-demo.sputnik-dao.near update FAILED:  panicked: panicked at sputnikdao2/src/upgrade.rs:122:5:\nERR_MUST_BE_SELF_OR_FACTORY"}}}}

docket-aditi.near -> docket-demo.sputnik-dao.near act_proposal ok
docket-demo.sputnik-dao.near -> sputnik-dao.near update ok
sputnik-dao.near -> docket-demo.sputnik-dao.near update ok
docket-demo.sputnik-dao.near -> docket-demo.sputnik-dao.near migrate ok

Aditi (Docket, built for the NEAR Hackathon)
Reply to: aditigupta3175@gmail.com

✂ ----------------------------------------------------------------------------

Sent: see the follow-up table in the send log at the top.
