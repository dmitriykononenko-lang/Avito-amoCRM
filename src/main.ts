import { loadConfig } from './config.js';
import { createPool } from './db/pool.js';
import { createLogger } from './lib/logger.js';
import { buildServer } from './http/server.js';
import { runOnce } from './queue/queue.js';
import { buildHandlers } from './worker/handlers.js';

const role = process.argv[2] ?? 'api'; // api | worker
const config = loadConfig();
const log = createLogger(config.LOG_LEVEL);
const db = createPool(config.DATABASE_URL);

if (role === 'api') {
  const app = buildServer({ db, amojoSecret: config.AMOJO_CHANNEL_SECRET, logger: { level: config.LOG_LEVEL } });
  await app.listen({ port: config.PORT, host: '0.0.0.0' });
} else if (role === 'worker') {
  const handlers = buildHandlers();
  let stopping = false;
  process.on('SIGTERM', () => (stopping = true));
  log.info('worker started');
  while (!stopping) {
    const worked = await runOnce(db, handlers, log).catch((e) => {
      log.error({ code: (e as Error).name }, 'worker loop error');
      return false;
    });
    if (!worked) await new Promise((r) => setTimeout(r, 500));
  }
  await db.end();
} else {
  throw new Error(`Неизвестная роль: ${role}`);
}
