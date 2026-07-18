# Bulut MAP API — управление картами из своей авторизации

REST-API для полного управления **Bulut MAP** (визуальные карты продукта) под
**вашим аккаунтом**: создавать карты, добавлять экраны/действия/решения, соединять
их стрелками, ставить статус-«светофор» и привязывать к доскам/задачам.

Доступ определяется вашими комнатами (RLS): что видите в приложении — то доступно
и по API. Общие ключи не нужны.

- **База:** `https://ВАШ_ДОМЕН`
- **Формат:** JSON. Ответы: `{ "data": ... }` или `{ "error": "..." }`.
- **Живая справка:** `GET /api`.

---

## 1. Авторизация

Войдите своим email и паролем (как в приложении) → получите токен:

```bash
curl -s -X POST https://ВАШ_ДОМЕН/api/auth/token \
  -H "Content-Type: application/json" \
  -d '{ "email": "you@example.com", "password": "ваш-пароль" }'
```
```json
{ "access_token": "eyJhbGciOi...", "refresh_token": "v1.Mr8...", "token_type": "bearer" }
```

Дальше в каждом запросе:
```
Authorization: Bearer <access_token>
```

Данные разделены по комнатам. Укажите комнату заголовком `X-Workspace-Id: <id>`
(или `?workspace=<id>`); без него берётся первая ваша комната.
Список комнат: `GET /api/workspaces`.

Ниже в примерах: `-H "Authorization: Bearer $TOKEN" -H "X-Workspace-Id: $WS"`.

---

## 2. Карты

### Список карт
```
GET /api/maps
```
```json
{ "data": [ { "id": "map-uuid", "name": "Driver", "color": "#6366f1", "nodeCount": 12, "edgeCount": 9 } ], "total": 1 }
```

### Создать карту
```
POST /api/maps
```
Тело (всё необязательно):
```json
{ "name": "Driver", "color": "#6366f1" }
```
```json
{ "data": { "id": "map-uuid", "name": "Driver", "color": "#6366f1" } }
```

### Получить карту с узлами
```
GET /api/maps/:id
```
```json
{
  "data": {
    "id": "map-uuid",
    "name": "Driver",
    "nodes": [ { "id": "node-uuid", "label": "Login", "kind": "screen" } ],
    "graph": { "nodes": [ ... ], "edges": [ ... ] }
  }
}
```
`nodes[].id` — используйте как `mapNodeId` при привязке задач и как `source`/`target`
при создании связей.

### Изменить / удалить карту
```
PATCH  /api/maps/:id     { "name": "...", "color": "#...", "graph": { ... } }
DELETE /api/maps/:id
```
`PATCH` с `graph` заменяет **весь** граф целиком. Для точечных изменений используйте
операции с узлами/связями ниже.

---

## 3. Узлы (экраны, действия, решения…)

### Добавить узел
```
POST /api/maps/:id/nodes
```
Тело:
```json
{
  "kind": "screen",
  "label": "Login",
  "x": 120,
  "y": 80,
  "color": "#6366f1",
  "description": "Экран входа по телефону",
  "statusOverride": "bug",
  "link": { "boardId": "board-uuid", "taskId": "task-uuid" }
}
```
Поля:
| Поле | Значение |
|---|---|
| `kind` | `terminator` (начало/конец), `screen` (экран), `action` (действие), `decision` (решение-ромб), `process` (процесс), `note` (заметка), `group` (зона/этап), `number` (номер), `link` (ссылка на доску/задачу). По умолчанию `screen`. |
| `label` | Подпись узла |
| `x`, `y` | Координаты на холсте (число) |
| `color` | Акцентный цвет (hex); по умолчанию — цвет типа |
| `description` | Описание (видно при клике на узел) |
| `statusOverride` | Ручной светофор: `ok` (🟢), `wip` (🟡), `bug` (🔴). Не указывать — статус считается автоматически из задач. |
| `link` | Для `kind:"link"` — `{ boardId, taskId, url }` |

Ответ:
```json
{ "data": { "id": "node-uuid", "node": { ... } } }
```

### Изменить узел
```
PATCH /api/maps/:id/nodes/:nodeId
```
Любые из полей узла (`label`, `color`, `description`, `kind`, `x`, `y`,
`statusOverride`, `link`). Чтобы **снять** ручной статус (вернуть авто) — пришлите
`"statusOverride": null` или `""`.
```bash
curl -s -X PATCH https://ВАШ_ДОМЕН/api/maps/$MAP/nodes/$NODE \
  -H "Authorization: Bearer $TOKEN" -H "X-Workspace-Id: $WS" \
  -H "Content-Type: application/json" \
  -d '{ "statusOverride": "bug", "description": "Не приходит OTP" }'
```

### Удалить узел
```
DELETE /api/maps/:id/nodes/:nodeId
```
Удаляет узел и все связанные с ним стрелки.

---

## 4. Связи (стрелки)

### Добавить связь
```
POST /api/maps/:id/edges
```
```json
{ "source": "node-uuid-1", "target": "node-uuid-2", "label": "да" }
```
`source` и `target` — id существующих узлов. `label` необязателен.
```json
{ "data": { "id": "edge-uuid", "edge": { ... } } }
```

### Удалить связь
```
DELETE /api/maps/:id/edges/:edgeId
```

---

## 5. Пример: собрать карту целиком

```bash
TOKEN=... ; WS=... ; BASE=https://ВАШ_ДОМЕН
H=(-H "Authorization: Bearer $TOKEN" -H "X-Workspace-Id: $WS" -H "Content-Type: application/json")

# 1) карта
MAP=$(curl -s -X POST $BASE/api/maps "${H[@]}" -d '{"name":"Driver"}' | jq -r .data.id)

# 2) узлы
A=$(curl -s -X POST $BASE/api/maps/$MAP/nodes "${H[@]}" \
     -d '{"kind":"terminator","label":"Старт","x":0,"y":0}' | jq -r .data.id)
B=$(curl -s -X POST $BASE/api/maps/$MAP/nodes "${H[@]}" \
     -d '{"kind":"screen","label":"Login","x":0,"y":140}' | jq -r .data.id)
C=$(curl -s -X POST $BASE/api/maps/$MAP/nodes "${H[@]}" \
     -d '{"kind":"decision","label":"OTP верный?","x":0,"y":300}' | jq -r .data.id)

# 3) стрелки
curl -s -X POST $BASE/api/maps/$MAP/edges "${H[@]}" -d "{\"source\":\"$A\",\"target\":\"$B\"}"
curl -s -X POST $BASE/api/maps/$MAP/edges "${H[@]}" -d "{\"source\":\"$B\",\"target\":\"$C\"}"

# 4) статус-светофор (нашли баг на экране Login)
curl -s -X PATCH $BASE/api/maps/$MAP/nodes/$B "${H[@]}" -d '{"statusOverride":"bug"}'
```

Откройте карту в разделе **Bulut MAP** — она соберётся сразу, узлы и стрелки на месте.

---

## 6. Коды ответов

| Код | Значение |
|---|---|
| `200` | ОК |
| `201` | Создано (узел/связь/карта) |
| `400` | Некорректный JSON / нет `source`/`target` / несуществующий узел |
| `401` | Нет или неверный токен |
| `404` | Карта / узел / связь не найдены (или нет доступа по RLS) |
| `500` | Ошибка сервера |

> Совет: удобно тестировать эти запросы в разделе **Bulut API** (встроенный
> Postman) — авторизация подставится сама.
