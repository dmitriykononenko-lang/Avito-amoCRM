import { describe, expect, it } from 'vitest';
import { createHmac } from 'node:crypto';
import { md5Hex, signOutgoing, verifyIncoming } from '../src/amojo/signature.js';

describe('amojo: подпись исходящих запросов', () => {
  it('строит строку METHOD\\nMD5\\nContent-Type\\nDate\\nPath и HMAC-SHA1 в lowercase hex', () => {
    const body = '{"account_id":"abc"}';
    const date = new Date('2026-09-25T12:00:00Z');
    const h = signOutgoing({ method: 'post', path: '/v2/origin/custom/ch/connect', body, secret: 's3cret', date });
    const expectedStr = ['POST', md5Hex(body), 'application/json', 'Fri, 25 Sep 2026 12:00:00 GMT', '/v2/origin/custom/ch/connect'].join('\n');
    expect(h['X-Signature']).toBe(createHmac('sha1', 's3cret').update(expectedStr).digest('hex'));
    expect(h['Content-MD5']).toMatch(/^[0-9a-f]{32}$/);
    expect(h.Date).toBe('Fri, 25 Sep 2026 12:00:00 GMT');
  });

  it('другое тело → другая подпись', () => {
    const date = new Date();
    const a = signOutgoing({ method: 'POST', path: '/p', body: '{"a":1}', secret: 's', date });
    const b = signOutgoing({ method: 'POST', path: '/p', body: '{"a": 1}', secret: 's', date });
    expect(a['X-Signature']).not.toBe(b['X-Signature']);
  });
});

describe('amojo: проверка входящего хука', () => {
  const raw = Buffer.from('{"message":{"text":"hi"}}');
  const good = createHmac('sha1', 'sec').update(raw).digest('hex');

  it('принимает верную подпись (в т.ч. в верхнем регистре)', () => {
    expect(verifyIncoming(raw, good, 'sec')).toBe(true);
    expect(verifyIncoming(raw, good.toUpperCase(), 'sec')).toBe(true);
  });
  it('отклоняет неверную, пустую и подпись другого секрета', () => {
    expect(verifyIncoming(raw, undefined, 'sec')).toBe(false);
    expect(verifyIncoming(raw, 'deadbeef', 'sec')).toBe(false);
    expect(verifyIncoming(raw, good, 'other')).toBe(false);
  });
});
