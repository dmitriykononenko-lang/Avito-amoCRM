import { requestJson, type FetchLike } from '../lib/http.js';
import { HttpError } from '../lib/retry.js';

/**
 * Клиент Avito API.
 *
 * ⚠️ ЭТАП 0: пути и поля сверены по неофициальной карте операций
 * (https://18studio.github.io/avito_python_api/reference/operations/), т.к. developers.avito.ru
 * был недоступен при проектировании. ПЕРЕД РАЗРАБОТКОЙ ЭТАПА 2 сверить каждый метод со swagger
 * в https://www.avito.ru/developers/api-catalog и снять пометки VERIFY.
 */

export interface AvitoToken {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  token_type: string;
}

export class AvitoClient {
  constructor(private readonly opts: { baseUrl: string; fetch?: FetchLike }) {}

  private get f() {
    return this.opts.fetch ?? fetch;
  }

  /** VERIFY: POST /token, grant_type = client_credentials | authorization_code | refresh_token */
  token(params: Record<string, string>) {
    return requestJson<AvitoToken>(this.f, 'avito', `${this.opts.baseUrl}/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(params).toString(),
    });
  }

  private authed<T>(token: string, method: string, path: string, body?: unknown) {
    return requestJson<T>(this.f, 'avito', this.opts.baseUrl + path, {
      method,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }

  /** VERIFY: GET /core/v1/accounts/self */
  self(token: string) {
    return this.authed<{ id: number; name?: string }>(token, 'GET', '/core/v1/accounts/self');
  }

  /** VERIFY: POST /messenger/v3/webhook { url } */
  subscribeWebhook(token: string, url: string) {
    return this.authed<{ ok: boolean }>(token, 'POST', '/messenger/v3/webhook', { url });
  }

  /** VERIFY: POST /messenger/v1/subscriptions */
  subscriptions(token: string) {
    return this.authed<{ subscriptions: Array<{ url: string; version: string }> }>(token, 'POST', '/messenger/v1/subscriptions');
  }

  /** VERIFY: GET /messenger/v2/accounts/{user_id}/chats/{chat_id} */
  chat(token: string, userId: number, chatId: string) {
    return this.authed<unknown>(token, 'GET', `/messenger/v2/accounts/${userId}/chats/${encodeURIComponent(chatId)}`);
  }

  /** VERIFY: GET /messenger/v2/accounts/{user_id}/chats (для сверки пропущенных вебхуков) */
  chats(token: string, userId: number, query: Record<string, string> = {}) {
    const qs = new URLSearchParams(query).toString();
    return this.authed<unknown>(token, 'GET', `/messenger/v2/accounts/${userId}/chats${qs ? `?${qs}` : ''}`);
  }

  /** VERIFY: GET /messenger/v3/accounts/{user_id}/chats/{chat_id}/messages */
  messages(token: string, userId: number, chatId: string) {
    return this.authed<unknown>(token, 'GET', `/messenger/v3/accounts/${userId}/chats/${encodeURIComponent(chatId)}/messages`);
  }

  /** VERIFY: POST /messenger/v1/accounts/{user_id}/chats/{chat_id}/messages */
  sendText(token: string, userId: number, chatId: string, text: string) {
    return this.authed<{ id: string }>(token, 'POST', `/messenger/v1/accounts/${userId}/chats/${encodeURIComponent(chatId)}/messages`, {
      message: { text },
      type: 'text',
    });
  }

  /** VERIFY: POST /messenger/v1/accounts/{user_id}/chats/{chat_id}/messages/image { image_id } */
  sendImage(token: string, userId: number, chatId: string, imageId: string) {
    return this.authed<{ id: string }>(token, 'POST', `/messenger/v1/accounts/${userId}/chats/${encodeURIComponent(chatId)}/messages/image`, {
      image_id: imageId,
    });
  }

  /** VERIFY: POST /messenger/v1/accounts/{user_id}/uploadImages (multipart) */
  async uploadImage(token: string, userId: number, file: Blob, fileName: string) {
    const form = new FormData();
    form.append('uploadfile[]', file, fileName);
    return requestJson<Record<string, unknown>>(this.f, 'avito', `${this.opts.baseUrl}/messenger/v1/accounts/${userId}/uploadImages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
  }

  /** VERIFY: GET /messenger/v1/accounts/{user_id}/getVoiceFiles?voice_ids=… */
  voiceFiles(token: string, userId: number, voiceIds: string[]) {
    const qs = voiceIds.map((v) => `voice_ids=${encodeURIComponent(v)}`).join('&');
    return this.authed<unknown>(token, 'GET', `/messenger/v1/accounts/${userId}/getVoiceFiles?${qs}`);
  }

  /** VERIFY: POST /calltracking/v1/getCalls — какие поля: номер покупателя? item_id? */
  calls(token: string, body: Record<string, unknown>) {
    return this.authed<unknown>(token, 'POST', '/calltracking/v1/getCalls', body);
  }

  /** VERIFY: GET /calltracking/v1/getRecordByCallId?callId=… → audio/mpeg */
  async callRecord(token: string, callId: string): Promise<ArrayBuffer> {
    const res = await this.f(`${this.opts.baseUrl}/calltracking/v1/getRecordByCallId?callId=${encodeURIComponent(callId)}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) throw new HttpError(res.status, 'avito', `record → ${res.status}`);
    return res.arrayBuffer();
  }

  /** VERIFY: GET /items/v2/{id} (или актуальный метод информации об объявлении) */
  item(token: string, itemId: number) {
    return this.authed<unknown>(token, 'GET', `/items/v2/${itemId}`);
  }
}
