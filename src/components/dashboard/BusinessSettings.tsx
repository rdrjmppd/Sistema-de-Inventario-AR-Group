import React, { useState, useEffect } from 'react';
import {
  Settings,
  Shield,
  UserPlus,
  Power,
  Building2,
  Warehouse,
  Plus,
  CheckCircle2,
  RotateCcw,
  Sparkles,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useInventory } from '../../context/InventoryContext';
import { useUIConfig } from '../../context/UIConfigContext';
import { UserRole } from '../../types';
import { DEFAULT_COMPANY_PROFILE } from '../../lib/excel-exporter';

export const BusinessSettings: React.FC = () => {
  const { users, createUser, toggleUserActive } = useAuth();
  const { locations, setIsAddLocationModalOpen, setLocationToDelete } = useInventory();
  const { config, updateCompanyProfile, resetCompanyProfileToDefault } = useUIConfig();

  const company = config.companyProfile || DEFAULT_COMPANY_PROFILE;

  const [razonSocial, setRazonSocial] = useState(company.razonSocial);
  const [rif, setRif] = useState(company.rif);
  const [direccionFiscal, setDireccionFiscal] = useState(company.direccionFiscal);
  const [telefono, setTelefono] = useState(company.telefono);
  const [companyEmail, setCompanyEmail] = useState(company.email);
  const [codigoSada, setCodigoSada] = useState(company.codigoSada);
  const [representanteLegal, setRepresentanteLegal] = useState(company.representanteLegal);
  const [actividadEconomica, setActividadEconomica] = useState(company.actividadEconomica);
  const [companySavedMsg, setCompanySavedMsg] = useState<string | null>(null);

  useEffect(() => {
    setRazonSocial(company.razonSocial);
    setRif(company.rif);
    setDireccionFiscal(company.direccionFiscal);
    setTelefono(company.telefono);
    setCompanyEmail(company.email);
    setCodigoSada(company.codigoSada);
    setRepresentanteLegal(company.representanteLegal);
    setActividadEconomica(company.actividadEconomica);
  }, [company]);

  const handleSaveCompany = (e: React.FormEvent) => {
    e.preventDefault();
    updateCompanyProfile({
      razonSocial,
      rif,
      direccionFiscal,
      telefono,
      email: companyEmail,
      codigoSada,
      representanteLegal,
      actividadEconomica,
    });
    setCompanySavedMsg(
      'Datos fiscales de la empresa guardados y sincronizados con el Panel Principal y todas las Tablas Formales Excel (.xlsx) y Actas PDF.'
    );
    setTimeout(() => setCompanySavedMsg(null), 4000);
  };

  const handleLoadSampleCompany = () => {
    setRazonSocial('DISTRIBUIDORA DE ALIMENTOS Y VÍVERES EL LLANO, C.A.');
    setRif('J-41289540-8');
    setDireccionFiscal(
      'Av. Intercomunal Turmero-Maracay, Zona Industrial San Vicente II, Galpón 14, Edo. Aragua, Venezuela'
    );
    setTelefono('+58 (243) 554-8900 / +58 (414) 345-9910');
    setCompanyEmail('finanzas@distribuidoraelllano.com.ve');
    setCodigoSada('SADA-ARA-90841');
    setRepresentanteLegal('Lic. Roberto Díaz — Dirección General');
    setActividadEconomica('Distribución Mayorista y Retail de Alimentos Masivos y Refrigerados');
  };

  const handleResetGenericCompany = () => {
    resetCompanyProfileToDefault();
    setCompanySavedMsg(
      'Se restauraron los datos genéricos por defecto (NOMBRE DE EMPRESA, RIF EMPRESA, DIRECCIÓN EMPRESA).'
    );
    setTimeout(() => setCompanySavedMsg(null), 4000);
  };

  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [role, setRole] = useState<UserRole>(UserRole.ANALISTA);
  const [pin, setPin] = useState('506070');

  const handleAddUser = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !displayName.trim()) return;
    createUser({
      email: email.trim().toLowerCase(),
      displayName: displayName.trim(),
      role,
      pin: pin.trim() || '123456',
      locationAccess: locations.map((l) => l.id),
      active: true,
    });
    setEmail('');
    setDisplayName('');
  };

  return (
    <div className="space-y-5">
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Settings className="w-5 h-5 text-sky-600" />
            <h1 className="text-base font-bold text-slate-900">
              Datos de la Empresa, Gobernanza RBAC, Sedes y Depósitos Autorizados
            </h1>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Configure la Razón Social, RIF y Dirección Fiscal de la empresa para el panel principal
            y las tablas ejecutivas Excel (.xlsx) / PDF, y administre operadores y Sedes/Depósitos.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setIsAddLocationModalOpen(true)}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold transition shadow-xs whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Plus className="w-4 h-4 shrink-0" />
          <span>Añadir Sede o Depósito</span>
        </button>
      </div>

      {/* Company Fiscal Profile Form Section */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-slate-900 text-sky-400">
              <Building2 className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-slate-900">
                Datos Fiscales de la Empresa (Membrete Oficial en Panel Principal y Documentos .XLSX / .PDF)
              </h2>
              <p className="text-xs text-slate-500">
                Mientras no se ingresen datos personalizados, el sistema rellena automáticamente con
                los marcadores genéricos (NOMBRE DE EMPRESA, RIF EMPRESA, DIRECCIÓN EMPRESA).
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleLoadSampleCompany}
              className="min-h-[36px] px-3 py-1.5 rounded-lg bg-sky-50 hover:bg-sky-100 border border-sky-200 text-sky-900 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5 text-sky-600" />
              <span>Cargar Empresa Ejemplo</span>
            </button>
            <button
              type="button"
              onClick={handleResetGenericCompany}
              className="min-h-[36px] px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-700 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Restaurar Genérico</span>
            </button>
          </div>
        </div>

        {companySavedMsg && (
          <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-950 text-xs font-semibold flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{companySavedMsg}</span>
          </div>
        )}

        <form onSubmit={handleSaveCompany} className="space-y-4 text-xs">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
            <div className="md:col-span-2">
              <label className="block font-bold text-slate-700 mb-1">
                Razón Social / Nombre de la Empresa *
              </label>
              <input
                type="text"
                value={razonSocial}
                onChange={(e) => setRazonSocial(e.target.value)}
                placeholder="NOMBRE DE EMPRESA, C.A."
                className="w-full px-3 py-2 border border-slate-300 rounded-lg font-bold text-slate-900"
              />
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">
                RIF Fiscal (SENIAT) *
              </label>
              <input
                type="text"
                value={rif}
                onChange={(e) => setRif(e.target.value)}
                placeholder="J-00000000-0 (RIF EMPRESA)"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono font-bold uppercase text-slate-900"
              />
            </div>
          </div>

          <div>
            <label className="block font-bold text-slate-700 mb-1">
              Dirección Fiscal de la Empresa *
            </label>
            <input
              type="text"
              value={direccionFiscal}
              onChange={(e) => setDireccionFiscal(e.target.value)}
              placeholder="DIRECCIÓN FISCAL DE LA EMPRESA, CIUDAD, VENEZUELA"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
            <div>
              <label className="block font-bold text-slate-700 mb-1">Teléfono Corporativo</label>
              <input
                type="text"
                value={telefono}
                onChange={(e) => setTelefono(e.target.value)}
                placeholder="+58 (000) 000-0000"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono text-slate-900"
              />
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1">Correo Electrónico Fiscal</label>
              <input
                type="email"
                value={companyEmail}
                onChange={(e) => setCompanyEmail(e.target.value)}
                placeholder="administracion@empresa.com.ve"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900"
              />
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1">Código SADA / SUNAGRO</label>
              <input
                type="text"
                value={codigoSada}
                onChange={(e) => setCodigoSada(e.target.value)}
                placeholder="SADA-000000"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono uppercase text-slate-900"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block font-bold text-slate-700 mb-1">
                Representante Legal / Gerencia Responsable
              </label>
              <input
                type="text"
                value={representanteLegal}
                onChange={(e) => setRepresentanteLegal(e.target.value)}
                placeholder="GERENCIA GENERAL / ADMINISTRACIÓN"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900"
              />
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1">
                Giro / Actividad Económica
              </label>
              <input
                type="text"
                value={actividadEconomica}
                onChange={(e) => setActividadEconomica(e.target.value)}
                placeholder="DISTRIBUCIÓN Y COMERCIALIZACIÓN DE ALIMENTOS"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900"
              />
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="submit"
              className="min-h-[40px] px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold flex items-center gap-1.5 transition shadow-xs cursor-pointer"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Guardar y Aplicar Membrete de Empresa</span>
            </button>
          </div>
        </form>
      </div>


      {/* Sedes y Depósitos Directory */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700">
            Directorio Maestro de Sedes y Depósitos ({locations.length} Activos)
          </h2>
          <button
            type="button"
            onClick={() => setIsAddLocationModalOpen(true)}
            className="text-xs font-bold text-sky-600 hover:text-sky-500 flex items-center gap-1 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Nueva Sede / Depósito</span>
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-900 text-slate-200 text-[11px] font-mono uppercase">
                <th className="py-2.5 px-3">Tipo</th>
                <th className="py-2.5 px-3">Código</th>
                <th className="py-2.5 px-3">Nombre de Sede o Depósito</th>
                <th className="py-2.5 px-3">Ciudad / Ubicación</th>
                <th className="py-2.5 px-3">Responsable</th>
                <th className="py-2.5 px-3 text-center">Estado</th>
                <th className="py-2.5 px-3 text-right">Baja Autorizada</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-xs">
              {locations.map((loc) => {
                const isDepot = loc.type === 'DEPOSITO' || loc.type === 'CEDIS';
                return (
                  <tr key={loc.id} className="hover:bg-slate-50">
                    <td className="py-2.5 px-3">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded font-mono text-[10px] font-bold ${
                          isDepot
                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                            : 'bg-sky-100 text-sky-800 border border-sky-200'
                        }`}
                      >
                        {isDepot ? (
                          <Warehouse className="w-3 h-3" />
                        ) : (
                          <Building2 className="w-3 h-3" />
                        )}
                        {isDepot ? 'DEPÓSITO' : 'SEDE'}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 font-mono font-bold text-slate-900">{loc.code}</td>
                    <td className="py-2.5 px-3 font-semibold text-slate-900">{loc.name}</td>
                    <td className="py-2.5 px-3 text-slate-600">{loc.city}</td>
                    <td className="py-2.5 px-3 text-slate-600">{loc.manager}</td>
                    <td className="py-2.5 px-3 text-center">
                      <span className="px-2 py-0.5 rounded font-mono text-[10px] font-bold bg-emerald-100 text-emerald-800">
                        ACTIVO
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      {locations.length > 1 ? (
                        <button
                          type="button"
                          onClick={() => setLocationToDelete(loc)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 font-semibold text-[11px] cursor-pointer"
                        >
                          <span>Eliminar con PIN</span>
                        </button>
                      ) : (
                        <span className="text-[10px] font-mono text-slate-400">PRINCIPAL</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* RBAC Users Management */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <form
          onSubmit={handleAddUser}
          className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs space-y-3 text-xs"
        >
          <div className="flex items-center gap-2 font-bold uppercase tracking-wider text-slate-800 border-b border-slate-100 pb-2">
            <UserPlus className="w-4 h-4 text-sky-600" />
            <span>Aprovisionar Nuevo Operador</span>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Nombre y Cargo *</label>
            <input
              type="text"
              required
              placeholder="Ej. Lic. Luisana Pérez (Auditora)"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full px-2.5 py-2 border border-slate-300 rounded-lg"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              Correo Corporativo *
            </label>
            <input
              type="email"
              required
              placeholder="lperez@chrystal.com.ve"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-2.5 py-2 border border-slate-300 rounded-lg"
            />
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Rol Jerárquico</label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as UserRole)}
                className="w-full px-2 py-2 border border-slate-300 rounded-lg bg-white font-mono"
              >
                <option value={UserRole.GERENTE}>GERENTE</option>
                <option value={UserRole.ANALISTA}>ANALISTA</option>
                <option value={UserRole.OBSERVADOR}>OBSERVADOR</option>
              </select>
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">PIN Acceso</label>
              <input
                type="text"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                className="w-full px-2.5 py-2 border border-slate-300 rounded-lg font-mono font-bold"
              />
            </div>
          </div>

          <button
            type="submit"
            className="w-full py-2.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-semibold transition"
          >
            Habilitar Credencial RBAC
          </button>
        </form>

        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
              Matriz de Usuarios con Acceso al Ecosistema ({users.length})
            </h3>
            <Shield className="w-4 h-4 text-amber-500" />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-900 text-slate-200 text-[11px] font-mono uppercase">
                  <th className="py-2.5 px-3">Usuario</th>
                  <th className="py-2.5 px-3">Correo</th>
                  <th className="py-2.5 px-3">Rol RBAC</th>
                  <th className="py-2.5 px-3 text-center">Estado</th>
                  <th className="py-2.5 px-3 text-right">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-xs">
                {users.map((u) => {
                  const isSuper = u.role === UserRole.SUPERADMIN;
                  return (
                    <tr key={u.uid} className="hover:bg-slate-50">
                      <td className="py-2.5 px-3 font-semibold text-slate-900">
                        {u.displayName}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-slate-600">{u.email}</td>
                      <td className="py-2.5 px-3">
                        <span className="px-2 py-0.5 rounded font-mono text-[10px] font-bold bg-slate-900 text-amber-300">
                          {u.role}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <span
                          className={`px-2 py-0.5 rounded font-mono text-[10px] font-bold ${
                            u.active
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-rose-100 text-rose-800'
                          }`}
                        >
                          {u.active ? 'ACTIVO' : 'SUSPENDIDO'}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        {isSuper ? (
                          <span className="text-[10px] font-mono text-slate-400">
                            INMUTABLE
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => toggleUserActive(u.uid)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-slate-300 hover:bg-slate-100 text-slate-700 font-medium"
                          >
                            <Power className="w-3 h-3" />
                            {u.active ? 'Suspender' : 'Reactivar'}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BusinessSettings;
