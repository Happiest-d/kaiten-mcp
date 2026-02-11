import { describe, it, expect, vi, beforeEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerCreateTask } from '../../src/tools/create-task.js';
import { KaitenClient, KaitenApiError } from '../../src/kaiten/client.js';
import type { CreatedTask } from '../../src/kaiten/types.js';

function createMockCreatedTask(overrides: Partial<CreatedTask> = {}): CreatedTask {
  return {
    card_id: 12350,
    title: 'Добавить валидацию email',
    board_id: 10,
    column_id: 100,
    lane_id: null,
    state: 'active',
    created_at: '2026-02-11T10:00:00Z',
    ...overrides,
  };
}

describe('create-task tool', () => {
  let server: McpServer;
  let registeredCallback: (params: Record<string, unknown>) => Promise<unknown>;
  let mockClient: {
    createCard: ReturnType<typeof vi.fn>;
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
      createCard: vi.fn(),
    };

    registerCreateTask(server, mockClient as unknown as KaitenClient);
  });

  it('should register tool with name "create-task"', () => {
    expect(server.registerTool).toHaveBeenCalledWith(
      'create-task',
      expect.objectContaining({
        title: 'Create Task',
        description: expect.any(String),
        inputSchema: expect.anything(),
      }),
      expect.any(Function),
    );
  });

  it('should create minimal task (title + board_id + column_id)', async () => {
    const mockTask = createMockCreatedTask();
    mockClient.createCard.mockResolvedValueOnce(mockTask);

    const result = await registeredCallback({
      title: 'Добавить валидацию email',
      board_id: 10,
      column_id: 100,
    }) as { content: Array<{ type: string; text: string }> };

    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe('text');

    const parsed = JSON.parse(result.content[0].text) as CreatedTask;
    expect(parsed.card_id).toBe(12350);
    expect(parsed.title).toBe('Добавить валидацию email');
    expect(parsed.board_id).toBe(10);
    expect(parsed.column_id).toBe(100);
    expect(parsed.lane_id).toBeNull();
    expect(parsed.state).toBe('active');
    expect(parsed.created_at).toBe('2026-02-11T10:00:00Z');
  });

  it('should create task with all optional fields', async () => {
    const mockTask = createMockCreatedTask({ lane_id: 5 });
    mockClient.createCard.mockResolvedValueOnce(mockTask);

    const params = {
      title: 'Добавить валидацию email',
      board_id: 10,
      column_id: 100,
      description: 'Подробное описание задачи',
      lane_id: 5,
      position: 1,
      tags: [1, 2, 3],
    };

    await registeredCallback(params);

    expect(mockClient.createCard).toHaveBeenCalledWith(params);
  });

  it('should return error on auth failure (401)', async () => {
    mockClient.createCard.mockRejectedValueOnce(
      new KaitenApiError('Ошибка авторизации. Проверьте KAITEN_API_TOKEN', 401, '/cards'),
    );

    const result = await registeredCallback({
      title: 'Test',
      board_id: 10,
      column_id: 100,
    }) as { isError: boolean; content: Array<{ type: string; text: string }> };

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe('Ошибка авторизации. Проверьте KAITEN_API_TOKEN');
  });

  it('should return error on forbidden (403)', async () => {
    mockClient.createCard.mockRejectedValueOnce(
      new KaitenApiError('Нет доступа к карточке', 403, '/cards'),
    );

    const result = await registeredCallback({
      title: 'Test',
      board_id: 10,
      column_id: 100,
    }) as { isError: boolean; content: Array<{ type: string; text: string }> };

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe('Нет доступа к карточке');
  });

  it('should return error on not found (404)', async () => {
    mockClient.createCard.mockRejectedValueOnce(
      new KaitenApiError('Карточка не найдена', 404, '/cards'),
    );

    const result = await registeredCallback({
      title: 'Test',
      board_id: 10,
      column_id: 100,
    }) as { isError: boolean; content: Array<{ type: string; text: string }> };

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe('Карточка не найдена');
  });

  it('should pass all params to client.createCard', async () => {
    const mockTask = createMockCreatedTask();
    mockClient.createCard.mockResolvedValueOnce(mockTask);

    const params = {
      title: 'Добавить валидацию email',
      board_id: 10,
      column_id: 100,
      description: 'Описание',
      lane_id: 5,
      position: 2,
      tags: [10, 20],
    };

    await registeredCallback(params);

    expect(mockClient.createCard).toHaveBeenCalledOnce();
    expect(mockClient.createCard).toHaveBeenCalledWith(params);
  });
});
