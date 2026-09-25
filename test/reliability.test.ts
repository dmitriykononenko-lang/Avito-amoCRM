import { describe, expect, it, vi } from 'vitest';
import { backoffMs, HttpError, isRetryable, withRetry } from '../src/lib/retry.js';
import { RateLimiter } from '../src/lib/rateLimiter.js';
import { maskPhone, maskToken } from '../src/lib/mask.js';

describe('Повторы', () => {
  it('классифицирует ошибки', () => {
    expect(isRetryable(new HttpError(429, 'amocrm', ''))).toBe(true);
    expect(isRetryable(new HttpError(503, 'avito', ''))).toBe(true);
    expect(isRetryable(new HttpError(400, 'avito', ''))).toBe(false);
    expect(isRetryable(new HttpError(403, 'amocrm', ''))).toBe(false);
  });
  it('экспоненциальная задержка с потолком 30 минут и учётом Retry-After', () => {
    expect(backoffMs(1)).toBe(5_000);
    expect(backoffMs(3)).toBe(20_000);
    expect(backoffMs(20)).toBe(30 * 60_000);
    expect(backoffMs(1, 7)).toBe(7_000);
  });
  it('повторяет временные ошибки и сдаётся на постоянных', async () => {
    const sleep = vi.fn(async () => undefined);
    let n = 0;
    const ok = await withRetry(async () => {
      if (++n < 3) throw new HttpError(502, 'x', '');
      return 'ok';
    }, { sleep });
    expect(ok).toBe('ok');
    expect(sleep).toHaveBeenCalledTimes(2);
    await expect(withRetry(async () => { throw new HttpError(400, 'x', 'bad'); }, { sleep })).rejects.toThrow('bad');
  });
});

describe('Ограничитель частоты amoCRM', () => {
  it('пропускает 6 запросов сразу, 7-й ждёт', () => {
    let t = 0;
    const rl = new RateLimiter(6, () => t);
    for (let i = 0; i < 6; i++) expect(rl.reserve('acc')).toBe(0);
    expect(rl.reserve('acc')).toBeGreaterThan(0);
    expect(rl.reserve('other')).toBe(0);
    t += 1000;
    expect(rl.reserve('acc')).toBe(0);
  });
});

describe('Маскирование', () => {
  it('телефон и токен не попадают в лог целиком', () => {
    expect(maskPhone('+7 (999) 123-45-67')).toBe('+7***4567');
    expect(maskToken('abcdefghijklmnop')).toBe('abcd…op');
  });
});
