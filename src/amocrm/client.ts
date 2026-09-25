import { requestJson, type FetchLike } from '../lib/http.js';
import { HttpError } from '../lib/retry.js';
import { RateLimiter } from '../lib/rateLimiter.js';

/**
 * REST API v4 amoCRM. Лимиты: 7 запросов/с на интеграцию, 50/с на аккаунт
 * (https://www.amocrm.ru/developers/content/api/recommendations). Держим 6/с на аккаунт.
 * 401 → один refresh токена и повтор; 429/5xx → повтор через очередь задач.
 */

export interface AmoTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
}

export interface AmoTokenStore {
  get(accountId: number): Promise<AmoTokens>;
  refresh(accountId: number): Promise<AmoTokens>;
}

const limiter = new RateLimiter(6);

export class AmoCrmClient {
  constructor(
    private readonly opts: { accountId: number; baseUrl: string; tokens: AmoTokenStore; fetch?: FetchLike },
  ) {}

  async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    for (let attempt = 0; attempt < 2; attempt++) {
      await limiter.acquire(String(this.opts.accountId));
      const t = attempt === 0 ? await this.opts.tokens.get(this.opts.accountId) : await this.opts.tokens.refresh(this.opts.accountId);
      try {
        return await requestJson<T>(this.opts.fetch ?? fetch, 'amocrm', this.opts.baseUrl + path, {
          method,
          headers: { Authorization: `Bearer ${t.accessToken}`, 'Content-Type': 'application/json' },
          body: body === undefined ? undefined : JSON.stringify(body),
        });
      } catch (err) {
        if (err instanceof HttpError && err.status === 401 && attempt === 0) continue;
        throw err;
      }
    }
    throw new HttpError(401, 'amocrm', 'Токен не обновился');
  }

  account() {
    return this.request<{ id: number; subdomain: string; amojo_id: string }>('GET', '/api/v4/account?with=amojo_id');
  }

  /** Привязка чата к контакту: https://www.amocrm.ru/developers/content/crm_platform/contacts-api */
  linkChatToContact(chatId: string, contactId: number) {
    return this.request('POST', '/api/v4/contacts/chats', [{ chat_id: chatId, contact_id: contactId }]);
  }

  /** Звонки: https://www.amocrm.ru/developers/content/crm_platform/calls-api */
  addCalls(calls: Array<Record<string, unknown>>) {
    return this.request('POST', '/api/v4/calls', calls);
  }

  /** Неразобранное из звонка: https://www.amocrm.ru/developers/content/crm_platform/unsorted-api */
  addUnsortedSip(items: Array<Record<string, unknown>>) {
    return this.request('POST', '/api/v4/leads/unsorted/sip', items);
  }

  /** Источники под каждый аккаунт Avito: https://www.amocrm.ru/developers/content/crm_platform/sources-api */
  createSources(sources: Array<{ name: string; external_id: string; pipeline_id: number }>) {
    return this.request('POST', '/api/v4/sources', sources);
  }
}
