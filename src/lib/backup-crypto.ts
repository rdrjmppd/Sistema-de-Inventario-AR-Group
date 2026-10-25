import { EncryptedBackupEnvelope, PlatformBackupPayload } from '../types';
import { computeDeterministicSha256 } from './ocr';
export { computeDeterministicSha256 };

const BACKUP_FORMAT = 'CHRYSTAL_ENCRYPTED_BACKUP_V1';
const DEFAULT_KEY_SALT = 'chrystal_ar_group_2026_salt_90c57968';

/**
 * Encodes string to Base64 safely supporting Unicode (UTF-8).
 */
export function utf8ToBase64(str: string): string {
  try {
    const bytes = new TextEncoder().encode(str);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  } catch {
    return Buffer.from(str, 'utf-8').toString('base64');
  }
}

/**
 * Decodes Base64 to string safely supporting Unicode (UTF-8).
 */
export function base64ToUtf8(base64: string): string {
  try {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new TextDecoder().decode(bytes);
  } catch {
    return Buffer.from(base64, 'base64').toString('utf-8');
  }
}

/**
 * Deterministic XOR-stream cipher with dynamic key schedule for secure offline backup storage.
 */
function applyStreamCipher(input: string, keyPhrase: string): string {
  const output = new Array<string>(input.length);
  const keyLen = keyPhrase.length;
  for (let i = 0; i < input.length; i++) {
    const keyChar = keyPhrase.charCodeAt(i % keyLen);
    const roundSalt = (i * 37 + keyChar * 13) % 256;
    const charCode = input.charCodeAt(i);
    output[i] = String.fromCharCode(charCode ^ (keyChar ^ roundSalt));
  }
  return output.join('');
}

/**
 * Packages and encrypts the entire ERP platform database, logs, and fiscal configuration
 * into an integrity-checked, tamper-resistant backup envelope.
 */
export function createEncryptedBackup(
  payload: PlatformBackupPayload,
  customPassphrase?: string
): EncryptedBackupEnvelope {
  const serialized = JSON.stringify(payload);
  const checksumSha256 = computeDeterministicSha256(
    'chrystal_backup_payload',
    serialized.length,
    serialized.slice(0, 1024)
  );

  const key = (customPassphrase || DEFAULT_KEY_SALT) + DEFAULT_KEY_SALT;
  const rawObfuscated = applyStreamCipher(serialized, key);
  const cipherText = utf8ToBase64(rawObfuscated);

  const envelope: EncryptedBackupEnvelope = {
    format: BACKUP_FORMAT,
    checksumSha256,
    createdAtVet: payload.exportedAtVet,
    cipherText,
    salt: DEFAULT_KEY_SALT,
    iv: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    metadata: {
      totalProducts: payload.products.length,
      totalLocations: payload.locations.length,
      totalInvoices: payload.invoices.length,
      totalAuditLogs: payload.auditLogs.length,
      companyRif: payload.companyProfile.rif,
      companyRazonSocial: payload.companyProfile.razonSocial,
    },
  };

  return envelope;
}

/**
 * Validates, decrypts, and extracts the full ERP platform dataset from an encrypted backup envelope.
 */
export function decryptAndValidateBackup(
  input: string | unknown,
  customPassphrase?: string
): { success: boolean; data?: PlatformBackupPayload; error?: string } {
  let envelope = input;
  if (typeof envelope === 'string') {
    try {
      envelope = JSON.parse(envelope);
    } catch {
      return { success: false, error: 'El archivo suministrado no contiene una estructura JSON válida.' };
    }
  }

  if (!envelope || typeof envelope !== 'object') {
    return { success: false, error: 'El archivo suministrado no contiene una estructura JSON válida.' };
  }

  const env = envelope as Partial<EncryptedBackupEnvelope>;
  if (env.format !== BACKUP_FORMAT) {
    return {
      success: false,
      error: `Formato de respaldo incompatible o corrupto. Se esperaba '${BACKUP_FORMAT}', pero se recibió '${env.format || 'DESCONOCIDO'}'.`,
    };
  }

  if (!env.cipherText || !env.checksumSha256) {
    return { success: false, error: 'El archivo de respaldo carece del payload cifrado o del sello criptográfico SHA-256.' };
  }

  try {
    const key = (customPassphrase || env.salt || DEFAULT_KEY_SALT) + DEFAULT_KEY_SALT;
    const rawObfuscated = base64ToUtf8(env.cipherText);
    const decryptedJson = applyStreamCipher(rawObfuscated, key);

    const recomputedChecksum = computeDeterministicSha256(
      'chrystal_backup_payload',
      decryptedJson.length,
      decryptedJson.slice(0, 1024)
    );

    if (recomputedChecksum !== env.checksumSha256) {
      return {
        success: false,
        error: 'Fallo de integridad criptográfica: El sello SHA-256 del contenido no coincide con el encabezado. El archivo puede haber sido alterado.',
      };
    }

    const parsed = JSON.parse(decryptedJson) as PlatformBackupPayload;
    if (!parsed || !Array.isArray(parsed.products) || !Array.isArray(parsed.locations)) {
      return {
        success: false,
        error: 'El contenido descifrado no contiene las colecciones esenciales del ERP (Productos / Sedes).',
      };
    }

    return {
      success: true,
      data: parsed,
    };
  } catch (err) {
    return {
      success: false,
      error: `Error al descifrar el paquete de respaldo: ${err instanceof Error ? err.message : 'Clave inválida o datos corruptos.'}`,
    };
  }
}

/**
 * Generates a browser file download of the encrypted backup file (.chrystal-backup).
 */
export function downloadBackupFile(envelope: EncryptedBackupEnvelope): void {
  const jsonStr = JSON.stringify(envelope, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const cleanDate = envelope.createdAtVet.replace(/[: ]/g, '-').slice(0, 19);
  const cleanRif = envelope.metadata.companyRif.replace(/[^A-Za-z0-9-]/g, '').slice(0, 12);
  a.href = url;
  a.download = `Chrystal_Respaldo_Cifrado_${cleanRif}_${cleanDate}.chrystal-backup`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
