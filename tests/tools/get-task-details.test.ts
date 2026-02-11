import { describe, it, expect, vi, beforeEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerGetTaskDetails } from '../../src/tools/get-task-details.js';
import { KaitenClient, KaitenApiError } from '../../src/kaiten/client.js';
import type { TaskDetails, CommentsPage } from '../../src/kaiten/types.js';

function createMockTaskDetails(overrides: Partial<TaskDetails> = {}): TaskDetails {
  return {
    card_id: 12345,
    title: 'Исправить баг в авторизации',
    description: 'При входе через SSO токен не обновляется. Нужно добавить refresh logic.',
    state: 'active',
    board_id: 10,
    column_id: 101,
    lane_id: null,
    owner_id: 501,
    members: [
      { id: 501, full_name: 'Иван Иванов' },
      { id: 502, full_name: 'Мария Петрова' },
    ],
    tags: [
      { id: 1, name: 'bug' },
      { id: 2, name: 'auth' },
    ],
    created_at: '2026-02-01T10:00:00Z',
    updated_at: '2026-02-10T14:30:00Z',
    ...overrides,
  };
}

function createMockCommentsPage(overrides: Partial<CommentsPage> = {}): CommentsPage {
  return {
    items: [
      {
        id: 301,
        author_id: 502,
        text: 'Проверила — баг воспроизводится стабильно на staging',
        created_at: '2026-02-05T12:00:00Z',
        updated_at: '2026-02-05T12:00:00Z',
      },
      {
        id: 302,
        author_id: 501,
        text: 'Нашёл причину, готовлю фикс',
        created_at: '2026-02-08T09:00:00Z',
        updated_at: '2026-02-08T09:00:00Z',
      },
    ],
    total: 2,
    limit: 20,
    offset: 0,
    has_more: false,
    ...overrides,
  };
}

describe('get-task-details tool', () => {
  let server: McpServer;
  let registeredCallback: (params: Record<string, unknown>) => Promise<unknown>;
  let mockClient: {
    getCard: ReturnType<typeof vi.fn>;
    getCardComments: ReturnType<typeof vi.fn>;
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
      getCardComments: vi.fn(),
    };

    registerGetTaskDetails(server, mockClient as unknown as KaitenClient);
  });

  it('should register tool with name "get-task-details"', () => {
    expect(server.registerTool).toHaveBeenCalledWith(
      'get-task-details',
      expect.objectContaining({
        title: 'Get Task Details',
        description: expect.any(String),
        inputSchema: expect.anything(),
      }),
      expect.any(Function),
    );
  });

  it('should return task with comments by default', async () => {
    const mockTask = createMockTaskDetails();
    const mockComments = createMockCommentsPage();

    mockClient.getCard.mockResolvedValueOnce(mockTask);
    mockClient.getCardComments.mockResolvedValueOnce(mockComments);

    const result = await registeredCallback({
      card_id: 12345,
      include_comments: true,
      comments_limit: 20,
      comments_offset: 0,
    }) as { content: Array<{ type: string; text: string }> };

    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe('text');

    const parsed = JSON.parse(result.content[0].text) as TaskDetails;
    expect(parsed.card_id).toBe(12345);
    expect(parsed.title).toBe('Исправить баг в авторизации');
    expect(parsed.description).toBe(
      'При входе через SSO токен не обновляется. Нужно добавить refresh logic.',
    );
    expect(parsed.state).toBe('active');
    expect(parsed.board_id).toBe(10);
    expect(parsed.column_id).toBe(101);
    expect(parsed.owner_id).toBe(501);
    expect(parsed.comments).toBeDefined();
    expect(parsed.comments!.items).toHaveLength(2);
    expect(parsed.comments!.total).toBe(2);
    expect(parsed.comments!.limit).toBe(20);
    expect(parsed.comments!.offset).toBe(0);
    expect(parsed.comments!.has_more).toBe(false);
  });

  it('should return task without comments when include_comments is false', async () => {
    const mockTask = createMockTaskDetails();
    mockClient.getCard.mockResolvedValueOnce(mockTask);

    const result = await registeredCallback({
      card_id: 12345,
      include_comments: false,
      comments_limit: 20,
      comments_offset: 0,
    }) as { content: Array<{ type: string; text: string }> };

    const parsed = JSON.parse(result.content[0].text) as TaskDetails;
    expect(parsed.card_id).toBe(12345);
    expect(parsed.comments).toBeUndefined();
    expect(mockClient.getCardComments).not.toHaveBeenCalled();
  });

  it('should support comments pagination', async () => {
    const mockTask = createMockTaskDetails();
    const paginatedComments: CommentsPage = {
      items: [
        {
          id: 311,
          author_id: 503,
          text: 'Добавил unit-тесты на этот кейс',
          created_at: '2026-02-10T15:00:00Z',
          updated_at: '2026-02-10T15:00:00Z',
        },
      ],
      total: 11,
      limit: 10,
      offset: 10,
      has_more: false,
    };

    mockClient.getCard.mockResolvedValueOnce(mockTask);
    mockClient.getCardComments.mockResolvedValueOnce(paginatedComments);

    const result = await registeredCallback({
      card_id: 12345,
      include_comments: true,
      comments_limit: 10,
      comments_offset: 10,
    }) as { content: Array<{ type: string; text: string }> };

    expect(mockClient.getCardComments).toHaveBeenCalledWith(12345, {
      limit: 10,
      offset: 10,
    });

    const parsed = JSON.parse(result.content[0].text) as TaskDetails;
    expect(parsed.comments).toBeDefined();
    expect(parsed.comments!.items).toHaveLength(1);
    expect(parsed.comments!.offset).toBe(10);
    expect(parsed.comments!.limit).toBe(10);
    expect(parsed.comments!.total).toBe(11);
  });

  it('should handle task with null description', async () => {
    const mockTask = createMockTaskDetails({ description: null });
    const mockComments = createMockCommentsPage();

    mockClient.getCard.mockResolvedValueOnce(mockTask);
    mockClient.getCardComments.mockResolvedValueOnce(mockComments);

    const result = await registeredCallback({
      card_id: 12345,
      include_comments: true,
      comments_limit: 20,
      comments_offset: 0,
    }) as { content: Array<{ type: string; text: string }> };

    const parsed = JSON.parse(result.content[0].text) as TaskDetails;
    expect(parsed.description).toBeNull();
  });

  it('should return error for non-existent card', async () => {
    mockClient.getCard.mockRejectedValueOnce(
      new KaitenApiError('Карточка не найдена', 404, '/cards/99999'),
    );

    const result = await registeredCallback({
      card_id: 99999,
      include_comments: true,
      comments_limit: 20,
      comments_offset: 0,
    }) as { isError: boolean; content: Array<{ type: string; text: string }> };

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe('Карточка не найдена');
  });

  it('should return error on auth failure', async () => {
    mockClient.getCard.mockRejectedValueOnce(
      new KaitenApiError('Ошибка авторизации. Проверьте KAITEN_API_TOKEN', 401, '/cards/12345'),
    );

    const result = await registeredCallback({
      card_id: 12345,
      include_comments: true,
      comments_limit: 20,
      comments_offset: 0,
    }) as { isError: boolean; content: Array<{ type: string; text: string }> };

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe(
      'Ошибка авторизации. Проверьте KAITEN_API_TOKEN',
    );
  });

  it('should return error on access denied', async () => {
    mockClient.getCard.mockRejectedValueOnce(
      new KaitenApiError('Нет доступа к карточке', 403, '/cards/12345'),
    );

    const result = await registeredCallback({
      card_id: 12345,
      include_comments: true,
      comments_limit: 20,
      comments_offset: 0,
    }) as { isError: boolean; content: Array<{ type: string; text: string }> };

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe('Нет доступа к карточке');
  });

  it('should handle unexpected errors gracefully', async () => {
    mockClient.getCard.mockRejectedValueOnce(new Error('Something unexpected'));

    const result = await registeredCallback({
      card_id: 12345,
      include_comments: true,
      comments_limit: 20,
      comments_offset: 0,
    }) as { isError: boolean; content: Array<{ type: string; text: string }> };

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe('Внутренняя ошибка сервера');
  });

  it('should handle task with null owner_id and empty members', async () => {
    const mockTask = createMockTaskDetails({
      owner_id: null,
      members: [],
    });
    const mockComments = createMockCommentsPage();

    mockClient.getCard.mockResolvedValueOnce(mockTask);
    mockClient.getCardComments.mockResolvedValueOnce(mockComments);

    const result = await registeredCallback({
      card_id: 12345,
      include_comments: true,
      comments_limit: 20,
      comments_offset: 0,
    }) as { content: Array<{ type: string; text: string }> };

    const parsed = JSON.parse(result.content[0].text) as TaskDetails;
    expect(parsed.owner_id).toBeNull();
    expect(parsed.members).toEqual([]);
  });

  it('should handle task with empty comments list', async () => {
    const mockTask = createMockTaskDetails();
    const emptyComments: CommentsPage = {
      items: [],
      total: 0,
      limit: 20,
      offset: 0,
      has_more: false,
    };

    mockClient.getCard.mockResolvedValueOnce(mockTask);
    mockClient.getCardComments.mockResolvedValueOnce(emptyComments);

    const result = await registeredCallback({
      card_id: 12345,
      include_comments: true,
      comments_limit: 20,
      comments_offset: 0,
    }) as { content: Array<{ type: string; text: string }> };

    const parsed = JSON.parse(result.content[0].text) as TaskDetails;
    expect(parsed.comments).toBeDefined();
    expect(parsed.comments!.items).toHaveLength(0);
    expect(parsed.comments!.total).toBe(0);
    expect(parsed.comments!.has_more).toBe(false);
  });

  it('should return error on timeout', async () => {
    mockClient.getCard.mockRejectedValueOnce(
      new KaitenApiError(
        'Превышено время ожидания ответа от Kaiten API',
        0,
        '/cards/12345',
      ),
    );

    const result = await registeredCallback({
      card_id: 12345,
      include_comments: true,
      comments_limit: 20,
      comments_offset: 0,
    }) as { isError: boolean; content: Array<{ type: string; text: string }> };

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe(
      'Превышено время ожидания ответа от Kaiten API',
    );
  });

  it('should return error on network error', async () => {
    mockClient.getCard.mockRejectedValueOnce(
      new KaitenApiError(
        'Ошибка сети: TypeError: Failed to fetch',
        0,
        '/cards/12345',
      ),
    );

    const result = await registeredCallback({
      card_id: 12345,
      include_comments: true,
      comments_limit: 20,
      comments_offset: 0,
    }) as { isError: boolean; content: Array<{ type: string; text: string }> };

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Ошибка сети');
  });
});
