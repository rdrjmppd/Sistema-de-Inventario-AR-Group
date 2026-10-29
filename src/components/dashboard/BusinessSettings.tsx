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
  KeyRound,
  QrCode,
  RefreshCw,
  RotateCcw,
  Scale,
  Sparkles,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useInventory } from '../../context/InventoryContext';
import { useUIConfig } from '../../context/UIConfigContext';
import { useOperationsBrm } from '../../context/OperationsBrmContext';
import { ScaleBarcodeMode, UserRole } from '../../types';
import { DEFAULT_COMPANY_PROFILE } from '../../lib/excel-exporter';
import {
  buildEphemeralApprovalQrPayload,
  buildTotpOtpAuthUri,
  generateTotpCode,
  getTotpRemainingSeconds,
} from '../../lib/totp-governance';

export const BusinessSettings: React.FC = () => {
  const { users, createUser, toggleUserActive } = useAuth();
  const { locations, setIsAddLocationModalOpen, setLocationToDelete } = useInventory();
  const { config, updateCompanyProfile, resetCompanyProfileToDefault } = useUIConfig();
  const {
    totpConfig,
    updateTotpConfig,
    regenerateTotpSecret,
    defaultScaleMode,
    setDefaultScaleMode,
  } = useOperationsBrm();

  const [totpTickMs, setTotpTickMs] = useState<number>(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setTotpTickMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const liveTotpCode = generateTotpCode(totpConfig.secretBase32, totpTickMs, 30);
  const liveTotpRemSec = getTotpRemainingSeconds(totpTickMs, 30);
  const otpAuthUri = buildTotpOtpAuthUri(totpConfig);
  const ephemeralQrToken = buildEphemeralApprovalQrPayload(totpConfig.secretBase32, totpTickMs);

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
  const [pin, setPin] = useState('');

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
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white border border-amber-400/50 p-1 flex items-center justify-center shrink-0 overflow-hidden shadow-sm">
              <img
                src={company.logoBase64 || "/assets/branding/hiper_abasto_polar_logo.jpg"}
                alt="Hiper Abasto Polar"
                className="w-full h-full object-contain"
              />
            </div>
            <div>
              <h2 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-slate-900">
                Datos Fiscales &amp; Branding Institucional — Hiper Abasto Polar
              </h2>
              <p className="text-xs text-slate-500">
                Configure la Razón Social, RIF y Datos Fiscales para el membrete y marca de agua en reportes .XLSX y PDF.
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

      {/* Gobernanza Gerencial TOTP Offline (RFC 6238) + Estándar Balanzas EAN-13 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="bg-slate-900 text-white border border-slate-800 rounded-xl p-5 shadow-md space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 text-[11px] font-bold mb-1.5">
                <KeyRound className="w-3.5 h-3.5" />
                RFC 6238 · Token Dinámico Offline (30s)
              </div>
              <h2 className="text-sm font-bold">
                Gobernanza Gerencial TOTP (Google Authenticator &amp; QR Efímero)
              </h2>
              <p className="text-xs text-slate-300 mt-0.5">
                Protege sincera­ciones fuera de tolerancia, descartes de merma, lotes vencidos y anulaciones SENIAT sin depender de internet.
              </p>
            </div>
            <button
              type="button"
              onClick={() => regenerateTotpSecret()}
              className="min-h-[44px] px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold inline-flex items-center gap-1.5 transition cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5 text-amber-400" />
              Rotar Semilla
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-950/70 border border-slate-800 rounded-xl p-3.5">
            <div>
              <div className="text-[11px] text-slate-400 uppercase font-bold">
                Token TOTP Vigente (6 dígitos)
              </div>
              <div className="text-2xl font-mono font-extrabold tracking-widest text-emerald-400 mt-1 tabular-nums">
                {liveTotpCode.slice(0, 3)} {liveTotpCode.slice(3)}
              </div>
              <div className="text-[11px] text-slate-400 mt-1 tabular-nums">
                Expira en <strong className="text-amber-300">{liveTotpRemSec}s</strong> · Ventana ±30s
              </div>
            </div>
            <div>
              <div className="text-[11px] text-slate-400 uppercase font-bold">
                Semilla Base32 (Google Auth)
              </div>
              <div className="text-xs font-mono font-bold text-sky-300 break-all mt-1">
                {totpConfig.secretBase32}
              </div>
              <div className="text-[10px] font-mono text-slate-400 truncate mt-1" title={ephemeralQrToken}>
                <QrCode className="w-3 h-3 inline mr-1 text-amber-400" />
                {ephemeralQrToken}
              </div>
            </div>
          </div>

          <div className="text-[11px] font-mono bg-slate-800/80 border border-slate-700 rounded-lg p-2.5 text-slate-300 break-all">
            {otpAuthUri}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-1 text-xs">
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={totpConfig.enabled}
                onChange={(e) => updateTotpConfig({ enabled: e.target.checked })}
                className="w-4 h-4 rounded accent-emerald-500"
              />
              <span className="font-semibold">Activar Validación TOTP 6 Dígitos</span>
            </label>

            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={totpConfig.allowPinFallback}
                onChange={(e) => updateTotpConfig({ allowPinFallback: e.target.checked })}
                className="w-4 h-4 rounded accent-amber-500"
              />
              <span className="text-slate-300">
                Permitir PIN Contingencia (`203040` / `102030`)
              </span>
            </label>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-sky-100 text-sky-800 text-[11px] font-bold mb-1.5">
                <Scale className="w-3.5 h-3.5" />
                Balanzas Electrónicas Carnicería, Charcutería &amp; Fruver
              </div>
              <h2 className="text-sm font-bold text-slate-900">
                Estándar Predeterminado de Etiquetas Peso-Precio EAN-13
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Compatible con Bizerba, Toledo, Systel y Aclas. Ambos prefijos (`20` Peso y `21` Importe) se decodifican automáticamente en caja y conteo físico.
              </p>
            </div>
          </div>

          <div className="space-y-2.5 text-xs">
            <label
              className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition ${
                defaultScaleMode === 'WEIGHT_GRAMS_20'
                  ? 'bg-sky-50 border-sky-400 text-slate-900'
                  : 'border-slate-200 hover:bg-slate-50 text-slate-700'
              }`}
            >
              <input
                type="radio"
                name="scaleMode"
                checked={defaultScaleMode === 'WEIGHT_GRAMS_20'}
                onChange={() => setDefaultScaleMode('WEIGHT_GRAMS_20' as ScaleBarcodeMode)}
                className="mt-1 accent-sky-600"
              />
              <div>
                <div className="font-bold">
                  Prefijo `20` — Peso Exacto en Gramos (`20 + PLU 5d + Gramos 5d + Checksum`)
                </div>
                <div className="text-slate-500 mt-0.5">
                  Recomendado para inventario exacto por kilogramo en Carnicería y Fruver (ej. `01250` = `1.250 kg`).
                </div>
              </div>
            </label>

            <label
              className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition ${
                defaultScaleMode === 'PRICE_CENTS_21'
                  ? 'bg-sky-50 border-sky-400 text-slate-900'
                  : 'border-slate-200 hover:bg-slate-50 text-slate-700'
              }`}
            >
              <input
                type="radio"
                name="scaleMode"
                checked={defaultScaleMode === 'PRICE_CENTS_21'}
                onChange={() => setDefaultScaleMode('PRICE_CENTS_21' as ScaleBarcodeMode)}
                className="mt-1 accent-sky-600"
              />
              <div>
                <div className="font-bold">
                  Prefijo `21` — Importe Total en Centavos (`21 + PLU 5d + Centavos 5d + Checksum`)
                </div>
                <div className="text-slate-500 mt-0.5">
                  Calcula el peso inverso exacto con `Decimal.js` dividiendo el importe de etiqueta entre el PVP vigente del SKU.
                </div>
              </div>
            </label>
          </div>
        </div>
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
              <label className="block font-semibold text-slate-700 mb-1">PIN Acceso *</label>
              <input
                type="password"
                autoComplete="off"
                inputMode="numeric"
                maxLength={10}
                required
                placeholder="••••••"
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
