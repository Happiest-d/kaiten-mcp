import { describe, it, expect, vi, beforeEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerGetTimeLogs } from '../../src/tools/get-time-logs.js';
import { KaitenClient, KaitenApiError } from '../../src/kaiten/client.js';
import type {
  TimeLogsResponse,
  TimeLogsByUser,
  TimeLogsByDate,
  TimeLogEntry,
} from '../../src/kaiten/types.js';

function createMockTimeLogEntries(): TimeLogEntry[] {
  return [
    {
      id: 1,
      user_id: 501,
      author_id: 501,
      time_spent: 120,
      for_date: '2026-02-10',
      comment: 'Рефакторинг модуля авторизации',
      created_at: '2026-02-10T16:00:00Z',
    },
    {
      id: 2,
      user_id: 502,
      author_id: 502,
      time_spent: 90,
      for_date: '2026-02-10',
      comment: 'Ревью кода',
      created_at: '2026-02-10T18:00:00Z',
    },
    {
      id: 3,
      user_id: 501,
      author_id: 501,
      time_spent: 60,
      for_date: '2026-02-11',
      comment: null,
      created_at: '2026-02-11T12:00:00Z',
    },
  ];
}

describe('get-time-logs tool', () => {
  let server: McpServer;
  let registeredCallback: (params: Record<string, unknown>) => Promise<unknown>;
  let mockClient: {
    getCardTimeLogs: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    server = new McpServer({ name: 'test-server', version: '1.0.0' });

    const originalRegisterTool = server.registerTool.bind(server);
    vi.spyOn(server, 'registerTool').mockImplementation(
      (name: string, config: unknown, cb: unknown) => {
        registeredCallback = cb as (params: Record<string, unknown>) => Promise<unknown>;
        return originalRegisterTool(name, config as never, cb as never);
      },
    );

    mockClient = {
      getCardTimeLogs: vi.fn(),
    };

    registerGetTimeLogs(server, mockClient as unknown as KaitenClient);
  });

  it('should register tool with name "get-time-logs"', () => {
    expect(server.registerTool).toHaveBeenCalledWith(
      'get-time-logs',
      expect.objectContaining({
        title: 'Get Time Logs',
        description: expect.any(String),
        inputSchema: expect.anything(),
      }),
      expect.any(Function),
    );
  });

  it('should return all time log entries with total_minutes (group_by: none)', async () => {
    const mockEntries = createMockTimeLogEntries();
    mockClient.getCardTimeLogs.mockResolvedValueOnce(mockEntries);

    const result = await registeredCallback({
      card_id: 12345,
      group_by: 'none',
    }) as { content: Array<{ type: string; text: string }> };

    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe('text');

    const parsed = JSON.parse(result.content[0].text) as TimeLogsResponse;
    expect(parsed.card_id).toBe(12345);
    expect(parsed.total_minutes).toBe(270);
    expect(parsed.entries).toHaveLength(3);
    expect(parsed.entries[0].id).toBe(1);
    expect(parsed.entries[0].user_id).toBe(501);
    expect(parsed.entries[0].time_spent).toBe(120);
    expect(parsed.entries[0].for_date).toBe('2026-02-10');
  });

  it('should group entries by user (group_by: user)', async () => {
    const mockEntries = createMockTimeLogEntries();
    mockClient.getCardTimeLogs.mockResolvedValueOnce(mockEntries);

    const result = await registeredCallback({
      card_id: 12345,
      group_by: 'user',
    }) as { content: Array<{ type: string; text: string }> };

    const parsed = JSON.parse(result.content[0].text) as TimeLogsByUser;
    expect(parsed.card_id).toBe(12345);
    expect(parsed.total_minutes).toBe(270);
    expect(parsed.by_user).toHaveLength(2);

    const user501 = parsed.by_user.find(u => u.user_id === 501);
    expect(user501).toBeDefined();
    expect(user501!.total_minutes).toBe(180);
    expect(user501!.entries).toHaveLength(2);

    const user502 = parsed.by_user.find(u => u.user_id === 502);
    expect(user502).toBeDefined();
    expect(user502!.total_minutes).toBe(90);
    expect(user502!.entries).toHaveLength(1);
  });

  it('should group entries by date (group_by: date)', async () => {
    const mockEntries = createMockTimeLogEntries();
    mockClient.getCardTimeLogs.mockResolvedValueOnce(mockEntries);

    const result = await registeredCallback({
      card_id: 12345,
      group_by: 'date',
    }) as { content: Array<{ type: string; text: string }> };

    const parsed = JSON.parse(result.content[0].text) as TimeLogsByDate;
    expect(parsed.card_id).toBe(12345);
    expect(parsed.total_minutes).toBe(270);
    expect(parsed.by_date).toHaveLength(2);

    const feb10 = parsed.by_date.find(d => d.for_date === '2026-02-10');
    expect(feb10).toBeDefined();
    expect(feb10!.total_minutes).toBe(210);
    expect(feb10!.entries).toHaveLength(2);

    const feb11 = parsed.by_date.find(d => d.for_date === '2026-02-11');
    expect(feb11).toBeDefined();
    expect(feb11!.total_minutes).toBe(60);
    expect(feb11!.entries).toHaveLength(1);
  });

  it('should return empty entries with total_minutes 0 when no time logs', async () => {
    mockClient.getCardTimeLogs.mockResolvedValueOnce([]);

    const result = await registeredCallback({
      card_id: 12346,
      group_by: 'none',
    }) as { content: Array<{ type: string; text: string }> };

    const parsed = JSON.parse(result.content[0].text) as TimeLogsResponse;
    expect(parsed.card_id).toBe(12346);
    expect(parsed.total_minutes).toBe(0);
    expect(parsed.entries).toHaveLength(0);
  });

  it('should return error for non-existent card', async () => {
    mockClient.getCardTimeLogs.mockRejectedValueOnce(
      new KaitenApiError('Карточка не найдена', 404, '/cards/99999/time-logs'),
    );

    const result = await registeredCallback({
      card_id: 99999,
      group_by: 'none',
    }) as { isError: boolean; content: Array<{ type: string; text: string }> };

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe('Карточка не найдена');
  });

  it('should return error on auth failure', async () => {
    mockClient.getCardTimeLogs.mockRejectedValueOnce(
      new KaitenApiError('Ошибка авторизации. Проверьте KAITEN_API_TOKEN', 401, '/cards/12345/time-logs'),
    );

    const result = await registeredCallback({
      card_id: 12345,
      group_by: 'none',
    }) as { isError: boolean; content: Array<{ type: string; text: string }> };

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe(
      'Ошибка авторизации. Проверьте KAITEN_API_TOKEN',
    );
  });
});
