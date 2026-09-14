# Bulut для Claude — работа с досками через API

Инструкция для ИИ-агента (Claude), который управляет Bulut **от имени живого
пользователя, его личным токеном**. В файле есть всё: вход, комнаты, реальные
пользователи, доски, колонки, задачи, даты, перемещения, комментарии, журнал,
карты, спринты. Отдельные ключи и сервисные аккаунты не нужны.

- **База:** `https://bulut.my`
- **Формат:** JSON. Успех — `{ "data": … }`, ошибка — `{ "error": "…" }`.
- **Живая справка:** `GET https://bulut.my/api`
- **Доступ:** ровно то, что пользователь видит в приложении (Row Level Security
  по комнатам). Чужие комнаты недоступны даже при правильном токене.

---

## Содержание

1. [Правила для агента](#1-правила-для-агента)
2. [Авторизация: токен](#2-авторизация-токен)
3. [Комната (workspace)](#3-комната-workspace)
4. [Реальные пользователи — кого ставить исполнителем](#4-реальные-пользователи--кого-ставить-исполнителем)
5. [Модель данных и правило колонок](#5-модель-данных-и-правило-колонок)
6. [Доски: читать, создать, изменить, удалить](#6-доски-читать-создать-изменить-удалить)
7. [Колонки (этапы) и WIP-лимиты](#7-колонки-этапы-и-wip-лимиты)
8. [Задачи: создать](#8-задачи-создать)
9. [Задачи: найти и отфильтровать](#9-задачи-найти-и-отфильтровать)
10. [Задачи: изменить, даты, перемещение, «Готово»](#10-задачи-изменить-даты-перемещение-готово)
11. [Задачи: удалить и восстановить](#11-задачи-удалить-и-восстановить)
12. [Подзадачи, зависимости, чек-лист, вложения](#12-подзадачи-зависимости-чек-лист-вложения)
13. [Комментарии, упоминания, уведомления](#13-комментарии-упоминания-уведомления)
14. [Журнал](#14-журнал)
15. [Карты (Bulut MAP) и привязка задач](#15-карты-bulut-map-и-привязка-задач)
16. [Спринты, эпики, очки — прямой доступ к базе](#16-спринты-эпики-очки--прямой-доступ-к-базе)
17. [Готовые сценарии](#17-готовые-сценарии)
18. [Справочник значений](#18-справочник-значений)
19. [Ошибки](#19-ошибки)
20. [Шпаргалка: все эндпойнты](#20-шпаргалка-все-эндпойнты)

---

## 1. Правила для агента

Соблюдай их — иначе поедут доски, метрики и чужие задачи.

1. **Порядок всегда один:** токен → комната (`WS`) → участники (`/api/members`)
   → доски (`/api/boards`) → `columnId` из нужной доски → и только потом задачи.
   `boardId` и `columnId` никогда не выдумывай — бери их из ответов API.
2. **Исполнитель — строка, а не id.** Пиши в `assignee` ровно значение поля
   `assignee` из `GET /api/members`. Придуманное имя создаст «мёртвого»
   исполнителя, которого нет в команде.
3. **Заголовок `X-Workspace-Id: <WS>`** — во всех запросах со списками и
   созданием. Без него берётся первая комната пользователя (может быть не та).
4. **Удаление по умолчанию мягкое** (в Корзину, обратимо). `?hard=true` —
   навсегда, без возврата: спрашивай подтверждение у человека.
5. **Массовые изменения** (>5 карточек, удаление доски, перезапись колонок) —
   сначала покажи человеку план и получи «да».
6. **Перед изменением читай.** `PATCH` перезаписывает поля целиком:
   `tags`, `checklist`, `attachments`, `columns`, `blockedBy` — это **замена**
   массива, а не добавление. Прочитай текущее значение, дополни, отправь целиком.
7. **Даты:** дедлайны `YYYY-MM-DD`, метки времени ISO 8601 (UTC).
8. Если запрос вернул `401` — обнови токен через `refresh_token` и повтори.

---

## 2. Авторизация: токен

```bash
BASE="https://bulut.my"

curl -s -X POST $BASE/api/auth/token \
  -H "Content-Type: application/json" \
  -d '{"email":"you@example.com","password":"пароль от Bulut"}'
```
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

Дальше в каждом запросе:
```
Authorization: Bearer <access_token>
```

Токен живёт ~1 час. Обновление без пароля:
```bash
curl -s -X POST $BASE/api/auth/token \
  -H "Content-Type: application/json" \
  -d '{"refresh_token":"<refresh_token>"}'
```

Переменные для всех примеров ниже:
```bash
BASE="https://bulut.my"
TOKEN="<access_token>"
H=(-H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json")
```

---

## 3. Комната (workspace)

Все данные разделены по комнатам. Сначала узнай свою:

```bash
curl -s $BASE/api/workspaces -H "Authorization: Bearer $TOKEN"
```
```json
{ "data": [ { "id": "ws-uuid", "name": "Моя команда", "color": "#6366f1", "role": "owner" } ], "total": 1 }
```

```bash
WS="ws-uuid"
```
Дальше добавляй `-H "X-Workspace-Id: $WS"` (или `?workspace=$WS`).

Роли: `owner` · `admin` · `member`.

---

## 4. Реальные пользователи — кого ставить исполнителем

```bash
curl -s $BASE/api/members -H "Authorization: Bearer $TOKEN" -H "X-Workspace-Id: $WS"
```
```json
{
  "data": [
    {
      "memberId": "row-uuid",
      "userId": "user-uuid",
      "name": "Иван Петров",
      "email": "ivan@example.com",
      "assignee": "Иван Петров",
      "jobRole": "Frontend",
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

| Поле | Зачем |
|---|---|
| `assignee` | **ровно это** пиши в `assignee` задачи и в `author` комментария |
| `userId` | адресат уведомления (`notify_member`), см. §13 |
| `email` | письмо через `POST /api/notify/email` |
| `jobRole` | должность (Frontend / QA / Analyst…) — помогает выбрать исполнителя |
| `role` | права в комнате |
| `deleted` | `true` — аккаунт деактивирован, **не назначай на него задачи** |

Если пользователь просит поставить задачу «на Ивана» — найди Ивана в этом
списке. Если совпадений несколько или ни одного — спроси, а не угадывай.

---

## 5. Модель данных и правило колонок

```
Комната (workspace)
└── Доска (board)                 ← проект / направление / спринт-борд
    ├── Колонки (columns, JSONB)  ← этапы
    ├── Свои поля (customFields)
    └── Задачи (tasks)
        ├── Подзадачи (parentId)
        ├── Чек-лист, вложения
        ├── Комментарии
        └── Привязка к карте (mapId + mapNodeId)
Журнал · Карты · Корзина · Бэкапы
```

### Роль этапа задаётся позицией колонки, а не названием

| Позиция | Роль | Стандартное имя |
|---|---|---|
| первая | `todo` | К выполнению |
| середина | `progress` | В процессе |
| третья с конца | `ready` | Готов к тестированию |
| вторая с конца | `review` | На проверке |
| **последняя** | **`done`** | Готово |

Поэтому: минимум 3 колонки, лучше 5, и «Готово» — **всегда последняя**.
Меняя порядок колонок, ты меняешь смысл этапов.

### Соглашения

- Все id — UUID. `columnId` — строка-uuid **внутри** JSONB доски.
- В ответах API поля в `camelCase`, в базе — `snake_case` (`dueDate` ↔ `due_date`).
- Мягкое удаление = `deleted_at != null` (Корзина).

---

## 6. Доски: читать, создать, изменить, удалить

### 6.1 Список досок (с колонками и счётчиками)
```bash
curl -s $BASE/api/boards -H "Authorization: Bearer $TOKEN" -H "X-Workspace-Id: $WS"
```
```json
{ "data": [ {
  "id": "board-uuid",
  "name": "Driver",
  "color": "#6366f1",
  "createdAt": "2026-07-01T09:00:00.000Z",
  "columns": [
    { "id": "col-1", "name": "К выполнению",         "total": 3, "active": 3, "done": 0 },
    { "id": "col-5", "name": "Готово",               "total": 5, "active": 0, "done": 5 }
  ],
  "taskCount": 11
} ], "total": 1 }
```
Доски в Корзине здесь не показываются. `columns[].id` → это `columnId` задачи.

### 6.2 Одна доска
```bash
curl -s $BASE/api/boards/$BOARD -H "Authorization: Bearer $TOKEN"
```
Возвращает `id, name, color, position, columns[{id,name,wip,total,active,done}],
customFields, taskCount, createdAt, deletedAt`.

### 6.3 Создать доску
```bash
curl -s -X POST $BASE/api/boards "${H[@]}" -H "X-Workspace-Id: $WS" \
  -d '{
    "name": "Спринт 12",
    "color": "#0ea5e9",
    "columns": ["Бэклог","В работе","Готов к тестированию","На проверке","Готово"]
  }'
```
```json
{ "id": "new-board-uuid", "name": "Спринт 12",
  "columns": [ { "id": "col-uuid", "name": "Бэклог" }, … ] }
```
→ `201`. Пустое тело допустимо — будет доска «Новая доска» со стандартными
5 этапами.

| Поле | Тип | По умолчанию |
|---|---|---|
| `name` | string ≤200 | `"Новая доска"` |
| `color` | hex | следующий цвет палитры |
| `columns` | string[] | `К выполнению · В процессе · Готов к тестированию · На проверке · Готово` |

Палитра: `#6366f1 #0ea5e9 #10b981 #f59e0b #ef4444 #8b5cf6 #14b8a6 #ec4899 #f97316 #64748b`

### 6.4 Изменить доску
```bash
# переименовать и перекрасить
curl -s -X PATCH $BASE/api/boards/$BOARD "${H[@]}" \
  -d '{"name":"Спринт 13","color":"#10b981"}'

# поднять доску выше в списке (меньше position — выше)
curl -s -X PATCH $BASE/api/boards/$BOARD "${H[@]}" -d '{"position":0}'
```

| Поле | Тип | Смысл |
|---|---|---|
| `name` | string ≤200 | название |
| `color` | hex | цвет |
| `position` | number | порядок в списке досок |
| `columns` | string[] или `{id?,name,wip?}[]` | этапы, см. §7 |
| `moveOrphansTo` | columnId | куда деть задачи из удаляемых колонок |
| `customFields` | `{id?,name}[]` | свои поля карточек |
| `restore` | `true` | вернуть доску и её задачи из Корзины |

### 6.5 Удалить / восстановить
```bash
# в Корзину — вместе с задачами доски, обратимо
curl -s -X DELETE $BASE/api/boards/$BOARD -H "Authorization: Bearer $TOKEN"

# вернуть из Корзины
curl -s -X PATCH $BASE/api/boards/$BOARD "${H[@]}" -d '{"restore":true}'

# НАВСЕГДА: задачи и комментарии уйдут каскадом, отменить нельзя
curl -s -X DELETE "$BASE/api/boards/$BOARD?hard=true" -H "Authorization: Bearer $TOKEN"
```

---

## 7. Колонки (этапы) и WIP-лимиты

Колонки живут в самой доске:
```json
[ { "id": "c1", "name": "Бэклог" },
  { "id": "c2", "name": "В работе", "wip": 3 } ]
```
`wip` — лимит задач в колонке (`0`/нет — без лимита), приложение подсвечивает превышение.

**Добавить колонку, сохранив существующие id** (передавай объекты с `id`):
```bash
# 1) прочитать текущие
curl -s $BASE/api/boards/$BOARD -H "Authorization: Bearer $TOKEN"

# 2) отправить полный новый набор
curl -s -X PATCH $BASE/api/boards/$BOARD "${H[@]}" -d '{
  "columns": [
    {"id":"c1","name":"Бэклог"},
    {"id":"c2","name":"В работе","wip":3},
    {"name":"Код-ревью"},
    {"id":"c3","name":"Готов к тестированию"},
    {"id":"c4","name":"На проверке"},
    {"id":"c5","name":"Готово"}
  ]}'
```
- Колонка без `id` → создаётся новая (id сгенерируется).
- Если передать массив строк, id подхватятся по совпадению имени, а для новых
  имён создадутся заново — **задачи в переименованных колонках потеряются**,
  поэтому для переименования всегда указывай `id`.
- Если в удаляемых колонках остались задачи, API вернёт `409` и не тронет доску.
  Повтори с `"moveOrphansTo": "<columnId>"` — задачи переедут туда.

Свои поля карточек:
```bash
curl -s -X PATCH $BASE/api/boards/$BOARD "${H[@]}" \
  -d '{"customFields":[{"name":"Ссылка на макет"},{"name":"Версия"}]}'
```
Значения хранятся в задаче в поле `custom` (`{"<fieldId>":"значение"}`) — пишутся
прямым запросом в базу, см. §16.

---

## 8. Задачи: создать

```bash
curl -s -X POST $BASE/api/tasks "${H[@]}" -H "X-Workspace-Id: $WS" -d '{
  "title": "Починить логин по SMS",
  "description": "На iOS 17 код не приходит. Шаги: 1) экран входа 2) ввести номер…",
  "boardId": "'$BOARD'",
  "columnId": "'$COL'",
  "assignee": "Иван Петров",
  "type": "bug",
  "priority": "high",
  "dueDate": "2026-08-20",
  "doneDueDate": "2026-08-22",
  "tags": ["auth","ios"],
  "checklist": [ {"text":"Воспроизвести"}, {"text":"Починить"}, {"text":"Проверить на iOS 17"} ],
  "attachments": [ {"name":"Скрин","url":"https://…/screen.png"} ]
}'
```
→ `201`, в ответе `{"data": {…задача…}}` с `id`.

| Поле | Тип | Обяз. | Примечание |
|---|---|---|---|
| `title` | string | **да** | заголовок карточки |
| `boardId` | uuid | **да** | из `GET /api/boards` |
| `columnId` | string | **да** | из `columns[].id` этой доски |
| `description` | string | нет | поддерживается Markdown |
| `assignee` | string | нет | значение `assignee` из `/api/members` |
| `priority` | `low` \| `medium` \| `high` | нет | по умолчанию `medium` |
| `type` | см. §18 | нет | по умолчанию `task` |
| `dueDate` | `YYYY-MM-DD` | нет | дедлайн начала/работы |
| `doneDueDate` | `YYYY-MM-DD` | нет | дедлайн сдачи |
| `tags` | string[] | нет | метки |
| `checklist` | `{text, done?}[]` | нет | id проставятся сами |
| `attachments` | `{name?, url}[]` | нет | без `url` элемент отбрасывается |
| `parentId` | uuid | нет | делает карточку подзадачей |
| `blockedBy` | uuid[] | нет | задачи-блокеры |
| `mapId`, `mapNodeId` | string | нет | привязка к узлу карты, §15 |

Что API проставит само: `status: "active"`, `position` (конец колонки),
`createdAt`, `stageEnteredAt`, `returnCount: 0`, `createdBy` (= `assignee`,
иначе `"API"`), `workspaceId` (берётся из доски — заголовок комнаты тут не нужен).

Неизвестные значения `priority`/`type` не ломают запрос — молча заменяются на
дефолт. Проверяй значения сам.

---

## 9. Задачи: найти и отфильтровать

```bash
curl -s "$BASE/api/tasks?boardId=$BOARD&status=active&priority=high&limit=100" \
  -H "Authorization: Bearer $TOKEN" -H "X-Workspace-Id: $WS"
```
```json
{ "data": [ … ], "meta": { "total": 42, "page": 1, "limit": 100, "pages": 1, "hasMore": false } }
```

| Параметр | Значения | Смысл |
|---|---|---|
| `boardId` / `columnId` | id | доска / этап |
| `status` | `active` \| `done` | |
| `priority` | `low`\|`medium`\|`high` | |
| `type` | см. §18 | |
| `assignee` | имя | точное совпадение без учёта регистра |
| `hasAssignee` | `true`\|`false` | без исполнителя |
| `search` | текст | поиск в `title` + `description` |
| `dueAfter` / `dueBefore` | `YYYY-MM-DD` | включительно |
| `overdue` | `true` | просрочено и не закрыто |
| `mapId` / `mapNodeId` | id | привязка к карте |
| `subtasks` | `true` | показать подзадачи (по умолчанию скрыты) |
| `sort` | `position`\|`created_at`\|`due_date`\|`title` | по умолчанию `position` |
| `order` | `asc`\|`desc` | |
| `page`, `limit` | число | `limit` ≤ 200, по умолчанию 50 |

Одна задача **вместе с комментариями**:
```bash
curl -s $BASE/api/tasks/$TASK -H "Authorization: Bearer $TOKEN"
```

Ответ задачи содержит: `id, boardId, columnId, title, description, assignee,
priority, type, status, dueDate, doneDueDate, tags, checklist, attachments,
stageTimes, returnCount, returns, createdAt, createdBy, completedAt, readyAt,
testedAt, mapId, mapNodeId` (+ `comments` в одиночном запросе).

---

## 10. Задачи: изменить, даты, перемещение, «Готово»

`PATCH /api/tasks/:id` — любое подмножество полей.

```bash
# сменить исполнителя и приоритет
curl -s -X PATCH $BASE/api/tasks/$TASK "${H[@]}" \
  -d '{"assignee":"Мария Ким","priority":"high"}'

# переписать заголовок и описание
curl -s -X PATCH $BASE/api/tasks/$TASK "${H[@]}" \
  -d '{"title":"Логин по SMS: код не приходит на iOS 17","description":"Новое описание"}'

# поставить/снять дедлайны
curl -s -X PATCH $BASE/api/tasks/$TASK "${H[@]}" \
  -d '{"dueDate":"2026-08-25","doneDueDate":"2026-08-27"}'
curl -s -X PATCH $BASE/api/tasks/$TASK "${H[@]}" -d '{"dueDate":null}'

# перетаскивание: другой этап + позиция (0 — первая карточка сверху)
curl -s -X PATCH $BASE/api/tasks/$TASK "${H[@]}" \
  -d '{"columnId":"'$COL_REVIEW'","position":0}'

# закрыть задачу (completedAt проставится сам)
curl -s -X PATCH $BASE/api/tasks/$TASK "${H[@]}" \
  -d '{"status":"done","columnId":"'$COL_DONE'"}'

# вернуть в работу
curl -s -X PATCH $BASE/api/tasks/$TASK "${H[@]}" \
  -d '{"status":"active","columnId":"'$COL_TODO'"}'
```

Принимаются: `title, description, assignee, priority, type, status, dueDate,
doneDueDate, tags, columnId, position, checklist, attachments, parentId,
blockedBy, mapId, mapNodeId`.

**Важно:** «Готово» = `status: "done"` **и** перенос в последнюю колонку. Если
поставить только `status`, карточка останется висеть в старом этапе.

### Рабочий процесс как в интерфейсе

Пусть колонки = `[… cReady, cReview, cDone]`.

| Кнопка в приложении | Запрос |
|---|---|
| Отправить в тест | `{"columnId":"cReady","status":"active"}` |
| Принять (QA) | `{"columnId":"cDone","status":"done"}` |
| Вернуть на доработку | `{"columnId":"c1","status":"active"}` + комментарий `kind:"return"` |

Для точных метрик этапов (`ready_at`, `tested_at`, `stage_times`,
`return_count`, `returns`) нужен прямой запрос в базу — см. §16. Если метрики
не важны, хватает `columnId` + `status`.

### Перенос задачи на другую доску

`boardId` через REST **не меняется** — только прямым запросом в базу (§16),
одним PATCH вместе с колонкой новой доски:
```bash
curl -s -X PATCH "$SB/rest/v1/tasks?id=eq.$TASK" "${SBH[@]}" \
  -d "{\"board_id\":\"$BOARD2\",\"column_id\":\"$COL2\"}"
```
Обновить только `board_id`, оставив старый `column_id`, нельзя — карточка
пропадёт с обеих досок.

---

## 11. Задачи: удалить и восстановить

```bash
# в Корзину (обратимо)
curl -s -X DELETE $BASE/api/tasks/$TASK -H "Authorization: Bearer $TOKEN"

# навсегда (вместе с комментариями)
curl -s -X DELETE "$BASE/api/tasks/$TASK?hard=true" -H "Authorization: Bearer $TOKEN"
```
Восстановление из Корзины — в приложении (`/trash`) или прямым запросом
`{"deleted_at": null}` (§16).

---

## 12. Подзадачи, зависимости, чек-лист, вложения

```bash
# подзадача
curl -s -X POST $BASE/api/tasks "${H[@]}" -H "X-Workspace-Id: $WS" \
  -d '{"title":"Написать тест","boardId":"'$BOARD'","columnId":"'$COL'","parentId":"'$PARENT'"}'

# показать подзадачи (в обычном списке скрыты)
curl -s "$BASE/api/tasks?boardId=$BOARD&subtasks=true" \
  -H "Authorization: Bearer $TOKEN" -H "X-Workspace-Id: $WS"

# отвязать от родителя
curl -s -X PATCH $BASE/api/tasks/$SUB "${H[@]}" -d '{"parentId":null}'

# «блокируется задачами»
curl -s -X PATCH $BASE/api/tasks/$TASK "${H[@]}" -d '{"blockedBy":["'$T1'","'$T2'"]}'
```

Чек-лист и вложения перезаписываются целиком — сначала прочитай текущие:
```bash
# отметить первый пункт выполненным
CUR=$(curl -s $BASE/api/tasks/$TASK -H "Authorization: Bearer $TOKEN" | jq -c '.data.checklist')
NEW=$(echo "$CUR" | jq -c '.[0].done = true')
curl -s -X PATCH $BASE/api/tasks/$TASK "${H[@]}" -d "{\"checklist\":$NEW}"
```

---

## 13. Комментарии, упоминания, уведомления

```bash
# добавить комментарий (Markdown, @имя — упоминание)
curl -s -X POST $BASE/api/tasks/$TASK/comments "${H[@]}" \
  -d '{"text":"Проверил на iOS 17 — баг ушёл. @Иван Петров посмотри","author":"Мария Ким"}'

# причина возврата от QA
curl -s -X POST $BASE/api/tasks/$TASK/comments "${H[@]}" \
  -d '{"text":"Не воспроизводится, нужны логи","author":"QA","kind":"return"}'

# прочитать все
curl -s $BASE/api/tasks/$TASK/comments -H "Authorization: Bearer $TOKEN"
```
`author` — тоже значение из `/api/members`. `kind`: `comment` (по умолчанию)
или `return`.

**Уведомления автоматически не рассылаются.** Хочешь дёрнуть человека — сделай
это явно:

```bash
# уведомление внутри приложения (нужен userId из /api/members)
curl -s -X POST "$SB/rest/v1/rpc/notify_member" \
  -H "apikey: $ANON" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"p_user":"<userId>","p_ws":"'$WS'","p_type":"assign",
       "p_title":"Новая задача","p_body":"Починить логин по SMS",
       "p_link":"/board/'$BOARD'?task='$TASK'"}'

# письмо
curl -s -X POST $BASE/api/notify/email -H "Content-Type: application/json" \
  -d '{"to":"ivan@example.com","title":"Новая задача","body":"Починить логин по SMS","link":"/board/'$BOARD'?task='$TASK'"}'
```
Типы уведомлений: `invite`, `mention`, `comment`, `assign`, `info`.
Себе отправить нельзя; отправитель и получатель — в одной комнате.

Прямая ссылка на карточку: `https://bulut.my/board/<boardId>?task=<taskId>`

---

## 14. Журнал

```bash
# записи (фильтры: taskId, from, to, page, limit)
curl -s "$BASE/api/journal?from=2026-08-01&to=2026-08-31" \
  -H "Authorization: Bearer $TOKEN" -H "X-Workspace-Id: $WS"

# создать запись
curl -s -X POST $BASE/api/journal "${H[@]}" -H "X-Workspace-Id: $WS" -d '{
  "boardName":"Driver","taskTitle":"Регресс логина","assignee":"Иван Петров",
  "notes":"Прогнали смоук, багов нет","stage":"Готово","type":"test",
  "taskId":"'$TASK'","date":"2026-08-17"}'

# удалить запись
curl -s -X DELETE $BASE/api/journal/$ENTRY -H "Authorization: Bearer $TOKEN"
```
`date` по умолчанию — сегодня.

---

## 15. Карты (Bulut MAP) и привязка задач

```bash
curl -s $BASE/api/maps -H "Authorization: Bearer $TOKEN" -H "X-Workspace-Id: $WS"

# карта + плоский список узлов
curl -s $BASE/api/maps/$MAP -H "Authorization: Bearer $TOKEN"
```
```json
{ "id":"MAP","name":"Driver",
  "nodes":[ {"id":"n_login","label":"Экран логина","kind":"screen"} ] }
```
Передай `mapId` + `mapNodeId` при создании задачи — карточка привяжется к
экрану, и на карте у узла появится «светофор» по её багам.

Ещё: `POST /api/maps`, `PATCH /api/maps/:id`, `DELETE /api/maps/:id`,
`POST /api/maps/:id/nodes`, `PATCH|DELETE /api/maps/:id/nodes/:nodeId`,
`POST /api/maps/:id/edges`, `DELETE /api/maps/:id/edges/:edgeId`.
Подробно: <https://bulut.my/BULUT_MAP_API.md>

---

## 16. Спринты, эпики, очки — прямой доступ к базе

Всё, чего нет в REST-обёртке, доступно напрямую в Supabase **тем же токеном** и
с той же изоляцией по комнатам (RLS).

```bash
SB="https://umivhhkwolysesmkvisa.supabase.co"          # NEXT_PUBLIC_SUPABASE_URL
ANON="<NEXT_PUBLIC_SUPABASE_ANON_KEY>"                 # публичный ключ приложения
SBH=(-H "apikey: $ANON" -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/json" -H "Prefer: return=representation")
```
Здесь имена полей **snake_case**, фильтры — синтаксис PostgREST
(`?id=eq.…`, `?id=in.(a,b)`, `?deleted_at=is.null`, `&select=…`, `&order=…`).

| Поле `tasks` | Тип | Смысл |
|---|---|---|
| `sprint` | text | метка спринта («Спринт 12») |
| `epic` | text | метка эпика |
| `story_points` | integer | оценка |
| `watchers` | text[] | наблюдатели (имена) |
| `custom` | jsonb | значения своих полей доски: `{"<fieldId>":"…"}` |
| `photos` | jsonb | фото (чистятся при переходе в «Готово») |
| `ready_at`, `tested_at`, `stage_entered_at`, `stage_times`, `return_count`, `returns` | | метрики этапов |
| `deleted_at` | timestamptz | Корзина (`null` — восстановить) |

```bash
# набрать спринт
curl -s -X PATCH "$SB/rest/v1/tasks?id=in.($T1,$T2,$T3)" "${SBH[@]}" \
  -d '{"sprint":"Спринт 12"}'

# оценка + эпик + наблюдатели
curl -s -X PATCH "$SB/rest/v1/tasks?id=eq.$T1" "${SBH[@]}" \
  -d '{"epic":"Онбординг","story_points":5,"watchers":["Мария Ким"]}'

# содержимое спринта
curl -s "$SB/rest/v1/tasks?sprint=eq.%D0%A1%D0%BF%D1%80%D0%B8%D0%BD%D1%82%2012&deleted_at=is.null&select=id,title,status,story_points,assignee" \
  -H "apikey: $ANON" -H "Authorization: Bearer $TOKEN"

# восстановить задачу из Корзины
curl -s -X PATCH "$SB/rest/v1/tasks?id=eq.$TASK" "${SBH[@]}" -d '{"deleted_at":null}'

# участники и профили (то же, что /api/members, но сырьём)
curl -s "$SB/rest/v1/workspace_members?workspace_id=eq.$WS&select=user_id,role,permissions" \
  -H "apikey: $ANON" -H "Authorization: Bearer $TOKEN"
```

**Проще альтернатива спринтам:** делать каждый спринт отдельной доской
(`POST /api/boards {"name":"Спринт 12"}`) — тогда всё управляется чистым REST.

Полная версия справочника таблиц и RPC (приглашения, права, бэкапы):
<https://bulut.my/BULUT_API_FULL.md>

---

## 17. Готовые сценарии

### 17.1 Создать доску под проект и раздать задачи людям
```bash
BASE="https://bulut.my"
TOKEN=$(curl -s -X POST $BASE/api/auth/token -H "Content-Type: application/json" \
  -d '{"email":"you@example.com","password":"pass"}' | jq -r .access_token)
WS=$(curl -s $BASE/api/workspaces -H "Authorization: Bearer $TOKEN" | jq -r '.data[0].id')
H=(-H "Authorization: Bearer $TOKEN" -H "X-Workspace-Id: $WS" -H "Content-Type: application/json")

# кто в команде
curl -s $BASE/api/members "${H[@]}" | jq -r '.data[] | "\(.assignee) — \(.jobRole) [\(.role)]"'

# доска
BOARD=$(curl -s -X POST $BASE/api/boards "${H[@]}" \
  -d '{"name":"Релиз 2.0","color":"#0ea5e9"}' | jq -r .id)
COL=$(curl -s $BASE/api/boards/$BOARD -H "Authorization: Bearer $TOKEN" | jq -r '.data.columns[0].id')

# задача на реального человека
curl -s -X POST $BASE/api/tasks "${H[@]}" -d "{
  \"title\":\"Свести релиз-ноты\",
  \"description\":\"Собрать изменения из журнала за август\",
  \"boardId\":\"$BOARD\",\"columnId\":\"$COL\",
  \"assignee\":\"Иван Петров\",\"type\":\"docs\",\"priority\":\"medium\",
  \"dueDate\":\"2026-08-25\"}"
```

### 17.2 Что просрочено и на ком
```bash
curl -s "$BASE/api/tasks?overdue=true&limit=200" "${H[@]}" \
  | jq -r '.data[] | "\(.dueDate)  \(.assignee // "—")  \(.title)"' | sort
```

### 17.3 Разгрузить человека — перекинуть его задачи
```bash
for T in $(curl -s "$BASE/api/tasks?assignee=Иван%20Петров&status=active" "${H[@]}" | jq -r '.data[].id'); do
  curl -s -X PATCH $BASE/api/tasks/$T -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" -d '{"assignee":"Мария Ким"}' > /dev/null
done
```

### 17.4 Закрыть задачу «как человек»
```bash
COLS=$(curl -s $BASE/api/boards/$BOARD -H "Authorization: Bearer $TOKEN" | jq -r '.data.columns[-1].id')
curl -s -X PATCH $BASE/api/tasks/$TASK "${H[@]}" -d "{\"status\":\"done\",\"columnId\":\"$COLS\"}"
curl -s -X POST $BASE/api/tasks/$TASK/comments "${H[@]}" \
  -d '{"text":"Готово, проверено на проде","author":"Мария Ким"}'
curl -s -X POST $BASE/api/journal "${H[@]}" \
  -d '{"boardName":"Релиз 2.0","taskTitle":"Свести релиз-ноты","assignee":"Мария Ким","stage":"Готово"}'
```

### 17.5 Массово завести задачи из списка
```bash
jq -c '.[]' tasks.json | while read -r item; do
  curl -s -X POST $BASE/api/tasks "${H[@]}" \
    -d "$(echo "$item" | jq -c --arg b "$BOARD" --arg c "$COL" '. + {boardId:$b, columnId:$c}')" \
    | jq -r '.data.title // .error'
done
```
`tasks.json`: `[{"title":"…","assignee":"…","type":"bug","priority":"high","dueDate":"2026-08-20"}, …]`

---

## 18. Справочник значений

- **priority:** `low` · `medium` · `high`
- **status:** `active` · `done`
- **type:** `task` · `bug` · `feature` · `newfeature` · `improvement` ·
  `refactor` · `docs` · `test` · `design` · `research`
- **kind комментария:** `comment` · `return`
- **роли в комнате:** `owner` · `admin` · `member`
- **этапы по умолчанию:** `К выполнению` · `В процессе` · `Готов к тестированию` ·
  `На проверке` · `Готово`
- **типы уведомлений:** `invite` · `mention` · `comment` · `assign` · `info`
- **ключи прав:** `board.view` `card.create` `card.edit` `card.move` `card.delete`
  `card.status` `card.comment` `board.manage` `journal.*` `reports.*` `team.*`
  `map.*` `console.view` `admin.access`

---

## 19. Ошибки

| Код | Что значит | Что делать |
|---|---|---|
| `400` | нет обязательного поля / плохой JSON | прочитай текст `error` |
| `401` | нет токена или он истёк | обнови через `refresh_token` |
| `403` | нет доступа к комнате | проверь `X-Workspace-Id` |
| `404` | доска/задача не найдена или в другой комнате | перечитай списки |
| `409` | удаляешь колонки с задачами | добавь `moveOrphansTo` |
| `500` | ошибка базы | не повторяй вслепую, покажи текст человеку |

> Права (`permissions`) проверяются в интерфейсе приложения. REST ограничен
> только членством в комнате (RLS) — участник комнаты может через API сделать
> больше, чем ему разрешает UI. Учитывай это.

---

## 20. Шпаргалка: все эндпойнты

| Метод | Путь | Что делает |
|---|---|---|
| POST | `/api/auth/token` | вход / обновление токена |
| GET | `/api/workspaces` | комнаты пользователя |
| GET | `/api/members` | участники комнаты (для `assignee`) |
| GET | `/api/boards` | доски с колонками и счётчиками |
| POST | `/api/boards` | создать доску |
| GET | `/api/boards/:id` | одна доска |
| PATCH | `/api/boards/:id` | имя, цвет, колонки, порядок, restore |
| DELETE | `/api/boards/:id` | в Корзину · `?hard=true` — навсегда |
| GET | `/api/tasks` | список с фильтрами |
| POST | `/api/tasks` | создать задачу |
| GET | `/api/tasks/:id` | задача + комментарии |
| PATCH | `/api/tasks/:id` | изменить / переместить / закрыть |
| DELETE | `/api/tasks/:id` | в Корзину · `?hard=true` |
| GET/POST | `/api/tasks/:id/comments` | комментарии |
| GET/POST | `/api/journal` · DELETE `/api/journal/:id` | журнал |
| GET/POST | `/api/maps` · GET/PATCH/DELETE `/api/maps/:id` | карты |
| POST/PATCH/DELETE | `/api/maps/:id/nodes[/:nodeId]` | узлы карты |
| POST/DELETE | `/api/maps/:id/edges[/:edgeId]` | связи карты |
| POST | `/api/notify/email` | письмо |
| GET | `/api` | живая справка по API |

Прочая документация: <https://bulut.my/BULUT_API.md> (кратко) ·
<https://bulut.my/BULUT_API_FULL.md> (полная) ·
<https://bulut.my/BULUT_MAP_API.md> (карты)
