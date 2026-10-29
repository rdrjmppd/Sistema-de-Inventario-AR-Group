import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  Lock,
  Plus,
  ShieldAlert,
  Snowflake,
  Thermometer,
} from 'lucide-react';
import { ColdEquipmentType, StorageZone } from '../../types';
import { useInventory } from '../../context/InventoryContext';
import { useOperationsBrm } from '../../context/OperationsBrmContext';
import { SADA_COLD_CHAIN_LIMITS } from '../../lib/fefo-coldchain';

export const FefoColdChainCenter: React.FC = () => {
  const { products, locations, selectedLocationId } = useInventory();
  const {
    fefoLots,
    coldChainLogs,
    registerFefoPerishableLot,
    moveFefoLotCavaToShelf,
    unlockExpiredLotWithGovernance,
    registerColdChainTemp,
  } = useOperationsBrm();

  const [activeTab, setActiveTab] = useState<'FEFO' | 'COLD_CHAIN'>('FEFO');
  const [banner, setBanner] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // Formulario Nuevo Lote FEFO
  const [productId, setProductId] = useState(products[0]?.id || '');
  const [locId, setLocId] = useState(selectedLocationId || locations[0]?.id || '');
  const [zone, setZone] = useState<StorageZone>('DEPOSITO');
  const [lotCode, setLotCode] = useState('');
  const [quantity, setQuantity] = useState('10');
  const [receptionDate, setReceptionDate] = useState(
    () => new Date().toISOString().slice(0, 10)
  );
  const [expirationDate, setExpirationDate] = useState(
    () => new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10)
  );

  // Modal desbloqueo excepcional TOTP / PIN
  const [unlockLotId, setUnlockLotId] = useState<string | null>(null);
  const [unlockCredential, setUnlockCredential] = useState('');

  // Formulario Temperatura SADA
  const [tempLocId, setTempLocId] = useState(selectedLocationId || locations[0]?.id || '');
  const [equipmentType, setEquipmentType] = useState<ColdEquipmentType>('CAVA_CARNICOS');
  const [equipmentName, setEquipmentName] = useState('Cava Principal Carnicería');
  const [tempCelsius, setTempCelsius] = useState('2.1');
  const [correctiveAction, setCorrectiveAction] = useState('');

  const kpis = useMemo(() => {
    const expired = fefoLots.filter(
      (l) => l.quantityRemaining > 0 && l.alertLevel === 'VENCIDO_BLOQUEADO'
    ).length;
    const critical3d = fefoLots.filter(
      (l) => l.quantityRemaining > 0 && l.alertLevel === 'CRITICO_PROMOCION_1_3D'
    ).length;
    const preventive7d = fefoLots.filter(
      (l) => l.quantityRemaining > 0 && l.alertLevel === 'PREVENTIVO_4_7D'
    ).length;
    const thermalDeviations = coldChainLogs.filter((c) => c.isOutOfRange).length;
    return { expired, critical3d, preventive7d, thermalDeviations };
  }, [fefoLots, coldChainLogs]);

  const handleCreateLot = (e: React.FormEvent) => {
    e.preventDefault();
    const res = registerFefoPerishableLot({
      lotCode: lotCode || undefined,
      productId: productId || products[0]?.id || '',
      locationId: locId || locations[0]?.id || '',
      zone,
      quantity: Number(quantity) || 0,
      receptionDate,
      expirationDate,
    });
    if (!res.success) {
      setBanner({ type: 'err', text: res.error || 'Error registrando lote FEFO.' });
      return;
    }
    setLotCode('');
    setBanner({
      type: 'ok',
      text: `Lote ${res.lot?.lotCode} registrado bajo ordenamiento estricto FEFO (${res.lot?.daysUntilExpiration} días restantes).`,
    });
  };

  const handleLogTemp = (e: React.FormEvent) => {
    e.preventDefault();
    const res = registerColdChainTemp({
      locationId: tempLocId || locations[0]?.id || '',
      equipmentName,
      equipmentType,
      recordedTempCelsius: Number(tempCelsius),
      correctiveAction,
    });
    if (!res.success) {
      setBanner({ type: 'err', text: res.error || 'Error registrando temperatura.' });
      return;
    }
    setCorrectiveAction('');
    setBanner({
      type: res.log?.isOutOfRange ? 'err' : 'ok',
      text: res.log?.isOutOfRange
        ? `ALERTA TÉRMICA SADA: ${res.log.equipmentName} registró ${res.log.recordedTempCelsius}°C fuera del rango [${res.log.minAllowedCelsius}°C .. ${res.log.maxAllowedCelsius}°C].`
        : `Bitácora térmica conforme: ${res.log?.equipmentName} en ${res.log?.recordedTempCelsius}°C.`,
    });
  };

  return (
    <div className="space-y-5">
      {/* Encabezado y KPIs de Lectura < 5s */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
            <Snowflake className="w-5 h-5 text-sky-400" />
            Control FEFO de Perecederos & Cadena de Frío SADA
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Priorización automática Primero en Vencer, Primero en Salir (FEFO), bloqueo sanitario de vencidos y telemetría térmica de cavas.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('FEFO')}
            className={`min-h-[44px] px-4 rounded-xl text-xs font-bold border transition cursor-pointer ${
              activeTab === 'FEFO'
                ? 'bg-sky-600 text-white border-sky-500'
                : 'bg-slate-950 text-slate-300 border-slate-800'
            }`}
          >
            Semáforo Lotes FEFO ({fefoLots.filter((l) => l.quantityRemaining > 0).length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('COLD_CHAIN')}
            className={`min-h-[44px] px-4 rounded-xl text-xs font-bold border transition cursor-pointer ${
              activeTab === 'COLD_CHAIN'
                ? 'bg-sky-600 text-white border-sky-500'
                : 'bg-slate-950 text-slate-300 border-slate-800'
            }`}
          >
            Bitácora Térmica Cavas ({coldChainLogs.length})
          </button>
        </div>
      </div>

      {/* Tarjetas Ejecutivas tabular-nums */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-slate-900 border border-rose-500/30 rounded-2xl p-4">
          <div className="text-[11px] text-rose-300 font-semibold flex items-center gap-1.5">
            <ShieldAlert className="w-4 h-4" />
            Lotes Vencidos Bloqueados
          </div>
          <div className="text-2xl font-bold text-rose-400 font-mono tabular-nums mt-1">
            {kpis.expired}
          </div>
          <p className="text-[10px] text-slate-400 mt-0.5">Bloqueo activo de venta y traslado</p>
        </div>

        <div className="bg-slate-900 border border-amber-500/30 rounded-2xl p-4">
          <div className="text-[11px] text-amber-300 font-semibold flex items-center gap-1.5">
            <Clock className="w-4 h-4" />
            Críticos ≤ 3 Días (Promo/Receta)
          </div>
          <div className="text-2xl font-bold text-amber-400 font-mono tabular-nums mt-1">
            {kpis.critical3d}
          </div>
          <p className="text-[10px] text-slate-400 mt-0.5">Sugerencia de transformación BOM o -25%</p>
        </div>

        <div className="bg-slate-900 border border-sky-500/30 rounded-2xl p-4">
          <div className="text-[11px] text-sky-300 font-semibold flex items-center gap-1.5">
            <ArrowRight className="w-4 h-4" />
            Preventivos 4–7 Días
          </div>
          <div className="text-2xl font-bold text-sky-400 font-mono tabular-nums mt-1">
            {kpis.preventive7d}
          </div>
          <p className="text-[10px] text-slate-400 mt-0.5">Priorizar pase de Cava a Exhibición</p>
        </div>

        <div className="bg-slate-900 border border-emerald-500/30 rounded-2xl p-4">
          <div className="text-[11px] text-emerald-300 font-semibold flex items-center gap-1.5">
            <Thermometer className="w-4 h-4" />
            Desviaciones Térmicas SADA
          </div>
          <div className="text-2xl font-bold text-emerald-400 font-mono tabular-nums mt-1">
            {kpis.thermalDeviations}
          </div>
          <p className="text-[10px] text-slate-400 mt-0.5">Lecturas fuera del rango sanitario</p>
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
            className="text-slate-400 hover:text-white px-2 py-1 cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {activeTab === 'FEFO' ? (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          {/* Alta de Lote Perecedero */}
          <form
            onSubmit={handleCreateLot}
            className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3 text-xs"
          >
            <h3 className="font-bold text-white flex items-center gap-1.5 text-sm">
              <Plus className="w-4 h-4 text-emerald-400" />
              Registrar Lote Perecedero FEFO
            </h3>

            <div>
              <label className="block text-slate-400 mb-1">Producto / Corte / Perecedero</label>
              <select
                value={productId}
                onChange={(e) => setProductId(e.target.value)}
                className="w-full min-h-[44px] px-3 rounded-xl bg-slate-950 border border-slate-700 text-white"
              >
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.sku} — {p.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-slate-400 mb-1">Sede / Frigorífico</label>
                <select
                  value={locId}
                  onChange={(e) => setLocId(e.target.value)}
                  className="w-full min-h-[44px] px-3 rounded-xl bg-slate-950 border border-slate-700 text-white"
                >
                  {locations.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-slate-400 mb-1">Zona Inicial</label>
                <select
                  value={zone}
                  onChange={(e) => setZone(e.target.value as StorageZone)}
                  className="w-full min-h-[44px] px-3 rounded-xl bg-slate-950 border border-slate-700 text-white"
                >
                  <option value="DEPOSITO">Nevera / Cava (Depósito)</option>
                  <option value="ANAQUEL">Vitrina / Exhibición</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-slate-400 mb-1">Código Lote (Opcional)</label>
                <input
                  type="text"
                  value={lotCode}
                  onChange={(e) => setLotCode(e.target.value)}
                  placeholder="Ej. LOT-CAR-1029"
                  className="w-full min-h-[44px] px-3 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono"
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1">Cantidad Lote</label>
                <input
                  type="number"
                  step="0.001"
                  min="0.001"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  className="w-full min-h-[44px] px-3 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono tabular-nums"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-slate-400 mb-1">Fecha Recepción</label>
                <input
                  type="date"
                  value={receptionDate}
                  onChange={(e) => setReceptionDate(e.target.value)}
                  className="w-full min-h-[44px] px-3 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono"
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1">Fecha Vencimiento</label>
                <input
                  type="date"
                  value={expirationDate}
                  onChange={(e) => setExpirationDate(e.target.value)}
                  className="w-full min-h-[44px] px-3 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono"
                />
              </div>
            </div>

            <button
              type="submit"
              className="w-full min-h-[44px] rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold cursor-pointer"
            >
              Incorporar a Cola FEFO
            </button>
          </form>

          {/* Tabla Ordenada Estrictamente por Vencimiento FEFO */}
          <div className="xl:col-span-2 bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <h3 className="text-sm font-bold text-white">
                Cola Activa Ordenada por Próximo Vencimiento (FEFO Estricto)
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left border-collapse">
                <thead>
                  <tr className="bg-slate-950 text-slate-400 border-b border-slate-800">
                    <th className="p-3">Lote / Producto</th>
                    <th className="p-3">Sede & Zona</th>
                    <th className="p-3 text-right">Saldo</th>
                    <th className="p-3">Vence</th>
                    <th className="p-3">Semáforo & Acción</th>
                    <th className="p-3 text-right">Operación</th>
                  </tr>
                </thead>
                <tbody>
                  {fefoLots
                    .filter((l) => l.quantityRemaining > 0)
                    .map((lot) => (
                      <tr key={lot.id} className="border-b border-slate-800/70 hover:bg-slate-800/30">
                        <td className="p-3">
                          <div className="font-mono font-bold text-sky-300">{lot.lotCode}</div>
                          <div className="text-white font-medium">{lot.productName}</div>
                        </td>
                        <td className="p-3">
                          <div className="text-slate-200">{lot.locationName}</div>
                          <span
                            className={`inline-block mt-0.5 px-2 py-0.5 rounded text-[10px] font-bold ${
                              lot.zone === 'ANAQUEL'
                                ? 'bg-emerald-500/20 text-emerald-300'
                                : 'bg-amber-500/20 text-amber-300'
                            }`}
                          >
                            {lot.zone === 'ANAQUEL' ? 'Exhibición' : 'Nevera / Cava'}
                          </span>
                        </td>
                        <td className="p-3 text-right font-mono font-bold text-white tabular-nums">
                          {lot.quantityRemaining} {lot.unit}
                        </td>
                        <td className="p-3 font-mono tabular-nums">
                          <div className="text-white">{lot.expirationDate}</div>
                          <div
                            className={`text-[10px] font-bold ${
                              lot.daysUntilExpiration < 0
                                ? 'text-rose-400'
                                : lot.daysUntilExpiration <= 3
                                ? 'text-amber-400'
                                : 'text-emerald-400'
                            }`}
                          >
                            {lot.daysUntilExpiration < 0
                              ? `Vencido (${Math.abs(lot.daysUntilExpiration)}d)`
                              : `En ${lot.daysUntilExpiration} días`}
                          </div>
                        </td>
                        <td className="p-3">
                          <span
                            className={`px-2 py-1 rounded-lg text-[10px] font-bold inline-block ${
                              lot.alertLevel === 'VENCIDO_BLOQUEADO'
                                ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                                : lot.alertLevel === 'CRITICO_PROMOCION_1_3D'
                                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                                : lot.alertLevel === 'PREVENTIVO_4_7D'
                                ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40'
                                : 'bg-emerald-500/20 text-emerald-300'
                            }`}
                          >
                            {lot.alertLevel === 'VENCIDO_BLOQUEADO'
                              ? lot.blockedForSale
                                ? 'BLOQUEADO VENTA'
                                : 'DESBLOQUEADO TOTP'
                              : lot.alertLevel === 'CRITICO_PROMOCION_1_3D'
                              ? `PROMO -${lot.suggestedDiscountPercent}% / RECETA BOM`
                              : lot.alertLevel === 'PREVENTIVO_4_7D'
                              ? 'PRIORIZAR EXHIBICIÓN'
                              : 'VIGENTE ÓPTIMO'}
                          </span>
                        </td>
                        <td className="p-3 text-right">
                          {lot.blockedForSale ? (
                            <button
                              type="button"
                              onClick={() => {
                                setUnlockLotId(lot.id);
                                setUnlockCredential('');
                              }}
                              className="min-h-[44px] px-3 rounded-xl bg-rose-600/20 hover:bg-rose-600/40 border border-rose-500/40 text-rose-200 font-bold inline-flex items-center gap-1 cursor-pointer"
                            >
                              <Lock className="w-3.5 h-3.5" />
                              Autorizar TOTP/PIN
                            </button>
                          ) : lot.zone === 'DEPOSITO' ? (
                            <button
                              type="button"
                              onClick={() => {
                                const r = moveFefoLotCavaToShelf(lot.id, lot.quantityRemaining);
                                setBanner({
                                  type: r.success ? 'ok' : 'err',
                                  text: r.success
                                    ? `Lote ${lot.lotCode} pasado prioritariamente a Exhibición.`
                                    : r.error || 'Error moviendo lote.',
                                });
                              }}
                              className="min-h-[44px] px-3 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-bold cursor-pointer"
                            >
                              Pasar a Exhibición
                            </button>
                          ) : (
                            <span className="text-[11px] text-emerald-400 font-semibold">
                              En Piso FEFO
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          <form
            onSubmit={handleLogTemp}
            className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3 text-xs"
          >
            <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
              <Thermometer className="w-4 h-4 text-sky-400" />
              Registrar Lectura Térmica de Cava / Vitrina
            </h3>

            <div>
              <label className="block text-slate-400 mb-1">Sede / Frigorífico</label>
              <select
                value={tempLocId}
                onChange={(e) => setTempLocId(e.target.value)}
                className="w-full min-h-[44px] px-3 rounded-xl bg-slate-950 border border-slate-700 text-white"
              >
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-slate-400 mb-1">Tipo de Equipo Frigorífico</label>
              <select
                value={equipmentType}
                onChange={(e) => {
                  const t = e.target.value as ColdEquipmentType;
                  setEquipmentType(t);
                  setEquipmentName(SADA_COLD_CHAIN_LIMITS[t].label);
                }}
                className="w-full min-h-[44px] px-3 rounded-xl bg-slate-950 border border-slate-700 text-white"
              >
                {Object.entries(SADA_COLD_CHAIN_LIMITS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v.label} ({v.minCelsius}°C a {v.maxCelsius}°C)
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-slate-400 mb-1">Identificador Cava</label>
                <input
                  type="text"
                  value={equipmentName}
                  onChange={(e) => setEquipmentName(e.target.value)}
                  className="w-full min-h-[44px] px-3 rounded-xl bg-slate-950 border border-slate-700 text-white"
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1">Temperatura (°C)</label>
                <input
                  type="number"
                  step="0.1"
                  value={tempCelsius}
                  onChange={(e) => setTempCelsius(e.target.value)}
                  className="w-full min-h-[44px] px-3 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono tabular-nums"
                />
              </div>
            </div>

            <div>
              <label className="block text-slate-400 mb-1">Acción Correctiva / Observación</label>
              <input
                type="text"
                value={correctiveAction}
                onChange={(e) => setCorrectiveAction(e.target.value)}
                placeholder="Ej. Compresor operando en ciclo normal"
                className="w-full min-h-[44px] px-3 rounded-xl bg-slate-950 border border-slate-700 text-white"
              />
            </div>

            <button
              type="submit"
              className="w-full min-h-[44px] rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-bold cursor-pointer"
            >
              Asentar Control Sanitario SADA
            </button>
          </form>

          <div className="xl:col-span-2 bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
            <div className="p-4 border-b border-slate-800">
              <h3 className="text-sm font-bold text-white">
                Historial Inmutable de Cadena de Frío por Sede
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left border-collapse">
                <thead>
                  <tr className="bg-slate-950 text-slate-400 border-b border-slate-800">
                    <th className="p-3">Fecha / Hora VET</th>
                    <th className="p-3">Sede / Equipo</th>
                    <th className="p-3 text-right">Lectura °C</th>
                    <th className="p-3 text-right">Rango SADA</th>
                    <th className="p-3">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {coldChainLogs.map((log) => (
                    <tr key={log.id} className="border-b border-slate-800/70">
                      <td className="p-3 font-mono text-slate-300">{log.recordedAtVet}</td>
                      <td className="p-3">
                        <div className="text-white font-semibold">{log.equipmentName}</div>
                        <div className="text-[11px] text-slate-400">{log.locationName}</div>
                      </td>
                      <td className="p-3 text-right font-mono font-bold tabular-nums text-white">
                        {log.recordedTempCelsius.toFixed(1)}°C
                      </td>
                      <td className="p-3 text-right font-mono text-slate-400 tabular-nums">
                        [{log.minAllowedCelsius}°C .. {log.maxAllowedCelsius}°C]
                      </td>
                      <td className="p-3">
                        <span
                          className={`px-2 py-1 rounded-lg text-[10px] font-bold ${
                            log.isOutOfRange
                              ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                              : 'bg-emerald-500/20 text-emerald-300'
                          }`}
                        >
                          {log.isOutOfRange ? 'DESVIACIÓN TÉRMICA' : 'CONFORME SADA'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Modal Autorización Gerencial TOTP / PIN para Lote Vencido */}
      {unlockLotId && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-md w-full p-5 space-y-4 text-xs">
            <h4 className="text-sm font-bold text-white flex items-center gap-2">
              <Lock className="w-4 h-4 text-amber-400" />
              Autorización Gerencial TOTP / PIN (Lote Vencido)
            </h4>
            <p className="text-slate-300">
              Ingrese el <strong>Token Dinámico TOTP de 6 dígitos</strong> (Google Authenticator) o el PIN Gerencial de contingencia para autorizar la disposición controlada del lote.
            </p>
            <input
              type="password"
              value={unlockCredential}
              onChange={(e) => setUnlockCredential(e.target.value)}
              placeholder="Token TOTP 6 dígitos o PIN"
              className="w-full min-h-[44px] px-3 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono text-center text-base tracking-widest"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setUnlockLotId(null)}
                className="min-h-[44px] px-4 rounded-xl bg-slate-800 text-slate-300 font-semibold cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  const r = unlockExpiredLotWithGovernance(unlockLotId, unlockCredential);
                  setBanner({
                    type: r.success ? 'ok' : 'err',
                    text: r.success
                      ? 'Lote desbloqueado bajo responsabilidad gerencial auditada.'
                      : r.error || 'Credencial inválida.',
                  });
                  if (r.success) setUnlockLotId(null);
                }}
                className="min-h-[44px] px-4 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold cursor-pointer"
              >
                Autorizar Desbloqueo
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FefoColdChainCenter;
