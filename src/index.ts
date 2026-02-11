import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from './server.js';

const token = process.env.KAITEN_API_TOKEN;
if (!token) {
  console.error('KAITEN_API_TOKEN is required');
  process.exit(1);
}

const baseUrl = process.env.KAITEN_BASE_URL;
if (!baseUrl) {
  console.error('KAITEN_BASE_URL is required (e.g. https://mycompany.kaiten.ru/api/latest)');
  process.exit(1);
}

const server = createServer({ token, baseUrl });
const transport = new StdioServerTransport();
await server.connect(transport);
