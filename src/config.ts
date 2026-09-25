import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(8080),
  PUBLIC_BASE_URL: z.string().url(),
  LOG_LEVEL: z.string().default('info'),
  DATABASE_URL: z.string().min(1),
  MASTER_KEY: z.string().min(1, 'MASTER_KEY обязателен: openssl rand -base64 32'),
  AMO_CLIENT_ID: z.string().default(''),
  AMO_CLIENT_SECRET: z.string().default(''),
  AMO_REDIRECT_URI: z.string().default(''),
  AMOJO_BASE_URL: z.string().url().default('https://amojo.amocrm.ru'),
  AMOJO_CHANNEL_ID: z.string().default(''),
  AMOJO_CHANNEL_SECRET: z.string().default(''),
  AMOJO_CHANNEL_CODE: z.string().default(''),
  AVITO_BASE_URL: z.string().url().default('https://api.avito.ru'),
  AVITO_CLIENT_ID: z.string().default(''),
  AVITO_CLIENT_SECRET: z.string().default(''),
  AVITO_REDIRECT_URI: z.string().default(''),
  TELEGRAM_BOT_TOKEN: z.string().default(''),
  TELEGRAM_ALERT_CHAT_ID: z.string().default(''),
  STORAGE_DIR: z.string().default('./storage'),
  FILE_TTL_DAYS: z.coerce.number().default(90),
  INBOX_TTL_DAYS: z.coerce.number().default(14),
});

export type Config = z.infer<typeof schema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    // Печатаем только имена полей, не значения
    const fields = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Некорректная конфигурация: ${fields}`);
  }
  return parsed.data;
}
