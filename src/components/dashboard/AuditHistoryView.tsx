import React, { useState, useMemo } from 'react';
import {
  History,
  ShieldAlert,
  UserCheck,
  Search,
  Filter,
  Lock,
  Clock,
  Calendar,
  AlertTriangle,
  RotateCcw,
  CheckCircle,
  FileSpreadsheet,
  Download,
  Shield,
  Users,
  Database,
  ArrowUpDown,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useInventory } from '../../context/InventoryContext';
import { UserRole, AuditActionType, AuditLogEntry } from '../../types';
import { BackupRestoreManager } from './BackupRestoreManager';

export const AuditHistoryView: React.FC = () => {
  const { user, sessionHistory } = useAuth();
  const {
    auditLogs,
    wipePlatformDataToPristine,
    products,
    locations,
  } = useInventory();

  // Navigation sub-tab: 'LOGS' | 'SESSIONS' | 'BACKUPS'
  const [activeSubTab, setActiveSubTab] = useState<'LOGS' | 'SESSIONS' | 'BACKUPS'>('LOGS');

  // Search & Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [actionFilter, setActionFilter] = useState<string>('ALL');

  // Superadmin Wipe Modal State
  const [isWipeModalOpen, setIsWipeModalOpen] = useState(false);
  const [superAdminPinInput, setSuperAdminPinInput] = useState('');
  const [confirmPhraseInput, setConfirmPhraseInput] = useState('');
  const [wipeError, setWipeError] = useState<string | null>(null);
  const [wipeSuccess, setWipeSuccess] = useState(false);

  // Restricted Access check
  const isSuperAdmin = user?.role === UserRole.SUPERADMIN;
  const isGerente = user?.role === UserRole.GERENTE;
  const hasAccess = isSuperAdmin || isGerente;

  // Filtered Audit Logs
  const filteredLogs = useMemo(() => {
    return auditLogs.filter((log) => {
      const matchSearch =
        searchTerm === '' ||
        log.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
        log.userDisplayName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        log.userEmail.toLowerCase().includes(searchTerm.toLowerCase()) ||
        log.entityType.toLowerCase().includes(searchTerm.toLowerCase());

      const matchAction = actionFilter === 'ALL' || log.action === actionFilter;
      return matchSearch && matchAction;
    });
  }, [auditLogs, searchTerm, actionFilter]);

  // Statistics
  const stats = useMemo(() => {
    const totalLogs = auditLogs.length;
    const logins = auditLogs.filter((l) => l.action === 'LOGIN').length;
    const stockUpdates = auditLogs.filter((l) => l.action === 'MIN_STOCK_UPDATE').length;
    const criticalOps = auditLogs.filter(
      (l) => l.action === 'PLATFORM_RESET' || l.action === 'LOCATION_DELETE' || l.action === 'BACKUP_RESTORE'
    ).length;
    const activeSessions = sessionHistory.filter((s) =>
      s.status ? s.status === 'ACTIVA' : s.isActive
    ).length;
    const suspendedSessions = sessionHistory.filter((s) => s.status === 'SUSPENDIDA').length;

    return { totalLogs, logins, stockUpdates, criticalOps, activeSessions, suspendedSessions };
  }, [auditLogs, sessionHistory]);

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

  const getActionBadgeClass = (action: AuditActionType) => {
    switch (action) {
      case 'PLATFORM_RESET':
        return 'bg-red-950/80 text-red-300 border-red-700 font-bold animate-pulse';
      case 'MIN_STOCK_UPDATE':
        return 'bg-amber-950/70 text-amber-300 border-amber-600';
      case 'BACKUP_RESTORE':
        return 'bg-indigo-950/70 text-indigo-300 border-indigo-600';
      case 'BACKUP_EXPORT':
        return 'bg-blue-950/70 text-blue-300 border-blue-600';
      case 'LOGIN':
        return 'bg-emerald-950/70 text-emerald-300 border-emerald-600';
      case 'LOGOUT':
        return 'bg-slate-800 text-slate-300 border-slate-700';
      case 'LOCATION_DELETE':
        return 'bg-rose-950/70 text-rose-300 border-rose-600';
      case 'INVENTORY_DISCARD_CREATE':
        return 'bg-amber-950/80 text-amber-300 border-amber-600';
      case 'INVENTORY_DISCARD_AUTHORIZE':
        return 'bg-emerald-950/80 text-emerald-300 border-emerald-600 font-bold';
      case 'INVENTORY_DISCARD_REJECT':
        return 'bg-rose-950/80 text-rose-300 border-rose-600';
      default:
        return 'bg-slate-800 text-slate-300 border-slate-700';
    }
  };

  if (!hasAccess) {
    return (
      <div className="p-8 text-center bg-slate-900 border border-slate-800 rounded-xl max-w-2xl mx-auto my-12">
        <Lock className="w-16 h-16 text-amber-500 mx-auto mb-4" />
        <h2 className="text-xl font-bold text-white mb-2">Acceso Restringido por Gobernanza RBAC</h2>
        <p className="text-slate-400 text-sm">
          El módulo de <strong>Histórico de Acciones y Sesiones</strong> está reservado exclusivamente para usuarios con rol de <strong>SUPERADMIN</strong> o <strong>GERENTE</strong>.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-slate-900 text-sky-400 border border-slate-800 rounded-xl shadow-xs">
              <History className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
                Histórico de Auditoría & Trazabilidad
              </h1>
              <p className="text-xs text-slate-600">
                Gobernanza corporativa, registro cronológico inmutable y control de sesiones activas (VET America/Caracas).
              </p>
            </div>
          </div>
        </div>

        {/* Sub-tab navigation */}
        <div className="flex items-center gap-1.5 bg-slate-900 p-1.5 rounded-xl border border-slate-800">
          <button
            onClick={() => setActiveSubTab('LOGS')}
            className={`px-3.5 py-2 text-xs font-semibold rounded-lg transition-all min-h-[44px] flex items-center gap-2 ${
              activeSubTab === 'LOGS'
                ? 'bg-sky-600 text-white shadow-md'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <History className="w-4 h-4" />
            Registro de Acciones ({auditLogs.length})
          </button>
          <button
            onClick={() => setActiveSubTab('SESSIONS')}
            className={`px-3.5 py-2 text-xs font-semibold rounded-lg transition-all min-h-[44px] flex items-center gap-2 ${
              activeSubTab === 'SESSIONS'
                ? 'bg-sky-600 text-white shadow-md'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Users className="w-4 h-4" />
            Sesiones de Usuarios ({sessionHistory.length})
          </button>
          <button
            onClick={() => setActiveSubTab('BACKUPS')}
            className={`px-3.5 py-2 text-xs font-semibold rounded-lg transition-all min-h-[44px] flex items-center gap-2 ${
              activeSubTab === 'BACKUPS'
                ? 'bg-sky-600 text-white shadow-md'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Database className="w-4 h-4" />
            Respaldos Cifrados
          </button>
        </div>
      </div>

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-slate-900/90 border border-slate-800 p-4 rounded-xl">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-xs uppercase tracking-wider font-semibold">Total Eventos</span>
            <History className="w-4 h-4 text-sky-400" />
          </div>
          <p className="text-2xl font-bold text-white tabular-nums">{stats.totalLogs}</p>
          <span className="text-[11px] text-slate-500">Registros auditados</span>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 p-4 rounded-xl">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-xs uppercase tracking-wider font-semibold">Sesiones Activas</span>
            <UserCheck className="w-4 h-4 text-emerald-400" />
          </div>
          <p className="text-2xl font-bold text-emerald-400 tabular-nums">{stats.activeSessions}</p>
          <span className="text-[11px] text-slate-500">
            {stats.suspendedSessions > 0
              ? `${stats.suspendedSessions} en pausa · ${sessionHistory.length} historial`
              : `${sessionHistory.length} sesiones registradas`}
          </span>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 p-4 rounded-xl">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-xs uppercase tracking-wider font-semibold">Alarmas Stock Mín.</span>
            <ArrowUpDown className="w-4 h-4 text-amber-400" />
          </div>
          <p className="text-2xl font-bold text-amber-400 tabular-nums">{stats.stockUpdates}</p>
          <span className="text-[11px] text-slate-500">Ajustes de umbrales</span>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 p-4 rounded-xl">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-xs uppercase tracking-wider font-semibold">Operaciones Críticas</span>
            <ShieldAlert className="w-4 h-4 text-rose-400" />
          </div>
          <p className="text-2xl font-bold text-rose-400 tabular-nums">{stats.criticalOps}</p>
          <span className="text-[11px] text-slate-500">Respaldos / Reinicios</span>
        </div>
      </div>

      {/* Main Tab Content */}
      {activeSubTab === 'LOGS' && (
        <div className="space-y-4">
          {/* Search and Filters */}
          <div className="flex flex-col sm:flex-row gap-3 bg-slate-900/80 p-3 rounded-xl border border-slate-800">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                placeholder="Buscar por descripción, usuario, email o entidad..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-sky-500 min-h-[44px]"
              />
            </div>
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-slate-500 shrink-0" />
              <select
                value={actionFilter}
                onChange={(e) => setActionFilter(e.target.value)}
                className="bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-300 py-2 px-3 focus:outline-none focus:border-sky-500 min-h-[44px]"
              >
                <option value="ALL">Todas las Acciones</option>
                <option value="LOGIN">Inicio de Sesión (LOGIN)</option>
                <option value="LOGOUT">Cierre de Sesión (LOGOUT)</option>
                <option value="MIN_STOCK_UPDATE">Ajuste de Stock Mínimo</option>
                <option value="INVENTORY_DISCARD_CREATE">Pre-Registro Descarga (Analista)</option>
                <option value="INVENTORY_DISCARD_AUTHORIZE">Descarga Autorizada (Gerencia)</option>
                <option value="INVENTORY_DISCARD_REJECT">Descarga Rechazada (Gerencia)</option>
                <option value="PRODUCT_CREATE">Alta de Producto</option>
                <option value="LOCATION_CREATE">Creación de Sede/Depósito</option>
                <option value="LOCATION_DELETE">Eliminación Autorizada</option>
                <option value="STOCK_TRANSFER">Transferencia entre Sedes</option>
                <option value="PURCHASE_ORDER_CREATE">Orden de Reposición</option>
                <option value="BACKUP_EXPORT">Exportación Respaldo Cifrado</option>
                <option value="BACKUP_RESTORE">Restauración de Respaldo</option>
                <option value="PLATFORM_RESET">Reinicio de Fábrica</option>
              </select>
            </div>
          </div>

          {/* Table */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-xl overflow-hidden shadow-lg">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-950/90 border-b border-slate-800 text-slate-400 uppercase tracking-wider font-semibold">
                    <th className="py-3 px-4">Fecha / Hora (VET)</th>
                    <th className="py-3 px-4">Usuario Operador</th>
                    <th className="py-3 px-4">Acción</th>
                    <th className="py-3 px-4">Entidad</th>
                    <th className="py-3 px-4">Descripción de la Operación</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {filteredLogs.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-12 text-center text-slate-500">
                        <History className="w-8 h-8 mx-auto mb-2 opacity-40" />
                        No se encontraron registros de auditoría que coincidan con la búsqueda.
                      </td>
                    </tr>
                  ) : (
                    filteredLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-slate-800/40 transition-colors">
                        <td className="py-3 px-4 font-mono text-slate-300 whitespace-nowrap">
                          {log.timestampVet}
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-semibold text-white">{log.userDisplayName}</div>
                          <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
                            <span>{log.userEmail}</span>
                            <span className="px-1.5 py-0.5 rounded text-[10px] bg-slate-800 text-sky-400 font-mono">
                              {log.userRole}
                            </span>
                          </div>
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          <span
                            className={`px-2.5 py-1 rounded-md text-[11px] border ${getActionBadgeClass(
                              log.action
                            )}`}
                          >
                            {log.action}
                          </span>
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap font-mono text-slate-400">
                          {log.entityType}
                        </td>
                        <td className="py-3 px-4 text-slate-200">
                          <div>{log.description}</div>
                          {log.details && (
                            <div className="mt-1 text-[11px] font-mono text-slate-400 bg-slate-950/60 p-1.5 rounded border border-slate-800/60 max-w-xl overflow-x-auto">
                              {JSON.stringify(log.details)}
                            </div>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Sessions Sub-Tab */}
      {activeSubTab === 'SESSIONS' && (
        <div className="space-y-4">
          <div className="bg-slate-900/90 border border-slate-800 rounded-xl overflow-hidden shadow-lg">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <UserCheck className="w-5 h-5 text-emerald-400" />
                  Historial de Conexiones & Protocolo de Continuidad (30m)
                </h3>
                <p className="text-xs text-slate-400">
                  Registro cronológico de entradas, latido activo (Heartbeat 60s), suspensión por inactividad (&gt; 30m) y salidas selladas en hora oficial VET.
                </p>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-950/90 border-b border-slate-800 text-slate-400 uppercase tracking-wider font-semibold">
                    <th className="py-3 px-4">Usuario</th>
                    <th className="py-3 px-4">Rol</th>
                    <th className="py-3 px-4">Entrada (VET)</th>
                    <th className="py-3 px-4">Último Latido (VET)</th>
                    <th className="py-3 px-4">Salida / Permanencia</th>
                    <th className="py-3 px-4">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {sessionHistory.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-slate-500">
                        <Users className="w-8 h-8 mx-auto mb-2 opacity-40" />
                        No hay sesiones registradas en el historial local.
                      </td>
                    </tr>
                  ) : (
                    sessionHistory.map((s) => {
                      const effectiveStatus = s.status
                        ? s.status
                        : s.isActive
                          ? 'ACTIVA'
                          : 'FINALIZADA';

                      return (
                        <tr key={s.id} className="hover:bg-slate-800/40 transition-colors">
                          <td className="py-3 px-4">
                            <div className="font-semibold text-white">{s.userDisplayName}</div>
                            <div className="text-[11px] text-slate-400">{s.userEmail}</div>
                          </td>
                          <td className="py-3 px-4">
                            <span className="px-2 py-0.5 rounded text-[11px] bg-slate-800 text-sky-400 font-mono">
                              {s.userRole}
                            </span>
                          </td>
                          <td className="py-3 px-4 font-mono text-slate-300 whitespace-nowrap">
                            {s.loginAtVet}
                          </td>
                          <td className="py-3 px-4 font-mono text-slate-300 whitespace-nowrap">
                            {s.lastHeartbeatVet || s.loginAtVet}
                          </td>
                          <td className="py-3 px-4 font-mono text-slate-400 whitespace-nowrap">
                            {effectiveStatus === 'FINALIZADA' ? (
                              <div>
                                <div className="text-slate-300">{s.logoutAtVet || s.lastHeartbeatVet || '—'}</div>
                                {s.durationMinutes !== undefined && (
                                  <div className="text-[10px] text-slate-400">
                                    Permanencia: {s.durationMinutes} min
                                  </div>
                                )}
                              </div>
                            ) : (
                              <span className="text-slate-500">En curso</span>
                            )}
                          </td>
                          <td className="py-3 px-4 whitespace-nowrap">
                            {effectiveStatus === 'ACTIVA' ? (
                              <span className="px-2.5 py-1 rounded-full text-[10px] bg-emerald-950/80 text-emerald-400 border border-emerald-600 font-semibold inline-flex items-center gap-1.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping"></span>
                                Sesión Activa
                              </span>
                            ) : effectiveStatus === 'SUSPENDIDA' ? (
                              <span className="px-2.5 py-1 rounded-full text-[10px] bg-amber-950/80 text-amber-300 border border-amber-600 font-semibold inline-flex items-center gap-1.5">
                                <Clock className="w-3 h-3 text-amber-400" />
                                En Pausa / Inactiva &gt; 30m
                              </span>
                            ) : (
                              <span className="px-2.5 py-1 rounded-full text-[10px] bg-slate-800 text-slate-300 border border-slate-700 inline-flex items-center gap-1">
                                Finalizada
                                {s.durationMinutes !== undefined ? ` · ${s.durationMinutes}m` : ''}
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Backups Sub-Tab */}
      {activeSubTab === 'BACKUPS' && (
        <div className="space-y-6">
          <BackupRestoreManager />
        </div>
      )}

      {/* Superadmin Factory Wipe Security Zone */}
      {isSuperAdmin && (
        <div className="mt-8 border border-red-800/80 bg-slate-900 p-5 rounded-2xl shadow-lg">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="p-2.5 bg-red-950/90 border border-red-700 text-red-400 rounded-xl shrink-0 mt-0.5">
                <ShieldAlert className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-red-300">
                  Zona de Alta Seguridad — Reinicio de Fábrica de la Plataforma
                </h3>
                <p className="text-xs text-slate-300 mt-0.5 max-w-2xl">
                  Permite borrar de manera absoluta la base de datos operativa (productos, existencias, órdenes de compra y movimientos) dejando la plataforma en estado virgen para inicializar datos desde cero o restaurar un respaldo cifrado.
                </p>
                <div className="mt-2 text-[11px] text-amber-300 font-mono flex items-center gap-2">
                  <Lock className="w-3.5 h-3.5" />
                  <span>Requiere Código de Autorización de Superadministrador (PIN) y frase de confirmación.</span>
                </div>
              </div>
            </div>

            <button
              onClick={() => {
                setWipeError(null);
                setWipeSuccess(false);
                setSuperAdminPinInput('');
                setConfirmPhraseInput('');
                setIsWipeModalOpen(true);
              }}
              className="px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white font-bold text-xs rounded-xl shadow-lg shadow-red-900/40 transition-all flex items-center gap-2 shrink-0 min-h-[44px]"
            >
              <RotateCcw className="w-4 h-4" />
              Reiniciar Plataforma a Estado Virgen
            </button>
          </div>
        </div>
      )}

      {/* Wipe Confirmation Modal */}
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

export default AuditHistoryView;
