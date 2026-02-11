# Kaiten MCP Server

MCP-сервер для работы с задачами Kaiten через AI-агентов.

## Стек

- **Язык:** TypeScript (strict mode)
- **Рантайм:** Node.js >= 20
- **MCP SDK:** `@modelcontextprotocol/sdk` v1.26+ (используем v2 API: `registerTool`, `z.object()`)
- **Валидация:** `zod/v4` (все схемы через `z.object()`)
- **Тесты:** Vitest
- **Линтер:** ESLint с `@typescript-eslint`
- **Сборка:** `tsc`

## Методология разработки

### TDD (Test-Driven Development)

Строго следуем циклу Red-Green-Refactor:

1. **Red** — сначала пишем падающий тест
2. **Green** — пишем минимальный код для прохождения теста
3. **Refactor** — рефакторим, сохраняя зелёные тесты

Тесты пишем **до** реализации. Не мержим код без тестов.

### Spec-Driven Development

Каждая новая фича начинается со спецификации:

1. Создать файл `specs/<feature-name>.md` с описанием фичи
2. Спека должна содержать:
   - **Цель** — зачем нужна фича
   - **API** — входные/выходные данные, MCP tool definition
   - **Сценарии** — основные и граничные кейсы
   - **Примеры** — примеры запросов и ответов
3. Спека утверждается до начала написания кода
4. Тесты пишутся на основе сценариев из спеки

## Структура проекта

```
├── CLAUDE.md
├── readme.md
├── package.json
├── tsconfig.json
├── specs/                  # Спецификации фич
│   └── <feature-name>.md
├── src/
│   ├── index.ts            # Точка входа, запуск MCP сервера
│   ├── server.ts           # Конфигурация McpServer
│   ├── kaiten/
│   │   ├── client.ts       # HTTP-клиент для Kaiten API
│   │   └── types.ts        # Типы Kaiten API
│   └── tools/              # MCP tools (по одному файлу на tool)
│       ├── get-task.ts
│       └── ...
├── tests/
│   ├── kaiten/
│   │   └── client.test.ts
│   └── tools/
│       └── get-task.test.ts
```

## Стандарты кода

### TypeScript

- `strict: true` в tsconfig
- Не используем `any` — только явные типы или `unknown`
- Интерфейсы для объектов API, type aliases для union/utility типов
- Именование: `camelCase` для переменных/функций, `PascalCase` для типов/интерфейсов
- Файлы: `kebab-case.ts`

### MCP Tools

Импорты:

```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
```

Каждый tool регистрируется через `server.registerTool()` (v2 API):

```typescript
server.registerTool(
  'tool-name',
  {
    title: 'Human Readable Name',
    description: 'Описание для LLM',
    inputSchema: z.object({ /* ... */ }),
  },
  async (params) => {
    return { content: [{ type: 'text', text: '...' }] };
  }
);
```

- Одна фича = один файл в `src/tools/`
- Каждый tool-файл экспортирует функцию регистрации: `export function register(server: McpServer)`
- Схемы входных данных — всегда через `z.object()` из `zod/v4`

### Kaiten API клиент

- Единый HTTP-клиент в `src/kaiten/client.ts`
- Авторизация через API token в заголовке
- Все методы типизированы: входные параметры и ответы
- Ошибки API оборачиваются в понятные сообщения

### Тесты

- Файлы тестов рядом в `tests/` с зеркальной структурой `src/`
- Kaiten API мокается (не делаем реальных HTTP-запросов в тестах)
- Каждый тест — изолированный, без зависимости от порядка запуска
- Именование: `describe('toolName')` → `it('should ...')`

## Конфигурация

Сервер принимает конфигурацию через переменные окружения:

- `KAITEN_API_TOKEN` — API-токен для авторизации (обязательный)
- `KAITEN_BASE_URL` — базовый URL API (обязательный, например `https://mycompany.kaiten.ru/api/latest`)

## Команды

```bash
npm run build      # Сборка TypeScript
npm run test       # Запуск тестов
npm run lint       # Проверка линтером
npm run dev        # Запуск в режиме разработки
```

## Статус проекта

Файл `STATUS.md` — источник правды о текущем состоянии проекта. **Обязательно обновлять** после:

- Завершения реализации фичи (статус, метрики тестов)
- Добавления новых тестов
- Изменения инфраструктуры
- Добавления новых спек или документов
