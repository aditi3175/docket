# Docket

`node tools/verify.mjs` makes only two unauthenticated GitHub calls; if GitHub rate-limits you, it reports those claims as unknown (exit 2), not failed — wait for the reset time it prints and re-run.
