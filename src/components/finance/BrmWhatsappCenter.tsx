import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  FileCheck2,
  MessageSquare,
  PowerOff,
  QrCode,
  Send,
  ShieldCheck,
  Smartphone,
  Truck,
  Wifi,
} from 'lucide-react';
import { NavigationTab, StorageZone } from '../../types';
import { useFinance } from '../../context/FinanceContext';
import { useInventory } from '../../context/InventoryContext';
import { useOperationsBrm } from '../../context/OperationsBrmContext';
import { normalizePhoneE164 } from '../../lib/brm-whatsapp';
import { QrMatrixView } from '../common/QrMatrixView';

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
    confirmBrmQrPairing,
    activateBrmCloudWebhookMode,
    disconnectBrmSessionClean,
    sendBrmMessageToSupplier,
    dispatchPurchaseOrderToSupplierBrm,
    dispatchPaymentAndRetentionsBundleBrm,
    receiveBrmSupplierPreInvoice,
    confirmBrmPreInvoiceReceptionGate,
    rejectBrmPreInvoice,
  } = useOperationsBrm();

  const [tab, setTab] = useState<'SUPPLIERS_360' | 'INBOX_PRE_AUDIT' | 'LEDGER'>(
    'SUPPLIERS_360'
  );
  const [selectedSupplierId, setSelectedSupplierId] = useState(
    suppliers[0]?.id || ''
  );
  const [customMsg, setCustomMsg] = useState('');
  const [corpPhoneInput, setCorpPhoneInput] = useState(
    brmSession.corporatePhoneE164
  );
  const [banner, setBanner] = useState<{ type: 'ok' | 'err'; text: string } | null>(
    null
  );

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

  // Auto-seleccionar al proveedor del comprobante en borrador si está pendiente de revisión
  React.useEffect(() => {
    if (stagedRetentionDispatch?.supplierId) {
      setSelectedSupplierId(stagedRetentionDispatch.supplierId);
      setTab('SUPPLIERS_360');
    }
  }, [stagedRetentionDispatch?.supplierId]);

  const activeSupplier =
    suppliers.find((s) => s.id === selectedSupplierId) || suppliers[0];

  const supplierOrders = useMemo(
    () =>
      purchaseOrders.filter((o) => o.supplierId === activeSupplier?.id),
    [purchaseOrders, activeSupplier?.id]
  );

  const supplierInvoices = useMemo(
    () => invoices.filter((inv) => inv.supplierId === activeSupplier?.id),
    [invoices, activeSupplier?.id]
  );

  const pendingPreInvoicesCount = brmPreInvoices.filter(
    (p) => p.status === 'PENDIENTE_VERIFICACION'
  ).length;

  const handleCustomSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeSupplier || !customMsg.trim()) return;
    const res = await sendBrmMessageToSupplier({
      supplierId: activeSupplier.id,
      category: 'MENSAJE_OPERATIVO_BRM',
      bodyText: customMsg.trim(),
    });
    if (!res.success) {
      setBanner({ type: 'err', text: res.error || 'Error enviando mensaje.' });
      return;
    }
    setCustomMsg('');
    setBanner({
      type: 'ok',
      text: `Mensaje institucional BRM despachado a ${activeSupplier.name} (${res.message?.phoneE164}) vía ${res.message?.transportUsed}.`,
    });
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
    <div className="space-y-5">
      {/* Cabecera Modo Híbrido Triple (Patrón Puro Apure ERP) */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <MessageSquare className="w-5 h-5 text-emerald-400" />
              <h2 className="text-base sm:text-lg font-bold text-white">
                Portal BRM WhatsApp Proveedores (Modo Híbrido Triple)
              </h2>
              <span
                className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
                  brmSession.state === 'CONNECTED'
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                    : brmSession.state === 'CLOUD_STANDBY'
                    ? 'bg-sky-500/20 text-sky-300 border-sky-500/40'
                    : brmSession.state === 'QR_READY'
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                    : 'bg-slate-800 text-slate-300 border-slate-700'
                }`}
              >
                {brmSession.state === 'CONNECTED'
                  ? 'PUENTE QR CONECTADO'
                  : brmSession.state === 'CLOUD_STANDBY'
                  ? 'API CLOUD WEBHOOK ACTIVA'
                  : brmSession.state === 'QR_READY'
                  ? 'ESPERANDO ESCANEO QR'
                  : 'RESPALDO DIRECTO WA.ME + BITÁCORA'}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Exclusivo para gestión de Proveedores homologados (`E.164`), Órdenes de Compra, Doble Compuerta de Facturas (`@OCR`) y remisión de Pagos + Comprobantes PDF SENIAT (IVA/ISLR).
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <input
              type="text"
              value={corpPhoneInput}
              onChange={(e) => setCorpPhoneInput(e.target.value)}
              placeholder="Línea Propia +58..."
              className="min-h-[44px] w-44 px-3 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono"
              title="Número corporativo propio excluido automáticamente (Anti-Loop)"
            />
            <button
              type="button"
              onClick={() => requestBrmQrSession(corpPhoneInput)}
              className="min-h-[44px] px-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold flex items-center gap-1.5 cursor-pointer"
            >
              <QrCode className="w-4 h-4" />
              Generar QR
            </button>
            <button
              type="button"
              onClick={() => activateBrmCloudWebhookMode()}
              className="min-h-[44px] px-3.5 rounded-xl bg-sky-600/20 hover:bg-sky-600/30 border border-sky-500/40 text-sky-200 font-bold flex items-center gap-1.5 cursor-pointer"
            >
              <Wifi className="w-4 h-4" />
              Webhook Cloud
            </button>
            {brmSession.state !== 'DISCONNECTED' && (
              <button
                type="button"
                onClick={() => disconnectBrmSessionClean()}
                className="min-h-[44px] px-3.5 rounded-xl bg-rose-600/20 hover:bg-rose-600/30 border border-rose-500/40 text-rose-200 font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <PowerOff className="w-4 h-4" />
                Desvincular Limpio
              </button>
            )}
          </div>
        </div>

        {/* Panel de Emparejamiento QR Auténtico (ISO/IEC 18004 WhatsApp Web) */}
        {brmSession.state === 'QR_READY' && brmSession.qrPayloadData && (
          <div className="p-4 sm:p-5 rounded-2xl bg-slate-950 border-2 border-emerald-500/50 flex flex-col md:flex-row items-center justify-between gap-5 text-xs shadow-2xl">
            <div className="flex flex-col sm:flex-row items-center gap-4 text-center sm:text-left">
              <div className="shrink-0 p-1 bg-white rounded-2xl shadow-lg border border-emerald-400">
                <QrMatrixView
                  value={brmSession.qrPayloadData}
                  size={160}
                  margin={2}
                  darkColor="#022c22"
                  alt="Código QR WhatsApp Web BRM"
                />
              </div>
              <div className="space-y-1.5 max-w-xl">
                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-bold text-[11px]">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  QR Activo · Noise Protocol Handshake Listo
                </div>
                <h4 className="font-bold text-white text-base">
                  Escanea este código con WhatsApp desde tu teléfono
                </h4>
                <ol className="text-[11px] text-slate-300 list-decimal list-inside space-y-0.5 font-medium">
                  <li>Abre WhatsApp en el teléfono de Compras/Tesorería</li>
                  <li>Toca <strong className="text-white">Ajustes</strong> o <strong className="text-white">Menú</strong> y selecciona <strong className="text-white">Dispositivos vinculados</strong></li>
                  <li>Toca <strong className="text-white">Vincular un dispositivo</strong> y apunta tu cámara a este código</li>
                </ol>
                <div className="pt-1 flex flex-wrap items-center gap-2 text-[10px] text-slate-400 font-mono">
                  <span className="bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
                    Línea corporativa: {brmSession.corporatePhoneE164}
                  </span>
                  <span className="bg-slate-900 px-2 py-0.5 rounded border border-slate-800 truncate max-w-[240px]">
                    Token: {brmSession.qrPayloadData}
                  </span>
                </div>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row md:flex-col gap-2 w-full md:w-auto shrink-0">
              <button
                type="button"
                onClick={() => confirmBrmQrPairing()}
                className="min-h-[44px] px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold shadow-lg shadow-emerald-900/40 flex items-center justify-center gap-2 cursor-pointer transition"
              >
                <CheckCircle2 className="w-4 h-4" />
                Confirmar Vinculación Activa
              </button>
              <button
                type="button"
                onClick={() => requestBrmQrSession(corpPhoneInput)}
                className="min-h-[44px] px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 font-medium flex items-center justify-center gap-1.5 cursor-pointer transition text-xs"
              >
                <QrCode className="w-3.5 h-3.5" />
                Regenerar Código QR
              </button>
            </div>
          </div>
        )}

        {/* Tarjeta de Confirmación Humana de Borrador de Retención (Prevención de Despacho Accidental) */}
        {stagedRetentionDispatch && (
          <div className="p-4 sm:p-5 rounded-2xl bg-amber-950/40 border-2 border-amber-500/60 shadow-xl space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-amber-500/30 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-amber-500/20 text-amber-300">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div>
                  <div className="inline-flex items-center gap-1.5 text-[11px] font-bold text-amber-400 uppercase tracking-wide">
                    Borrador Pre-Cargado para Confirmación Manual
                  </div>
                  <h4 className="font-bold text-white text-base">
                    Comprobante {stagedRetentionDispatch.voucherType} N° {stagedRetentionDispatch.voucherNumber} · {stagedRetentionDispatch.supplierName}
                  </h4>
                </div>
              </div>
              <div className="text-right text-xs">
                <span className="text-slate-400">Total Retenido:</span>{' '}
                <strong className="text-amber-300 text-sm">
                  Bs. {stagedRetentionDispatch.retainedVes.toFixed(2)} (${stagedRetentionDispatch.retainedUsd.toFixed(2)})
                </strong>
              </div>
            </div>

            <div className="bg-slate-950/80 p-3 rounded-xl border border-slate-800 text-xs font-mono text-slate-300 max-h-36 overflow-y-auto whitespace-pre-line leading-relaxed">
              {stagedRetentionDispatch.formattedSummaryMessage}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <p className="text-[11px] text-slate-400">
                El comprobante permanece en estado <strong className="text-amber-300">EMITIDO</strong> hasta que confirmes el envío formal.
              </p>
              <div className="flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => clearStagedRetentionDispatch()}
                  className="min-h-[44px] px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 text-xs font-bold transition cursor-pointer"
                >
                  Descartar Borrador (No Enviar)
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    const res = await confirmStagedRetentionDispatch(false);
                    if (res.success) {
                      setBanner({
                        type: 'ok',
                        text: `Comprobante despachado con éxito al proveedor vía BRM y marcado como ENTREGADO.`,
                      });
                    } else {
                      setBanner({
                        type: 'err',
                        text: res.error || 'Error despachando comprobante.',
                      });
                    }
                  }}
                  className="min-h-[44px] px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-lg shadow-emerald-900/40 flex items-center gap-2 cursor-pointer transition"
                >
                  <Send className="w-4 h-4" />
                  Confirmar y Enviar al Proveedor
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Pestañas de Navegación Interna BRM */}
        <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-800">
          <button
            type="button"
            onClick={() => setTab('SUPPLIERS_360')}
            className={`min-h-[44px] px-4 rounded-xl text-xs font-bold border transition cursor-pointer ${
              tab === 'SUPPLIERS_360'
                ? 'bg-emerald-600 text-white border-emerald-500'
                : 'bg-slate-950 text-slate-300 border-slate-800'
            }`}
          >
            1. Expediente 360° Proveedores & Envíos 1-Clic
          </button>
          <button
            type="button"
            onClick={() => setTab('INBOX_PRE_AUDIT')}
            className={`min-h-[44px] px-4 rounded-xl text-xs font-bold border transition cursor-pointer ${
              tab === 'INBOX_PRE_AUDIT'
                ? 'bg-emerald-600 text-white border-emerald-500'
                : 'bg-slate-950 text-slate-300 border-slate-800'
            }`}
          >
            2. Doble Compuerta Facturas Entrantes OCR ({pendingPreInvoicesCount})
          </button>
          <button
            type="button"
            onClick={() => setTab('LEDGER')}
            className={`min-h-[44px] px-4 rounded-xl text-xs font-bold border transition cursor-pointer ${
              tab === 'LEDGER'
                ? 'bg-emerald-600 text-white border-emerald-500'
                : 'bg-slate-950 text-slate-300 border-slate-800'
            }`}
          >
            3. Bitácora Auditada E.164 ({brmMessages.length})
          </button>
        </div>
      </div>

      {banner && (
        <div
          className={`p-3 rounded-xl border text-xs flex items-center justify-between gap-2 ${
            banner.type === 'ok'
              ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-200'
              : 'bg-rose-950/60 border-rose-500/40 text-rose-200'
          }`}
        >
          <span className="flex items-center gap-2">
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
            className="text-slate-400 hover:text-white px-2 cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {tab === 'SUPPLIERS_360' && activeSupplier && (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          {/* Selector y Ficha Homologada del Proveedor */}
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

            <form onSubmit={handleCustomSend} className="space-y-2 pt-2 border-t border-slate-800">
              <label className="block text-slate-300 font-semibold">
                Mensaje Institucional a Proveedor
              </label>
              <textarea
                rows={3}
                value={customMsg}
                onChange={(e) => setCustomMsg(e.target.value)}
                placeholder="Ej. Confirmamos ventana de descarga en Cava Principal a las 08:30 AM..."
                className="w-full p-3 rounded-xl bg-slate-950 border border-slate-700 text-white"
              />
              <button
                type="submit"
                className="w-full min-h-[44px] rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Send className="w-4 h-4" />
                Enviar Mensaje Auditado BRM
              </button>
            </form>
          </div>

          {/* Despacho 1-Clic de Facturas/Pagos/Retenciones y Órdenes de Compra */}
          <div className="xl:col-span-2 space-y-4">
            {/* Facturas, Pagos y Comprobantes PDF de Retención IVA/ISLR */}
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
                                        ? `Paquete de Pago + PDFs de Retención enviado a ${activeSupplier.name} y marcado ENTREGADO.`
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
                                  title="Abrir también en WhatsApp Web / Móvil (wa.me)"
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

      {tab === 'INBOX_PRE_AUDIT' && (
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
              Simular metadatos EXIF alterados / edición IA (Prueba Anti-Fraude)
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

      {tab === 'LEDGER' && (
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
