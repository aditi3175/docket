// guard/mcp.mjs — §17.1: the two checks as MCP tools over stdio. I9 (the tool output is flags and
// unknowns; nothing says safe), I10 (BigInt serialised as a decimal string).
// Recorded: burrow #1741–#1744 for the tools/call test. The stdio test spawns the real server and uses
// only methods that need no network (initialize, tools/list).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createRpc } from '../web/assets/rpc.js';
import { handle, TOOLS, PROTOCOL_VERSIONS } from '../guard/mcp.mjs';
import { replayFetch, noSleep } from './helpers.mjs';

test('initialize echoes a supported protocol version; tools/list has the two tools with schemas; unknown method -> -32601', async () => {
  const init = await handle({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 't', version: '0' } } });
  assert.equal(init.result.protocolVersion, '2025-03-26');
  assert.deepEqual(init.result.capabilities, { tools: {} });
  assert.equal((await handle({ jsonrpc: '2.0', id: 2, method: 'initialize', params: { protocolVersion: '1999-01-01' } })).result.protocolVersion, PROTOCOL_VERSIONS[0]);
  assert.equal(await handle({ jsonrpc: '2.0', method: 'notifications/initialized' }), null);
  const list = await handle({ jsonrpc: '2.0', id: 3, method: 'tools/list' });
  assert.deepEqual(list.result.tools.map((t) => t.name), ['check_proposal', 'check_account']);
  for (const t of TOOLS) assert.equal(t.inputSchema.type, 'object');
  assert.equal((await handle({ jsonrpc: '2.0', id: 4, method: 'nope' })).error.code, -32601);
  assert.equal((await handle({ id: 5, method: 'ping' })).error.code, -32600);
});

test('recorded: tools/call check_account returns the guard result as text; bad arguments are a tool error, not a crash', async () => {
  const rpc = createRpc({ fetch: replayFetch(), sleep: noSleep });
  const r = await handle({ jsonrpc: '2.0', id: 6, method: 'tools/call', params: { name: 'check_account', arguments: { account: 'meta-pool.near' } } }, { rpc });
  assert.equal(r.result.isError, false);
  const body = JSON.parse(r.result.content[0].text);
  assert.equal(body.noVoteRoots.length, 3);
  assert.doesNotMatch(r.result.content[0].text, /"safe"|"score"|"verdict"/);
  const bad = await handle({ jsonrpc: '2.0', id: 7, method: 'tools/call', params: { name: 'check_proposal', arguments: { dao: 'x.sputnik-dao.near' } } });
  assert.equal(bad.result.isError, true);
  assert.equal((await handle({ jsonrpc: '2.0', id: 8, method: 'tools/call', params: { name: 'other' } })).error.code, -32602);
});

test('stdio: the real server answers initialize and tools/list, one JSON message per line', async () => {
  const child = spawn(process.execPath, [new URL('../guard/mcp.mjs', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')], { stdio: ['pipe', 'pipe', 'pipe'] });
  const lines = [];
  const done = new Promise((resolve) => {
    let buf = '';
    child.stdout.on('data', (d) => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { lines.push(JSON.parse(buf.slice(0, i))); buf = buf.slice(i + 1); if (lines.length === 2) resolve(); } });
  });
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } }) + '\n');
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }) + '\n');
  await Promise.race([done, new Promise((_, rej) => setTimeout(() => rej(new Error('no answer from mcp.mjs')), 10_000))]);
  child.kill();
  assert.deepEqual(lines.map((l) => l.id), [1, 2]);
  assert.equal(lines[0].result.serverInfo.name, 'docket-guard');
  assert.equal(lines[1].result.tools.length, 2);
});
