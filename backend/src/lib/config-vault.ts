import crypto, { createSecretKey } from 'crypto';
import type { KeyObject } from 'crypto';
import { env } from '../config/env';

class ConfigVault {
  private systemKey!: KeyObject;

  constructor() {
    this.systemKey = createSecretKey(
      new Uint8Array(crypto.createHmac('sha256', env.JWT_SECRET).update('admin-config-vault').digest()),
    );
  }

  encryptValue(plaintext: string): { encryptedValue: string; iv: string; authTag: string } {
    const ivBuf = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.systemKey, new Uint8Array(ivBuf));
    let encrypted = cipher.update(plaintext, 'utf8', 'base64');
    encrypted += cipher.final('base64');
    return {
      encryptedValue: encrypted,
      iv: ivBuf.toString('base64'),
      authTag: cipher.getAuthTag().toString('base64'),
    };
  }

  decryptValue(encryptedValue: string, iv: string, authTag: string): string {
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      this.systemKey,
      new Uint8Array(Buffer.from(iv, 'base64')),
    );
    decipher.setAuthTag(new Uint8Array(Buffer.from(authTag, 'base64')));
    let plain = decipher.update(encryptedValue, 'base64', 'utf8');
    plain += decipher.final('utf8');
    return plain;
  }
}

export const configVault = new ConfigVault();
