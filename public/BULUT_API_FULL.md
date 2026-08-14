# Bulut API — полная документация

Полное руководство по управлению Bulut через API: комнаты, доски, колонки,
задачи, даты, этапы, спринты, эпики, подзадачи, зависимости, чек-листы,
комментарии, журнал, карты (Bulut MAP), команда, права, корзина и бэкапы.

Документ самодостаточный: агенту (Claude) достаточно этого файла, чтобы
создать новую доску, наполнить её задачами, двигать их по этапам, ставить
даты, закрывать, собирать спринты и удалять.

- **База (REST):** `https://ВАШ_ДОМЕН` (прод по умолчанию: `https://bulut-kappa.vercel.app`)
- **Формат:** JSON. Успех — `{ "data": ... }` или объект, ошибка — `{ "error": "..." }`.
- **Живая справка:** `GET /api`
- **Изоляция данных:** Row Level Security на уровне комнаты. По API вы видите ровно
  то, что видите в приложении под своим аккаунтом.

---

## Содержание

1. [Быстрый старт за 60 секунд](#1-быстрый-старт-за-60-секунд)
2. [Авторизация](#2-авторизация)
3. [Комнаты (workspaces)](#3-комнаты-workspaces)
4. [Модель данных и главные правила](#4-модель-данных-и-главные-правила)
5. [Доски](#5-доски)
6. [Колонки (этапы) доски](#6-колонки-этапы-доски)
7. [Задачи: создание](#7-задачи-создание)
8. [Задачи: чтение и фильтры](#8-задачи-чтение-и-фильтры)
9. [Задачи: изменение, даты, перемещение](#9-задачи-изменение-даты-перемещение)
10. [Задачи: удаление и восстановление](#10-задачи-удаление-и-восстановление)
11. [Рабочий процесс: в тест → принять → вернуть → готово](#11-рабочий-процесс-в-тест--принять--вернуть--готово)
12. [Спринты, эпики, очки, наблюдатели, свои поля](#12-спринты-эпики-очки-наблюдатели-свои-поля)
13. [Подзадачи, зависимости, чек-лист, вложения, фото](#13-подзадачи-зависимости-чек-лист-вложения-фото)
14. [Комментарии и возвраты](#14-комментарии-и-возвраты)
15. [Журнал](#15-журнал)
16. [Bulut MAP — карты продукта](#16-bulut-map--карты-продукта)
17. [MCP-сервер (инструменты для ИИ)](#17-mcp-сервер-инструменты-для-ии)
18. [Команда, приглашения, роли и права](#18-команда-приглашения-роли-и-права)
19. [Уведомления и письма](#19-уведомления-и-письма)
20. [Корзина и бэкапы](#20-корзина-и-бэкапы)
21. [Прямой доступ к базе (Supabase PostgREST)](#21-прямой-доступ-к-базе-supabase-postgrest)
22. [Справочник таблиц и колонок](#22-справочник-таблиц-и-колонок)
23. [Готовые сценарии](#23-готовые-сценарии)
24. [Ошибки, лимиты и подводные камни](#24-ошибки-лимиты-и-подводные-камни)
25. [Шпаргалка: все эндпойнты](#25-шпаргалка-все-эндпойнты)

---

## 1. Быстрый старт за 60 секунд

```bash
BASE="https://bulut-kappa.vercel.app"

# 1) Токен
TOKEN=$(curl -s -X POST $BASE/api/auth/token \
  -H "Content-Type: application/json" \
  -d '{"email":"you@example.com","password":"ваш-пароль"}' | jq -r .access_token)

# 2) Комната
WS=$(curl -s $BASE/api/workspaces -H "Authorization: Bearer $TOKEN" | jq -r '.data[0].id')

# 3) Новая доска (со стандартными 5 этапами)
BOARD=$(curl -s -X POST $BASE/api/boards \
  -H "Authorization: Bearer $TOKEN" -H "X-Workspace-Id: $WS" \
  -H "Content-Type: application/json" \
  -d '{"name":"Спринт 12","color":"#6366f1"}' | jq -r .id)

# 4) id первой колонки
COL=$(curl -s $BASE/api/boards -H "Authorization: Bearer $TOKEN" -H "X-Workspace-Id: $WS" \
  | jq -r ".data[] | select(.id==\"$BOARD\") | .columns[0].id")

# 5) Задача с дедлайном
TASK=$(curl -s -X POST $BASE/api/tasks \
  -H "Authorization: Bearer $TOKEN" -H "X-Workspace-Id: $WS" \
  -H "Content-Type: application/json" \
  -d "{\"title\":\"Починить логин\",\"boardId\":\"$BOARD\",\"columnId\":\"$COL\",
       \"type\":\"bug\",\"priority\":\"high\",\"assignee\":\"Иван\",
       \"dueDate\":\"2026-08-20\",\"doneDueDate\":\"2026-08-22\"}" | jq -r .data.id)

# 6) Закрыть
curl -s -X PATCH $BASE/api/tasks/$TASK -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" -d '{"status":"done"}'
```

---

## 2. Авторизация

### 2.1 Вход по email + паролю (основной способ)

```http
POST /api/auth/token
Content-Type: application/json

{ "email": "you@example.com", "password": "ваш-пароль" }
```

Ответ:
```json
{
  "access_token": "eyJhbGciOi...",
  "refresh_token": "v1.Mr8...",
  "token_type": "bearer",
  "expires_at": 1712345678,
  "expires_in": 3600,
  "user": { "id": "uuid", "email": "you@example.com" }
}
```

Дальше **в каждом запросе**:
```
Authorization: Bearer <access_token>
```

### 2.2 Обновление токена

Токен живёт ~1 час. Обновление без пароля:
```http
POST /api/auth/token
{ "refresh_token": "v1.Mr8..." }
```
Ответ такой же. **Refresh-токен одноразовый** — сохраняйте новый из ответа.

### 2.3 Ключ интеграции (`X-API-Key`)

Альтернатива для сервер-серверных интеграций. Вместо `Authorization` шлите:
```
X-API-Key: <BULUT_API_KEY>
```
Работает, только если на сервере заданы `BULUT_API_KEY`,
`BULUT_API_SERVICE_EMAIL`, `BULUT_API_SERVICE_PASS`. Сервер входит под сервисным
аккаунтом; **этот аккаунт должен быть приглашён в нужную комнату**, иначе
получите `403` с подсказкой. Если переменных нет — `501`.

Приоритет: если прислали `X-API-Key`, `Authorization` игнорируется.

### 2.4 Регистрация нового пользователя (OTP по почте)

```http
POST /api/auth/otp/send
{ "email": "new@example.com", "name": "Иван", "role": "Frontend" }
→ { "ok": true, "ticket": "<подписанный тикет>" }
```
```http
POST /api/auth/otp/verify
{ "email": "new@example.com", "code": "123456", "ticket": "<тикет из send>" }
→ { "ok": true, "email": "...", "name": "...", "role": "..." }
```
Код действует ограниченное время, повторная отправка — не чаще, чем раз в
интервал (иначе `429`). После `verify` клиент завершает регистрацию в Supabase
(`auth.signUp`) — тикет только подтверждает владение почтой.

Возможные роли-профессии: `Frontend`, `Backend`, `QA`, `Mobile`, `DevOps`,
`Дизайн`, `PM`.

---

## 3. Комнаты (workspaces)

Все данные (доски, задачи, журнал, карты) принадлежат **комнате**. Пользователь
может состоять в нескольких.

```http
GET /api/workspaces
Authorization: Bearer <token>
```
```json
{ "data": [ { "id": "ws-uuid", "name": "Моя команда", "color": "#6366f1", "role": "owner" } ], "total": 1 }
```

Выбор комнаты в любом запросе:
```
X-Workspace-Id: <ws-uuid>
```
или `?workspace=<ws-uuid>`. **Если не указать — берётся первая ваша комната.**
Если состоите в нескольких — всегда указывайте явно.

Роли в комнате: `owner` · `admin` · `member`.

> Комнату **создать** через REST нельзя — используйте RPC `create_workspace`
> (см. [§21](#21-прямой-доступ-к-базе-supabase-postgrest)).

---

## 4. Модель данных и главные правила

```
Комната (workspace)
└── Доска (board)              ← «направление»/проект/спринт-борд
    ├── Колонки (columns)      ← этапы, хранятся JSONB прямо в доске
    ├── Свои поля (customFields)
    └── Задачи (tasks)
        ├── Подзадачи (parentId)
        ├── Чек-лист, вложения, фото
        ├── Комментарии (task_comments)
        └── Привязка к карте (mapId + mapNodeId)
Журнал (journal) · Карты (project_maps) · Корзина · Бэкапы
```

### Правило колонок — запомните, от него зависит вся автоматика

Роль колонки определяется её **позицией**, а не названием:

| Позиция | Роль | Стандартное имя |
|---|---|---|
| первая | `todo` | К выполнению |
| середина | `progress` | В процессе |
| третья с конца | `ready` | Готов к тестированию |
| вторая с конца | `review` | На проверке |
| **последняя** | **`done`** | Готово |

Поэтому доска для полноценного процесса должна иметь **минимум 3, лучше 5
колонок**, и «Готово» всегда последняя.

### Ключевые соглашения

- Все id — UUID (кроме `columnId` — это строка-uuid внутри JSONB доски).
- Даты-дедлайны — `YYYY-MM-DD`. Метки времени — ISO 8601 (`2026-08-09T10:00:00.000Z`).
- В REST-ответах поля в **camelCase**, в базе — в **snake_case**
  (`dueDate` ↔ `due_date`). При прямых запросах в Supabase используйте snake_case.
- Удаление по умолчанию **мягкое** (в Корзину, `deleted_at`), `?hard=true` — навсегда.

---

## 5. Доски

### 5.1 Список досок с колонками и счётчиками

```http
GET /api/boards
Authorization: Bearer <token>
X-Workspace-Id: <ws>
```
```json
{
  "data": [{
    "id": "board-uuid",
    "name": "Driver",
    "color": "#6366f1",
    "createdAt": "2026-07-01T09:00:00.000Z",
    "columns": [
      { "id": "col-1", "name": "К выполнению",        "total": 3, "active": 3, "done": 0 },
      { "id": "col-2", "name": "В процессе",          "total": 2, "active": 2, "done": 0 },
      { "id": "col-3", "name": "Готов к тестированию","total": 1, "active": 1, "done": 0 },
      { "id": "col-4", "name": "На проверке",         "total": 0, "active": 0, "done": 0 },
      { "id": "col-5", "name": "Готово",              "total": 5, "active": 0, "done": 5 }
    ],
    "taskCount": 11
  }],
  "total": 1
}
```
`columns[].id` — это `columnId` для задач. Доски в корзине не возвращаются.

### 5.2 Создать доску

```http
POST /api/boards
Authorization: Bearer <token>
X-Workspace-Id: <ws>
Content-Type: application/json

{
  "name": "Спринт 12",
  "color": "#0ea5e9",
  "columns": ["Бэклог", "В работе", "Готов к тестированию", "На проверке", "Готово"]
}
```
```json
{ "id": "new-board-uuid", "name": "Спринт 12",
  "columns": [ { "id": "col-uuid", "name": "Бэклог" }, … ] }
```
→ `201 Created`

| Поле | Тип | По умолчанию |
|---|---|---|
| `name` | string (≤200) | `"Новая доска"` |
| `color` | hex | следующий из палитры по кругу |
| `columns` | string[] | `["К выполнению","В процессе","Готов к тестированию","На проверке","Готово"]` |

Пустое тело допустимо — получите доску с дефолтами.
Палитра: `#6366f1 #0ea5e9 #10b981 #f59e0b #ef4444 #8b5cf6 #14b8a6`
(в приложении также `#ec4899 #f97316 #64748b`).

### 5.3 Переименовать / перекрасить / удалить доску

> В REST этого пока **нет** — делается прямым запросом в Supabase (см. [§21](#21-прямой-доступ-к-базе-supabase-postgrest)).
> Права и изоляция сохраняются: работает та же RLS.

```bash
SB="https://umivhhkwolysesmkvisa.supabase.co"   # NEXT_PUBLIC_SUPABASE_URL
ANON="<NEXT_PUBLIC_SUPABASE_ANON_KEY>"

# Переименовать + сменить цвет
curl -s -X PATCH "$SB/rest/v1/boards?id=eq.$BOARD" \
  -H "apikey: $ANON" -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" -H "Prefer: return=representation" \
  -d '{"name":"Спринт 13","color":"#10b981"}'

# Мягкое удаление доски (в Корзину) — не забудьте её задачи
NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
curl -s -X PATCH "$SB/rest/v1/boards?id=eq.$BOARD" \
  -H "apikey: $ANON" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d "{\"deleted_at\":\"$NOW\"}"
curl -s -X PATCH "$SB/rest/v1/tasks?board_id=eq.$BOARD&deleted_at=is.null" \
  -H "apikey: $ANON" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d "{\"deleted_at\":\"$NOW\"}"

# Восстановить из Корзины
curl -s -X PATCH "$SB/rest/v1/boards?id=eq.$BOARD" \
  -H "apikey: $ANON" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"deleted_at":null}'

# Удалить НАВСЕГДА (задачи и комментарии уйдут каскадом)
curl -s -X DELETE "$SB/rest/v1/boards?id=eq.$BOARD" \
  -H "apikey: $ANON" -H "Authorization: Bearer $TOKEN"
```

### 5.4 Порядок досок

Колонка `position` (integer) в таблице `boards`. Меньше — выше в списке.

---

## 6. Колонки (этапы) доски

Колонки живут в JSONB-поле `boards.columns`:
```json
[
  { "id": "uuid", "name": "К выполнению", "wip": 0 },
  { "id": "uuid", "name": "В процессе",   "wip": 3 }
]
```
- `id` — произвольная уникальная строка (в приложении — UUID). На неё ссылается `tasks.column_id`.
- `name` — заголовок этапа.
- `wip` — лимит задач в колонке (0/отсутствует — без лимита). Приложение подсвечивает превышение.

Через REST колонки задаются **только при создании доски**. Дальше — целиком
перезаписью массива:

```bash
# 1) прочитать текущие
curl -s "$SB/rest/v1/boards?id=eq.$BOARD&select=columns" \
  -H "apikey: $ANON" -H "Authorization: Bearer $TOKEN"

# 2) записать новый массив (добавили колонку и лимит WIP)
curl -s -X PATCH "$SB/rest/v1/boards?id=eq.$BOARD" \
  -H "apikey: $ANON" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"columns":[
        {"id":"c1","name":"Бэклог"},
        {"id":"c2","name":"В работе","wip":3},
        {"id":"c3","name":"Готов к тестированию"},
        {"id":"c4","name":"На проверке"},
        {"id":"c5","name":"Готово"}]}'
```

**Осторожно:** удаляя колонку, сначала перенесите её задачи
(`PATCH /api/tasks/:id { "columnId": "другая" }`), иначе карточки «повиснут» —
они останутся в базе, но не отрисуются ни в одной колонке.
И помните про [правило позиций](#правило-колонок--запомните-от-него-зависит-вся-автоматика):
меняя порядок колонок, вы меняете роли этапов.

### Свои поля карточек (customFields)

`boards.custom_fields` — JSONB `[{ "id": "f1", "name": "Ссылка на макет" }]`.
Значения хранятся в задаче: `tasks.custom` → `{ "f1": "https://…" }`.

---

## 7. Задачи: создание

```http
POST /api/tasks
Authorization: Bearer <token>
X-Workspace-Id: <ws>
Content-Type: application/json
```
```json
{
  "title": "Починить логин по SMS",
  "boardId": "board-uuid",
  "columnId": "col-1",
  "description": "Не приходит код на номера +998…\n\n**Шаги:** …",
  "assignee": "Иван",
  "priority": "high",
  "type": "bug",
  "dueDate": "2026-08-20",
  "doneDueDate": "2026-08-22",
  "tags": ["auth", "mobile"],
  "checklist": [ { "text": "Воспроизвести" }, { "text": "Починить", "done": false } ],
  "attachments": [ { "name": "Логи", "url": "https://example.com/log.txt" } ],
  "mapId": "map-uuid",
  "mapNodeId": "node-id",
  "parentId": null,
  "blockedBy": ["task-uuid-1"]
}
```
→ `201` + `{ "data": { …задача… } }`

### Поля при создании

| Поле | Тип | Обяз. | Примечание |
|---|---|:--:|---|
| `title` | string | ✅ | непустая строка |
| `boardId` | uuid | ✅ | должна существовать, иначе `404 Board not found` |
| `columnId` | string | ✅ | должна быть в `board.columns`, иначе `404` |
| `description` | string | | поддерживает Markdown |
| `assignee` | string | | **имя** участника, не uuid |
| `priority` | `low`\|`medium`\|`high` | | по умолчанию `medium`; неизвестное значение молча заменяется на `medium` |
| `type` | см. ниже | | по умолчанию `task` |
| `dueDate` | `YYYY-MM-DD` | | дедлайн «Готов к тестированию» (для разработчика) |
| `doneDueDate` | `YYYY-MM-DD` | | дедлайн «Готово» (финальный, для QA) |
| `tags` | string[] | | |
| `checklist` | `[{text, done?}]` | | `id` присваивается сервером |
| `attachments` | `[{name?, url}]` | | без `url` элемент отбрасывается |
| `mapId` / `mapNodeId` | uuid / string | | привязка к экрану карты |
| `parentId` | uuid | | делает задачу подзадачей |
| `blockedBy` | uuid[] | | «блокируется задачами» |

**Типы задач (`type`):**
`task` 📋 · `bug` 🐞 · `feature` ✨ · `newfeature` 🚀 · `improvement` ⬆️ ·
`refactor` 🔧 · `docs` 📄 · `test` 🧪 · `design` 🎨 · `research` 🔬

Сервер сам проставляет: `id`, `status: "active"`, `position` (в конец колонки),
`created_at`, `stage_entered_at`, `return_count: 0`, `stage_times: {}`,
`created_by` (= `assignee`, иначе `"API"`), `workspace_id` (берётся **из доски**,
а не из заголовка).

> Поля `sprint`, `epic`, `storyPoints`, `watchers`, `custom`, `photos` при
> создании через REST **не принимаются** — проставьте их сразу после создания
> (см. [§12](#12-спринты-эпики-очки-наблюдатели-свои-поля)).

---

## 8. Задачи: чтение и фильтры

### 8.1 Список

```http
GET /api/tasks?boardId=…&status=active&priority=high&sort=due_date&limit=100
```
```json
{
  "data": [ { "id": "…", "title": "…", … } ],
  "meta": { "total": 132, "page": 1, "limit": 50, "pages": 3, "hasMore": true }
}
```

| Параметр | Значения | Описание |
|---|---|---|
| `boardId` | uuid | задачи одной доски |
| `columnId` | string | задачи одного этапа |
| `status` | `active`\|`done` | |
| `priority` | `low`\|`medium`\|`high` | |
| `type` | см. список типов | |
| `assignee` | строка | точное совпадение без учёта регистра |
| `hasAssignee` | `true`\|`false` | есть ли исполнитель |
| `search` | строка | подстрока в `title` **или** `description` |
| `dueAfter` | `YYYY-MM-DD` | `due_date >=` |
| `dueBefore` | `YYYY-MM-DD` | `due_date <=` |
| `overdue` | `true` | `due_date < сегодня` И не `done` |
| `mapId` | uuid | привязанные к карте |
| `mapNodeId` | string | привязанные к узлу карты |
| `subtasks` | `true` | **включить подзадачи** (по умолчанию скрыты) |
| `sort` | `position`\|`created_at`\|`due_date`\|`title` | по умолчанию `position` |
| `order` | `asc`\|`desc` | по умолчанию `asc` |
| `page` | число ≥1 | по умолчанию 1 |
| `limit` | 1–200 | по умолчанию 50 |

Фильтры комбинируются через «И». Задачи из Корзины не возвращаются.

> Фильтрации по `sprint`/`epic` в REST нет — используйте
> [прямой запрос в Supabase](#21-прямой-доступ-к-базе-supabase-postgrest):
> `GET /rest/v1/tasks?sprint=eq.Спринт%2012&deleted_at=is.null`.

### 8.2 Одна задача (с комментариями)

```http
GET /api/tasks/<id>
```
```json
{ "data": {
  "id": "…", "boardId": "…", "columnId": "…",
  "title": "…", "description": "…", "assignee": "Иван",
  "priority": "high", "type": "bug", "status": "active",
  "dueDate": "2026-08-20", "doneDueDate": "2026-08-22",
  "tags": ["auth"],
  "checklist": [ { "id": "…", "text": "Воспроизвести", "done": true } ],
  "attachments": [ { "id": "…", "name": "Логи", "url": "…" } ],
  "stageTimes": { "В процессе": 7200 },
  "returnCount": 1,
  "returns": [ { "at": "…", "from": "На проверке", "to": "К выполнению", "seconds": 3600, "reason": "не воспроизводится" } ],
  "createdAt": "…", "createdBy": "Иван",
  "readyAt": "…", "testedAt": null, "completedAt": null,
  "comments": [ { "id": "…", "author": "QA", "text": "…", "kind": "comment", "createdAt": "…" } ]
} }
```

Поля-метрики:
- `stageTimes` — секунды, накопленные на каждом этапе (по **имени** колонки).
- `returnCount` / `returns` — сколько раз и как задачу возвращали на доработку.
- `readyAt` / `testedAt` / `completedAt` — вехи жизненного цикла.

---

## 9. Задачи: изменение, даты, перемещение

```http
PATCH /api/tasks/<id>
Authorization: Bearer <token>
Content-Type: application/json
```
Передавайте **любое подмножество** полей:

| Поле | Тип | Заметка |
|---|---|---|
| `title` | string | |
| `description` | string | |
| `assignee` | string | `""` — снять исполнителя |
| `priority` | `low`\|`medium`\|`high` | неверное значение **молча игнорируется** |
| `type` | тип задачи | то же |
| `status` | `active`\|`done` | при `done` автоматически ставится `completed_at` |
| `dueDate` | `YYYY-MM-DD` \| `null` | дедлайн «в тест» |
| `doneDueDate` | `YYYY-MM-DD` \| `null` | дедлайн «готово» |
| `tags` | string[] | заменяет массив целиком |
| `columnId` | string | перенос на другой этап |
| `position` | number | порядок внутри колонки (можно дробное) |
| `checklist` | массив | заменяет целиком |
| `attachments` | массив | заменяет целиком |
| `mapId`, `mapNodeId` | uuid/string/`null` | привязка к карте |
| `parentId` | uuid \| `null` | сделать подзадачей / отвязать |
| `blockedBy` | uuid[] | зависимости |

Если ни одного валидного поля — `400 No valid fields to update`.
Ответ — задача целиком (как `GET /api/tasks/:id`).

### 9.1 Даты и дедлайны

```bash
# поставить обе даты
curl -X PATCH $BASE/api/tasks/$TASK -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"dueDate":"2026-08-20","doneDueDate":"2026-08-25"}'

# снять дедлайн
curl -X PATCH $BASE/api/tasks/$TASK -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" -d '{"dueDate":null}'
```
Смысл двух дат: `dueDate` — до какого числа разработчик обязан сдать в тест;
`doneDueDate` — до какого числа задача должна быть полностью закрыта.
Просрочки видны в фильтре `?overdue=true` и в отчётах приложения.

### 9.2 Перемещение между этапами и сортировка

```bash
# перенести в «На проверке», поставить первой
curl -X PATCH $BASE/api/tasks/$TASK -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" -d '{"columnId":"col-4","position":0}'
```

**Важно:** `position` — `double precision`, поэтому не нужно перенумеровывать
соседей. Чтобы вставить между задачами с `position` 2 и 3 — поставьте `2.5`.
Наверх колонки — значение меньше минимального (например `-1`).

**Важно:** перенос в последнюю колонку через API **не закрывает задачу
автоматически** (в отличие от перетаскивания мышью в приложении). Нужно явно:
```json
{ "columnId": "<последняя колонка>", "status": "done" }
```
См. [§11](#11-рабочий-процесс-в-тест--принять--вернуть--готово) — там полный корректный сценарий.

### 9.3 Отметить выполненной / вернуть в работу

```bash
# готово
curl -X PATCH $BASE/api/tasks/$TASK -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" -d '{"status":"done"}'

# снова в работу
curl -X PATCH $BASE/api/tasks/$TASK -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" -d '{"status":"active","columnId":"col-2"}'
```
При `status:"active"` поле `completed_at` **не сбрасывается** автоматически —
если это важно для отчётов, обнулите его прямым запросом в Supabase
(`{"completed_at":null,"tested_at":null}`).

### 9.4 Перенос задачи на другую доску

REST этого не умеет (`boardId` в PATCH не принимается). Прямым запросом:
```bash
curl -X PATCH "$SB/rest/v1/tasks?id=eq.$TASK" \
  -H "apikey: $ANON" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"board_id":"<новая доска>","column_id":"<колонка новой доски>",
       "stage_entered_at":"2026-08-09T10:00:00Z","stage_times":{}}'
```
Обязательно смените и `column_id` — колонки принадлежат конкретной доске.
Подзадачи (`parent_id`) переносите вместе с родителем, иначе отвяжите их.

---

## 10. Задачи: удаление и восстановление

```bash
# в Корзину (обратимо) — по умолчанию
curl -X DELETE $BASE/api/tasks/$TASK -H "Authorization: Bearer $TOKEN"
→ { "deleted": true, "id": "…", "hard": false }

# навсегда (вместе с комментариями по каскаду)
curl -X DELETE "$BASE/api/tasks/$TASK?hard=true" -H "Authorization: Bearer $TOKEN"
```

Восстановление из Корзины (REST нет — прямым запросом):
```bash
curl -X PATCH "$SB/rest/v1/tasks?id=eq.$TASK" \
  -H "apikey: $ANON" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"deleted_at":null}'
```

Посмотреть, что в Корзине:
```bash
curl "$SB/rest/v1/tasks?deleted_at=not.is.null&workspace_id=eq.$WS&select=id,title,deleted_at" \
  -H "apikey: $ANON" -H "Authorization: Bearer $TOKEN"
```

---

## 11. Рабочий процесс: в тест → принять → вернуть → готово

В приложении есть кнопки «Отправить в тест», «Принять», «Вернуть». Через API
это набор полей. Ниже — что именно делает каждая кнопка, чтобы повторить её
поведение один в один (иначе поедут метрики этапов, журнал и аналитика).

Пусть колонки доски = `[c1 …, cReady, cReview, cDone]` (три с конца).

### 11.1 «Отправить в тест» (разработчик сдал)
```jsonc
// PATCH /api/tasks/:id
{ "columnId": "cReady", "status": "active" }
```
плюс, для корректных метрик, прямым запросом в Supabase:
```jsonc
{ "ready_at": "<now ISO, если ещё null>",
  "completed_at": null, "tested_at": null,
  "stage_entered_at": "<now ISO>",
  "stage_times": { /* прежние + секунды, проведённые в старой колонке */ } }
```
И запись в журнал: `POST /api/journal { boardName, taskTitle, assignee, stage: "Готов к тестированию", type }`.

### 11.2 «Принять» (QA принял → Готово)
```jsonc
// PATCH /api/tasks/:id
{ "columnId": "cDone", "status": "done" }
```
`completed_at` проставится сам. Дополнительно (для полной точности):
```jsonc
{ "tested_at": "<now>", "ready_at": "<now, если был null>",
  "stage_entered_at": "<now>", "photos": [] }
```
Фото в приложении **удаляются при переходе в «Готово»** — так экономится место.

### 11.3 «Вернуть на доработку» (QA отклонил)
```jsonc
// PATCH /api/tasks/:id — возврат идёт в ПЕРВУЮ колонку
{ "columnId": "c1", "status": "active" }
```
+ комментарий с причиной:
```http
POST /api/tasks/:id/comments
{ "text": "Не воспроизводится на iOS", "author": "QA", "kind": "return" }
```
+ прямым запросом — счётчик и история возвратов:
```jsonc
{ "return_count": <старый + 1>,
  "returns": [ …прежние…,
    { "at": "<now>", "from": "На проверке", "to": "К выполнению",
      "seconds": <сколько провёл на этапе>, "reason": "Не воспроизводится на iOS" } ],
  "completed_at": null, "tested_at": null, "stage_entered_at": "<now>" }
```

### 11.4 Минимальный вариант

Если метрики этапов и журнал вам не нужны, достаточно двух полей:
`columnId` + `status`. Задача будет отображаться правильно; «поедут» только
времена по этапам, счётчик возвратов и записи журнала.

---

## 12. Спринты, эпики, очки, наблюдатели, свои поля

Эти поля есть в базе (`tasks`), но REST их **не принимает** — ставьте прямым
запросом в Supabase. Спринт и эпик — обычные текстовые метки: «спринт» = все
задачи с одинаковым значением `sprint`.

| Поле в БД | Тип | Смысл |
|---|---|---|
| `sprint` | text | метка спринта, напр. `"Спринт 12"` (индексировано) |
| `epic` | text | метка эпика, напр. `"Онбординг"` (индексировано) |
| `story_points` | integer | оценка сложности |
| `watchers` | text[] | имена наблюдателей — им идут уведомления |
| `custom` | jsonb | значения своих полей доски: `{"<fieldId>": "значение"}` |

### Создать спринт и набрать в него задачи

```bash
# 1) пометить существующие задачи спринтом (по списку id)
curl -X PATCH "$SB/rest/v1/tasks?id=in.($T1,$T2,$T3)" \
  -H "apikey: $ANON" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"sprint":"Спринт 12"}'

# 2) сразу с оценкой и эпиком
curl -X PATCH "$SB/rest/v1/tasks?id=eq.$T1" \
  -H "apikey: $ANON" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"sprint":"Спринт 12","epic":"Онбординг","story_points":5,"watchers":["Иван","QA"]}'

# 3) содержимое спринта
curl "$SB/rest/v1/tasks?sprint=eq.Спринт%2012&deleted_at=is.null&select=id,title,status,story_points,assignee" \
  -H "apikey: $ANON" -H "Authorization: Bearer $TOKEN"

# 4) сумма очков спринта (посчитайте на клиенте по ответу выше)

# 5) закрыть спринт: снять метку у незавершённых и перенести в следующий
curl -X PATCH "$SB/rest/v1/tasks?sprint=eq.Спринт%2012&status=eq.active" \
  -H "apikey: $ANON" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"sprint":"Спринт 13"}'
```

**Альтернатива без прямых запросов:** делать спринт **отдельной доской**
(`POST /api/boards { "name": "Спринт 12" }`) — тогда весь спринт управляется
чистым REST, а «перенос в следующий спринт» = перенос задачи на другую доску.
Для агентов это обычно проще и надёжнее.

---

## 13. Подзадачи, зависимости, чек-лист, вложения, фото

### Подзадачи

```bash
# создать подзадачу
curl -X POST $BASE/api/tasks -H "Authorization: Bearer $TOKEN" -H "X-Workspace-Id: $WS" \
  -H "Content-Type: application/json" \
  -d "{\"title\":\"Написать тест\",\"boardId\":\"$BOARD\",\"columnId\":\"$COL\",\"parentId\":\"$PARENT\"}"

# получить подзадачи (в обычном списке они СКРЫТЫ)
curl "$BASE/api/tasks?subtasks=true&boardId=$BOARD" -H "Authorization: Bearer $TOKEN" -H "X-Workspace-Id: $WS"

# отвязать
curl -X PATCH $BASE/api/tasks/$SUB -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" -d '{"parentId":null}'
```
Удаление родителя навсегда (`?hard=true`) удаляет подзадачи каскадом.

### Зависимости «блокируется»

```bash
curl -X PATCH $BASE/api/tasks/$TASK -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" -d '{"blockedBy":["'$T1'","'$T2'"]}'
```
Массив id задач-блокеров. Приложение показывает предупреждение, пока блокеры не закрыты.

### Чек-лист

Заменяется целиком — сначала прочитайте, потом запишите:
```bash
curl -X PATCH $BASE/api/tasks/$TASK -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"checklist":[
        {"id":"a1","text":"Воспроизвести","done":true},
        {"id":"a2","text":"Починить","done":false},
        {"id":"a3","text":"Покрыть тестом","done":false}]}'
```
При создании задачи `id` можно не указывать — сервер сгенерирует. При PATCH
массив пишется как есть, поэтому `id` задавайте сами (любые уникальные строки).

### Вложения (ссылки)

```json
{ "attachments": [ { "id": "f1", "name": "Макет", "url": "https://figma.com/…" } ] }
```

### Файлы

Приватный бакет Supabase Storage `task-files` (доступ — любому авторизованному,
ссылки на скачивание подписанные и временные):
```bash
# загрузить
curl -X POST "$SB/storage/v1/object/task-files/$WS/$TASK/report.pdf" \
  -H "apikey: $ANON" -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/pdf" --data-binary @report.pdf

# временная ссылка на 1 час
curl -X POST "$SB/storage/v1/object/sign/task-files/$WS/$TASK/report.pdf" \
  -H "apikey: $ANON" -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" -d '{"expiresIn":3600}'
```
Полученный URL положите в `attachments`.

### Фото

`tasks.photos` — JSONB `[{ "id", "name", "dataUrl" }]`, base64-картинки,
максимум **10** на задачу. Доступно только прямым запросом. **Удаляются при
переходе задачи в «Готово».**

---

## 14. Комментарии и возвраты

```bash
# добавить
curl -X POST $BASE/api/tasks/$TASK/comments -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"text":"Проверил, баг ушёл. @Иван посмотри","author":"QA","kind":"comment"}'
→ 201 { "data": { "id","taskId","author","text","kind","createdAt" } }

# прочитать (по возрастанию даты)
curl $BASE/api/tasks/$TASK/comments -H "Authorization: Bearer $TOKEN"
→ { "data": [ … ], "total": 3 }
```

| Поле | Обяз. | Значения |
|---|:--:|---|
| `text` | ✅ | Markdown, `@Имя` — упоминание |
| `author` | | имя автора (строка) |
| `kind` | | `comment` (по умолчанию) или `return` — причина возврата от QA |

`kind: "return"` отображается в приложении красной плашкой «возврат».
Упоминания `@Имя` в приложении рассылают уведомления (в API рассылку нужно
инициировать самому — см. [§19](#19-уведомления-и-письма)).

Удаление комментария — прямым запросом:
`DELETE /rest/v1/task_comments?id=eq.<id>`.

---

## 15. Журнал

Журнал — лента фактически выполненной работы (для отчётов и выгрузки в Excel).

```bash
# список: фильтры taskId, from, to, page, limit
curl "$BASE/api/journal?from=2026-08-01&to=2026-08-31&limit=100" \
  -H "Authorization: Bearer $TOKEN" -H "X-Workspace-Id: $WS"
→ { "data":[ … ], "meta": { "total": 42, "page": 1, "limit": 100 } }

# создать запись
curl -X POST $BASE/api/journal -H "Authorization: Bearer $TOKEN" -H "X-Workspace-Id: $WS" \
  -H "Content-Type: application/json" \
  -d '{"boardName":"Driver","taskTitle":"Регресс логина","assignee":"Иван",
       "notes":"Прогнали смоук","stage":"Готово","type":"test",
       "taskId":"'$TASK'","date":"2026-08-09"}'

# удалить (мягко; ?hard=true — навсегда)
curl -X DELETE $BASE/api/journal/$ENTRY -H "Authorization: Bearer $TOKEN"
```

| Поле | Смысл |
|---|---|
| `date` | `YYYY-MM-DD`, по умолчанию сегодня |
| `boardName` | название доски (текстом) |
| `taskTitle` | название задачи (текстом) |
| `assignee` | исполнитель |
| `notes` | что сделано |
| `stage` | действие/этап: `Готово`, `Готов к тестированию`, `Возврат`… |
| `type` | тип задачи (по умолчанию `task`) |
| `taskId` | связь с карточкой (необязательна) |

Сортировка ответа — по `date` убыв. Изменение записи — прямым запросом
(`PATCH /rest/v1/journal?id=eq.<id>`).

---

## 16. Bulut MAP — карты продукта

Визуальные карты (флоу/схемы экранов). Узлы и связи хранятся в JSONB-графе.

### 16.1 Список карт
```http
GET /api/maps        (+ X-Workspace-Id)
→ { "data": [ { "id","name","color","updatedAt","nodeCount","edgeCount" } ], "total": 1 }
```

### 16.2 Карта целиком
```http
GET /api/maps/<id>
→ {
  "id","name","color","updatedAt",
  "nodes": [ { "id":"n_login", "label":"Экран логина", "kind":"screen" } ],
  "graph": { "nodes":[…], "edges":[…], "viewport":{…} }
}
```
`nodes[].id` → используйте как `mapNodeId` при создании/правке задачи.

### 16.3 CRUD карт
```bash
# создать
curl -X POST $BASE/api/maps -H "Authorization: Bearer $TOKEN" -H "X-Workspace-Id: $WS" \
  -H "Content-Type: application/json" -d '{"name":"Флоу заказа","color":"#14b8a6"}'
→ 201 { "id","name","color" }

# переименовать / перекрасить / перезаписать граф
curl -X PATCH $BASE/api/maps/$MAP -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" -d '{"name":"Флоу заказа v2"}'

# удалить (НАВСЕГДА, не в Корзину)
curl -X DELETE $BASE/api/maps/$MAP -H "Authorization: Bearer $TOKEN"
```

### 16.4 Узлы
```bash
curl -X POST $BASE/api/maps/$MAP/nodes -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"kind":"screen","label":"Экран логина","x":0,"y":0,
       "description":"Вход по номеру","color":"#6366f1",
       "link":{"boardId":"…","taskId":"…","url":"https://…"}}'
→ 201 { "id":"node-uuid", "node": { … } }

curl -X PATCH $BASE/api/maps/$MAP/nodes/$NODE -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" -d '{"label":"Логин по SMS","statusOverride":"bug","x":240,"y":120}'

# удаляет узел И все его связи
curl -X DELETE $BASE/api/maps/$MAP/nodes/$NODE -H "Authorization: Bearer $TOKEN"
```

**Виды узлов (`kind`):** `terminator` (начало/конец) · `screen` (экран) ·
`action` (действие) · `decision` (ветвление) · `process` (процесс) ·
`note` (заметка) · `group` (рамка-группа) · `number` (номер шага) · `link` (ссылка).
По умолчанию `screen`. Размер и цвет подставляются по виду автоматически.

**`statusOverride`:** `ok` · `wip` · `bug` — ручной «светофор» узла. Передайте
`null`/пусто, чтобы вернуть автоматический расчёт по задачам.

### 16.5 Связи (стрелки)
```bash
curl -X POST $BASE/api/maps/$MAP/edges -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" -d '{"source":"n1","target":"n2","label":"да"}'
→ 201 { "id":"edge-uuid", "edge": { … } }

curl -X DELETE $BASE/api/maps/$MAP/edges/$EDGE -H "Authorization: Bearer $TOKEN"
```
`source`/`target` — существующие id узлов, иначе `400`. Стрелка рисуется с
наконечником на конце. Для ветвления `decision` подписывайте стрелки «да»/«нет».

### 16.6 Связка карты и задач

```bash
# привязать задачу к экрану
curl -X PATCH $BASE/api/tasks/$TASK -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" -d '{"mapId":"'$MAP'","mapNodeId":"'$NODE'"}'

# все задачи узла
curl "$BASE/api/tasks?mapId=$MAP&mapNodeId=$NODE" -H "Authorization: Bearer $TOKEN" -H "X-Workspace-Id: $WS"
```
«Светофор» узла считается автоматически:
⚪ нет задач · 🟢 все закрыты · 🟡 есть активные · 🔴 есть открытый баг.

---

## 17. MCP-сервер (инструменты для ИИ)

Bulut отдаёт MCP-эндпойнт для ИИ-клиентов (Claude Desktop, Claude Code и др.):

```
https://ВАШ_ДОМЕН/api/mcp?key=<BULUT_API_KEY>
```
Авторизация — `?key=` в URL или заголовок `X-API-Key`. Без ключа — `401`.

Доступные инструменты:

| Инструмент | Что делает |
|---|---|
| `create_flow` | создать карту: `{ name, color?, nodes:[{id,kind,label,description?}], edges:[{from,to,label?}] }` — сервер сам раскладывает узлы |
| `list_flows` | список карт со ссылками |
| `get_flow` | граф карты по `id` |
| `update_flow` | перезаписать карту целиком |
| `delete_flow` | удалить карту |
| `link_task_to_node` | `{ taskId, mapId, nodeId }` — привязать карточку к экрану |
| `map_health` | «здоровье» карты: статус каждого экрана по задачам |

MCP работает поверх того же REST под сервисным аккаунтом, поэтому он ограничен
комнатами этого аккаунта.

---

## 18. Команда, приглашения, роли и права

### 18.1 Участники комнаты
```bash
curl "$SB/rest/v1/workspace_members?workspace_id=eq.$WS&select=user_id,role,permissions,created_at" \
  -H "apikey: $ANON" -H "Authorization: Bearer $TOKEN"

# с именами и почтой
curl "$SB/rest/v1/profiles?select=id,name,email,job_role,role&deleted_at=is.null" \
  -H "apikey: $ANON" -H "Authorization: Bearer $TOKEN"
```

### 18.2 Пригласить (RPC)
```bash
curl -X POST "$SB/rest/v1/rpc/invite_to_workspace" \
  -H "apikey: $ANON" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"p_ws":"'$WS'","p_email":"new@example.com","p_role":"member"}'
→ { "token": "…", "workspace": "Моя команда" }
```
Правила: приглашать может только `owner`/`admin`; приглашаемый **должен быть уже
зарегистрирован в Bulut**; повторное приглашение действующего участника —
ошибка. Приглашение живёт 14 дней.

Отправить письмо со ссылкой:
```bash
curl -X POST $BASE/api/invite/send -H "Content-Type: application/json" \
  -d '{"email":"new@example.com","token":"<token>","workspace":"Моя команда"}'
```
Ссылка для принятия: `https://ВАШ_ДОМЕН/invite/<token>`.

Принять программно:
```bash
curl -X POST "$SB/rest/v1/rpc/accept_invitation" \
  -H "apikey: $ANON" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"p_token":"<token>"}'
→ "<workspace-uuid>"
```

### 18.3 Создать комнату
```bash
curl -X POST "$SB/rest/v1/rpc/create_workspace" \
  -H "apikey: $ANON" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"p_name":"Новая команда","p_color":"#0ea5e9"}'
→ "<новый workspace uuid>"   (вы автоматически owner)
```

### 18.4 Роли и права

Роли: **owner** (все права, неудаляем) · **admin** (всё + управление правами
обычных участников) · **member** (права выдаются поштучно).

Ключи прав (`workspace_members.permissions` / `profiles.permissions`):

| Группа | Ключи |
|---|---|
| Доски и карточки | `board.view` `card.create` `card.edit` `card.move` `card.delete` `card.status` `card.comment` `board.manage` |
| Журнал | `journal.view` `journal.edit` `journal.delete` `journal.export` |
| Отчёты | `reports.view` `reports.export` `analytics.view` |
| Команда | `team.view` `team.manage` |
| Bulut MAP | `map.view` `map.create` `map.edit` `map.delete` `map.export` |
| Bulut API | `console.view` |
| Админка | `admin.access` |

У нового участника по умолчанию только `board.view`.

```bash
# выдать права участнику (owner/admin)
curl -X PATCH "$SB/rest/v1/workspace_members?workspace_id=eq.$WS&user_id=eq.$UID" \
  -H "apikey: $ANON" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"role":"member","permissions":["board.view","card.create","card.edit","card.move","card.comment"]}'
```

> **Важно:** права проверяются в интерфейсе приложения. REST-эндпойнты
> ограничены только RLS (членством в комнате). То есть участник комнаты может
> через API сделать больше, чем ему разрешает UI. Учитывайте это, раздавая токены.

### 18.5 Администрирование аккаунтов

```http
GET  /api/admin/orphans          Authorization: Bearer <token>
POST /api/admin/delete-user      { "userId": "uuid" }
```
Только для `owner`/`admin`, требуют `SUPABASE_SERVICE_ROLE_KEY` на сервере
(иначе `501`). Нельзя удалить себя и владельца; админ может удалять только
обычных участников и «осиротевшие» аккаунты (без профиля).

---

## 19. Уведомления и письма

### Уведомление внутри приложения (RPC)
```bash
curl -X POST "$SB/rest/v1/rpc/notify_member" \
  -H "apikey: $ANON" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"p_user":"<uuid получателя>","p_ws":"'$WS'","p_type":"mention",
       "p_title":"Вас упомянули","p_body":"Проверьте задачу","p_link":"/board/'$BOARD'?task='$TASK'"}'
```
Отправитель и получатель должны быть в одной комнате; себе отправить нельзя.
Типы: `invite`, `mention`, `comment`, `assign`, `info`.

Свои уведомления:
```bash
curl "$SB/rest/v1/notifications?read=eq.false&select=*&order=created_at.desc" \
  -H "apikey: $ANON" -H "Authorization: Bearer $TOKEN"
# отметить прочитанным
curl -X PATCH "$SB/rest/v1/notifications?id=eq.$N" \
  -H "apikey: $ANON" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"read":true}'
```

### Письмо
```http
POST /api/notify/email
{ "to": "user@example.com", "title": "Задача просрочена", "body": "…", "link": "/board/…" }
```
`link` можно относительный — сервер добавит домен. Требует настроенного SMTP
(через Infisical). **Эндпойнт не требует авторизации** — не публикуйте домен как
открытый рассыльщик и при необходимости закройте его на уровне хостинга.

---

## 20. Корзина и бэкапы

**Корзина** — это строки с непустым `deleted_at` в `boards`, `tasks`, `journal`,
`project_maps`. Восстановление = `deleted_at: null`; окончательное удаление =
`DELETE` (или `?hard=true` в REST).

**Бэкапы** — таблица `backups`: полный снимок данных в JSONB.

| Колонка | Смысл |
|---|---|
| `id`, `created_at` | |
| `created_by`, `author_name` | кто снял |
| `label` | подпись |
| `kind` | `manual` \| `auto` |
| `counts` | сколько чего внутри (jsonb) |
| `data` | сам снимок (jsonb) |

```bash
# список без тяжёлого data
curl "$SB/rest/v1/backups?select=id,created_at,author_name,label,kind,counts&order=created_at.desc" \
  -H "apikey: $ANON" -H "Authorization: Bearer $TOKEN"

# создать
curl -X POST "$SB/rest/v1/backups" \
  -H "apikey: $ANON" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"label":"Перед миграцией","kind":"manual","counts":{"tasks":120},"data":{ … }}'
```

---

## 21. Прямой доступ к базе (Supabase PostgREST)

Всё, чего нет в REST-обёртке Bulut, доступно напрямую — с **тем же токеном** и
**той же изоляцией по комнатам** (RLS).

```
База:  https://umivhhkwolysesmkvisa.supabase.co/rest/v1     (NEXT_PUBLIC_SUPABASE_URL)
```
Обязательные заголовки:
```
apikey: <NEXT_PUBLIC_SUPABASE_ANON_KEY>
Authorization: Bearer <тот же access_token из /api/auth/token>
Content-Type: application/json          (для записи)
Prefer: return=representation           (чтобы получить изменённые строки)
```
Anon-ключ берётся из настроек Supabase (Settings → API → anon public) или из
переменных окружения приложения — он публичный и без токена ничего не открывает.

Шпаргалка по синтаксису:

| Задача | Запрос |
|---|---|
| выбрать поля | `?select=id,title,status` |
| равно | `?status=eq.done` |
| в списке | `?id=in.(uuid1,uuid2)` |
| не null | `?deleted_at=not.is.null` |
| подстрока | `?title=ilike.*логин*` |
| диапазон | `?due_date=gte.2026-08-01&due_date=lte.2026-08-31` |
| сортировка | `?order=position.asc` |
| лимит | `?limit=100&offset=0` |
| связанные | `?select=*,task_comments(*)` |
| счётчик | заголовок `Prefer: count=exact` |

Пример: все просроченные задачи комнаты со спринтом:
```bash
curl "$SB/rest/v1/tasks?workspace_id=eq.$WS&deleted_at=is.null&status=eq.active\
&due_date=lt.2026-08-09&select=id,title,assignee,due_date,sprint&order=due_date.asc" \
  -H "apikey: $ANON" -H "Authorization: Bearer $TOKEN"
```

**Правила безопасной записи:**
- Всегда указывайте фильтр (`?id=eq.…`) — PostgREST без фильтра обновит/удалит
  всё, что видно по RLS.
- При вставке новых строк обязательно заполняйте `workspace_id` (иначе RLS
  отклонит) и `user_id`.
- Для JSONB-полей (`columns`, `checklist`, `graph`, `returns`) запись —
  **полная замена**; читайте-меняйте-пишите.

---

## 22. Справочник таблиц и колонок

### `boards`
| Колонка | Тип | Заметка |
|---|---|---|
| `id` | uuid | |
| `user_id` | uuid | автор |
| `workspace_id` | uuid | комната |
| `name` | text | |
| `color` | text | hex |
| `columns` | jsonb | `[{id,name,wip?}]` |
| `custom_fields` | jsonb | `[{id,name}]` |
| `position` | int | порядок в списке |
| `created_at` | timestamptz | |
| `deleted_at` | timestamptz | Корзина |

### `tasks`
| Колонка | Тип | REST-имя | Правится через REST |
|---|---|---|:--:|
| `id` | uuid | `id` | — |
| `user_id` | uuid | — | — |
| `workspace_id` | uuid | — | — |
| `board_id` | uuid | `boardId` | только при создании |
| `column_id` | text | `columnId` | ✅ |
| `title` | text | `title` | ✅ |
| `description` | text | `description` | ✅ |
| `assignee` | text | `assignee` | ✅ |
| `priority` | text | `priority` | ✅ |
| `type` | text | `type` | ✅ |
| `status` | text | `status` | ✅ |
| `due_date` | date | `dueDate` | ✅ |
| `done_due_date` | date | `doneDueDate` | ✅ |
| `tags` | text[] | `tags` | ✅ |
| `position` | float8 | `position` | ✅ (PATCH) |
| `checklist` | jsonb | `checklist` | ✅ |
| `attachments` | jsonb | `attachments` | ✅ |
| `photos` | jsonb | — | ❌ |
| `parent_id` | uuid | `parentId` | ✅ |
| `blocked_by` | uuid[] | `blockedBy` | ✅ |
| `map_id` / `map_node_id` | uuid/text | `mapId`/`mapNodeId` | ✅ |
| `sprint` | text | — | ❌ |
| `epic` | text | — | ❌ |
| `story_points` | int | — | ❌ |
| `watchers` | text[] | — | ❌ |
| `custom` | jsonb | — | ❌ |
| `created_at` | timestamptz | `createdAt` | — |
| `created_by` | text | `createdBy` | ❌ |
| `ready_at` | timestamptz | `readyAt` | ❌ |
| `tested_at` | timestamptz | `testedAt` | ❌ |
| `completed_at` | timestamptz | `completedAt` | авто при `status=done` |
| `stage_entered_at` | timestamptz | — | ❌ |
| `stage_times` | jsonb | `stageTimes` | ❌ |
| `return_count` | int | `returnCount` | ❌ |
| `returns` | jsonb | `returns` | ❌ |
| `deleted_at` | timestamptz | — | через DELETE |

### `task_comments`
`id` · `user_id` · `workspace_id` · `task_id` · `author` · `text` ·
`kind` (`comment`\|`return`) · `created_at`

### `journal`
`id` · `user_id` · `workspace_id` · `task_id` · `date` · `board_name` ·
`task_title` · `assignee` · `notes` · `stage` · `type` · `created_at` · `deleted_at`

### `project_maps`
`id` · `user_id` · `workspace_id` · `name` · `color` · `graph` (jsonb:
`{nodes,edges,viewport}`) · `position` · `updated_at` · `deleted_at`

### `workspaces` / `workspace_members` / `invitations` / `notifications`
- `workspaces`: `id` · `name` · `color` · `owner_id` · `created_at`
- `workspace_members`: `id` · `workspace_id` · `user_id` · `role` · `permissions` · `created_at`
- `invitations`: `id` · `workspace_id` · `email` · `role` · `permissions` · `token` · `invited_by` · `status` (`pending`\|`accepted`\|`revoked`) · `created_at` · `expires_at`
- `notifications`: `id` · `user_id` · `workspace_id` · `type` · `title` · `body` · `link` · `read` · `created_at`

### `profiles`
`id` (= auth.users.id) · `email` · `name` · `job_role` · `role`
(`owner`\|`admin`\|`member`) · `permissions` · `avatar` · `created_at` · `deleted_at`

### RPC-функции
| Функция | Аргументы | Возврат |
|---|---|---|
| `create_workspace` | `p_name`, `p_color` | uuid комнаты |
| `invite_to_workspace` | `p_ws`, `p_email`, `p_role` | `{token, workspace}` |
| `accept_invitation` | `p_token` | uuid комнаты |
| `notify_member` | `p_user`, `p_ws`, `p_type`, `p_title`, `p_body`, `p_link` | void |
| `is_ws_member` | `ws` | boolean |
| `ws_role` | `ws` | text |

---

## 23. Готовые сценарии

### 23.1 Новая доска-спринт + задачи + даты + закрытие

```bash
BASE="https://bulut-kappa.vercel.app"
TOKEN=$(curl -s -X POST $BASE/api/auth/token -H "Content-Type: application/json" \
  -d '{"email":"you@example.com","password":"pass"}' | jq -r .access_token)
WS=$(curl -s $BASE/api/workspaces -H "Authorization: Bearer $TOKEN" | jq -r '.data[0].id')
H=(-H "Authorization: Bearer $TOKEN" -H "X-Workspace-Id: $WS" -H "Content-Type: application/json")

# доска
BOARD=$(curl -s -X POST $BASE/api/boards "${H[@]}" \
  -d '{"name":"Спринт 12","color":"#6366f1"}' | jq -r .id)

# колонки
COLS=$(curl -s $BASE/api/boards "${H[@]}" | jq -r ".data[]|select(.id==\"$BOARD\")|.columns")
TODO=$(echo $COLS  | jq -r '.[0].id')
READY=$(echo $COLS | jq -r '.[-3].id')
REVIEW=$(echo $COLS| jq -r '.[-2].id')
DONE=$(echo $COLS  | jq -r '.[-1].id')

# 3 задачи с дедлайнами
for t in "Форма входа|feature|Иван|2026-08-15" \
         "Баг: код не приходит|bug|Пётр|2026-08-12" \
         "Тесты авторизации|test|QA|2026-08-18"; do
  IFS='|' read -r TITLE TYPE WHO DUE <<< "$t"
  curl -s -X POST $BASE/api/tasks "${H[@]}" -d "{
    \"title\":\"$TITLE\",\"boardId\":\"$BOARD\",\"columnId\":\"$TODO\",
    \"type\":\"$TYPE\",\"assignee\":\"$WHO\",\"priority\":\"high\",
    \"dueDate\":\"$DUE\",\"doneDueDate\":\"2026-08-20\",\"tags\":[\"sprint-12\"]}" | jq -r .data.id
done

# провести первую задачу по этапам
T=$(curl -s "$BASE/api/tasks?boardId=$BOARD&limit=1" "${H[@]}" | jq -r '.data[0].id')
curl -s -X PATCH $BASE/api/tasks/$T "${H[@]}" -d "{\"columnId\":\"$READY\"}"      # в тест
curl -s -X POST  $BASE/api/tasks/$T/comments "${H[@]}" -d '{"text":"Готово к проверке","author":"Иван"}'
curl -s -X PATCH $BASE/api/tasks/$T "${H[@]}" -d "{\"columnId\":\"$REVIEW\"}"     # на проверку
curl -s -X PATCH $BASE/api/tasks/$T "${H[@]}" -d "{\"columnId\":\"$DONE\",\"status\":\"done\"}"  # готово
curl -s -X POST  $BASE/api/journal "${H[@]}" \
  -d '{"boardName":"Спринт 12","taskTitle":"Форма входа","assignee":"Иван","stage":"Готово","type":"feature","notes":"Сдано"}'
```

### 23.2 Ежедневный отчёт по просрочкам
```bash
curl -s "$BASE/api/tasks?overdue=true&limit=200" "${H[@]}" \
  | jq -r '.data[] | "\(.dueDate)  \(.assignee // "—")  \(.title)"'
```

### 23.3 Массовое переназначение исполнителя
```bash
for id in $(curl -s "$BASE/api/tasks?assignee=Иван&status=active&limit=200" "${H[@]}" | jq -r '.data[].id'); do
  curl -s -X PATCH $BASE/api/tasks/$id -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" -d '{"assignee":"Пётр"}' > /dev/null
done
```

### 23.4 Карта + задачи на экранах
```bash
MAP=$(curl -s -X POST $BASE/api/maps "${H[@]}" -d '{"name":"Онбординг"}' | jq -r .id)
N1=$(curl -s -X POST $BASE/api/maps/$MAP/nodes "${H[@]}" -d '{"kind":"terminator","label":"Старт","x":0,"y":0}'   | jq -r .id)
N2=$(curl -s -X POST $BASE/api/maps/$MAP/nodes "${H[@]}" -d '{"kind":"screen","label":"Ввод номера","x":0,"y":160}'| jq -r .id)
N3=$(curl -s -X POST $BASE/api/maps/$MAP/nodes "${H[@]}" -d '{"kind":"decision","label":"Код верный?","x":0,"y":320}'| jq -r .id)
curl -s -X POST $BASE/api/maps/$MAP/edges "${H[@]}" -d "{\"source\":\"$N1\",\"target\":\"$N2\"}"
curl -s -X POST $BASE/api/maps/$MAP/edges "${H[@]}" -d "{\"source\":\"$N2\",\"target\":\"$N3\"}"
curl -s -X PATCH $BASE/api/tasks/$T "${H[@]}" -d "{\"mapId\":\"$MAP\",\"mapNodeId\":\"$N2\"}"
```

---

## 24. Ошибки, лимиты и подводные камни

### Коды ответов
| Код | Значение |
|---|---|
| `200` / `201` | успех |
| `400` | некорректный JSON, нет обязательного поля, нечего обновлять |
| `401` | нет токена / истёк / неверный `X-API-Key` |
| `403` | нет доступа к комнате; сервисный аккаунт не приглашён в комнату |
| `404` | доска/колонка/задача/карта/узел/связь не найдены |
| `429` | слишком часто (OTP) |
| `500` | ошибка базы или сервера |
| `501` | функция не настроена на сервере (нет ключа/сервисного аккаунта/SMTP) |
| `502` | не удалось отправить письмо / таймаут прокси |

### Подводные камни
1. **Перенос в «Готово» не закрывает задачу.** Через API всегда шлите
   `status: "done"` вместе с `columnId`.
2. **Неверные `priority`/`type` в PATCH молча игнорируются** — ошибки не будет,
   поле просто не изменится. Проверяйте ответ.
3. **`workspace_id` новой задачи берётся из доски**, а не из `X-Workspace-Id`.
4. **Подзадачи скрыты** в `GET /api/tasks` без `?subtasks=true`.
5. **JSONB заменяется целиком** (`checklist`, `attachments`, `tags`, `columns`,
   `graph`): прочитайте → измените → запишите.
6. **Удаление карты (`DELETE /api/maps/:id`) — безвозвратное**, в Корзину не
   попадает (в отличие от задач и журнала).
7. **Метрики этапов** (`stage_times`, `ready_at`, `return_count`) обновляет
   только приложение. Через API их надо вести вручную — см. [§11](#11-рабочий-процесс-в-тест--принять--вернуть--готово).
8. **`limit` максимум 200.** Для больших выборок листайте через `page`.
9. **Refresh-токен одноразовый** — сохраняйте новый после каждого обновления.
10. **Права из §18 в REST не проверяются** — только членство в комнате (RLS).
11. **`assignee` — это имя строкой**, а не uuid. Опечатка = задача «ничья» для фильтров.
12. **Удаляя колонку, сначала перенесите её задачи** — иначе карточки исчезнут
    с доски, оставшись в базе.

---

## 25. Шпаргалка: все эндпойнты

### Bulut REST
| Метод | Путь | Что делает |
|---|---|---|
| `GET` | `/api` | живая справка |
| `POST` | `/api/auth/token` | вход / обновление токена |
| `POST` | `/api/auth/otp/send` | отправить код регистрации |
| `POST` | `/api/auth/otp/verify` | проверить код |
| `GET` | `/api/workspaces` | ваши комнаты |
| `GET` | `/api/boards` | доски с колонками и счётчиками |
| `POST` | `/api/boards` | создать доску |
| `GET` | `/api/tasks` | список задач (фильтры, пагинация) |
| `POST` | `/api/tasks` | создать задачу |
| `GET` | `/api/tasks/:id` | задача + комментарии |
| `PATCH` | `/api/tasks/:id` | изменить / переместить / закрыть |
| `DELETE` | `/api/tasks/:id` | в Корзину (`?hard=true` — навсегда) |
| `GET` | `/api/tasks/:id/comments` | комментарии |
| `POST` | `/api/tasks/:id/comments` | добавить комментарий |
| `GET` | `/api/journal` | журнал |
| `POST` | `/api/journal` | запись журнала |
| `DELETE` | `/api/journal/:id` | удалить запись |
| `GET` | `/api/maps` | карты |
| `POST` | `/api/maps` | создать карту |
| `GET` | `/api/maps/:id` | карта + узлы + граф |
| `PATCH` | `/api/maps/:id` | имя / цвет / граф |
| `DELETE` | `/api/maps/:id` | удалить карту (навсегда) |
| `POST` | `/api/maps/:id/nodes` | добавить узел |
| `PATCH` | `/api/maps/:id/nodes/:nodeId` | изменить узел |
| `DELETE` | `/api/maps/:id/nodes/:nodeId` | удалить узел и его связи |
| `POST` | `/api/maps/:id/edges` | добавить связь |
| `DELETE` | `/api/maps/:id/edges/:edgeId` | удалить связь |
| `POST` | `/api/notify/email` | отправить письмо |
| `POST` | `/api/invite/send` | письмо с приглашением |
| `POST` | `/api/console/proxy` | серверный прокси для консоли (обход CORS) |
| `GET` | `/api/admin/orphans` | аккаунты без профиля (owner/admin) |
| `POST` | `/api/admin/delete-user` | удалить аккаунт (owner/admin) |
| `GET/POST/DELETE` | `/api/mcp?key=…` | MCP-сервер |

### Только через Supabase (`/rest/v1/…`)
переименование/удаление доски · колонки и WIP · свои поля ·
перенос задачи между досками · `sprint` · `epic` · `story_points` ·
`watchers` · `custom` · `photos` · восстановление из Корзины ·
`ready_at`/`tested_at`/`stage_times`/`returns` · участники и права ·
приглашения (RPC) · создание комнаты (RPC) · уведомления · бэкапы · файлы.

---

*Версия API: 3.0. Документ описывает состояние кода на 9 августа 2026 года.*
