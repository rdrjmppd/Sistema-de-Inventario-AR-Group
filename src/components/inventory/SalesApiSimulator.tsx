import React, { useState } from 'react';
import { Webhook, Play, CheckCircle2, AlertTriangle } from 'lucide-react';
import { useInventory } from '../../context/InventoryContext';
import { formatUsd } from '../../lib/decimal';

export const SalesApiSimulator: React.FC = () => {
  const { locations, salesEvents, simulatePosWebhookSale } = useInventory();
  const [locationId, setLocationId] = useState('loc-pzo-01');
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
          message: `Webhook POS procesado (${res.event?.externalPosId}). Stock descontado en tiempo real.`,
        });
      }
    } catch {
      setFeedback({ type: 'err', message: 'Sintaxis JSON inválida en el cuerpo del webhook.' });
    }
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
          Simulador de eventos de facturación en punto de venta para descuento automático de
          inventario y actualización de curva ABC.
        </p>
      </div>

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
                    <span className="font-mono font-bold text-emerald-700">
                      {formatUsd(evt.totalUsd)}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-500 font-mono">
                    Sede: {evt.locationId} · {evt.timestampVet.slice(0, 19).replace('T', ' ')}
                  </div>
                  <div className="text-[11px] text-slate-700">
                    {evt.items.map((i) => `${i.qtySold}x ${i.sku}`).join(', ')}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SalesApiSimulator;
