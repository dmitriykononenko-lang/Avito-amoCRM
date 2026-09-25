# Runbook: диагностика сбоев

| Симптом | Где смотреть | Что делать |
| --- | --- | --- |
| Сообщения Avito не приходят в amoCRM | `SELECT source, count(*), max(received_at) FROM inbox GROUP BY 1;` | Нет новых записей → проверить подписку вебхука Avito и `last_event_at` аккаунта; есть записи → смотреть `jobs` |
| Задачи копятся | `SELECT kind, status, count(*) FROM jobs GROUP BY 1,2;` | Много `queued` с большим `attempts` → внешний API недоступен или 429; `dead` → `last_error`, `error_log` |
| 403 от amoCRM | `error_log` с code=403 | Превышение лимита → снизить частоту; подписка аккаунта истекла (402) → сообщить клиенту |
| «Нужна переавторизация» | `tenants.status`, `avito_accounts.status` | Клиент повторно жмёт «Подключить» в виджете |
| Ответ менеджера не дошёл | `message_map` со статусом failed; сверка истории | Хук amojo не повторяется — сообщить менеджеру, повторить вручную |
| Дубли сделок | `chat_links`, `buyers` по чату | Проверить lock_key задач и уникальные индексы |

Повтор мёртвой задачи: `UPDATE jobs SET status='queued', run_at=now(), attempts=0 WHERE id = …;`
