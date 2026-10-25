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
} from './excel-exporter';
import { BcvRateState, LocationNode, Product, UserRole } from '../types';

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
    },
    {
      id: 'loc-ccs-02',
      code: 'CCS-02',
      name: 'Sucursal Las Mercedes',
      city: 'Caracas',
      type: 'SEDE',
      manager: 'Lic. Mariana Silva',
    },
    {
      id: 'loc-val-03',
      code: 'VAL-03',
      name: 'Depósito Central Valencia',
      city: 'Valencia',
      type: 'DEPOSITO',
      manager: 'Ing. Héctor Vargas',
    },
  ];

  const bcvState: BcvRateState = {
    spotRateToday: 887.3,
    nextDayRateAfter5Pm: 887.3,
    activeRate: 887.3,
    isAfter5PmVet: false,
    caracasTimeFormatted: '14:30:00',
    caracasDateFormatted: '24/10/2026',
    sourceLabel: 'Banco Central de Venezuela (www.bcv.org.ve)',
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
  assert.equal(fallback.razonSocial, 'NOMBRE DE EMPRESA, C.A.');
  assert.equal(fallback.rif, 'J-00000000-0 (RIF EMPRESA)');
  assert.equal(fallback.direccionFiscal, 'DIRECCIÓN FISCAL DE LA EMPRESA, CIUDAD, VENEZUELA');
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
    manualOverrideRate: null,
    useManualOverride: false,
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
    manualOverrideRate: null,
    useManualOverride: false,
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





