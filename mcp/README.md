# Bulut MAP — MCP для Claude

Позволяет **Claude** создавать флоу-карты прямо в Bulut MAP:
скажи *«создай в Bulut флоу регистрации по OTP»* — Claude сам придумает узлы и
связи, вызовет инструмент, а сервер разложит их и вернёт ссылку на карту.

Есть **два способа** подключить:

- **A. Удалённый коннектор (claude.ai, браузер/телефон)** — ничего не запускаешь
  локально, добавляешь один URL. См. раздел «Веб-коннектор» ниже.
- **B. Локальный сервер (Claude Desktop / Claude Code)** — папка `mcp/`, запускается
  у тебя. См. остальную часть файла.

---

## A. Веб-коннектор (claude.ai) — рекомендую

В Bulut уже есть HTTP MCP-эндпоинт `/api/mcp`. В claude.ai:
**Settings → Connectors → Add custom connector**:

- **Name:** `Bulut MAP`
- **URL:** `https://bulut-kappa.vercel.app/api/mcp?key=ВАШ_BULUT_API_KEY`
- **OAuth Client ID:** оставить **пустым**

Готово — Claude сможет вызывать `create_flow`, `list_flows` и т.д.

> На Vercel должны быть заданы env: `BULUT_API_KEY`, `BULUT_API_SERVICE_EMAIL`,
> `BULUT_API_SERVICE_PASS` (значения из `.env` проекта). Без них создание карт
> через API не сработает.

---

## B. Локальный сервер (Claude Desktop / Claude Code)

## Что умеет (инструменты)

| Инструмент     | Что делает                                              |
| -------------- | ------------------------------------------------------- |
| `create_flow`  | создать новую карту из описания узлов и связей          |
| `list_flows`   | список карт со ссылками                                 |
| `get_flow`     | получить граф карты по id                               |
| `update_flow`  | перезаписать содержимое карты                           |
| `delete_flow`  | удалить карту                                           |

Типы узлов: `terminator` (начало/конец), `screen`, `action`, `decision`
(ветвление), `process`, `link`, `note`, `group`. Для ветвления Claude ставит
`decision` и подписывает стрелки «да»/«нет».

## Установка

```bash
cd mcp
npm install
```

Нужны переменные окружения:

- `BULUT_API_URL` — база API, напр. `https://bulut-kappa.vercel.app`
- `BULUT_API_KEY` — секретный ключ интеграции (значение `BULUT_API_KEY` из `.env` проекта)
- `BULUT_SITE_URL` — (необязательно) база сайта для ссылок; по умолчанию = `BULUT_API_URL`

## Подключение к Claude Desktop

Открой конфиг:
`~/Library/Application Support/Claude/claude_desktop_config.json`
и добавь:

```json
{
  "mcpServers": {
    "bulut-map": {
      "command": "node",
      "args": ["/Users/macbookpro/Desktop/bulut/mcp/index.mjs"],
      "env": {
        "BULUT_API_URL": "https://bulut-kappa.vercel.app",
        "BULUT_API_KEY": "ВАШ_BULUT_API_KEY"
      }
    }
  }
}
```

Перезапусти Claude Desktop → в списке инструментов появится «bulut-map».

## Подключение к Claude Code

```bash
claude mcp add bulut-map \
  --env BULUT_API_URL=https://bulut-kappa.vercel.app \
  --env BULUT_API_KEY=ВАШ_BULUT_API_KEY \
  -- node /Users/macbookpro/Desktop/bulut/mcp/index.mjs
```

## Как пользоваться

В Claude просто напиши, например:

> Создай в Bulut флоу авторизации: экран телефона → ввод OTP-кода → проверка
> (если верно — на главный экран, если нет — снова ввод кода).

Claude вызовет `create_flow` и пришлёт ссылку вида `…/maps/<id>` — открывай в Bulut.

## Примечание про ChatGPT

MCP понимает Claude. Для **ChatGPT** тот же API (`/api/maps`) подключается как
**Custom GPT → Action** по OpenAPI. Схему для Action могу сгенерировать отдельно.
