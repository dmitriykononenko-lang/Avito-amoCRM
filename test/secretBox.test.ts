import { describe, expect, it } from 'vitest';
import { randomBytes } from 'node:crypto';
import { SecretBox } from '../src/crypto/secretBox.js';

const key = randomBytes(32).toString('base64');

describe('SecretBox (AES-256-GCM)', () => {
  it('шифрует и расшифровывает, шифртекст не содержит исходника и каждый раз разный', () => {
    const box = new SecretBox(key);
    const a = box.encrypt('refresh-token-123');
    const b = box.encrypt('refresh-token-123');
    expect(a).not.toContain('refresh-token-123');
    expect(a).not.toBe(b);
    expect(box.decrypt(a)).toBe('refresh-token-123');
  });
  it('не расшифровывает чужим ключом и подделанный шифртекст', () => {
    const sealed = new SecretBox(key).encrypt('x');
    expect(() => new SecretBox(randomBytes(32).toString('base64')).decrypt(sealed)).toThrow();
    const parts = sealed.split('.');
    parts[3] = Buffer.from('tampered').toString('base64');
    expect(() => new SecretBox(key).decrypt(parts.join('.'))).toThrow();
  });
  it('требует 32-байтовый ключ', () => {
    expect(() => new SecretBox(randomBytes(16).toString('base64'))).toThrow();
  });
});
