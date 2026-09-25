import type { Handler } from '../queue/queue.js';

/**
 * Обработчики задач. Заглушки — реализация по этапам плана (docs/PLAN.md).
 * Каждый обработчик обязан быть идемпотентным: повторный запуск не создаёт дублей.
 */
export function buildHandlers(): Record<string, Handler> {
  const notImplemented = (stage: string): Handler => async (job) => {
    throw new Error(`${job.kind}: не реализовано (${stage})`);
  };
  return {
    // Этап 2: сообщение Avito → контакт/сделка/чат amoCRM (domain/rules.ts: decideLead, routeAvitoMessage)
    'avito.message': notImplemented('этап 2'),
    // Этап 3: ответ менеджера из amoCRM → Avito, delivery_status
    'amojo.outgoing': notImplemented('этап 3'),
    // Этап 4: опрос calltracking, запись → VPS, /api/v4/calls или unsorted SIP
    'avito.poll_calls': notImplemented('этап 4'),
    // Этап 5: сверка чатов раз в 10 минут, проверка подписок вебхуков, refresh токенов
    'avito.reconcile': notImplemented('этап 5'),
  };
}
