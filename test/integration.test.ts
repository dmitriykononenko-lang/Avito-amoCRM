import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { createHmac } from 'node:crypto';
import { createPool, type Pool } from '../src/db/pool.js';
import { buildServer } from '../src/http/server.js';
import { claim, enqueue, runOnce } from '../src/queue/queue.js';
import { createLogger } from '../src/lib/logger.js';
import { HttpError } from '../src/lib/retry.js';

/** Запуск: TEST_DATABASE_URL=postgres://… npm test (БД будет очищена). */
const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

d('Интеграция с PostgreSQL', () => {
  let db: Pool;
  const secret = 'channel-secret';
  const log = createLogger('silent');

  beforeAll(async () => {
    db = createPool(url!);
    await db.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    await db.query(await readFile('migrations/001_init.sql', 'utf8'));
    const t = await db.query(`INSERT INTO tenants(amo_account_id, amo_subdomain) VALUES (1, 'demo') RETURNING id`);
    await db.query(`INSERT INTO avito_accounts(tenant_id, avito_user_id, webhook_token) VALUES ($1, 100, 'tok123')`, [t.rows[0].id]);
  });
  afterAll(async () => db?.end());

  it('вебхук Avito: повторная доставка одного события → одна запись в inbox и одна задача', async () => {
    const app = buildServer({ db, amojoSecret: secret, logger: false });
    const body = { id: 'evt-1', payload: { type: 'message', value: { id: 'm1', chat_id: 'c1', author_id: 5 } } };
    for (let i = 0; i < 3; i++) {
      const r = await app.inject({ method: 'POST', url: '/webhooks/avito/tok123', payload: body });
      expect(r.statusCode).toBe(200);
    }
    expect((await db.query(`SELECT count(*)::int n FROM inbox WHERE source='avito'`)).rows[0].n).toBe(1);
    expect((await db.query(`SELECT count(*)::int n FROM jobs WHERE kind='avito.message'`)).rows[0].n).toBe(1);
    const bad = await app.inject({ method: 'POST', url: '/webhooks/avito/wrong', payload: body });
    expect(bad.statusCode).toBe(404);
  });

  it('хук amojo: неверная подпись → 401, верная → 200 и дедупликация', async () => {
    const app = buildServer({ db, amojoSecret: secret, logger: false });
    const raw = JSON.stringify({ message: { message: { id: 'amo-1', type: 'text', text: 'Здравствуйте' } } });
    const bad = await app.inject({ method: 'POST', url: '/webhooks/amojo/scope', payload: raw, headers: { 'content-type': 'application/json', 'x-signature': 'nope' } });
    expect(bad.statusCode).toBe(401);
    const sig = createHmac('sha1', secret).update(raw).digest('hex');
    for (let i = 0; i < 2; i++) {
      const ok = await app.inject({ method: 'POST', url: '/webhooks/amojo/scope', payload: raw, headers: { 'content-type': 'application/json', 'x-signature': sig } });
      expect(ok.statusCode).toBe(200);
    }
    expect((await db.query(`SELECT count(*)::int n FROM jobs WHERE kind='amojo.outgoing'`)).rows[0].n).toBe(1);
  });

  it('очередь: задачи одного чата не выполняются параллельно', async () => {
    await db.query('DELETE FROM jobs');
    await enqueue(db, 'k', {}, { lockKey: 'chat:1' });
    await enqueue(db, 'k', {}, { lockKey: 'chat:1' });
    await enqueue(db, 'k', {}, { lockKey: 'chat:2' });
    const a = await claim(db);
    const b = await claim(db);
    const c = await claim(db);
    expect(a?.lock_key).toBe('chat:1');
    expect(b?.lock_key).toBe('chat:2');
    expect(c).toBeNull();
  });

  it('очередь: 503 → повтор позже, 400 → мёртвая очередь с записью в error_log', async () => {
    await db.query('DELETE FROM jobs');
    await enqueue(db, 'temp', {});
    await enqueue(db, 'perm', {});
    const handlers = {
      temp: async () => { throw new HttpError(503, 'amocrm', 'unavailable'); },
      perm: async () => { throw new HttpError(400, 'avito', 'bad request'); },
    };
    await runOnce(db, handlers, log);
    await runOnce(db, handlers, log);
    const rows = (await db.query(`SELECT kind, status, attempts, run_at > now() AS later FROM jobs ORDER BY id`)).rows;
    expect(rows[0]).toMatchObject({ kind: 'temp', status: 'queued', attempts: 1, later: true });
    expect(rows[1]).toMatchObject({ kind: 'perm', status: 'dead', attempts: 1 });
    expect((await db.query(`SELECT count(*)::int n FROM error_log`)).rows[0].n).toBe(2);
  });
});
