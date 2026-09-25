/**
 * Ограничитель частоты по ключу (token bucket).
 * amoCRM: 7 запросов/с на интеграцию, 50/с на аккаунт; превышение → 429, повторно → 403-блок.
 * Держим 6/с с запасом.
 */
export class RateLimiter {
  private buckets = new Map<string, { tokens: number; updated: number }>();

  constructor(
    private readonly ratePerSec: number,
    private readonly now: () => number = () => Date.now(),
    private readonly sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
  ) {}

  /** Возвращает задержку в мс до получения токена (0 — можно сразу) и резервирует токен. */
  reserve(key: string): number {
    const t = this.now();
    const b = this.buckets.get(key) ?? { tokens: this.ratePerSec, updated: t };
    b.tokens = Math.min(this.ratePerSec, b.tokens + ((t - b.updated) / 1000) * this.ratePerSec);
    b.updated = t;
    b.tokens -= 1;
    this.buckets.set(key, b);
    return b.tokens >= 0 ? 0 : Math.ceil((-b.tokens / this.ratePerSec) * 1000);
  }

  async acquire(key: string): Promise<void> {
    const wait = this.reserve(key);
    if (wait > 0) await this.sleep(wait);
  }
}
