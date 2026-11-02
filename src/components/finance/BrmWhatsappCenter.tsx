import React, { useMemo, useState, useEffect, useRef } from 'react';
import {
  AlertTriangle,
  Building2,
  Calendar,
  Check,
  CheckCheck,
  CheckCircle2,
  Clock,
  Copy,
  DollarSign,
  ExternalLink,
  FileCheck2,
  FileText,
  KeyRound,
  MessageSquare,
  Paperclip,
  Phone,
  PowerOff,
  QrCode,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Trash2,
  Truck,
  User,
  Wifi,
  X,
} from 'lucide-react';
import { NavigationTab, StorageZone } from '../../types';
import { useFinance } from '../../context/FinanceContext';
import { useInventory } from '../../context/InventoryContext';
import { useOperationsBrm } from '../../context/OperationsBrmContext';
import { normalizePhoneE164 } from '../../lib/brm-whatsapp';
import { WhatsAppAudioMessagePlayer } from './WhatsAppAudioMessagePlayer';

export interface BrmWhatsappCenterProps {
  onNavigate?: (tab: NavigationTab) => void;
}

export const BrmWhatsappCenter: React.FC<BrmWhatsappCenterProps> = ({ onNavigate }) => {
  const { suppliers, invoices, retentionVouchers, updateSupplier } = useFinance();
  const { purchaseOrders, products, locations, selectedLocationId } = useInventory();
  const {
    brmSession,
    brmMessages,
    brmPreInvoices,
    stagedRetentionDispatch,
    confirmStagedRetentionDispatch,
    clearStagedRetentionDispatch,
    requestBrmQrSession,
    regenerateBrmQrSession,
    requestBrmPairingCode,
    confirmBrmQrPairing,
    activateBrmCloudWebhookMode,
    disconnectBrmSessionClean,
    refreshBrmGatewayNow,
    sendBrmMediaToSupplier,
    deleteBrmSupplierChat,
    markBrmMessageSentToOcr,
    sendBrmMessageToSupplier,
    dispatchPurchaseOrderToSupplierBrm,
    dispatchPaymentAndRetentionsBundleBrm,
    receiveBrmSupplierPreInvoice,
    confirmBrmPreInvoiceReceptionGate,
    rejectBrmPreInvoice,
  } = useOperationsBrm();

  // Pestañas principales: CHAT_WEB es ahora la experiencia principal
  const [activeTab, setActiveTab] = useState<
    'CHAT_WEB' | 'SUPPLIERS_360' | 'INBOX_PRE_AUDIT' | 'LEDGER'
  >('CHAT_WEB');

  const [selectedSupplierId, setSelectedSupplierId] = useState(
    suppliers[0]?.id || ''
  );
  const [contactSearch, setContactSearch] = useState('');
  const [chatInput, setChatInput] = useState('');
  const [corpPhoneInput, setCorpPhoneInput] = useState(
    brmSession.corporatePhoneE164 || '+582432345678'
  );
  const [banner, setBanner] = useState<{ type: 'ok' | 'err'; text: string } | null>(
    null
  );
  const [selectedQrMode, setSelectedQrMode] = useState<'NOISE_PAIRING' | 'WA_ME_LINK'>(
    'NOISE_PAIRING'
  );
  const [pairingMethod, setPairingMethod] = useState<'QR_SCAN' | 'PAIRING_CODE' | 'WA_ME_LINK'>(
    'QR_SCAN'
  );
  const [showQrModal, setShowQrModal] = useState(false);
  const [copiedPayload, setCopiedPayload] = useState(false);
  const [copiedPairingCode, setCopiedPairingCode] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [isRequestingPairingCode, setIsRequestingPairingCode] = useState(false);
  const [sendingMessage, setSendingMessage] = useState(false);

  // Edición rápida de WhatsApp E.164 del proveedor
  const [editPhone, setEditPhone] = useState('');

  // Recepción de factura entrante WhatsApp (Doble Compuerta)
  const [inInvNum, setInInvNum] = useState('FAC-BRM-2026-081');
  const [inCtrlNum, setInCtrlNum] = useState('00-9410284');
  const [inSubUsd, setInSubUsd] = useState('420.00');
  const [inIvaUsd, setInIvaUsd] = useState('67.20');
  const [inSuspicious, setInSuspicious] = useState(false);

  // Parámetros de 2da Compuerta (Confirmación Física en Muelle)
  const [gateLocId, setGateLocId] = useState(
    selectedLocationId || locations[0]?.id || ''
  );
  const [gateZone, setGateZone] = useState<StorageZone>('DEPOSITO');
  const [gateSku, setGateSku] = useState(products[0]?.sku || '');
  const [gateQty, setGateQty] = useState('20');

  const chatScrollRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isUploadingMedia, setIsUploadingMedia] = useState(false);

  // Auto-seleccionar al proveedor del comprobante en borrador si está pendiente de revisión
  useEffect(() => {
    if (stagedRetentionDispatch?.supplierId) {
      setSelectedSupplierId(stagedRetentionDispatch.supplierId);
      setActiveTab('CHAT_WEB');
    }
  }, [stagedRetentionDispatch?.supplierId]);

  // Si se genera un QR, abrir automáticamente el visor
  useEffect(() => {
    if (brmSession.state === 'QR_READY' || brmSession.state === 'GENERATING_QR') {
      setShowQrModal(true);
    } else if (brmSession.state === 'CONNECTED') {
      setShowQrModal(false);
    }
  }, [brmSession.state]);

  const activeSupplier = useMemo(
    () => suppliers.find((s) => s.id === selectedSupplierId) || suppliers[0],
    [suppliers, selectedSupplierId]
  );

  // Filtrado de contactos activos de proveedores para el directorio izquierdo
  const filteredSuppliers = useMemo(() => {
    const q = contactSearch.trim().toLowerCase();
    return suppliers.filter((s) => {
      if (!q) return true;
      const name = s.name.toLowerCase();
      const rif = s.rif.toLowerCase();
      const phone = (s.whatsappE164 || s.phone || '').toLowerCase();
      return name.includes(q) || rif.includes(q) || phone.includes(q);
    });
  }, [suppliers, contactSearch]);

  // Histórico de mensajes del chat para el proveedor seleccionado
  const activeSupplierMessages = useMemo(() => {
    if (!activeSupplier) return [];
    const supPhoneNorm = normalizePhoneE164(activeSupplier.whatsappE164 || activeSupplier.phone);
    return brmMessages
      .filter((m) => {
        if (m.supplierId && m.supplierId === activeSupplier.id) return true;
        if (supPhoneNorm && m.phoneE164 === supPhoneNorm) return true;
        return false;
      })
      .sort((a, b) => a.id.localeCompare(b.id));
  }, [brmMessages, activeSupplier]);

  // Auto-scroll al final del chat al llegar nuevos mensajes
  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [activeSupplierMessages, activeSupplier?.id]);

  const supplierOrders = useMemo(
    () => purchaseOrders.filter((o) => o.supplierId === activeSupplier?.id),
    [purchaseOrders, activeSupplier?.id]
  );

  const supplierInvoices = useMemo(
    () => invoices.filter((inv) => inv.supplierId === activeSupplier?.id),
    [invoices, activeSupplier?.id]
  );

  const pendingPreInvoicesCount = brmPreInvoices.filter(
    (p) => p.status === 'PENDIENTE_VERIFICACION'
  ).length;

  // Manejo de envío desde el chat interactivo
  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!activeSupplier || !chatInput.trim() || sendingMessage) return;

    setSendingMessage(true);
    try {
      const res = await sendBrmMessageToSupplier({
        supplierId: activeSupplier.id,
        category: 'MENSAJE_OPERATIVO_BRM',
        bodyText: chatInput.trim(),
        openWaMeWindow: brmSession.state !== 'CONNECTED', // Si no está conectado el socket, abre wa.me asistido
      });

      if (!res.success) {
        setBanner({ type: 'err', text: res.error || 'Error enviando mensaje.' });
      } else {
        setChatInput('');
        setBanner({
          type: 'ok',
          text: `Mensaje remitido a ${activeSupplier.name} (${res.message?.phoneE164}) vía ${res.message?.transportUsed}.`,
        });
      }
    } finally {
      setSendingMessage(false);
    }
  };

  // Inyectar plantilla pre-redactada en la caja de texto del chat
  const handleInsertTemplate = (text: string) => {
    setChatInput((prev) => (prev ? `${prev}\n${text}` : text));
  };

  const handleMediaUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeSupplier) return;
    setIsUploadingMedia(true);
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const dataUrl = reader.result as string;
        const isAudio = file.type.startsWith('audio/');
        const mediaType = isAudio ? 'AUDIO' : 'IMAGEN';
        const res = await sendBrmMediaToSupplier({
          supplierId: activeSupplier.id,
          mediaDataUrl: dataUrl,
          mediaType,
          fileName: file.name,
        });
        if (res.success) {
          setBanner({ type: 'ok', text: `Archivo ${file.name} enviado con éxito a ${activeSupplier.name}.` });
        } else {
          setBanner({ type: 'err', text: res.error || 'Error enviando archivo.' });
        }
        setIsUploadingMedia(false);
      };
      reader.readAsDataURL(file);
    } catch {
      setIsUploadingMedia(false);
    }
    e.target.value = '';
  };

  const handleReceivePreInvoice = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeSupplier) return;
    const sub = Number(inSubUsd) || 0;
    const iva = Number(inIvaUsd) || 0;
    const tot = Number((sub + iva).toFixed(2));
    const res = receiveBrmSupplierPreInvoice({
      supplierId: activeSupplier.id,
      invoiceNumber: inInvNum,
      controlNumber: inCtrlNum,
      declaredSubtotalUsd: sub,
      declaredIvaUsd: iva,
      declaredTotalUsd: tot,
      hasSuspiciousMetadata: inSuspicious,
    });
    if (!res.success) {
      setBanner({ type: 'err', text: res.error || 'Error registrando pre-factura.' });
      return;
    }
    setInInvNum(`FAC-BRM-2026-${Math.floor(100 + Math.random() * 899)}`);
    setBanner({
      type: res.preInvoice?.ocrVerdict === 'ALERTA_FRAUDE_EDICION_O_IA' ? 'err' : 'ok',
      text: `Factura ${res.preInvoice?.invoiceNumber} recibida en Compuerta 1 (PENDIENTE_VERIFICACION) — Dictamen OCR: ${res.preInvoice?.ocrVerdict}. Stock y CxP intactos hasta recepción física.`,
    });
  };

  return (
    <div className="space-y-4">
      {/* Barra Superior de Estado y Conectividad WhatsApp */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xl">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <div className="p-2 bg-emerald-500/10 rounded-xl text-emerald-400">
                <MessageSquare className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                  Centro de Mensajería BRM WhatsApp
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border tracking-wide ${
                      brmSession.state === 'CONNECTED'
                        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                        : brmSession.state === 'CLOUD_STANDBY'
                        ? 'bg-sky-500/20 text-sky-300 border-sky-500/40'
                        : brmSession.state === 'GENERATING_QR'
                        ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 animate-pulse'
                        : brmSession.state === 'QR_EXPIRADO'
                        ? 'bg-amber-500/25 text-amber-300 border-amber-500/50'
                        : brmSession.state === 'QR_READY'
                        ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                        : 'bg-slate-800 text-slate-300 border-slate-700'
                    }`}
                  >
                    {brmSession.state === 'CONNECTED'
                      ? '🟢 PUENTE EN VIVO CONECTADO'
                      : brmSession.state === 'CLOUD_STANDBY'
                      ? '🔵 CLOUD API ACTIVA'
                      : brmSession.state === 'GENERATING_QR'
                      ? '⏳ NEGOCIANDO CON WHATSAPP...'
                      : brmSession.state === 'QR_EXPIRADO'
                      ? '🟠 QR EXPIRADO (INACTIVIDAD)'
                      : brmSession.state === 'QR_READY'
                      ? '🟡 ESCANEA EL CÓDIGO QR'
                      : '⚪ MODO ASISTIDO WA.ME + BITÁCORA'}
                  </span>
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Línea activa: <strong className="text-slate-200">{brmSession.corporatePhoneE164}</strong> · Mensajería con proveedores, historial de chats, retenciones SENIAT y órdenes de compra.
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <input
              type="text"
              value={corpPhoneInput}
              onChange={(e) => setCorpPhoneInput(e.target.value)}
              placeholder="Línea Propia +58..."
              className="min-h-[44px] w-40 px-3 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono"
              title="Número corporativo propio excluido de envíos (Anti-Loop)"
            />

            <button
              type="button"
              onClick={() => {
                setShowQrModal(true);
                if (brmSession.state !== 'CONNECTED' && brmSession.state !== 'QR_READY') {
                  requestBrmQrSession(corpPhoneInput, selectedQrMode);
                }
              }}
              className="min-h-[44px] px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold flex items-center gap-1.5 cursor-pointer shadow-lg shadow-emerald-950/40 transition"
            >
              <QrCode className="w-4 h-4" />
              {brmSession.state === 'CONNECTED' ? 'Ver Estado QR' : 'Vincular Dispositivo'}
            </button>

            {brmSession.state !== 'DISCONNECTED' && (
              <button
                type="button"
                onClick={() => disconnectBrmSessionClean()}
                className="min-h-[44px] px-3 rounded-xl bg-rose-600/20 hover:bg-rose-600/30 border border-rose-500/40 text-rose-200 font-bold flex items-center gap-1.5 cursor-pointer transition"
                title="Desvinculación limpia de sesión (Anti-Split Brain)"
              >
                <PowerOff className="w-4 h-4" />
                Desvincular
              </button>
            )}
          </div>
        </div>

        {/* Modal / Panel Desplegable de Vinculación QR Auténtica */}
        {showQrModal && (
          <div className="mt-4 p-4 sm:p-5 rounded-2xl bg-slate-950 border-2 border-emerald-500/60 shadow-2xl relative">
            <button
              type="button"
              onClick={() => setShowQrModal(false)}
              className="absolute top-3 right-3 text-slate-400 hover:text-white p-2 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex flex-col md:flex-row items-center gap-6">
              {/* Contenedor del QR o Código de Emparejamiento */}
              <div className="shrink-0 p-3 bg-white rounded-2xl shadow-2xl border-2 border-emerald-400 flex items-center justify-center min-w-[240px] min-h-[240px]">
                {pairingMethod === 'PAIRING_CODE' ? (
                  <div className="flex flex-col items-center justify-center p-4 text-center w-[230px]">
                    {isRequestingPairingCode ? (
                      <div className="flex flex-col items-center justify-center p-4 text-slate-800">
                        <RefreshCw className="w-8 h-8 text-emerald-600 animate-spin mb-2" />
                        <span className="font-bold text-xs text-slate-900">
                          Solicitando código a WhatsApp...
                        </span>
                      </div>
                    ) : brmSession.pairingCode ? (
                      <div className="space-y-3 w-full">
                        <span className="text-[11px] font-bold text-slate-600 block uppercase tracking-wider">
                          Código de Vinculación
                        </span>
                        <div className="text-2xl font-mono font-black text-emerald-700 bg-slate-100 py-3 px-2 rounded-xl border-2 border-emerald-500 tracking-widest select-all shadow-inner">
                          {brmSession.pairingCode}
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText(brmSession.pairingCode || '');
                            setCopiedPairingCode(true);
                            setTimeout(() => setCopiedPairingCode(false), 2000);
                          }}
                          className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer shadow transition"
                        >
                          <Copy className="w-3.5 h-3.5" />
                          {copiedPairingCode ? '¡Copiado!' : 'Copiar Código'}
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-2 text-slate-700">
                        <KeyRound className="w-10 h-10 text-emerald-600 mx-auto" />
                        <span className="font-bold text-xs block text-slate-900">
                          Vincular con Código
                        </span>
                        <p className="text-[10px] text-slate-500 leading-tight">
                          Genera un código oficial de 8 dígitos para vincular sin cámara.
                        </p>
                        <button
                          type="button"
                          onClick={async () => {
                            setIsRequestingPairingCode(true);
                            await requestBrmPairingCode(corpPhoneInput);
                            setIsRequestingPairingCode(false);
                          }}
                          className="mt-1 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold cursor-pointer transition shadow"
                        >
                          Obtener Código
                        </button>
                      </div>
                    )}
                  </div>
                ) : brmSession.state === 'GENERATING_QR' || isRegenerating ? (
                  <div className="flex flex-col items-center justify-center p-6 text-center text-slate-800">
                    <RefreshCw className="w-10 h-10 text-emerald-600 animate-spin mb-3" />
                    <span className="font-bold text-xs text-slate-900">
                      Negociando con WhatsApp...
                    </span>
                    <span className="text-[10px] text-slate-600 mt-1">
                      Generando token oficial de emparejamiento WSS
                    </span>
                  </div>
                ) : brmSession.state === 'QR_EXPIRADO' ? (
                  <div className="flex flex-col items-center justify-center p-6 text-center text-amber-900 space-y-2 max-w-[230px]">
                    <AlertTriangle className="w-10 h-10 text-amber-600 mb-1" />
                    <span className="font-bold text-xs text-amber-950 uppercase tracking-wide">
                      Código QR Expirado
                    </span>
                    <p className="text-[10px] text-amber-800 leading-tight">
                      El código rotó 5 veces sin ser escaneado. El socket se pausó de forma segura para proteger la memoria.
                    </p>
                    <button
                      type="button"
                      onClick={async () => {
                        setIsRegenerating(true);
                        await regenerateBrmQrSession(corpPhoneInput, 'NOISE_PAIRING');
                        setIsRegenerating(false);
                      }}
                      className="mt-2 px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-bold shadow cursor-pointer transition flex items-center gap-1.5"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      Refrescar Código QR
                    </button>
                  </div>
                ) : brmSession.qrCodeDataUri ? (
                  <img
                    src={brmSession.qrCodeDataUri}
                    alt="Código QR WhatsApp Web BRM"
                    className="w-[230px] h-[230px] object-contain rounded-xl select-none"
                    style={{ imageRendering: 'pixelated' }}
                  />
                ) : brmSession.state === 'CONNECTED' ? (
                  <div className="flex flex-col items-center justify-center p-6 text-center text-emerald-600">
                    <CheckCircle2 className="w-12 h-12 mb-2" />
                    <span className="font-bold text-sm text-slate-900">
                      ¡Dispositivo Vinculado!
                    </span>
                    <span className="text-xs text-slate-700 mt-0.5 font-mono">
                      {brmSession.numeroConectado || brmSession.corporatePhoneE164}
                    </span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center p-6 text-center text-slate-700">
                    <Smartphone className="w-10 h-10 text-slate-400 mb-2" />
                    <span className="font-bold text-xs">Sin código QR activo</span>
                    <button
                      type="button"
                      onClick={async () => {
                        setIsRegenerating(true);
                        await regenerateBrmQrSession(corpPhoneInput, 'NOISE_PAIRING');
                        setIsRegenerating(false);
                      }}
                      className="mt-2 text-xs text-emerald-600 font-bold underline cursor-pointer"
                    >
                      Haz clic para generar
                    </button>
                  </div>
                )}
              </div>

              {/* Instrucciones y Opciones de Modo */}
              <div className="space-y-3 flex-1 text-xs">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setPairingMethod('QR_SCAN');
                      setSelectedQrMode('NOISE_PAIRING');
                      requestBrmQrSession(corpPhoneInput, 'NOISE_PAIRING');
                    }}
                    className={`min-h-[44px] px-3 rounded-xl font-bold transition cursor-pointer flex items-center gap-1.5 ${
                      pairingMethod === 'QR_SCAN'
                        ? 'bg-emerald-600 text-white shadow-md shadow-emerald-950/40'
                        : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
                    }`}
                  >
                    <Smartphone className="w-3.5 h-3.5" />
                    1. Escanear QR (Cámara WhatsApp)
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      setPairingMethod('PAIRING_CODE');
                      if (!brmSession.pairingCode) {
                        setIsRequestingPairingCode(true);
                        await requestBrmPairingCode(corpPhoneInput);
                        setIsRequestingPairingCode(false);
                      }
                    }}
                    className={`min-h-[44px] px-3 rounded-xl font-bold transition cursor-pointer flex items-center gap-1.5 ${
                      pairingMethod === 'PAIRING_CODE'
                        ? 'bg-emerald-600 text-white shadow-md shadow-emerald-950/40'
                        : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
                    }`}
                  >
                    <KeyRound className="w-3.5 h-3.5" />
                    2. Código 8 Dígitos (Sin Cámara)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPairingMethod('WA_ME_LINK');
                      setSelectedQrMode('WA_ME_LINK');
                      requestBrmQrSession(corpPhoneInput, 'WA_ME_LINK');
                    }}
                    className={`min-h-[44px] px-3 rounded-xl font-bold transition cursor-pointer flex items-center gap-1.5 ${
                      pairingMethod === 'WA_ME_LINK'
                        ? 'bg-emerald-600 text-white shadow-md shadow-emerald-950/40'
                        : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
                    }`}
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    3. Enlace wa.me (Cámara / Lens)
                  </button>
                </div>

                <div className="p-3 bg-slate-900/90 rounded-xl border border-slate-800 space-y-2">
                  <h4 className="font-bold text-white text-sm flex items-center gap-2">
                    {pairingMethod === 'PAIRING_CODE'
                      ? 'Paso a paso para vincular con código de 8 dígitos:'
                      : pairingMethod === 'QR_SCAN'
                      ? 'Paso a paso para escanear QR en tu smartphone:'
                      : 'Escaneo con cámara móvil o Google Lens:'}
                  </h4>
                  {pairingMethod === 'PAIRING_CODE' ? (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <input
                          type="tel"
                          value={corpPhoneInput}
                          onChange={(e) => setCorpPhoneInput(e.target.value)}
                          placeholder="+58 412 1234567"
                          className="px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-white text-xs font-mono flex-1 focus:border-emerald-500 focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={async () => {
                            setIsRequestingPairingCode(true);
                            await requestBrmPairingCode(corpPhoneInput);
                            setIsRequestingPairingCode(false);
                          }}
                          disabled={isRequestingPairingCode}
                          className="min-h-[40px] px-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                        >
                          <RefreshCw className={`w-3.5 h-3.5 ${isRequestingPairingCode ? 'animate-spin' : ''}`} />
                          {isRequestingPairingCode ? 'Generando...' : 'Nuevo Código'}
                        </button>
                      </div>
                      <ol className="text-[11px] text-slate-300 list-decimal list-inside space-y-1 font-medium leading-relaxed">
                        <li>Abre WhatsApp en tu teléfono (<strong className="text-white">{corpPhoneInput}</strong>).</li>
                        <li>Ve a <strong>Ajustes (o Menú ⋮) &gt; Dispositivos vinculados &gt; Vincular un dispositivo</strong>.</li>
                        <li>Toca abajo en <strong>"Vincular con el número de teléfono"</strong> (o <em>Link with phone number instead</em>).</li>
                        <li>Escribe el código oficial de 8 dígitos mostrado a la izquierda.</li>
                        <li className="text-emerald-300">¡Conexión inmediata sin depender de la cámara ni de reflejos de pantalla!</li>
                      </ol>
                    </div>
                  ) : pairingMethod === 'QR_SCAN' ? (
                    <ol className="text-[11px] text-slate-300 list-decimal list-inside space-y-1 font-medium leading-relaxed">
                      <li>Abre WhatsApp en tu teléfono (<strong className="text-white">{brmSession.corporatePhoneE164}</strong>).</li>
                      <li>Toca <strong>Menú (⋮)</strong> o <strong>Ajustes</strong> &gt; <strong>Dispositivos vinculados</strong>.</li>
                      <li>Selecciona <strong>Vincular un dispositivo</strong> y apunta al código QR a la izquierda.</li>
                      <li className="text-emerald-300">El sistema detectará el emparejamiento de forma 100% automática en segundos.</li>
                    </ol>
                  ) : (
                    <ol className="text-[11px] text-slate-300 list-decimal list-inside space-y-1 font-medium leading-relaxed">
                      <li>Abre la app de cámara normal o Google Lens en tu smartphone.</li>
                      <li>Apunta al código para abrir el enlace directo seguro de WhatsApp.</li>
                    </ol>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={async () => {
                      setIsRegenerating(true);
                      await regenerateBrmQrSession(corpPhoneInput, selectedQrMode);
                      setIsRegenerating(false);
                    }}
                    disabled={isRegenerating}
                    className="min-h-[44px] px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold cursor-pointer transition text-xs flex items-center gap-1.5 shadow-md shadow-emerald-950/40 disabled:opacity-50"
                    title="Purga la sesión anterior y solicita un nuevo QR auténtico a los servidores de WhatsApp"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isRegenerating ? 'animate-spin' : ''}`} />
                    {isRegenerating ? 'Regenerando con WhatsApp...' : 'Refrescar Código QR'}
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      setIsRegenerating(true);
                      await regenerateBrmQrSession(corpPhoneInput, selectedQrMode);
                      setIsRegenerating(false);
                    }}
                    className="min-h-[44px] px-3.5 rounded-xl bg-amber-600/20 hover:bg-amber-600/30 border border-amber-500/40 text-amber-300 font-bold cursor-pointer transition text-xs flex items-center gap-1.5"
                    title="Fuerza un reinicio completo si la sesión previa quedó en estado zombie"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    Forzar Nuevo QR (Nuclear)
                  </button>
                  <button
                    type="button"
                    onClick={() => disconnectBrmSessionClean()}
                    className="min-h-[44px] px-3.5 rounded-xl bg-rose-600/20 hover:bg-rose-600/30 border border-rose-500/40 text-rose-300 font-bold cursor-pointer transition text-xs flex items-center gap-1.5"
                    title="Cierra el socket y elimina los archivos físicos en disco"
                  >
                    <PowerOff className="w-3.5 h-3.5" />
                    Desvincular Sesión
                  </button>
                  <button
                    type="button"
                    onClick={() => refreshBrmGatewayNow()}
                    className="min-h-[44px] px-3.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 font-bold cursor-pointer transition text-xs flex items-center gap-1.5"
                    title="Consulta el estado SSoT y procesa la cola de mensajes en tiempo real"
                  >
                    <Wifi className="w-3.5 h-3.5 text-emerald-400" />
                    Sincronizar en Vivo
                  </button>
                  {brmSession.qrPayloadData && (
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(brmSession.qrPayloadData || '');
                        setCopiedPayload(true);
                        setTimeout(() => setCopiedPayload(false), 2000);
                      }}
                      className="min-h-[44px] px-3 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-400 font-medium cursor-pointer transition text-xs flex items-center gap-1"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      {copiedPayload ? '¡Copiado!' : 'Copiar Token'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Pestañas de Navegación del Módulo BRM */}
        <div className="flex flex-wrap gap-2 pt-3 border-t border-slate-800 mt-4">
          <button
            type="button"
            onClick={() => setActiveTab('CHAT_WEB')}
            className={`min-h-[44px] px-4 rounded-xl text-xs font-bold border transition cursor-pointer flex items-center gap-2 ${
              activeTab === 'CHAT_WEB'
                ? 'bg-emerald-600 text-white border-emerald-500 shadow-md shadow-emerald-950/40'
                : 'bg-slate-950 text-slate-300 border-slate-800 hover:text-white'
            }`}
          >
            <MessageSquare className="w-4 h-4 text-emerald-300" />
            1. Chat WhatsApp en Vivo & Contactos Activos
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('SUPPLIERS_360')}
            className={`min-h-[44px] px-4 rounded-xl text-xs font-bold border transition cursor-pointer flex items-center gap-2 ${
              activeTab === 'SUPPLIERS_360'
                ? 'bg-emerald-600 text-white border-emerald-500 shadow-md shadow-emerald-950/40'
                : 'bg-slate-950 text-slate-300 border-slate-800 hover:text-white'
            }`}
          >
            <Building2 className="w-4 h-4 text-sky-400" />
            2. Expediente Financiero 360° & Envíos 1-Clic
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('INBOX_PRE_AUDIT')}
            className={`min-h-[44px] px-4 rounded-xl text-xs font-bold border transition cursor-pointer flex items-center gap-2 ${
              activeTab === 'INBOX_PRE_AUDIT'
                ? 'bg-emerald-600 text-white border-emerald-500 shadow-md shadow-emerald-950/40'
                : 'bg-slate-950 text-slate-300 border-slate-800 hover:text-white'
            }`}
          >
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            3. Doble Compuerta Facturas OCR ({pendingPreInvoicesCount})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('LEDGER')}
            className={`min-h-[44px] px-4 rounded-xl text-xs font-bold border transition cursor-pointer flex items-center gap-2 ${
              activeTab === 'LEDGER'
                ? 'bg-emerald-600 text-white border-emerald-500 shadow-md shadow-emerald-950/40'
                : 'bg-slate-950 text-slate-300 border-slate-800 hover:text-white'
            }`}
          >
            <Smartphone className="w-4 h-4 text-amber-400" />
            4. Bitácora Auditada E.164 ({brmMessages.length})
          </button>
        </div>
      </div>

      {banner && (
        <div
          className={`p-3 rounded-xl border text-xs flex items-center justify-between gap-2 shadow-lg ${
            banner.type === 'ok'
              ? 'bg-emerald-950/70 border-emerald-500/40 text-emerald-200'
              : 'bg-rose-950/70 border-rose-500/40 text-rose-200'
          }`}
        >
          <span className="flex items-center gap-2 font-medium">
            {banner.type === 'ok' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            )}
            {banner.text}
          </span>
          <button
            type="button"
            onClick={() => setBanner(null)}
            className="text-slate-400 hover:text-white px-2 cursor-pointer font-bold"
          >
            ✕
          </button>
        </div>
      )}

      {/* ========================================================================= */}
      {/* PESTAÑA 1: CLON DE WHATSAPP WEB CON VENTANA DE CONTACTOS Y CHAT EN VIVO    */}
      {/* ========================================================================= */}
      {activeTab === 'CHAT_WEB' && activeSupplier && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 h-[650px] bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl">
          {/* Panel Izquierdo: Directorio y Contactos Activos de Proveedores */}
          <div className="lg:col-span-4 bg-slate-950 border-r border-slate-800 flex flex-col h-full">
            {/* Buscador de Contactos */}
            <div className="p-3 border-b border-slate-800 space-y-2">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3.5" />
                <input
                  type="text"
                  value={contactSearch}
                  onChange={(e) => setContactSearch(e.target.value)}
                  placeholder="Buscar proveedor o teléfono..."
                  className="w-full min-h-[44px] pl-9 pr-3 rounded-xl bg-slate-900 border border-slate-700 text-white text-xs placeholder:text-slate-500 focus:border-emerald-500"
                />
              </div>
              <div className="flex items-center justify-between text-[11px] text-slate-400 px-1 font-semibold">
                <span>Proveedores Activos ({filteredSuppliers.length})</span>
                <span className="text-emerald-400">BRM AR Group</span>
              </div>
            </div>

            {/* Lista de Contactos con Scroll */}
            <div className="flex-1 overflow-y-auto divide-y divide-slate-800/60">
              {filteredSuppliers.length === 0 ? (
                <div className="p-6 text-center text-slate-500 text-xs">
                  No se encontraron proveedores que coincidan con la búsqueda.
                </div>
              ) : (
                filteredSuppliers.map((supplier) => {
                  const isSelected = supplier.id === activeSupplier.id;
                  const phoneNorm = normalizePhoneE164(supplier.whatsappE164 || supplier.phone);
                  const hasStaged = stagedRetentionDispatch?.supplierId === supplier.id;

                  // Último mensaje registrado para este contacto
                  const lastMsg = brmMessages
                    .filter((m) => m.supplierId === supplier.id || (phoneNorm && m.phoneE164 === phoneNorm))
                    .slice(-1)[0];

                  return (
                    <button
                      key={supplier.id}
                      type="button"
                      onClick={() => setSelectedSupplierId(supplier.id)}
                      className={`w-full p-3 text-left transition flex items-start gap-3 cursor-pointer ${
                        isSelected
                          ? 'bg-emerald-950/40 border-l-4 border-emerald-500'
                          : 'hover:bg-slate-900/60'
                      }`}
                    >
                      <div className="w-10 h-10 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center shrink-0 font-bold text-white text-xs">
                        {supplier.name.slice(0, 2).toUpperCase()}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1">
                          <h4 className="font-bold text-white text-xs truncate">
                            {supplier.name}
                          </h4>
                          {lastMsg && (
                            <span className="text-[10px] text-slate-500 shrink-0 font-mono">
                              {lastMsg.timestampVet?.split(' ')[1]?.slice(0, 5) || ''}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center justify-between gap-1 text-[11px] text-slate-400 mt-0.5">
                          <span className="font-mono truncate">{phoneNorm || supplier.rif}</span>
                          <span className="text-amber-300 font-mono font-bold tabular-nums shrink-0">
                            ${supplier.balanceUsd.toFixed(2)}
                          </span>
                        </div>

                        {hasStaged && (
                          <div className="mt-1 inline-flex items-center gap-1 text-[10px] font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/30 animate-pulse">
                            <AlertTriangle className="w-3 h-3" />
                            Retención en Borrador
                          </div>
                        )}

                        {lastMsg && !hasStaged && (
                          <p className="text-[11px] text-slate-400 truncate mt-1">
                            {lastMsg.direction === 'OUTBOUND_TO_SUPPLIER' && 'Tú: '}
                            {lastMsg.bodyText}
                          </p>
                        )}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Panel Central/Derecho: Espacio del Chat e Histórico de Conversación */}
          <div className="lg:col-span-8 flex flex-col h-full bg-slate-950/40">
            {/* Cabecera del Chat Activo */}
            <div className="p-3.5 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-emerald-600/20 border border-emerald-500/40 flex items-center justify-center font-bold text-emerald-300 text-xs">
                  {activeSupplier.name.slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <h3 className="font-bold text-white text-sm flex items-center gap-2">
                    {activeSupplier.name}
                    <span className="font-mono text-xs text-slate-400 font-normal">
                      ({activeSupplier.rif})
                    </span>
                  </h3>
                  <div className="flex items-center gap-2 text-xs text-slate-400">
                    <span className="font-mono text-emerald-400 font-semibold">
                      {normalizePhoneE164(activeSupplier.whatsappE164 || activeSupplier.phone) ||
                        'Sin E.164'}
                    </span>
                    <span>·</span>
                    <span>Saldo CxP: <strong className="text-amber-300 font-mono">${activeSupplier.balanceUsd.toFixed(2)}</strong></span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {activeSupplier.whatsappE164 && (
                  <a
                    href={`https://wa.me/${activeSupplier.whatsappE164.replace(/\D/g, '')}?text=${encodeURIComponent(
                      `Estimados ${activeSupplier.name}, le saludamos de AR Group 2026:`
                    )}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="min-h-[44px] px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-emerald-400 text-xs font-bold flex items-center gap-1.5 transition"
                    title="Abrir chat directamente en WhatsApp Web o móvil"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    Abrir wa.me
                  </a>
                )}
                <button
                  type="button"
                  onClick={() => setActiveTab('SUPPLIERS_360')}
                  className="min-h-[44px] px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition"
                  title="Ver facturas y retenciones completas del proveedor"
                >
                  Expediente 360°
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    const phone = normalizePhoneE164(activeSupplier.whatsappE164 || activeSupplier.phone || '');
                    if (!phone) {
                      setBanner({ type: 'err', text: 'El proveedor no posee un número de WhatsApp E.164 válido.' });
                      return;
                    }
                    if (window.confirm(`¿Confirmas eliminar el historial de conversación con ${activeSupplier.name}?`)) {
                      const res = await deleteBrmSupplierChat(phone, true);
                      setBanner({ type: 'ok', text: `Chat con ${activeSupplier.name} eliminado (${res.removedCount} mensajes).` });
                    }
                  }}
                  className="min-h-[44px] px-3 rounded-xl bg-slate-800 hover:bg-rose-950/60 hover:text-rose-300 hover:border-rose-500/40 border border-slate-700 text-slate-400 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
                  title="Eliminar historial de conversación"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Eliminar Chat</span>
                </button>
              </div>
            </div>

            {/* Alerta de Retención en Borrador Pendiente de Confirmar */}
            {stagedRetentionDispatch && stagedRetentionDispatch.supplierId === activeSupplier.id && (
              <div className="m-3 p-3.5 rounded-xl bg-amber-950/40 border border-amber-500/50 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shrink-0">
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-amber-400">
                    <AlertTriangle className="w-4 h-4" />
                    Borrador de Comprobante {stagedRetentionDispatch.voucherType} N° {stagedRetentionDispatch.voucherNumber}
                  </div>
                  <p className="text-[11px] text-slate-300">
                    Monto retenido: <strong className="text-white">Bs. {stagedRetentionDispatch.retainedVes.toFixed(2)}</strong> (${stagedRetentionDispatch.retainedUsd.toFixed(2)}) · Listo para despachar al proveedor.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => clearStagedRetentionDispatch()}
                    className="min-h-[44px] px-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-400 text-xs font-bold transition cursor-pointer"
                  >
                    Descartar
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      const res = await confirmStagedRetentionDispatch(false);
                      if (res.success) {
                        setBanner({
                          type: 'ok',
                          text: 'Comprobante despachado con éxito al chat y marcado como ENTREGADO.',
                        });
                      } else {
                        setBanner({
                          type: 'err',
                          text: res.error || 'Error enviando comprobante.',
                        });
                      }
                    }}
                    className="min-h-[44px] px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-lg shadow-emerald-950/40 transition"
                  >
                    <Send className="w-3.5 h-3.5" />
                    Confirmar y Despachar
                  </button>
                </div>
              </div>
            )}

            {/* Espacio del Histórico de Conversación con Burbujas */}
            <div
              ref={chatScrollRef}
              className="flex-1 p-4 overflow-y-auto space-y-3 bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:16px_16px]"
            >
              {activeSupplierMessages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center p-8 text-slate-500">
                  <div className="w-14 h-14 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-400 mb-3">
                    <MessageSquare className="w-6 h-6" />
                  </div>
                  <h4 className="font-bold text-white text-sm">
                    Sin mensajes previos con {activeSupplier.name}
                  </h4>
                  <p className="text-xs text-slate-400 max-w-sm mt-1">
                    Escribe un mensaje abajo o haz clic en las plantillas rápidas para enviar cotizaciones, notificaciones de pago o retenciones SENIAT.
                  </p>
                </div>
              ) : (
                activeSupplierMessages.map((msg) => {
                  const isOut = msg.direction === 'OUTBOUND_TO_SUPPLIER';
                  return (
                    <div
                      key={msg.id}
                      className={`flex flex-col ${isOut ? 'items-end' : 'items-start'}`}
                    >
                      <div
                        className={`max-w-[85%] sm:max-w-[70%] rounded-2xl p-3.5 shadow-md space-y-1.5 text-xs ${
                          isOut
                            ? 'bg-emerald-950/80 border border-emerald-500/40 text-emerald-100 rounded-br-none'
                            : 'bg-slate-900 border border-slate-800 text-slate-200 rounded-bl-none'
                        }`}
                      >
                        {/* Categoría y Adjuntos */}
                        <div className="flex items-center justify-between gap-2 border-b border-white/10 pb-1">
                          <span className="font-bold text-[10px] text-emerald-400 uppercase tracking-wide">
                            {msg.category.replace(/_/g, ' ')}
                          </span>
                          <span className="text-[10px] text-slate-400 font-mono">
                            {msg.transportUsed}
                          </span>
                        </div>

                        {/* Texto del Mensaje */}
                        {msg.bodyText && (
                          <p className="whitespace-pre-line leading-relaxed text-xs">
                            {msg.bodyText}
                          </p>
                        )}

                        {/* Reproductor de Audio / Nota de Voz Auténtico (Patrón Puro Apure ERP) */}
                        {(msg.tipoMensaje === 'AUDIO' || msg.mediaMimeType?.startsWith('audio/') || msg.isPtt) && msg.mediaUrl && (
                          <div className="pt-1">
                            <WhatsAppAudioMessagePlayer
                              mediaUrl={msg.mediaUrl}
                              mediaMimeType={msg.mediaMimeType}
                              durationSeconds={msg.audioDurationSeconds}
                              isPtt={msg.isPtt}
                              isOutgoing={isOut}
                            />
                          </div>
                        )}

                        {/* Previsualización de Imagen / Factura Adjunta */}
                        {(msg.tipoMensaje === 'IMAGEN' || msg.mediaMimeType?.startsWith('image/')) && msg.mediaUrl && (
                          <div className="space-y-2 pt-1">
                            <img
                              src={msg.mediaUrl}
                              alt="Comprobante o Factura Proveedor"
                              className="max-w-full max-h-60 rounded-xl object-contain border border-white/10 bg-black/40"
                            />
                            {!isOut && (
                              <button
                                type="button"
                                onClick={() => {
                                  const sub = 100;
                                  const iva = 16;
                                  const tot = 116;
                                  const res = receiveBrmSupplierPreInvoice({
                                    supplierId: activeSupplier.id,
                                    invoiceNumber: `FAC-WSP-${Date.now().toString().slice(-4)}`,
                                    controlNumber: `00-${Date.now().toString().slice(-6)}`,
                                    declaredSubtotalUsd: sub,
                                    declaredIvaUsd: iva,
                                    declaredTotalUsd: tot,
                                    hasSuspiciousMetadata: false,
                                  });
                                  markBrmMessageSentToOcr(msg.messageId);
                                  setBanner({
                                    type: 'ok',
                                    text: `Factura ${res.preInvoice?.invoiceNumber} ingresada a Pre-Auditoría OCR (Compuerta 1) en estado PENDIENTE_VERIFICACION. Cero alteración contable hasta recepción física.`,
                                  });
                                  setActiveTab('INBOX_PRE_AUDIT');
                                }}
                                disabled={Boolean(msg.sentToOcrPreAudit)}
                                className="px-3 py-1.5 rounded-lg bg-emerald-600/30 hover:bg-emerald-600/50 border border-emerald-500/40 text-emerald-200 text-[11px] font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50 transition"
                              >
                                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                                {msg.sentToOcrPreAudit ? '✅ En Pre-Auditoría OCR' : '🔍 Analizar con OCR (Compuerta 1)'}
                              </button>
                            )}
                          </div>
                        )}

                        {/* Tarjeta de Archivo Adjunto */}
                        {msg.attachmentFileName && (
                          <div className="p-2 rounded-xl bg-black/40 border border-white/10 flex items-center gap-2 text-amber-300 font-mono text-[11px]">
                            <FileText className="w-4 h-4 shrink-0 text-amber-400" />
                            <span className="truncate">{msg.attachmentFileName}</span>
                          </div>
                        )}

                        {/* Pie de Mensaje: Hora y Ticks de Entrega */}
                        <div className="flex items-center justify-end gap-1.5 pt-0.5 text-[10px] text-slate-400 font-mono">
                          <span>{msg.timestampVet || 'Hoy'}</span>
                          {isOut && (
                            <span className="text-emerald-400 inline-flex items-center">
                              {msg.deliveryStatus === 'ENTREGADO' || msg.deliveryStatus === 'LEIDO' ? (
                                <CheckCheck className="w-3.5 h-3.5" />
                              ) : (
                                <Check className="w-3.5 h-3.5" />
                              )}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Plantillas Rápidas de Mensajes */}
            <div className="px-3 py-2 bg-slate-900/60 border-t border-slate-800 flex items-center gap-1.5 overflow-x-auto text-xs shrink-0">
              <span className="text-[10px] font-bold text-slate-400 uppercase shrink-0">
                Plantillas:
              </span>
              <button
                type="button"
                onClick={() =>
                  handleInsertTemplate(
                    `Estimados ${activeSupplier.name}, le confirmamos que su pago de factura ha sido procesado exitosamente por Tesorería.`
                  )
                }
                className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] whitespace-nowrap cursor-pointer transition"
              >
                💰 Pago Procesado
              </button>
              <button
                type="button"
                onClick={() =>
                  handleInsertTemplate(
                    `Estimados ${activeSupplier.name}, le remitimos comprobantes oficiales de retención SENIAT (IVA/ISLR) correspondientes a su facturación.`
                  )
                }
                className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] whitespace-nowrap cursor-pointer transition"
              >
                📋 Retenciones SENIAT
              </button>
              <button
                type="button"
                onClick={() =>
                  handleInsertTemplate(
                    `Estimados ${activeSupplier.name}, solicitamos confirmación de despacho para mercancía en ventana de muelle de recepción.`
                  )
                }
                className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] whitespace-nowrap cursor-pointer transition"
              >
                🚚 Ventana de Descarga
              </button>
            </div>

            {/* Barra de Entrada y Escritura del Chat */}
            <form
              onSubmit={handleSendMessage}
              className="p-3 bg-slate-900 border-t border-slate-800 flex items-center gap-2 shrink-0"
            >
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleMediaUpload}
                accept="image/*,audio/*"
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploadingMedia}
                className="min-h-[44px] min-w-[44px] rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white flex items-center justify-center cursor-pointer transition shrink-0 border border-slate-700 disabled:opacity-50"
                title="Adjuntar comprobante (imagen) o nota de voz (audio)"
              >
                {isUploadingMedia ? (
                  <RefreshCw className="w-4 h-4 animate-spin text-emerald-400" />
                ) : (
                  <Paperclip className="w-4 h-4" />
                )}
              </button>
              <textarea
                rows={1}
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage();
                  }
                }}
                placeholder={`Escribe un mensaje a ${activeSupplier.name} (Enter para enviar)...`}
                className="flex-1 min-h-[44px] max-h-32 p-3 rounded-xl bg-slate-950 border border-slate-700 text-white text-xs placeholder:text-slate-500 focus:border-emerald-500 resize-none"
              />
              <button
                type="submit"
                disabled={sendingMessage || !chatInput.trim()}
                className="min-h-[44px] px-5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold flex items-center gap-2 cursor-pointer shadow-lg shadow-emerald-950/40 transition shrink-0 text-xs"
              >
                {sendingMessage ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
                Enviar
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* PESTAÑA 2: EXPEDIENTE 360° PROVEEDORES & ENVÍOS 1-CLIC                     */}
      {/* ========================================================================= */}
      {activeTab === 'SUPPLIERS_360' && activeSupplier && (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          {/* Ficha Homologada del Proveedor */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-4 text-xs">
            <div>
              <label className="block text-slate-400 mb-1 font-semibold">
                Seleccionar Proveedor BRM
              </label>
              <select
                value={activeSupplier.id}
                onChange={(e) => {
                  setSelectedSupplierId(e.target.value);
                  setEditPhone('');
                }}
                className="w-full min-h-[44px] px-3 rounded-xl bg-slate-950 border border-slate-700 text-white font-semibold"
              >
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.rif})
                  </option>
                ))}
              </select>
            </div>

            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-1.5">
              <div className="flex justify-between">
                <span className="text-slate-400">RIF Fiscal:</span>
                <span className="font-mono text-white font-bold">{activeSupplier.rif}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">WhatsApp E.164:</span>
                <span className="font-mono text-emerald-400 font-bold">
                  {normalizePhoneE164(activeSupplier.whatsappE164 || activeSupplier.phone) ||
                    'Sin formato E.164'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Saldo CxP Neto:</span>
                <span className="font-mono text-amber-300 font-bold tabular-nums">
                  ${activeSupplier.balanceUsd.toFixed(2)}
                </span>
              </div>
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                value={editPhone}
                onChange={(e) => setEditPhone(e.target.value)}
                placeholder="Actualizar móvil Ej: +584141234567"
                className="flex-1 min-h-[44px] px-3 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono"
              />
              <button
                type="button"
                onClick={() => {
                  const norm = normalizePhoneE164(editPhone);
                  if (!norm) {
                    setBanner({
                      type: 'err',
                      text: 'Ingrese un número válido (ej. 04141234567 o +584141234567).',
                    });
                    return;
                  }
                  updateSupplier(activeSupplier.id, { whatsappE164: norm });
                  setEditPhone('');
                  setBanner({
                    type: 'ok',
                    text: `Teléfono E.164 ${norm} homologado para ${activeSupplier.name}.`,
                  });
                }}
                className="min-h-[44px] px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold cursor-pointer"
              >
                Guardar
              </button>
            </div>

            <button
              type="button"
              onClick={() => setActiveTab('CHAT_WEB')}
              className="w-full min-h-[44px] rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-emerald-950/40"
            >
              <MessageSquare className="w-4 h-4" />
              Abrir Conversación en el Chat
            </button>
          </div>

          {/* Despacho 1-Clic de Facturas/Pagos/Retenciones y Órdenes de Compra */}
          <div className="xl:col-span-2 space-y-4">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
              <div className="p-4 border-b border-slate-800 flex items-center justify-between">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <FileCheck2 className="w-4 h-4 text-sky-400" />
                  Facturas Registradas: Despacho 1-Clic de Soporte de Pago + PDFs Retención SENIAT
                </h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-950 text-slate-400 border-b border-slate-800">
                      <th className="p-3">N° Factura</th>
                      <th className="p-3 text-right">Total / Neto CxP</th>
                      <th className="p-3">Comprobantes IVA / ISLR</th>
                      <th className="p-3 text-right">Despacho BRM</th>
                    </tr>
                  </thead>
                  <tbody>
                    {supplierInvoices.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="p-4 text-center text-slate-500">
                          No hay facturas registradas para este proveedor.
                        </td>
                      </tr>
                    ) : (
                      supplierInvoices.map((inv) => {
                        const ivaV = retentionVouchers.find(
                          (v) => v.invoiceId === inv.id && v.type === 'IVA'
                        );
                        const islrV = retentionVouchers.find(
                          (v) => v.invoiceId === inv.id && v.type === 'ISLR'
                        );
                        return (
                          <tr key={inv.id} className="border-b border-slate-800/70">
                            <td className="p-3">
                              <div className="font-mono font-bold text-white">
                                {inv.invoiceNumber}
                              </div>
                              <div className="text-[10px] text-slate-400">
                                Ctrl: {inv.controlNumber} · {inv.status}
                              </div>
                            </td>
                            <td className="p-3 text-right font-mono tabular-nums">
                              <div className="text-slate-300">${inv.totalUsd.toFixed(2)}</div>
                              <div className="text-emerald-400 font-bold">
                                Neto: ${(inv.netPayableUsd ?? inv.totalUsd).toFixed(2)}
                              </div>
                            </td>
                            <td className="p-3 font-mono text-[11px]">
                              {ivaV && (
                                <div className="text-sky-300">
                                  IVA: {ivaV.voucherNumber} ({ivaV.status})
                                </div>
                              )}
                              {islrV && (
                                <div className="text-amber-300">
                                  ISLR: {islrV.voucherNumber} ({islrV.status})
                                </div>
                              )}
                              {!ivaV && !islrV && (
                                <span className="text-slate-500">Exenta / Sin retención</span>
                              )}
                            </td>
                            <td className="p-3 text-right">
                              <div className="flex flex-wrap justify-end gap-1.5">
                                <button
                                  type="button"
                                  onClick={async () => {
                                    const r = await dispatchPaymentAndRetentionsBundleBrm({
                                      invoiceId: inv.id,
                                      alsoDownloadPdfs: true,
                                      openWaMeWindow: false,
                                    });
                                    setBanner({
                                      type: r.success ? 'ok' : 'err',
                                      text: r.success
                                        ? `Paquete de Pago + PDFs enviado a ${activeSupplier.name} y registrado en el chat.`
                                        : r.error || 'Error en despacho.',
                                    });
                                  }}
                                  className="min-h-[44px] px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold cursor-pointer"
                                >
                                  Enviar Pago + PDFs
                                </button>
                                <button
                                  type="button"
                                  onClick={async () => {
                                    await dispatchPaymentAndRetentionsBundleBrm({
                                      invoiceId: inv.id,
                                      alsoDownloadPdfs: false,
                                      openWaMeWindow: true,
                                    });
                                  }}
                                  className="min-h-[44px] px-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-emerald-300 inline-flex items-center gap-1 cursor-pointer"
                                  title="Abrir en WhatsApp Web (wa.me)"
                                >
                                  <ExternalLink className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Órdenes de Compra del Proveedor */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
              <div className="p-4 border-b border-slate-800">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Truck className="w-4 h-4 text-amber-400" />
                  Órdenes de Compra Emitidas al Proveedor ({supplierOrders.length})
                </h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-950 text-slate-400 border-b border-slate-800">
                      <th className="p-3">Orden</th>
                      <th className="p-3">Producto / Sede</th>
                      <th className="p-3 text-right">Cantidad / Monto</th>
                      <th className="p-3 text-right">Acción BRM</th>
                    </tr>
                  </thead>
                  <tbody>
                    {supplierOrders.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="p-4 text-center text-slate-500">
                          Sin órdenes de compra emitidas para este proveedor.
                        </td>
                      </tr>
                    ) : (
                      supplierOrders.map((ord) => (
                        <tr key={ord.id} className="border-b border-slate-800/70">
                          <td className="p-3 font-mono font-bold text-amber-300">
                            {ord.orderNumber}
                          </td>
                          <td className="p-3">
                            <div className="text-white">{ord.productName}</div>
                            <div className="text-[10px] text-slate-400">{ord.locationName}</div>
                          </td>
                          <td className="p-3 text-right font-mono tabular-nums text-white">
                            {ord.orderedQty} {ord.unit} · ${ord.totalCostUsd.toFixed(2)}
                          </td>
                          <td className="p-3 text-right">
                            <button
                              type="button"
                              onClick={async () => {
                                const r = await dispatchPurchaseOrderToSupplierBrm(ord, false);
                                setBanner({
                                  type: r.success ? 'ok' : 'err',
                                  text: r.success
                                    ? `Orden ${ord.orderNumber} remitida al WhatsApp corporativo del proveedor.`
                                    : r.error || 'Error enviando orden.',
                                });
                              }}
                              className="min-h-[44px] px-3 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-bold cursor-pointer"
                            >
                              Despachar OC
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* PESTAÑA 3: DOBLE COMPUERTA DE FACTURAS ENTRANTES OCR                      */}
      {/* ========================================================================= */}
      {activeTab === 'INBOX_PRE_AUDIT' && (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          {/* Compuerta 1: Recepción Digital de Factura por WhatsApp */}
          <form
            onSubmit={handleReceivePreInvoice}
            className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3 text-xs"
          >
            <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              Compuerta 1: Capturar Factura Entrante WhatsApp (@OCR)
            </h3>
            <p className="text-[11px] text-slate-400">
              Registra la factura remitida por el proveedor en bandeja <code>PENDIENTE_VERIFICACION</code> sin alterar inventario ni Cuentas por Pagar.
            </p>

            <div>
              <label className="block text-slate-400 mb-1">Proveedor Emisor</label>
              <select
                value={activeSupplier?.id || ''}
                onChange={(e) => setSelectedSupplierId(e.target.value)}
                className="w-full min-h-[44px] px-3 rounded-xl bg-slate-950 border border-slate-700 text-white"
              >
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.rif})
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-slate-400 mb-1">N° Factura</label>
                <input
                  type="text"
                  required
                  value={inInvNum}
                  onChange={(e) => setInInvNum(e.target.value)}
                  className="w-full min-h-[44px] px-3 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono"
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1">N° Control</label>
                <input
                  type="text"
                  required
                  value={inCtrlNum}
                  onChange={(e) => setInCtrlNum(e.target.value)}
                  className="w-full min-h-[44px] px-3 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-slate-400 mb-1">Base Imponible ($)</label>
                <input
                  type="number"
                  step="0.01"
                  value={inSubUsd}
                  onChange={(e) => setInSubUsd(e.target.value)}
                  className="w-full min-h-[44px] px-3 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono tabular-nums"
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1">IVA Declarado ($)</label>
                <input
                  type="number"
                  step="0.01"
                  value={inIvaUsd}
                  onChange={(e) => setInIvaUsd(e.target.value)}
                  className="w-full min-h-[44px] px-3 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono tabular-nums"
                />
              </div>
            </div>

            <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={inSuspicious}
                onChange={(e) => setInSuspicious(e.target.checked)}
              />
              Simular metadatos alterados / edición IA (Prueba Anti-Fraude)
            </label>

            <button
              type="submit"
              className="w-full min-h-[44px] rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-bold cursor-pointer"
            >
              Ingresar a Pre-Auditoría OCR (Compuerta 1)
            </button>
          </form>

          {/* Compuerta 2: Confirmación de Recepción Física en Muelle */}
          <div className="xl:col-span-2 bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-800">
              <h3 className="text-sm font-bold text-white">
                Compuerta 2: Verificación Física en Muelle → Alta de Stock, CxP y Retenciones
              </h3>
              <div className="flex flex-wrap gap-2">
                <select
                  value={gateLocId}
                  onChange={(e) => setGateLocId(e.target.value)}
                  className="min-h-[44px] px-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white"
                >
                  {locations.map((l) => (
                    <option key={l.id} value={l.id}>
                      Destino: {l.name}
                    </option>
                  ))}
                </select>
                <select
                  value={gateZone}
                  onChange={(e) => setGateZone(e.target.value as StorageZone)}
                  className="min-h-[44px] px-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white"
                >
                  <option value="DEPOSITO">Zona: Depósito / Cava</option>
                  <option value="ANAQUEL">Zona: Exhibición Directa</option>
                </select>
                <select
                  value={gateSku}
                  onChange={(e) => setGateSku(e.target.value)}
                  className="min-h-[44px] px-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white"
                >
                  {products.map((p) => (
                    <option key={p.id} value={p.sku}>
                      SKU: {p.sku}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  min="1"
                  value={gateQty}
                  onChange={(e) => setGateQty(e.target.value)}
                  className="w-20 min-h-[44px] px-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono text-center"
                  title="Cantidad física recibida"
                />
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-950 text-slate-400 border-b border-slate-800">
                    <th className="p-2.5">Proveedor / Factura</th>
                    <th className="p-2.5 text-right">Total USD</th>
                    <th className="p-2.5">Dictamen 4 Candados OCR</th>
                    <th className="p-2.5">Estado Compuerta</th>
                    <th className="p-2.5 text-right">Acción Muelle</th>
                  </tr>
                </thead>
                <tbody>
                  {brmPreInvoices.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-6 text-center text-slate-500">
                        Bandeja de pre-auditoría limpia. Registre una factura entrante a la izquierda para validar la Doble Compuerta.
                      </td>
                    </tr>
                  ) : (
                    brmPreInvoices.map((pre) => (
                      <tr key={pre.id} className="border-b border-slate-800/70">
                        <td className="p-2.5">
                          <div className="text-white font-semibold">{pre.supplierName}</div>
                          <div className="font-mono text-sky-300">
                            {pre.invoiceNumber} · Ctrl {pre.controlNumber}
                          </div>
                        </td>
                        <td className="p-2.5 text-right font-mono font-bold text-white tabular-nums">
                          ${pre.declaredTotalUsd.toFixed(2)}
                        </td>
                        <td className="p-2.5">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              pre.ocrVerdict === 'AUTENTICO_ALTA_CONFIANZA'
                                ? 'bg-emerald-500/20 text-emerald-300'
                                : pre.ocrVerdict === 'SOSPECHOSO_REVISION_HUMANA'
                                ? 'bg-amber-500/20 text-amber-300'
                                : 'bg-rose-500/20 text-rose-300'
                            }`}
                          >
                            {pre.ocrVerdict} ({pre.ocrConfidenceScore}%)
                          </span>
                          <div className="text-[10px] font-mono text-slate-500 mt-0.5">
                            {pre.pHashVisual}
                          </div>
                        </td>
                        <td className="p-2.5 font-semibold text-slate-300">{pre.status}</td>
                        <td className="p-2.5 text-right">
                          {pre.status === 'PENDIENTE_VERIFICACION' ? (
                            <div className="flex justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => {
                                  const qty = Math.max(1, Number(gateQty) || 1);
                                  const unitCost = Number(
                                    (pre.declaredSubtotalUsd / qty).toFixed(2)
                                  );
                                  const prod = products.find((p) => p.sku === gateSku);
                                  const r = confirmBrmPreInvoiceReceptionGate({
                                    preInvoiceId: pre.id,
                                    locationId: gateLocId || locations[0]?.id || '',
                                    destinationZone: gateZone,
                                    lines: [
                                      {
                                        id: `ln-brm-${Date.now()}`,
                                        sku: gateSku,
                                        description: prod?.name || 'Mercancía Recibida Muelle',
                                        quantity: qty,
                                        unitCostUsd: unitCost,
                                        lineTotalUsd: pre.declaredSubtotalUsd,
                                        ivaRate: pre.declaredIvaUsd > 0 ? 16 : 0,
                                        lineType: 'BIEN',
                                      },
                                    ],
                                  });
                                  setBanner({
                                    type: r.success ? 'ok' : 'err',
                                    text: r.success
                                      ? `Recepción física confirmada: Stock cargado en ${gateZone}, CxP asentada y Retenciones SENIAT emitidas.`
                                      : r.error || 'Error confirmando recepción.',
                                  });
                                }}
                                className="min-h-[44px] px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold cursor-pointer"
                              >
                                Confirmar Muelle
                              </button>
                              <button
                                type="button"
                                onClick={() => rejectBrmPreInvoice(pre.id)}
                                className="min-h-[44px] px-2.5 rounded-xl bg-rose-600/20 text-rose-300 font-bold cursor-pointer"
                              >
                                Rechazar
                              </button>
                            </div>
                          ) : (
                            <span className="text-[11px] text-slate-400">Cerrada</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* PESTAÑA 4: BITÁCORA AUDITADA E.164                                        */}
      {/* ========================================================================= */}
      {activeTab === 'LEDGER' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
          <div className="p-4 border-b border-slate-800 flex items-center justify-between">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Smartphone className="w-4 h-4 text-emerald-400" />
              Bitácora Inmutable de Comunicaciones BRM con Proveedores (Idempotencia message_id)
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left border-collapse">
              <thead>
                <tr className="bg-slate-950 text-slate-400 border-b border-slate-800">
                  <th className="p-3">Fecha / message_id</th>
                  <th className="p-3">Proveedor & E.164</th>
                  <th className="p-3">Categoría / Adjunto</th>
                  <th className="p-3">Transporte & Estado</th>
                  <th className="p-3 text-right">Enlace Directo</th>
                </tr>
              </thead>
              <tbody>
                {brmMessages.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-6 text-center text-slate-500">
                      Sin mensajes BRM registrados aún.
                    </td>
                  </tr>
                ) : (
                  brmMessages.map((msg) => (
                    <tr key={msg.id} className="border-b border-slate-800/70">
                      <td className="p-3 font-mono">
                        <div className="text-slate-200">{msg.timestampVet}</div>
                        <div className="text-[10px] text-slate-500">{msg.messageId}</div>
                      </td>
                      <td className="p-3">
                        <div className="text-white font-semibold">{msg.supplierName}</div>
                        <div className="font-mono text-emerald-400 text-[11px]">
                          {msg.phoneE164}
                        </div>
                      </td>
                      <td className="p-3">
                        <span className="px-2 py-0.5 rounded bg-sky-500/20 text-sky-300 text-[10px] font-bold">
                          {msg.category}
                        </span>
                        {msg.attachmentFileName && (
                          <div className="text-[11px] text-amber-300 font-mono mt-0.5">
                            {msg.attachmentFileName}
                          </div>
                        )}
                      </td>
                      <td className="p-3">
                        <div className="text-slate-300 font-mono text-[11px]">
                          {msg.transportUsed}
                        </div>
                        <span className="text-[10px] font-bold text-emerald-400">
                          {msg.deliveryStatus}
                        </span>
                      </td>
                      <td className="p-3 text-right">
                        {msg.waMeDeepLink && (
                          <a
                            href={msg.waMeDeepLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="min-h-[44px] px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-emerald-300 font-bold inline-flex items-center gap-1"
                          >
                            wa.me
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default BrmWhatsappCenter;
