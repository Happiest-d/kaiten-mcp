# get-task-details

Просмотр описания и комментариев задачи в Kaiten.

## Цель

Позволяет AI-агенту получить полную информацию о задаче: описание, метаданные, исполнителей и комментарии. Это основной инструмент для понимания контекста задачи — что нужно сделать, какие обсуждения уже были и кто участвует.

## API

### MCP Tool Definition

```typescript
server.registerTool(
  'get-task-details',
  {
    title: 'Get Task Details',
    description: 'Получить детальную информацию о задаче (карточке) в Kaiten: описание, метаданные, исполнителей и комментарии. Комментарии поддерживают пагинацию.',
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
  async (params) => { /* ... */ }
);
```

### Входные данные

| Поле               | Тип       | Обязательное | По умолчанию | Описание                                          |
|--------------------|-----------|--------------|--------------|---------------------------------------------------|
| `card_id`          | `number`  | да           | —            | ID карточки                                       |
| `include_comments` | `boolean` | нет          | `true`       | Включить комментарии в ответ                      |
| `comments_limit`   | `number`  | нет          | `20`         | Количество комментариев на странице (1-100)       |
| `comments_offset`  | `number`  | нет          | `0`          | Смещение для пагинации комментариев               |

### Kaiten API эндпоинты

- `GET /api/latest/cards/{id}` — получение данных карточки (описание, метаданные, исполнители)
- `GET /api/latest/cards/{id}/comments` — получение комментариев (с параметрами пагинации)

### Выходные данные

```typescript
interface TaskDetails {
  card_id: number;
  title: string;
  description: string | null;
  state: 'queued' | 'in_progress' | 'done' | 'archived';
  board: {
    id: number;
    title: string;
  };
  column: {
    id: number;
    title: string;
  };
  owner: {
    id: number;
    full_name: string;
  } | null;
  members: {
    id: number;
    full_name: string;
  }[];
  tags: {
    id: number;
    name: string;
  }[];
  created_at: string; // ISO 8601
  updated_at: string; // ISO 8601
  due_date: string | null; // ISO 8601 date
  comments?: CommentsPage;
}

interface CommentsPage {
  items: Comment[];
  total: number;
  limit: number;
  offset: number;
  has_more: boolean;
}

interface Comment {
  id: number;
  author: {
    id: number;
    full_name: string;
  };
  text: string;
  created_at: string; // ISO 8601
  updated_at: string; // ISO 8601
}
```

## Сценарии

### Основные

1. **Получение задачи с комментариями (по умолчанию)** — возвращается описание, метаданные и первые 20 комментариев.
2. **Получение задачи без комментариев** — `include_comments: false`, возвращаются только данные карточки без блока `comments`.
3. **Пагинация комментариев** — `comments_offset: 20, comments_limit: 20` — вторая страница комментариев.
4. **Задача без описания** — `description: null`.
5. **Задача без комментариев** — `comments.items: [], comments.total: 0, comments.has_more: false`.
6. **Задача без назначенного исполнителя** — `owner: null, members: []`.

### Граничные случаи

7. **Несуществующая карточка** — Kaiten API возвращает 404, tool возвращает ошибку `"Карточка не найдена"`.
8. **Невалидный card_id** — валидация zod отклоняет запрос.
9. **comments_limit больше 100** — валидация zod отклоняет запрос.
10. **Отрицательный comments_offset** — валидация zod отклоняет запрос.
11. **Ошибка авторизации** — Kaiten API возвращает 401, tool возвращает ошибку `"Ошибка авторизации. Проверьте KAITEN_API_TOKEN"`.
12. **Карточка без прав доступа** — Kaiten API возвращает 403, tool возвращает ошибку `"Нет доступа к карточке"`.
13. **Описание содержит Markdown** — описание возвращается как есть, без преобразований.

## Примеры

### Получение задачи с комментариями

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
      "text": "{\"card_id\":12345,\"title\":\"Исправить баг в авторизации\",\"description\":\"При входе через SSO токен не обновляется. Нужно добавить refresh logic.\",\"state\":\"in_progress\",\"board\":{\"id\":10,\"title\":\"Спринт 5\"},\"column\":{\"id\":101,\"title\":\"В работе\"},\"owner\":{\"id\":501,\"full_name\":\"Иван Иванов\"},\"members\":[{\"id\":501,\"full_name\":\"Иван Иванов\"},{\"id\":502,\"full_name\":\"Мария Петрова\"}],\"tags\":[{\"id\":1,\"name\":\"bug\"},{\"id\":2,\"name\":\"auth\"}],\"created_at\":\"2026-02-01T10:00:00Z\",\"updated_at\":\"2026-02-10T14:30:00Z\",\"due_date\":\"2026-02-14\",\"comments\":{\"items\":[{\"id\":301,\"author\":{\"id\":502,\"full_name\":\"Мария Петрова\"},\"text\":\"Проверила — баг воспроизводится стабильно на staging\",\"created_at\":\"2026-02-05T12:00:00Z\",\"updated_at\":\"2026-02-05T12:00:00Z\"},{\"id\":302,\"author\":{\"id\":501,\"full_name\":\"Иван Иванов\"},\"text\":\"Нашёл причину, готовлю фикс\",\"created_at\":\"2026-02-08T09:00:00Z\",\"updated_at\":\"2026-02-08T09:00:00Z\"}],\"total\":2,\"limit\":20,\"offset\":0,\"has_more\":false}}"
    }
  ]
}
```

### Получение задачи без комментариев

**Вход:**
```json
{
  "card_id": 12345,
  "include_comments": false
}
```

**Ответ (MCP content):**
```json
{
  "content": [
    {
      "type": "text",
      "text": "{\"card_id\":12345,\"title\":\"Исправить баг в авторизации\",\"description\":\"При входе через SSO токен не обновляется. Нужно добавить refresh logic.\",\"state\":\"in_progress\",\"board\":{\"id\":10,\"title\":\"Спринт 5\"},\"column\":{\"id\":101,\"title\":\"В работе\"},\"owner\":{\"id\":501,\"full_name\":\"Иван Иванов\"},\"members\":[{\"id\":501,\"full_name\":\"Иван Иванов\"},{\"id\":502,\"full_name\":\"Мария Петрова\"}],\"tags\":[{\"id\":1,\"name\":\"bug\"},{\"id\":2,\"name\":\"auth\"}],\"created_at\":\"2026-02-01T10:00:00Z\",\"updated_at\":\"2026-02-10T14:30:00Z\",\"due_date\":\"2026-02-14\"}"
    }
  ]
}
```

### Пагинация комментариев (вторая страница)

**Вход:**
```json
{
  "card_id": 12345,
  "comments_limit": 10,
  "comments_offset": 10
}
```

**Ответ (MCP content):**
```json
{
  "content": [
    {
      "type": "text",
      "text": "{\"card_id\":12345,\"title\":\"Исправить баг в авторизации\",\"description\":\"При входе через SSO токен не обновляется.\",\"state\":\"in_progress\",\"board\":{\"id\":10,\"title\":\"Спринт 5\"},\"column\":{\"id\":101,\"title\":\"В работе\"},\"owner\":{\"id\":501,\"full_name\":\"Иван Иванов\"},\"members\":[{\"id\":501,\"full_name\":\"Иван Иванов\"}],\"tags\":[],\"created_at\":\"2026-02-01T10:00:00Z\",\"updated_at\":\"2026-02-10T14:30:00Z\",\"due_date\":null,\"comments\":{\"items\":[{\"id\":311,\"author\":{\"id\":503,\"full_name\":\"Алексей Сидоров\"},\"text\":\"Добавил unit-тесты на этот кейс\",\"created_at\":\"2026-02-10T15:00:00Z\",\"updated_at\":\"2026-02-10T15:00:00Z\"}],\"total\":11,\"limit\":10,\"offset\":10,\"has_more\":false}}"
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
