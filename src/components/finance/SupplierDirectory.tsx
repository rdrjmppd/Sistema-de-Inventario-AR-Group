import React, { useState } from 'react';
import { Users, Plus, Phone, Mail, Building } from 'lucide-react';
import { useFinance } from '../../context/FinanceContext';
import { formatUsd, formatVes, convertUsdToVes } from '../../lib/decimal';

export const SupplierDirectory: React.FC = () => {
  const { suppliers, addSupplier, bcvState } = useFinance();
  const [showModal, setShowModal] = useState(false);

  const [rif, setRif] = useState('J-');
  const [name, setName] = useState('');
  const [category, setCategory] = useState('Víveres e Industriales');
  const [contactName, setContactName] = useState('');
  const [phone, setPhone] = useState('+58 ');
  const [email, setEmail] = useState('');
  const [creditDays, setCreditDays] = useState('15');
  const [paymentTerms, setPaymentTerms] = useState('Crédito 15 Días Indexado BCV');

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !rif.trim()) return;
    addSupplier({
      rif: rif.trim().toUpperCase(),
      name: name.trim(),
      category,
      contactName: contactName.trim() || 'Departamento de Ventas',
      phone: phone.trim(),
      email: email.trim() || 'facturacion@proveedor.com.ve',
      creditDays: parseInt(creditDays, 10) || 15,
      paymentTerms,
    });
    setShowModal(false);
    setRif('J-');
    setName('');
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
          onClick={() => setShowModal(true)}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold transition self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          Registrar Proveedor
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {suppliers.map((sup) => {
          const balVes = convertUsdToVes(sup.balanceUsd, bcvState.activeRate);
          return (
            <div
              key={sup.id}
              className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs flex flex-col justify-between space-y-3"
            >
              <div>
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[11px] font-bold px-2 py-0.5 rounded bg-slate-900 text-sky-300">
                    RIF: {sup.rif}
                  </span>
                  <span className="text-[11px] font-mono text-slate-500">
                    Crédito: {sup.creditDays} días
                  </span>
                </div>
                <h2 className="text-sm font-bold text-slate-900 mt-2 flex items-center gap-1.5">
                  <Building className="w-4 h-4 text-slate-400 shrink-0" />
                  <span>{sup.name}</span>
                </h2>
                <p className="text-[11px] text-slate-500 mt-0.5">{sup.category}</p>

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
                    Saldo por Pagar (USD)
                  </div>
                  <div className="font-mono font-bold text-sm text-rose-700">
                    {formatUsd(sup.balanceUsd)}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] font-mono uppercase text-slate-400">
                    Equivalente BCV (VES)
                  </div>
                  <div className="font-mono font-semibold text-xs text-slate-700">
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
          <div className="bg-white border border-slate-200 rounded-xl max-w-md w-full overflow-hidden shadow-2xl">
            <div className="px-5 py-3.5 bg-slate-900 text-white flex items-center justify-between">
              <h2 className="text-sm font-bold">Homologar Nuevo Proveedor</h2>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="text-slate-400 hover:text-white text-xs font-mono"
              >
                ESC
              </button>
            </div>
            <form onSubmit={handleCreate} className="p-5 space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">RIF Fiscal *</label>
                  <input
                    type="text"
                    required
                    value={rif}
                    onChange={(e) => setRif(e.target.value)}
                    placeholder="J-00000000-0"
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded font-mono"
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
                  className="px-4 py-1.5 rounded border border-slate-300 text-slate-700"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded bg-sky-600 text-white font-semibold"
                >
                  Guardar Proveedor
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
