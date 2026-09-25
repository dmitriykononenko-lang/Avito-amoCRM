/**
 * Бизнес-правила v1 — чистые функции без I/O, покрыты тестами.
 * Источник: ТЗ, раздел «Архитектура → Правила создания и обновления».
 */

export interface OpenLead {
  id: number;
  itemId: number | null;
  closed: boolean;
}

export type LeadDecision = { action: 'attach'; leadId: number } | { action: 'create' };

/**
 * Открытая сделка контакта по тому же объявлению → пишем в неё.
 * Все закрыты или другое объявление → новая сделка у того же контакта.
 * Несколько открытых по одному объявлению → самая свежая (наибольший id).
 */
export function decideLead(leads: OpenLead[], itemId: number | null): LeadDecision {
  const candidates = leads.filter((l) => !l.closed && l.itemId === itemId).sort((a, b) => b.id - a.id);
  const first = candidates[0];
  return first ? { action: 'attach', leadId: first.id } : { action: 'create' };
}

/** Ответственный: переопределение по объявлению → по аккаунту Avito. */
export function pickResponsible(
  itemId: number | null,
  itemRoutes: Map<number, number>,
  accountDefault: number | null,
): number | null {
  if (itemId !== null && itemRoutes.has(itemId)) return itemRoutes.get(itemId)!;
  return accountDefault;
}

export type AvitoMessageRoute =
  | { route: 'import_incoming' } // сообщение покупателя → в amoCRM как входящее
  | { route: 'skip_echo' } // наше же сообщение, отправленное из amoCRM
  | { route: 'import_outgoing' }; // продавец ответил из приложения Avito → в amoCRM как исходящее

/**
 * Защита от зацикливания: сообщения продавца, которые уже есть в message_map
 * (мы их отправили), пропускаем.
 */
export function routeAvitoMessage(params: {
  authorId: number;
  sellerUserId: number;
  alreadyMapped: boolean;
}): AvitoMessageRoute {
  if (params.authorId !== params.sellerUserId) return { route: 'import_incoming' };
  return params.alreadyMapped ? { route: 'skip_echo' } : { route: 'import_outgoing' };
}

/** conversation_id в amoCRM: уникален в рамках канала, поэтому включаем аккаунт Avito. */
export function conversationId(avitoUserId: number, avitoChatId: string): string {
  return `avito:${avitoUserId}:${avitoChatId}`;
}

/** Статус звонка для /api/v4/calls: 4 — разговор состоялся, 6 — не дозвонился. */
export function amoCallStatus(talkDurationSec: number): 4 | 6 {
  return talkDurationSec > 0 ? 4 : 6;
}
