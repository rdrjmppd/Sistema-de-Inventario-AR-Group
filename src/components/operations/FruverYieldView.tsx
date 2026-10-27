/**
 * Fruits & Vegetables Yield & Waste Control View (Rendimiento Frutas y Verduras)
 * Tracks agricultural lot receipt, biological decay, mechanical damage, and salable net yield.
 * Upgraded Features:
 *  - Custom non-random batch code (INSAI guide / official agricultural lot code) and reception date.
 *  - Direct connection to Suppliers (useFinance) with on-the-fly agricultural supplier creation.
 *  - On-the-fly agricultural SKU registration or selection from standard catalog.
 *  - Direct "Cargar Lote al Inventario" committing net salable weight and effective absorbed cost.
 *  - Intelligent agricultural purchase projection linked to targeted purchase order generation.
 *  - 5 biological and operational waste cause audit.
 * Dual Export: export const FruverYieldView and export default FruverYieldView.
 * Official Copyright: © 2026 AR Group. Todos los derechos de desarrollo reservados.
 */

import React, { useState, useMemo, useEffect } from 'react';
import {
  Apple,
  TrendingDown,
  AlertOctagon,
  Scale,
  DollarSign,
  FileText,
  CheckCircle2,
  Calendar,
  Layers,
  Sparkles,
  Barcode,
  Truck,
  Building2,
  Plus,
  Check,
  X,
  ShoppingBag,
} from 'lucide-react';
import {
  FruverCategory,
  FruverLossCause,
  FruverBatchRecord,
  CreateFruverBatchInput,
  UserRole,
  Product,
} from '../../types';
import { useAuth } from '../../context/AuthContext';
import { useInventory } from '../../context/InventoryContext';
import { useFinance } from '../../context/FinanceContext';
import {
  FRUVER_LOSS_CAUSE_LABELS,
  FRUVER_STANDARD_PRODUCTS,
  calculateFruverBatch,
  projectFruverRequirementForDemand,
} from '../../lib/fruver-yield';

export const FruverYieldView: React.FC = () => {
  const { user, hasPermission } = useAuth();
  const { locations, products, addOrUpdateProduct, logAuditEvent, createManualPurchaseOrder } = useInventory();
  const { bcvState, suppliers, addSupplier } = useFinance();

  // Custom standard products catalog with user-created additions
  const [customCatalog, setCustomCatalog] = useState(FRUVER_STANDARD_PRODUCTS);
  const [selectedProductSku, setSelectedProductSku] = useState<string>('FRUV-TOM-PER');
  const [selectedLocationId, setSelectedLocationId] = useState<string>(locations[0]?.id || 'loc-pzo-01');
  const [initialWeightKg, setInitialWeightKg] = useState<number>(100);
  const [costPerKgUsd, setCostPerKgUsd] = useState<number>(1.15);
  const [targetMarginPercent, setTargetMarginPercent] = useState<number>(28);

  // Custom Lot Code & Reception Date
  const [customBatchCode, setCustomBatchCode] = useState<string>('');
  const [receptionDate, setReceptionDate] = useState<string>(() => new Date().toISOString().split('T')[0]);

  // Supplier Selection & Management
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>(() => {
    const agroSup = suppliers.find(
      (s) => s.category?.toLowerCase().includes('fruta') || s.category?.toLowerCase().includes('agrícola')
    );
    return agroSup?.id || suppliers[0]?.id || 'sup-001';
  });
  const [showSupplierModal, setShowSupplierModal] = useState<boolean>(false);
  const [supplierForm, setSupplierForm] = useState({
    rif: '',
    name: '',
    category: 'Frutas y Hortalizas',
    contactName: '',
    phone: '',
    email: '',
    creditDays: 7,
    paymentTerms: 'Crédito 7 Días Flete Incluido',
  });

  // New Agricultural Product Modal
  const [showProductModal, setShowProductModal] = useState<boolean>(false);
  const [productForm, setProductForm] = useState({
    sku: '',
    name: '',
    category: 'VERDURAS_HORTALIZAS' as FruverCategory,
    costKg: 1.0,
    expectedYield: 92,
    margin: 28,
  });

  // Purchase Projection Target Demand
  const [targetDemandKg, setTargetDemandKg] = useState<number>(100);

  // Status banners for operations
  const [inventoryLoadStatus, setInventoryLoadStatus] = useState<{
    success: boolean;
    message: string;
    productName: string;
    netKg: number;
    effectiveCost: number;
    suggestedPvp: number;
    timestamp?: string;
  } | null>(null);

  const [purchaseOrderStatus, setPurchaseOrderStatus] = useState<{
    orderNumber: string;
    rawKg: number;
    supplierName: string;
  } | null>(null);

  // Waste weights by the 5 specific causes
  const [wastesByCause, setWastesByCause] = useState<Record<FruverLossCause, number>>({
    DESHIDRATACION_PERDIDA_PESO: 2.5,
    DANO_EXCESO_FRIO: 1.2,
    DANO_EXCESO_CALOR: 3.4,
    DANO_MECANICO_MANIPULACION: 1.8,
    EXCESO_DIAS_EXPOSICION_ROTACION: 0.8,
  });

  // If suppliers update, ensure selectedSupplierId is valid
  useEffect(() => {
    if (!suppliers.some((s) => s.id === selectedSupplierId) && suppliers.length > 0) {
      setSelectedSupplierId(suppliers[0].id);
    }
  }, [suppliers, selectedSupplierId]);

  const selectedProduct = useMemo(() => {
    return (
      customCatalog.find((p) => p.sku === selectedProductSku) ||
      customCatalog[0]
    );
  }, [selectedProductSku, customCatalog]);

  const handleProductChange = (sku: string) => {
    setSelectedProductSku(sku);
    const prod = customCatalog.find((p) => p.sku === sku);
    if (prod) {
      setCostPerKgUsd(prod.defaultCostUsdPerKg);
      setTargetMarginPercent(prod.defaultTargetMarginPercent);
    }
    setInventoryLoadStatus(null);
    setPurchaseOrderStatus(null);
  };

  const computedBatch: FruverBatchRecord = useMemo(() => {
    const loc = locations.find((l) => l.id === selectedLocationId) || locations[0];
    const sup = suppliers.find((s) => s.id === selectedSupplierId);

    const wastesInput = (Object.keys(wastesByCause) as FruverLossCause[]).map((cause) => ({
      cause,
      weightKg: wastesByCause[cause] || 0,
      notes: FRUVER_LOSS_CAUSE_LABELS[cause]?.description || '',
    }));

    const input: CreateFruverBatchInput = {
      productId: `prd-${selectedProduct.sku}`,
      productSku: selectedProduct.sku,
      productName: selectedProduct.name,
      category: selectedProduct.category,
      locationId: loc ? loc.id : 'loc-pzo-01',
      initialWeightKg: initialWeightKg || 1,
      initialCostPerKgUsd: costPerKgUsd || 0.1,
      targetMarginPercent,
      customBatchCode: customBatchCode.trim() || undefined,
      receptionDate: receptionDate || undefined,
      supplierId: selectedSupplierId || undefined,
      supplierName: sup ? sup.name : undefined,
      wastes: wastesInput,
    };

    return calculateFruverBatch({
      input,
      bcvRate: bcvState.activeRate,
      locationName: loc ? loc.name : 'Sede Principal',
      supervisor: {
        uid: user?.uid || 'usr-supervisor',
        displayName: user?.displayName || 'Supervisor Fruver',
        role: user?.role || UserRole.SUPERVISOR_FRUVER,
      },
    });
  }, [
    selectedProduct,
    selectedLocationId,
    initialWeightKg,
    costPerKgUsd,
    targetMarginPercent,
    customBatchCode,
    receptionDate,
    selectedSupplierId,
    wastesByCause,
    locations,
    suppliers,
    bcvState.activeRate,
    user,
  ]);

  // Agricultural purchase projection calculation
  const fruverPurchaseProjection = useMemo(() => {
    return projectFruverRequirementForDemand({
      productSku: selectedProduct.sku,
      targetDemandKg: targetDemandKg || 1,
      customExpectedYieldPercent: computedBatch.netYieldPercent > 0 ? computedBatch.netYieldPercent : undefined,
    });
  }, [selectedProduct, targetDemandKg, computedBatch.netYieldPercent]);

  const canEdit = hasPermission([
    UserRole.SUPERADMIN,
    UserRole.GERENTE,
    UserRole.ANALISTA,
    UserRole.SUPERVISOR_FRUVER,
  ]);

  // Commit batch net salable weight into active inventory
  const handleLoadToInventory = () => {
    if (!canEdit || computedBatch.netSalableWeightKg <= 0) return;
    const loc = locations.find((l) => l.id === selectedLocationId) || locations[0];
    const sup = suppliers.find((s) => s.id === selectedSupplierId);

    const existingProd = products.find(
      (p) => p.sku === selectedProduct.sku || p.name.toLowerCase() === selectedProduct.name.toLowerCase()
    );

    if (existingProd) {
      const currentStock = existingProd.stockByLocation[selectedLocationId] || 0;
      const newStock = parseFloat((currentStock + computedBatch.netSalableWeightKg).toFixed(2));
      const updatedProd: Product = {
        ...existingProd,
        costUsd: computedBatch.effectiveCostPerSalableKgUsd,
        targetMarginPercent,
        priceUsd: computedBatch.suggestedPvpPerKgUsd,
        supplierId: selectedSupplierId,
        stockByLocation: {
          ...existingProd.stockByLocation,
          [selectedLocationId]: newStock,
        },
        lastUpdatedVet: new Date().toISOString(),
      };
      addOrUpdateProduct(updatedProd, existingProd);
    } else {
      const newProd: Product = {
        id: `prd-fruv-${selectedProduct.sku.toLowerCase()}-${Date.now()}`,
        sku: selectedProduct.sku,
        barcode: `759${Math.floor(1000000000 + Math.random() * 9000000000)}`,
        name: selectedProduct.name,
        category: 'Frutas y Verduras',
        unit: 'KG',
        costUsd: computedBatch.effectiveCostPerSalableKgUsd,
        targetMarginPercent,
        priceUsd: computedBatch.suggestedPvpPerKgUsd,
        ivaRate: 0,
        stockByLocation: {
          [selectedLocationId]: computedBatch.netSalableWeightKg,
        },
        minStockByLocation: {
          [selectedLocationId]: 30,
        },
        monthlyUnitsSold: 200,
        abcClass: 'A',
        supplierId: selectedSupplierId,
        lastUpdatedVet: new Date().toISOString(),
      };
      addOrUpdateProduct(newProd);
    }

    logAuditEvent(
      'FRUVER_YIELD_INVENTORY_LOAD',
      'INVENTORY',
      `Lote agrícola ${computedBatch.batchCode} cargado a inventario en ${loc.name}. ${computedBatch.netSalableWeightKg.toFixed(2)} Kg de ${selectedProduct.name} a costo efectivo $${computedBatch.effectiveCostPerSalableKgUsd.toFixed(2)}/Kg.`,
      {
        batchCode: computedBatch.batchCode,
        sku: selectedProduct.sku,
        productName: selectedProduct.name,
        locationId: selectedLocationId,
        locationName: loc.name,
        supplierId: selectedSupplierId,
        supplierName: sup?.name,
        netSalableWeightKg: computedBatch.netSalableWeightKg,
        effectiveCostPerKgUsd: computedBatch.effectiveCostPerSalableKgUsd,
        suggestedPvpUsd: computedBatch.suggestedPvpPerKgUsd,
      },
      computedBatch.batchCode
    );

    setInventoryLoadStatus({
      success: true,
      message: `Lote ${computedBatch.batchCode} ingresado exitosamente al inventario de "${loc.name}".`,
      productName: selectedProduct.name,
      netKg: computedBatch.netSalableWeightKg,
      effectiveCost: computedBatch.effectiveCostPerSalableKgUsd,
      suggestedPvp: computedBatch.suggestedPvpPerKgUsd,
      timestamp: new Date().toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    });
  };

  // Generate suggested purchase order from projected fruver demand
  const handleCreateProjectedPurchaseOrder = () => {
    if (!canEdit) return;
    const sup = suppliers.find((s) => s.id === selectedSupplierId) || suppliers[0];

    let targetProduct = products.find((p) => p.sku === selectedProduct.sku);
    if (!targetProduct) {
      targetProduct = {
        id: `prd-fruv-${selectedProduct.sku.toLowerCase()}-base`,
        sku: selectedProduct.sku,
        barcode: `759${Math.floor(1000000000 + Math.random() * 9000000000)}`,
        name: selectedProduct.name,
        category: 'Frutas y Verduras',
        unit: 'KG',
        costUsd: costPerKgUsd,
        targetMarginPercent,
        priceUsd: computedBatch.suggestedPvpPerKgUsd,
        ivaRate: 0,
        stockByLocation: { [selectedLocationId]: 0 },
        minStockByLocation: { [selectedLocationId]: 30 },
        monthlyUnitsSold: 200,
        abcClass: 'A',
        supplierId: selectedSupplierId,
        lastUpdatedVet: new Date().toISOString(),
      };
      addOrUpdateProduct(targetProduct);
    }

    const result = createManualPurchaseOrder({
      productId: targetProduct.id,
      locationId: selectedLocationId,
      supplierId: selectedSupplierId,
      orderedQty: fruverPurchaseProjection.rawNeededKg,
      unitCostUsd: costPerKgUsd,
      horizonDaysUsed: 7,
      systemSuggestedQty: fruverPurchaseProjection.rawNeededKg,
      notes: `Orden proyectada desde Rendimiento Fruver para cubrir demanda de ${targetDemandKg} Kg vendibles de ${selectedProduct.name}. Requiere ${fruverPurchaseProjection.rawNeededKg} Kg en bruto de cosecha. Proveedor asignado: ${sup.name}.`,
    });

    if (result.success && result.order) {
      setPurchaseOrderStatus({
        orderNumber: result.order.orderNumber,
        rawKg: fruverPurchaseProjection.rawNeededKg,
        supplierName: sup.name,
      });
    }
  };

  // Save new supplier modal
  const handleSaveSupplier = (e: React.FormEvent) => {
    e.preventDefault();
    if (!supplierForm.rif.trim() || !supplierForm.name.trim()) return;

    addSupplier({
      rif: supplierForm.rif.trim().toUpperCase(),
      name: supplierForm.name.trim(),
      category: supplierForm.category,
      contactName: supplierForm.contactName.trim() || 'Contacto Agrícola',
      phone: supplierForm.phone.trim() || '+58 414-0000000',
      email: supplierForm.email.trim() || 'ventas@agricola.com',
      creditDays: Number(supplierForm.creditDays) || 7,
      paymentTerms: supplierForm.paymentTerms.trim() || 'Crédito 7 Días Flete Incluido',
    });

    setShowSupplierModal(false);
    setSupplierForm({
      rif: '',
      name: '',
      category: 'Frutas y Hortalizas',
      contactName: '',
      phone: '',
      email: '',
      creditDays: 7,
      paymentTerms: 'Crédito 7 Días Flete Incluido',
    });
  };

  // Save new agricultural product
  const handleSaveProduct = (e: React.FormEvent) => {
    e.preventDefault();
    if (!productForm.sku.trim() || !productForm.name.trim()) return;

    const newProd = {
      sku: productForm.sku.trim().toUpperCase(),
      name: productForm.name.trim(),
      category: productForm.category,
      defaultCostUsdPerKg: Number(productForm.costKg) || 1.0,
      expectedSalableYieldPercent: Number(productForm.expectedYield) || 90,
      defaultTargetMarginPercent: Number(productForm.margin) || 28,
    };

    setCustomCatalog((prev) => [newProd, ...prev]);
    setSelectedProductSku(newProd.sku);
    setCostPerKgUsd(newProd.defaultCostUsdPerKg);
    setTargetMarginPercent(newProd.defaultTargetMarginPercent);
    setShowProductModal(false);
    setProductForm({
      sku: '',
      name: '',
      category: 'VERDURAS_HORTALIZAS',
      costKg: 1.0,
      expectedYield: 92,
      margin: 28,
    });
  };

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-emerald-950 via-slate-900 to-slate-900 border border-emerald-900/40 rounded-2xl p-5 shadow-xl text-white flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-xl bg-emerald-600/30 border border-emerald-500/40 text-emerald-400">
              <Apple className="w-5 h-5" />
            </span>
            <h1 className="text-lg md:text-xl font-bold tracking-tight">
              Rendimiento & Control de Mermas de Frutas y Verduras
            </h1>
          </div>
          <p className="text-xs text-slate-300 mt-1 max-w-2xl">
            Codificación de lotes agrícolas reales, trazabilidad INSAI, auditoría de <strong>5 causas de descomposición</strong>, absorción exacta de costo por merma y carga directa a inventario.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="px-3 py-1.5 rounded-xl bg-slate-800/80 border border-slate-700 text-xs font-mono">
            Tasa BCV: <strong>{bcvState.activeRate.toFixed(4)}</strong> VES
          </span>
          <span className="px-3 py-1.5 rounded-xl bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 text-xs font-semibold">
            Fruver Agro
          </span>
        </div>
      </div>

      {/* Lot Parameters Card */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-3 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm text-xs">
        {/* Código Lote Personalizado */}
        <div>
          <label className="block font-bold text-slate-700 mb-1 flex items-center gap-1">
            <Barcode className="w-3.5 h-3.5 text-emerald-600" />
            Código Lote / Guía INSAI
          </label>
          <input
            type="text"
            placeholder="Ej. INSAI-2026-4019"
            value={customBatchCode}
            onChange={(e) => setCustomBatchCode(e.target.value)}
            disabled={!canEdit}
            className="w-full min-h-[40px] px-3 py-2 rounded-xl border border-slate-300 bg-slate-50 text-slate-800 font-mono font-bold focus:ring-2 focus:ring-emerald-500/30"
          />
        </div>

        {/* Fecha de Recepción */}
        <div>
          <label className="block font-bold text-slate-700 mb-1 flex items-center gap-1">
            <Calendar className="w-3.5 h-3.5 text-slate-600" />
            Fecha Cosecha/Recepción
          </label>
          <input
            type="date"
            value={receptionDate}
            onChange={(e) => setReceptionDate(e.target.value)}
            disabled={!canEdit}
            className="w-full min-h-[40px] px-3 py-2 rounded-xl border border-slate-300 bg-slate-50 text-slate-800 font-medium focus:ring-2 focus:ring-emerald-500/30"
          />
        </div>

        {/* Producto Agrícola con botón para dar de alta nuevo */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="font-bold text-slate-700">Producto Agrícola</label>
            <button
              type="button"
              onClick={() => setShowProductModal(true)}
              className="text-[10px] text-emerald-700 hover:text-emerald-900 font-bold underline cursor-pointer"
            >
              + Nuevo SKU
            </button>
          </div>
          <select
            value={selectedProductSku}
            onChange={(e) => handleProductChange(e.target.value)}
            disabled={!canEdit}
            className="w-full min-h-[40px] px-3 py-2 rounded-xl border border-slate-300 bg-slate-50 text-slate-800 font-bold focus:ring-2 focus:ring-emerald-500/30"
          >
            {customCatalog.map((prod) => (
              <option key={prod.sku} value={prod.sku}>
                {prod.name} ({prod.category})
              </option>
            ))}
          </select>
        </div>

        {/* Sede / Depósito */}
        <div>
          <label className="block font-bold text-slate-700 mb-1">Sede / Depósito</label>
          <select
            value={selectedLocationId}
            onChange={(e) => setSelectedLocationId(e.target.value)}
            disabled={!canEdit}
            className="w-full min-h-[40px] px-3 py-2 rounded-xl border border-slate-300 bg-slate-50 text-slate-800 font-medium focus:ring-2 focus:ring-emerald-500/30"
          >
            {locations.map((loc) => (
              <option key={loc.id} value={loc.id}>
                {loc.name} ({loc.code})
              </option>
            ))}
          </select>
        </div>

        {/* Proveedor Agrícola */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="font-bold text-slate-700 flex items-center gap-1">
              <Truck className="w-3.5 h-3.5 text-slate-600" />
              Proveedor
            </label>
            <button
              type="button"
              onClick={() => setShowSupplierModal(true)}
              className="text-[10px] text-emerald-700 hover:text-emerald-900 font-bold underline cursor-pointer"
            >
              + Nuevo
            </button>
          </div>
          <select
            value={selectedSupplierId}
            onChange={(e) => setSelectedSupplierId(e.target.value)}
            disabled={!canEdit}
            className="w-full min-h-[40px] px-3 py-2 rounded-xl border border-slate-300 bg-slate-50 text-slate-800 font-medium focus:ring-2 focus:ring-emerald-500/30"
          >
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.rif})
              </option>
            ))}
          </select>
        </div>

        {/* Peso Recibido Lote (Kg) */}
        <div>
          <label className="block font-bold text-slate-700 mb-1">Peso Recibido (Kg)</label>
          <div className="relative">
            <input
              type="number"
              step="0.01"
              value={initialWeightKg}
              onChange={(e) => setInitialWeightKg(Math.max(0.1, parseFloat(e.target.value) || 0))}
              disabled={!canEdit}
              className="w-full min-h-[40px] px-3 py-2 rounded-xl border border-slate-300 bg-slate-50 text-slate-900 font-bold font-mono focus:ring-2 focus:ring-emerald-500/30"
            />
            <span className="absolute right-3 top-2.5 text-slate-400 font-bold text-xs">Kg</span>
          </div>
        </div>
      </div>

      {/* Action Bar: Cargar Lote al Inventario */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-4 bg-slate-50 rounded-2xl border border-slate-200 text-xs">
        <div className="flex items-center gap-3">
          <span className="p-2.5 rounded-xl bg-emerald-100 text-emerald-800">
            <Scale className="w-5 h-5" />
          </span>
          <div>
            <p className="font-bold text-slate-900">
              Lote Agrícola: <span className="font-mono text-emerald-700">{computedBatch.batchCode}</span>
            </p>
            <p className="text-[11px] text-slate-500">
              {computedBatch.productName} ({computedBatch.productSku}) | Proveedor: {computedBatch.supplierName || 'No asignado'} | Fecha: {computedBatch.receptionDate || receptionDate}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleLoadToInventory}
          disabled={!canEdit || computedBatch.netSalableWeightKg <= 0}
          className="min-h-[44px] px-5 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800 text-white font-bold rounded-xl shadow-md transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <CheckCircle2 className="w-4 h-4" />
          <span>Cargar Lote al Inventario Activo</span>
        </button>
      </div>

      {/* Status Feedback Banner */}
      {inventoryLoadStatus && (
        <div className="p-4 bg-emerald-50 border border-emerald-300 rounded-2xl text-emerald-900 flex items-start justify-between gap-3 shadow-sm animate-fade-in text-xs">
          <div className="flex items-center gap-3">
            <span className="p-2 bg-emerald-200 text-emerald-800 rounded-xl">
              <Check className="w-4 h-4" />
            </span>
            <div>
              <p className="font-bold">{inventoryLoadStatus.message}</p>
              <p className="text-[11px] text-emerald-700 mt-0.5">
                Producto: <strong>{inventoryLoadStatus.productName}</strong> | Peso neto: <strong>{inventoryLoadStatus.netKg.toFixed(2)} Kg</strong> | Costo absorbido: <strong>${inventoryLoadStatus.effectiveCost.toFixed(2)}/Kg</strong> | PVP Sugerido: <strong>${inventoryLoadStatus.suggestedPvp.toFixed(2)} USD</strong> (Bs. {(inventoryLoadStatus.suggestedPvp * bcvState.activeRate).toFixed(2)}). Hora: {inventoryLoadStatus.timestamp}.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setInventoryLoadStatus(null)}
            className="text-emerald-700 hover:text-emerald-900 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Yield Metrics Overview Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
        <div className="bg-slate-900 text-white p-4 rounded-xl shadow-sm border border-slate-800">
          <p className="text-slate-400 text-[11px] font-medium">Inversión Total en Lote</p>
          <p className="text-lg md:text-xl font-bold font-mono text-white mt-1">
            ${computedBatch.totalBatchCostUsd.toFixed(2)}{' '}
            <span className="text-[10px] text-slate-400">USD</span>
          </p>
          <p className="text-[10px] text-slate-400 mt-1">
            Bs. {(computedBatch.totalBatchCostUsd * bcvState.activeRate).toFixed(2)}
          </p>
        </div>

        <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
          <p className="text-slate-500 text-[11px] font-medium">Rendimiento Neto Vendible</p>
          <p className="text-lg md:text-xl font-bold font-mono text-emerald-600 mt-1">
            {computedBatch.netYieldPercent.toFixed(2)}%
          </p>
          <p className="text-[10px] text-slate-500 mt-1 font-bold">
            {computedBatch.netSalableWeightKg.toFixed(2)} Kg en piso de venta
          </p>
        </div>

        <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
          <p className="text-slate-500 text-[11px] font-medium">Merma Total Acumulada</p>
          <p className="text-lg md:text-xl font-bold font-mono text-rose-600 mt-1">
            {computedBatch.wastePercent.toFixed(2)}%
          </p>
          <p className="text-[10px] text-rose-600 mt-1 font-semibold">
            Pérdida: -${computedBatch.totalWasteLossUsd.toFixed(2)} USD (Bs. -{computedBatch.totalWasteLossVes.toFixed(2)})
          </p>
        </div>

        <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
          <p className="text-slate-500 text-[11px] font-medium">Costo Efectivo / PVP Sugerido</p>
          <p className="text-lg md:text-xl font-bold font-mono text-sky-700 mt-1">
            ${computedBatch.suggestedPvpPerKgUsd.toFixed(2)}{' '}
            <span className="text-[10px] text-slate-400">PVP/Kg</span>
          </p>
          <p className="text-[10px] text-slate-500 mt-1">
            Costo absorbido: ${computedBatch.effectiveCostPerSalableKgUsd.toFixed(2)} / Kg
          </p>
        </div>
      </div>

      {/* 5 Causes of Agricultural Waste Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden text-xs">
        <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-slate-50">
          <div>
            <h3 className="font-bold text-slate-900 text-sm">
              Auditoría y Clasificación de Mermas por 5 Causas Específicas
            </h3>
            <p className="text-[11px] text-slate-500">
              Registra los Kg descartados en cada rubro para medir el impacto financiero y la responsabilidad operativa.
            </p>
          </div>
          <span className="text-[11px] font-mono text-slate-600 bg-white px-2.5 py-1 rounded-lg border border-slate-200">
            Lote: {computedBatch.batchCode}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200 text-[11px]">
                <th className="py-2.5 px-3">Causa de Merma / Descomposición</th>
                <th className="py-2.5 px-3">Descripción Operativa</th>
                <th className="py-2.5 px-3 text-right">Peso Merma (Kg)</th>
                <th className="py-2.5 px-3 text-right">% del Lote</th>
                <th className="py-2.5 px-3 text-right">Pérdida en Costo ($ USD)</th>
                <th className="py-2.5 px-3 text-right">Pérdida en Costo (VES)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-mono">
              {computedBatch.wastes.map((waste) => (
                <tr key={waste.id} className="hover:bg-slate-50/80 transition">
                  <td className="py-3 px-3 font-sans font-bold text-slate-800">
                    {waste.causeLabel}
                  </td>
                  <td className="py-3 px-3 font-sans text-[11px] text-slate-500 max-w-xs">
                    {FRUVER_LOSS_CAUSE_LABELS[waste.cause]?.description}
                  </td>
                  <td className="py-3 px-3 text-right">
                    <input
                      type="number"
                      step="0.01"
                      value={wastesByCause[waste.cause] ?? waste.weightKg}
                      onChange={(e) => {
                        const val = Math.max(0, parseFloat(e.target.value) || 0);
                        setWastesByCause((prev) => ({ ...prev, [waste.cause]: val }));
                      }}
                      disabled={!canEdit}
                      className="w-20 px-2 py-1 text-right rounded border border-slate-300 font-bold bg-white text-slate-900"
                    />
                  </td>
                  <td className="py-3 px-3 text-right text-slate-700 font-semibold">
                    {waste.percentOfBatch.toFixed(2)}%
                  </td>
                  <td className="py-3 px-3 text-right font-bold text-rose-600">
                    -${waste.lossCostUsd.toFixed(2)}
                  </td>
                  <td className="py-3 px-3 text-right text-slate-500">
                    Bs. -{waste.lossCostVes.toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-slate-100/80 font-bold border-t border-slate-200">
                <td className="py-2.5 px-3 text-slate-900" colSpan={2}>
                  Total Mermas del Lote:
                </td>
                <td className="py-2.5 px-3 text-right text-rose-700 font-mono">
                  {computedBatch.totalWasteKg.toFixed(2)} Kg
                </td>
                <td className="py-2.5 px-3 text-right text-rose-700 font-mono">
                  {computedBatch.wastePercent.toFixed(2)}%
                </td>
                <td className="py-2.5 px-3 text-right text-rose-700 font-mono">
                  -${computedBatch.totalWasteLossUsd.toFixed(2)}
                </td>
                <td className="py-2.5 px-3 text-right text-rose-700 font-mono">
                  Bs. -{computedBatch.totalWasteLossVes.toFixed(2)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Proyector Inteligente de Compras Agrícolas */}
      <div className="bg-gradient-to-br from-slate-900 to-slate-950 text-white rounded-2xl p-5 shadow-sm border border-slate-800 text-xs">
        <div className="flex items-center gap-2 mb-3 pb-2 border-b border-slate-800">
          <ShoppingBag className="w-4 h-4 text-emerald-400" />
          <h3 className="font-bold text-white">
            Proyector Inteligente de Compras Agrícolas
          </h3>
        </div>

        <p className="text-slate-300 text-[11px] mb-4 max-w-3xl">
          Calcula cuántos Kilos brutos en finca/campo debes solicitar al proveedor para garantizar la demanda neta requerida en piso de venta, absorbiendo el porcentaje de merma histórica o de este lote.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
          <div>
            <label className="block text-slate-400 font-semibold mb-1">
              Producto Demandado
            </label>
            <input
              type="text"
              readOnly
              value={`${selectedProduct.name} (${selectedProduct.sku})`}
              className="w-full min-h-[38px] px-3 py-1.5 rounded-xl border border-slate-700 bg-slate-800 text-slate-300 text-xs font-medium cursor-not-allowed"
            />
          </div>

          <div>
            <label className="block text-slate-400 font-semibold mb-1">
              Demanda Neta en Piso de Venta (Kg)
            </label>
            <input
              type="number"
              min="1"
              value={targetDemandKg}
              onChange={(e) => setTargetDemandKg(Math.max(1, parseFloat(e.target.value) || 0))}
              className="w-full min-h-[38px] px-3 py-1.5 rounded-xl border border-slate-700 bg-slate-800 text-white font-mono font-bold"
            />
          </div>

          <div className="p-3 bg-slate-800/80 rounded-xl border border-slate-700/80">
            <p className="text-[10px] text-slate-400">Kilos Brutos Sugeridos a Comprar:</p>
            <p className="text-lg font-bold font-mono text-emerald-400">
              {fruverPurchaseProjection.rawNeededKg.toFixed(2)} Kg Brutos
            </p>
            <p className="text-[10px] text-slate-400">
              Rendimiento neto estimado: {fruverPurchaseProjection.salableYieldPercent}%
            </p>
          </div>

          <div>
            <button
              type="button"
              onClick={handleCreateProjectedPurchaseOrder}
              disabled={!canEdit || fruverPurchaseProjection.rawNeededKg <= 0}
              className="w-full min-h-[44px] px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-md transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              <Truck className="w-4 h-4" />
              <span>Generar Orden al Proveedor</span>
            </button>
          </div>
        </div>

        {purchaseOrderStatus && (
          <div className="mt-4 p-3 bg-emerald-950/80 border border-emerald-500/50 rounded-xl text-emerald-300 text-[11px] flex items-center justify-between">
            <div>
              <p className="font-bold">Orden {purchaseOrderStatus.orderNumber} generada en el sistema de Compras</p>
              <p className="text-[10px] text-emerald-400">
                {purchaseOrderStatus.rawKg.toFixed(2)} Kg en bruto asignados a {purchaseOrderStatus.supplierName}.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setPurchaseOrderStatus(null)}
              className="text-emerald-400 hover:text-emerald-200 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* Modal para Registro Rápido de Nuevo Proveedor Agrícola */}
      {showSupplierModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-lg w-full p-6 text-xs text-slate-800">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 mb-4">
              <div className="flex items-center gap-2">
                <span className="p-2 bg-emerald-100 text-emerald-700 rounded-xl">
                  <Building2 className="w-4 h-4" />
                </span>
                <h3 className="font-bold text-sm text-slate-900">
                  Alta de Proveedor Agrícola / Fruver
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowSupplierModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveSupplier} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">RIF Fiscal</label>
                  <input
                    type="text"
                    required
                    placeholder="J-12345678-9"
                    value={supplierForm.rif}
                    onChange={(e) => setSupplierForm({ ...supplierForm, rif: e.target.value })}
                    className="w-full min-h-[38px] px-3 py-1.5 rounded-xl border border-slate-300 font-mono font-bold focus:ring-2 focus:ring-emerald-500/30"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Categoría</label>
                  <select
                    value={supplierForm.category}
                    onChange={(e) => setSupplierForm({ ...supplierForm, category: e.target.value })}
                    className="w-full min-h-[38px] px-3 py-1.5 rounded-xl border border-slate-300 font-medium focus:ring-2 focus:ring-emerald-500/30"
                  >
                    <option value="Frutas y Hortalizas">Frutas y Hortalizas</option>
                    <option value="Distribuidora Agrícola">Distribuidora Agrícola</option>
                    <option value="Cooperativa de Productores">Cooperativa de Productores</option>
                    <option value="Carnes / Avícola">Carnes / Avícola</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Razón Social / Nombre</label>
                <input
                  type="text"
                  required
                  placeholder="Ej. Distribuidora Campo Fresco Los Andes, C.A."
                  value={supplierForm.name}
                  onChange={(e) => setSupplierForm({ ...supplierForm, name: e.target.value })}
                  className="w-full min-h-[38px] px-3 py-1.5 rounded-xl border border-slate-300 font-bold focus:ring-2 focus:ring-emerald-500/30"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Persona de Contacto</label>
                  <input
                    type="text"
                    placeholder="Ej. Eloy Zambrano"
                    value={supplierForm.contactName}
                    onChange={(e) => setSupplierForm({ ...supplierForm, contactName: e.target.value })}
                    className="w-full min-h-[38px] px-3 py-1.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-emerald-500/30"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Teléfono (E.164)</label>
                  <input
                    type="text"
                    placeholder="+58 414-1234567"
                    value={supplierForm.phone}
                    onChange={(e) => setSupplierForm({ ...supplierForm, phone: e.target.value })}
                    className="w-full min-h-[38px] px-3 py-1.5 rounded-xl border border-slate-300 font-mono focus:ring-2 focus:ring-emerald-500/30"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Días de Crédito</label>
                  <input
                    type="number"
                    min="0"
                    value={supplierForm.creditDays}
                    onChange={(e) => setSupplierForm({ ...supplierForm, creditDays: Number(e.target.value) || 0 })}
                    className="w-full min-h-[38px] px-3 py-1.5 rounded-xl border border-slate-300 font-mono focus:ring-2 focus:ring-emerald-500/30"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Términos de Pago</label>
                  <input
                    type="text"
                    placeholder="Crédito 7 Días Flete Incluido"
                    value={supplierForm.paymentTerms}
                    onChange={(e) => setSupplierForm({ ...supplierForm, paymentTerms: e.target.value })}
                    className="w-full min-h-[38px] px-3 py-1.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-emerald-500/30"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowSupplierModal(false)}
                  className="min-h-[40px] px-4 py-2 rounded-xl border border-slate-300 text-slate-600 hover:bg-slate-100 font-semibold cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="min-h-[40px] px-5 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-bold cursor-pointer shadow-md"
                >
                  Guardar Proveedor
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal para Registro Rápido de Nuevo Producto Agrícola */}
      {showProductModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-lg w-full p-6 text-xs text-slate-800">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 mb-4">
              <div className="flex items-center gap-2">
                <span className="p-2 bg-emerald-100 text-emerald-700 rounded-xl">
                  <Apple className="w-4 h-4" />
                </span>
                <h3 className="font-bold text-sm text-slate-900">
                  Alta de Nuevo Rubro Agrícola (Fruver)
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowProductModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveProduct} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">SKU Interno</label>
                  <input
                    type="text"
                    required
                    placeholder="Ej. FRUV-AGU-CRI"
                    value={productForm.sku}
                    onChange={(e) => setProductForm({ ...productForm, sku: e.target.value })}
                    className="w-full min-h-[38px] px-3 py-1.5 rounded-xl border border-slate-300 font-mono font-bold focus:ring-2 focus:ring-emerald-500/30"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Categoría</label>
                  <select
                    value={productForm.category}
                    onChange={(e) => setProductForm({ ...productForm, category: e.target.value as FruverCategory })}
                    className="w-full min-h-[38px] px-3 py-1.5 rounded-xl border border-slate-300 font-medium focus:ring-2 focus:ring-emerald-500/30"
                  >
                    <option value="VERDURAS_HORTALIZAS">Verduras y Hortalizas</option>
                    <option value="FRUTAS">Frutas</option>
                    <option value="TUBERCULOS_RAICES">Tubérculos y Raíces</option>
                    <option value="LEGUMBRES_GRANOS">Legumbres y Granos</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Nombre Comercial del Rubro</label>
                <input
                  type="text"
                  required
                  placeholder="Ej. Aguacate Criollo Injerto Especial"
                  value={productForm.name}
                  onChange={(e) => setProductForm({ ...productForm, name: e.target.value })}
                  className="w-full min-h-[38px] px-3 py-1.5 rounded-xl border border-slate-300 font-bold focus:ring-2 focus:ring-emerald-500/30"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Costo Base ($/Kg)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={productForm.costKg}
                    onChange={(e) => setProductForm({ ...productForm, costKg: parseFloat(e.target.value) || 0.1 })}
                    className="w-full min-h-[38px] px-3 py-1.5 rounded-xl border border-slate-300 font-mono font-bold focus:ring-2 focus:ring-emerald-500/30"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Rend. Esperado %</label>
                  <input
                    type="number"
                    step="1"
                    min="50"
                    max="100"
                    value={productForm.expectedYield}
                    onChange={(e) => setProductForm({ ...productForm, expectedYield: parseFloat(e.target.value) || 90 })}
                    className="w-full min-h-[38px] px-3 py-1.5 rounded-xl border border-slate-300 font-mono focus:ring-2 focus:ring-emerald-500/30"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Margen Obj. %</label>
                  <input
                    type="number"
                    step="1"
                    min="1"
                    max="90"
                    value={productForm.margin}
                    onChange={(e) => setProductForm({ ...productForm, margin: parseFloat(e.target.value) || 28 })}
                    className="w-full min-h-[38px] px-3 py-1.5 rounded-xl border border-slate-300 font-mono focus:ring-2 focus:ring-emerald-500/30"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowProductModal(false)}
                  className="min-h-[40px] px-4 py-2 rounded-xl border border-slate-300 text-slate-600 hover:bg-slate-100 font-semibold cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="min-h-[40px] px-5 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-bold cursor-pointer shadow-md"
                >
                  Registrar Rubro
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default FruverYieldView;
