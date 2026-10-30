import React, { useState, useMemo } from 'react';
import {
  FileText,
  Eye,
  ZoomIn,
  ZoomOut,
  RotateCw,
  Maximize2,
  Minimize2,
  CheckCircle2,
  AlertTriangle,
  AlertOctagon,
  ShieldCheck,
  Building2,
  Calendar,
  DollarSign,
  ArrowRight,
  Sparkles,
  Layers,
  Percent,
  X,
  FileCheck,
  Smartphone,
  Monitor,
} from 'lucide-react';
import {
  PurchaseInvoice,
  PurchaseInvoiceLine,
  StorageZone,
  TaxRetentionVoucher,
} from '../../types';
import { toDecimal, round2, formatUsd, formatVes } from '../../lib/decimal';
import { ISLR_CONCEPTS_CATALOG } from '../../lib/fiscal-retentions';

export interface InvoiceOcrSplitViewerProps {
  invoice: Partial<PurchaseInvoice>;
  attachmentUrl?: string | null;
  attachmentName?: string;
  attachmentMimeType?: string;
  onClose: () => void;
  onApproveAndCommit: (params: {
    destinationZone: StorageZone;
    ivaRetentionPercent: number;
    islrConceptCode: string;
    islrRetentionPercent: number;
    editedLines: PurchaseInvoiceLine[];
  }) => void;
  activeBcvRate: number;
}

export const InvoiceOcrSplitViewer: React.FC<InvoiceOcrSplitViewerProps> = ({
  invoice,
  attachmentUrl,
  attachmentName = 'Factura_Proveedor.pdf',
  attachmentMimeType = 'application/pdf',
  onClose,
  onApproveAndCommit,
  activeBcvRate,
}) => {
  // Estado de UX Móvil: Pestaña activa ('DOCUMENTO' o 'DATOS')
  const [mobileActiveTab, setMobileActiveTab] = useState<'DOCUMENTO' | 'DATOS'>('DATOS');

  // Controles de Visor Documental Interactivo
  const [zoomLevel, setZoomLevel] = useState<number>(100);
  const [rotationDegrees, setRotationDegrees] = useState<number>(0);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);

  // Formulario Editable de Cotejo
  const [editedLines, setEditedLines] = useState<PurchaseInvoiceLine[]>(
    invoice.lines || []
  );
  const [destinationZone, setDestinationZone] = useState<StorageZone>('DEPOSITO');

  // Modal de Confirmación Rápida de Retenciones SENIAT (Decisión Estratégica Opción B)
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState<boolean>(false);
  const [ivaRetentionPercent, setIvaRetentionPercent] = useState<number>(75);
  const [selectedIslrConceptCode, setSelectedIslrConceptCode] = useState<string>('ISLR-001');

  const isPdf =
    attachmentMimeType.includes('pdf') ||
    attachmentName.toLowerCase().endsWith('.pdf');

  // Totales calculados en vivo con Decimal.js
  const liveTotals = useMemo(() => {
    let subtotalDec = toDecimal(0);
    let iva16Dec = toDecimal(0);
    let iva8Dec = toDecimal(0);

    for (const ln of editedLines) {
      const lineTot = toDecimal(ln.quantity || 0).times(ln.unitCostUsd || 0);
      subtotalDec = subtotalDec.plus(lineTot);

      if (ln.ivaRate === 16) {
        iva16Dec = iva16Dec.plus(lineTot.times(0.16));
      } else if (ln.ivaRate === 8) {
        iva8Dec = iva8Dec.plus(lineTot.times(0.08));
      }
    }

    const totalIvaDec = iva16Dec.plus(iva8Dec);
    const igtfDec = toDecimal(invoice.igtfAmountUsd || 0);
    const totalDec = subtotalDec.plus(totalIvaDec).plus(igtfDec);

    return {
      subtotalUsd: round2(subtotalDec),
      ivaAmountUsd: round2(totalIvaDec),
      igtfAmountUsd: round2(igtfDec),
      totalUsd: round2(totalDec),
      totalVes: round2(totalDec.times(activeBcvRate)),
    };
  }, [editedLines, invoice.igtfAmountUsd, activeBcvRate]);

  // Cálculo en vivo de Retenciones para el Modal de Confirmación Rápida
  const retentionCalculations = useMemo(() => {
    const ivaRetainedUsd = toDecimal(liveTotals.ivaAmountUsd)
      .times(ivaRetentionPercent)
      .dividedBy(100);

    const islrConcept =
      ISLR_CONCEPTS_CATALOG.find((c) => c.code === selectedIslrConceptCode) ||
      ISLR_CONCEPTS_CATALOG[0];

    const islrPercent = islrConcept.pjRatePercent;
    const islrRetainedUsd = toDecimal(liveTotals.subtotalUsd)
      .times(islrPercent)
      .dividedBy(100);

    const totalRetainedUsd = ivaRetainedUsd.plus(islrRetainedUsd);
    const netPayableUsd = toDecimal(liveTotals.totalUsd).minus(totalRetainedUsd);

    return {
      ivaRetainedUsd: round2(ivaRetainedUsd),
      ivaRetainedVes: round2(ivaRetainedUsd.times(activeBcvRate)),
      islrConcept,
      islrPercent,
      islrRetainedUsd: round2(islrRetainedUsd),
      islrRetainedVes: round2(islrRetainedUsd.times(activeBcvRate)),
      totalRetainedUsd: round2(totalRetainedUsd),
      totalRetainedVes: round2(totalRetainedUsd.times(activeBcvRate)),
      netPayableUsd: round2(netPayableUsd),
      netPayableVes: round2(netPayableUsd.times(activeBcvRate)),
    };
  }, [liveTotals, ivaRetentionPercent, selectedIslrConceptCode, activeBcvRate]);

  const handleZoomIn = () => setZoomLevel((prev) => Math.min(250, prev + 25));
  const handleZoomOut = () => setZoomLevel((prev) => Math.max(50, prev - 25));
  const handleRotate = () => setRotationDegrees((prev) => (prev + 90) % 360);

  const handleLineQtyChange = (idx: number, newQty: number) => {
    setEditedLines((prev) => {
      const copy = [...prev];
      if (copy[idx]) {
        copy[idx] = {
          ...copy[idx],
          quantity: newQty,
          lineTotalUsd: round2(toDecimal(newQty).times(copy[idx].unitCostUsd || 0)),
        };
      }
      return copy;
    });
  };

  const handleLineCostChange = (idx: number, newCost: number) => {
    setEditedLines((prev) => {
      const copy = [...prev];
      if (copy[idx]) {
        copy[idx] = {
          ...copy[idx],
          unitCostUsd: newCost,
          lineTotalUsd: round2(toDecimal(copy[idx].quantity || 0).times(newCost)),
        };
      }
      return copy;
    });
  };

  const handleFinalConfirm = () => {
    onApproveAndCommit({
      destinationZone,
      ivaRetentionPercent,
      islrConceptCode: selectedIslrConceptCode,
      islrRetentionPercent: retentionCalculations.islrPercent,
      editedLines,
    });
    setIsConfirmModalOpen(false);
  };

  return (
    <div
      className={`fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-xs flex flex-col ${
        isFullscreen ? 'p-0' : 'p-2 sm:p-4'
      }`}
    >
      <div className="bg-white rounded-2xl shadow-2xl flex flex-col h-full overflow-hidden border border-slate-300">
        {/* Barra Superior de Control */}
        <div className="bg-slate-900 text-white px-4 py-3 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-600 rounded-lg">
              <Eye className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm sm:text-base font-bold tracking-tight">
                  Validación Visual Split-Screen & Cotejo Forense OCR
                </h2>
                <span className="hidden sm:inline-block px-2 py-0.5 bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[10px] font-bold rounded-full">
                  Doble Motor @OCR Activo
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Factura #{invoice.invoiceNumber || 'S/N'} · Control #{invoice.controlNumber || 'S/C'} · Proveedor:{' '}
                {invoice.supplierName || 'Alimentos Polar Comercial'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsFullscreen(!isFullscreen)}
              className="hidden sm:flex min-h-[36px] min-w-[36px] items-center justify-center p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300"
              title="Pantalla Completa"
            >
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
            <button
              onClick={onClose}
              className="min-h-[44px] min-w-[44px] flex items-center justify-center p-2 rounded-lg bg-slate-800 hover:bg-rose-600 text-slate-300 hover:text-white transition-colors"
              title="Cerrar Visor"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Selector de Pestañas Móviles (<768px - Decisión Estratégica Opción A) */}
        <div className="md:hidden flex border-b border-slate-200 bg-slate-100 p-1 shrink-0">
          <button
            onClick={() => setMobileActiveTab('DOCUMENTO')}
            className={`flex-1 py-2 text-xs font-bold rounded-lg flex items-center justify-center gap-1.5 transition-all min-h-[44px] ${
              mobileActiveTab === 'DOCUMENTO'
                ? 'bg-white text-indigo-700 shadow-xs'
                : 'text-slate-600 hover:bg-slate-200'
            }`}
          >
            <FileText className="w-4 h-4" /> 📄 Ver Factura Original
          </button>
          <button
            onClick={() => setMobileActiveTab('DATOS')}
            className={`flex-1 py-2 text-xs font-bold rounded-lg flex items-center justify-center gap-1.5 transition-all min-h-[44px] ${
              mobileActiveTab === 'DATOS'
                ? 'bg-white text-indigo-700 shadow-xs'
                : 'text-slate-600 hover:bg-slate-200'
            }`}
          >
            <Sparkles className="w-4 h-4" /> ✍️ Datos Extraídos & Cotejo
          </button>
        </div>

        {/* Contenedor Principal: Split-Screen Side-by-Side en PC / Pestañas en Móvil */}
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden relative">
          {/* PANEL IZQUIERDO: VISOR DOCUMENTAL INTERACTIVO (50% en PC) */}
          <div
            className={`md:w-1/2 w-full h-full bg-slate-800 flex flex-col border-r border-slate-200 overflow-hidden ${
              mobileActiveTab === 'DATOS' ? 'hidden md:flex' : 'flex'
            }`}
          >
            {/* Barra de Herramientas del Documento */}
            <div className="bg-slate-900/90 text-slate-300 px-3 py-2 flex items-center justify-between text-xs border-b border-slate-700 shrink-0">
              <span className="font-mono text-slate-400 truncate max-w-[200px]">
                {attachmentName}
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={handleZoomOut}
                  className="min-h-[36px] min-w-[36px] p-1.5 rounded hover:bg-slate-700 text-slate-300"
                  title="Reducir Zoom"
                >
                  <ZoomOut className="w-4 h-4" />
                </button>
                <span className="font-mono text-[11px] px-1 text-slate-400">{zoomLevel}%</span>
                <button
                  onClick={handleZoomIn}
                  className="min-h-[36px] min-w-[36px] p-1.5 rounded hover:bg-slate-700 text-slate-300"
                  title="Aumentar Zoom"
                >
                  <ZoomIn className="w-4 h-4" />
                </button>
                <button
                  onClick={handleRotate}
                  className="min-h-[36px] min-w-[36px] p-1.5 rounded hover:bg-slate-700 text-slate-300"
                  title="Rotar 90°"
                >
                  <RotateCw className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Lienzo del Documento */}
            <div className="flex-1 overflow-auto p-4 flex items-center justify-center bg-slate-900/60">
              <div
                className="transition-transform duration-200 shadow-2xl bg-white rounded overflow-hidden"
                style={{
                  transform: `scale(${zoomLevel / 100}) rotate(${rotationDegrees}deg)`,
                  transformOrigin: 'center center',
                }}
              >
                {attachmentUrl ? (
                  isPdf ? (
                    <embed
                      src={attachmentUrl}
                      type="application/pdf"
                      className="w-[500px] h-[700px] rounded"
                    />
                  ) : (
                    <img
                      src={attachmentUrl}
                      alt="Factura Proveedor"
                      className="max-w-[500px] h-auto object-contain rounded select-none"
                    />
                  )
                ) : (
                  /* Simulación visual fiel si no hay binario cargado */
                  <div className="w-[420px] h-[580px] p-6 bg-white text-slate-900 font-mono text-[11px] border border-slate-300 space-y-3">
                    <div className="text-center border-b pb-2">
                      <div className="font-bold text-sm">ALIMENTOS POLAR COMERCIAL, C.A.</div>
                      <div>RIF: J-00006372-9 · CONTRIBUYENTE ESPECIAL</div>
                      <div>Caracas, Venezuela · Tel: 0212-2023111</div>
                    </div>
                    <div className="flex justify-between border-b pb-2">
                      <div>FACTURA: {invoice.invoiceNumber || 'FAC-2026-08914'}</div>
                      <div>CONTROL: {invoice.controlNumber || '00-8819201'}</div>
                    </div>
                    <div>CLIENTE: HIPER ABASTO POLAR, C.A. (RIF: J-50123456-7)</div>
                    <div className="border-t border-b py-2 space-y-1">
                      {editedLines.map((l, idx) => (
                        <div key={idx} className="flex justify-between">
                          <span className="truncate max-w-[180px]">
                            {l.quantity}x {l.description}
                          </span>
                          <span>${l.lineTotalUsd.toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                    <div className="text-right space-y-0.5 pt-2">
                      <div>SUBTOTAL: ${liveTotals.subtotalUsd.toFixed(2)}</div>
                      <div>IVA (16%): ${liveTotals.ivaAmountUsd.toFixed(2)}</div>
                      <div className="font-bold text-xs pt-1 border-t">
                        TOTAL FACTURA: ${liveTotals.totalUsd.toFixed(2)}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* PANEL DERECHO: FORMULARIO DE COTEJO Y AUDITORÍA FORENSE (50% en PC) */}
          <div
            className={`md:w-1/2 w-full h-full bg-slate-50 flex flex-col overflow-hidden ${
              mobileActiveTab === 'DOCUMENTO' ? 'hidden md:flex' : 'flex'
            }`}
          >
            {/* Header de Datos y Semáforo de Veracidad */}
            <div className="bg-white p-4 border-b border-slate-200 shrink-0 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-emerald-600" />
                  <span className="text-xs font-bold text-slate-800">
                    Dictamen Forense:{' '}
                    {invoice.attachment?.verdict ||
                      (invoice.forensicAudit?.passedAllLocks
                        ? 'AUTENTICO_ALTA_CONFIANZA'
                        : 'REVISION_REQUERIDA')}
                  </span>
                </div>
                <span className="text-xs font-bold font-mono text-indigo-700">
                  Tasa BCV: {activeBcvRate.toFixed(2)} VES/USD
                </span>
              </div>

              {/* Selector de Destino Físico */}
              <div className="flex items-center gap-3 pt-1">
                <span className="text-xs font-semibold text-slate-700">Destino de Stock:</span>
                <label className="flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer">
                  <input
                    type="radio"
                    name="destZone"
                    checked={destinationZone === 'DEPOSITO'}
                    onChange={() => setDestinationZone('DEPOSITO')}
                    className="text-indigo-600 focus:ring-indigo-500"
                  />
                  Depósito Central
                </label>
                <label className="flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer">
                  <input
                    type="radio"
                    name="destZone"
                    checked={destinationZone === 'ANAQUEL'}
                    onChange={() => setDestinationZone('ANAQUEL')}
                    className="text-indigo-600 focus:ring-indigo-500"
                  />
                  Anaquel / Exhibición Directa
                </label>
              </div>
            </div>

            {/* Tabla Editable de Renglones Facturados */}
            <div className="flex-1 overflow-auto p-4 space-y-3">
              <div className="bg-white rounded-lg border border-slate-200 overflow-hidden shadow-xs">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-100 text-slate-700 font-semibold border-b">
                    <tr>
                      <th className="p-2.5">SKU / Descripción</th>
                      <th className="p-2.5 text-right w-20">Cantidad</th>
                      <th className="p-2.5 text-right w-24">Costo USD</th>
                      <th className="p-2.5 text-right w-24">Total USD</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {editedLines.map((ln, idx) => (
                      <tr key={ln.id || idx} className="hover:bg-slate-50">
                        <td className="p-2.5">
                          <div className="font-bold text-slate-800">{ln.sku}</div>
                          <div className="text-[11px] text-slate-500 truncate max-w-[180px]">
                            {ln.description}
                          </div>
                        </td>
                        <td className="p-2.5 text-right">
                          <input
                            type="number"
                            min="0.1"
                            step="any"
                            value={ln.quantity}
                            onChange={(e) =>
                              handleLineQtyChange(idx, parseFloat(e.target.value) || 0)
                            }
                            className="w-full text-right font-mono p-1 border rounded bg-slate-50 font-semibold"
                          />
                        </td>
                        <td className="p-2.5 text-right">
                          <input
                            type="number"
                            min="0.01"
                            step="any"
                            value={ln.unitCostUsd}
                            onChange={(e) =>
                              handleLineCostChange(idx, parseFloat(e.target.value) || 0)
                            }
                            className="w-full text-right font-mono p-1 border rounded bg-slate-50 font-semibold"
                          />
                        </td>
                        <td className="p-2.5 text-right font-mono font-bold text-slate-800 tabular-nums">
                          ${ln.lineTotalUsd.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Tarjeta de Resumen Numérico Cotejado */}
              <div className="bg-white p-3 rounded-lg border border-slate-200 space-y-1 text-xs">
                <div className="flex justify-between text-slate-600">
                  <span>Subtotal Factura:</span>
                  <span className="font-mono font-bold text-slate-800">
                    {formatUsd(liveTotals.subtotalUsd)}
                  </span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>IVA Calculado (16% / 8%):</span>
                  <span className="font-mono font-bold text-slate-800">
                    {formatUsd(liveTotals.ivaAmountUsd)}
                  </span>
                </div>
                <div className="flex justify-between text-slate-800 font-bold border-t pt-1.5 text-sm">
                  <span>Total Factura:</span>
                  <div className="text-right">
                    <div className="text-indigo-600 font-mono">{formatUsd(liveTotals.totalUsd)}</div>
                    <div className="text-[11px] font-mono text-slate-500 font-normal">
                      ≈ {formatVes(liveTotals.totalVes)}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Botón de Acción Principal en Footer */}
            <div className="bg-white p-4 border-t border-slate-200 shrink-0 flex items-center justify-between gap-3">
              <button
                onClick={onClose}
                className="min-h-[44px] px-4 py-2 border border-slate-300 hover:bg-slate-100 rounded-lg text-xs font-semibold text-slate-700"
              >
                Cancelar
              </button>
              <button
                onClick={() => setIsConfirmModalOpen(true)}
                className="min-h-[44px] px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold flex items-center gap-2 shadow-xs transition-colors"
              >
                <CheckCircle2 className="w-4 h-4" /> Aprobar y Asentar Factura...
              </button>
            </div>
          </div>
        </div>

        {/* Botón Flotante para Alternancia Rápida en Móvil (<768px) */}
        <div className="md:hidden fixed bottom-6 right-6 z-50">
          <button
            onClick={() =>
              setMobileActiveTab(mobileActiveTab === 'DOCUMENTO' ? 'DATOS' : 'DOCUMENTO')
            }
            className="min-h-[48px] px-4 py-2 bg-indigo-600 text-white font-bold rounded-full shadow-lg flex items-center gap-2 text-xs border-2 border-white"
          >
            {mobileActiveTab === 'DOCUMENTO' ? (
              <>
                <Sparkles className="w-4 h-4" /> Ir a Cotejo
              </>
            ) : (
              <>
                <FileText className="w-4 h-4" /> Ver Documento
              </>
            )}
          </button>
        </div>
      </div>

      {/* MODAL DE CONFIRMACIÓN RÁPIDA DE RETENCIONES SENIAT (Decisión Estratégica Opción B) */}
      {isConfirmModalOpen && (
        <div className="fixed inset-0 z-60 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-3">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-5 border border-slate-200 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <FileCheck className="w-5 h-5 text-indigo-600" />
                <h3 className="text-sm font-bold text-slate-900">
                  Confirmación de Retenciones SENIAT
                </h3>
              </div>
              <button
                onClick={() => setIsConfirmModalOpen(false)}
                className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-600">
              Verifique las alícuotas fiscales aplicables antes de generar los comprobantes oficiales en PDF y
              asentar la cuenta por pagar a <strong>{invoice.supplierName}</strong>.
            </p>

            {/* Ajuste de Retención IVA */}
            <div className="space-y-1.5 bg-slate-50 p-3 rounded-lg border border-slate-200 text-xs">
              <label className="font-semibold text-slate-700 flex justify-between">
                <span>Alícuota Retención IVA:</span>
                <span className="font-mono font-bold text-indigo-700">
                  {ivaRetentionPercent}% (Retenido: {formatUsd(retentionCalculations.ivaRetainedUsd)})
                </span>
              </label>
              <div className="flex gap-2">
                {[75, 100].map((pct) => (
                  <button
                    key={pct}
                    type="button"
                    onClick={() => setIvaRetentionPercent(pct)}
                    className={`flex-1 py-1.5 rounded font-bold transition-all min-h-[36px] ${
                      ivaRetentionPercent === pct
                        ? 'bg-indigo-600 text-white'
                        : 'bg-white border text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    {pct === 75 ? '75% (General)' : '100% (Especial/No Declarado)'}
                  </button>
                ))}
              </div>
            </div>

            {/* Ajuste de Concepto ISLR */}
            <div className="space-y-1.5 bg-slate-50 p-3 rounded-lg border border-slate-200 text-xs">
              <label className="font-semibold text-slate-700 flex justify-between">
                <span>Concepto ISLR:</span>
                <span className="font-mono font-bold text-amber-700">
                  {retentionCalculations.islrPercent}% (Retenido:{' '}
                  {formatUsd(retentionCalculations.islrRetainedUsd)})
                </span>
              </label>
              <select
                value={selectedIslrConceptCode}
                onChange={(e) => setSelectedIslrConceptCode(e.target.value)}
                className="w-full p-2 border border-slate-300 rounded bg-white text-xs"
              >
                {ISLR_CONCEPTS_CATALOG.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.name} ({c.pjRatePercent}%)
                  </option>
                ))}
              </select>
            </div>

            {/* Resumen Final de Asiento */}
            <div className="p-3 bg-emerald-50 rounded-lg border border-emerald-200 text-xs space-y-1">
              <div className="flex justify-between text-slate-700">
                <span>Total Factura Proveedor:</span>
                <span className="font-mono font-bold">{formatUsd(liveTotals.totalUsd)}</span>
              </div>
              <div className="flex justify-between text-rose-600 font-semibold">
                <span>Total Retenido (IVA + ISLR):</span>
                <span className="font-mono">-{formatUsd(retentionCalculations.totalRetainedUsd)}</span>
              </div>
              <div className="flex justify-between text-emerald-900 font-extrabold border-t border-emerald-200 pt-1 text-sm">
                <span>Neto a Pagar a Proveedor:</span>
                <span className="font-mono">{formatUsd(retentionCalculations.netPayableUsd)}</span>
              </div>
              <div className="text-[11px] text-right font-mono text-emerald-700">
                ≈ {formatVes(retentionCalculations.netPayableVes)}
              </div>
            </div>

            {/* Acciones del Modal */}
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsConfirmModalOpen(false)}
                className="flex-1 min-h-[44px] py-2 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-100"
              >
                Volver al Cotejo
              </button>
              <button
                type="button"
                onClick={handleFinalConfirm}
                className="flex-1 min-h-[44px] py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-xs flex items-center justify-center gap-1.5"
              >
                <CheckCircle2 className="w-4 h-4" /> Asentar y Emitir PDF
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default InvoiceOcrSplitViewer;
