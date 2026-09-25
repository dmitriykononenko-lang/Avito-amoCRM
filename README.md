# Avito ↔ amoCRM — интеграция ko:agency

Собственный тиражируемый виджет ko:agency: переписка с покупателями Avito в интерфейсе чатов amoCRM, автоматические контакты и сделки по объявлениям, звонки Avito с подменных номеров с записью в карточке.

> Статус: **этап 0–1 (каркас)**. Бизнес-обработчики — заглушки, см. [docs/PLAN.md](docs/PLAN.md).
> ТЗ и архитектура: [docs/TZ.md](docs/TZ.md) · живой документ — Claude Docs «Avito ↔ amoCRM ↔ телефония: ТЗ и архитектура».

## Как устроено

```
Avito Messenger ──webhook──▶ API ──▶ inbox + jobs (PostgreSQL) ──▶ worker ──▶ amoCRM REST v4 / Chat API (amojo)
Avito calltracking ◀──опрос── worker                                   └──▶ Avito (ответы, фото)
amoCRM Chat API ──хук ответа менеджера──▶ API
```

- `api` — принимает вебхуки: проверка подлинности → запись в `inbox` с дедупликацией → задача в `jobs` → 200.
- `worker` — выполняет задачи из очереди PostgreSQL (`FOR UPDATE SKIP LOCKED`), с сериализацией по чату, повторами и «мёртвой» очередью.
- Токены и секреты в БД — только в зашифрованном виде (AES-256-GCM, `MASTER_KEY` из окружения).
- Логи без ПДн: тексты, телефоны, токены вырезаются (`src/lib/mask.ts`).

## Структура

| Путь | Что |
| --- | --- |
| `src/http/server.ts` | Вебхуки Avito и amojo, `/health` |
| `src/queue/queue.ts` | Очередь задач на PostgreSQL |
| `src/worker/handlers.ts` | Обработчики по этапам (пока заглушки) |
| `src/domain/rules.ts` | Бизнес-правила: сделка новая/существующая, ответственный, анти-эхо |
| `src/amojo/` | Chat API: подпись HMAC-SHA1, клиент |
| `src/amocrm/client.ts` | REST v4 с лимитером 6 rps и refresh по 401 |
| `src/avito/client.ts` | Avito API — **методы помечены VERIFY до сверки со swagger** |
| `src/crypto/secretBox.ts` | Шифрование токенов |
| `migrations/` | Схема БД |
| `widget/` | Виджет amoCRM (публичная сборка) |
| `docs/` | ТЗ, план, чек-лист этапа 0, заявка на канал, runbook |

## Локальный запуск

```bash
cp .env.example .env              # заполнить; MASTER_KEY: openssl rand -base64 32
npm ci
npm run migrate
npm run dev                       # api на :8080
npx tsx src/main.ts worker        # воркер
```

## Тесты

```bash
npm test                                              # юнит-тесты
TEST_DATABASE_URL=postgres://…/avito_test npm test    # + интеграционные (БД очищается!)
npm run widget:package                                # проверка и сборка zip виджета
```

## Продакшн (VPS в РФ)

```bash
docker compose up -d --build      # db, migrate, api, worker
```
Наружу `api` публикуется через reverse proxy с HTTPS (например, `avito.koagency.me`). Данные и файлы записей — только на этом VPS (152-ФЗ).

## Безопасность

- `.env`, токены, ключи — никогда в git и в переписке.
- Клиенты подключают amoCRM и Avito через OAuth-кнопки в виджете; пароли и ключи клиентов нам не передаются.
