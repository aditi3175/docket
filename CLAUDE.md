# Docket — rules for Claude Code

ARCHITECTURE.md is the spec. Read the relevant sections before any task. If the code and the spec disagree, stop and tell me. Don't silently pick one.

## Hard rules
- Never invent a number, account id, method name or payload shape. If unsure, call mainnet and show me the output. Unknown stays "unknown" (I2).
- Invariants I1–I20 in §10 are requirements. Every new module names which ones it enforces and has a test for them.
- web/ is static: plain HTML + ES modules, no bundler, no framework, no build step.
- No private key ever goes in this repo, in code, or in chat. Keys live in ~/.near-credentials or .env (gitignored).
- Use BigInt for every base-unit amount. Number never touches one (I10).
- RPC: FastNear → rpc.mainnet.near.org → near.drpc.org, concurrency ≤ 6 (§9).
- Never edit verify.mjs expectations to make a failing check pass. Report the divergence to me instead.
- Removing a [verify] marker requires the mainnet command + its output in the commit message.

## Workflow
- One §14 row per session. Plan first, then build, then run, then commit.
- After every change: `node tools/verify.mjs` and `npm test`.
- Small commits, message = what now works.
