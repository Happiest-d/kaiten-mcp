import { z } from 'zod/v4';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { KaitenClient, KaitenApiError } from '../kaiten/client.js';

export function registerGetTimeLogs(server: McpServer, client: KaitenClient): void {
  server.registerTool(
    'get-time-logs',
    {
      title: 'Get Time Logs',
      description:
        'Получить логи учёта времени по задаче (карточке) в Kaiten. Возвращает записи о потраченном времени с разбивкой по пользователям и дням, а также суммарное время.',
      inputSchema: z.object({
        card_id: z.number().int().positive()
          .describe('ID карточки'),
        group_by: z.enum(['none', 'user', 'date'])
          .default('none')
          .describe('Группировка результатов: none — все записи списком, user — по пользователям, date — по дням'),
      }),
    },
    async (params) => {
      try {
        const entries = await client.getCardTimeLogs(params.card_id);
        const total_minutes = entries.reduce((sum, e) => sum + e.time_spent, 0);

        if (params.group_by === 'user') {
          const groupMap = new Map<number, typeof entries>();
          for (const entry of entries) {
            if (!groupMap.has(entry.user_id)) groupMap.set(entry.user_id, []);
            groupMap.get(entry.user_id)!.push(entry);
          }
          const by_user = Array.from(groupMap.entries()).map(([user_id, userEntries]) => ({
            user_id,
            total_minutes: userEntries.reduce((s, e) => s + e.time_spent, 0),
            entries: userEntries,
          }));
          return {
            content: [{ type: 'text' as const, text: JSON.stringify({ card_id: params.card_id, total_minutes, by_user }) }],
          };
        }

        if (params.group_by === 'date') {
          const groupMap = new Map<string, typeof entries>();
          for (const entry of entries) {
            if (!groupMap.has(entry.for_date)) groupMap.set(entry.for_date, []);
            groupMap.get(entry.for_date)!.push(entry);
          }
          const by_date = Array.from(groupMap.entries()).map(([for_date, dateEntries]) => ({
            for_date,
            total_minutes: dateEntries.reduce((s, e) => s + e.time_spent, 0),
            entries: dateEntries,
          }));
          return {
            content: [{ type: 'text' as const, text: JSON.stringify({ card_id: params.card_id, total_minutes, by_date }) }],
          };
        }

        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ card_id: params.card_id, total_minutes, entries }) }],
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
