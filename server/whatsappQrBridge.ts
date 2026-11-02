import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  Browsers,
  WASocket,
  downloadMediaMessage,
} from '@whiskeysockets/baileys';
import QRCode from 'qrcode';
import pino from 'pino';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import zlib from 'node:zlib';

// ============================================================================
// MOTOR REAL DE VINCULACIÓN WHATSAPP WEB MULTI-DEVICE (BAILEYS WSS)
// Arquitectura Transferida de Agropecuaria Puro Apure ERP — Adaptada a BRM Proveedores AR Group
// Cero Formato CRM: Exclusivo para Proveedores (BRM), Órdenes de Compra, CxP,
// Retenciones SENIAT (IVA/ISLR) y Pre-Auditoría OCR de Facturas Entrantes.
// ============================================================================

const SESSIONS_ROOT = path.resolve(process.cwd(), '.whatsapp_sessions');
if (!fs.existsSync(SESSIONS_ROOT)) {
  fs.mkdirSync(SESSIONS_ROOT, { recursive: true });
}

export const DEFAULT_BRM_LINEA_ID = 'linea_brm';

export type GatewayCanonicalState =
  | 'DESCONECTADO'
  | 'ESPERANDO_QR'
  | 'QR_EXPIRADO'
  | 'CONECTADO'
  | 'ERROR';

export type BrmLegacyGatewayState =
  | 'DISCONNECTED'
  | 'GENERATING_QR'
  | 'QR_READY'
  | 'QR_EXPIRADO'
  | 'CONNECTED'
  | 'CLOUD_STANDBY';

export interface ActiveLineState {
  lineaId: string;
  estado: GatewayCanonicalState;
  state: BrmLegacyGatewayState;
  activeMode: 'QR_SOCKET_BRIDGE' | 'CLOUD_API_WEBHOOK' | 'WA_ME_DIRECT_LEDGER';
  qrCodeDataUri?: string;
  qrPayloadData?: string;
  pairingCode?: string;
  qrTargetType?: 'NOISE_PAIRING' | 'WA_ME_LINK' | 'PAIRING_CODE';
  numeroConectado?: string;
  corporatePhoneE164: string;
  qrRotations?: number;
  qrGeneratedAtVet?: string;
  lastHeartbeatVet: string;
  ultimoError?: string;
  actualizadoEn: string;
}

export interface SyncedWhatsAppContact {
  phone: string;
  name: string;
  lid?: string;
  updatedAt: string;
}

export interface QueuedBridgeMessage {
  id: string;
  lineaId: string;
  messageId: string;
  remitente: string;
  senderName?: string;
  destinatario: string;
  destinatarioNombre?: string;
  direccion: 'ENTRANTE' | 'SALIENTE' | 'INBOUND_FROM_SUPPLIER' | 'OUTBOUND_TO_SUPPLIER';
  cuerpo: string;
  bodyText: string;
  tipoMensaje: 'TEXTO' | 'IMAGEN' | 'DOCUMENTO' | 'AUDIO';
  mediaUrl?: string;
  mediaMimeType?: string;
  audioDurationSeconds?: number;
  isPtt?: boolean;
  attachmentFileName?: string;
  timestamp: string;
  estadoEntrega: 'ENVIADO' | 'ENTREGADO' | 'LEIDO' | 'RECIBIDO';
  isEdited?: boolean;
  editedAt?: string;
  action?: 'NUEVO' | 'MODIFICAR' | 'ESTADO';
}

export interface QueuedBridgeOcrItem {
  id: string;
  lineaId: string;
  messageId: string;
  remitente: string;
  senderName?: string;
  mediaDataUrl: string;
  mimeType: string;
  caption?: string;
  timestamp: string;
  estado: 'pendiente_verificacion';
}

const activeSockets = new Map<string, WASocket>();
const lineStatusMemory = new Map<string, ActiveLineState>();
const initializingPromises = new Map<string, Promise<WASocket>>();
const qrRotationCounters = new Map<string, number>();
const lineContactsCache = new Map<string, Map<string, SyncedWhatsAppContact>>();
const lidToPhoneCache = new Map<string, string>();
const phoneToLidCache = new Map<string, string>();
const MAX_QR_ROTATIONS = 5;

const ENCRYPTED_SESSIONS_BACKUP_FILE = path.join(
  SESSIONS_ROOT,
  'session_backup_encrypted.json'
);
const PENDING_MESSAGES_QUEUE_FILE = path.join(
  SESSIONS_ROOT,
  'pending_messages_queue.json'
);
const DURABLE_MESSAGES_STORE_FILE = path.join(
  SESSIONS_ROOT,
  'chat_messages_history.json'
);
const PENDING_OCR_QUEUE_FILE = path.join(SESSIONS_ROOT, 'pending_ocr_queue.json');

export function formatVetTimestamp(date: Date = new Date()): string {
  try {
    const parts = new Intl.DateTimeFormat('es-VE', {
      timeZone: 'America/Caracas',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).formatToParts(date);
    const map: Record<string, string> = {};
    for (const p of parts) {
      map[p.type] = p.value;
    }
    return `${map.day}/${map.month}/${map.year} ${map.hour}:${map.minute}:${map.second}`;
  } catch {
    return date.toISOString();
  }
}

export function mapCanonicalToBrmLegacyState(
  estado: GatewayCanonicalState,
  hasQrCode: boolean
): BrmLegacyGatewayState {
  if (estado === 'CONECTADO') return 'CONNECTED';
  if (estado === 'QR_EXPIRADO') return 'QR_EXPIRADO';
  if (estado === 'ESPERANDO_QR') return hasQrCode ? 'QR_READY' : 'GENERATING_QR';
  return 'DISCONNECTED';
}

function getDefaultLineState(lineaId: string): ActiveLineState {
  const nowVet = formatVetTimestamp();
  return {
    lineaId,
    estado: 'DESCONECTADO',
    state: 'DISCONNECTED',
    activeMode: 'WA_ME_DIRECT_LEDGER',
    numeroConectado: undefined,
    corporatePhoneE164: '',
    qrRotations: 0,
    lastHeartbeatVet: nowVet,
    actualizadoEn: new Date().toISOString(),
  };
}

function setLineState(lineaId: string, partial: Partial<ActiveLineState>): ActiveLineState {
  const prev = lineStatusMemory.get(lineaId) || getDefaultLineState(lineaId);
  const nextEstado = partial.estado ?? prev.estado;
  const nextQrUri =
    'qrCodeDataUri' in partial ? partial.qrCodeDataUri : prev.qrCodeDataUri;
  const nextNumero =
    'numeroConectado' in partial ? partial.numeroConectado : prev.numeroConectado;
  const nextState =
    partial.state ?? mapCanonicalToBrmLegacyState(nextEstado, Boolean(nextQrUri));

  // Regla SSoT Anti-Split-Brain: si no está CONECTADO, jamás retener un número conectado falso/residual
  const cleanNumero = nextEstado === 'CONECTADO' ? nextNumero : undefined;

  const updated: ActiveLineState = {
    ...prev,
    ...partial,
    lineaId,
    estado: nextEstado,
    state: nextState,
    activeMode:
      nextEstado === 'CONECTADO' || nextEstado === 'ESPERANDO_QR'
        ? 'QR_SOCKET_BRIDGE'
        : partial.activeMode || 'WA_ME_DIRECT_LEDGER',
    qrCodeDataUri: nextQrUri,
    numeroConectado: cleanNumero,
    corporatePhoneE164: cleanNumero || partial.corporatePhoneE164 || prev.corporatePhoneE164 || '',
    lastHeartbeatVet: formatVetTimestamp(),
    actualizadoEn: new Date().toISOString(),
  };

  if (nextEstado !== 'CONECTADO' && !partial.corporatePhoneE164) {
    updated.corporatePhoneE164 = '';
  }

  lineStatusMemory.set(lineaId, updated);
  return updated;
}

// ============================================================================
// 1. PERSISTENCIA CRIPTOGRÁFICA AES-256-GCM + GZIP DE SESIÓN BAILEYS
// ============================================================================

function getEncryptionKey(): Buffer {
  const secret =
    process.env.WHATSAPP_SESSION_SECRET ||
    process.env.GEMINI_API_KEY ||
    'ar-group-brm-default-encryption-secret-key-2026';
  return crypto.scryptSync(secret, 'ar-group-brm-wa-salt', 32);
}

export function encryptSessionData(text: string): string {
  const iv = crypto.randomBytes(12);
  const key = getEncryptionKey();
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const compressed = zlib.gzipSync(Buffer.from(text, 'utf8'), { level: 9 });
  let encrypted = cipher.update(compressed, undefined, 'base64');
  encrypted += cipher.final('base64');
  const authTag = cipher.getAuthTag();
  return `${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted}`;
}

export function decryptSessionData(encryptedPayload: string): string {
  const parts = encryptedPayload.split(':');
  if (parts.length !== 3) throw new Error('Invalid encrypted session format');
  const iv = Buffer.from(parts[0], 'base64');
  const authTag = Buffer.from(parts[1], 'base64');
  const encryptedText = parts[2];
  const key = getEncryptionKey();
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  const decryptedBuf = Buffer.concat([
    decipher.update(Buffer.from(encryptedText, 'base64')),
    decipher.final(),
  ]);
  if (
    decryptedBuf.length >= 2 &&
    decryptedBuf[0] === 0x1f &&
    decryptedBuf[1] === 0x8b
  ) {
    return zlib.gunzipSync(decryptedBuf).toString('utf8');
  }
  return decryptedBuf.toString('utf8');
}

function readEncryptedBackupStore(): Record<
  string,
  { lineaId: string; encryptedData: string; updatedAt: string }
> {
  try {
    if (fs.existsSync(ENCRYPTED_SESSIONS_BACKUP_FILE)) {
      return JSON.parse(fs.readFileSync(ENCRYPTED_SESSIONS_BACKUP_FILE, 'utf-8'));
    }
  } catch {
    // Fallback limpio
  }
  return {};
}

function writeEncryptedBackupStore(
  store: Record<string, { lineaId: string; encryptedData: string; updatedAt: string }>
): void {
  try {
    fs.writeFileSync(
      ENCRYPTED_SESSIONS_BACKUP_FILE,
      JSON.stringify(store, null, 2),
      'utf-8'
    );
  } catch (err) {
    console.warn('[WhatsApp BRM Bridge] Aviso guardando respaldo cifrado:', err);
  }
}

export async function backupSessionToStorage(lineaId: string): Promise<boolean> {
  try {
    const sessionDir = path.join(SESSIONS_ROOT, lineaId);
    if (!fs.existsSync(sessionDir)) return false;

    const files = fs.readdirSync(sessionDir).filter((f) => f.endsWith('.json'));
    if (!files.includes('creds.json')) return false;

    const fileStats = files.map((file) => {
      const fullPath = path.join(sessionDir, file);
      let mtimeMs = 0;
      try {
        mtimeMs = fs.statSync(fullPath).mtimeMs;
      } catch {}
      return { file, fullPath, mtimeMs };
    });

    const coreFiles = fileStats.filter(
      (f) => !f.file.startsWith('pre-key-') && !f.file.startsWith('lid-mapping-')
    );
    const preKeyFiles = fileStats
      .filter((f) => f.file.startsWith('pre-key-'))
      .sort((a, b) => b.mtimeMs - a.mtimeMs)
      .slice(0, 50);
    const lidFiles = fileStats
      .filter((f) => f.file.startsWith('lid-mapping-'))
      .sort((a, b) => b.mtimeMs - a.mtimeMs)
      .slice(0, 50);

    const selectedFiles = [...coreFiles, ...preKeyFiles, ...lidFiles];
    const sessionFiles: Record<string, string> = {};
    for (const { file, fullPath } of selectedFiles) {
      try {
        sessionFiles[file] = fs.readFileSync(fullPath, 'utf-8');
      } catch {}
    }

    let encryptedPayload = encryptSessionData(JSON.stringify(sessionFiles));

    if (encryptedPayload.length > 750_000) {
      const minimalFiles: Record<string, string> = {};
      for (const { file } of coreFiles) {
        if (sessionFiles[file]) minimalFiles[file] = sessionFiles[file];
      }
      for (const { file } of preKeyFiles.slice(0, 15)) {
        if (sessionFiles[file]) minimalFiles[file] = sessionFiles[file];
      }
      encryptedPayload = encryptSessionData(JSON.stringify(minimalFiles));
    }

    const store = readEncryptedBackupStore();
    store[lineaId] = {
      lineaId,
      encryptedData: encryptedPayload,
      updatedAt: new Date().toISOString(),
    };
    writeEncryptedBackupStore(store);
    return true;
  } catch (err) {
    console.warn(`[WhatsApp BRM Bridge] Error respaldando sesión ${lineaId}:`, err);
    return false;
  }
}

export async function restoreSessionFromStorage(lineaId: string): Promise<boolean> {
  try {
    const store = readEncryptedBackupStore();
    const record = store[lineaId];
    if (!record?.encryptedData) return false;

    const decryptedJson = decryptSessionData(record.encryptedData);
    const sessionFiles: Record<string, string> = JSON.parse(decryptedJson);
    if (!sessionFiles['creds.json']) return false;

    const sessionDir = path.join(SESSIONS_ROOT, lineaId);
    if (!fs.existsSync(sessionDir)) {
      fs.mkdirSync(sessionDir, { recursive: true });
    }
    for (const [filename, content] of Object.entries(sessionFiles)) {
      const safeFilename = path.basename(filename);
      fs.writeFileSync(path.join(sessionDir, safeFilename), content, 'utf-8');
    }
    return true;
  } catch (err) {
    console.warn(`[WhatsApp BRM Bridge] Error restaurando sesión ${lineaId}:`, err);
    return false;
  }
}

function deleteSessionBackupFromStorage(lineaId: string): void {
  try {
    const store = readEncryptedBackupStore();
    if (store[lineaId]) {
      delete store[lineaId];
      writeEncryptedBackupStore(store);
    }
  } catch {}
}

let backupDebounceTimer: NodeJS.Timeout | null = null;
function scheduleSessionBackup(lineaId: string): void {
  if (backupDebounceTimer) clearTimeout(backupDebounceTimer);
  backupDebounceTimer = setTimeout(() => {
    backupSessionToStorage(lineaId).catch(() => {});
  }, 3500);
}

// ============================================================================
// 2. RESOLUCIÓN DE IDENTIDADES VIRTUALES (@lid <-> E.164) Y CONTACTOS
// ============================================================================

export function storeLidPhoneMapping(
  lineaId: string,
  lid: string,
  phone: string,
  persistToDisk: boolean = true
): void {
  const cleanLid = String(lid || '').replace('@lid', '').replace(/\D/g, '');
  const cleanPhoneDigits = String(phone || '').replace(/\D/g, '');
  if (!cleanLid || cleanPhoneDigits.length < 10 || cleanPhoneDigits.length > 15) return;
  const e164 = `+${cleanPhoneDigits}`;
  lidToPhoneCache.set(cleanLid, e164);
  phoneToLidCache.set(cleanPhoneDigits, `${cleanLid}@lid`);

  if (!persistToDisk) return;

  try {
    const sessionDir = path.join(SESSIONS_ROOT, lineaId);
    if (!fs.existsSync(sessionDir)) fs.mkdirSync(sessionDir, { recursive: true });
    fs.writeFile(
      path.join(sessionDir, `lid-mapping-${cleanLid}_reverse.json`),
      JSON.stringify(e164),
      'utf-8',
      () => {}
    );
    fs.writeFile(
      path.join(sessionDir, `lid-mapping-${cleanPhoneDigits}.json`),
      JSON.stringify(`${cleanLid}@lid`),
      'utf-8',
      () => {}
    );
  } catch {}
}

export function resolveLidToPhoneNumber(
  lineaId: string,
  remoteJid: string,
  participant?: string | null
): string {
  if (participant && participant.includes('@s.whatsapp.net')) {
    const partDigits = participant.split('@')[0].split(':')[0].replace(/\D/g, '');
    if (partDigits.length >= 10 && partDigits.length <= 15) {
      if (remoteJid.endsWith('@lid')) {
        storeLidPhoneMapping(lineaId, remoteJid, partDigits);
      }
      return `+${partDigits}`;
    }
  }

  if (remoteJid.endsWith('@lid')) {
    const lidNumber = remoteJid.split('@')[0].split(':')[0].replace(/\D/g, '');
    if (lidNumber) {
      if (lidToPhoneCache.has(lidNumber)) {
        return lidToPhoneCache.get(lidNumber)!;
      }
      try {
        const reverseFile = path.join(
          SESSIONS_ROOT,
          lineaId,
          `lid-mapping-${lidNumber}_reverse.json`
        );
        if (fs.existsSync(reverseFile)) {
          const raw = JSON.parse(fs.readFileSync(reverseFile, 'utf-8'));
          const phoneDigits = String(raw || '').replace(/\D/g, '');
          if (phoneDigits.length >= 10 && phoneDigits.length <= 15) {
            const resolved = `+${phoneDigits}`;
            lidToPhoneCache.set(lidNumber, resolved);
            phoneToLidCache.set(phoneDigits, `${lidNumber}@lid`);
            return resolved;
          }
        }
      } catch {
        // Fallback silencioso
      }

      try {
        const contactsMap = loadLineContacts(lineaId);
        for (const c of contactsMap.values()) {
          if (c.lid && (c.lid === remoteJid || c.lid.includes(lidNumber))) {
            storeLidPhoneMapping(lineaId, remoteJid, c.phone);
            return c.phone;
          }
        }
      } catch {}
    }
  }

  const rawId = remoteJid.split('@')[0].split(':')[0].replace(/\D/g, '');
  return rawId ? `+${rawId}` : remoteJid;
}

export async function resolveLidToPhoneNumberAsync(
  lineaId: string,
  remoteJid: string,
  participant?: string | null
): Promise<string> {
  const syncResolved = resolveLidToPhoneNumber(lineaId, remoteJid, participant);
  if (
    syncResolved.startsWith('+') &&
    syncResolved.length >= 10 &&
    syncResolved.length <= 16 &&
    !syncResolved.includes('@lid')
  ) {
    return syncResolved;
  }

  if (remoteJid.endsWith('@lid')) {
    try {
      const sock = activeSockets.get(lineaId);
      if (sock && (sock as any).signalRepository?.lidMapping?.getPNForLID) {
        const pn = await (sock as any).signalRepository.lidMapping.getPNForLID(remoteJid);
        if (pn) {
          const cleanPn = String(pn).split('@')[0].replace(/\D/g, '');
          if (cleanPn.length >= 10 && cleanPn.length <= 15) {
            storeLidPhoneMapping(lineaId, remoteJid, cleanPn);
            return `+${cleanPn}`;
          }
        }
      }
    } catch {}
  }

  return syncResolved;
}

function findLidForPhoneDigits(
  lineaId: string,
  cleanDigits: string
): string | null {
  const normDigits = cleanDigits.replace(/\D/g, '');
  if (!normDigits) return null;

  if (phoneToLidCache.has(normDigits)) {
    return phoneToLidCache.get(normDigits)!;
  }

  try {
    const forwardFile = path.join(
      SESSIONS_ROOT,
      lineaId,
      `lid-mapping-${normDigits}.json`
    );
    if (fs.existsSync(forwardFile)) {
      const raw = JSON.parse(fs.readFileSync(forwardFile, 'utf-8'));
      const lidDigits = String(raw || '').replace(/\D/g, '');
      if (lidDigits) {
        const lidJid = `${lidDigits}@lid`;
        phoneToLidCache.set(normDigits, lidJid);
        lidToPhoneCache.set(lidDigits, `+${normDigits}`);
        return lidJid;
      }
    }
  } catch {}

  try {
    const contactsMap = loadLineContacts(lineaId);
    for (const c of contactsMap.values()) {
      const cDigits = c.phone.replace(/\D/g, '');
      if ((cDigits === normDigits || cDigits.endsWith(normDigits)) && c.lid) {
        phoneToLidCache.set(normDigits, c.lid);
        return c.lid;
      }
    }
  } catch {}

  return null;
}

export function cleanContactDisplayName(
  rawName: string | undefined | null
): string {
  if (!rawName) return '';
  const trimmed = String(rawName).trim();
  if (!trimmed || trimmed === '.' || trimmed === '-' || trimmed === '~') return '';
  if (/^\+?\d[\d\s()-]+$/.test(trimmed)) return '';
  return trimmed;
}

function getContactsFilePath(lineaId: string): string {
  return path.join(SESSIONS_ROOT, `contacts_${lineaId}.json`);
}

export function loadLineContacts(
  lineaId: string
): Map<string, SyncedWhatsAppContact> {
  if (lineContactsCache.has(lineaId)) {
    return lineContactsCache.get(lineaId)!;
  }
  const map = new Map<string, SyncedWhatsAppContact>();
  try {
    const filePath = getContactsFilePath(lineaId);
    if (fs.existsSync(filePath)) {
      const arr: SyncedWhatsAppContact[] = JSON.parse(
        fs.readFileSync(filePath, 'utf-8')
      );
      if (Array.isArray(arr)) {
        for (const item of arr) {
          if (item && item.phone && item.name) {
            map.set(item.phone, item);
          }
        }
      }
    }
  } catch {}
  lineContactsCache.set(lineaId, map);
  return map;
}

function saveLineContacts(lineaId: string): void {
  try {
    const map = lineContactsCache.get(lineaId);
    if (!map) return;
    const arr = Array.from(map.values());
    fs.writeFileSync(
      getContactsFilePath(lineaId),
      JSON.stringify(arr, null, 2),
      'utf-8'
    );
  } catch {}
}

export function ingestLineContacts(
  lineaId: string,
  contacts: Array<{
    id?: string;
    lid?: string;
    name?: string;
    notify?: string;
    verifiedName?: string;
  }>
): void {
  if (!Array.isArray(contacts) || contacts.length === 0) return;
  const map = loadLineContacts(lineaId);
  let changed = false;

  for (const c of contacts) {
    const rawId = c.id || '';
    if (
      !rawId ||
      rawId === 'status@broadcast' ||
      rawId.endsWith('@g.us') ||
      rawId.endsWith('@newsletter')
    ) {
      continue;
    }

    const bestName =
      cleanContactDisplayName(c.name) ||
      cleanContactDisplayName(c.verifiedName) ||
      cleanContactDisplayName(c.notify);

    if (!bestName) continue;

    const resolvedPhone = resolveLidToPhoneNumber(lineaId, rawId, null);
    if (
      !resolvedPhone ||
      !resolvedPhone.startsWith('+') ||
      resolvedPhone.length > 16
    ) {
      continue;
    }

    const existing = map.get(resolvedPhone);
    const effectiveLid = c.lid || (rawId.endsWith('@lid') ? rawId : existing?.lid);
    if (effectiveLid && resolvedPhone.startsWith('+')) {
      storeLidPhoneMapping(lineaId, effectiveLid, resolvedPhone);
    }

    const shouldUpdate =
      !existing ||
      Boolean(cleanContactDisplayName(c.name)) ||
      existing.name !== bestName;

    if (shouldUpdate) {
      map.set(resolvedPhone, {
        phone: resolvedPhone,
        name: bestName,
        lid: effectiveLid,
        updatedAt: new Date().toISOString(),
      });
      changed = true;
    }
  }

  if (changed) {
    saveLineContacts(lineaId);
  }
}

export function getLineContactsHandler(lineaId: string = DEFAULT_BRM_LINEA_ID) {
  const map = loadLineContacts(lineaId);
  return {
    success: true,
    lineaId,
    contacts: Array.from(map.values()),
  };
}

// ============================================================================
// 3. COLAS RESILIENTES LOCALES (MENSAJES Y PRE-CONCILIACIÓN OCR)
// ============================================================================

export function readPendingMessagesQueue(lineaId?: string): QueuedBridgeMessage[] {
  try {
    if (!fs.existsSync(PENDING_MESSAGES_QUEUE_FILE)) return [];
    const list: QueuedBridgeMessage[] = JSON.parse(
      fs.readFileSync(PENDING_MESSAGES_QUEUE_FILE, 'utf-8')
    );
    if (!Array.isArray(list)) return [];
    return lineaId ? list.filter((m) => m.lineaId === lineaId) : list;
  } catch {
    return [];
  }
}

export function appendToLocalMessagesQueue(msg: QueuedBridgeMessage): void {
  try {
    let queue: QueuedBridgeMessage[] = [];
    if (fs.existsSync(PENDING_MESSAGES_QUEUE_FILE)) {
      queue = JSON.parse(fs.readFileSync(PENDING_MESSAGES_QUEUE_FILE, 'utf-8'));
      if (!Array.isArray(queue)) queue = [];
    }
    if (!queue.some((m) => m.messageId === msg.messageId)) {
      queue.push(msg);
      fs.writeFileSync(
        PENDING_MESSAGES_QUEUE_FILE,
        JSON.stringify(queue.slice(-300), null, 2),
        'utf-8'
      );
    }
  } catch (err) {
    console.warn('[WhatsApp BRM Bridge] Error encolando mensaje local:', err);
  }
}

export function readPendingOcrQueue(lineaId?: string): QueuedBridgeOcrItem[] {
  try {
    if (!fs.existsSync(PENDING_OCR_QUEUE_FILE)) return [];
    const list: QueuedBridgeOcrItem[] = JSON.parse(
      fs.readFileSync(PENDING_OCR_QUEUE_FILE, 'utf-8')
    );
    if (!Array.isArray(list)) return [];
    return lineaId ? list.filter((i) => i.lineaId === lineaId) : list;
  } catch {
    return [];
  }
}

export function appendToLocalOcrQueue(item: QueuedBridgeOcrItem): void {
  try {
    let queue: QueuedBridgeOcrItem[] = [];
    if (fs.existsSync(PENDING_OCR_QUEUE_FILE)) {
      queue = JSON.parse(fs.readFileSync(PENDING_OCR_QUEUE_FILE, 'utf-8'));
      if (!Array.isArray(queue)) queue = [];
    }
    if (!queue.some((i) => i.messageId === item.messageId)) {
      queue.push(item);
      fs.writeFileSync(
        PENDING_OCR_QUEUE_FILE,
        JSON.stringify(queue.slice(-100), null, 2),
        'utf-8'
      );
    }
  } catch (err) {
    console.warn('[WhatsApp BRM Bridge] Error encolando OCR local:', err);
  }
}

export function clearSyncedOfflineQueueItems(params: {
  messageIds?: string[];
  ocrIds?: string[];
}): void {
  const { messageIds = [], ocrIds = [] } = params;
  if (messageIds.length > 0 && fs.existsSync(PENDING_MESSAGES_QUEUE_FILE)) {
    try {
      const idSet = new Set(messageIds);
      const current: QueuedBridgeMessage[] = JSON.parse(
        fs.readFileSync(PENDING_MESSAGES_QUEUE_FILE, 'utf-8')
      );
      const remaining = (Array.isArray(current) ? current : []).filter(
        (m) => !idSet.has(m.id) && !idSet.has(m.messageId)
      );
      fs.writeFileSync(
        PENDING_MESSAGES_QUEUE_FILE,
        JSON.stringify(remaining, null, 2),
        'utf-8'
      );
    } catch {}
  }

  if (ocrIds.length > 0 && fs.existsSync(PENDING_OCR_QUEUE_FILE)) {
    try {
      const idSet = new Set(ocrIds);
      const current: QueuedBridgeOcrItem[] = JSON.parse(
        fs.readFileSync(PENDING_OCR_QUEUE_FILE, 'utf-8')
      );
      const remaining = (Array.isArray(current) ? current : []).filter(
        (i) => !idSet.has(i.id) && !idSet.has(i.messageId)
      );
      fs.writeFileSync(
        PENDING_OCR_QUEUE_FILE,
        JSON.stringify(remaining, null, 2),
        'utf-8'
      );
    } catch {}
  }
}

export function readDurableMessagesStore(lineaId?: string): QueuedBridgeMessage[] {
  try {
    if (!fs.existsSync(DURABLE_MESSAGES_STORE_FILE)) return [];
    const list: QueuedBridgeMessage[] = JSON.parse(
      fs.readFileSync(DURABLE_MESSAGES_STORE_FILE, 'utf-8')
    );
    if (!Array.isArray(list)) return [];
    return lineaId ? list.filter((m) => m.lineaId === lineaId) : list;
  } catch {
    return [];
  }
}

export function saveMessageToDurableStore(msg: QueuedBridgeMessage): void {
  try {
    let store: QueuedBridgeMessage[] = [];
    if (fs.existsSync(DURABLE_MESSAGES_STORE_FILE)) {
      store = JSON.parse(fs.readFileSync(DURABLE_MESSAGES_STORE_FILE, 'utf-8'));
      if (!Array.isArray(store)) store = [];
    }
    const idx = store.findIndex(
      (m) => m.messageId === msg.messageId || (m.id && m.id === msg.id)
    );
    if (idx >= 0) {
      store[idx] = { ...store[idx], ...msg };
    } else {
      store.push(msg);
      if (store.length > 1000) {
        store = store.slice(-1000);
      }
    }
    fs.writeFileSync(
      DURABLE_MESSAGES_STORE_FILE,
      JSON.stringify(store, null, 2),
      'utf-8'
    );
  } catch (err) {
    console.warn('[WhatsApp BRM Bridge] Error guardando en almacén duradero:', err);
  }
}

export function updateMessageTextInStoreAndQueue(
  lineaId: string,
  targetMessageId: string,
  newText: string
): boolean {
  let updatedAny = false;
  const nowIso = new Date().toISOString();

  // 1. Actualizar almacén duradero
  try {
    if (fs.existsSync(DURABLE_MESSAGES_STORE_FILE)) {
      const store: QueuedBridgeMessage[] = JSON.parse(
        fs.readFileSync(DURABLE_MESSAGES_STORE_FILE, 'utf-8')
      );
      if (Array.isArray(store)) {
        const item = store.find(
          (m) => m.messageId === targetMessageId || m.id === targetMessageId
        );
        if (item) {
          item.cuerpo = newText;
          item.bodyText = newText;
          item.isEdited = true;
          item.editedAt = nowIso;
          fs.writeFileSync(
            DURABLE_MESSAGES_STORE_FILE,
            JSON.stringify(store, null, 2),
            'utf-8'
          );
          updatedAny = true;
        }
      }
    }
  } catch {}

  // 2. Actualizar cola pendiente o re-encolar notificación de modificación
  try {
    let queue: QueuedBridgeMessage[] = [];
    if (fs.existsSync(PENDING_MESSAGES_QUEUE_FILE)) {
      queue = JSON.parse(fs.readFileSync(PENDING_MESSAGES_QUEUE_FILE, 'utf-8'));
      if (!Array.isArray(queue)) queue = [];
    }
    const inQueue = queue.find(
      (m) => m.messageId === targetMessageId || m.id === targetMessageId
    );
    if (inQueue) {
      inQueue.cuerpo = newText;
      inQueue.bodyText = newText;
      inQueue.isEdited = true;
      inQueue.editedAt = nowIso;
      inQueue.action = 'MODIFICAR';
      updatedAny = true;
    } else {
      const durable = readDurableMessagesStore(lineaId);
      const original = durable.find(
        (m) => m.messageId === targetMessageId || m.id === targetMessageId
      );
      if (original) {
        queue.push({
          ...original,
          cuerpo: newText,
          bodyText: newText,
          isEdited: true,
          editedAt: nowIso,
          action: 'MODIFICAR',
        });
        updatedAny = true;
      }
    }
    fs.writeFileSync(
      PENDING_MESSAGES_QUEUE_FILE,
      JSON.stringify(queue.slice(-300), null, 2),
      'utf-8'
    );
  } catch {}

  return updatedAny;
}

export function updateMessageStatusInStore(
  messageId: string,
  rawStatus: number | string
): void {
  try {
    let mappedStatus: QueuedBridgeMessage['estadoEntrega'] = 'ENVIADO';
    if (rawStatus === 2 || rawStatus === 'SERVER_ACK' || rawStatus === 'SENT') {
      mappedStatus = 'ENVIADO';
    } else if (
      rawStatus === 3 ||
      rawStatus === 'DELIVERY_ACK' ||
      rawStatus === 'DELIVERED'
    ) {
      mappedStatus = 'ENTREGADO';
    } else if (rawStatus === 4 || rawStatus === 'READ' || rawStatus === 'PLAYED') {
      mappedStatus = 'LEIDO';
    } else {
      return;
    }

    if (fs.existsSync(DURABLE_MESSAGES_STORE_FILE)) {
      const store: QueuedBridgeMessage[] = JSON.parse(
        fs.readFileSync(DURABLE_MESSAGES_STORE_FILE, 'utf-8')
      );
      if (Array.isArray(store)) {
        const item = store.find(
          (m) => m.messageId === messageId || m.id === messageId
        );
        if (item && item.estadoEntrega !== mappedStatus) {
          item.estadoEntrega = mappedStatus;
          fs.writeFileSync(
            DURABLE_MESSAGES_STORE_FILE,
            JSON.stringify(store, null, 2),
            'utf-8'
          );
        }
      }
    }
  } catch {}
}

export function getChatMessagesHistoryHandler(
  lineaId: string = DEFAULT_BRM_LINEA_ID,
  contactPhone?: string,
  limit: number = 200
) {
  const all = readDurableMessagesStore(lineaId);
  let filtered = all;
  if (contactPhone) {
    const clean = contactPhone.replace(/\D/g, '');
    if (clean) {
      filtered = all.filter((m) => {
        const r = String(m.remitente || '').replace(/\D/g, '');
        const d = String(m.destinatario || '').replace(/\D/g, '');
        return (
          r === clean ||
          d === clean ||
          r.endsWith(clean) ||
          d.endsWith(clean)
        );
      });
    }
  }
  return {
    success: true,
    lineaId,
    contactPhone,
    total: filtered.length,
    messages: filtered.slice(-Math.min(limit, 500)),
  };
}

// ============================================================================
// 4. INICIALIZACIÓN DE SOCKET BAILEYS CON CORTACIRCUITOS (5 ROTACIONES QR)
// ============================================================================

export async function initializeBaileysSocket(
  lineaId: string = DEFAULT_BRM_LINEA_ID
): Promise<WASocket> {
  if (initializingPromises.has(lineaId)) {
    return initializingPromises.get(lineaId)!;
  }

  const initPromise = (async () => {
    try {
      // Cerrar socket previo si existiera para evitar fugas de memoria o listeners duplicados
      const existing = activeSockets.get(lineaId);
      if (existing) {
        try {
          existing.ev.removeAllListeners('connection.update');
          existing.ev.removeAllListeners('creds.update');
          existing.ev.removeAllListeners('messages.upsert');
          existing.ev.removeAllListeners('messaging-history.set');
          existing.ev.removeAllListeners('contacts.upsert');
          existing.ev.removeAllListeners('contacts.update');
          existing.ev.removeAllListeners('chats.delete');
          existing.end(undefined);
        } catch {}
        activeSockets.delete(lineaId);
      }

      const sessionDir = path.join(SESSIONS_ROOT, lineaId);
      const credsPath = path.join(sessionDir, 'creds.json');
      if (!fs.existsSync(credsPath)) {
        await restoreSessionFromStorage(lineaId);
      }
      if (!fs.existsSync(sessionDir)) {
        fs.mkdirSync(sessionDir, { recursive: true });
      }

      const { state, saveCreds } = await useMultiFileAuthState(sessionDir);

      const createWASocket: typeof makeWASocket =
        typeof makeWASocket === 'function'
          ? makeWASocket
          : ((makeWASocket as unknown as { default: typeof makeWASocket }).default ||
            makeWASocket);

      const sock = createWASocket({
        auth: state,
        logger: pino({ level: 'silent' }),
        browser: Browsers.macOS('Desktop'),
        printQRInTerminal: false,
        syncFullHistory: false,
        markOnlineOnConnect: true,
      });

      try {
        const rawWs = (sock as unknown as { ws?: { on?: (ev: string, cb: (err: unknown) => void) => void } }).ws;
        if (rawWs && typeof rawWs.on === 'function') {
          rawWs.on('error', (wsErr: unknown) => {
            console.warn(`[WhatsApp BRM Bridge] Aviso de socket WS (${lineaId}):`, wsErr);
          });
        }
      } catch {
        // Ignore if ws wrapper does not expose .on
      }

      activeSockets.set(lineaId, sock);

      sock.ev.on('creds.update', async () => {
        try {
          await saveCreds();
          scheduleSessionBackup(lineaId);
        } catch (err) {
          console.warn(
            `[WhatsApp BRM Bridge] Error guardando credenciales (${lineaId}):`,
            err
          );
        }
      });

      // Sincronización de agenda de contactos desde el teléfono vinculado
      sock.ev.on('messaging-history.set', ({ contacts }) => {
        if (contacts && contacts.length > 0) {
          ingestLineContacts(lineaId, contacts);
        }
      });

      sock.ev.on('contacts.upsert', (contacts) => {
        ingestLineContacts(lineaId, contacts);
      });

      sock.ev.on('contacts.update', (updates) => {
        ingestLineContacts(lineaId, updates as any);
      });

      // Eliminación asimétrica de chats desde el móvil hacia la aplicación
      sock.ev.on('chats.delete', async (deletedChatIds) => {
        try {
          for (const rawJid of deletedChatIds) {
            if (!rawJid || rawJid === 'status@broadcast' || rawJid.endsWith('@g.us')) {
              continue;
            }
            const resolvedPhone = resolveLidToPhoneNumber(lineaId, rawJid, null);
            const cleanDigits = resolvedPhone.replace(/\D/g, '');
            if (cleanDigits.length >= 10) {
              await deleteWhatsAppChatHandler(lineaId, cleanDigits, false);
            }
          }
        } catch (err) {
          console.warn(
            `[WhatsApp BRM Bridge] Error procesando chats.delete (${lineaId}):`,
            err
          );
        }
      });

      // Actualizaciones de estado y ediciones en tiempo real
      sock.ev.on('messages.update', async (updates) => {
        try {
          for (const u of updates) {
            const msgId = u.key?.id;
            if (!msgId) continue;
            const updateObj = (u as any).update;
            if (updateObj?.status) {
              updateMessageStatusInStore(msgId, updateObj.status);
            }
          }
        } catch (err) {
          console.warn(
            `[WhatsApp BRM Bridge] Error procesando messages.update (${lineaId}):`,
            err
          );
        }
      });

      // Escucha bidireccional de mensajes entrantes y salientes desde el teléfono (Notas de Voz, Imágenes OCR, Texto)
      sock.ev.on('messages.upsert', async (m) => {
        try {
          for (const msg of m.messages) {
            if (!msg.message) continue;
            const remoteJid = msg.key.remoteJid || '';
            if (
              !remoteJid ||
              remoteJid === 'status@broadcast' ||
              remoteJid.endsWith('@g.us') ||
              remoteJid.endsWith('@newsletter')
            ) {
              continue;
            }

            const rawMsg = msg.message;

            // 1. Detección de Mensaje de Edición en Tiempo Real (ProtocolMessage / MESSAGE_EDIT)
            if (rawMsg.protocolMessage) {
              const proto = rawMsg.protocolMessage;
              const targetKey = proto.key;
              const targetId = targetKey?.id;
              const editedMsg = proto.editedMessage;
              if (targetId && editedMsg) {
                const unwrapEdited =
                  editedMsg.ephemeralMessage?.message ||
                  editedMsg.viewOnceMessage?.message ||
                  editedMsg.viewOnceMessageV2?.message ||
                  editedMsg.documentWithCaptionMessage?.message ||
                  editedMsg;
                const editedText =
                  unwrapEdited.conversation ||
                  unwrapEdited.extendedTextMessage?.text ||
                  unwrapEdited.imageMessage?.caption ||
                  unwrapEdited.documentMessage?.caption ||
                  '';
                if (editedText) {
                  updateMessageTextInStoreAndQueue(lineaId, targetId, editedText);
                  console.log(
                    `[WhatsApp BRM Bridge] Mensaje ${targetId} modificado en tiempo real: "${editedText}"`
                  );
                }
              }
              continue;
            }

            const isFromMe = Boolean(msg.key.fromMe);
            const participant = msg.key.participant || (msg as any).participant || null;
            const counterpartyPhone = await resolveLidToPhoneNumberAsync(
              lineaId,
              remoteJid,
              participant
            );
            const innerMessage =
              rawMsg.ephemeralMessage?.message ||
              rawMsg.viewOnceMessage?.message ||
              rawMsg.viewOnceMessageV2?.message ||
              rawMsg.documentWithCaptionMessage?.message ||
              rawMsg;

            const pushNameClean = cleanContactDisplayName(msg.pushName);
            const contactsMap = loadLineContacts(lineaId);
            if (!isFromMe && pushNameClean && counterpartyPhone.startsWith('+')) {
              const existingContact = contactsMap.get(counterpartyPhone);
              if (!existingContact) {
                contactsMap.set(counterpartyPhone, {
                  phone: counterpartyPhone,
                  name: pushNameClean,
                  lid: remoteJid.endsWith('@lid') ? remoteJid : undefined,
                  updatedAt: new Date().toISOString(),
                });
                saveLineContacts(lineaId);
              }
            }

            const savedContactName = contactsMap.get(counterpartyPhone)?.name;
            const resolvedContactName =
              savedContactName || (!isFromMe ? pushNameClean : undefined) || undefined;

            const textBody =
              innerMessage.conversation ||
              innerMessage.extendedTextMessage?.text ||
              innerMessage.imageMessage?.caption ||
              innerMessage.videoMessage?.caption ||
              innerMessage.documentMessage?.caption ||
              '';

            const hasImage = Boolean(innerMessage.imageMessage);
            const hasDoc = Boolean(innerMessage.documentMessage);
            const hasAudio = Boolean(innerMessage.audioMessage);

            let mediaDataUrl: string | undefined;
            let mediaMimeType: string | undefined;
            let audioDurationSeconds: number | undefined;
            let isPtt: boolean | undefined;
            let attachmentFileName: string | undefined;

            if (hasImage || hasDoc) {
              try {
                const mimeType =
                  innerMessage.imageMessage?.mimetype ||
                  innerMessage.documentMessage?.mimetype ||
                  'image/jpeg';
                mediaMimeType = mimeType;
                attachmentFileName =
                  innerMessage.documentMessage?.fileName ||
                  (hasImage ? `Factura_BRM_${Date.now()}.jpg` : undefined);

                if (mimeType.startsWith('image/') || mimeType === 'application/pdf') {
                  const buffer = (await downloadMediaMessage(
                    msg,
                    'buffer',
                    {},
                    {
                      logger: pino({ level: 'silent' }),
                      reuploadRequest: sock.updateMediaMessage,
                    }
                  )) as Buffer;

                  if (buffer && buffer.length < 5 * 1024 * 1024) {
                    mediaDataUrl = `data:${mimeType};base64,${buffer.toString('base64')}`;
                  }
                }
              } catch (dlErr) {
                console.warn(
                  '[WhatsApp BRM Bridge] No se pudo descargar adjunto binario:',
                  dlErr
                );
              }
            }

            if (hasAudio && innerMessage.audioMessage) {
              try {
                const rawMime =
                  innerMessage.audioMessage.mimetype || 'audio/ogg; codecs=opus';
                mediaMimeType = rawMime;
                audioDurationSeconds = Number(
                  innerMessage.audioMessage.seconds || 0
                );
                isPtt = Boolean(innerMessage.audioMessage.ptt);

                const buffer = (await downloadMediaMessage(
                  msg,
                  'buffer',
                  {},
                  {
                    logger: pino({ level: 'silent' }),
                    reuploadRequest: sock.updateMediaMessage,
                  }
                )) as Buffer;

                if (buffer && buffer.length < 8 * 1024 * 1024) {
                  mediaDataUrl = `data:${rawMime};base64,${buffer.toString('base64')}`;
                }
              } catch (audioErr) {
                console.warn(
                  '[WhatsApp BRM Bridge] No se pudo descargar nota de voz:',
                  audioErr
                );
              }
            }

            const ownPhone =
              lineStatusMemory.get(lineaId)?.numeroConectado || 'LINEA_BRM';
            const messageId =
              msg.key.id ||
              `baileys_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

            const formatAudioDuration = (sec?: number) => {
              if (!sec || sec <= 0) return '';
              const mins = Math.floor(sec / 60);
              const rem = sec % 60;
              return ` (${mins}:${rem < 10 ? '0' : ''}${rem})`;
            };

            const defaultCuerpo = hasImage
              ? '📷 [Imagen / Factura o Comprobante Adjunto]'
              : hasDoc
              ? `📄 [Documento: ${innerMessage.documentMessage?.fileName || 'Archivo'}]`
              : hasAudio
              ? `${
                  isPtt ? '🎤 Nota de voz' : '🎵 Mensaje de audio'
                }${formatAudioDuration(audioDurationSeconds)}`
              : '';

            const finalBody = textBody || defaultCuerpo;
            if (!finalBody && !mediaDataUrl) continue;

            const queuedMsg: QueuedBridgeMessage = {
              id: messageId,
              lineaId,
              messageId,
              remitente: isFromMe ? ownPhone : counterpartyPhone,
              senderName: isFromMe
                ? 'Compras / Tesorería BRM'
                : resolvedContactName,
              destinatario: isFromMe ? counterpartyPhone : ownPhone,
              destinatarioNombre: isFromMe ? resolvedContactName : undefined,
              direccion: isFromMe ? 'SALIENTE' : 'ENTRANTE',
              cuerpo: finalBody,
              bodyText: finalBody,
              tipoMensaje: hasImage
                ? 'IMAGEN'
                : hasDoc
                ? 'DOCUMENTO'
                : hasAudio
                ? 'AUDIO'
                : 'TEXTO',
              mediaUrl: mediaDataUrl,
              mediaMimeType,
              audioDurationSeconds,
              isPtt,
              attachmentFileName,
              timestamp: new Date().toISOString(),
              estadoEntrega: isFromMe ? 'ENTREGADO' : 'RECIBIDO',
            };

            saveMessageToDurableStore(queuedMsg);
            appendToLocalMessagesQueue(queuedMsg);

            // Si es imagen entrante de proveedor, encolar en Pre-Auditoría OCR (Compuerta 1)
            // LÍNEA ROJA: Jamás altera el libro mayor ni da por saldada o cargada una factura automáticamente
            if (!isFromMe && hasImage && mediaDataUrl) {
              appendToLocalOcrQueue({
                id: `ocr_${messageId}`,
                lineaId,
                messageId,
                remitente: counterpartyPhone,
                senderName: resolvedContactName,
                mediaDataUrl,
                mimeType: mediaMimeType || 'image/jpeg',
                caption: textBody,
                timestamp: new Date().toISOString(),
                estado: 'pendiente_verificacion',
              });
            }
          }
        } catch (err) {
          console.error(
            `[WhatsApp BRM Bridge] Error procesando mensaje entrante en ${lineaId}:`,
            err
          );
        }
      });

      // Gestión del ciclo de vida de la conexión y Cortacircuitos QR
      sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
          const rotations = (qrRotationCounters.get(lineaId) || 0) + 1;
          qrRotationCounters.set(lineaId, rotations);

          // Cortacircuitos tras 5 rotaciones sin escaneo (~100 segundos)
          if (rotations > MAX_QR_ROTATIONS) {
            console.log(
              `[WhatsApp BRM Bridge] Cortacircuitos activado en ${lineaId}: QR rotó ${MAX_QR_ROTATIONS} veces sin escaneo. Pausando socket.`
            );
            qrRotationCounters.set(lineaId, 0);
            setLineState(lineaId, {
              estado: 'QR_EXPIRADO',
              state: 'QR_EXPIRADO',
              qrCodeDataUri: undefined,
              qrPayloadData: undefined,
              qrRotations: MAX_QR_ROTATIONS,
              ultimoError:
                'El código QR expiró por inactividad tras 5 rotaciones. Haz clic en "Refrescar Código QR" para generar uno nuevo.',
            });
            try {
              (sock.ws as any)?.close?.();
              sock.end(undefined);
            } catch {}
            activeSockets.delete(lineaId);
            return;
          }

          try {
            // Regla de Oro Puro Apure ERP: Entregar cadena `qr` de Baileys 100% intacta
            const qrDataUri = await QRCode.toDataURL(qr, {
              margin: 2,
              scale: 8,
              color: {
                dark: '#000000',
                light: '#ffffff',
              },
            });

            setLineState(lineaId, {
              estado: 'ESPERANDO_QR',
              state: 'QR_READY',
              qrCodeDataUri: qrDataUri,
              qrPayloadData: qr,
              qrTargetType: 'NOISE_PAIRING',
              qrRotations: rotations,
              qrGeneratedAtVet: formatVetTimestamp(),
              ultimoError: undefined,
            });
            console.log(
              `[WhatsApp BRM Bridge] QR auténtico generado para ${lineaId} (rotación ${rotations}/${MAX_QR_ROTATIONS})`
            );
          } catch (qrErr) {
            console.error('[WhatsApp BRM Bridge] Error generando imagen QR:', qrErr);
          }
        }

        if (connection === 'open') {
          qrRotationCounters.set(lineaId, 0);
          const rawUser = sock.user?.id || '';
          const phoneNumber = rawUser.split(':')[0].split('@')[0].replace(/\D/g, '');
          const connectedE164 = phoneNumber ? `+${phoneNumber}` : 'Vinculado';

          setLineState(lineaId, {
            estado: 'CONECTADO',
            state: 'CONNECTED',
            qrCodeDataUri: undefined,
            qrPayloadData: undefined,
            pairingCode: undefined,
            numeroConectado: connectedE164,
            corporatePhoneE164: connectedE164,
            qrRotations: 0,
            ultimoError: undefined,
          });
          console.log(
            `[WhatsApp BRM Bridge] ¡Línea ${lineaId} CONECTADA exitosamente con el número ${connectedE164}!`
          );

          backupSessionToStorage(lineaId).catch(() => {});
        }

        if (connection === 'close') {
          const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
          const isLoggedOut = statusCode === DisconnectReason.loggedOut;
          const isBadSession = statusCode === DisconnectReason.badSession;
          const isRestartRequired = statusCode === DisconnectReason.restartRequired; // 515

          console.log(
            `[WhatsApp BRM Bridge] Conexión cerrada para ${lineaId}. Código: ${statusCode}. LoggedOut: ${isLoggedOut}`
          );

          activeSockets.delete(lineaId);

          // Respetar cortacircuitos si se pausó por QR_EXPIRADO
          const currentMem = lineStatusMemory.get(lineaId);
          if (currentMem?.estado === 'QR_EXPIRADO') {
            return;
          }

          // Código 515: Reinicio normal post-escaneo QR
          if (isRestartRequired) {
            console.log(
              `[WhatsApp BRM Bridge] Reinicio requerido (515) tras emparejar ${lineaId}. Reconectando de inmediato...`
            );
            setTimeout(() => {
              initializeBaileysSocket(lineaId).catch((e) =>
                console.error('Error en reconexión 515:', e)
              );
            }, 500);
            return;
          }

          // Logout o sesión corrupta: purgar automáticamente y regenerar QR limpio
          if (isLoggedOut || isBadSession) {
            console.log(
              `[WhatsApp BRM Bridge] Sesión ${lineaId} cerrada desde el móvil o llaves corruptas (${statusCode}). Purgando y regenerando QR...`
            );
            forceResetAndUnlinkSession(lineaId, true).catch((e) =>
              console.error('Error en auto-purga tras logout/badSession:', e)
            );
          } else {
            const isManualUnlink =
              currentMem?.estado === 'DESCONECTADO' && !currentMem?.qrCodeDataUri;
            if (!isManualUnlink) {
              setTimeout(() => {
                initializeBaileysSocket(lineaId).catch((e) =>
                  console.error('Error reconectando:', e)
                );
              }, 3000);
            }
          }
        }
      });

      return sock;
    } finally {
      initializingPromises.delete(lineaId);
    }
  })();

  initializingPromises.set(lineaId, initPromise);
  return initPromise;
}

// ============================================================================
// 5. CONTROLADORES DE ESTADO (SSoT ANTI-SPLIT-BRAIN), PURGA ATÓMICA Y ENVÍO
// ============================================================================

/**
 * SSoT Anti-Split-Brain:
 * Una línea SOLO puede reportarse como CONECTADO / CONNECTED si existe un socket
 * activo en memoria y tiene `sock.user?.id` autenticado.
 */
export function getWhatsAppLineStatusHandler(
  lineaId: string = DEFAULT_BRM_LINEA_ID
): ActiveLineState {
  const status = lineStatusMemory.get(lineaId) || getDefaultLineState(lineaId);
  const sock = activeSockets.get(lineaId);
  const isSocketReallyOpen = Boolean(sock && sock.user?.id);

  if (
    (status.estado === 'CONECTADO' || status.state === 'CONNECTED') &&
    !isSocketReallyOpen
  ) {
    return setLineState(lineaId, {
      estado: 'DESCONECTADO',
      state: 'DISCONNECTED',
      numeroConectado: undefined,
      corporatePhoneE164: '',
      qrCodeDataUri: undefined,
      qrPayloadData: undefined,
    });
  }

  if (status.estado !== 'CONECTADO' && status.numeroConectado) {
    return setLineState(lineaId, {
      numeroConectado: undefined,
      corporatePhoneE164: '',
    });
  }

  return status;
}

/**
 * Purga Atómica en 7 Pasos (< 1s):
 * Destruye listeners, cierra WebSocket, borra sesión en disco, limpia caché de contactos
 * y opcionalmente arranca un nuevo socket esperando hasta 8 segundos por un QR fresco.
 */
export async function forceResetAndUnlinkSession(
  lineaId: string = DEFAULT_BRM_LINEA_ID,
  generateNewQr: boolean = false
): Promise<{
  success: boolean;
  lineaId: string;
  estado: GatewayCanonicalState;
  state: BrmLegacyGatewayState;
  qrCodeDataUri?: string;
  session: ActiveLineState;
  message: string;
  error?: string;
}> {
  console.log(
    `[WhatsApp BRM Bridge] Ejecutando purga atómica de 7 pasos para ${lineaId} (generateNewQr=${generateNewQr})...`
  );

  qrRotationCounters.set(lineaId, 0);

  // 1. Remover listeners y destruir socket inmediatamente
  const existing = activeSockets.get(lineaId);
  if (existing) {
    try {
      existing.ev.removeAllListeners('connection.update');
      existing.ev.removeAllListeners('creds.update');
      existing.ev.removeAllListeners('messages.upsert');
      existing.ev.removeAllListeners('messaging-history.set');
      existing.ev.removeAllListeners('contacts.upsert');
      existing.ev.removeAllListeners('contacts.update');
      existing.ev.removeAllListeners('chats.delete');
    } catch {}
    try {
      (existing.ws as any)?.close?.();
    } catch {}
    try {
      existing.end(undefined);
    } catch {}
    activeSockets.delete(lineaId);
  }
  initializingPromises.delete(lineaId);

  // 2. Limpiar estado en memoria (SSoT)
  const resetState = setLineState(lineaId, {
    estado: generateNewQr ? 'ESPERANDO_QR' : 'DESCONECTADO',
    state: generateNewQr ? 'GENERATING_QR' : 'DISCONNECTED',
    qrCodeDataUri: undefined,
    qrPayloadData: undefined,
    pairingCode: undefined,
    numeroConectado: undefined,
    corporatePhoneE164: '',
    qrRotations: 0,
    ultimoError: undefined,
  });

  // 3. Purgar directorio físico de llaves Signal en disco
  const sessionDir = path.join(SESSIONS_ROOT, lineaId);
  try {
    if (fs.existsSync(sessionDir)) {
      fs.rmSync(sessionDir, { recursive: true, force: true });
    }
  } catch (rmErr) {
    console.warn(
      `[WhatsApp BRM Bridge] Aviso al limpiar directorio de sesión ${lineaId}:`,
      rmErr
    );
  }

  // 4. Limpiar caché de contactos de la línea
  try {
    lineContactsCache.delete(lineaId);
    const contactsFile = getContactsFilePath(lineaId);
    if (fs.existsSync(contactsFile)) {
      fs.rmSync(contactsFile, { force: true });
    }
  } catch {}

  // 5. Eliminar respaldo cifrado en almacenamiento
  deleteSessionBackupFromStorage(lineaId);

  if (!generateNewQr) {
    return {
      success: true,
      lineaId,
      estado: 'DESCONECTADO',
      state: 'DISCONNECTED',
      session: resetState,
      message: 'Línea desvinculada y sesión eliminada con éxito',
    };
  }

  // 6 & 7. Iniciar nuevo socket en limpio y esperar hasta 8 segundos por el QR de Baileys
  try {
    initializeBaileysSocket(lineaId).catch((err) =>
      console.error(`[WhatsApp BRM Bridge] Error iniciando socket limpio (${lineaId}):`, err)
    );

    let waited = 0;
    while (
      !lineStatusMemory.get(lineaId)?.qrCodeDataUri &&
      lineStatusMemory.get(lineaId)?.estado !== 'CONECTADO' &&
      waited < 8000
    ) {
      await new Promise((r) => setTimeout(r, 200));
      waited += 200;
    }

    const current = getWhatsAppLineStatusHandler(lineaId);
    return {
      success: true,
      lineaId,
      estado: current.estado,
      state: current.state,
      qrCodeDataUri: current.qrCodeDataUri,
      session: current,
      message: 'Sesión purgada y nuevo código QR generado con éxito',
    };
  } catch (err: any) {
    const failedState = setLineState(lineaId, {
      estado: 'ERROR',
      state: 'DISCONNECTED',
      ultimoError: err?.message || String(err),
    });
    return {
      success: false,
      lineaId,
      estado: 'ERROR',
      state: 'DISCONNECTED',
      session: failedState,
      message: 'Error al forzar reinicio de QR',
      error: err?.message || String(err),
    };
  }
}

/**
 * Generación o Consulta de QR Auténtico de Baileys
 */
export async function generateQrCodeHandler(
  lineaId: string = DEFAULT_BRM_LINEA_ID,
  forceNew: boolean = false
): Promise<ActiveLineState & { success: boolean }> {
  qrRotationCounters.set(lineaId, 0);

  if (forceNew) {
    const res = await forceResetAndUnlinkSession(lineaId, true);
    return {
      success: res.success,
      ...res.session,
    };
  }

  const currentStatus = getWhatsAppLineStatusHandler(lineaId);
  if (currentStatus.estado === 'CONECTADO') {
    return {
      success: true,
      ...currentStatus,
    };
  }

  if (
    activeSockets.has(lineaId) &&
    currentStatus.estado === 'ESPERANDO_QR' &&
    currentStatus.qrCodeDataUri
  ) {
    return {
      success: true,
      ...currentStatus,
    };
  }

  try {
    setLineState(lineaId, {
      estado: 'ESPERANDO_QR',
      state: 'GENERATING_QR',
      ultimoError: undefined,
    });

    if (!activeSockets.has(lineaId)) {
      initializeBaileysSocket(lineaId).catch((err) => {
        console.error(
          `[WhatsApp BRM Bridge] Error inicializando Baileys (${lineaId}):`,
          err
        );
      });
    }

    let waited = 0;
    while (
      !lineStatusMemory.get(lineaId)?.qrCodeDataUri &&
      lineStatusMemory.get(lineaId)?.estado !== 'CONECTADO' &&
      waited < 8000
    ) {
      await new Promise((r) => setTimeout(r, 200));
      waited += 200;
    }

    const updated = getWhatsAppLineStatusHandler(lineaId);
    return {
      success: true,
      ...updated,
    };
  } catch (error: any) {
    const errState = setLineState(lineaId, {
      estado: 'ERROR',
      state: 'DISCONNECTED',
      ultimoError: error?.message || String(error),
    });
    return {
      success: false,
      ...errState,
    };
  }
}

/**
 * Solicitud de Código de Vinculación de 8 Dígitos (Pairing Code sin Cámara)
 */
export async function requestPairingCodeHandler(
  lineaId: string = DEFAULT_BRM_LINEA_ID,
  phoneRaw: string = ''
): Promise<ActiveLineState & { success: boolean; pairingCode?: string; error?: string }> {
  const phoneDigits = String(phoneRaw || '').replace(/\D/g, '');
  if (!phoneDigits || phoneDigits.length < 10) {
    const st = getWhatsAppLineStatusHandler(lineaId);
    return {
      ...st,
      success: false,
      error:
        'Debe ingresar un número de teléfono válido en formato E.164 (ej. +584121234567).',
    };
  }

  try {
    setLineState(lineaId, {
      estado: 'ESPERANDO_QR',
      state: 'GENERATING_QR',
      ultimoError: undefined,
    });

    const sock = activeSockets.get(lineaId) || (await initializeBaileysSocket(lineaId));
    await new Promise((r) => setTimeout(r, 1500));

    const rawCode = await sock.requestPairingCode(phoneDigits);
    const formattedCode = rawCode?.match(/.{1,4}/g)?.join('-') || rawCode;

    const updated = setLineState(lineaId, {
      estado: 'ESPERANDO_QR',
      state: 'QR_READY',
      pairingCode: formattedCode,
      qrTargetType: 'PAIRING_CODE',
    });

    return {
      ...updated,
      success: true,
      pairingCode: formattedCode,
    };
  } catch (err: any) {
    const current = getWhatsAppLineStatusHandler(lineaId);
    return {
      ...current,
      success: false,
      error: `No se pudo obtener el código de vinculación: ${err?.message || err}`,
    };
  }
}

/**
 * Envío Real de Mensajes (Texto, Imagen Base64, Audio/Nota de Voz Base64) con Soporte @lid
 */
export async function sendWhatsAppMessageHandler(
  lineaId: string = DEFAULT_BRM_LINEA_ID,
  toPhone: string,
  text: string,
  mediaDataUrl?: string,
  mediaType?: 'IMAGEN' | 'AUDIO' | 'DOCUMENTO',
  audioOptions?: { mimeType?: string; durationSeconds?: number; isPtt?: boolean }
) {
  const sock = activeSockets.get(lineaId);
  const status = getWhatsAppLineStatusHandler(lineaId);

  if (!sock || status.estado !== 'CONECTADO') {
    return {
      success: false,
      error: `La línea ${lineaId} no está vinculada actualmente. Escanee el código QR primero.`,
    };
  }

  const cleanDigits = String(toPhone || '').replace(/\D/g, '');
  if (!cleanDigits) {
    return {
      success: false,
      error: 'Número de destino inválido',
    };
  }

  const jid = `${cleanDigits}@s.whatsapp.net`;
  const targetLid = findLidForPhoneDigits(lineaId, cleanDigits);

  try {
    let sent;
    if (mediaDataUrl && mediaDataUrl.startsWith('data:audio/')) {
      const base64Data = mediaDataUrl.split(',')[1] || '';
      const audioBuffer = Buffer.from(base64Data, 'base64');
      const mimePart =
        audioOptions?.mimeType ||
        mediaDataUrl.substring(5, mediaDataUrl.indexOf(';')) ||
        'audio/ogg; codecs=opus';
      const sendJid =
        targetLid && cleanDigits.length > 13 ? targetLid : jid;

      sent = await sock.sendMessage(sendJid, {
        audio: audioBuffer,
        mimetype: mimePart,
        ptt: audioOptions?.isPtt !== false,
        seconds: audioOptions?.durationSeconds || undefined,
      });
    } else if (mediaDataUrl && mediaDataUrl.startsWith('data:image/')) {
      const base64Data = mediaDataUrl.split(',')[1] || '';
      const imgBuffer = Buffer.from(base64Data, 'base64');
      sent = await sock.sendMessage(jid, {
        image: imgBuffer,
        caption: text || '',
      });
    } else {
      sent = await sock.sendMessage(jid, { text });
    }

    const messageId = sent?.key?.id || `msg_${Date.now()}`;
    const outboundQueued: QueuedBridgeMessage = {
      id: messageId,
      lineaId,
      messageId,
      remitente: status.numeroConectado || 'LINEA_BRM',
      senderName: 'Compras / Tesorería BRM',
      destinatario: `+${cleanDigits}`,
      destinatarioNombre: undefined,
      direccion: 'SALIENTE',
      cuerpo:
        text ||
        (mediaType === 'AUDIO'
          ? '🎤 Nota de voz'
          : mediaType === 'IMAGEN'
          ? '📷 [Imagen Adjunta]'
          : '📄 [Documento]'),
      bodyText: text || '',
      tipoMensaje: mediaType || 'TEXTO',
      mediaUrl: mediaDataUrl,
      mediaMimeType: audioOptions?.mimeType,
      audioDurationSeconds: audioOptions?.durationSeconds,
      isPtt: audioOptions?.isPtt,
      timestamp: new Date().toISOString(),
      estadoEntrega: 'ENTREGADO',
    };
    saveMessageToDurableStore(outboundQueued);
    appendToLocalMessagesQueue(outboundQueued);

    return {
      success: true,
      messageId,
      timestamp: new Date().toISOString(),
    };
  } catch (error: any) {
    console.error(`[WhatsApp BRM Bridge] Error enviando mensaje a ${jid}:`, error);
    return {
      success: false,
      error: error?.message || 'Error al despachar mensaje por Baileys',
    };
  }
}

/**
 * Edición de Mensajes en Caliente (ProtocolMessage / MESSAGE_EDIT vía Baileys)
 * Refleja la modificación en el teléfono móvil Android y en la base duradera web.
 */
export async function editWhatsAppMessageHandler(
  lineaId: string = DEFAULT_BRM_LINEA_ID,
  targetMessageId: string,
  toPhone: string,
  newText: string
) {
  const sock = activeSockets.get(lineaId);
  const status = getWhatsAppLineStatusHandler(lineaId);

  if (!sock || status.estado !== 'CONECTADO') {
    return {
      success: false,
      error: `La línea ${lineaId} no está vinculada actualmente.`,
    };
  }

  const cleanDigits = String(toPhone || '').replace(/\D/g, '');
  if (!cleanDigits) {
    return { success: false, error: 'Número de destinatario inválido' };
  }

  const jid = `${cleanDigits}@s.whatsapp.net`;
  const targetLid = findLidForPhoneDigits(lineaId, cleanDigits);
  const sendJid = targetLid && cleanDigits.length > 13 ? targetLid : jid;

  try {
    const editKey = {
      remoteJid: sendJid,
      fromMe: true,
      id: targetMessageId,
    };

    await sock.sendMessage(sendJid, {
      text: newText,
      edit: editKey,
    });

    updateMessageTextInStoreAndQueue(lineaId, targetMessageId, newText);

    return {
      success: true,
      messageId: targetMessageId,
      newText,
      editedAt: new Date().toISOString(),
    };
  } catch (error: any) {
    console.error(`[WhatsApp BRM Bridge] Error editando mensaje ${targetMessageId}:`, error);
    return {
      success: false,
      error: error?.message || 'Error al editar mensaje en Baileys',
    };
  }
}

/**
 * Eliminación Asimétrica de Conversación (Web -> Móvil opcional, Móvil -> Web sin eco)
 */
export async function deleteWhatsAppChatHandler(
  lineaId: string = DEFAULT_BRM_LINEA_ID,
  contactPhone: string,
  syncToSocket: boolean = true
) {
  const cleanDigits = String(contactPhone || '').replace(/\D/g, '');
  if (!cleanDigits) {
    return { success: false, error: 'Número de proveedor inválido para eliminar chat' };
  }

  let deletedFromLocalQueue = 0;
  let syncedWithWhatsAppDevice = false;

  // 1. Limpiar de la cola local de mensajes pendientes
  try {
    if (fs.existsSync(PENDING_MESSAGES_QUEUE_FILE)) {
      const queue: QueuedBridgeMessage[] = JSON.parse(
        fs.readFileSync(PENDING_MESSAGES_QUEUE_FILE, 'utf-8')
      );
      if (Array.isArray(queue)) {
        const filtered = queue.filter((m) => {
          if (m.lineaId && m.lineaId !== lineaId) return true;
          const remDigits = String(m.remitente || '').replace(/\D/g, '');
          const destDigits = String(m.destinatario || '').replace(/\D/g, '');
          const match =
            remDigits === cleanDigits ||
            destDigits === cleanDigits ||
            remDigits.endsWith(cleanDigits) ||
            destDigits.endsWith(cleanDigits);
          if (match) deletedFromLocalQueue++;
          return !match;
        });
        fs.writeFileSync(
          PENDING_MESSAGES_QUEUE_FILE,
          JSON.stringify(filtered, null, 2),
          'utf-8'
        );
      }
    }
  } catch (err) {
    console.warn('[WhatsApp BRM Bridge] Aviso limpiando cola local en delete-chat:', err);
  }

  // 2. Sincronizar con el socket si fue iniciado desde la app y la sesión está activa
  if (syncToSocket) {
    const sock = activeSockets.get(lineaId);
    const status = getWhatsAppLineStatusHandler(lineaId);
    if (sock && status.estado === 'CONECTADO') {
      try {
        const jid = `${cleanDigits}@s.whatsapp.net`;
        await sock.chatModify(
          {
            delete: true,
            lastMessages: [
              {
                key: { remoteJid: jid, fromMe: true, id: 'CLEAR_CHAT' },
                messageTimestamp: Math.floor(Date.now() / 1000),
              },
            ],
          },
          jid
        );
        syncedWithWhatsAppDevice = true;
      } catch (err: any) {
        const errMsg = String(err?.message || err || '');
        if (!errMsg.includes('rate-overlimit') && err?.data !== 429) {
          console.warn(
            `[WhatsApp BRM Bridge] Aviso al sincronizar borrado en dispositivo (${cleanDigits}):`,
            errMsg
          );
        }
      }
    }
  }

  return {
    success: true,
    lineaId,
    contactPhone: `+${cleanDigits}`,
    deletedFromLocalQueue,
    syncedWithWhatsAppDevice,
  };
}

/**
 * Auto-Restauración Silenciosa de Sesiones Existentes al Arrancar el Servidor
 */
export async function autoRestoreExistingSessions(): Promise<void> {
  try {
    const store = readEncryptedBackupStore();
    for (const lineaId of Object.keys(store)) {
      const localCreds = path.join(SESSIONS_ROOT, lineaId, 'creds.json');
      if (!fs.existsSync(localCreds)) {
        await restoreSessionFromStorage(lineaId);
      }
    }

    if (!fs.existsSync(SESSIONS_ROOT)) return;
    const entries = fs.readdirSync(SESSIONS_ROOT, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const lineaId = entry.name;
        const credsFile = path.join(SESSIONS_ROOT, lineaId, 'creds.json');
        if (fs.existsSync(credsFile) && !activeSockets.has(lineaId)) {
          console.log(
            `[WhatsApp BRM Bridge] Auto-restaurando sesión previa para ${lineaId}...`
          );
          initializeBaileysSocket(lineaId).catch((err) =>
            console.error(`Error auto-restaurando ${lineaId}:`, err)
          );
        }
      }
    }
  } catch (err) {
    console.error('[WhatsApp BRM Bridge] Error en autoRestoreExistingSessions:', err);
  }
}

// ============================================================================
// 6. HELPERS DE CERTIFICACIÓN Y PRUEBAS DE ESTRÉS (@QA)
// ============================================================================

/**
 * Inyecta un estado inconsistente en memoria (ej. estado CONECTADO sin socket abierto)
 * para certificar que getWhatsAppLineStatusHandler aplica autorreparación SSoT Anti-Split-Brain.
 */
export function simulateCorruptedSplitBrainStateForTest(
  lineaId: string,
  fakeConnectedPhone: string = '+584149999999'
): void {
  lineStatusMemory.set(lineaId, {
    lineaId,
    estado: 'CONECTADO',
    state: 'CONNECTED',
    activeMode: 'QR_SOCKET_BRIDGE',
    numeroConectado: fakeConnectedPhone,
    corporatePhoneE164: fakeConnectedPhone,
    lastHeartbeatVet: formatVetTimestamp(),
    actualizadoEn: new Date().toISOString(),
  });
}

/**
 * Ejecuta deterministamente un paso de rotación de QR para certificar el Cortacircuitos
 * (5 rotaciones permitidas en ESPERANDO_QR -> 6ta rotación activa QR_EXPIRADO y limpia QR).
 */
export async function simulateQrRotationStepForTest(
  lineaId: string,
  rawQrToken: string
): Promise<ActiveLineState> {
  const rotations = (qrRotationCounters.get(lineaId) || 0) + 1;
  qrRotationCounters.set(lineaId, rotations);

  if (rotations > MAX_QR_ROTATIONS) {
    qrRotationCounters.set(lineaId, 0);
    return setLineState(lineaId, {
      estado: 'QR_EXPIRADO',
      state: 'QR_EXPIRADO',
      qrCodeDataUri: undefined,
      qrPayloadData: undefined,
      qrRotations: MAX_QR_ROTATIONS,
      ultimoError:
        'El código QR expiró por inactividad tras 5 rotaciones. Haz clic en "Refrescar Código QR" para generar uno nuevo.',
    });
  }

  const qrDataUri = await QRCode.toDataURL(rawQrToken, {
    margin: 2,
    scale: 8,
    color: { dark: '#000000', light: '#ffffff' },
  });

  return setLineState(lineaId, {
    estado: 'ESPERANDO_QR',
    state: 'QR_READY',
    qrCodeDataUri: qrDataUri,
    qrPayloadData: rawQrToken,
    qrTargetType: 'NOISE_PAIRING',
    qrRotations: rotations,
    qrGeneratedAtVet: formatVetTimestamp(),
    ultimoError: undefined,
  });
}

/**
 * Desempaqueta cualquier mensaje anidado de Baileys (ephemeralMessage, viewOnceMessage, etc.)
 * y genera el descriptor normalizado de Nota de Voz / Audio / Imagen / Texto sin burbujas vacías.
 */
export function extractNestedBaileysMessageDescriptor(rawMsg: Record<string, any>): {
  tipoMensaje: 'TEXTO' | 'IMAGEN' | 'DOCUMENTO' | 'AUDIO';
  cuerpo: string;
  isPtt: boolean;
  audioDurationSeconds: number;
  mimeType?: string;
} {
  const innerMessage =
    rawMsg?.ephemeralMessage?.message ||
    rawMsg?.viewOnceMessage?.message ||
    rawMsg?.viewOnceMessageV2?.message ||
    rawMsg?.documentWithCaptionMessage?.message ||
    rawMsg ||
    {};

  const textBody =
    innerMessage.conversation ||
    innerMessage.extendedTextMessage?.text ||
    innerMessage.imageMessage?.caption ||
    innerMessage.videoMessage?.caption ||
    innerMessage.documentMessage?.caption ||
    '';

  const hasImage = Boolean(innerMessage.imageMessage);
  const hasDoc = Boolean(innerMessage.documentMessage);
  const hasAudio = Boolean(innerMessage.audioMessage);

  const audioDurationSeconds = Number(innerMessage.audioMessage?.seconds || 0);
  const isPtt = Boolean(innerMessage.audioMessage?.ptt);

  const formatAudioDuration = (sec?: number) => {
    if (!sec || sec <= 0) return '';
    const mins = Math.floor(sec / 60);
    const rem = sec % 60;
    return ` (${mins}:${rem < 10 ? '0' : ''}${rem})`;
  };

  const defaultCuerpo = hasImage
    ? '📷 [Imagen / Factura o Comprobante Adjunto]'
    : hasDoc
    ? `📄 [Documento: ${innerMessage.documentMessage?.fileName || 'Archivo'}]`
    : hasAudio
    ? `${isPtt ? '🎤 Nota de voz' : '🎵 Mensaje de audio'}${formatAudioDuration(
        audioDurationSeconds
      )}`
    : '';

  return {
    tipoMensaje: hasImage
      ? 'IMAGEN'
      : hasDoc
      ? 'DOCUMENTO'
      : hasAudio
      ? 'AUDIO'
      : 'TEXTO',
    cuerpo: textBody || defaultCuerpo,
    isPtt,
    audioDurationSeconds,
    mimeType:
      innerMessage.audioMessage?.mimetype ||
      innerMessage.imageMessage?.mimetype ||
      innerMessage.documentMessage?.mimetype,
  };
}

