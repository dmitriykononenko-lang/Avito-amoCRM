-- Схема v1. Все секреты — только в зашифрованном виде (SecretBox, AES-256-GCM).

CREATE TABLE IF NOT EXISTS schema_migrations (
  name text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);

-- Аккаунт amoCRM клиента = tenant
CREATE TABLE tenants (
  id                 bigserial PRIMARY KEY,
  amo_account_id     bigint UNIQUE NOT NULL,
  amo_subdomain      text NOT NULL,
  amo_base_domain    text NOT NULL DEFAULT 'amocrm.ru',
  amojo_id           text,
  amojo_scope_id     text UNIQUE,
  amo_access_enc     text,
  amo_refresh_enc    text,
  amo_expires_at     timestamptz,
  status             text NOT NULL DEFAULT 'active', -- active | reauth_required | disabled
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

-- Аккаунт Avito (компания) внутри tenant
CREATE TABLE avito_accounts (
  id                   bigserial PRIMARY KEY,
  tenant_id            bigint NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  avito_user_id        bigint NOT NULL,
  title                text,
  access_enc           text,
  refresh_enc          text,
  expires_at           timestamptz,
  auth_mode            text NOT NULL DEFAULT 'authorization_code', -- | client_credentials
  client_id_enc        text,  -- только для client_credentials (ключи клиента)
  client_secret_enc    text,
  webhook_token        text UNIQUE NOT NULL, -- секретная часть URL вебхука
  amo_source_id        bigint,
  pipeline_id          bigint,
  status_id            bigint,
  responsible_user_id  bigint,
  file_reply_mode      text NOT NULL DEFAULT 'link', -- link | reject
  calls_enabled        boolean NOT NULL DEFAULT true,
  calls_cursor         timestamptz,
  chats_cursor         timestamptz,
  status               text NOT NULL DEFAULT 'active',
  last_event_at        timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, avito_user_id)
);

-- Переопределение ответственного по объявлению
CREATE TABLE item_routes (
  avito_account_id    bigint NOT NULL REFERENCES avito_accounts(id) ON DELETE CASCADE,
  item_id             bigint NOT NULL,
  responsible_user_id bigint NOT NULL,
  PRIMARY KEY (avito_account_id, item_id)
);

-- Покупатель Avito ↔ контакт amoCRM
CREATE TABLE buyers (
  tenant_id        bigint NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  avito_buyer_id   bigint NOT NULL,
  amo_contact_id   bigint NOT NULL,
  PRIMARY KEY (tenant_id, avito_buyer_id)
);

-- Чат Avito ↔ чат amoCRM
CREATE TABLE chat_links (
  id                 bigserial PRIMARY KEY,
  avito_account_id   bigint NOT NULL REFERENCES avito_accounts(id) ON DELETE CASCADE,
  avito_chat_id      text NOT NULL,
  avito_buyer_id     bigint,
  item_id            bigint,
  amo_conversation_id text NOT NULL, -- = avito_chat_id с префиксом аккаунта
  amo_chat_id        text,
  amo_contact_id     bigint,
  amo_lead_id        bigint,
  created_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (avito_account_id, avito_chat_id)
);

-- Соответствие сообщений: защита от дублей и эха
CREATE TABLE message_map (
  chat_link_id     bigint NOT NULL REFERENCES chat_links(id) ON DELETE CASCADE,
  avito_message_id text,
  amo_msgid        text,
  direction        text NOT NULL, -- in (покупатель) | out_crm (ответ из amoCRM) | out_avito (ответ из приложения Avito)
  status           text NOT NULL DEFAULT 'pending', -- pending | delivered | failed
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX message_map_avito ON message_map (chat_link_id, avito_message_id) WHERE avito_message_id IS NOT NULL;
CREATE UNIQUE INDEX message_map_amo   ON message_map (chat_link_id, amo_msgid)        WHERE amo_msgid IS NOT NULL;

-- Звонки Avito
CREATE TABLE call_map (
  avito_account_id bigint NOT NULL REFERENCES avito_accounts(id) ON DELETE CASCADE,
  avito_call_id    text NOT NULL,
  amo_entity       text,          -- call | unsorted
  amo_ref          text,
  record_path      text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (avito_account_id, avito_call_id)
);

-- Входящие события (idempotency + разбор сбоев). Тела хранятся INBOX_TTL_DAYS.
CREATE TABLE inbox (
  id           bigserial PRIMARY KEY,
  source       text NOT NULL,  -- avito | amojo | poll_calls | reconcile
  dedup_key    text NOT NULL,
  tenant_id    bigint,
  payload      jsonb NOT NULL,
  received_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source, dedup_key)
);

-- Очередь задач (SELECT … FOR UPDATE SKIP LOCKED), без внешнего брокера
CREATE TABLE jobs (
  id            bigserial PRIMARY KEY,
  kind          text NOT NULL,
  lock_key      text,           -- сериализация по чату: одновременно одна задача на ключ
  payload       jsonb NOT NULL,
  status        text NOT NULL DEFAULT 'queued', -- queued | running | done | dead
  attempts      int  NOT NULL DEFAULT 0,
  run_at        timestamptz NOT NULL DEFAULT now(),
  last_error    text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX jobs_ready ON jobs (run_at) WHERE status = 'queued';
CREATE INDEX jobs_lock  ON jobs (lock_key) WHERE status = 'running';

-- Журнал ошибок (без ПДн)
CREATE TABLE error_log (
  id          bigserial PRIMARY KEY,
  tenant_id   bigint,
  job_id      bigint,
  kind        text NOT NULL,
  code        text,
  detail      text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
