# get-task-details — Требования к реализации

Детальные требования для реализации фичи `get-task-details` на основе спецификации `01-get-task-details.md`.

> Это первая фича проекта. Помимо самого tool, нужно создать базовую инфраструктуру: HTTP-клиент, типы, точку входа сервера.

---

## 1. Структура файлов

Создать/изменить следующие файлы:

```
src/
├── index.ts                      # Точка входа: создание и запуск MCP-сервера
├── server.ts                     # Фабрика McpServer, регистрация tools
├── kaiten/
│   ├── client.ts                 # HTTP-клиент для Kaiten API
│   └── types.ts                  # TypeScript-интерфейсы Kaiten API
└── tools/
    └── get-task-details.ts       # MCP tool: get-task-details

tests/
├── kaiten/
│   └── client.test.ts            # Тесты HTTP-клиента
└── tools/
    └── get-task-details.test.ts  # Тесты tool-а
```

### Порядок реализации (TDD)

1. `src/kaiten/types.ts` — типы (не требуют тестов, это только интерфейсы)
2. `tests/kaiten/client.test.ts` → `src/kaiten/client.ts` — клиент (Red → Green)
3. `tests/tools/get-task-details.test.ts` → `src/tools/get-task-details.ts` — tool (Red → Green)
4. `src/server.ts` — фабрика сервера
5. `src/index.ts` — точка входа

---

## 2. Типы — `src/kaiten/types.ts`

Все интерфейсы описывают структуру **ответов Kaiten API** (raw JSON) и **внутренние структуры** для маппинга в MCP-ответ.

### 2.1 Ответы Kaiten API (raw)

Эти интерфейсы описывают JSON, приходящий от Kaiten API. Имена с префиксом `Kaiten`.

```typescript
/** Ответ GET /api/latest/cards/{id} */
export interface KaitenCard {
  id: number;
  title: string;
  description: string | null;
  state: number;                    // Kaiten может возвращать числовой state
  board: {
    id: number;
    title: string;
  };
  column: {
    id: number;
    title: string;
  };
  owner: KaitenUser | null;
  members: KaitenUser[];
  tags: KaitenTag[];
  created: string;                  // ISO 8601 — имя поля может отличаться
  updated: string;                  // ISO 8601
  due_date: string | null;
}

export interface KaitenUser {
  id: number;
  full_name: string;
}

export interface KaitenTag {
  id: number;
  name: string;
}

/** Элемент ответа GET /api/latest/cards/{id}/comments */
export interface KaitenComment {
  id: number;
  author: KaitenUser;
  text: string;
  created: string;                  // ISO 8601
  updated: string;                  // ISO 8601
}
```

> **Примечание:** Точные имена полей Kaiten API будут уточнены по результатам исследования. Маппинг из raw-ответа во внутренние типы сосредоточен в клиенте, поэтому изменения API-формата затронут только `client.ts`.

### 2.2 Внутренние типы (выходные данные tool-а)

Эти типы соответствуют контракту из спецификации и используются в tool-е для формирования MCP-ответа.

```typescript
export type CardState = 'queued' | 'in_progress' | 'done' | 'archived';

export interface TaskDetails {
  card_id: number;
  title: string;
  description: string | null;
  state: CardState;
  board: { id: number; title: string };
  column: { id: number; title: string };
  owner: { id: number; full_name: string } | null;
  members: { id: number; full_name: string }[];
  tags: { id: number; name: string }[];
  created_at: string;
  updated_at: string;
  due_date: string | null;
  comments?: CommentsPage;
}

export interface CommentsPage {
  items: CommentItem[];
  total: number;
  limit: number;
  offset: number;
  has_more: boolean;
}

export interface CommentItem {
  id: number;
  author: { id: number; full_name: string };
  text: string;
  created_at: string;
  updated_at: string;
}
```

### 2.3 Ошибки клиента

```typescript
export class KaitenApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly endpoint: string,
  ) {
    super(message);
    this.name = 'KaitenApiError';
  }
}
```

---

## 3. Kaiten API клиент — `src/kaiten/client.ts`

### 3.1 Интерфейс конфигурации

```typescript
export interface KaitenClientConfig {
  baseUrl: string;   // из env KAITEN_BASE_URL (обязательный, напр. "https://mycompany.kaiten.ru/api/latest")
  token: string;     // из env KAITEN_API_TOKEN (обязательный)
}
```

### 3.2 Класс `KaitenClient`

```typescript
export class KaitenClient {
  constructor(config: KaitenClientConfig);

  /** Получить карточку по ID. Возвращает маппированный TaskDetails (без comments). */
  async getCard(cardId: number): Promise<TaskDetails>;

  /** Получить комментарии карточки с пагинацией. */
  async getCardComments(
    cardId: number,
    options: { limit: number; offset: number },
  ): Promise<CommentsPage>;
}
```

### 3.3 Детали реализации

#### HTTP-запросы

- Использовать встроенный `fetch` (Node.js >= 20, не нужны внешние библиотеки).
- Заголовки каждого запроса:
  ```
  Authorization: Bearer {token}
  Content-Type: application/json
  Accept: application/json
  ```
- Таймаут: 30 секунд. Реализовать через `AbortController` + `setTimeout`.

#### Метод `getCard(cardId: number)`

1. Выполнить `GET {baseUrl}/cards/{cardId}`
2. При успехе (200) — распарсить JSON, замаппить `KaitenCard` → `TaskDetails`:
   - `id` → `card_id`
   - `created` → `created_at` (или другой маппинг, если имена полей отличаются)
   - `updated` → `updated_at`
   - `state` (число) → `CardState` строка (маппинг числовых кодов в строки — если Kaiten возвращает числа; уточнить при интеграции)
   - Остальные поля — прямой маппинг
3. При ошибке — выбросить `KaitenApiError` с соответствующим кодом

#### Метод `getCardComments(cardId, options)`

1. Выполнить `GET {baseUrl}/cards/{cardId}/comments?limit={limit}&offset={offset}`
2. При успехе (200) — распарсить JSON:
   - Kaiten API может возвращать массив комментариев. В таком случае `total` определяется из заголовков ответа или из дополнительного поля (уточнить при интеграции).
   - Маппинг `KaitenComment[]` → `CommentsPage`:
     - `created` → `created_at`
     - `updated` → `updated_at`
     - `has_more` = `offset + items.length < total`
3. При ошибке — выбросить `KaitenApiError`

> **Предположение о пагинации:** Если Kaiten API не поддерживает параметры `limit`/`offset` для комментариев, клиент должен загрузить все комментарии и сделать пагинацию на своей стороне (slice массива). Это решение будет уточнено при интеграции.

### 3.4 Обработка ошибок

Единая стратегия обработки HTTP-ошибок в клиенте:

| HTTP-код | Действие                                                        |
|----------|-----------------------------------------------------------------|
| 200      | Успех, распарсить JSON                                          |
| 401      | Бросить `KaitenApiError("Ошибка авторизации. Проверьте KAITEN_API_TOKEN", 401, endpoint)` |
| 403      | Бросить `KaitenApiError("Нет доступа к карточке", 403, endpoint)` |
| 404      | Бросить `KaitenApiError("Карточка не найдена", 404, endpoint)`   |
| Таймаут  | Бросить `KaitenApiError("Превышено время ожидания ответа от Kaiten API", 0, endpoint)` |
| Другие   | Бросить `KaitenApiError("Ошибка Kaiten API: {statusCode}", statusCode, endpoint)` |

Метод для обработки:

```typescript
private async request<T>(endpoint: string): Promise<T> {
  const url = `${this.config.baseUrl}${endpoint}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);

  try {
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${this.config.token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      signal: controller.signal,
    });

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
```

---

## 4. Tool регистрация — `src/tools/get-task-details.ts`

### 4.1 Экспорт

```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { KaitenClient } from '../kaiten/client.js';

export function register(server: McpServer, client: KaitenClient): void;
```

Tool-файл **не создаёт** клиент сам — получает его через dependency injection (параметр `client`). Это позволяет:
- Мокать клиент в тестах
- Использовать один клиент для всех tools

### 4.2 Реализация handler-а

```typescript
export function register(server: McpServer, client: KaitenClient): void {
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
    async (params) => {
      // Логика описана ниже
    },
  );
}
```

### 4.3 Логика handler-а (пошагово)

1. Вызвать `client.getCard(params.card_id)` — получить `TaskDetails`
2. Если `params.include_comments === true`:
   - Вызвать `client.getCardComments(params.card_id, { limit: params.comments_limit, offset: params.comments_offset })`
   - Присвоить результат в `taskDetails.comments`
3. Сериализовать `taskDetails` в JSON
4. Вернуть MCP-ответ:
   ```typescript
   return { content: [{ type: 'text', text: JSON.stringify(taskDetails) }] };
   ```
5. При ошибке `KaitenApiError` — вернуть MCP-ответ с `isError: true`:
   ```typescript
   return {
     isError: true,
     content: [{ type: 'text', text: error.message }],
   };
   ```

### 4.4 Маппинг ошибок в MCP-ответ

Tool **ловит** все `KaitenApiError` и возвращает их как `isError: true`. Zod-валидация обрабатывается MCP SDK автоматически — если входные данные не проходят schema, SDK сам вернёт ошибку.

```typescript
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
      content: [{ type: 'text', text: JSON.stringify(taskDetails) }],
    };
  } catch (error) {
    if (error instanceof KaitenApiError) {
      return {
        isError: true,
        content: [{ type: 'text', text: error.message }],
      };
    }
    return {
      isError: true,
      content: [{ type: 'text', text: 'Внутренняя ошибка сервера' }],
    };
  }
}
```

---

## 5. Сервер — `src/server.ts` и `src/index.ts`

### 5.1 `src/server.ts`

Фабрика, создающая и настраивающая `McpServer`:

```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { KaitenClient, KaitenClientConfig } from './kaiten/client.js';
import { register as registerGetTaskDetails } from './tools/get-task-details.js';

export function createServer(clientConfig: KaitenClientConfig): McpServer {
  const server = new McpServer({
    name: 'kaiten-mcp',
    version: '0.1.0',
  });

  const client = new KaitenClient(clientConfig);

  registerGetTaskDetails(server, client);
  // Будущие tools регистрируются здесь

  return server;
}
```

### 5.2 `src/index.ts`

Точка входа. Читает env-переменные, создаёт сервер, подключает транспорт:

```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from './server.js';

const token = process.env.KAITEN_API_TOKEN;
if (!token) {
  console.error('KAITEN_API_TOKEN is required');
  process.exit(1);
}

const baseUrl = process.env.KAITEN_BASE_URL;
if (!baseUrl) {
  console.error('KAITEN_BASE_URL is required (e.g. https://mycompany.kaiten.ru/api/latest)');
  process.exit(1);
}

const server = createServer({ token, baseUrl });
const transport = new StdioServerTransport();
await server.connect(transport);
```

---

## 6. Тесты

### 6.1 `tests/kaiten/client.test.ts`

Тестирование `KaitenClient`. Мокать `global.fetch`.

**Тест-кейсы:**

| # | Describe              | It                                                                | Что проверяем                                                  |
|---|-----------------------|-------------------------------------------------------------------|----------------------------------------------------------------|
| 1 | `getCard`             | should return task details for valid card id                      | Успешный запрос, маппинг полей KaitenCard → TaskDetails        |
| 2 | `getCard`             | should map null owner correctly                                   | owner: null в ответе API                                       |
| 3 | `getCard`             | should throw KaitenApiError on 404                                | Карточка не найдена                                            |
| 4 | `getCard`             | should throw KaitenApiError on 401                                | Ошибка авторизации                                             |
| 5 | `getCard`             | should throw KaitenApiError on 403                                | Нет доступа                                                    |
| 6 | `getCard`             | should throw KaitenApiError on timeout                            | AbortError → KaitenApiError                                    |
| 7 | `getCardComments`     | should return comments page with pagination                       | Успешный запрос, маппинг, has_more=true                        |
| 8 | `getCardComments`     | should return empty comments page                                 | Пустой массив комментариев                                     |
| 9 | `getCardComments`     | should calculate has_more correctly when no more comments         | has_more=false когда offset+items.length >= total              |
| 10| `getCardComments`     | should throw KaitenApiError on 404                                | Карточка не найдена при запросе комментариев                   |
| 11| `request` (private)   | should send correct authorization header                          | Проверить что fetch вызван с Bearer token                      |
| 12| `request` (private)   | should use correct base URL                                       | URL формируется правильно                                      |

**Стратегия мока fetch:**

```typescript
import { vi, describe, it, expect, beforeEach } from 'vitest';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

beforeEach(() => {
  mockFetch.mockReset();
});

// Хелпер для успешных ответов
function mockFetchSuccess(data: unknown, status = 200) {
  mockFetch.mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
  });
}

// Хелпер для ошибочных ответов
function mockFetchError(status: number) {
  mockFetch.mockResolvedValueOnce({
    ok: false,
    status,
    json: async () => ({}),
  });
}
```

### 6.2 `tests/tools/get-task-details.test.ts`

Тестирование MCP tool handler-а. Мокать `KaitenClient`.

**Стратегия:** Создать мок `KaitenClient`, передать в `register()`, вызывать handler напрямую через `server.callTool()` или тестировать handler-функцию отдельно.

Рекомендуемый подход — тестировать через `McpServer` в in-memory режиме (если SDK это поддерживает), либо извлечь handler в отдельную функцию и тестировать её напрямую.

**Тест-кейсы:**

| # | Describe              | It                                                                | Что проверяем                                                  |
|---|-----------------------|-------------------------------------------------------------------|----------------------------------------------------------------|
| 1 | `get-task-details`    | should return task details with comments by default               | getCard + getCardComments вызваны, результат содержит comments |
| 2 | `get-task-details`    | should return task details without comments when include_comments is false | getCard вызван, getCardComments НЕ вызван                  |
| 3 | `get-task-details`    | should pass pagination params to getCardComments                  | limit и offset прокидываются корректно                         |
| 4 | `get-task-details`    | should return isError true when card not found                    | KaitenApiError(404) → isError: true, "Карточка не найдена"     |
| 5 | `get-task-details`    | should return isError true on auth error                          | KaitenApiError(401) → isError: true                            |
| 6 | `get-task-details`    | should return isError true on access denied                       | KaitenApiError(403) → isError: true                            |
| 7 | `get-task-details`    | should return task with null description                          | description: null обрабатывается корректно                     |
| 8 | `get-task-details`    | should return task with empty members and null owner              | owner: null, members: [] в ответе                              |
| 9 | `get-task-details`    | should return task with empty comments list                       | comments.items: [], total: 0, has_more: false                  |
| 10| `get-task-details`    | should handle unexpected errors gracefully                        | Неизвестная ошибка → isError: true, "Внутренняя ошибка"        |

---

## 7. Зависимости между компонентами

```
src/index.ts
  └── src/server.ts
        ├── src/kaiten/client.ts
        │     └── src/kaiten/types.ts
        └── src/tools/get-task-details.ts
              └── src/kaiten/client.ts
                    └── src/kaiten/types.ts
```

**Граф зависимостей (кто от чего зависит):**

- `types.ts` — ни от чего не зависит (leaf)
- `client.ts` — зависит от `types.ts`
- `get-task-details.ts` — зависит от `client.ts` и `types.ts`
- `server.ts` — зависит от `client.ts`, `get-task-details.ts`
- `index.ts` — зависит от `server.ts`

**Порядок реализации (снизу вверх):**

1. `src/kaiten/types.ts` — типы, нет зависимостей
2. `src/kaiten/client.ts` — HTTP-клиент, зависит только от types
3. `src/tools/get-task-details.ts` — tool, зависит от client
4. `src/server.ts` — связывает всё вместе
5. `src/index.ts` — точка входа

---

## 8. Результаты исследования API (закрытые вопросы)

По результатам исследования Kaiten API:

1. **`state`** — integer (`1` = активна). Маппинг в строку через `mapState()`. Полный набор значений уточняется.
2. **Даты** — поля `created`/`updated` (НЕ `created_at`/`updated_at`). Маппим при преобразовании.
3. **Пагинация комментариев** — API возвращает **все** комментарии одним массивом. Пагинация — на нашей стороне через `Array.slice()`.
4. **Авторизация** — `Authorization: Bearer {token}` — подтверждено.
5. **Комментарии** — `author_id: number` (НЕ вложенный объект `{ id, full_name }`).
6. **Карточки** — `board_id`, `column_id` (числа, НЕ вложенные объекты с `title`), `owner_id` (число), `lane_id`.
7. **Base URL** — `https://{domain}.kaiten.ru/api/latest` — обязательный параметр, без дефолта.

> Подробный план обновлений — см. `specs/implementation-plan.md`.
