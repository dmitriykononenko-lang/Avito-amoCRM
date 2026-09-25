import { signOutgoing } from './signature.js';
import { requestJson, type FetchLike } from '../lib/http.js';

/**
 * Клиент amoCRM Chat API. Методы — по справочнику:
 * https://www.amocrm.ru/developers/content/chats/chat-api-reference
 */

export type AmojoMessageType = 'text' | 'picture' | 'file' | 'video' | 'voice' | 'audio' | 'sticker' | 'location' | 'contact';

export interface AmojoMessage {
  type: AmojoMessageType;
  text?: string;
  media?: string;
  file_name?: string;
  file_size?: number;
}

export interface AmojoParticipant {
  id: string;
  name?: string;
  avatar?: string;
  profile_link?: string;
  phone?: string;
  ref_id?: string;
}

export class AmojoClient {
  constructor(
    private readonly opts: { baseUrl: string; channelId: string; secret: string; fetch?: FetchLike },
  ) {}

  private async call<T>(method: string, path: string, payload?: unknown): Promise<T> {
    const body = payload === undefined ? '' : JSON.stringify(payload);
    const headers = signOutgoing({ method, path, body, secret: this.opts.secret });
    return requestJson<T>(this.opts.fetch ?? fetch, 'amojo', this.opts.baseUrl + path, {
      method,
      headers: { ...headers },
      body: body || undefined,
    });
  }

  /** Подключение канала к аккаунту → scope_id */
  connect(amojoAccountId: string, title: string) {
    return this.call<{ account_id: string; scope_id: string }>('POST', `/v2/origin/custom/${this.opts.channelId}/connect`, {
      account_id: amojoAccountId,
      title,
      hook_api_version: 'v2',
    });
  }

  disconnect(amojoAccountId: string) {
    return this.call<void>('DELETE', `/v2/origin/custom/${this.opts.channelId}/disconnect`, { account_id: amojoAccountId });
  }

  /** Создать чат (до первого сообщения), чтобы привязать его к контакту и не плодить неразобранное */
  createChat(scopeId: string, conversationId: string, user: AmojoParticipant, sourceExternalId?: string) {
    return this.call<{ id: string; user: { id: string } }>('POST', `/v2/origin/custom/${scopeId}/chats`, {
      conversation_id: conversationId,
      source: sourceExternalId ? { external_id: sourceExternalId } : undefined,
      user,
    });
  }

  /**
   * Сообщение от покупателя (sender = покупатель) или импорт исходящего (sender = бот/менеджер, receiver = покупатель).
   * msgid = ID сообщения Avito → идемпотентность на стороне amoCRM.
   */
  sendMessage(
    scopeId: string,
    p: {
      msgid: string;
      conversationId: string;
      timestampMs: number;
      sender: AmojoParticipant;
      receiver?: AmojoParticipant;
      message: AmojoMessage;
      silent?: boolean;
      sourceExternalId?: string;
    },
  ) {
    return this.call<{ new_message: { msgid: string } }>('POST', `/v2/origin/custom/${scopeId}`, {
      event_type: 'new_message',
      payload: {
        timestamp: Math.floor(p.timestampMs / 1000),
        msec_timestamp: p.timestampMs,
        msgid: p.msgid,
        conversation_id: p.conversationId,
        sender: p.sender,
        receiver: p.receiver,
        message: p.message,
        silent: p.silent ?? false,
        source: p.sourceExternalId ? { external_id: p.sourceExternalId } : undefined,
      },
    });
  }

  /** Статус доставки ответа менеджера. Коды статусов — сверить со справочником на этапе 3. */
  deliveryStatus(scopeId: string, msgid: string, status: number, errorCode?: number, error?: string) {
    return this.call<void>('POST', `/v2/origin/custom/${scopeId}/${msgid}/delivery_status`, {
      msgid,
      delivery_status: status,
      error_code: errorCode,
      error,
    });
  }
}
