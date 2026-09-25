/** Маскирование ПДн и секретов перед логированием. */

export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 4) return '***';
  return `+${digits.slice(0, 1)}***${digits.slice(-4)}`;
}

export function maskToken(token: string): string {
  if (token.length <= 8) return '***';
  return `${token.slice(0, 4)}…${token.slice(-2)}`;
}

/** Пути полей, которые pino вырезает из логов. */
export const LOG_REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers["x-signature"]',
  '*.access_token',
  '*.refresh_token',
  '*.client_secret',
  '*.password',
  '*.text',
  '*.phone',
  '*.sender',
  '*.receiver',
  '*.buyer_phone',
  'payload',
  'body',
];
