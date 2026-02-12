import { z } from 'zod/v4';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { KaitenClient, KaitenApiError } from '../kaiten/client.js';

export function registerUpdateTask(server: McpServer, client: KaitenClient): void {
  server.registerTool(
    'update-task',
    {
      title: 'Update Task',
      description: 'Обновить поля существующей задачи (карточки) в Kaiten. Можно изменить заголовок, описание, колонку, лейн, исполнителя, участников и теги. Все параметры кроме card_id опциональны — передавайте только те поля, которые нужно изменить.\n\nВАЖНО:\n- Нельзя переместить карточку между досками (board_id не поддерживается)\n- Можно обновить несколько полей за один запрос\n- API вернёт полную обновлённую карточку со всеми полями',
      inputSchema: z.object({
        card_id: z.number().int().positive().describe('ID карточки для обновления'),
        title: z.string().min(1).max(500).optional().describe('Новый заголовок (1-500 символов)'),
        description: z.string().max(50000).optional().describe('Новое описание (до 50000 символов)'),
        column_id: z.number().int().positive().optional().describe('ID новой колонки (для перемещения)'),
        lane_id: z.number().int().positive().optional().describe('ID нового лейна (для перемещения)'),
        owner_id: z.number().int().positive().optional().describe('ID нового исполнителя'),
        members: z.array(z.number().int().positive()).max(20).optional().describe('Массив user_id участников (до 20)'),
        tags: z.array(z.number().int().positive()).max(20).optional().describe('Массив tag_id (до 20)'),
      }),
    },
    async (params) => {
      try {
        const { card_id, ...updateParams } = params;
        const result = await client.updateCard(card_id, updateParams);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result) }],
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
