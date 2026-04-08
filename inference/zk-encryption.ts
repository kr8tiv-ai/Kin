/**
 * Zero-Knowledge Memory Encryption
 * 
 * Memories are encrypted client-side before storage.
 * The API never sees plaintext. Even if DB is dumped, conversations are unreadable.
 * Uses AES-256-GCM with user-derived keys.
 */

import crypto from 'crypto';
import { promisify } from 'util';

const pbkdf2Async = promisify(crypto.pbkdf2);

export interface EncryptedData {
  ciphertext: string;
  iv: string;
  authTag: string;
  salt: string;
}

export interface ZKKeyConfig {
  userId: string;
  password: string;
  iterations: number;
  algorithm: 'aes-256-gcm';
}

class ZKEncryption {
  private keyCache: Map<string, Buffer> = new Map();

  async deriveKey(userId: string, password: string, salt?: Buffer): Promise<{ key: Buffer; salt: Buffer }> {
    const cacheKey = `${userId}:${password}`;
    const cached = this.keyCache.get(cacheKey);
    if (cached) return { key: cached, salt: salt! };

    const saltBuffer = salt ?? crypto.randomBytes(32);
    const key = await pbkdf2Async(password, saltBuffer, 100000, 32, 'sha512');
    
    if (!salt) {
      this.keyCache.set(cacheKey, key);
    }

    return { key, salt: saltBuffer };
  }

  async encrypt(plaintext: string, userId: string, password: string): Promise<EncryptedData> {
    const salt = crypto.randomBytes(32);
    const { key } = await this.deriveKey(userId, password, salt);
    
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

    let ciphertext = cipher.update(plaintext, 'utf8', 'base64');
    ciphertext += cipher.final('base64');
    const authTag = cipher.getAuthTag();

    return {
      ciphertext,
      iv: iv.toString('base64'),
      authTag: authTag.toString('base64'),
      salt: salt.toString('base64'),
    };
  }

  async decrypt(encrypted: EncryptedData, userId: string, password: string): Promise<string> {
    const salt = Buffer.from(encrypted.salt, 'base64');
    const { key } = await this.deriveKey(userId, password, salt);
    
    const iv = Buffer.from(encrypted.iv, 'base64');
    const authTag = Buffer.from(encrypted.authTag, 'base64');
    
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);

    let plaintext = decipher.update(encrypted.ciphertext, 'base64', 'utf8');
    plaintext += decipher.final('utf8');

    return plaintext;
  }

  async encryptObject(obj: Record<string, unknown>, userId: string, password: string): Promise<EncryptedData> {
    const plaintext = JSON.stringify(obj);
    return this.encrypt(plaintext, userId, password);
  }

  async decryptObject(encrypted: EncryptedData, userId: string, password: string): Promise<Record<string, unknown>> {
    const plaintext = await this.decrypt(encrypted, userId, password);
    return JSON.parse(plaintext);
  }

  hashForVerification(data: string): string {
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  async verifyKey(userId: string, password: string, encryptedSample: EncryptedData): Promise<boolean> {
    try {
      await this.decrypt(encryptedSample, userId, password);
      return true;
    } catch {
      return false;
    }
  }

  clearCache(): void {
    this.keyCache.clear();
  }

  generateSecurePassword(length: number = 32): string {
    return crypto.randomBytes(length).toString('base64url');
  }
}

let zk: ZKEncryption | null = null;

export function getZKEncryption(): ZKEncryption {
  if (!zk) {
    zk = new ZKEncryption();
  }
  return zk;
}

// ZKKeyConfig is already exported at declaration site
