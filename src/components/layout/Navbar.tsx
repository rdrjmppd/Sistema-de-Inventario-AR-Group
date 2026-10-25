import React, { useState } from 'react';
import {
  Building2,
  Clock,
  RefreshCw,
  LogOut,
  Shield,
  Sliders,
  Terminal,
  TrendingUp,
  BellRing,
  Globe,
  Plus,
  Warehouse,
  CheckCircle2,
  AlertTriangle,
  X,
  Lock,
  Trash2,
  Menu,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useFinance } from '../../context/FinanceContext';
import { useInventory } from '../../context/InventoryContext';
import { LocationNode, UserRole } from '../../types';
import { formatRate } from '../../lib/decimal';

interface NavbarProps {
  onOpenStudio: () => void;
  onOpenDiagnostics: () => void;
  onOpenNotifications: () => void;
  onOpenMobileMenu?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  onOpenStudio,
  onOpenDiagnostics,
  onOpenNotifications,
  onOpenMobileMenu,
}) => {
  const { user, logout, switchRoleDemo } = useAuth();
  const {
    bcvState,
    isSyncingBcv,
    refreshLiveBcvRate,
    simulatedHourVet,
    setSimulatedHourVet,
  } = useFinance();
  const {
    locations,
    selectedLocationId,
    setSelectedLocationId,
    isAddLocationModalOpen,
    setIsAddLocationModalOpen,
    locationToDelete,
    setLocationToDelete,
    addLocationOrDepot,
    deleteLocationOrDepot,
    reorderAlerts,
    unreadAlertsCount,
  } = useInventory();

  const [syncPulse, setSyncPulse] = useState(false);

  // New Sede / Depósito modal form state
  const [newLocType, setNewLocType] = useState<LocationNode['type']>('SEDE');
  const [newLocCode, setNewLocCode] = useState('');
  const [newLocName, setNewLocName] = useState('');
  const [newLocCity, setNewLocCity] = useState('');
  const [newLocManager, setNewLocManager] = useState('');
  const [createAuthPin, setCreateAuthPin] = useState('');
  const [locFormError, setLocFormError] = useState<string | null>(null);
  const [locCreatedBanner, setLocCreatedBanner] = useState<string | null>(null);

  // Delete Sede / Depósito modal state
  const [deleteAuthPin, setDeleteAuthPin] = useState('');
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteSuccessBanner, setDeleteSuccessBanner] = useState<string | null>(null);

  const canManageLocations =
    user?.role === UserRole.SUPERADMIN || user?.role === UserRole.GERENTE;

  const handleManualBcvRefresh = async () => {
    const res = await refreshLiveBcvRate(true);
    if (res.success) {
      setSyncPulse(true);
      setTimeout(() => setSyncPulse(false), 2000);
    }
  };

  const toggle5PmSimulation = () => {
    if (simulatedHourVet === null) {
      setSimulatedHourVet(17);
    } else if (simulatedHourVet === 17) {
      setSimulatedHourVet(14);
    } else {
      setSimulatedHourVet(null);
    }
  };

  const handleCreateLocationSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLocFormError(null);

    const res = addLocationOrDepot({
      code: newLocCode,
      name: newLocName,
      city: newLocCity,
      type: newLocType,
      manager: newLocManager,
      authCode: createAuthPin,
    });

    if (!res.success || !res.location) {
      setLocFormError(res.error || 'No se pudo registrar la nueva Sede o Depósito.');
      return;
    }

    setSelectedLocationId(res.location.id);
    setLocCreatedBanner(
      `${res.location.type === 'DEPOSITO' ? 'Depósito' : 'Sede'} "${res.location.code} — ${res.location.name}" autorizado y creado en el sistema.`
    );
    setNewLocCode('');
    setNewLocName('');
    setNewLocCity('');
    setNewLocManager('');
    setCreateAuthPin('');
    setTimeout(() => {
      setLocCreatedBanner(null);
      setIsAddLocationModalOpen(false);
    }, 1000);
  };

  const handleDeleteLocationSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!locationToDelete) return;
    setDeleteError(null);

    const res = deleteLocationOrDepot(locationToDelete.id, deleteAuthPin);
    if (!res.success) {
      setDeleteError(res.error || 'Error al eliminar la Sede o Depósito.');
      return;
    }

    setDeleteSuccessBanner(
      `Ubicación "${res.deletedLocation?.code} — ${res.deletedLocation?.name}" eliminada con autorización RBAC (${user?.role}).`
    );
    setDeleteAuthPin('');
    setTimeout(() => {
      setDeleteSuccessBanner(null);
      setLocationToDelete(null);
    }, 900);
  };

  return (
    <>
      <header className="bg-slate-900 text-white border-b border-slate-800 px-3 sm:px-4 lg:px-6 py-2.5 shrink-0">
        <div className="max-w-[1600px] mx-auto flex flex-wrap items-center justify-between gap-2.5 sm:gap-3">
          {/* Left: Mobile Menu Button + Brand & Global Sede o Depósito Filter + '+' Button */}
          <div className="flex flex-wrap items-center gap-2.5 sm:gap-4 w-full lg:w-auto justify-between lg:justify-start">
            <div className="flex items-center gap-2">
              {onOpenMobileMenu && (
                <button
                  type="button"
                  onClick={onOpenMobileMenu}
                  aria-label="Abrir Menú de Navegación"
                  className="lg:hidden min-h-[44px] min-w-[44px] rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 flex items-center justify-center text-sky-400 transition cursor-pointer shrink-0"
                >
                  <Menu className="w-5 h-5" />
                </button>
              )}
              <div className="w-9 h-9 rounded-lg bg-sky-600 flex items-center justify-center font-bold text-base tracking-tighter shadow-inner shrink-0">
                CH®
              </div>
              <div>
                <div className="flex items-center gap-1.5 sm:gap-2">
                  <span className="font-bold tracking-tight text-sm md:text-base text-white whitespace-nowrap">
                    CHRYSTAL® ERP
                  </span>
                  <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-300 border border-sky-500/30 whitespace-nowrap hidden xs:inline-block sm:inline-block">
                    VENEZUELA EDITION
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 hidden sm:block whitespace-nowrap">
                  Retail Alimentario Multi-Sede y Depósitos · SDD + Decimal.js
                </p>
              </div>
            </div>

            <div className="h-6 w-px bg-slate-800 hidden md:block" />

            {/* Multi-location Selector: Sede o Depósito + '+' Button */}
            <div className="flex items-center gap-1.5 flex-1 sm:flex-initial justify-end">
              <div className="flex items-center gap-2 bg-slate-800/90 border border-slate-700 rounded-md px-2.5 py-1.5 min-w-0 flex-1 sm:flex-initial">
                <Building2 className="w-4 h-4 text-sky-400 shrink-0" />
                <div className="flex flex-col min-w-0 flex-1">
                  <label
                    htmlFor="global-sede-select"
                    className="text-[9px] uppercase tracking-wider text-slate-400 font-semibold truncate"
                  >
                    Sede o Depósito
                  </label>
                  <select
                    id="global-sede-select"
                    value={selectedLocationId}
                    onChange={(e) => setSelectedLocationId(e.target.value)}
                    className="bg-transparent text-xs font-semibold text-white focus:outline-none cursor-pointer truncate max-w-[165px] sm:max-w-[240px]"
                  >
                    <option value="ALL" className="bg-slate-900 text-white">
                      Consolidado Nacional ({locations.length} Sedes / Depósitos)
                    </option>
                    {locations.map((loc) => (
                      <option key={loc.id} value={loc.id} className="bg-slate-900 text-white">
                        [{loc.type === 'DEPOSITO' || loc.type === 'CEDIS' ? 'DEPÓSITO' : 'SEDE'}]{' '}
                        {loc.code} — {loc.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  setLocFormError(null);
                  setLocCreatedBanner(null);
                  setCreateAuthPin('');
                  setIsAddLocationModalOpen(true);
                }}
                title={
                  canManageLocations
                    ? 'Añadir nueva Sede o nuevo Depósito (Requiere Código de Autorización)'
                    : 'Potestad restringida a SUPERADMIN o GERENTE'
                }
                aria-label="Añadir nueva Sede o nuevo Depósito"
                className={`min-h-[40px] sm:h-9 px-2.5 rounded-md border flex items-center gap-1 text-xs font-bold transition shadow-xs cursor-pointer shrink-0 ${
                  canManageLocations
                    ? 'bg-sky-600 hover:bg-sky-500 text-white border-sky-400/40'
                    : 'bg-slate-800 text-slate-400 border-slate-700'
                }`}
              >
                <Plus className="w-4 h-4 shrink-0" />
                <span className="hidden xl:inline whitespace-nowrap">Sede / Depósito</span>
              </button>
            </div>
          </div>

          {/* Center/Right: BCV Live Monitor + Refresh Button + Reorder Bell + VET Clock + Role Controls */}
          <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto justify-between lg:justify-end">
            {/* BCV Rate Monitor with Live Reload Button */}
            <div
              className={`flex flex-wrap items-center justify-between gap-2 px-2.5 sm:px-3 py-1.5 rounded-md border text-xs w-full sm:w-auto transition ${
                syncPulse
                  ? 'bg-sky-950/90 border-sky-400 text-sky-100'
                  : bcvState.isAfter5PmVet
                  ? 'bg-amber-950/60 border-amber-500/50 text-amber-200'
                  : 'bg-emerald-950/50 border-emerald-500/40 text-emerald-200'
              }`}
            >
              <div className="flex items-center gap-2 min-w-0">
                <TrendingUp className="w-4 h-4 shrink-0 text-emerald-400" />
                <div className="leading-tight min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-mono font-bold text-sm text-white whitespace-nowrap">
                      {formatRate(bcvState.activeRate)}
                    </span>
                    <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-black/30 whitespace-nowrap">
                      {bcvState.isAfter5PmVet ? 'BCV OFICIAL (≥17:00)' : 'BCV OFICIAL EN VIVO'}
                    </span>
                  </div>
                  <div className="text-[10px] opacity-85 font-mono flex items-center gap-1.5 truncate">
                    <Globe className="w-2.5 h-2.5 text-sky-400 shrink-0" />
                    <span className="truncate">
                      Spot: {bcvState.spotRateToday.toFixed(2)} | Portal BCV:{' '}
                      {bcvState.nextDayRateAfter5Pm.toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  disabled={isSyncingBcv}
                  onClick={handleManualBcvRefresh}
                  title="Establecer conexión en vivo y recargar la última tasa oficial del Banco Central de Venezuela (www.bcv.org.ve)"
                  className="min-h-[36px] px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-[10px] font-mono font-bold text-white border border-emerald-400/40 transition flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <RefreshCw
                    className={`w-3 h-3 shrink-0 ${isSyncingBcv ? 'animate-spin' : ''}`}
                  />
                  <span>{isSyncingBcv ? 'Conectando BCV...' : 'Actualizar BCV'}</span>
                </button>

                <button
                  type="button"
                  onClick={toggle5PmSimulation}
                  title="Simular corte horario 5:00 PM (17:00 VET) del BCV"
                  className="min-h-[36px] px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-[10px] font-mono text-sky-300 border border-slate-600 transition flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  {simulatedHourVet === null
                    ? '5PM'
                    : simulatedHourVet === 17
                    ? '17:00'
                    : '14:00'}
                </button>
              </div>
            </div>

            {/* Real-Time Reorder Point Notification Bell */}
            <button
              type="button"
              onClick={onOpenNotifications}
              title="Alertas en Tiempo Real de Punto de Pedido"
              className={`relative min-h-[40px] flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border text-xs font-semibold transition whitespace-nowrap shrink-0 cursor-pointer ${
                reorderAlerts.length > 0
                  ? 'bg-amber-950/70 hover:bg-amber-900/80 border-amber-500/50 text-amber-200'
                  : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-300'
              }`}
            >
              <BellRing
                className={`w-4 h-4 shrink-0 ${
                  unreadAlertsCount > 0 ? 'text-amber-400 animate-bounce' : 'text-slate-300'
                }`}
              />
              <span className="hidden sm:inline">Alertas Stock</span>
              <span
                className={`px-1.5 py-0.5 rounded-full font-mono text-[10px] font-bold ${
                  unreadAlertsCount > 0
                    ? 'bg-amber-500 text-slate-950'
                    : 'bg-slate-700 text-slate-200'
                }`}
              >
                {reorderAlerts.length}
              </span>
            </button>

            {/* Caracas Time Indicator */}
            <div className="hidden xl:flex items-center gap-1.5 bg-slate-800/70 border border-slate-700 px-2.5 py-1.5 rounded-md text-xs font-mono shrink-0 whitespace-nowrap">
              <Clock className="w-3.5 h-3.5 text-sky-400 shrink-0" />
              <span className="text-slate-300 whitespace-nowrap">
                {bcvState.caracasTimeFormatted}
              </span>
              <span className="text-[10px] text-slate-400 whitespace-nowrap">VET</span>
            </div>

            {/* Superadmin No-Code & Diagnostics */}
            {user?.role === UserRole.SUPERADMIN && (
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={onOpenStudio}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-sky-600 hover:bg-sky-500 text-white text-xs font-medium transition shadow-sm whitespace-nowrap"
                >
                  <Sliders className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Studio No-Code</span>
                </button>
                <button
                  type="button"
                  onClick={onOpenDiagnostics}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-mono transition whitespace-nowrap"
                  title="Consola de Diagnóstico y Auditoría SDD"
                >
                  <Terminal className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="hidden md:inline">SDD Audit</span>
                </button>
              </div>
            )}

            {/* User RBAC Badge & Quick Role Switcher for Testing */}
            {user && (
              <div className="flex items-center gap-2 bg-slate-800 border border-slate-700 rounded-md px-2.5 py-1 shrink-0">
                <Shield className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <div className="text-left">
                  <div className="text-[11px] font-semibold text-white leading-none truncate max-w-[150px]">
                    {user.displayName}
                  </div>
                  <div className="flex items-center gap-1 mt-0.5">
                    <span className="text-[9px] font-mono text-slate-400">ROL:</span>
                    <select
                      aria-label="Cambiar Rol RBAC"
                      value={user.role}
                      onChange={(e) => switchRoleDemo(e.target.value as UserRole)}
                      className="bg-transparent text-[10px] font-mono font-bold text-amber-300 focus:outline-none cursor-pointer"
                    >
                      <option value={UserRole.SUPERADMIN} className="bg-slate-900 text-white">
                        SUPERADMIN
                      </option>
                      <option value={UserRole.GERENTE} className="bg-slate-900 text-white">
                        GERENTE
                      </option>
                      <option value={UserRole.ANALISTA} className="bg-slate-900 text-white">
                        ANALISTA
                      </option>
                      <option value={UserRole.OBSERVADOR} className="bg-slate-900 text-white">
                        OBSERVADOR
                      </option>
                    </select>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={logout}
                  title="Cerrar Sesión Segura"
                  className="p-1 text-slate-400 hover:text-rose-400 transition"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Global Modal: Añadir Nueva Sede o Nuevo Depósito (Con Re-Autenticación de Código/PIN y RBAC) */}
      {isAddLocationModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl max-w-lg w-full shadow-2xl overflow-hidden text-slate-900">
            <div className="px-5 py-3.5 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Warehouse className="w-4 h-4 text-sky-400" />
                <h2 className="text-sm font-bold">
                  Registrar Nueva Sede o Nuevo Depósito (Autorización RBAC)
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setIsAddLocationModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateLocationSubmit} className="p-5 space-y-3.5 text-xs">
              {!canManageLocations && (
                <div className="p-3 rounded-lg bg-amber-50 border border-amber-300 text-amber-950 flex items-start gap-2">
                  <Lock className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-bold">Potestad Restringida (Nivel RBAC Insuficiente)</div>
                    <p className="text-[11px] mt-0.5">
                      Su cuenta activa tiene rol <strong>{user?.role}</strong>. Solo los usuarios
                      con nivel <strong>SUPERADMIN</strong> o <strong>GERENTE</strong> están
                      autorizados para agregar o eliminar Sedes o Depósitos.
                    </p>
                  </div>
                </div>
              )}

              {locFormError && (
                <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-900 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{locFormError}</span>
                </div>
              )}

              {locCreatedBanner && (
                <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-900 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>{locCreatedBanner}</span>
                </div>
              )}

              <div>
                <label className="block font-semibold text-slate-700 mb-1.5">
                  Clasificación Operativa *
                </label>
                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setNewLocType('SEDE')}
                    className={`p-2.5 rounded-lg border text-left transition flex items-center gap-2.5 ${
                      newLocType === 'SEDE' || newLocType === 'TIENDA'
                        ? 'bg-sky-50 border-sky-600 text-sky-950 font-bold'
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <Building2 className="w-4 h-4 text-sky-600 shrink-0" />
                    <div>
                      <div>Sede Específica</div>
                      <div className="text-[10px] font-normal text-slate-500">
                        Sucursal comercial / Punto de venta
                      </div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setNewLocType('DEPOSITO')}
                    className={`p-2.5 rounded-lg border text-left transition flex items-center gap-2.5 ${
                      newLocType === 'DEPOSITO' || newLocType === 'CEDIS'
                        ? 'bg-emerald-50 border-emerald-600 text-emerald-950 font-bold'
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <Warehouse className="w-4 h-4 text-emerald-600 shrink-0" />
                    <div>
                      <div>Depósito Específico</div>
                      <div className="text-[10px] font-normal text-slate-500">
                        Almacén / CEDIS / Frigorífico
                      </div>
                    </div>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Código Único *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder={newLocType === 'DEPOSITO' ? 'Ej. DEP-MCY-01' : 'Ej. MCY-01'}
                    value={newLocCode}
                    onChange={(e) => setNewLocCode(e.target.value)}
                    className="w-full px-2.5 py-2 border border-slate-300 rounded-lg font-mono uppercase font-bold"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block font-semibold text-slate-700 mb-1">
                    Nombre de la Sede o Depósito *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder={
                      newLocType === 'DEPOSITO'
                        ? 'Ej. Depósito Logístico Zona Industrial Maracay'
                        : 'Ej. Sede Las Delicias (Maracay)'
                    }
                    value={newLocName}
                    onChange={(e) => setNewLocName(e.target.value)}
                    className="w-full px-2.5 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Ciudad / Estado
                  </label>
                  <input
                    type="text"
                    placeholder="Ej. Maracay, Edo. Aragua"
                    value={newLocCity}
                    onChange={(e) => setNewLocCity(e.target.value)}
                    className="w-full px-2.5 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Responsable / Jefe de Sede o Depósito
                  </label>
                  <input
                    type="text"
                    placeholder="Ej. Ing. Carlos Mendoza"
                    value={newLocManager}
                    onChange={(e) => setNewLocManager(e.target.value)}
                    className="w-full px-2.5 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              {/* Mandatory Re-Authentication Field */}
              <div className="p-3 rounded-lg bg-slate-900 text-white space-y-2 border border-slate-800">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 font-mono text-[11px] font-bold text-amber-300">
                    <Lock className="w-3.5 h-3.5" />
                    CÓDIGO DE AUTORIZACIÓN / PIN DE SESIÓN ACTIVA *
                  </span>
                  <span className="text-[10px] font-mono text-slate-400">
                    Cuenta: {user?.displayName} ({user?.role})
                  </span>
                </div>
                <input
                  type="password"
                  required
                  placeholder="Ingrese nuevamente el PIN / contraseña de su cuenta abierta"
                  value={createAuthPin}
                  onChange={(e) => setCreateAuthPin(e.target.value)}
                  className="w-full px-3 py-2 rounded bg-slate-950 border border-slate-700 text-white font-mono text-xs focus:outline-none focus:border-sky-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsAddLocationModalOpen(false)}
                  className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-100 font-medium"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={!canManageLocations}
                  className="px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white font-semibold flex items-center gap-1.5"
                >
                  <Plus className="w-4 h-4" />
                  <span>Autorizar y Guardar {newLocType === 'DEPOSITO' ? 'Depósito' : 'Sede'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Global Modal: Eliminar Sede o Depósito con Código de Autorización / PIN (SUPERADMIN / GERENTE) */}
      {locationToDelete && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl max-w-md w-full shadow-2xl overflow-hidden text-slate-900">
            <div className="px-5 py-3.5 bg-rose-950 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Trash2 className="w-4 h-4 text-rose-400" />
                <h2 className="text-sm font-bold">
                  Eliminar Sede o Depósito (Código de Autorización)
                </h2>
              </div>
              <button
                type="button"
                onClick={() => {
                  setLocationToDelete(null);
                  setDeleteError(null);
                  setDeleteAuthPin('');
                }}
                className="text-rose-200 hover:text-white p-1 rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleDeleteLocationSubmit} className="p-5 space-y-3.5 text-xs">
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 space-y-1">
                <div className="text-[10px] font-mono uppercase text-slate-500">
                  Ubicación seleccionada para baja definitiva:
                </div>
                <div className="font-bold text-slate-900 text-sm">
                  [{locationToDelete.type === 'DEPOSITO' || locationToDelete.type === 'CEDIS' ? 'DEPÓSITO' : 'SEDE'}]{' '}
                  {locationToDelete.code} — {locationToDelete.name}
                </div>
                <div className="text-[11px] text-slate-600">
                  Ciudad: {locationToDelete.city} · Responsable: {locationToDelete.manager}
                </div>
              </div>

              {!canManageLocations && (
                <div className="p-3 rounded-lg bg-amber-50 border border-amber-300 text-amber-950 flex items-start gap-2">
                  <Lock className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-bold">Nivel RBAC No Autorizado ({user?.role})</div>
                    <p className="text-[11px] mt-0.5">
                      Solo el usuario <strong>SUPERADMIN</strong> o nivel{' '}
                      <strong>GERENTE</strong> tienen potestad para eliminar Sedes o Depósitos.
                    </p>
                  </div>
                </div>
              )}

              {deleteError && (
                <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-900 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{deleteError}</span>
                </div>
              )}

              {deleteSuccessBanner && (
                <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-900 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>{deleteSuccessBanner}</span>
                </div>
              )}

              <div className="p-3 rounded-lg bg-slate-900 text-white space-y-2 border border-slate-800">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 font-mono text-[11px] font-bold text-amber-300">
                    <Lock className="w-3.5 h-3.5" />
                    CONFIRMAR CÓDIGO DE AUTORIZACIÓN / PIN *
                  </span>
                  <span className="text-[10px] font-mono text-slate-400">
                    Rol Activo: {user?.role}
                  </span>
                </div>
                <p className="text-[11px] text-slate-300">
                  Por protocolo de seguridad, introduzca nuevamente el PIN / contraseña de su
                  cuenta abierta ({user?.email}) para ejecutar el borrado.
                </p>
                <input
                  type="password"
                  required
                  placeholder="Código de autorización / PIN de la cuenta abierta"
                  value={deleteAuthPin}
                  onChange={(e) => setDeleteAuthPin(e.target.value)}
                  className="w-full px-3 py-2 rounded bg-slate-950 border border-slate-700 text-white font-mono text-xs focus:outline-none focus:border-rose-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => {
                    setLocationToDelete(null);
                    setDeleteError(null);
                    setDeleteAuthPin('');
                  }}
                  className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-100 font-medium"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={!canManageLocations}
                  className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white font-semibold flex items-center gap-1.5 cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Confirmar Eliminación</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
};

export default Navbar;
