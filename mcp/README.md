# Bulut MAP — MCP-сервер для Claude

Позволяет **Claude** создавать флоу-карты прямо в Bulut MAP:
скажи *«создай в Bulut флоу регистрации по OTP»* — Claude сам придумает узлы и
связи, вызовет инструмент, а сервер разложит их и вернёт ссылку на карту.

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
