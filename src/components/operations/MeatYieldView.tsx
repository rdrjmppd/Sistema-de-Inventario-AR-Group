/**
 * Meat Yield & Direct Cut Purchases View (Rendimiento Cárnico Dual)
 * Dos sesiones operativas diferenciadas:
 *   1. Recepción en Canal y Desposte (Res, Cerdo, Pollo con mermas y costo asignado manual opcional).
 *   2. Compra de Cortes Directos / Pieza Final (sin merma de desposte, con Costo Asignado Manual por SKU
 *      y comparador en vivo contra costo en canal).
 * Topología Cadena de Frío: soporta destino Nevera/Cava (en tienda u otra sede) o Directo a Exhibición/Vitrina.
 * Dual Export: export const MeatYieldView and export default MeatYieldView.
 * Official Copyright: © 2026 AR Group. Todos los derechos de desarrollo reservados.
 */

import React, { useState, useMemo, useEffect } from 'react';
import {
  Layers,
  Scale,
  AlertTriangle,
  Plus,
  CheckCircle2,
  ShoppingBag,
  Building2,
  Calendar,
  Barcode,
  Truck,
  Check,
  X,
  PackageCheck,
  Snowflake,
  Trash2,
} from 'lucide-react';
import {
  MeatAnimalType,
  MeatCarcassPresentation,
  MeatCutTier,
  MeatYieldBatch,
  CreateMeatYieldBatchInput,
  StorageZone,
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
  calculateMeatYieldBatch,
  projectCarcassRequirementForCutDemand,
} from '../../lib/meat-yield';
import {
  buildStandardDirectCutSku,
  calculateMeatDirectCutPurchase,
} from '../../lib/meat-direct-cuts';
import { applyStockDeltaToZone } from '../../lib/shelf-stock';
import {
  calculatePriceFromMargin,
  convertUsdToVes,
  round2,
  toDecimal,
} from '../../lib/decimal';

interface WasteItemConfig {
  key: string;
  wasteType:
    | 'MERMA_EVAPORACION_LIQUIDOS'
    | 'ASERRIN_CORTE_SIERRA'
    | 'HUESO_BLANCO_DESECHO'
    | 'GRASA_SEBO_DESECHO'
    | 'OTRA_MERMA_DESPOSTE';
  label: string;
  defaultKg: number;
}

interface DirectCutDraftRow {
  rowId: string;
  animalType: MeatAnimalType;
  sku: string;
  cutName: string;
  tier: MeatCutTier;
  receivedWeightKg: number;
  shrinkageKg: number;
  purchaseCostPerKgUsd: number;
  manualAssignedCostUsd: number;
  isManualCostTouched: boolean;
  targetMarginPercent: number;
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
  const {
    locations,
    products,
    addOrUpdateProduct,
    logAuditEvent,
    createManualPurchaseOrder,
    setIsAddLocationModalOpen,
    meatDirectPurchases,
    registerAndLoadMeatDirectPurchase,
  } = useInventory();
  const { bcvState, suppliers, addSupplier } = useFinance();

  // Selector de Sesión Operativa: Canal/Desposte vs. Compra de Cortes Directos
  const [entryMode, setEntryMode] = useState<'CARCASS' | 'DIRECT_CUTS'>('CARCASS');

  // --- ESTADO MODO 1: CANAL Y DESPOSTE ---
  const [selectedAnimal, setSelectedAnimal] = useState<MeatAnimalType>('RES');
  const [selectedPresentation, setSelectedPresentation] =
    useState<MeatCarcassPresentation>('MEDIA_CANAL');
  const [selectedLocationId, setSelectedLocationId] = useState<string>(
    locations[0]?.id || 'loc-pzo-01'
  );
  const [carcassTargetZone, setCarcassTargetZone] = useState<StorageZone>('DEPOSITO');
  const [carcassWeight, setCarcassWeight] = useState<number>(220);
  const [carcassCostKg, setCarcassCostKg] = useState<number>(2.85);
  const [customBatchCode, setCustomBatchCode] = useState<string>('');
  const [receptionDate, setReceptionDate] = useState<string>(
    () => new Date().toISOString().split('T')[0]
  );

  // Override de costo asignado manual por corte en desposte (opcional)
  const [manualCarcassCutCosts, setManualCarcassCutCosts] = useState<Record<string, number>>({});

  // Proveedor compartido + Modal Alta Rápida
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>(() => {
    const meatSup = suppliers.find(
      (s) =>
        s.category?.toLowerCase().includes('carne') ||
        s.category?.toLowerCase().includes('avícola')
    );
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

  // --- ESTADO MODO 2: COMPRA DE CORTES DIRECTOS (PIEZA FINAL) ---
  const [directInvoiceRef, setDirectInvoiceRef] = useState<string>('FAC-CORTE-2026-01');
  const [directSadaGuide, setDirectSadaGuide] = useState<string>('SADA-DIR-77210');
  const [directLocationId, setDirectLocationId] = useState<string>(
    locations[0]?.id || 'loc-pzo-01'
  );
  const [directTargetZone, setDirectTargetZone] = useState<StorageZone>('ANAQUEL');
  const [directAddSpecies, setDirectAddSpecies] = useState<MeatAnimalType>('RES');
  const [directAddCutName, setDirectAddCutName] = useState<string>('Solomo de Cuerito');
  const [directRows, setDirectRows] = useState<DirectCutDraftRow[]>([
    {
      rowId: 'dr-1',
      animalType: 'RES',
      sku: 'CAR-RES-LOMITO-FILET',
      cutName: 'Lomito / Filet Mignon',
      tier: 'PRIMERA_ALTO_VALOR',
      receivedWeightKg: 28,
      shrinkageKg: 0.4,
      purchaseCostPerKgUsd: 7.4,
      manualAssignedCostUsd: 7.51,
      isManualCostTouched: false,
      targetMarginPercent: 30,
    },
    {
      rowId: 'dr-2',
      animalType: 'RES',
      sku: 'CAR-RES-PUNTA-TRASERA',
      cutName: 'Punta Trasera',
      tier: 'PRIMERA_ALTO_VALOR',
      receivedWeightKg: 35,
      shrinkageKg: 0.5,
      purchaseCostPerKgUsd: 6.85,
      manualAssignedCostUsd: 6.95,
      isManualCostTouched: false,
      targetMarginPercent: 30,
    },
    {
      rowId: 'dr-3',
      animalType: 'POLLO',
      sku: 'CAR-POL-MILANESA-FILET',
      cutName: 'Milanesa / Filet Pechuga',
      tier: 'PRIMERA_ALTO_VALOR',
      receivedWeightKg: 40,
      shrinkageKg: 0,
      purchaseCostPerKgUsd: 4.2,
      manualAssignedCostUsd: 4.2,
      isManualCostTouched: false,
      targetMarginPercent: 28,
    },
  ]);
  const [directFeedback, setDirectFeedback] = useState<{
    ok: boolean;
    text: string;
  } | null>(null);

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
      map[c.cutName] = round2(toDecimal(220).times(c.expectedYieldPercent).dividedBy(100));
    });
    return map;
  });

  const [wasteWeights, setWasteWeights] = useState<Record<string, number>>(() => {
    const init: Record<string, number> = {};
    SPECIES_WASTES.RES.forEach((w) => {
      init[w.key] = w.defaultKg;
    });
    return init;
  });

  const [projectionCutName, setProjectionCutName] = useState<string>('Lomito / Filet Mignon');
  const [targetDemandKg, setTargetDemandKg] = useState<number>(50);

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

  useEffect(() => {
    if (!suppliers.some((s) => s.id === selectedSupplierId) && suppliers.length > 0) {
      setSelectedSupplierId(suppliers[0].id);
    }
  }, [suppliers, selectedSupplierId]);

  const handleAnimalChange = (animal: MeatAnimalType) => {
    setSelectedAnimal(animal);
    const template =
      animal === 'RES'
        ? RES_STANDARD_CUTS
        : animal === 'CERDO'
        ? CERDO_STANDARD_CUTS
        : POLLO_STANDARD_CUTS;

    const defaultWeight = animal === 'RES' ? 220 : animal === 'CERDO' ? 95 : 25;
    const defaultCost = animal === 'RES' ? 2.85 : animal === 'CERDO' ? 3.4 : 2.1;
    setCarcassWeight(defaultWeight);
    setCarcassCostKg(defaultCost);
    setManualCarcassCutCosts({});

    const map: Record<string, number> = {};
    template.forEach((c) => {
      map[c.cutName] = round2(
        toDecimal(defaultWeight).times(c.expectedYieldPercent).dividedBy(100)
      );
    });
    setCutWeights(map);
    setProjectionCutName(template[0]?.cutName || '');

    const wastesMap: Record<string, number> = {};
    SPECIES_WASTES[animal].forEach((w) => {
      wastesMap[w.key] = w.defaultKg;
    });
    setWasteWeights(wastesMap);
    setInventoryLoadStatus(null);
    setPurchaseOrderStatus(null);
  };

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

  // Vista previa en vivo del modo Cortes Directos
  const computedDirectPreview = useMemo(() => {
    const loc = locations.find((l) => l.id === directLocationId) || locations[0];
    const sup = suppliers.find((s) => s.id === selectedSupplierId) || suppliers[0];
    if (!directRows.length) return null;

    try {
      return calculateMeatDirectCutPurchase({
        input: {
          batchCode: customBatchCode.trim() || undefined,
          invoiceOrGuideRef: directInvoiceRef,
          sadaGuide: directSadaGuide,
          receptionDate,
          supplierId: sup?.id || 'sup-004',
          supplierName: sup?.name || 'Proveedor Cárnico',
          locationId: loc?.id || 'loc-pzo-01',
          targetZone: directTargetZone,
          lines: directRows.map((r) => ({
            sku: r.sku,
            cutName: r.cutName,
            animalType: r.animalType,
            tier: r.tier,
            receivedWeightKg: r.receivedWeightKg > 0 ? r.receivedWeightKg : 0.01,
            shrinkageKg:
              r.shrinkageKg >= 0 && r.shrinkageKg < r.receivedWeightKg ? r.shrinkageKg : 0,
            purchaseCostPerKgUsd: r.purchaseCostPerKgUsd > 0 ? r.purchaseCostPerKgUsd : 0.01,
            manualAssignedCostUsd: r.isManualCostTouched
              ? r.manualAssignedCostUsd
              : undefined,
            targetMarginPercent: r.targetMarginPercent,
          })),
        },
        bcvRate: bcvState.activeRate,
        locationName: loc?.name || 'Sede Principal',
        actor: {
          uid: user?.uid || 'usr-supervisor',
          displayName: user?.displayName || 'Supervisor Carnicería',
          role: user?.role || UserRole.SUPERVISOR_CARNICERIA,
        },
        carcassBatches: [computedBatch],
      });
    } catch {
      return null;
    }
  }, [
    directRows,
    directInvoiceRef,
    directSadaGuide,
    directLocationId,
    directTargetZone,
    customBatchCode,
    receptionDate,
    selectedSupplierId,
    locations,
    suppliers,
    bcvState.activeRate,
    user,
    computedBatch,
  ]);

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

  // Cargar lote en canal al inventario respetando costo manual y zona (Nevera/Cava vs Exhibición)
  const handleLoadToInventory = () => {
    if (!canEdit) return;
    const loc = locations.find((l) => l.id === selectedLocationId) || locations[0];
    const sup = suppliers.find((s) => s.id === selectedSupplierId);

    let loadedCount = 0;
    let totalLoadedKgDec = toDecimal(0);

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

        const assignedCost =
          manualCarcassCutCosts[cut.cutName] !== undefined &&
          manualCarcassCutCosts[cut.cutName] > 0
            ? round2(manualCarcassCutCosts[cut.cutName])
            : cut.allocatedCostPerKgUsd;

        const finalPvpUsd = calculatePriceFromMargin(assignedCost, cut.targetMarginPercent);

        const existingProd = products.find(
          (p) => p.sku === sku || p.name.toLowerCase() === cut.cutName.toLowerCase()
        );

        if (existingProd) {
          const withZone = applyStockDeltaToZone(
            existingProd,
            selectedLocationId,
            cut.weightKg,
            carcassTargetZone,
            new Date().toISOString()
          );
          const updatedProd: Product = {
            ...withZone,
            costUsd: assignedCost,
            targetMarginPercent: cut.targetMarginPercent,
            priceUsd: finalPvpUsd,
            lastCostOrigin: 'CANAL_DESPOSTE',
            supplierId: selectedSupplierId,
          };
          addOrUpdateProduct(updatedProd, existingProd);
        } else {
          const animalLabel =
            selectedAnimal === 'RES'
              ? 'Vacuno'
              : selectedAnimal === 'CERDO'
              ? 'Cerdo'
              : 'Pollo';
          const newProd: Product = {
            id: `prd-carn-${selectedAnimal.toLowerCase()}-${cleanSlug.toLowerCase()}-${Date.now() + idx}`,
            sku,
            barcode: `759${Math.floor(1000000000 + Math.random() * 9000000000)}`,
            name: `${cut.cutName} (${animalLabel})`,
            category: 'Carnicería',
            unit: 'KG',
            costUsd: assignedCost,
            targetMarginPercent: cut.targetMarginPercent,
            priceUsd: finalPvpUsd,
            ivaRate: 0,
            lastCostOrigin: 'CANAL_DESPOSTE',
            stockByLocation: {
              [selectedLocationId]: cut.weightKg,
            },
            shelfStockByLocation: {
              [selectedLocationId]: carcassTargetZone === 'ANAQUEL' ? cut.weightKg : 0,
            },
            minStockByLocation: {
              [selectedLocationId]: 20,
            },
            minShelfByLocation: {
              [selectedLocationId]: 8,
            },
            monthlyUnitsSold: 120,
            abcClass: 'A',
            supplierId: selectedSupplierId,
            lastUpdatedVet: new Date().toISOString(),
          };
          addOrUpdateProduct(newProd);
        }
        loadedCount++;
        totalLoadedKgDec = totalLoadedKgDec.plus(cut.weightKg);
      }
    });

    const totalLoadedKg = round2(totalLoadedKgDec);

    logAuditEvent(
      'MEAT_YIELD_INVENTORY_LOAD',
      'INVENTORY',
      `Lote cárnico en canal ${computedBatch.batchCode} cargado a ${loc.name} [${carcassTargetZone === 'ANAQUEL' ? 'Exhibición' : 'Nevera/Cava'}]. ${totalLoadedKg.toFixed(2)} Kg en ${loadedCount} cortes.`,
      {
        batchCode: computedBatch.batchCode,
        animalType: selectedAnimal,
        locationId: selectedLocationId,
        locationName: loc.name,
        targetZone: carcassTargetZone,
        supplierId: selectedSupplierId,
        supplierName: sup?.name,
        totalLoadedKg,
        loadedCount,
      },
      computedBatch.batchCode
    );

    setInventoryLoadStatus({
      success: true,
      message: `Lote ${computedBatch.batchCode} ingresado a ${carcassTargetZone === 'ANAQUEL' ? 'Exhibición/Vitrina' : 'Nevera/Cava'} en "${loc.name}".`,
      count: loadedCount,
      totalKg: totalLoadedKg,
      timestamp: new Date().toLocaleTimeString('es-VE', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }),
    });
  };

  // Cargar compra de cortes directos al inventario
  const handleCommitDirectPurchase = () => {
    if (!canEdit || !directRows.length) return;
    const sup = suppliers.find((s) => s.id === selectedSupplierId) || suppliers[0];

    const res = registerAndLoadMeatDirectPurchase(
      {
        batchCode: customBatchCode.trim() || undefined,
        invoiceOrGuideRef: directInvoiceRef,
        sadaGuide: directSadaGuide,
        receptionDate,
        supplierId: sup?.id || 'sup-004',
        supplierName: sup?.name || 'Proveedor Cárnico',
        locationId: directLocationId,
        targetZone: directTargetZone,
        lines: directRows.map((r) => ({
          sku: r.sku,
          cutName: r.cutName,
          animalType: r.animalType,
          tier: r.tier,
          receivedWeightKg: r.receivedWeightKg,
          shrinkageKg: r.shrinkageKg,
          purchaseCostPerKgUsd: r.purchaseCostPerKgUsd,
          manualAssignedCostUsd: r.isManualCostTouched
            ? r.manualAssignedCostUsd
            : undefined,
          targetMarginPercent: r.targetMarginPercent,
        })),
      },
      [computedBatch]
    );

    if (!res.success || !res.purchase) {
      setDirectFeedback({
        ok: false,
        text: res.error || 'No se pudo cargar la compra de cortes directos.',
      });
      return;
    }

    setDirectFeedback({
      ok: true,
      text: `Lote Directo ${res.purchase.batchCode} cargado en ${res.purchase.locationName} (${res.purchase.targetZone === 'ANAQUEL' ? 'Directo a Exhibición' : 'Nevera/Cava'}): ${res.purchase.totalNetSalableWeightKg} Kg netos con costos asignados manuales (${res.createdCount} nuevos SKUs, ${res.updatedCount} actualizados).`,
    });
  };

  const handleAddDirectCutRow = () => {
    const speciesTemplates =
      directAddSpecies === 'RES'
        ? RES_STANDARD_CUTS
        : directAddSpecies === 'CERDO'
        ? CERDO_STANDARD_CUTS
        : POLLO_STANDARD_CUTS;
    const found = speciesTemplates.find(
      (t) => t.cutName.toLowerCase() === directAddCutName.trim().toLowerCase()
    );
    const nameToUse = directAddCutName.trim() || speciesTemplates[0].cutName;
    const defaultCost =
      directAddSpecies === 'RES' ? 5.8 : directAddSpecies === 'CERDO' ? 4.9 : 3.9;

    setDirectRows((prev) => [
      ...prev,
      {
        rowId: `dr-${Date.now()}-${Math.floor(Math.random() * 999)}`,
        animalType: directAddSpecies,
        sku: buildStandardDirectCutSku(directAddSpecies, nameToUse),
        cutName: nameToUse,
        tier: found?.tier || 'PRIMERA_ALTO_VALOR',
        receivedWeightKg: 25,
        shrinkageKg: 0,
        purchaseCostPerKgUsd: defaultCost,
        manualAssignedCostUsd: defaultCost,
        isManualCostTouched: false,
        targetMarginPercent: found?.defaultTargetMarginPercent || 28,
      },
    ]);
  };

  const handleCreateProjectedPurchaseOrder = () => {
    if (!canEdit) return;
    const sup = suppliers.find((s) => s.id === selectedSupplierId) || suppliers[0];

    const template = initialTemplate;
    const targetCut =
      template.find((t) => t.cutName === projectionCutName) || template[0];
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
        priceUsd: calculatePriceFromMargin(carcassCostKg, targetCut.defaultTargetMarginPercent),
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

  const handleSaveSupplier = (e: React.FormEvent) => {
    e.preventDefault();
    if (!supplierForm.rif.trim() || !supplierForm.name.trim()) return;

    const created = addSupplier({
      rif: supplierForm.rif.trim().toUpperCase(),
      name: supplierForm.name.trim(),
      category: supplierForm.category,
      contactName: supplierForm.contactName.trim() || 'Contacto Comercial',
      phone: supplierForm.phone.trim() || '+58 414-0000000',
      email: supplierForm.email.trim() || 'ventas@frigorifico.com',
      creditDays: Number(supplierForm.creditDays) || 15,
      paymentTerms: supplierForm.paymentTerms.trim() || 'Crédito 15 Días Canal Fría',
    });

    setSelectedSupplierId(created.id);
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

  const directSpeciesTemplates =
    directAddSpecies === 'RES'
      ? RES_STANDARD_CUTS
      : directAddSpecies === 'CERDO'
      ? CERDO_STANDARD_CUTS
      : POLLO_STANDARD_CUTS;

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
              Rendimiento Cárnico: Desposte en Canal & Compra de Cortes Directos
            </h1>
          </div>
          <p className="text-xs text-slate-300 mt-1 max-w-2xl">
            Opera en doble sesión diferenciada: <strong>Canal con Desposte</strong> o <strong>Compra Directa de Cortes Finales</strong> (evitando merma ósea), con costos asignados manuales y ruteo a <strong>Nevera/Cava (otra sede)</strong> o <strong>Exhibición</strong>.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setIsAddLocationModalOpen(true)}
            className="min-h-[44px] px-3.5 py-1.5 rounded-xl bg-sky-600/30 hover:bg-sky-600/50 border border-sky-400/40 text-sky-200 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
          >
            <Snowflake className="w-3.5 h-3.5" />
            + Sede / Cava Frigorífica
          </button>
          <span className="px-3 py-1.5 rounded-xl bg-slate-800/80 border border-slate-700 text-xs font-mono tabular-nums">
            Tasa BCV: <strong>{bcvState.activeRate.toFixed(2)}</strong> VES
          </span>
        </div>
      </div>

      {/* SELECTOR DE SESIÓN OPERATIVA: CANAL vs CORTES DIRECTOS */}
      <div className="bg-white p-2 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row gap-2">
        <button
          type="button"
          onClick={() => setEntryMode('CARCASS')}
          className={`flex-1 min-h-[48px] px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition cursor-pointer ${
            entryMode === 'CARCASS'
              ? 'bg-rose-700 text-white shadow-md'
              : 'bg-slate-50 text-slate-700 hover:bg-slate-100'
          }`}
        >
          <Scale className="w-4 h-4" />
          <span>🥩 Sesión 1: Ingreso por Peso en Canal y Desposte</span>
        </button>

        <button
          type="button"
          onClick={() => setEntryMode('DIRECT_CUTS')}
          className={`flex-1 min-h-[48px] px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition cursor-pointer ${
            entryMode === 'DIRECT_CUTS'
              ? 'bg-slate-900 text-white shadow-md'
              : 'bg-slate-50 text-slate-700 hover:bg-slate-100'
          }`}
        >
          <PackageCheck className="w-4 h-4 text-emerald-400" />
          <span>📦 Sesión 2: Compra Directa de Piezas / Cortes Finales (Sin Desposte)</span>
        </button>
      </div>

      {/* ================================================================= */}
      {/* SESIÓN 2: COMPRA DIRECTA DE CORTES FINALES (SIN MERMA DE DESPOSTE) */}
      {/* ================================================================= */}
      {entryMode === 'DIRECT_CUTS' && (
        <div className="space-y-6">
          {/* Parámetros de Factura / Guía Directa y Ruteo Cava vs Exhibición */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4 text-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100">
              <div>
                <h2 className="text-sm sm:text-base font-bold text-slate-900">
                  Recepción de Cortes Listos para Venta (Compra Directa a Proveedor)
                </h2>
                <p className="text-slate-500 text-xs">
                  Registra cortes pre-despostados con su costo propio de compra y fija el <strong>Costo Asignado Manual ($/Kg)</strong> que regirá en catálogo sin promediado automático.
                </p>
              </div>
              <span className="px-3 py-1 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 font-bold text-[11px]">
                0% Merma Ósea · Costo Manual Editable
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  N° Factura / Lote Directo
                </label>
                <input
                  type="text"
                  value={directInvoiceRef}
                  onChange={(e) => setDirectInvoiceRef(e.target.value)}
                  className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-slate-300 font-mono font-bold"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Guía SADA / Permiso
                </label>
                <input
                  type="text"
                  value={directSadaGuide}
                  onChange={(e) => setDirectSadaGuide(e.target.value)}
                  className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-slate-300 font-mono"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="font-bold text-slate-700">Proveedor Cárnico</label>
                  <button
                    type="button"
                    onClick={() => setShowSupplierModal(true)}
                    className="text-[11px] text-rose-700 font-bold underline cursor-pointer"
                  >
                    + Nuevo
                  </button>
                </div>
                <select
                  value={selectedSupplierId}
                  onChange={(e) => setSelectedSupplierId(e.target.value)}
                  className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-slate-300 bg-white"
                >
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.rif})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Sede / Cava Receptora
                </label>
                <select
                  value={directLocationId}
                  onChange={(e) => setDirectLocationId(e.target.value)}
                  className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-slate-300 bg-white"
                >
                  {locations.map((loc) => (
                    <option key={loc.id} value={loc.id}>
                      {loc.code} — {loc.name} ({loc.type})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-bold text-sky-800 mb-1">
                  Ubicación Interna Destino
                </label>
                <select
                  value={directTargetZone}
                  onChange={(e) => setDirectTargetZone(e.target.value as StorageZone)}
                  className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-sky-400 bg-sky-50 font-bold text-slate-900"
                >
                  <option value="ANAQUEL">🥩 Exhibición / Vitrina Tienda</option>
                  <option value="DEPOSITO">❄️ Nevera / Cava Frigorífica</option>
                </select>
              </div>
            </div>

            {/* Barra para agregar más piezas/cortes al lote directo */}
            <div className="pt-2 flex flex-col sm:flex-row items-stretch sm:items-end gap-2.5">
              <div>
                <label className="block font-bold text-slate-600 mb-1">Rubro</label>
                <select
                  value={directAddSpecies}
                  onChange={(e) => {
                    const sp = e.target.value as MeatAnimalType;
                    setDirectAddSpecies(sp);
                    const list =
                      sp === 'RES'
                        ? RES_STANDARD_CUTS
                        : sp === 'CERDO'
                        ? CERDO_STANDARD_CUTS
                        : POLLO_STANDARD_CUTS;
                    setDirectAddCutName(list[0].cutName);
                  }}
                  className="min-h-[44px] px-3 py-2 rounded-xl border border-slate-300 bg-slate-50 font-semibold"
                >
                  <option value="RES">Vacuno (Res)</option>
                  <option value="CERDO">Porcino (Cerdo)</option>
                  <option value="POLLO">Avícola (Pollo)</option>
                </select>
              </div>

              <div className="flex-1">
                <label className="block font-bold text-slate-600 mb-1">
                  Seleccionar o Escribir Corte / Pieza Directa
                </label>
                <input
                  list="direct-cuts-datalist"
                  value={directAddCutName}
                  onChange={(e) => setDirectAddCutName(e.target.value)}
                  placeholder="Ej. Solomo de Cuerito, Chuleta Ahumada, Pechuga..."
                  className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-300"
                />
                <datalist id="direct-cuts-datalist">
                  {directSpeciesTemplates.map((t) => (
                    <option key={t.cutName} value={t.cutName} />
                  ))}
                </datalist>
              </div>

              <button
                type="button"
                onClick={handleAddDirectCutRow}
                className="min-h-[44px] px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                Agregar Pieza al Lote
              </button>
            </div>
          </div>

          {directFeedback && (
            <div
              className={`p-4 rounded-2xl border flex items-center justify-between gap-3 text-xs font-medium ${
                directFeedback.ok
                  ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                  : 'bg-rose-50 border-rose-300 text-rose-900'
              }`}
            >
              <span>{directFeedback.text}</span>
              <button
                type="button"
                onClick={() => setDirectFeedback(null)}
                className="min-h-[40px] min-w-[40px] flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* KPIs Lote Directo */}
          {computedDirectPreview && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
              <div className="bg-slate-900 text-white p-4 rounded-xl border border-slate-800">
                <p className="text-slate-400">Costo Total Factura Directa</p>
                <p className="text-xl font-bold font-mono mt-1 tabular-nums">
                  ${computedDirectPreview.totalPurchaseCostUsd.toFixed(2)} USD
                </p>
                <p className="text-[11px] text-slate-400 mt-0.5 tabular-nums">
                  Bs.{' '}
                  {convertUsdToVes(
                    computedDirectPreview.totalPurchaseCostUsd,
                    bcvState.activeRate
                  ).toLocaleString('es-VE', { minimumFractionDigits: 2 })}
                </p>
              </div>

              <div className="bg-white p-4 rounded-xl border border-slate-200">
                <p className="text-slate-500">Peso Neto Vendible Directo</p>
                <p className="text-xl font-bold font-mono text-emerald-700 mt-1 tabular-nums">
                  {computedDirectPreview.totalNetSalableWeightKg.toFixed(2)} Kg
                </p>
                <p className="text-[11px] text-slate-500 mt-0.5 tabular-nums">
                  Merma escurrido: {computedDirectPreview.totalShrinkageKg.toFixed(2)} Kg
                </p>
              </div>

              <div className="bg-white p-4 rounded-xl border border-slate-200">
                <p className="text-slate-500">Venta Proyectada Cortes</p>
                <p className="text-xl font-bold font-mono text-slate-900 mt-1 tabular-nums">
                  ${computedDirectPreview.totalProjectedRevenueUsd.toFixed(2)} USD
                </p>
                <p className="text-[11px] text-emerald-700 font-semibold mt-0.5 tabular-nums">
                  Utilidad: +${computedDirectPreview.projectedGrossProfitUsd.toFixed(2)} USD
                </p>
              </div>

              <div className="bg-white p-4 rounded-xl border border-slate-200 flex flex-col justify-between">
                <div>
                  <p className="text-slate-500">Margen Comercial Lote</p>
                  <p className="text-xl font-bold font-mono text-sky-700 mt-1 tabular-nums">
                    {computedDirectPreview.projectedMarginPercent.toFixed(2)}%
                  </p>
                </div>
                <button
                  type="button"
                  disabled={!canEdit || directRows.length === 0}
                  onClick={handleCommitDirectPurchase}
                  className="mt-2 min-h-[44px] w-full px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer shadow"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  Cargar al Inventario
                </button>
              </div>
            </div>
          )}

          {/* Tabla de Cortes Directos con Costo Asignado Manual y Comparador vs Canal */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden text-xs">
            <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="font-bold text-slate-900 text-sm">
                  Desglose de Piezas Compradas Directas & Costo Asignado Manual
                </h3>
                <p className="text-[11px] text-slate-500">
                  El campo «Costo Asignado Manual ($/Kg)» define el costo exacto que se fijará en el catálogo para cada corte, sin forzar promediado con lotes previos.
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200 text-[11px]">
                    <th className="py-2.5 px-3">SKU / Corte Directo</th>
                    <th className="py-2.5 px-3 text-right">Kg Recibidos</th>
                    <th className="py-2.5 px-3 text-right">Merma (Kg)</th>
                    <th className="py-2.5 px-3 text-right">Kg Netos</th>
                    <th className="py-2.5 px-3 text-right">Costo Compra ($/Kg)</th>
                    <th className="py-2.5 px-3 text-right bg-amber-50/80">
                      Costo Asignado Manual ($/Kg)
                    </th>
                    <th className="py-2.5 px-3 text-right">Margen %</th>
                    <th className="py-2.5 px-3 text-right">PVP ($/Kg · Bs.)</th>
                    <th className="py-2.5 px-3 text-center">Vs. Canal</th>
                    <th className="py-2.5 px-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono">
                  {directRows.map((row, idx) => {
                    const previewLine = computedDirectPreview?.lines[idx];
                    const netKg =
                      previewLine?.netSalableWeightKg ??
                      Math.max(0, round2(toDecimal(row.receivedWeightKg).minus(row.shrinkageKg)));
                    const effectiveCost =
                      previewLine?.effectivePurchaseCostPerKgUsd ?? row.purchaseCostPerKgUsd;
                    const assignedCost = row.isManualCostTouched
                      ? row.manualAssignedCostUsd
                      : effectiveCost;
                    const pvpUsd =
                      previewLine?.retailPriceUsdPerKg ??
                      calculatePriceFromMargin(assignedCost, row.targetMarginPercent);
                    const pvpVes = convertUsdToVes(pvpUsd, bcvState.activeRate);
                    const deltaVsCanal = previewLine?.costDeltaVsCarcassUsd;

                    return (
                      <tr key={row.rowId} className="hover:bg-slate-50/80">
                        <td className="py-2.5 px-3 font-sans">
                          <div className="font-bold text-slate-900">{row.cutName}</div>
                          <div className="text-[10px] text-slate-500 font-mono">
                            {row.sku} · {row.animalType}
                          </div>
                        </td>

                        <td className="py-2.5 px-3 text-right">
                          <input
                            type="number"
                            step="0.1"
                            min="0.1"
                            value={row.receivedWeightKg}
                            onChange={(e) => {
                              const v = Math.max(0.1, parseFloat(e.target.value) || 0.1);
                              setDirectRows((prev) =>
                                prev.map((item) =>
                                  item.rowId === row.rowId
                                    ? { ...item, receivedWeightKg: v }
                                    : item
                                )
                              );
                            }}
                            className="w-20 min-h-[38px] px-2 py-1 text-right rounded-lg border border-slate-300 font-bold"
                          />
                        </td>

                        <td className="py-2.5 px-3 text-right">
                          <input
                            type="number"
                            step="0.1"
                            min="0"
                            value={row.shrinkageKg}
                            onChange={(e) => {
                              const v = Math.max(0, parseFloat(e.target.value) || 0);
                              setDirectRows((prev) =>
                                prev.map((item) =>
                                  item.rowId === row.rowId ? { ...item, shrinkageKg: v } : item
                                )
                              );
                            }}
                            className="w-16 min-h-[38px] px-2 py-1 text-right rounded-lg border border-slate-300"
                          />
                        </td>

                        <td className="py-2.5 px-3 text-right font-bold text-slate-900 tabular-nums">
                          {netKg.toFixed(2)}
                        </td>

                        <td className="py-2.5 px-3 text-right">
                          <input
                            type="number"
                            step="0.01"
                            min="0.01"
                            value={row.purchaseCostPerKgUsd}
                            onChange={(e) => {
                              const v = Math.max(0.01, parseFloat(e.target.value) || 0.01);
                              setDirectRows((prev) =>
                                prev.map((item) =>
                                  item.rowId === row.rowId
                                    ? {
                                        ...item,
                                        purchaseCostPerKgUsd: v,
                                        manualAssignedCostUsd: item.isManualCostTouched
                                          ? item.manualAssignedCostUsd
                                          : v,
                                      }
                                    : item
                                )
                              );
                            }}
                            className="w-20 min-h-[38px] px-2 py-1 text-right rounded-lg border border-slate-300 font-bold"
                          />
                          <div className="text-[10px] text-slate-400 mt-0.5">
                            Efec: ${effectiveCost.toFixed(2)}
                          </div>
                        </td>

                        <td className="py-2.5 px-3 text-right bg-amber-50/50">
                          <input
                            type="number"
                            step="0.01"
                            min="0.01"
                            value={assignedCost}
                            onChange={(e) => {
                              const v = Math.max(0.01, parseFloat(e.target.value) || 0.01);
                              setDirectRows((prev) =>
                                prev.map((item) =>
                                  item.rowId === row.rowId
                                    ? {
                                        ...item,
                                        manualAssignedCostUsd: v,
                                        isManualCostTouched: true,
                                      }
                                    : item
                                )
                              );
                            }}
                            className="w-24 min-h-[38px] px-2 py-1 text-right rounded-lg border-2 border-amber-400 bg-white font-bold text-slate-900"
                          />
                        </td>

                        <td className="py-2.5 px-3 text-right">
                          <input
                            type="number"
                            step="1"
                            min="1"
                            max="90"
                            value={row.targetMarginPercent}
                            onChange={(e) => {
                              const v = Math.min(90, Math.max(1, parseFloat(e.target.value) || 25));
                              setDirectRows((prev) =>
                                prev.map((item) =>
                                  item.rowId === row.rowId
                                    ? { ...item, targetMarginPercent: v }
                                    : item
                                )
                              );
                            }}
                            className="w-16 min-h-[38px] px-2 py-1 text-right rounded-lg border border-slate-300"
                          />
                        </td>

                        <td className="py-2.5 px-3 text-right tabular-nums">
                          <div className="font-bold text-emerald-700">${pvpUsd.toFixed(2)}</div>
                          <div className="text-[10px] text-slate-500">Bs. {pvpVes.toFixed(2)}</div>
                        </td>

                        <td className="py-2.5 px-3 text-center font-sans">
                          {deltaVsCanal !== undefined ? (
                            <span
                              className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                deltaVsCanal <= 0
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : 'bg-amber-100 text-amber-800'
                              }`}
                            >
                              {deltaVsCanal <= 0
                                ? `Ahorra $${Math.abs(deltaVsCanal).toFixed(2)}/Kg`
                                : `+$${deltaVsCanal.toFixed(2)}/Kg vs Canal`}
                            </span>
                          ) : (
                            <span className="text-[10px] text-slate-400">Sin ref.</span>
                          )}
                        </td>

                        <td className="py-2.5 px-2 text-center">
                          <button
                            type="button"
                            disabled={directRows.length <= 1}
                            onClick={() =>
                              setDirectRows((prev) =>
                                prev.filter((item) => item.rowId !== row.rowId)
                              )
                            }
                            className="min-h-[38px] min-w-[38px] inline-flex items-center justify-center rounded-lg text-slate-400 hover:text-rose-600 disabled:opacity-30"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Historial reciente de compras directas de cortes */}
          {meatDirectPurchases.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 text-xs">
              <h3 className="font-bold text-slate-900 mb-3">
                Historial de Lotes de Cortes Directos Cargados ({meatDirectPurchases.length})
              </h3>
              <div className="space-y-2">
                {meatDirectPurchases.slice(0, 5).map((mp) => (
                  <div
                    key={mp.id}
                    className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                  >
                    <div>
                      <span className="font-mono font-bold text-slate-900">{mp.batchCode}</span> ·{' '}
                      <span className="font-semibold text-slate-700">{mp.supplierName}</span> ·{' '}
                      <span className="text-slate-500">
                        {mp.locationName} (
                        {mp.targetZone === 'ANAQUEL' ? 'Exhibición' : 'Nevera/Cava'})
                      </span>
                    </div>
                    <div className="font-mono font-bold text-emerald-700 tabular-nums">
                      {mp.totalNetSalableWeightKg.toFixed(2)} Kg · $
                      {mp.totalPurchaseCostUsd.toFixed(2)} USD ({mp.lines.length} cortes)
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ================================================================= */}
      {/* SESIÓN 1: INGRESO POR PESO EN CANAL Y DESPOSTE                    */}
      {/* ================================================================= */}
      {entryMode === 'CARCASS' && (
        <>
          {/* Animal Selection Tabs */}
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 pb-2">
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
                className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-slate-300 bg-slate-50 text-slate-800 font-mono font-bold"
              />
            </div>

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
                className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-slate-300 bg-slate-50 text-slate-800 font-medium"
              />
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">
                Sede / Cava Frigorífica
              </label>
              <select
                value={selectedLocationId}
                onChange={(e) => setSelectedLocationId(e.target.value)}
                disabled={!canEdit}
                className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-slate-300 bg-slate-50 text-slate-800 font-medium"
              >
                {locations.map((loc) => (
                  <option key={loc.id} value={loc.id}>
                    {loc.name} ({loc.code})
                  </option>
                ))}
              </select>
            </div>

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
                className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-slate-300 bg-slate-50 text-slate-800 font-medium"
              >
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.rif})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">
                Peso Canal / Lote (Kg)
              </label>
              <div className="relative">
                <input
                  type="number"
                  step="0.01"
                  value={carcassWeight}
                  onChange={(e) =>
                    setCarcassWeight(Math.max(0.1, parseFloat(e.target.value) || 0))
                  }
                  disabled={!canEdit}
                  className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-slate-300 bg-slate-50 text-slate-900 font-bold font-mono"
                />
                <span className="absolute right-3 top-3 text-slate-400 font-bold text-xs">
                  Kg
                </span>
              </div>
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">
                Costo Canal ($ USD/Kg)
              </label>
              <div className="relative">
                <input
                  type="number"
                  step="0.01"
                  value={carcassCostKg}
                  onChange={(e) =>
                    setCarcassCostKg(Math.max(0.01, parseFloat(e.target.value) || 0))
                  }
                  disabled={!canEdit}
                  className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-slate-300 bg-slate-50 text-slate-900 font-bold font-mono"
                />
                <span className="absolute right-3 top-3 text-slate-400 font-bold text-xs">
                  USD
                </span>
              </div>
            </div>
          </div>

          {/* Action Bar: Cargar Lote al Inventario con Destino Cava vs Exhibición */}
          <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 p-4 bg-slate-50 rounded-2xl border border-slate-200">
            <div className="flex items-center gap-3">
              <span className="p-2.5 rounded-xl bg-rose-100 text-rose-700">
                <Scale className="w-5 h-5" />
              </span>
              <div>
                <p className="font-bold text-slate-900 text-xs">
                  Lote en Canal:{' '}
                  <span className="font-mono text-rose-700">{computedBatch.batchCode}</span>
                </p>
                <p className="text-[11px] text-slate-500">
                  Fecha: {computedBatch.receptionDate || receptionDate} | Sede:{' '}
                  {computedBatch.locationName} | Proveedor:{' '}
                  {computedBatch.supplierName || 'No asignado'}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <select
                value={carcassTargetZone}
                onChange={(e) => setCarcassTargetZone(e.target.value as StorageZone)}
                disabled={!canEdit}
                className="min-h-[44px] px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs font-bold text-slate-800"
              >
                <option value="DEPOSITO">❄️ Destino: Nevera / Cava / Depósito</option>
                <option value="ANAQUEL">🥩 Destino: Directo a Exhibición / Vitrina</option>
              </select>

              <button
                type="button"
                onClick={handleLoadToInventory}
                disabled={!canEdit || computedBatch.totalCutsWeightKg <= 0}
                className="min-h-[44px] px-5 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800 text-white font-bold text-xs rounded-xl shadow-md transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Cargar Cortes al Inventario</span>
              </button>
            </div>
          </div>

          {inventoryLoadStatus && (
            <div className="p-4 bg-emerald-50 border border-emerald-300 rounded-2xl text-emerald-900 flex items-start justify-between gap-3 shadow-sm text-xs">
              <div className="flex items-center gap-3">
                <span className="p-2 bg-emerald-200 text-emerald-800 rounded-xl">
                  <Check className="w-4 h-4" />
                </span>
                <div>
                  <p className="font-bold">{inventoryLoadStatus.message}</p>
                  <p className="text-[11px] text-emerald-700 mt-0.5">
                    Total ingresado:{' '}
                    <strong>{inventoryLoadStatus.totalKg?.toFixed(2)} Kg</strong> en{' '}
                    <strong>{inventoryLoadStatus.count}</strong> cortes comerciales. Hora:{' '}
                    {inventoryLoadStatus.timestamp}.
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

          {/* KPI Cards Canal */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            <div className="bg-slate-900 text-white p-4 rounded-xl shadow-sm border border-slate-800">
              <p className="text-slate-400 text-[11px] font-medium">Inversión Total en Canal</p>
              <p className="text-lg md:text-xl font-bold font-mono text-white mt-1 tabular-nums">
                ${computedBatch.totalCarcassCostUsd.toFixed(2)}{' '}
                <span className="text-[10px] text-slate-400">USD</span>
              </p>
              <p className="text-[10px] text-slate-400 mt-1 tabular-nums">
                Bs.{' '}
                {convertUsdToVes(
                  computedBatch.totalCarcassCostUsd,
                  bcvState.activeRate
                ).toFixed(2)}
              </p>
            </div>

            <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
              <p className="text-slate-500 text-[11px] font-medium">
                Rendimiento Cortes Vendibles
              </p>
              <p className="text-lg md:text-xl font-bold font-mono text-emerald-600 mt-1 tabular-nums">
                {computedBatch.cutsYieldPercent.toFixed(2)}%
              </p>
              <p className="text-[10px] text-slate-500 mt-1 tabular-nums">
                {computedBatch.totalCutsWeightKg.toFixed(2)} Kg en cortes
              </p>
            </div>

            <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
              <p className="text-slate-500 text-[11px] font-medium">Merma Total de Desposte</p>
              <p className="text-lg md:text-xl font-bold font-mono text-amber-600 mt-1 tabular-nums">
                {computedBatch.wastePercent.toFixed(2)}%
              </p>
              <p className="text-[10px] text-slate-500 mt-1 tabular-nums">
                {computedBatch.totalWasteWeightKg.toFixed(2)} Kg de pérdida
              </p>
            </div>

            <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
              <p className="text-slate-500 text-[11px] font-medium">Margen Proyectado Lote</p>
              <p className="text-lg md:text-xl font-bold font-mono text-sky-600 mt-1 tabular-nums">
                {computedBatch.projectedMarginPercent.toFixed(2)}%
              </p>
              <p className="text-[10px] text-slate-500 mt-1 tabular-nums">
                Utilidad: +${computedBatch.projectedGrossProfitUsd.toFixed(2)} USD
              </p>
            </div>
          </div>

          {/* Tabla Desglose Cortes en Canal + Costo Asignado Manual Editable */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden text-xs">
            <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-slate-50">
              <div>
                <h3 className="font-bold text-slate-900 text-sm">
                  Desglose de Cortes Obtenidos, Costo Asignado Manual & PVP ({selectedAnimal})
                </h3>
                <p className="text-[11px] text-slate-500">
                  Puedes conservar el costo calculado por valor relativo o fijar manualmente el costo $/Kg que asumirá el SKU.
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
                    <th className="py-2.5 px-3 text-right">Costo Sugerido ($/Kg)</th>
                    <th className="py-2.5 px-3 text-right bg-amber-50/80">
                      Costo Manual ($/Kg)
                    </th>
                    <th className="py-2.5 px-3 text-right">Margen %</th>
                    <th className="py-2.5 px-3 text-right">PVP ($/Kg)</th>
                    <th className="py-2.5 px-3 text-right">PVP (Bs./Kg)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono">
                  {computedBatch.cuts.map((cut) => {
                    const effectiveAssignedCost =
                      manualCarcassCutCosts[cut.cutName] ?? cut.allocatedCostPerKgUsd;
                    const pvpUsd = calculatePriceFromMargin(
                      effectiveAssignedCost,
                      cut.targetMarginPercent
                    );
                    const pvpVes = convertUsdToVes(pvpUsd, bcvState.activeRate);
                    return (
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
                            className="w-20 min-h-[38px] px-2 py-1 text-right rounded border border-slate-300 font-bold bg-white"
                          />
                        </td>
                        <td className="py-2.5 px-3 text-right text-slate-700 tabular-nums">
                          {cut.yieldPercent.toFixed(2)}%
                        </td>
                        <td className="py-2.5 px-3 text-right text-slate-600 tabular-nums">
                          ${cut.allocatedCostPerKgUsd.toFixed(2)}
                        </td>
                        <td className="py-2.5 px-3 text-right bg-amber-50/40">
                          <input
                            type="number"
                            step="0.01"
                            min="0.01"
                            value={effectiveAssignedCost}
                            onChange={(e) => {
                              const val = Math.max(0.01, parseFloat(e.target.value) || 0.01);
                              setManualCarcassCutCosts((prev) => ({
                                ...prev,
                                [cut.cutName]: val,
                              }));
                            }}
                            disabled={!canEdit}
                            className="w-20 min-h-[38px] px-2 py-1 text-right rounded border border-amber-400 font-bold bg-white text-slate-900"
                          />
                        </td>
                        <td className="py-2.5 px-3 text-right text-slate-600 tabular-nums">
                          {cut.targetMarginPercent}%
                        </td>
                        <td className="py-2.5 px-3 text-right font-bold text-emerald-700 tabular-nums">
                          ${pvpUsd.toFixed(2)}
                        </td>
                        <td className="py-2.5 px-3 text-right text-slate-600 tabular-nums">
                          Bs. {pvpVes.toFixed(2)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mermas Específicas & Proyector Inteligente de Compras */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
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
                  const lossCost = round2(toDecimal(currentVal).times(carcassCostKg || 1));
                  const wastePct =
                    carcassWeight > 0
                      ? round2(
                          toDecimal(currentVal).dividedBy(carcassWeight).times(100)
                        ).toFixed(2)
                      : '0.00';
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
                          className="w-20 min-h-[38px] px-2 py-1 text-right rounded border border-slate-300 font-bold bg-white text-slate-900"
                        />
                        <span className="text-[10px] text-slate-400 font-bold ml-1 font-sans">
                          Kg
                        </span>
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
                      className="w-full min-h-[44px] px-2.5 py-1.5 rounded-xl border border-slate-700 bg-slate-800 text-white text-xs"
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
                      onChange={(e) =>
                        setTargetDemandKg(Math.max(1, parseFloat(e.target.value) || 0))
                      }
                      className="w-full min-h-[44px] px-3 py-1.5 rounded-xl border border-slate-700 bg-slate-800 text-white font-mono font-bold"
                    />
                  </div>
                </div>

                <div className="p-3.5 bg-slate-800/80 rounded-xl border border-slate-700/80 mb-4">
                  <p className="text-[11px] text-slate-400">
                    Canal en Pie / Beneficiada Sugerida:
                  </p>
                  <p className="text-xl font-bold font-mono text-emerald-400 mt-0.5 tabular-nums">
                    {purchaseProjection.carcassNeededKg.toFixed(2)} Kg en Canal
                  </p>
                  <p className="text-[10px] text-slate-400 mt-1">
                    Rendimiento estimado del corte:{' '}
                    <strong>{purchaseProjection.cutYieldPercent}%</strong> | Proveedor:{' '}
                    <strong>{computedBatch.supplierName || 'Seleccionado'}</strong>
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
                      <p className="font-bold">
                        Orden {purchaseOrderStatus.orderNumber} generada
                      </p>
                      <p className="text-[10px] text-emerald-400">
                        {purchaseOrderStatus.carcassKg.toFixed(2)} Kg asignados a{' '}
                        {purchaseOrderStatus.supplierName}.
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
        </>
      )}

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
                className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 cursor-pointer"
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
                    onChange={(e) =>
                      setSupplierForm({ ...supplierForm, rif: e.target.value })
                    }
                    className="w-full min-h-[44px] px-3 py-1.5 rounded-xl border border-slate-300 font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Categoría</label>
                  <select
                    value={supplierForm.category}
                    onChange={(e) =>
                      setSupplierForm({ ...supplierForm, category: e.target.value })
                    }
                    className="w-full min-h-[44px] px-3 py-1.5 rounded-xl border border-slate-300 font-medium"
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
                <label className="block font-bold text-slate-700 mb-1">
                  Razón Social / Nombre
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ej. Distribuidora Cortes Selectos, C.A."
                  value={supplierForm.name}
                  onChange={(e) =>
                    setSupplierForm({ ...supplierForm, name: e.target.value })
                  }
                  className="w-full min-h-[44px] px-3 py-1.5 rounded-xl border border-slate-300 font-bold"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Persona de Contacto
                  </label>
                  <input
                    type="text"
                    placeholder="Ej. Dr. Roberto Mendoza"
                    value={supplierForm.contactName}
                    onChange={(e) =>
                      setSupplierForm({ ...supplierForm, contactName: e.target.value })
                    }
                    className="w-full min-h-[44px] px-3 py-1.5 rounded-xl border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Teléfono (E.164)
                  </label>
                  <input
                    type="text"
                    placeholder="+58 414-1234567"
                    value={supplierForm.phone}
                    onChange={(e) =>
                      setSupplierForm({ ...supplierForm, phone: e.target.value })
                    }
                    className="w-full min-h-[44px] px-3 py-1.5 rounded-xl border border-slate-300 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Días de Crédito
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={supplierForm.creditDays}
                    onChange={(e) =>
                      setSupplierForm({
                        ...supplierForm,
                        creditDays: Number(e.target.value) || 0,
                      })
                    }
                    className="w-full min-h-[44px] px-3 py-1.5 rounded-xl border border-slate-300 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Términos de Pago
                  </label>
                  <input
                    type="text"
                    placeholder="Crédito 15 Días Canal Fría"
                    value={supplierForm.paymentTerms}
                    onChange={(e) =>
                      setSupplierForm({ ...supplierForm, paymentTerms: e.target.value })
                    }
                    className="w-full min-h-[44px] px-3 py-1.5 rounded-xl border border-slate-300"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowSupplierModal(false)}
                  className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-300 text-slate-600 hover:bg-slate-100 font-semibold cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="min-h-[44px] px-5 py-2 rounded-xl bg-rose-700 hover:bg-rose-800 text-white font-bold cursor-pointer shadow-md"
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

export default MeatYieldView;
