# Docket

**Who can change a NEAR account without a vote, read from the chain alone.**

Docket follows every path by which an account's code or rules can change: its
access keys, its owner, the global contract it runs, and, for a Sputnik DAO, the
factory and the DAO's voting policy. It reads public view calls and nothing
else. It holds no key, needs no account and signs nothing.

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

## The pages

The pages are static HTML and ES modules: no bundler, no framework, no build
step. They read mainnet from your browser. Serve the **repository root**, not
`web/`, because the census page loads `graph.json` from the root:

```bash
python -m http.server 8000
```

Then open:

| page | what it shows |
|---|---|
| http://localhost:8000/web/index.html | the finding on one screen, live, with the "fix shipped?" badge and the opted-out counter |
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

## How this was built

Docket was written with **Claude Code**, Anthropic's coding agent, running
Claude models, under the direction of its author. That covers the code, the
tests and the documents. The author decided what to build, reviewed it, sent
the disclosure, and signed every mainnet transaction. No key was ever given to
the agent. Every number in the spec traces to a read that `verify.mjs`, the
crawl or a documented command can repeat.

## License

MIT. See [LICENSE](LICENSE).
