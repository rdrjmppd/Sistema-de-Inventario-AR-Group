import React, { useState, useMemo, useEffect } from 'react';
import {
  Search,
  Plus,
  FileSpreadsheet,
  FileText,
  PackageCheck,
  AlertTriangle,
  Check,
  ChevronDown,
  RotateCcw,
  Building2,
  CalendarRange,
  History,
  Truck,
  TrendingUp,
  X,
  Clock,
  LayoutGrid,
  Table2,
  Eye,
  Download,
  Edit3,
  MapPin,
} from 'lucide-react';
import { useInventory } from '../../context/InventoryContext';
import { useFinance } from '../../context/FinanceContext';
import { useAuth } from '../../context/AuthContext';
import { useUIConfig } from '../../context/UIConfigContext';
import { Product, UserRole } from '../../types';
import {
  formatUsd,
  formatVes,
  convertUsdToVes,
  calculateGrossMarginPercent,
  calculatePriceFromMargin,
  toDecimal,
  round2,
} from '../../lib/decimal';
import {
  CATALOG_BATCH_SIZE,
  getCatalogBatchSlice,
  buildAndFilterProductHistoryReport,
} from '../../lib/catalog-pagination';
import {
  exportInventoryDualSheetExcel,
  buildEnterpriseExcelStructuredPayload,
  DEFAULT_COMPANY_PROFILE,
} from '../../lib/excel-exporter';
import { exportExecutiveInventoryPdf } from '../../lib/pdf-exporter';
import { getCaracasNow } from '../../lib/bcv';

export const ProductCatalog: React.FC = () => {
  const {
    products,
    locations,
    purchaseOrders,
    manualReceipts,
    salesEvents,
    transfers,
    selectedLocationId,
    setIsAddLocationModalOpen,
    addOrUpdateProduct,
  } = useInventory();
  const { bcvState, suppliers } = useFinance();
  const { hasPermission } = useAuth();
  const { config, setIsCompanyModalOpen } = useUIConfig();
  const companyProfile = config.companyProfile || DEFAULT_COMPANY_PROFILE;

  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [visibleCount, setVisibleCount] = useState<number>(CATALOG_BATCH_SIZE);
  const [viewMode, setViewMode] = useState<'AUTO' | 'TABLE' | 'CARDS'>('AUTO');
  const [showExcelPreviewModal, setShowExcelPreviewModal] = useState(false);
  const [excelPreviewSheet, setExcelPreviewSheet] = useState<
    'MATRIZ' | 'FICHAS' | 'RESUMEN'
  >('MATRIZ');
  const [showModal, setShowModal] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  // Selected Product for Rotation & Order/Reception Date History Inspector
  const todayIso = useMemo(() => getCaracasNow().isoTimestamp.slice(0, 10), []);
  const defaultFromIso = useMemo(() => {
    const parts = todayIso.split('-').map(Number);
    const dt = new Date(Date.UTC(parts[0] || 2026, (parts[1] || 10) - 1, parts[2] || 24));
    dt.setUTCDate(dt.getUTCDate() - 60);
    return dt.toISOString().slice(0, 10);
  }, [todayIso]);

  const [selectedProductForHistory, setSelectedProductForHistory] = useState<Product | null>(null);
  const [historyFromDate, setHistoryFromDate] = useState<string>(defaultFromIso);
  const [historyToDate, setHistoryToDate] = useState<string>(todayIso);
  const [historyLocationFilter, setHistoryLocationFilter] = useState<string>('ALL');

  const [sku, setSku] = useState('');
  const [barcode, setBarcode] = useState('');
  const [name, setName] = useState('');
  const [category, setCategory] = useState('Víveres Secos');
  const [unit, setUnit] = useState<Product['unit']>('UND');
  const [costUsd, setCostUsd] = useState('1.00');
  const [marginPct, setMarginPct] = useState('28.00');
  const [ivaRate, setIvaRate] = useState<0 | 8 | 16>(0);
  const [initialStocksByLoc, setInitialStocksByLoc] = useState<Record<string, string>>({});

  const canEdit = hasPermission([UserRole.SUPERADMIN, UserRole.GERENTE, UserRole.ANALISTA]);

  const applyDatePresetDays = (daysBack: number) => {
    const parts = todayIso.split('-').map(Number);
    const dt = new Date(Date.UTC(parts[0] || 2026, (parts[1] || 10) - 1, parts[2] || 24));
    dt.setUTCDate(dt.getUTCDate() - daysBack);
    setHistoryFromDate(dt.toISOString().slice(0, 10));
    setHistoryToDate(todayIso);
  };

  const productHistoryReport = useMemo(() => {
    if (!selectedProductForHistory) return null;
    const liveProduct =
      products.find((p) => p.id === selectedProductForHistory.id) || selectedProductForHistory;
    return buildAndFilterProductHistoryReport({
      product: liveProduct,
      locations,
      purchaseOrders,
      manualReceipts,
      salesEvents,
      transfers,
      fromDate: historyFromDate,
      toDate: historyToDate,
      locationFilterId: historyLocationFilter,
      activeBcvRate: bcvState.activeRate,
      referenceEndDate: todayIso,
    });
  }, [
    selectedProductForHistory,
    products,
    locations,
    purchaseOrders,
    manualReceipts,
    salesEvents,
    transfers,
    historyFromDate,
    historyToDate,
    historyLocationFilter,
    bcvState.activeRate,
    todayIso,
  ]);

  // Reset batch window to 20 whenever search, category, or Sede/Depósito filter changes
  useEffect(() => {
    setVisibleCount(CATALOG_BATCH_SIZE);
  }, [search, categoryFilter, selectedLocationId]);

  const categories = useMemo(() => {
    const set = new Set<string>(products.map((p) => p.category));
    return ['ALL', ...Array.from(set)];
  }, [products]);

  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      const matchesCat = categoryFilter === 'ALL' || p.category === categoryFilter;
      const q = search.trim().toLowerCase();
      const matchesSearch =
        !q ||
        p.name.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        p.barcode.toLowerCase().includes(q);
      return matchesCat && matchesSearch;
    });
  }, [products, categoryFilter, search]);

  // Progressive 20-by-20 batch pagination to prevent DOM/memory collapse
  const batchSlice = useMemo(() => {
    return getCatalogBatchSlice(filteredProducts, visibleCount, CATALOG_BATCH_SIZE);
  }, [filteredProducts, visibleCount]);

  // Enterprise Excel Structured Payload for preview and verification
  const enterpriseExcelPayload = useMemo(() => {
    if (!showExcelPreviewModal) return null;
    return buildEnterpriseExcelStructuredPayload(
      filteredProducts,
      locations,
      bcvState,
      companyProfile
    );
  }, [showExcelPreviewModal, filteredProducts, locations, bcvState, companyProfile]);

  const handleLoadNextBatch = () => {
    setVisibleCount((prev) => prev + CATALOG_BATCH_SIZE);
  };

  const handleResetToFirstBatch = () => {
    setVisibleCount(CATALOG_BATCH_SIZE);
  };

  const getStockForSelection = (product: Product) => {
    if (selectedLocationId === 'ALL') {
      return locations.reduce(
        (acc, loc) => round2(toDecimal(acc).plus(product.stockByLocation[loc.id] ?? 0)),
        0
      );
    }
    return product.stockByLocation[selectedLocationId] ?? 0;
  };

  const getMinStockForSelection = (product: Product) => {
    if (selectedLocationId === 'ALL') {
      return locations.reduce(
        (acc, loc) => round2(toDecimal(acc).plus(product.minStockByLocation[loc.id] ?? 0)),
        0
      );
    }
    return product.minStockByLocation[selectedLocationId] ?? 0;
  };

  const handleExportExcel = () => {
    exportInventoryDualSheetExcel(products, locations, bcvState, companyProfile);
    setFeedback(
      `Tabla Formal Ejecutiva .XLSX (${companyProfile.razonSocial} · RIF ${companyProfile.rif}) descargada con firma legal © 2026 AR Group.`
    );
    setTimeout(() => setFeedback(null), 4000);
  };

  const handleExportPdf = () => {
    exportExecutiveInventoryPdf(products, locations, bcvState, companyProfile);
    setFeedback(
      `Reporte Ejecutivo PDF (${companyProfile.razonSocial} · RIF ${companyProfile.rif}) exportado con firma legal © 2026 AR Group.`
    );
    setTimeout(() => setFeedback(null), 4000);
  };

  const handleOpenCreateProductModal = () => {
    const defaults: Record<string, string> = {};
    for (const loc of locations) {
      defaults[loc.id] = loc.type === 'DEPOSITO' || loc.type === 'CEDIS' ? '250' : '100';
    }
    setInitialStocksByLoc(defaults);
    setShowModal(true);
  };

  const handleSaveNewProduct = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !sku.trim()) return;
    const cost = Math.max(0.01, parseFloat(costUsd) || 1);
    const margin = Math.min(95, Math.max(1, parseFloat(marginPct) || 28));
    const price = calculatePriceFromMargin(cost, margin);

    const stockByLocation: Record<string, number> = {};
    const minStockByLocation: Record<string, number> = {};
    for (const loc of locations) {
      stockByLocation[loc.id] = Math.max(0, parseFloat(initialStocksByLoc[loc.id] || '0') || 0);
      minStockByLocation[loc.id] =
        loc.type === 'DEPOSITO' || loc.type === 'CEDIS' ? 120 : 50;
    }

    const newProduct: Product = {
      id: `prd-${Date.now()}`,
      sku: sku.trim().toUpperCase(),
      barcode: barcode.trim() || `759100${Math.floor(1000000 + Math.random() * 9000000)}`,
      name: name.trim(),
      category,
      unit,
      costUsd: round2(cost),
      targetMarginPercent: round2(margin),
      priceUsd: price,
      ivaRate,
      stockByLocation,
      minStockByLocation,
      monthlyUnitsSold: 180,
      abcClass: 'B',
      supplierId: suppliers[0]?.id || 'sup-001',
      lastUpdatedVet: getCaracasNow().isoTimestamp,
    };

    addOrUpdateProduct(newProduct);
    setShowModal(false);
    setSku('');
    setBarcode('');
    setName('');
    setFeedback(
      `SKU ${newProduct.sku} incorporado al Catálogo Maestro (${locations.length} Sedes / Depósitos).`
    );
    setTimeout(() => setFeedback(null), 4000);
  };

  return (
    <div className="space-y-4">
      {/* Executive Two-Tier Header Card (Eliminates Horizontal Flex Squeezing on All Resolutions) */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 shadow-xs space-y-3.5">
        {/* Tier 1: Full-Width Title, Status Badges & Active Company Fiscal Identity */}
        <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-3">
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="flex items-center gap-2.5">
              <div className="p-1.5 rounded-lg bg-sky-50 border border-sky-200 text-sky-600 shrink-0">
                <PackageCheck className="w-5 h-5" />
              </div>
              <h1 className="text-base sm:text-lg font-extrabold text-slate-900 tracking-tight">
                Catálogo Maestro Multi-Sede / Depósito &amp; Existencias Multi-Moneda
              </h1>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <span className="px-2 py-0.5 rounded-md bg-sky-50 border border-sky-200 text-sky-800 font-mono text-[10px] font-bold whitespace-nowrap">
                CARGA POR LOTES DE 20 PRODUCTOS
              </span>
              <span className="px-2 py-0.5 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-800 font-mono text-[10px] font-bold whitespace-nowrap">
                TABLA FORMAL EJECUTIVA (.XLSX)
              </span>
              <span className="text-xs text-slate-600">
                Indexación automática USD / VES según tasa activa BCV (
                <strong className="font-mono text-slate-900">
                  Bs. {bcvState.activeRate.toFixed(2)} / USD
                </strong>
                ) · Mostrando <strong>{batchSlice.visibleCount}</strong> de{' '}
                <strong>{batchSlice.totalItems}</strong> productos en{' '}
                <strong>{locations.length}</strong> Sedes / Depósitos.
              </span>
            </div>
          </div>

          {/* Active Company Fiscal Identity Pill + Edit Button */}
          <div className="flex flex-wrap items-center justify-between sm:justify-end gap-2.5 bg-slate-900 text-white px-3.5 py-2.5 rounded-xl border border-slate-800 shrink-0">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 text-[10px] font-mono uppercase text-sky-400">
                <Building2 className="w-3.5 h-3.5 shrink-0" />
                <span>EMPRESA TITULAR:</span>
                <span className="text-emerald-400 font-bold">{companyProfile.rif}</span>
              </div>
              <div className="text-xs font-bold text-white truncate max-w-[240px] sm:max-w-[300px]">
                {companyProfile.razonSocial}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsCompanyModalOpen(true)}
              className="min-h-[36px] px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-sky-600 text-sky-200 hover:text-white border border-slate-700 text-[11px] font-semibold flex items-center gap-1 transition cursor-pointer shrink-0"
              title="Configurar Razón Social, RIF y Dirección Fiscal de la Empresa"
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>Datos Empresa</span>
            </button>
          </div>
        </div>

        {/* Tier 2: Dedicated Executive Action Toolbar (Never Squeezes Title or Overflows) */}
        <div className="pt-3 border-t border-slate-100 grid grid-cols-1 sm:flex sm:flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setIsAddLocationModalOpen(true)}
            className="min-h-[44px] sm:min-h-[38px] flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 text-xs font-semibold transition whitespace-nowrap cursor-pointer"
            title="Añadir nueva Sede o nuevo Depósito"
          >
            <Plus className="w-4 h-4 text-sky-600 shrink-0" />
            <Building2 className="w-3.5 h-3.5 text-slate-600 shrink-0" />
            <span>+ Sede o Depósito</span>
          </button>

          <button
            type="button"
            onClick={() => setShowExcelPreviewModal(true)}
            className="min-h-[44px] sm:min-h-[38px] flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-950 border border-emerald-300 text-xs font-bold transition whitespace-nowrap cursor-pointer"
            title="Inspeccionar Tabla Formal Ejecutiva Producto/Celda con Encabezado de Empresa antes de descargar"
          >
            <Eye className="w-4 h-4 text-emerald-700 shrink-0" />
            <span>Vista Producto/Celda (.xlsx)</span>
          </button>

          <button
            type="button"
            onClick={handleExportExcel}
            className="min-h-[44px] sm:min-h-[38px] flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-semibold transition shadow-2xs whitespace-nowrap cursor-pointer"
          >
            <FileSpreadsheet className="w-4 h-4 shrink-0" />
            <span>Exportar Sabana Dual (.xlsx)</span>
          </button>

          <button
            type="button"
            onClick={handleExportPdf}
            className="min-h-[44px] sm:min-h-[38px] flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold transition shadow-2xs whitespace-nowrap cursor-pointer"
          >
            <FileText className="w-4 h-4 shrink-0" />
            <span>Reporte Ejecutivo (.pdf)</span>
          </button>

          {canEdit && (
            <button
              type="button"
              onClick={handleOpenCreateProductModal}
              className="min-h-[44px] sm:min-h-[38px] sm:ml-auto flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold transition shadow-2xs whitespace-nowrap cursor-pointer"
            >
              <Plus className="w-4 h-4 shrink-0" />
              <span>+ Nuevo SKU</span>
            </button>
          )}
        </div>
      </div>

      {feedback && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-900 px-4 py-2.5 rounded-lg text-xs font-medium flex items-center gap-2">
          <Check className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{feedback}</span>
        </div>
      )}

      {/* Search, Filter, View Mode Switcher & Batch Status Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-xs flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
        <div className="relative w-full lg:w-96">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre Chrystal, SKU o código EAN-13..."
            className="w-full min-h-[42px] sm:min-h-[36px] pl-9 pr-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2.5 w-full lg:w-auto justify-between lg:justify-end">
          <div className="text-[11px] font-mono text-slate-600 bg-slate-100 px-2.5 py-1.5 rounded-md border border-slate-200">
            Visibles: <strong>{batchSlice.visibleCount}</strong> /{' '}
            <strong>{batchSlice.totalItems}</strong> SKUs (Lote {batchSlice.currentBatchNumber} de{' '}
            {batchSlice.totalBatches})
          </div>

          {/* Responsive Layout Switcher (Auto / Tarjetas Producto-Celda / Tabla) */}
          <div
            role="group"
            aria-label="Modo de visualización del catálogo"
            className="inline-flex items-center rounded-lg border border-slate-300 bg-slate-100 p-0.5 text-[11px]"
          >
            <button
              type="button"
              onClick={() => setViewMode('AUTO')}
              className={`min-h-[34px] px-2.5 py-1 rounded-md font-semibold transition cursor-pointer ${
                viewMode === 'AUTO'
                  ? 'bg-slate-900 text-white shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Adaptativo
            </button>
            <button
              type="button"
              onClick={() => setViewMode('CARDS')}
              className={`min-h-[34px] px-2.5 py-1 rounded-md font-semibold flex items-center gap-1 transition cursor-pointer ${
                viewMode === 'CARDS'
                  ? 'bg-sky-600 text-white shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>Tarjetas Producto/Celda</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('TABLE')}
              className={`min-h-[34px] px-2.5 py-1 rounded-md font-semibold flex items-center gap-1 transition cursor-pointer ${
                viewMode === 'TABLE'
                  ? 'bg-sky-600 text-white shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Table2 className="w-3.5 h-3.5" />
              <span>Tabla</span>
            </button>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <span className="text-xs text-slate-500 font-medium shrink-0">Categoría:</span>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="flex-1 sm:flex-initial min-h-[40px] sm:min-h-[36px] px-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-white font-medium text-slate-700 focus:outline-none focus:border-sky-600"
            >
              {categories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat === 'ALL' ? 'Todas las Categorías' : cat}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* High-density ERP Container (Mobile "Ficha Producto / Celda" Cards + Desktop Table, Batched 20 by 20) */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
        <div className="px-4 py-2.5 bg-sky-50/70 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-600">
          <span className="flex items-center gap-1.5 font-medium text-sky-900">
            <History className="w-3.5 h-3.5 text-sky-600 shrink-0" />
            <span>
              Toque o haga clic sobre cualquier producto o en{' '}
              <strong>&ldquo;Historial &amp; Fechas&rdquo;</strong> para abrir su rotación y fechas
              de pedido y recepción (Desde / Hasta).
            </span>
          </span>
          {selectedProductForHistory && (
            <span className="font-mono font-bold text-sky-800">
              Producto Seleccionado: {selectedProductForHistory.sku}
            </span>
          )}
        </div>

        {/* Mobile Smartphone & Tablet Card View ("Ficha Producto / Celda") */}
        <div
          className={`${
            viewMode === 'CARDS'
              ? 'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 p-3 sm:p-4'
              : viewMode === 'TABLE'
              ? 'hidden'
              : 'grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 md:hidden'
          } bg-slate-50/60`}
        >
          {batchSlice.visibleItems.map((p, index) => {
            const stock = getStockForSelection(p);
            const minStock = getMinStockForSelection(p);
            const isLow = stock <= minStock;
            const priceVes = convertUsdToVes(p.priceUsd, bcvState.activeRate);
            const realMargin = calculateGrossMarginPercent(p.costUsd, p.priceUsd);
            const isSelected = selectedProductForHistory?.id === p.id;

            return (
              <div
                key={p.id}
                onClick={() => setSelectedProductForHistory(p)}
                className={`rounded-xl border p-3.5 transition shadow-2xs flex flex-col justify-between gap-3 cursor-pointer ${
                  isSelected
                    ? 'bg-sky-50/90 border-sky-400 ring-1 ring-sky-400'
                    : 'bg-white border-slate-200 hover:border-sky-300'
                }`}
              >
                <div className="space-y-2">
                  {/* Top Meta Row: # Index, SKU, ABC Class & IVA */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="px-1.5 py-0.5 rounded bg-slate-900 text-white font-mono text-[10px] font-bold">
                        #{index + 1}
                      </span>
                      <span className="font-mono font-bold text-xs text-slate-900 truncate">
                        {p.sku}
                      </span>
                      <span className="font-mono text-[10px] text-slate-400 truncate">
                        {p.barcode}
                      </span>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <span
                        className={`px-1.5 py-0.5 rounded font-mono text-[10px] font-bold ${
                          p.abcClass === 'A'
                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                            : p.abcClass === 'B'
                            ? 'bg-sky-100 text-sky-800 border border-sky-300'
                            : 'bg-slate-100 text-slate-700 border border-slate-300'
                        }`}
                      >
                        ABC {p.abcClass}
                      </span>
                      <span className="px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200 font-mono text-[10px] font-semibold text-slate-700">
                        {p.ivaRate === 0 ? 'EXENTO' : `IVA ${p.ivaRate}%`}
                      </span>
                    </div>
                  </div>

                  {/* Product Title & Category */}
                  <div>
                    <div className="text-xs sm:text-sm font-bold text-slate-900 leading-snug">
                      {p.name}
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      Categoría: <strong className="text-slate-700">{p.category}</strong> · Unidad:{' '}
                      <strong className="font-mono text-slate-700">{p.unit}</strong>
                    </div>
                  </div>

                  {/* Structured 2x2 "Producto / Celda" Financial & Stock Matrix */}
                  <div className="grid grid-cols-2 gap-2 pt-1 font-mono text-xs">
                    <div
                      className={`p-2 rounded-lg border ${
                        isLow
                          ? 'bg-amber-50/90 border-amber-300 text-amber-950'
                          : 'bg-slate-50 border-slate-200 text-slate-900'
                      }`}
                    >
                      <div className="text-[9px] uppercase text-slate-500 font-semibold flex items-center justify-between">
                        <span>CELDA STOCK (COL F)</span>
                        {isLow && <AlertTriangle className="w-3 h-3 text-amber-600" />}
                      </div>
                      <div className="font-bold text-sm mt-0.5">
                        {stock.toFixed(0)} {p.unit}
                      </div>
                      <div className="text-[10px] text-slate-500">
                        Mín. Reorden: {minStock.toFixed(0)} {p.unit}
                      </div>
                    </div>

                    <div className="p-2 rounded-lg border bg-slate-50 border-slate-200">
                      <div className="text-[9px] uppercase text-slate-500 font-semibold">
                        CELDA COSTO / MARGEN
                      </div>
                      <div className="font-bold text-sm text-slate-900 mt-0.5">
                        {formatUsd(p.costUsd)}
                      </div>
                      <div className="text-[10px] text-emerald-700 font-semibold">
                        Margen: {realMargin.toFixed(2)}%
                      </div>
                    </div>

                    <div className="p-2 rounded-lg border bg-slate-900 text-white border-slate-800">
                      <div className="text-[9px] uppercase text-slate-400 font-semibold">
                        CELDA PVP USD
                      </div>
                      <div className="font-bold text-sm text-emerald-400 mt-0.5">
                        {formatUsd(p.priceUsd)}
                      </div>
                    </div>

                    <div className="p-2 rounded-lg border bg-sky-950 text-white border-sky-800">
                      <div className="text-[9px] uppercase text-sky-300 font-semibold">
                        CELDA PVP BS. (BCV)
                      </div>
                      <div className="font-bold text-sm text-sky-200 mt-0.5">
                        {formatVes(priceVes)}
                      </div>
                    </div>
                  </div>

                  {/* Per-Location Stock Cells */}
                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    {locations.map((loc) => {
                      const locQty = p.stockByLocation[loc.id] ?? 0;
                      const locMin = p.minStockByLocation[loc.id] ?? 0;
                      const locLow = locQty <= locMin && locMin > 0;
                      return (
                        <span
                          key={loc.id}
                          className={`px-2 py-0.5 rounded text-[10px] font-mono border ${
                            locLow
                              ? 'bg-amber-50 border-amber-300 text-amber-900 font-bold'
                              : 'bg-slate-100 border-slate-200 text-slate-700'
                          }`}
                        >
                          {loc.code}: {locQty}
                        </span>
                      );
                    })}
                  </div>
                </div>

                {/* Touch-Friendly Action Button (>= 44px height) */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedProductForHistory(p);
                  }}
                  className="min-h-[44px] w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-slate-900 hover:bg-sky-600 text-white font-semibold text-xs transition cursor-pointer"
                >
                  <History className="w-4 h-4 text-sky-400 shrink-0" />
                  <span>Historial &amp; Fechas (Rotación / Pedidos)</span>
                </button>
              </div>
            );
          })}
        </div>

        {/* Desktop & Tablet Table View */}
        <div
          className={`${
            viewMode === 'CARDS'
              ? 'hidden'
              : viewMode === 'TABLE'
              ? 'block'
              : 'hidden md:block'
          } overflow-x-auto`}
        >
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-900 text-slate-200 text-[11px] font-mono uppercase">
                <th className="py-2.5 px-3 w-12 text-center">#</th>
                <th className="py-2.5 px-3">SKU / EAN</th>
                <th className="py-2.5 px-3">Producto (Col B Chrystal®)</th>
                <th className="py-2.5 px-3">Categoría</th>
                <th className="py-2.5 px-3 text-center">ABC</th>
                <th className="py-2.5 px-3 text-right">Stock (Col F)</th>
                <th className="py-2.5 px-3 text-right">Costo USD</th>
                <th className="py-2.5 px-3 text-right">Margen %</th>
                <th className="py-2.5 px-3 text-right">PVP USD</th>
                <th className="py-2.5 px-3 text-right">PVP Bs. (BCV)</th>
                <th className="py-2.5 px-3 text-center">IVA</th>
                <th className="py-2.5 px-3 text-center">Historial &amp; Fechas</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-xs">
              {batchSlice.visibleItems.map((p, index) => {
                const stock = getStockForSelection(p);
                const minStock = getMinStockForSelection(p);
                const isLow = stock <= minStock;
                const priceVes = convertUsdToVes(p.priceUsd, bcvState.activeRate);
                const realMargin = calculateGrossMarginPercent(p.costUsd, p.priceUsd);
                const isSelected = selectedProductForHistory?.id === p.id;

                return (
                  <tr
                    key={p.id}
                    onClick={() => setSelectedProductForHistory(p)}
                    className={`transition cursor-pointer ${
                      isSelected
                        ? 'bg-sky-50/90 hover:bg-sky-100/70'
                        : 'hover:bg-slate-50/90'
                    }`}
                  >
                    <td className="py-2.5 px-3 text-center font-mono text-[11px] text-slate-400">
                      {index + 1}
                    </td>
                    <td className="py-2.5 px-3 font-mono">
                      <div className="font-bold text-slate-900">{p.sku}</div>
                      <div className="text-[10px] text-slate-400">{p.barcode}</div>
                    </td>
                    <td className="py-2.5 px-3 font-semibold text-slate-900">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedProductForHistory(p);
                        }}
                        className="text-left font-semibold text-slate-900 hover:text-sky-700 underline decoration-slate-300 hover:decoration-sky-600 underline-offset-2 cursor-pointer"
                      >
                        {p.name}
                      </button>
                    </td>
                    <td className="py-2.5 px-3 text-slate-600">{p.category}</td>
                    <td className="py-2.5 px-3 text-center">
                      <span
                        className={`inline-block px-2 py-0.5 rounded font-mono text-[10px] font-bold ${
                          p.abcClass === 'A'
                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                            : p.abcClass === 'B'
                            ? 'bg-sky-100 text-sky-800 border border-sky-300'
                            : 'bg-slate-100 text-slate-700 border border-slate-300'
                        }`}
                      >
                        {p.abcClass}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono">
                      <div className="flex items-center justify-end gap-1.5">
                        {isLow && (
                          <AlertTriangle
                            className="w-3.5 h-3.5 text-amber-500 shrink-0"
                            title={`Bajo stock mínimo (${minStock})`}
                          />
                        )}
                        <span
                          className={`font-bold ${
                            isLow ? 'text-amber-700' : 'text-slate-900'
                          }`}
                        >
                          {stock.toFixed(0)} {p.unit}
                        </span>
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-slate-700">
                      {formatUsd(p.costUsd)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-semibold text-emerald-700">
                      {realMargin.toFixed(2)}%
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900">
                      {formatUsd(p.priceUsd)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold text-sky-700 bg-sky-50/50">
                      {formatVes(priceVes)}
                    </td>
                    <td className="py-2.5 px-3 text-center font-mono text-[11px]">
                      {p.ivaRate === 0 ? (
                        <span className="text-emerald-700 font-semibold">EXENTO</span>
                      ) : (
                        <span className="text-slate-700">{p.ivaRate}%</span>
                      )}
                    </td>
                    <td
                      className="py-2.5 px-3 text-center"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedProductForHistory(p);
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => setSelectedProductForHistory(p)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-sky-600 text-white font-semibold text-[11px] transition cursor-pointer whitespace-nowrap"
                      >
                        <History className="w-3.5 h-3.5" />
                        <span>Historial &amp; Fechas</span>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Progressive Batch Pagination Footer ("Continuar" 20-by-20) */}
        <div className="px-4 py-3.5 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="text-xs text-slate-600 flex flex-wrap items-center gap-2 text-center sm:text-left">
            <span className="font-mono font-bold text-slate-900">
              Mostrando {batchSlice.visibleCount} de {batchSlice.totalItems} productos
            </span>
            <span className="text-slate-400 hidden sm:inline">·</span>
            <span className="text-[11px] text-slate-500">
              Paginación por lotes de {CATALOG_BATCH_SIZE} registros para proteger el rendimiento de
              carga
            </span>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-2 w-full sm:w-auto">
            {batchSlice.visibleCount > CATALOG_BATCH_SIZE && (
              <button
                type="button"
                onClick={handleResetToFirstBatch}
                className="min-h-[44px] sm:min-h-[38px] flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 text-xs font-semibold transition cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Contraer a 20 productos</span>
              </button>
            )}

            {batchSlice.hasMore ? (
              <button
                type="button"
                onClick={handleLoadNextBatch}
                className="min-h-[44px] sm:min-h-[38px] w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold transition shadow-xs cursor-pointer"
              >
                <span>
                  Continuar (Ver siguientes {batchSlice.nextBatchSize} productos · Restan{' '}
                  {batchSlice.remainingItems})
                </span>
                <ChevronDown className="w-4 h-4 shrink-0" />
              </button>
            ) : (
              <span className="px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-mono font-semibold">
                Catálogo completo visualizado ({batchSlice.totalItems} productos)
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Enterprise .XLSX "Producto / Celda" Formal Executive Table Preview Modal */}
      {showExcelPreviewModal && enterpriseExcelPayload && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Vista Previa Empresarial Sabana Excel Producto/Celda"
          className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4"
        >
          <div className="bg-white border border-slate-200 rounded-2xl max-w-[1440px] w-full max-h-[94vh] flex flex-col overflow-hidden shadow-2xl text-slate-900">
            {/* Top Modal Title Bar */}
            <div className="px-4 sm:px-6 py-3.5 bg-emerald-950 text-white flex flex-col lg:flex-row lg:items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-emerald-500/20 border border-emerald-400/30 text-emerald-300 shrink-0">
                  <FileSpreadsheet className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="px-2 py-0.5 rounded bg-emerald-500/30 text-emerald-200 font-mono text-[10px] font-bold">
                      {enterpriseExcelPayload.documentControlId}
                    </span>
                    <h2 className="text-sm sm:text-base font-bold text-white">
                      Tabla Formal Ejecutiva Excel (.XLSX) — Membrete Corporativo &amp; Celdas Definidas
                    </h2>
                  </div>
                  <p className="text-xs text-emerald-200/80 mt-0.5">
                    Titular: <strong>{enterpriseExcelPayload.companyProfile.razonSocial}</strong> (
                    {enterpriseExcelPayload.companyProfile.rif}) · 3 Hojas Estructuradas · Celdas
                    Bordeadas · AutoFiltro y Totales Consolidados
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 self-end lg:self-auto">
                <button
                  type="button"
                  onClick={() => setIsCompanyModalOpen(true)}
                  className="min-h-[38px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-sky-700 text-sky-200 hover:text-white border border-slate-700 text-xs font-semibold transition cursor-pointer"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>Editar Datos de Empresa</span>
                </button>
                <button
                  type="button"
                  onClick={handleExportExcel}
                  className="min-h-[38px] inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  <span>Descargar Tabla Formal .XLSX</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowExcelPreviewModal(false)}
                  className="min-h-[38px] inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition cursor-pointer"
                >
                  <X className="w-4 h-4" />
                  <span>Cerrar</span>
                </button>
              </div>
            </div>

            {/* Workbook Sheet Tabs Bar */}
            <div className="px-4 sm:px-6 py-2.5 bg-slate-100 border-b border-slate-300 flex flex-wrap items-center justify-between gap-2 shrink-0 text-xs">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] font-mono uppercase text-slate-500 mr-1">
                  Hojas del Libro (.xlsx):
                </span>
                <button
                  type="button"
                  onClick={() => setExcelPreviewSheet('MATRIZ')}
                  className={`min-h-[34px] px-3 py-1 rounded-lg font-mono text-xs font-bold transition cursor-pointer ${
                    excelPreviewSheet === 'MATRIZ'
                      ? 'bg-emerald-700 text-white shadow-2xs'
                      : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  2_Matriz_Producto_Celda ({enterpriseExcelPayload.totalProducts} SKUs)
                </button>
                <button
                  type="button"
                  onClick={() => setExcelPreviewSheet('FICHAS')}
                  className={`min-h-[34px] px-3 py-1 rounded-lg font-mono text-xs font-bold transition cursor-pointer ${
                    excelPreviewSheet === 'FICHAS'
                      ? 'bg-emerald-700 text-white shadow-2xs'
                      : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  3_Fichas_Producto_Celda (Bloques)
                </button>
                <button
                  type="button"
                  onClick={() => setExcelPreviewSheet('RESUMEN')}
                  className={`min-h-[34px] px-3 py-1 rounded-lg font-mono text-xs font-bold transition cursor-pointer ${
                    excelPreviewSheet === 'RESUMEN'
                      ? 'bg-emerald-700 text-white shadow-2xs'
                      : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  1_Resumen_Ejecutivo
                </button>
              </div>

              <div className="text-[11px] font-mono text-slate-700">
                Costo Total: <strong>{formatUsd(enterpriseExcelPayload.totalValuationCostUsd)}</strong>{' '}
                · PVP Total: <strong>{formatUsd(enterpriseExcelPayload.totalValuationRetailUsd)}</strong>
              </div>
            </div>

            {/* Sheet Preview Content */}
            <div className="p-3 sm:p-5 overflow-y-auto flex-1 space-y-4 bg-slate-100">
              {/* Formal Corporate Letterhead Block (Rendered at Rows 1–5 of Every Sheet in .XLSX with Background Fills & Borders) */}
              <div className="border-2 border-slate-900 rounded-xl overflow-hidden bg-white shadow-sm font-mono text-xs">
                <div className="bg-slate-900 text-white px-4 py-2.5 font-bold flex flex-wrap items-center justify-between gap-2 border-b-2 border-emerald-500">
                  <span>
                    FILA 1 EXCEL (A1:J1): MEMBRETE CORPORATIVO Y FISCAL DE LA EMPRESA —{' '}
                    {enterpriseExcelPayload.companyProfile.razonSocial.toUpperCase()}
                  </span>
                  <span className="text-emerald-300 text-[11px]">
                    BORDES &amp; FONDO EJECUTIVO OPENXML (.XLSX)
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-[11px] font-mono">
                    <tbody>
                      <tr className="border-b border-slate-300">
                        <td className="py-1.5 px-3 bg-slate-200 font-bold text-slate-800 border-r border-slate-300 whitespace-nowrap">
                          RAZÓN SOCIAL DE LA EMPRESA:
                        </td>
                        <td className="py-1.5 px-3 bg-emerald-50 font-sans font-extrabold text-emerald-950 border-r border-slate-300">
                          {enterpriseExcelPayload.companyProfile.razonSocial}
                        </td>
                        <td className="py-1.5 px-3 bg-slate-200 font-bold text-slate-800 border-r border-slate-300 whitespace-nowrap">
                          RIF FISCAL (SENIAT):
                        </td>
                        <td className="py-1.5 px-3 bg-emerald-50 font-bold text-emerald-900 border-r border-slate-300">
                          {enterpriseExcelPayload.companyProfile.rif}
                        </td>
                        <td className="py-1.5 px-3 bg-slate-200 font-bold text-slate-800 border-r border-slate-300 whitespace-nowrap">
                          CÓDIGO SADA / SUNAGRO:
                        </td>
                        <td className="py-1.5 px-3 bg-slate-50 font-bold text-slate-900">
                          {enterpriseExcelPayload.companyProfile.codigoSada}
                        </td>
                      </tr>
                      <tr className="border-b border-slate-300">
                        <td className="py-1.5 px-3 bg-slate-200 font-bold text-slate-800 border-r border-slate-300 whitespace-nowrap">
                          DIRECCIÓN FISCAL:
                        </td>
                        <td className="py-1.5 px-3 bg-slate-50 font-sans font-semibold text-slate-900 border-r border-slate-300">
                          {enterpriseExcelPayload.companyProfile.direccionFiscal}
                        </td>
                        <td className="py-1.5 px-3 bg-slate-200 font-bold text-slate-800 border-r border-slate-300 whitespace-nowrap">
                          TELÉFONO CORPORATIVO:
                        </td>
                        <td className="py-1.5 px-3 bg-slate-50 text-slate-900 border-r border-slate-300">
                          {enterpriseExcelPayload.companyProfile.telefono}
                        </td>
                        <td className="py-1.5 px-3 bg-slate-200 font-bold text-slate-800 border-r border-slate-300 whitespace-nowrap">
                          CORREO ELECTRÓNICO:
                        </td>
                        <td className="py-1.5 px-3 bg-slate-50 text-slate-900">
                          {enterpriseExcelPayload.companyProfile.email}
                        </td>
                      </tr>
                      <tr className="border-b border-slate-300">
                        <td className="py-1.5 px-3 bg-slate-200 font-bold text-slate-800 border-r border-slate-300 whitespace-nowrap">
                          REPRESENTANTE / GERENCIA:
                        </td>
                        <td className="py-1.5 px-3 bg-slate-50 font-semibold text-slate-900 border-r border-slate-300">
                          {enterpriseExcelPayload.companyProfile.representanteLegal}
                        </td>
                        <td className="py-1.5 px-3 bg-slate-200 font-bold text-slate-800 border-r border-slate-300 whitespace-nowrap">
                          GIRO / ACTIVIDAD:
                        </td>
                        <td className="py-1.5 px-3 bg-slate-50 text-slate-800 border-r border-slate-300">
                          {enterpriseExcelPayload.companyProfile.actividadEconomica}
                        </td>
                        <td className="py-1.5 px-3 bg-slate-200 font-bold text-slate-800 border-r border-slate-300 whitespace-nowrap">
                          CONTROL AUDITORÍA:
                        </td>
                        <td className="py-1.5 px-3 bg-slate-50 font-bold text-slate-900">
                          {enterpriseExcelPayload.documentControlId}
                        </td>
                      </tr>
                      <tr>
                        <td className="py-1.5 px-3 bg-slate-200 font-bold text-slate-800 border-r border-slate-300 whitespace-nowrap">
                          TASA OFICIAL BCV APLICADA:
                        </td>
                        <td className="py-1.5 px-3 bg-emerald-50 font-bold text-emerald-900 border-r border-slate-300">
                          Bs. {enterpriseExcelPayload.activeBcvRate.toFixed(2)} / USD
                        </td>
                        <td className="py-1.5 px-3 bg-slate-200 font-bold text-slate-800 border-r border-slate-300 whitespace-nowrap">
                          RÉGIMEN CAMBIARIO:
                        </td>
                        <td className="py-1.5 px-3 bg-slate-50 text-slate-900 border-r border-slate-300">
                          {enterpriseExcelPayload.rateSourceLabel}
                        </td>
                        <td className="py-1.5 px-3 bg-slate-200 font-bold text-slate-800 border-r border-slate-300 whitespace-nowrap">
                          FECHA Y HORA EMISIÓN (VET):
                        </td>
                        <td className="py-1.5 px-3 bg-slate-50 font-bold text-slate-900">
                          {enterpriseExcelPayload.generatedAtVet}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {excelPreviewSheet === 'MATRIZ' && (
                <div className="border-2 border-slate-900 rounded-xl overflow-hidden bg-white shadow-xs">
                  <div className="px-4 py-2 bg-emerald-900 text-white font-mono text-xs font-bold flex flex-wrap items-center justify-between gap-2">
                    <span>
                      HOJA 2: TABLA FORMAL DE INVENTARIO (FILA 9 EN ADELANTE) — CELDAS CON BORDES Y
                      COLORES DE SECCIÓN
                    </span>
                    <span className="text-emerald-200 text-[11px]">
                      AutoFiltro Habilitado · Bordes de Celda Definidos · Moneda Dual USD / Bs. BCV
                    </span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs font-mono">
                      <thead>
                        {/* Excel Column Coordinate Row (A, B, C, D...) */}
                        <tr className="bg-slate-200 text-slate-600 text-[10px] font-bold text-center border-b border-slate-400">
                          <th className="py-1 px-2 border-r border-slate-400 bg-slate-300">FILA</th>
                          <th className="py-1 px-2 border-r border-slate-300">COL A</th>
                          <th className="py-1 px-2 border-r border-slate-300">COL B</th>
                          <th className="py-1 px-2 border-r border-slate-300">COL C</th>
                          <th className="py-1 px-2 border-r border-slate-300">COL D</th>
                          <th className="py-1 px-2 border-r border-slate-300">COL E</th>
                          <th className="py-1 px-2 border-r border-slate-300">COL F</th>
                          <th className="py-1 px-2 border-r border-slate-400">COL G</th>
                          {locations.map((loc, idx) => (
                            <React.Fragment key={`col-coord-${loc.id}`}>
                              <th className="py-1 px-2 border-r border-slate-300">
                                SEDE {idx + 1}.1
                              </th>
                              <th className="py-1 px-2 border-r border-slate-300">
                                SEDE {idx + 1}.2
                              </th>
                              <th className="py-1 px-2 border-r border-slate-400">
                                SEDE {idx + 1}.3
                              </th>
                            </React.Fragment>
                          ))}
                          <th className="py-1 px-2 border-r border-slate-300">STOCK RED</th>
                          <th className="py-1 px-2 border-r border-slate-300">ROT. 30D</th>
                          <th className="py-1 px-2 border-r border-slate-300">UND/DÍA</th>
                          <th className="py-1 px-2 border-r border-slate-400">DÍAS COB.</th>
                          <th className="py-1 px-2 border-r border-slate-300">COSTO $</th>
                          <th className="py-1 px-2 border-r border-slate-300">MARGEN %</th>
                          <th className="py-1 px-2 border-r border-slate-300">PVP $</th>
                          <th className="py-1 px-2 border-r border-slate-300">PVP BS.</th>
                          <th className="py-1 px-2 border-r border-slate-300">COSTO TOT $</th>
                          <th className="py-1 px-2">PVP TOT BS.</th>
                        </tr>

                        {/* Group Banner Row */}
                        <tr className="bg-slate-800 text-sky-300 text-[10px] uppercase border-b border-slate-600">
                          <th className="py-1.5 px-2 text-center border-r border-slate-600 bg-slate-900 text-slate-400">
                            8
                          </th>
                          <th colSpan={7} className="py-1.5 px-2.5 border-r border-slate-600">
                            [SECCIÓN 1: IDENTIFICACIÓN FORMAL DEL PRODUCTO]
                          </th>
                          <th
                            colSpan={locations.length * 3}
                            className="py-1.5 px-2.5 border-r border-slate-600 text-emerald-300"
                          >
                            [SECCIÓN 2: EXISTENCIA Y PUNTO DE PEDIDO POR SEDE / DEPÓSITO]
                          </th>
                          <th
                            colSpan={4}
                            className="py-1.5 px-2.5 border-r border-slate-600 text-amber-300"
                          >
                            [SECCIÓN 3: CONSOLIDADO Y ROTACIÓN]
                          </th>
                          <th colSpan={6} className="py-1.5 px-2.5 text-purple-300">
                            [SECCIÓN 4: ESTRUCTURA DE PRECIOS Y VALORIZACIÓN BIMONETARIA]
                          </th>
                        </tr>

                        {/* Formal Column Header Row */}
                        <tr className="bg-slate-900 text-white text-[10px] uppercase border-b-2 border-emerald-500">
                          <th className="py-2 px-2 text-center border-r border-slate-700 bg-slate-950 text-amber-300">
                            9
                          </th>
                          <th className="py-2 px-2 border-r border-slate-700">N° ÍTEM</th>
                          <th className="py-2 px-2 border-r border-slate-700">CÓDIGO SKU</th>
                          <th className="py-2 px-2 border-r border-slate-700">CÓDIGO EAN-13</th>
                          <th className="py-2 px-2 border-r border-slate-700">
                            PRODUCTO / DESCRIPCIÓN (COL B)
                          </th>
                          <th className="py-2 px-2 border-r border-slate-700">CATEGORÍA</th>
                          <th className="py-2 px-2 border-r border-slate-700">UND</th>
                          <th className="py-2 px-2 border-r border-slate-600">ABC</th>
                          {locations.map((loc) => (
                            <React.Fragment key={loc.id}>
                              <th className="py-2 px-2 text-right bg-emerald-950 border-r border-slate-700">
                                {loc.code} STOCK
                              </th>
                              <th className="py-2 px-2 text-right bg-emerald-950/75 border-r border-slate-700">
                                {loc.code} MÍN
                              </th>
                              <th className="py-2 px-2 text-center bg-emerald-950/75 border-r border-slate-600">
                                ESTADO
                              </th>
                            </React.Fragment>
                          ))}
                          <th className="py-2 px-2 text-right border-r border-slate-700">
                            STOCK TOTAL
                          </th>
                          <th className="py-2 px-2 text-right border-r border-slate-700">
                            ROT. 30D
                          </th>
                          <th className="py-2 px-2 text-right border-r border-slate-700">
                            UND/DÍA
                          </th>
                          <th className="py-2 px-2 text-right border-r border-slate-600">
                            COBERTURA
                          </th>
                          <th className="py-2 px-2 text-right border-r border-slate-700">
                            COSTO USD
                          </th>
                          <th className="py-2 px-2 text-right border-r border-slate-700">
                            MARGEN %
                          </th>
                          <th className="py-2 px-2 text-right border-r border-slate-700">
                            PVP USD
                          </th>
                          <th className="py-2 px-2 text-right border-r border-slate-700">
                            PVP BS.
                          </th>
                          <th className="py-2 px-2 text-right border-r border-slate-700">
                            COSTO TOTAL USD
                          </th>
                          <th className="py-2 px-2 text-right">PVP TOTAL BS.</th>
                        </tr>
                      </thead>
                      <tbody>
                        {enterpriseExcelPayload.productRows.slice(0, 15).map((row, idx) => (
                          <tr
                            key={row.sku}
                            className={`border-b border-slate-300 ${
                              idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/70'
                            } hover:bg-emerald-50/60`}
                          >
                            <td className="py-1.5 px-2 text-center font-bold text-slate-500 bg-slate-100 border-r border-slate-300">
                              {row.excelRowNumber}
                            </td>
                            <td className="py-1.5 px-2 text-center border-r border-slate-300">
                              {row.itemNumber}
                            </td>
                            <td className="py-1.5 px-2 font-bold text-slate-900 bg-slate-100/80 border-r border-slate-300 whitespace-nowrap">
                              {row.sku}
                            </td>
                            <td className="py-1.5 px-2 text-slate-600 border-r border-slate-300">
                              {row.barcode}
                            </td>
                            <td className="py-1.5 px-2 font-sans font-semibold text-slate-900 border-r border-slate-300 min-w-[210px]">
                              {row.productName}
                            </td>
                            <td className="py-1.5 px-2 font-sans text-slate-700 border-r border-slate-300 whitespace-nowrap">
                              {row.category}
                            </td>
                            <td className="py-1.5 px-2 text-center border-r border-slate-300">
                              {row.unit}
                            </td>
                            <td className="py-1.5 px-2 text-center font-bold border-r border-slate-400">
                              <span
                                className={`px-1.5 py-0.5 rounded text-[10px] ${
                                  row.abcClass === 'A'
                                    ? 'bg-emerald-100 text-emerald-900'
                                    : row.abcClass === 'B'
                                    ? 'bg-sky-100 text-sky-900'
                                    : 'bg-amber-100 text-amber-900'
                                }`}
                              >
                                {row.abcClass}
                              </span>
                            </td>
                            {row.locationCells.map((cell) => (
                              <React.Fragment key={cell.locationCode}>
                                <td className="py-1.5 px-2 text-right font-bold border-r border-slate-300">
                                  {cell.stock}
                                </td>
                                <td className="py-1.5 px-2 text-right text-slate-500 border-r border-slate-300">
                                  {cell.reorderPoint}
                                </td>
                                <td className="py-1.5 px-2 text-center border-r border-slate-400">
                                  <span
                                    className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                                      cell.statusLabel === 'REORDENAR'
                                        ? 'bg-rose-100 text-rose-900 border border-rose-300'
                                        : 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                                    }`}
                                  >
                                    {cell.statusLabel}
                                  </span>
                                </td>
                              </React.Fragment>
                            ))}
                            <td className="py-1.5 px-2 text-right font-bold text-emerald-900 border-r border-slate-300 bg-emerald-50/70">
                              {row.totalStock}
                            </td>
                            <td className="py-1.5 px-2 text-right border-r border-slate-300">
                              {row.monthlyUnitsSold}
                            </td>
                            <td className="py-1.5 px-2 text-right border-r border-slate-300">
                              {row.dailyRotationVelocity.toFixed(2)}
                            </td>
                            <td className="py-1.5 px-2 text-right border-r border-slate-400">
                              {row.coverageDays.toFixed(1)}d
                            </td>
                            <td className="py-1.5 px-2 text-right border-r border-slate-300">
                              {formatUsd(row.costUsd)}
                            </td>
                            <td className="py-1.5 px-2 text-right text-emerald-700 font-bold border-r border-slate-300">
                              {row.realMarginPercent.toFixed(2)}%
                            </td>
                            <td className="py-1.5 px-2 text-right font-bold border-r border-slate-300">
                              {formatUsd(row.priceUsd)}
                            </td>
                            <td className="py-1.5 px-2 text-right font-bold text-sky-900 bg-sky-50/70 border-r border-slate-300">
                              {formatVes(row.priceVes)}
                            </td>
                            <td className="py-1.5 px-2 text-right font-bold border-r border-slate-300">
                              {formatUsd(row.totalCostUsd)}
                            </td>
                            <td className="py-1.5 px-2 text-right font-bold text-emerald-900 bg-emerald-50/40">
                              {formatVes(row.totalRetailVes)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="bg-slate-900 text-white font-bold border-t-2 border-emerald-500">
                          <td className="py-2 px-2 text-center border-r border-slate-700 text-amber-300">
                            TOT
                          </td>
                          <td colSpan={3} className="py-2 px-2 border-r border-slate-700">
                            TOTALES ({enterpriseExcelPayload.totalProducts} SKUs)
                          </td>
                          <td colSpan={4} className="py-2 px-2 border-r border-slate-700 truncate">
                            {enterpriseExcelPayload.companyProfile.razonSocial} (
                            {enterpriseExcelPayload.companyProfile.rif})
                          </td>
                          <td
                            colSpan={locations.length * 3}
                            className="py-2 px-2 text-right border-r border-slate-700 text-emerald-300"
                          >
                            CONSOLIDADO {locations.length} SEDES / DEPÓSITOS
                          </td>
                          <td className="py-2 px-2 text-right border-r border-slate-700 text-amber-300">
                            {enterpriseExcelPayload.totalUnitsAll}
                          </td>
                          <td colSpan={5} className="py-2 px-2 text-right border-r border-slate-700">
                            PVP TOTAL USD: {formatUsd(enterpriseExcelPayload.totalValuationRetailUsd)}
                          </td>
                          <td className="py-2 px-2 text-right border-r border-slate-700 text-sky-300">
                            {formatUsd(enterpriseExcelPayload.totalValuationCostUsd)}
                          </td>
                          <td className="py-2 px-2 text-right text-emerald-300">
                            {formatVes(enterpriseExcelPayload.totalValuationRetailVes)}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              )}

              {excelPreviewSheet === 'FICHAS' && (
                <div className="space-y-4">
                  <div className="bg-blue-950 text-white px-4 py-2.5 rounded-xl border-2 border-slate-900 font-mono text-xs font-bold flex flex-wrap items-center justify-between gap-2">
                    <span>
                      HOJA 3 (.XLSX): FICHAS TÉCNICAS Y FINANCIERAS POR PRODUCTO — BLOQUES DE 4
                      FILAS DELIMITADOS POR BORDES PERIMETRALES
                    </span>
                    <span className="text-sky-300 text-[11px]">
                      Cada ficha tiene borde exterior medio (#0F172A) y fila separadora en blanco
                    </span>
                  </div>

                  {enterpriseExcelPayload.productRows.slice(0, 8).map((row) => {
                    const sedeSummary = row.locationCells
                      .map(
                        (c) =>
                          `${c.locationCode}: ${c.stock} ${row.unit} (Mín: ${c.reorderPoint} · ${c.statusLabel})`
                      )
                      .join(' | ');

                    return (
                      <div key={row.sku} className="space-y-1.5">
                        {/* Framed 4-Row Product Ficha Box */}
                        <div className="border-2 border-slate-900 rounded-lg overflow-hidden bg-white shadow-sm font-mono text-xs">
                          <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse text-[11px]">
                              <tbody>
                                {/* Ficha Row 1: Top Header Bar */}
                                <tr className="bg-slate-900 text-white font-bold border-b border-slate-700">
                                  <td className="py-2 px-3 border-r border-slate-700 whitespace-nowrap text-amber-300 w-44">
                                    FICHA PRODUCTO #{String(row.itemNumber).padStart(2, '0')}
                                  </td>
                                  <td className="py-2 px-3 border-r border-slate-700 font-sans text-xs text-white min-w-[220px]">
                                    {row.sku} — {row.productName}
                                  </td>
                                  <td className="py-2 px-3 border-r border-slate-700 whitespace-nowrap">
                                    Categoría: {row.category}
                                  </td>
                                  <td className="py-2 px-3 border-r border-slate-700 whitespace-nowrap">
                                    EAN-13: {row.barcode}
                                  </td>
                                  <td className="py-2 px-3 border-r border-slate-700 whitespace-nowrap text-sky-300">
                                    CLASE ABC: {row.abcClass} · {row.ivaLabel}
                                  </td>
                                  <td className="py-2 px-3 bg-emerald-900 text-emerald-100 whitespace-nowrap">
                                    TITULAR: {enterpriseExcelPayload.companyProfile.razonSocial} (
                                    {enterpriseExcelPayload.companyProfile.rif})
                                  </td>
                                </tr>

                                {/* Ficha Row 2: 1. Logística y Stock */}
                                <tr className="border-b border-slate-300 bg-white">
                                  <td className="py-2 px-3 bg-slate-200 font-bold text-slate-800 border-r border-slate-300 whitespace-nowrap">
                                    1. LOGÍSTICA #{String(row.itemNumber).padStart(2, '0')}
                                  </td>
                                  <td className="py-2 px-3 bg-emerald-50 font-bold text-emerald-900 border-r border-slate-300">
                                    Stock Consolidado Red: {row.totalStock} {row.unit}
                                  </td>
                                  <td className="py-2 px-3 text-slate-800 border-r border-slate-300">
                                    Rotación Mensual: {row.monthlyUnitsSold} {row.unit}/mes
                                  </td>
                                  <td className="py-2 px-3 text-slate-800 border-r border-slate-300">
                                    Velocidad Diaria: {row.dailyRotationVelocity.toFixed(2)}{' '}
                                    {row.unit}/día
                                  </td>
                                  <td className="py-2 px-3 text-slate-800 border-r border-slate-300">
                                    Cobertura Estimada: {row.coverageDays.toFixed(1)} días
                                  </td>
                                  <td className="py-2 px-3 text-slate-700">{sedeSummary}</td>
                                </tr>

                                {/* Ficha Row 3: 2. Finanzas Unitarias */}
                                <tr className="border-b border-slate-300 bg-slate-50/70">
                                  <td className="py-2 px-3 bg-blue-100 font-bold text-blue-950 border-r border-slate-300 whitespace-nowrap">
                                    2. FINANZAS UNIT. #{String(row.itemNumber).padStart(2, '0')}
                                  </td>
                                  <td className="py-2 px-3 font-semibold text-slate-800 border-r border-slate-300">
                                    Estructura de Costo y PVP ({row.sku})
                                  </td>
                                  <td className="py-2 px-3 text-slate-800 border-r border-slate-300">
                                    Costo Reposición: {formatUsd(row.costUsd)} (
                                    {formatVes(row.costVes)})
                                  </td>
                                  <td className="py-2 px-3 bg-blue-50 font-bold text-blue-900 border-r border-slate-300">
                                    Precio Venta PVP: {formatUsd(row.priceUsd)} (
                                    {formatVes(row.priceVes)})
                                  </td>
                                  <td className="py-2 px-3 font-bold text-slate-900 border-r border-slate-300">
                                    Margen Real: {row.realMarginPercent.toFixed(2)}% (Meta:{' '}
                                    {row.targetMarginPercent.toFixed(2)}%)
                                  </td>
                                  <td className="py-2 px-3 text-slate-800">
                                    Utilidad Unitaria:{' '}
                                    {formatUsd(row.priceUsd - row.costUsd)} por {row.unit}
                                  </td>
                                </tr>

                                {/* Ficha Row 4: 3. Valoración Patrimonial (Bottom of Box) */}
                                <tr className="bg-emerald-50/70 font-bold text-emerald-950">
                                  <td className="py-2 px-3 bg-emerald-200/80 text-emerald-950 border-r border-slate-300 whitespace-nowrap">
                                    3. VALORACIÓN #{String(row.itemNumber).padStart(2, '0')}
                                  </td>
                                  <td className="py-2 px-3 border-r border-slate-300">
                                    Valor Total Costo USD: {formatUsd(row.totalCostUsd)}
                                  </td>
                                  <td className="py-2 px-3 border-r border-slate-300">
                                    Valor Total Costo Bs.: {formatVes(row.totalCostVes)}
                                  </td>
                                  <td className="py-2 px-3 border-r border-slate-300">
                                    Valor Total PVP USD: {formatUsd(row.totalRetailUsd)}
                                  </td>
                                  <td className="py-2 px-3 border-r border-slate-300">
                                    Valor Total PVP Bs.: {formatVes(row.totalRetailVes)}
                                  </td>
                                  <td className="py-2 px-3 bg-emerald-100 text-emerald-900">
                                    Utilidad Bruta Potencial: {formatUsd(row.potentialProfitUsd)} ·
                                    Act: {row.lastUpdatedVet}
                                  </td>
                                </tr>
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {excelPreviewSheet === 'RESUMEN' && (
                <div className="space-y-4 font-mono text-xs">
                  {/* Table 1: Consolidado Financiero */}
                  <div className="border-2 border-slate-900 rounded-xl overflow-hidden bg-white shadow-xs">
                    <div className="px-4 py-2 bg-slate-900 text-white font-bold border-b-2 border-emerald-500 flex flex-wrap items-center justify-between gap-2">
                      <span>
                        1. TABLA FORMAL DE CONSOLIDADO FINANCIERO (FILAS 10–14 EXCEL CON BORDES Y
                        RELLENO)
                      </span>
                      <span className="text-emerald-300 text-[11px]">
                        SKUs Auditados: {enterpriseExcelPayload.totalProducts} · Sedes/Depósitos:{' '}
                        {enterpriseExcelPayload.totalLocations}
                      </span>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-slate-800 text-white text-[11px] uppercase border-b border-slate-600">
                            <th className="py-2 px-3 border-r border-slate-600">
                              CONCEPTO CONTABLE / PATRIMONIAL
                            </th>
                            <th className="py-2 px-3 text-right border-r border-slate-600">
                              UNIDADES FÍSICAS
                            </th>
                            <th className="py-2 px-3 text-right border-r border-slate-600">
                              VALORACIÓN USD ($)
                            </th>
                            <th className="py-2 px-3 text-right">
                              VALORACIÓN BOLÍVARES (Bs. BCV)
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr className="border-b border-slate-300 bg-white">
                            <td className="py-2 px-3 font-sans font-semibold border-r border-slate-300">
                              Unidades Físicas Totales en Red Logística
                            </td>
                            <td className="py-2 px-3 text-right border-r border-slate-300">
                              {enterpriseExcelPayload.totalUnitsAll}
                            </td>
                            <td className="py-2 px-3 text-right font-bold border-r border-slate-300">
                              {formatUsd(enterpriseExcelPayload.totalValuationCostUsd)}
                            </td>
                            <td className="py-2 px-3 text-right font-bold">
                              {formatVes(enterpriseExcelPayload.totalValuationCostVes)}
                            </td>
                          </tr>
                          <tr className="border-b border-slate-300 bg-slate-50">
                            <td className="py-2 px-3 font-sans font-semibold border-r border-slate-300">
                              Valoración Consolidada al Costo de Reposición
                            </td>
                            <td className="py-2 px-3 text-right border-r border-slate-300">
                              {enterpriseExcelPayload.totalUnitsAll}
                            </td>
                            <td className="py-2 px-3 text-right font-bold border-r border-slate-300">
                              {formatUsd(enterpriseExcelPayload.totalValuationCostUsd)}
                            </td>
                            <td className="py-2 px-3 text-right font-bold">
                              {formatVes(enterpriseExcelPayload.totalValuationCostVes)}
                            </td>
                          </tr>
                          <tr className="border-b border-slate-300 bg-white">
                            <td className="py-2 px-3 font-sans font-semibold border-r border-slate-300">
                              Valoración Consolidada a Precio de Venta (PVP)
                            </td>
                            <td className="py-2 px-3 text-right border-r border-slate-300">
                              {enterpriseExcelPayload.totalUnitsAll}
                            </td>
                            <td className="py-2 px-3 text-right font-bold border-r border-slate-300">
                              {formatUsd(enterpriseExcelPayload.totalValuationRetailUsd)}
                            </td>
                            <td className="py-2 px-3 text-right font-bold">
                              {formatVes(enterpriseExcelPayload.totalValuationRetailVes)}
                            </td>
                          </tr>
                          <tr className="bg-emerald-100 text-emerald-950 font-bold border-t-2 border-emerald-600">
                            <td className="py-2.5 px-3 font-sans border-r border-emerald-300">
                              Utilidad Bruta Potencial Consolidada en Inventario
                            </td>
                            <td className="py-2.5 px-3 text-right border-r border-emerald-300">
                              {enterpriseExcelPayload.totalUnitsAll}
                            </td>
                            <td className="py-2.5 px-3 text-right border-r border-emerald-300">
                              {formatUsd(enterpriseExcelPayload.totalPotentialProfitUsd)}
                            </td>
                            <td className="py-2.5 px-3 text-right">
                              {formatVes(enterpriseExcelPayload.totalPotentialProfitVes)}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Table 2: Sedes y Depósitos */}
                  <div className="border-2 border-slate-900 rounded-xl overflow-hidden bg-white shadow-xs">
                    <div className="px-4 py-2 bg-slate-800 text-white font-bold border-b-2 border-sky-400">
                      2. TABLA FORMAL DE SEDES Y DEPÓSITOS DE LA EMPRESA (FILAS 16 EN ADELANTE CON
                      DELIMITACIÓN DE CELDAS)
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse text-[11px]">
                        <thead>
                          <tr className="bg-slate-900 text-white uppercase border-b border-slate-700">
                            <th className="py-2 px-2.5 border-r border-slate-700">
                              SEDE O DEPÓSITO
                            </th>
                            <th className="py-2 px-2.5 text-center border-r border-slate-700">
                              CLASIFICACIÓN
                            </th>
                            <th className="py-2 px-2.5 text-center border-r border-slate-700">
                              CÓDIGO
                            </th>
                            <th className="py-2 px-2.5 border-r border-slate-700">
                              CIUDAD / UBICACIÓN
                            </th>
                            <th className="py-2 px-2.5 border-r border-slate-700">RESPONSABLE</th>
                            <th className="py-2 px-2.5 text-right border-r border-slate-700">
                              UNIDADES
                            </th>
                            <th className="py-2 px-2.5 text-right border-r border-slate-700">
                              VALOR COSTO USD
                            </th>
                            <th className="py-2 px-2.5 text-right">VALOR PVP USD</th>
                          </tr>
                        </thead>
                        <tbody>
                          {enterpriseExcelPayload.resumenSheetAoA
                            .slice(16, 16 + enterpriseExcelPayload.totalLocations)
                            .map((locRow, i) => (
                              <tr
                                key={String(locRow[2] || i)}
                                className={`border-b border-slate-300 ${
                                  i % 2 === 0 ? 'bg-white' : 'bg-slate-50'
                                }`}
                              >
                                <td className="py-2 px-2.5 font-sans font-bold text-slate-900 border-r border-slate-300">
                                  {locRow[0]}
                                </td>
                                <td className="py-2 px-2.5 text-center font-bold border-r border-slate-300">
                                  <span
                                    className={`px-2 py-0.5 rounded text-[10px] ${
                                      String(locRow[1]).includes('DEPÓSITO')
                                        ? 'bg-amber-100 text-amber-900'
                                        : 'bg-blue-100 text-blue-900'
                                    }`}
                                  >
                                    {locRow[1]}
                                  </span>
                                </td>
                                <td className="py-2 px-2.5 text-center font-bold border-r border-slate-300">
                                  {locRow[2]}
                                </td>
                                <td className="py-2 px-2.5 font-sans border-r border-slate-300">
                                  {locRow[3]}
                                </td>
                                <td className="py-2 px-2.5 font-sans border-r border-slate-300">
                                  {locRow[4]}
                                </td>
                                <td className="py-2 px-2.5 text-right font-bold border-r border-slate-300">
                                  {locRow[5]}
                                </td>
                                <td className="py-2 px-2.5 text-right font-bold border-r border-slate-300">
                                  {formatUsd(Number(locRow[7] || 0))}
                                </td>
                                <td className="py-2 px-2.5 text-right font-bold bg-emerald-50 text-emerald-900">
                                  {formatUsd(Number(locRow[9] || 0))}
                                </td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Product Rotation & Order/Reception Dates History Modal / Inspector with From-To Date Picker */}
      {selectedProductForHistory && productHistoryReport && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Historial de Rotación y Fechas de Pedido y Recepción de ${selectedProductForHistory.name}`}
          className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div className="bg-white border border-slate-200 rounded-2xl max-w-6xl w-full max-h-[92vh] flex flex-col overflow-hidden shadow-2xl text-slate-900">
            {/* Modal Header */}
            <div className="px-6 py-4 bg-slate-900 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-sky-500/20 border border-sky-400/30 text-sky-300">
                  <CalendarRange className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="px-2 py-0.5 rounded bg-sky-500/30 text-sky-200 font-mono text-[11px] font-bold">
                      {selectedProductForHistory.sku}
                    </span>
                    <h2 className="text-sm sm:text-base font-bold text-white">
                      {selectedProductForHistory.name}
                    </h2>
                    <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-mono text-[10px] font-bold">
                      CLASE {selectedProductForHistory.abcClass}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Expediente Auditor de Historial de Rotación, Fechas de Pedido a Proveedor y
                    Fechas de Recepción Física por Rango de Fechas
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setSelectedProductForHistory(null)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition cursor-pointer self-end sm:self-auto"
              >
                <X className="w-4 h-4" />
                <span>Cerrar Historial</span>
              </button>
            </div>

            {/* Date Selection Panel (Desde — Hasta) & Sede/Depósito Filter */}
            <div className="px-6 py-3.5 bg-slate-50 border-b border-slate-200 flex flex-col lg:flex-row lg:items-end justify-between gap-4 shrink-0 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 flex-1">
                <div>
                  <label
                    htmlFor="history-from-date"
                    className="block font-bold text-slate-700 mb-1"
                  >
                    Fecha Desde (Inicio Consulta) *
                  </label>
                  <input
                    id="history-from-date"
                    aria-label="Fecha Desde"
                    type="date"
                    value={historyFromDate}
                    onChange={(e) => setHistoryFromDate(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white font-mono font-bold text-slate-900 focus:outline-none focus:border-sky-600"
                  />
                </div>

                <div>
                  <label
                    htmlFor="history-to-date"
                    className="block font-bold text-slate-700 mb-1"
                  >
                    Fecha Hasta (Corte Consulta) *
                  </label>
                  <input
                    id="history-to-date"
                    aria-label="Fecha Hasta"
                    type="date"
                    value={historyToDate}
                    onChange={(e) => setHistoryToDate(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white font-mono font-bold text-slate-900 focus:outline-none focus:border-sky-600"
                  />
                </div>

                <div>
                  <label
                    htmlFor="history-loc-filter"
                    className="block font-bold text-slate-700 mb-1"
                  >
                    Filtrar por Sede o Depósito
                  </label>
                  <select
                    id="history-loc-filter"
                    aria-label="Filtrar Historial por Sede o Depósito"
                    value={historyLocationFilter}
                    onChange={(e) => setHistoryLocationFilter(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white font-medium text-slate-900"
                  >
                    <option value="ALL">Todas las Sedes y Depósitos ({locations.length})</option>
                    {locations.map((loc) => (
                      <option key={loc.id} value={loc.id}>
                        [{loc.type === 'DEPOSITO' || loc.type === 'CEDIS' ? 'Depósito' : 'Sede'}]{' '}
                        {loc.code} — {loc.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Quick Date Range Presets */}
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] font-mono text-slate-500 mr-1">Rangos rápidos:</span>
                {[
                  { label: 'Últimos 7d', days: 7 },
                  { label: 'Últimos 15d', days: 15 },
                  { label: 'Últimos 30d', days: 30 },
                  { label: 'Últimos 60d', days: 60 },
                  { label: 'Últimos 90d', days: 90 },
                ].map((preset) => (
                  <button
                    key={preset.days}
                    type="button"
                    onClick={() => applyDatePresetDays(preset.days)}
                    className="px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-sky-600 hover:text-white hover:border-sky-600 font-mono text-[11px] font-bold text-slate-700 transition cursor-pointer"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Scrollable Body */}
            <div className="p-6 overflow-y-auto space-y-6 flex-1">
              {/* Summary KPIs for the Selected Date Window */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs font-mono">
                <div className="p-3.5 rounded-xl bg-slate-900 text-white border border-slate-800">
                  <div className="text-[10px] text-sky-400 uppercase font-bold">
                    Rotación en Rango ({productHistoryReport.daysInRange} días)
                  </div>
                  <div className="text-base font-extrabold mt-1">
                    {productHistoryReport.summary.totalUnitsRotated} {selectedProductForHistory.unit}
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    Promedio: {productHistoryReport.summary.avgDailyRotation}{' '}
                    {selectedProductForHistory.unit}/día
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-900 text-white border border-slate-800">
                  <div className="text-[10px] text-emerald-400 uppercase font-bold">
                    Valor Rotado (PVP USD / Bs.)
                  </div>
                  <div className="text-base font-extrabold text-emerald-400 mt-1">
                    {formatUsd(productHistoryReport.summary.totalRotationRevenueUsd)}
                  </div>
                  <div className="text-[11px] text-slate-300 mt-0.5">
                    {formatVes(productHistoryReport.summary.totalRotationRevenueVes)}
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-900 text-white border border-slate-800">
                  <div className="text-[10px] text-amber-400 uppercase font-bold">
                    Pedidos &amp; Recepciones en Rango
                  </div>
                  <div className="text-base font-extrabold text-white mt-1">
                    {productHistoryReport.summary.totalOrdersCount} Órdenes (
                    {productHistoryReport.summary.totalReceivedUnits}{' '}
                    {selectedProductForHistory.unit} Recib.)
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                     Pedido Total: {productHistoryReport.summary.totalOrderedUnits}{' '}
                    {selectedProductForHistory.unit}
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-900 text-white border border-slate-800">
                  <div className="text-[10px] text-purple-300 uppercase font-bold">
                    Lead Time &amp; Costo Compras
                  </div>
                  <div className="text-base font-extrabold text-white mt-1">
                    {formatUsd(productHistoryReport.summary.totalOrderCostUsd)}
                  </div>
                  <div className="text-[11px] text-sky-300 mt-0.5">
                    Entrega prom.: {productHistoryReport.summary.avgLeadTimeDays} días entre pedido y
                    recepción
                  </div>
                </div>
              </div>

              {/* SECTION A: Fechas de Pedido y Fechas de Recepción del Producto */}
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
                <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Truck className="w-4 h-4 text-sky-600" />
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                      1. Historial de Fechas de Pedido y Fechas de Recepción del Producto (
                      {productHistoryReport.orderReceiptEntries.length} Registros entre{' '}
                      {productHistoryReport.fromDate} y {productHistoryReport.toDate})
                    </h3>
                  </div>
                  <span className="text-[11px] font-mono text-slate-500">
                    Trazabilidad de órdenes emitidas, fecha de llegada a almacén y días de tránsito
                  </span>
                </div>

                {productHistoryReport.orderReceiptEntries.length === 0 ? (
                  <div className="p-6 text-center text-xs text-slate-500">
                    No se registran pedidos ni recepciones para este SKU dentro del rango de fechas
                    seleccionado ({productHistoryReport.fromDate} a {productHistoryReport.toDate}).
                    Amplíe el rango de fechas para consultar períodos anteriores.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-900 text-slate-200 text-[11px] font-mono uppercase">
                          <th className="py-2.5 px-3">N° Pedido / Recepción</th>
                          <th className="py-2.5 px-3">Proveedor</th>
                          <th className="py-2.5 px-3">Sede / Depósito</th>
                          <th className="py-2.5 px-3">Fecha de Pedido</th>
                          <th className="py-2.5 px-3">Fecha de Recepción</th>
                          <th className="py-2.5 px-3 text-center">Lead Time</th>
                          <th className="py-2.5 px-3 text-right">Cant. Pedida / Recibida</th>
                          <th className="py-2.5 px-3 text-right">Costo Total (USD / Bs.)</th>
                          <th className="py-2.5 px-3 text-center">Estado</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 text-xs">
                        {productHistoryReport.orderReceiptEntries.map((ord) => {
                          const isPending = ord.status === 'PENDIENTE_ENTREGA';
                          return (
                            <tr key={ord.id} className="hover:bg-slate-50">
                              <td className="py-2.5 px-3 font-mono">
                                <div className="font-bold text-slate-900">{ord.orderNumber}</div>
                                <div className="text-[10px] text-slate-500">
                                  Recepción: {ord.receiptCode}
                                </div>
                              </td>
                              <td className="py-2.5 px-3 font-medium text-slate-800">
                                {ord.supplierName}
                              </td>
                              <td className="py-2.5 px-3 font-mono font-bold text-slate-800">
                                {ord.locationCode}
                              </td>
                              <td className="py-2.5 px-3 font-mono font-bold text-sky-800 bg-sky-50/50">
                                {ord.orderDate}
                              </td>
                              <td className="py-2.5 px-3 font-mono font-bold text-emerald-800 bg-emerald-50/50">
                                {ord.receiptDate ? (
                                  ord.receiptDate
                                ) : (
                                  <span className="text-amber-700">PENDIENTE LLEGADA</span>
                                )}
                              </td>
                              <td className="py-2.5 px-3 text-center font-mono">
                                {ord.leadTimeDays !== null ? (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-[11px] font-semibold">
                                    <Clock className="w-3 h-3 text-slate-500" />
                                    {ord.leadTimeDays} días
                                  </span>
                                ) : (
                                  <span className="text-[11px] text-amber-700 font-semibold">
                                    En tránsito
                                  </span>
                                )}
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono">
                                <div className="font-bold text-slate-900">
                                  Ped: {ord.orderedQty} {ord.unit}
                                </div>
                                <div className="text-[10px] text-emerald-700 font-semibold">
                                  Rec: {ord.receivedQty} {ord.unit}
                                </div>
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono">
                                <div className="font-bold text-slate-900">
                                  {formatUsd(ord.totalCostUsd)}
                                </div>
                                <div className="text-[10px] text-sky-700">
                                  {formatVes(ord.totalCostVes)}
                                </div>
                              </td>
                              <td className="py-2.5 px-3 text-center">
                                <span
                                  className={`px-2 py-0.5 rounded font-mono text-[10px] font-bold ${
                                    isPending
                                      ? 'bg-amber-100 text-amber-900 border border-amber-300'
                                      : 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                                  }`}
                                >
                                  {isPending ? 'PENDIENTE' : 'RECIBIDO'}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* SECTION B: Historial de Rotación Cronológico por Fecha */}
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
                <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-emerald-600" />
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                      2. Historial Detallado de Rotación del Producto (
                      {productHistoryReport.rotationEntries.length} Movimientos entre{' '}
                      {productHistoryReport.fromDate} y {productHistoryReport.toDate})
                    </h3>
                  </div>
                  <span className="text-[11px] font-mono text-slate-500">
                    Salidas por Ventas POS, Despachos al Mayor y Transferencias SADA
                  </span>
                </div>

                {productHistoryReport.rotationEntries.length === 0 ? (
                  <div className="p-6 text-center text-xs text-slate-500">
                    No existen movimientos de rotación en el rango de fechas especificado (
                    {productHistoryReport.fromDate} a {productHistoryReport.toDate}).
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-900 text-slate-200 text-[11px] font-mono uppercase">
                          <th className="py-2.5 px-3">Fecha Rotación</th>
                          <th className="py-2.5 px-3">Documento Ref.</th>
                          <th className="py-2.5 px-3">Tipo de Movimiento</th>
                          <th className="py-2.5 px-3">Sede / Depósito</th>
                          <th className="py-2.5 px-3 text-right">Unidades Rotadas</th>
                          <th className="py-2.5 px-3 text-right">PVP Unit. (USD)</th>
                          <th className="py-2.5 px-3 text-right">Total Rotado (USD / Bs.)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 text-xs">
                        {productHistoryReport.rotationEntries.map((rot) => (
                          <tr key={rot.id} className="hover:bg-slate-50">
                            <td className="py-2.5 px-3 font-mono font-bold text-slate-900">
                              {rot.date}
                            </td>
                            <td className="py-2.5 px-3 font-mono text-slate-700">
                              {rot.documentRef}
                            </td>
                            <td className="py-2.5 px-3">
                              <span
                                className={`px-2 py-0.5 rounded font-mono text-[10px] font-bold ${
                                  rot.movementType === 'VENTA_POS'
                                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                    : rot.movementType === 'DESPACHO_MAYOR'
                                    ? 'bg-sky-100 text-sky-800 border border-sky-200'
                                    : 'bg-purple-100 text-purple-800 border border-purple-200'
                                }`}
                              >
                                {rot.movementType.replace('_', ' ')}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 font-mono font-bold text-slate-800">
                              {rot.locationCode} — {rot.locationName}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono font-bold text-rose-700">
                              -{rot.unitsRotated} {selectedProductForHistory.unit}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono text-slate-700">
                              {formatUsd(rot.unitPriceUsd)}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono">
                              <div className="font-bold text-slate-900">
                                {formatUsd(rot.totalRevenueUsd)}
                              </div>
                              <div className="text-[10px] text-sky-700">
                                {formatVes(rot.totalRevenueVes)}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create SKU Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl max-w-lg w-full overflow-hidden shadow-2xl">
            <div className="px-5 py-3.5 bg-slate-900 text-white flex items-center justify-between">
              <h2 className="text-sm font-bold">Incorporar Nuevo SKU al Catálogo Maestro</h2>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="text-slate-400 hover:text-white text-xs font-mono"
              >
                ESC
              </button>
            </div>
            <form onSubmit={handleSaveNewProduct} className="p-5 space-y-3 text-xs max-h-[82vh] overflow-y-auto">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Código SKU *</label>
                  <input
                    type="text"
                    required
                    placeholder="Ej. HAR-JUANA-1KG"
                    value={sku}
                    onChange={(e) => setSku(e.target.value)}
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded font-mono"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Código de Barras EAN-13
                  </label>
                  <input
                    type="text"
                    placeholder="759100..."
                    value={barcode}
                    onChange={(e) => setBarcode(e.target.value)}
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Descripción Comercial (Columna B Chrystal®) *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ej. Harina de Maíz Blanca Juana 1Kg"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Categoría</label>
                  <input
                    type="text"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Unidad</label>
                  <select
                    value={unit}
                    onChange={(e) => setUnit(e.target.value as Product['unit'])}
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded bg-white"
                  >
                    <option value="UND">UND</option>
                    <option value="KG">KG</option>
                    <option value="LT">LT</option>
                    <option value="CAJA">CAJA</option>
                    <option value="BULTO">BULTO</option>
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Alícuota IVA</label>
                  <select
                    value={ivaRate}
                    onChange={(e) => setIvaRate(Number(e.target.value) as 0 | 8 | 16)}
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded bg-white"
                  >
                    <option value={0}>Exento (0%)</option>
                    <option value={8}>Reducido (8%)</option>
                    <option value={16}>General (16%)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Costo Reposición (USD)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={costUsd}
                    onChange={(e) => setCostUsd(e.target.value)}
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded font-mono"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Margen Bruto Objetivo (%)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={marginPct}
                    onChange={(e) => setMarginPct(e.target.value)}
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded font-mono"
                  />
                </div>
              </div>

              <div className="pt-1">
                <label className="block font-semibold text-slate-700 mb-1.5">
                  Stock Inicial por Sede o Depósito ({locations.length} ubicaciones)
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  {locations.map((loc) => (
                    <div key={loc.id} className="bg-slate-50 p-2 rounded border border-slate-200">
                      <label className="block font-mono text-[10px] font-bold text-slate-700 mb-1 truncate">
                        {loc.code} ({loc.type === 'DEPOSITO' || loc.type === 'CEDIS' ? 'Depósito' : 'Sede'})
                      </label>
                      <input
                        type="number"
                        value={initialStocksByLoc[loc.id] ?? '0'}
                        onChange={(e) =>
                          setInitialStocksByLoc((prev) => ({
                            ...prev,
                            [loc.id]: e.target.value,
                          }))
                        }
                        className="w-full px-2 py-1 border border-slate-300 rounded font-mono bg-white"
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-1.5 rounded border border-slate-300 text-slate-700 hover:bg-slate-100"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded bg-sky-600 hover:bg-sky-500 text-white font-semibold"
                >
                  Guardar Producto
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProductCatalog;
