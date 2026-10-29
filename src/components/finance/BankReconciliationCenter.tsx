import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  FileSpreadsheet,
  Landmark,
  RefreshCw,
  Send,
  ShieldCheck,
} from 'lucide-react';
import { AccountsPayablePayment } from '../../types';
import { useFinance } from '../../context/FinanceContext';
import { useOperationsBrm } from '../../context/OperationsBrmContext';

export const BankReconciliationCenter: React.FC = () => {
  const { suppliers, invoices, payments, bcvState } = useFinance();
  const {
    bankStatementLines,
    preConciliationItems,
    importBankCsvStatement,
    runBankAutoReconciliation,
    submitSupplierPaymentPreConciliation,
    approvePreConciliatedPaymentAndNotifyBrm,
    rejectPreConciliatedPayment,
  } = useOperationsBrm();

  const [tab, setTab] = useState<'PRE_CONCILIATION' | 'BANK_CSV'>(
    'PRE_CONCILIATION'
  );
  const [banner, setBanner] = useState<{ type: 'ok' | 'err'; text: string } | null>(
    null
  );

  // Formulario Pre-Conciliación de Pago a Proveedor
  const [supplierId, setSupplierId] = useState(suppliers[0]?.id || '');
  const [invoiceId, setInvoiceId] = useState(invoices[0]?.id || '');
  const [method, setMethod] =
    useState<AccountsPayablePayment['method']>('TRANSFERENCIA_VES');
  const [currency, setCurrency] = useState<'VES' | 'USD'>('VES');
  const [amountOrig, setAmountOrig] = useState('15000.00');
  const [reference, setReference] = useState('94820194');
  const [simulateTamper, setSimulateTamper] = useState(false);

  // Formulario Importación Extracto CSV
  const [bankName, setBankName] = useState('Banesco Banco Universal');
  const [bankCurrency, setBankCurrency] = useState<'VES' | 'USD'>('VES');
  const [csvText, setCsvText] = useState('');

  const kpis = useMemo(() => {
    const pendingPre = preConciliationItems.filter(
      (i) => i.status === 'pendiente_verificacion'
    ).length;
    const fraudFlagged = preConciliationItems.filter(
      (i) => i.ocrVerdict === 'ALERTA_FRAUDE_EDICION_O_IA'
    ).length;
    const matchedBank = bankStatementLines.filter(
      (b) => b.reconciliationStatus !== 'PENDIENTE'
    ).length;
    const totalIgtfUsd = preConciliationItems
      .filter((i) => i.status === 'CONCILIADO_EN_LIBRO')
      .reduce((acc, i) => acc + i.igtfUsd, 0);
    return { pendingPre, fraudFlagged, matchedBank, totalIgtfUsd };
  }, [preConciliationItems, bankStatementLines]);

  const handleSubmitPrePayment = (e: React.FormEvent) => {
    e.preventDefault();
    const res = submitSupplierPaymentPreConciliation({
      supplierId: supplierId || suppliers[0]?.id || '',
      invoiceId: invoiceId || undefined,
      method,
      currency,
      amountOriginal: Number(amountOrig) || 0,
      reference,
      hasEditedExifFlag: simulateTamper,
    });
    if (!res.success) {
      setBanner({ type: 'err', text: res.error || 'Error registrando pago.' });
      return;
    }
    setReference(String(Math.floor(10000000 + Math.random() * 89999999)));
    setBanner({
      type:
        res.item?.ocrVerdict === 'ALERTA_FRAUDE_EDICION_O_IA' ? 'err' : 'ok',
      text: `Comprobante Ref. ${res.item?.reference} en bandeja pendiente_verificacion — Dictamen 4 Candados OCR: ${res.item?.ocrVerdict} (IGTF 3%: $${res.item?.igtfUsd.toFixed(2)}).`,
    });
  };

  const handleLoadSampleStatement = () => {
    const latestPay = payments[0];
    const sampleRef = latestPay?.reference || '88492011';
    const sampleAmt =
      bankCurrency === 'USD'
        ? (latestPay?.amountUsd || 250).toFixed(2)
        : ((latestPay?.amountUsd || 250) * bcvState.activeRate).toFixed(2);
    setCsvText(
      [
        'Fecha;Referencia;Descripcion;Monto;Tipo',
        `2026-10-29;${sampleRef};PAGO PROVEEDOR CXP POLAR;-${sampleAmt};DEBITO`,
        `2026-10-29;77319042;LIQUIDACION PUNTO DE VENTA SEDE;${(Number(sampleAmt) * 1.4).toFixed(2)};CREDITO`,
      ].join('\n')
    );
  };

  return (
    <div className="space-y-5">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
            <Landmark className="w-5 h-5 text-emerald-400" />
            Conciliación Bancaria Bimonetaria (VES / USD + IGTF 3%) & Pre-Conciliación @OCR
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Cruza extractos bancarios contra Cuentas por Pagar, bloquea capturas reutilizadas (SHA-256 / pHash) y despacha en 1 clic Soporte de Pago + PDFs IVA/ISLR vía WhatsApp BRM.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setTab('PRE_CONCILIATION')}
            className={`min-h-[44px] px-4 rounded-xl text-xs font-bold border transition cursor-pointer ${
              tab === 'PRE_CONCILIATION'
                ? 'bg-emerald-600 text-white border-emerald-500'
                : 'bg-slate-950 text-slate-300 border-slate-800'
            }`}
          >
            Bandeja Pre-Conciliación OCR ({kpis.pendingPre})
          </button>
          <button
            type="button"
            onClick={() => setTab('BANK_CSV')}
            className={`min-h-[44px] px-4 rounded-xl text-xs font-bold border transition cursor-pointer ${
              tab === 'BANK_CSV'
                ? 'bg-emerald-600 text-white border-emerald-500'
                : 'bg-slate-950 text-slate-300 border-slate-800'
            }`}
          >
            Extractos Bancarios CSV ({bankStatementLines.length})
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
          <div className="text-[11px] text-slate-400 font-semibold">
            En Pre-Conciliación
          </div>
          <div className="text-2xl font-bold text-amber-400 font-mono tabular-nums mt-1">
            {kpis.pendingPre}
          </div>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
          <div className="text-[11px] text-slate-400 font-semibold">
            Alertas Anti-Fraude OCR
          </div>
          <div className="text-2xl font-bold text-rose-400 font-mono tabular-nums mt-1">
            {kpis.fraudFlagged}
          </div>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
          <div className="text-[11px] text-slate-400 font-semibold">
            Líneas Bancarias Conciliadas
          </div>
          <div className="text-2xl font-bold text-emerald-400 font-mono tabular-nums mt-1">
            {kpis.matchedBank}
          </div>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
          <div className="text-[11px] text-slate-400 font-semibold">
            IGTF 3% Divisas Causado
          </div>
          <div className="text-2xl font-bold text-sky-400 font-mono tabular-nums mt-1">
            ${kpis.totalIgtfUsd.toFixed(2)}
          </div>
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
            className="text-slate-400 hover:text-white px-2 cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {tab === 'PRE_CONCILIATION' ? (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          <form
            onSubmit={handleSubmitPrePayment}
            className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3 text-xs"
          >
            <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-sky-400" />
              Cargar Soporte de Pago a Pre-Conciliación
            </h3>

            <div>
              <label className="block text-slate-400 mb-1">Proveedor Beneficiario</label>
              <select
                value={supplierId}
                onChange={(e) => {
                  const sid = e.target.value;
                  setSupplierId(sid);
                  const firstInv = invoices.find((i) => i.supplierId === sid);
                  setInvoiceId(firstInv?.id || '');
                }}
                className="w-full min-h-[44px] px-3 rounded-xl bg-slate-950 border border-slate-700 text-white"
              >
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-slate-400 mb-1">Factura CxP Asociada</label>
              <select
                value={invoiceId}
                onChange={(e) => setInvoiceId(e.target.value)}
                className="w-full min-h-[44px] px-3 rounded-xl bg-slate-950 border border-slate-700 text-white"
              >
                <option value="">-- Abono General --</option>
                {invoices
                  .filter((inv) => !supplierId || inv.supplierId === supplierId)
                  .map((inv) => (
                    <option key={inv.id} value={inv.id}>
                      {inv.invoiceNumber} — Neto ${(inv.netPayableUsd ?? inv.totalUsd).toFixed(2)}
                    </option>
                  ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-slate-400 mb-1">Método de Pago</label>
                <select
                  value={method}
                  onChange={(e) => {
                    const m = e.target.value as AccountsPayablePayment['method'];
                    setMethod(m);
                    setCurrency(m.includes('USD') ? 'USD' : 'VES');
                  }}
                  className="w-full min-h-[44px] px-3 rounded-xl bg-slate-950 border border-slate-700 text-white"
                >
                  <option value="TRANSFERENCIA_VES">Transferencia Bs.</option>
                  <option value="PAGO_MOVIL_VES">Pago Móvil Bs.</option>
                  <option value="ZELLE_USD">Zelle USD (+3% IGTF)</option>
                  <option value="EFECTIVO_USD">Efectivo USD (+3% IGTF)</option>
                </select>
              </div>
              <div>
                <label className="block text-slate-400 mb-1">Monto ({currency})</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={amountOrig}
                  onChange={(e) => setAmountOrig(e.target.value)}
                  className="w-full min-h-[44px] px-3 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono tabular-nums"
                />
              </div>
            </div>

            <div>
              <label className="block text-slate-400 mb-1">N° Referencia Bancaria / Zelle</label>
              <input
                type="text"
                required
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                className="w-full min-h-[44px] px-3 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono"
              />
            </div>

            <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={simulateTamper}
                onChange={(e) => setSimulateTamper(e.target.checked)}
              />
              Simular captura editada / EXIF fraudulento
            </label>

            <button
              type="submit"
              className="w-full min-h-[44px] rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-bold cursor-pointer"
            >
              Auditar con 4 Candados OCR y Pre-Registrar
            </button>
          </form>

          <div className="xl:col-span-2 bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
            <div className="p-4 border-b border-slate-800">
              <h3 className="text-sm font-bold text-white">
                Bandeja de Soportes de Pago Auditados (Conciliar + Notificar BRM en 1 Clic)
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left border-collapse">
                <thead>
                  <tr className="bg-slate-950 text-slate-400 border-b border-slate-800">
                    <th className="p-3">Proveedor / Factura</th>
                    <th className="p-3">Ref. & Método</th>
                    <th className="p-3 text-right">Equiv. USD (+IGTF)</th>
                    <th className="p-3">Veredicto OCR</th>
                    <th className="p-3 text-right">Conciliación</th>
                  </tr>
                </thead>
                <tbody>
                  {preConciliationItems.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-6 text-center text-slate-500">
                        Sin soportes pendientes en bandeja de pre-conciliación.
                      </td>
                    </tr>
                  ) : (
                    preConciliationItems.map((item) => (
                      <tr key={item.id} className="border-b border-slate-800/70">
                        <td className="p-3">
                          <div className="text-white font-semibold">{item.supplierName}</div>
                          <div className="text-[10px] font-mono text-sky-300">
                            {item.invoiceNumber || 'Abono General'}
                          </div>
                        </td>
                        <td className="p-3 font-mono">
                          <div className="text-white">{item.reference}</div>
                          <div className="text-[10px] text-slate-400">{item.method}</div>
                        </td>
                        <td className="p-3 text-right font-mono tabular-nums">
                          <div className="font-bold text-emerald-400">
                            ${item.amountUsd.toFixed(2)}
                          </div>
                          {item.igtfUsd > 0 && (
                            <div className="text-[10px] text-amber-300">
                              IGTF: +${item.igtfUsd.toFixed(2)}
                            </div>
                          )}
                        </td>
                        <td className="p-3">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              item.ocrVerdict === 'AUTENTICO_ALTA_CONFIANZA'
                                ? 'bg-emerald-500/20 text-emerald-300'
                                : item.ocrVerdict === 'SOSPECHOSO_REVISION_HUMANA'
                                ? 'bg-amber-500/20 text-amber-300'
                                : 'bg-rose-500/20 text-rose-300'
                            }`}
                          >
                            {item.ocrVerdict}
                          </span>
                        </td>
                        <td className="p-3 text-right">
                          {item.status === 'pendiente_verificacion' ? (
                            <div className="flex justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={async () => {
                                  const r = await approvePreConciliatedPaymentAndNotifyBrm(
                                    item.id,
                                    true
                                  );
                                  setBanner({
                                    type: r.success ? 'ok' : 'err',
                                    text: r.success
                                      ? `Pago conciliado en libro mayor y enviado junto con los PDFs de Retención IVA/ISLR al WhatsApp BRM del proveedor.`
                                      : r.error || 'Error conciliando pago.',
                                  });
                                }}
                                className="min-h-[44px] px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold inline-flex items-center gap-1 cursor-pointer"
                              >
                                <Send className="w-3.5 h-3.5" />
                                Conciliar + BRM
                              </button>
                              <button
                                type="button"
                                onClick={() => rejectPreConciliatedPayment(item.id)}
                                className="min-h-[44px] px-2.5 rounded-xl bg-rose-600/20 text-rose-300 font-bold cursor-pointer"
                              >
                                Rechazar
                              </button>
                            </div>
                          ) : (
                            <span className="text-[11px] font-mono text-slate-400">
                              {item.status}
                            </span>
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
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3 text-xs">
            <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
              <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
              Importar Estado de Cuenta Bancario (.CSV)
            </h3>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-slate-400 mb-1">Entidad Bancaria</label>
                <select
                  value={bankName}
                  onChange={(e) => setBankName(e.target.value)}
                  className="w-full min-h-[44px] px-3 rounded-xl bg-slate-950 border border-slate-700 text-white"
                >
                  <option>Banesco Banco Universal</option>
                  <option>Banco Mercantil</option>
                  <option>BBVA Provincial</option>
                  <option>BNC Nacional de Crédito</option>
                  <option>Bancamiga</option>
                  <option>Zelle / Bank of America</option>
                </select>
              </div>
              <div>
                <label className="block text-slate-400 mb-1">Moneda Cuenta</label>
                <select
                  value={bankCurrency}
                  onChange={(e) => setBankCurrency(e.target.value as 'VES' | 'USD')}
                  className="w-full min-h-[44px] px-3 rounded-xl bg-slate-950 border border-slate-700 text-white"
                >
                  <option value="VES">Bolívares (VES)</option>
                  <option value="USD">Dólares (USD)</option>
                </select>
              </div>
            </div>

            <textarea
              rows={5}
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
              placeholder="Fecha;Referencia;Descripcion;Monto;Tipo"
              className="w-full p-3 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono text-[11px]"
            />

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleLoadSampleStatement}
                className="min-h-[44px] px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold cursor-pointer"
              >
                Cargar Plantilla Ejemplo
              </button>
              <button
                type="button"
                onClick={() => {
                  const r = importBankCsvStatement({
                    rawCsvText: csvText,
                    bankName,
                    accountCurrency: bankCurrency,
                  });
                  setBanner({
                    type: 'ok',
                    text: `Importadas ${r.importedCount} líneas bancarias (${r.exactMatchesCount} conciliadas automáticamente contra CxP).`,
                  });
                }}
                className="flex-1 min-h-[44px] px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold cursor-pointer"
              >
                Importar y Cruzar
              </button>
            </div>
          </div>

          <div className="xl:col-span-2 bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <h3 className="text-sm font-bold text-white">
                Movimientos del Estado de Cuenta vs. Libro Mayor
              </h3>
              <button
                type="button"
                onClick={() => {
                  const r = runBankAutoReconciliation();
                  setBanner({
                    type: 'ok',
                    text: `Re-conciliación completada: ${r.exactMatchesCount} exactos, ${r.toleranceMatchesCount} por tolerancia, ${r.pendingCount} pendientes.`,
                  });
                }}
                className="min-h-[44px] px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-sky-300 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Re-Cruzar Contra CxP
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left border-collapse">
                <thead>
                  <tr className="bg-slate-950 text-slate-400 border-b border-slate-800">
                    <th className="p-3">Banco / Fecha</th>
                    <th className="p-3">Referencia / Concepto</th>
                    <th className="p-3 text-right">Monto / Equiv. USD</th>
                    <th className="p-3">Estado Conciliación</th>
                  </tr>
                </thead>
                <tbody>
                  {bankStatementLines.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="p-6 text-center text-slate-500">
                        Importe un extracto CSV a la izquierda para ejecutar la conciliación automática.
                      </td>
                    </tr>
                  ) : (
                    bankStatementLines.map((ln) => (
                      <tr key={ln.id} className="border-b border-slate-800/70">
                        <td className="p-3">
                          <div className="text-white font-semibold">{ln.bankName}</div>
                          <div className="font-mono text-[10px] text-slate-400">
                            {ln.transactionDate}
                          </div>
                        </td>
                        <td className="p-3">
                          <div className="font-mono text-sky-300">{ln.reference}</div>
                          <div className="text-[11px] text-slate-300">{ln.description}</div>
                        </td>
                        <td className="p-3 text-right font-mono tabular-nums">
                          <div className="text-white font-bold">
                            {ln.accountCurrency} {ln.amount.toFixed(2)}
                          </div>
                          <div className="text-[10px] text-emerald-400">
                            USD ${ln.amountUsdEquivalent.toFixed(2)}
                          </div>
                        </td>
                        <td className="p-3">
                          <span
                            className={`px-2 py-1 rounded text-[10px] font-bold ${
                              ln.reconciliationStatus === 'CONCILIADO_EXACTO'
                                ? 'bg-emerald-500/20 text-emerald-300'
                                : ln.reconciliationStatus === 'CONCILIADO_TOLERANCIA'
                                ? 'bg-sky-500/20 text-sky-300'
                                : 'bg-amber-500/20 text-amber-300'
                            }`}
                          >
                            {ln.reconciliationStatus}
                          </span>
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
    </div>
  );
};

export default BankReconciliationCenter;
