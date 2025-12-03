import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;

const deriveKey = (passphrase: string) => createHash('sha256').update(passphrase, 'utf8').digest();

export const encryptSecret = (value: string, passphrase: string): string => {
  const key = deriveKey(passphrase);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted.toString('base64')}`;
};

export const decryptSecret = (payload: string, passphrase: string): string => {
  const [ivEncoded, authTagEncoded, encryptedEncoded] = payload.split(':');
  if (!ivEncoded || !authTagEncoded || !encryptedEncoded) {
    throw new Error('Corrupted encrypted payload');
  }
  const key = deriveKey(passphrase);
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivEncoded, 'base64'));
  decipher.setAuthTag(Buffer.from(authTagEncoded, 'base64'));
  const decrypted = Buffer.concat([decipher.update(Buffer.from(encryptedEncoded, 'base64')), decipher.final()]);
  return decrypted.toString('utf8');
};


