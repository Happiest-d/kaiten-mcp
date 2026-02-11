import { describe, it, expect, vi, beforeEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerGetTaskStatus } from '../../src/tools/get-task-status.js';
import { KaitenClient, KaitenApiError } from '../../src/kaiten/client.js';
import type { TaskStatus, TaskStatusError } from '../../src/kaiten/types.js';

describe('get-task-status tool', () => {
  let server: McpServer;
  let registeredCallback: (params: Record<string, unknown>) => Promise<unknown>;
  let mockClient: {
    getCard: ReturnType<typeof vi.fn>;
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
      getCard: vi.fn(),
    };

    registerGetTaskStatus(server, mockClient as unknown as KaitenClient);
  });

  it('should register tool with name "get-task-status"', () => {
    expect(server.registerTool).toHaveBeenCalledWith(
      'get-task-status',
      expect.objectContaining({
        title: 'Get Task Status',
        description: expect.any(String),
        inputSchema: expect.anything(),
      }),
      expect.any(Function),
    );
  });

  it('should return status for single card', async () => {
    mockClient.getCard.mockResolvedValueOnce({
      card_id: 12345,
      title: 'Исправить баг в авторизации',
      description: 'Описание',
      state: 'active',
      board_id: 10,
      column_id: 101,
      lane_id: null,
      owner_id: 501,
      members: [],
      tags: [],
      created_at: '2026-02-01T10:00:00Z',
      updated_at: '2026-02-10T14:30:00Z',
    });

    const result = await registeredCallback({
      card_ids: [12345],
    }) as { content: Array<{ type: string; text: string }> };

    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe('text');

    const parsed = JSON.parse(result.content[0].text) as TaskStatus[];
    expect(parsed).toHaveLength(1);
    expect(parsed[0].card_id).toBe(12345);
    expect(parsed[0].title).toBe('Исправить баг в авторизации');
    expect(parsed[0].board_id).toBe(10);
    expect(parsed[0].column_id).toBe(101);
    expect(parsed[0].state).toBe('active');
    expect(parsed[0].updated_at).toBe('2026-02-10T14:30:00Z');
  });

  it('should return statuses for multiple cards', async () => {
    mockClient.getCard.mockResolvedValueOnce({
      card_id: 12345,
      title: 'Исправить баг в авторизации',
      description: 'Описание',
      state: 'active',
      board_id: 10,
      column_id: 101,
      lane_id: null,
      owner_id: 501,
      members: [],
      tags: [],
      created_at: '2026-02-01T10:00:00Z',
      updated_at: '2026-02-10T14:30:00Z',
    });
    mockClient.getCard.mockResolvedValueOnce({
      card_id: 67890,
      title: 'Добавить новую фичу',
      description: null,
      state: 'active',
      board_id: 20,
      column_id: 202,
      lane_id: 5,
      owner_id: 502,
      members: [],
      tags: [],
      created_at: '2026-02-05T08:00:00Z',
      updated_at: '2026-02-11T09:00:00Z',
    });

    const result = await registeredCallback({
      card_ids: [12345, 67890],
    }) as { content: Array<{ type: string; text: string }> };

    const parsed = JSON.parse(result.content[0].text) as TaskStatus[];
    expect(parsed).toHaveLength(2);
    expect(parsed[0].card_id).toBe(12345);
    expect(parsed[0].title).toBe('Исправить баг в авторизации');
    expect(parsed[1].card_id).toBe(67890);
    expect(parsed[1].title).toBe('Добавить новую фичу');
    expect(parsed[1].board_id).toBe(20);
    expect(parsed[1].column_id).toBe(202);
  });

  it('should handle partial success (some cards not found)', async () => {
    mockClient.getCard.mockResolvedValueOnce({
      card_id: 12345,
      title: 'Исправить баг в авторизации',
      description: 'Описание',
      state: 'active',
      board_id: 10,
      column_id: 101,
      lane_id: null,
      owner_id: 501,
      members: [],
      tags: [],
      created_at: '2026-02-01T10:00:00Z',
      updated_at: '2026-02-10T14:30:00Z',
    });
    mockClient.getCard.mockRejectedValueOnce(
      new KaitenApiError('Карточка не найдена', 404, '/cards/99999'),
    );

    const result = await registeredCallback({
      card_ids: [12345, 99999],
    }) as { content: Array<{ type: string; text: string }> };

    const parsed = JSON.parse(result.content[0].text) as (TaskStatus | TaskStatusError)[];
    expect(parsed).toHaveLength(2);

    const success = parsed[0] as TaskStatus;
    expect(success.card_id).toBe(12345);
    expect(success.title).toBe('Исправить баг в авторизации');

    const failure = parsed[1] as TaskStatusError;
    expect(failure.card_id).toBe(99999);
    expect(failure.error).toBe('Карточка не найдена');
  });

  it('should return error for auth failure (all cards fail)', async () => {
    mockClient.getCard.mockRejectedValueOnce(
      new KaitenApiError('Ошибка авторизации. Проверьте KAITEN_API_TOKEN', 401, '/cards/12345'),
    );

    const result = await registeredCallback({
      card_ids: [12345],
    }) as { isError: boolean; content: Array<{ type: string; text: string }> };

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe('Ошибка авторизации. Проверьте KAITEN_API_TOKEN');
  });

  it('should return TaskStatusError for non-existent card', async () => {
    mockClient.getCard.mockRejectedValueOnce(
      new KaitenApiError('Карточка не найдена', 404, '/cards/99999'),
    );

    const result = await registeredCallback({
      card_ids: [99999],
    }) as { content: Array<{ type: string; text: string }> };

    const parsed = JSON.parse(result.content[0].text) as (TaskStatus | TaskStatusError)[];
    expect(parsed).toHaveLength(1);

    const failure = parsed[0] as TaskStatusError;
    expect(failure.card_id).toBe(99999);
    expect(failure.error).toBe('Карточка не найдена');
  });
});
