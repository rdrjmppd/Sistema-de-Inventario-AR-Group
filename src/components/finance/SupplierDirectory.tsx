import React, { useState } from 'react';
import { Users, Plus, Phone, Mail, Building, Edit3 } from 'lucide-react';
import { useFinance } from '../../context/FinanceContext';
import { PersonTaxType, Supplier, TaxpayerType } from '../../types';
import { formatUsd, formatVes, convertUsdToVes } from '../../lib/decimal';
import { ISLR_CONCEPTS_CATALOG } from '../../lib/fiscal-retentions';

export const SupplierDirectory: React.FC = () => {
  const { suppliers, addSupplier, updateSupplier, bcvState } = useFinance();
  const [showModal, setShowModal] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);

  const [rif, setRif] = useState('J-');
  const [name, setName] = useState('');
  const [category, setCategory] = useState('Víveres e Industriales');
  const [contactName, setContactName] = useState('');
  const [phone, setPhone] = useState('+58 ');
  const [email, setEmail] = useState('');
  const [creditDays, setCreditDays] = useState('15');
  const [paymentTerms, setPaymentTerms] = useState('Crédito 15 Días Indexado BCV');
  const [taxpayerType, setTaxpayerType] = useState<TaxpayerType>('ORDINARIO');
  const [personType, setPersonType] = useState<PersonTaxType>('PJ_DOMICILIADA');
  const [defaultIslrConceptCode, setDefaultIslrConceptCode] = useState('');

  const openNewModal = () => {
    setEditingSupplier(null);
    setRif('J-');
    setName('');
    setCategory('Víveres e Industriales');
    setContactName('');
    setPhone('+58 ');
    setEmail('');
    setCreditDays('15');
    setPaymentTerms('Crédito 15 Días Indexado BCV');
    setTaxpayerType('ORDINARIO');
    setPersonType('PJ_DOMICILIADA');
    setDefaultIslrConceptCode('');
    setShowModal(true);
  };

  const openEditModal = (sup: Supplier) => {
    setEditingSupplier(sup);
    setRif(sup.rif);
    setName(sup.name);
    setCategory(sup.category);
    setContactName(sup.contactName);
    setPhone(sup.phone);
    setEmail(sup.email);
    setCreditDays(String(sup.creditDays));
    setPaymentTerms(sup.paymentTerms);
    setTaxpayerType(sup.taxpayerType || 'ORDINARIO');
    setPersonType(sup.personType || 'PJ_DOMICILIADA');
    setDefaultIslrConceptCode(sup.defaultIslrConceptCode || '');
    setShowModal(true);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !rif.trim()) return;
    const payload = {
      rif: rif.trim().toUpperCase(),
      name: name.trim(),
      category,
      contactName: contactName.trim() || 'Departamento de Ventas',
      phone: phone.trim(),
      email: email.trim() || 'facturacion@proveedor.com.ve',
      creditDays: parseInt(creditDays, 10) || 15,
      paymentTerms,
      taxpayerType,
      personType,
      defaultIslrConceptCode: defaultIslrConceptCode || undefined,
    };

    if (editingSupplier) {
      updateSupplier(editingSupplier.id, payload);
    } else {
      addSupplier(payload);
    }
    setShowModal(false);
    setEditingSupplier(null);
  };

  return (
    <div className="space-y-5">
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-sky-600" />
            <h1 className="text-base font-bold text-slate-900">
              Directorio Homologado de Proveedores Agroindustriales (SENIAT / SADA)
            </h1>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Gestión de RIF, condiciones de crédito indexado y saldos consolidados por pagar.
          </p>
        </div>

        <button
          type="button"
          onClick={openNewModal}
          className="min-h-[44px] flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold transition self-start sm:self-auto cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          Registrar Proveedor
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {suppliers.map((sup) => {
          const balVes = convertUsdToVes(sup.balanceUsd, bcvState.activeRate);
          const taxBadge = sup.taxpayerType || 'ORDINARIO';
          const personBadge =
            (sup.personType || 'PJ_DOMICILIADA') === 'PJ_DOMICILIADA' ? 'PJ Domiciliada' : 'PN Residente';
          return (
            <div
              key={sup.id}
              className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs flex flex-col justify-between space-y-3"
            >
              <div>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-[11px] font-bold px-2 py-0.5 rounded bg-slate-900 text-sky-300">
                    RIF: {sup.rif}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] font-mono text-slate-500">
                      Crédito: {sup.creditDays}d
                    </span>
                    <button
                      type="button"
                      onClick={() => openEditModal(sup)}
                      className="p-1.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 transition cursor-pointer"
                      title="Editar condición fiscal y datos del proveedor"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                <h2 className="text-sm font-bold text-slate-900 mt-2 flex items-center gap-1.5">
                  <Building className="w-4 h-4 text-slate-400 shrink-0" />
                  <span>{sup.name}</span>
                </h2>
                <p className="text-[11px] text-slate-500 mt-0.5">{sup.category}</p>

                <div className="flex flex-wrap items-center gap-1.5 mt-2">
                  <span
                    className={`px-2 py-0.5 rounded font-mono text-[10px] font-bold ${
                      taxBadge === 'ESPECIAL'
                        ? 'bg-amber-100 text-amber-900 border border-amber-200'
                        : taxBadge === 'FORMAL'
                        ? 'bg-emerald-100 text-emerald-900 border border-emerald-200'
                        : 'bg-sky-50 text-sky-900 border border-sky-200'
                    }`}
                  >
                    SENIAT: {taxBadge}
                  </span>
                  <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-mono text-[10px]">
                    {personBadge}
                  </span>
                </div>

                <div className="mt-3 space-y-1 text-xs text-slate-600">
                  <div className="flex items-center gap-1.5">
                    <Phone className="w-3.5 h-3.5 text-slate-400" />
                    <span>
                      {sup.contactName} · {sup.phone}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Mail className="w-3.5 h-3.5 text-slate-400" />
                    <span>{sup.email}</span>
                  </div>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                <div>
                  <div className="text-[10px] font-mono uppercase text-slate-400">
                    Saldo Neto CxP (USD)
                  </div>
                  <div className="font-mono font-bold text-sm text-rose-700 tabular-nums">
                    {formatUsd(sup.balanceUsd)}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] font-mono uppercase text-slate-400">
                    Equivalente BCV (VES)
                  </div>
                  <div className="font-mono font-semibold text-xs text-slate-700 tabular-nums">
                    {formatVes(balVes)}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl max-w-lg w-full max-h-[92vh] overflow-y-auto shadow-2xl">
            <div className="px-5 py-3.5 bg-slate-900 text-white flex items-center justify-between">
              <h2 className="text-sm font-bold">
                {editingSupplier ? 'Actualizar Ficha Fiscal del Proveedor' : 'Homologar Nuevo Proveedor'}
              </h2>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="text-slate-400 hover:text-white text-xs font-mono cursor-pointer"
              >
                ESC
              </button>
            </div>
            <form onSubmit={handleSave} className="p-5 space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">RIF Fiscal *</label>
                  <input
                    type="text"
                    required
                    value={rif}
                    onChange={(e) => setRif(e.target.value)}
                    placeholder="J-00000000-0"
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded font-mono uppercase"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Días Crédito</label>
                  <input
                    type="number"
                    value={creditDays}
                    onChange={(e) => setCreditDays(e.target.value)}
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Razón Social *</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ej. Molinos Nacionales MONACA, C.A."
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-50 p-3 rounded-lg border border-slate-200">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Condición SENIAT (Retención IVA)
                  </label>
                  <select
                    value={taxpayerType}
                    onChange={(e) => setTaxpayerType(e.target.value as TaxpayerType)}
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded bg-white font-semibold"
                  >
                    <option value="ORDINARIO">Contribuyente Ordinario (Ret. 75%)</option>
                    <option value="ESPECIAL">Sujeto Pasivo Especial (Ret. 75%)</option>
                    <option value="FORMAL">Contribuyente Formal / Exento (Ret. 0%)</option>
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Personalidad Jurídica (ISLR)
                  </label>
                  <select
                    value={personType}
                    onChange={(e) => setPersonType(e.target.value as PersonTaxType)}
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded bg-white font-semibold"
                  >
                    <option value="PJ_DOMICILIADA">Persona Jurídica Domiciliada (PJ)</option>
                    <option value="PN_RESIDENTE">Persona Natural Residente (PN + Sustraendo)</option>
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className="block font-semibold text-slate-700 mb-1">
                    Concepto Decreto 1.808 por Defecto (Solo si presta Servicios)
                  </label>
                  <select
                    value={defaultIslrConceptCode}
                    onChange={(e) => setDefaultIslrConceptCode(e.target.value)}
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded bg-white font-mono text-[11px]"
                  >
                    <option value="">Ninguno — Proveedor exclusivo de Mercancía / Bienes</option>
                    {ISLR_CONCEPTS_CATALOG.map((c) => (
                      <option key={c.code} value={c.code}>
                        [{c.code}] {c.name} (PJ {c.pjRatePercent}% / PN {c.pnRatePercent}%)
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Rubro</label>
                  <input
                    type="text"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Ejecutivo</label>
                  <input
                    type="text"
                    value={contactName}
                    onChange={(e) => setContactName(e.target.value)}
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Teléfono</label>
                  <input
                    type="text"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded font-mono"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Correo</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Condición Comercial
                </label>
                <input
                  type="text"
                  value={paymentTerms}
                  onChange={(e) => setPaymentTerms(e.target.value)}
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="min-h-[40px] px-4 py-1.5 rounded border border-slate-300 text-slate-700 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="min-h-[40px] px-4 py-1.5 rounded bg-sky-600 hover:bg-sky-500 text-white font-semibold cursor-pointer"
                >
                  {editingSupplier ? 'Actualizar Proveedor' : 'Guardar Proveedor'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default SupplierDirectory;
