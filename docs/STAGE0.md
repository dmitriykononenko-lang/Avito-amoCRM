# Этап 0 — чек-лист подготовки

## A. amoCRM
- [ ] Создать интеграцию в кабинете разработчика amoCRM (публичная, `oauth`), redirect URI `https://<домен>/oauth/amocrm/callback`; client_id/secret → `.env` сервера
- [ ] Отправить заявку на регистрацию канала Chat API — текст в [AMOCRM_CHANNEL_REQUEST.md](AMOCRM_CHANNEL_REQUEST.md)
- [ ] Получить channel_id, secret, код канала → `.env`
- [ ] Тестовый аккаунт amoCRM (техаккаунт партнёра) добавлен в список доступа канала

## B. Avito
- [ ] Зарегистрировать приложение ko:agency; выяснить, доступен ли authorization_code для чужих аккаунтов и какие scopes нужны (messenger, calltracking, items)
- [ ] Если authorization_code недоступен — план Б: клиент вводит свои client_id/secret в виджете (`auth_mode = client_credentials`)
- [ ] Пилотный аккаунт Avito с доступом к Messenger API и коллтрекингом

## C. Сверка swagger Avito (снять пометки VERIFY в `src/avito/client.ts`)
- [ ] `POST /token` — grant types, срок жизни, refresh
- [ ] Webhook v3: формат события, ID события для дедупликации, подпись (есть ли), повторы доставки, таймаут ответа
- [ ] Типы сообщений v3 (text, image, voice, link, item, location, call, file?) и поля author_id, chat_id, created
- [ ] Отправка текста/фото: тело запроса, ответ с ID сообщения
- [ ] Лимиты частоты Messenger API
- [ ] Формат голосовых из `getVoiceFiles`
- [ ] Calltracking: поля звонка — номер покупателя, виртуальный номер, item_id, длительности; фильтры по времени; срок хранения записи
- [ ] Информация об объявлении: метод, поля (название, цена, URL)

## D. Прототип (0,5 дня)
- [ ] Контакт с двумя открытыми сделками + чат через Chat API: где отображается чат, как сменить «активную» сделку
- [ ] Импорт исходящего сообщения (продавец ответил из Avito) — как выглядит в amoCRM

## E. Инфраструктура
- [ ] VPS в РФ, поддомен, HTTPS (Caddy/nginx), docker compose, бэкапы БД
- [ ] Telegram-бот для алертов
