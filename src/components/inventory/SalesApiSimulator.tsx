import React, { useState } from 'react';
import {
  Webhook,
  Play,
  CheckCircle2,
  AlertTriangle,
  X,
  ScanBarcode,
  Printer,
  FileSpreadsheet,
} from 'lucide-react';
import { useInventory } from '../../context/InventoryContext';
import { useFinance } from '../../context/FinanceContext';
import { useUIConfig } from '../../context/UIConfigContext';
import { useOperationsBrm } from '../../context/OperationsBrmContext';
import { formatUsd, formatVes } from '../../lib/decimal';
import { resolveCatalogProductFromBarcode } from '../../lib/scale-barcode';
import { computeFiscalPayloadSignature } from '../../lib/fiscal-printer';
import {
  buildSeniatSalesBookWorkbook,
  triggerWorkbookDownload,
} from '../../lib/seniat-exporter';
import { BarcodeScannerModal } from '../common/BarcodeScannerModal';
import { FiscalZReportRecord } from '../../types';

export const SalesApiSimulator: React.FC = () => {
  const {
    products,
    locations,
    salesEvents,
    posShelfShortfallBanner,
    dismissPosShelfShortfallBanner,
    simulatePosWebhookSale,
  } = useInventory();
  const { bcvState } = useFinance();
  const { config } = useUIConfig();
  const { fiscalZReports, registerFiscalZReport } = useOperationsBrm();
  const [locationId, setLocationId] = useState('loc-pzo-01');
  const [barcodeQuickInput, setBarcodeQuickInput] = useState('');
  const [isPosScannerOpen, setIsPosScannerOpen] = useState(false);

  // Estado Conector Impresora Fiscal Homologada SENIAT (Reporte X / Z)
  const [printerBrand, setPrinterBrand] =
    useState<FiscalZReportRecord['printerBrand']>('THE_FACTORY_HKA');
  const [printerSerial, setPrinterSerial] = useState('Z1F0009841');
  const [zNumber, setZNumber] = useState('0412');
  const [closureDate, setClosureDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [reportType, setReportType] =
    useState<FiscalZReportRecord['reportType']>('REPORTE_Z_DIARIO');
  const [zSource, setZSource] =
    useState<FiscalZReportRecord['source']>('API_PUENTE_FISCAL');
  const [exemptUsd, setExemptUsd] = useState<string>('485.00');
  const [base16Usd, setBase16Usd] = useState<string>('720.00');
  const [base8Usd, setBase8Usd] = useState<string>('210.00');
  const [igtfBaseUsd, setIgtfBaseUsd] = useState<string>('310.00');
  const [invoicesCount, setInvoicesCount] = useState<string>('148');
  const [payloadJson, setPayloadJson] = useState(
    JSON.stringify(
      [
        { sku: 'HAR-PAN-1KG', qty: 5 },
        { sku: 'ACE-MAZ-1LT', qty: 2 },
        { sku: 'ARR-PRI-1KG', qty: 4 },
      ],
      null,
      2
    )
  );
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; message: string } | null>(null);

  const handleDispatchWebhook = () => {
    try {
      const parsed = JSON.parse(payloadJson);
      if (!Array.isArray(parsed)) {
        setFeedback({ type: 'err', message: 'El payload JSON debe ser un arreglo de objetos.' });
        return;
      }
      const res = simulatePosWebhookSale(locationId, parsed);
      if (!res.success) {
        setFeedback({ type: 'err', message: res.error || 'Error procesando webhook POS.' });
      } else {
        setFeedback({
          type: 'ok',
          message: `Webhook POS procesado (${res.event?.externalPosId}). Descuento aplicado primero sobre Anaquel y respaldo sobre Depósito.`,
        });
      }
    } catch {
      setFeedback({ type: 'err', message: 'Sintaxis JSON inválida en el cuerpo del webhook.' });
    }
  };

  const appendBarcodeToPosTicket = (rawCode: string) => {
    const clean = rawCode.trim();
    if (!clean) return;
    const resolved = resolveCatalogProductFromBarcode(clean, products);
    if (!resolved.product) {
      setFeedback({
        type: 'err',
        message: `Código/PLU "${clean}" no coincide con ningún SKU del catálogo.`,
      });
      return;
    }
    try {
      const currentList: Array<{ sku: string; qty: number }> = JSON.parse(payloadJson);
      const safeArr = Array.isArray(currentList) ? [...currentList] : [];
      const existingIdx = safeArr.findIndex((x) => x.sku === resolved.product!.sku);
      if (existingIdx >= 0) {
        safeArr[existingIdx] = {
          ...safeArr[existingIdx],
          qty: Number((safeArr[existingIdx].qty + resolved.effectiveQuantity).toFixed(3)),
        };
      } else {
        safeArr.push({
          sku: resolved.product.sku,
          qty: resolved.effectiveQuantity,
        });
      }
      setPayloadJson(JSON.stringify(safeArr, null, 2));
      setBarcodeQuickInput('');
      setFeedback({
        type: 'ok',
        message: resolved.decoded.isScaleVariableBarcode
          ? `Etiqueta Balanza EAN-13 decodificada: ${resolved.product.name} (${resolved.effectiveQuantity} ${resolved.product.unit}) añadida al ticket.`
          : `SKU ${resolved.product.sku} (+${resolved.effectiveQuantity}) añadido al ticket POS.`,
      });
    } catch {
      setPayloadJson(
        JSON.stringify([{ sku: resolved.product.sku, qty: resolved.effectiveQuantity }], null, 2)
      );
    }
  };

  const handleRegisterFiscalZ = (e: React.FormEvent) => {
    e.preventDefault();
    const loc = locations.find((l) => l.id === locationId) || locations[0];
    const autoSig =
      zSource === 'API_PUENTE_FISCAL'
        ? computeFiscalPayloadSignature(printerSerial, zNumber, closureDate)
        : undefined;

    const res = registerFiscalZReport({
      zNumber,
      printerSerial,
      printerBrand,
      locationId: loc?.id || locationId,
      locationName: loc?.name || 'Sede Principal',
      closureDate,
      reportType,
      invoicesCount: Math.max(1, Number(invoicesCount) || 1),
      exemptSalesUsd: Math.max(0, Number(exemptUsd) || 0),
      taxableBase16Usd: Math.max(0, Number(base16Usd) || 0),
      taxableBase8Usd: Math.max(0, Number(base8Usd) || 0),
      igtfBaseForeignUsd: Math.max(0, Number(igtfBaseUsd) || 0),
      bcvRateClosure: bcvState.activeRate || 36.5,
      source: zSource,
      providedSignature: autoSig,
    });

    if (!res.success || !res.report) {
      setFeedback({
        type: 'err',
        message: res.error || 'No se pudo certificar el Reporte Fiscal Z.',
      });
      return;
    }

    setZNumber(String(Number(zNumber) + 1).padStart(4, '0'));
    setFeedback({
      type: 'ok',
      message: `Reporte Fiscal ${res.report.reportType} #${res.report.zNumber} (${res.report.printerSerial}) certificado: ${formatVes(res.report.grandTotalFiscalVes)} (${formatUsd(res.report.grandTotalFiscalUsd)}).`,
    });
  };

  const handleDownloadSalesBookXlsx = () => {
    const periodYm = closureDate.slice(0, 7).replace('-', '');
    const wb = buildSeniatSalesBookWorkbook({
      zReports: fiscalZReports,
      companyProfile: config.companyProfile,
      periodYearMonth: periodYm,
    });
    triggerWorkbookDownload(wb, `Libro_Especial_Ventas_ReportesZ_${periodYm}.xlsx`);
  };

  return (
    <div className="space-y-5">
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
        <div className="flex items-center gap-2">
          <Webhook className="w-5 h-5 text-sky-600" />
          <h1 className="text-base font-bold text-slate-900">
            Pasarela API / Webhook de Sincronización con Cajas Registradoras POS Chrystal®
          </h1>
        </div>
        <p className="text-xs text-slate-500 mt-0.5">
          Descuento automático prioritario sobre Anaquel / Exhibición y alerta operativa cuando el
          ticket toma respaldo del Depósito.
        </p>
      </div>

      {posShelfShortfallBanner && (
        <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-300 text-amber-950 text-xs flex items-start justify-between gap-3">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <span className="font-semibold">{posShelfShortfallBanner}</span>
          </div>
          <button
            type="button"
            onClick={dismissPosShelfShortfallBanner}
            className="p-1 rounded hover:bg-amber-200/70 text-amber-800 cursor-pointer"
            aria-label="Cerrar alerta de anaquel"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs space-y-3 text-xs">
          <h2 className="font-bold uppercase tracking-wider text-slate-700">
            Disparador de Evento JSON (`POST /api/v1/pos/chrystal-sync`)
          </h2>

          {feedback && (
            <div
              className={`p-3 rounded-lg flex items-center gap-2 ${
                feedback.type === 'ok'
                  ? 'bg-emerald-50 text-emerald-900 border border-emerald-200'
                  : 'bg-rose-50 text-rose-900 border border-rose-200'
              }`}
            >
              {feedback.type === 'ok' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
              )}
              <span>{feedback.message}</span>
            </div>
          )}

          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              Sucursal Emisora del Ticket POS
            </label>
            <select
              value={locationId}
              onChange={(e) => setLocationId(e.target.value)}
              className="w-full px-2.5 py-2 border border-slate-300 rounded-lg bg-white font-medium"
            >
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.code} — {l.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              Lector Caja POS / Etiqueta Balanza EAN-13 (`20` Peso / `21` Importe)
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={barcodeQuickInput}
                onChange={(e) => setBarcodeQuickInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    appendBarcodeToPosTicket(barcodeQuickInput);
                  }
                }}
                placeholder="Escanee EAN-13 (ej. 201000101250X) o SKU..."
                className="flex-1 min-h-[44px] px-3 py-2 border border-slate-300 rounded-lg font-mono text-xs"
              />
              <button
                type="button"
                onClick={() => appendBarcodeToPosTicket(barcodeQuickInput)}
                className="min-h-[44px] px-3 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs cursor-pointer"
              >
                Agregar
              </button>
              <button
                type="button"
                onClick={() => setIsPosScannerOpen(true)}
                className="min-h-[44px] px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs inline-flex items-center gap-1 cursor-pointer"
              >
                <ScanBarcode className="w-4 h-4" />
                Cámara PWA
              </button>
            </div>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              Payload JSON de Ítems Facturados
            </label>
            <textarea
              rows={8}
              value={payloadJson}
              onChange={(e) => setPayloadJson(e.target.value)}
              className="w-full p-3 font-mono text-xs bg-slate-950 text-emerald-400 rounded-lg border border-slate-800 focus:outline-none"
            />
          </div>

          <button
            type="button"
            onClick={handleDispatchWebhook}
            className="w-full py-2.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-semibold flex items-center justify-center gap-2 transition"
          >
            <Play className="w-4 h-4" />
            Transmitir Ticket POS y Descontar Inventario
          </button>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs space-y-3">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700">
            Log de Transacciones POS Recibidas ({salesEvents.length})
          </h2>

          {salesEvents.length === 0 ? (
            <div className="text-xs text-slate-400 py-12 text-center border border-dashed border-slate-200 rounded-lg">
              Presione &ldquo;Transmitir Ticket POS&rdquo; para simular el cierre de una factura de
              caja.
            </div>
          ) : (
            <div className="space-y-2.5 max-h-96 overflow-y-auto">
              {salesEvents.map((evt) => (
                <div
                  key={evt.id}
                  className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs space-y-1.5"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold text-slate-900">
                      {evt.externalPosId}
                    </span>
                    <span className="font-mono font-bold text-emerald-700 tabular-nums">
                      {formatUsd(evt.totalUsd)}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-500 font-mono">
                    Sede: {evt.locationId} · {evt.timestampVet.slice(0, 19).replace('T', ' ')}
                  </div>
                  <div className="text-[11px] text-slate-700">
                    {evt.items.map((i) => `${i.qtySold}x ${i.sku}`).join(', ')}
                  </div>
                  {evt.shelfShortfallAlerts && evt.shelfShortfallAlerts.length > 0 && (
                    <div className="mt-1 p-2 rounded bg-amber-50 border border-amber-200 text-[10px] font-mono text-amber-950 space-y-0.5">
                      <div className="font-bold">
                        ⚠ Respaldo tomado de Depósito por falta de existencia en Anaquel:
                      </div>
                      {evt.shelfShortfallAlerts.map((al) => (
                        <div key={al.sku}>
                          • {al.sku}: Anaquel -{al.deductedFromShelf} / Depósito -{al.deductedFromDeposit}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Conector Impresoras Fiscales Homologadas SENIAT (SNAT/2024/000102) & Reporte X / Z */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-800 text-[11px] font-bold mb-1">
              <Printer className="w-3.5 h-3.5" />
              Providencia SNAT/2024/000102 · The Factory HKA · Bematech · PnP · Hasar
            </div>
            <h2 className="text-sm sm:text-base font-bold text-slate-900">
              Conector Impresora Fiscal Homologada &amp; Cierre Diario Reporte X / Z
            </h2>
          </div>

          <button
            type="button"
            disabled={fiscalZReports.length === 0}
            onClick={handleDownloadSalesBookXlsx}
            className="min-h-[44px] px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-xs font-bold inline-flex items-center gap-2 transition cursor-pointer"
          >
            <FileSpreadsheet className="w-4 h-4" />
            Descargar Libro de Ventas SENIAT (.XLSX)
          </button>
        </div>

        <form onSubmit={handleRegisterFiscalZ} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 text-xs">
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Marca Homologada</label>
            <select
              value={printerBrand}
              onChange={(e) => setPrinterBrand(e.target.value as FiscalZReportRecord['printerBrand'])}
              className="w-full min-h-[44px] px-2.5 py-2 border border-slate-300 rounded-lg bg-white font-semibold"
            >
              <option value="THE_FACTORY_HKA">The Factory HKA</option>
              <option value="BEMATECH">Bematech Fiscal</option>
              <option value="PNP">PnP / Plug &amp; Play</option>
              <option value="IMPRENTA_DIGITAL">Imprenta Digital SENIAT</option>
            </select>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Serial Fiscal SENIAT</label>
            <input
              type="text"
              required
              value={printerSerial}
              onChange={(e) => setPrinterSerial(e.target.value.toUpperCase())}
              className="w-full min-h-[44px] px-3 py-2 border border-slate-300 rounded-lg font-mono font-bold"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">N° Reporte &amp; Tipo</label>
            <div className="flex gap-1.5">
              <input
                type="text"
                required
                value={zNumber}
                onChange={(e) => setZNumber(e.target.value)}
                className="w-24 min-h-[44px] px-2.5 py-2 border border-slate-300 rounded-lg font-mono font-bold"
              />
              <select
                value={reportType}
                onChange={(e) => setReportType(e.target.value as FiscalZReportRecord['reportType'])}
                className="flex-1 min-h-[44px] px-2 py-2 border border-slate-300 rounded-lg bg-white font-bold"
              >
                <option value="REPORTE_Z_DIARIO">Z Diario</option>
                <option value="REPORTE_X_PARCIAL">X Parcial</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Fecha Cierre &amp; Vía</label>
            <div className="flex gap-1.5">
              <input
                type="date"
                required
                value={closureDate}
                onChange={(e) => setClosureDate(e.target.value)}
                className="w-34 min-h-[44px] px-2 py-2 border border-slate-300 rounded-lg font-mono"
              />
              <select
                value={zSource}
                onChange={(e) => setZSource(e.target.value as FiscalZReportRecord['source'])}
                className="flex-1 min-h-[44px] px-2 py-2 border border-slate-300 rounded-lg bg-white font-semibold"
              >
                <option value="API_PUENTE_FISCAL">Puente HMAC</option>
                <option value="CARGA_AUDITADA_CIERRE">Manual Audit.</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Facturas Emitidas</label>
            <input
              type="number"
              min="1"
              required
              value={invoicesCount}
              onChange={(e) => setInvoicesCount(e.target.value)}
              className="w-full min-h-[44px] px-3 py-2 border border-slate-300 rounded-lg font-mono font-bold tabular-nums"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Ventas Exentas ($)</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={exemptUsd}
              onChange={(e) => setExemptUsd(e.target.value)}
              className="w-full min-h-[44px] px-3 py-2 border border-slate-300 rounded-lg font-mono tabular-nums"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Base Gravada 16% ($)</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={base16Usd}
              onChange={(e) => setBase16Usd(e.target.value)}
              className="w-full min-h-[44px] px-3 py-2 border border-slate-300 rounded-lg font-mono tabular-nums"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Base Reducida 8% ($)</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={base8Usd}
              onChange={(e) => setBase8Usd(e.target.value)}
              className="w-full min-h-[44px] px-3 py-2 border border-slate-300 rounded-lg font-mono tabular-nums"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Base Divisas IGTF 3% ($)</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={igtfBaseUsd}
              onChange={(e) => setIgtfBaseUsd(e.target.value)}
              className="w-full min-h-[44px] px-3 py-2 border border-slate-300 rounded-lg font-mono tabular-nums"
            />
          </div>

          <div className="flex items-end">
            <button
              type="submit"
              className="w-full min-h-[44px] px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold transition cursor-pointer"
            >
              Certificar Reporte {reportType === 'REPORTE_Z_DIARIO' ? 'Z' : 'X'}
            </button>
          </div>
        </form>

        {fiscalZReports.length > 0 && (
          <div className="overflow-x-auto border border-slate-200 rounded-xl">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-900 text-slate-200 text-[11px] font-mono uppercase">
                  <th className="py-2.5 px-3">Fecha / Sede</th>
                  <th className="py-2.5 px-3">Serial / N° Z</th>
                  <th className="py-2.5 px-3 text-right">Exento ($)</th>
                  <th className="py-2.5 px-3 text-right">IVA 16% + 8% ($)</th>
                  <th className="py-2.5 px-3 text-right">IGTF 3% ($)</th>
                  <th className="py-2.5 px-3 text-right">Gran Total Z (Bs. / USD)</th>
                  <th className="py-2.5 px-3 text-center">Firma / Origen</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {fiscalZReports.slice(0, 8).map((z) => (
                  <tr key={z.id} className="hover:bg-slate-50">
                    <td className="py-2.5 px-3">
                      <div className="font-mono font-bold text-slate-900">{z.closureDate}</div>
                      <div className="text-[11px] text-slate-500">{z.locationName}</div>
                    </td>
                    <td className="py-2.5 px-3 font-mono">
                      <div className="font-bold text-indigo-800">
                        {z.printerSerial} · #{z.zNumber}
                      </div>
                      <div className="text-[10px] text-slate-500">{z.reportType}</div>
                    </td>
                    <td className="py-2.5 px-3 text-right tabular-nums">
                      {formatUsd(z.exemptSalesUsd)}
                    </td>
                    <td className="py-2.5 px-3 text-right tabular-nums">
                      {formatUsd(z.iva16CollectedUsd + z.iva8CollectedUsd)}
                    </td>
                    <td className="py-2.5 px-3 text-right tabular-nums">
                      {formatUsd(z.igtf3CollectedUsd)}
                    </td>
                    <td className="py-2.5 px-3 text-right tabular-nums">
                      <div className="font-bold text-slate-900">
                        {formatVes(z.grandTotalFiscalVes)}
                      </div>
                      <div className="text-[11px] text-emerald-700 font-semibold">
                        {formatUsd(z.grandTotalFiscalUsd)}
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-100 text-emerald-800">
                        {z.hmacVerified ? 'HMAC OK' : 'MANUAL AUDIT'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <BarcodeScannerModal
        isOpen={isPosScannerOpen}
        onClose={() => setIsPosScannerOpen(false)}
        title="Escáner Caja Registradora POS & Balanzas EAN-13"
        products={products}
        locationId={locationId}
        defaultZone="ANAQUEL"
        onSelectSingleProduct={({ rawCode }) => {
          appendBarcodeToPosTicket(rawCode);
          setIsPosScannerOpen(false);
        }}
      />
    </div>
  );
};

export default SalesApiSimulator;
