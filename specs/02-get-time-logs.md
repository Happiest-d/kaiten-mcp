# get-time-logs

Отслеживание потраченного времени на задачи в Kaiten.

## Цель

Позволяет AI-агенту получить информацию о трудозатратах по задаче: кто, когда и сколько времени потратил. Используется для анализа загрузки, построения отчётов и контроля трудозатрат по проекту.

## API

### MCP Tool Definition

```typescript
server.registerTool(
  'get-time-logs',
  {
    title: 'Get Time Logs',
    description: 'Получить логи учёта времени по задаче (карточке) в Kaiten. Возвращает записи о потраченном времени с разбивкой по пользователям и дням, а также суммарное время.',
    inputSchema: z.object({
      card_id: z.number().int().positive()
        .describe('ID карточки'),
      group_by: z.enum(['none', 'user', 'date'])
        .default('none')
        .describe('Группировка результатов: none — все записи списком, user — по пользователям, date — по дням'),
    }),
  },
  async (params) => { /* ... */ }
);
```

### Входные данные

| Поле       | Тип      | Обязательное | По умолчанию | Описание                                              |
|------------|----------|--------------|--------------|-------------------------------------------------------|
| `card_id`  | `number` | да           | —            | ID карточки                                           |
| `group_by` | `string` | нет          | `"none"`     | Группировка: `none`, `user`, `date`                   |

### Kaiten API эндпоинты

- `GET /api/latest/cards/{card_id}/time-logs` — получение записей учёта времени по карточке

API возвращает JSON-массив всех записей. Группировка и подсчёт суммарного времени — на нашей стороне.

### Выходные данные

#### Без группировки (`group_by: "none"`)

```typescript
interface TimeLogsResponse {
  card_id: number;
  total_minutes: number;
  entries: TimeLogEntry[];
}

interface TimeLogEntry {
  id: number;
  user_id: number;              // кто выполнял работу
  author_id: number;            // кто создал запись (может отличаться от user_id)
  time_spent: number;           // минуты
  for_date: string;             // YYYY-MM-DD
  comment: string | null;
  created_at: string;           // ISO 8601 (маппинг из "created" Kaiten API)
}
```

#### Группировка по пользователям (`group_by: "user"`)

```typescript
interface TimeLogsByUser {
  card_id: number;
  total_minutes: number;
  by_user: {
    user_id: number;
    total_minutes: number;
    entries: TimeLogEntry[];
  }[];
}
```

#### Группировка по дням (`group_by: "date"`)

```typescript
interface TimeLogsByDate {
  card_id: number;
  total_minutes: number;
  by_date: {
    for_date: string;           // YYYY-MM-DD
    total_minutes: number;
    entries: TimeLogEntry[];
  }[];
}
```

### Маппинг Kaiten API → MCP ответ

| Kaiten API поле | MCP выходное поле | Преобразование |
|-----------------|-------------------|----------------|
| `id`            | `id`              | прямой         |
| `user_id`       | `user_id`         | прямой         |
| `author_id`     | `author_id`       | прямой         |
| `time_spent`    | `time_spent`      | прямой         |
| `for_date`      | `for_date`        | прямой         |
| `comment`       | `comment`         | прямой         |
| `created`       | `created_at`      | переименование |

## Сценарии

### Основные

1. **Получение всех записей времени по задаче** — возвращается плоский список записей и суммарное время.
2. **Группировка по пользователям** — записи сгруппированы по `user_id`, у каждого — сумма и детализация.
3. **Группировка по дням** — записи сгруппированы по `for_date`, у каждой даты — сумма и детализация.
4. **Задача без записей времени** — возвращается пустой список, `total_minutes: 0`.

### Граничные случаи

5. **Несуществующая карточка** — Kaiten API возвращает 404, tool возвращает ошибку `"Карточка не найдена"`.
6. **Невалидный card_id** — валидация zod отклоняет запрос.
7. **Невалидный group_by** — валидация zod отклоняет запрос (enum допускает только `none`, `user`, `date`).
8. **Ошибка авторизации** — Kaiten API возвращает 401, tool возвращает ошибку `"Ошибка авторизации. Проверьте KAITEN_API_TOKEN"`.
9. **Карточка без прав доступа** — Kaiten API возвращает 403, tool возвращает ошибку `"Нет доступа к карточке"`.

## Примеры

### Получение логов времени без группировки

**Вход:**
```json
{
  "card_id": 12345
}
```

**Ответ (MCP content):**
```json
{
  "content": [
    {
      "type": "text",
      "text": "{\"card_id\":12345,\"total_minutes\":270,\"entries\":[{\"id\":1,\"user_id\":501,\"author_id\":501,\"time_spent\":120,\"for_date\":\"2026-02-10\",\"comment\":\"Рефакторинг модуля авторизации\",\"created_at\":\"2026-02-10T16:00:00Z\"},{\"id\":2,\"user_id\":502,\"author_id\":502,\"time_spent\":90,\"for_date\":\"2026-02-10\",\"comment\":\"Ревью кода\",\"created_at\":\"2026-02-10T18:00:00Z\"},{\"id\":3,\"user_id\":501,\"author_id\":501,\"time_spent\":60,\"for_date\":\"2026-02-11\",\"comment\":null,\"created_at\":\"2026-02-11T12:00:00Z\"}]}"
    }
  ]
}
```

### Группировка по пользователям

**Вход:**
```json
{
  "card_id": 12345,
  "group_by": "user"
}
```

**Ответ (MCP content):**
```json
{
  "content": [
    {
      "type": "text",
      "text": "{\"card_id\":12345,\"total_minutes\":270,\"by_user\":[{\"user_id\":501,\"total_minutes\":180,\"entries\":[{\"id\":1,\"user_id\":501,\"author_id\":501,\"time_spent\":120,\"for_date\":\"2026-02-10\",\"comment\":\"Рефакторинг модуля авторизации\",\"created_at\":\"2026-02-10T16:00:00Z\"},{\"id\":3,\"user_id\":501,\"author_id\":501,\"time_spent\":60,\"for_date\":\"2026-02-11\",\"comment\":null,\"created_at\":\"2026-02-11T12:00:00Z\"}]},{\"user_id\":502,\"total_minutes\":90,\"entries\":[{\"id\":2,\"user_id\":502,\"author_id\":502,\"time_spent\":90,\"for_date\":\"2026-02-10\",\"comment\":\"Ревью кода\",\"created_at\":\"2026-02-10T18:00:00Z\"}]}]}"
    }
  ]
}
```

### Группировка по дням

**Вход:**
```json
{
  "card_id": 12345,
  "group_by": "date"
}
```

**Ответ (MCP content):**
```json
{
  "content": [
    {
      "type": "text",
      "text": "{\"card_id\":12345,\"total_minutes\":270,\"by_date\":[{\"for_date\":\"2026-02-10\",\"total_minutes\":210,\"entries\":[{\"id\":1,\"user_id\":501,\"author_id\":501,\"time_spent\":120,\"for_date\":\"2026-02-10\",\"comment\":\"Рефакторинг модуля авторизации\",\"created_at\":\"2026-02-10T16:00:00Z\"},{\"id\":2,\"user_id\":502,\"author_id\":502,\"time_spent\":90,\"for_date\":\"2026-02-10\",\"comment\":\"Ревью кода\",\"created_at\":\"2026-02-10T18:00:00Z\"}]},{\"for_date\":\"2026-02-11\",\"total_minutes\":60,\"entries\":[{\"id\":3,\"user_id\":501,\"author_id\":501,\"time_spent\":60,\"for_date\":\"2026-02-11\",\"comment\":null,\"created_at\":\"2026-02-11T12:00:00Z\"}]}]}"
    }
  ]
}
```

### Задача без записей времени

**Вход:**
```json
{
  "card_id": 12346
}
```

**Ответ (MCP content):**
```json
{
  "content": [
    {
      "type": "text",
      "text": "{\"card_id\":12346,\"total_minutes\":0,\"entries\":[]}"
    }
  ]
}
```

### Несуществующая карточка

**Вход:**
```json
{
  "card_id": 99999
}
```

**Ответ (MCP error):**
```json
{
  "isError": true,
  "content": [
    {
      "type": "text",
      "text": "Карточка не найдена"
    }
  ]
}
```
