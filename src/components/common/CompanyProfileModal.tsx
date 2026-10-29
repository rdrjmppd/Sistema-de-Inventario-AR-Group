import React, { useState, useEffect } from 'react';
import {
  Building2,
  X,
  CheckCircle2,
  RotateCcw,
  FileSpreadsheet,
  Sparkles,
  ShieldCheck,
} from 'lucide-react';
import { useUIConfig } from '../../context/UIConfigContext';
import { DEFAULT_COMPANY_PROFILE } from '../../lib/excel-exporter';

export const CompanyProfileModal: React.FC = () => {
  const {
    config,
    isCompanyModalOpen,
    setIsCompanyModalOpen,
    updateCompanyProfile,
    resetCompanyProfileToDefault,
  } = useUIConfig();

  const company = config.companyProfile || DEFAULT_COMPANY_PROFILE;

  const [razonSocial, setRazonSocial] = useState(company.razonSocial);
  const [rif, setRif] = useState(company.rif);
  const [direccionFiscal, setDireccionFiscal] = useState(company.direccionFiscal);
  const [telefono, setTelefono] = useState(company.telefono);
  const [email, setEmail] = useState(company.email);
  const [codigoSada, setCodigoSada] = useState(company.codigoSada);
  const [representanteLegal, setRepresentanteLegal] = useState(company.representanteLegal);
  const [actividadEconomica, setActividadEconomica] = useState(company.actividadEconomica);
  const [isSpecialTaxpayer, setIsSpecialTaxpayer] = useState(
    company.isSpecialTaxpayer ?? true
  );
  const [isIvaRetentionAgent, setIsIvaRetentionAgent] = useState(
    company.isIvaRetentionAgent ?? true
  );
  const [isIslrRetentionAgent, setIsIslrRetentionAgent] = useState(
    company.isIslrRetentionAgent ?? true
  );
  const [defaultIvaRetentionPercent, setDefaultIvaRetentionPercent] = useState<75 | 100>(
    company.defaultIvaRetentionPercent ?? 75
  );
  const [utValueVes, setUtValueVes] = useState(String(company.utValueVes ?? 9.0));
  const [nextIvaVoucherSeq, setNextIvaVoucherSeq] = useState(
    String(company.nextIvaVoucherSeq ?? 1)
  );
  const [nextIslrVoucherSeq, setNextIslrVoucherSeq] = useState(
    String(company.nextIslrVoucherSeq ?? 1)
  );
  const [savedBanner, setSavedBanner] = useState<string | null>(null);

  useEffect(() => {
    if (isCompanyModalOpen) {
      setRazonSocial(company.razonSocial);
      setRif(company.rif);
      setDireccionFiscal(company.direccionFiscal);
      setTelefono(company.telefono);
      setEmail(company.email);
      setCodigoSada(company.codigoSada);
      setRepresentanteLegal(company.representanteLegal);
      setActividadEconomica(company.actividadEconomica);
      setIsSpecialTaxpayer(company.isSpecialTaxpayer ?? true);
      setIsIvaRetentionAgent(company.isIvaRetentionAgent ?? true);
      setIsIslrRetentionAgent(company.isIslrRetentionAgent ?? true);
      setDefaultIvaRetentionPercent(company.defaultIvaRetentionPercent ?? 75);
      setUtValueVes(String(company.utValueVes ?? 9.0));
      setNextIvaVoucherSeq(String(company.nextIvaVoucherSeq ?? 1));
      setNextIslrVoucherSeq(String(company.nextIslrVoucherSeq ?? 1));
      setSavedBanner(null);
    }
  }, [isCompanyModalOpen, company]);

  if (!isCompanyModalOpen) return null;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    updateCompanyProfile({
      razonSocial,
      rif,
      direccionFiscal,
      telefono,
      email,
      codigoSada,
      representanteLegal,
      actividadEconomica,
      isSpecialTaxpayer,
      isIvaRetentionAgent,
      isIslrRetentionAgent,
      defaultIvaRetentionPercent,
      utValueVes: Math.max(0.01, parseFloat(utValueVes) || 9.0),
      nextIvaVoucherSeq: Math.max(1, parseInt(nextIvaVoucherSeq, 10) || 1),
      nextIslrVoucherSeq: Math.max(1, parseInt(nextIslrVoucherSeq, 10) || 1),
    });
    setSavedBanner(
      'Datos fiscales y parámetros de Agente de Retención SENIAT (IVA / ISLR) actualizados correctamente.'
    );
    setTimeout(() => {
      setSavedBanner(null);
      setIsCompanyModalOpen(false);
    }, 900);
  };

  const handleLoadSampleCompany = () => {
    setRazonSocial('DISTRIBUIDORA DE ALIMENTOS Y VÍVERES EL LLANO, C.A.');
    setRif('J-41289540-8');
    setDireccionFiscal(
      'Av. Intercomunal Turmero-Maracay, Zona Industrial San Vicente II, Galpón 14, Edo. Aragua, Venezuela'
    );
    setTelefono('+58 (243) 554-8900 / +58 (414) 345-9910');
    setEmail('finanzas@distribuidoraelllano.com.ve');
    setCodigoSada('SADA-ARA-90841');
    setRepresentanteLegal('Lic. Roberto Díaz — Dirección General');
    setActividadEconomica('Distribución Mayorista y Retail de Alimentos Masivos y Refrigerados');
  };

  const handleResetGeneric = () => {
    resetCompanyProfileToDefault();
    setRazonSocial(DEFAULT_COMPANY_PROFILE.razonSocial);
    setRif(DEFAULT_COMPANY_PROFILE.rif);
    setDireccionFiscal(DEFAULT_COMPANY_PROFILE.direccionFiscal);
    setTelefono(DEFAULT_COMPANY_PROFILE.telefono);
    setEmail(DEFAULT_COMPANY_PROFILE.email);
    setCodigoSada(DEFAULT_COMPANY_PROFILE.codigoSada);
    setRepresentanteLegal(DEFAULT_COMPANY_PROFILE.representanteLegal);
    setActividadEconomica(DEFAULT_COMPANY_PROFILE.actividadEconomica);
    setSavedBanner(
      'Se restauraron los datos institucionales por defecto (HIPER ABASTO POLAR, C.A., RIF J-50123456-7).'
    );
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Configuración de Datos Fiscales de la Empresa"
      className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4"
    >
      <div className="bg-white border border-slate-200 rounded-2xl max-w-2xl w-full max-h-[92vh] flex flex-col overflow-hidden shadow-2xl text-slate-900">
        {/* Header */}
        <div className="px-5 py-4 bg-slate-900 text-white flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white border border-amber-400/50 p-1 flex items-center justify-center shrink-0 overflow-hidden shadow-sm">
              <img
                src={company.logoBase64 || "/assets/branding/hiper_abasto_polar_logo.jpg"}
                alt="Hiper Abasto Polar"
                className="w-full h-full object-contain"
              />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-sm sm:text-base font-bold text-white">
                  Branding Institucional &amp; Membrete Fiscal — Hiper Abasto Polar
                </h2>
                <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-mono text-[10px] font-bold">
                  SENIAT / SADA
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-0.5">
                Identifique la empresa titular del inventario para el panel principal y el encabezado
                ejecutivo de todas las tablas Excel (.xlsx) y actas PDF.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setIsCompanyModalOpen(false)}
            aria-label="Cerrar configuración de empresa"
            className="text-slate-400 hover:text-white p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 transition cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSave} className="p-5 overflow-y-auto space-y-4 text-xs flex-1">
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <div className="flex items-start gap-2 text-slate-600">
              <FileSpreadsheet className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <span>
                Si deja algún campo vacío, el sistema utilizará automáticamente los valores
                genéricos (<strong>NOMBRE DE EMPRESA, C.A.</strong>,{' '}
                <strong>RIF EMPRESA</strong>, <strong>DIRECCIÓN EMPRESA</strong>).
              </span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={handleLoadSampleCompany}
                className="min-h-[36px] px-2.5 py-1.5 rounded-lg bg-sky-50 hover:bg-sky-100 border border-sky-200 text-sky-900 font-semibold flex items-center gap-1 transition cursor-pointer whitespace-nowrap"
              >
                <Sparkles className="w-3.5 h-3.5 text-sky-600" />
                <span>Cargar Ejemplo Real</span>
              </button>
              <button
                type="button"
                onClick={handleResetGeneric}
                className="min-h-[36px] px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-700 font-semibold flex items-center gap-1 transition cursor-pointer whitespace-nowrap"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Restaurar Genérico</span>
              </button>
            </div>
          </div>

          {savedBanner && (
            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-950 font-semibold flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{savedBanner}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
            <div className="sm:col-span-2">
              <label
                htmlFor="modal-company-razon"
                className="block font-bold text-slate-700 mb-1"
              >
                Razón Social / Nombre de la Empresa *
              </label>
              <input
                id="modal-company-razon"
                type="text"
                placeholder="NOMBRE DE EMPRESA, C.A."
                value={razonSocial}
                onChange={(e) => setRazonSocial(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg font-bold text-slate-900 focus:outline-none focus:border-sky-600"
              />
            </div>

            <div>
              <label htmlFor="modal-company-rif" className="block font-bold text-slate-700 mb-1">
                RIF Fiscal (SENIAT) *
              </label>
              <input
                id="modal-company-rif"
                type="text"
                placeholder="J-00000000-0 (RIF EMPRESA)"
                value={rif}
                onChange={(e) => setRif(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono font-bold uppercase text-slate-900 focus:outline-none focus:border-sky-600"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="modal-company-direccion"
              className="block font-bold text-slate-700 mb-1"
            >
              Dirección Fiscal Completa *
            </label>
            <input
              id="modal-company-direccion"
              type="text"
              placeholder="DIRECCIÓN FISCAL DE LA EMPRESA, CIUDAD, VENEZUELA"
              value={direccionFiscal}
              onChange={(e) => setDireccionFiscal(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:border-sky-600"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
            <div>
              <label
                htmlFor="modal-company-telefono"
                className="block font-bold text-slate-700 mb-1"
              >
                Teléfono Corporativo
              </label>
              <input
                id="modal-company-telefono"
                type="text"
                placeholder="+58 (000) 000-0000"
                value={telefono}
                onChange={(e) => setTelefono(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono text-slate-900"
              />
            </div>

            <div>
              <label htmlFor="modal-company-email" className="block font-bold text-slate-700 mb-1">
                Correo Electrónico Fiscal
              </label>
              <input
                id="modal-company-email"
                type="email"
                placeholder="administracion@empresa.com.ve"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900"
              />
            </div>

            <div>
              <label htmlFor="modal-company-sada" className="block font-bold text-slate-700 mb-1">
                Código SADA / SUNAGRO
              </label>
              <input
                id="modal-company-sada"
                type="text"
                placeholder="SADA-000000"
                value={codigoSada}
                onChange={(e) => setCodigoSada(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono uppercase text-slate-900"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label htmlFor="modal-company-rep" className="block font-bold text-slate-700 mb-1">
                Representante Legal / Gerencia Responsable
              </label>
              <input
                id="modal-company-rep"
                type="text"
                placeholder="GERENCIA GENERAL / ADMINISTRACIÓN"
                value={representanteLegal}
                onChange={(e) => setRepresentanteLegal(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900"
              />
            </div>

            <div>
              <label htmlFor="modal-company-giro" className="block font-bold text-slate-700 mb-1">
                Giro Comercial / Actividad Económica
              </label>
              <input
                id="modal-company-giro"
                type="text"
                placeholder="DISTRIBUCIÓN Y COMERCIALIZACIÓN DE ALIMENTOS"
                value={actividadEconomica}
                onChange={(e) => setActividadEconomica(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900"
              />
            </div>
          </div>

          {/* SENIAT Special Taxpayer & Retention Agent Configuration */}
          <div className="p-3.5 rounded-xl bg-amber-50/70 border border-amber-200 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-200/80 pb-2">
              <span className="font-bold text-amber-950 uppercase tracking-wider text-[11px]">
                Régimen SENIAT — Sujeto Pasivo Especial y Agente de Retención (IVA / ISLR)
              </span>
              <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded bg-amber-200 text-amber-950">
                SNAT/2025/000054 · Decreto 1.808
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-4 text-xs text-slate-800">
              <label className="inline-flex items-center gap-1.5 font-semibold cursor-pointer">
                <input
                  type="checkbox"
                  checked={isSpecialTaxpayer}
                  onChange={(e) => setIsSpecialTaxpayer(e.target.checked)}
                  className="rounded border-slate-300 text-sky-600"
                />
                <span>Sujeto Pasivo Especial (SPE)</span>
              </label>
              <label className="inline-flex items-center gap-1.5 font-semibold cursor-pointer">
                <input
                  type="checkbox"
                  checked={isIvaRetentionAgent}
                  onChange={(e) => setIsIvaRetentionAgent(e.target.checked)}
                  className="rounded border-slate-300 text-sky-600"
                />
                <span>Agente de Retención IVA</span>
              </label>
              <label className="inline-flex items-center gap-1.5 font-semibold cursor-pointer">
                <input
                  type="checkbox"
                  checked={isIslrRetentionAgent}
                  onChange={(e) => setIsIslrRetentionAgent(e.target.checked)}
                  className="rounded border-slate-300 text-sky-600"
                />
                <span>Agente de Retención ISLR</span>
              </label>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <label className="block font-bold text-slate-700 mb-1 text-[11px]">
                  % Ret. IVA Base
                </label>
                <select
                  value={defaultIvaRetentionPercent}
                  onChange={(e) =>
                    setDefaultIvaRetentionPercent(Number(e.target.value) as 75 | 100)
                  }
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white font-mono font-bold"
                >
                  <option value={75}>75% General</option>
                  <option value={100}>100% Especial</option>
                </select>
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1 text-[11px]">
                  Unidad Tributaria (Bs.)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={utValueVes}
                  onChange={(e) => setUtValueVes(e.target.value)}
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white font-mono font-bold"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1 text-[11px]">
                  Próx. Secuencia IVA
                </label>
                <input
                  type="number"
                  min={1}
                  value={nextIvaVoucherSeq}
                  onChange={(e) => setNextIvaVoucherSeq(e.target.value)}
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white font-mono"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1 text-[11px]">
                  Próx. Secuencia ISLR
                </label>
                <input
                  type="number"
                  min={1}
                  value={nextIslrVoucherSeq}
                  onChange={(e) => setNextIslrVoucherSeq(e.target.value)}
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white font-mono"
                />
              </div>
            </div>
          </div>

          {/* Live Preview of Formal Letterhead */}
          <div className="p-3.5 rounded-xl bg-slate-900 text-white border border-slate-800 space-y-1.5 font-mono text-[11px]">
            <div className="flex items-center justify-between text-sky-400 text-[10px] uppercase">
              <span className="flex items-center gap-1.5 font-bold">
                <ShieldCheck className="w-3.5 h-3.5" />
                Vista Previa de Encabezado en Panel Principal y Tabla Formal Excel (.XLSX)
              </span>
              <span>MEMBRETE EJECUTIVO</span>
            </div>
            <div className="text-sm font-bold text-white">
              {(razonSocial || DEFAULT_COMPANY_PROFILE.razonSocial).toUpperCase()} — RIF:{' '}
              <span className="text-emerald-400">{rif || DEFAULT_COMPANY_PROFILE.rif}</span>
            </div>
            <div className="text-slate-300 text-[11px]">
              Dirección: {direccionFiscal || DEFAULT_COMPANY_PROFILE.direccionFiscal}
            </div>
            <div className="text-slate-400 text-[10px] flex flex-wrap gap-x-4 gap-y-1">
              <span>Tel: {telefono || DEFAULT_COMPANY_PROFILE.telefono}</span>
              <span>SADA: {codigoSada || DEFAULT_COMPANY_PROFILE.codigoSada}</span>
              <span>Gerencia: {representanteLegal || DEFAULT_COMPANY_PROFILE.representanteLegal}</span>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-200">
            <button
              type="button"
              onClick={() => setIsCompanyModalOpen(false)}
              className="min-h-[40px] px-4 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-100 font-semibold cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="min-h-[40px] px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold flex items-center gap-1.5 shadow-xs cursor-pointer"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Guardar Datos de la Empresa</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CompanyProfileModal;
