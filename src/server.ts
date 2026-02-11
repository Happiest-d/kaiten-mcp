import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { KaitenClient, type KaitenClientConfig } from './kaiten/client.js';
import { registerGetTaskDetails } from './tools/get-task-details.js';
import { registerGetTimeLogs } from './tools/get-time-logs.js';

export function createServer(clientConfig: KaitenClientConfig): McpServer {
  const server = new McpServer({
    name: 'kaiten-mcp',
    version: '0.1.0',
  });

  const client = new KaitenClient(clientConfig);

  registerGetTaskDetails(server, client);
  registerGetTimeLogs(server, client);

  return server;
}
