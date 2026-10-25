import React, { useState } from 'react';
import { ArrowLeftRight, CheckCircle2, AlertTriangle, Truck } from 'lucide-react';
import { useInventory } from '../../context/InventoryContext';
import { useAuth } from '../../context/AuthContext';
import { formatUsd } from '../../lib/decimal';

export const StockTransfers: React.FC = () => {
  const { products, locations, transfers, executeStockTransfer } = useInventory();
  const { user } = useAuth();

  const [productId, setProductId] = useState(products[0]?.id || '');
  const [fromLoc, setFromLoc] = useState('loc-val-01');
  const [toLoc, setToLoc] = useState('loc-pzo-01');
  const [qty, setQty] = useState('50');
  const [notes, setNotes] = useState('Reposición con Guía SADA autorizada');
  const [statusMsg, setStatusMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const selectedProduct = products.find((p) => p.id === productId);
  const availableOrigin = selectedProduct
    ? selectedProduct.stockByLocation[fromLoc] ?? 0
    : 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const numericQty = parseFloat(qty) || 0;
    const res = executeStockTransfer(
      productId,
      fromLoc,
      toLoc,
      numericQty,
      notes,
      user?.email || 'rdrj.mppd@gmail.com'
    );
    if (!res.success) {
      setStatusMsg({ type: 'err', text: res.error || 'Error en transferencia.' });
    } else {
      setStatusMsg({
        type: 'ok',
        text: `Transferencia inter-sede de ${numericQty} unidades ejecutada y asentada en Kardex.`,
      });
    }
  };

  const getLocName = (id: string) => locations.find((l) => l.id === id)?.code || id;

  return (
    <div className="space-y-5">
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
        <div className="flex items-center gap-2">
          <ArrowLeftRight className="w-5 h-5 text-sky-600" />
          <h1 className="text-base font-bold text-slate-900">
            Transferencias de Inventario Inter-Sede & Guías SADA / SUNAGRO
          </h1>
        </div>
        <p className="text-xs text-slate-500 mt-0.5">
          Movimiento atómico de mercancía entre CEDIS Valencia, Puerto Ordaz y Caracas con
          trazabilidad de costos.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Form */}
        <form
          onSubmit={handleSubmit}
          className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs space-y-3 text-xs"
        >
          <h2 className="font-bold text-slate-900 uppercase tracking-wider text-xs border-b border-slate-100 pb-2">
            Emitir Orden de Transferencia
          </h2>

          {statusMsg && (
            <div
              className={`p-3 rounded-lg flex items-start gap-2 ${
                statusMsg.type === 'ok'
                  ? 'bg-emerald-50 text-emerald-900 border border-emerald-200'
                  : 'bg-rose-50 text-rose-900 border border-rose-200'
              }`}
            >
              {statusMsg.type === 'ok' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              )}
              <span>{statusMsg.text}</span>
            </div>
          )}

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Producto a Transferir</label>
            <select
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
              className="w-full px-2.5 py-2 border border-slate-300 rounded-lg bg-white font-medium"
            >
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.sku} — {p.name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Sede o Depósito Origen
              </label>
              <select
                value={fromLoc}
                onChange={(e) => setFromLoc(e.target.value)}
                className="w-full px-2.5 py-2 border border-slate-300 rounded-lg bg-white"
              >
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    [{l.type === 'DEPOSITO' || l.type === 'CEDIS' ? 'Depósito' : 'Sede'}] {l.code}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Sede o Depósito Destino
              </label>
              <select
                value={toLoc}
                onChange={(e) => setToLoc(e.target.value)}
                className="w-full px-2.5 py-2 border border-slate-300 rounded-lg bg-white"
              >
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    [{l.type === 'DEPOSITO' || l.type === 'CEDIS' ? 'Depósito' : 'Sede'}] {l.code}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 flex items-center justify-between">
            <span className="text-slate-600">Stock disponible en origen:</span>
            <span className="font-mono font-bold text-slate-900">
              {availableOrigin} {selectedProduct?.unit}
            </span>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Cantidad a Despachar</label>
            <input
              type="number"
              min="1"
              step="1"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              className="w-full px-2.5 py-2 border border-slate-300 rounded-lg font-mono font-bold"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              Observaciones / Guía SUNAGRO
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-2.5 py-2 border border-slate-300 rounded-lg"
            />
          </div>

          <button
            type="submit"
            className="w-full py-2.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-semibold flex items-center justify-center gap-2 transition shadow-xs"
          >
            <Truck className="w-4 h-4" />
            Ejecutar Transferencia Inter-Sede
          </button>
        </form>

        {/* History Table */}
        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
              Bitácora Histórica de Transferencias (Kardex Multi-Sede)
            </h3>
            <span className="text-[11px] font-mono text-slate-500">
              {transfers.length} operaciones registradas
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-900 text-slate-200 text-[11px] font-mono uppercase">
                  <th className="py-2.5 px-3">Guía / Fecha VET</th>
                  <th className="py-2.5 px-3">Producto</th>
                  <th className="py-2.5 px-3 text-center">Ruta</th>
                  <th className="py-2.5 px-3 text-right">Cantidad</th>
                  <th className="py-2.5 px-3 text-right">Valor Costo</th>
                  <th className="py-2.5 px-3 text-center">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-xs">
                {transfers.map((trf) => (
                  <tr key={trf.id} className="hover:bg-slate-50">
                    <td className="py-2.5 px-3 font-mono">
                      <div className="font-bold text-slate-900">{trf.reference}</div>
                      <div className="text-[10px] text-slate-400">
                        {trf.createdAtVet.slice(0, 16).replace('T', ' ')}
                      </div>
                    </td>
                    <td className="py-2.5 px-3">
                      <div className="font-semibold text-slate-900">{trf.productName}</div>
                      <div className="text-[11px] text-slate-500">{trf.notes}</div>
                    </td>
                    <td className="py-2.5 px-3 text-center font-mono text-[11px]">
                      <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-800 font-bold">
                        {getLocName(trf.fromLocationId)}
                      </span>
                      <span className="mx-1 text-slate-400">→</span>
                      <span className="px-1.5 py-0.5 rounded bg-sky-100 text-sky-800 font-bold">
                        {getLocName(trf.toLocationId)}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900">
                      {trf.quantity}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-emerald-700 font-semibold">
                      {formatUsd(trf.totalValueUsd)}
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-100 text-emerald-800">
                        {trf.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StockTransfers;
