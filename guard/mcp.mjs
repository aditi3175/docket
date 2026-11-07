#!/usr/bin/env node
// mcp.mjs — §17.1: @docket/guard's two checks as MCP tools over stdio, so any MCP-capable agent can call
// Docket before it acts. No SDK, no dependency: JSON-RPC 2.0, one message per line on stdin/stdout.
//
// Methods: initialize, notifications/initialized, ping, tools/list, tools/call (check_proposal,
// check_account). Read-only (I13). Results carry flags and unknowns, never a verdict (I9).
//
// Usage, in an MCP client's server config: { "command": "node", "args": ["<repo>/guard/mcp.mjs"] }

import { createInterface } from 'node:readline';
import { pathToFileURL } from 'node:url';
import { checkProposal, checkAccount } from './index.mjs';

export const SERVER = Object.freeze({ name: 'docket-guard', version: '0.1.0' });
export const PROTOCOL_VERSIONS = Object.freeze(['2025-06-18', '2025-03-26', '2024-11-05']);

export const TOOLS = Object.freeze([
  {
    name: 'check_proposal',
    description: 'Decode a Sputnik DAO proposal on NEAR mainnet and compare its description with what it does. Returns kind, target (owner, inside the DAO\'s control set or not), value, flags and unknowns. Flags only: an empty list means no check fired, not that the proposal is safe.',
    inputSchema: { type: 'object', properties: { dao: { type: 'string', description: 'DAO account, e.g. burrow.sputnik-dao.near' }, proposal_id: { type: 'integer', minimum: 0 } }, required: ['dao', 'proposal_id'] },
  },
  {
    name: 'check_account',
    description: 'Who can change a NEAR account without a vote: code identity, the no-vote roots (keys) with the path to each, the DAOs on the way that require a vote, and what it is known to administer (a floor). Unknown reads are listed, never treated as none.',
    inputSchema: { type: 'object', properties: { account: { type: 'string', description: 'NEAR account id, e.g. meta-pool.near' } }, required: ['account'] },
  },
]);

const json = (v) => JSON.stringify(v, (_k, x) => (typeof x === 'bigint' ? x.toString() : x), 2); // I10: BigInt as a decimal string

// One JSON-RPC message -> its response object, or null for a notification. `rpc` is injectable for tests.
export async function handle(msg, { rpc } = {}) {
  const { id, method, params } = msg ?? {};
  const isNotification = id === undefined;
  const ok = (result) => (isNotification ? null : { jsonrpc: '2.0', id, result });
  const err = (code, message) => (isNotification ? null : { jsonrpc: '2.0', id, error: { code, message } });
  if (msg?.jsonrpc !== '2.0' || typeof method !== 'string') return err(-32600, 'Invalid Request');
  switch (method) {
    case 'initialize': {
      const asked = params?.protocolVersion;
      return ok({ protocolVersion: PROTOCOL_VERSIONS.includes(asked) ? asked : PROTOCOL_VERSIONS[0], capabilities: { tools: {} }, serverInfo: SERVER,
        instructions: 'Docket reads NEAR mainnet only. Its checks flag and never clear: no result means "safe".' });
    }
    case 'notifications/initialized': return null;
    case 'ping': return ok({});
    case 'tools/list': return ok({ tools: TOOLS });
    case 'tools/call': {
      const name = params?.name; const a = params?.arguments ?? {};
      try {
        let result;
        if (name === 'check_proposal') {
          if (typeof a.dao !== 'string' || !Number.isInteger(a.proposal_id)) return ok({ content: [{ type: 'text', text: 'check_proposal needs dao (string) and proposal_id (integer)' }], isError: true });
          result = await checkProposal(a.dao, a.proposal_id, { rpc });
        } else if (name === 'check_account') {
          if (typeof a.account !== 'string') return ok({ content: [{ type: 'text', text: 'check_account needs account (string)' }], isError: true });
          result = await checkAccount(a.account, { rpc });
        } else return err(-32602, `Unknown tool: ${name}`);
        return ok({ content: [{ type: 'text', text: json(result) }], isError: false });
      } catch (e) {
        return ok({ content: [{ type: 'text', text: `Unknown: the check failed while reading (${e?.message ?? e})` }], isError: true });
      }
    }
    default: return err(-32601, `Method not found: ${method}`);
  }
}

export function serve({ input = process.stdin, output = process.stdout, rpc } = {}) {
  const rl = createInterface({ input, crlfDelay: Infinity });
  rl.on('line', async (line) => {
    if (!line.trim()) return;
    let msg;
    try { msg = JSON.parse(line); } catch { output.write(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }) + '\n'); return; }
    const res = await handle(msg, { rpc });
    if (res) output.write(JSON.stringify(res) + '\n');
  });
  return rl;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) serve();
