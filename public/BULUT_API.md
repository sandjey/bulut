# Bulut API — документация

REST-API, чтобы **любой пользователь Bulut управлял своим аккаунтом через свою
авторизацию**: создавать, перемещать, менять и удалять карточки, работать с
досками, картами, журналом и комментариями. Доступ определяется вашими
комнатами автоматически (что видите в приложении — то доступно и по API).
**Никаких общих ключей и сервисных аккаунтов не нужно.**

- **База:** `https://ВАШ_ДОМЕН`
- **Формат:** JSON. Ответы: `{ "data": ... }` или `{ "error": "..." }`.
- **Живая справка:** `GET /api`.

---

## 1. Авторизация: вход своим аккаунтом → токен

Войдите своим email и паролем (тем же, что в приложении) и получите токен:

```bash
curl -s -X POST https://ВАШ_ДОМЕН/api/auth/token \
  -H "Content-Type: application/json" \
  -d '{ "email": "you@example.com", "password": "ваш-пароль" }'
```
```json
{
  "access_token": "eyJhbGciOi...",
  "refresh_token": "v1.Mr8...",
  "token_type": "bearer",
  "expires_at": 1712345678,
  "user": { "id": "…", "email": "you@example.com" }
}
```

Дальше **каждый запрос** — с заголовком:
```
Authorization: Bearer <access_token>
```

Токен живёт ~1 час. Обновить без повторного ввода пароля:
```bash
curl -s -X POST https://ВАШ_ДОМЕН/api/auth/token \
  -H "Content-Type: application/json" \
  -d '{ "refresh_token": "<refresh_token>" }'
```

---

## 2. Комнаты (workspace)

Данные разделены по комнатам. Укажите **`X-Workspace-Id: <id>`** (или
`?workspace=<id>`). Без него берётся первая ваша комната.

```bash
curl -s https://ВАШ_ДОМЕН/api/workspaces -H "Authorization: Bearer $TOKEN"
```
```json
{ "data": [ { "id": "ws-uuid", "name": "Моя команда", "role": "owner" } ], "total": 1 }
```

Дальше в примерах: `-H "Authorization: Bearer $TOKEN" -H "X-Workspace-Id: $WS"`.

---

## 3. Доски

```bash
# список досок с колонками (нужны их id)
curl -s https://ВАШ_ДОМЕН/api/boards -H "Authorization: Bearer $TOKEN" -H "X-Workspace-Id: $WS"
```
```json
{ "data": [ {
  "id": "board-uuid", "name": "Driver",
  "columns": [ { "id": "col-1", "name": "К выполнению", "total": 3, "active": 3, "done": 0 } ],
  "taskCount": 4
} ] }
```
`columns[].id` — это **`columnId`** для задач.

```bash
# создать доску (без columns — стандартные этапы)
curl -s -X POST https://ВАШ_ДОМЕН/api/boards \
  -H "Authorization: Bearer $TOKEN" -H "X-Workspace-Id: $WS" -H "Content-Type: application/json" \
  -d '{ "name": "Регресс", "columns": ["К выполнению","В работе","Готово"] }'
```

---

## 4. Задачи (карточки)

### Список (фильтры)
```bash
curl -s "https://ВАШ_ДОМЕН/api/tasks?boardId=$BOARD&status=active&priority=high" \
  -H "Authorization: Bearer $TOKEN" -H "X-Workspace-Id: $WS"
```
Параметры: `boardId`, `columnId`, `assignee`, `status` (`active|done`),
`priority`, `type`, `search`, `dueAfter`/`dueBefore` (`YYYY-MM-DD`),
`overdue=true`, `hasAssignee`, `mapId`, `mapNodeId`, `subtasks=true`,
`sort`, `order`, `page`, `limit`.

### Создать
```bash
curl -s -X POST https://ВАШ_ДОМЕН/api/tasks \
  -H "Authorization: Bearer $TOKEN" -H "X-Workspace-Id: $WS" -H "Content-Type: application/json" \
  -d '{ "title":"Баг логина", "boardId":"'$BOARD'", "columnId":"'$COL'", "type":"bug", "priority":"high", "assignee":"Иван" }'
```
Поля: `title*`, `boardId*`, `columnId*`, `description`, `assignee`, `priority`,
`type`, `dueDate`, `doneDueDate`, `tags[]`, `checklist[]`, `attachments[]`,
`mapId`, `mapNodeId`, `parentId` (подзадача), `blockedBy[]`.

### Одна задача (+ комментарии)
```bash
curl -s https://ВАШ_ДОМЕН/api/tasks/$TASK -H "Authorization: Bearer $TOKEN"
```

### Изменить / переместить (drag)
```bash
# сменить этап и позицию (перетаскивание)
curl -s -X PATCH https://ВАШ_ДОМЕН/api/tasks/$TASK \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{ "columnId":"'$COL_DONE'", "position": 0 }'

# отметить выполненной / сменить исполнителя
curl -s -X PATCH https://ВАШ_ДОМЕН/api/tasks/$TASK \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{ "status":"done", "assignee":"Пётр" }'
```
Меняются любые поля из создания + `status`, `columnId`, `position`.

### Удалить
```bash
curl -s -X DELETE https://ВАШ_ДОМЕН/api/tasks/$TASK -H "Authorization: Bearer $TOKEN"
# в Корзину (восстановимо). Навсегда: добавьте ?hard=true
```

---

## 5. Комментарии задачи
```bash
# добавить (@имя — упоминание, поддерживается Markdown)
curl -s -X POST https://ВАШ_ДОМЕН/api/tasks/$TASK/comments \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{ "text":"Проверил, баг ушёл", "author":"QA" }'

# прочитать
curl -s https://ВАШ_ДОМЕН/api/tasks/$TASK/comments -H "Authorization: Bearer $TOKEN"
```

---

## 6. Журнал
```bash
# записи (фильтры: taskId, from, to, page, limit)
curl -s "https://ВАШ_ДОМЕН/api/journal?from=2026-07-01" \
  -H "Authorization: Bearer $TOKEN" -H "X-Workspace-Id: $WS"

# создать запись
curl -s -X POST https://ВАШ_ДОМЕН/api/journal \
  -H "Authorization: Bearer $TOKEN" -H "X-Workspace-Id: $WS" -H "Content-Type: application/json" \
  -d '{ "boardName":"Driver", "taskTitle":"Регресс логина", "notes":"Прогнали смоук", "stage":"Готово" }'

# удалить запись
curl -s -X DELETE https://ВАШ_ДОМЕН/api/journal/$ENTRY -H "Authorization: Bearer $TOKEN"
```

---

## 7. Карты и id узлов (для привязки карточек)
```bash
curl -s https://ВАШ_ДОМЕН/api/maps -H "Authorization: Bearer $TOKEN" -H "X-Workspace-Id: $WS"

# карта + плоский список узлов
curl -s https://ВАШ_ДОМЕН/api/maps/$MAP -H "Authorization: Bearer $TOKEN"
```
```json
{ "id":"MAP", "name":"Driver",
  "nodes": [ { "id":"n_login", "label":"Экран логина", "kind":"screen" } ] }
```
Берёте `nodes[].id` → передаёте как **`mapNodeId`** (а `MAP` как `mapId`) при
создании задачи. Карточка привяжется к экрану, и на карте у узла появится
статус («светофор») из её багов.

Также: `POST /api/maps`, `PATCH /api/maps/:id`, `DELETE /api/maps/:id`.

---

## 8. Полный сценарий (bash)
```bash
BASE="https://ВАШ_ДОМЕН"

# 1) вход → токен
TOKEN=$(curl -s -X POST $BASE/api/auth/token -H "Content-Type: application/json" \
  -d '{"email":"you@example.com","password":"pass"}' | jq -r .access_token)

# 2) комната
WS=$(curl -s $BASE/api/workspaces -H "Authorization: Bearer $TOKEN" | jq -r '.data[0].id')

# 3) доска и колонка
BOARD=$(curl -s $BASE/api/boards -H "Authorization: Bearer $TOKEN" -H "X-Workspace-Id: $WS" | jq -r '.data[0].id')
COL=$(curl -s $BASE/api/boards -H "Authorization: Bearer $TOKEN" -H "X-Workspace-Id: $WS" | jq -r '.data[0].columns[0].id')

# 4) создать баг
TASK=$(curl -s -X POST $BASE/api/tasks -H "Authorization: Bearer $TOKEN" -H "X-Workspace-Id: $WS" \
  -H "Content-Type: application/json" \
  -d "{\"title\":\"Баг\",\"boardId\":\"$BOARD\",\"columnId\":\"$COL\",\"type\":\"bug\"}" | jq -r .data.id)

# 5) закрыть
curl -s -X PATCH $BASE/api/tasks/$TASK -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" -d '{"status":"done"}'
```

---

## 9. Справочник
- **priority:** `low` · `medium` · `high`
- **status:** `active` · `done`
- **type:** `task` · `bug` · `feature` · `newfeature` · `improvement` ·
  `refactor` · `docs` · `test` · `design` · `research`
- **Этапы по умолчанию:** `К выполнению` · `В процессе` · `Готов к тестированию` ·
  `На проверке` · `Готово`

## 10. Ошибки
| Код | Значение |
|---|---|
| `400` | некорректный запрос / нет обязательного поля |
| `401` | не вошли / токен истёк (обновите через refresh_token) |
| `403` | нет доступа к комнате |
| `404` | не найдено |
| `500` | ошибка сервера |
