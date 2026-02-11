# План реализации — все 4 фичи

На основе результатов исследования реального Kaiten API и существующих спецификаций.

---

## Общие изменения (затрагивают все фичи)

### MCP SDK — пакет и импорты

**Пакет:** `@modelcontextprotocol/sdk` v1.26+ (уже установлен в package.json)

> Пакет `@modelcontextprotocol/server` НЕ существует. Используем `@modelcontextprotocol/sdk`.

**Импорты:**
```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
```

**API регистрации tools:** `server.registerTool()` (v2 API, старый `server.tool()` deprecated).
- `inputSchema` принимает `z.object({...})` из `zod/v4` или raw shape `{ field: z.string() }`
- Мы используем `z.object()` согласно стандартам в CLAUDE.md

### Конфигурация — обновить CLAUDE.md и index.ts

Реальный Base URL: `https://{domain}.kaiten.ru/api/latest` — домен пользователя является частью URL.

**Решение:** Использовать одну переменную `KAITEN_BASE_URL`, куда пользователь вписывает полный URL вместе с доменом. Это проще, чем отдельный `KAITEN_DOMAIN`, и покрывает все случаи (self-hosted, кастомные домены).

```
KAITEN_API_TOKEN=xxx                                          # обязательный
KAITEN_BASE_URL=https://mycompany.kaiten.ru/api/latest        # обязательный (нет дефолта)
```

**Изменение:** Убрать дефолтное значение для `KAITEN_BASE_URL`. Оба параметра обязательны, `index.ts` валидирует наличие обоих.

### Kaiten API — реальная структура ответов

Подтверждённые данные:
- **Авторизация:** `Authorization: Bearer {API_TOKEN}` -- подтверждено
- **Даты:** поля `created` и `updated` (НЕ `created_at`/`updated_at`)
- **state:** integer (подтверждено: `1` = активна). Полный маппинг пока неизвестен, определяем по мере использования
- **Комментарии:** API возвращает полный массив, пагинации НЕТ — делаем на своей стороне
- **Time logs:** `time_spent` (не `minutes`), `for_date` (не `date`), `user_id`/`author_id` (id-шники, не вложенные объекты)
- **Создание карточки:** `owner_id` и `member_ids` НЕ поддерживаются при создании

### Обновлённые raw-типы Kaiten API — `src/kaiten/types.ts`

```typescript
/** GET /api/latest/cards/{card_id} */
export interface KaitenCard {
  id: number;
  title: string;
  description: string | null;
  state: number;               // 1 = активна, другие значения — уточнить
  board_id: number;
  column_id: number;
  lane_id: number | null;
  owner_id: number | null;
  members: KaitenMember[];
  tags: KaitenTag[];
  condition: KaitenCondition | null;
  created: string;             // ISO 8601
  updated: string;             // ISO 8601
}

export interface KaitenMember {
  id: number;
  full_name: string;
}

export interface KaitenTag {
  id: number;
  name: string;
}

export interface KaitenCondition {
  // Объект текущего состояния — уточнить структуру
  [key: string]: unknown;
}

/** GET /api/latest/cards/{card_id}/comments — элемент массива */
export interface KaitenComment {
  id: number;
  text: string;
  author_id: number;           // НЕ вложенный объект, только id
  card_id: number;
  created: string;
  updated: string;
}

/** GET /api/latest/cards/{card_id}/time-logs — элемент массива */
export interface KaitenTimeLog {
  id: number;
  card_id: number;
  user_id: number;             // кто выполнял работу
  author_id: number;           // кто создал запись
  role_id: number | null;
  time_spent: number;          // минуты (НЕ "minutes")
  for_date: string;            // YYYY-MM-DD (НЕ "date")
  comment: string | null;
  created: string;
  updated: string;
}

/** POST /api/latest/cards — тело запроса */
export interface KaitenCreateCardRequest {
  title: string;               // обязательный
  board_id: number;            // обязательный
  column_id: number;           // обязательный
  lane_id?: number;
  description?: string;
  position?: 1 | 2;           // 1=начало, 2=конец
  tags?: number[];
}

/** POST /api/latest/cards — ответ (та же структура KaitenCard) */
// Ответ = KaitenCard

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

**Ключевое отличие:** `KaitenComment.author_id` — это число (id пользователя), а НЕ вложенный объект `{ id, full_name }`. Аналогично для `KaitenTimeLog.user_id` и `author_id`. Для получения full_name нужен отдельный запрос `GET /users/{id}` или `GET /users`.

**Решение по user resolution:** В MCP-ответе возвращаем `author_id` / `user_id` как есть. НЕ делаем дополнительных запросов за именами пользователей — это замедлит ответ и усложнит реализацию. Если потребуется, добавим user resolution позже как отдельную фичу.

### Маппинг state (integer → string)

```typescript
// Известные значения (уточнить при интеграции):
const STATE_MAP: Record<number, CardState> = {
  1: 'active',
};

// Безопасный fallback
function mapState(state: number): string {
  return STATE_MAP[state] ?? `unknown_${state}`;
}
```

**Решение:** Не ограничиваем `CardState` жёстким union type. Используем `string` в выходных типах, чтобы неизвестные состояния не ломали сервер. В спеках обновляем тип `state` на `string`.

---

## Фича 1: get-task-details

### Изменения в спеке `01-get-task-details.md`

1. **state** — заменить `'queued' | 'in_progress' | 'done' | 'archived'` на `string` (число из API маппится в строку, полный набор значений уточняется)
2. **Даты** — выходные поля остаются `created_at` / `updated_at` (маппим из `created`/`updated` API)
3. **Комментарии** — убрать упоминание пагинации на стороне API. API возвращает все комментарии, пагинация — наша
4. **Comment.author** — заменить `author: { id, full_name }` на `author_id: number` (нет данных о full_name из API комментариев)
5. **Добавить поля** — `board_id`/`column_id` (числа) вместо вложенных объектов `board`/`column` с `title`. API карточки возвращает только id-шники, не вложенные объекты с названиями
6. **owner** — заменить `owner: { id, full_name }` на `owner_id: number | null`
7. **members** — API возвращает массив объектов с `id` и `full_name`, оставляем как есть

> **Примечание по board/column:** API карточки возвращает `board_id` и `column_id` как числа. Для получения названий нужны дополнительные запросы `GET /boards/{id}`. На первом этапе возвращаем только id. Названия добавим позже при необходимости.

### Файлы

| Файл | Действие | Описание |
|------|----------|----------|
| `src/kaiten/types.ts` | создать | Все raw и внутренние типы (см. общие изменения + типы ниже) |
| `src/kaiten/client.ts` | создать | KaitenClient с методами getCard, getCardComments |
| `src/tools/get-task-details.ts` | создать | MCP tool регистрация |
| `src/server.ts` | создать | Фабрика McpServer |
| `src/index.ts` | создать | Точка входа |
| `tests/kaiten/client.test.ts` | создать | Тесты клиента |
| `tests/tools/get-task-details.test.ts` | создать | Тесты tool-а |

### Обновлённые внутренние типы

```typescript
export interface TaskDetails {
  card_id: number;
  title: string;
  description: string | null;
  state: string;                    // маппинг из числового кода
  board_id: number;
  column_id: number;
  lane_id: number | null;
  owner_id: number | null;
  members: { id: number; full_name: string }[];
  tags: { id: number; name: string }[];
  created_at: string;               // маппинг из "created"
  updated_at: string;               // маппинг из "updated"
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
  author_id: number;                // только id, НЕ вложенный объект
  text: string;
  created_at: string;
  updated_at: string;
}
```

### Маппинг API → MCP

**getCard (KaitenCard → TaskDetails):**

| Kaiten API поле | MCP выходное поле | Преобразование |
|-----------------|-------------------|----------------|
| `id` | `card_id` | прямой |
| `title` | `title` | прямой |
| `description` | `description` | прямой |
| `state` | `state` | `mapState(state)` — число → строка |
| `board_id` | `board_id` | прямой |
| `column_id` | `column_id` | прямой |
| `lane_id` | `lane_id` | прямой |
| `owner_id` | `owner_id` | прямой |
| `members` | `members` | прямой (массив `{ id, full_name }`) |
| `tags` | `tags` | прямой (массив `{ id, name }`) |
| `created` | `created_at` | переименование |
| `updated` | `updated_at` | переименование |

**getCardComments (KaitenComment[] → CommentsPage):**

API возвращает полный массив. Клиент делает slice:

```typescript
async getCardComments(
  cardId: number,
  options: { limit: number; offset: number },
): Promise<CommentsPage> {
  const allComments = await this.request<KaitenComment[]>(
    `/cards/${cardId}/comments`,
  );
  const total = allComments.length;
  const sliced = allComments.slice(options.offset, options.offset + options.limit);

  return {
    items: sliced.map(c => ({
      id: c.id,
      author_id: c.author_id,
      text: c.text,
      created_at: c.created,
      updated_at: c.updated,
    })),
    total,
    limit: options.limit,
    offset: options.offset,
    has_more: options.offset + sliced.length < total,
  };
}
```

### Порядок реализации (TDD)

1. `src/kaiten/types.ts` — типы
2. **Тест:** `tests/kaiten/client.test.ts` — тесты getCard, getCardComments (RED)
3. **Код:** `src/kaiten/client.ts` — реализация клиента (GREEN)
4. **Тест:** `tests/tools/get-task-details.test.ts` — тесты tool-а (RED)
5. **Код:** `src/tools/get-task-details.ts` — реализация tool-а (GREEN)
6. `src/server.ts` — фабрика сервера
7. `src/index.ts` — точка входа
8. REFACTOR

---

## Фича 2: get-time-logs

### Изменения в спеке `02-get-time-logs.md`

1. **TimeLogEntry.minutes** → `time_spent` (соответствует API)
2. **TimeLogEntry.date** → `for_date` (соответствует API)
3. **TimeLogEntry.user** — заменить `user: { id, full_name }` на `user_id: number` (API возвращает только id)
4. **Добавить** `author_id: number` — кто создал запись (может отличаться от `user_id`)
5. **TimeLogEntry.created_at** — маппинг из `created`
6. **Убрать `updated_at`** из `TimeLogEntry` — или оставить, маппя из `updated`
7. **Группировка по user** — группировать по `user_id` (без full_name)

### Файлы

| Файл | Действие | Описание |
|------|----------|----------|
| `src/kaiten/types.ts` | изменить | Добавить `KaitenTimeLog` (уже в общих типах), внутренние типы для time logs |
| `src/kaiten/client.ts` | изменить | Добавить метод `getCardTimeLogs` |
| `src/tools/get-time-logs.ts` | создать | MCP tool регистрация |
| `src/server.ts` | изменить | Зарегистрировать tool |
| `tests/kaiten/client.test.ts` | изменить | Добавить тесты `getCardTimeLogs` |
| `tests/tools/get-time-logs.test.ts` | создать | Тесты tool-а |

### Обновлённые внутренние типы

```typescript
export interface TimeLogEntry {
  id: number;
  user_id: number;              // кто делал работу
  author_id: number;            // кто создал запись
  time_spent: number;           // минуты
  for_date: string;             // YYYY-MM-DD
  comment: string | null;
  created_at: string;           // маппинг из "created"
}

// Без группировки
export interface TimeLogsResponse {
  card_id: number;
  total_minutes: number;        // сумма time_spent
  entries: TimeLogEntry[];
}

// Группировка по user
export interface TimeLogsByUser {
  card_id: number;
  total_minutes: number;
  by_user: {
    user_id: number;
    total_minutes: number;
    entries: TimeLogEntry[];
  }[];
}

// Группировка по дате
export interface TimeLogsByDate {
  card_id: number;
  total_minutes: number;
  by_date: {
    for_date: string;
    total_minutes: number;
    entries: TimeLogEntry[];
  }[];
}
```

### Маппинг API → MCP

**getCardTimeLogs (KaitenTimeLog[] → TimeLogEntry[]):**

| Kaiten API поле | MCP выходное поле | Преобразование |
|-----------------|-------------------|----------------|
| `id` | `id` | прямой |
| `user_id` | `user_id` | прямой |
| `author_id` | `author_id` | прямой |
| `time_spent` | `time_spent` | прямой |
| `for_date` | `for_date` | прямой |
| `comment` | `comment` | прямой |
| `created` | `created_at` | переименование |

Группировка делается на нашей стороне в tool handler-е:
- `total_minutes` = `entries.reduce((sum, e) => sum + e.time_spent, 0)`
- `by_user` = группировка по `user_id`
- `by_date` = группировка по `for_date`

### Метод клиента

```typescript
/** Получить все записи времени по карточке */
async getCardTimeLogs(cardId: number): Promise<TimeLogEntry[]> {
  const raw = await this.request<KaitenTimeLog[]>(
    `/cards/${cardId}/time-logs`,
  );
  return raw.map(entry => ({
    id: entry.id,
    user_id: entry.user_id,
    author_id: entry.author_id,
    time_spent: entry.time_spent,
    for_date: entry.for_date,
    comment: entry.comment,
    created_at: entry.created,
  }));
}
```

### Порядок реализации (TDD)

1. `src/kaiten/types.ts` — добавить внутренние типы time logs
2. **Тест:** `tests/kaiten/client.test.ts` — тесты getCardTimeLogs (RED)
3. **Код:** `src/kaiten/client.ts` — метод getCardTimeLogs (GREEN)
4. **Тест:** `tests/tools/get-time-logs.test.ts` — тесты tool-а, включая группировки (RED)
5. **Код:** `src/tools/get-time-logs.ts` — tool с логикой группировки (GREEN)
6. `src/server.ts` — зарегистрировать tool
7. REFACTOR

---

## Фича 3: get-task-status

### Изменения в спеке `03-get-task-status.md`

1. **state** — `string` вместо union type (маппинг из числа)
2. **updated_at** — маппинг из `updated`
3. **board/column** — заменить вложенные объекты `{ id, title }` на `board_id: number`, `column_id: number`
4. **condition** — добавить поле `condition` из API (объект текущего состояния)

### Файлы

| Файл | Действие | Описание |
|------|----------|----------|
| `src/kaiten/types.ts` | изменить | Добавить внутренний тип `TaskStatus` |
| `src/tools/get-task-status.ts` | создать | MCP tool регистрация |
| `src/server.ts` | изменить | Зарегистрировать tool |
| `tests/tools/get-task-status.test.ts` | создать | Тесты tool-а |

### Обновлённые внутренние типы

```typescript
export interface TaskStatus {
  card_id: number;
  title: string;
  board_id: number;
  column_id: number;
  state: string;                // mapState(state)
  updated_at: string;           // маппинг из "updated"
}

export interface TaskStatusError {
  card_id: number;
  error: string;
}
```

### Маппинг API → MCP

Этот tool переиспользует `client.getCard()` (уже реализован в фиче 1) и извлекает из `TaskDetails` только нужные поля:

```typescript
function toTaskStatus(details: TaskDetails): TaskStatus {
  return {
    card_id: details.card_id,
    title: details.title,
    board_id: details.board_id,
    column_id: details.column_id,
    state: details.state,
    updated_at: details.updated_at,
  };
}
```

Батч-запрос (несколько card_ids) — `Promise.allSettled()` для параллельных запросов с частичным успехом.

### Порядок реализации (TDD)

1. `src/kaiten/types.ts` — добавить TaskStatus, TaskStatusError
2. **Тест:** `tests/tools/get-task-status.test.ts` — тесты tool-а: один ID, несколько ID, частичный успех, ошибки (RED)
3. **Код:** `src/tools/get-task-status.ts` — tool с Promise.allSettled (GREEN)
4. `src/server.ts` — зарегистрировать tool
5. REFACTOR

Новый метод клиента **не нужен** — переиспользуем `getCard()`.

---

## Фича 4: create-task

### Изменения в спеке `04-create-task.md`

Существенные изменения — API не поддерживает часть полей при создании:

1. **Убрать `owner_id`** — API не поддерживает. Убрать из inputSchema и примеров.
2. **Убрать `member_ids`** — API не поддерживает. Убрать из inputSchema и примеров.
3. **Убрать `due_date`** — не подтверждено в API. Убрать.
4. **`tag_ids`** → **`tags`** — API принимает поле `tags` (уточнить формат: массив id или объектов).
5. **Добавить `lane_id`** — опциональный, ID дорожки (lane) на доске.
6. **Добавить `position`** — опциональный, `1` = в начало колонки, `2` = в конец.
7. **Выходные данные** — убрать `board: { id, title }` и `column: { id, title }`, заменить на `board_id`, `column_id`. Убрать `url` (нет данных о формате URL). `state` — строка через mapState().
8. **Сценарии** — убрать кейсы про `owner_id`, `member_ids`, `due_date`. Добавить кейсы про `lane_id`, `position`.

### Файлы

| Файл | Действие | Описание |
|------|----------|----------|
| `src/kaiten/types.ts` | изменить | KaitenCreateCardRequest уже определён в общих типах, добавить внутренний CreatedTask |
| `src/kaiten/client.ts` | изменить | Добавить метод `createCard` |
| `src/tools/create-task.ts` | создать | MCP tool регистрация |
| `src/server.ts` | изменить | Зарегистрировать tool |
| `tests/kaiten/client.test.ts` | изменить | Добавить тесты `createCard` |
| `tests/tools/create-task.test.ts` | создать | Тесты tool-а |

### Обновлённый inputSchema

```typescript
inputSchema: z.object({
  title: z.string()
    .min(1)
    .max(500)
    .describe('Заголовок задачи (1-500 символов)'),
  board_id: z.number().int().positive()
    .describe('ID доски'),
  column_id: z.number().int().positive()
    .describe('ID колонки'),
  description: z.string()
    .max(50000)
    .optional()
    .describe('Описание задачи (Markdown)'),
  lane_id: z.number().int().positive()
    .optional()
    .describe('ID дорожки (lane) на доске'),
  position: z.union([z.literal(1), z.literal(2)])
    .optional()
    .describe('Позиция в колонке: 1 = в начало, 2 = в конец'),
  tags: z.array(z.number().int().positive())
    .max(20)
    .optional()
    .describe('ID тегов (до 20)'),
}),
```

### Обновлённый внутренний тип ответа

```typescript
export interface CreatedTask {
  card_id: number;
  title: string;
  board_id: number;
  column_id: number;
  lane_id: number | null;
  state: string;
  created_at: string;
}
```

### Метод клиента

```typescript
async createCard(params: KaitenCreateCardRequest): Promise<CreatedTask> {
  const raw = await this.requestPost<KaitenCard>('/cards', params);
  return {
    card_id: raw.id,
    title: raw.title,
    board_id: raw.board_id,
    column_id: raw.column_id,
    lane_id: raw.lane_id,
    state: mapState(raw.state),
    created_at: raw.created,
  };
}
```

Нужно расширить клиент методом `requestPost`:

```typescript
private async requestPost<T>(endpoint: string, body: unknown): Promise<T> {
  const url = `${this.config.baseUrl}${endpoint}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.config.token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(body),
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
      throw new KaitenApiError('Превышено время ожидания ответа от Kaiten API', 0, endpoint);
    }
    throw new KaitenApiError(`Ошибка сети: ${String(error)}`, 0, endpoint);
  } finally {
    clearTimeout(timeout);
  }
}
```

**Рефакторинг:** `request` и `requestPost` содержат дублирование. Извлечь общий приватный метод `fetch` с параметром `method` и опциональным `body`.

### Порядок реализации (TDD)

1. `src/kaiten/types.ts` — добавить CreatedTask
2. `src/kaiten/client.ts` — рефакторинг: извлечь общий `requestInternal(method, endpoint, body?)`, чтобы поддержать POST
3. **Тест:** `tests/kaiten/client.test.ts` — тесты createCard: успех, ошибки 400/401/403 (RED)
4. **Код:** `src/kaiten/client.ts` — метод createCard (GREEN)
5. **Тест:** `tests/tools/create-task.test.ts` — тесты tool-а (RED)
6. **Код:** `src/tools/create-task.ts` — tool (GREEN)
7. `src/server.ts` — зарегистрировать tool
8. REFACTOR

---

## Итоговый порядок реализации

Фичи реализуются последовательно. Каждая следующая расширяет инфраструктуру предыдущей.

### Этап 1: Инфраструктура + get-task-details

Создаём весь каркас проекта: типы, клиент, сервер, точку входа.

**Файлы (создать):**
1. `src/kaiten/types.ts`
2. `tests/kaiten/client.test.ts`
3. `src/kaiten/client.ts`
4. `tests/tools/get-task-details.test.ts`
5. `src/tools/get-task-details.ts`
6. `src/server.ts`
7. `src/index.ts`

### Этап 2: get-time-logs

Новый метод клиента + tool с логикой группировки.

**Файлы (изменить/создать):**
1. `src/kaiten/types.ts` — добавить типы time logs
2. `tests/kaiten/client.test.ts` — добавить тесты getCardTimeLogs
3. `src/kaiten/client.ts` — метод getCardTimeLogs
4. `tests/tools/get-time-logs.test.ts` — создать
5. `src/tools/get-time-logs.ts` — создать
6. `src/server.ts` — зарегистрировать

### Этап 3: get-task-status

Переиспользует getCard(), новый tool с батч-логикой.

**Файлы (изменить/создать):**
1. `src/kaiten/types.ts` — добавить TaskStatus, TaskStatusError
2. `tests/tools/get-task-status.test.ts` — создать
3. `src/tools/get-task-status.ts` — создать
4. `src/server.ts` — зарегистрировать

### Этап 4: create-task

Первый POST-метод. Рефакторинг request → поддержка методов.

**Файлы (изменить/создать):**
1. `src/kaiten/types.ts` — добавить CreatedTask
2. `src/kaiten/client.ts` — рефакторинг request, метод createCard
3. `tests/kaiten/client.test.ts` — тесты createCard
4. `tests/tools/create-task.test.ts` — создать
5. `src/tools/create-task.ts` — создать
6. `src/server.ts` — зарегистрировать

---

## Сводка расхождений спек с реальным API

| Что было в спеке | Что в реальном API | Решение |
|------------------|--------------------|---------|
| `state: 'queued' \| 'in_progress' \| ...` | `state: number` (1 = активна) | Маппинг число → строка, тип `string` |
| `created_at` / `updated_at` | `created` / `updated` | Маппинг в клиенте |
| `Comment.author: { id, full_name }` | `author_id: number` | Возвращаем `author_id` |
| `TimeLogEntry.minutes` | `time_spent` | Переименование |
| `TimeLogEntry.date` | `for_date` | Переименование |
| `TimeLogEntry.user: { id, full_name }` | `user_id: number` | Возвращаем `user_id` |
| `board: { id, title }` в ответах | `board_id: number` | Возвращаем только id |
| `column: { id, title }` в ответах | `column_id: number` | Возвращаем только id |
| `owner: { id, full_name }` | `owner_id: number \| null` | Возвращаем `owner_id` |
| create-task: `owner_id`, `member_ids` | Не поддерживается | Убрать из inputSchema |
| create-task: `due_date` | Не подтверждено | Убрать |
| create-task: `tag_ids` | `tags` | Переименование поля |
| Пагинация комментариев в API | Нет пагинации | Пагинация на нашей стороне (slice) |
| `KAITEN_BASE_URL` с дефолтом | Домен пользователя | Обязательный параметр, без дефолта |
