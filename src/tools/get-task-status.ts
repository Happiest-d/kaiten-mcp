import { z } from 'zod/v4';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { KaitenClient, KaitenApiError } from '../kaiten/client.js';
import type { TaskStatus, TaskStatusError } from '../kaiten/types.js';

export function registerGetTaskStatus(server: McpServer, client: KaitenClient): void {
  server.registerTool(
    'get-task-status',
    {
      title: 'Get Task Status',
      description: 'Получить текущий статус задачи (карточки) в Kaiten по ID. Поддерживает запрос статусов нескольких задач за один вызов (до 50).\n\nФОРМАТ ОТВЕТА:\nМассив объектов, каждый содержит:\n- card_id, title, board_id, column_id\n- state: строка состояния (см. маппинг ниже)\n- updated_at: ISO timestamp последнего обновления\n- error: строка ошибки (если карточка не найдена или недоступна)\n\nМАППИНГ СОСТОЯНИЙ (state):\n- "active" — карточка активна (state=1 в API)\n- "unknown_N" — неизвестное состояние (где N — код из API)\n\nПРИМЕРЫ:\n- Одна задача: card_ids=[12345]\n- Несколько задач: card_ids=[12345, 67890, 11111]\n- Массовая проверка: card_ids=[1,2,3,...,50] (до 50 за раз)\n\nОШИБКИ:\n- Если карточка не найдена → объект с полем error вместо title/state\n- Ошибка авторизации (401) → прерывает запрос для всех карточек',
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
