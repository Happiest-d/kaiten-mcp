import { describe, it, expect, vi, beforeEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerUpdateTask } from '../../src/tools/update-task.js';
import { KaitenClient, KaitenApiError } from '../../src/kaiten/client.js';
import type { UpdatedTask } from '../../src/kaiten/types.js';

function createMockUpdatedTask(overrides: Partial<UpdatedTask> = {}): UpdatedTask {
  return {
    card_id: 12345,
    title: 'Updated title',
    description: 'Updated description',
    board_id: 10,
    column_id: 102,
    lane_id: 50,
    state: 'active',
    owner_id: 501,
    members: [
      { id: 501, full_name: 'Иван Иванов' },
    ],
    tags: [
      { id: 1, name: 'updated' },
    ],
    updated_at: '2026-02-12T20:00:00Z',
    ...overrides,
  };
}

describe('update-task tool', () => {
  let server: McpServer;
  let registeredCallback: (params: Record<string, unknown>) => Promise<unknown>;
  let mockClient: {
    updateCard: ReturnType<typeof vi.fn>;
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
      updateCard: vi.fn(),
    };

    registerUpdateTask(server, mockClient as unknown as KaitenClient);
  });

  it('should register tool with name "update-task"', () => {
    expect(server.registerTool).toHaveBeenCalledWith(
      'update-task',
      expect.objectContaining({
        title: 'Update Task',
        description: expect.any(String),
        inputSchema: expect.anything(),
      }),
      expect.any(Function),
    );
  });

  it('should update only title field', async () => {
    const mockTask = createMockUpdatedTask({ title: 'New title' });
    mockClient.updateCard.mockResolvedValueOnce(mockTask);

    const result = await registeredCallback({
      card_id: 12345,
      title: 'New title',
    }) as { content: Array<{ type: string; text: string }> };

    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe('text');

    const parsed = JSON.parse(result.content[0].text) as UpdatedTask;
    expect(parsed.card_id).toBe(12345);
    expect(parsed.title).toBe('New title');
    expect(parsed.updated_at).toBe('2026-02-12T20:00:00Z');
  });

  it('should update only description field', async () => {
    const mockTask = createMockUpdatedTask({ description: 'New description' });
    mockClient.updateCard.mockResolvedValueOnce(mockTask);

    await registeredCallback({
      card_id: 12345,
      description: 'New description',
    });

    expect(mockClient.updateCard).toHaveBeenCalledWith(12345, {
      description: 'New description',
    });
  });

  it('should update multiple fields at once', async () => {
    const mockTask = createMockUpdatedTask({
      title: 'Multi-field update',
      column_id: 105,
      owner_id: 502,
    });
    mockClient.updateCard.mockResolvedValueOnce(mockTask);

    await registeredCallback({
      card_id: 12345,
      title: 'Multi-field update',
      column_id: 105,
      owner_id: 502,
    });

    expect(mockClient.updateCard).toHaveBeenCalledWith(12345, {
      title: 'Multi-field update',
      column_id: 105,
      owner_id: 502,
    });
  });

  it('should update members array', async () => {
    const mockTask = createMockUpdatedTask({
      members: [
        { id: 501, full_name: 'Иван Иванов' },
        { id: 502, full_name: 'Мария Петрова' },
      ],
    });
    mockClient.updateCard.mockResolvedValueOnce(mockTask);

    await registeredCallback({
      card_id: 12345,
      members: [501, 502],
    });

    expect(mockClient.updateCard).toHaveBeenCalledWith(12345, {
      members: [501, 502],
    });
  });

  it('should update tags array', async () => {
    const mockTask = createMockUpdatedTask({
      tags: [
        { id: 1, name: 'bug' },
        { id: 2, name: 'urgent' },
      ],
    });
    mockClient.updateCard.mockResolvedValueOnce(mockTask);

    await registeredCallback({
      card_id: 12345,
      tags: [1, 2],
    });

    expect(mockClient.updateCard).toHaveBeenCalledWith(12345, {
      tags: [1, 2],
    });
  });

  it('should return error on not found (404)', async () => {
    mockClient.updateCard.mockRejectedValueOnce(
      new KaitenApiError('Карточка не найдена', 404, '/cards/99999'),
    );

    const result = await registeredCallback({
      card_id: 99999,
      title: 'Test',
    }) as { isError: boolean; content: Array<{ type: string; text: string }> };

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe('Карточка не найдена');
  });

  it('should return error on forbidden (403)', async () => {
    mockClient.updateCard.mockRejectedValueOnce(
      new KaitenApiError('Нет доступа к карточке', 403, '/cards/12345'),
    );

    const result = await registeredCallback({
      card_id: 12345,
      title: 'Test',
    }) as { isError: boolean; content: Array<{ type: string; text: string }> };

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe('Нет доступа к карточке');
  });

  it('should return error on auth failure (401)', async () => {
    mockClient.updateCard.mockRejectedValueOnce(
      new KaitenApiError('Ошибка авторизации. Проверьте KAITEN_API_TOKEN', 401, '/cards/12345'),
    );

    const result = await registeredCallback({
      card_id: 12345,
      title: 'Test',
    }) as { isError: boolean; content: Array<{ type: string; text: string }> };

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe('Ошибка авторизации. Проверьте KAITEN_API_TOKEN');
  });

  it('should pass correct params to client.updateCard (excluding card_id)', async () => {
    const mockTask = createMockUpdatedTask();
    mockClient.updateCard.mockResolvedValueOnce(mockTask);

    const params = {
      card_id: 12345,
      title: 'New title',
      description: 'New description',
      column_id: 105,
    };

    await registeredCallback(params);

    expect(mockClient.updateCard).toHaveBeenCalledOnce();
    expect(mockClient.updateCard).toHaveBeenCalledWith(12345, {
      title: 'New title',
      description: 'New description',
      column_id: 105,
    });
  });
});
