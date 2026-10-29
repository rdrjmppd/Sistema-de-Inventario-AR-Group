import { TotpSecurityConfig } from '../types';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export const DEFAULT_TOTP_CONFIG: TotpSecurityConfig = {
  enabled: true,
  allowPinFallback: true,
  secretBase32: 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP',
  issuer: 'HiperAbastoPolarERP',
  accountLabel: 'gerencia@hiperabastopolar.com',
};

/**
 * Genera una semilla aleatoria Base32 compatible con RFC 4648 / Google Authenticator (32 caracteres = 160 bits).
 */
export function generateBase32TotpSecret(length = 32): string {
  const bytes = new Uint8Array(length);
  if (typeof globalThis.crypto !== 'undefined' && globalThis.crypto.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < length; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  let out = '';
  for (let i = 0; i < length; i++) {
    out += BASE32_ALPHABET[bytes[i] % 32];
  }
  return out;
}

export function decodeBase32ToBytes(base32: string): Uint8Array {
  const cleaned = String(base32 || '')
    .toUpperCase()
    .replace(/[^A-Z2-7]/g, '');

  let bits = '';
  for (let i = 0; i < cleaned.length; i++) {
    const val = BASE32_ALPHABET.indexOf(cleaned[i]);
    if (val >= 0) {
      bits += val.toString(2).padStart(5, '0');
    }
  }

  const byteCount = Math.floor(bits.length / 8);
  const out = new Uint8Array(byteCount);
  for (let i = 0; i < byteCount; i++) {
    out[i] = parseInt(bits.slice(i * 8, i * 8 + 8), 2);
  }
  return out;
}

/**
 * Implementación pura y determinista de SHA-1 + HMAC-SHA1 (RFC 2104 / FIPS 180-4)
 * para cálculo TOTP síncrono y 100% offline tanto en el navegador como en Node.js sin librerías externas.
 */
function rotateLeft32(n: number, bits: number): number {
  return ((n << bits) | (n >>> (32 - bits))) >>> 0;
}

function sha1Bytes(message: Uint8Array): Uint8Array {
  const msgLenBits = message.length * 8;
  const withOne = message.length + 1;
  const padZeroBytes = (56 - (withOne % 64) + 64) % 64;
  const totalLen = withOne + padZeroBytes + 8;

  const padded = new Uint8Array(totalLen);
  padded.set(message, 0);
  padded[message.length] = 0x80;

  const view = new DataView(padded.buffer);
  const highBits = Math.floor(msgLenBits / 0x100000000);
  const lowBits = msgLenBits >>> 0;
  view.setUint32(totalLen - 8, highBits, false);
  view.setUint32(totalLen - 4, lowBits, false);

  let h0 = 0x67452301;
  let h1 = 0xefcdab89;
  let h2 = 0x98badcfe;
  let h3 = 0x10325476;
  let h4 = 0xc3d2e1f0;

  const w = new Uint32Array(80);

  for (let offset = 0; offset < totalLen; offset += 64) {
    for (let i = 0; i < 16; i++) {
      w[i] = view.getUint32(offset + i * 4, false);
    }
    for (let i = 16; i < 80; i++) {
      w[i] = rotateLeft32(w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16], 1);
    }

    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;

    for (let i = 0; i < 80; i++) {
      let f = 0;
      let k = 0;
      if (i < 20) {
        f = ((b & c) | (~b & d)) >>> 0;
        k = 0x5a827999;
      } else if (i < 40) {
        f = (b ^ c ^ d) >>> 0;
        k = 0x6ed9eba1;
      } else if (i < 60) {
        f = ((b & c) | (b & d) | (c & d)) >>> 0;
        k = 0x8f1bbcdc;
      } else {
        f = (b ^ c ^ d) >>> 0;
        k = 0xca62c1d6;
      }

      const temp = (rotateLeft32(a, 5) + f + e + k + w[i]) >>> 0;
      e = d;
      d = c;
      c = rotateLeft32(b, 30);
      b = a;
      a = temp;
    }

    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
  }

  const out = new Uint8Array(20);
  const outView = new DataView(out.buffer);
  outView.setUint32(0, h0, false);
  outView.setUint32(4, h1, false);
  outView.setUint32(8, h2, false);
  outView.setUint32(12, h3, false);
  outView.setUint32(16, h4, false);
  return out;
}

function hmacSha1Bytes(keyBytes: Uint8Array, msgBytes: Uint8Array): Uint8Array {
  const blockSize = 64;
  let normalizedKey = keyBytes;
  if (normalizedKey.length > blockSize) {
    normalizedKey = sha1Bytes(normalizedKey);
  }

  const paddedKey = new Uint8Array(blockSize);
  paddedKey.set(normalizedKey, 0);

  const oKeyPad = new Uint8Array(blockSize);
  const iKeyPad = new Uint8Array(blockSize);
  for (let i = 0; i < blockSize; i++) {
    oKeyPad[i] = paddedKey[i] ^ 0x5c;
    iKeyPad[i] = paddedKey[i] ^ 0x36;
  }

  const innerInput = new Uint8Array(blockSize + msgBytes.length);
  innerInput.set(iKeyPad, 0);
  innerInput.set(msgBytes, blockSize);
  const innerHash = sha1Bytes(innerInput);

  const outerInput = new Uint8Array(blockSize + innerHash.length);
  outerInput.set(oKeyPad, 0);
  outerInput.set(innerHash, blockSize);
  return sha1Bytes(outerInput);
}

/**
 * Genera el código TOTP de 6 dígitos estándar RFC 6238 para un instante dado (paso de 30 segundos).
 */
export function generateTotpCode(
  secretBase32: string,
  timestampMs: number = Date.now(),
  stepSeconds: number = 30
): string {
  const counter = Math.floor(timestampMs / 1000 / stepSeconds);
  const counterBytes = new Uint8Array(8);
  const view = new DataView(counterBytes.buffer);
  const high = Math.floor(counter / 0x100000000);
  const low = counter >>> 0;
  view.setUint32(0, high, false);
  view.setUint32(4, low, false);

  const keyBytes = decodeBase32ToBytes(secretBase32);
  const digest = hmacSha1Bytes(keyBytes, counterBytes);
  const offset = digest[19] & 0x0f;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);

  const otp = binary % 1_000_000;
  return String(otp).padStart(6, '0');
}

export function getTotpRemainingSeconds(
  timestampMs: number = Date.now(),
  stepSeconds: number = 30
): number {
  const elapsed = Math.floor(timestampMs / 1000) % stepSeconds;
  return stepSeconds - elapsed;
}

export function buildTotpOtpAuthUri(config: TotpSecurityConfig): string {
  const issuer = encodeURIComponent(config.issuer || 'HiperAbastoPolarERP');
  const label = encodeURIComponent(config.accountLabel || 'gerencia@hiperabastopolar.com');
  const secret = String(config.secretBase32 || '').replace(/\s+/g, '').toUpperCase();
  return `otpauth://totp/${issuer}:${label}?secret=${secret}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`;
}

/**
 * Genera y verifica un payload QR efímero firmado de 30 segundos ("CHRYSTAL-TOTP::<timestampStep>::<code6>")
 * para autorizar en piso sin mostrar ningún PIN fijo.
 */
export function buildEphemeralApprovalQrPayload(
  secretBase32: string,
  timestampMs: number = Date.now()
): string {
  const step = Math.floor(timestampMs / 1000 / 30);
  const code = generateTotpCode(secretBase32, timestampMs, 30);
  return `CHRYSTAL-TOTP::${step}::${code}`;
}

/**
 * Valida la autorización gerencial bajo Modo Transición Resiliente:
 * 1) Acepta Token TOTP dinámico de 6 dígitos (con ventana ±1 paso de 30s para tolerar desfase leve de reloj) o QR efímero.
 * 2) Si allowPinFallback es true (o TOTP está desactivado), acepta también los PINs gerenciales autorizados.
 */
export function verifyManagerGovernanceAuth(params: {
  submittedCredential: string;
  totpConfig?: TotpSecurityConfig | null;
  validFallbackPins?: string[];
  nowMs?: number;
}): {
  authorized: boolean;
  methodUsed: 'TOTP_DYNAMIC_6' | 'TOTP_EPHEMERAL_QR' | 'MANAGER_PIN_FALLBACK' | 'REJECTED';
  authorizedLabel: string;
} {
  const raw = String(params.submittedCredential || '').trim();
  const cfg = params.totpConfig || DEFAULT_TOTP_CONFIG;
  const nowMs = params.nowMs ?? Date.now();
  const fallbackPins = params.validFallbackPins || ['203040', '102030'];

  if (!raw) {
    return {
      authorized: false,
      methodUsed: 'REJECTED',
      authorizedLabel: 'Credencial vacía',
    };
  }

  // 1. Verificar si es un payload QR efímero firmado
  if (raw.startsWith('CHRYSTAL-TOTP::') && cfg.enabled) {
    const parts = raw.split('::');
    const submittedCode = parts[2] || '';
    for (const delta of [-1, 0, 1]) {
      const candidate = generateTotpCode(cfg.secretBase32, nowMs + delta * 30_000, 30);
      if (submittedCode === candidate) {
        return {
          authorized: true,
          methodUsed: 'TOTP_EPHEMERAL_QR',
          authorizedLabel: `QR Dinámico Gerencial (${cfg.accountLabel})`,
        };
      }
    }
  }

  // 2. Verificar Token TOTP de 6 dígitos (ventana -30s, actual, +30s)
  if (cfg.enabled && /^\d{6}$/.test(raw)) {
    for (const delta of [-1, 0, 1]) {
      const candidate = generateTotpCode(cfg.secretBase32, nowMs + delta * 30_000, 30);
      if (raw === candidate) {
        return {
          authorized: true,
          methodUsed: 'TOTP_DYNAMIC_6',
          authorizedLabel: `Token TOTP Dinámico (${cfg.accountLabel})`,
        };
      }
    }
  }

  // 3. Respaldo de contingencia por PIN gerencial (si está habilitado allowPinFallback o TOTP desactivado)
  if ((!cfg.enabled || cfg.allowPinFallback) && fallbackPins.includes(raw)) {
    return {
      authorized: true,
      methodUsed: 'MANAGER_PIN_FALLBACK',
      authorizedLabel: raw === '102030' ? 'SuperAdmin (PIN Contingencia)' : 'Gerencia (PIN Contingencia)',
    };
  }

  return {
    authorized: false,
    methodUsed: 'REJECTED',
    authorizedLabel: 'Token TOTP o PIN inválido',
  };
}
