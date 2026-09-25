# ТЗ: интеграция Avito ↔ amoCRM ↔ телефония (v1)

Актуальная расширенная версия — документ Claude Docs «Avito ↔ amoCRM ↔ телефония: ТЗ и архитектура» (25.09.2026). Здесь — рабочая выжимка для разработки.

## 1. Требования

| Область | Решение |
| --- | --- |
| Продукт | Свой виджет ko:agency, мультиаккаунт: N клиентов × M аккаунтов Avito × 1 amoCRM на клиента |
| События | Сообщения чатов Avito, звонки Avito (подменные номера) |
| Телефония | (а) звонки Avito с записью; (б) IP-телефония — виджет провайдера; (в) склейка чата и звонка по телефону |
| Ответы из amoCRM | Да, из интерфейса чатов (Chat API) |
| Вложения | Входящие: фото, голосовые; исходящие: фото; файлы — ссылкой или ошибка доставки |
| История до подключения | v2 |
| Воронка/этап | Выбираются в виджете для каждого аккаунта Avito |
| Ответственный | По аккаунту Avito, переопределение по объявлению |
| Сделка | Открытая по объявлению → в неё; иначе новая у того же контакта |
| Контакт | Ключ — Avito user_id; телефон — из звонка/вручную |
| Поля | Название, цена, ID и ссылка объявления, имя и профиль покупателя, источник, системные UTM |
| Хостинг | VPS ko:agency в РФ |
| Алерты | Telegram ko:agency + статус в виджете |

## 2. Реализуемость (кратко)

- **amoCRM Chat API** — канал регистрирует техподдержка (1–3 раб. дня); подпись HMAC-SHA1; msgid — идемпотентность; хук ответа менеджера не повторяется. Ссылки: [chat-start](https://www.amocrm.ru/developers/content/chats/chat-start), [reference](https://www.amocrm.ru/developers/content/chats/chat-api-reference), [webhooks](https://www.amocrm.ru/developers/content/chats/chat-webhooks).
- **Привязка чата к контакту** — `POST /api/v4/contacts/chats` (чат → 1 контакт). [contacts-api](https://www.amocrm.ru/developers/content/crm_platform/contacts-api)
- **Воронка для чатов** — Sources API, источник на аккаунт Avito. [sources-api](https://www.amocrm.ru/developers/content/crm_platform/sources-api)
- **Звонки** — `POST /api/v4/calls` (ищет контакт по последним 10 цифрам, без контакта не добавляется) → иначе `POST /api/v4/leads/unsorted/sip`. [calls-api](https://www.amocrm.ru/developers/content/crm_platform/calls-api), [unsorted-api](https://www.amocrm.ru/developers/content/crm_platform/unsorted-api)
- **Лимиты amoCRM** — 7 rps на интеграцию, 50 rps на аккаунт; 429 → повтор, повторно → 403. [recommendations](https://www.amocrm.ru/developers/content/api/recommendations)
- **Avito Messenger** — webhook v3, чаты v2, сообщения v3, отправка текста/фото v1, голосовые `getVoiceFiles`; отправки файлов нет. Доступ — профильные аккаунты с «Максимальной подпиской» (по данным интеграторов). **Все пути — VERIFY.**
- **Avito calltracking** — `getCalls`, `getCallById`, `getRecordByCallId`; вебхука нет → опрос. Наличие номера покупателя и item_id — VERIFY.

## 3. Правила

1. Сообщение в чат с `chat_link` → просто передаём.
2. Нет `chat_link` → ищем `buyer`; нет → контакт (имя, профиль, Avito ID).
3. `decideLead` → attach / create (воронка, этап, ответственный из настроек).
4. Создаём чат в Chat API → привязываем к контакту → отправляем сообщение (без лишнего неразобранного).
5. Все сделки закрыты → новая сделка, чат тот же.
6. Звонок: контакт с телефоном есть → `/calls`; нет → неразобранное SIP в воронке аккаунта.

## 4. Надёжность и безопасность

- inbox с уникальным ключом → повторы вебхуков отбрасываются на уровне БД.
- Очередь с сериализацией по чату, повторами 5 с → 30 мин (до 10), мёртвая очередь + алерт.
- Анти-эхо: сообщение продавца из вебхука Avito, уже есть в `message_map` → пропуск.
- Сверка Avito раз в 10 мин; сверка истории amoCRM для выявления потерянных ответов (не отправляем автоматически с опозданием).
- Токены — AES-256-GCM; refresh заранее и по 401; сбой → «нужна переавторизация» + алерт.
- Логи без ПДн; тела вебхуков хранятся 14 дней; файлы — 90 дней.

## 5. Соответствие полей

| Avito | amoCRM |
| --- | --- |
| Название объявления | Название сделки «Avito: …» + поле «Объявление Avito» |
| Цена | Бюджет сделки |
| ID объявления | Поле «Avito item ID» |
| Ссылка на объявление | Поле url |
| Аккаунт продавца | Поле-список + источник |
| Имя покупателя | Имя контакта |
| ID покупателя | Поле «Avito user ID» |
| Профиль покупателя | Поле url |
| Телефон из звонка | PHONE контакта |
| Источник/аналитика | utm_source=avito, utm_medium=chat/call, utm_campaign=user_id, utm_content=item_id |
| Текст / фото / голос / локация | Chat API: text / picture / voice|audio / location |
| Звонок | /calls: direction, duration, uniq=call_id, link=запись на VPS, call_status 4/6 |

## 6. Критерии приёмки

См. [PLAN.md → Приёмка](PLAN.md#приёмка).
