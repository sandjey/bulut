# Bulut API — доски и задачи

Справочник по API для работы с досками и задачами Bulut от имени своего профиля.

- **Базовый адрес:** `https://bulut.my`
- **Формат:** JSON. Успех — `{ "data": … }`, ошибка — `{ "error": "…" }`
- **Доступ:** ровно то, что видит твой профиль в приложении

---

## Содержание

1. [Авторизация](#1-авторизация)
2. [Комнаты](#2-комнаты)
3. [Участники](#3-участники)
4. [Список досок](#4-список-досок)
5. [Одна доска и её этапы](#5-одна-доска-и-её-этапы)
6. [Список задач (фильтры)](#6-список-задач-фильтры)
7. [Одна задача](#7-одна-задача)
8. [Переместить задачу в другой этап](#8-переместить-задачу-в-другой-этап)
9. [Изменить задачу](#9-изменить-задачу)
10. [Комментарии](#10-комментарии)
11. [Создать задачу](#11-создать-задачу)
12. [Коды ошибок](#12-коды-ошибок)
13. [Шпаргалка](#13-шпаргалка)

---

## 1. Авторизация

### Логин

`POST /api/auth/token`

```bash
curl -X POST https://bulut.my/api/auth/token \
  -H "Content-Type: application/json" \
  -d '{"email":"you@example.com","password":"пароль"}'
```

Ответ `200`:
```json
{
  "access_token": "eyJhbGciOi…",
  "refresh_token": "v1.Mr8…",
  "token_type": "bearer",
  "expires_at": 1787000000,
  "expires_in": 3600,
  "user": { "id": "user-uuid", "email": "you@example.com" }
}
```

### Обновить токен

`access_token` живёт 1 час. Обновление без пароля:

```bash
curl -X POST https://bulut.my/api/auth/token \
  -H "Content-Type: application/json" \
  -d '{"refresh_token":"v1.Mr8…"}'
```
Ответ такой же, как при логине.

### Заголовки для всех остальных запросов

```
Authorization: Bearer <access_token>
X-Workspace-Id: <id комнаты>
Content-Type: application/json
```

`X-Workspace-Id` можно заменить query-параметром `?workspace=<id>`.
Без него берётся первая комната пользователя.

---

## 2. Комнаты

`GET /api/workspaces`

```bash
curl https://bulut.my/api/workspaces -H "Authorization: Bearer $TOKEN"
```

```json
{
  "data": [
    { "id": "2ae9a5ff-8d9f-4226-971a-b618dcd90381", "name": "sarbon", "color": "#6366f1", "role": "member" }
  ],
  "total": 1
}
```

Известный баг: в списке бывают дубли одной комнаты.

---

## 3. Участники

`GET /api/members`

```bash
curl https://bulut.my/api/members \
  -H "Authorization: Bearer $TOKEN" -H "X-Workspace-Id: $WS"
```

```json
{
  "data": [
    {
      "memberId": "row-uuid",
      "userId": "user-uuid",
      "name": "Muslimbek Yarashev",
      "email": "…",
      "assignee": "Muslimbek Yarashev",
      "jobRole": "Backend",
      "role": "member",
      "permissions": ["board.view", "card.create"],
      "deleted": false,
      "joinedAt": "2026-05-01T10:00:00.000Z"
    }
  ],
  "total": 1,
  "workspaceId": "ws-uuid"
}
```

| Поле | Смысл |
|---|---|
| `assignee` | строка, которая пишется в поле `assignee` задачи и по которой фильтруются задачи |
| `userId` | id пользователя |
| `deleted` | `true` — аккаунт деактивирован |

---

## 4. Список досок

`GET /api/boards` — все доски комнаты с этапами и счётчиками задач.

```bash
curl https://bulut.my/api/boards \
  -H "Authorization: Bearer $TOKEN" -H "X-Workspace-Id: $WS"
```

```json
{
  "data": [
    {
      "id": "board-uuid",
      "name": "Sarbon CRM",
      "color": "#6366f1",
      "createdAt": "2026-05-01T10:00:00.000Z",
      "taskCount": 61,
      "columns": [
        { "id": "col-uuid-1", "name": "К выполнению",         "total": 12, "active": 12, "done": 0 },
        { "id": "col-uuid-2", "name": "В процессе",           "total": 3,  "active": 3,  "done": 0 },
        { "id": "col-uuid-3", "name": "Готов к тестированию", "total": 5,  "active": 5,  "done": 0 },
        { "id": "col-uuid-4", "name": "На проверке",          "total": 1,  "active": 1,  "done": 0 },
        { "id": "col-uuid-5", "name": "Готово",               "total": 40, "active": 0,  "done": 40 }
      ]
    }
  ],
  "total": 1
}
```

---

## 5. Одна доска и её этапы

`GET /api/boards/:id`

```bash
curl https://bulut.my/api/boards/$BOARD \
  -H "Authorization: Bearer $TOKEN" -H "X-Workspace-Id: $WS"
```

```json
{
  "data": {
    "id": "board-uuid",
    "name": "Sarbon CRM",
    "color": "#6366f1",
    "position": 0,
    "columns": [
      { "id": "col-uuid-1", "name": "К выполнению", "wip": 0, "total": 12, "active": 12, "done": 0 }
    ],
    "customFields": [],
    "taskCount": 61,
    "createdAt": "…",
    "deletedAt": null
  }
}
```

**Этапы = `columns`.** Для перемещения задачи нужен `columns[].id`.

Роль этапа определяется **позицией** колонки:

| Позиция | Роль | Стандартное имя |
|---|---|---|
| первая | todo | К выполнению |
| середина | progress | В процессе |
| третья с конца | ready | Готов к тестированию |
| вторая с конца | review | На проверке |
| последняя | done | Готово |

---

## 6. Список задач (фильтры)

`GET /api/tasks`

```bash
curl -G https://bulut.my/api/tasks \
  -H "Authorization: Bearer $TOKEN" -H "X-Workspace-Id: $WS" \
  --data-urlencode "boardId=$BOARD" \
  --data-urlencode "columnId=$COL_TODO" \
  --data-urlencode "assignee=Muslimbek Yarashev" \
  --data-urlencode "status=active"
```

| Параметр | Значения |
|---|---|
| `boardId` | id доски |
| `columnId` | id этапа |
| `assignee` | имя исполнителя, точное совпадение без учёта регистра |
| `hasAssignee` | `true` / `false` |
| `status` | `active` / `done` |
| `priority` | `low` / `medium` / `high` |
| `type` | `task` `bug` `feature` `newfeature` `improvement` `refactor` `docs` `test` `design` `research` |
| `search` | поиск в заголовке и описании |
| `dueAfter` / `dueBefore` | `YYYY-MM-DD`, включительно |
| `overdue` | `true` — просроченные, не закрытые |
| `subtasks` | `true` — включить подзадачи (по умолчанию скрыты) |
| `sort` | `position` (по умолчанию), `created_at`, `due_date`, `title` |
| `order` | `asc` (по умолчанию) / `desc` |
| `page` | номер страницы, с 1 |
| `limit` | по умолчанию 50, максимум 200 |

Ответ:
```json
{
  "data": [
    {
      "id": "task-uuid",
      "boardId": "board-uuid",
      "columnId": "col-uuid-1",
      "title": "Не приходит SMS-код",
      "description": "Markdown-текст",
      "assignee": "Muslimbek Yarashev",
      "priority": "high",
      "type": "bug",
      "status": "active",
      "dueDate": "2026-09-25",
      "doneDueDate": null,
      "tags": ["auth"],
      "checklist": [ { "id": "…", "text": "Проверить iOS", "done": false } ],
      "attachments": [ { "id": "…", "name": "screen.png", "url": "https://…" } ],
      "stageTimes": {},
      "returnCount": 0,
      "returns": [],
      "createdAt": "2026-09-18T08:00:00.000Z",
      "createdBy": "Matyoqub",
      "completedAt": null,
      "readyAt": null,
      "testedAt": null,
      "mapId": null,
      "mapNodeId": null
    }
  ],
  "meta": { "total": 12, "page": 1, "limit": 50, "pages": 1, "hasMore": false }
}
```

### Как проверять новые задачи

Запросить задачи этапа «К выполнению» и сравнить с прошлым запросом:

```
GET /api/tasks?boardId=<board>&columnId=<col todo>&sort=created_at&order=desc
```

Новыми считаются задачи, у которых `id` ещё не встречался или `createdAt`
позже времени прошлой проверки.

`returnCount > 0` — задачу возвращали с тестирования на доработку.

---

## 7. Одна задача

`GET /api/tasks/:id` — задача со всеми комментариями.

```bash
curl https://bulut.my/api/tasks/$TASK \
  -H "Authorization: Bearer $TOKEN" -H "X-Workspace-Id: $WS"
```

Ответ — те же поля, что в списке, плюс:
```json
{
  "data": {
    "id": "task-uuid",
    "…": "…",
    "comments": [
      { "id": "…", "author": "Sayat", "text": "Не работает на Android", "kind": "return", "createdAt": "…" }
    ]
  }
}
```

`kind`: `comment` — обычный комментарий, `return` — причина возврата с тестирования.

Ссылка на карточку в приложении: `https://bulut.my/board/<boardId>?task=<taskId>`

---

## 8. Переместить задачу в другой этап

`PATCH /api/tasks/:id` с `columnId` (и при желании `position`).

```bash
# «К выполнению» → «В процессе»
curl -X PATCH https://bulut.my/api/tasks/$TASK \
  -H "Authorization: Bearer $TOKEN" -H "X-Workspace-Id: $WS" \
  -H "Content-Type: application/json" \
  -d '{"columnId":"col-uuid-2","status":"active","position":0}'

# «В процессе» → «Готов к тестированию»
curl -X PATCH https://bulut.my/api/tasks/$TASK \
  -H "Authorization: Bearer $TOKEN" -H "X-Workspace-Id: $WS" \
  -H "Content-Type: application/json" \
  -d '{"columnId":"col-uuid-3","status":"active","position":0}'

# → «Готово» (закрыть: completedAt проставится сам)
curl -X PATCH https://bulut.my/api/tasks/$TASK \
  -H "Authorization: Bearer $TOKEN" -H "X-Workspace-Id: $WS" \
  -H "Content-Type: application/json" \
  -d '{"columnId":"col-uuid-5","status":"done"}'
```

| Поле | Смысл |
|---|---|
| `columnId` | id этапа из `GET /api/boards` |
| `position` | место в колонке, `0` — первая сверху |
| `status` | `active` / `done` |

Ответ — обновлённая задача в `data`.

- «Готово» = `status: "done"` **и** последняя колонка. Только `status` не переносит карточку.
- `columnId` должен быть из **той же** доски — перенос на другую доску через этот API не делается.
- Через API не обновляются счётчики времени по этапам (`stageTimes`, `readyAt`, `testedAt`), как при перетаскивании в интерфейсе.

---

## 9. Изменить задачу

`PATCH /api/tasks/:id` — любое подмножество полей.

```bash
curl -X PATCH https://bulut.my/api/tasks/$TASK \
  -H "Authorization: Bearer $TOKEN" -H "X-Workspace-Id: $WS" \
  -H "Content-Type: application/json" \
  -d '{"assignee":"Sharif","priority":"high","dueDate":"2026-09-30"}'
```

| Поле | Тип |
|---|---|
| `title`, `description` | string |
| `assignee` | string (из `/api/members`) |
| `priority` | `low` / `medium` / `high` |
| `type` | см. §6 |
| `status` | `active` / `done` |
| `dueDate`, `doneDueDate` | `YYYY-MM-DD` или `null` |
| `columnId`, `position` | см. §8 |
| `tags` | string[] |
| `checklist` | `{ id, text, done }[]` |
| `attachments` | `{ id, name, url }[]` |
| `parentId` | id родительской задачи или `null` |
| `blockedBy` | id задач[] |

**Массивы (`tags`, `checklist`, `attachments`, `blockedBy`) заменяются целиком.**
Чтобы отметить пункт чек-листа: прочитать задачу (§7), изменить массив, отправить весь.

```bash
curl -X PATCH https://bulut.my/api/tasks/$TASK … \
  -d '{"checklist":[{"id":"c1","text":"Проверить iOS","done":true},{"id":"c2","text":"Android","done":false}]}'
```

Удалить задачу: `DELETE /api/tasks/:id` — в Корзину. `?hard=true` — навсегда.

---

## 10. Комментарии

### Прочитать

`GET /api/tasks/:id/comments`

```bash
curl https://bulut.my/api/tasks/$TASK/comments \
  -H "Authorization: Bearer $TOKEN" -H "X-Workspace-Id: $WS"
```
```json
{
  "data": [
    { "id": "…", "taskId": "task-uuid", "author": "Sayat", "text": "…", "kind": "comment", "createdAt": "…" }
  ],
  "total": 1
}
```

### Добавить

`POST /api/tasks/:id/comments`

```bash
curl -X POST https://bulut.my/api/tasks/$TASK/comments \
  -H "Authorization: Bearer $TOKEN" -H "X-Workspace-Id: $WS" \
  -H "Content-Type: application/json" \
  -d '{"text":"Исправлено, готово к тесту","author":"Muslimbek Yarashev"}'
```

| Поле | |
|---|---|
| `text` * | Markdown, `@имя` — упоминание |
| `author` | строка `assignee` из `/api/members` |
| `kind` | `comment` (по умолчанию) / `return` |

Ответ `201` — созданный комментарий.

---

## 11. Создать задачу

`POST /api/tasks`

```bash
curl -X POST https://bulut.my/api/tasks \
  -H "Authorization: Bearer $TOKEN" -H "X-Workspace-Id: $WS" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Не приходит SMS-код",
    "boardId": "board-uuid",
    "columnId": "col-uuid-1",
    "description": "Шаги воспроизведения…",
    "assignee": "Muslimbek Yarashev",
    "priority": "high",
    "type": "bug",
    "dueDate": "2026-09-25",
    "tags": ["auth"],
    "checklist": [{"text":"Проверить iOS"}]
  }'
```

Обязательные: `title`, `boardId`, `columnId`. Ответ `201` — созданная задача.

---

## 12. Коды ошибок

| Код | Причина |
|---|---|
| `400` | кривой JSON, нет обязательного поля, `No valid fields to update` |
| `401` | нет токена / токен истёк → обновить через `refresh_token` |
| `403` | нет доступа к комнате из `X-Workspace-Id` |
| `404` | задача, доска или колонка не найдены |
| `500` | ошибка сервера / базы |

Тело ошибки: `{ "error": "текст" }`.

---

## 13. Шпаргалка

| Действие | Метод и путь | Тело / параметры |
|---|---|---|
| Логин | `POST /api/auth/token` | `{email, password}` |
| Обновить токен | `POST /api/auth/token` | `{refresh_token}` |
| Комнаты | `GET /api/workspaces` | |
| Участники | `GET /api/members` | |
| Список досок + этапы | `GET /api/boards` | |
| Одна доска | `GET /api/boards/:id` | |
| Задачи | `GET /api/tasks` | `boardId, columnId, assignee, status, sort, order, page, limit…` |
| Одна задача + комментарии | `GET /api/tasks/:id` | |
| Переместить в этап | `PATCH /api/tasks/:id` | `{columnId, position, status}` |
| Изменить задачу | `PATCH /api/tasks/:id` | любые поля из §9 |
| Создать задачу | `POST /api/tasks` | `{title, boardId, columnId, …}` |
| Удалить задачу | `DELETE /api/tasks/:id` | `?hard=true` — навсегда |
| Комментарии | `GET /api/tasks/:id/comments` | |
| Добавить комментарий | `POST /api/tasks/:id/comments` | `{text, author, kind}` |

Заголовки: `Authorization: Bearer <access_token>` · `X-Workspace-Id: <комната>` · `Content-Type: application/json`
