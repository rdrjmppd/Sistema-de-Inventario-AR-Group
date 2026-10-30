import React, { useState } from 'react';
import {
  FileSpreadsheet,
  Upload,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  AlertOctagon,
  X,
  Database,
  ArrowRight,
  HelpCircle,
  FileText,
  Filter,
} from 'lucide-react';
import { useInventory } from '../../context/InventoryContext';
import {
  parseChrystalSalesUploadedFile,
  parseRawMatrixChrystalSales,
  generateSampleChrystalSalesMatrix,
  ChrystalSalesParseResult,
} from '../../lib/chrystal-sales-parser';
import { quotaTelemetryEngine } from '../../lib/quota-telemetry';
import { formatUsd } from '../../lib/decimal';

export interface ChrystalSalesIngestionModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ChrystalSalesIngestionModal: React.FC<ChrystalSalesIngestionModalProps> = ({
  isOpen,
  onClose,
}) => {
  const { products, locations, simulatePosWebhookSale, logAuditEvent } = useInventory();
  const [targetLocationId, setTargetLocationId] = useState<string>('loc-pzo-01');

  // Inicializado con el ejemplo demo de Chrystal para visualización inmediata
  const [parseResult, setParseResult] = useState<ChrystalSalesParseResult | null>(() =>
    parseRawMatrixChrystalSales(
      generateSampleChrystalSalesMatrix(),
      products,
      'Cierre_Z_Chrystal_Demo.xlsx',
      'EXCEL_WORKBOOK'
    )
  );

  const [isProcessing, setIsProcessing] = useState(false);
  const [commitMessage, setCommitMessage] = useState<string | null>(null);
  const [showUnrecognizedDetails, setShowUnrecognizedDetails] = useState(false);

  if (!isOpen) return null;

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setCommitMessage(null);
    setIsProcessing(true);

    try {
      const buffer = await file.arrayBuffer();
      const parsed = parseChrystalSalesUploadedFile(buffer, file.name, products);
      setParseResult(parsed);
      quotaTelemetryEngine.recordRead(10, 'catalogo_productos', 'ChrystalSalesParser');
    } catch (err) {
      console.error('Error parseando reporte Chrystal:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleLoadSample = () => {
    setCommitMessage(null);
    const sample = parseRawMatrixChrystalSales(
      generateSampleChrystalSalesMatrix(),
      products,
      'Cierre_Z_Chrystal_Demo.xlsx',
      'EXCEL_WORKBOOK'
    );
    setParseResult(sample);
  };

  const handleApplySalesToInventory = () => {
    if (!parseResult || parseResult.recognizedItems.length === 0) return;

    setIsProcessing(true);
    setCommitMessage(null);

    // Preparar carga para la doctrina deductPosSaleShelfFirst()
    const itemsPayload = parseResult.recognizedItems.map((item) => ({
      sku: item.sku,
      qty: item.qtySold,
    }));

    const result = simulatePosWebhookSale(targetLocationId, itemsPayload);

    if (result.success) {
      const locName = locations.find((l) => l.id === targetLocationId)?.name || targetLocationId;
      setCommitMessage(
        `¡Ventas procesadas con éxito en ${locName}! Se descontaron ${parseResult.totalRecognizedUnits} unidades de ${parseResult.recognizedItems.length} productos del anaquel y depósito. (${parseResult.unrecognizedItems.length} ítems no registrados omitidos).`
      );

      // Registrar auditoría y telemetría de cuotas
      logAuditEvent(
        'CHRYSTAL_SALES_IMPORT',
        'INVENTORY',
        `Importación de ventas Chrystal POS en ${locName}: ${parseResult.totalRecognizedUnits} unidades descargadas.`,
        {
          fileName: parseResult.fileName,
          recognizedCount: parseResult.recognizedItems.length,
          unrecognizedCount: parseResult.unrecognizedItems.length,
          totalUsd: parseResult.totalRecognizedSalesUsd,
        }
      );

      quotaTelemetryEngine.recordWrite(parseResult.recognizedItems.length);
    } else {
      setCommitMessage(`Error al aplicar ventas: ${result.error || 'Fallo inesperado.'}`);
    }

    setIsProcessing(false);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5">
      <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden border border-slate-200">
        {/* Header Modal */}
        <div className="bg-slate-900 text-white px-5 py-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-600 rounded-lg">
              <FileSpreadsheet className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold tracking-tight">
                  Ingesta Asistida de Ventas Chrystal® POS (Excel / CSV)
                </h2>
                <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold rounded-full">
                  Auto-Detección Multi-Formato
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Descarga automática jerárquica (Anaquel primero → Depósito) sin requerir API directa en servidor.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Zona de Subida y Controles */}
        <div className="p-5 border-b border-slate-200 bg-slate-50 space-y-4 shrink-0">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {/* Sede Destino */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Sede / Tienda de las Ventas:
              </label>
              <select
                value={targetLocationId}
                onChange={(e) => setTargetLocationId(e.target.value)}
                className="w-full p-2 border border-slate-300 rounded-lg bg-white text-xs font-semibold"
              >
                {locations.map((loc) => (
                  <option key={loc.id} value={loc.id}>
                    {loc.name} ({loc.type})
                  </option>
                ))}
              </select>
            </div>

            {/* Zona de Arrastre de Archivo */}
            <div className="md:col-span-2 flex items-center gap-2">
              <label className="flex-1 min-h-[44px] px-4 py-2 bg-white border-2 border-dashed border-indigo-300 hover:border-indigo-500 rounded-xl flex items-center justify-center gap-2 text-xs font-bold text-indigo-700 cursor-pointer shadow-xs transition-all">
                <Upload className="w-4 h-4" />
                <span>Subir Reporte Chrystal (.xlsx, .csv, .txt)</span>
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv,.txt"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>
              <button
                type="button"
                onClick={handleLoadSample}
                className="min-h-[44px] px-3 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold rounded-xl text-xs flex items-center gap-1.5"
              >
                <Sparkles className="w-4 h-4 text-indigo-600" /> Cargar Demo
              </button>
            </div>
          </div>

          {/* Banner de Resultado de Parseo */}
          {parseResult && (
            <div className="flex flex-wrap items-center justify-between gap-2 p-3 bg-white rounded-lg border border-slate-200 text-xs">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-indigo-600" />
                <span className="font-semibold text-slate-700">Archivo:</span>
                <span className="font-mono text-slate-900 font-bold">{parseResult.fileName}</span>
                <span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded text-[10px] font-bold uppercase">
                  {parseResult.detectedFormat}
                </span>
              </div>
              <div className="flex items-center gap-4 text-slate-600">
                <span>
                  Reconocidos:{' '}
                  <strong className="text-emerald-700 font-mono">
                    {parseResult.recognizedItems.length}
                  </strong>
                </span>
                <span>
                  Unidades:{' '}
                  <strong className="text-slate-900 font-mono">
                    {parseResult.totalRecognizedUnits}
                  </strong>
                </span>
                <span>
                  Total Venta:{' '}
                  <strong className="text-indigo-700 font-mono">
                    {formatUsd(parseResult.totalRecognizedSalesUsd)}
                  </strong>
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Mensaje de Confirmación / Error */}
        {commitMessage && (
          <div
            className={`p-3 mx-5 mt-4 rounded-lg text-xs font-bold flex items-center gap-2 ${
              commitMessage.includes('éxito')
                ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                : 'bg-rose-100 text-rose-800 border border-rose-300'
            }`}
          >
            {commitMessage.includes('éxito') ? (
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
            ) : (
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
            )}
            <span>{commitMessage}</span>
          </div>
        )}

        {/* Contenido: Tablas de Previsualización */}
        <div className="flex-1 overflow-auto p-5 space-y-4">
          {parseResult && (
            <>
              {/* Alerta de Ítems No Encontrados (Decisión Estratégica Opción A) */}
              {parseResult.unrecognizedItems.length > 0 && (
                <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-xs text-amber-900 space-y-2">
                  <div className="flex items-center justify-between font-bold">
                    <span className="flex items-center gap-1.5">
                      <AlertTriangle className="w-4 h-4 text-amber-600" />
                      {parseResult.unrecognizedItems.length} producto(s) no registrados en catálogo
                      maestro (serán omitidos de la descarga):
                    </span>
                    <button
                      onClick={() => setShowUnrecognizedDetails(!showUnrecognizedDetails)}
                      className="text-amber-800 underline text-[11px]"
                    >
                      {showUnrecognizedDetails ? 'Ocultar Detalle' : 'Ver Detalle'}
                    </button>
                  </div>

                  {showUnrecognizedDetails && (
                    <div className="bg-white rounded border border-amber-200 overflow-hidden max-h-36 overflow-y-auto">
                      <table className="w-full text-[11px] text-left">
                        <thead className="bg-amber-100/60 font-semibold text-amber-900">
                          <tr>
                            <th className="p-1.5">Línea</th>
                            <th className="p-1.5">Código Crudo</th>
                            <th className="p-1.5">Descripción Chrystal</th>
                            <th className="p-1.5 text-right">Cantidad</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-amber-100">
                          {parseResult.unrecognizedItems.map((item, idx) => (
                            <tr key={idx}>
                              <td className="p-1.5 font-mono text-slate-500">{item.lineIndex}</td>
                              <td className="p-1.5 font-mono font-bold">{item.rawCode}</td>
                              <td className="p-1.5">{item.rawDescription}</td>
                              <td className="p-1.5 text-right font-mono">{item.qtySold}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* Tabla de Productos Reconocidos a Descontar */}
              <div className="border border-slate-200 rounded-xl overflow-hidden shadow-xs">
                <div className="bg-slate-100 px-3 py-2 text-xs font-bold text-slate-700 flex justify-between">
                  <span>Productos Reconocidos Listos para Descarga de Inventario</span>
                  <span>{parseResult.recognizedItems.length} ítems</span>
                </div>
                <div className="max-h-64 overflow-y-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-50 text-slate-600 border-b font-semibold">
                      <tr>
                        <th className="p-2">SKU</th>
                        <th className="p-2">Descripción Catálogo</th>
                        <th className="p-2 text-right">Cantidad a Descontar</th>
                        <th className="p-2 text-right">PVP Estimado</th>
                        <th className="p-2 text-right">Subtotal Venta</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {parseResult.recognizedItems.map((item, idx) => (
                        <tr key={idx} className="hover:bg-slate-50">
                          <td className="p-2 font-mono font-bold text-slate-800">{item.sku}</td>
                          <td className="p-2 text-slate-700">{item.productName}</td>
                          <td className="p-2 text-right font-mono font-extrabold text-rose-600">
                            -{item.qtySold}
                          </td>
                          <td className="p-2 text-right font-mono text-slate-600">
                            {formatUsd(item.unitPriceUsd)}
                          </td>
                          <td className="p-2 text-right font-mono font-bold text-slate-900">
                            {formatUsd(item.totalUsd)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer Modal con Acción de Descarga */}
        <div className="bg-slate-50 p-4 border-t border-slate-200 shrink-0 flex items-center justify-between gap-3">
          <button
            onClick={onClose}
            className="min-h-[44px] px-4 py-2 border border-slate-300 hover:bg-slate-200 rounded-xl text-xs font-semibold text-slate-700"
          >
            Cerrar
          </button>
          <button
            onClick={handleApplySalesToInventory}
            disabled={!parseResult || parseResult.recognizedItems.length === 0 || isProcessing}
            className="min-h-[44px] px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-xs transition-all"
          >
            <CheckCircle2 className="w-4 h-4" />
            {isProcessing ? 'Procesando Descarga...' : 'Procesar Ventas y Descontar de Anaquel'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ChrystalSalesIngestionModal;
