import React, { useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import {
  TrendingUp,
  AlertTriangle,
  Award,
  Filter,
  BarChart3,
  Layers,
  Building2,
  Calendar,
} from 'lucide-react';
import { MeatYieldBatch, FruverBatchRecord } from '../../types';
import { round2 } from '../../lib/decimal';

export interface YieldMetricsChartsProps {
  mode: 'MEAT' | 'FRUVER';
  meatBatches?: MeatYieldBatch[];
  fruverBatches?: FruverBatchRecord[];
  className?: string;
}

interface NormalizedYieldPoint {
  id: string;
  batchCode: string;
  dateLabel: string;
  supplierId: string;
  supplierName: string;
  locationId: string;
  yieldPercent: number;
  wastePercent: number;
  initialWeightKg: number;
  usableWeightKg: number;
  wasteWeightKg: number;
}

export const YieldMetricsCharts: React.FC<YieldMetricsChartsProps> = ({
  mode,
  meatBatches = [],
  fruverBatches = [],
  className = '',
}) => {
  const [selectedSupplier, setSelectedSupplier] = useState<string>('ALL');
  const [selectedLocation, setSelectedLocation] = useState<string>('ALL');
  const [chartView, setChartView] = useState<'TREND' | 'SUPPLIER_COMPARISON'>('TREND');

  // Normalizar datos según el modo seleccionado
  const normalizedData: NormalizedYieldPoint[] = useMemo(() => {
    if (mode === 'MEAT') {
      return meatBatches.map((b) => {
        const dateStr = b.receptionDate || b.createdAtVet.split(' ')[0] || 'S/F';
        return {
          id: b.id,
          batchCode: b.customBatchCode || b.batchCode,
          dateLabel: dateStr.slice(-5), // MM-DD o últimos 5 caracteres
          supplierId: b.supplierId || 'S/P',
          supplierName: b.supplierName || 'Proveedor No Identificado',
          locationId: b.locationId,
          yieldPercent: round2(b.cutsYieldPercent),
          wastePercent: round2(b.wastePercent),
          initialWeightKg: round2(b.carcassWeightKg),
          usableWeightKg: round2(b.totalCutsWeightKg),
          wasteWeightKg: round2(b.totalWasteWeightKg),
        };
      });
    } else {
      return fruverBatches.map((b) => {
        const dateStr = b.receptionDate || b.createdAtVet.split(' ')[0] || 'S/F';
        return {
          id: b.id,
          batchCode: b.customBatchCode || b.batchCode,
          dateLabel: dateStr.slice(-5),
          supplierId: b.supplierId || 'S/P',
          supplierName: b.supplierName || 'Proveedor No Identificado',
          locationId: b.locationId,
          yieldPercent: round2(b.netYieldPercent),
          wastePercent: round2(b.wastePercent),
          initialWeightKg: round2(b.initialWeightKg),
          usableWeightKg: round2(b.netSalableWeightKg),
          wasteWeightKg: round2(b.totalWasteKg),
        };
      });
    }
  }, [mode, meatBatches, fruverBatches]);

  // Lista única de proveedores y sedes para los selectores
  const uniqueSuppliers = useMemo(() => {
    const map = new Map<string, string>();
    for (const d of normalizedData) {
      if (d.supplierId && d.supplierName) {
        map.set(d.supplierId, d.supplierName);
      }
    }
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [normalizedData]);

  const uniqueLocations = useMemo(() => {
    const set = new Set<string>();
    for (const d of normalizedData) {
      if (d.locationId) set.add(d.locationId);
    }
    return Array.from(set);
  }, [normalizedData]);

  // Filtrar según selecciones
  const filteredData = useMemo(() => {
    return normalizedData.filter((d) => {
      if (selectedSupplier !== 'ALL' && d.supplierId !== selectedSupplier) return false;
      if (selectedLocation !== 'ALL' && d.locationId !== selectedLocation) return false;
      return true;
    });
  }, [normalizedData, selectedSupplier, selectedLocation]);

  // KPIs Resumen
  const stats = useMemo(() => {
    if (filteredData.length === 0) {
      return {
        avgYield: 0,
        avgWaste: 0,
        totalInitialKg: 0,
        totalUsableKg: 0,
        bestSupplier: 'N/A',
        worstSupplier: 'N/A',
      };
    }

    let sumYield = 0;
    let sumWaste = 0;
    let sumInit = 0;
    let sumUsable = 0;

    const supplierWasteMap = new Map<string, { name: string; totalWasteKg: number; totalInitKg: number }>();

    for (const d of filteredData) {
      sumYield += d.yieldPercent;
      sumWaste += d.wastePercent;
      sumInit += d.initialWeightKg;
      sumUsable += d.usableWeightKg;

      const current = supplierWasteMap.get(d.supplierId) || {
        name: d.supplierName,
        totalWasteKg: 0,
        totalInitKg: 0,
      };
      current.totalWasteKg += d.wasteWeightKg;
      current.totalInitKg += d.initialWeightKg;
      supplierWasteMap.set(d.supplierId, current);
    }

    const n = filteredData.length;
    let best = { name: 'N/A', wastePct: 100 };
    let worst = { name: 'N/A', wastePct: -1 };

    supplierWasteMap.forEach((val) => {
      if (val.totalInitKg > 0) {
        const pct = (val.totalWasteKg / val.totalInitKg) * 100;
        if (pct < best.wastePct) {
          best = { name: val.name, wastePct: pct };
        }
        if (pct > worst.wastePct) {
          worst = { name: val.name, wastePct: pct };
        }
      }
    });

    return {
      avgYield: round2(sumYield / n),
      avgWaste: round2(sumWaste / n),
      totalInitialKg: round2(sumInit),
      totalUsableKg: round2(sumUsable),
      bestSupplier: best.name !== 'N/A' ? `${best.name} (${round2(best.wastePct)}% merma)` : 'Sin datos',
      worstSupplier: worst.name !== 'N/A' ? `${worst.name} (${round2(worst.wastePct)}% merma)` : 'Sin datos',
    };
  }, [filteredData]);

  // Datos agregados por proveedor para el gráfico comparativo
  const supplierComparisonData = useMemo(() => {
    const map = new Map<string, { name: string; yieldTotal: number; wasteTotal: number; count: number }>();
    for (const d of filteredData) {
      const prev = map.get(d.supplierName) || { name: d.supplierName, yieldTotal: 0, wasteTotal: 0, count: 0 };
      prev.yieldTotal += d.yieldPercent;
      prev.wasteTotal += d.wastePercent;
      prev.count += 1;
      map.set(d.supplierName, prev);
    }

    return Array.from(map.values()).map((v) => ({
      name: v.name.length > 18 ? `${v.name.slice(0, 16)}...` : v.name,
      fullName: v.name,
      yieldPercent: round2(v.yieldTotal / v.count),
      wastePercent: round2(v.wasteTotal / v.count),
      batchesCount: v.count,
    }));
  }, [filteredData]);

  if (normalizedData.length === 0) {
    return (
      <div className={`p-6 rounded-2xl bg-slate-900 border border-slate-800 text-center text-slate-400 space-y-2 ${className}`}>
        <BarChart3 className="w-10 h-10 mx-auto text-slate-600 animate-pulse" />
        <h4 className="font-bold text-white text-sm">
          Sin Historial de Lotes para Analítica Visual de Rendimiento
        </h4>
        <p className="text-xs">
          Registra o confirma lotes en esta vista para proyectar las curvas de rendimiento y merma por proveedor.
        </p>
      </div>
    );
  }

  return (
    <div className={`p-5 rounded-2xl bg-slate-900 border border-slate-800 text-white shadow-xl space-y-5 ${className}`}>
      {/* Barra de Título y Filtros */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-bold text-xs mb-1">
            <TrendingUp className="w-3.5 h-3.5" />
            Métricas de Rendimiento y Merma Histórica ({mode === 'MEAT' ? 'Cárnico' : 'Frutícola'})
          </div>
          <h3 className="text-lg font-bold text-white tracking-tight">
            Tendencias de Eficiencia y Control de Desperdicios
          </h3>
          <p className="text-xs text-slate-400">
            Detección de ineficiencias por proveedor, sede y lote procesado
          </p>
        </div>

        {/* Filtros Dinámicos */}
        <div className="flex flex-wrap items-center gap-2.5 text-xs">
          {/* Selector de Proveedor */}
          <div className="flex items-center gap-1.5 bg-slate-950 px-2.5 py-1.5 rounded-xl border border-slate-800">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={selectedSupplier}
              onChange={(e) => setSelectedSupplier(e.target.value)}
              className="bg-transparent text-white focus:outline-hidden cursor-pointer"
            >
              <option value="ALL" className="bg-slate-900 text-white">Todos los Proveedores</option>
              {uniqueSuppliers.map((s) => (
                <option key={s.id} value={s.id} className="bg-slate-900 text-white">
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          {/* Selector de Sede */}
          {uniqueLocations.length > 1 && (
            <div className="flex items-center gap-1.5 bg-slate-950 px-2.5 py-1.5 rounded-xl border border-slate-800">
              <Building2 className="w-3.5 h-3.5 text-slate-400" />
              <select
                value={selectedLocation}
                onChange={(e) => setSelectedLocation(e.target.value)}
                className="bg-transparent text-white focus:outline-hidden cursor-pointer"
              >
                <option value="ALL" className="bg-slate-900 text-white">Todas las Sedes</option>
                {uniqueLocations.map((loc) => (
                  <option key={loc} value={loc} className="bg-slate-900 text-white">
                    Sede: {loc}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Selector de Tipo de Gráfico */}
          <div className="flex items-center p-0.5 rounded-xl bg-slate-950 border border-slate-800">
            <button
              type="button"
              onClick={() => setChartView('TREND')}
              className={`min-h-[32px] px-3 py-1 rounded-lg font-bold text-xs transition cursor-pointer ${
                chartView === 'TREND'
                  ? 'bg-emerald-600 text-white shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Tendencia Temporal
            </button>
            <button
              type="button"
              onClick={() => setChartView('SUPPLIER_COMPARISON')}
              className={`min-h-[32px] px-3 py-1 rounded-lg font-bold text-xs transition cursor-pointer ${
                chartView === 'SUPPLIER_COMPARISON'
                  ? 'bg-emerald-600 text-white shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Comparativa Proveedores
            </button>
          </div>
        </div>
      </div>

      {/* KPI Cards de Rendimiento */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
        <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 space-y-1">
          <span className="text-slate-400 text-[11px]">Rendimiento Promedio</span>
          <div className="text-base sm:text-lg font-bold text-emerald-400 font-mono">
            {stats.avgYield}%
          </div>
          <p className="text-[10px] text-slate-500">Masa neta comercializable</p>
        </div>

        <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 space-y-1">
          <span className="text-slate-400 text-[11px]">Merma Promedio</span>
          <div className="text-base sm:text-lg font-bold text-rose-400 font-mono">
            {stats.avgWaste}%
          </div>
          <p className="text-[10px] text-slate-500">Hueso, cebo y desperdicio</p>
        </div>

        <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 space-y-1">
          <div className="text-slate-400 text-[11px] flex items-center gap-1">
            <Award className="w-3.5 h-3.5 text-amber-400" />
            <span>Mejor Rendimiento</span>
          </div>
          <div className="text-xs font-bold text-amber-300 truncate" title={stats.bestSupplier}>
            {stats.bestSupplier}
          </div>
          <p className="text-[10px] text-slate-500">Menor merma absorbida</p>
        </div>

        <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 space-y-1">
          <div className="text-slate-400 text-[11px] flex items-center gap-1">
            <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
            <span>Mayor Merma</span>
          </div>
          <div className="text-xs font-bold text-rose-300 truncate" title={stats.worstSupplier}>
            {stats.worstSupplier}
          </div>
          <p className="text-[10px] text-slate-500">Alerta de sobrecosto</p>
        </div>
      </div>

      {/* Gráfico Recharts */}
      <div className="h-64 sm:h-72 w-full pt-2">
        {chartView === 'TREND' ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={filteredData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="yieldGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                </linearGradient>
                <linearGradient id="wasteGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#f43f5e" stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="dateLabel" stroke="#64748b" tick={{ fontSize: 11 }} />
              <YAxis stroke="#64748b" domain={[0, 100]} tick={{ fontSize: 11 }} unit="%" />
              <Tooltip
                contentStyle={{ backgroundColor: '#020617', borderColor: '#334155', borderRadius: '12px', fontSize: '12px' }}
                formatter={(val: any, name: any) => [`${val}%`, name === 'yieldPercent' ? 'Rendimiento Útil' : 'Merma Total']}
                labelFormatter={(lbl, p) => p[0]?.payload ? `${p[0].payload.batchCode} (${p[0].payload.supplierName})` : lbl}
              />
              <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '6px' }} />
              <Area type="monotone" dataKey="yieldPercent" stroke="#10b981" strokeWidth={2} fillOpacity={1} fill="url(#yieldGrad)" name="Rendimiento Útil (%)" />
              <Area type="monotone" dataKey="wastePercent" stroke="#f43f5e" strokeWidth={2} fillOpacity={1} fill="url(#wasteGrad)" name="Merma Total (%)" />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={supplierComparisonData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="name" stroke="#64748b" tick={{ fontSize: 11 }} />
              <YAxis stroke="#64748b" domain={[0, 100]} tick={{ fontSize: 11 }} unit="%" />
              <Tooltip
                contentStyle={{ backgroundColor: '#020617', borderColor: '#334155', borderRadius: '12px', fontSize: '12px' }}
                formatter={(val: any, name: any) => [`${val}%`, name === 'yieldPercent' ? 'Rendimiento Promedio' : 'Merma Promedio']}
                labelFormatter={(lbl, p) => p[0]?.payload ? `${p[0].payload.fullName} (${p[0].payload.batchesCount} lotes)` : lbl}
              />
              <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '6px' }} />
              <Bar dataKey="yieldPercent" fill="#10b981" radius={[4, 4, 0, 0]} name="Rendimiento Promedio (%)" />
              <Bar dataKey="wastePercent" fill="#f43f5e" radius={[4, 4, 0, 0]} name="Merma Promedio (%)" />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
};

export default YieldMetricsCharts;
