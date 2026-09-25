import type { Pool } from '../db/pool.js';
import { backoffMs, isRetryable, MAX_ATTEMPTS } from '../lib/retry.js';
import type { Logger } from '../lib/logger.js';

export interface Job {
  id: number;
  kind: string;
  lock_key: string | null;
  payload: unknown;
  attempts: number;
}

export type Handler = (job: Job) => Promise<void>;

export async function enqueue(
  db: Pool,
  kind: string,
  payload: unknown,
  opts: { lockKey?: string; runAt?: Date } = {},
): Promise<void> {
  await db.query('INSERT INTO jobs(kind, lock_key, payload, run_at) VALUES ($1, $2, $3, $4)', [
    kind,
    opts.lockKey ?? null,
    JSON.stringify(payload),
    opts.runAt ?? new Date(),
  ]);
}

/**
 * Берёт одну готовую задачу. Задачи с одинаковым lock_key не выполняются параллельно
 * (два быстрых сообщения в одном чате не создадут две сделки).
 */
export async function claim(db: Pool): Promise<Job | null> {
  const res = await db.query<Job>(
    `UPDATE jobs SET status = 'running', attempts = attempts + 1, updated_at = now()
     WHERE id = (
       SELECT j.id FROM jobs j
       WHERE j.status = 'queued' AND j.run_at <= now()
         AND (j.lock_key IS NULL OR NOT EXISTS (
           SELECT 1 FROM jobs r WHERE r.status = 'running' AND r.lock_key = j.lock_key))
       ORDER BY j.run_at, j.id
       FOR UPDATE SKIP LOCKED
       LIMIT 1)
     RETURNING id, kind, lock_key, payload, attempts`,
  );
  return res.rows[0] ?? null;
}

export async function runOnce(db: Pool, handlers: Record<string, Handler>, log: Logger): Promise<boolean> {
  const job = await claim(db);
  if (!job) return false;
  const handler = handlers[job.kind];
  try {
    if (!handler) throw new Error(`Нет обработчика для ${job.kind}`);
    await handler(job);
    await db.query(`UPDATE jobs SET status = 'done', updated_at = now() WHERE id = $1`, [job.id]);
  } catch (err) {
    const retry = isRetryable(err) && job.attempts < MAX_ATTEMPTS;
    const code = (err as { status?: number }).status?.toString() ?? (err as Error).name;
    await db.query(
      `UPDATE jobs SET status = $2, run_at = now() + ($3 || ' milliseconds')::interval,
        last_error = $4, updated_at = now() WHERE id = $1`,
      [job.id, retry ? 'queued' : 'dead', String(backoffMs(job.attempts)), `${code}: ${(err as Error).message}`.slice(0, 500)],
    );
    await db.query('INSERT INTO error_log(job_id, kind, code, detail) VALUES ($1, $2, $3, $4)', [
      job.id,
      job.kind,
      code,
      (err as Error).message.slice(0, 500),
    ]);
    log.warn({ jobId: job.id, kind: job.kind, code, retry }, 'job failed');
  }
  return true;
}
