import React, { useMemo } from 'react';
import { BarChart3, RefreshCw, Award } from 'lucide-react';
import { useInventory } from '../../context/InventoryContext';
import { toDecimal, round2, formatUsd } from '../../lib/decimal';

export const AbcRotationPanel: React.FC = () => {
  const { products, recalculateAbcClassification } = useInventory();

  const analysis = useMemo(() => {
    const items = products.map((p) => {
      const monthlyRevenueUsd = round2(toDecimal(p.priceUsd).times(p.monthlyUnitsSold));
      const monthlyProfitUsd = round2(
        toDecimal(p.priceUsd).minus(p.costUsd).times(p.monthlyUnitsSold)
      );
      return {
        ...p,
        monthlyRevenueUsd,
        monthlyProfitUsd,
      };
    });

    items.sort((a, b) => b.monthlyRevenueUsd - a.monthlyRevenueUsd);
    const grandTotalRev = items.reduce(
      (acc, i) => acc.plus(i.monthlyRevenueUsd),
      toDecimal(0)
    );

    let cumulative = toDecimal(0);
    return items.map((item) => {
      cumulative = cumulative.plus(item.monthlyRevenueUsd);
      const sharePct = grandTotalRev.gt(0)
        ? round2(toDecimal(item.monthlyRevenueUsd).dividedBy(grandTotalRev).times(100))
        : 0;
      const cumulativePct = grandTotalRev.gt(0)
        ? round2(cumulative.dividedBy(grandTotalRev).times(100))
        : 0;
      return {
        ...item,
        sharePct,
        cumulativePct,
      };
    });
  }, [products]);

  const countA = analysis.filter((i) => i.abcClass === 'A').length;
  const countB = analysis.filter((i) => i.abcClass === 'B').length;
  const countC = analysis.filter((i) => i.abcClass === 'C').length;

  return (
    <div className="space-y-5">
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-sky-600" />
            <h1 className="text-base font-bold text-slate-900">
              Clasificación de Rotación Pareto ABC (80 / 15 / 5)
            </h1>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Jerarquización de SKUs según facturación mensual en USD y contribución al flujo de caja.
          </p>
        </div>

        <button
          type="button"
          onClick={recalculateAbcClassification}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold transition self-start sm:self-auto"
        >
          <RefreshCw className="w-3.5 h-3.5 text-sky-400" />
          Recalcular Curva de Pareto
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-emerald-50/70 border border-emerald-200 rounded-xl p-4">
          <div className="flex items-center justify-between">
            <span className="font-mono text-xs font-bold uppercase text-emerald-800">
              CLASE A · ALTA ROTACIÓN (TOP 80%)
            </span>
            <Award className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-mono font-bold text-emerald-950 mt-1">
            {countA} SKUs Críticos
          </div>
          <p className="text-[11px] text-emerald-800 mt-1">
            Prohibición de quiebre de stock. Reposición prioritaria en PZO, CCS y VAL.
          </p>
        </div>

        <div className="bg-sky-50/70 border border-sky-200 rounded-xl p-4">
          <div className="flex items-center justify-between">
            <span className="font-mono text-xs font-bold uppercase text-sky-800">
              CLASE B · ROTACIÓN INTERMEDIA (15%)
            </span>
          </div>
          <div className="text-2xl font-mono font-bold text-sky-950 mt-1">
            {countB} SKUs Regulares
          </div>
          <p className="text-[11px] text-sky-800 mt-1">
            Revisión quincenal de niveles mínimos y rotación por anaquel.
          </p>
        </div>

        <div className="bg-slate-100 border border-slate-300 rounded-xl p-4">
          <div className="flex items-center justify-between">
            <span className="font-mono text-xs font-bold uppercase text-slate-700">
              CLASE C · BAJA ROTACIÓN (5%)
            </span>
          </div>
          <div className="text-2xl font-mono font-bold text-slate-900 mt-1">
            {countC} SKUs Complementarios
          </div>
          <p className="text-[11px] text-slate-600 mt-1">
            Control de capital inmovilizado y compras bajo pedido.
          </p>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-900 text-slate-200 text-[11px] font-mono uppercase">
                <th className="py-2.5 px-3">Ranking</th>
                <th className="py-2.5 px-3">SKU / Producto</th>
                <th className="py-2.5 px-3 text-right">Unid. Vendidas / Mes</th>
                <th className="py-2.5 px-3 text-right">Facturación Mes (USD)</th>
                <th className="py-2.5 px-3 text-right">Utilidad Bruta (USD)</th>
                <th className="py-2.5 px-3 text-right">% Participación</th>
                <th className="py-2.5 px-3 text-right">% Acumulado</th>
                <th className="py-2.5 px-3 text-center">Clase ABC</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-xs">
              {analysis.map((item, idx) => (
                <tr key={item.id} className="hover:bg-slate-50">
                  <td className="py-2.5 px-3 font-mono font-bold text-slate-500">#{idx + 1}</td>
                  <td className="py-2.5 px-3">
                    <div className="font-bold text-slate-900">{item.name}</div>
                    <div className="font-mono text-[10px] text-slate-400">{item.sku}</div>
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono font-semibold">
                    {item.monthlyUnitsSold} {item.unit}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900">
                    {formatUsd(item.monthlyRevenueUsd)}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono font-semibold text-emerald-700">
                    {formatUsd(item.monthlyProfitUsd)}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono">{item.sharePct.toFixed(2)}%</td>
                  <td className="py-2.5 px-3 text-right font-mono font-semibold text-sky-700">
                    {item.cumulativePct.toFixed(2)}%
                  </td>
                  <td className="py-2.5 px-3 text-center">
                    <span
                      className={`px-2.5 py-0.5 rounded font-mono text-xs font-bold ${
                        item.abcClass === 'A'
                          ? 'bg-emerald-100 text-emerald-800'
                          : item.abcClass === 'B'
                          ? 'bg-sky-100 text-sky-800'
                          : 'bg-slate-200 text-slate-700'
                      }`}
                    >
                      CLASE {item.abcClass}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default AbcRotationPanel;
