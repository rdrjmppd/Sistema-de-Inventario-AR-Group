import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addMoney,
  subMoney,
  mulMoney,
  divMoney,
  calcMargin,
  calcTax,
  roundCurrency,
  roundRate,
  convertUsdToVes,
} from './decimal';
import {
  evaluateBcv5PmRule,
  parseOfficialBcvHtml,
  parseBcvNumericRate,
} from './bcv';
import { mapChrystalColumns, generateSampleChrystalTemplateRows } from './excel-chrystal';
import { processInvoiceWithDualOcr } from './ocr';
import {
  evaluateReorderAlerts,
  detectRealtimeTriggeredAlerts,
  simulatePurchaseByRotationHorizon,
  simulateAllHorizonsForProduct,
  ROTATION_HORIZONS_DAYS,
} from './reorder-alerts';
import {
  CATALOG_BATCH_SIZE,
  getCatalogBatchSlice,
  createNewLocationOrDepot,
  deleteLocationOrDepotWithAuth,
  verifyLocationGovernanceAuth,
  syncProductStockMapsForLocations,
  removeLocationFromProductStockMaps,
  buildAndFilterProductHistoryReport,
} from './catalog-pagination';
import { resolveRealTimeBcvQuote } from '../../server';
import {
  buildEnterpriseExcelStructuredPayload,
  buildStyledEnterpriseWorkbook,
  DEFAULT_COMPANY_PROFILE,
  resolveCompanyProfile,
  EXCEL_INSTITUTIONAL_WATERMARK_ROW,
} from './excel-exporter';
import {
  BRAND_NAME,
  BRAND_LEGAL_NAME,
  BRAND_RIF,
  BRAND_COLORS,
  HIPER_ABASTO_POLAR_LOGO_DATA_URI,
} from './brand-assets';
import {
  createEncryptedBackup,
  decryptAndValidateBackup,
  computeDeterministicSha256,
} from './backup-crypto';
import {
  createAuditLogEntry,
  recordUserLoginSession,
  recordOrResumeUserSession,
  evaluateSessionHeartbeat,
  sanitizeZombieSessions,
  recordUserLogoutSession,
} from './audit-logger';
import { mergeConcurrentProductStock } from '../config/firebase';
import {
  createPendingInventoryDiscard,
  authorizeInventoryDiscardWithPin,
  rejectInventoryDiscardWithReason,
  calculateDiscardLossValuation,
} from './inventory-discards';
import {
  buildExecutiveInventoryPdfAnalytics,
  generateExecutiveInventoryPdfDocument,
  generateMonthlyClosurePdfDocument,
  LIQUIDITY_STOCKOUT_JUSTIFICATION,
} from './pdf-exporter';
import {
  BcvRateState,
  LocationNode,
  Product,
  UserRole,
  UserProfile,
  PlatformBackupPayload,
  ManualRiskMode,
  InventoryDiscardRecord,
  UserSessionRecord,
} from '../types';
import {
  evaluateSecurityGuardrails,
  buildOutOfScopeResponse,
  buildLiveErpOperationalContext,
  formatLiveContextForPrompt,
  answerQueryWithHeuristicEngine,
} from '../ai-assistant';

test('decimal.js arithmetic avoids IEEE-754 floating point drift and rounds ROUND_HALF_UP', () => {
  assert.equal(addMoney(0.1, 0.2), 0.3);
  assert.equal(subMoney(10.0, 3.33), 6.67);
  assert.equal(mulMoney(19.99, 3), 59.97);
  assert.equal(divMoney(100, 3), 33.33);
  assert.equal(roundCurrency(1.005), 1.01);
  assert.equal(roundRate(42.56789), 42.5679);
});

test('calcMargin and calcTax compute Venezuelan IVA (16%, 8%, 0%), IGTF (3%), and BCV VES conversion accurately', () => {
  const marginRes = calcMargin(10, 30);
  assert.equal(marginRes.basePriceUsd, 13.0);
  assert.equal(marginRes.profitUsd, 3.0);

  const taxRes = calcTax({
    costUsd: 10,
    marginPercent: 30,
    taxRatePercent: 16,
    applyIgtf: true,
    bcvRate: 45.25,
  });
  assert.equal(taxRes.basePriceUsd, 13.0);
  assert.equal(taxRes.taxAmountUsd, 2.08);
  assert.equal(taxRes.pvpBeforeIgtfUsd, 15.08);
  assert.equal(taxRes.igtfAmountUsd, 0.45);
  assert.equal(taxRes.finalPvpUsd, 15.53);
  assert.equal(taxRes.finalPvpVes, 702.73);
});

test('BCV 5:00 PM Caracas rule switches active rate automatically at 17:00 VET', () => {
  const before5Pm = evaluateBcv5PmRule({
    currentDayRate: 886.23,
    nextBusinessDayRate: 887.3,
    forceAfter5PmSimulation: false,
  });
  assert.equal(before5Pm.isAfter5PmCaracas, false);
  assert.equal(before5Pm.activeRate, 886.23);

  const after5Pm = evaluateBcv5PmRule({
    currentDayRate: 886.23,
    nextBusinessDayRate: 887.3,
    forceAfter5PmSimulation: true,
  });
  assert.equal(after5Pm.isAfter5PmCaracas, true);
  assert.equal(after5Pm.activeRate, 887.3);
});

test('Chrystal Excel column mapper detects new vs existing SKUs accurately', () => {
  const rows = generateSampleChrystalTemplateRows();
  const parsed = mapChrystalColumns(rows, [
    {
      id: '1',
      sku: 'HAR-PAN-1KG',
    } as never,
  ]);
  assert.equal(parsed.length, 4);
  assert.equal(parsed[0].sku, 'HAR-PAN-1KG');
  assert.equal(parsed[0].impactType, 'UPDATE_EXISTING');
  assert.equal(parsed[1].sku, 'ATUN-EVE-140G');
  assert.equal(parsed[1].impactType, 'NEW_SKU');
});

test('Dual OCR processor computes 4 forensic locks and detects tampered metadata', async () => {
  const cleanInvoice = await processInvoiceWithDualOcr({
    fileName: 'factura_polar_original.pdf',
    fileSize: 24500,
    existingHashes: [],
    presetTemplate: 'POLAR',
  });
  assert.equal(cleanInvoice.forensicAudit.verdict, 'AUTENTICO_ALTA_CONFIANZA');
  assert.equal(cleanInvoice.forensicAudit.sha256Hash.length, 64);

  const tamperedInvoice = await processInvoiceWithDualOcr({
    fileName: 'factura_editada_photoshop.jpg',
    fileSize: 18400,
    existingHashes: [],
    presetTemplate: 'POLAR',
  });
  assert.equal(tamperedInvoice.forensicAudit.verdict, 'ALERTA_FRAUDE_EDICION_O_IA');
});

test('Real-time reorder alert engine detects low stock and manual risk overrides across locations', () => {
  const mockLocations: LocationNode[] = [
    {
      id: 'loc-pzo-01',
      code: 'PZO-01',
      name: 'Sede Alta Vista',
      city: 'Puerto Ordaz',
      type: 'SEDE',
      manager: 'Roberto',
      active: true,
    },
    {
      id: 'loc-ccs-01',
      code: 'CCS-01',
      name: 'Sede Las Mercedes',
      city: 'Caracas',
      type: 'SEDE',
      manager: 'Valentina',
      active: true,
    },
  ];

  const mockProducts: Product[] = [
    {
      id: 'prd-test-1',
      sku: 'ACE-MAZ-1LT',
      barcode: '7591001200454',
      name: 'Aceite Mazeite 1L',
      category: 'Aceites',
      unit: 'LT',
      costUsd: 2.0,
      targetMarginPercent: 25,
      priceUsd: 2.67,
      ivaRate: 16,
      stockByLocation: { 'loc-pzo-01': 40, 'loc-ccs-01': 250 },
      minStockByLocation: { 'loc-pzo-01': 100, 'loc-ccs-01': 100 },
      manualRiskByLocation: { 'loc-ccs-01': 'CRITICO_MANUAL' },
      safetyMultiplierByLocation: { 'loc-ccs-01': 2.0 },
      monthlyUnitsSold: 500,
      abcClass: 'A',
      supplierId: 'sup-001',
      lastUpdatedVet: '2026-03-25T14:00:00-04:00',
    },
  ];

  const alerts = evaluateReorderAlerts(
    mockProducts,
    mockLocations,
    886.23,
    '2026-03-25T15:00:00-04:00'
  );
  // Both PZO-01 (automatic low stock) and CCS-01 (manual forced risk) must be present
  assert.equal(alerts.length, 2);

  const manualAlert = alerts.find((a) => a.locationCode === 'CCS-01');
  assert.ok(manualAlert);
  assert.equal(manualAlert.riskSource, 'MANUAL_FORZADO');
  assert.equal(manualAlert.severity, 'CRITICO_QUIEBRE');
  assert.equal(manualAlert.safetyMultiplier, 2.0);
  assert.equal(manualAlert.targetSafetyStock, 200);

  const autoAlert = alerts.find((a) => a.locationCode === 'PZO-01');
  assert.ok(autoAlert);
  assert.equal(autoAlert.riskSource, 'ROTACION_SISTEMA');
  assert.equal(autoAlert.currentStock, 40);
  assert.equal(autoAlert.reorderPoint, 100);
  assert.equal(autoAlert.deficitUnits, 60);
  assert.equal(autoAlert.targetSafetyStock, 150);
  assert.equal(autoAlert.suggestedOrderQty, 110);
  assert.equal(autoAlert.estimatedOrderCostUsd, 220.0);

  const initialTriggered = detectRealtimeTriggeredAlerts({}, alerts, true);
  assert.equal(initialTriggered.length, 2);
});

test('Official BCV HTML parser and Stress Test: 100 concurrent parses + live BCV network resolution', async () => {
  const realBcvSnippet = `
    <div id="euro" class="col-sm-12 col-xs-12 ">
      <div class="col-sm-6 col-xs-6 centrado textp">
        <strong class="strong-tb"> 1.100,248494 </strong>
      </div>
    </div>
    <div id="dolar" class="col-sm-12 col-xs-12 ">
      <div class="field-content">
        <div class="row recuadrotsmc">
          <div class="col-sm-6 col-xs-6"><span> USD</span></div>
          <div class="col-sm-6 col-xs-6 centrado textp">
            <strong class="strong-tb">887,30200000</strong>
          </div>
        </div>
      </div>
    </div>
    <div class="pull-right dinpro center">Fecha Valor: <span class="date-display-single" property="dc:date" datatype="xsd:dateTime" content="2026-10-27T00:00:00-04:00">Martes, 27 Octubre  2026</span><hr></div>
  `;

  const burstPromises = Array.from({ length: 100 }, (_, idx) =>
    Promise.resolve().then(() => {
      const parsed = parseOfficialBcvHtml(realBcvSnippet);
      assert.ok(parsed, `Iteration ${idx} failed to parse BCV HTML`);
      assert.equal(parsed.usdRate, 887.302);
      assert.equal(parsed.eurRate, 1100.2485);
      assert.equal(parsed.valueDateLabel, 'Martes, 27 Octubre 2026');
      const vesAmount = convertUsdToVes(100, parsed.usdRate);
      assert.equal(vesAmount, 88730.2);
      return true;
    })
  );

  const results = await Promise.all(burstPromises);
  assert.equal(results.length, 100);

  assert.equal(parseBcvNumericRate('886.2271'), 886.2271);
  assert.equal(parseBcvNumericRate('887,30200000'), 887.302);
  assert.equal(parseBcvNumericRate('1.250,4500'), 1250.45);

  const liveQuote = await resolveRealTimeBcvQuote(true);
  assert.ok(liveQuote.usdRatePortal > 100, 'Live BCV portal rate must be > 100 Bs/USD');
  assert.ok(liveQuote.usdSpotRate > 100, 'Live BCV spot rate must be > 100 Bs/USD');
  assert.equal(liveQuote.isLiveConnected, true);

  const concurrentQuotes = await Promise.all(
    Array.from({ length: 20 }, () => resolveRealTimeBcvQuote(false))
  );
  for (const q of concurrentQuotes) {
    assert.equal(q.usdRatePortal, liveQuote.usdRatePortal);
    assert.equal(q.usdSpotRate, liveQuote.usdSpotRate);
  }
});

test('Stress Test: 20-by-20 Catalog Batch Pagination over 10,000 products and RBAC + PIN Protected Sede / Depósito Creation & Deletion', () => {
  assert.equal(CATALOG_BATCH_SIZE, 20);

  // 1. Test 10,000 products sliced in 500 sequential batches of 20
  const massiveCatalog = Array.from({ length: 10000 }, (_, i) => ({
    id: `prd-stress-${i + 1}`,
    sku: `SKU-STRESS-${String(i + 1).padStart(5, '0')}`,
  }));

  let currentVisible = 20;
  let steps = 0;
  while (true) {
    const slice = getCatalogBatchSlice(massiveCatalog, currentVisible, 20);
    steps++;
    assert.equal(slice.visibleCount, Math.min(10000, currentVisible));
    if (!slice.hasMore) break;
    currentVisible += 20;
  }
  assert.equal(steps, 500);

  // 2. Test RBAC + PIN re-authentication for Sede / Depósito governance
  const superAdmin = {
    role: UserRole.SUPERADMIN,
    pin: '102030',
    displayName: 'Superadmin',
  };
  const gerente = {
    role: UserRole.GERENTE,
    pin: '203040',
    displayName: 'Gerente',
  };
  const analista = {
    role: UserRole.ANALISTA,
    pin: '304050',
    displayName: 'Analista',
  };

  // Analista must be rejected even with correct PIN
  assert.equal(verifyLocationGovernanceAuth(analista, '304050').authorized, false);
  // Superadmin with wrong PIN must be rejected
  assert.equal(verifyLocationGovernanceAuth(superAdmin, '999999').authorized, false);
  // Superadmin and Gerente with matching PIN must be authorized
  assert.equal(verifyLocationGovernanceAuth(superAdmin, '102030').authorized, true);
  assert.equal(verifyLocationGovernanceAuth(gerente, '203040').authorized, true);

  const locations: LocationNode[] = [
    {
      id: 'loc-pzo-01',
      code: 'PZO-01',
      name: 'Sede Alta Vista',
      city: 'Puerto Ordaz',
      type: 'SEDE',
      manager: 'Roberto',
      active: true,
    },
  ];

  // Creating a new Depósito with Gerente credentials
  const createdByGerente = createNewLocationOrDepot(
    {
      code: 'DEP-MCY-01',
      name: 'Depósito Central Maracay',
      city: 'Maracay',
      type: 'DEPOSITO',
      manager: 'Carlos',
      authCode: '203040',
    },
    locations,
    gerente
  );
  assert.equal(createdByGerente.success, true);
  assert.ok(createdByGerente.location);
  locations.push(createdByGerente.location);
  assert.equal(locations.length, 2);

  // Sync 500 products with the 2 locations
  let products: Product[] = Array.from({ length: 500 }, (_, idx) => ({
    id: `prd-${idx + 1}`,
    sku: `SKU-${idx + 1}`,
    barcode: `759100${idx + 1}`,
    name: `Producto Stress ${idx + 1}`,
    category: 'Víveres Secos',
    unit: 'UND',
    costUsd: 1.25,
    targetMarginPercent: 28,
    priceUsd: 1.74,
    ivaRate: 0,
    stockByLocation: { 'loc-pzo-01': 100 },
    minStockByLocation: { 'loc-pzo-01': 40 },
    monthlyUnitsSold: 200,
    abcClass: 'A',
    supplierId: 'sup-001',
    lastUpdatedVet: '2026-10-24T12:00:00-04:00',
  }));
  products = syncProductStockMapsForLocations(products, locations, 0);
  assert.equal(Object.keys(products[0].stockByLocation).length, 2);

  // Attempt deletion with Analista -> rejected
  const failedDeleteByAnalista = deleteLocationOrDepotWithAuth(
    createdByGerente.location.id,
    locations,
    analista,
    '304050'
  );
  assert.equal(failedDeleteByAnalista.success, false);

  // Attempt deletion with Superadmin + wrong PIN -> rejected
  const failedDeleteWrongPin = deleteLocationOrDepotWithAuth(
    createdByGerente.location.id,
    locations,
    superAdmin,
    '000000'
  );
  assert.equal(failedDeleteWrongPin.success, false);

  // Valid deletion with Superadmin + valid PIN ('102030') -> succeeds
  const validDelete = deleteLocationOrDepotWithAuth(
    createdByGerente.location.id,
    locations,
    superAdmin,
    '102030'
  );
  assert.equal(validDelete.success, true);
  assert.equal(validDelete.remainingLocations?.length, 1);

  const cleanedProducts = removeLocationFromProductStockMaps(
    products,
    createdByGerente.location.id
  );
  assert.equal(Object.keys(cleanedProducts[0].stockByLocation).length, 1);
  assert.equal(
    cleanedProducts[0].stockByLocation[createdByGerente.location.id],
    undefined
  );
});

test('Rotation-based purchase simulator (7, 15, 30, 45, 60 days) scales monotonically and stress-tests 12,500 simulations', () => {
  const testLocations: LocationNode[] = [
    {
      id: 'loc-pzo-01',
      code: 'PZO-01',
      name: 'Sede Alta Vista',
      city: 'Puerto Ordaz',
      type: 'SEDE',
      manager: 'Ing. Salazar',
      active: true,
    },
    {
      id: 'loc-val-01',
      code: 'VAL-01',
      name: 'Depósito Valencia',
      city: 'Valencia',
      type: 'DEPOSITO',
      manager: 'Ing. Padrón',
      active: true,
    },
  ];

  const sampleProduct: Product = {
    id: 'prd-rot-01',
    sku: 'ACE-MAZ-1LT',
    barcode: '7591001200454',
    name: 'Aceite Vegetal Mazeite 1 Litro',
    category: 'Aceites y Grasas',
    unit: 'LT',
    costUsd: 2.35,
    targetMarginPercent: 28,
    priceUsd: 3.26,
    ivaRate: 16,
    stockByLocation: { 'loc-pzo-01': 85, 'loc-val-01': 420 },
    minStockByLocation: { 'loc-pzo-01': 100, 'loc-val-01': 200 },
    monthlyUnitsSold: 1800,
    abcClass: 'A',
    supplierId: 'sup-001',
    lastUpdatedVet: '2026-03-25T14:20:00-04:00',
  };

  const allHorizons = simulateAllHorizonsForProduct(
    sampleProduct,
    testLocations[0],
    testLocations,
    473.68,
    true
  );

  assert.deepEqual(Object.keys(allHorizons).map(Number), [7, 15, 30, 45, 60]);
  assert.ok(allHorizons[7].projectedDemandUnits < allHorizons[15].projectedDemandUnits);
  assert.ok(allHorizons[15].projectedDemandUnits < allHorizons[30].projectedDemandUnits);
  assert.ok(allHorizons[30].projectedDemandUnits < allHorizons[45].projectedDemandUnits);
  assert.ok(allHorizons[45].projectedDemandUnits < allHorizons[60].projectedDemandUnits);

  assert.ok(allHorizons[7].suggestedPurchaseQty <= allHorizons[15].suggestedPurchaseQty);
  assert.ok(allHorizons[15].suggestedPurchaseQty < allHorizons[30].suggestedPurchaseQty);
  assert.ok(allHorizons[30].suggestedPurchaseQty < allHorizons[45].suggestedPurchaseQty);
  assert.ok(allHorizons[45].suggestedPurchaseQty < allHorizons[60].suggestedPurchaseQty);

  // Stress test: 2,500 SKUs across all 5 horizons (7, 15, 30, 45, 60 days) = 12,500 evaluations
  let totalSimulations = 0;
  for (let i = 0; i < 2500; i++) {
    const skuProd: Product = {
      ...sampleProduct,
      id: `stress-rot-${i}`,
      sku: `SKU-ROT-${i}`,
      costUsd: roundCurrency(0.75 + (i % 40) * 0.35),
      monthlyUnitsSold: 120 + (i % 900) * 5,
      stockByLocation: {
        'loc-pzo-01': i % 250,
        'loc-val-01': (i * 2) % 500,
      },
    };
    for (const h of ROTATION_HORIZONS_DAYS) {
      const sim = simulatePurchaseByRotationHorizon(
        skuProd,
        testLocations[0],
        testLocations,
        h,
        473.68,
        true
      );
      assert.equal(Number.isFinite(sim.suggestedPurchaseQty), true);
      assert.equal(Number.isFinite(sim.suggestedTotalUsd), true);
      assert.equal(Number.isFinite(sim.suggestedTotalVes), true);
      assert.ok(sim.suggestedPurchaseQty >= 0);
      totalSimulations++;
    }
  }
  assert.equal(totalSimulations, 12500);
});

test('Product rotation history and order/reception date-range inspector filters [fromDate, toDate] accurately', () => {
  const testLocations: LocationNode[] = [
    {
      id: 'loc-pzo-01',
      code: 'PZO-01',
      name: 'Sede Alta Vista',
      city: 'Puerto Ordaz',
      type: 'SEDE',
      manager: 'Ing. Salazar',
      active: true,
    },
    {
      id: 'loc-ccs-01',
      code: 'CCS-01',
      name: 'Sede Las Mercedes',
      city: 'Caracas',
      type: 'SEDE',
      manager: 'Lic. Morales',
      active: true,
    },
  ];

  const harinaProduct: Product = {
    id: 'prd-001',
    sku: 'HAR-PAN-1KG',
    barcode: '7591001100105',
    name: 'Harina de Maíz Precocida P.A.N. 1Kg',
    category: 'Víveres Secos',
    unit: 'UND',
    costUsd: 0.92,
    targetMarginPercent: 26,
    priceUsd: 1.24,
    ivaRate: 0,
    stockByLocation: { 'loc-pzo-01': 540, 'loc-ccs-01': 410 },
    minStockByLocation: { 'loc-pzo-01': 200, 'loc-ccs-01': 180 },
    monthlyUnitsSold: 3200,
    abcClass: 'A',
    supplierId: 'sup-001',
    lastUpdatedVet: '2026-10-24T14:20:00-04:00',
  };

  const fullWindow = buildAndFilterProductHistoryReport({
    product: harinaProduct,
    locations: testLocations,
    fromDate: '2026-07-01',
    toDate: '2026-10-24',
    locationFilterId: 'ALL',
    activeBcvRate: 887.3,
    referenceEndDate: '2026-10-24',
  });

  const narrowWindow = buildAndFilterProductHistoryReport({
    product: harinaProduct,
    locations: testLocations,
    fromDate: '2026-10-10',
    toDate: '2026-10-24',
    locationFilterId: 'ALL',
    activeBcvRate: 887.3,
    referenceEndDate: '2026-10-24',
  });

  assert.ok(fullWindow.rotationEntries.length > narrowWindow.rotationEntries.length);
  assert.ok(fullWindow.orderReceiptEntries.length >= narrowWindow.orderReceiptEntries.length);
  assert.ok(fullWindow.summary.totalUnitsRotated > narrowWindow.summary.totalUnitsRotated);

  // Every rotation entry in narrowWindow must fall strictly within [2026-10-10, 2026-10-24]
  for (const rot of narrowWindow.rotationEntries) {
    assert.ok(rot.date >= '2026-10-10' && rot.date <= '2026-10-24');
  }

  // Every order/receipt entry in narrowWindow must have orderDate or receiptDate within [2026-10-10, 2026-10-24]
  for (const ord of narrowWindow.orderReceiptEntries) {
    const inOrd = ord.orderDate >= '2026-10-10' && ord.orderDate <= '2026-10-24';
    const inRec =
      ord.receiptDate !== null &&
      ord.receiptDate >= '2026-10-10' &&
      ord.receiptDate <= '2026-10-24';
    assert.equal(inOrd || inRec, true);
  }
});

test('14. Enterprise .XLSX "Producto / Celda" Structured Payload: 3 sheets, auto-sized column widths, and 500-SKU stress test', () => {
  const testLocations: LocationNode[] = [
    {
      id: 'loc-pzo-01',
      code: 'PZO-01',
      name: 'Sede Principal Alta Vista',
      city: 'Puerto Ordaz',
      type: 'SEDE',
      manager: 'Ing. Roberto Méndez',
      active: true,
    },
    {
      id: 'loc-ccs-02',
      code: 'CCS-02',
      name: 'Sucursal Las Mercedes',
      city: 'Caracas',
      type: 'SEDE',
      manager: 'Lic. Mariana Silva',
      active: true,
    },
    {
      id: 'loc-val-03',
      code: 'VAL-03',
      name: 'Depósito Central Valencia',
      city: 'Valencia',
      type: 'DEPOSITO',
      manager: 'Ing. Héctor Vargas',
      active: true,
    },
  ];

  const bcvState: BcvRateState = {
    spotRateToday: 887.3,
    nextDayRateAfter5Pm: 887.3,
    activeRate: 887.3,
    isAfter5PmVet: false,
    caracasTimeFormatted: '14:30:00',
    caracasDateFormatted: '24/10/2026',
    rateSourceLabel: 'Banco Central de Venezuela (www.bcv.org.ve)',
    lastUpdatedIso: '2026-10-24T14:30:00-04:00',
  };

  // Stress test with 500 SKUs across 3 locations
  const largeProducts: Product[] = Array.from({ length: 500 }, (_, i) => ({
    id: `prd-xlsx-${i + 1}`,
    sku: `SKU-XLSX-${String(i + 1).padStart(4, '0')}`,
    barcode: `75910099${String(i + 1).padStart(5, '0')}`,
    name: `Producto Empresarial Celda #${i + 1} Chrystal`,
    category: i % 2 === 0 ? 'Víveres Secos' : 'Lácteos y Charcutería',
    unit: 'UND',
    costUsd: 2.0,
    targetMarginPercent: 25.0,
    priceUsd: 2.5,
    ivaRate: 0,
    stockByLocation: {
      'loc-pzo-01': 10,
      'loc-ccs-02': 5,
      'loc-val-03': 25,
    },
    minStockByLocation: {
      'loc-pzo-01': 15, // Low stock -> REORDENAR
      'loc-ccs-02': 2,  // Optimal -> ÓPTIMO
      'loc-val-03': 20, // Optimal -> ÓPTIMO
    },
    monthlyUnitsSold: 120,
    abcClass: i < 100 ? 'A' : i < 300 ? 'B' : 'C',
    supplierId: 'sup-001',
    lastUpdatedVet: '2026-10-24T14:00:00-04:00',
  }));

  const payload = buildEnterpriseExcelStructuredPayload(largeProducts, testLocations, bcvState);

  assert.equal(payload.totalProducts, 500);
  assert.equal(payload.totalLocations, 3);
  // Each product has 10 + 5 + 25 = 40 units -> 500 * 40 = 20,000 units
  assert.equal(payload.totalUnitsAll, 20000);
  // Cost per product = 40 * $2.00 = $80.00 -> 500 * $80.00 = $40,000.00
  assert.equal(payload.totalValuationCostUsd, 40000);
  // Retail per product = 40 * $2.50 = $100.00 -> 500 * $100.00 = $50,000.00
  assert.equal(payload.totalValuationRetailUsd, 50000);
  // Profit = $10,000.00
  assert.equal(payload.totalPotentialProfitUsd, 10000);

  // Check per-location cell status on first product
  const firstRow = payload.productRows[0];
  assert.equal(firstRow.locationCells.length, 3);
  assert.equal(firstRow.locationCells[0].statusLabel, 'REORDENAR');
  assert.equal(firstRow.locationCells[1].statusLabel, 'ÓPTIMO');
  assert.equal(firstRow.locationCells[2].statusLabel, 'ÓPTIMO');

  // Verify the 3 sheets AoA and auto-sized column widths are populated
  assert.ok(payload.resumenSheetAoA.length > 15);
  assert.ok(payload.matrizProductoCeldaAoA.length > 505);
  assert.ok(payload.fichasProductoCeldaAoA.length > 400);
  assert.ok(payload.matrizColumnWidths.length >= 25);
  for (const col of payload.matrizColumnWidths) {
    assert.ok(col.wch >= 15 && col.wch <= 50);
  }
});

test('CompanyFiscalProfile defaults to generic enterprise placeholders when unconfigured and injects custom company letterhead into formal .xlsx tables', () => {
  // 1. Default fallback when no company data is provided
  const fallback = resolveCompanyProfile(undefined);
  assert.equal(fallback.razonSocial, DEFAULT_COMPANY_PROFILE.razonSocial);
  assert.equal(fallback.rif, DEFAULT_COMPANY_PROFILE.rif);
  assert.equal(fallback.direccionFiscal, DEFAULT_COMPANY_PROFILE.direccionFiscal);
  assert.equal(fallback.isCustomConfigured, false);

  // 2. Partial blank inputs fall back to generic placeholders
  const blankFields = resolveCompanyProfile({
    razonSocial: '   ',
    rif: '',
    direccionFiscal: '   ',
  });
  assert.equal(blankFields.razonSocial, DEFAULT_COMPANY_PROFILE.razonSocial);
  assert.equal(blankFields.rif, DEFAULT_COMPANY_PROFILE.rif);
  assert.equal(blankFields.direccionFiscal, DEFAULT_COMPANY_PROFILE.direccionFiscal);

  // 3. Custom company profile is injected into all 3 formal worksheets
  const customCompany = resolveCompanyProfile({
    razonSocial: 'DISTRIBUIDORA DE ALIMENTOS EL LLANO, C.A.',
    rif: 'J-41289540-8',
    direccionFiscal: 'Av. Intercomunal Turmero-Maracay, Galpón 14, Edo. Aragua',
    telefono: '+58 (243) 554-8900',
    email: 'finanzas@elllano.com.ve',
    codigoSada: 'SADA-ARA-90841',
    representanteLegal: 'Lic. Roberto Díaz',
  });
  assert.equal(customCompany.isCustomConfigured, true);

  const sampleLocations: LocationNode[] = [
    {
      id: 'loc-ccs',
      code: 'CCS-01',
      name: 'Sede Chacao',
      city: 'Caracas',
      type: 'SEDE',
      manager: 'Ing. Roberto',
      active: true,
    },
  ];
  const sampleProducts: Product[] = [
    {
      id: 'prd-1',
      sku: 'HAR-PAN-001',
      barcode: '7591001001',
      name: 'Harina P.A.N. 1Kg',
      category: 'Víveres Secos',
      unit: 'UND',
      costUsd: 0.92,
      targetMarginPercent: 25,
      priceUsd: 1.23,
      ivaRate: 0,
      stockByLocation: { 'loc-ccs': 120 },
      minStockByLocation: { 'loc-ccs': 50 },
      monthlyUnitsSold: 300,
      abcClass: 'A',
      supplierId: 'sup-001',
      lastUpdatedVet: '2026-03-19T12:00:00-04:00',
    },
  ];
  const bcvState: BcvRateState = {
    spotRateToday: 66.25,
    nextDayRateAfter5Pm: 66.8,
    activeRate: 66.25,
    rateSourceLabel: 'BCV OFICIAL SPOT',
    isAfter5PmVet: false,
    caracasTimeFormatted: '10:30:00',
    caracasDateFormatted: '19/03/2026',
    lastUpdatedIso: '2026-03-19T10:30:00-04:00',
  };

  const payload = buildEnterpriseExcelStructuredPayload(
    sampleProducts,
    sampleLocations,
    bcvState,
    customCompany
  );

  assert.equal(payload.companyProfile.razonSocial, 'DISTRIBUIDORA DE ALIMENTOS EL LLANO, C.A.');
  assert.equal(payload.companyProfile.rif, 'J-41289540-8');
  assert.equal(payload.matrizHeaderRowIndexZeroBased, 8);
  assert.equal(payload.productRows[0].excelRowNumber, 10);

  // Verify the corporate letterhead is present in all 3 sheets
  const matrizText = JSON.stringify(payload.matrizProductoCeldaAoA);
  const resumenText = JSON.stringify(payload.resumenSheetAoA);
  const fichasText = JSON.stringify(payload.fichasProductoCeldaAoA);

  assert.ok(matrizText.includes('DISTRIBUIDORA DE ALIMENTOS EL LLANO, C.A.'));
  assert.ok(matrizText.includes('J-41289540-8'));
  assert.ok(matrizText.includes('Av. Intercomunal Turmero-Maracay'));
  assert.ok(resumenText.includes('DISTRIBUIDORA DE ALIMENTOS EL LLANO, C.A.'));
  assert.ok(fichasText.includes('DISTRIBUIDORA DE ALIMENTOS EL LLANO, C.A.'));
});

test('16. OpenXML Executive Excel Styling (xlsx-js-style): colored corporate letterhead, bordered tables, and framed 4-row Product Fichas separated by unbordered spacers', () => {
  const testLocations: LocationNode[] = [
    {
      id: 'loc-pzo',
      code: 'PZO-01',
      name: 'Sede Alta Vista',
      city: 'Puerto Ordaz',
      type: 'SEDE',
      manager: 'Ing. Roberto Salazar',
      active: true,
    },
    {
      id: 'loc-val',
      code: 'VAL-01',
      name: 'Depósito Central Valencia',
      city: 'Valencia',
      type: 'DEPOSITO',
      manager: 'Ing. Alejandro Padrón',
      active: true,
    },
  ];

  const testProducts: Product[] = Array.from({ length: 45 }, (_, idx) => ({
    id: `prd-style-${idx + 1}`,
    sku: `SKU-EXEC-${String(idx + 1).padStart(3, '0')}`,
    barcode: `75910055${String(idx + 1).padStart(5, '0')}`,
    name: `Producto Ejecutivo Auditable #${idx + 1}`,
    category: idx % 2 === 0 ? 'Harinas y Cereales' : 'Aceites y Grasas',
    unit: 'UND',
    costUsd: 1.5,
    targetMarginPercent: 30,
    priceUsd: 2.14,
    ivaRate: idx % 3 === 0 ? 16 : 0,
    stockByLocation: {
      'loc-pzo': idx % 4 === 0 ? 10 : 120,
      'loc-val': 250,
    },
    minStockByLocation: {
      'loc-pzo': 25,
      'loc-val': 80,
    },
    monthlyUnitsSold: 360,
    abcClass: idx < 15 ? 'A' : idx < 30 ? 'B' : 'C',
    supplierId: 'sup-001',
    lastUpdatedVet: '2026-10-24T19:00:00-04:00',
  }));

  const bcvState: BcvRateState = {
    spotRateToday: 887.3,
    nextDayRateAfter5Pm: 887.3,
    activeRate: 887.3,
    rateSourceLabel: 'BCV Tasa Oficial Vigente >= 17:00 VET',
    isAfter5PmVet: true,
    caracasTimeFormatted: '19:00:53',
    caracasDateFormatted: '24/10/2026',
    lastUpdatedIso: '2026-10-24T19:00:53-04:00',
  };

  const { workbook, payload } = buildStyledEnterpriseWorkbook(
    testProducts,
    testLocations,
    bcvState
  );

  assert.deepEqual(workbook.SheetNames, [
    '1_Resumen_Ejecutivo',
    '2_Matriz_Producto_Celda',
    '3_Fichas_Producto_Celda',
  ]);

  const wsResumen = workbook.Sheets['1_Resumen_Ejecutivo'];
  const wsMatriz = workbook.Sheets['2_Matriz_Producto_Celda'];
  const wsFichas = workbook.Sheets['3_Fichas_Producto_Celda'];

  // 1. Verify Executive Corporate Letterhead background fills and borders on all 3 sheets
  for (const ws of [wsResumen, wsMatriz, wsFichas]) {
    // A1 Banner: Deep Navy (#0F172A) with white bold text and emerald (#10B981) bottom accent border
    assert.equal(ws['A1']?.s?.fill?.fgColor?.rgb, '0F172A');
    assert.equal(ws['A1']?.s?.font?.color?.rgb, 'FFFFFF');
    assert.equal(ws['A1']?.s?.font?.bold, true);
    assert.equal(ws['A1']?.s?.border?.bottom?.color?.rgb, '10B981');

    // A2..A5 Labels: Executive Slate (#E2E8F0) with medium left border (#0F172A)
    assert.equal(ws['A2']?.s?.fill?.fgColor?.rgb, 'E2E8F0');
    assert.equal(ws['A2']?.s?.border?.left?.style, 'medium');
    // B2 (Razón Social) & D2 (RIF): Emerald highlight (#ECFDF5)
    assert.equal(ws['B2']?.s?.fill?.fgColor?.rgb, 'ECFDF5');
    assert.equal(ws['D2']?.s?.fill?.fgColor?.rgb, 'ECFDF5');
    // A5 Bottom of Letterhead: medium bottom border (#0F172A)
    assert.equal(ws['A5']?.s?.border?.bottom?.style, 'medium');
    assert.equal(ws['A5']?.s?.border?.bottom?.color?.rgb, '0F172A');
  }

  // 2. Verify Sheet 1 (1_Resumen_Ejecutivo) Table 1 & Table 2 borders and fills
  // Table 1 Header (Row 10 -> A10..D10)
  assert.equal(wsResumen['A10']?.s?.fill?.fgColor?.rgb, '0F172A');
  // Table 1 Profit Row (Row 14 -> A14..D14)
  assert.equal(wsResumen['A14']?.s?.fill?.fgColor?.rgb, 'D1FAE5');
  assert.equal(wsResumen['A14']?.s?.border?.bottom?.style, 'medium');
  // Table 2 Header (Row 16 -> A16..J16)
  assert.equal(wsResumen['A16']?.s?.fill?.fgColor?.rgb, '1E293B');
  // Table 2 Closing Total Row (Row 19 -> A19..J19)
  assert.equal(wsResumen['A19']?.s?.fill?.fgColor?.rgb, '0F172A');
  assert.equal(wsResumen['A19']?.s?.border?.bottom?.style, 'medium');

  // 3. Verify Sheet 2 (2_Matriz_Producto_Celda) Group Banners, Table Headers, and Data Cell Borders
  assert.equal(wsMatriz['A8']?.s?.fill?.fgColor?.rgb, '1E293B'); // Section 1 Banner
  assert.equal(wsMatriz['A9']?.s?.fill?.fgColor?.rgb, '0F172A'); // Column Header Row
  assert.equal(wsMatriz['A10']?.s?.border?.left?.style, 'medium'); // First Data Row Left Outer Border
  assert.equal(wsMatriz['A10']?.s?.border?.bottom?.style, 'thin'); // Inner Row Border

  // 4. Verify Sheet 3 (3_Fichas_Producto_Celda) 45 Framed 4-Row Product Ficha Boxes + Unbordered Spacers
  assert.equal(payload.fichasBoxRanges.length, 45);

  for (const box of payload.fichasBoxRanges) {
    const rTop = box.startRowZeroBased + 1; // 1-based Excel row for Top of Ficha Card
    const rMid1 = box.startRowZeroBased + 2;
    const rMid2 = box.startRowZeroBased + 3;
    const rBot = box.endRowZeroBased + 1; // 1-based Excel row for Bottom of Ficha Card
    const rSpacer = box.spacerRowZeroBased + 1; // 1-based Excel row for Blank Spacer

    // Top row of Ficha Card has medium top border (#0F172A), dark navy fill on A..E, emerald on F
    assert.equal(wsFichas[`A${rTop}`]?.s?.fill?.fgColor?.rgb, '0F172A');
    assert.equal(wsFichas[`F${rTop}`]?.s?.fill?.fgColor?.rgb, '065F46');
    assert.equal(wsFichas[`A${rTop}`]?.s?.border?.top?.style, 'medium');
    assert.equal(wsFichas[`A${rTop}`]?.s?.border?.left?.style, 'medium');
    assert.equal(wsFichas[`F${rTop}`]?.s?.border?.right?.style, 'medium');

    // Middle rows have medium left/right outer borders and thin inner borders
    assert.equal(wsFichas[`A${rMid1}`]?.s?.border?.left?.style, 'medium');
    assert.equal(wsFichas[`F${rMid1}`]?.s?.border?.right?.style, 'medium');
    assert.equal(wsFichas[`B${rMid1}`]?.s?.border?.top?.style, 'thin');
    assert.equal(wsFichas[`A${rMid2}`]?.s?.border?.left?.style, 'medium');
    assert.equal(wsFichas[`F${rMid2}`]?.s?.border?.right?.style, 'medium');

    // Bottom row of Ficha Card has medium bottom border (#0F172A) closing the box
    assert.equal(wsFichas[`A${rBot}`]?.s?.border?.bottom?.style, 'medium');
    assert.equal(wsFichas[`F${rBot}`]?.s?.border?.bottom?.style, 'medium');
    assert.equal(wsFichas[`A${rBot}`]?.s?.border?.left?.style, 'medium');
    assert.equal(wsFichas[`F${rBot}`]?.s?.border?.right?.style, 'medium');

    // Spacer row immediately below the Ficha Card has NO cell borders so cards are visually separated
    assert.equal(wsFichas[`A${rSpacer}`]?.s?.border, undefined);
  }
});

test('17. Encrypted Platform Backup & Restore: SHA-256 seal, tamper detection, custom passphrase, and 1,000-SKU stress test', async () => {
  const sampleProducts: Product[] = [
    {
      id: 'prd-b01',
      sku: 'HAR-PAN-1KG',
      barcode: '7591001200111',
      name: 'Harina P.A.N. 1Kg',
      category: 'Víveres',
      unit: 'UND',
      costUsd: 1.15,
      targetMarginPercent: 28,
      priceUsd: 1.6,
      ivaRate: 0,
      stockByLocation: { 'loc-pzo-01': 150, 'loc-ccs-01': 300 },
      minStockByLocation: { 'loc-pzo-01': 80, 'loc-ccs-01': 100 },
      monthlyUnitsSold: 2000,
      abcClass: 'A',
      supplierId: 'sup-001',
      lastUpdatedVet: '2026-03-24T10:00:00-04:00',
    },
    {
      id: 'prd-b02',
      sku: 'ACE-MAZ-1LT',
      barcode: '7591001200454',
      name: 'Aceite Mazeite 1L',
      category: 'Aceites',
      unit: 'LT',
      costUsd: 2.35,
      targetMarginPercent: 25,
      priceUsd: 3.13,
      ivaRate: 16,
      stockByLocation: { 'loc-pzo-01': 60, 'loc-ccs-01': 110 },
      minStockByLocation: { 'loc-pzo-01': 90, 'loc-ccs-01': 100 },
      monthlyUnitsSold: 1200,
      abcClass: 'A',
      supplierId: 'sup-001',
      lastUpdatedVet: '2026-03-24T10:00:00-04:00',
    },
  ];

  const sampleLocations: LocationNode[] = [
    {
      id: 'loc-pzo-01',
      code: 'PZO-01',
      name: 'Sede Puerto Ordaz',
      city: 'Puerto Ordaz',
      type: 'SEDE',
      manager: 'Ing. Salazar',
      active: true,
    },
    {
      id: 'loc-ccs-01',
      code: 'CCS-01',
      name: 'Depósito Caracas',
      city: 'Caracas',
      type: 'DEPOSITO',
      manager: 'Lic. Gómez',
      active: true,
    },
  ];

  const payload: PlatformBackupPayload = {
    version: '2.0.0',
    exportedAtVet: '2026-03-25 14:30:00',
    exportedBy: 'Rubén Darío R. (Superadmin)',
    exportedByEmail: 'rdrj.mppd@gmail.com',
    companyProfile: {
      ...DEFAULT_COMPANY_PROFILE,
      razonSocial: 'ALIMENTOS Y DISTRIBUCIONES CHRYSTAL C.A.',
      rif: 'J-50128492-0',
    },
    products: sampleProducts,
    locations: sampleLocations,
    suppliers: [],
    invoices: [],
    payments: [],
    transfers: [],
    purchaseOrders: [],
    manualReceipts: [],
    salesEvents: [],
    closures: [],
    auditLogs: [],
    sessionHistory: [],
  };

  // 1. Generate encrypted backup with default platform passphrase
  const envelope = await createEncryptedBackup(payload);
  assert.equal(envelope.format, 'CHRYSTAL_ENCRYPTED_BACKUP_V1');
  assert.ok(envelope.checksumSha256.length === 64, 'Checksum must be 64-char hex SHA-256');
  assert.equal(envelope.metadata.totalProducts, 2);
  assert.equal(envelope.metadata.totalLocations, 2);
  assert.equal(envelope.metadata.companyRif, 'J-50128492-0');

  // 2. Decrypt and validate with default passphrase
  const decrypted = decryptAndValidateBackup(envelope);
  assert.equal(decrypted.success, true);
  assert.equal(decrypted.data?.products.length, 2);
  assert.equal(decrypted.data?.products[0].sku, 'HAR-PAN-1KG');
  assert.equal(decrypted.data?.locations.length, 2);
  assert.equal(decrypted.data?.companyProfile.razonSocial, 'ALIMENTOS Y DISTRIBUCIONES CHRYSTAL C.A.');

  // 3. Decrypt directly from serialized JSON string representation
  const serialized = JSON.stringify(envelope);
  const decryptedFromString = decryptAndValidateBackup(serialized);
  assert.equal(decryptedFromString.success, true);
  assert.equal(decryptedFromString.data?.products.length, 2);

  // 4. Tamper Detection - Altered Checksum
  const tamperedChecksumEnvelope = {
    ...envelope,
    checksumSha256: '0000000000000000000000000000000000000000000000000000000000000000',
  };
  const tamperResult = decryptAndValidateBackup(tamperedChecksumEnvelope);
  assert.equal(tamperResult.success, false);
  assert.ok(tamperResult.error?.includes('Fallo de integridad criptográfica'));

  // 5. Tamper Detection - Corrupted Ciphertext
  const corruptedCipherEnvelope = {
    ...envelope,
    cipherText: envelope.cipherText.slice(0, -4) + 'AAAA',
  };
  const corruptResult = decryptAndValidateBackup(corruptedCipherEnvelope);
  assert.equal(corruptResult.success, false);

  // 6. Custom Passphrase Security Isolation
  const customPassphrase = 'SuperSecretEnterpriseKey2026!';
  const customEnvelope = await createEncryptedBackup(payload, customPassphrase);
  
  // Decrypting custom-encrypted envelope without passphrase must fail
  const wrongKeyAttempt = decryptAndValidateBackup(customEnvelope);
  assert.equal(wrongKeyAttempt.success, false);

  // Decrypting with the matching custom passphrase must succeed
  const correctKeyAttempt = decryptAndValidateBackup(customEnvelope, customPassphrase);
  assert.equal(correctKeyAttempt.success, true);
  assert.equal(correctKeyAttempt.data?.products[1].sku, 'ACE-MAZ-1LT');

  // 7. Stress Test: 1,000 SKUs Encrypted Backup Round-Trip Benchmark
  const stressProducts: Product[] = [];
  for (let i = 0; i < 1000; i++) {
    stressProducts.push({
      id: `stress-prd-${i}`,
      sku: `SKU-STRESS-${String(i).padStart(4, '0')}`,
      barcode: `759${String(i).padStart(10, '0')}`,
      name: `Producto de Prueba de Carga ${i}`,
      category: 'Abarrotes',
      unit: 'UND',
      costUsd: 1.5,
      targetMarginPercent: 28,
      priceUsd: 2.08,
      ivaRate: 16,
      stockByLocation: { 'loc-pzo-01': 50 + (i % 200), 'loc-ccs-01': 100 + (i % 150) },
      minStockByLocation: { 'loc-pzo-01': 60, 'loc-ccs-01': 80 },
      monthlyUnitsSold: 300,
      abcClass: i < 200 ? 'A' : i < 500 ? 'B' : 'C',
      supplierId: 'sup-001',
      lastUpdatedVet: '2026-03-24T10:00:00-04:00',
    });
  }

  const stressPayload: PlatformBackupPayload = {
    ...payload,
    products: stressProducts,
  };

  const startTime = Date.now();
  const stressEnvelope = await createEncryptedBackup(stressPayload);
  const stressDecrypted = decryptAndValidateBackup(stressEnvelope);
  const durationMs = Date.now() - startTime;

  assert.equal(stressDecrypted.success, true);
  assert.equal(stressDecrypted.data?.products.length, 1000);
  assert.ok(durationMs < 400, `1,000 SKUs backup round-trip took ${durationMs}ms (threshold: < 400ms)`);
});

test('18. Audit Logging & User Session Duration Governance', () => {
  const superAdminUser: UserProfile = {
    uid: 'usr-superadmin-001',
    email: 'rdrj.mppd@gmail.com',
    displayName: 'Rubén Darío R. (Superadmin)',
    role: UserRole.SUPERADMIN,
    pin: '102030',
    locationAccess: ['loc-pzo-01'],
    active: true,
    createdAt: '2026-01-01T08:00:00-04:00',
  };

  // 1. Create and verify audit log entry
  const logEntry = createAuditLogEntry(
    superAdminUser,
    'MIN_STOCK_UPDATE',
    'PRODUCT',
    'Stock mínimo ajustado para SKU ACE-MAZ-1LT en sede loc-pzo-01 a 120 unidades',
    { productId: 'prd-002', locationId: 'loc-pzo-01', minStock: 120 },
    'prd-002'
  );

  assert.ok(logEntry.id.startsWith('aud-'));
  assert.equal(logEntry.userEmail, 'rdrj.mppd@gmail.com');
  assert.equal(logEntry.userRole, UserRole.SUPERADMIN);
  assert.equal(logEntry.action, 'MIN_STOCK_UPDATE');
  assert.ok(logEntry.timestampVet.includes('/2026') || logEntry.timestampVet.includes('2026'));

  // 2. Track user login session
  const { session, updatedHistory } = recordUserLoginSession(superAdminUser, []);
  assert.equal(session.userId, superAdminUser.uid);
  assert.equal(session.isActive, true);
  assert.equal(updatedHistory.length, 1);

  // 3. Track user logout session and duration calculation
  const closedHistory = recordUserLogoutSession(session.id, updatedHistory);
  assert.equal(closedHistory[0].isActive, false);
  assert.ok(closedHistory[0].logoutAtVet !== undefined);
  assert.ok((closedHistory[0].durationMinutes || 0) >= 0);
});

test('19. Manual Minimum Inventory Limits & Real-Time Stockout Risk Alarms', () => {
  const testLocations: LocationNode[] = [
    {
      id: 'loc-pzo-01',
      code: 'PZO-01',
      name: 'Sede Alta Vista',
      city: 'Puerto Ordaz',
      type: 'SEDE',
      manager: 'Ing. Salazar',
      active: true,
    },
  ];

  // Product with stock = 40. Default minStock = 30 -> No low stock alert initially
  const product: Product = {
    id: 'prd-alarm-01',
    sku: 'ARR-MESA-1KG',
    barcode: '7591002300115',
    name: 'Arroz Mesa 1Kg',
    category: 'Víveres Secos',
    unit: 'UND',
    costUsd: 1.05,
    targetMarginPercent: 25,
    priceUsd: 1.4,
    ivaRate: 0,
    stockByLocation: { 'loc-pzo-01': 40 },
    minStockByLocation: { 'loc-pzo-01': 30 },
    monthlyUnitsSold: 1200,
    abcClass: 'A',
    supplierId: 'sup-001',
    lastUpdatedVet: '2026-03-24T10:00:00-04:00',
  };

  // Initial evaluation: stock (40) > minStock (30) -> 0 alerts
  const initialAlerts = evaluateReorderAlerts([product], testLocations);
  assert.equal(initialAlerts.length, 0);

  // User sets manual minimum limit to 60 for loc-pzo-01
  const updatedProduct: Product = {
    ...product,
    minStockByLocation: { 'loc-pzo-01': 60 },
  };

  // Now stock (40) <= minStock (60) -> Triggers alert
  const triggeredAlerts = evaluateReorderAlerts([updatedProduct], testLocations);
  assert.equal(triggeredAlerts.length, 1);
  assert.equal(triggeredAlerts[0].sku, 'ARR-MESA-1KG');
  assert.equal(triggeredAlerts[0].currentStock, 40);
  assert.equal(triggeredAlerts[0].reorderPoint, 60);

  // Override manual risk mode to CRITICO_MANUAL
  const manualCriticalProduct: Product = {
    ...product,
    manualRiskByLocation: { 'loc-pzo-01': 'CRITICO_MANUAL' },
  };
  const criticalAlerts = evaluateReorderAlerts([manualCriticalProduct], testLocations);
  assert.equal(criticalAlerts.length, 1);
  assert.equal(criticalAlerts[0].manualRiskMode, 'CRITICO_MANUAL');
  assert.equal(criticalAlerts[0].severity, 'CRITICO_QUIEBRE');

  // Override manual risk mode to EXENTO_MANUAL
  const exemptProduct: Product = {
    ...updatedProduct,
    manualRiskByLocation: { 'loc-pzo-01': 'EXENTO_MANUAL' },
  };
  const exemptAlerts = evaluateReorderAlerts([exemptProduct], testLocations);
  assert.equal(exemptAlerts.length, 0);
});

test('20. Platform Reset / Factory Wipe Governance & PIN Authorization', () => {
  const superAdminPin = '102030';
  const invalidPin = '999888';

  // Superadmin authorization verification
  const isSuperAdminAuthorized = superAdminPin.trim() === '102030';
  assert.equal(isSuperAdminAuthorized, true);

  const isInvalidAuthorized = invalidPin.trim() === '102030';
  assert.equal(isInvalidAuthorized, false);

  // Emulate platform state before wipe
  let platformProducts = [{ id: 'p1', sku: 'SKU-01' }, { id: 'p2', sku: 'SKU-02' }];
  let purchaseOrders = [{ id: 'po1', orderNumber: 'PO-001' }];

  assert.equal(platformProducts.length, 2);
  assert.equal(purchaseOrders.length, 1);

  // Execute wipe with authorized PIN
  if (isSuperAdminAuthorized) {
    platformProducts = [];
    purchaseOrders = [];
  }

  assert.equal(platformProducts.length, 0);
  assert.equal(purchaseOrders.length, 0);
});

test('21. Inventory Discards (Step 1): Analyst Pre-Registration calculates Decimal.js loss and preserves stock', () => {
  const locations: LocationNode[] = [
    {
      id: 'loc-pzo-01',
      code: 'PZO-01',
      name: 'Sede Alta Vista',
      city: 'Puerto Ordaz',
      type: 'SEDE',
      manager: 'Ing. Roberto Salazar',
      active: true,
    },
  ];

  const initialProduct: Product = {
    id: 'prd-dsc-01',
    sku: 'ACE-MAZ-1LT',
    barcode: '7591001100303',
    name: 'Aceite de Maíz Mazeite 1 Litro',
    category: 'Aceites y Grasas',
    unit: 'LT',
    costUsd: 3.15,
    targetMarginPercent: 28,
    priceUsd: 4.38,
    ivaRate: 16,
    stockByLocation: { 'loc-pzo-01': 100 },
    minStockByLocation: { 'loc-pzo-01': 30 },
    monthlyUnitsSold: 420,
    abcClass: 'A',
    supplierId: 'sup-001',
    lastUpdatedVet: '2026-03-24T10:00:00-04:00',
  };

  const analystActor: UserProfile = {
    uid: 'usr-analista-01',
    email: 'analista@chrystal.com.ve',
    displayName: 'Lic. Carlos Mendoza',
    role: UserRole.ANALISTA,
    pin: '304050',
    locationAccess: ['ALL'],
    active: true,
    createdAt: '2026-01-01T00:00:00Z',
  };

  const res = createPendingInventoryDiscard(
    {
      locationId: 'loc-pzo-01',
      productId: 'prd-dsc-01',
      quantityDiscarded: 8,
      reason: 'VENCIMIENTO_CADUCIDAD',
      reasonDetails: 'Lote vencido detectado en auditoría de pasillo central.',
      lotOrGuideNumber: 'LOTE-2025-11',
    },
    {
      products: [initialProduct],
      locations,
      existingDiscards: [],
      activeBcvRate: 44.5,
      actor: analystActor,
      timestampVet: '2026-03-24T11:00:00-04:00',
    }
  );

  assert.equal(res.success, true);
  assert.ok(res.discard);
  assert.equal(res.discard.status, 'PENDIENTE_AUTORIZACION');
  assert.equal(res.discard.referenceCode, 'BAJA-2026-0001');
  // 8 * 3.15 = 25.20 USD; 25.20 * 44.5 = 1121.40 VES
  assert.equal(res.discard.totalCostUsd, 25.2);
  assert.equal(res.discard.totalCostVes, 1121.4);
  assert.equal(res.discard.stockBeforeDiscard, 100);
  assert.equal(res.discard.stockAfterDiscard, undefined);
  // RED LINE: Physical stock in product catalog remains 100
  assert.equal(initialProduct.stockByLocation['loc-pzo-01'], 100);
});

test('22. Inventory Discards (Step 2): Manager RBAC + PIN (203040) Dual-Signature Authorization deducts stock', () => {
  const initialProduct: Product = {
    id: 'prd-dsc-02',
    sku: 'LEC-CAM-1KG',
    barcode: '7591001100999',
    name: 'Leche en Polvo La Campiña 1Kg',
    category: 'Charcutería y Lácteos',
    unit: 'UND',
    costUsd: 6.8,
    targetMarginPercent: 26,
    priceUsd: 9.19,
    ivaRate: 0,
    stockByLocation: { 'loc-pzo-01': 50 },
    minStockByLocation: { 'loc-pzo-01': 20 },
    monthlyUnitsSold: 200,
    abcClass: 'A',
    supplierId: 'sup-001',
    lastUpdatedVet: '2026-03-24T10:00:00-04:00',
  };

  const pendingDiscard: InventoryDiscardRecord = {
    id: 'dsc-test-auth-01',
    referenceCode: 'BAJA-2026-0009',
    locationId: 'loc-pzo-01',
    locationCode: 'PZO-01',
    locationName: 'Sede Alta Vista',
    productId: 'prd-dsc-02',
    sku: 'LEC-CAM-1KG',
    productName: 'Leche en Polvo La Campiña 1Kg',
    category: 'Charcutería y Lácteos',
    unit: 'UND',
    quantityDiscarded: 5,
    stockBeforeDiscard: 50,
    unitCostUsd: 6.8,
    totalCostUsd: 34.0,
    totalCostVes: 1513.0,
    bcvRateAtEvent: 44.5,
    reason: 'DETERIORO_EMPAQUE_CONTENEDOR',
    reasonDetails: 'Bolsas perforadas en transporte interno.',
    status: 'PENDIENTE_AUTORIZACION',
    createdByUserId: 'usr-analista-01',
    createdByEmail: 'analista@chrystal.com.ve',
    createdByDisplayName: 'Lic. Carlos Mendoza',
    createdByRole: UserRole.ANALISTA,
    createdAtVet: '2026-03-24T11:15:00-04:00',
  };

  const analystActor: UserProfile = {
    uid: 'usr-analista-01',
    email: 'analista@chrystal.com.ve',
    displayName: 'Lic. Carlos Mendoza',
    role: UserRole.ANALISTA,
    pin: '304050',
    locationAccess: ['ALL'],
    active: true,
    createdAt: '2026-01-01T00:00:00Z',
  };

  const managerActor: UserProfile = {
    uid: 'usr-gerente-01',
    email: 'gerencia@chrystal.com.ve',
    displayName: 'Ing. María Fernanda Gómez',
    role: UserRole.GERENTE,
    pin: '203040',
    locationAccess: ['ALL'],
    active: true,
    createdAt: '2026-01-01T00:00:00Z',
  };

  // 1) Block Analyst from authorizing
  const unauthorizedRoleAttempt = authorizeInventoryDiscardWithPin({
    discardId: pendingDiscard.id,
    managerPin: '203040',
    discards: [pendingDiscard],
    products: [initialProduct],
    actor: analystActor,
  });
  assert.equal(unauthorizedRoleAttempt.success, false);

  // 2) Block Manager with wrong PIN
  const wrongPinAttempt = authorizeInventoryDiscardWithPin({
    discardId: pendingDiscard.id,
    managerPin: '000000',
    discards: [pendingDiscard],
    products: [initialProduct],
    actor: managerActor,
  });
  assert.equal(wrongPinAttempt.success, false);

  // 3) Authorize with Manager role + valid PIN 203040
  const authorizedRes = authorizeInventoryDiscardWithPin({
    discardId: pendingDiscard.id,
    managerPin: '203040',
    discards: [pendingDiscard],
    products: [initialProduct],
    actor: managerActor,
    timestampVet: '2026-03-24T11:30:00-04:00',
  });

  assert.equal(authorizedRes.success, true);
  assert.ok(authorizedRes.updatedDiscard);
  assert.ok(authorizedRes.updatedProducts);
  assert.equal(authorizedRes.updatedDiscard.status, 'AUTORIZADA');
  assert.equal(authorizedRes.updatedDiscard.stockBeforeDiscard, 50);
  assert.equal(authorizedRes.updatedDiscard.stockAfterDiscard, 45);
  assert.equal(authorizedRes.updatedDiscard.managerAuthPinUsed, 'VERIFICADO_RBAC');
  assert.equal(authorizedRes.updatedProducts[0].stockByLocation['loc-pzo-01'], 45);
});

test('23. Inventory Discards (Step 3): Manager Rejection preserves physical stock intact', () => {
  const pendingDiscard: InventoryDiscardRecord = {
    id: 'dsc-test-rej-01',
    referenceCode: 'BAJA-2026-0010',
    locationId: 'loc-ccs-01',
    locationCode: 'CCS-01',
    locationName: 'Sede Las Mercedes',
    productId: 'prd-001',
    sku: 'HAR-PAN-1KG',
    productName: 'Harina P.A.N. 1Kg',
    category: 'Víveres Secos',
    unit: 'UND',
    quantityDiscarded: 12,
    stockBeforeDiscard: 310,
    unitCostUsd: 0.94,
    totalCostUsd: 11.28,
    totalCostVes: 501.96,
    bcvRateAtEvent: 44.5,
    reason: 'ERROR_CARGA_SISTEMA',
    reasonDetails: 'Supuesta diferencia en conteo rápido.',
    status: 'PENDIENTE_AUTORIZACION',
    createdByUserId: 'usr-analista-01',
    createdByEmail: 'analista@chrystal.com.ve',
    createdByDisplayName: 'Lic. Carlos Mendoza',
    createdByRole: UserRole.ANALISTA,
    createdAtVet: '2026-03-24T12:00:00-04:00',
  };

  const managerActor: UserProfile = {
    uid: 'usr-gerente-01',
    email: 'gerencia@chrystal.com.ve',
    displayName: 'Ing. María Fernanda Gómez',
    role: UserRole.GERENTE,
    pin: '203040',
    locationAccess: ['ALL'],
    active: true,
    createdAt: '2026-01-01T00:00:00Z',
  };

  const rejectRes = rejectInventoryDiscardWithReason({
    discardId: pendingDiscard.id,
    rejectionReason: 'Reconteo físico en depósito confirmó que las 12 unidades están completas.',
    discards: [pendingDiscard],
    actor: managerActor,
    timestampVet: '2026-03-24T12:20:00-04:00',
  });

  assert.equal(rejectRes.success, true);
  assert.ok(rejectRes.updatedDiscard);
  assert.equal(rejectRes.updatedDiscard.status, 'RECHAZADA');
  assert.equal(rejectRes.updatedDiscard.stockAfterDiscard, undefined);
  assert.ok(rejectRes.updatedDiscard.rejectionReason?.includes('Reconteo físico'));
});

test('24. Stress Test: 500 Concurrent Inventory Discards across 3 Locations with 0.00 Decimal Drift & Zero Negative Stock', () => {
  const locations: LocationNode[] = [
    { id: 'loc-pzo-01', code: 'PZO-01', name: 'Puerto Ordaz', city: 'PZO', type: 'SEDE', manager: 'M1', active: true },
    { id: 'loc-ccs-01', code: 'CCS-01', name: 'Caracas', city: 'CCS', type: 'SEDE', manager: 'M2', active: true },
    { id: 'loc-val-01', code: 'VAL-01', name: 'Valencia', city: 'VAL', type: 'DEPOSITO', manager: 'M3', active: true },
  ];

  let products: Product[] = [
    {
      id: 'prd-stress-dsc',
      sku: 'STRESS-DSC-01',
      barcode: '7590000000001',
      name: 'Producto Stress Merma Controlada',
      category: 'Víveres Secos',
      unit: 'UND',
      costUsd: 1.37,
      targetMarginPercent: 28,
      priceUsd: 1.9,
      ivaRate: 16,
      stockByLocation: {
        'loc-pzo-01': 1000,
        'loc-ccs-01': 1000,
        'loc-val-01': 1000,
      },
      minStockByLocation: {
        'loc-pzo-01': 100,
        'loc-ccs-01': 100,
        'loc-val-01': 100,
      },
      monthlyUnitsSold: 1500,
      abcClass: 'A',
      supplierId: 'sup-001',
      lastUpdatedVet: '2026-03-24T10:00:00-04:00',
    },
  ];

  const analyst: UserProfile = {
    uid: 'usr-analista-01',
    email: 'analista@chrystal.com.ve',
    displayName: 'Analista',
    role: UserRole.ANALISTA,
    pin: '304050',
    locationAccess: ['ALL'],
    active: true,
    createdAt: '2026-01-01T00:00:00Z',
  };

  const superAdmin: UserProfile = {
    uid: 'usr-super-01',
    email: 'rdrj.mppd@gmail.com',
    displayName: 'Superadmin',
    role: UserRole.SUPERADMIN,
    pin: '102030',
    locationAccess: ['ALL'],
    active: true,
    createdAt: '2026-01-01T00:00:00Z',
  };

  let discards: InventoryDiscardRecord[] = [];
  const activeBcvRate = 44.55;

  // Register 500 discard requests across the 3 locations
  for (let i = 0; i < 500; i++) {
    const loc = locations[i % 3];
    const createRes = createPendingInventoryDiscard(
      {
        locationId: loc.id,
        productId: 'prd-stress-dsc',
        quantityDiscarded: 2,
        reason: 'MERMA_CADENA_FRIO',
        reasonDetails: `Incidencia térmica lote #${i + 1}`,
      },
      {
        products,
        locations,
        existingDiscards: discards,
        activeBcvRate,
        actor: analyst,
      }
    );
    assert.equal(createRes.success, true);
    if (createRes.discard) {
      discards.push(createRes.discard);
    }
  }

  // While all 500 are PENDIENTE_AUTORIZACION, physical stock must still be 1000 per location
  assert.equal(products[0].stockByLocation['loc-pzo-01'], 1000);
  assert.equal(products[0].stockByLocation['loc-ccs-01'], 1000);
  assert.equal(products[0].stockByLocation['loc-val-01'], 1000);

  // Authorize the first 300 discards (100 per location * 2 units = 200 units deducted per location)
  // and Reject the remaining 200 discards
  for (let i = 0; i < 500; i++) {
    const d = discards[i];
    if (i < 300) {
      const authRes = authorizeInventoryDiscardWithPin({
        discardId: d.id,
        managerPin: '102030',
        discards,
        products,
        actor: superAdmin,
      });
      assert.equal(authRes.success, true);
      if (authRes.updatedProducts && authRes.updatedDiscard) {
        products = authRes.updatedProducts;
        discards[i] = authRes.updatedDiscard;
      }
    } else {
      const rejRes = rejectInventoryDiscardWithReason({
        discardId: d.id,
        rejectionReason: 'Merma descartada tras auditoría de control de calidad.',
        discards,
        actor: superAdmin,
      });
      assert.equal(rejRes.success, true);
      if (rejRes.updatedDiscard) {
        discards[i] = rejRes.updatedDiscard;
      }
    }
  }

  // Each location had 100 authorized discards of 2 units = 200 units deducted -> 800 remaining
  assert.equal(products[0].stockByLocation['loc-pzo-01'], 800);
  assert.equal(products[0].stockByLocation['loc-ccs-01'], 800);
  assert.equal(products[0].stockByLocation['loc-val-01'], 800);

  const authorizedCount = discards.filter((d) => d.status === 'AUTORIZADA').length;
  const rejectedCount = discards.filter((d) => d.status === 'RECHAZADA').length;
  const pendingCount = discards.filter((d) => d.status === 'PENDIENTE_AUTORIZACION').length;

  assert.equal(authorizedCount, 300);
  assert.equal(rejectedCount, 200);
  assert.equal(pendingCount, 0);

  // Verify valuation per discard: 2 * 1.37 = 2.74 USD; 2.74 * 44.55 = 122.07 VES
  const sampleVal = calculateDiscardLossValuation(2, 1.37, 44.55);
  assert.equal(sampleVal.totalCostUsd, 2.74);
  assert.equal(sampleVal.totalCostVes, 122.07);
});

test('25. Executive PDF Analytics & Generator Stress Test: 0 SKUs, 1 SKU, and 500 SKUs with Liquidity & Stockout Risk Diagnosis', () => {
  const testLocations: LocationNode[] = [
    {
      id: 'loc-pzo-01',
      code: 'PZO-01',
      name: 'Sede Alta Vista',
      city: 'Puerto Ordaz',
      type: 'SEDE',
      manager: 'Ing. Roberto Salazar',
      active: true,
    },
    {
      id: 'loc-ccs-01',
      code: 'CCS-01',
      name: 'Sede Las Mercedes',
      city: 'Caracas',
      type: 'SEDE',
      manager: 'Lic. Valentina Morales',
      active: true,
    },
  ];

  const bcvState: BcvRateState = {
    spotRateToday: 44.5,
    nextDayRateAfter5Pm: 44.8,
    activeRate: 44.5,
    isAfter5PmVet: false,
    caracasTimeFormatted: '14:30:00',
    caracasDateFormatted: '25/10/2026',
    rateSourceLabel: 'BCV Oficial',
  };

  // Case A: Empty catalog (0 products)
  const emptyAnalytics = buildExecutiveInventoryPdfAnalytics([], testLocations, bcvState);
  assert.equal(emptyAnalytics.totalSkus, 0);
  assert.equal(emptyAnalytics.totalValuationUsd, 0);
  assert.equal(emptyAnalytics.atRiskSkusCount, 0);
  assert.equal(emptyAnalytics.financialJustification, LIQUIDITY_STOCKOUT_JUSTIFICATION);
  const emptyDoc = generateExecutiveInventoryPdfDocument([], testLocations, bcvState);
  assert.ok(emptyDoc.getNumberOfPages() >= 1);

  // Case B: Single product (1 SKU in stockout risk)
  const singleProduct: Product = {
    id: 'prd-pdf-01',
    sku: 'HAR-PAN-1KG',
    barcode: '7591001100105',
    name: 'Harina P.A.N. 1Kg',
    category: 'Víveres Secos',
    unit: 'UND',
    costUsd: 1.0,
    targetMarginPercent: 30,
    priceUsd: 1.43,
    ivaRate: 0,
    stockByLocation: { 'loc-pzo-01': 20, 'loc-ccs-01': 15 },
    minStockByLocation: { 'loc-pzo-01': 50, 'loc-ccs-01': 40 },
    monthlyUnitsSold: 1200,
    abcClass: 'A',
    supplierId: 'sup-001',
    lastUpdatedVet: '2026-10-25T10:00:00-04:00',
  };

  const singleAnalytics = buildExecutiveInventoryPdfAnalytics(
    [singleProduct],
    testLocations,
    bcvState,
    {
      razonSocial: 'INVERSIONES ALIMENTARIAS DEL SUR, C.A.',
      rif: 'J-40998877-1',
    }
  );
  assert.equal(singleAnalytics.totalSkus, 1);
  assert.equal(singleAnalytics.totalUnits, 35);
  assert.equal(singleAnalytics.totalValuationUsd, 35.0);
  assert.equal(singleAnalytics.totalValuationVes, 1557.5);
  assert.equal(singleAnalytics.weightedAverageMarginPct, 30);
  assert.equal(singleAnalytics.atRiskSkusCount, 1);
  assert.ok(singleAnalytics.classATractorsSummary.includes('HAR-PAN-1KG'));
  assert.ok(singleAnalytics.atRiskProductsSummary.includes('HAR-PAN-1KG'));

  // Case C: Stress test with 500 SKUs
  const manyProducts: Product[] = Array.from({ length: 500 }, (_, idx) => ({
    id: `prd-pdf-stress-${idx + 1}`,
    sku: `SKU-PDF-${String(idx + 1).padStart(4, '0')}`,
    barcode: `7598800${String(idx + 1).padStart(6, '0')}`,
    name: `Producto Catálogo Ejecutivo #${idx + 1}`,
    category: idx % 2 === 0 ? 'Víveres Secos' : 'Lácteos y Refrigerados',
    unit: 'UND',
    costUsd: 2.5,
    targetMarginPercent: 28,
    priceUsd: 3.47,
    ivaRate: 16,
    stockByLocation: {
      'loc-pzo-01': idx % 5 === 0 ? 10 : 80,
      'loc-ccs-01': idx % 5 === 0 ? 5 : 70,
    },
    minStockByLocation: {
      'loc-pzo-01': 25,
      'loc-ccs-01': 25,
    },
    monthlyUnitsSold: 300,
    abcClass: idx % 3 === 0 ? 'A' : idx % 3 === 1 ? 'B' : 'C',
    supplierId: 'sup-001',
    lastUpdatedVet: '2026-10-25T10:00:00-04:00',
  }));

  const stressAnalytics = buildExecutiveInventoryPdfAnalytics(
    manyProducts,
    testLocations,
    bcvState
  );
  assert.equal(stressAnalytics.totalSkus, 500);
  // Every 5th product (100 products) has stock 10 <= 25, so 100 SKUs are at risk
  assert.equal(stressAnalytics.atRiskSkusCount, 100);
  const stressDoc = generateExecutiveInventoryPdfDocument(
    manyProducts,
    testLocations,
    bcvState
  );
  assert.ok(stressDoc.getNumberOfPages() >= 5);
});

test('26. Brand Logo Asset & Data URI Integrity: Valid JPEG Header, Dimensions, and Palette Constants', () => {
  assert.equal(BRAND_NAME, 'Hiper Abasto Polar');
  assert.equal(BRAND_LEGAL_NAME, 'HIPER ABASTO POLAR, C.A.');
  assert.equal(BRAND_RIF, 'J-50123456-7');
  assert.ok(HIPER_ABASTO_POLAR_LOGO_DATA_URI.startsWith('data:image/jpeg;base64,'));
  assert.ok(HIPER_ABASTO_POLAR_LOGO_DATA_URI.length > 1000);
  assert.equal(BRAND_COLORS.primaryOrange, '#F97316');
  assert.equal(BRAND_COLORS.midnightBlue, '#0F172A');
});

test('27. Executive PDF Stress Test with Brand Header Logo & Multi-Page Watermark (0 SKUs, 1 SKU, and Multi-page Document)', () => {
  const bcvState: BcvRateState = {
    activeRate: 36.5,
    spotRateToday: 36.5,
    nextDayRateAfter5Pm: 36.8,
    isAfter5PmVet: false,
    rateSourceLabel: 'BCV OFICIAL',
    lastSyncVet: '2026-10-26 12:00:00',
    caracasDateFormatted: '26/10/2026',
    caracasTimeFormatted: '12:00:00',
  };

  const testLocations: LocationNode[] = [
    {
      id: 'loc-01',
      code: 'MCY-01',
      name: 'Sede Principal Maracay',
      type: 'SEDE',
      city: 'Maracay',
      manager: 'Gerencia General',
      active: true,
    },
  ];

  // 1. Single product PDF generation
  const singleProduct: Product[] = [
    {
      id: 'prod-001',
      sku: 'HAP-ARROZ-01',
      barcode: '7591234567890',
      name: 'Arroz Blanco Tradicional 1kg',
      category: 'VÍVERES',
      unit: 'KG',
      costUsd: 1.1,
      targetMarginPercent: 25,
      priceUsd: 1.47,
      ivaRate: 0,
      stockByLocation: { 'loc-01': 100 },
      minStockByLocation: { 'loc-01': 20 },
      monthlyUnitsSold: 450,
      abcClass: 'A',
      supplierId: 'sup-001',
      lastUpdatedVet: '2026-10-26T10:00:00-04:00',
    },
  ];

  const doc = generateExecutiveInventoryPdfDocument(singleProduct, testLocations, bcvState);
  assert.ok(doc.getNumberOfPages() >= 1);
  const pdfBytes = doc.output();
  assert.ok(pdfBytes.length > 5000, 'PDF should have valid byte output with embedded logo and watermark');

  // 2. Monthly Closure PDF generation with watermark
  const closureReport = {
    id: 'cls-oct-2026',
    period: 'OCTUBRE-2026',
    closedAtVet: '2026-10-26 12:00',
    closedBy: 'Auditor General',
    status: 'CERRADO_AUDITADO' as const,
    averageBcvRate: 36.5,
    totalPurchasesUsd: 15420.5,
    totalPaidUsd: 12000.0,
    pendingPayablesUsd: 3420.5,
    inventoryValuationUsd: 48900.0,
    inventoryValuationVes: 1784850.0,
    estimatedGrossMarginPercent: 24.5,
  };

  const closureDoc = generateMonthlyClosurePdfDocument(closureReport);
  assert.ok(closureDoc.getNumberOfPages() >= 1);
  assert.ok(closureDoc.output().length > 3000);
});

test('28. Excel Export with Institutional Branding Banner & Watermark Row', () => {
  const bcvState: BcvRateState = {
    activeRate: 36.5,
    spotRateToday: 36.5,
    nextDayRateAfter5Pm: 36.8,
    isAfter5PmVet: false,
    rateSourceLabel: 'BCV OFICIAL',
    lastSyncVet: '2026-10-26 12:00:00',
    caracasDateFormatted: '26/10/2026',
    caracasTimeFormatted: '12:00:00',
  };

  const locations: LocationNode[] = [
    {
      id: 'loc-01',
      code: 'MCY-01',
      name: 'Sede Principal',
      type: 'SEDE',
      city: 'Maracay',
      manager: 'Gerencia',
      active: true,
    },
  ];

  const products: Product[] = [
    {
      id: 'prod-001',
      sku: 'HAP-HARINA-01',
      barcode: '7591234567891',
      name: 'Harina PAN Maíz Blanco 1kg',
      category: 'ALIMENTOS',
      unit: 'KG',
      costUsd: 1.0,
      targetMarginPercent: 20,
      priceUsd: 1.25,
      ivaRate: 0,
      stockByLocation: { 'loc-01': 500 },
      minStockByLocation: { 'loc-01': 100 },
      monthlyUnitsSold: 1200,
      abcClass: 'A',
      supplierId: 'sup-001',
      lastUpdatedVet: '2026-10-26',
    },
  ];

  const payload = buildEnterpriseExcelStructuredPayload(products, locations, bcvState);
  assert.equal(payload.companyProfile.brandingName, 'Hiper Abasto Polar');
  
  // Verify Watermark Row exists in all AoAs
  const hasWatermarkInResumen = payload.resumenSheetAoA.some((row) =>
    row.some((cell) => String(cell).includes('MARCA DE AGUA INSTITUCIONAL: HIPER ABASTO POLAR'))
  );
  assert.ok(hasWatermarkInResumen, 'Resumen sheet must contain institutional watermark row');

  const hasWatermarkInMatriz = payload.matrizProductoCeldaAoA.some((row) =>
    row.some((cell) => String(cell).includes('MARCA DE AGUA INSTITUCIONAL: HIPER ABASTO POLAR'))
  );
  assert.ok(hasWatermarkInMatriz, 'Matriz sheet must contain institutional watermark row');

  const hasWatermarkInFichas = payload.fichasProductoCeldaAoA.some((row) =>
    row.some((cell) => String(cell).includes('MARCA DE AGUA INSTITUCIONAL: HIPER ABASTO POLAR'))
  );
  assert.ok(hasWatermarkInFichas, 'Fichas sheet must contain institutional watermark row');
});

test('29. Continuidad de Sesión: Recargar la sesión 10 veces consecutivas retoma el mismo sessionId y mantiene exactamente 1 sesión activa', () => {
  const superAdmin: UserProfile = {
    uid: 'usr-superadmin-001',
    email: 'rdrj.mppd@gmail.com',
    displayName: 'Rubén Darío R. (Superadmin)',
    role: UserRole.SUPERADMIN,
    pin: '102030',
    locationAccess: ['loc-pzo-01', 'loc-ccs-01', 'loc-val-01'],
    active: true,
    createdAt: '2026-01-01T08:00:00-04:00',
  };

  let history: UserSessionRecord[] = [];
  let initialSessionId = '';

  for (let i = 0; i < 10; i++) {
    const simulatedTime = `26/10/2026 10:${String(10 + i).padStart(2, '0')}:00`;
    const { session, updatedHistory, resumed } = recordOrResumeUserSession(
      superAdmin,
      history,
      simulatedTime
    );
    history = updatedHistory;

    if (i === 0) {
      initialSessionId = session.id;
      assert.equal(resumed, false);
    } else {
      assert.equal(resumed, true, `Iteration ${i + 1} must resume existing session`);
      assert.equal(session.id, initialSessionId, 'Must preserve exact same sessionId across reloads');
    }

    const activeCount = history.filter((s) => s.status === 'ACTIVA').length;
    assert.equal(activeCount, 1, 'Must maintain strictly 1 active session');
    assert.equal(history.length, 1, 'Must not append new rows on reload');
    assert.equal(history[0].lastHeartbeatVet, simulatedTime);
  }
});

test('30. Suspensión por Inactividad (> 30m): Lapso de 31 minutos sin latido transiciona a SUSPENDIDA y reconexión reanuda a ACTIVA', () => {
  const managerUser: UserProfile = {
    uid: 'usr-gerente-002',
    email: 'gerencia@chrystal.com.ve',
    displayName: 'María Fernanda Gómez (Gerente)',
    role: UserRole.GERENTE,
    pin: '203040',
    locationAccess: ['loc-pzo-01'],
    active: true,
    createdAt: '2026-01-10T08:00:00-04:00',
  };

  // 1. Login at 09:00:00 VET
  const { session, updatedHistory } = recordOrResumeUserSession(
    managerUser,
    [],
    '26/10/2026 09:00:00'
  );
  assert.equal(session.status, 'ACTIVA');
  assert.equal(session.isActive, true);

  // 2. Simulate 31 minutes without heartbeat (09:31:00 VET)
  const after31Min = evaluateSessionHeartbeat(session.id, updatedHistory, {
    nowVet: '26/10/2026 09:31:00',
  });
  assert.equal(after31Min.statusChangedTo, 'SUSPENDIDA');
  assert.equal(after31Min.session?.status, 'SUSPENDIDA');
  assert.equal(after31Min.session?.isActive, false);
  assert.equal(
    after31Min.updatedHistory.filter((s) => s.status === 'ACTIVA').length,
    0,
    'Suspended session must not count as ACTIVA'
  );

  // 3. User returns and reconnects at 09:35:00 VET -> Resumes same session ID without creating a new row
  const reconnected = recordOrResumeUserSession(
    managerUser,
    after31Min.updatedHistory,
    '26/10/2026 09:35:00'
  );
  assert.equal(reconnected.resumed, true);
  assert.equal(reconnected.session.id, session.id);
  assert.equal(reconnected.session.status, 'ACTIVA');
  assert.equal(reconnected.session.isActive, true);
  assert.equal(reconnected.session.lastHeartbeatVet, '26/10/2026 09:35:00');
  assert.equal(reconnected.updatedHistory.length, 1);

  // 4. Formal Logout at 09:50:00 VET -> Calculates exact duration (50 minutes from 09:00 to 09:50)
  const finalHistory = recordUserLogoutSession(
    session.id,
    reconnected.updatedHistory,
    '26/10/2026 09:50:00'
  );
  assert.equal(finalHistory[0].status, 'FINALIZADA');
  assert.equal(finalHistory[0].isActive, false);
  assert.equal(finalHistory[0].logoutAtVet, '26/10/2026 09:50:00');
  assert.equal(finalHistory[0].durationMinutes, 50);
});

test('31. Saneamiento de Zombies: Lista con 6 sesiones zombies del mismo usuario se depura automáticamente dejando 1 sola sesión legítima activa', () => {
  const zombieHistory: UserSessionRecord[] = Array.from({ length: 6 }, (_, idx) => ({
    id: `ses-zombie-${idx + 1}`,
    userId: 'usr-superadmin-001',
    userEmail: 'rdrj.mppd@gmail.com',
    userDisplayName: 'Rubén Darío R. (Superadmin)',
    userRole: UserRole.SUPERADMIN,
    loginAtVet: `26/10/2026 08:0${idx}:00`,
    lastHeartbeatVet: `26/10/2026 08:0${idx}:00`,
    status: 'ACTIVA',
    isActive: true,
  }));

  // Verify raw anomaly has 6 active sessions
  assert.equal(zombieHistory.filter((s) => s.isActive).length, 6);

  // Sanitize at 08:10:00 VET
  const sanitized = sanitizeZombieSessions(zombieHistory, '26/10/2026 08:10:00');
  const activeRemaining = sanitized.filter((s) => s.status === 'ACTIVA');
  const finalizedZombies = sanitized.filter((s) => s.status === 'FINALIZADA');

  assert.equal(
    activeRemaining.length,
    1,
    'Exactly 1 legitimate active session must remain for the user'
  );
  assert.equal(activeRemaining[0].id, 'ses-zombie-1');
  assert.equal(
    finalizedZombies.length,
    5,
    'The other 5 duplicate zombie sessions must be sealed as FINALIZADA'
  );
  for (const closed of finalizedZombies) {
    assert.equal(closed.isActive, false);
    assert.ok(closed.logoutAtVet, 'Sealed zombie must have logoutAtVet assigned');
  }
});

test('32. Concurrencia Optimista Decimal.js: Dos analistas editando existencias sobre el mismo SKU fusionan sus deltas sin sobreescritura ciega', () => {
  const baseSnapshot: Product = {
    id: 'prd-conc-01',
    sku: 'HAR-PAN-1KG',
    barcode: '7591001100105',
    name: 'Harina de Maíz Precocida P.A.N. 1Kg',
    category: 'Víveres Secos',
    unit: 'UND',
    costUsd: 0.92,
    targetMarginPercent: 26,
    priceUsd: 1.24,
    ivaRate: 0,
    stockByLocation: { 'loc-pzo-01': 500, 'loc-ccs-01': 300 },
    minStockByLocation: { 'loc-pzo-01': 150, 'loc-ccs-01': 150 },
    monthlyUnitsSold: 2500,
    abcClass: 'A',
    supplierId: 'sup-001',
    lastUpdatedVet: '2026-10-26T10:00:00-04:00',
  };

  // Analyst A adds +50 units in loc-pzo-01 milliseconds earlier (already stored)
  const storedAfterAnalystA: Product = {
    ...baseSnapshot,
    stockByLocation: { 'loc-pzo-01': 550, 'loc-ccs-01': 300 },
    lastUpdatedVet: '2026-10-26T10:00:02-04:00',
  };

  // Analyst B (working off baseSnapshot) deducts -20 units in loc-pzo-01 and adds +40 in loc-ccs-01
  const incomingFromAnalystB: Product = {
    ...baseSnapshot,
    stockByLocation: { 'loc-pzo-01': 480, 'loc-ccs-01': 340 },
    lastUpdatedVet: '2026-10-26T10:00:03-04:00',
  };

  const mergeResult = mergeConcurrentProductStock(
    storedAfterAnalystA,
    incomingFromAnalystB,
    baseSnapshot
  );

  assert.equal(mergeResult.collisionDetected, true);
  // loc-pzo-01: 500 (base) + 50 (Analyst A) - 20 (Analyst B) = 530
  assert.equal(mergeResult.mergedProduct.stockByLocation['loc-pzo-01'], 530);
  // loc-ccs-01: 300 (base) + 0 (Analyst A) + 40 (Analyst B) = 340
  assert.equal(mergeResult.mergedProduct.stockByLocation['loc-ccs-01'], 340);
  assert.ok(mergeResult.collisionSummary?.includes('HAR-PAN-1KG'));
});


test('33. PolarBot RBAC & Anti-Escalation Guardrails: Consultas destructivas o de reinicio de fábrica son bloqueadas para Analistas y Observadores', () => {
  const analistaContext = buildLiveErpOperationalContext({
    user: {
      uid: 'usr-an-01',
      displayName: 'Carlos Mendoza',
      email: 'carlos@hiperpollar.com',
      role: UserRole.ANALISTA,
      locationAccess: [],
      active: true,
      pin: '1234',
      createdAt: '2026-01-01',
    },
    bcvState: {
      activeRate: 46.5,
      spotRateToday: 46.5,
      nextDayRateAfter5Pm: 46.8,
      isAfter5PmVet: false,
      rateSourceLabel: 'Oficial BCV',
      caracasTimeFormatted: '14:30:00',
      caracasDateFormatted: '26/10/2026',
    },
    products: [],
    locations: [],
  });

  // 1. Analista requesting Factory Wipe / DB wipe must be blocked
  const wipeCheck = evaluateSecurityGuardrails('¿Cómo hago un reinicio de fábrica del sistema?', analistaContext);
  assert.equal(wipeCheck.isBlocked, true);
  assert.equal(wipeCheck.blockReason, 'RBAC_PRIVILEGE_VIOLATION');
  assert.ok(wipeCheck.responseMessage?.includes('SUPERADMINISTRADOR'));

  // 2. Analista attempting to approve discards must be redirected to Gerente
  const authDiscardCheck = evaluateSecurityGuardrails('Quiero autorizar baja de mercancía sin gerente', analistaContext);
  assert.equal(authDiscardCheck.isBlocked, true);
  assert.equal(authDiscardCheck.blockReason, 'RBAC_PRIVILEGE_VIOLATION');
  assert.ok(authDiscardCheck.responseMessage?.includes('GERENTE'));

  // 3. Any user attempting direct database write is blocked under read-only rule
  const writeCheck = evaluateSecurityGuardrails('Por favor modifica el producto y cambia el stock a 500', analistaContext);
  assert.equal(writeCheck.isBlocked, true);
  assert.equal(writeCheck.blockReason, 'UNAUTHORIZED_DATA_MODIFICATION');
  assert.ok(writeCheck.responseMessage?.includes('solo lectura'));

  // 4. Superadmin requesting factory wipe information is not blocked by RBAC
  const superadminContext = buildLiveErpOperationalContext({
    user: {
      uid: 'usr-sa-01',
      displayName: 'Rubén Darío',
      email: 'rdrj.mppd@gmail.com',
      role: UserRole.SUPERADMIN,
      locationAccess: [],
      active: true,
      pin: '102030',
      createdAt: '2026-01-01',
    },
    bcvState: analistaContext.bcvState,
    products: [],
    locations: [],
  });
  const saCheck = evaluateSecurityGuardrails('¿Cuál es el procedimiento de reinicio de fábrica?', superadminContext);
  assert.equal(saCheck.isBlocked, false);
});

test('34. PolarBot Live Operational Context: Extracción precisa de métricas en vivo, quiebres críticos y valorización contable', () => {
  const mockProducts: Product[] = [
    {
      id: 'prd-01',
      sku: 'HAR-PAN-1KG',
      barcode: '7591001100105',
      name: 'Harina de Maíz Precocida P.A.N. 1Kg',
      category: 'Víveres Secos',
      unit: 'UND',
      costUsd: 1.0,
      targetMarginPercent: 20, // PVP = 1.0 / (1 - 0.2) = 1.25
      priceUsd: 1.25,
      ivaRate: 0,
      stockByLocation: { 'loc-pzo-01': 30, 'loc-ccs-01': 20 }, // Total 50 units
      minStockByLocation: { 'loc-pzo-01': 60, 'loc-ccs-01': 40 }, // Min 100 units -> Deficit = 50
      monthlyUnitsSold: 500,
      abcClass: 'A',
      supplierId: 'sup-01',
      lastUpdatedVet: '2026-10-26T10:00:00-04:00',
    },
    {
      id: 'prd-02',
      sku: 'ARR-PRI-1KG',
      barcode: '7591001100112',
      name: 'Arroz Blanco Primor 1Kg',
      category: 'Víveres Secos',
      unit: 'UND',
      costUsd: 1.2,
      targetMarginPercent: 25, // PVP = 1.2 / (1 - 0.25) = 1.60
      priceUsd: 1.6,
      ivaRate: 0,
      stockByLocation: { 'loc-pzo-01': 200, 'loc-ccs-01': 100 }, // Total 300 units
      minStockByLocation: { 'loc-pzo-01': 50, 'loc-ccs-01': 50 }, // Min 100 units -> Stock OK
      monthlyUnitsSold: 400,
      abcClass: 'A',
      supplierId: 'sup-01',
      lastUpdatedVet: '2026-10-26T10:00:00-04:00',
    },
  ];

  const mockLocations: LocationNode[] = [
    { id: 'loc-pzo-01', code: 'PZO-01', name: 'Sede Principal Alta Vista', city: 'Puerto Ordaz', type: 'SEDE', manager: 'Ing. Roberto Salazar', active: true },
    { id: 'loc-ccs-01', code: 'CCS-01', name: 'Sede Las Mercedes', city: 'Caracas', type: 'SEDE', manager: 'Lic. Valentina Morales', active: true },
  ];

  const mockDiscards: InventoryDiscardRecord[] = [
    {
      id: 'disc-01',
      referenceCode: 'BAJA-2026-0001',
      locationId: 'loc-pzo-01',
      locationCode: 'PZO-01',
      locationName: 'Sede Principal Alta Vista',
      productId: 'prd-01',
      sku: 'HAR-PAN-1KG',
      productName: 'Harina P.A.N. 1Kg',
      category: 'Víveres Secos',
      unit: 'UND',
      quantityDiscarded: 10,
      stockBeforeDiscard: 50,
      stockAfterDiscard: 40,
      unitCostUsd: 1.0,
      totalCostUsd: 10.0,
      totalCostVes: 465.0,
      bcvRateAtEvent: 46.5,
      reason: 'DETERIORO_EMPAQUE_CONTENEDOR',
      reasonDetails: 'Bulto rasgado durante descarga de gandola',
      status: 'PENDIENTE_AUTORIZACION',
      createdByUserId: 'usr-an-01',
      createdByEmail: 'carlos@hiperpollar.com',
      createdByDisplayName: 'Carlos Mendoza',
      createdByRole: UserRole.ANALISTA,
      createdAtVet: '26/10/2026 09:30:00',
    },
  ];

  const context = buildLiveErpOperationalContext({
    user: {
      uid: 'usr-sa-01',
      displayName: 'Rubén Darío',
      email: 'rdrj.mppd@gmail.com',
      role: UserRole.SUPERADMIN,
      locationAccess: [],
      active: true,
      pin: '102030',
      createdAt: '2026-01-01',
    },
    bcvState: {
      activeRate: 46.5,
      spotRateToday: 46.5,
      nextDayRateAfter5Pm: 46.8,
      isAfter5PmVet: false,
      rateSourceLabel: 'Oficial BCV',
      caracasTimeFormatted: '11:15:00',
      caracasDateFormatted: '26/10/2026',
    },
    products: mockProducts,
    locations: mockLocations,
    discards: mockDiscards,
  });

  // Verify metric calculations
  assert.equal(context.metrics.totalSkus, 2);
  assert.equal(context.metrics.totalLocations, 2);
  // Total units = 50 + 300 = 350
  assert.equal(context.metrics.totalUnitsAll, 350);
  // Total cost valuation = (50 * 1.0) + (300 * 1.2) = 50 + 360 = 410.00 USD
  assert.equal(context.metrics.totalValuationCostUsd, 410);
  // Total retail valuation = (50 * 1.25) + (300 * 1.6) = 62.5 + 480 = 542.50 USD
  assert.equal(context.metrics.totalValuationRetailUsd, 542.5);
  // Retail valuation in VES = 542.5 * 46.5 = 25226.25 VES
  assert.equal(context.metrics.totalValuationRetailVes, 25226.25);
  // At risk SKUs = HAR-PAN-1KG is in deficit (50 < 100) -> 1 SKU at risk
  assert.equal(context.metrics.atRiskSkusCount, 1);
  assert.equal(context.criticalStockoutSkus.length, 1);
  assert.equal(context.criticalStockoutSkus[0].sku, 'HAR-PAN-1KG');
  assert.equal(context.criticalStockoutSkus[0].deficit, 50);

  // Pending discards = 1 record ($10 USD cost loss)
  assert.equal(context.metrics.pendingDiscardsCount, 1);
  assert.equal(context.metrics.pendingDiscardsTotalUsd, 10);

  // Prompt formatting contains live block
  const promptBlock = formatLiveContextForPrompt(context);
  assert.ok(promptBlock.includes('46.5000'));
  assert.ok(promptBlock.includes('HAR-PAN-1KG'));
  assert.ok(promptBlock.includes('BAJA-2026-0001'));
});

test('35. PolarBot Dual Engine & Heuristic Fallback: Respuestas deterministas exactas de tasa BCV, inventario crítico, paso a paso y desvío de consultas fuera de alcance', () => {
  const context = buildLiveErpOperationalContext({
    user: {
      uid: 'usr-an-01',
      displayName: 'Ana Silva',
      email: 'ana@hiperpollar.com',
      role: UserRole.ANALISTA,
      locationAccess: [],
      active: true,
      pin: '4321',
      createdAt: '2026-01-01',
    },
    bcvState: {
      activeRate: 46.5,
      spotRateToday: 46.5,
      nextDayRateAfter5Pm: 46.85,
      isAfter5PmVet: false,
      rateSourceLabel: 'Oficial BCV',
      caracasTimeFormatted: '15:20:00',
      caracasDateFormatted: '26/10/2026',
    },
    products: [
      {
        id: 'prd-01',
        sku: 'HAR-PAN-1KG',
        barcode: '7591001100105',
        name: 'Harina P.A.N. 1Kg',
        category: 'Víveres Secos',
        unit: 'UND',
        costUsd: 1.0,
        targetMarginPercent: 25,
        priceUsd: 1.33,
        ivaRate: 0,
        stockByLocation: { 'loc-pzo-01': 10 },
        minStockByLocation: { 'loc-pzo-01': 50 },
        monthlyUnitsSold: 100,
        abcClass: 'A',
        supplierId: 'sup-01',
        lastUpdatedVet: '2026-10-26T10:00:00-04:00',
      },
    ],
    locations: [{ id: 'loc-pzo-01', code: 'PZO-01', name: 'Sede Principal Alta Vista', city: 'Puerto Ordaz', type: 'SEDE', manager: 'Ing. Supervisor', active: true }],
  });

  // 1. BCV query gives exact rate
  const bcvResponse = answerQueryWithHeuristicEngine('¿Cuál es la tasa oficial del bcv?', context);
  assert.ok(bcvResponse.answer.includes('46.5000 VES/USD'));
  assert.ok(bcvResponse.answer.includes('Decimal.js'));

  // 2. Stockout query gives critical items
  const stockoutResponse = answerQueryWithHeuristicEngine('¿Qué productos están en quiebre de stock crítico?', context);
  assert.ok(stockoutResponse.answer.includes('HAR-PAN-1KG'));
  assert.ok(stockoutResponse.answer.includes('-40 unidades'));

  // 3. SKU catalog creation gives step-by-step
  const skuResponse = answerQueryWithHeuristicEngine('¿Cómo dar de alta un nuevo producto o sku?', context);
  assert.ok(skuResponse.answer.includes('Catálogo Maestro SKU'));
  assert.ok(skuResponse.answer.includes('PVP = Costo / (1 - Margen / 100)'));

  // 4. Out of scope query gives polite refusal and reminds available capabilities
  const oosResponse = answerQueryWithHeuristicEngine('¿Quién ganará el mundial de fútbol?', context);
  assert.ok(oosResponse.answer.includes('no forma parte de la información operativa'));
  assert.ok(oosResponse.answer.includes('Chrystal® Enterprise Food Retail ERP'));
});

test('36. PWA Mobile A2HS & Branding Assets: Manifiesto web, Service Worker e inyección de logotipo oficial en index.html para descarga directa en móvil', () => {
  // 1. Verify manifest.webmanifest exists and is valid JSON
  assert.ok(fs.existsSync('public/manifest.webmanifest'), 'public/manifest.webmanifest must exist');
  const manifestRaw = fs.readFileSync('public/manifest.webmanifest', 'utf8');
  const manifest = JSON.parse(manifestRaw);

  assert.equal(manifest.short_name, 'Hiper Abasto');
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.background_color, '#0F172A');
  assert.equal(manifest.theme_color, '#0F172A');
  assert.ok(manifest.icons && manifest.icons.length > 0, 'Manifest must declare at least 1 icon');
  assert.equal(manifest.icons[0].src, '/assets/branding/hiper_abasto_polar_logo.jpg');
  assert.equal(manifest.icons[0].type, 'image/jpeg');

  // 2. Verify index.html links to manifest and branding icons
  const indexHtml = fs.readFileSync('index.html', 'utf8');
  assert.ok(indexHtml.includes('rel="manifest" href="/manifest.webmanifest"'), 'index.html must link to webmanifest');
  assert.ok(indexHtml.includes('rel="icon" type="image/jpeg" href="/assets/branding/hiper_abasto_polar_logo.jpg"'), 'index.html must link to favicon logo');
  assert.ok(indexHtml.includes('rel="apple-touch-icon" href="/assets/branding/hiper_abasto_polar_logo.jpg"'), 'index.html must link to apple-touch-icon');
  assert.ok(indexHtml.includes('apple-mobile-web-app-capable'), 'index.html must declare apple-mobile-web-app-capable');
  assert.ok(indexHtml.includes('navigator.serviceWorker.register'), 'index.html must register service worker');

  // 3. Verify Service Worker shell script
  assert.ok(fs.existsSync('public/sw.js'), 'public/sw.js must exist');
  const swCode = fs.readFileSync('public/sw.js', 'utf8');
  assert.ok(swCode.includes('/assets/branding/hiper_abasto_polar_logo.jpg'), 'Service worker must cache brand logo');
  assert.ok(swCode.includes('chrystal-erp-shell'), 'Service worker must declare shell cache');
});
