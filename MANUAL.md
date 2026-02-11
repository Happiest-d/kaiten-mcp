# Kaiten MCP Server — Руководство

## Быстрый старт

### 1. Установка

```bash
cd /home/happiest/pet/claude-test
npm install
```

### 2. Сборка

```bash
npm run build
```

### 3. Настройка

Нужны две переменные окружения:

| Переменная | Описание | Пример |
|------------|----------|--------|
| `KAITEN_API_TOKEN` | API-токен из профиля Kaiten | `abc123...` |
| `KAITEN_BASE_URL` | Полный URL API вашего Kaiten | `https://mycompany.kaiten.ru/api/latest` |

Токен создаётся в Kaiten: **Профиль → Настройки → API-токены**.

### 4. Запуск

```bash
KAITEN_API_TOKEN=ваш_токен KAITEN_BASE_URL=https://yourcompany.kaiten.ru/api/latest node dist/src/index.js
```

Сервер работает через stdio — он предназначен для подключения из MCP-клиента (Claude Code, Claude Desktop и т.д.).

---

## Подключение к Claude Code

Добавьте в `.mcp.json` вашего проекта или в `~/.claude/mcp.json`:

```json
{
  "mcpServers": {
    "kaiten": {
      "command": "node",
      "args": ["/home/happiest/pet/claude-test/dist/src/index.js"],
      "env": {
        "KAITEN_API_TOKEN": "ваш_токен",
        "KAITEN_BASE_URL": "https://yourcompany.kaiten.ru/api/latest"
      }
    }
  }
}
```

После этого Claude получит доступ ко всем tools.

---

## Реализованные tools

### get-task-details

Получает полную информацию о задаче (карточке) в Kaiten.

**Параметры:**

| Параметр | Тип | Обязательный | По умолчанию | Описание |
|----------|-----|--------------|--------------|----------|
| `card_id` | number | да | — | ID карточки в Kaiten |
| `include_comments` | boolean | нет | `true` | Загружать комментарии |
| `comments_limit` | number | нет | `20` | Комментариев на странице (1-100) |
| `comments_offset` | number | нет | `0` | Смещение для пагинации |

**Пример запроса:**
```json
{ "card_id": 12345 }
```

**Пример ответа:**
```json
{
  "card_id": 12345,
  "title": "Исправить баг в авторизации",
  "description": "Описание задачи в Markdown",
  "state": "active",
  "board_id": 10,
  "column_id": 101,
  "lane_id": null,
  "owner_id": 501,
  "members": [{ "id": 501, "full_name": "Иван Иванов" }],
  "tags": [{ "id": 1, "name": "bug" }],
  "created_at": "2026-02-01T10:00:00Z",
  "updated_at": "2026-02-10T14:30:00Z",
  "comments": {
    "items": [
      {
        "id": 301,
        "author_id": 502,
        "text": "Проверила — баг воспроизводится",
        "created_at": "2026-02-05T12:00:00Z",
        "updated_at": "2026-02-05T12:00:00Z"
      }
    ],
    "total": 1,
    "limit": 20,
    "offset": 0,
    "has_more": false
  }
}
```

---

### get-time-logs

Получает логи учёта времени по задаче с группировкой.

**Параметры:**

| Параметр | Тип | Обязательный | По умолчанию | Описание |
|----------|-----|--------------|--------------|----------|
| `card_id` | number | да | — | ID карточки |
| `group_by` | `"none"` \| `"user"` \| `"date"` | нет | `"none"` | Группировка результатов |

**Пример запроса:**
```json
{ "card_id": 12345, "group_by": "user" }
```

**Пример ответа (group_by: "none"):**
```json
{
  "card_id": 12345,
  "total_minutes": 270,
  "entries": [
    {
      "id": 1,
      "user_id": 501,
      "author_id": 501,
      "time_spent": 120,
      "for_date": "2026-02-10",
      "comment": "Рефакторинг модуля авторизации",
      "created_at": "2026-02-10T16:00:00Z"
    }
  ]
}
```

**Пример ответа (group_by: "user"):**
```json
{
  "card_id": 12345,
  "total_minutes": 270,
  "by_user": [
    {
      "user_id": 501,
      "total_minutes": 180,
      "entries": [...]
    }
  ]
}
```

---

### get-task-status

Получает статус одной или нескольких задач за один запрос.

**Параметры:**

| Параметр | Тип | Обязательный | Описание |
|----------|-----|--------------|----------|
| `card_ids` | number[] | да | Массив ID карточек (1-50) |

**Пример запроса:**
```json
{ "card_ids": [12345, 12346, 99999] }
```

**Пример ответа (частичный успех):**
```json
[
  {
    "card_id": 12345,
    "title": "Исправить баг в авторизации",
    "board_id": 10,
    "column_id": 101,
    "state": "active",
    "updated_at": "2026-02-10T14:30:00Z"
  },
  {
    "card_id": 12346,
    "title": "Добавить пагинацию",
    "board_id": 10,
    "column_id": 102,
    "state": "active",
    "updated_at": "2026-02-09T18:00:00Z"
  },
  {
    "card_id": 99999,
    "error": "Карточка не найдена"
  }
]
```

Запросы выполняются параллельно. Ненайденные карточки возвращаются с полем `error`, не блокируя остальные.

---

### create-task

Создаёт новую задачу (карточку) в Kaiten.

**Параметры:**

| Параметр | Тип | Обязательный | Описание |
|----------|-----|--------------|----------|
| `title` | string | да | Заголовок (1-500 символов) |
| `board_id` | number | да | ID доски |
| `column_id` | number | да | ID колонки |
| `description` | string | нет | Описание в Markdown (до 50000 символов) |
| `lane_id` | number | нет | ID дорожки (lane) |
| `position` | `1` \| `2` | нет | 1 = в начало, 2 = в конец колонки |
| `tags` | number[] | нет | ID тегов (до 20) |

**Пример запроса:**
```json
{
  "title": "Добавить валидацию email",
  "board_id": 10,
  "column_id": 100
}
```

**Пример ответа:**
```json
{
  "card_id": 12350,
  "title": "Добавить валидацию email",
  "board_id": 10,
  "column_id": 100,
  "lane_id": null,
  "state": "active",
  "created_at": "2026-02-11T10:00:00Z"
}
```

---

## Общие ошибки

| Ситуация | Сообщение |
|----------|-----------|
| Карточка не найдена | `Карточка не найдена` |
| Неверный токен | `Ошибка авторизации. Проверьте KAITEN_API_TOKEN` |
| Нет доступа | `Нет доступа к карточке` |
| Таймаут (>30с) | `Превышено время ожидания ответа от Kaiten API` |

---

## Ручное тестирование

### Способ 1: Через Claude Code

1. Соберите проект: `npm run build`
2. Добавьте конфиг в `.mcp.json` (см. выше)
3. Перезапустите Claude Code
4. Спросите: *"Покажи информацию по задаче 12345 в Kaiten"*

### Способ 2: Через MCP Inspector

```bash
KAITEN_API_TOKEN=ваш_токен KAITEN_BASE_URL=https://yourcompany.kaiten.ru/api/latest \
  npx @modelcontextprotocol/inspector node dist/src/index.js
```

Откроется веб-интерфейс для вызова tools.

### Способ 3: Юнит-тесты

```bash
npm test
```

Запустит 58 тестов (без реальных HTTP-запросов — всё замокано).

---

## Где взять card_id?

Откройте карточку в Kaiten — ID виден в URL:
```
https://yourcompany.kaiten.ru/space/123/boards/10/cards/12345
                                                        ^^^^^
                                                       card_id
```
