import Fastify from 'fastify';
import { createHash } from 'node:crypto';
import type { Pool } from '../db/pool.js';
import { verifyIncoming } from '../amojo/signature.js';
import { enqueue } from '../queue/queue.js';

/**
 * Приём вебхуков. Правило: проверили подлинность → записали в inbox (дедупликация по ключу)
 * → поставили задачу → ответили 200. Бизнес-логика — только в воркере.
 * amojo шлёт хук ОДИН раз и ждёт ответ не дольше ~5 с.
 */
export function buildServer(deps: { db: Pool; amojoSecret: string; logger: boolean | object }) {
  const app = Fastify({ logger: deps.logger, bodyLimit: 1_048_576 });

  // Сырое тело нужно для проверки HMAC amojo
  app.addContentTypeParser('application/json', { parseAs: 'buffer' }, (_req, body, done) => {
    try {
      done(null, { raw: body, json: body.length ? JSON.parse(body.toString('utf8')) : {} });
    } catch (e) {
      done(e as Error, undefined);
    }
  });

  app.get('/health', async () => {
    await deps.db.query('SELECT 1');
    return { ok: true };
  });

  /** Хук amoCRM Chat API: ответ менеджера. URL регистрируется как …/webhooks/amojo/:scope_id */
  app.post<{ Params: { scopeId: string } }>('/webhooks/amojo/:scopeId', async (req, reply) => {
    const body = req.body as { raw: Buffer; json: Record<string, unknown> };
    const sig = req.headers['x-signature'];
    if (!verifyIncoming(body.raw, Array.isArray(sig) ? sig[0] : sig, deps.amojoSecret)) {
      return reply.code(401).send({ error: 'bad signature' });
    }
    const msgid = (body.json as { message?: { message?: { id?: string } } })?.message?.message?.id;
    const dedup = msgid ?? createHash('sha1').update(body.raw).digest('hex');
    const ins = await deps.db.query(
      `INSERT INTO inbox(source, dedup_key, payload) VALUES ('amojo', $1, $2)
       ON CONFLICT (source, dedup_key) DO NOTHING RETURNING id`,
      [dedup, body.json],
    );
    if (ins.rowCount) {
      await enqueue(deps.db, 'amojo.outgoing', { inboxId: ins.rows[0].id, scopeId: req.params.scopeId });
    }
    return reply.code(200).send({});
  });

  /**
   * Вебхук Avito Messenger v3. Подписи вебхука в известной нам документации нет (VERIFY на этапе 0),
   * поэтому защищаем секретным токеном в URL, уникальным для каждого аккаунта Avito.
   */
  app.post<{ Params: { token: string } }>('/webhooks/avito/:token', async (req, reply) => {
    const acc = await deps.db.query<{ id: number; tenant_id: number }>(
      'SELECT id, tenant_id FROM avito_accounts WHERE webhook_token = $1',
      [req.params.token],
    );
    const account = acc.rows[0];
    if (!account) return reply.code(404).send();
    const json = (req.body as { json: Record<string, unknown> }).json;
    const eventId = (json as { id?: string }).id; // VERIFY: поле уникального ID события
    const msgId = (json as { payload?: { value?: { id?: string } } }).payload?.value?.id; // VERIFY
    const dedup = `${account.id}:${eventId ?? msgId ?? createHash('sha1').update(JSON.stringify(json)).digest('hex')}`;
    const ins = await deps.db.query(
      `INSERT INTO inbox(source, dedup_key, tenant_id, payload) VALUES ('avito', $1, $2, $3)
       ON CONFLICT (source, dedup_key) DO NOTHING RETURNING id`,
      [dedup, account.tenant_id, json],
    );
    if (ins.rowCount) {
      const chatId = (json as { payload?: { value?: { chat_id?: string } } }).payload?.value?.chat_id; // VERIFY
      await enqueue(
        deps.db,
        'avito.message',
        { inboxId: ins.rows[0].id, avitoAccountId: account.id },
        { lockKey: chatId ? `chat:${account.id}:${chatId}` : undefined },
      );
    }
    await deps.db.query('UPDATE avito_accounts SET last_event_at = now() WHERE id = $1', [account.id]);
    return reply.code(200).send({ ok: true });
  });

  return app;
}
