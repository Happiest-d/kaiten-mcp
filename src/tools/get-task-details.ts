import { z } from 'zod/v4';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { KaitenClient, KaitenApiError } from '../kaiten/client.js';

export function registerGetTaskDetails(server: McpServer, client: KaitenClient): void {
  server.registerTool(
    'get-task-details',
    {
      title: 'Get Task Details',
      description:
        'Получить детальную информацию о задаче (карточке) в Kaiten: описание, метаданные, исполнителей и комментарии. Комментарии поддерживают пагинацию.',
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
