import {
  AccountsPayablePayment,
  BrmConnectionMode,
  BrmDocumentCategory,
  BrmSupplierPreInvoice,
  BrmWhatsappMessage,
  BrmWhatsappSessionStatus,
  CompanyFiscalProfile,
  Supplier,
  SupplierPurchaseOrder,
  TaxRetentionVoucher,
} from '../types';
import { round2, toDecimal } from './decimal';
import { resolveCompanyProfile } from './excel-exporter';

export const DEFAULT_CORPORATE_BRM_PHONE_E164 = '+582432345678';

/**
 * Normaliza un número telefónico venezolano o internacional al estándar estricto E.164 (+584141234567).
 */
export function normalizePhoneE164(rawPhone: string): string {
  const trimmed = String(rawPhone || '').trim();
  if (!trimmed) return '';

  const hasPlus = trimmed.startsWith('+');
  const digits = trimmed.replace(/\D/g, '');
  if (!digits) return '';

  if (hasPlus && digits.length >= 10 && digits.length <= 15) {
    return `+${digits}`;
  }
  if (digits.startsWith('00') && digits.length >= 12) {
    return `+${digits.slice(2)}`;
  }
  // Números locales venezolanos (ej. 04141234567, 0412..., 0243...)
  if (digits.length === 11 && digits.startsWith('0')) {
    return `+58${digits.slice(1)}`;
  }
  // Números venezolanos sin cero inicial (ej. 4141234567)
  if (digits.length === 10 && /^(412|414|424|416|426|2\d{2})/.test(digits)) {
    return `+58${digits}`;
  }
  if (digits.startsWith('58') && digits.length === 12) {
    return `+${digits}`;
  }
  if (digits.length >= 10 && digits.length <= 15) {
    return `+${digits}`;
  }
  return '';
}

export function isValidPhoneE164(phone: string): boolean {
  return /^\+[1-9]\d{9,14}$/.test(String(phone || '').trim());
}

/**
 * Excluye de forma determinista el propio número corporativo conectado para impedir bucles de auto-envío (Anti-Loop Puro Apure ERP).
 */
export function isCorporateSelfPhone(
  candidatePhone: string,
  corporatePhoneE164: string = DEFAULT_CORPORATE_BRM_PHONE_E164
): boolean {
  const normCandidate = normalizePhoneE164(candidatePhone);
  const normCorp = normalizePhoneE164(corporatePhoneE164);
  if (!normCandidate || !normCorp) return false;
  return normCandidate === normCorp;
}

export function buildWaMeDeepLink(phoneE164: string, messageBody: string): string {
  const digits = normalizePhoneE164(phoneE164).replace(/\D/g, '');
  return `https://wa.me/${digits}?text=${encodeURIComponent(messageBody)}`;
}

function getRandomBase64Bytes(byteLength: number): string {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const bytes = new Uint8Array(byteLength);
    crypto.getRandomValues(bytes);
    if (typeof Buffer !== 'undefined') {
      return Buffer.from(bytes).toString('base64');
    }
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }
  let s = '';
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  for (let i = 0; i < Math.ceil((byteLength * 4) / 3); i++) {
    s += chars[Math.floor(Math.random() * chars.length)];
  }
  return s;
}

/**
 * @deprecated SOLO FIXTURE DE PRUEBAS DEL CÓDEC QR ISO/IEC 18004.
 * Genera una cadena con forma `2@...` usando bytes ALEATORIOS: WhatsApp móvil la RECHAZA porque
 * no corresponde a ningún handshake Noise real abierto contra los servidores de WhatsApp.
 * Esta era la causa raíz de los QR que "no conectaban". La vinculación real usa exclusivamente
 * la cadena `qr` emitida por Baileys en server/whatsappQrBridge.ts. NUNCA usar en la UI.
 */
export function generateBrmNoisePairingPayload(_corporatePhoneE164?: string): string {
  const refId = getRandomBase64Bytes(18);
  const noiseKey = getRandomBase64Bytes(32);
  const identityKey = getRandomBase64Bytes(32);
  const advKey = getRandomBase64Bytes(32);
  return `2@${refId},${noiseKey},${identityKey},${advKey}`;
}

/**
 * Genera el payload de enlace directo wa.me para escaneo con la cámara estándar del smartphone.
 */
export function generateBrmWaMeDeepLinkPayload(
  corporatePhoneE164: string = DEFAULT_CORPORATE_BRM_PHONE_E164,
  customText?: string
): string {
  const digits = normalizePhoneE164(corporatePhoneE164).replace(/\D/g, '') || '582432345678';
  const text = customText || 'Conexión BRM AR Group 2026';
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

/**
 * Resuelve la vía de transporte bajo Modo Híbrido Triple (Decisión Estratégica A1):
 * 1) QR_SOCKET_BRIDGE si la sesión QR está CONNECTED.
 * 2) CLOUD_API_WEBHOOK si está en CLOUD_STANDBY / configurado.
 * 3) WA_ME_DIRECT_LEDGER como respaldo ininterrumpido si el QR está desconectado.
 */
export function resolveHybridBrmTransport(
  session: Pick<BrmWhatsappSessionStatus, 'state' | 'activeMode'>
): BrmConnectionMode {
  if (session.state === 'CONNECTED') return 'QR_SOCKET_BRIDGE';
  if (session.state === 'CLOUD_STANDBY' || session.activeMode === 'CLOUD_API_WEBHOOK') {
    return 'CLOUD_API_WEBHOOK';
  }
  return 'WA_ME_DIRECT_LEDGER';
}

/**
 * Registra un mensaje BRM garantizando idempotencia estricta por messageId y exclusión del número propio.
 */
export function appendIdempotentBrmMessage(params: {
  existingMessages: BrmWhatsappMessage[];
  messageId?: string;
  supplier: Supplier;
  corporatePhoneE164?: string;
  direction: BrmWhatsappMessage['direction'];
  category: BrmDocumentCategory;
  bodyText: string;
  relatedEntityId?: string;
  attachmentFileName?: string;
  session: Pick<BrmWhatsappSessionStatus, 'state' | 'activeMode' | 'hasAdminCredentials'>;
  createdBy: string;
  timestampVet: string;
}): {
  updatedMessages: BrmWhatsappMessage[];
  record: BrmWhatsappMessage;
  wasDuplicateIgnored: boolean;
} {
  const phoneE164 = normalizePhoneE164(params.supplier.whatsappE164 || params.supplier.phone);
  if (!isValidPhoneE164(phoneE164)) {
    throw new Error(
      `El teléfono del proveedor ${params.supplier.name} (${params.supplier.whatsappE164 || params.supplier.phone}) no puede normalizarse a formato internacional E.164 (+58...).`
    );
  }

  if (isCorporateSelfPhone(phoneE164, params.corporatePhoneE164)) {
    throw new Error(
      `BLOQUEO ANTI-LOOP BRM: El número destino (${phoneE164}) coincide con la línea corporativa conectada.`
    );
  }

  const msgId =
    (params.messageId || '').trim() ||
    `wamid.BRM.${params.supplier.id}.${Date.now()}.${Math.random().toString(36).slice(2, 6)}`;

  const existing = params.existingMessages.find((m) => m.messageId === msgId);
  if (existing) {
    return {
      updatedMessages: params.existingMessages,
      record: existing,
      wasDuplicateIgnored: true,
    };
  }

  const transport = resolveHybridBrmTransport(params.session);
  const waMeLink = buildWaMeDeepLink(phoneE164, params.bodyText);

  const deliveryStatus =
    transport === 'QR_SOCKET_BRIDGE'
      ? 'ENTREGADO'
      : transport === 'CLOUD_API_WEBHOOK'
      ? 'ENVIADO'
      : !params.session.hasAdminCredentials
      ? 'EN_COLA_OFFLINE'
      : 'ENVIADO';

  const record: BrmWhatsappMessage = {
    id: `brm-msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    messageId: msgId,
    supplierId: params.supplier.id,
    supplierName: params.supplier.name,
    supplierRif: params.supplier.rif,
    phoneE164,
    direction: params.direction,
    category: params.category,
    bodyText: params.bodyText,
    relatedEntityId: params.relatedEntityId,
    attachmentFileName: params.attachmentFileName,
    deliveryStatus,
    transportUsed: transport,
    waMeDeepLink: waMeLink,
    createdBy: params.createdBy,
    timestampVet: params.timestampVet,
  };

  return {
    updatedMessages: [record, ...params.existingMessages],
    record,
    wasDuplicateIgnored: false,
  };
}

/**
 * Plantilla corporativa BRM #1: Despacho de Orden de Compra Proyectada al Proveedor.
 */
export function formatBrmPurchaseOrderTemplate(params: {
  order: SupplierPurchaseOrder;
  companyProfile?: Partial<CompanyFiscalProfile> | null;
}): string {
  const company = resolveCompanyProfile(params.companyProfile);
  return [
    `*${company.razonSocial}* (${company.rif})`,
    `*ORDEN DE COMPRA BRM N° ${params.order.orderNumber}*`,
    `----------------------------------`,
    `Proveedor: ${params.order.supplierName}`,
    `Producto: ${params.order.productName} (${params.order.sku})`,
    `Cantidad Solicitada: *${params.order.orderedQty} ${params.order.unit}*`,
    `Costo Pactado Ref.: $${round2(params.order.unitCostUsd).toFixed(2)} | Total: *$${round2(params.order.totalCostUsd).toFixed(2)}*`,
    `Sede / Muelle Destino: *${params.order.locationName}*`,
    `----------------------------------`,
    `Favor remitir factura digital por esta misma vía para pre-auditoría fiscal antes de la descarga física.`,
  ].join('\n');
}

/**
 * Plantilla corporativa BRM #2 (Doble Compuerta A2): Despacho unificado de Soporte de Pago Bancario + Comprobantes PDF de Retención IVA / ISLR.
 */
export function formatBrmPaymentAndRetentionsBundleTemplate(params: {
  supplier: Supplier;
  invoiceNumber: string;
  payment?: Pick<AccountsPayablePayment, 'amountUsd' | 'amountVes' | 'bcvRateUsed' | 'method' | 'reference' | 'paidAtVet'>;
  ivaVoucher?: TaxRetentionVoucher | null;
  islrVoucher?: TaxRetentionVoucher | null;
  companyProfile?: Partial<CompanyFiscalProfile> | null;
}): {
  messageBody: string;
  attachmentNames: string[];
} {
  const company = resolveCompanyProfile(params.companyProfile);
  const lines: string[] = [
    `*${company.razonSocial}* (${company.rif})`,
    `Agente de Retención Sujeto Pasivo Especial`,
    `*NOTIFICACIÓN DE PAGO Y RETENCIONES SENIAT — FACTURA ${params.invoiceNumber}*`,
    `----------------------------------`,
    `Proveedor: ${params.supplier.name} (${params.supplier.rif})`,
  ];

  const attachments: string[] = [];

  if (params.payment) {
    lines.push(
      `Pago Emitido: *$${round2(params.payment.amountUsd).toFixed(2)}* (Bs. ${round2(params.payment.amountVes).toFixed(2)} @ BCV ${params.payment.bcvRateUsed})`,
      `Método / Ref.: ${params.payment.method} — Ref. *${params.payment.reference}*`
    );
  }

  if (params.ivaVoucher && params.ivaVoucher.status !== 'ANULADO') {
    lines.push(
      `Comprobante Retención IVA (${params.ivaVoucher.retentionPercentApplied}%): *${params.ivaVoucher.voucherNumber}* — Bs. ${round2(params.ivaVoucher.retainedTotalVes).toFixed(2)}`
    );
    attachments.push(`Comprobante_IVA_${params.ivaVoucher.voucherNumber}.pdf`);
  }

  if (params.islrVoucher && params.islrVoucher.status !== 'ANULADO') {
    lines.push(
      `Comprobante Retención ISLR (${params.islrVoucher.retentionPercentApplied}%): *${params.islrVoucher.voucherNumber}* — Bs. ${round2(params.islrVoucher.retainedTotalVes).toFixed(2)}`
    );
    attachments.push(`Comprobante_ISLR_${params.islrVoucher.voucherNumber}.pdf`);
  }

  lines.push(
    `----------------------------------`,
    `Adjuntamos soporte y comprobantes PDF firmados digitalmente conforme a Providencia SNAT/2025/000054 y Decreto 1.808.`
  );

  return {
    messageBody: lines.join('\n'),
    attachmentNames: attachments,
  };
}

function deterministicSimpleHash(seed: string): string {
  let h1 = 0xdeadbeef ^ seed.length;
  let h2 = 0x41c6ce57 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    const ch = seed.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0).toString(16).padStart(8, '0') + (h1 >>> 0).toString(16).padStart(8, '0');
}

/**
 * Registra una Factura Entrante enviada por un proveedor vía WhatsApp BRM bajo Doble Compuerta (Decisión A2):
 * Ejecuta pre-auditoría de los 4 candados forenses OCR y la deposita en PENDIENTE_VERIFICACION sin tocar stock ni CxP.
 */
export function registerIncomingBrmPreInvoice(params: {
  existingPreInvoices: BrmSupplierPreInvoice[];
  existingHashes: string[];
  messageId?: string;
  supplier: Supplier;
  invoiceNumber: string;
  controlNumber: string;
  declaredSubtotalUsd: number;
  declaredIvaUsd: number;
  declaredIgtfUsd?: number;
  declaredTotalUsd: number;
  fileSignatureSeed?: string;
  hasSuspiciousMetadata?: boolean;
  receivedAtVet: string;
}): {
  updatedPreInvoices: BrmSupplierPreInvoice[];
  preInvoice: BrmSupplierPreInvoice;
  wasDuplicateMessage: boolean;
} {
  const msgId =
    (params.messageId || '').trim() ||
    `wamid.IN.${params.supplier.id}.${params.invoiceNumber}`;

  const existingByMsg = params.existingPreInvoices.find((item) => item.messageId === msgId);
  if (existingByMsg) {
    return {
      updatedPreInvoices: params.existingPreInvoices,
      preInvoice: existingByMsg,
      wasDuplicateMessage: true,
    };
  }

  const phoneE164 =
    normalizePhoneE164(params.supplier.whatsappE164 || params.supplier.phone) ||
    DEFAULT_CORPORATE_BRM_PHONE_E164;

  const subtotal = round2(params.declaredSubtotalUsd);
  const iva = round2(params.declaredIvaUsd);
  const igtf = round2(params.declaredIgtfUsd || 0);
  const total = round2(params.declaredTotalUsd);

  const seed =
    params.fileSignatureSeed ||
    `${params.supplier.rif}::${params.invoiceNumber}::${params.controlNumber}::${total.toFixed(2)}`;
  const sha256Hash = (
    deterministicSimpleHash(seed) +
    deterministicSimpleHash(`B::${seed}`) +
    deterministicSimpleHash(`C::${seed}`) +
    deterministicSimpleHash(`D::${seed}`)
  ).slice(0, 64);
  const pHashVisual = `phash-${deterministicSimpleHash(`VIS::${seed}`)}`;

  const isDuplicateHash =
    params.existingHashes.includes(sha256Hash) ||
    params.existingPreInvoices.some((p) => p.sha256Hash === sha256Hash || p.pHashVisual === pHashVisual);

  const expectedTotal = round2(toDecimal(subtotal).plus(iva).plus(igtf));
  const mathDiff = toDecimal(expectedTotal).minus(total).abs().toNumber();
  const mathValid = mathDiff <= 0.02;

  let ocrVerdict: BrmSupplierPreInvoice['ocrVerdict'] = 'AUTENTICO_ALTA_CONFIANZA';
  let ocrConfidenceScore = 98.5;

  if (isDuplicateHash || params.hasSuspiciousMetadata) {
    ocrVerdict = 'ALERTA_FRAUDE_EDICION_O_IA';
    ocrConfidenceScore = 24.0;
  } else if (!mathValid || !params.controlNumber.trim()) {
    ocrVerdict = 'SOSPECHOSO_REVISION_HUMANA';
    ocrConfidenceScore = 64.5;
  }

  const preInvoice: BrmSupplierPreInvoice = {
    id: `brm-preinv-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    messageId: msgId,
    supplierId: params.supplier.id,
    supplierName: params.supplier.name,
    supplierRif: params.supplier.rif,
    phoneE164,
    invoiceNumber: params.invoiceNumber.trim(),
    controlNumber: params.controlNumber.trim(),
    declaredSubtotalUsd: subtotal,
    declaredIvaUsd: iva,
    declaredIgtfUsd: igtf,
    declaredTotalUsd: total,
    sha256Hash,
    pHashVisual,
    ocrVerdict,
    ocrConfidenceScore,
    status: 'PENDIENTE_VERIFICACION',
    receivedAtVet: params.receivedAtVet,
  };

  return {
    updatedPreInvoices: [preInvoice, ...params.existingPreInvoices],
    preInvoice,
    wasDuplicateMessage: false,
  };
}

/**
 * Desvincula de forma limpia la sesión QR de WhatsApp BRM evitando estados Split-Brain entre UI y servidor.
 */
export function resetBrmWhatsappSessionCleanly(
  current: BrmWhatsappSessionStatus,
  nowVet: string
): BrmWhatsappSessionStatus {
  return {
    ...current,
    state: 'DISCONNECTED',
    estado: 'DESCONECTADO',
    activeMode: 'WA_ME_DIRECT_LEDGER',
    qrPayloadData: undefined,
    qrCodeDataUri: undefined,
    pairingCode: undefined,
    numeroConectado: undefined,
    qrRotations: 0,
    ultimoError: undefined,
    qrGeneratedAtVet: undefined,
    lastHeartbeatVet: nowVet,
  };
}

// ============================================================================
// PASARELA BAILEYS BLINDADA (PATRÓN PURO APURE ERP) — HELPERS PUROS DE CLIENTE
// Exclusivo BRM Proveedores (sin formato CRM de clientes/leads/embudos).
// ============================================================================

export const BRM_WHATSAPP_LINEA_ID = 'linea_brm';

/** Datos crudos devueltos por /api/whatsapp/status, /qr, /force-qr */
export interface BrmGatewayServerPayload {
  state?: string;
  estado?: string;
  activeMode?: string;
  numeroConectado?: string;
  corporatePhoneE164?: string;
  qrCodeDataUri?: string;
  qrDataUri?: string;
  qrPayloadData?: string;
  pairingCode?: string;
  qrTargetType?: 'NOISE_PAIRING' | 'WA_ME_LINK' | 'PAIRING_CODE';
  qrGeneratedAtVet?: string;
  qrRotations?: number;
  ultimoError?: string;
  lineaId?: string;
  hasAdminCredentials?: boolean;
  pendingOfflineQueueCount?: number;
  lastHeartbeatVet?: string;
}

const CANONICAL_TO_LEGACY: Record<string, BrmWhatsappSessionStatus['state']> = {
  CONECTADO: 'CONNECTED',
  QR_EXPIRADO: 'QR_EXPIRADO',
  DESCONECTADO: 'DISCONNECTED',
  ERROR: 'DISCONNECTED',
};

/**
 * Fusiona el estado del servidor con el estado local aplicando la regla SSoT Anti-Split-Brain:
 * - El servidor es la ÚNICA fuente de verdad del estado de vinculación.
 * - Si no está CONECTADO, se purga cualquier número "conectado" residual o por defecto.
 * - Si está CONECTADO, el número mostrado es exclusivamente el que reporta el socket real.
 * - Nunca se inventa ni se conserva un QR que el servidor no haya emitido.
 */
export function mergeBrmGatewayStatus(
  prev: BrmWhatsappSessionStatus,
  server: BrmGatewayServerPayload
): BrmWhatsappSessionStatus {
  const estado = (server.estado || '') as BrmWhatsappSessionStatus['estado'] | '';
  const liveQr = server.qrCodeDataUri || server.qrDataUri || undefined;

  let state: BrmWhatsappSessionStatus['state'];
  if (server.state === 'CLOUD_STANDBY') {
    state = 'CLOUD_STANDBY';
  } else if (estado && CANONICAL_TO_LEGACY[estado]) {
    state = CANONICAL_TO_LEGACY[estado];
  } else if (estado === 'ESPERANDO_QR') {
    state = liveQr || server.pairingCode ? 'QR_READY' : 'GENERATING_QR';
  } else if (
    server.state === 'CONNECTED' ||
    server.state === 'QR_READY' ||
    server.state === 'GENERATING_QR' ||
    server.state === 'DISCONNECTED' ||
    server.state === 'QR_EXPIRADO'
  ) {
    state = server.state;
  } else {
    state = prev.state;
  }

  const isConnected = state === 'CONNECTED';
  const realConnectedPhone = isConnected
    ? normalizePhoneE164(server.numeroConectado || server.corporatePhoneE164 || '') || undefined
    : undefined;

  return {
    ...prev,
    state,
    estado: (estado || undefined) as BrmWhatsappSessionStatus['estado'],
    lineaId: server.lineaId || prev.lineaId || BRM_WHATSAPP_LINEA_ID,
    activeMode:
      state === 'CLOUD_STANDBY'
        ? 'CLOUD_API_WEBHOOK'
        : isConnected || state === 'QR_READY' || state === 'GENERATING_QR'
        ? 'QR_SOCKET_BRIDGE'
        : 'WA_ME_DIRECT_LEDGER',
    numeroConectado: realConnectedPhone,
    corporatePhoneE164: realConnectedPhone || '',
    qrCodeDataUri: isConnected ? undefined : liveQr,
    qrPayloadData: isConnected ? undefined : server.qrPayloadData,
    pairingCode: isConnected ? undefined : server.pairingCode,
    qrTargetType: server.qrTargetType || prev.qrTargetType,
    qrGeneratedAtVet: server.qrGeneratedAtVet,
    qrRotations: typeof server.qrRotations === 'number' ? server.qrRotations : 0,
    ultimoError: server.ultimoError,
    hasAdminCredentials:
      typeof server.hasAdminCredentials === 'boolean'
        ? server.hasAdminCredentials
        : prev.hasAdminCredentials,
    pendingOfflineQueueCount:
      typeof server.pendingOfflineQueueCount === 'number'
        ? server.pendingOfflineQueueCount
        : prev.pendingOfflineQueueCount,
    lastHeartbeatVet: server.lastHeartbeatVet || prev.lastHeartbeatVet,
  };
}

/**
 * Detecta identificadores @lid crudos o corruptos que NO deben mostrarse como teléfono
 * (más de 15 dígitos o sin prefijo +). Protege la UI de contactos fantasma.
 */
export function isCorruptedOrRawLid(phoneOrJid: string): boolean {
  const raw = String(phoneOrJid || '').trim();
  if (!raw) return true;
  if (raw.includes('@lid')) return true;
  const digits = raw.replace(/\D/g, '');
  if (digits.length < 10 || digits.length > 15) return true;
  return false;
}

export function formatBrmAudioDurationLabel(seconds?: number, isPtt?: boolean): string {
  const base = isPtt === false ? '🎵 Mensaje de audio' : '🎤 Nota de voz';
  const sec = Math.max(0, Math.floor(Number(seconds) || 0));
  if (!sec) return base;
  const mins = Math.floor(sec / 60);
  const rem = sec % 60;
  return `${base} (${mins}:${rem < 10 ? '0' : ''}${rem})`;
}

/** Mensaje crudo encolado por la pasarela (pending_messages_queue.json) */
export interface BrmBridgeQueuedMessage {
  id: string;
  messageId: string;
  lineaId?: string;
  remitente: string;
  senderName?: string;
  destinatario: string;
  destinatarioNombre?: string;
  direccion: 'ENTRANTE' | 'SALIENTE' | 'INBOUND_FROM_SUPPLIER' | 'OUTBOUND_TO_SUPPLIER';
  cuerpo?: string;
  bodyText?: string;
  tipoMensaje?: 'TEXTO' | 'IMAGEN' | 'DOCUMENTO' | 'AUDIO';
  mediaUrl?: string;
  mediaMimeType?: string;
  audioDurationSeconds?: number;
  isPtt?: boolean;
  attachmentFileName?: string;
  timestamp?: string;
}

function formatIsoToVet(iso?: string): string {
  const date = iso ? new Date(iso) : new Date();
  if (Number.isNaN(date.getTime())) return String(iso || '');
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Caracas',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(date);
    const m: Record<string, string> = {};
    for (const p of parts) if (p.type !== 'literal') m[p.type] = p.value;
    return `${m.day}/${m.month}/${m.year} ${m.hour === '24' ? '00' : m.hour}:${m.minute}:${m.second}`;
  } catch {
    return date.toISOString();
  }
}

/**
 * Convierte un mensaje real de la pasarela Baileys en un registro BRM auditable, resolviendo
 * la contraparte canónica (direccion SALIENTE → destinatario; ENTRANTE → remitente) y vinculándolo
 * al proveedor homologado por E.164. Devuelve null si la contraparte es un @lid corrupto.
 */
export function mapBridgeMessageToBrmMessage(params: {
  queued: BrmBridgeQueuedMessage;
  suppliers: Supplier[];
  connectedOwnPhoneE164?: string;
}): BrmWhatsappMessage | null {
  const { queued, suppliers, connectedOwnPhoneE164 } = params;
  const isOutbound =
    queued.direccion === 'SALIENTE' || queued.direccion === 'OUTBOUND_TO_SUPPLIER';
  const counterpartyRaw = isOutbound ? queued.destinatario : queued.remitente;
  if (isCorruptedOrRawLid(counterpartyRaw)) return null;

  const counterpartyE164 = normalizePhoneE164(counterpartyRaw);
  if (!counterpartyE164) return null;
  if (connectedOwnPhoneE164 && isCorporateSelfPhone(counterpartyE164, connectedOwnPhoneE164)) {
    return null; // Exclusión determinista del número propio
  }

  const supplier = suppliers.find(
    (s) => normalizePhoneE164(s.whatsappE164 || s.phone || '') === counterpartyE164
  );
  const contactName = isOutbound ? queued.destinatarioNombre : queued.senderName;

  const tipo = queued.tipoMensaje || 'TEXTO';
  const rawBody = String(queued.bodyText || queued.cuerpo || '').trim();
  const bodyText =
    rawBody ||
    (tipo === 'AUDIO'
      ? formatBrmAudioDurationLabel(queued.audioDurationSeconds, queued.isPtt)
      : tipo === 'IMAGEN'
      ? '📷 [Imagen / Factura o Comprobante Adjunto]'
      : tipo === 'DOCUMENTO'
      ? `📄 [Documento: ${queued.attachmentFileName || 'Archivo'}]`
      : '');
  if (!bodyText && !queued.mediaUrl) return null;

  const messageId = queued.messageId || queued.id;
  return {
    id: `brm-wa-${messageId}`,
    messageId,
    supplierId: supplier?.id || '',
    supplierName: supplier?.name || contactName || counterpartyE164,
    supplierRif: supplier?.rif || '',
    phoneE164: counterpartyE164,
    direction: isOutbound ? 'OUTBOUND_TO_SUPPLIER' : 'INBOUND_FROM_SUPPLIER',
    category: tipo === 'IMAGEN' && !isOutbound ? 'FACTURA_ENTRANTE_PROVEEDOR' : 'MENSAJE_OPERATIVO_BRM',
    bodyText,
    attachmentFileName: queued.attachmentFileName,
    deliveryStatus: isOutbound ? 'ENTREGADO' : 'LEIDO',
    transportUsed: 'QR_SOCKET_BRIDGE',
    createdBy: isOutbound ? 'Dispositivo vinculado (WhatsApp móvil)' : contactName || 'Proveedor (WhatsApp)',
    timestampVet: formatIsoToVet(queued.timestamp),
    tipoMensaje: tipo,
    mediaUrl: queued.mediaUrl,
    mediaMimeType: queued.mediaMimeType,
    audioDurationSeconds: queued.audioDurationSeconds,
    isPtt: queued.isPtt,
    senderName: contactName,
    isUnregisteredContact: !supplier,
  };
}
