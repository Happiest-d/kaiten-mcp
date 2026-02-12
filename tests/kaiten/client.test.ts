import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { KaitenClient, KaitenApiError } from '../../src/kaiten/client.js';
import type { KaitenCard, KaitenComment, KaitenTimeLog, KaitenUpdateCardRequest } from '../../src/kaiten/types.js';

function createMockKaitenCard(overrides: Partial<KaitenCard> = {}): KaitenCard {
  return {
    id: 12345,
    title: 'Test card',
    description: 'Some description',
    state: 1,
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
    created: '2026-02-01T10:00:00Z',
    updated: '2026-02-10T14:30:00Z',
    ...overrides,
  };
}

function createMockKaitenComments(): KaitenComment[] {
  return [
    {
      id: 301,
      text: 'First comment',
      author_id: 502,
      card_id: 12345,
      created: '2026-02-05T12:00:00Z',
      updated: '2026-02-05T12:00:00Z',
    },
    {
      id: 302,
      text: 'Second comment',
      author_id: 501,
      card_id: 12345,
      created: '2026-02-08T09:00:00Z',
      updated: '2026-02-08T09:00:00Z',
    },
  ];
}

describe('KaitenClient', () => {
  const baseUrl = 'https://test.kaiten.io/api/latest';
  const token = 'test-api-token';
  let client: KaitenClient;

  beforeEach(() => {
    client = new KaitenClient({ baseUrl, token });
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getCard', () => {
    it('should make GET request with authorization header and map response', async () => {
      const mockCard = createMockKaitenCard();

      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(JSON.stringify(mockCard), { status: 200 }),
      );

      const result = await client.getCard(12345);

      expect(fetch).toHaveBeenCalledWith(
        `${baseUrl}/cards/12345`,
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            'Authorization': `Bearer ${token}`,
          }),
        }),
      );

      expect(result.card_id).toBe(12345);
      expect(result.title).toBe('Test card');
      expect(result.description).toBe('Some description');
      expect(result.state).toBe('active');
      expect(result.board_id).toBe(10);
      expect(result.column_id).toBe(101);
      expect(result.lane_id).toBeNull();
      expect(result.owner_id).toBe(501);
      expect(result.members).toHaveLength(2);
      expect(result.tags).toHaveLength(2);
      expect(result.created_at).toBe('2026-02-01T10:00:00Z');
      expect(result.updated_at).toBe('2026-02-10T14:30:00Z');
    });

    it('should map null owner_id correctly', async () => {
      const mockCard = createMockKaitenCard({ owner_id: null });

      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(JSON.stringify(mockCard), { status: 200 }),
      );

      const result = await client.getCard(12345);
      expect(result.owner_id).toBeNull();
    });

    it('should throw KaitenApiError on 404', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response('Not found', { status: 404 }),
      );

      await expect(client.getCard(99999)).rejects.toThrow(KaitenApiError);
    });

    it('should throw KaitenApiError with correct message on 404', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response('Not found', { status: 404 }),
      );

      await expect(client.getCard(99999)).rejects.toThrow('Карточка не найдена');
    });

    it('should throw KaitenApiError on 401', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response('Unauthorized', { status: 401 }),
      );

      await expect(client.getCard(12345)).rejects.toThrow(KaitenApiError);
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response('Unauthorized', { status: 401 }),
      );
      await expect(client.getCard(12345)).rejects.toThrow(
        'Ошибка авторизации. Проверьте KAITEN_API_TOKEN',
      );
    });

    it('should throw KaitenApiError on 403', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response('Forbidden', { status: 403 }),
      );

      await expect(client.getCard(12345)).rejects.toThrow(KaitenApiError);
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response('Forbidden', { status: 403 }),
      );
      await expect(client.getCard(12345)).rejects.toThrow(
        'Нет доступа к карточке',
      );
    });

    it('should throw KaitenApiError on timeout (AbortError)', async () => {
      const abortError = new DOMException('The operation was aborted', 'AbortError');

      vi.mocked(fetch).mockRejectedValueOnce(abortError);

      await expect(client.getCard(12345)).rejects.toThrow(KaitenApiError);

      vi.mocked(fetch).mockRejectedValueOnce(
        new DOMException('The operation was aborted', 'AbortError'),
      );
      await expect(client.getCard(12345)).rejects.toThrow(
        'Превышено время ожидания ответа от Kaiten API',
      );
    });

    it('should throw KaitenApiError on network error', async () => {
      vi.mocked(fetch).mockRejectedValueOnce(new TypeError('Failed to fetch'));

      await expect(client.getCard(12345)).rejects.toThrow(KaitenApiError);
      vi.mocked(fetch).mockRejectedValueOnce(new TypeError('Failed to fetch'));
      await expect(client.getCard(12345)).rejects.toThrow('Ошибка сети:');
    });

    it('should map unknown state to unknown_N string', async () => {
      const mockCard = createMockKaitenCard({ state: 99 });

      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(JSON.stringify(mockCard), { status: 200 }),
      );

      const result = await client.getCard(12345);
      expect(result.state).toBe('unknown_99');
    });

    it('should throw KaitenApiError with status code on unexpected HTTP errors', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response('Server Error', { status: 500 }),
      );

      try {
        await client.getCard(12345);
        expect.unreachable('should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(KaitenApiError);
        expect((error as KaitenApiError).statusCode).toBe(500);
        expect((error as KaitenApiError).message).toBe('Ошибка Kaiten API: 500');
        expect((error as KaitenApiError).endpoint).toBe('/cards/12345');
      }
    });
  });

  describe('getCardComments', () => {
    it('should fetch all comments and return paginated slice', async () => {
      const mockComments = createMockKaitenComments();

      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(JSON.stringify(mockComments), { status: 200 }),
      );

      const result = await client.getCardComments(12345, {
        limit: 20,
        offset: 0,
      });

      expect(fetch).toHaveBeenCalledWith(
        `${baseUrl}/cards/12345/comments`,
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            'Authorization': `Bearer ${token}`,
          }),
        }),
      );

      expect(result.items).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(result.limit).toBe(20);
      expect(result.offset).toBe(0);
      expect(result.has_more).toBe(false);

      expect(result.items[0].id).toBe(301);
      expect(result.items[0].author_id).toBe(502);
      expect(result.items[0].created_at).toBe('2026-02-05T12:00:00Z');
      expect(result.items[0].updated_at).toBe('2026-02-05T12:00:00Z');
    });

    it('should calculate has_more correctly with pagination', async () => {
      // Create 5 comments
      const mockComments: KaitenComment[] = Array.from({ length: 5 }, (_, i) => ({
        id: 300 + i,
        text: `Comment ${i}`,
        author_id: 500 + i,
        card_id: 12345,
        created: '2026-02-05T12:00:00Z',
        updated: '2026-02-05T12:00:00Z',
      }));

      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(JSON.stringify(mockComments), { status: 200 }),
      );

      const result = await client.getCardComments(12345, {
        limit: 2,
        offset: 0,
      });

      expect(result.items).toHaveLength(2);
      expect(result.total).toBe(5);
      expect(result.has_more).toBe(true);
    });

    it('should return empty comments page', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(JSON.stringify([]), { status: 200 }),
      );

      const result = await client.getCardComments(12345, {
        limit: 20,
        offset: 0,
      });

      expect(result.items).toHaveLength(0);
      expect(result.total).toBe(0);
      expect(result.has_more).toBe(false);
    });

    it('should calculate has_more false when at exact end of list', async () => {
      const mockComments: KaitenComment[] = Array.from({ length: 5 }, (_, i) => ({
        id: 300 + i,
        text: `Comment ${i}`,
        author_id: 500 + i,
        card_id: 12345,
        created: '2026-02-05T12:00:00Z',
        updated: '2026-02-05T12:00:00Z',
      }));

      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(JSON.stringify(mockComments), { status: 200 }),
      );

      const result = await client.getCardComments(12345, {
        limit: 3,
        offset: 2,
      });

      expect(result.items).toHaveLength(3);
      expect(result.total).toBe(5);
      expect(result.offset).toBe(2);
      expect(result.has_more).toBe(false);
    });

    it('should handle offset beyond total comments', async () => {
      const mockComments: KaitenComment[] = [
        {
          id: 301,
          text: 'Only comment',
          author_id: 502,
          card_id: 12345,
          created: '2026-02-05T12:00:00Z',
          updated: '2026-02-05T12:00:00Z',
        },
      ];

      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(JSON.stringify(mockComments), { status: 200 }),
      );

      const result = await client.getCardComments(12345, {
        limit: 20,
        offset: 100,
      });

      expect(result.items).toHaveLength(0);
      expect(result.total).toBe(1);
      expect(result.has_more).toBe(false);
    });

    it('should throw KaitenApiError on 404', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response('Not found', { status: 404 }),
      );

      await expect(
        client.getCardComments(99999, { limit: 20, offset: 0 }),
      ).rejects.toThrow(KaitenApiError);
    });
  });

  describe('getCardTimeLogs', () => {
    function createMockKaitenTimeLogs(): KaitenTimeLog[] {
      return [
        {
          id: 1,
          card_id: 12345,
          user_id: 501,
          author_id: 501,
          role_id: null,
          time_spent: 120,
          for_date: '2026-02-10',
          comment: 'Рефакторинг модуля авторизации',
          created: '2026-02-10T16:00:00Z',
          updated: '2026-02-10T16:00:00Z',
        },
        {
          id: 2,
          card_id: 12345,
          user_id: 502,
          author_id: 502,
          role_id: null,
          time_spent: 90,
          for_date: '2026-02-10',
          comment: 'Ревью кода',
          created: '2026-02-10T18:00:00Z',
          updated: '2026-02-10T18:00:00Z',
        },
        {
          id: 3,
          card_id: 12345,
          user_id: 501,
          author_id: 501,
          role_id: null,
          time_spent: 60,
          for_date: '2026-02-11',
          comment: null,
          created: '2026-02-11T12:00:00Z',
          updated: '2026-02-11T12:00:00Z',
        },
      ];
    }

    it('should make GET request with auth header and map fields', async () => {
      const mockTimeLogs = createMockKaitenTimeLogs();

      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(JSON.stringify(mockTimeLogs), { status: 200 }),
      );

      const result = await client.getCardTimeLogs(12345);

      expect(fetch).toHaveBeenCalledWith(
        `${baseUrl}/cards/12345/time-logs`,
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            'Authorization': `Bearer ${token}`,
          }),
        }),
      );

      expect(result).toHaveLength(3);
      expect(result[0].id).toBe(1);
      expect(result[0].user_id).toBe(501);
      expect(result[0].author_id).toBe(501);
      expect(result[0].time_spent).toBe(120);
      expect(result[0].for_date).toBe('2026-02-10');
      expect(result[0].comment).toBe('Рефакторинг модуля авторизации');
      expect(result[0].created_at).toBe('2026-02-10T16:00:00Z');
    });

    it('should return empty array when no time logs', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(JSON.stringify([]), { status: 200 }),
      );

      const result = await client.getCardTimeLogs(12345);
      expect(result).toHaveLength(0);
    });

    it('should throw KaitenApiError on 404', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response('Not found', { status: 404 }),
      );

      await expect(client.getCardTimeLogs(99999)).rejects.toThrow(KaitenApiError);
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response('Not found', { status: 404 }),
      );
      await expect(client.getCardTimeLogs(99999)).rejects.toThrow('Карточка не найдена');
    });

    it('should throw KaitenApiError on 401', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response('Unauthorized', { status: 401 }),
      );

      await expect(client.getCardTimeLogs(12345)).rejects.toThrow(KaitenApiError);
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response('Unauthorized', { status: 401 }),
      );
      await expect(client.getCardTimeLogs(12345)).rejects.toThrow(
        'Ошибка авторизации. Проверьте KAITEN_API_TOKEN',
      );
    });
  });

  describe('createCard', () => {
    function createMockKaitenCardResponse(): KaitenCard {
      return {
        id: 12350,
        title: 'Добавить валидацию email',
        description: null,
        state: 1,
        board_id: 10,
        column_id: 100,
        lane_id: null,
        owner_id: null,
        members: [],
        tags: [],
        created: '2026-02-11T10:00:00Z',
        updated: '2026-02-11T10:00:00Z',
      };
    }

    it('should make POST request with auth header and body, map response', async () => {
      const mockCard = createMockKaitenCardResponse();

      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(JSON.stringify(mockCard), { status: 200 }),
      );

      const result = await client.createCard({
        title: 'Добавить валидацию email',
        board_id: 10,
        column_id: 100,
      });

      expect(fetch).toHaveBeenCalledWith(
        `${baseUrl}/cards`,
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Authorization': `Bearer ${token}`,
          }),
          body: JSON.stringify({
            title: 'Добавить валидацию email',
            board_id: 10,
            column_id: 100,
          }),
        }),
      );

      expect(result.card_id).toBe(12350);
      expect(result.title).toBe('Добавить валидацию email');
      expect(result.board_id).toBe(10);
      expect(result.column_id).toBe(100);
      expect(result.lane_id).toBeNull();
      expect(result.state).toBe('active');
      expect(result.created_at).toBe('2026-02-11T10:00:00Z');
    });

    it('should return empty lane_id when null', async () => {
      const mockCard = createMockKaitenCardResponse();

      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(JSON.stringify(mockCard), { status: 200 }),
      );

      const result = await client.createCard({
        title: 'Добавить валидацию email',
        board_id: 10,
        column_id: 100,
      });

      expect(result.lane_id).toBeNull();
    });

    it('should throw KaitenApiError on 401', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response('Unauthorized', { status: 401 }),
      );

      await expect(
        client.createCard({ title: 'Test', board_id: 10, column_id: 100 }),
      ).rejects.toThrow(KaitenApiError);

      vi.mocked(fetch).mockResolvedValueOnce(
        new Response('Unauthorized', { status: 401 }),
      );
      await expect(
        client.createCard({ title: 'Test', board_id: 10, column_id: 100 }),
      ).rejects.toThrow('Ошибка авторизации. Проверьте KAITEN_API_TOKEN');
    });

    it('should throw KaitenApiError on 403', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response('Forbidden', { status: 403 }),
      );

      await expect(
        client.createCard({ title: 'Test', board_id: 10, column_id: 100 }),
      ).rejects.toThrow(KaitenApiError);

      vi.mocked(fetch).mockResolvedValueOnce(
        new Response('Forbidden', { status: 403 }),
      );
      await expect(
        client.createCard({ title: 'Test', board_id: 10, column_id: 100 }),
      ).rejects.toThrow('Нет доступа к карточке');
    });

    it('should throw KaitenApiError on 404', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response('Not found', { status: 404 }),
      );

      await expect(
        client.createCard({ title: 'Test', board_id: 10, column_id: 100 }),
      ).rejects.toThrow(KaitenApiError);

      vi.mocked(fetch).mockResolvedValueOnce(
        new Response('Not found', { status: 404 }),
      );
      await expect(
        client.createCard({ title: 'Test', board_id: 10, column_id: 100 }),
      ).rejects.toThrow('Карточка не найдена');
    });
  });

  describe('updateCard', () => {
    function createMockUpdatedCard(overrides: Partial<KaitenCard> = {}): KaitenCard {
      return {
        id: 12345,
        title: 'Updated title',
        description: 'Updated description',
        state: 1,
        board_id: 10,
        column_id: 102,
        lane_id: 50,
        owner_id: 501,
        members: [
          { id: 501, full_name: 'Иван Иванов' },
        ],
        tags: [
          { id: 1, name: 'updated' },
        ],
        created: '2026-02-01T10:00:00Z',
        updated: '2026-02-12T20:00:00Z',
        ...overrides,
      };
    }

    it('should make PATCH request with auth header and body, map response', async () => {
      const mockCard = createMockUpdatedCard();
      const updateParams: KaitenUpdateCardRequest = {
        title: 'Updated title',
        description: 'Updated description',
      };

      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(JSON.stringify(mockCard), { status: 200 }),
      );

      const result = await client.updateCard(12345, updateParams);

      expect(fetch).toHaveBeenCalledWith(
        `${baseUrl}/cards/12345`,
        expect.objectContaining({
          method: 'PATCH',
          headers: expect.objectContaining({
            'Authorization': `Bearer ${token}`,
          }),
          body: JSON.stringify(updateParams),
        }),
      );

      expect(result.card_id).toBe(12345);
      expect(result.title).toBe('Updated title');
      expect(result.description).toBe('Updated description');
      expect(result.state).toBe('active');
      expect(result.board_id).toBe(10);
      expect(result.column_id).toBe(102);
      expect(result.lane_id).toBe(50);
      expect(result.owner_id).toBe(501);
      expect(result.members).toHaveLength(1);
      expect(result.tags).toHaveLength(1);
      expect(result.updated_at).toBe('2026-02-12T20:00:00Z');
    });

    it('should update only title field', async () => {
      const mockCard = createMockUpdatedCard({ title: 'New title only' });

      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(JSON.stringify(mockCard), { status: 200 }),
      );

      const result = await client.updateCard(12345, { title: 'New title only' });

      expect(fetch).toHaveBeenCalledWith(
        `${baseUrl}/cards/12345`,
        expect.objectContaining({
          body: JSON.stringify({ title: 'New title only' }),
        }),
      );

      expect(result.title).toBe('New title only');
    });

    it('should update only description field', async () => {
      const mockCard = createMockUpdatedCard({ description: 'New description only' });

      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(JSON.stringify(mockCard), { status: 200 }),
      );

      const result = await client.updateCard(12345, { description: 'New description only' });

      expect(fetch).toHaveBeenCalledWith(
        `${baseUrl}/cards/12345`,
        expect.objectContaining({
          body: JSON.stringify({ description: 'New description only' }),
        }),
      );

      expect(result.description).toBe('New description only');
    });

    it('should update multiple fields at once', async () => {
      const mockCard = createMockUpdatedCard({
        title: 'Multi-field update',
        column_id: 105,
        owner_id: 502,
      });

      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(JSON.stringify(mockCard), { status: 200 }),
      );

      const result = await client.updateCard(12345, {
        title: 'Multi-field update',
        column_id: 105,
        owner_id: 502,
      });

      expect(result.title).toBe('Multi-field update');
      expect(result.column_id).toBe(105);
      expect(result.owner_id).toBe(502);
    });

    it('should update members array', async () => {
      const mockCard = createMockUpdatedCard({
        members: [
          { id: 501, full_name: 'Иван Иванов' },
          { id: 502, full_name: 'Мария Петрова' },
        ],
      });

      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(JSON.stringify(mockCard), { status: 200 }),
      );

      const result = await client.updateCard(12345, { members: [501, 502] });

      expect(result.members).toHaveLength(2);
      expect(result.members[0].id).toBe(501);
      expect(result.members[1].id).toBe(502);
    });

    it('should update tags array', async () => {
      const mockCard = createMockUpdatedCard({
        tags: [
          { id: 1, name: 'bug' },
          { id: 2, name: 'urgent' },
        ],
      });

      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(JSON.stringify(mockCard), { status: 200 }),
      );

      const result = await client.updateCard(12345, { tags: [1, 2] });

      expect(result.tags).toHaveLength(2);
      expect(result.tags[0].id).toBe(1);
      expect(result.tags[1].id).toBe(2);
    });

    it('should throw KaitenApiError on 404', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response('Not found', { status: 404 }),
      );

      await expect(
        client.updateCard(99999, { title: 'Test' }),
      ).rejects.toThrow(KaitenApiError);

      vi.mocked(fetch).mockResolvedValueOnce(
        new Response('Not found', { status: 404 }),
      );
      await expect(
        client.updateCard(99999, { title: 'Test' }),
      ).rejects.toThrow('Карточка не найдена');
    });

    it('should throw KaitenApiError on 403', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response('Forbidden', { status: 403 }),
      );

      await expect(
        client.updateCard(12345, { title: 'Test' }),
      ).rejects.toThrow(KaitenApiError);

      vi.mocked(fetch).mockResolvedValueOnce(
        new Response('Forbidden', { status: 403 }),
      );
      await expect(
        client.updateCard(12345, { title: 'Test' }),
      ).rejects.toThrow('Нет доступа к карточке');
    });

    it('should throw KaitenApiError on 401', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response('Unauthorized', { status: 401 }),
      );

      await expect(
        client.updateCard(12345, { title: 'Test' }),
      ).rejects.toThrow(KaitenApiError);

      vi.mocked(fetch).mockResolvedValueOnce(
        new Response('Unauthorized', { status: 401 }),
      );
      await expect(
        client.updateCard(12345, { title: 'Test' }),
      ).rejects.toThrow('Ошибка авторизации. Проверьте KAITEN_API_TOKEN');
    });

    it('should throw KaitenApiError on network error', async () => {
      vi.mocked(fetch).mockRejectedValueOnce(new TypeError('Failed to fetch'));

      await expect(
        client.updateCard(12345, { title: 'Test' }),
      ).rejects.toThrow(KaitenApiError);

      vi.mocked(fetch).mockRejectedValueOnce(new TypeError('Failed to fetch'));
      await expect(
        client.updateCard(12345, { title: 'Test' }),
      ).rejects.toThrow('Ошибка сети:');
    });
  });
});
