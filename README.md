# Docket

**Who can change a NEAR account without a vote, read from the chain alone.**

Docket follows every path by which an account's code or rules can change: its
access keys, its owner, the global contract it runs, and, for a Sputnik DAO, the
factory and the DAO's voting policy. It reads public view calls and nothing
else. It holds no key, needs no account and signs nothing. The one exception is
the optional delegate (below): it signs its own votes with a key that can do
nothing else.

What it found: a Sputnik DAO's contract has a function, `update()`, that is not
a proposal. While the DAO's `auto_update` setting is `true`, which is the
default, the factory `sputnik-dao.near` can use it to replace the DAO's code
with no vote. The factory owns itself, and its only authority is three
full-access keys. The DAOs that administer Meta Pool, LiNEAR and NearX all read
`true`. A fix exists (near-daos/sputnik-dao-contract PR #233) and has not been
deployed. The full argument, with every number sourced and dated, is in
[ARCHITECTURE.md](ARCHITECTURE.md).

## Run it

Node 22 or later. Nothing to install: there are no dependencies.

```bash
node tools/verify.mjs
```

This prints the chain, from the factory's three keys down to the protocols and
the value behind them, and then re-reads every claim the spec says it re-reads
from NEAR mainnet, GitHub and DefiLlama:

```
§3.4  the chain — every edge a public view call, read in this run

  3 full-access keys on sputnik-dao.near   [get_owner -> sputnik-dao.near (self-owned)]
   └── update(code) → DAO update(), no vote: auto_update: true on
        ├── stnear.sputnik-dao.near        owner of meta-pool.near
        ├── linear.sputnik-dao.near        owner of linear-protocol.near
        └── stader-nearx.sputnik-dao.near  owner of nearx.stader-labs.near
```

Exit codes: **0** every claim confirmed; **1** a claim diverged from mainnet;
**2** a read failed, so a claim is unknown (never counted as confirmed). Dollar
figures come from DefiLlama, are dated by the read, and never change the exit
code.

`node tools/verify.mjs` makes only two unauthenticated GitHub calls; if GitHub rate-limits you, it reports those claims as unknown (exit 2), not failed — wait for the reset time it prints and re-run.

```bash
npm test
```

Runs the test suite offline, against mainnet responses recorded in
`test/fixtures/`. Tests name the invariants (§10 of the spec) they check.

## The site

The homepage is a small React app in `app/`, built with Vite. The four tool
pages (`account`, `docket`, `register`, `optout`) are plain HTML and ES modules
in `web/`, and the build copies them in, so every link works from `dist/`. Both
read NEAR mainnet and DefiLlama from your browser, with no server in between.
Neither computes anything of its own: every read, rule and figure comes from the
dependency-free modules in `web/assets/`, the same ones `verify.mjs` and the
tests use. The app's packages are pinned in `app/package-lock.json`; the root
project has none.

**Try it (Node 22.12 or later):**

```bash
npm run build                      # installs app/ from its lockfile, builds to dist/
npm run preview                    # serves dist/ at http://localhost:4173
```

| do | see |
|---|---|
| Open http://localhost:4173 | The finding in one sentence: "$… of NEAR liquid staking can be rewritten by three keys, without a vote." It starts from values recorded on 2026-11-06, labelled as recorded, then switches to live figures with their read times. |
| Watch the vault beside it (or under the headline on a phone) | One keyhole per full-access key on `sputnik-dao.near`, counted from a live read. The keys turn, the "DAO vote" light reads "bypassed", the bolts retract and the door opens on the value at stake. The log under the vault narrates each step. |
| Click "auto_update: false", then "Turn the keys" | The same keys turn, but the update is rejected and the door stays shut. This replays the mainnet opt-out test (transaction `772n4Z…`), not any DAO's current state. |
| Scroll to "01 · Inside the vault" | Meta Pool, LiNEAR and NearX, each with its contract, its owner DAO and that DAO's `auto_update`, read live. The ink bars show their share of NEAR liquid staking. |
| Scroll to "03 · Every door like this one" and hover a square | One square per DAO in the committed census, in three labelled blocks: red for `auto_update: true` (1,607), violet for false (13), dashed for unknown (466). Hovering shows the DAO's id; clicking opens its proposals. "Recount from the chain now" re-reads every DAO (about 15 minutes). |
| Scroll to "04 · The fourth lock" | "Not shipped": the factory's default build, read live, does not contain the fix (PR #233). Next to it, the one proposal a DAO can pass today, and the delegate's approve and refuse transactions. |
| Turn off the network and reload | The headline keeps the recorded values and names each read that failed. Unread values show as "unknown", never as zero. |

`dist/` is static (HTML, JS, CSS, fonts, the tool pages and `graph.json`) and
ready for Vercel or Netlify: the build command is `npm run build`, the output
directory `dist`. For development, run `npm run app:install` once, then
`npm run dev`.

**Libraries in the site (Q-005), all pinned:** React 19.3.1 and React DOM
19.3.1, built with Vite 8.3.7 and @vitejs/plugin-react 6.3.0, all MIT. The fonts
are Instrument Serif and Instrument Sans, self-hosted in `web/assets/fonts` (SIL OFL). None of these
are used by `verify.mjs`, the tests, `guard/` or `agent/`.

### Without building

The pages also work with no build at all. Serve the **repository root**,
because the census loads `graph.json` from there:

```bash
python -m http.server 8000
```

Then open:

| page | what it shows |
|---|---|
| http://localhost:8000/web/index.html | the static version of the homepage: the same vault, reads and figures |
| http://localhost:8000/web/account.html?account=meta-pool.near | who can change any account without a vote, drawn as a path |
| http://localhost:8000/web/docket.html?dao=burrow.sputnik-dao.near | a DAO's proposals, decoded and checked against their descriptions |
| http://localhost:8000/web/register.html | every Sputnik DAO the factory lists, by reach |
| http://localhost:8000/web/optout.html?dao=stnear.sputnik-dao.near | the fix a DAO can apply today: one proposal setting `auto_update` to `false` |

Any static server works (`npx serve .`, for example); Python is only one option.
The opt-out page can hand a transaction to your own wallet through NEAR Wallet
Selector, which it loads from esm.sh only when you click "Connect a wallet". It
also prints the same transaction as a `near-cli` command.

## Tools

| command | what it does |
|---|---|
| `node tools/verify.mjs` | re-reads the spec's claims from mainnet, GitHub and DefiLlama |
| `node tools/crawl.mjs` | the census: every DAO the factory lists, written to `graph.json`. Resumable; `--fresh` re-reads all of them (about 25 minutes) |
| `node tools/demo-dao.mjs <you.near>` | prints the transactions of the demo-DAO opt-out test (spec §16.5). Read-only: you sign them yourself |
| `node tools/receipts.mjs <tx> <signer> --step 5\|9` | judges that test from a transaction's receipts |
| `node tools/capture-fixtures.mjs` | re-records the mainnet responses the tests replay |
| `node guard/mcp.mjs` | Docket's two checks, `check_proposal` and `check_account`, as MCP tools over stdio (spec §17.1) |
| `node agent/delegate.mjs --account <delegate.near> [--dry-run]` | the delegate (spec §17.2): checks each new proposal and votes only on a clean one that `agent/policy.json` allows, signing with its own FunctionCall key from the OS keychain; otherwise it escalates to a human. `--dry-run` signs nothing |
| `node tools/guard-setup.mjs [--pre T<n>]` | prints the delegate's setup and demo transactions T1–T9, with a read-only pre-check for each |

## What has been run on mainnet

On 2026-11-06 Docket created `docket-demo.sputnik-dao.near`, opted it out, and
approved the same `UpgradeSelf` twice. With `auto_update: false` the factory's
update was rejected (`ERR_MUST_BE_SELF_OR_FACTORY`); with `true` it ran. Every
transaction is listed in the spec, §16.5. Signing an opt-out through a browser
wallet has not been run yet; the `near-cli` path has.

Before this repository was public, the finding went to NEAR security (asked to
forward it to the sputnik-dao-contract maintainers), Meta Pool and Stader.
LiNEAR has been asked for a private security contact and has not yet been sent
the details. [REPORT.md](REPORT.md) has the text that was sent, to whom, when,
and every reply.

### The delegate, on the demo DAO

On 2026-11-08 the demo DAO got a second council member,
`docket-guard.docket-aditi.near`. Its only key is a FunctionCall key that can
call `act_proposal` on the demo DAO and nothing else (I17; `verify.mjs`
re-reads it). With two members, every proposal needs both votes. Then two
proposals with the same words, "Send 0.01 NEAR to docket-aditi.near (Docket
test)", were put to it:

- **#7 sends the 0.01 NEAR to docket-aditi.near, as it says.** The delegate
  found no flags and voted to approve, signing with its own key:
  [`HnMopqHK…`](https://nearblocks.io/txns/HnMopqHKJaJ7jJNY4sWkHoYJH6TLwZnVFmNzPh9ur6wZ).
  The human vote passed it:
  [`41FThx6G…`](https://nearblocks.io/txns/41FThx6G6n8osp4bRqtPfvpCa4VRr83Wu6obUosvcG72).
  Decision log: [`agent/log/docket-demo.sputnik-dao.near-7.json`](agent/log/docket-demo.sputnik-dao.near-7.json).
- **#8 sends it to docket-guard instead.** It was proposed in
  [`oE8yyRjD…`](https://nearblocks.io/txns/oE8yyRjDfWRLLWj6usvaxiVFawZLHcS9UTZ76v4JGfH).
  Its kind is allowed and its amount is under the cap, but Docket's checks raised
  three high flags: named-receiver, silent-reach, and a sibling collision with
  #7. The delegate did not vote, and escalated it to a human. Decision log:
  [`agent/log/docket-demo.sputnik-dao.near-8.json`](agent/log/docket-demo.sputnik-dao.near-8.json).

Every transaction of the setup and the demo, including three first attempts at
#7's vote that never reached the chain, is in the spec, §17.5.

## How this was built

Docket was written with **Claude Code**, Anthropic's coding agent, running
Claude models, under the direction of its author. That covers the code, the
tests and the documents. The author decided what to build, reviewed it, and
sent the disclosure. The author approved every mainnet transaction, one at a
time. Most were signed by the author. For the last steps, T7–T9 of §17, Claude
Code ran each command after the author's explicit yes, and the signing used the
author's OS keychain. The delegate's vote on #7 was signed by the delegate's own
FunctionCall key, also from the keychain. No key was ever shown to, or handled
by, the agent. Every number in the spec traces to a read that `verify.mjs`, the
crawl or a documented command can repeat.

## License

MIT. See [LICENSE](LICENSE).
