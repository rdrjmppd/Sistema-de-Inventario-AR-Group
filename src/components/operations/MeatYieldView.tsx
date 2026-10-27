/**
 * Meat Yield & Butchery Transformation View (Rendimiento Cárnico)
 * Supports Res, Cerdo, and Pollo carcass cross-inventory processing and yields.
 * Upgraded Features:
 *  - Custom non-random batch ingestion (SADA guide / official lot coding) and reception date.
 *  - Full integration with Suppliers (useFinance) with on-the-fly registration modal.
 *  - Species-tailored cut breakdowns and specific waste items for Res, Cerdo, and Pollo.
 *  - Direct "Cargar Lote al Inventario" committing cuts into multi-location catalog stock.
 *  - Intelligent purchase projection linked directly to targeted supplier purchase order generation.
 * Dual Export: export const MeatYieldView and export default MeatYieldView.
 * Official Copyright: © 2026 AR Group. Todos los derechos de desarrollo reservados.
 */

import React, { useState, useMemo, useEffect } from 'react';
import {
  Layers,
  Scale,
  TrendingUp,
  AlertTriangle,
  Plus,
  FileSpreadsheet,
  CheckCircle2,
  Calculator,
  RefreshCw,
  ShoppingBag,
  Building2,
  Calendar,
  Barcode,
  Truck,
  Check,
  X,
  ArrowRight,
  ShieldCheck,
} from 'lucide-react';
import {
  MeatAnimalType,
  MeatCarcassPresentation,
  MeatYieldBatch,
  CreateMeatYieldBatchInput,
  UserRole,
  Product,
} from '../../types';
import { useAuth } from '../../context/AuthContext';
import { useInventory } from '../../context/InventoryContext';
import { useFinance } from '../../context/FinanceContext';
import {
  RES_STANDARD_CUTS,
  CERDO_STANDARD_CUTS,
  POLLO_STANDARD_CUTS,
  MEAT_WASTE_LABELS,
  calculateMeatYieldBatch,
  projectCarcassRequirementForCutDemand,
} from '../../lib/meat-yield';

// Waste configurations by animal species
interface WasteItemConfig {
  key: string;
  wasteType: 'MERMA_EVAPORACION_LIQUIDOS' | 'ASERRIN_CORTE_SIERRA' | 'HUESO_BLANCO_DESECHO' | 'GRASA_SEBO_DESECHO' | 'OTRA_MERMA_DESPOSTE';
  label: string;
  defaultKg: number;
}

const SPECIES_WASTES: Record<MeatAnimalType, WasteItemConfig[]> = {
  RES: [
    { key: 'mermaOreo', wasteType: 'MERMA_EVAPORACION_LIQUIDOS', label: 'Merma por Líquidos y Oreo en Cava', defaultKg: 4.5 },
    { key: 'aserrinSierra', wasteType: 'ASERRIN_CORTE_SIERRA', label: 'Merma por Aserrín de Corte Sierra', defaultKg: 2.2 },
    { key: 'huesoDesecho', wasteType: 'HUESO_BLANCO_DESECHO', label: 'Hueso Blanco No Aprovechable (Desecho)', defaultKg: 6.8 },
    { key: 'seboDesecho', wasteType: 'GRASA_SEBO_DESECHO', label: 'Sebo / Grasa Excedente No Comercial', defaultKg: 3.5 },
  ],
  CERDO: [
    { key: 'aserrinSierra', wasteType: 'ASERRIN_CORTE_SIERRA', label: 'Merma por Aserrín de Corte Sierra', defaultKg: 1.5 },
    { key: 'huesoDesecho', wasteType: 'HUESO_BLANCO_DESECHO', label: 'Hueso Blanco / Espinazo Desecho', defaultKg: 3.8 },
    { key: 'seboDesecho', wasteType: 'GRASA_SEBO_DESECHO', label: 'Manteca / Grasa Recorte Descarte', defaultKg: 2.2 },
    { key: 'mermaOreo', wasteType: 'MERMA_EVAPORACION_LIQUIDOS', label: 'Merma por Evaporación y Oreo Frío', defaultKg: 2.0 },
  ],
  POLLO: [
    { key: 'mermaOreo', wasteType: 'MERMA_EVAPORACION_LIQUIDOS', label: 'Merma por Desangre y Líquido Inmersión', defaultKg: 0.8 },
    { key: 'seboDesecho', wasteType: 'GRASA_SEBO_DESECHO', label: 'Grasa y Piel Excedente Descarte', defaultKg: 0.5 },
    { key: 'huesoDesecho', wasteType: 'HUESO_BLANCO_DESECHO', label: 'Carcasa Ósea Menuda Desecho', defaultKg: 1.2 },
    { key: 'aserrinSierra', wasteType: 'OTRA_MERMA_DESPOSTE', label: 'Otras Mermas de Despiece y Limpieza', defaultKg: 0.3 },
  ],
};

export const MeatYieldView: React.FC = () => {
  const { user, hasPermission } = useAuth();
  const { locations, products, addOrUpdateProduct, logAuditEvent, createManualPurchaseOrder } = useInventory();
  const { bcvState, suppliers, addSupplier } = useFinance();

  const [selectedAnimal, setSelectedAnimal] = useState<MeatAnimalType>('RES');
  const [selectedPresentation, setSelectedPresentation] = useState<MeatCarcassPresentation>('MEDIA_CANAL');
  const [selectedLocationId, setSelectedLocationId] = useState<string>(locations[0]?.id || 'loc-pzo-01');
  const [carcassWeight, setCarcassWeight] = useState<number>(220); // 220 Kg default
  const [carcassCostKg, setCarcassCostKg] = useState<number>(2.85); // $2.85/Kg default

  // Custom Batch Code & Reception Date
  const [customBatchCode, setCustomBatchCode] = useState<string>('');
  const [receptionDate, setReceptionDate] = useState<string>(() => new Date().toISOString().split('T')[0]);

  // Supplier Selection & Modal
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>(() => {
    const meatSup = suppliers.find((s) => s.category?.toLowerCase().includes('carne') || s.category?.toLowerCase().includes('avícola'));
    return meatSup?.id || suppliers[0]?.id || 'sup-001';
  });
  const [showSupplierModal, setShowSupplierModal] = useState<boolean>(false);
  const [supplierForm, setSupplierForm] = useState({
    rif: '',
    name: '',
    category: 'Carnes / Avícola',
    contactName: '',
    phone: '',
    email: '',
    creditDays: 15,
    paymentTerms: 'Crédito 15 Días Canal Fría',
  });

  // Custom cuts weights state initialized from standard template
  const initialTemplate = useMemo(() => {
    return selectedAnimal === 'RES'
      ? RES_STANDARD_CUTS
      : selectedAnimal === 'CERDO'
      ? CERDO_STANDARD_CUTS
      : POLLO_STANDARD_CUTS;
  }, [selectedAnimal]);

  const [cutWeights, setCutWeights] = useState<Record<string, number>>(() => {
    const map: Record<string, number> = {};
    RES_STANDARD_CUTS.forEach((c) => {
      map[c.cutName] = parseFloat(((220 * c.expectedYieldPercent) / 100).toFixed(2));
    });
    return map;
  });

  // Wastes state dynamic per species
  const [wasteWeights, setWasteWeights] = useState<Record<string, number>>(() => {
    const init: Record<string, number> = {};
    SPECIES_WASTES.RES.forEach((w) => {
      init[w.key] = w.defaultKg;
    });
    return init;
  });

  // Future purchase projection calculator state
  const [projectionCutName, setProjectionCutName] = useState<string>('Lomito / Filet Mignon');
  const [targetDemandKg, setTargetDemandKg] = useState<number>(50);

  // Status banners for operations
  const [inventoryLoadStatus, setInventoryLoadStatus] = useState<{
    success: boolean;
    message: string;
    count?: number;
    totalKg?: number;
    timestamp?: string;
  } | null>(null);

  const [purchaseOrderStatus, setPurchaseOrderStatus] = useState<{
    orderNumber: string;
    carcassKg: number;
    supplierName: string;
  } | null>(null);

  // If suppliers update, ensure selectedSupplierId is valid
  useEffect(() => {
    if (!suppliers.some((s) => s.id === selectedSupplierId) && suppliers.length > 0) {
      setSelectedSupplierId(suppliers[0].id);
    }
  }, [suppliers, selectedSupplierId]);

  // Re-initialize weights on animal change
  const handleAnimalChange = (animal: MeatAnimalType) => {
    setSelectedAnimal(animal);
    const template =
      animal === 'RES'
        ? RES_STANDARD_CUTS
        : animal === 'CERDO'
        ? CERDO_STANDARD_CUTS
        : POLLO_STANDARD_CUTS;

    const defaultWeight = animal === 'RES' ? 220 : animal === 'CERDO' ? 95 : 25;
    const defaultCost = animal === 'RES' ? 2.85 : animal === 'CERDO' ? 3.40 : 2.10;
    setCarcassWeight(defaultWeight);
    setCarcassCostKg(defaultCost);

    const map: Record<string, number> = {};
    template.forEach((c) => {
      map[c.cutName] = parseFloat(((defaultWeight * c.expectedYieldPercent) / 100).toFixed(2));
    });
    setCutWeights(map);
    setProjectionCutName(template[0]?.cutName || '');

    // Reset wastes to animal-specific defaults
    const wastesMap: Record<string, number> = {};
    SPECIES_WASTES[animal].forEach((w) => {
      wastesMap[w.key] = w.defaultKg;
    });
    setWasteWeights(wastesMap);

    // Reset status feedback
    setInventoryLoadStatus(null);
    setPurchaseOrderStatus(null);
  };

  // Build live computed batch
  const computedBatch: MeatYieldBatch = useMemo(() => {
    const loc = locations.find((l) => l.id === selectedLocationId) || locations[0];
    const sup = suppliers.find((s) => s.id === selectedSupplierId);
    const template =
      selectedAnimal === 'RES'
        ? RES_STANDARD_CUTS
        : selectedAnimal === 'CERDO'
        ? CERDO_STANDARD_CUTS
        : POLLO_STANDARD_CUTS;

    const cutsInput = template.map((c) => ({
      cutName: c.cutName,
      tier: c.tier,
      weightKg: cutWeights[c.cutName] || 0,
      relativeValueFactor: c.relativeValueFactor,
      targetMarginPercent: c.defaultTargetMarginPercent,
    }));

    const wastesConfig = SPECIES_WASTES[selectedAnimal];
    const wastesInput = wastesConfig.map((w) => ({
      wasteType: w.wasteType,
      label: w.label,
      weightKg: wasteWeights[w.key] ?? w.defaultKg,
    }));

    const input: CreateMeatYieldBatchInput = {
      animalType: selectedAnimal,
      presentation: selectedPresentation,
      locationId: loc ? loc.id : 'loc-pzo-01',
      carcassWeightKg: carcassWeight || 1,
      carcassCostPerKgUsd: carcassCostKg || 1,
      customBatchCode: customBatchCode.trim() || undefined,
      receptionDate: receptionDate || undefined,
      supplierId: selectedSupplierId || undefined,
      supplierName: sup ? sup.name : undefined,
      cuts: cutsInput,
      wastes: wastesInput,
    };

    return calculateMeatYieldBatch({
      input,
      bcvRate: bcvState.activeRate,
      locationName: loc ? loc.name : 'Sede Principal',
      supervisor: {
        uid: user?.uid || 'usr-supervisor',
        displayName: user?.displayName || 'Supervisor Carnicería',
        role: user?.role || UserRole.SUPERVISOR_CARNICERIA,
      },
    });
  }, [
    selectedAnimal,
    selectedPresentation,
    selectedLocationId,
    carcassWeight,
    carcassCostKg,
    customBatchCode,
    receptionDate,
    selectedSupplierId,
    cutWeights,
    wasteWeights,
    locations,
    suppliers,
    bcvState.activeRate,
    user,
  ]);

  // Purchase requirement projection calculation
  const purchaseProjection = useMemo(() => {
    return projectCarcassRequirementForCutDemand({
      animalType: selectedAnimal,
      cutName: projectionCutName,
      targetDemandKg: targetDemandKg || 1,
    });
  }, [selectedAnimal, projectionCutName, targetDemandKg]);

  const canEdit = hasPermission([
    UserRole.SUPERADMIN,
    UserRole.GERENTE,
    UserRole.ANALISTA,
    UserRole.SUPERVISOR_CARNICERIA,
  ]);

  // Commit batch cuts directly into active inventory
  const handleLoadToInventory = () => {
    if (!canEdit) return;
    const loc = locations.find((l) => l.id === selectedLocationId) || locations[0];
    const sup = suppliers.find((s) => s.id === selectedSupplierId);

    let loadedCount = 0;
    let totalLoadedKg = 0;

    computedBatch.cuts.forEach((cut, idx) => {
      if (cut.weightKg > 0) {
        const cleanSlug = cut.cutName
          .split('/')[0]
          .trim()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[^A-Za-z0-9]/g, '')
          .slice(0, 6)
          .toUpperCase();
        const sku = `CARN-${selectedAnimal.slice(0, 3)}-${cleanSlug}`;

        const existingProd = products.find(
          (p) => p.sku === sku || p.name.toLowerCase() === cut.cutName.toLowerCase()
        );

        if (existingProd) {
          const currentStock = existingProd.stockByLocation[selectedLocationId] || 0;
          const newStock = parseFloat((currentStock + cut.weightKg).toFixed(2));
          const updatedProd: Product = {
            ...existingProd,
            costUsd: cut.allocatedCostPerKgUsd,
            targetMarginPercent: cut.targetMarginPercent,
            priceUsd: cut.retailPriceUsdPerKg,
            supplierId: selectedSupplierId,
            stockByLocation: {
              ...existingProd.stockByLocation,
              [selectedLocationId]: newStock,
            },
            lastUpdatedVet: new Date().toISOString(),
          };
          addOrUpdateProduct(updatedProd, existingProd);
        } else {
          const animalLabel =
            selectedAnimal === 'RES' ? 'Vacuno' : selectedAnimal === 'CERDO' ? 'Cerdo' : 'Pollo';
          const newProd: Product = {
            id: `prd-carn-${selectedAnimal.toLowerCase()}-${cleanSlug.toLowerCase()}-${Date.now() + idx}`,
            sku,
            barcode: `759${Math.floor(1000000000 + Math.random() * 9000000000)}`,
            name: `${cut.cutName} (${animalLabel})`,
            category: 'Carnicería',
            unit: 'KG',
            costUsd: cut.allocatedCostPerKgUsd,
            targetMarginPercent: cut.targetMarginPercent,
            priceUsd: cut.retailPriceUsdPerKg,
            ivaRate: 0,
            stockByLocation: {
              [selectedLocationId]: cut.weightKg,
            },
            minStockByLocation: {
              [selectedLocationId]: 20,
            },
            monthlyUnitsSold: 120,
            abcClass: 'A',
            supplierId: selectedSupplierId,
            lastUpdatedVet: new Date().toISOString(),
          };
          addOrUpdateProduct(newProd);
        }
        loadedCount++;
        totalLoadedKg += cut.weightKg;
      }
    });

    logAuditEvent(
      'MEAT_YIELD_INVENTORY_LOAD',
      'INVENTORY',
      `Lote cárnico ${computedBatch.batchCode} cargado a inventario en ${loc.name}. ${totalLoadedKg.toFixed(2)} Kg en ${loadedCount} cortes.`,
      {
        batchCode: computedBatch.batchCode,
        animalType: selectedAnimal,
        locationId: selectedLocationId,
        locationName: loc.name,
        supplierId: selectedSupplierId,
        supplierName: sup?.name,
        totalLoadedKg,
        loadedCount,
      },
      computedBatch.batchCode
    );

    setInventoryLoadStatus({
      success: true,
      message: `Lote ${computedBatch.batchCode} procesado e ingresado al inventario en "${loc.name}".`,
      count: loadedCount,
      totalKg: totalLoadedKg,
      timestamp: new Date().toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    });
  };

  // Generate suggested purchase order from projected cut demand
  const handleCreateProjectedPurchaseOrder = () => {
    if (!canEdit) return;
    const sup = suppliers.find((s) => s.id === selectedSupplierId) || suppliers[0];

    const template = initialTemplate;
    const targetCut = template.find((t) => t.cutName === projectionCutName) || template[0];
    const cleanSlug = targetCut.cutName
      .split('/')[0]
      .trim()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^A-Za-z0-9]/g, '')
      .slice(0, 6)
      .toUpperCase();
    const sku = `CARN-${selectedAnimal.slice(0, 3)}-${cleanSlug}`;

    let targetProduct = products.find((p) => p.sku === sku);
    if (!targetProduct) {
      targetProduct = {
        id: `prd-carn-${selectedAnimal.toLowerCase()}-${cleanSlug.toLowerCase()}-base`,
        sku,
        barcode: `759${Math.floor(1000000000 + Math.random() * 9000000000)}`,
        name: `${targetCut.cutName} (${selectedAnimal})`,
        category: 'Carnicería',
        unit: 'KG',
        costUsd: carcassCostKg,
        targetMarginPercent: targetCut.defaultTargetMarginPercent,
        priceUsd: parseFloat((carcassCostKg * 1.35).toFixed(2)),
        ivaRate: 0,
        stockByLocation: { [selectedLocationId]: 0 },
        minStockByLocation: { [selectedLocationId]: 20 },
        monthlyUnitsSold: 100,
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
      orderedQty: purchaseProjection.carcassNeededKg,
      unitCostUsd: carcassCostKg,
      horizonDaysUsed: 15,
      systemSuggestedQty: purchaseProjection.carcassNeededKg,
      notes: `Orden proyectada desde Rendimiento Cárnico para cubrir ${targetDemandKg} Kg de corte '${projectionCutName}'. Requiere ${purchaseProjection.carcassNeededKg} Kg en canal. Proveedor seleccionado: ${sup.name}.`,
    });

    if (result.success && result.order) {
      setPurchaseOrderStatus({
        orderNumber: result.order.orderNumber,
        carcassKg: purchaseProjection.carcassNeededKg,
        supplierName: sup.name,
      });
    }
  };

  // Submit new supplier modal
  const handleSaveSupplier = (e: React.FormEvent) => {
    e.preventDefault();
    if (!supplierForm.rif.trim() || !supplierForm.name.trim()) return;

    addSupplier({
      rif: supplierForm.rif.trim().toUpperCase(),
      name: supplierForm.name.trim(),
      category: supplierForm.category,
      contactName: supplierForm.contactName.trim() || 'Contacto Comercial',
      phone: supplierForm.phone.trim() || '+58 414-0000000',
      email: supplierForm.email.trim() || 'ventas@frigorifico.com',
      creditDays: Number(supplierForm.creditDays) || 15,
      paymentTerms: supplierForm.paymentTerms.trim() || 'Crédito 15 Días Canal Fría',
    });

    setShowSupplierModal(false);
    setSupplierForm({
      rif: '',
      name: '',
      category: 'Carnes / Avícola',
      contactName: '',
      phone: '',
      email: '',
      creditDays: 15,
      paymentTerms: 'Crédito 15 Días Canal Fría',
    });
  };

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-rose-950 via-slate-900 to-slate-900 border border-rose-900/40 rounded-2xl p-5 shadow-xl text-white flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-xl bg-rose-600/30 border border-rose-500/40 text-rose-400">
              <Layers className="w-5 h-5" />
            </span>
            <h1 className="text-lg md:text-xl font-bold tracking-tight">
              Rendimiento Cárnico & Transformación de Despiece
            </h1>
          </div>
          <p className="text-xs text-slate-300 mt-1 max-w-2xl">
            Codificación de lotes reales, trazabilidad SADA/sanitaria, desglose específico de <strong>Res, Cerdo y Pollo</strong>, carga directa a inventario y proyección de compra enlazada a proveedores.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="px-3 py-1.5 rounded-xl bg-slate-800/80 border border-slate-700 text-xs font-mono">
            Tasa BCV: <strong>{bcvState.activeRate.toFixed(4)}</strong> VES
          </span>
          <span className="px-3 py-1.5 rounded-xl bg-rose-500/20 text-rose-300 border border-rose-400/30 text-xs font-semibold">
            Modo Doble Firma
          </span>
        </div>
      </div>

      {/* Animal Selection Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
        <button
          type="button"
          onClick={() => handleAnimalChange('RES')}
          className={`min-h-[44px] px-5 py-2.5 rounded-xl font-bold text-xs transition cursor-pointer flex items-center gap-2 ${
            selectedAnimal === 'RES'
              ? 'bg-rose-700 text-white shadow-md'
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <span>🥩 Vacuno (Res)</span>
        </button>

        <button
          type="button"
          onClick={() => handleAnimalChange('CERDO')}
          className={`min-h-[44px] px-5 py-2.5 rounded-xl font-bold text-xs transition cursor-pointer flex items-center gap-2 ${
            selectedAnimal === 'CERDO'
              ? 'bg-amber-600 text-white shadow-md'
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <span>🥓 Porcino (Cerdo)</span>
        </button>

        <button
          type="button"
          onClick={() => handleAnimalChange('POLLO')}
          className={`min-h-[44px] px-5 py-2.5 rounded-xl font-bold text-xs transition cursor-pointer flex items-center gap-2 ${
            selectedAnimal === 'POLLO'
              ? 'bg-emerald-700 text-white shadow-md'
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <span>🍗 Avícola (Pollo)</span>
        </button>
      </div>

      {/* Carcass Receipt & Batch Input Parameters */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-3 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm text-xs">
        {/* Código de Lote Personalizado */}
        <div>
          <label className="block font-bold text-slate-700 mb-1 flex items-center gap-1">
            <Barcode className="w-3.5 h-3.5 text-rose-600" />
            Código Lote / Guía SADA
          </label>
          <input
            type="text"
            placeholder="Ej. SADA-2026-90412"
            value={customBatchCode}
            onChange={(e) => setCustomBatchCode(e.target.value)}
            disabled={!canEdit}
            className="w-full min-h-[40px] px-3 py-2 rounded-xl border border-slate-300 bg-slate-50 text-slate-800 font-mono font-bold focus:ring-2 focus:ring-rose-500/30"
          />
        </div>

        {/* Fecha de Recepción */}
        <div>
          <label className="block font-bold text-slate-700 mb-1 flex items-center gap-1">
            <Calendar className="w-3.5 h-3.5 text-slate-600" />
            Fecha Recepción
          </label>
          <input
            type="date"
            value={receptionDate}
            onChange={(e) => setReceptionDate(e.target.value)}
            disabled={!canEdit}
            className="w-full min-h-[40px] px-3 py-2 rounded-xl border border-slate-300 bg-slate-50 text-slate-800 font-medium focus:ring-2 focus:ring-rose-500/30"
          />
        </div>

        {/* Sede o Depósito */}
        <div>
          <label className="block font-bold text-slate-700 mb-1">Sede / Depósito</label>
          <select
            value={selectedLocationId}
            onChange={(e) => setSelectedLocationId(e.target.value)}
            disabled={!canEdit}
            className="w-full min-h-[40px] px-3 py-2 rounded-xl border border-slate-300 bg-slate-50 text-slate-800 font-medium focus:ring-2 focus:ring-rose-500/30"
          >
            {locations.map((loc) => (
              <option key={loc.id} value={loc.id}>
                {loc.name} ({loc.code})
              </option>
            ))}
          </select>
        </div>

        {/* Proveedor Cárnico con botón de nuevo proveedor */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="font-bold text-slate-700 flex items-center gap-1">
              <Truck className="w-3.5 h-3.5 text-slate-600" />
              Proveedor
            </label>
            <button
              type="button"
              onClick={() => setShowSupplierModal(true)}
              className="text-[10px] text-rose-700 hover:text-rose-900 font-bold underline cursor-pointer"
            >
              + Nuevo
            </button>
          </div>
          <select
            value={selectedSupplierId}
            onChange={(e) => setSelectedSupplierId(e.target.value)}
            disabled={!canEdit}
            className="w-full min-h-[40px] px-3 py-2 rounded-xl border border-slate-300 bg-slate-50 text-slate-800 font-medium focus:ring-2 focus:ring-rose-500/30"
          >
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.rif})
              </option>
            ))}
          </select>
        </div>

        {/* Peso en Canal */}
        <div>
          <label className="block font-bold text-slate-700 mb-1">
            Peso Canal / Lote (Kg)
          </label>
          <div className="relative">
            <input
              type="number"
              step="0.01"
              value={carcassWeight}
              onChange={(e) => setCarcassWeight(Math.max(0.1, parseFloat(e.target.value) || 0))}
              disabled={!canEdit}
              className="w-full min-h-[40px] px-3 py-2 rounded-xl border border-slate-300 bg-slate-50 text-slate-900 font-bold font-mono focus:ring-2 focus:ring-rose-500/30"
            />
            <span className="absolute right-3 top-2.5 text-slate-400 font-bold text-xs">Kg</span>
          </div>
        </div>

        {/* Costo Unitario USD */}
        <div>
          <label className="block font-bold text-slate-700 mb-1">
            Costo Canal ($ USD/Kg)
          </label>
          <div className="relative">
            <input
              type="number"
              step="0.01"
              value={carcassCostKg}
              onChange={(e) => setCarcassCostKg(Math.max(0.01, parseFloat(e.target.value) || 0))}
              disabled={!canEdit}
              className="w-full min-h-[40px] px-3 py-2 rounded-xl border border-slate-300 bg-slate-50 text-slate-900 font-bold font-mono focus:ring-2 focus:ring-rose-500/30"
            />
            <span className="absolute right-3 top-2.5 text-slate-400 font-bold text-xs">USD</span>
          </div>
        </div>
      </div>

      {/* Action Bar: Cargar Lote al Inventario */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-4 bg-slate-50 rounded-2xl border border-slate-200">
        <div className="flex items-center gap-3">
          <span className="p-2.5 rounded-xl bg-rose-100 text-rose-700">
            <Scale className="w-5 h-5" />
          </span>
          <div>
            <p className="font-bold text-slate-900 text-xs">
              Lote Activo: <span className="font-mono text-rose-700">{computedBatch.batchCode}</span>
            </p>
            <p className="text-[11px] text-slate-500">
              Fecha: {computedBatch.receptionDate || receptionDate} | Sede: {computedBatch.locationName} | Proveedor: {computedBatch.supplierName || 'No asignado'}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleLoadToInventory}
          disabled={!canEdit || computedBatch.totalCutsWeightKg <= 0}
          className="min-h-[44px] px-5 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800 text-white font-bold text-xs rounded-xl shadow-md transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
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
                Total ingresado: <strong>{inventoryLoadStatus.totalKg?.toFixed(2)} Kg</strong> distribuidos en <strong>{inventoryLoadStatus.count}</strong> cortes comerciales. Registrado a las {inventoryLoadStatus.timestamp}.
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

      {/* Financial & Yield Performance Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
        <div className="bg-slate-900 text-white p-4 rounded-xl shadow-sm border border-slate-800">
          <p className="text-slate-400 text-[11px] font-medium">Inversión Total en Canal</p>
          <p className="text-lg md:text-xl font-bold font-mono text-white mt-1">
            ${computedBatch.totalCarcassCostUsd.toFixed(2)}{' '}
            <span className="text-[10px] text-slate-400">USD</span>
          </p>
          <p className="text-[10px] text-slate-400 mt-1">
            Bs. {(computedBatch.totalCarcassCostUsd * bcvState.activeRate).toFixed(2)}
          </p>
        </div>

        <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
          <p className="text-slate-500 text-[11px] font-medium">Rendimiento Cortes Vendibles</p>
          <p className="text-lg md:text-xl font-bold font-mono text-emerald-600 mt-1">
            {computedBatch.cutsYieldPercent.toFixed(2)}%
          </p>
          <p className="text-[10px] text-slate-500 mt-1">
            {computedBatch.totalCutsWeightKg.toFixed(2)} Kg en cortes
          </p>
        </div>

        <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
          <p className="text-slate-500 text-[11px] font-medium">Merma Total de Desposte</p>
          <p className="text-lg md:text-xl font-bold font-mono text-amber-600 mt-1">
            {computedBatch.wastePercent.toFixed(2)}%
          </p>
          <p className="text-[10px] text-slate-500 mt-1">
            {computedBatch.totalWasteWeightKg.toFixed(2)} Kg de pérdida
          </p>
        </div>

        <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
          <p className="text-slate-500 text-[11px] font-medium">Margen Proyectado Lote</p>
          <p className="text-lg md:text-xl font-bold font-mono text-sky-600 mt-1">
            {computedBatch.projectedMarginPercent.toFixed(2)}%
          </p>
          <p className="text-[10px] text-slate-500 mt-1">
            Utilidad: +${computedBatch.projectedGrossProfitUsd.toFixed(2)} USD
          </p>
        </div>
      </div>

      {/* Main Table: Cuts Breakdown & Relative Value Costing */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden text-xs">
        <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-slate-50">
          <div>
            <h3 className="font-bold text-slate-900 text-sm">
              Desglose de Cortes Obtenidos & PVP Sugerido ({selectedAnimal})
            </h3>
            <p className="text-[11px] text-slate-500">
              Ajusta los Kg pesados para recalcular el rendimiento y el costo asignado por valor comercial relativo.
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
                <th className="py-2.5 px-3">Corte / Subproducto</th>
                <th className="py-2.5 px-3">Categoría</th>
                <th className="py-2.5 px-3 text-right">Peso (Kg)</th>
                <th className="py-2.5 px-3 text-right">Rend. %</th>
                <th className="py-2.5 px-3 text-right">Costo Asignado ($/Kg)</th>
                <th className="py-2.5 px-3 text-right">Margen %</th>
                <th className="py-2.5 px-3 text-right">PVP ($/Kg)</th>
                <th className="py-2.5 px-3 text-right">PVP (Bs./Kg)</th>
                <th className="py-2.5 px-3 text-right">Ingreso Proy. ($)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-mono">
              {computedBatch.cuts.map((cut) => (
                <tr key={cut.id} className="hover:bg-slate-50/80 transition">
                  <td className="py-2.5 px-3 font-sans font-bold text-slate-800">
                    {cut.cutName}
                  </td>
                  <td className="py-2.5 px-3 font-sans text-[10px]">
                    <span
                      className={`px-2 py-0.5 rounded-full font-semibold ${
                        cut.tier === 'PRIMERA_ALTO_VALOR'
                          ? 'bg-rose-100 text-rose-800'
                          : cut.tier === 'SEGUNDA_CORTE_GUISO'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {cut.tier.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-right">
                    <input
                      type="number"
                      step="0.01"
                      value={cutWeights[cut.cutName] ?? cut.weightKg}
                      onChange={(e) => {
                        const val = Math.max(0, parseFloat(e.target.value) || 0);
                        setCutWeights((prev) => ({ ...prev, [cut.cutName]: val }));
                      }}
                      disabled={!canEdit}
                      className="w-20 px-2 py-1 text-right rounded border border-slate-300 font-bold bg-white"
                    />
                  </td>
                  <td className="py-2.5 px-3 text-right text-slate-700">
                    {cut.yieldPercent.toFixed(2)}%
                  </td>
                  <td className="py-2.5 px-3 text-right font-bold text-slate-900">
                    ${cut.allocatedCostPerKgUsd.toFixed(2)}
                  </td>
                  <td className="py-2.5 px-3 text-right text-slate-600">
                    {cut.targetMarginPercent}%
                  </td>
                  <td className="py-2.5 px-3 text-right font-bold text-emerald-700">
                    ${cut.retailPriceUsdPerKg.toFixed(2)}
                  </td>
                  <td className="py-2.5 px-3 text-right text-slate-600">
                    Bs. {cut.retailPriceVesPerKg.toFixed(2)}
                  </td>
                  <td className="py-2.5 px-3 text-right font-bold text-slate-900">
                    ${cut.projectedRevenueUsd.toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mermas Específicas & Proyector Inteligente de Compras */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Wastes Classification Card adaptada a la especie */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 text-xs">
          <div className="flex items-center gap-2 mb-3 pb-2 border-b border-slate-100">
            <AlertTriangle className="w-4 h-4 text-amber-600" />
            <h3 className="font-bold text-slate-900">
              Desglose y Clasificación de Mermas ({selectedAnimal})
            </h3>
          </div>

          <div className="space-y-3 font-mono">
            {SPECIES_WASTES[selectedAnimal].map((item) => {
              const currentVal = wasteWeights[item.key] ?? item.defaultKg;
              const lossCost = roundToTwo((currentVal * (carcassCostKg || 1)));
              const wastePct = carcassWeight > 0 ? ((currentVal / carcassWeight) * 100).toFixed(2) : '0.00';
              return (
                <div
                  key={item.key}
                  className="flex items-center justify-between p-2.5 bg-slate-50 rounded-xl border border-slate-200"
                >
                  <div className="pr-2">
                    <p className="font-sans font-bold text-slate-800 text-xs">
                      {item.label}
                    </p>
                    <p className="text-[10px] text-slate-500 font-sans">
                      {wastePct}% sobre peso en canal | Pérdida: -${lossCost.toFixed(2)} USD
                    </p>
                  </div>
                  <div className="text-right">
                    <input
                      type="number"
                      step="0.01"
                      value={currentVal}
                      onChange={(e) => {
                        const val = Math.max(0, parseFloat(e.target.value) || 0);
                        setWasteWeights((prev) => ({ ...prev, [item.key]: val }));
                      }}
                      disabled={!canEdit}
                      className="w-20 px-2 py-1 text-right rounded border border-slate-300 font-bold bg-white text-slate-900"
                    />
                    <span className="text-[10px] text-slate-400 font-bold ml-1 font-sans">Kg</span>
                  </div>
                </div>
              );
            })}

            {computedBatch.unaccountedWeightKg !== 0 && (
              <div className="p-2.5 bg-amber-50 rounded-xl border border-amber-200 flex items-center justify-between text-amber-900 font-sans">
                <span>Diferencia de pesaje no asignada:</span>
                <strong className="font-mono">
                  {computedBatch.unaccountedWeightKg > 0 ? '+' : ''}
                  {computedBatch.unaccountedWeightKg.toFixed(2)} Kg
                </strong>
              </div>
            )}
          </div>
        </div>

        {/* Future Purchases Projection Calculator con Enlace a Proveedores */}
        <div className="bg-gradient-to-br from-slate-900 to-slate-950 text-white rounded-2xl p-5 shadow-sm border border-slate-800 text-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 mb-3 pb-2 border-b border-slate-800">
              <ShoppingBag className="w-4 h-4 text-rose-400" />
              <h3 className="font-bold text-white">
                Proyector Inteligente de Compras en Canal
              </h3>
            </div>

            <p className="text-slate-300 text-[11px] mb-4">
              Calcula cuántos Kg de canal completa necesitas comprar para cubrir la demanda proyectada de un corte específico y genera la orden de compra directamente al proveedor seleccionado.
            </p>

            <div className="grid grid-cols-2 gap-3 mb-4">
              <div>
                <label className="block text-slate-400 font-semibold mb-1">
                  Corte Demandado
                </label>
                <select
                  value={projectionCutName}
                  onChange={(e) => setProjectionCutName(e.target.value)}
                  className="w-full min-h-[38px] px-2.5 py-1.5 rounded-xl border border-slate-700 bg-slate-800 text-white text-xs"
                >
                  {initialTemplate.map((t) => (
                    <option key={t.cutName} value={t.cutName}>
                      {t.cutName} ({t.expectedYieldPercent}%)
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-400 font-semibold mb-1">
                  Kilos Requeridos
                </label>
                <input
                  type="number"
                  min="1"
                  value={targetDemandKg}
                  onChange={(e) => setTargetDemandKg(Math.max(1, parseFloat(e.target.value) || 0))}
                  className="w-full min-h-[38px] px-3 py-1.5 rounded-xl border border-slate-700 bg-slate-800 text-white font-mono font-bold"
                />
              </div>
            </div>

            <div className="p-3.5 bg-slate-800/80 rounded-xl border border-slate-700/80 mb-4">
              <p className="text-[11px] text-slate-400">Canal en Pie / Beneficiada Sugerida:</p>
              <p className="text-xl font-bold font-mono text-emerald-400 mt-0.5">
                {purchaseProjection.carcassNeededKg.toFixed(2)} Kg en Canal
              </p>
              <p className="text-[10px] text-slate-400 mt-1">
                Rendimiento estimado del corte: <strong>{purchaseProjection.cutYieldPercent}%</strong> | Proveedor: <strong>{computedBatch.supplierName || 'Seleccionado'}</strong>
              </p>
            </div>
          </div>

          <div>
            <button
              type="button"
              onClick={handleCreateProjectedPurchaseOrder}
              disabled={!canEdit || purchaseProjection.carcassNeededKg <= 0}
              className="w-full min-h-[44px] px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl shadow-md transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              <Truck className="w-4 h-4" />
              <span>Generar Orden de Compra al Proveedor</span>
            </button>

            {purchaseOrderStatus && (
              <div className="mt-3 p-3 bg-emerald-950/80 border border-emerald-500/50 rounded-xl text-emerald-300 text-[11px] flex items-center justify-between">
                <div>
                  <p className="font-bold">Orden {purchaseOrderStatus.orderNumber} generada</p>
                  <p className="text-[10px] text-emerald-400">
                    {purchaseOrderStatus.carcassKg.toFixed(2)} Kg asignados a {purchaseOrderStatus.supplierName}.
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
        </div>
      </div>

      {/* Modal para Registro Rápido de Nuevo Proveedor */}
      {showSupplierModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-lg w-full p-6 text-xs text-slate-800">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 mb-4">
              <div className="flex items-center gap-2">
                <span className="p-2 bg-rose-100 text-rose-700 rounded-xl">
                  <Building2 className="w-4 h-4" />
                </span>
                <h3 className="font-bold text-sm text-slate-900">
                  Alta de Proveedor Cárnico / Avícola
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
                    className="w-full min-h-[38px] px-3 py-1.5 rounded-xl border border-slate-300 font-mono font-bold focus:ring-2 focus:ring-rose-500/30"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Categoría</label>
                  <select
                    value={supplierForm.category}
                    onChange={(e) => setSupplierForm({ ...supplierForm, category: e.target.value })}
                    className="w-full min-h-[38px] px-3 py-1.5 rounded-xl border border-slate-300 font-medium focus:ring-2 focus:ring-rose-500/30"
                  >
                    <option value="Carnes / Avícola">Carnes / Avícola</option>
                    <option value="Matadero Industrial">Matadero Industrial</option>
                    <option value="Granja Avícola">Granja Avícola</option>
                    <option value="Frutas y Hortalizas">Frutas y Hortalizas</option>
                    <option value="Víveres e Industriales">Víveres e Industriales</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Razón Social / Nombre</label>
                <input
                  type="text"
                  required
                  placeholder="Ej. Matadero Frigorífico Bolívar, C.A."
                  value={supplierForm.name}
                  onChange={(e) => setSupplierForm({ ...supplierForm, name: e.target.value })}
                  className="w-full min-h-[38px] px-3 py-1.5 rounded-xl border border-slate-300 font-bold focus:ring-2 focus:ring-rose-500/30"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Persona de Contacto</label>
                  <input
                    type="text"
                    placeholder="Ej. Dr. Roberto Mendoza"
                    value={supplierForm.contactName}
                    onChange={(e) => setSupplierForm({ ...supplierForm, contactName: e.target.value })}
                    className="w-full min-h-[38px] px-3 py-1.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-rose-500/30"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Teléfono (E.164)</label>
                  <input
                    type="text"
                    placeholder="+58 414-1234567"
                    value={supplierForm.phone}
                    onChange={(e) => setSupplierForm({ ...supplierForm, phone: e.target.value })}
                    className="w-full min-h-[38px] px-3 py-1.5 rounded-xl border border-slate-300 font-mono focus:ring-2 focus:ring-rose-500/30"
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
                    className="w-full min-h-[38px] px-3 py-1.5 rounded-xl border border-slate-300 font-mono focus:ring-2 focus:ring-rose-500/30"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Términos de Pago</label>
                  <input
                    type="text"
                    placeholder="Crédito 15 Días Canal Fría"
                    value={supplierForm.paymentTerms}
                    onChange={(e) => setSupplierForm({ ...supplierForm, paymentTerms: e.target.value })}
                    className="w-full min-h-[38px] px-3 py-1.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-rose-500/30"
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
                  className="min-h-[40px] px-5 py-2 rounded-xl bg-rose-700 hover:bg-rose-800 text-white font-bold cursor-pointer shadow-md"
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

// Simple round helper for UI local calculation
function roundToTwo(num: number): number {
  return Math.round((num + Number.EPSILON) * 100) / 100;
}

export default MeatYieldView;
