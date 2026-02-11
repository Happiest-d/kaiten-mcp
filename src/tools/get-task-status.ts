import { z } from 'zod/v4';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { KaitenClient, KaitenApiError } from '../kaiten/client.js';
import type { TaskStatus, TaskStatusError } from '../kaiten/types.js';

export function registerGetTaskStatus(server: McpServer, client: KaitenClient): void {
  server.registerTool(
    'get-task-status',
    {
      title: 'Get Task Status',
      description: 'Получить текущий статус задачи (карточки) в Kaiten по ID. Поддерживает запрос статусов нескольких задач за один вызов.',
      inputSchema: z.object({
        card_ids: z.array(z.number().int().positive())
          .min(1)
          .max(50)
          .describe('Массив ID карточек. От 1 до 50 ID за один запрос.'),
      }),
    },
    async (params) => {
      try {
        const results = await Promise.allSettled(
          params.card_ids.map(id => client.getCard(id)),
        );

        const statuses: (TaskStatus | TaskStatusError)[] = results.map((result, index) => {
          if (result.status === 'fulfilled') {
            const d = result.value;
            return {
              card_id: d.card_id,
              title: d.title,
              board_id: d.board_id,
              column_id: d.column_id,
              state: d.state,
              updated_at: d.updated_at,
            };
          }
          const error = result.reason;
          if (error instanceof KaitenApiError && error.statusCode === 401) {
            throw error;
          }
          return {
            card_id: params.card_ids[index],
            error: error instanceof KaitenApiError ? error.message : 'Неизвестная ошибка',
          };
        });

        return {
          content: [{ type: 'text' as const, text: JSON.stringify(statuses) }],
        };
      } catch (error) {
        if (error instanceof KaitenApiError) {
          return {
            isError: true as const,
            content: [{ type: 'text' as const, text: error.message }],
          };
        }
        return {
          isError: true as const,
          content: [{ type: 'text' as const, text: 'Внутренняя ошибка сервера' }],
        };
      }
    },
  );
}
