# Bulut API — документация для интеграций и QA

REST-API для работы с досками, задачами и картами Bulut: создавать, изменять,
удалять и читать карточки, видеть все доски, задачи и карты. Подходит для
автоматизации и инструментов тестировщика.

- **База:** `https://bulut-kappa.vercel.app` (замените на свой домен)
- **Формат:** JSON. Все ответы вида `{ "data": ... }` или `{ "error": "..." }`.
- **Краткая справка вживую:** `GET /api` — вернёт список эндпоинтов.

---

## 1. Авторизация

Каждый запрос — с заголовком **`X-API-Key`**:

```
X-API-Key: <ВАШ_КЛЮЧ>
```

Ключ и сервисный аккаунт задаются на сервере (переменные окружения):

| Переменная | Назначение |
|---|---|
| `BULUT_API_KEY` | сам секретный ключ (его шлёте в `X-API-Key`) |
| `BULUT_API_SERVICE_EMAIL` | email аккаунта Bulut, от имени которого работает API |
| `BULUT_API_SERVICE_PASS` | пароль этого аккаунта |

> **Важно (мультиарендность):** данные разделены по **комнатам**. Сервисный
> аккаунт (`BULUT_API_SERVICE_EMAIL`) должен быть **участником той комнаты**, с
> которой работаете. Владелец комнаты приглашает этот email в комнату
> (раздел «Команда» → Пригласить). Иначе API вернёт `403`.

Альтернатива для отладки из приложения: `Authorization: Bearer <supabase-jwt>`.

---

## 2. Комнаты (workspace)

Укажите, в какой комнате работать, заголовком **`X-Workspace-Id`** (или
`?workspace=<id>`). Если не указать — берётся первая комната аккаунта.

**Список доступных комнат:**

```bash
curl -s https://ВАШ_ДОМЕН/api/workspaces -H "X-API-Key: КЛЮЧ"
```
```json
{ "data": [ { "id": "…uuid…", "name": "Моя команда", "color": "#6366f1", "role": "member" } ], "total": 1 }
```

Возьмите нужный `id` и передавайте его в `X-Workspace-Id` во всех запросах.

---

## 3. Доски

### Список досок (с колонками и счётчиками)
```bash
curl -s https://ВАШ_ДОМЕН/api/boards \
  -H "X-API-Key: КЛЮЧ" -H "X-Workspace-Id: WS"
```
```json
{ "data": [ {
  "id": "board-uuid",
  "name": "Driver",
  "columns": [
    { "id": "col-1", "name": "К выполнению", "total": 3, "active": 3, "done": 0 },
    { "id": "col-2", "name": "В процессе",   "total": 1, "active": 1, "done": 0 }
  ],
  "taskCount": 4
} ], "total": 1 }
```
> `columns[].id` — это **`columnId`**, который нужен для создания/перемещения задач.

### Создать доску
```bash
curl -s -X POST https://ВАШ_ДОМЕН/api/boards \
  -H "X-API-Key: КЛЮЧ" -H "X-Workspace-Id: WS" -H "Content-Type: application/json" \
  -d '{ "name": "Регресс", "columns": ["К выполнению","В работе","Готово"] }'
```
Без `columns` создаются стандартные этапы: `К выполнению · В процессе · Готов к тестированию · На проверке · Готово`.

---

## 4. Задачи (карточки)

### Список задач (с фильтрами)
```bash
curl -s "https://ВАШ_ДОМЕН/api/tasks?boardId=BOARD&status=active&priority=high" \
  -H "X-API-Key: КЛЮЧ" -H "X-Workspace-Id: WS"
```

**Параметры:** `boardId`, `columnId`, `assignee`, `status` (`active|done`),
`priority` (`low|medium|high`), `type`, `search` (в названии и описании),
`dueAfter`, `dueBefore` (`YYYY-MM-DD`), `overdue=true`, `hasAssignee`,
`mapId`, `mapNodeId`, `subtasks=true` (показать подзадачи),
`sort` (`created_at|due_date|position|title`), `order` (`asc|desc`),
`page`, `limit` (до 200).

Ответ: `{ "data": [ …задачи… ], "meta": { total, page, limit, pages, hasMore } }`.

### Создать задачу
```bash
curl -s -X POST https://ВАШ_ДОМЕН/api/tasks \
  -H "X-API-Key: КЛЮЧ" -H "X-Workspace-Id: WS" -H "Content-Type: application/json" \
  -d '{
    "title": "Баг: не открывается логин",
    "boardId": "BOARD_ID",
    "columnId": "COLUMN_ID",
    "type": "bug",
    "priority": "high",
    "assignee": "Иван",
    "dueDate": "2026-07-20",
    "tags": ["auth","regress"],
    "checklist": [ { "text": "Воспроизвести" }, { "text": "Приложить лог" } ]
  }'
```

**Поля тела:**

| Поле | Тип | Обяз. | Примечание |
|---|---|:--:|---|
| `title` | string | ✅ | название |
| `boardId` | uuid | ✅ | доска |
| `columnId` | string | ✅ | id колонки (этапа) из доски |
| `description` | string | | описание (поддерживает Markdown) |
| `assignee` | string | | имя исполнителя |
| `priority` | `low\|medium\|high` | | по умолч. `medium` |
| `type` | см. ниже | | по умолч. `task` |
| `dueDate` | `YYYY-MM-DD` | | срок «Готов к тестированию» |
| `doneDueDate` | `YYYY-MM-DD` | | срок «Готово» |
| `tags` | string[] | | теги |
| `checklist` | `{text,done?}[]` | | чек-лист |
| `attachments` | `{name,url}[]` | | ссылки-вложения |
| `mapId` | uuid | | привязка к карте |
| `mapNodeId` | string | | привязка к узлу карты (см. раздел 5) |
| `parentId` | uuid | | сделать подзадачей задачи |
| `blockedBy` | uuid[] | | задачи, которые её блокируют |

### Одна задача (+ комментарии)
```bash
curl -s https://ВАШ_ДОМЕН/api/tasks/TASK_ID -H "X-API-Key: КЛЮЧ"
```

### Изменить задачу
Любое подмножество полей + `status` и `columnId` (перемещение между этапами):
```bash
curl -s -X PATCH https://ВАШ_ДОМЕН/api/tasks/TASK_ID \
  -H "X-API-Key: КЛЮЧ" -H "Content-Type: application/json" \
  -d '{ "status": "done", "assignee": "Пётр" }'
```
```bash
# переместить в другой этап
curl -s -X PATCH https://ВАШ_ДОМЕН/api/tasks/TASK_ID \
  -H "X-API-Key: КЛЮЧ" -H "Content-Type: application/json" \
  -d '{ "columnId": "COLUMN_ID_ГОТОВО" }'
```

### Удалить задачу
```bash
curl -s -X DELETE https://ВАШ_ДОМЕН/api/tasks/TASK_ID -H "X-API-Key: КЛЮЧ"
```

---

## 5. Карты и id узлов (для привязки карточек)

### Список карт
```bash
curl -s https://ВАШ_ДОМЕН/api/maps -H "X-API-Key: КЛЮЧ" -H "X-Workspace-Id: WS"
```

### Карта + узлы (id для автоматизации)
```bash
curl -s https://ВАШ_ДОМЕН/api/maps/MAP_ID -H "X-API-Key: КЛЮЧ"
```
```json
{
  "id": "MAP_ID",
  "name": "Driver",
  "nodes": [
    { "id": "n_login",  "label": "Экран логина", "kind": "screen" },
    { "id": "n_otp",    "label": "OTP",          "kind": "screen" }
  ],
  "graph": { "...": "полный граф, если нужен" }
}
```
> Берёте `nodes[].id` и передаёте его как **`mapNodeId`** (а `MAP_ID` как
> `mapId`) при создании задачи — карточка привяжется к этому экрану, и на карте
> у узла появится статус («светофор») из её багов.

Есть также `POST /api/maps`, `PATCH /api/maps/:id`, `DELETE /api/maps/:id`.

---

## 6. Типовой сценарий QA (пошагово)

```bash
KEY="ВАШ_КЛЮЧ"; BASE="https://ВАШ_ДОМЕН"

# 1) какая комната
curl -s $BASE/api/workspaces -H "X-API-Key: $KEY"          # → берём WS id
WS="…"

# 2) какие доски и колонки
curl -s $BASE/api/boards -H "X-API-Key: $KEY" -H "X-Workspace-Id: $WS"
BOARD="…"; COL="…"   # id доски и нужной колонки

# 3) завести баг
curl -s -X POST $BASE/api/tasks -H "X-API-Key: $KEY" -H "X-Workspace-Id: $WS" \
  -H "Content-Type: application/json" \
  -d "{\"title\":\"Баг X\",\"boardId\":\"$BOARD\",\"columnId\":\"$COL\",\"type\":\"bug\",\"priority\":\"high\"}"

# 4) позже — закрыть
curl -s -X PATCH $BASE/api/tasks/TASK_ID -H "X-API-Key: $KEY" \
  -H "Content-Type: application/json" -d '{ "status": "done" }'
```

---

## 7. Справочник значений

- **priority:** `low` · `medium` · `high`
- **status:** `active` · `done`
- **type:** `task` · `bug` · `feature` · `newfeature` · `improvement` ·
  `refactor` · `docs` · `test` · `design` · `research`
- **Этапы (колонки) по умолчанию:** `К выполнению` · `В процессе` ·
  `Готов к тестированию` · `На проверке` · `Готово` (у каждой свой `columnId`).

## 8. Коды ошибок

| Код | Значение |
|---|---|
| `400` | некорректный запрос / нет обязательного поля |
| `401` | неверный или отсутствует ключ |
| `403` | нет доступа к комнате (аккаунт не участник) |
| `404` | доска / задача / карта не найдена |
| `500` | ошибка сервера |
| `501` | API-ключ или сервисный аккаунт не настроены на сервере |
