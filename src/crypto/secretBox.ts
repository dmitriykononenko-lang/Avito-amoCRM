import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * AES-256-GCM для токенов и секретов в БД.
 * Формат: v1.<iv b64>.<tag b64>.<ciphertext b64>
 * Ключ — 32 байта (MASTER_KEY в base64), хранится только в окружении.
 */
export class SecretBox {
  private readonly key: Buffer;

  constructor(masterKeyB64: string) {
    const key = Buffer.from(masterKeyB64, 'base64');
    if (key.length !== 32) throw new Error('MASTER_KEY должен быть 32 байта в base64');
    this.key = key;
  }

  encrypt(plain: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return ['v1', iv.toString('base64'), tag.toString('base64'), ct.toString('base64')].join('.');
  }

  decrypt(sealed: string): string {
    const [v, iv, tag, ct] = sealed.split('.');
    if (v !== 'v1' || !iv || !tag || !ct) throw new Error('Неизвестный формат зашифрованного значения');
    const decipher = createDecipheriv('aes-256-gcm', this.key, Buffer.from(iv, 'base64'));
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(ct, 'base64')), decipher.final()]).toString('utf8');
  }
}
