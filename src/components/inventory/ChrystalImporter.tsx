import React, { useState } from 'react';
import {
  FileSpreadsheet,
  Upload,
  Sparkles,
  CheckCircle2,
  Filter,
  Database,
  Download,
} from 'lucide-react';
import {
  parseChrystalRawRows,
  parseChrystalWorkbookBuffer,
  generateSampleChrystalRawMatrix,
  exportSampleChrystalTemplateExcel,
} from '../../lib/excel-chrystal';
import { ChrystalParseResult } from '../../types';
import { useInventory } from '../../context/InventoryContext';
import { formatUsd } from '../../lib/decimal';
import { ChrystalSalesIngestionModal } from './ChrystalSalesIngestionModal';

export const ChrystalImporter: React.FC = () => {
  const { locations, applyChrystalImport } = useInventory();
  const [targetLocationId, setTargetLocationId] = useState<string>('loc-pzo-01');
  const [importMode, setImportMode] = useState<'REPLACE' | 'ADD'>('REPLACE');
  const [isSalesModalOpen, setIsSalesModalOpen] = useState(false);
  const [parseResult, setParseResult] = useState<ChrystalParseResult | null>(() =>
    parseChrystalRawRows(generateSampleChrystalRawMatrix(), 'Reporte_Chrystal_AltaVista.xlsx')
  );
  const [commitBanner, setCommitBanner] = useState<string | null>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const buffer = await file.arrayBuffer();
    const parsed = parseChrystalWorkbookBuffer(buffer, file.name);
    setParseResult(parsed);
    setCommitBanner(null);
  };

  const handleLoadSample = () => {
    const sample = parseChrystalRawRows(
      generateSampleChrystalRawMatrix(),
      'Chrystal_POS_Sede_PZO_2026.xlsx'
    );
    setParseResult(sample);
    setCommitBanner(null);
  };

  const handleApplyToInventory = () => {
    if (!parseResult) return;
    const stats = applyChrystalImport(parseResult, targetLocationId, importMode);
    const locName = locations.find((l) => l.id === targetLocationId)?.name || targetLocationId;
    setCommitBanner(
      `Sincronización Chrystal® completada en ${locName}: ${stats.updated} productos actualizados y ${stats.created} nuevos SKUs creados.`
    );
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-emerald-600 shrink-0" />
            <h1 className="text-sm sm:text-base font-bold text-slate-900">
              Importador Nativo de Reportes Excel Chrystal® (Columna B = Producto / Columna F = Stock)
            </h1>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Motor determinista con sanitización automática de cabeceras administrativas, filas en
            blanco y resúmenes de pie de página.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:flex sm:flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setIsSalesModalOpen(true)}
            className="min-h-[44px] sm:min-h-[38px] flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition shadow-xs cursor-pointer"
          >
            <FileSpreadsheet className="w-4 h-4 shrink-0" />
            <span>Descarga Diaria de Ventas POS</span>
          </button>

          <button
            type="button"
            onClick={() => exportSampleChrystalTemplateExcel()}
            className="min-h-[44px] sm:min-h-[38px] flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-semibold transition cursor-pointer"
          >
            <Download className="w-4 h-4 shrink-0" />
            <span>Descargar Plantilla .XLSX Chrystal®</span>
          </button>

          <button
            type="button"
            onClick={handleLoadSample}
            className="min-h-[44px] sm:min-h-[38px] flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold transition cursor-pointer"
          >
            <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
            <span>Cargar Sabana Chrystal® de Prueba</span>
          </button>

          <label className="min-h-[44px] sm:min-h-[38px] flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold cursor-pointer transition">
            <Upload className="w-4 h-4 shrink-0" />
            <span>Subir Archivo .XLSX / .CSV</span>
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleFileUpload}
              className="hidden"
            />
          </label>
        </div>
      </div>

      {commitBanner && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-900 px-4 py-3 rounded-xl text-xs font-semibold flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{commitBanner}</span>
        </div>
      )}

      {/* Target Config & Sanitation Stats */}
      {parseResult && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs space-y-3 text-xs">
            <div className="flex items-center gap-2 font-bold text-slate-900 uppercase tracking-wider">
              <Filter className="w-4 h-4 text-sky-600" />
              <span>Auditoría de Sanitización Chrystal®</span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                <div className="text-[10px] font-mono uppercase text-slate-500">
                  Filas Escaneadas
                </div>
                <div className="text-base font-mono font-bold text-slate-900">
                  {parseResult.totalRawRows}
                </div>
              </div>
              <div className="bg-emerald-50 p-2.5 rounded-lg border border-emerald-200">
                <div className="text-[10px] font-mono uppercase text-emerald-700">
                  SKUs Válidos (Col B/F)
                </div>
                <div className="text-base font-mono font-bold text-emerald-800">
                  {parseResult.validRowsCount}
                </div>
              </div>
              <div className="bg-amber-50 p-2.5 rounded-lg border border-amber-200">
                <div className="text-[10px] font-mono uppercase text-amber-700">
                  Cabeceras / Vacías Omitidas
                </div>
                <div className="text-base font-mono font-bold text-amber-800">
                  {parseResult.skippedHeaderOrBlankCount}
                </div>
              </div>
              <div className="bg-rose-50 p-2.5 rounded-lg border border-rose-200">
                <div className="text-[10px] font-mono uppercase text-rose-700">
                  Totales de Pie Filtrados
                </div>
                <div className="text-base font-mono font-bold text-rose-800">
                  {parseResult.skippedFooterTotalsCount}
                </div>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-200 space-y-2.5">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Sede o Depósito Destino de Sincronización
                </label>
                <select
                  value={targetLocationId}
                  onChange={(e) => setTargetLocationId(e.target.value)}
                  className="w-full px-2.5 py-2 border border-slate-300 rounded-lg bg-white font-medium"
                >
                  {locations.map((loc) => (
                    <option key={loc.id} value={loc.id}>
                      [{loc.type === 'DEPOSITO' || loc.type === 'CEDIS' ? 'DEPÓSITO' : 'SEDE'}]{' '}
                      {loc.code} — {loc.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Modo de Actualización de Existencia (Columna F)
                </label>
                <select
                  value={importMode}
                  onChange={(e) => setImportMode(e.target.value as 'REPLACE' | 'ADD')}
                  className="w-full px-2.5 py-2 border border-slate-300 rounded-lg bg-white font-medium"
                >
                  <option value="REPLACE">
                    Reemplazar Existencia Físicamente (Toma de Inventario)
                  </option>
                  <option value="ADD">Sumar a la Existencia Actual (Entrada de Mercancía)</option>
                </select>
              </div>

              <button
                type="button"
                onClick={handleApplyToInventory}
                className="w-full py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold flex items-center justify-center gap-2 shadow-xs transition"
              >
                <Database className="w-4 h-4" />
                Impactar Catálogo Maestro ({parseResult.validRowsCount} SKUs)
              </button>
            </div>
          </div>

          {/* Preview Table */}
          <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
                Vista Previa Estructurada: {parseResult.fileName}
              </span>
              <span className="text-[11px] font-mono text-emerald-700 font-semibold">
                Mapeo Estricto Col B → Nombre | Col F → Stock
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-900 text-slate-200 text-[11px] font-mono uppercase">
                    <th className="py-2.5 px-3">Fila Excel</th>
                    <th className="py-2.5 px-3">Col A (SKU)</th>
                    <th className="py-2.5 px-3 bg-sky-950 text-sky-200">
                      Col B (Nombre Producto)
                    </th>
                    <th className="py-2.5 px-3">Col C (Categoría)</th>
                    <th className="py-2.5 px-3 text-right">Col D (Costo)</th>
                    <th className="py-2.5 px-3 text-right">Col E (Precio)</th>
                    <th className="py-2.5 px-3 text-right bg-emerald-950 text-emerald-200">
                      Col F (Stock)
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-xs">
                  {parseResult.rows.map((r) => (
                    <tr key={r.rowNumber} className="hover:bg-slate-50">
                      <td className="py-2 px-3 font-mono text-slate-500">#{r.rowNumber}</td>
                      <td className="py-2 px-3 font-mono font-semibold text-slate-800">
                        {r.skuColA}
                      </td>
                      <td className="py-2 px-3 font-bold text-slate-900 bg-sky-50/40">
                        {r.productNameColB}
                      </td>
                      <td className="py-2 px-3 text-slate-600">{r.categoryColC}</td>
                      <td className="py-2 px-3 text-right font-mono text-slate-700">
                        {r.costUsdColD ? formatUsd(r.costUsdColD) : '—'}
                      </td>
                      <td className="py-2 px-3 text-right font-mono text-slate-700">
                        {r.priceUsdColE ? formatUsd(r.priceUsdColE) : '—'}
                      </td>
                      <td className="py-2 px-3 text-right font-mono font-bold text-emerald-800 bg-emerald-50/50">
                        {r.stockQuantityColF}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Ingesta Asistida de Ventas Chrystal POS (Auto-Detección Multi-Formato) */}
      <ChrystalSalesIngestionModal
        isOpen={isSalesModalOpen}
        onClose={() => setIsSalesModalOpen(false)}
      />
    </div>
  );
};

export default ChrystalImporter;
