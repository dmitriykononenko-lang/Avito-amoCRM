/** Классификация ошибок и повторы с экспоненциальной задержкой. */

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly service: string,
    message: string,
    public readonly retryAfterSec?: number,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

/** 429, 5xx, сетевые ошибки — временные; 401 обрабатывается отдельно (refresh токена). */
export function isRetryable(err: unknown): boolean {
  if (err instanceof HttpError) return err.status === 429 || err.status >= 500;
  return err instanceof TypeError || (err as { code?: string })?.code === 'ECONNRESET';
}

/** Задержка для попытки n (1..): 5с, 10с, 20с … максимум 30 мин; учитывает Retry-After. */
export function backoffMs(attempt: number, retryAfterSec?: number): number {
  if (retryAfterSec && retryAfterSec > 0) return retryAfterSec * 1000;
  return Math.min(5_000 * 2 ** (attempt - 1), 30 * 60_000);
}

export const MAX_ATTEMPTS = 10;

export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: { attempts?: number; sleep?: (ms: number) => Promise<void>; baseMs?: number } = {},
): Promise<T> {
  const attempts = opts.attempts ?? 3;
  const sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  let lastErr: unknown;
  for (let i = 1; i <= attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (!isRetryable(err) || i === attempts) throw err;
      const ra = err instanceof HttpError ? err.retryAfterSec : undefined;
      await sleep(ra ? ra * 1000 : (opts.baseMs ?? 500) * 2 ** (i - 1));
    }
  }
  throw lastErr;
}
