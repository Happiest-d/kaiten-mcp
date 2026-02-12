import { z } from 'zod/v4';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { KaitenClient, KaitenApiError } from '../kaiten/client.js';

export function registerCreateTask(server: McpServer, client: KaitenClient): void {
  server.registerTool(
    'create-task',
    {
      title: 'Create Task',
      description: 'Создать новую задачу (карточку) в Kaiten. Обязательные поля: title, board_id, column_id.\n\nПРАКТИЧЕСКИЕ СОВЕТЫ:\n- description: используйте plain text с переносами строк (\\n), НЕ используйте markdown-заголовки (#, ##)\n- Структура описания: введение → детали → контекст/связи\n- title: краткий и понятный заголовок (1-500 символов)\n- position: 1 = в начало колонки (для срочных задач), 2 = в конец (по умолчанию)\n- Примеры:\n  title="Исправить баг авторизации", description="Пользователи не могут войти через OAuth.\\n\\nШаги воспроизведения:\\n1. Открыть страницу логина\\n2. Нажать \\"Войти через Google\\"\\n3. Ошибка 500\\n\\nОжидается: успешный вход"',
      inputSchema: z.object({
        title: z.string().min(1).max(500).describe('Заголовок задачи (1-500 символов)'),
        board_id: z.number().int().positive().describe('ID доски, на которой создать карточку'),
        column_id: z.number().int().positive().describe('ID колонки на доске'),
        description: z.string().max(50000).optional().describe('Описание задачи (plain text с переносами строк). До 50000 символов'),
        lane_id: z.number().int().positive().optional().describe('ID дорожки (lane) на доске'),
        position: z.union([z.literal(1), z.literal(2)]).optional().describe('Позиция в колонке: 1 = в начало, 2 = в конец'),
        tags: z.array(z.number().int().positive()).max(20).optional().describe('ID тегов (до 20)'),
      }),
    },
    async (params) => {
      try {
        const result = await client.createCard(params);
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
