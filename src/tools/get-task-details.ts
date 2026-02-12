import { z } from 'zod/v4';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { KaitenClient, KaitenApiError } from '../kaiten/client.js';

export function registerGetTaskDetails(server: McpServer, client: KaitenClient): void {
  server.registerTool(
    'get-task-details',
    {
      title: 'Get Task Details',
      description:
        'Получить детальную информацию о задаче (карточке) в Kaiten: описание, метаданные, исполнителей и комментарии.\n\nСТРУКТУРА ОТВЕТА:\n- id, title, description, state (статус)\n- owner (автор), responsible (исполнитель), members (участники)\n- board_id, column_id, lane_id\n- tags, links (связи с другими картами)\n- created_at, updated_at (ISO timestamps)\n- comments (если include_comments=true): массив с полями text, author_id, created_at, updated_at\n\nПАГИНАЦИЯ КОММЕНТАРИЕВ:\n- comments_limit: количество комментариев на запрос (по умолчанию 20, максимум 100)\n- comments_offset: начать с N-го комментария (для получения следующих страниц)\n- has_more (в ответе): true если есть ещё комментарии\n- Пример: offset=0, limit=20 → первые 20; offset=20, limit=20 → следующие 20\n\nПРИМЕРЫ:\n- Базовый: card_id=12345 (include_comments по умолчанию true)\n- Без комментариев: card_id=12345, include_comments=false\n- Вторая страница комментариев: card_id=12345, comments_offset=20, comments_limit=20',
      inputSchema: z.object({
        card_id: z.number().int().positive()
          .describe('ID карточки'),
        include_comments: z.boolean()
          .default(true)
          .describe('Включить комментарии в ответ'),
        comments_limit: z.number().int().min(1).max(100)
          .default(20)
          .describe('Максимальное количество комментариев на странице (1-100)'),
        comments_offset: z.number().int().min(0)
          .default(0)
          .describe('Смещение для пагинации комментариев'),
      }),
    },
    async (params) => {
      try {
        const taskDetails = await client.getCard(params.card_id);

        if (params.include_comments) {
          taskDetails.comments = await client.getCardComments(params.card_id, {
            limit: params.comments_limit,
            offset: params.comments_offset,
          });
        }

        return {
          content: [{ type: 'text' as const, text: JSON.stringify(taskDetails) }],
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
