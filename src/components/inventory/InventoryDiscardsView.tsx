import React, { useState, useMemo } from 'react';
import {
  PackageMinus,
  ShieldAlert,
  CheckCircle2,
  XCircle,
  Clock,
  Plus,
  FileSpreadsheet,
  FileText,
  Search,
  Building2,
  Lock,
  AlertTriangle,
  UserCheck,
  Filter,
  X,
  ArrowRight,
} from 'lucide-react';
import { useInventory } from '../../context/InventoryContext';
import { useFinance } from '../../context/FinanceContext';
import { useAuth } from '../../context/AuthContext';
import { useUIConfig } from '../../context/UIConfigContext';
import {
  DiscardReason,
  DiscardStatus,
  InventoryDiscardRecord,
  UserRole,
} from '../../types';
import { toDecimal, round2, formatUsd, formatVes } from '../../lib/decimal';
import {
  DISCARD_REASON_CATALOG,
  getDiscardReasonLabel,
  getDiscardReasonBadgeClass,
  calculateDiscardLossValuation,
  exportInventoryDiscardsToExcel,
  exportInventoryDiscardsToPdf,
} from '../../lib/inventory-discards';
import { DEFAULT_COMPANY_PROFILE } from '../../lib/excel-exporter';

export const InventoryDiscardsView: React.FC = () => {
  const {
    products,
    locations,
    selectedLocationId,
    setSelectedLocationId,
    discards,
    pendingDiscardsCount,
    registerInventoryDiscard,
    authorizeInventoryDiscard,
    rejectInventoryDiscard,
  } = useInventory();
  const { bcvState } = useFinance();
  const { user } = useAuth();
  const { config } = useUIConfig();
  const company = config.companyProfile || DEFAULT_COMPANY_PROFILE;

  const canAuthorizeOrReject =
    user?.role === UserRole.GERENTE || user?.role === UserRole.SUPERADMIN;
  const canCreateRequest = user?.role !== UserRole.OBSERVADOR;

  // Filters
  const [statusFilter, setStatusFilter] = useState<'ALL' | DiscardStatus>('ALL');
  const [reasonFilter, setReasonFilter] = useState<'ALL' | DiscardReason>('ALL');
  const [searchTerm, setSearchTerm] = useState('');

  // Feedback banner
  const [feedbackBanner, setFeedbackBanner] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  // Analyst Pre-Registration Modal State
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [formLocationId, setFormLocationId] = useState<string>(
    selectedLocationId !== 'ALL' ? selectedLocationId : locations[0]?.id || 'loc-pzo-01'
  );
  const [formProductId, setFormProductId] = useState<string>(products[0]?.id || '');
  const [formQuantity, setFormQuantity] = useState<string>('1');
  const [formReason, setFormReason] = useState<DiscardReason>('VENCIMIENTO_CADUCIDAD');
  const [formReasonDetails, setFormReasonDetails] = useState<string>('');
  const [formLotOrGuide, setFormLotOrGuide] = useState<string>('');
  const [createError, setCreateError] = useState<string | null>(null);

  // Manager Dual-Signature Authorization / Rejection Modal State
  const [selectedDiscardForReview, setSelectedDiscardForReview] =
    useState<InventoryDiscardRecord | null>(null);
  const [reviewDecision, setReviewDecision] = useState<'AUTHORIZE' | 'REJECT'>('AUTHORIZE');
  const [managerPinInput, setManagerPinInput] = useState<string>('');
  const [rejectionReasonInput, setRejectionReasonInput] = useState<string>('');
  const [reviewError, setReviewError] = useState<string | null>(null);

  // Filtered records
  const filteredDiscards = useMemo(() => {
    return discards.filter((d) => {
      if (selectedLocationId !== 'ALL' && d.locationId !== selectedLocationId) {
        return false;
      }
      if (statusFilter !== 'ALL' && d.status !== statusFilter) {
        return false;
      }
      if (reasonFilter !== 'ALL' && d.reason !== reasonFilter) {
        return false;
      }
      if (searchTerm.trim() !== '') {
        const q = searchTerm.toLowerCase();
        const matches =
          d.referenceCode.toLowerCase().includes(q) ||
          d.sku.toLowerCase().includes(q) ||
          d.productName.toLowerCase().includes(q) ||
          d.reasonDetails.toLowerCase().includes(q) ||
          d.createdByDisplayName.toLowerCase().includes(q) ||
          (d.lotOrGuideNumber && d.lotOrGuideNumber.toLowerCase().includes(q));
        if (!matches) return false;
      }
      return true;
    });
  }, [discards, selectedLocationId, statusFilter, reasonFilter, searchTerm]);

  // Financial & Operational KPIs via Decimal.js
  const kpis = useMemo(() => {
    const scoped =
      selectedLocationId === 'ALL'
        ? discards
        : discards.filter((d) => d.locationId === selectedLocationId);

    const pendingList = scoped.filter((d) => d.status === 'PENDIENTE_AUTORIZACION');
    const authorizedList = scoped.filter((d) => d.status === 'AUTORIZADA');
    const rejectedList = scoped.filter((d) => d.status === 'RECHAZADA');

    const pendingUsd = round2(
      pendingList.reduce((acc, d) => acc.plus(d.totalCostUsd), toDecimal(0))
    );
    const pendingVes = round2(toDecimal(pendingUsd).times(bcvState.activeRate));

    const authorizedUsd = round2(
      authorizedList.reduce((acc, d) => acc.plus(d.totalCostUsd), toDecimal(0))
    );
    const authorizedVes = round2(toDecimal(authorizedUsd).times(bcvState.activeRate));

    const totalUnitsAuthorized = round2(
      authorizedList.reduce((acc, d) => acc.plus(d.quantityDiscarded), toDecimal(0))
    );

    return {
      totalRecords: scoped.length,
      pendingCount: pendingList.length,
      pendingUsd,
      pendingVes,
      authorizedCount: authorizedList.length,
      authorizedUsd,
      authorizedVes,
      totalUnitsAuthorized,
      rejectedCount: rejectedList.length,
    };
  }, [discards, selectedLocationId, bcvState.activeRate]);

  // Selected product in Analyst form
  const selectedFormProduct = useMemo(() => {
    return products.find((p) => p.id === formProductId) || products[0];
  }, [products, formProductId]);

  const currentStockInFormLocation = useMemo(() => {
    if (!selectedFormProduct) return 0;
    return round2(selectedFormProduct.stockByLocation[formLocationId] ?? 0);
  }, [selectedFormProduct, formLocationId]);

  const liveLossPreview = useMemo(() => {
    const qty = Number(formQuantity);
    if (!selectedFormProduct || !Number.isFinite(qty) || qty <= 0) {
      return { totalCostUsd: 0, totalCostVes: 0 };
    }
    return calculateDiscardLossValuation(
      qty,
      selectedFormProduct.costUsd,
      bcvState.activeRate
    );
  }, [formQuantity, selectedFormProduct, bcvState.activeRate]);

  const selectedLocationLabel = useMemo(() => {
    if (selectedLocationId === 'ALL') {
      return `Consolidado Nacional (${locations.length} Sedes / Depósitos)`;
    }
    const found = locations.find((l) => l.id === selectedLocationId);
    return found ? `${found.code} — ${found.name}` : 'Sede Seleccionada';
  }, [selectedLocationId, locations]);

  const handleOpenCreateModal = () => {
    setCreateError(null);
    const defaultLoc =
      selectedLocationId !== 'ALL' ? selectedLocationId : locations[0]?.id || 'loc-pzo-01';
    setFormLocationId(defaultLoc);
    setFormProductId(products[0]?.id || '');
    setFormQuantity('1');
    setFormReason('VENCIMIENTO_CADUCIDAD');
    setFormReasonDetails('');
    setFormLotOrGuide('');
    setIsCreateModalOpen(true);
  };

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError(null);

    const qtyNum = Number(formQuantity);
    const res = registerInventoryDiscard({
      locationId: formLocationId,
      productId: formProductId,
      quantityDiscarded: qtyNum,
      reason: formReason,
      reasonDetails: formReasonDetails,
      lotOrGuideNumber: formLotOrGuide,
    });

    if (!res.success || !res.discard) {
      setCreateError(res.error || 'No se pudo pre-registrar la solicitud de descarga.');
      return;
    }

    setIsCreateModalOpen(false);
    setFeedbackBanner({
      type: 'success',
      message: `Solicitud ${res.discard.referenceCode} pre-registrada en estado PENDIENTE_AUTORIZACION. El stock físico (${currentStockInFormLocation} ${res.discard.unit}) permanece intacto hasta la firma con PIN de Gerencia.`,
    });
  };

  const handleOpenReviewModal = (
    record: InventoryDiscardRecord,
    defaultMode: 'AUTHORIZE' | 'REJECT' = 'AUTHORIZE'
  ) => {
    setReviewError(null);
    setManagerPinInput('');
    setRejectionReasonInput('');
    setReviewDecision(defaultMode);
    setSelectedDiscardForReview(record);
  };

  const handleReviewSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDiscardForReview) return;
    setReviewError(null);

    if (reviewDecision === 'AUTHORIZE') {
      const res = authorizeInventoryDiscard(selectedDiscardForReview.id, managerPinInput);
      if (!res.success || !res.discard) {
        setReviewError(
          res.error || 'Error al autorizar la descarga de inventario.'
        );
        return;
      }

      setSelectedDiscardForReview(null);
      setFeedbackBanner({
        type: 'success',
        message: `Descarga ${res.discard.referenceCode} AUTORIZADA con Doble Firma RBAC. Se descontaron ${res.discard.quantityDiscarded} ${res.discard.unit} de ${res.discard.sku} en ${res.discard.locationCode} (Stock actualizado: ${res.discard.stockBeforeDiscard} -> ${res.discard.stockAfterDiscard}).`,
      });
    } else {
      const res = rejectInventoryDiscard(
        selectedDiscardForReview.id,
        rejectionReasonInput
      );
      if (!res.success || !res.discard) {
        setReviewError(res.error || 'Error al rechazar la solicitud.');
        return;
      }

      setSelectedDiscardForReview(null);
      setFeedbackBanner({
        type: 'success',
        message: `Solicitud ${res.discard.referenceCode} RECHAZADA por Gerencia. La existencia física en ${res.discard.locationCode} se mantuvo intacta.`,
      });
    }
  };

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* Executive Header & Action Toolbar */}
      <div className="bg-slate-900 text-white rounded-xl p-4 sm:p-5 border border-slate-800 shadow-sm flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-mono uppercase tracking-wider bg-rose-500/20 text-rose-300 border border-rose-500/30 font-bold">
              <PackageMinus className="w-3.5 h-3.5" />
              CONTROL ANTI-FRAUDE DE MERMAS Y BAJAS (DOBLE FIRMA)
            </span>
            {pendingDiscardsCount > 0 && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-500 text-slate-950 animate-pulse">
                <ShieldAlert className="w-3.5 h-3.5" />
                {pendingDiscardsCount} PENDIENTE(S) DE FIRMA GERENCIAL
              </span>
            )}
          </div>
          <h1 className="text-lg sm:text-xl font-bold tracking-tight">
            Descargas de Inventario — Gobernanza Dual (Analista → Gerente)
          </h1>
          <p className="text-xs text-slate-300 max-w-3xl">
            Pre-registro técnico por Analista sin alteración de saldos y descuento definitivo
            condicionado exclusivamente a validación y firma con PIN RBAC de Gerencia o
            Superadministrador.
          </p>
        </div>

        {/* Dual Export + New Request CTA */}
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() =>
              exportInventoryDiscardsToExcel({
                discards: filteredDiscards,
                companyProfile: company,
                activeBcvRate: bcvState.activeRate,
                selectedLocationLabel,
              })
            }
            className="min-h-[44px] px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 transition shadow-xs cursor-pointer"
          >
            <FileSpreadsheet className="w-4 h-4 shrink-0" />
            <span>Exportar Sabana .XLSX</span>
          </button>

          <button
            type="button"
            onClick={() =>
              exportInventoryDiscardsToPdf({
                discards: filteredDiscards,
                companyProfile: company,
                activeBcvRate: bcvState.activeRate,
                selectedLocationLabel,
              })
            }
            className="min-h-[44px] px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-100 text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
          >
            <FileText className="w-4 h-4 text-sky-400 shrink-0" />
            <span>Acta Consolidada .PDF</span>
          </button>

          {canCreateRequest && (
            <button
              type="button"
              onClick={handleOpenCreateModal}
              className="min-h-[44px] px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold flex items-center gap-1.5 transition shadow-md cursor-pointer"
            >
              <Plus className="w-4 h-4 shrink-0" />
              <span>Registrar Solicitud de Descarga</span>
            </button>
          )}
        </div>
      </div>

      {/* Feedback Banner */}
      {feedbackBanner && (
        <div
          className={`p-3.5 rounded-xl border text-xs flex items-center justify-between gap-3 ${
            feedbackBanner.type === 'success'
              ? 'bg-emerald-50 border-emerald-300 text-emerald-950'
              : 'bg-rose-50 border-rose-300 text-rose-950'
          }`}
        >
          <div className="flex items-center gap-2.5">
            {feedbackBanner.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            )}
            <span className="font-medium">{feedbackBanner.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedbackBanner(null)}
            className="p-1 text-slate-500 hover:text-slate-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* 4 Executive KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs font-mono uppercase text-slate-500">
            <span>Pendientes de Firma</span>
            <Clock className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-2xl font-mono font-bold text-amber-600 mt-1.5 tabular-nums">
            {kpis.pendingCount} Solicitudes
          </div>
          <div className="text-xs font-mono text-slate-600 mt-1 tabular-nums">
            En espera: <strong>{formatUsd(kpis.pendingUsd)}</strong> ({formatVes(kpis.pendingVes)})
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs font-mono uppercase text-slate-500">
            <span>Pérdida Autorizada (USD)</span>
            <PackageMinus className="w-4 h-4 text-rose-600" />
          </div>
          <div className="text-2xl font-mono font-bold text-rose-700 mt-1.5 tabular-nums">
            {formatUsd(kpis.authorizedUsd)}
          </div>
          <div className="text-xs font-mono text-rose-800 font-semibold mt-1 tabular-nums">
            {formatVes(kpis.authorizedVes)} ({kpis.authorizedCount} actas firmadas)
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs font-mono uppercase text-slate-500">
            <span>Unidades Dadas de Baja</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-mono font-bold text-slate-900 mt-1.5 tabular-nums">
            {kpis.totalUnitsAuthorized} Und/Kg/Lt
          </div>
          <div className="text-xs font-mono text-emerald-700 mt-1">
            Descontadas con PIN RBAC verificado
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs font-mono uppercase text-slate-500">
            <span>Bajas Rechazadas / Bloqueadas</span>
            <XCircle className="w-4 h-4 text-slate-500" />
          </div>
          <div className="text-2xl font-mono font-bold text-slate-800 mt-1.5 tabular-nums">
            {kpis.rejectedCount} Registros
          </div>
          <div className="text-xs font-mono text-slate-500 mt-1">
            Existencia preservada sin descuento
          </div>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-xs space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          {/* Status Tabs */}
          <div className="flex flex-wrap items-center gap-1.5">
            {(
              [
                { id: 'ALL', label: `Todas (${discards.length})` },
                {
                  id: 'PENDIENTE_AUTORIZACION',
                  label: `Pendientes de Firma (${
                    discards.filter((d) => d.status === 'PENDIENTE_AUTORIZACION').length
                  })`,
                },
                {
                  id: 'AUTORIZADA',
                  label: `Autorizadas (${
                    discards.filter((d) => d.status === 'AUTORIZADA').length
                  })`,
                },
                {
                  id: 'RECHAZADA',
                  label: `Rechazadas (${
                    discards.filter((d) => d.status === 'RECHAZADA').length
                  })`,
                },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setStatusFilter(tab.id)}
                className={`min-h-[40px] px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                  statusFilter === tab.id
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Active RBAC Authority Indicator */}
          <div className="flex items-center gap-2 text-xs bg-slate-100 border border-slate-200 px-3 py-1.5 rounded-lg">
            <UserCheck className="w-4 h-4 text-sky-600 shrink-0" />
            <span className="text-slate-600">
              Sesión: <strong>{user?.displayName}</strong> ({user?.role}) —{' '}
              {canAuthorizeOrReject ? (
                <span className="text-emerald-700 font-bold">
                  Habilitado para Firmar / Autorizar Bajas
                </span>
              ) : (
                <span className="text-amber-700 font-semibold">
                  Modo Pre-Registro (Requiere firma de Gerente)
                </span>
              )}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 pt-2 border-t border-slate-100">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar por código BAJA, SKU, producto, analista o lote..."
              className="w-full min-h-[42px] pl-9 pr-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600"
            />
          </div>

          <div className="flex items-center gap-2">
            <Building2 className="w-4 h-4 text-slate-500 shrink-0" />
            <select
              aria-label="Filtrar por Sede o Depósito"
              value={selectedLocationId}
              onChange={(e) => setSelectedLocationId(e.target.value)}
              className="w-full min-h-[42px] px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white font-semibold text-slate-800 focus:outline-none focus:border-sky-600"
            >
              <option value="ALL">Todas las Sedes y Depósitos ({locations.length})</option>
              {locations.map((loc) => (
                <option key={loc.id} value={loc.id}>
                  [{loc.code}] {loc.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-slate-500 shrink-0" />
            <select
              aria-label="Filtrar por Causa de Descarga"
              value={reasonFilter}
              onChange={(e) => setReasonFilter(e.target.value as 'ALL' | DiscardReason)}
              className="w-full min-h-[42px] px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white font-semibold text-slate-800 focus:outline-none focus:border-sky-600"
            >
              <option value="ALL">Todas las Causas Estandarizadas (6)</option>
              {DISCARD_REASON_CATALOG.map((item) => (
                <option key={item.code} value={item.code}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Desktop Formal Table (visible on md and up) */}
      <div className="hidden md:block bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-900 text-slate-200 text-[10px] font-mono uppercase tracking-wider">
                <th className="py-3 px-3.5">Ref. / Fecha VET</th>
                <th className="py-3 px-3">Sede / Depósito</th>
                <th className="py-3 px-3">SKU / Producto</th>
                <th className="py-3 px-3 text-right">Cant. Baja</th>
                <th className="py-3 px-3 text-center">Auditoría Stock</th>
                <th className="py-3 px-3 text-right">Pérdida USD / Bs.</th>
                <th className="py-3 px-3">Causa y Justificación</th>
                <th className="py-3 px-3">Analista Solicitante</th>
                <th className="py-3 px-3">Estado / Firma Gerencia</th>
                <th className="py-3 px-3.5 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-xs">
              {filteredDiscards.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-10 text-center text-slate-500">
                    No se encontraron registros de descargas o mermas para los filtros seleccionados.
                  </td>
                </tr>
              ) : (
                filteredDiscards.map((d) => (
                  <tr
                    key={d.id}
                    className={`hover:bg-slate-50 transition ${
                      d.status === 'PENDIENTE_AUTORIZACION' ? 'bg-amber-50/40' : ''
                    }`}
                  >
                    <td className="py-3 px-3.5 align-top whitespace-nowrap">
                      <div className="font-mono font-bold text-slate-900">{d.referenceCode}</div>
                      <div className="text-[11px] font-mono text-slate-500">
                        {d.createdAtVet.replace('T', ' ').slice(0, 16)}
                      </div>
                    </td>

                    <td className="py-3 px-3 align-top">
                      <span className="inline-block font-mono font-bold text-[11px] px-2 py-0.5 rounded bg-slate-900 text-sky-300">
                        {d.locationCode}
                      </span>
                      <div className="text-[11px] text-slate-600 mt-0.5 line-clamp-1">
                        {d.locationName}
                      </div>
                    </td>

                    <td className="py-3 px-3 align-top">
                      <div className="font-mono font-bold text-sky-800">{d.sku}</div>
                      <div className="font-semibold text-slate-900">{d.productName}</div>
                      <div className="text-[10px] text-slate-500">{d.category}</div>
                    </td>

                    <td className="py-3 px-3 align-top text-right font-mono font-bold text-rose-700 whitespace-nowrap tabular-nums">
                      -{d.quantityDiscarded} {d.unit}
                    </td>

                    <td className="py-3 px-3 align-top text-center font-mono text-[11px] whitespace-nowrap tabular-nums">
                      {d.status === 'AUTORIZADA' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-50 text-emerald-900 border border-emerald-200 font-bold">
                          {d.stockBeforeDiscard} <ArrowRight className="w-3 h-3" />{' '}
                          {d.stockAfterDiscard} {d.unit}
                        </span>
                      ) : d.status === 'RECHAZADA' ? (
                        <span className="inline-block px-2 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
                          Intacto ({d.stockBeforeDiscard} {d.unit})
                        </span>
                      ) : (
                        <span className="inline-block px-2 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-300 font-semibold">
                          En Reserva ({d.stockBeforeDiscard} {d.unit})
                        </span>
                      )}
                    </td>

                    <td className="py-3 px-3 align-top text-right font-mono whitespace-nowrap tabular-nums">
                      <div className="font-bold text-slate-900">{formatUsd(d.totalCostUsd)}</div>
                      <div className="text-[11px] text-rose-700 font-semibold">
                        {formatVes(d.totalCostVes)}
                      </div>
                      <div className="text-[10px] text-slate-400">
                        Costo Unit: {formatUsd(d.unitCostUsd)}
                      </div>
                    </td>

                    <td className="py-3 px-3 align-top max-w-[240px]">
                      <span
                        className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded border ${getDiscardReasonBadgeClass(
                          d.reason
                        )}`}
                      >
                        {getDiscardReasonLabel(d.reason)}
                      </span>
                      <p className="text-[11px] text-slate-700 mt-1 leading-snug">
                        {d.reasonDetails}
                      </p>
                      {d.lotOrGuideNumber && (
                        <div className="text-[10px] font-mono text-slate-500 mt-0.5">
                          Lote/Guía: {d.lotOrGuideNumber}
                        </div>
                      )}
                    </td>

                    <td className="py-3 px-3 align-top">
                      <div className="font-semibold text-slate-900">{d.createdByDisplayName}</div>
                      <div className="text-[10px] font-mono text-slate-500">{d.createdByEmail}</div>
                    </td>

                    <td className="py-3 px-3 align-top">
                      {d.status === 'AUTORIZADA' && (
                        <div className="space-y-0.5">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-900 border border-emerald-300">
                            <CheckCircle2 className="w-3 h-3 text-emerald-700" />
                            AUTORIZADA (PIN RBAC)
                          </span>
                          <div className="text-[11px] font-semibold text-slate-800">
                            {d.authorizedByDisplayName}
                          </div>
                          <div className="text-[10px] font-mono text-slate-500">
                            {d.authorizedAtVet?.replace('T', ' ').slice(0, 16)}
                          </div>
                        </div>
                      )}

                      {d.status === 'PENDIENTE_AUTORIZACION' && (
                        <div className="space-y-1">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
                            <Clock className="w-3 h-3 text-amber-700" />
                            PENDIENTE FIRMA GERENCIA
                          </span>
                          <div className="text-[10px] text-slate-500">
                            Stock no descontado aún
                          </div>
                        </div>
                      )}

                      {d.status === 'RECHAZADA' && (
                        <div className="space-y-0.5">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-900 border border-rose-300">
                            <XCircle className="w-3 h-3 text-rose-700" />
                            RECHAZADA POR GERENCIA
                          </span>
                          <div className="text-[11px] text-rose-800 font-medium">
                            Motivo: {d.rejectionReason}
                          </div>
                        </div>
                      )}
                    </td>

                    <td className="py-3 px-3.5 align-top text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1.5">
                        {d.status === 'PENDIENTE_AUTORIZACION' && canAuthorizeOrReject && (
                          <button
                            type="button"
                            onClick={() => handleOpenReviewModal(d, 'AUTHORIZE')}
                            className="min-h-[38px] px-2.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-[11px] flex items-center gap-1 shadow-xs transition cursor-pointer"
                          >
                            <Lock className="w-3.5 h-3.5" />
                            <span>Firmar / Decidir</span>
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() =>
                            exportInventoryDiscardsToPdf({
                              discards: [d],
                              companyProfile: company,
                              activeBcvRate: bcvState.activeRate,
                              selectedLocationLabel,
                              singleRecord: d,
                            })
                          }
                          title="Descargar Acta Individual PDF con Cuadro de Doble Firma"
                          className="min-h-[38px] px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 font-semibold text-[11px] flex items-center gap-1 transition cursor-pointer"
                        >
                          <FileText className="w-3.5 h-3.5 text-sky-700" />
                          <span>Acta PDF</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile Smartphone Cards (visible below md, 44x44px ergonomic touch targets) */}
      <div className="md:hidden space-y-3">
        {filteredDiscards.map((d) => (
          <div
            key={d.id}
            className={`bg-white border rounded-xl p-4 shadow-xs space-y-3 ${
              d.status === 'PENDIENTE_AUTORIZACION'
                ? 'border-amber-400 bg-amber-50/20'
                : 'border-slate-200'
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="font-mono font-bold text-xs text-slate-900">
                    {d.referenceCode}
                  </span>
                  <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-slate-900 text-sky-300 font-bold">
                    {d.locationCode}
                  </span>
                </div>
                <div className="font-bold text-sm text-slate-900 mt-1">{d.productName}</div>
                <div className="font-mono text-xs text-sky-700 font-semibold">{d.sku}</div>
              </div>

              <div className="text-right font-mono">
                <div className="text-sm font-bold text-rose-700">
                  -{d.quantityDiscarded} {d.unit}
                </div>
                <div className="text-xs font-bold text-slate-900">{formatUsd(d.totalCostUsd)}</div>
                <div className="text-[11px] text-rose-700">{formatVes(d.totalCostVes)}</div>
              </div>
            </div>

            <div className="text-xs space-y-1 bg-slate-50 p-2.5 rounded-lg border border-slate-200">
              <div>
                <span
                  className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded border ${getDiscardReasonBadgeClass(
                    d.reason
                  )}`}
                >
                  {getDiscardReasonLabel(d.reason)}
                </span>
              </div>
              <p className="text-slate-700">{d.reasonDetails}</p>
              <div className="text-[11px] text-slate-500 pt-1 border-t border-slate-200 flex items-center justify-between">
                <span>Solicitó: {d.createdByDisplayName}</span>
                <span className="font-mono">{d.createdAtVet.slice(0, 10)}</span>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              {d.status === 'PENDIENTE_AUTORIZACION' && canAuthorizeOrReject && (
                <button
                  type="button"
                  onClick={() => handleOpenReviewModal(d, 'AUTHORIZE')}
                  className="min-h-[44px] flex-1 px-3 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-1.5 shadow-xs cursor-pointer"
                >
                  <Lock className="w-4 h-4" />
                  <span>Autorizar / Rechazar con PIN</span>
                </button>
              )}

              <button
                type="button"
                onClick={() =>
                  exportInventoryDiscardsToPdf({
                    discards: [d],
                    companyProfile: company,
                    activeBcvRate: bcvState.activeRate,
                    selectedLocationLabel,
                    singleRecord: d,
                  })
                }
                className="min-h-[44px] px-3.5 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <FileText className="w-4 h-4 text-sky-700" />
                <span>Acta PDF</span>
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* MODAL 1: Pre-Registro por Analista (No descuenta stock hasta firma de Gerencia) */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-xl w-full shadow-2xl overflow-hidden text-slate-900">
            <div className="px-5 py-4 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <PackageMinus className="w-5 h-5 text-rose-400" />
                <div>
                  <h2 className="text-sm font-bold">
                    Registrar Solicitud de Descarga de Inventario (Paso 1: Analista)
                  </h2>
                  <p className="text-[11px] text-slate-400">
                    Pre-registro auditado · El stock físico queda en reserva hasta autorización
                    gerencial
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsCreateModalOpen(false)}
                className="text-slate-400 hover:text-white p-1.5 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="p-5 space-y-4 text-xs max-h-[85vh] overflow-y-auto">
              {createError && (
                <div className="p-3 rounded-lg bg-rose-50 border border-rose-300 text-rose-900 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{createError}</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Sede o Depósito del Evento *
                  </label>
                  <select
                    required
                    value={formLocationId}
                    onChange={(e) => setFormLocationId(e.target.value)}
                    className="w-full min-h-[42px] px-3 py-2 border border-slate-300 rounded-lg font-semibold bg-white"
                  >
                    {locations.map((loc) => (
                      <option key={loc.id} value={loc.id}>
                        [{loc.code}] {loc.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Producto / SKU Afectado *
                  </label>
                  <select
                    required
                    value={formProductId}
                    onChange={(e) => setFormProductId(e.target.value)}
                    className="w-full min-h-[42px] px-3 py-2 border border-slate-300 rounded-lg font-semibold bg-white"
                  >
                    {products.map((p) => {
                      const st = p.stockByLocation[formLocationId] ?? 0;
                      return (
                        <option key={p.id} value={p.id}>
                          {p.sku} — {p.name} (Stock: {st} {p.unit})
                        </option>
                      );
                    })}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Cantidad Física a Descargar ({selectedFormProduct?.unit || 'UND'}) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    max={Math.max(0.01, currentStockInFormLocation)}
                    required
                    value={formQuantity}
                    onChange={(e) => setFormQuantity(e.target.value)}
                    className="w-full min-h-[42px] px-3 py-2 border border-slate-300 rounded-lg font-mono font-bold text-sm"
                  />
                  <div className="text-[11px] font-mono text-slate-500 mt-1">
                    Existencia actual en sede:{' '}
                    <strong className="text-slate-900">
                      {currentStockInFormLocation} {selectedFormProduct?.unit}
                    </strong>
                  </div>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    N° de Lote / Guía de Merma (Opcional)
                  </label>
                  <input
                    type="text"
                    placeholder="Ej. LOTE-2026-09 / ACTA-04"
                    value={formLotOrGuide}
                    onChange={(e) => setFormLotOrGuide(e.target.value)}
                    className="w-full min-h-[42px] px-3 py-2 border border-slate-300 rounded-lg font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Causa Estandarizada de Descarga *
                </label>
                <select
                  required
                  value={formReason}
                  onChange={(e) => setFormReason(e.target.value as DiscardReason)}
                  className="w-full min-h-[42px] px-3 py-2 border border-slate-300 rounded-lg font-semibold bg-white"
                >
                  {DISCARD_REASON_CATALOG.map((item) => (
                    <option key={item.code} value={item.code}>
                      {item.label} — {item.description}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Justificación Técnica Detallada (Auditoría Forense) *
                </label>
                <textarea
                  rows={3}
                  required
                  placeholder="Describa las circunstancias exactas del vencimiento, deterioro de empaque, rotura o ajuste..."
                  value={formReasonDetails}
                  onChange={(e) => setFormReasonDetails(e.target.value)}
                  className="w-full p-3 border border-slate-300 rounded-lg text-xs"
                />
              </div>

              {/* Real-Time Loss Valuation Box */}
              <div className="p-3.5 rounded-xl bg-slate-900 text-white space-y-2 border border-slate-800">
                <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono uppercase">
                  <span>Valoración de Pérdida Patrimonial (Decimal.js)</span>
                  <span>Tasa BCV: Bs. {bcvState.activeRate.toFixed(2)}/USD</span>
                </div>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div className="text-lg font-mono font-bold text-rose-400 tabular-nums">
                    Pérdida USD: {formatUsd(liveLossPreview.totalCostUsd)}
                  </div>
                  <div className="text-sm font-mono font-bold text-amber-300 tabular-nums">
                    Equivalente BCV: {formatVes(liveLossPreview.totalCostVes)}
                  </div>
                </div>
                <div className="text-[11px] text-sky-300 pt-1 border-t border-slate-800">
                  <strong>LÍNEA ROJA CONTABLE:</strong> Al guardar, esta solicitud quedará en estado{' '}
                  <span className="font-mono underline">PENDIENTE_AUTORIZACION</span>. El stock no
                  se descontará hasta que el Gerente ingrese su PIN de seguridad.
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="min-h-[44px] px-4 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-100 font-semibold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="min-h-[44px] px-5 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-bold flex items-center gap-1.5 shadow-md cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>Guardar Pre-Registro (Enviar a Gerencia)</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: Verificación y Autorización con Doble Firma por Gerencia (PIN RBAC) */}
      {selectedDiscardForReview && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-lg w-full shadow-2xl overflow-hidden text-slate-900">
            <div className="px-5 py-4 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Lock className="w-5 h-5 text-amber-400" />
                <div>
                  <h2 className="text-sm font-bold">
                    Doble Firma Gerencial — Solicitud {selectedDiscardForReview.referenceCode}
                  </h2>
                  <p className="text-[11px] text-slate-400">
                    Auditoría cruzada obligatoria Analista → Gerente
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedDiscardForReview(null)}
                className="text-slate-400 hover:text-white p-1.5 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleReviewSubmit} className="p-5 space-y-4 text-xs">
              {/* Summary of Analyst Pre-registration */}
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-mono font-bold text-slate-900">
                    [{selectedDiscardForReview.locationCode}]{' '}
                    {selectedDiscardForReview.locationName}
                  </span>
                  <span className="font-mono font-bold text-rose-700 text-sm">
                    -{selectedDiscardForReview.quantityDiscarded} {selectedDiscardForReview.unit}
                  </span>
                </div>
                <div className="font-bold text-sm text-slate-900">
                  {selectedDiscardForReview.sku} — {selectedDiscardForReview.productName}
                </div>
                <div className="text-slate-600">
                  <strong>Causa:</strong> {getDiscardReasonLabel(selectedDiscardForReview.reason)}
                </div>
                <div className="text-slate-700 italic">
                  "{selectedDiscardForReview.reasonDetails}"
                </div>
                <div className="pt-1.5 border-t border-slate-200 flex items-center justify-between font-mono text-[11px]">
                  <span>
                    Solicitado por: <strong>{selectedDiscardForReview.createdByDisplayName}</strong>
                  </span>
                  <span className="font-bold text-rose-700">
                    Pérdida: {formatUsd(selectedDiscardForReview.totalCostUsd)} (
                    {formatVes(selectedDiscardForReview.totalCostVes)})
                  </span>
                </div>
              </div>

              {reviewError && (
                <div className="p-3 rounded-lg bg-rose-50 border border-rose-300 text-rose-900 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{reviewError}</span>
                </div>
              )}

              {/* Decision Toggle */}
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => setReviewDecision('AUTHORIZE')}
                  className={`min-h-[44px] p-2.5 rounded-xl border font-bold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer ${
                    reviewDecision === 'AUTHORIZE'
                      ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                      : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Autorizar y Descontar Stock</span>
                </button>

                <button
                  type="button"
                  onClick={() => setReviewDecision('REJECT')}
                  className={`min-h-[44px] p-2.5 rounded-xl border font-bold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer ${
                    reviewDecision === 'REJECT'
                      ? 'bg-rose-600 text-white border-rose-600 shadow-sm'
                      : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <XCircle className="w-4 h-4" />
                  <span>Rechazar Solicitud</span>
                </button>
              </div>

              {reviewDecision === 'AUTHORIZE' ? (
                <div className="p-3.5 rounded-xl bg-slate-900 text-white space-y-2 border border-slate-800">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[11px] font-bold text-amber-300 flex items-center gap-1.5">
                      <Lock className="w-3.5 h-3.5" />
                      PIN DE AUTORIZACIÓN GERENCIAL RBAC *
                    </span>
                    <span className="text-[10px] font-mono text-slate-400">
                      Credencial Confidencial RBAC
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-300">
                    Ingrese su PIN confidencial de Gerencia o Superadministrador para autorizar el
                    descargo físico y contable del inventario.
                  </p>
                  <input
                    type="password"
                    autoComplete="off"
                    inputMode="numeric"
                    maxLength={10}
                    required
                    placeholder="Ingrese PIN de Autorización"
                    value={managerPinInput}
                    onChange={(e) => setManagerPinInput(e.target.value)}
                    className="w-full min-h-[42px] px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white font-mono text-sm focus:outline-none focus:border-emerald-500"
                  />
                  <p className="text-[11px] text-slate-300">
                    Al confirmar, se descontarán{' '}
                    <strong>
                      {selectedDiscardForReview.quantityDiscarded}{' '}
                      {selectedDiscardForReview.unit}
                    </strong>{' '}
                    del catálogo maestro en{' '}
                    <strong>{selectedDiscardForReview.locationCode}</strong> y se registrará su
                    firma digital inmutable.
                  </p>
                  <p className="text-[10px] text-slate-400 italic pt-1 border-t border-slate-800">
                    En caso de extravío u olvido de su PIN, contacte al Superadministrador para el
                    restablecimiento de credenciales.
                  </p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <label className="block font-bold text-slate-700">
                    Motivo de Rechazo de la Solicitud *
                  </label>
                  <textarea
                    rows={3}
                    required
                    placeholder="Explique por qué se improbó esta solicitud de baja (ej. conteo físico rectificado, producto apto para reempaque)..."
                    value={rejectionReasonInput}
                    onChange={(e) => setRejectionReasonInput(e.target.value)}
                    className="w-full p-3 border border-slate-300 rounded-lg text-xs"
                  />
                  <p className="text-[11px] text-slate-500">
                    La existencia física en <strong>{selectedDiscardForReview.locationCode}</strong>{' '}
                    permanecerá intacta.
                  </p>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setSelectedDiscardForReview(null)}
                  className="min-h-[44px] px-4 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-100 font-semibold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className={`min-h-[44px] px-5 py-2 rounded-lg text-white font-bold flex items-center gap-1.5 shadow-md cursor-pointer ${
                    reviewDecision === 'AUTHORIZE'
                      ? 'bg-emerald-600 hover:bg-emerald-500'
                      : 'bg-rose-600 hover:bg-rose-500'
                  }`}
                >
                  {reviewDecision === 'AUTHORIZE' ? (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Confirmar Firma y Ejecutar Baja</span>
                    </>
                  ) : (
                    <>
                      <XCircle className="w-4 h-4" />
                      <span>Confirmar Rechazo (Sin Descuento)</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default InventoryDiscardsView;
