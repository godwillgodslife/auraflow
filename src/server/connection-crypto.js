import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from 'node:crypto';

function toBase64Url(buffer) {
  return Buffer.from(buffer)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function fromBase64Url(value = '') {
  const normalized = String(value || '')
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4 || 4)) % 4);
  return Buffer.from(padded, 'base64');
}

function buildKey(secret = '') {
  return createHash('sha256').update(String(secret || '')).digest();
}

export function encryptConnectionSecret(value = '', secret = '') {
  const plainText = String(value || '');
  if (!plainText) return '';
  if (!secret) {
    throw new Error('TOKEN_ENCRYPTION_SECRET is not configured.');
  }

  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', buildKey(secret), iv);
  const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${toBase64Url(iv)}.${toBase64Url(tag)}.${toBase64Url(encrypted)}`;
}

export function decryptConnectionSecret(value = '', secret = '') {
  const encryptedValue = String(value || '').trim();
  if (!encryptedValue) return '';
  if (!secret) {
    throw new Error('TOKEN_ENCRYPTION_SECRET is not configured.');
  }

  const [version, ivPart, tagPart, dataPart] = encryptedValue.split('.');
  if (version !== 'v1' || !ivPart || !tagPart || !dataPart) {
    throw new Error('Encrypted connection secret is malformed.');
  }

  const decipher = createDecipheriv('aes-256-gcm', buildKey(secret), fromBase64Url(ivPart));
  decipher.setAuthTag(fromBase64Url(tagPart));
  const decrypted = Buffer.concat([
    decipher.update(fromBase64Url(dataPart)),
    decipher.final()
  ]);
  return decrypted.toString('utf8');
}

export function signConnectionState(payload = {}, secret = '') {
  if (!secret) {
    throw new Error('TOKEN_ENCRYPTION_SECRET is not configured.');
  }
  const json = JSON.stringify(payload || {});
  const signature = createHmac('sha256', buildKey(secret)).update(json).digest();
  return `${toBase64Url(Buffer.from(json, 'utf8'))}.${toBase64Url(signature)}`;
}

export function verifyConnectionState(value = '', secret = '') {
  if (!secret) {
    throw new Error('TOKEN_ENCRYPTION_SECRET is not configured.');
  }
  const [payloadPart, signaturePart] = String(value || '').split('.');
  if (!payloadPart || !signaturePart) {
    throw new Error('OAuth state is missing or malformed.');
  }

  const payloadBuffer = fromBase64Url(payloadPart);
  const expected = createHmac('sha256', buildKey(secret)).update(payloadBuffer).digest();
  const actual = fromBase64Url(signaturePart);
  if (expected.length !== actual.length || !expected.equals(actual)) {
    throw new Error('OAuth state signature mismatch.');
  }

  return JSON.parse(payloadBuffer.toString('utf8'));
}
