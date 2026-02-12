import {
  KaitenApiError,
  mapState,
  type KaitenCard,
  type KaitenComment,
  type KaitenTimeLog,
  type KaitenCreateCardRequest,
  type KaitenUpdateCardRequest,
  type TaskDetails,
  type CommentsPage,
  type TimeLogEntry,
  type CreatedTask,
  type UpdatedTask,
} from './types.js';

export { KaitenApiError } from './types.js';

export interface KaitenClientConfig {
  baseUrl: string;
  token: string;
}

export class KaitenClient {
  private config: KaitenClientConfig;

  constructor(config: KaitenClientConfig) {
    this.config = config;
  }

  async getCard(cardId: number): Promise<TaskDetails> {
    const raw = await this.request<KaitenCard>(`/cards/${cardId}`);
    return {
      card_id: raw.id,
      title: raw.title,
      description: raw.description,
      state: mapState(raw.state),
      board_id: raw.board_id,
      column_id: raw.column_id,
      lane_id: raw.lane_id,
      owner_id: raw.owner_id,
      members: raw.members.map(m => ({ id: m.id, full_name: m.full_name })),
      tags: raw.tags.map(t => ({ id: t.id, name: t.name })),
      created_at: raw.created,
      updated_at: raw.updated,
    };
  }

  async getCardComments(
    cardId: number,
    options: { limit: number; offset: number },
  ): Promise<CommentsPage> {
    const allComments = await this.request<KaitenComment[]>(
      `/cards/${cardId}/comments`,
    );
    const total = allComments.length;
    const sliced = allComments.slice(
      options.offset,
      options.offset + options.limit,
    );

    return {
      items: sliced.map(c => ({
        id: c.id,
        author_id: c.author_id,
        text: c.text,
        created_at: c.created,
        updated_at: c.updated,
      })),
      total,
      limit: options.limit,
      offset: options.offset,
      has_more: options.offset + sliced.length < total,
    };
  }

  async getCardTimeLogs(cardId: number): Promise<TimeLogEntry[]> {
    const raw = await this.request<KaitenTimeLog[]>(`/cards/${cardId}/time-logs`);
    return raw.map(entry => ({
      id: entry.id,
      user_id: entry.user_id,
      author_id: entry.author_id,
      time_spent: entry.time_spent,
      for_date: entry.for_date,
      comment: entry.comment,
      created_at: entry.created,
    }));
  }

  async createCard(params: KaitenCreateCardRequest): Promise<CreatedTask> {
    const raw = await this.request<KaitenCard>('/cards', 'POST', params);
    return {
      card_id: raw.id,
      title: raw.title,
      board_id: raw.board_id,
      column_id: raw.column_id,
      lane_id: raw.lane_id,
      state: mapState(raw.state),
      created_at: raw.created,
    };
  }

  async updateCard(cardId: number, params: KaitenUpdateCardRequest): Promise<UpdatedTask> {
    const raw = await this.request<KaitenCard>(`/cards/${cardId}`, 'PATCH', params);
    return {
      card_id: raw.id,
      title: raw.title,
      description: raw.description,
      board_id: raw.board_id,
      column_id: raw.column_id,
      lane_id: raw.lane_id,
      state: mapState(raw.state),
      owner_id: raw.owner_id,
      members: raw.members.map(m => ({ id: m.id, full_name: m.full_name })),
      tags: raw.tags.map(t => ({ id: t.id, name: t.name })),
      updated_at: raw.updated,
    };
  }

  private async request<T>(endpoint: string, method: string = 'GET', body?: unknown): Promise<T> {
    const url = `${this.config.baseUrl}${endpoint}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);

    try {
      const options: RequestInit = {
        method,
        headers: {
          'Authorization': `Bearer ${this.config.token}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        signal: controller.signal,
      };
      if (body !== undefined) {
        options.body = JSON.stringify(body);
      }

      const response = await fetch(url, options);

      if (!response.ok) {
        throw new KaitenApiError(
          this.getErrorMessage(response.status),
          response.status,
          endpoint,
        );
      }

      return await response.json() as T;
    } catch (error) {
      if (error instanceof KaitenApiError) throw error;
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new KaitenApiError(
          'Превышено время ожидания ответа от Kaiten API',
          0,
          endpoint,
        );
      }
      throw new KaitenApiError(
        `Ошибка сети: ${String(error)}`,
        0,
        endpoint,
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  private getErrorMessage(status: number): string {
    switch (status) {
      case 401: return 'Ошибка авторизации. Проверьте KAITEN_API_TOKEN';
      case 403: return 'Нет доступа к карточке';
      case 404: return 'Карточка не найдена';
      default:  return `Ошибка Kaiten API: ${status}`;
    }
  }
}
