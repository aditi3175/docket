// source.js — links from public pages to the exact Sputnik source lines a sentence relies on, at the
// commit the factory publishes as its default (v3.2, 2b0f34a38604). Line numbers read from
// raw.githubusercontent.com at that commit on 2026-11-07. Pages link here instead of citing the spec.

export const SPUTNIK_COMMIT = '2b0f34a38604';
const BLOB = `https://github.com/near-daos/sputnik-dao-contract/blob/${SPUTNIK_COMMIT}/sputnikdao2/src`;

export const SOURCE = Object.freeze({
  updateAssert: { text: 'upgrade.rs lines 117–128: update() and its caller check', href: `${BLOB}/upgrade.rs#L117-L128` },
  defaultTrue: { text: 'upgrade.rs lines 94–100: auto_update defaults to true', href: `${BLOB}/upgrade.rs#L94-L100` },
  globalSwap: { text: 'upgrade.rs line 148: update() switches the DAO to the new code', href: `${BLOB}/upgrade.rs#L148` },
});
