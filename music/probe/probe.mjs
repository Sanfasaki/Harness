// Pre-flight: connect to the local NetEase MCP server with the SAME SDK/transport
// DSH uses (@modelcontextprotocol/sdk 1.30, StreamableHTTPClientTransport), so a
// green run here means dsh-mcp-client should also be able to attach.
//
// The sdk is imported by absolute path because this directory has no node_modules;
// bare imports inside the sdk still resolve from its own location under DSH_HOME.
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const dshHome = process.env.DSH_HOME || join(process.env.USERPROFILE || process.env.HOME || '.', '.dsh');
const SDK = pathToFileURL(join(dshHome, 'profiles', 'node_modules', '@modelcontextprotocol', 'sdk', 'dist', 'esm')).href;

const { Client } = await import(`${SDK}/client/index.js`);
const { StreamableHTTPClientTransport } = await import(`${SDK}/client/streamableHttp.js`);

const url = new URL(process.argv[2] || 'http://127.0.0.1:3456/');
const transport = new StreamableHTTPClientTransport(url);
const client = new Client({ name: 'dsh-netease-probe', version: '0.0.0' }, { capabilities: {} });

try {
  await client.connect(transport);
  console.log('[ok] connected to', url.href);
  const { tools } = await client.listTools();
  console.log('[ok] tools:', tools.length);
  for (const t of tools) console.log('  -', t.name, '|', t.description?.slice(0, 60));
  const res = await client.callTool({ name: 'search_song', arguments: { query: '陈奕迅', limit: 2 } });
  console.log('[ok] callTool search_song ->', JSON.stringify(res.content?.[0]?.text ?? res).slice(0, 300));
} catch (err) {
  console.error('[fail]', err?.message || err);
  process.exitCode = 1;
} finally {
  await client.close().catch(() => {});
}
