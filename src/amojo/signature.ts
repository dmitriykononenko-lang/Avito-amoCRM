import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Подпись запросов к amoCRM Chat API (amojo).
 * Документация: https://www.amocrm.ru/developers/content/chats/chat-start
 *
 * Исходящий запрос (мы → amojo):
 *   X-Signature = HMAC-SHA1(secret, METHOD\nContent-MD5\nContent-Type\nDate\nPath), lowercase hex
 *   Content-MD5 = md5(body) lowercase hex; Date в RFC 2822, окно валидности 15 минут.
 * Входящий хук (amojo → мы): X-Signature = HMAC-SHA1(secret, сырое тело).
 * Подписываем и отправляем ОДНИ И ТЕ ЖЕ байты тела.
 */

export interface SignedHeaders {
  Date: string;
  'Content-Type': string;
  'Content-MD5': string;
  'X-Signature': string;
}

export function md5Hex(body: Buffer | string): string {
  return createHash('md5').update(body).digest('hex');
}

export function signOutgoing(params: {
  method: string;
  path: string;
  body: Buffer | string;
  secret: string;
  date?: Date;
  contentType?: string;
}): SignedHeaders {
  const contentType = params.contentType ?? 'application/json';
  const date = (params.date ?? new Date()).toUTCString();
  const contentMd5 = md5Hex(params.body);
  const stringToSign = [params.method.toUpperCase(), contentMd5, contentType, date, params.path].join('\n');
  const signature = createHmac('sha1', params.secret).update(stringToSign).digest('hex');
  return { Date: date, 'Content-Type': contentType, 'Content-MD5': contentMd5, 'X-Signature': signature };
}

export function verifyIncoming(rawBody: Buffer | string, signature: string | undefined, secret: string): boolean {
  if (!signature) return false;
  const expected = createHmac('sha1', secret).update(rawBody).digest('hex');
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(signature.toLowerCase(), 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}
