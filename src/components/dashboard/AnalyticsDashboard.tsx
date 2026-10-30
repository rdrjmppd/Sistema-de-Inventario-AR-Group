import React, { useState } from 'react';
import {
  TrendingUp,
  Package,
  AlertTriangle,
  Wallet,
  ArrowRight,
  FileSpreadsheet,
  ScanLine,
  ShieldCheck,
  Building2,
  MapPin,
  Phone,
  Edit3,
  RotateCcw,
  ShieldAlert,
  Database,
  CheckCircle,
  Lock,
} from 'lucide-react';
import { useInventory } from '../../context/InventoryContext';
import { useFinance } from '../../context/FinanceContext';
import { useUIConfig } from '../../context/UIConfigContext';
import { useAuth } from '../../context/AuthContext';
import { NavigationTab, UserRole } from '../../types';
import { toDecimal, round2, formatUsd, formatVes } from '../../lib/decimal';
import { DEFAULT_COMPANY_PROFILE } from '../../lib/excel-exporter';
import { BackupRestoreManager } from './BackupRestoreManager';
import { SystemHealthMonitorWidget } from './SystemHealthMonitorWidget';
import { DatabaseSyncStatus } from './DatabaseSyncStatus';
import { CashFlowProjectionsWidget } from './CashFlowProjectionsWidget';

interface AnalyticsDashboardProps {
  onNavigate: (tab: NavigationTab) => void;
}

export const AnalyticsDashboard: React.FC<AnalyticsDashboardProps> = ({ onNavigate }) => {
  const {
    products,
    locations,
    selectedLocationId,
    reorderAlerts,
    wipePlatformDataToPristine,
    pendingDiscardsCount,
  } = useInventory();
  const { bcvState, invoices } = useFinance();
  const { config, setIsCompanyModalOpen } = useUIConfig();
  const { user } = useAuth();
  const company = config.companyProfile || DEFAULT_COMPANY_PROFILE;

  const isSuperAdmin = user?.role === UserRole.SUPERADMIN;
  const [showBackupSection, setShowBackupSection] = useState(false);
  const [isWipeModalOpen, setIsWipeModalOpen] = useState(false);
  const [superAdminPinInput, setSuperAdminPinInput] = useState('');
  const [confirmPhraseInput, setConfirmPhraseInput] = useState('');
  const [wipeError, setWipeError] = useState<string | null>(null);
  const [wipeSuccess, setWipeSuccess] = useState(false);

  const handleExecuteWipe = (e: React.FormEvent) => {
    e.preventDefault();
    setWipeError(null);

    if (confirmPhraseInput.trim() !== 'REINICIAR-SISTEMA') {
      setWipeError('Debe escribir exactamente la frase de confirmación: REINICIAR-SISTEMA');
      return;
    }

    const res = wipePlatformDataToPristine(superAdminPinInput);
    if (!res.success) {
      setWipeError(res.error || 'Código PIN de Superadministrador incorrecto.');
      return;
    }

    setWipeSuccess(true);
    setTimeout(() => {
      setIsWipeModalOpen(false);
      setSuperAdminPinInput('');
      setConfirmPhraseInput('');
      setWipeSuccess(false);
    }, 2000);
  };

  // Compute consolidated or location-filtered metrics with Decimal.js
  let totalCostUsd = toDecimal(0);
  let totalRetailUsd = toDecimal(0);
  let totalUnits = toDecimal(0);

  for (const p of products) {
    const qty =
      selectedLocationId === 'ALL'
        ? Object.values(p.stockByLocation).reduce((a, b) => a + b, 0)
        : p.stockByLocation[selectedLocationId] ?? 0;

    totalUnits = totalUnits.plus(qty);
    totalCostUsd = totalCostUsd.plus(toDecimal(qty).times(p.costUsd));
    totalRetailUsd = totalRetailUsd.plus(toDecimal(qty).times(p.priceUsd));
  }

  const lowStockCount =
    selectedLocationId === 'ALL'
      ? reorderAlerts.length
      : reorderAlerts.filter((a) => a.locationId === selectedLocationId).length;

  const costUsdNum = round2(totalCostUsd);
  const costVesNum = round2(totalCostUsd.times(bcvState.activeRate));
  const retailUsdNum = round2(totalRetailUsd);
  const potentialProfitUsd = round2(totalRetailUsd.minus(totalCostUsd));

  const pendingPayablesUsd = round2(
    invoices.reduce(
      (acc, inv) => acc.plus(toDecimal(inv.totalUsd).minus(inv.paidAmountUsd)),
      toDecimal(0)
    )
  );

  // Per-location bar distribution
  const locationBars = locations.map((loc) => {
    const valUsd = round2(
      products.reduce(
        (acc, p) =>
          acc.plus(toDecimal(p.stockByLocation[loc.id] ?? 0).times(p.costUsd)),
        toDecimal(0)
      )
    );
    const pct =
      costUsdNum > 0
        ? Math.min(100, Math.round((valUsd / costUsdNum) * 100))
        : 33;
    return { loc, valUsd, pct };
  });

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* Corporate Identity & Fiscal Letterhead Card (Main Panel Alignment) */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3.5">
        <div className="flex items-start gap-3 min-w-0">
          <div className="p-2.5 rounded-xl bg-slate-900 text-sky-400 border border-slate-800 shrink-0 mt-0.5">
            <Building2 className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded bg-sky-100 text-sky-900 font-bold border border-sky-200">
                EMPRESA TITULAR DEL INVENTARIO
              </span>
              <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded bg-slate-900 text-emerald-400">
                RIF: {company.rif}
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200">
                Código SADA: {company.codigoSada}
              </span>
              {!company.isCustomConfigured && (
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200">
                  Modo Plantilla Genérica Activo
                </span>
              )}
            </div>
            <h2 className="text-sm sm:text-base font-extrabold text-slate-900 mt-1 truncate">
              {company.razonSocial}
            </h2>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600 mt-1">
              <span className="inline-flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5 text-sky-600 shrink-0" />
                <span>{company.direccionFiscal}</span>
              </span>
              <span className="inline-flex items-center gap-1 font-mono text-[11px]">
                <Phone className="w-3 h-3 text-emerald-600 shrink-0" />
                <span>{company.telefono}</span>
              </span>
              <span className="text-[11px] text-slate-500">
                Responsable: <strong>{company.representanteLegal}</strong>
              </span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setIsCompanyModalOpen(true)}
            className="min-h-[40px] flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-slate-900 hover:bg-sky-700 text-white text-xs font-bold transition shadow-2xs cursor-pointer"
          >
            <Edit3 className="w-3.5 h-3.5 text-sky-400" />
            <span>Datos de la Empresa (Razón Social / RIF)</span>
          </button>
        </div>
      </div>

      {/* Reactive Alert for Pending Inventory Discards (Dual Signature) */}
      {pendingDiscardsCount > 0 && (
        <div className="bg-amber-950 text-amber-100 border border-amber-500/50 rounded-xl p-3.5 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 text-xs">
            <ShieldAlert className="w-5 h-5 text-amber-400 shrink-0 animate-pulse" />
            <div>
              <span className="font-bold text-white">
                ALERTA DE GOBERNANZA DUAL (BAJAS Y MERMAS):
              </span>{' '}
              Existen <strong>{pendingDiscardsCount} solicitud(es)</strong> de descarga de
              inventario pre-registradas por Analista esperando verificación y firma con PIN de
              Gerencia.
            </div>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('INVENTORY_DISCARDS')}
            className="min-h-[40px] px-3.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 shrink-0 cursor-pointer"
          >
            <Lock className="w-3.5 h-3.5" />
            <span>Revisar y Firmar Descargas</span>
          </button>
        </div>
      )}

      {/* Top Executive Banner */}
      <div className="bg-slate-900 text-white rounded-xl p-5 border border-slate-800 shadow-sm flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-sky-400 text-xs font-mono uppercase tracking-wider">
            <ShieldCheck className="w-4 h-4" />
            <span>Torre de Control Financiera &amp; Operativa Multi-Sede</span>
          </div>
          <h1 className="text-lg md:text-xl font-bold mt-1">
            Chrystal® Enterprise ERP — Inteligencia de Inventario y Costos en Tiempo Real
          </h1>
          <p className="text-xs text-slate-300 mt-1">
            Valorización dual protegida contra inflación cambiaria · Tasa activa BCV:{' '}
            <strong className="font-mono text-emerald-400">
              Bs. {bcvState.activeRate.toFixed(2)} / USD
            </strong>{' '}
            ({bcvState.rateSourceLabel}).
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => onNavigate('CHRYSTAL_IMPORT')}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition shadow-xs"
          >
            <FileSpreadsheet className="w-4 h-4" />
            Importar Excel Chrystal®
          </button>
          <button
            type="button"
            onClick={() => onNavigate('INVOICES_OCR')}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold transition shadow-xs"
          >
            <ScanLine className="w-4 h-4" />
            Auditar Factura OCR (4 Candados)
          </button>
        </div>
      </div>

      {/* Monitor de Estado de Salud del Sistema & Anti-Hemorragia de Cuotas Firestore */}
      <SystemHealthMonitorWidget />

      {/* Monitor de Sincronización Inmutable de Persistencia Firestore */}
      <DatabaseSyncStatus />

      {/* 4 Primary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs font-mono uppercase text-slate-500">
            <span>Capital en Inventario (Costo)</span>
            <Package className="w-4 h-4 text-sky-600" />

          </div>
          <div className="text-2xl font-mono font-bold text-slate-900 mt-1.5">
            {formatUsd(costUsdNum)}
          </div>
          <div className="text-xs font-mono text-sky-700 font-semibold mt-1">
            {formatVes(costVesNum)}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs font-mono uppercase text-slate-500">
            <span>Valor Venta Proyectado (PVP)</span>
            <TrendingUp className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-mono font-bold text-slate-900 mt-1.5">
            {formatUsd(retailUsdNum)}
          </div>
          <div className="text-xs font-mono text-emerald-700 font-semibold mt-1">
            Utilidad Potencial: +{formatUsd(potentialProfitUsd)}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs font-mono uppercase text-slate-500">
            <span>Cuentas por Pagar (CxP)</span>
            <Wallet className="w-4 h-4 text-rose-600" />
          </div>
          <div className="text-2xl font-mono font-bold text-rose-700 mt-1.5">
            {formatUsd(pendingPayablesUsd)}
          </div>
          <div className="text-xs font-mono text-slate-500 mt-1">
            {invoices.length} facturas auditadas por OCR
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs font-mono uppercase text-slate-500">
            <span>Alertas de Reorden / Quiebre</span>
            <AlertTriangle className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-2xl font-mono font-bold text-amber-700 mt-1.5">
            {lowStockCount} SKUs
          </div>
          <button
            type="button"
            onClick={() => onNavigate('PURCHASE_SUGGESTIONS')}
            className="text-xs font-semibold text-sky-600 hover:text-sky-500 flex items-center gap-1 mt-1"
          >
            <span>Ver Compras Sugeridas</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Flujo de Caja Bimonetario Real Proyectado (USD / VES) */}
      <CashFlowProjectionsWidget />

      {/* Middle Analytical Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Warehouse Distribution */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs space-y-3">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700">
              Distribución por Sede o Depósito
            </h2>
            <span className="text-[11px] font-mono text-slate-400">
              {round2(totalUnits)} Und. Totales
            </span>
          </div>

          <div className="space-y-3 pt-1">
            {locationBars.map(({ loc, valUsd, pct }) => (
              <div key={loc.id} className="space-y-1">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="font-semibold text-slate-800 truncate">
                    {loc.code} — {loc.name}
                  </span>
                  <span className="font-mono font-bold text-slate-900 whitespace-nowrap shrink-0">
                    {formatUsd(valUsd)} ({pct}%)
                  </span>
                </div>
                <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-sky-600 rounded-full transition-all"
                    style={{ width: `${Math.max(8, pct)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Top Pareto Class A Products */}
        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl p-4 shadow-xs space-y-3">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700">
              SKUs Clase A (Alta Rotación Pareto 80%) & Indexación BCV
            </h2>
            <button
              type="button"
              onClick={() => onNavigate('CATALOG')}
              className="text-xs font-semibold text-sky-600 hover:text-sky-500 flex items-center gap-1"
            >
              <span>Catálogo Completo</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-900 text-slate-200 text-[10px] font-mono uppercase">
                  <th className="py-2 px-3">SKU</th>
                  <th className="py-2 px-3">Producto</th>
                  <th className="py-2 px-3 text-right">Costo USD</th>
                  <th className="py-2 px-3 text-right">PVP USD</th>
                  <th className="py-2 px-3 text-right">PVP Bs. (BCV)</th>
                  <th className="py-2 px-3 text-right">Rotación / Mes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-xs">
                {products
                  .filter((p) => p.abcClass === 'A')
                  .slice(0, 5)
                  .map((p) => (
                    <tr key={p.id} className="hover:bg-slate-50">
                      <td className="py-2 px-3 font-mono font-bold text-slate-900">
                        {p.sku}
                      </td>
                      <td className="py-2 px-3 font-semibold text-slate-900">{p.name}</td>
                      <td className="py-2 px-3 text-right font-mono">
                        {formatUsd(p.costUsd)}
                      </td>
                      <td className="py-2 px-3 text-right font-mono font-bold">
                        {formatUsd(p.priceUsd)}
                      </td>
                      <td className="py-2 px-3 text-right font-mono font-bold text-sky-700">
                        {formatVes(round2(toDecimal(p.priceUsd).times(bcvState.activeRate)))}
                      </td>
                      <td className="py-2 px-3 text-right font-mono text-emerald-700 font-semibold">
                        {p.monthlyUnitsSold} {p.unit}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Continuidad del Negocio, Respaldos Cifrados y Gobernanza de Reinicio */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-sky-950 text-sky-400 border border-sky-800/80">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">
                Continuidad del Negocio & Gobernanza Crítica
              </h3>
              <p className="text-xs text-slate-400">
                Gestión de respaldos cifrados (.chrystal-backup) e histórico de auditoría del sistema.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setShowBackupSection(!showBackupSection)}
              className="px-3.5 py-2 bg-sky-600 hover:bg-sky-500 text-white font-semibold text-xs rounded-lg transition shadow-sm min-h-[44px] flex items-center gap-1.5"
            >
              <Database className="w-4 h-4" />
              {showBackupSection ? 'Ocultar Gestor de Respaldos' : 'Gestionar Respaldos Cifrados'}
            </button>

            <button
              type="button"
              onClick={() => onNavigate('AUDIT_HISTORY')}
              className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs rounded-lg transition min-h-[44px] flex items-center gap-1.5"
            >
              <span>Ver Histórico & Auditoría</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>

            {isSuperAdmin && (
              <button
                type="button"
                onClick={() => {
                  setWipeError(null);
                  setWipeSuccess(false);
                  setSuperAdminPinInput('');
                  setConfirmPhraseInput('');
                  setIsWipeModalOpen(true);
                }}
                className="px-3.5 py-2 bg-red-600/90 hover:bg-red-600 text-white font-bold text-xs rounded-lg transition shadow-md shadow-red-950/40 min-h-[44px] flex items-center gap-1.5"
                title="Solo visible para Superadministrador"
              >
                <RotateCcw className="w-4 h-4" />
                Reiniciar Plataforma (Pristine Wipe)
              </button>
            )}
          </div>
        </div>

        {showBackupSection && (
          <div className="pt-4 border-t border-slate-800">
            <BackupRestoreManager />
          </div>
        )}
      </div>

      {/* Superadmin Wipe Modal */}
      {isWipeModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-red-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3 border-b border-red-900/60 pb-3">
              <div className="p-2 bg-red-950 text-red-400 rounded-lg">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">
                  Confirmación Crítica: Reinicio Total de Fábrica
                </h3>
                <p className="text-xs text-red-400">Esta acción vaciará el catálogo y todos los registros.</p>
              </div>
            </div>

            {wipeSuccess ? (
              <div className="p-4 bg-emerald-950/80 border border-emerald-600 text-emerald-200 rounded-xl text-center space-y-2">
                <CheckCircle className="w-8 h-8 text-emerald-400 mx-auto" />
                <p className="font-bold text-sm">¡Plataforma Reiniciada Exitosamente!</p>
                <p className="text-xs text-emerald-300/80">
                  La base de datos ha sido reseteada a estado virgen. Puede comenzar a cargar nuevos datos o restaurar un respaldo.
                </p>
              </div>
            ) : (
              <form onSubmit={handleExecuteWipe} className="space-y-4">
                <p className="text-xs text-slate-300 leading-relaxed">
                  Para confirmar el borrado total, ingrese su <strong>PIN de Superadministrador</strong> y escriba exactamente la frase <span className="text-red-400 font-mono font-bold">REINICIAR-SISTEMA</span>:
                </p>

                {wipeError && (
                  <div className="p-3 bg-red-950/80 border border-red-700 text-red-300 rounded-lg text-xs">
                    {wipeError}
                  </div>
                )}

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    PIN de Superadministrador *
                  </label>
                  <input
                    type="password"
                    autoComplete="off"
                    inputMode="numeric"
                    maxLength={10}
                    placeholder="Ingrese su PIN confidencial"
                    value={superAdminPinInput}
                    onChange={(e) => setSuperAdminPinInput(e.target.value)}
                    required
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:border-red-500 font-mono min-h-[44px]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Frase de Confirmación (Escriba exactamente: REINICIAR-SISTEMA)
                  </label>
                  <input
                    type="text"
                    placeholder="REINICIAR-SISTEMA"
                    value={confirmPhraseInput}
                    onChange={(e) => setConfirmPhraseInput(e.target.value)}
                    required
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:border-red-500 font-mono min-h-[44px]"
                  />
                </div>

                <div className="flex items-center justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsWipeModalOpen(false)}
                    className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white rounded-lg min-h-[44px]"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 text-xs font-bold bg-red-600 hover:bg-red-700 text-white rounded-lg shadow-lg shadow-red-950/50 min-h-[44px] flex items-center gap-1.5"
                  >
                    <RotateCcw className="w-4 h-4" />
                    Proceder con el Reinicio
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default AnalyticsDashboard;
