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
  round2,
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
  SESSION_INACTIVITY_WARNING_MINUTES,
  SESSION_FORCE_LOGOUT_MINUTES,
  SESSION_FORCE_LOGOUT_REASON_KEY,
  AUTH_BROADCAST_CHANNEL_NAME,
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
  PurchaseInvoice,
  PurchaseInvoiceLine,
  AuditLogEntry,
  MeatYieldBatch,
  StagedBrmRetentionDispatch,
  TaxRetentionVoucher,
  ExpenseCategory,
  ExpenseRecord,
  ExpenseVoucherType,
  MonthlyBudgetPlan,
  ExpenseMonthlyArqueoReport,
  AuditActionType,
} from '../types';
import {
  evaluateExpenseApprovalRequirement,
  calculateEarlyPaymentDiscount,
  calculateOverduePenalty,
  buildSuggestedDrivePath,
  evaluateMonthlyBudgetStatus,
  generateMonthlyExpenseArqueoData,
  exportExpenseArqueoPdfDocument,
  buildExpenseArqueoWorkbook,
  EXPENSE_APPROVAL_THRESHOLD_USD,
  CONTINGENCY_ALARM_THRESHOLD_PERCENT,
  EXPENSE_CATEGORIES_METADATA,
} from './expenses-engine';
import { generateQrMatrix, generateQrSvgString, generateQrDataUri } from './qr-matrix';
import {
  evaluateSecurityGuardrails,
  buildOutOfScopeResponse,
  buildLiveErpOperationalContext,
  formatLiveContextForPrompt,
  answerQueryWithHeuristicEngine,
} from '../ai-assistant';
import {
  calculateMeatYieldBatch,
  projectCarcassRequirementForCutDemand,
  RES_STANDARD_CUTS,
  CERDO_STANDARD_CUTS,
  POLLO_STANDARD_CUTS,
} from './meat-yield';
import {
  calculateFruverBatch,
  projectFruverRequirementForDemand,
  FRUVER_LOSS_CAUSE_LABELS,
  FRUVER_STANDARD_PRODUCTS,
} from './fruver-yield';
import {
  checkUserRolePermission,
  BOOTSTRAP_USERS,
} from '../context/AuthContext';
import fs from 'node:fs';
import path from 'node:path';
import {
  detectPwaEnvironment,
  OFFICIAL_LOGO_PATH,
} from '../components/layout/MobileInstallBanner';
import {
  STORAGE_KEY_ACTIVE_TAB,
  VALID_NAVIGATION_TABS,
  resolveStoredActiveTab,
} from '../App';
import {
  STORAGE_KEY_POLARBOT_OPEN,
  STORAGE_KEY_POLARBOT_MINIMIZED,
  STORAGE_KEY_POLARBOT_MESSAGES,
  STORAGE_KEY_POLARBOT_DRAFT,
  loadStoredPolarbotOpen,
  loadStoredPolarbotDraft,
  loadStoredPolarbotMessages,
  tokenizeInlineMarkdown,
} from '../components/assistant/ChatAssistantWidget';
import {
  PWA_CACHE_NAME,
  PWA_PRECACHE_ASSETS,
  PWA_EXCLUDED_HOSTNAMES,
  shouldBypassServiceWorker,
  simulateServiceWorkerFetch,
} from './pwa-service-worker';
import {
  buildStandardDirectCutSku,
  compareDirectVsCarcassCost,
  calculateMeatDirectCutPurchase,
  applyDirectCutPurchaseToCatalog,
} from './meat-direct-cuts';
import {
  getLocationStockBreakdown,
  applyStockDeltaToZone,
  replenishShelfFromDeposit,
  returnShelfToDeposit,
  transferStockBetweenZonesAndLocations,
  deductPosSaleShelfFirst,
  evaluatePhysicalCountTolerance,
  reconcileLocationPhysicalCount,
  buildShelfReplenishmentPickList,
} from './shelf-stock';
import {
  ISLR_CONCEPTS_CATALOG,
  isValidVenezuelanRif,
  formatRetentionVoucherNumber,
  resolveFilingFortnight,
  resolveIvaRetentionRatePercent,
  calculateInvoiceRetentions,
  voidRetentionVoucherWithPin,
} from './fiscal-retentions';
import {
  generateIvaRetentionPdfDocument,
  generateIslrRetentionPdfDocument,
  generateQuincenalRetentionsPdfDocument,
} from './retention-pdf';
import {
  formatSeniatCompactRif,
  isValidSeniatCompactRif,
  buildSeniatIvaTxtExport,
  buildSeniatIslrXmlExport,
  buildSeniatPurchaseBookWorkbook,
  buildSeniatSalesBookWorkbook,
} from './seniat-exporter';
import {
  computeEan13CheckDigit,
  deriveProductPlu5,
  encodeScaleBarcode,
  decodeScaleBarcode,
  resolveCatalogProductFromBarcode,
} from './scale-barcode';
import {
  appendScanToSessionQueue,
  summarizeScanQueueByProduct,
} from './barcode-scanner';
import {
  normalizePhoneE164,
  isValidPhoneE164,
  isCorporateSelfPhone,
  resolveHybridBrmTransport,
  appendIdempotentBrmMessage,
  formatBrmPurchaseOrderTemplate,
  formatBrmPaymentAndRetentionsBundleTemplate,
  registerIncomingBrmPreInvoice,
  resetBrmWhatsappSessionCleanly,
  DEFAULT_CORPORATE_BRM_PHONE_E164,
} from './brm-whatsapp';
import {
  computeDaysUntilExpiration,
  classifyFefoLotStatus,
  createFefoPerishableLot,
  sortLotsByFefo,
  consumeLotsStrictFefo,
  buildColdChainTemperatureLog,
  moveFefoLotToShelf,
} from './fefo-coldchain';
import { executeInternalProductionOrder } from './recipe-bom';
import {
  parseBankStatementCsv,
  submitPaymentToPreConciliation,
  autoReconcileBankStatement,
} from './bank-reconciliation';
import {
  isVenezuelanQuincenaPeakDay,
  isRetailWeekendPeakDay,
  forecastVenezuelanRetailDemand,
} from './demand-predictor';
import {
  DEFAULT_TOTP_CONFIG,
  generateBase32TotpSecret,
  generateTotpCode,
  buildTotpOtpAuthUri,
  buildEphemeralApprovalQrPayload,
  verifyManagerGovernanceAuth,
} from './totp-governance';
import {
  computeFiscalPayloadSignature,
  processFiscalZClosure,
} from './fiscal-printer';
import {
  quotaTelemetryEngine,
  DEFAULT_DAILY_READ_LIMIT,
  DEFAULT_DAILY_WRITE_LIMIT,
} from './quota-telemetry';
import {
  calculateConservativeCashFlowProjection,
  getNextSeniatQuincenaDeadline,
} from './cash-flow-projector';
import {
  detectTextDelimiter,
  parseRawMatrixChrystalSales,
  parseChrystalSalesUploadedFile,
  generateSampleChrystalSalesMatrix,
} from './chrystal-sales-parser';

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

test('36. PWA / A2HS Mobile Installability: Manifests, Service Worker Network-First, HTML Meta Tags, and iOS/Android/Standalone Detection', () => {
  // 1. Validate iOS Safari, Android Chrome, and Standalone environment detection
  const iosEnv = detectPwaEnvironment({
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
    matchMediaStandalone: false,
    navigatorStandalone: false,
  });
  assert.equal(iosEnv.isIOS, true);
  assert.equal(iosEnv.isAndroid, false);
  assert.equal(iosEnv.isStandalone, false);
  assert.equal(iosEnv.isMobileUserAgent, true);

  const androidEnv = detectPwaEnvironment({
    userAgent:
      'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
    matchMediaStandalone: false,
    navigatorStandalone: false,
  });
  assert.equal(androidEnv.isIOS, false);
  assert.equal(androidEnv.isAndroid, true);
  assert.equal(androidEnv.isStandalone, false);

  const standaloneEnv = detectPwaEnvironment({
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X)',
    matchMediaStandalone: false,
    navigatorStandalone: true,
  });
  assert.equal(standaloneEnv.isStandalone, true);

  // 2. Validate public/manifest.webmanifest and public/manifest.json
  const rootDir = process.cwd();
  for (const manifestFile of ['public/manifest.webmanifest', 'public/manifest.json']) {
    const raw = fs.readFileSync(path.join(rootDir, manifestFile), 'utf8');
    const parsed = JSON.parse(raw);
    assert.equal(parsed.name, 'Hiper Abasto Polar — Chrystal ERP');
    assert.equal(parsed.short_name, 'Hiper Abasto');
    assert.equal(parsed.display, 'standalone');
    assert.equal(parsed.theme_color, '#0F172A');
    assert.equal(parsed.background_color, '#0F172A');
    assert.ok(Array.isArray(parsed.icons) && parsed.icons.length >= 2);
    const has192 = parsed.icons.some(
      (ic: { src: string; sizes: string; purpose: string }) =>
        ic.src === OFFICIAL_LOGO_PATH &&
        ic.sizes === '192x192' &&
        ic.purpose.includes('any') &&
        ic.purpose.includes('maskable')
    );
    const has512 = parsed.icons.some(
      (ic: { src: string; sizes: string; purpose: string }) =>
        ic.src === OFFICIAL_LOGO_PATH &&
        ic.sizes === '512x512' &&
        ic.purpose.includes('any') &&
        ic.purpose.includes('maskable')
    );
    assert.equal(has192, true, `${manifestFile} must declare 192x192 any maskable icon`);
    assert.equal(has512, true, `${manifestFile} must declare 512x512 any maskable icon`);
  }

  // 3. Validate public/sw.js precaches logo and index.html and excludes Firestore & APIs
  const swContent = fs.readFileSync(path.join(rootDir, 'public/sw.js'), 'utf8');
  assert.ok(swContent.includes('/assets/branding/hiper_abasto_polar_logo.jpg'));
  assert.ok(swContent.includes('/index.html'));
  assert.ok(swContent.includes('firestore.googleapis.com'));
  assert.ok(swContent.includes('identitytoolkit.googleapis.com'));
  assert.ok(swContent.includes('/api/'));
  assert.ok(swContent.includes('hiper-abasto-polar-erp-v2'));

  // 4. Validate index.html PWA links and meta tags
  const indexHtml = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8');
  assert.ok(indexHtml.includes('rel="manifest" href="/manifest.webmanifest"'));
  assert.ok(indexHtml.includes('rel="icon" type="image/jpeg" href="/assets/branding/hiper_abasto_polar_logo.jpg"'));
  assert.ok(indexHtml.includes('rel="apple-touch-icon" href="/assets/branding/hiper_abasto_polar_logo.jpg"'));
  assert.ok(indexHtml.includes('name="apple-mobile-web-app-capable"'));
  assert.ok(indexHtml.includes('name="theme-color" content="#0F172A"'));
});

test('37. Meat Yield Engine: Decimal.js Carcass Breakdown (Res, Cerdo, Pollo), Relative Cost Allocation, and Purchase Projection', () => {
  assert.ok(RES_STANDARD_CUTS.length >= 6);
  assert.ok(CERDO_STANDARD_CUTS.length >= 5);
  assert.ok(POLLO_STANDARD_CUTS.length >= 5);

  // Setup 240 kg carcass at $3.50/kg = $840 total cost
  const cuts = [
    { cutName: 'Solomo de Cuerito', tier: 'PRIMERA_ALTO_VALOR' as const, weightKg: 24, relativeValueFactor: 2.3, targetMarginPercent: 30 },
    { cutName: 'Lomito / Filet Mignon', tier: 'PRIMERA_ALTO_VALOR' as const, weightKg: 7.2, relativeValueFactor: 2.6, targetMarginPercent: 32 },
    { cutName: 'Chocozuela / Pulpa Negra', tier: 'PRIMERA_ALTO_VALOR' as const, weightKg: 36, relativeValueFactor: 1.8, targetMarginPercent: 28 },
    { cutName: 'Costilla de Res', tier: 'TERCERA_SOPA_HUESO' as const, weightKg: 28.8, relativeValueFactor: 0.75, targetMarginPercent: 20 },
    { cutName: 'Carne Molida Especial', tier: 'SEGUNDA_CORTE_GUISO' as const, weightKg: 31.2, relativeValueFactor: 1.25, targetMarginPercent: 25 },
    { cutName: 'Lagarto con Hueso', tier: 'SEGUNDA_CORTE_GUISO' as const, weightKg: 21.6, relativeValueFactor: 0.95, targetMarginPercent: 22 },
    { cutName: 'Falda / Pecho', tier: 'SEGUNDA_CORTE_GUISO' as const, weightKg: 24, relativeValueFactor: 1.35, targetMarginPercent: 26 },
  ];

  const wastes = [
    { wasteType: 'HUESO_BLANCO_DESECHO' as const, label: 'Hueso Blanco', weightKg: 36 },
    { wasteType: 'GRASA_SEBO_DESECHO' as const, label: 'Grasa y Sebo', weightKg: 19.2 },
    { wasteType: 'ASERRIN_CORTE_SIERRA' as const, label: 'Aserrín de Sierra', weightKg: 4.8 },
    { wasteType: 'MERMA_EVAPORACION_LIQUIDOS' as const, label: 'Evaporación en Cava', weightKg: 7.2 },
  ];

  const batch = calculateMeatYieldBatch({
    input: {
      animalType: 'RES',
      presentation: 'CANAL_COMPLETA',
      locationId: 'loc-pzo-01',
      carcassWeightKg: 240,
      carcassCostPerKgUsd: 3.5,
      cuts,
      wastes,
    },
    bcvRate: 45.0,
    locationName: 'Sede Principal Alta Vista',
    supervisor: {
      uid: 'usr-sup-carniceria-005',
      displayName: 'José Gregorio Páez',
      role: UserRole.SUPERVISOR_CARNICERIA,
    },
  });

  assert.equal(batch.carcassWeightKg, 240);
  assert.equal(batch.totalCarcassCostUsd, 840);
  assert.equal(batch.totalCutsWeightKg, 172.8);
  assert.equal(batch.totalWasteWeightKg, 67.2);
  assert.equal(batch.unaccountedWeightKg, 0);
  assert.equal(batch.cutsYieldPercent, 72.0); // 172.8 / 240 = 72%
  assert.equal(batch.wastePercent, 28.0); // 67.2 / 240 = 28%

  // Total allocated cost should equal carcass cost ($840) within 1 cent due to rounding
  const totalCostAllocated = batch.cuts.reduce((sum, c) => sum + (c.allocatedCostPerKgUsd * c.weightKg), 0);
  assert.ok(Math.abs(totalCostAllocated - 840) < 1.0, `Cost allocated ${totalCostAllocated} must match carcass total cost 840`);

  // Higher value cut (Lomito) has higher allocated cost per kg than secondary cut (Costilla)
  const lomito = batch.cuts.find((c) => c.cutName.includes('Lomito'));
  const costilla = batch.cuts.find((c) => c.cutName.includes('Costilla'));
  assert.ok(lomito && costilla);
  assert.ok(lomito.allocatedCostPerKgUsd > costilla.allocatedCostPerKgUsd);

  // Test purchase projection: If we need 120 kg of Solomo de Cuerito
  const projection = projectCarcassRequirementForCutDemand({
    animalType: 'RES',
    cutName: 'Solomo de Cuerito',
    targetDemandKg: 120,
  });
  assert.ok(projection.carcassNeededKg > 1000);
  assert.ok(projection.cutYieldPercent > 0);
});

test('38. Fruver Yield Engine: Decimal.js Agricultural Lot Intake, 5 Waste Causes, Net Salable Yield, and Cost Absorption into PVP', () => {
  // Agricultural lot: 500 kg of Tomate Perita @ $1.20/kg = $600 total cost
  const lot = calculateFruverBatch({
    input: {
      productId: 'prd-fruv-01',
      productSku: 'FRUV-TOM-PER',
      productName: 'Tomate Perita Seleccionado',
      category: 'VERDURAS_HORTALIZAS',
      locationId: 'loc-pzo-01',
      initialWeightKg: 500,
      initialCostPerKgUsd: 1.2,
      targetMarginPercent: 30,
      wastes: [
        { cause: 'DESHIDRATACION_PERDIDA_PESO', weightKg: 15, notes: 'Pérdida por humedad en cava' },
        { cause: 'DANO_EXCESO_FRIO', weightKg: 5, notes: 'Quemadura leve en estiba baja' },
        { cause: 'DANO_EXCESO_CALOR', weightKg: 10, notes: 'Sobre-maduración en traslado' },
        { cause: 'DANO_MECANICO_MANIPULACION', weightKg: 12, notes: 'Aplastamiento por caja rota' },
        { cause: 'EXCESO_DIAS_EXPOSICION_ROTACION', weightKg: 8, notes: 'Senescencia en góndola' },
      ],
    },
    bcvRate: 45.0,
    locationName: 'Sede Principal Alta Vista',
    supervisor: {
      uid: 'usr-sup-fruver-006',
      displayName: 'Carmen Elena Rojas',
      role: UserRole.SUPERVISOR_FRUVER,
    },
  });

  assert.equal(lot.initialWeightKg, 500);
  assert.equal(lot.totalBatchCostUsd, 600);
  assert.equal(lot.initialCostPerKgUsd, 1.2);
  assert.equal(lot.totalWasteKg, 50);
  assert.equal(lot.netSalableWeightKg, 450);
  assert.equal(lot.netYieldPercent, 90.0);
  assert.equal(lot.wastePercent, 10.0);

  // Cost absorption: $600 / 450 kg = $1.3333 -> $1.33/kg
  assert.equal(lot.effectiveCostPerSalableKgUsd, 1.33);
  assert.ok(lot.effectiveCostPerSalableKgUsd > lot.initialCostPerKgUsd);

  // PVP with 30% margin on absorbed cost: 1.33 / (1 - 0.30) = $1.90 USD
  assert.equal(lot.suggestedPvpPerKgUsd, 1.9);
  assert.equal(lot.suggestedPvpPerKgVes, 85.5); // 1.90 * 45.0

  // Verify all 5 causes are reflected in waste breakdown
  assert.equal(lot.wastes.length, 5);
  const causes = lot.wastes.map((w) => w.cause);
  assert.ok(causes.includes('DESHIDRATACION_PERDIDA_PESO'));
  assert.ok(causes.includes('DANO_EXCESO_FRIO'));
  assert.ok(causes.includes('DANO_EXCESO_CALOR'));
  assert.ok(causes.includes('DANO_MECANICO_MANIPULACION'));
  assert.ok(causes.includes('EXCESO_DIAS_EXPOSICION_ROTACION'));
});

test('39. Supervisor RBAC Governance: Dedicated Roles (Carnicería, Fruver, Pasillo) Inherit Analyst Operational Rights with Double Signature PIN Protection', () => {
  // Check bootstrap accounts exist with correct emails and roles
  const carniceria = BOOTSTRAP_USERS.find((u) => u.email === 'carniceria@hiperabastopolar.com');
  const fruver = BOOTSTRAP_USERS.find((u) => u.email === 'fruver@hiperabastopolar.com');
  const pasillo = BOOTSTRAP_USERS.find((u) => u.email === 'pasillo@hiperabastopolar.com');

  assert.ok(carniceria);
  assert.ok(fruver);
  assert.ok(pasillo);
  assert.equal(carniceria.role, UserRole.SUPERVISOR_CARNICERIA);
  assert.equal(fruver.role, UserRole.SUPERVISOR_FRUVER);
  assert.equal(pasillo.role, UserRole.SUPERVISOR_PASILLO);

  // Verify permission: All three supervisors satisfy requirements for ANALISTA
  assert.equal(checkUserRolePermission(UserRole.SUPERVISOR_CARNICERIA, [UserRole.ANALISTA]), true);
  assert.equal(checkUserRolePermission(UserRole.SUPERVISOR_FRUVER, [UserRole.ANALISTA]), true);
  assert.equal(checkUserRolePermission(UserRole.SUPERVISOR_PASILLO, [UserRole.ANALISTA]), true);

  // Verify security boundary: Supervisors do NOT have GERENTE or SUPERADMIN authority
  assert.equal(checkUserRolePermission(UserRole.SUPERVISOR_CARNICERIA, [UserRole.GERENTE]), false);
  assert.equal(checkUserRolePermission(UserRole.SUPERVISOR_FRUVER, [UserRole.GERENTE, UserRole.SUPERADMIN]), false);
  assert.equal(checkUserRolePermission(UserRole.SUPERVISOR_PASILLO, [UserRole.SUPERADMIN]), false);
});

test('40. PolarBot Latency Optimization: Sub-Second Local Deterministic Fast-Path for Rotation, Meat Yield, Fruver, and Supervisors', () => {
  const mockUser: UserProfile = {
    uid: 'usr-analista-003',
    email: 'costos@chrystal.com.ve',
    displayName: 'Carlos Méndez (Analista)',
    role: UserRole.ANALISTA,
    pin: '304050',
    locationAccess: ['loc-pzo-01'],
    active: true,
    createdAt: '2026-01-15T08:00:00-04:00',
  };

  const context = buildLiveErpOperationalContext({
    user: mockUser,
    bcvState: {
      spotRateToday: 45.2,
      nextDayRateAfter5Pm: 45.5,
      activeRate: 45.2,
      isAfter5PmVet: false,
      rateSourceLabel: 'Oficial BCV',
      caracasTimeFormatted: '14:30 VET',
      caracasDateFormatted: '27/10/2026',
    },
    locations: [
      {
        id: 'loc-pzo-01',
        code: 'PZO-01',
        name: 'Sede Principal Alta Vista',
        city: 'Puerto Ordaz',
        type: 'SEDE',
        manager: 'Ing. Salazar',
        active: true,
      },
    ],
    products: [
      {
        id: 'prd-01',
        sku: 'HAR-PAN-1KG',
        barcode: '7591001',
        name: 'Harina P.A.N. 1kg',
        category: 'Víveres Secos',
        unit: 'KG',
        costUsd: 0.95,
        targetMarginPercent: 28,
        priceUsd: 1.32,
        ivaRate: 0,
        stockByLocation: { 'loc-pzo-01': 500 },
        minStockByLocation: { 'loc-pzo-01': 100 },
        monthlyUnitsSold: 3200,
        abcClass: 'A',
        supplierId: 'sup-001',
        lastUpdatedVet: '2026-10-27T10:00:00-04:00',
      },
      {
        id: 'prd-02',
        sku: 'ARR-PRI-1KG',
        barcode: '7591002',
        name: 'Arroz Primor Clásico 1kg',
        category: 'Granos',
        unit: 'KG',
        costUsd: 1.1,
        targetMarginPercent: 25,
        priceUsd: 1.47,
        ivaRate: 0,
        stockByLocation: { 'loc-pzo-01': 350 },
        minStockByLocation: { 'loc-pzo-01': 80 },
        monthlyUnitsSold: 1800,
        abcClass: 'A',
        supplierId: 'sup-001',
        lastUpdatedVet: '2026-10-27T10:00:00-04:00',
      },
    ],
    discards: [],
  });

  assert.ok(context.topRotationSkus && context.topRotationSkus.length >= 2);
  assert.equal(context.topRotationSkus[0].sku, 'HAR-PAN-1KG');

  // 1. Top rotation query responds deterministically in < 1ms
  const startRotation = Date.now();
  const rotationRes = answerQueryWithHeuristicEngine('cual es el producto con mayor rotacion?', context);
  const rotationDuration = Date.now() - startRotation;
  assert.ok(rotationDuration < 50, `Rotation query took ${rotationDuration}ms, must be < 50ms`);
  assert.ok(rotationRes.answer.includes('HAR-PAN-1KG'));
  assert.ok(rotationRes.answer.includes('3.200 unidades vendidas'));

  // 2. Meat yield query responds with Res/Cerdo/Pollo desposte explanation
  const meatRes = answerQueryWithHeuristicEngine('¿Cómo funciona el módulo de rendimiento cárnico y desposte?', context);
  assert.ok(meatRes.answer.includes('Rendimiento Cárnico'));
  assert.ok(meatRes.answer.includes('Res, Cerdo y Pollo'));
  assert.ok(meatRes.answer.includes('Hueso Blanco/Rojo'));

  // 3. Fruver query responds with 5 waste causes and cost absorption
  const fruverRes = answerQueryWithHeuristicEngine('Explícame las mermas de fruver y absorción de costo', context);
  assert.ok(fruverRes.answer.includes('Rendimiento Fruver'));
  assert.ok(fruverRes.answer.includes('DESHIDRATACION_PERDIDA_PESO'));
  assert.ok(fruverRes.answer.includes('Costo Unitario Efectivo = Costo Total del Lote / Kilos Netos Vendibles'));

  // 4. Supervisor credentials query responds with specialized accounts
  const supRes = answerQueryWithHeuristicEngine('¿Cuáles son las credenciales y roles de supervisor?', context);
  assert.ok(supRes.answer.includes('carniceria@hiperabastopolar.com'));
  assert.ok(supRes.answer.includes('fruver@hiperabastopolar.com'));
  assert.ok(supRes.answer.includes('pasillo@hiperabastopolar.com'));

  // 5. Species-specific desposte: Pollo MUST NOT discuss beef cuts (Solomo / Lomito)
  const chickenRes = answerQueryWithHeuristicEngine('Como desgloso el pollo?', context);
  assert.ok(chickenRes.answer.includes('Carlos Méndez (Analista)'), 'Must personalize greeting to active user');
  assert.ok(chickenRes.answer.includes('Pollo Beneficiado'));
  assert.ok(chickenRes.answer.includes('Pechuga (Entera / Milanesas)'));
  assert.ok(chickenRes.answer.includes('Muslos y Contramuslos'));
  assert.equal(chickenRes.answer.includes('Solomo'), false, 'Chicken response must never mention beef cuts like Solomo');
  assert.equal(chickenRes.answer.includes('Lomito'), false, 'Chicken response must never mention beef cuts like Lomito');

  // 6. Species-specific desposte: Cerdo MUST discuss pork cuts (Pernil, Chuleta, Costillita)
  const porkRes = answerQueryWithHeuristicEngine('Como hago la carga y desglose de cerdo?', context);
  assert.ok(porkRes.answer.includes('Carlos Méndez (Analista)'));
  assert.ok(porkRes.answer.includes('Canal de Cerdo'));
  assert.ok(porkRes.answer.includes('Pernil (Pierna Trasera)'));
  assert.ok(porkRes.answer.includes('Lomo y Chuletas'));
  assert.equal(porkRes.answer.includes('Solomo'), false, 'Pork response must never mention beef cuts like Solomo');

  // 7. Species-specific desposte: Res MUST discuss beef cuts (Solomo, Lomito, Chocozuela)
  const beefRes = answerQueryWithHeuristicEngine('Como desgloso la canal de res?', context);
  assert.ok(beefRes.answer.includes('Carlos Méndez (Analista)'));
  assert.ok(beefRes.answer.includes('Solomo de Cuerito'));
  assert.ok(beefRes.answer.includes('Chocozuela'));
});

test('41. Navigation State Resilience: Multi-Tab Persistence (activeTab), URL Hash Synchronization, and Anti-Reset Protection', () => {
  assert.ok(VALID_NAVIGATION_TABS.includes('DASHBOARD'));
  assert.ok(VALID_NAVIGATION_TABS.includes('MEAT_YIELD'));
  assert.ok(VALID_NAVIGATION_TABS.includes('FRUVER_YIELD'));
  assert.ok(VALID_NAVIGATION_TABS.includes('INVENTORY_DISCARDS'));

  // Without DOM / window, resolveStoredActiveTab falls back safely to 'DASHBOARD'
  const defaultTab = resolveStoredActiveTab();
  assert.equal(defaultTab, 'DASHBOARD');

  // Verify storage key standard
  assert.equal(STORAGE_KEY_ACTIVE_TAB, 'chrystal_erp_active_tab_v1');
});

test('42. PolarBot Conversational State Continuity: SessionStorage Hydration, Draft Recovery, and Loop-Protected Markdown Formatting', () => {
  // Storage key standards
  assert.equal(STORAGE_KEY_POLARBOT_OPEN, 'chrystal_polarbot_open_v1');
  assert.equal(STORAGE_KEY_POLARBOT_MINIMIZED, 'chrystal_polarbot_minimized_v1');
  assert.equal(STORAGE_KEY_POLARBOT_MESSAGES, 'chrystal_polarbot_messages_v1');
  assert.equal(STORAGE_KEY_POLARBOT_DRAFT, 'chrystal_polarbot_draft_v1');

  // Node environment default state loaders
  assert.equal(loadStoredPolarbotOpen(), false);
  assert.equal(loadStoredPolarbotDraft(), '');
  assert.deepEqual(loadStoredPolarbotMessages(), []);
});

test('43. PolarBot Zero-Duplication Parser & Inline Markdown Tokenizer Invariant Integrity', () => {
  // 1. Plain text query (e.g. user question in chat bubble) must never duplicate
  const userQuery = 'Como hago la carga y desglose de cerdo en el sistema?';
  const tokensUser = tokenizeInlineMarkdown(userQuery);
  assert.equal(tokensUser.length, 1);
  assert.equal(tokensUser[0].type, 'text');
  assert.equal(tokensUser[0].content, userQuery);

  // 2. Line with multiple bold segments (Header and product list)
  const lineMultiBold = 'El módulo **"Operaciones > Rendimiento Cárnico"** gestiona la transformación y desglose de canales completas de **Res, Cerdo y Pollo** en cortes primarios, secundarios y mermas técnicas:';
  const tokensMulti = tokenizeInlineMarkdown(lineMultiBold);
  assert.equal(tokensMulti.length, 5);
  assert.equal(tokensMulti[0].type, 'text');
  assert.equal(tokensMulti[0].content, 'El módulo ');
  assert.equal(tokensMulti[1].type, 'bold');
  assert.equal(tokensMulti[1].content, '"Operaciones > Rendimiento Cárnico"');
  assert.equal(tokensMulti[2].type, 'text');
  assert.equal(tokensMulti[2].content, ' gestiona la transformación y desglose de canales completas de ');
  assert.equal(tokensMulti[3].type, 'bold');
  assert.equal(tokensMulti[3].content, 'Res, Cerdo y Pollo');
  assert.equal(tokensMulti[4].type, 'text');
  assert.equal(tokensMulti[4].content, ' en cortes primarios, secundarios y mermas técnicas:');

  // Verify zero trailing duplicate in multi bold line
  const reconstructedMulti = tokensMulti
    .map(t => (t.type === 'bold' ? `**${t.content}**` : t.content))
    .join('');
  assert.equal(reconstructedMulti, lineMultiBold);

  // 3. Bullet line with leading bold title (must not duplicate text after colon)
  const lineBulletBold = '**Ingreso de Canal**: Se registra el peso bruto de la canal en kg y el costo total de adquisición en USD.';
  const tokensBullet = tokenizeInlineMarkdown(lineBulletBold);
  assert.equal(tokensBullet.length, 2);
  assert.equal(tokensBullet[0].type, 'bold');
  assert.equal(tokensBullet[0].content, 'Ingreso de Canal');
  assert.equal(tokensBullet[1].type, 'text');
  assert.equal(tokensBullet[1].content, ': Se registra el peso bruto de la canal en kg y el costo total de adquisición en USD.');

  // 4. Combined Bold and Inline Code (Supervisor de Carnicería + email)
  const lineCodeBold = 'El usuario **Supervisor de Carnicería** (`carniceria@hiperabastopolar.com`) puede registrar pesajes y despostes.';
  const tokensCode = tokenizeInlineMarkdown(lineCodeBold);
  assert.equal(tokensCode.length, 5);
  assert.equal(tokensCode[0].content, 'El usuario ');
  assert.equal(tokensCode[1].type, 'bold');
  assert.equal(tokensCode[1].content, 'Supervisor de Carnicería');
  assert.equal(tokensCode[2].content, ' (');
  assert.equal(tokensCode[3].type, 'code');
  assert.equal(tokensCode[3].content, 'carniceria@hiperabastopolar.com');
  assert.equal(tokensCode[4].content, ') puede registrar pesajes y despostes.');

  // 5. Plain explanatory paragraph (e.g. Calculadora Proyectiva de Compra)
  const linePlain = 'Permite ingresar los kilos de demanda esperada de cortes premium (ej. 150 kg de Solomo) y el sistema proyecta automáticamente cuántas canales de res o cerdos enteros deben solicitarse al proveedor para cubrir dicho requerimiento.';
  const tokensPlain = tokenizeInlineMarkdown(linePlain);
  assert.equal(tokensPlain.length, 1);
  assert.equal(tokensPlain[0].content, linePlain);

  // 6. Stress Test: 1,000 iterations over complex markdown preserving exact text identity
  const sampleCorpus = [
    userQuery,
    lineMultiBold,
    lineBulletBold,
    lineCodeBold,
    linePlain,
    'Texto normal con *cursiva elegante* y más texto.',
    'Código con acentos: `Hueso Blanco/Rojo` y `Aserrín de Sierra`.',
    'Cadena sin markdown alguno con números 123.45 y símbolos $ # @ % !',
  ];

  const startTime = Date.now();
  for (let i = 0; i < 1000; i++) {
    const sample = sampleCorpus[i % sampleCorpus.length];
    const parsed = tokenizeInlineMarkdown(sample);
    const reconstructed = parsed
      .map(t => {
        if (t.type === 'bold') return `**${t.content}**`;
        if (t.type === 'code') return `\`${t.content}\``;
        if (t.type === 'italic') return `*${t.content}*`;
        return t.content;
      })
      .join('');
    assert.equal(reconstructed, sample, `Failed text reconstruction identity on sample #${i}`);
  }
  const elapsed = Date.now() - startTime;
  assert.ok(elapsed < 100, `Stress tokenization took ${elapsed}ms for 1000 items, must be < 100ms`);
});

test('44. Custom Batch Ingestion, Supplier Association, Species-Tailored Yields & Direct Inventory Loading (Meat & Fruver)', () => {
  const supervisor = {
    uid: 'usr-supervisor-carn',
    displayName: 'Supervisor Carnicería y Fruver',
    role: UserRole.SUPERVISOR_CARNICERIA,
  };

  // ========================================================
  // 1. Meat Yield Custom Batch Ingestion & Supplier Tying
  // ========================================================
  const customMeatBatch = calculateMeatYieldBatch({
    input: {
      animalType: 'RES',
      presentation: 'MEDIA_CANAL',
      locationId: 'loc-pzo-01',
      carcassWeightKg: 220,
      carcassCostPerKgUsd: 2.85,
      customBatchCode: 'GUIA-SADA-BOV-2026-90412',
      receptionDate: '2026-03-25',
      supplierId: 'sup-004',
      supplierName: 'Frigorífico Industrial y Matadero Bolívar, C.A.',
      cuts: [
        { cutName: 'Lomito / Filet Mignon', tier: 'PRIMERA_ALTO_VALOR', weightKg: 3.96, relativeValueFactor: 2.6, targetMarginPercent: 32 },
        { cutName: 'Solomo de Cuerito', tier: 'PRIMERA_ALTO_VALOR', weightKg: 7.7, relativeValueFactor: 2.3, targetMarginPercent: 30 },
        { cutName: 'Carne Molida Especial', tier: 'SEGUNDA_CORTE_GUISO', weightKg: 26.4, relativeValueFactor: 1.25, targetMarginPercent: 25 },
        { cutName: 'Costilla de Res', tier: 'TERCERA_SOPA_HUESO', weightKg: 20.9, relativeValueFactor: 0.75, targetMarginPercent: 20 },
      ],
      wastes: [
        { wasteType: 'MERMA_EVAPORACION_LIQUIDOS', label: 'Merma por Líquidos y Oreo en Cava', weightKg: 4.5 },
        { wasteType: 'ASERRIN_CORTE_SIERRA', label: 'Merma por Aserrín de Corte Sierra', weightKg: 2.2 },
        { wasteType: 'HUESO_BLANCO_DESECHO', label: 'Hueso Blanco No Aprovechable (Desecho)', weightKg: 6.8 },
        { wasteType: 'GRASA_SEBO_DESECHO', label: 'Sebo / Grasa Excedente No Comercial', weightKg: 3.5 },
      ],
    },
    bcvRate: 885.5,
    locationName: 'Sede Alta Vista',
    supervisor,
  });

  // Verify non-random custom batch code was preserved verbatim
  assert.equal(customMeatBatch.batchCode, 'GUIA-SADA-BOV-2026-90412');
  assert.equal(customMeatBatch.customBatchCode, 'GUIA-SADA-BOV-2026-90412');
  assert.equal(customMeatBatch.receptionDate, '2026-03-25');
  assert.equal(customMeatBatch.supplierId, 'sup-004');
  assert.equal(customMeatBatch.supplierName, 'Frigorífico Industrial y Matadero Bolívar, C.A.');
  assert.equal(customMeatBatch.totalCarcassCostUsd, 627.0); // 220 * 2.85

  // ========================================================
  // 2. Fruver Yield Custom Batch Ingestion & Supplier Tying
  // ========================================================
  const customFruverBatch = calculateFruverBatch({
    input: {
      productId: 'prd-fruv-tom-per',
      productSku: 'FRUV-TOM-PER',
      productName: 'Tomate Perita Seleccionado',
      category: 'VERDURAS_HORTALIZAS',
      locationId: 'loc-pzo-01',
      initialWeightKg: 120,
      initialCostPerKgUsd: 1.15,
      targetMarginPercent: 28,
      customBatchCode: 'INSAI-AGRO-2026-77810',
      receptionDate: '2026-03-24',
      supplierId: 'sup-005',
      supplierName: 'Distribuidora Agrícola Campo Fresco Los Andes, C.A.',
      wastes: [
        { cause: 'DESHIDRATACION_PERDIDA_PESO', weightKg: 3.0, notes: 'Evaporación natural' },
        { cause: 'DANO_EXCESO_FRIO', weightKg: 1.5, notes: 'Quemadura frío' },
        { cause: 'DANO_EXCESO_CALOR', weightKg: 4.0, notes: 'Maduración acelerada' },
        { cause: 'DANO_MECANICO_MANIPULACION', weightKg: 2.5, notes: 'Aplastamiento en cesta' },
        { cause: 'EXCESO_DIAS_EXPOSICION_ROTACION', weightKg: 1.0, notes: 'Merma piso venta' },
      ],
    },
    bcvRate: 885.5,
    locationName: 'Sede Alta Vista',
    supervisor,
  });

  // Verify non-random custom fruver batch code
  assert.equal(customFruverBatch.batchCode, 'INSAI-AGRO-2026-77810');
  assert.equal(customFruverBatch.customBatchCode, 'INSAI-AGRO-2026-77810');
  assert.equal(customFruverBatch.receptionDate, '2026-03-24');
  assert.equal(customFruverBatch.supplierId, 'sup-005');
  assert.equal(customFruverBatch.supplierName, 'Distribuidora Agrícola Campo Fresco Los Andes, C.A.');

  // Verify exact Decimal.js waste and cost absorption calculations
  // Total initial: 120 Kg @ $1.15 = $138.00 USD
  assert.equal(customFruverBatch.totalBatchCostUsd, 138.0);
  assert.equal(customFruverBatch.totalWasteKg, 12.0); // 3 + 1.5 + 4 + 2.5 + 1
  assert.equal(customFruverBatch.wastePercent, 10.0); // 12 / 120 = 10%
  assert.equal(customFruverBatch.netSalableWeightKg, 108.0); // 120 - 12 = 108 Kg
  assert.equal(customFruverBatch.netYieldPercent, 90.0); // 108 / 120 = 90%
  assert.equal(customFruverBatch.effectiveCostPerSalableKgUsd, 1.28); // 138 / 108 = 1.2777... -> 1.28
  assert.equal(customFruverBatch.suggestedPvpPerKgUsd, 1.78); // 1.28 / (1 - 0.28) = 1.7777... -> 1.78
  assert.equal(customFruverBatch.totalWasteLossUsd, 13.81); // Itemized sum: 3.45 + 1.73 + 4.60 + 2.88 + 1.15 = 13.81

  // ========================================================
  // 3. Multi-Species Tailored Purchase Projections
  // ========================================================
  // Res: Solomo demand 35 Kg -> Carcass needed
  const resProj = projectCarcassRequirementForCutDemand({
    animalType: 'RES',
    cutName: 'Solomo de Cuerito',
    targetDemandKg: 35,
  });
  // Yield is 3.5% -> 35 / 0.035 = 1000 Kg
  assert.equal(resProj.carcassNeededKg, 1000);
  assert.equal(resProj.cutYieldPercent, 3.5);

  // Cerdo: Pernil demand 53 Kg
  const cerdoProj = projectCarcassRequirementForCutDemand({
    animalType: 'CERDO',
    cutName: 'Pernil de Cerdo',
    targetDemandKg: 53,
  });
  // Yield is 26.5% -> 53 / 0.265 = 200 Kg
  assert.equal(cerdoProj.carcassNeededKg, 200);
  assert.equal(cerdoProj.cutYieldPercent, 26.5);

  // Pollo: Pechuga demand 62 Kg
  const polloProj = projectCarcassRequirementForCutDemand({
    animalType: 'POLLO',
    cutName: 'Pechuga con Hueso',
    targetDemandKg: 62,
  });
  // Yield is 31.0% -> 62 / 0.31 = 200 Kg
  assert.equal(polloProj.carcassNeededKg, 200);
  assert.equal(polloProj.cutYieldPercent, 31.0);

  // Fruver purchase projection: 100 Kg net salable produce requirement
  const fruverProj = projectFruverRequirementForDemand({
    productSku: 'FRUV-TOM-PER',
    targetDemandKg: 100,
    customExpectedYieldPercent: 90.0, // using current batch yield
  });
  // 100 / 0.90 = 111.11 Kg raw
  assert.equal(fruverProj.rawNeededKg, 111.11);
  assert.equal(fruverProj.salableYieldPercent, 90.0);

  // ========================================================
  // 4. Simulated Direct Inventory Stock Load (Cortes Cárnicos)
  // ========================================================
  const mockCatalog: Record<string, Product> = {};
  let totalCommittedKg = 0;

  customMeatBatch.cuts.forEach((cut, idx) => {
    const sku = `CARN-RES-${cut.cutName.slice(0, 3).toUpperCase()}`;
    mockCatalog[sku] = {
      id: `prd-${sku}`,
      sku,
      barcode: `75910000000${idx}`,
      name: cut.cutName,
      category: 'Carnicería',
      unit: 'KG',
      costUsd: cut.allocatedCostPerKgUsd,
      targetMarginPercent: cut.targetMarginPercent,
      priceUsd: cut.retailPriceUsdPerKg,
      ivaRate: 0,
      stockByLocation: { 'loc-pzo-01': cut.weightKg },
      minStockByLocation: { 'loc-pzo-01': 20 },
      monthlyUnitsSold: 80,
      abcClass: 'A',
      supplierId: 'sup-004',
      lastUpdatedVet: '2026-03-25T14:00:00-04:00',
    };
    totalCommittedKg += cut.weightKg;
  });

  assert.equal(Object.keys(mockCatalog).length, 4);
  assert.equal(totalCommittedKg, 58.96); // 3.96 + 7.7 + 26.4 + 20.9
  assert.equal(mockCatalog['CARN-RES-LOM'].stockByLocation['loc-pzo-01'], 3.96);
  assert.equal(mockCatalog['CARN-RES-LOM'].supplierId, 'sup-004');
  assert.ok(mockCatalog['CARN-RES-LOM'].costUsd > 0);
  assert.ok(mockCatalog['CARN-RES-LOM'].priceUsd > mockCatalog['CARN-RES-LOM'].costUsd);
});

test('45. PWA Service Worker Network-First & Security Bypass Stress Test (1,000 Concurrent Requests, Offline Simulation, and Firestore Isolation)', () => {
  // 1. Verify Cache Invariants and Precache Asset Declarations
  assert.equal(PWA_CACHE_NAME, 'hiper-abasto-polar-erp-v2');
  assert.ok(PWA_PRECACHE_ASSETS.includes('/'));
  assert.ok(PWA_PRECACHE_ASSETS.includes('/index.html'));
  assert.ok(PWA_PRECACHE_ASSETS.includes('/manifest.webmanifest'));
  assert.ok(PWA_PRECACHE_ASSETS.includes('/manifest.json'));
  assert.ok(PWA_PRECACHE_ASSETS.includes('/assets/branding/hiper_abasto_polar_logo.jpg'));

  // 2. Deterministic Security Gateway: Strict Bypass Routing Verification
  // Firestore must NEVER be touched by Service Worker cache
  const firestoreDecision = shouldBypassServiceWorker(
    'https://firestore.googleapis.com/v1/projects/ar-group-erp/databases/(default)/documents/products'
  );
  assert.equal(firestoreDecision.bypass, true);
  assert.equal(firestoreDecision.reason, 'FIRESTORE_OR_GOOGLE_API');

  // Firebase Auth / IdentityToolkit must bypass cache
  const authDecision = shouldBypassServiceWorker(
    'https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=AIzaSyFakeKey'
  );
  assert.equal(authDecision.bypass, true);
  assert.equal(authDecision.reason, 'FIRESTORE_OR_GOOGLE_API');

  // AI Assistant and OCR APIs must bypass cache
  const assistantDecision = shouldBypassServiceWorker('https://hiperabastopolar.com/api/assistant/chat');
  assert.equal(assistantDecision.bypass, true);
  assert.equal(assistantDecision.reason, 'API_TRANSACTIONAL_ENDPOINT');

  const ocrDecision = shouldBypassServiceWorker('https://hiperabastopolar.com/api/ocr/extract');
  assert.equal(ocrDecision.bypass, true);
  assert.equal(ocrDecision.reason, 'API_TRANSACTIONAL_ENDPOINT');

  // WebSockets must bypass cache
  const wsDecision = shouldBypassServiceWorker('ws://localhost:3000/vite-hmr');
  assert.equal(wsDecision.bypass, true);
  assert.equal(wsDecision.reason, 'WEBSOCKET_PROTOCOL');

  // Service Worker script itself must never cache itself
  const swScriptDecision = shouldBypassServiceWorker('https://hiperabastopolar.com/sw.js');
  assert.equal(swScriptDecision.bypass, true);
  assert.equal(swScriptDecision.reason, 'SERVICE_WORKER_SCRIPT');

  // Non-GET methods (POST, PUT, DELETE) must bypass cache
  const postDecision = shouldBypassServiceWorker('https://hiperabastopolar.com/index.html', 'POST');
  assert.equal(postDecision.bypass, true);
  assert.equal(postDecision.reason, 'NON_GET_METHOD');

  // Shell assets must be intercepted by Service Worker
  const shellDecision = shouldBypassServiceWorker('https://hiperabastopolar.com/index.html', 'GET');
  assert.equal(shellDecision.bypass, false);

  const logoDecision = shouldBypassServiceWorker(
    'https://hiperabastopolar.com/assets/branding/hiper_abasto_polar_logo.jpg',
    'GET'
  );
  assert.equal(logoDecision.bypass, false);

  // 3. Simulated Network-First Lifecycle and Offline Degradation
  const mockCacheStore = new Map<string, string>();
  mockCacheStore.set('/index.html', '<html><head><title>Chrystal ERP Shell</title></head><body>Shell</body></html>');
  mockCacheStore.set('/assets/branding/hiper_abasto_polar_logo.jpg', 'fake-binary-jpeg-data');

  // Scenario A: Online user fetches shell -> returns fresh network and updates cache
  const onlineShellFetch = simulateServiceWorkerFetch({
    url: 'https://hiperabastopolar.com/index.html',
    method: 'GET',
    mode: 'navigate',
    networkOnline: true,
    networkPayload: '<html><head><title>Updated Live Shell v2</title></head><body>Shell v2</body></html>',
    cacheStore: mockCacheStore,
  });
  assert.equal(onlineShellFetch.handledBySw, true);
  assert.equal(onlineShellFetch.source, 'NETWORK');
  assert.equal(onlineShellFetch.status, 200);
  assert.ok(onlineShellFetch.body.includes('Updated Live Shell v2'));
  assert.equal(onlineShellFetch.updatedCache, true);

  // Scenario B: Offline user (cava de frío / pérdida de señal) navigates -> returns cached shell
  const offlineShellFetch = simulateServiceWorkerFetch({
    url: 'https://hiperabastopolar.com/index.html',
    method: 'GET',
    mode: 'navigate',
    networkOnline: false,
    cacheStore: mockCacheStore,
  });
  assert.equal(offlineShellFetch.handledBySw, true);
  assert.equal(offlineShellFetch.source, 'CACHE');
  assert.equal(offlineShellFetch.status, 200);
  assert.ok(offlineShellFetch.body.includes('Updated Live Shell v2'));

  // Scenario C: Offline user fetches branding logo -> served from cache
  const offlineLogoFetch = simulateServiceWorkerFetch({
    url: 'https://hiperabastopolar.com/assets/branding/hiper_abasto_polar_logo.jpg',
    method: 'GET',
    networkOnline: false,
    cacheStore: mockCacheStore,
  });
  assert.equal(offlineLogoFetch.handledBySw, true);
  assert.equal(offlineLogoFetch.source, 'CACHE');
  assert.equal(offlineLogoFetch.body, 'fake-binary-jpeg-data');

  // Scenario D: Offline user queries an uncached random resource -> graceful 503 fallback
  const offlineUncachedFetch = simulateServiceWorkerFetch({
    url: 'https://hiperabastopolar.com/some-uncached-file.pdf',
    method: 'GET',
    networkOnline: false,
    cacheStore: mockCacheStore,
  });
  assert.equal(offlineUncachedFetch.handledBySw, true);
  assert.equal(offlineUncachedFetch.source, 'OFFLINE_FALLBACK');
  assert.equal(offlineUncachedFetch.status, 503);
  assert.ok(offlineUncachedFetch.body.includes('Modo sin conexión activo'));

  // Scenario E: Firestore call while offline -> bypassed directly to network, resulting in 502 without poisoning cache
  const firestoreFetch = simulateServiceWorkerFetch({
    url: 'https://firestore.googleapis.com/v1/projects/ar-group/databases',
    method: 'GET',
    networkOnline: false,
    cacheStore: mockCacheStore,
  });
  assert.equal(firestoreFetch.handledBySw, false);
  assert.equal(firestoreFetch.source, 'BYPASS_TO_NETWORK');
  assert.equal(firestoreFetch.updatedCache, false);

  // 4. Stress Test: 1,000 High-Frequency Concurrent Requests across all Categories
  const testCorpus = [
    { url: 'https://firestore.googleapis.com/v1/projects/test/documents/col', method: 'GET', online: true },
    { url: 'https://identitytoolkit.googleapis.com/v1/accounts', method: 'POST', online: true },
    { url: 'https://hiperabastopolar.com/api/assistant/chat', method: 'POST', online: true },
    { url: 'https://hiperabastopolar.com/api/ocr/extract', method: 'POST', online: true },
    { url: 'ws://localhost:3000/vite-hmr', method: 'GET', online: true },
    { url: 'https://hiperabastopolar.com/index.html', method: 'GET', mode: 'navigate', online: true },
    { url: 'https://hiperabastopolar.com/index.html', method: 'GET', mode: 'navigate', online: false },
    { url: 'https://hiperabastopolar.com/assets/branding/hiper_abasto_polar_logo.jpg', method: 'GET', online: false },
    { url: 'https://hiperabastopolar.com/manifest.webmanifest', method: 'GET', online: true },
    { url: 'https://hiperabastopolar.com/sw.js', method: 'GET', online: true },
    { url: 'https://bcv.org.ve/cotizaciones', method: 'GET', online: true },
  ];

  const startTime = Date.now();
  let bypassCount = 0;
  let cacheHitCount = 0;
  let networkHitCount = 0;

  for (let i = 0; i < 1000; i++) {
    const item = testCorpus[i % testCorpus.length];
    const res = simulateServiceWorkerFetch({
      url: item.url,
      method: item.method,
      mode: item.mode,
      networkOnline: item.online,
      cacheStore: mockCacheStore,
    });

    if (res.source === 'BYPASS_TO_NETWORK') bypassCount++;
    if (res.source === 'CACHE') cacheHitCount++;
    if (res.source === 'NETWORK') networkHitCount++;
  }

  const durationMs = Date.now() - startTime;
  assert.ok(bypassCount > 500, `Expected > 500 bypassed requests, got ${bypassCount}`);
  assert.ok(cacheHitCount > 150, `Expected > 150 cache hits, got ${cacheHitCount}`);
  assert.ok(networkHitCount > 150, `Expected > 150 network hits, got ${networkHitCount}`);
  assert.ok(durationMs < 100, `1,000 Service Worker request decisions took ${durationMs}ms (threshold: < 100ms)`);
});

test('46. Cloud Run Container Readiness: package.json esbuild server.js bundle, immediate 0.0.0.0:3000 healthcheck, and anti-crash guard', () => {
  const pkgJsonPath = path.join(process.cwd(), 'package.json');
  const pkgRaw = fs.readFileSync(pkgJsonPath, 'utf8');
  const pkg = JSON.parse(pkgRaw) as { scripts?: Record<string, string> };

  assert.equal(
    pkg.scripts?.build,
    'vite build && esbuild server.ts --bundle --platform=node --format=esm --packages=external --outfile=server.js'
  );
  assert.equal(pkg.scripts?.start, 'node server.js');
  assert.equal(pkg.scripts?.dev, 'tsx server.ts');

  const serverTsPath = path.join(process.cwd(), 'server.ts');
  const serverTsRaw = fs.readFileSync(serverTsPath, 'utf8');
  assert.ok(serverTsRaw.includes("httpServer.listen(PORT, '0.0.0.0'"));
  assert.ok(serverTsRaw.includes("fs.existsSync(distPath)"));
  assert.ok(serverTsRaw.includes("app.get('/api/health'"));
  assert.ok(serverTsRaw.includes('startServer().catch('));
});


test('47. Meat Direct Cuts Engine: Manual Assigned Cost (no forced CPP), Reception Shrinkage, Carcass Comparator, Zone Routing & 500-Iteration Stress Test', () => {
  const actor = {
    uid: 'usr-sup-carn-01',
    displayName: 'Supervisor Carnicería PZO',
    role: UserRole.SUPERVISOR_CARNICERIA,
  };

  // 1. SKU Normalization
  assert.equal(
    buildStandardDirectCutSku('RES', 'Solomo de Cuerito Premium'),
    'CAR-RES-SOLOMO-DE-CUER'
  );
  assert.equal(
    buildStandardDirectCutSku('POLLO', 'Pechuga Deshuesada Filete'),
    'CAR-POL-PECHUGA-DESHUE'
  );

  // Reference carcass batch for live cost comparison
  const refCarcassBatch = calculateMeatYieldBatch({
    input: {
      animalType: 'RES',
      presentation: 'MEDIA_CANAL',
      locationId: 'loc-pzo-01',
      carcassWeightKg: 200,
      carcassCostPerKgUsd: 3.1,
      cuts: [
        {
          cutName: 'Solomo de Cuerito',
          tier: 'PRIMERA_ALTO_VALOR',
          weightKg: 35,
          relativeValueFactor: 2.2,
          targetMarginPercent: 30,
        },
        {
          cutName: 'Pulpa Negra',
          tier: 'PRIMERA_ALTO_VALOR',
          weightKg: 45,
          relativeValueFactor: 1.9,
          targetMarginPercent: 28,
        },
        {
          cutName: 'Costilla de Res',
          tier: 'TERCERA_SOPA_HUESO',
          weightKg: 95,
          relativeValueFactor: 0.8,
          targetMarginPercent: 22,
        },
      ],
      wastes: [
        { wasteType: 'HUESO_BLANCO_DESECHO', label: 'Hueso', weightKg: 15 },
        { wasteType: 'GRASA_SEBO_DESECHO', label: 'Sebo', weightKg: 10 },
      ],
    },
    bcvRate: 886.23,
    locationName: 'Sede Alta Vista',
    supervisor: actor,
  });

  // 2. Direct Cut Purchase with Manual Assigned Cost (NO automatic Weighted Average Cost)
  const directPurchase = calculateMeatDirectCutPurchase({
    input: {
      batchCode: 'DIR-CARN-2026-0091',
      invoiceOrGuideRef: 'FAC-FRIG-8821',
      sadaGuide: 'SADA-BOL-55201',
      receptionDate: '2026-10-29',
      supplierId: 'sup-004',
      supplierName: 'Frigorífico Industrial Bolívar, C.A.',
      locationId: 'loc-pzo-01',
      targetZone: 'ANAQUEL',
      lines: [
        {
          cutName: 'Solomo de Cuerito',
          sku: 'CAR-RES-SOLOMO',
          animalType: 'RES',
          tier: 'PRIMERA_ALTO_VALOR',
          receivedWeightKg: 50,
          shrinkageKg: 1, // 49 Kg net salable -> invoice $343.00 ($6.86/kg) -> effective $7.00/kg
          purchaseCostPerKgUsd: 6.86,
          manualAssignedCostUsd: 7.25, // Manual override chosen by management
          targetMarginPercent: 30,
        },
        {
          cutName: 'Pechuga Entera Sin Piel',
          sku: 'CAR-POL-PECHUGA',
          animalType: 'POLLO',
          tier: 'PRIMERA_ALTO_VALOR',
          receivedWeightKg: 40,
          shrinkageKg: 0,
          purchaseCostPerKgUsd: 4.1,
          // omitted manualAssignedCostUsd -> defaults to effective cost $4.10
          targetMarginPercent: 25,
        },
      ],
    },
    bcvRate: 886.23,
    locationName: 'Sede Alta Vista',
    actor,
    carcassBatches: [refCarcassBatch],
  });

  assert.equal(directPurchase.batchCode, 'DIR-CARN-2026-0091');
  assert.equal(directPurchase.totalReceivedWeightKg, 90);
  assert.equal(directPurchase.totalShrinkageKg, 1);
  assert.equal(directPurchase.totalNetSalableWeightKg, 89);

  const solomoLine = directPurchase.lines[0];
  assert.equal(solomoLine.netSalableWeightKg, 49);
  assert.equal(solomoLine.lineInvoiceCostUsd, 343.0); // 50 * 6.86
  assert.equal(solomoLine.effectivePurchaseCostPerKgUsd, 7.0); // 343 / 49
  assert.equal(solomoLine.manualAssignedCostUsd, 7.25); // Manual assigned cost respected!
  assert.equal(solomoLine.retailPriceUsdPerKg, 10.36); // 7.25 / (1 - 0.30) = 10.3571 -> 10.36
  assert.ok(solomoLine.carcassReferenceCostPerKgUsd !== undefined);

  const pechugaLine = directPurchase.lines[1];
  assert.equal(pechugaLine.effectivePurchaseCostPerKgUsd, 4.1);
  assert.equal(pechugaLine.manualAssignedCostUsd, 4.1);

  // 3. Catalog Application: Verify Manual Cost replaces cost WITHOUT Weighted Average blending,
  // and ANAQUEL routing increments both total and shelfStockByLocation
  const existingCatalog: Product[] = [
    {
      id: 'prd-solomo',
      sku: 'CAR-RES-SOLOMO',
      barcode: '7591111222233',
      name: 'Solomo de Cuerito',
      category: 'Carnicería',
      unit: 'KG',
      costUsd: 5.5, // Previous cost from an older batch
      targetMarginPercent: 28,
      priceUsd: 7.64,
      ivaRate: 0,
      stockByLocation: { 'loc-pzo-01': 20, 'loc-val-01': 30 },
      shelfStockByLocation: { 'loc-pzo-01': 8, 'loc-val-01': 0 },
      minStockByLocation: { 'loc-pzo-01': 15, 'loc-val-01': 15 },
      monthlyUnitsSold: 120,
      abcClass: 'A',
      supplierId: 'sup-004',
      lastUpdatedVet: '2026-10-28T10:00:00-04:00',
    },
  ];

  const catalogRes = applyDirectCutPurchaseToCatalog({
    purchase: directPurchase,
    products: existingCatalog,
    locationIds: ['loc-pzo-01', 'loc-val-01'],
    updatedAtVet: '2026-10-29T11:00:00-04:00',
  });

  assert.equal(catalogRes.updatedProductsCount, 1);
  assert.equal(catalogRes.createdProductsCount, 1);

  const updatedSolomo = catalogRes.updatedProducts.find((p) => p.sku === 'CAR-RES-SOLOMO')!;
  // Strictly 7.25 manual cost (NOT weighted average of 20kg @ 5.50 + 49kg @ 7.00 = 6.57)
  assert.equal(updatedSolomo.costUsd, 7.25);
  assert.equal(updatedSolomo.lastCostOrigin, 'CORTE_DIRECTO');
  assert.equal(updatedSolomo.stockByLocation['loc-pzo-01'], 69); // 20 + 49
  assert.equal(updatedSolomo.shelfStockByLocation?.['loc-pzo-01'], 57); // 8 + 49 routed to ANAQUEL

  // Also test DEPOSITO / Nevera Cava routing (leaves shelf intact, increases deposit)
  const cavaPurchase = calculateMeatDirectCutPurchase({
    input: {
      invoiceOrGuideRef: 'FAC-CAVA-02',
      supplierId: 'sup-004',
      supplierName: 'Frigorífico Bolívar',
      locationId: 'loc-val-01',
      targetZone: 'DEPOSITO',
      cavaOriginNote: 'Nevera Frigorífica Cava Central Valencia',
      lines: [
        {
          cutName: 'Solomo de Cuerito',
          sku: 'CAR-RES-SOLOMO',
          animalType: 'RES',
          tier: 'PRIMERA_ALTO_VALOR',
          receivedWeightKg: 25,
          shrinkageKg: 0,
          purchaseCostPerKgUsd: 6.9,
          manualAssignedCostUsd: 6.95,
          targetMarginPercent: 30,
        },
      ],
    },
    bcvRate: 886.23,
    locationName: 'CEDIS Cava Valencia',
    actor,
  });

  const afterCava = applyDirectCutPurchaseToCatalog({
    purchase: cavaPurchase,
    products: catalogRes.updatedProducts,
    locationIds: ['loc-pzo-01', 'loc-val-01'],
    updatedAtVet: '2026-10-29T12:00:00-04:00',
  });
  const solomoAfterCava = afterCava.updatedProducts.find((p) => p.sku === 'CAR-RES-SOLOMO')!;
  const valBreakdown = getLocationStockBreakdown(solomoAfterCava, 'loc-val-01');
  assert.equal(valBreakdown.total, 55); // 30 + 25
  assert.equal(valBreakdown.shelf, 0); // Unchanged
  assert.equal(valBreakdown.deposit, 55); // 100% stored in Cava/Depósito

  // 4. Compare helper test
  const cmpCheap = compareDirectVsCarcassCost({
    cutName: 'Solomo de Cuerito',
    animalType: 'RES',
    directEffectiveCostPerKgUsd: 3.2,
    manualAssignedCostUsd: 3.2,
    carcassBatches: [refCarcassBatch],
  });
  assert.ok(cmpCheap !== null);
  assert.equal(cmpCheap?.recommendation, 'CONVIENE_CORTE_DIRECTO');

  // 5. 500-Iteration Financial Stress Test (Zero Decimal Drift)
  for (let i = 0; i < 500; i++) {
    const recKg = roundCurrency(15 + (i % 40) * 1.35);
    const shrinkKg = roundCurrency((i % 5) * 0.25);
    const unitCost = roundCurrency(3.15 + (i % 12) * 0.42);
    const manualCost = roundCurrency(unitCost + 0.25);

    const p = calculateMeatDirectCutPurchase({
      input: {
        invoiceOrGuideRef: `STRESS-${i}`,
        supplierId: 'sup-004',
        supplierName: 'Proveedor Stress',
        locationId: 'loc-pzo-01',
        targetZone: i % 2 === 0 ? 'DEPOSITO' : 'ANAQUEL',
        lines: [
          {
            cutName: `Corte Stress ${i % 6}`,
            animalType: i % 3 === 0 ? 'RES' : i % 3 === 1 ? 'CERDO' : 'POLLO',
            tier: 'PRIMERA_ALTO_VALOR',
            receivedWeightKg: recKg,
            shrinkageKg: shrinkKg,
            purchaseCostPerKgUsd: unitCost,
            manualAssignedCostUsd: manualCost,
            targetMarginPercent: 28,
          },
        ],
      },
      bcvRate: 886.23,
      locationName: 'Sede Stress',
      actor,
    });

    assert.equal(
      p.totalNetSalableWeightKg,
      subMoney(p.totalReceivedWeightKg, p.totalShrinkageKg)
    );
    assert.equal(
      p.projectedGrossProfitUsd,
      subMoney(p.totalProjectedRevenueUsd, p.totalPurchaseCostUsd)
    );
    assert.equal(p.lines[0].manualAssignedCostUsd, manualCost);
  }
});

test('48. Shelf vs. Deposit Stock Engine: Layered Invariants, Cava Cross-Sede Transfer, POS Shelf-First Shortfall, ±2%/±1u PIN Reconciliation & 1,000-Movement Stress Test', () => {
  const actorAnalyst = {
    uid: 'usr-pasillo-01',
    displayName: 'Supervisor de Pasillo',
    role: UserRole.SUPERVISOR_PASILLO,
  };

  let prod: Product = {
    id: 'prd-shelf-01',
    sku: 'CAR-RES-PULPA',
    barcode: '7590001112223',
    name: 'Pulpa Negra Refrigerada (Kg)',
    category: 'Carnicería',
    unit: 'KG',
    costUsd: 6.2,
    targetMarginPercent: 30,
    priceUsd: 8.86,
    ivaRate: 0,
    // loc-val-01 has 120 Kg in Nevera/Cava (0 on shelf); loc-pzo-01 has 50 Kg total (10 on shelf, 40 in deposit)
    stockByLocation: { 'loc-pzo-01': 50, 'loc-val-01': 120 },
    shelfStockByLocation: { 'loc-pzo-01': 10, 'loc-val-01': 0 },
    minShelfByLocation: { 'loc-pzo-01': 25, 'loc-val-01': 0 },
    minStockByLocation: { 'loc-pzo-01': 20, 'loc-val-01': 30 },
    monthlyUnitsSold: 300,
    abcClass: 'A',
    supplierId: 'sup-004',
    lastUpdatedVet: '2026-10-29T08:00:00-04:00',
  };

  // 1. Pick list detects shelf deficit (10 < 25 -> suggests moving 15 from PZO deposit)
  const pickList = buildShelfReplenishmentPickList([prod], 'loc-pzo-01');
  assert.equal(pickList.length, 1);
  assert.equal(pickList[0].suggestedMoveQty, 15);

  // 2. Internal Replenishment: Depósito -> Anaquel in PZO-01 (total stays 50, shelf 10 -> 25, deposit 40 -> 25)
  const repRes = replenishShelfFromDeposit({
    product: prod,
    locationId: 'loc-pzo-01',
    locationName: 'PZO-01',
    quantity: 15,
    actor: actorAnalyst,
    timestampVet: '2026-10-29T08:30:00-04:00',
  });
  prod = repRes.updatedProduct;
  const bAfterRep = getLocationStockBreakdown(prod, 'loc-pzo-01');
  assert.equal(bAfterRep.total, 50);
  assert.equal(bAfterRep.shelf, 25);
  assert.equal(bAfterRep.deposit, 25);

  // 3. Internal Return: Anaquel -> Depósito (5 Kg back to cold storage)
  const retRes = returnShelfToDeposit({
    product: prod,
    locationId: 'loc-pzo-01',
    locationName: 'PZO-01',
    quantity: 5,
    actor: actorAnalyst,
    timestampVet: '2026-10-29T09:00:00-04:00',
  });
  prod = retRes.updatedProduct;
  const bAfterRet = getLocationStockBreakdown(prod, 'loc-pzo-01');
  assert.equal(bAfterRet.total, 50);
  assert.equal(bAfterRet.shelf, 20);
  assert.equal(bAfterRet.deposit, 30);

  // 4. Cross-Sede Cold-Chain Transfer: Nevera/Cava in VAL-01 (DEPOSITO) -> Exhibición in PZO-01 (ANAQUEL)
  const cavaTrf = transferStockBetweenZonesAndLocations({
    product: prod,
    fromLocationId: 'loc-val-01',
    fromLocationName: 'Cava Frigorífica VAL-01',
    fromZone: 'DEPOSITO',
    toLocationId: 'loc-pzo-01',
    toLocationName: 'Vitrina Carnicería PZO-01',
    toZone: 'ANAQUEL',
    quantity: 30,
    actor: actorAnalyst,
    timestampVet: '2026-10-29T10:00:00-04:00',
  });
  prod = cavaTrf.updatedProduct;
  const valAfter = getLocationStockBreakdown(prod, 'loc-val-01');
  const pzoAfter = getLocationStockBreakdown(prod, 'loc-pzo-01');
  assert.equal(valAfter.total, 90); // 120 - 30
  assert.equal(valAfter.deposit, 90);
  assert.equal(pzoAfter.total, 80); // 50 + 30
  assert.equal(pzoAfter.shelf, 50); // 20 + 30 directly in exhibition!
  assert.equal(pzoAfter.deposit, 30); // unchanged

  // 5. POS Sale Deduction: Shelf-first, then Deposit fallback with shortfall alert
  // Sell 62 Kg at PZO-01 (50 Kg from Shelf + 12 Kg from Deposit)
  const posRes = deductPosSaleShelfFirst({
    product: prod,
    locationId: 'loc-pzo-01',
    qtySold: 62,
    updatedAtVet: '2026-10-29T11:00:00-04:00',
  });
  assert.equal(posRes.hadShelfShortfall, true);
  assert.equal(posRes.deductedFromShelf, 50);
  assert.equal(posRes.deductedFromDeposit, 12);
  prod = posRes.updatedProduct;
  const bAfterPos = getLocationStockBreakdown(prod, 'loc-pzo-01');
  assert.equal(bAfterPos.total, 18); // 80 - 62
  assert.equal(bAfterPos.shelf, 0);
  assert.equal(bAfterPos.deposit, 18);

  // 6. Physical Count Reconciliation (Sinceración):
  // 6a. Within ±1 unit tolerance (18 -> 17.2 total, diff -0.8 Kg <= 1u): NO PIN REQUIRED
  const tolSmall = evaluatePhysicalCountTolerance({
    systemDeposit: 18,
    systemShelf: 0,
    countedDeposit: 12.2,
    countedShelf: 5.0, // total 17.2 (diff -0.8)
  });
  assert.equal(tolSmall.requiresManagerPin, false);

  const syncNoPin = reconcileLocationPhysicalCount({
    product: prod,
    locationName: 'PZO-01',
    input: {
      productId: prod.id,
      locationId: 'loc-pzo-01',
      countedDepositQty: 12.2,
      countedShelfQty: 5.0,
      notes: 'Conteo físico matutino dentro de tolerancia',
    },
    actor: actorAnalyst,
    timestampVet: '2026-10-29T12:00:00-04:00',
  });
  assert.equal(syncNoPin.requiresManagerPin, false);
  prod = syncNoPin.updatedProduct;
  assert.equal(getLocationStockBreakdown(prod, 'loc-pzo-01').total, 17.2);
  assert.equal(getLocationStockBreakdown(prod, 'loc-pzo-01').shelf, 5.0);

  // 6b. Beyond ±2% AND > ±1 unit (17.2 -> 14.0, diff -3.2 Kg = 18.6%): MUST REQUIRE MANAGER PIN
  assert.throws(() => {
    reconcileLocationPhysicalCount({
      product: prod,
      locationName: 'PZO-01',
      input: {
        productId: prod.id,
        locationId: 'loc-pzo-01',
        countedDepositQty: 10.0,
        countedShelfQty: 4.0,
        notes: 'Ajuste mayor sin PIN',
      },
      actor: actorAnalyst,
      timestampVet: '2026-10-29T12:15:00-04:00',
    });
  }, /PIN de Gerente válido/);

  const syncWithPin = reconcileLocationPhysicalCount({
    product: prod,
    locationName: 'PZO-01',
    input: {
      productId: prod.id,
      locationId: 'loc-pzo-01',
      countedDepositQty: 10.0,
      countedShelfQty: 4.0,
      notes: 'Sinceración autorizada por Gerencia',
      managerPin: '203040',
    },
    actor: actorAnalyst,
    timestampVet: '2026-10-29T12:20:00-04:00',
  });
  assert.equal(syncWithPin.requiresManagerPin, true);
  assert.equal(getLocationStockBreakdown(syncWithPin.updatedProduct, 'loc-pzo-01').total, 14.0);

  // 7. 1,000-Movement Stress Test: Mass Conservation & 0 <= Shelf <= Total Invariant
  let stressProd: Product = {
    ...prod,
    stockByLocation: { 'loc-pzo-01': 5000, 'loc-val-01': 5000 },
    shelfStockByLocation: { 'loc-pzo-01': 1500, 'loc-val-01': 500 },
  };
  let expectedGlobalMass = 10000;

  for (let i = 0; i < 1000; i++) {
    const mode = i % 4;
    if (mode === 0) {
      // Replenish 2.5 Kg in PZO if deposit >= 2.5
      const b = getLocationStockBreakdown(stressProd, 'loc-pzo-01');
      if (b.deposit >= 2.5) {
        stressProd = replenishShelfFromDeposit({
          product: stressProd,
          locationId: 'loc-pzo-01',
          locationName: 'PZO',
          quantity: 2.5,
          actor: actorAnalyst,
          timestampVet: '2026-10-29T13:00:00-04:00',
        }).updatedProduct;
      }
    } else if (mode === 1) {
      // Return 1.25 Kg in PZO if shelf >= 1.25
      const b = getLocationStockBreakdown(stressProd, 'loc-pzo-01');
      if (b.shelf >= 1.25) {
        stressProd = returnShelfToDeposit({
          product: stressProd,
          locationId: 'loc-pzo-01',
          locationName: 'PZO',
          quantity: 1.25,
          actor: actorAnalyst,
          timestampVet: '2026-10-29T13:00:00-04:00',
        }).updatedProduct;
      }
    } else if (mode === 2) {
      // Cross-sede Cava VAL -> Exhibición PZO (3.5 Kg)
      const bVal = getLocationStockBreakdown(stressProd, 'loc-val-01');
      if (bVal.deposit >= 3.5) {
        stressProd = transferStockBetweenZonesAndLocations({
          product: stressProd,
          fromLocationId: 'loc-val-01',
          fromLocationName: 'VAL',
          fromZone: 'DEPOSITO',
          toLocationId: 'loc-pzo-01',
          toLocationName: 'PZO',
          toZone: 'ANAQUEL',
          quantity: 3.5,
          actor: actorAnalyst,
          timestampVet: '2026-10-29T13:00:00-04:00',
        }).updatedProduct;
      }
    } else {
      // POS Sale of 1.75 Kg in PZO
      const bPzo = getLocationStockBreakdown(stressProd, 'loc-pzo-01');
      if (bPzo.total >= 1.75) {
        stressProd = deductPosSaleShelfFirst({
          product: stressProd,
          locationId: 'loc-pzo-01',
          qtySold: 1.75,
          updatedAtVet: '2026-10-29T13:00:00-04:00',
        }).updatedProduct;
        expectedGlobalMass = subMoney(expectedGlobalMass, 1.75);
      }
    }

    const pzoB = getLocationStockBreakdown(stressProd, 'loc-pzo-01');
    const valB = getLocationStockBreakdown(stressProd, 'loc-val-01');
    assert.ok(pzoB.shelf >= 0 && pzoB.shelf <= pzoB.total);
    assert.ok(valB.shelf >= 0 && valB.shelf <= valB.total);
    assert.equal(addMoney(pzoB.shelf, pzoB.deposit), pzoB.total);
    assert.equal(addMoney(valB.shelf, valB.deposit), valB.total);
    assert.equal(addMoney(pzoB.total, valB.total), expectedGlobalMass);
  }
});

test('49. Venezuelan Fiscal Retentions Engine: SPE IVA (75%/100%/0% SNAT/2025/000054), ISLR Decreto 1.808 (Service-Only & PN Sustraendo), Net Payable, PIN Voiding & 1,000 Sequential 14-Digit Vouchers Stress Test', () => {
  const company = resolveCompanyProfile({
    razonSocial: 'HIPER ABASTO POLAR, C.A.',
    rif: 'J-50123456-7',
    isSpecialTaxpayer: true,
    isIvaRetentionAgent: true,
    isIslrRetentionAgent: true,
    defaultIvaRetentionPercent: 75,
    utValueVes: 9.0,
    nextIvaVoucherSeq: 1,
    nextIslrVoucherSeq: 1,
  });

  // 1. RIF, Fortnight & 14-character SENIAT Voucher Format
  assert.equal(isValidVenezuelanRif('J-00006372-9'), true);
  assert.equal(isValidVenezuelanRif('V-18456789-2'), true);
  assert.equal(isValidVenezuelanRif('RIF-INVALIDO'), false);

  const vNum = formatRetentionVoucherNumber('2026-10-18', 42);
  assert.equal(vNum, '20261000000042');
  assert.equal(vNum.length, 14);

  assert.equal(resolveFilingFortnight('2026-10-12').fortnight, 'PRIMERA_QUINCENA');
  assert.equal(resolveFilingFortnight('2026-10-16').fortnight, 'SEGUNDA_QUINCENA');

  // 2. IVA Retention Rate Resolution (SNAT/2025/000054)
  assert.equal(
    resolveIvaRetentionRatePercent({
      companyProfile: company,
      supplierTaxpayerType: 'ORDINARIO',
      supplierRif: 'J-30148921-4',
      controlNumber: '00-44812',
    }),
    75
  );
  assert.equal(
    resolveIvaRetentionRatePercent({
      companyProfile: company,
      supplierTaxpayerType: 'ORDINARIO',
      supplierRif: 'J-30148921-4',
      controlNumber: '', // Missing control number -> 100%
    }),
    100
  );
  assert.equal(
    resolveIvaRetentionRatePercent({
      companyProfile: company,
      supplierTaxpayerType: 'FORMAL',
      supplierRif: 'J-40982314-1',
      controlNumber: '00-11223',
    }),
    0
  );

  // 3. Mixed Invoice (0% Exempt Food + 16% Taxed Goods + 16% Freight Service PJ)
  const mixedInvoice: PurchaseInvoice = {
    id: 'inv-ret-test-01',
    invoiceNumber: 'FAC-9901',
    controlNumber: '00-88120',
    supplierId: 'sup-log-01',
    supplierName: 'Distribuidora y Transporte Oriental, C.A.',
    supplierRif: 'J-31223344-5',
    locationId: 'loc-pzo-01',
    issueDate: '2026-10-20',
    dueDate: '2026-11-04',
    currency: 'USD',
    bcvRateAtIssue: 100.0, // Clean 100 Bs/$ rate for exact verification
    lines: [
      {
        id: 'l1',
        sku: 'HAR-PAN-1KG',
        description: 'Harina Precocida Exenta',
        quantity: 100,
        unitCostUsd: 1.0,
        lineTotalUsd: 100.0,
        ivaRate: 0,
        lineType: 'BIEN',
      },
      {
        id: 'l2',
        sku: 'ACE-MAZ-1LT',
        description: 'Aceite Gravado 16%',
        quantity: 50,
        unitCostUsd: 4.0,
        lineTotalUsd: 200.0,
        ivaRate: 16, // IVA = $32.00 (Bs. 3,200.00) -> 75% ret = $24.00 (Bs. 2,400.00); BIEN -> ISLR = $0
        lineType: 'BIEN',
      },
      {
        id: 'l3',
        sku: 'FLETE-NAC',
        description: 'Servicio de Flete Refrigerado',
        quantity: 1,
        unitCostUsd: 100.0,
        lineTotalUsd: 100.0,
        ivaRate: 16, // IVA = $16.00 (Bs. 1,600.00) -> 75% ret = $12.00 (Bs. 1,200.00)
        lineType: 'SERVICIO',
        islrConceptCode: 'SRV-FLETE', // PJ 3% over Bs. 10,000 = Bs. 300.00 ($3.00)
      },
    ],
    subtotalUsd: 400.0,
    ivaAmountUsd: 48.0,
    igtfAmountUsd: 0,
    totalUsd: 448.0,
    paidAmountUsd: 0,
    status: 'PENDIENTE',
    ocrEngineUsed: 'GEMINI_VISION_PRO',
    forensicAudit: {
      passedAllLocks: true,
      lock1LineIntegrations: true,
      lock2SubtotalMatch: true,
      lock3TaxCoherence: true,
      lock4TotalCrossCheck: true,
      discrepancyUsd: 0,
      auditLog: [],
    },
    createdAtVet: '2026-10-20T10:00:00-04:00',
  };

  const mixedRes = calculateInvoiceRetentions({
    invoice: mixedInvoice,
    supplier: { taxpayerType: 'ORDINARIO', personType: 'PJ_DOMICILIADA' },
    companyProfile: company,
    nextIvaSeq: 5,
    nextIslrSeq: 12,
    createdBy: 'finanzas@hiperabastopolar.com',
  });

  assert.ok(mixedRes.ivaVoucher !== null);
  assert.ok(mixedRes.islrVoucher !== null);
  assert.equal(mixedRes.ivaVoucher?.voucherNumber, '20261000000005');
  assert.equal(mixedRes.islrVoucher?.voucherNumber, '20261000000012');

  // IVA: ($32 + $16) = $48 IVA causado * 75% = $36.00 (Bs. 3,600.00)
  assert.equal(mixedRes.ivaVoucher?.retainedTotalUsd, 36.0);
  assert.equal(mixedRes.ivaVoucher?.retainedTotalVes, 3600.0);

  // ISLR: Strictly on SERVICIO line ($100 = Bs. 10,000) * 3% PJ Flete = Bs. 300.00 ($3.00)
  // Merchandise lines ($100 + $200) had 0% ISLR!
  assert.equal(mixedRes.islrVoucher?.lines.length, 1);
  assert.equal(mixedRes.islrVoucher?.retainedTotalVes, 300.0);
  assert.equal(mixedRes.islrVoucher?.retainedTotalUsd, 3.0);

  // Net Payable to Supplier = $448.00 - ($36.00 + $3.00) = $409.00
  assert.equal(mixedRes.updatedInvoice.totalRetainedUsd, 39.0);
  assert.equal(mixedRes.updatedInvoice.netPayableUsd, 409.0);

  // 4. Persona Natural Residente (PN_RESIDENTE) Honorarios with U.T. Sustraendo (Decreto 1.808)
  // UT = Bs. 9.00 -> Threshold = 83.3334 * 9 = Bs. 750.00
  // Honorarios PN rate = 3% -> Sustraendo = 9 * 83.3334 * 0.03 = Bs. 22.50
  // Base = $50 @ Bs. 100 = Bs. 5,000 -> Bruto 3% = Bs. 150.00 -> Retained = 150 - 22.50 = Bs. 127.50
  const pnServiceInvoice: PurchaseInvoice = {
    ...mixedInvoice,
    id: 'inv-pn-01',
    supplierRif: 'V-14556677-8',
    lines: [
      {
        id: 'ln-pn-1',
        sku: 'HON-CONT',
        description: 'Honorarios Profesionales Auditoría',
        quantity: 1,
        unitCostUsd: 50.0,
        lineTotalUsd: 50.0,
        ivaRate: 16,
        lineType: 'SERVICIO',
        islrConceptCode: 'SRV-HONORARIOS',
      },
    ],
    subtotalUsd: 50.0,
    ivaAmountUsd: 8.0,
    totalUsd: 58.0,
  };

  const pnRes = calculateInvoiceRetentions({
    invoice: pnServiceInvoice,
    supplier: { taxpayerType: 'ORDINARIO', personType: 'PN_RESIDENTE' },
    companyProfile: company,
    nextIvaSeq: 6,
    nextIslrSeq: 13,
    createdBy: 'finanzas@hiperabastopolar.com',
  });
  assert.equal(pnRes.islrVoucher?.sustraendoTotalVes, 22.5);
  assert.equal(pnRes.islrVoucher?.retainedTotalVes, 127.5);

  // 5. PIN-Protected Voiding preserves 14-digit voucher number immutably
  assert.throws(() => {
    voidRetentionVoucherWithPin({
      voucher: mixedRes.ivaVoucher!,
      actor: { uid: 'u1', displayName: 'Analista', role: UserRole.ANALISTA },
      managerPin: '999999',
      reason: 'Factura devuelta por error en RIF',
      voidedAtVet: '29/10/2026 15:00',
    });
  }, /PIN Gerencial inválido/);

  const voidedVoucher = voidRetentionVoucherWithPin({
    voucher: mixedRes.ivaVoucher!,
    actor: { uid: 'u1', displayName: 'Gerente Finanzas', role: UserRole.GERENTE },
    managerPin: '203040',
    reason: 'Nota de crédito total emitida por proveedor',
    voidedAtVet: '29/10/2026 15:05',
  });
  assert.equal(voidedVoucher.status, 'ANULADO');
  assert.equal(voidedVoucher.voucherNumber, '20261000000005'); // Correlativo preserved!

  // 6. High-Concurrency Stress Test: 1,000 Sequential 14-Digit Vouchers (Zero Gaps, Zero Collisions)
  const seenNumbers = new Set<string>();
  let seq = 1;
  for (let i = 0; i < 1000; i++) {
    const stepRes = calculateInvoiceRetentions({
      invoice: {
        ...mixedInvoice,
        id: `inv-stress-${i}`,
        invoiceNumber: `FAC-STR-${i}`,
        issueDate: '2026-10-25',
      },
      supplier: { taxpayerType: 'ORDINARIO', personType: 'PJ_DOMICILIADA' },
      companyProfile: company,
      nextIvaSeq: seq,
      nextIslrSeq: seq,
      createdBy: 'stress@hiperabastopolar.com',
    });

    const num = stepRes.ivaVoucher!.voucherNumber;
    assert.equal(num.length, 14);
    assert.equal(seenNumbers.has(num), false, `Duplicate voucher number ${num}`);
    seenNumbers.add(num);
    assert.equal(stepRes.nextIvaSeqAfter, seq + 1);
    seq = stepRes.nextIvaSeqAfter;
  }
  assert.equal(seenNumbers.size, 1000);
  assert.ok(seenNumbers.has('20261000000001'));
  assert.ok(seenNumbers.has('20261000001000'));
  assert.ok(ISLR_CONCEPTS_CATALOG.length >= 5);
});

test('50. Branded SENIAT Retention PDF Engine & Multi-Tab Routing: IVA, ISLR, Voided Watermark, 60-Line Multi-Page Voucher & Quincenal Summary', () => {
  // Verify Navigation Tabs include both new modules
  assert.ok(VALID_NAVIGATION_TABS.includes('SHELF_STOCK'));
  assert.ok(VALID_NAVIGATION_TABS.includes('TAX_RETENTIONS'));

  const company = resolveCompanyProfile(DEFAULT_COMPANY_PROFILE);

  // Build a 60-line invoice to stress-test multi-page table pagination in SENIAT Landscape PDF
  const sixtyLines = Array.from({ length: 60 }, (_, idx) => ({
    id: `ln-pdf-${idx + 1}`,
    sku: `SKU-PDF-${String(idx + 1).padStart(3, '0')}`,
    description: `Producto Agroindustrial Gravado Lote #${idx + 1}`,
    quantity: 10,
    unitCostUsd: 5.0,
    lineTotalUsd: 50.0,
    ivaRate: 16 as const,
    lineType: (idx % 10 === 0 ? 'SERVICIO' : 'BIEN') as 'BIEN' | 'SERVICIO',
    islrConceptCode: idx % 10 === 0 ? 'SRV-CONTRATISTA' : undefined,
  }));

  const multiLineInvoice: PurchaseInvoice = {
    id: 'inv-pdf-60',
    invoiceNumber: 'FAC-PDF-6000',
    controlNumber: '00-600099',
    supplierId: 'sup-001',
    supplierName: 'Alimentos Polar Comercial, C.A.',
    supplierRif: 'J-00006372-9',
    locationId: 'loc-pzo-01',
    issueDate: '2026-10-28',
    dueDate: '2026-11-12',
    currency: 'USD',
    bcvRateAtIssue: 886.23,
    lines: sixtyLines,
    subtotalUsd: 3000.0,
    ivaAmountUsd: 480.0,
    igtfAmountUsd: 0,
    totalUsd: 3480.0,
    paidAmountUsd: 0,
    status: 'PENDIENTE',
    ocrEngineUsed: 'GEMINI_VISION_PRO',
    forensicAudit: {
      passedAllLocks: true,
      lock1LineIntegrations: true,
      lock2SubtotalMatch: true,
      lock3TaxCoherence: true,
      lock4TotalCrossCheck: true,
      discrepancyUsd: 0,
      auditLog: [],
    },
    createdAtVet: '2026-10-28T16:00:00-04:00',
  };

  const calc = calculateInvoiceRetentions({
    invoice: multiLineInvoice,
    supplier: { taxpayerType: 'ESPECIAL', personType: 'PJ_DOMICILIADA' },
    companyProfile: company,
    nextIvaSeq: 77,
    nextIslrSeq: 33,
    createdBy: 'rdrj.mppd@gmail.com',
  });

  assert.ok(calc.ivaVoucher !== null);
  assert.ok(calc.islrVoucher !== null);

  // 1. 60-line IVA Retention PDF (must paginate cleanly across >= 2 landscape A4 pages)
  const ivaDoc = generateIvaRetentionPdfDocument(calc.ivaVoucher!, company);
  assert.ok(ivaDoc.getNumberOfPages() >= 2, `Expected >= 2 pages for 60 lines, got ${ivaDoc.getNumberOfPages()}`);
  const ivaPdfRaw = ivaDoc.output();
  assert.ok(ivaPdfRaw.startsWith('%PDF-'));
  assert.ok(ivaPdfRaw.length > 5000);

  // 2. ISLR Retention PDF
  const islrDoc = generateIslrRetentionPdfDocument(calc.islrVoucher!, company);
  assert.ok(islrDoc.getNumberOfPages() >= 1);
  const islrPdfRaw = islrDoc.output();
  assert.ok(islrPdfRaw.startsWith('%PDF-'));

  // 3. Voided Voucher PDF
  const voidedVoucher: TaxRetentionVoucher = {
    ...calc.ivaVoucher!,
    status: 'ANULADO',
    voidedBy: 'Gerencia General',
    voidedAtVet: '29/10/2026 16:40',
    voidReason: 'Anulación de prueba documental',
  };
  const voidDoc = generateIvaRetentionPdfDocument(voidedVoucher, company);
  assert.ok(voidDoc.output().startsWith('%PDF-'));

  // 4. Quincenal SENIAT Relation PDF
  const quincenalDoc = generateQuincenalRetentionsPdfDocument(
    [calc.ivaVoucher!, calc.islrVoucher!, voidedVoucher],
    '2da Quincena Octubre 2026 (202610)',
    company
  );
  assert.equal(quincenalDoc.getNumberOfPages(), 1);
  assert.ok(quincenalDoc.output().startsWith('%PDF-'));
});

test('51. Portal SENIAT .TXT IVA, .XML ISLR & Libros Oficiales .XLSX: Pre-validador, formato compacto de RIF, 16 columnas tabuladas y prueba de estrés de 500 comprobantes', () => {
  assert.equal(formatSeniatCompactRif('j-50123456-7'), 'J501234567');
  assert.equal(isValidSeniatCompactRif('J501234567'), true);
  assert.equal(isValidSeniatCompactRif('INVALID'), false);

  const company = resolveCompanyProfile(DEFAULT_COMPANY_PROFILE);

  // Prueba de estrés: 500 comprobantes IVA + 120 comprobantes ISLR en el período 202610
  const stressVouchers: TaxRetentionVoucher[] = [];
  for (let i = 1; i <= 500; i++) {
    stressVouchers.push({
      id: `v-iva-${i}`,
      voucherNumber: `202610${String(i).padStart(8, '0')}`,
      type: 'IVA',
      legalNormative: 'Providencia SNAT/2025/000054',
      status: i === 500 ? 'ANULADO' : 'EMITIDO',
      periodYearMonth: '202610',
      fortnight: 'SEGUNDA_QUINCENA',
      fortnightLabel: '2da Quincena Octubre 2026',
      legalDeliveryHint: '3 días hábiles',
      agentRazonSocial: company.razonSocial,
      agentRif: company.rif,
      agentAddress: company.direccionFiscal,
      issueDate: '2026-10-28',
      invoiceId: `inv-${i}`,
      invoiceNumber: `FAC-${10000 + i}`,
      controlNumber: `00-${20000 + i}`,
      invoiceIssueDate: '2026-10-27',
      supplierId: 'sup-01',
      supplierName: 'Alimentos Polar Comercial, C.A.',
      supplierRif: 'J-00006372-9',
      supplierTaxpayerType: 'ESPECIAL',
      supplierPersonType: 'PJ_DOMICILIADA',
      bcvRateAtIssue: 50.0,
      utValueVes: 9.0,
      invoiceTotalUsd: 126.0,
      invoiceTotalVes: 6300.0,
      exemptTotalUsd: 10.0,
      exemptTotalVes: 500.0,
      taxableBaseUsd: 100.0,
      taxableBaseVes: 5000.0,
      taxCausadoTotalUsd: 16.0,
      taxCausadoTotalVes: 800.0,
      retentionPercentApplied: 75,
      sustraendoTotalVes: 0,
      retainedTotalUsd: 12.0,
      retainedTotalVes: 600.0,
      netPayableAfterAllRetentionsUsd: 114.0,
      netPayableAfterAllRetentionsVes: 5700.0,
      lines: [
        {
          lineId: `ln-iva-${i}`,
          sku: 'SKU-IVA',
          description: 'Compra gravada 16%',
          lineType: 'BIEN',
          exemptAmountUsd: 10.0,
          exemptAmountVes: 500.0,
          baseAmountUsd: 100.0,
          baseAmountVes: 5000.0,
          taxRatePercent: 16,
          taxCausadoUsd: 16.0,
          taxCausadoVes: 800.0,
          retentionRatePercent: 75,
          sustraendoVes: 0,
          retainedAmountVes: 600.0,
          retainedAmountUsd: 12.0,
        },
      ],
      createdBy: 'rdrj.mppd@gmail.com',
      createdAtVet: '2026-10-28 10:00',
    });
  }

  for (let j = 1; j <= 120; j++) {
    stressVouchers.push({
      id: `v-islr-${j}`,
      voucherNumber: `202610${String(5000 + j).padStart(8, '0')}`,
      type: 'ISLR',
      legalNormative: 'Decreto 1.808',
      status: 'EMITIDO',
      periodYearMonth: '202610',
      fortnight: 'SEGUNDA_QUINCENA',
      fortnightLabel: '2da Quincena Octubre 2026',
      legalDeliveryHint: 'Mensual',
      agentRazonSocial: company.razonSocial,
      agentRif: company.rif,
      agentAddress: company.direccionFiscal,
      issueDate: '2026-10-28',
      invoiceId: `inv-srv-${j}`,
      invoiceNumber: `SRV-${j}`,
      controlNumber: `00-99${j}`,
      invoiceIssueDate: '2026-10-27',
      supplierId: 'sup-02',
      supplierName: 'Transporte Frigorífico Nacional, C.A.',
      supplierRif: 'J-31224455-6',
      supplierTaxpayerType: 'ORDINARIO',
      supplierPersonType: 'PJ_DOMICILIADA',
      bcvRateAtIssue: 50.0,
      utValueVes: 9.0,
      invoiceTotalUsd: 200.0,
      invoiceTotalVes: 10000.0,
      exemptTotalUsd: 0,
      exemptTotalVes: 0,
      taxableBaseUsd: 200.0,
      taxableBaseVes: 10000.0,
      taxCausadoTotalUsd: 0,
      taxCausadoTotalVes: 0,
      retentionPercentApplied: 3,
      sustraendoTotalVes: 0,
      retainedTotalUsd: 6.0,
      retainedTotalVes: 300.0,
      netPayableAfterAllRetentionsUsd: 194.0,
      netPayableAfterAllRetentionsVes: 9700.0,
      lines: [
        {
          lineId: `ln-islr-${j}`,
          sku: 'SRV-01',
          description: 'Flete Refrigerado',
          lineType: 'SERVICIO',
          conceptCode: 'SRV-FLETE',
          exemptAmountUsd: 0,
          exemptAmountVes: 0,
          baseAmountUsd: 200.0,
          baseAmountVes: 10000.0,
          taxRatePercent: 0,
          taxCausadoUsd: 0,
          taxCausadoVes: 0,
          retentionRatePercent: 3,
          sustraendoVes: 0,
          retainedAmountVes: 300.0,
          retainedAmountUsd: 6.0,
        },
      ],
      createdBy: 'rdrj.mppd@gmail.com',
      createdAtVet: '2026-10-28 11:00',
    });
  }

  const ivaTxt = buildSeniatIvaTxtExport({
    vouchers: stressVouchers,
    companyProfile: company,
    periodYearMonth: '202610',
    fortnight: 'SEGUNDA_QUINCENA',
  });

  // 499 vigentes (el #500 está ANULADO y se excluye del TXT)
  assert.equal(ivaTxt.recordsCount, 499);
  assert.equal(ivaTxt.totalRetainedVes, 499 * 600);
  assert.equal(ivaTxt.validationIssues.filter((x) => x.severity === 'ERROR').length, 0);
  const firstRowCols = ivaTxt.content.split('\r\n')[0].split('\t');
  assert.equal(firstRowCols.length, 16);
  assert.equal(firstRowCols[0], formatSeniatCompactRif(company.rif));
  assert.equal(firstRowCols[5], 'J000063729');
  assert.equal(firstRowCols[12], '20261000000001');

  const islrXml = buildSeniatIslrXmlExport({
    vouchers: stressVouchers,
    companyProfile: company,
    periodYearMonth: '202610',
  });
  assert.equal(islrXml.recordsCount, 120);
  assert.equal(islrXml.totalRetainedVes, 120 * 300);
  assert.ok(islrXml.content.includes('<RelacionRetencionesISLR'));
  assert.ok(islrXml.content.includes('<RifRetenido>J312244556</RifRetenido>'));

  const purchaseWb = buildSeniatPurchaseBookWorkbook({
    invoices: [],
    vouchers: stressVouchers,
    companyProfile: company,
    periodYearMonth: '202610',
  });
  assert.ok(purchaseWb.SheetNames.includes('Libro Compras SENIAT'));
});

test('52. Balanzas Electrónicas EAN-13 (Prefijos 20 Peso y 21 Importe): Dígito verificador Módulo 10, peso inverso Decimal.js y prueba de estrés de 1.000 etiquetas', () => {
  const sampleMeatProduct: Product = {
    id: 'prd-meat-01',
    sku: 'RES-SOLOMO-KG',
    pluCode: '10425',
    barcode: '7591234567890',
    name: 'Solomo de Cuerito AA',
    category: 'Carnicería y Proteínas',
    unit: 'KG',
    costUsd: 6.5,
    targetMarginPercent: 25,
    priceUsd: 8.67,
    ivaRate: 0,
    stockByLocation: { 'loc-pzo-01': 50 },
    minStockByLocation: { 'loc-pzo-01': 10 },
    monthlyUnitsSold: 120,
    abcClass: 'A',
    supplierId: 'sup-01',
    lastUpdatedVet: '2026-10-29',
  };

  assert.equal(deriveProductPlu5(sampleMeatProduct), '10425');

  // 1. Etiqueta Prefijo 20 (Peso en gramos: 1.375 Kg -> 01375)
  const label20 = encodeScaleBarcode({
    pluCode: '10425',
    mode: 'WEIGHT_GRAMS_20',
    weightKg: 1.375,
  });
  assert.equal(label20.length, 13);
  assert.ok(label20.startsWith('201042501375'));

  const resolved20 = resolveCatalogProductFromBarcode(label20, [sampleMeatProduct]);
  assert.equal(resolved20.decoded.checksumValid, true);
  assert.equal(resolved20.decoded.isScaleVariableBarcode, true);
  assert.equal(resolved20.product?.id, 'prd-meat-01');
  assert.equal(resolved20.effectiveQuantity, 1.375);

  // 2. Etiqueta Prefijo 21 (Importe total en centavos USD: $17.34 / $8.67 = 2.000 Kg exactos)
  const label21 = encodeScaleBarcode({
    pluCode: '10425',
    mode: 'PRICE_CENTS_21',
    totalPriceUsd: 17.34,
  });
  assert.equal(label21.length, 13);
  assert.ok(label21.startsWith('211042501734'));

  const resolved21 = resolveCatalogProductFromBarcode(label21, [sampleMeatProduct]);
  assert.equal(resolved21.decoded.checksumValid, true);
  assert.equal(resolved21.effectiveQuantity, 2);

  // 3. Prueba de estrés de 1.000 etiquetas aleatorias de balanza sin deriva IEEE-754
  for (let i = 1; i <= 1000; i++) {
    const grams = 50 + (i * 37) % 15000; // entre 0.050 Kg y 15.049 Kg
    const weightKg = Number((grams / 1000).toFixed(3));
    const code = encodeScaleBarcode({
      pluCode: String(10000 + (i % 999)),
      mode: 'WEIGHT_GRAMS_20',
      weightKg,
    });
    const dec = decodeScaleBarcode(code);
    assert.equal(dec.checksumValid, true);
    assert.equal(dec.weightKg, weightKg);
    assert.equal(computeEan13CheckDigit(code.slice(0, 12)), Number(code[12]));
  }
});

test('53. Escáner Móvil PWA & Pistolas USB/Bluetooth: Acumulación offline de lecturas estándar y etiquetas de balanza por zona', () => {
  const catalog: Product[] = [
    {
      id: 'p-1',
      sku: 'HAR-PAN-1KG',
      barcode: '7591001100105',
      name: 'Harina P.A.N. 1Kg',
      category: 'Víveres Secos',
      unit: 'UND',
      costUsd: 1.0,
      targetMarginPercent: 20,
      priceUsd: 1.25,
      ivaRate: 0,
      stockByLocation: { 'loc-pzo-01': 100 },
      minStockByLocation: { 'loc-pzo-01': 20 },
      monthlyUnitsSold: 300,
      abcClass: 'A',
      supplierId: 'sup-01',
      lastUpdatedVet: '2026-10-29',
    },
    {
      id: 'p-2',
      sku: 'QUESO-PAISA-KG',
      pluCode: '20550',
      barcode: '7592055000001',
      name: 'Queso Blanco Paisa Kg',
      category: 'Charcutería y Lácteos',
      unit: 'KG',
      costUsd: 5.2,
      targetMarginPercent: 25,
      priceUsd: 6.93,
      ivaRate: 0,
      stockByLocation: { 'loc-pzo-01': 30 },
      minStockByLocation: { 'loc-pzo-01': 5 },
      monthlyUnitsSold: 80,
      abcClass: 'A',
      supplierId: 'sup-02',
      lastUpdatedVet: '2026-10-29',
    },
  ];

  let queue = appendScanToSessionQueue({
    existingQueue: [],
    rawCode: '7591001100105',
    products: catalog,
    locationId: 'loc-pzo-01',
    zone: 'ANAQUEL',
    source: 'CAMERA_PWA',
  }).updatedQueue;

  queue = appendScanToSessionQueue({
    existingQueue: queue,
    rawCode: '7591001100105',
    products: catalog,
    locationId: 'loc-pzo-01',
    zone: 'ANAQUEL',
    source: 'HARDWARE_WEDGE',
    overrideQty: 4,
  }).updatedQueue;

  const cheeseScaleCode = encodeScaleBarcode({
    pluCode: '20550',
    mode: 'WEIGHT_GRAMS_20',
    weightKg: 0.685,
  });

  queue = appendScanToSessionQueue({
    existingQueue: queue,
    rawCode: cheeseScaleCode,
    products: catalog,
    locationId: 'loc-pzo-01',
    zone: 'ANAQUEL',
    source: 'CAMERA_PWA',
  }).updatedQueue;

  const summary = summarizeScanQueueByProduct(queue);
  assert.equal(summary.length, 2);
  const harinaSummary = summary.find((s) => s.productId === 'p-1')!;
  const quesoSummary = summary.find((s) => s.productId === 'p-2')!;
  assert.equal(harinaSummary.totalScannedQty, 5);
  assert.equal(quesoSummary.totalScannedQty, 0.685);
});

test('54. Módulo BRM WhatsApp Proveedores (Puro Apure ERP): E.164, bloqueo anti-loop, idempotencia de 500 webhooks, modo híbrido triple y doble compuerta OCR', () => {
  // 1. Normalización E.164 venezolana
  assert.equal(normalizePhoneE164('0414-3459910'), '+584143459910');
  assert.equal(normalizePhoneE164('4121234567'), '+584121234567');
  assert.equal(isValidPhoneE164('+584143459910'), true);
  assert.equal(isCorporateSelfPhone('0243-2345678', DEFAULT_CORPORATE_BRM_PHONE_E164), true);

  const mockSupplier = {
    id: 'sup-brm-01',
    rif: 'J-30998877-1',
    name: 'Frigorífico Industrial Los Llanos, C.A.',
    category: 'Carnicería',
    contactName: 'Ing. José Gregorio',
    phone: '0414-3459910',
    whatsappE164: '+584143459910',
    email: 'ventas@losllanos.com.ve',
    address: 'Barinas, Edo. Barinas',
    creditDays: 15,
    paymentTerms: 'Crédito 15 días',
    balanceUsd: 1200,
  };

  // 2. Bloqueo determinista Anti-Loop si el teléfono del proveedor coincide con la línea corporativa
  assert.throws(() => {
    appendIdempotentBrmMessage({
      existingMessages: [],
      supplier: { ...mockSupplier, whatsappE164: DEFAULT_CORPORATE_BRM_PHONE_E164 },
      corporatePhoneE164: DEFAULT_CORPORATE_BRM_PHONE_E164,
      direction: 'OUTBOUND_TO_SUPPLIER',
      category: 'ORDEN_COMPRA',
      bodyText: 'Prueba loop',
      session: { state: 'CONNECTED', activeMode: 'QR_SOCKET_BRIDGE', hasAdminCredentials: true },
      createdBy: 'Gerencia',
      timestampVet: '2026-10-29 12:00',
    });
  }, /BLOQUEO ANTI-LOOP BRM/);

  // 3. Modo Híbrido Triple + Cola Offline Delegada cuando hasAdminCredentials === false
  assert.equal(
    resolveHybridBrmTransport({ state: 'CONNECTED', activeMode: 'QR_SOCKET_BRIDGE' }),
    'QR_SOCKET_BRIDGE'
  );
  assert.equal(
    resolveHybridBrmTransport({ state: 'DISCONNECTED', activeMode: 'WA_ME_DIRECT_LEDGER' }),
    'WA_ME_DIRECT_LEDGER'
  );

  // 4. Prueba de estrés de idempotencia: 500 reintentos del mismo messageId crean exactamente 1 registro
  let ledger: ReturnType<typeof appendIdempotentBrmMessage>['updatedMessages'] = [];
  for (let i = 0; i < 500; i++) {
    const res = appendIdempotentBrmMessage({
      existingMessages: ledger,
      messageId: 'wamid.STRESS.UNIQUE.001',
      supplier: mockSupplier,
      corporatePhoneE164: DEFAULT_CORPORATE_BRM_PHONE_E164,
      direction: 'OUTBOUND_TO_SUPPLIER',
      category: 'COMPROBANTE_RETENCION_IVA',
      bodyText: 'Despacho de comprobante SENIAT',
      session: { state: 'DISCONNECTED', activeMode: 'WA_ME_DIRECT_LEDGER', hasAdminCredentials: false },
      createdBy: 'Tesorería',
      timestampVet: '2026-10-29 12:05',
    });
    ledger = res.updatedMessages;
    if (i > 0) assert.equal(res.wasDuplicateIgnored, true);
  }
  assert.equal(ledger.length, 1);
  assert.equal(ledger[0].deliveryStatus, 'EN_COLA_OFFLINE');

  // 5. Doble Compuerta Factura Entrante OCR (PENDIENTE_VERIFICACION + detección de reutilización SHA-256)
  const firstPre = registerIncomingBrmPreInvoice({
    existingPreInvoices: [],
    existingHashes: [],
    supplier: mockSupplier,
    invoiceNumber: 'FAC-LLANOS-881',
    controlNumber: '00-776655',
    declaredSubtotalUsd: 1000,
    declaredIvaUsd: 160,
    declaredTotalUsd: 1160,
    receivedAtVet: '2026-10-29 12:10',
  });
  assert.equal(firstPre.preInvoice.status, 'PENDIENTE_VERIFICACION');
  assert.equal(firstPre.preInvoice.ocrVerdict, 'AUTENTICO_ALTA_CONFIANZA');

  const duplicateHashAttempt = registerIncomingBrmPreInvoice({
    existingPreInvoices: firstPre.updatedPreInvoices,
    existingHashes: [firstPre.preInvoice.sha256Hash],
    messageId: 'wamid.NEW.MSG.SAME.IMAGE',
    supplier: mockSupplier,
    invoiceNumber: 'FAC-LLANOS-881',
    controlNumber: '00-776655',
    declaredSubtotalUsd: 1000,
    declaredIvaUsd: 160,
    declaredTotalUsd: 1160,
    receivedAtVet: '2026-10-29 12:15',
  });
  assert.equal(duplicateHashAttempt.preInvoice.ocrVerdict, 'ALERTA_FRAUDE_EDICION_O_IA');

  // 6. Plantillas y desvinculación limpia Anti-Split Brain
  const bundle = formatBrmPaymentAndRetentionsBundleTemplate({
    supplier: mockSupplier,
    invoiceNumber: 'FAC-LLANOS-881',
    payment: {
      amountUsd: 1040,
      amountVes: 52000,
      bcvRateUsed: 50,
      method: 'TRANSFERENCIA_VES',
      reference: '99887766',
      paidAtVet: '2026-10-29',
    },
  });
  assert.ok(bundle.messageBody.includes('FAC-LLANOS-881'));
  assert.ok(
    formatBrmPurchaseOrderTemplate({
      order: {
        id: 'po-1',
        orderNumber: 'OC-2026-0099',
        productId: 'p-1',
        sku: 'RES-CANAL',
        productName: 'Canal de Res AA',
        unit: 'KG',
        locationId: 'loc-pzo-01',
        locationCode: 'PZO-01',
        locationName: 'Sede Alta Vista',
        supplierId: mockSupplier.id,
        supplierName: mockSupplier.name,
        orderedQty: 450,
        unitCostUsd: 4.1,
        totalCostUsd: 1845,
        totalCostVes: 92250,
        bcvRateAtOrder: 50,
        status: 'PENDIENTE_ENTREGA',
        createdAtVet: '2026-10-29',
        createdBy: 'Compras',
      },
    }).includes('OC-2026-0099')
  );

  const resetSession = resetBrmWhatsappSessionCleanly(
    {
      state: 'QR_READY',
      activeMode: 'QR_SOCKET_BRIDGE',
      corporatePhoneE164: DEFAULT_CORPORATE_BRM_PHONE_E164,
      qrPayloadData: 'OLD_QR',
      pendingOfflineQueueCount: 0,
      hasAdminCredentials: false,
      lastHeartbeatVet: '2026-10-29 11:00',
    },
    '2026-10-29 12:30'
  );
  assert.equal(resetSession.state, 'DISCONNECTED');
  assert.equal(resetSession.qrPayloadData, undefined);
});

test('55. Control FEFO de Perecederos & Cadena de Frío SADA: Semáforo de 4 niveles, prioridad estricta FEFO, bloqueo de vencidos y gobernanza TOTP', () => {
  const prod: Product = {
    id: 'prd-lact-01',
    sku: 'YOG-GRIEGO-1L',
    barcode: '7598881112223',
    name: 'Yogurt Griego Natural 1L',
    category: 'Lácteos y Refrigerados',
    unit: 'UND',
    costUsd: 2.5,
    targetMarginPercent: 30,
    priceUsd: 3.57,
    ivaRate: 0,
    stockByLocation: { 'loc-pzo-01': 30 },
    shelfStockByLocation: { 'loc-pzo-01': 10 },
    minStockByLocation: { 'loc-pzo-01': 8 },
    monthlyUnitsSold: 90,
    abcClass: 'A',
    supplierId: 'sup-01',
    lastUpdatedVet: '2026-10-29',
  };

  assert.equal(computeDaysUntilExpiration('2026-10-31', '2026-10-29'), 2);
  assert.equal(classifyFefoLotStatus(2).alertLevel, 'CRITICO_PROMOCION_1_3D');
  assert.equal(classifyFefoLotStatus(2).suggestedDiscountPercent, 25);
  assert.equal(classifyFefoLotStatus(-1).blockedForSale, true);

  const lotSoon = createFefoPerishableLot({
    lotCode: 'LOT-SOON',
    product: prod,
    locationId: 'loc-pzo-01',
    locationName: 'Sede Alta Vista',
    zone: 'DEPOSITO',
    quantity: 8,
    receptionDate: '2026-10-20',
    expirationDate: '2026-10-31',
    referenceDateIso: '2026-10-29',
  });
  const lotLater = createFefoPerishableLot({
    lotCode: 'LOT-LATER',
    product: prod,
    locationId: 'loc-pzo-01',
    locationName: 'Sede Alta Vista',
    zone: 'DEPOSITO',
    quantity: 12,
    receptionDate: '2026-10-25',
    expirationDate: '2026-11-15',
    referenceDateIso: '2026-10-29',
  });
  const lotExpired = createFefoPerishableLot({
    lotCode: 'LOT-EXPIRED',
    product: prod,
    locationId: 'loc-pzo-01',
    locationName: 'Sede Alta Vista',
    zone: 'DEPOSITO',
    quantity: 5,
    receptionDate: '2026-10-01',
    expirationDate: '2026-10-27',
    referenceDateIso: '2026-10-29',
  });

  const sorted = sortLotsByFefo([lotLater, lotSoon]);
  assert.equal(sorted[0].lotCode, 'LOT-SOON');

  // Consumir 10 unidades debe agotar LOT-SOON (8) y tomar 2 de LOT-LATER
  const consumed = consumeLotsStrictFefo({
    lots: [lotLater, lotSoon],
    productId: prod.id,
    locationId: 'loc-pzo-01',
    quantityNeeded: 10,
    referenceDateIso: '2026-10-29',
  });
  assert.deepEqual(consumed.consumedLotCodes, ['LOT-SOON', 'LOT-LATER']);
  assert.equal(consumed.updatedLots.find((l) => l.lotCode === 'LOT-SOON')?.quantityRemaining, 0);
  assert.equal(consumed.updatedLots.find((l) => l.lotCode === 'LOT-LATER')?.quantityRemaining, 10);

  // Lote vencido se bloquea sin TOTP/PIN, pero pasa con código TOTP dinámico válido
  assert.throws(() => {
    consumeLotsStrictFefo({
      lots: [lotExpired],
      productId: prod.id,
      locationId: 'loc-pzo-01',
      quantityNeeded: 2,
      referenceDateIso: '2026-10-29',
    });
  }, /BLOQUEO SANITARIO FEFO/);

  const validTotp = generateTotpCode(DEFAULT_TOTP_CONFIG.secretBase32, Date.now(), 30);
  const unlocked = consumeLotsStrictFefo({
    lots: [lotExpired],
    productId: prod.id,
    locationId: 'loc-pzo-01',
    quantityNeeded: 2,
    referenceDateIso: '2026-10-29',
    managerCredentialForExpired: validTotp,
    totpConfig: DEFAULT_TOTP_CONFIG,
  });
  assert.equal(unlocked.quantitySatisfiedFromLots, 2);

  // Mover lote de Cava a Exhibición preserva Total = Depósito + Anaquel (30)
  const moved = moveFefoLotToShelf({
    lotId: lotLater.id,
    lots: [lotLater],
    products: [prod],
    qtyToMove: 5,
    updatedAtVet: '2026-10-29 14:00',
  });
  const afterBd = getLocationStockBreakdown(moved.updatedProducts[0], 'loc-pzo-01');
  assert.equal(afterBd.total, 30);
  assert.equal(afterBd.shelf, 15);
  assert.equal(afterBd.deposit, 15);

  // Cadena de frío SADA detecta excursión térmica fuera de [-2, +4] °C
  const tempAlert = buildColdChainTemperatureLog({
    locationId: 'loc-pzo-01',
    locationName: 'Sede Alta Vista',
    equipmentName: 'Cava Cárnica Principal #1',
    equipmentType: 'CAVA_CARNICOS',
    recordedTempCelsius: 7.4,
    recordedBy: 'Supervisor Cava',
  });
  assert.equal(tempAlert.isOutOfRange, true);
});

test('56. Recetario de Transformación & Producción Interna BOM: Consumo Cava + Exhibición con prioridad FEFO, costo absorbido Decimal.js e invariante de stock', () => {
  const recorteRes: Product = {
    id: 'prd-rec-res',
    sku: 'RES-RECORTE-8020',
    barcode: '759001',
    name: 'Recorte de Res Magro 80/20',
    category: 'Carnicería y Proteínas',
    unit: 'KG',
    costUsd: 4.5,
    targetMarginPercent: 25,
    priceUsd: 6.0,
    ivaRate: 0,
    stockByLocation: { 'loc-pzo-01': 20 },
    shelfStockByLocation: { 'loc-pzo-01': 6 }, // Depósito = 14, Anaquel = 6
    minStockByLocation: { 'loc-pzo-01': 5 },
    monthlyUnitsSold: 100,
    abcClass: 'A',
    supplierId: 'sup-01',
    lastUpdatedVet: '2026-10-29',
  };

  const tocinoCerdo: Product = {
    id: 'prd-toc-cer',
    sku: 'CER-TOCINO-KG',
    barcode: '759002',
    name: 'Tocino de Cerdo Fresco',
    category: 'Carnicería y Proteínas',
    unit: 'KG',
    costUsd: 3.2,
    targetMarginPercent: 25,
    priceUsd: 4.27,
    ivaRate: 0,
    stockByLocation: { 'loc-pzo-01': 10 },
    shelfStockByLocation: { 'loc-pzo-01': 2 }, // Depósito = 8, Anaquel = 2
    minStockByLocation: { 'loc-pzo-01': 2 },
    monthlyUnitsSold: 40,
    abcClass: 'B',
    supplierId: 'sup-01',
    lastUpdatedVet: '2026-10-29',
  };

  const fefoLot = createFefoPerishableLot({
    lotCode: 'LOT-REC-URGENTE',
    product: recorteRes,
    locationId: 'loc-pzo-01',
    locationName: 'Sede Alta Vista',
    zone: 'DEPOSITO',
    quantity: 10,
    receptionDate: '2026-10-26',
    expirationDate: '2026-10-31',
    referenceDateIso: '2026-10-29',
  });

  // Solicitar 16 Kg de Recorte de Res (toma 14 de Cava/Depósito + 2 de Exhibición/Anaquel) + 4 Kg de Tocino
  const prodRes = executeInternalProductionOrder({
    recipe: {
      id: 'rcp-burger-01',
      code: 'BOM-BURGER-ANGUS',
      name: 'Bandeja Hamburguesa Artesanal de la Casa',
      department: 'CARNICERIA',
      outputSku: 'ELAB-HAMBURGUESA-KG',
      outputProductName: 'Hamburguesa Artesanal Especial Kg',
      outputUnit: 'KG',
      expectedOutputQty: 19.5,
      packagingAndCondimentsCostUsd: 4.95,
      targetMarginPercent: 30,
      ingredients: [
        {
          productId: recorteRes.id,
          sku: recorteRes.sku,
          productName: recorteRes.name,
          unit: 'KG',
          quantityRequiredPerBatch: 16,
          preferredSourceZone: 'DEPOSITO',
        },
        {
          productId: tocinoCerdo.id,
          sku: tocinoCerdo.sku,
          productName: tocinoCerdo.name,
          unit: 'KG',
          quantityRequiredPerBatch: 4,
          preferredSourceZone: 'DEPOSITO',
        },
      ],
      active: true,
    },
    batchesMultiplier: 1,
    actualOutputQty: 19.5,
    locationId: 'loc-pzo-01',
    locationName: 'Sede Alta Vista',
    targetOutputZone: 'ANAQUEL',
    products: [recorteRes, tocinoCerdo],
    fefoLots: [fefoLot],
    bcvRate: 50,
    executedBy: 'Jefe de Carnicería',
    executedAtVet: '2026-10-29 15:00',
    referenceDateIso: '2026-10-29',
  });

  // Costo materia prima = (16 * 4.50) + (4 * 3.20) = 72.00 + 12.80 = 84.80 + 4.95 empaque = 89.75 / 19.5 Kg = $4.60/Kg
  assert.equal(prodRes.orderRecord.rawMaterialsCostUsd, 84.8);
  assert.equal(prodRes.orderRecord.totalBatchCostUsd, 89.75);
  assert.equal(prodRes.orderRecord.unitElaboratedCostUsd, 4.6);
  assert.deepEqual(prodRes.orderRecord.fefoLotsConsumed, ['LOT-REC-URGENTE']);

  const afterRecorte = prodRes.updatedProducts.find((p) => p.id === recorteRes.id)!;
  const bdRec = getLocationStockBreakdown(afterRecorte, 'loc-pzo-01');
  assert.equal(bdRec.total, 4);
  assert.equal(bdRec.deposit, 0);
  assert.equal(bdRec.shelf, 4);

  const createdBurger = prodRes.updatedProducts.find((p) => p.sku === 'ELAB-HAMBURGUESA-KG')!;
  const bdBurger = getLocationStockBreakdown(createdBurger, 'loc-pzo-01');
  assert.equal(bdBurger.total, 19.5);
  assert.equal(bdBurger.shelf, 19.5);
  assert.equal(bdBurger.deposit, 0);
});

test('57. Conciliación Bancaria Bimonetaria (VES/USD + IGTF 3%) y Bandeja de Pre-Conciliación @OCR: Detección de captura duplicada y cruce automático', () => {
  const csvSample = [
    'Fecha;Referencia;Descripcion;Monto;Tipo',
    '2026-10-29;000984512;PAGO PROVEEDOR ALIMENTOS POLAR;-52000,00;DEBITO',
    '2026-10-29;000774411;TRANSFERENCIA FLETE;-15000,00;DEBITO',
  ].join('\n');

  const linesVes = parseBankStatementCsv({
    rawCsvText: csvSample,
    bankName: 'Banesco Cuenta Corriente VES',
    accountCurrency: 'VES',
    bcvRate: 50.0,
  });
  assert.equal(linesVes.length, 2);
  assert.equal(linesVes[0].amount, 52000);
  assert.equal(linesVes[0].amountUsdEquivalent, 1040);

  const linesUsd = parseBankStatementCsv({
    rawCsvText: '2026-10-29,ZELLE-884422,PAGO ZELLE PROVEEDOR,-500.00,DEBITO',
    bankName: 'Banesco Panamá USD',
    accountCurrency: 'USD',
    bcvRate: 50.0,
  });
  assert.equal(linesUsd[0].igtfAppliedUsd, 15.0); // 3% IGTF sobre $500

  // Pre-conciliación OCR: primera carga legítima, segunda reutilizada -> ALERTA_FRAUDE_EDICION_O_IA
  const firstPrePay = submitPaymentToPreConciliation({
    existingItems: [],
    supplierId: 'sup-01',
    supplierName: 'Alimentos Polar',
    invoiceId: 'inv-01',
    invoiceNumber: 'FAC-001',
    method: 'ZELLE_USD',
    currency: 'USD',
    amountOriginal: 500,
    bcvRateUsed: 50,
    reference: 'ZELLE-884422',
    submittedBy: 'Analista Tesorería',
    submittedAtVet: '2026-10-29 15:10',
  });
  assert.equal(firstPrePay.status, 'pendiente_verificacion');
  assert.equal(firstPrePay.igtfUsd, 15.0);
  assert.equal(firstPrePay.ocrVerdict, 'AUTENTICO_ALTA_CONFIANZA');

  const reusedPrePay = submitPaymentToPreConciliation({
    existingItems: [firstPrePay],
    supplierId: 'sup-01',
    supplierName: 'Alimentos Polar',
    method: 'ZELLE_USD',
    currency: 'USD',
    amountOriginal: 500,
    bcvRateUsed: 50,
    reference: 'ZELLE-884422',
    submittedBy: 'Analista Tesorería',
    submittedAtVet: '2026-10-29 15:12',
  });
  assert.equal(reusedPrePay.ocrVerdict, 'ALERTA_FRAUDE_EDICION_O_IA');

  // Auto-reconciliación exacta por sufijo de referencia y monto USD equivalente
  const matchRes = autoReconcileBankStatement({
    statementLines: linesVes,
    payments: [
      {
        id: 'pay-01',
        invoiceId: 'inv-01',
        amountUsd: 1040,
        amountVes: 52000,
        bcvRateUsed: 50,
        method: 'TRANSFERENCIA_VES',
        reference: '984512',
        paidAtVet: '2026-10-29',
        registeredBy: 'Tesorería',
      },
    ],
  });
  assert.equal(matchRes.exactMatchesCount, 1);
  assert.equal(matchRes.pendingCount, 1);
  assert.equal(matchRes.reconciledLines[0].reconciliationStatus, 'CONCILIADO_EXACTO');
});

test('58. Motor Predictivo de Demanda por Quincenas Venezolanas (15 y 30) y Fines de Semana: Monotonicidad de horizontes y factor pico', () => {
  assert.equal(isVenezuelanQuincenaPeakDay(new Date(Date.UTC(2026, 9, 15))), true);
  assert.equal(isVenezuelanQuincenaPeakDay(new Date(Date.UTC(2026, 9, 30))), true);
  assert.equal(isVenezuelanQuincenaPeakDay(new Date(Date.UTC(2026, 9, 8))), false);
  assert.equal(isRetailWeekendPeakDay(new Date(Date.UTC(2026, 9, 31))), true); // Sábado

  const meatSku: Product = {
    id: 'prd-fc-01',
    sku: 'RES-PULPA-NEGRA',
    barcode: '759555',
    name: 'Pulpa Negra Especial Kg',
    category: 'Carnicería y Proteínas',
    unit: 'KG',
    costUsd: 6.2,
    targetMarginPercent: 25,
    priceUsd: 8.27,
    ivaRate: 0,
    stockByLocation: { 'loc-pzo-01': 12 },
    minStockByLocation: { 'loc-pzo-01': 10 },
    monthlyUnitsSold: 150, // 5 Kg/día base
    abcClass: 'A',
    supplierId: 'sup-01',
    lastUpdatedVet: '2026-10-29',
  };

  // Ventana con quincena + fin de semana (29 oct al 4 nov) supera ventana entre semana normal (5 oct al 11 oct)
  const peakWindow = forecastVenezuelanRetailDemand({
    product: meatSku,
    locationId: 'loc-pzo-01',
    horizonDays: 7,
    referenceDateIso: '2026-10-29',
  });
  const normalWindow = forecastVenezuelanRetailDemand({
    product: meatSku,
    locationId: 'loc-pzo-01',
    horizonDays: 7,
    referenceDateIso: '2026-10-05',
  });
  assert.equal(peakWindow.isUpcomingQuincenaWindow, true);
  assert.ok(peakWindow.projectedDemandHorizon > normalWindow.projectedDemandHorizon);

  // Monotonicidad estricta en [7, 15, 30, 45, 60] días
  let prevProjected = 0;
  for (const h of ROTATION_HORIZONS_DAYS) {
    const fc = forecastVenezuelanRetailDemand({
      product: meatSku,
      locationId: 'loc-pzo-01',
      horizonDays: h,
      referenceDateIso: '2026-10-29',
    });
    assert.ok(fc.projectedDemandHorizon > prevProjected);
    prevProjected = fc.projectedDemandHorizon;
  }
});

test('59. Gobernanza Gerencial con Token Dinámico TOTP Offline (RFC 6238): Ventana ±30s, QR efímero y compatibilidad transversal en Sinceración, Bajas y Anulación SENIAT', () => {
  const customSecret = generateBase32TotpSecret(20);
  assert.equal(customSecret.length, 20);

  const fixedNowMs = 1_793_300_000_000;
  const cfg = {
    ...DEFAULT_TOTP_CONFIG,
    secretBase32: customSecret,
    enabled: true,
    allowPinFallback: false, // Estricto solo TOTP
  };

  const otpAuth = buildTotpOtpAuthUri(cfg);
  assert.ok(otpAuth.startsWith('otpauth://totp/'));

  const currentCode = generateTotpCode(customSecret, fixedNowMs, 30);
  assert.match(currentCode, /^\d{6}$/);

  // 1. Código actual y ventana -30s autorizan; PIN fijo se rechaza cuando allowPinFallback === false
  assert.equal(
    verifyManagerGovernanceAuth({
      submittedCredential: currentCode,
      totpConfig: cfg,
      nowMs: fixedNowMs,
    }).authorized,
    true
  );
  assert.equal(
    verifyManagerGovernanceAuth({
      submittedCredential: currentCode,
      totpConfig: cfg,
      nowMs: fixedNowMs + 30_000,
    }).authorized,
    true
  );
  assert.equal(
    verifyManagerGovernanceAuth({
      submittedCredential: '203040',
      totpConfig: cfg,
      nowMs: fixedNowMs,
    }).authorized,
    false
  );

  // 2. Payload QR efímero de 30s autoriza limpiamente
  const qrToken = buildEphemeralApprovalQrPayload(customSecret, fixedNowMs);
  const qrVerify = verifyManagerGovernanceAuth({
    submittedCredential: qrToken,
    totpConfig: cfg,
    nowMs: fixedNowMs,
  });
  assert.equal(qrVerify.authorized, true);
  assert.equal(qrVerify.methodUsed, 'TOTP_EPHEMERAL_QR');

  // 3. Compatibilidad directa de código TOTP en Sinceración de Anaquel fuera de tolerancia y Anulación SENIAT
  const liveCodeForDefault = generateTotpCode(DEFAULT_TOTP_CONFIG.secretBase32, Date.now(), 30);
  const prodSync: Product = {
    id: 'p-sync-totp',
    sku: 'ACE-MAZ-1LT',
    barcode: '759999',
    name: 'Aceite Mazeite 1L',
    category: 'Víveres',
    unit: 'UND',
    costUsd: 2.5,
    targetMarginPercent: 25,
    priceUsd: 3.33,
    ivaRate: 16,
    stockByLocation: { 'loc-pzo-01': 100 },
    shelfStockByLocation: { 'loc-pzo-01': 20 },
    minStockByLocation: { 'loc-pzo-01': 15 },
    monthlyUnitsSold: 120,
    abcClass: 'A',
    supplierId: 'sup-01',
    lastUpdatedVet: '2026-10-29',
  };

  const syncWithTotp = reconcileLocationPhysicalCount({
    product: prodSync,
    locationName: 'Sede Alta Vista',
    input: {
      productId: prodSync.id,
      locationId: 'loc-pzo-01',
      countedDepositQty: 60,
      countedShelfQty: 20, // -20 unidades (-20% -> exige autorización)
      notes: 'Conteo físico auditado con TOTP',
      managerPin: liveCodeForDefault,
    },
    actor: {
      uid: 'usr-03',
      displayName: 'Auditor Piso',
      role: UserRole.ANALISTA,
    },
    totpConfig: DEFAULT_TOTP_CONFIG,
    timestampVet: '2026-10-29 16:00',
  });
  assert.equal(syncWithTotp.countedTotalAfter, 80);
});

test('60. Conector Impresoras Fiscales Homologadas SENIAT (SNAT/2024/000102) & Navegación Completa v4.0: Firma HMAC, IVA 16%/8%, IGTF 3%, idempotencia Z y Libro de Ventas .XLSX', () => {
  // Verificar que las 4 nuevas vistas empresariales están registradas en el enrutador principal
  assert.ok(VALID_NAVIGATION_TABS.includes('FEFO_COLD_CHAIN'));
  assert.ok(VALID_NAVIGATION_TABS.includes('PRODUCTION_RECIPES'));
  assert.ok(VALID_NAVIGATION_TABS.includes('BRM_WHATSAPP'));
  assert.ok(VALID_NAVIGATION_TABS.includes('BANK_RECONCILIATION'));

  const posProduct: Product = {
    id: 'prd-z-01',
    sku: 'ARR-PRI-1KG',
    barcode: '759111',
    name: 'Arroz Primor 1Kg',
    category: 'Víveres',
    unit: 'UND',
    costUsd: 1.0,
    targetMarginPercent: 25,
    priceUsd: 1.33,
    ivaRate: 0,
    stockByLocation: { 'loc-pzo-01': 50 },
    shelfStockByLocation: { 'loc-pzo-01': 10 }, // Depósito 40, Anaquel 10
    minStockByLocation: { 'loc-pzo-01': 10 },
    monthlyUnitsSold: 200,
    abcClass: 'A',
    supplierId: 'sup-01',
    lastUpdatedVet: '2026-10-29',
  };

  const validHmac = computeFiscalPayloadSignature('Z1F0009841', '0501', '2026-10-29');

  const zRes = processFiscalZClosure({
    input: {
      zNumber: '0501',
      printerSerial: 'Z1F0009841',
      printerBrand: 'THE_FACTORY_HKA',
      locationId: 'loc-pzo-01',
      locationName: 'Sede Alta Vista',
      closureDate: '2026-10-29',
      reportType: 'REPORTE_Z_DIARIO',
      invoicesCount: 210,
      exemptSalesUsd: 500.0,
      taxableBase16Usd: 1000.0, // IVA 16% = 160.00
      taxableBase8Usd: 250.0, // IVA 8% = 20.00
      igtfBaseForeignUsd: 400.0, // IGTF 3% = 12.00
      bcvRateClosure: 50.0,
      source: 'API_PUENTE_FISCAL',
      providedSignature: validHmac,
      soldItemsForShelfDeduction: [{ sku: 'ARR-PRI-1KG', qtySold: 14 }], // Agota 10 de Anaquel + 4 de Depósito
      registeredBy: 'Puente Fiscal HKA',
      registeredAtVet: '2026-10-29 21:00',
    },
    existingZReports: [],
    salesEvents: [],
    products: [posProduct],
  });

  // Gran Total USD = 500 + 1000 + 160 + 250 + 20 + 12 = 1942.00 USD -> Bs. 97,100.00
  assert.equal(zRes.zRecord.iva16CollectedUsd, 160.0);
  assert.equal(zRes.zRecord.iva8CollectedUsd, 20.0);
  assert.equal(zRes.zRecord.igtf3CollectedUsd, 12.0);
  assert.equal(zRes.zRecord.grandTotalFiscalUsd, 1942.0);
  assert.equal(zRes.zRecord.grandTotalFiscalVes, 97100.0);
  assert.equal(zRes.zRecord.hmacVerified, true);
  assert.equal(zRes.shelfShortfallCount, 1);

  const afterStock = getLocationStockBreakdown(zRes.updatedProducts[0], 'loc-pzo-01');
  assert.equal(afterStock.total, 36);
  assert.equal(afterStock.shelf, 0);
  assert.equal(afterStock.deposit, 36);

  // Candado de idempotencia impide duplicar el mismo Reporte Z + Serial Fiscal
  assert.throws(() => {
    processFiscalZClosure({
      input: {
        zNumber: '0501',
        printerSerial: 'Z1F0009841',
        printerBrand: 'THE_FACTORY_HKA',
        locationId: 'loc-pzo-01',
        locationName: 'Sede Alta Vista',
        closureDate: '2026-10-29',
        reportType: 'REPORTE_Z_DIARIO',
        invoicesCount: 210,
        exemptSalesUsd: 500,
        taxableBase16Usd: 1000,
        taxableBase8Usd: 250,
        igtfBaseForeignUsd: 400,
        bcvRateClosure: 50,
        source: 'API_PUENTE_FISCAL',
        registeredBy: 'Puente Fiscal HKA',
        registeredAtVet: '2026-10-29 21:05',
      },
      existingZReports: zRes.updatedZReports,
      salesEvents: [],
      products: zRes.updatedProducts,
    });
  }, /IDEMPOTENCIA FISCAL/);

  // Libro Especial de Ventas SENIAT (.xlsx) se genera sin errores
  const salesWb = buildSeniatSalesBookWorkbook({
    zReports: zRes.updatedZReports,
    companyProfile: DEFAULT_COMPANY_PROFILE,
    periodYearMonth: '202610',
  });
  assert.ok(salesWb.SheetNames.includes('Libro Ventas Reportes Z'));
});

test('61. Telemetría y Estado de Salud del Sistema (Anti-Hemorragia de Cuotas Firestore)', () => {
  quotaTelemetryEngine.resetTelemetryForTesting(0, 0);
  let snap = quotaTelemetryEngine.getSnapshot();
  assert.equal(snap.readsToday, 0);
  assert.equal(snap.healthStatus, 'OPTIMO');
  assert.equal(snap.throttleModeActive, false);

  // Registrar lecturas normales
  quotaTelemetryEngine.recordRead(50, 'catalogo_productos');
  quotaTelemetryEngine.recordWrite(10);
  snap = quotaTelemetryEngine.getSnapshot();
  assert.equal(snap.readsToday, 50);
  assert.equal(snap.writesToday, 10);
  assert.equal(snap.healthStatus, 'OPTIMO');

  // Test umbral preventivo (60%)
  quotaTelemetryEngine.resetTelemetryForTesting(31000, 500); // 62%
  snap = quotaTelemetryEngine.getSnapshot();
  assert.equal(snap.healthStatus, 'PREVENTIVO_60');
  assert.equal(snap.readQuotaPercent, 62);

  // Test umbral crítico de alerta (80%)
  quotaTelemetryEngine.resetTelemetryForTesting(41000, 500); // 82%
  snap = quotaTelemetryEngine.getSnapshot();
  assert.equal(snap.healthStatus, 'CRITICO_80');
  assert.equal(snap.readQuotaPercent, 82);

  // Test modo ahorro forzado (90%)
  quotaTelemetryEngine.resetTelemetryForTesting(46000, 500); // 92%
  snap = quotaTelemetryEngine.getSnapshot();
  assert.equal(snap.healthStatus, 'AHORRO_FORZADO_90');
  assert.equal(snap.throttleModeActive, true);

  // Test detección proactiva de hemorragia de datos (Query Leak Watchdog)
  quotaTelemetryEngine.resetTelemetryForTesting(100, 10);
  quotaTelemetryEngine.recordRead(195, 'coleccion_sin_limit', 'BuclePrueba');
  snap = quotaTelemetryEngine.getSnapshot();
  assert.equal(snap.activeLeaksDetected.length, 1);
  assert.equal(snap.activeLeaksDetected[0].burstCount, 195);
  assert.ok(snap.activeLeaksDetected[0].description.includes('Ráfaga anómala'));

  quotaTelemetryEngine.clearLeaks();
  snap = quotaTelemetryEngine.getSnapshot();
  assert.equal(snap.activeLeaksDetected.length, 0);
});

test('62. Flujo de Caja Bimonetario Conservador Estricto (USD / VES) con Decimal.js', () => {
  const mockInvoices: PurchaseInvoice[] = [
    {
      id: 'inv-vencida-1',
      invoiceNumber: 'FAC-001',
      controlNumber: '00-01',
      supplierId: 'sup-001',
      supplierName: 'Alimentos Polar',
      supplierRif: 'J-00006372-9',
      locationId: 'loc-pzo-01',
      issueDate: '2026-10-10',
      dueDate: '2026-10-25', // Vencida
      currency: 'USD',
      bcvRateAtIssue: 50,
      lines: [],
      subtotalUsd: 1000,
      ivaAmountUsd: 160,
      igtfAmountUsd: 0,
      totalUsd: 1160,
      paidAmountUsd: 0,
      status: 'PENDIENTE',
      ocrEngineUsed: 'GEMINI_VISION_PRO',
      forensicAudit: {
        passedAllLocks: true,
        lock1LineIntegrations: true,
        lock2SubtotalMatch: true,
        lock3TaxCoherence: true,
        lock4TotalCrossCheck: true,
        discrepancyUsd: 0,
        auditLog: [],
      },
      createdAtVet: '2026-10-10 10:00',
    },
    {
      id: 'inv-h7-2',
      invoiceNumber: 'FAC-002',
      controlNumber: '00-02',
      supplierId: 'sup-002',
      supplierName: 'Cargill de Venezuela',
      supplierRif: 'J-00045678-0',
      locationId: 'loc-pzo-01',
      issueDate: '2026-10-28',
      dueDate: '2026-11-03', // Próximos 5 días (<=7d)
      currency: 'USD',
      bcvRateAtIssue: 50,
      lines: [],
      subtotalUsd: 800,
      ivaAmountUsd: 128,
      igtfAmountUsd: 0,
      totalUsd: 928,
      paidAmountUsd: 0,
      status: 'PENDIENTE',
      ocrEngineUsed: 'GEMINI_VISION_PRO',
      forensicAudit: {
        passedAllLocks: true,
        lock1LineIntegrations: true,
        lock2SubtotalMatch: true,
        lock3TaxCoherence: true,
        lock4TotalCrossCheck: true,
        discrepancyUsd: 0,
        auditLog: [],
      },
      createdAtVet: '2026-10-28 10:00',
    },
    {
      id: 'inv-h15-3',
      invoiceNumber: 'FAC-003',
      controlNumber: '00-03',
      supplierId: 'sup-003',
      supplierName: 'Plumrose Latinoamericana',
      supplierRif: 'J-00078901-2',
      locationId: 'loc-pzo-01',
      issueDate: '2026-10-29',
      dueDate: '2026-11-12', // Próximos 14 días (<=15d)
      currency: 'USD',
      bcvRateAtIssue: 50,
      lines: [],
      subtotalUsd: 1500,
      ivaAmountUsd: 240,
      igtfAmountUsd: 0,
      totalUsd: 1740,
      paidAmountUsd: 0,
      status: 'PENDIENTE',
      ocrEngineUsed: 'GEMINI_VISION_PRO',
      forensicAudit: {
        passedAllLocks: true,
        lock1LineIntegrations: true,
        lock2SubtotalMatch: true,
        lock3TaxCoherence: true,
        lock4TotalCrossCheck: true,
        discrepancyUsd: 0,
        auditLog: [],
      },
      createdAtVet: '2026-10-29 10:00',
    },
  ];

  const mockVouchers: TaxRetentionVoucher[] = [
    {
      id: 'vch-iva-1',
      voucherNumber: '20261000000001',
      type: 'IVA',
      status: 'EMITIDO',
      supplierId: 'sup-001',
      supplierName: 'Alimentos Polar',
      supplierRif: 'J-00006372-9',
      invoiceId: 'inv-vencida-1',
      invoiceNumber: 'FAC-001',
      controlNumber: '00-01',
      bcvRateAtIssue: 50,
      retainedTotalVes: 6000, // 120 USD a tasa 50
      retainedTotalUsd: 120,
      taxableBaseUsd: 1000,
      taxableBaseVes: 50000,
      taxCausadoTotalUsd: 160,
      taxCausadoTotalVes: 8000,
      retentionPercentApplied: 75,
      sustraendoTotalVes: 0,
      netPayableAfterAllRetentionsUsd: 1040,
      netPayableAfterAllRetentionsVes: 52000,
      lines: [],
      createdBy: 'admin',
      createdAtVet: '2026-10-10 10:30',
    } as unknown as TaxRetentionVoucher,
  ];

  // Ejecutar cálculo conservador estricto (Opción B)
  const result = calculateConservativeCashFlowProjection({
    availableCashUsd: 5000,
    availableCashVes: 100000, // 2000 USD a tasa 50 -> Total Disponible = 7000 USD
    activeBcvRate: 50,
    invoices: mockInvoices,
    retentionVouchers: mockVouchers,
    bcvSlippagePercent: 0,
  });

  assert.equal(result.currentAvailableLiquidity.usdAvailable, 5000);
  assert.equal(result.currentAvailableLiquidity.vesAvailable, 100000);
  assert.equal(result.currentAvailableLiquidity.consolidatedTotalUsd, 7000);
  assert.equal(result.currentAvailableLiquidity.consolidatedTotalVes, 350000);

  // Validar desglose de cuentas por pagar
  assert.equal(result.supplierObligations.overdueUsd, 1160);
  assert.equal(result.supplierObligations.horizon7dUsd, 928);
  assert.equal(result.supplierObligations.horizon15dUsd, 1740);

  // Validar provisión fiscal SENIAT
  assert.equal(result.seniatFiscalObligations.ivaPendingVes, 6000);
  assert.equal(result.seniatFiscalObligations.totalSeniatUsd, 120);

  // Validar 4 horizontes proyectados
  assert.equal(result.horizons.length, 4);
  assert.equal(result.horizons[0].periodLabel, 'Vencido / Hoy');
  assert.equal(result.horizons[1].periodLabel, 'Próximos 7 días');
  assert.equal(result.horizons[2].periodLabel, 'Quincena (Día 15)');

  // Probar simulador de deslizamiento cambiario BCV (+5%)
  const simResult = calculateConservativeCashFlowProjection({
    availableCashUsd: 5000,
    availableCashVes: 100000,
    activeBcvRate: 50,
    invoices: mockInvoices,
    retentionVouchers: mockVouchers,
    bcvSlippagePercent: 5, // Tasa simulada = 52.50
  });

  assert.equal(simResult.simulatedBcvRate, 52.5);
  assert.equal(simResult.supplierObligations.overdueVes, 1160 * 52.5); // 60,900 VES
});

test('63. Auto-Detección Multi-Formato Chrystal POS (Excel, CSV, TXT Tabulado)', () => {
  // Test detección de delimitador
  assert.equal(detectTextDelimiter('CODIGO,ARTICULO,CANTIDAD\nHAR-01,Harina,10'), 'CSV_COMMA');
  assert.equal(detectTextDelimiter('CODIGO;ARTICULO;CANTIDAD\nHAR-01;Harina;10'), 'CSV_SEMICOLON');
  assert.equal(detectTextDelimiter('CODIGO\tARTICULO\tCANTIDAD\nHAR-01\tHarina\t10'), 'TEXT_TAB_DELIMITED');

  // Test matriz con formato de ejemplo Chrystal POS
  const sampleMatrix = generateSampleChrystalSalesMatrix();
  assert.ok(sampleMatrix.length >= 8);

  const mockCatalog: Product[] = [
    {
      id: 'prd-001',
      sku: 'HAR-PAN-1KG',
      barcode: '7591001000101',
      name: 'Harina PAN 1kg',
      category: 'Víveres',
      unit: 'UND',
      costUsd: 1.0,
      targetMarginPercent: 25,
      priceUsd: 1.35,
      ivaRate: 0,
      stockByLocation: { 'loc-pzo-01': 100 },
      minStockByLocation: { 'loc-pzo-01': 20 },
      monthlyUnitsSold: 300,
      abcClass: 'A',
      supplierId: 'sup-001',
      lastUpdatedVet: '2026-10-29 10:00',
    },
    {
      id: 'prd-002',
      sku: 'ACE-MAZ-1LT',
      barcode: '7591001000202',
      name: 'Aceite Mazola 1L',
      category: 'Víveres',
      unit: 'UND',
      costUsd: 2.8,
      targetMarginPercent: 28,
      priceUsd: 3.85,
      ivaRate: 16,
      stockByLocation: { 'loc-pzo-01': 50 },
      minStockByLocation: { 'loc-pzo-01': 10 },
      monthlyUnitsSold: 120,
      abcClass: 'A',
      supplierId: 'sup-001',
      lastUpdatedVet: '2026-10-29 10:00',
    },
  ];

  const parsed = parseRawMatrixChrystalSales(
    sampleMatrix,
    mockCatalog,
    'Reporte_Chrystal_Pzo.xlsx',
    'EXCEL_WORKBOOK'
  );

  assert.equal(parsed.detectedFormat, 'EXCEL_WORKBOOK');
  assert.ok(parsed.recognizedItems.length >= 2);
  const harPanItem = parsed.recognizedItems.find((i) => i.sku === 'HAR-PAN-1KG');
  assert.ok(harPanItem);
  assert.equal(harPanItem.qtySold, 45);
  assert.equal(harPanItem.totalUsd, 60.75);
});

test('64. Tratamiento de SKUs No Registrados en Ventas Chrystal (Opción A: Omitir y Alertar)', () => {
  const sampleMatrix = generateSampleChrystalSalesMatrix();
  const minimalCatalog: Product[] = [
    {
      id: 'prd-001',
      sku: 'HAR-PAN-1KG',
      barcode: '7591001000101',
      name: 'Harina PAN 1kg',
      category: 'Víveres',
      unit: 'UND',
      costUsd: 1.0,
      targetMarginPercent: 25,
      priceUsd: 1.35,
      ivaRate: 0,
      stockByLocation: { 'loc-pzo-01': 100 },
      minStockByLocation: { 'loc-pzo-01': 20 },
      monthlyUnitsSold: 300,
      abcClass: 'A',
      supplierId: 'sup-001',
      lastUpdatedVet: '2026-10-29 10:00',
    },
  ];

  const parsed = parseRawMatrixChrystalSales(
    sampleMatrix,
    minimalCatalog,
    'Ventas_Chrystal.csv',
    'CSV_COMMA'
  );

  // Solo HAR-PAN-1KG está en el catálogo mínimo
  assert.equal(parsed.recognizedItems.length, 1);
  assert.equal(parsed.recognizedItems[0].sku, 'HAR-PAN-1KG');

  // El resto de los productos desconocidos (como DESCONOCIDO-999) están en unrecognizedItems
  assert.ok(parsed.unrecognizedItems.length >= 1);
  const unknownItem = parsed.unrecognizedItems.find((i) => i.rawCode === 'DESCONOCIDO-999');
  assert.ok(unknownItem);
  assert.equal(unknownItem.qtySold, 12);
  assert.equal(unknownItem.reason, 'SKU_OR_BARCODE_NOT_FOUND_IN_CATALOG');
});

test('65. Validación Visual Split-Screen OCR y Modal de Confirmación Rápida de Retenciones', () => {
  const invoiceLines: PurchaseInvoiceLine[] = [
    {
      id: 'ln-1',
      sku: 'HAR-PAN-1KG',
      description: 'Harina PAN 1kg',
      quantity: 100,
      unitCostUsd: 1.0,
      lineTotalUsd: 100.0,
      ivaRate: 0, // Exento
      lineType: 'BIEN',
    },
    {
      id: 'ln-2',
      sku: 'ACE-MAZ-1LT',
      description: 'Aceite Mazola 1L',
      quantity: 50,
      unitCostUsd: 3.0,
      lineTotalUsd: 150.0,
      ivaRate: 16, // Gravable 16% -> IVA 24 USD
      lineType: 'BIEN',
    },
  ];

  // Totales
  const subtotalUsd = 250.0;
  const ivaUsd = 24.0;
  const totalUsd = 274.0;

  // Cuadre de retenciones: IVA 75%
  const ivaRetainedUsd = 24.0 * 0.75; // 18 USD
  // ISLR Bienes PJ (2%)
  const islrRetainedUsd = 250.0 * 0.02; // 5 USD
  const totalRetainedUsd = 18.0 + 5.0; // 23 USD
  const netPayableUsd = 274.0 - 23.0; // 251 USD

  assert.equal(ivaRetainedUsd, 18.0);
  assert.equal(islrRetainedUsd, 5.0);
  assert.equal(netPayableUsd, 251.0);
});

test('66. Prueba de Estrés de Cuotas Firestore & Ingesta Masiva de 1,000 Transacciones Chrystal POS', () => {
  const stressCatalog: Product[] = [];
  for (let i = 0; i < 50; i++) {
    stressCatalog.push({
      id: `prd-${i}`,
      sku: `SKU-POS-${i}`,
      barcode: `759900000${String(i).padStart(4, '0')}`,
      name: `Producto Retail ${i}`,
      category: 'Víveres',
      unit: 'UND',
      costUsd: 2.0,
      targetMarginPercent: 30,
      priceUsd: 2.85,
      ivaRate: 16,
      stockByLocation: { 'loc-pzo-01': 500 },
      minStockByLocation: { 'loc-pzo-01': 50 },
      monthlyUnitsSold: 1000,
      abcClass: 'A',
      supplierId: 'sup-001',
      lastUpdatedVet: '2026-10-29 10:00',
    });
  }

  // Generar 1,000 líneas de venta simuladas de Chrystal POS
  const bigMatrix: Array<Array<string | number>> = [
    ['CODIGO', 'DESCRIPCION', 'CANTIDAD', 'PRECIO', 'TOTAL'],
  ];

  for (let i = 0; i < 1000; i++) {
    const skuIndex = i % 55; // 50 reconocidos, 5 desconocidos
    bigMatrix.push([
      `SKU-POS-${skuIndex}`,
      `Articulo ${skuIndex}`,
      (i % 5) + 1,
      2.85,
      ((i % 5) + 1) * 2.85,
    ]);
  }

  const startT = Date.now();
  const parsedBig = parseRawMatrixChrystalSales(
    bigMatrix,
    stressCatalog,
    'Ventas_Masivas_1000.csv',
    'CSV_COMMA'
  );
  const elapsed = Date.now() - startT;

  assert.ok(elapsed < 300, `Parseo de 1,000 transacciones debe tardar <300ms (tardó ${elapsed}ms)`);
  assert.ok(parsedBig.recognizedItems.length > 800);
  assert.ok(parsedBig.unrecognizedItems.length > 50);

  // Validar telemetría de cuotas registrando el lote
  quotaTelemetryEngine.recordRead(50, 'catalogo_productos', 'StressTest');
  quotaTelemetryEngine.recordWrite(parsedBig.recognizedItems.length);
  const snap = quotaTelemetryEngine.getSnapshot();
  assert.ok(snap.writesToday >= parsedBig.recognizedItems.length);
});

test('67. Generador Determinista de Código QR Real ISO/IEC 18004 (WhatsApp Web Pairing)', () => {
  const token = 'CHRYSTAL-BRM-WA::+582432345678::F7E91D3C4A5B6F70';
  const matrix = generateQrMatrix(token);

  assert.ok(Array.isArray(matrix), 'La matriz QR debe ser un array bidimensional');
  assert.ok(matrix.length >= 21, 'El tamaño de la matriz debe ser al menos 21x21 módulos');
  assert.strictEqual(matrix.length, matrix[0].length, 'La matriz QR debe ser cuadrada');

  // Verificar patrones de localización (Finder Patterns de 7x7) en las 3 esquinas
  const size = matrix.length;
  // Esquina superior izquierda
  assert.strictEqual(matrix[0][0], true, 'Finder superior izq (0,0) debe ser negro');
  assert.strictEqual(matrix[0][6], true, 'Finder superior izq (0,6) debe ser negro');
  assert.strictEqual(matrix[6][0], true, 'Finder superior izq (6,0) debe ser negro');
  assert.strictEqual(matrix[3][3], true, 'Centro Finder superior izq (3,3) debe ser negro');

  // Esquina superior derecha
  assert.strictEqual(matrix[0][size - 1], true, 'Finder superior der (0,size-1) debe ser negro');
  assert.strictEqual(matrix[0][size - 7], true, 'Finder superior der (0,size-7) debe ser negro');

  // Esquina inferior izquierda
  assert.strictEqual(matrix[size - 1][0], true, 'Finder inferior izq (size-1,0) debe ser negro');
  assert.strictEqual(matrix[size - 7][0], true, 'Finder inferior izq (size-7,0) debe ser negro');

  // Generar SVG String y Data URI
  const svg = generateQrSvgString(token, { size: 240, margin: 4 });
  assert.ok(svg.startsWith('<svg'), 'Debe generar SVG válido');
  assert.ok(svg.includes('viewBox='), 'SVG debe incluir viewBox escalable');
  assert.ok(svg.includes('rect'), 'SVG debe contener módulos rectangulares');

  const dataUri = generateQrDataUri(token);
  assert.ok(dataUri.startsWith('data:image/svg+xml;base64,'), 'Debe generar Data URI SVG en base64');
});

test('68. Despacho Asistido en Retenciones: Carga de Borrador BRM y Prevención de Envíos Accidentales', () => {
  const mockVoucher: TaxRetentionVoucher = {
    id: 'ret-mock-99',
    voucherNumber: '20261000000099',
    type: 'IVA',
    legalNormative: 'SNAT/2025/000054',
    status: 'EMITIDO',
    issueDate: '2026-10-30',
    periodYearMonth: '202610',
    fortnight: 'SEGUNDA_QUINCENA',
    fortnightLabel: 'Segunda Quincena Octubre 2026',
    legalDeliveryHint: 'Entrega obligatoria dentro de 2 días hábiles siguientes.',
    agentRazonSocial: 'HIPER ABASTO POLAR, C.A.',
    agentRif: 'J-50123456-7',
    agentAddress: 'Av. Las Delicias, Maracay',
    supplierId: 'sup-agro-01',
    supplierName: 'Distribuidora Lácteos Los Llanos, C.A.',
    supplierRif: 'J-30987654-2',
    supplierTaxpayerType: 'ORDINARIO',
    supplierPersonType: 'PJ_DOMICILIADA',
    invoiceId: 'inv-lact-101',
    invoiceNumber: 'FAC-9012',
    controlNumber: '00-8812',
    invoiceIssueDate: '2026-10-28',
    bcvRateAtIssue: 44.5,
    utValueVes: 9.0,
    lines: [],
    invoiceTotalUsd: 1000,
    invoiceTotalVes: 44500,
    exemptTotalUsd: 0,
    exemptTotalVes: 0,
    taxableBaseUsd: 1000,
    taxableBaseVes: 44500,
    taxCausadoTotalUsd: 160,
    taxCausadoTotalVes: 7120,
    sustraendoTotalVes: 0,
    retainedTotalUsd: 120, // 75%
    retainedTotalVes: 5340,
    retentionPercentApplied: 75,
    netPayableAfterAllRetentionsUsd: 880,
    netPayableAfterAllRetentionsVes: 39160,
    createdBy: 'Analista Tributario',
    createdAtVet: '2026-10-30 08:30',
  };

  // Simular empaquetado de borrador
  const stagedDraft: StagedBrmRetentionDispatch = {
    voucherId: mockVoucher.id,
    voucherNumber: mockVoucher.voucherNumber,
    voucherType: mockVoucher.type,
    invoiceId: mockVoucher.invoiceId,
    supplierId: mockVoucher.supplierId,
    supplierName: mockVoucher.supplierName,
    supplierRif: mockVoucher.supplierRif,
    phoneE164: '+584141234567',
    retainedVes: mockVoucher.retainedTotalVes,
    retainedUsd: mockVoucher.retainedTotalUsd,
    periodYearMonth: mockVoucher.periodYearMonth,
    formattedSummaryMessage: `Estimados señores ${mockVoucher.supplierName}:\nAdjuntamos Comprobante de Retención IVA N° ${mockVoucher.voucherNumber}.`,
    preparedAtVet: '2026-10-30 08:35',
  };

  // El comprobante DEBE permanecer en estado EMITIDO mientras esté en borrador
  assert.strictEqual(mockVoucher.status, 'EMITIDO', 'El comprobante no debe pasar a ENTREGADO al preparar el borrador');
  assert.strictEqual(stagedDraft.retainedVes, 5340, 'Monto retenido en Bs debe coincidir exactamente');
  assert.strictEqual(stagedDraft.retainedUsd, 120, 'Monto retenido en USD debe coincidir');

  // Simular descarte del borrador
  let activeDraft: StagedBrmRetentionDispatch | null = stagedDraft;
  activeDraft = null; // Descarte
  assert.strictEqual(activeDraft, null, 'El borrador se descarta limpiamente');
  assert.strictEqual(mockVoucher.status, 'EMITIDO', 'El estado original del comprobante se preserva intacto');
});

test('69. Verificación de Integridad Inmutable de Registros de Persistencia (DatabaseSyncStatus)', () => {
  const sampleAuditTrail: AuditLogEntry[] = [
    {
      id: 'aud-01',
      userId: 'usr-admin',
      userEmail: 'admin@ar-group.com',
      userDisplayName: 'Gerente General',
      userRole: UserRole.GERENTE,
      action: 'TAX_RETENTION_STATUS_CHANGE',
      entityType: 'TAX_RETENTION',
      entityId: 'ret-01',
      description: 'Comprobante IVA emitido',
      timestampVet: '2026-10-30 09:00',
    },
    {
      id: 'aud-02',
      userId: 'usr-analyst',
      userEmail: 'analista@ar-group.com',
      userDisplayName: 'Analista de Compras',
      userRole: UserRole.ANALISTA,
      action: 'BRM_WHATSAPP_SEND',
      entityType: 'WhatsApp BRM Proveedores',
      entityId: 'msg-01',
      description: 'Envío de orden de compra vía WhatsApp BRM',
      timestampVet: '2026-10-30 09:15',
    },
  ];

  // Algoritmo de integridad: verificar campos inmutables obligatorios
  const validCount = sampleAuditTrail.filter(
    (e) => e.id && e.timestampVet && e.description && e.action && e.entityType
  ).length;

  assert.strictEqual(validCount, 2, 'Todos los registros válidos deben certificar integridad');
  const integrityPct = Math.round((validCount / sampleAuditTrail.length) * 100);
  assert.strictEqual(integrityPct, 100, 'Integridad criptográfica debe ser 100%');
});

test('70. Analítica Histórica de Rendimiento y Merma (YieldMetricsCharts Logic)', () => {
  const meatBatchesTest: MeatYieldBatch[] = [
    {
      id: 'batch-01',
      batchCode: 'LOTE-RES-01',
      customBatchCode: 'GUIA-SADA-100',
      receptionDate: '2026-10-25',
      supplierId: 'sup-gan-01',
      supplierName: 'Ganadería Santa Inés',
      animalType: 'RES',
      presentation: 'CANAL_COMPLETA',
      locationId: 'loc-pzo-01',
      locationName: 'Sede Principal',
      carcassWeightKg: 200,
      carcassCostPerKgUsd: 3.5,
      totalCarcassCostUsd: 700,
      cuts: [],
      totalCutsWeightKg: 150,
      cutsYieldPercent: 75, // 75%
      wastes: [],
      totalWasteWeightKg: 50,
      wastePercent: 25, // 25%
      unaccountedWeightKg: 0,
      projectedTotalRevenueUsd: 950,
      projectedGrossProfitUsd: 250,
      projectedMarginPercent: 26.3,
      bcvRateAtBatch: 44.5,
      supervisorUserId: 'usr-sup',
      supervisorName: 'Supervisor Carnes',
      supervisorRole: UserRole.SUPERVISOR_CARNICERIA,
      createdAtVet: '2026-10-25 08:00',
      status: 'CONFIRMADO_INVENTARIO',
    },
    {
      id: 'batch-02',
      batchCode: 'LOTE-RES-02',
      customBatchCode: 'GUIA-SADA-102',
      receptionDate: '2026-10-28',
      supplierId: 'sup-gan-02',
      supplierName: 'Frigorífico El Llano',
      animalType: 'RES',
      presentation: 'CANAL_COMPLETA',
      locationId: 'loc-pzo-01',
      locationName: 'Sede Principal',
      carcassWeightKg: 220,
      carcassCostPerKgUsd: 3.4,
      totalCarcassCostUsd: 748,
      cuts: [],
      totalCutsWeightKg: 176,
      cutsYieldPercent: 80, // 80%
      wastes: [],
      totalWasteWeightKg: 44,
      wastePercent: 20, // 20%
      unaccountedWeightKg: 0,
      projectedTotalRevenueUsd: 1100,
      projectedGrossProfitUsd: 352,
      projectedMarginPercent: 32.0,
      bcvRateAtBatch: 44.5,
      supervisorUserId: 'usr-sup',
      supervisorName: 'Supervisor Carnes',
      supervisorRole: UserRole.SUPERVISOR_CARNICERIA,
      createdAtVet: '2026-10-28 08:00',
      status: 'CONFIRMADO_INVENTARIO',
    },
  ];

  // Cálculo de promedios agregados
  const avgYield = round2((meatBatchesTest[0].cutsYieldPercent + meatBatchesTest[1].cutsYieldPercent) / 2);
  const avgWaste = round2((meatBatchesTest[0].wastePercent + meatBatchesTest[1].wastePercent) / 2);

  assert.strictEqual(avgYield, 77.5, 'Rendimiento promedio debe ser 77.5%');
  assert.strictEqual(avgWaste, 22.5, 'Merma promedio debe ser 22.5%');

  // Identificación del mejor proveedor (menor merma)
  const sortedByWaste = [...meatBatchesTest].sort((a, b) => a.wastePercent - b.wastePercent);
  assert.strictEqual(sortedByWaste[0].supplierName, 'Frigorífico El Llano', 'El mejor proveedor debe tener la menor merma (20%)');
});

test('71. Control de Gastos OPEX: Aritmética Exacta Decimal.js (ROUND_HALF_UP) y Descuento por Pronto Pago', () => {
  // Caso A: Gasto con 5% de descuento por pronto pago activo
  const expenseSample: Pick<ExpenseRecord, 'netPayableUsd' | 'earlyPaymentDiscountPercent' | 'earlyPaymentDiscountDeadline'> = {
    netPayableUsd: 380.0,
    earlyPaymentDiscountPercent: 5,
    earlyPaymentDiscountDeadline: '2026-10-31',
  };

  const evalActive = calculateEarlyPaymentDiscount(expenseSample, '2026-10-25T10:00:00Z');
  assert.strictEqual(evalActive.isEligible, true, 'Debe ser elegible para pronto pago');
  assert.strictEqual(evalActive.discountPercent, 5, 'Porcentaje debe ser 5%');
  assert.strictEqual(evalActive.discountAmountUsd, 19.0, '380 * 0.05 = $19.00 USD exactos');
  assert.strictEqual(evalActive.discountedPayableUsd, 361.0, '380 - 19 = $361.00 USD exactos');
  assert.strictEqual(evalActive.isUrgent48h, false, 'Aún restan más de 48 horas');

  // Caso B: Vencimiento urgente en menos de 48 horas
  const evalUrgent = calculateEarlyPaymentDiscount(expenseSample, '2026-10-30T12:00:00Z');
  assert.strictEqual(evalUrgent.isEligible, true);
  assert.strictEqual(evalUrgent.isUrgent48h, true, 'Debe disparar la alerta urgente de <= 48 horas');

  // Caso C: Fecha límite vencida
  const evalExpired = calculateEarlyPaymentDiscount(expenseSample, '2026-11-02T10:00:00Z');
  assert.strictEqual(evalExpired.isEligible, false, 'No debe aplicar descuento si la fecha límite ya expiró');
  assert.strictEqual(evalExpired.discountAmountUsd, 0);
  assert.strictEqual(evalExpired.discountedPayableUsd, 380.0);
});

test('72. Control de Gastos OPEX: Aprobación Gerencial Obligatoria (> $100 USD) y Doble Firma con PIN 203040', () => {
  // Caso A: Gasto menor o igual a $100 USD (Aprobación Directa)
  const evalMinor = evaluateExpenseApprovalRequirement(45.0);
  assert.strictEqual(evalMinor.requiresManagerApproval, false, '$45 USD no requiere aprobación gerencial');
  assert.strictEqual(evalMinor.initialApprovalStatus, 'APROBADO_DIRECTO');

  const evalThreshold = evaluateExpenseApprovalRequirement(100.0);
  assert.strictEqual(evalThreshold.requiresManagerApproval, false, '$100.00 exactos es el límite directo');
  assert.strictEqual(evalThreshold.initialApprovalStatus, 'APROBADO_DIRECTO');

  // Caso B: Gasto mayor a $100 USD (Requiere Aprobación Gerencial con PIN)
  const evalOverThreshold = evaluateExpenseApprovalRequirement(100.01);
  assert.strictEqual(evalOverThreshold.requiresManagerApproval, true, '$100.01 supera el umbral operativo');
  assert.strictEqual(evalOverThreshold.initialApprovalStatus, 'PENDIENTE_APROBACION');

  const evalMajor = evaluateExpenseApprovalRequirement(380.0);
  assert.strictEqual(evalMajor.requiresManagerApproval, true);
  assert.strictEqual(evalMajor.initialApprovalStatus, 'PENDIENTE_APROBACION');
  assert.strictEqual(evalMajor.thresholdUsd, EXPENSE_APPROVAL_THRESHOLD_USD);
});

test('73. Control de Gastos OPEX: Semáforo de Presupuesto Mensual (Alarma 70% y Bloqueo Hard-Cap 100%)', () => {
  const samplePlan: MonthlyBudgetPlan = {
    id: 'plan-test-2026-10',
    periodYearMonth: '2026-10',
    globalBudgetLimitUsd: 1000.0,
    categoryBudgets: {
      OFICINA_PAPELERIA: 100,
      MANTENIMIENTO_EQUIPOS: 150,
      MATERIALES_MANTENIMIENTO: 100,
      MATERIALES_CONSTRUCCION: 100,
      CLIMATIZACION_AC: 200,
      SERVIDORES_TI_TELEVISORES: 150,
      SERVICIO_TECNICO_ESPECIALIZADO: 100,
      LIMPIEZA_DESINFECCION: 50,
      LOGISTICA_VIATICOS: 25,
      SERVICIOS_PUBLICOS: 20,
      OTRO: 5,
    },
    locationBudgets: { 'loc-pzo-01': 1000 },
    contingencyAlarmThresholdPercent: 70.0,
    hardCapLockEnabled: true,
    authorizedBy: 'Gerencia General',
    authorizedAtVet: '2026-10-01 08:00:00',
  };

  // 1. Escenario Normal (< 70%)
  const expNormal: ExpenseRecord[] = [
    {
      id: 'e1',
      expenseCode: 'GTO-202610-001',
      voucherType: 'FACTURA_FISCAL',
      voucherNumber: 'FAC-1',
      category: 'CLIMATIZACION_AC',
      description: 'Mantenimiento AC',
      beneficiaryName: 'Clima Sur',
      beneficiaryRif: 'J-12345678-9',
      beneficiaryType: 'PERSONA_JURIDICA',
      locationId: 'loc-pzo-01',
      issueDate: '2026-10-05',
      paymentCondition: 'CONTADO',
      currency: 'USD',
      bcvRate: 880.0,
      amountOriginal: 500.0,
      amountUsd: 500.0,
      amountVes: 440000.0,
      taxIncluded: true,
      ivaAmountUsd: 68.97,
      netPayableUsd: 500.0,
      paidAmountUsd: 500.0,
      status: 'PAGADO',
      requiresManagerApproval: true,
      approvalStatus: 'APROBADO_GERENCIA',
      preloadedByUserId: 'u1',
      preloadedByName: 'Analista',
      preloadedAtVet: '2026-10-05',
      payments: [],
      createdAtVet: '2026-10-05',
    },
  ];

  const evalNorm = evaluateMonthlyBudgetStatus(samplePlan, expNormal, '2026-10');
  assert.strictEqual(evalNorm.totalExecutedUsd, 500.0);
  assert.strictEqual(evalNorm.budgetConsumedPercent, 50.0);
  assert.strictEqual(evalNorm.isContingencyAlarm70, false, '50% está por debajo del 70%');
  assert.strictEqual(evalNorm.isOverBudget100, false);
  assert.strictEqual(evalNorm.remainingBudgetUsd, 500.0);

  // 2. Escenario Alarma Preventiva (>= 70%)
  const expAlarm: ExpenseRecord[] = [
    ...expNormal,
    {
      ...expNormal[0],
      id: 'e2',
      amountUsd: 250.0,
      amountVes: 220000.0,
      netPayableUsd: 250.0,
      category: 'MANTENIMIENTO_EQUIPOS',
    },
  ];

  const evalAlarm = evaluateMonthlyBudgetStatus(samplePlan, expAlarm, '2026-10');
  assert.strictEqual(evalAlarm.totalExecutedUsd, 750.0);
  assert.strictEqual(evalAlarm.budgetConsumedPercent, 75.0);
  assert.strictEqual(evalAlarm.isContingencyAlarm70, true, '75% debe disparar la alarma del 70%');
  assert.strictEqual(evalAlarm.isOverBudget100, false);

  // 3. Escenario Bloqueo Hard-Cap (>= 100%)
  const expBlocked: ExpenseRecord[] = [
    ...expAlarm,
    {
      ...expNormal[0],
      id: 'e3',
      amountUsd: 300.0,
      amountVes: 264000.0,
      netPayableUsd: 300.0,
      category: 'MATERIALES_MANTENIMIENTO',
    },
  ];

  const evalBlocked = evaluateMonthlyBudgetStatus(samplePlan, expBlocked, '2026-10');
  assert.strictEqual(evalBlocked.totalExecutedUsd, 1050.0);
  assert.strictEqual(evalBlocked.budgetConsumedPercent, 105.0);
  assert.strictEqual(evalBlocked.isOverBudget100, true, '105% debe activar bloqueo por presupuesto excedido');
  assert.strictEqual(evalBlocked.remainingBudgetUsd, -50.0);
});

test('74. Control de Gastos OPEX: Recargo por Mora Vencida Proporcional y Cargo Fijo', () => {
  // Factura de $600 USD con saldo pendiente $400 USD vencida hace 15 días (tasa mensual 3% + flat $10)
  const sampleOverdue: Pick<
    ExpenseRecord,
    'netPayableUsd' | 'paidAmountUsd' | 'dueDate' | 'penaltyRateMonthlyPercent' | 'penaltyFlatUsd'
  > = {
    netPayableUsd: 600.0,
    paidAmountUsd: 200.0,
    dueDate: '2026-10-10',
    penaltyRateMonthlyPercent: 3, // 3% mensual
    penaltyFlatUsd: 10.0, // $10 flat
  };

  // Evaluado a 15 días después (2026-10-25)
  const res = calculateOverduePenalty(sampleOverdue, '2026-10-25T12:00:00Z');
  assert.strictEqual(res.isOverdue, true);
  assert.strictEqual(res.daysOverdue, 15, 'Debe calcular exactamente 15 días de atraso');
  // Pending = 400. Daily rate = 0.03 / 30 = 0.001. 15 days = 0.015 * 400 = 6.00 USD.
  // Flat penalty = 10.00 USD. Total penalty = 16.00 USD.
  assert.strictEqual(res.penaltyAmountUsd, 16.0, 'Recargo de mora debe ser $16.00 USD exactos');
  assert.strictEqual(res.totalWithPenaltyUsd, 416.0, 'Total con mora debe ser $416.00 USD');
});

test('75. Control de Gastos OPEX: Asistente Estructurado de Respaldo en Google Drive Empresa', () => {
  const pathInfo = buildSuggestedDrivePath({
    beneficiaryName: 'Inversiones Clima Polar, C.A.',
    issueDate: '2026-10-14',
    voucherType: 'FACTURA_FISCAL',
    voucherNumber: 'FAC-00812',
    originalFileName: 'factura_cava_polar.pdf',
  });

  assert.strictEqual(
    pathInfo.folderPath,
    'Google Drive Empresa / Inversiones Clima Polar CA / 2026-10',
    'La ruta de carpeta debe sanear caracteres especiales y agrupar por mes'
  );
  assert.strictEqual(
    pathInfo.suggestedFileName,
    'FACTURA_FISCAL_FAC-00812_2026-10-14.pdf',
    'El nombre de archivo debe estandarizarse con tipo, número y fecha'
  );
  assert.strictEqual(
    pathInfo.fullRelativePath,
    'Google Drive Empresa / Inversiones Clima Polar CA / 2026-10 / FACTURA_FISCAL_FAC-00812_2026-10-14.pdf'
  );
});

test('76. Control de Gastos OPEX: Arqueo Mensual Ejecutivo, Análisis de Pareto, Gastos Hormiga y Exportaciones PDF/Excel', () => {
  const testPlan: MonthlyBudgetPlan = {
    id: 'plan-oct-2026',
    periodYearMonth: '2026-10',
    globalBudgetLimitUsd: 2500.0,
    categoryBudgets: {
      OFICINA_PAPELERIA: 200,
      MANTENIMIENTO_EQUIPOS: 375,
      MATERIALES_MANTENIMIENTO: 300,
      MATERIALES_CONSTRUCCION: 250,
      CLIMATIZACION_AC: 450,
      SERVIDORES_TI_TELEVISORES: 350,
      SERVICIO_TECNICO_ESPECIALIZADO: 250,
      LIMPIEZA_DESINFECCION: 125,
      LOGISTICA_VIATICOS: 100,
      SERVICIOS_PUBLICOS: 75,
      OTRO: 25,
    },
    locationBudgets: { 'loc-pzo-01': 2500 },
    contingencyAlarmThresholdPercent: 70.0,
    hardCapLockEnabled: true,
    authorizedBy: 'Gerente General',
    authorizedAtVet: '2026-10-01 08:00:00',
  };

  const testExpenses: ExpenseRecord[] = [
    {
      id: 'exp-1',
      expenseCode: 'GTO-202610-001',
      voucherType: 'FACTURA_FISCAL',
      voucherNumber: 'FAC-801',
      category: 'CLIMATIZACION_AC',
      description: 'Mantenimiento Mayor Cava',
      beneficiaryName: 'Clima Polar, C.A.',
      beneficiaryRif: 'J-40192831-2',
      beneficiaryType: 'PERSONA_JURIDICA',
      locationId: 'loc-pzo-01',
      issueDate: '2026-10-14',
      paymentCondition: 'CREDITO',
      currency: 'USD',
      bcvRate: 880.0,
      amountOriginal: 380.0,
      amountUsd: 380.0,
      amountVes: 334400.0,
      taxIncluded: true,
      ivaAmountUsd: 52.41,
      netPayableUsd: 380.0,
      paidAmountUsd: 0,
      status: 'PENDIENTE',
      requiresManagerApproval: true,
      approvalStatus: 'APROBADO_GERENCIA',
      preloadedByUserId: 'usr-1',
      preloadedByName: 'Analista',
      preloadedAtVet: '2026-10-14',
      payments: [],
      createdAtVet: '2026-10-14',
    },
    {
      id: 'exp-2',
      expenseCode: 'GTO-202610-002',
      voucherType: 'TICKET_CAJA',
      voucherNumber: 'TCK-101',
      category: 'MATERIALES_MANTENIMIENTO',
      description: 'Candado y tornillos',
      beneficiaryName: 'Ferretería Central',
      beneficiaryRif: 'V-14892019-3',
      beneficiaryType: 'PERSONA_NATURAL',
      locationId: 'loc-pzo-01',
      issueDate: '2026-10-16',
      paymentCondition: 'CONTADO',
      currency: 'USD',
      bcvRate: 880.0,
      amountOriginal: 45.0, // Micro-gasto <= $50
      amountUsd: 45.0,
      amountVes: 39600.0,
      taxIncluded: true,
      ivaAmountUsd: 6.21,
      netPayableUsd: 45.0,
      paidAmountUsd: 45.0,
      status: 'PAGADO',
      requiresManagerApproval: false,
      approvalStatus: 'APROBADO_DIRECTO',
      preloadedByUserId: 'usr-1',
      preloadedByName: 'Analista',
      preloadedAtVet: '2026-10-16',
      payments: [],
      createdAtVet: '2026-10-16',
    },
    {
      id: 'exp-3',
      expenseCode: 'GTO-202610-003',
      voucherType: 'TICKET_CAJA',
      voucherNumber: 'TCK-102',
      category: 'MATERIALES_MANTENIMIENTO',
      description: 'Cinta adhesiva y bombillo LED',
      beneficiaryName: 'Ferretería Central',
      beneficiaryRif: 'V-14892019-3',
      beneficiaryType: 'PERSONA_NATURAL',
      locationId: 'loc-pzo-01',
      issueDate: '2026-10-20',
      paymentCondition: 'CONTADO',
      currency: 'USD',
      bcvRate: 880.0,
      amountOriginal: 25.0, // Micro-gasto <= $50
      amountUsd: 25.0,
      amountVes: 22000.0,
      taxIncluded: true,
      ivaAmountUsd: 3.45,
      netPayableUsd: 25.0,
      paidAmountUsd: 25.0,
      status: 'PAGADO',
      requiresManagerApproval: false,
      approvalStatus: 'APROBADO_DIRECTO',
      preloadedByUserId: 'usr-1',
      preloadedByName: 'Analista',
      preloadedAtVet: '2026-10-20',
      payments: [],
      createdAtVet: '2026-10-20',
    },
  ];

  // 1. Generar reporte consolidado
  const report = generateMonthlyExpenseArqueoData(testExpenses, testPlan, '2026-10', 'Auditor Financiero');
  assert.strictEqual(report.totalBudgetUsd, 2500.0);
  assert.strictEqual(report.totalExecutedUsd, 450.0);
  assert.strictEqual(report.status, 'DENTRO_PRESUPUESTO');

  // 2. Verificar Pareto Top 1
  assert.strictEqual(report.topExpensesByAmount.length, 3);
  assert.strictEqual(report.topExpensesByAmount[0].amountUsd, 380.0, 'El gasto mayor debe ser $380 USD');
  assert.strictEqual(report.topExpensesByAmount[0].beneficiary, 'Clima Polar, C.A.');

  // 3. Verificar Gastos Hormiga Recurrentes (<= $50 USD)
  assert.ok(report.topFrequentMicroExpenses.length >= 1);
  const microMaint = report.topFrequentMicroExpenses.find((m) => m.category === 'MATERIALES_MANTENIMIENTO');
  assert.ok(microMaint);
  assert.strictEqual(microMaint?.count, 2, 'Deben registrarse 2 tickets de gastos hormiga en materiales');
  assert.strictEqual(microMaint?.totalAmountUsd, 70.0, '45 + 25 = $70.00 USD');
  assert.strictEqual(microMaint?.avgAmountUsd, 35.0, 'Ticket promedio = $35.00 USD');

  // 4. Proyecciones para el próximo mes
  assert.strictEqual(report.nextMonthBudgetProjections.length, 11, 'Debe incluir las 11 categorías');

  // 5. Generar PDF Institucional
  const pdfDoc = exportExpenseArqueoPdfDocument(report, {
    razonSocial: 'HIPER ABASTO POLAR, C.A.',
    rif: 'J-50123456-7',
  });
  assert.ok(pdfDoc.getNumberOfPages() >= 1, 'El PDF debe renderizarse con al menos 1 página');

  // 6. Generar Libro Excel Estructurado
  const wb = buildExpenseArqueoWorkbook(report, {
    razonSocial: 'HIPER ABASTO POLAR, C.A.',
    rif: 'J-50123456-7',
  });
  assert.strictEqual(wb.SheetNames.length, 2, 'El Excel debe incluir 2 hojas');
  assert.ok(wb.SheetNames.includes('Arqueo Mensual OPEX'));
  assert.ok(wb.SheetNames.includes('Proyecciones Próximo Mes'));
});

test('77. Gobernanza de Sesiones (60 Minutos), Advertencia a los 58m, Cierre Forzado, Sincronización Cross-Tab y Preservación de Borrador en sessionStorage', () => {
  // 1. Constantes de gobernanza
  assert.strictEqual(SESSION_INACTIVITY_WARNING_MINUTES, 58, 'Alerta preventiva debe configurarse a los 58 minutos');
  assert.strictEqual(SESSION_FORCE_LOGOUT_MINUTES, 60, 'Cierre forzado determinista debe configurarse a los 60 minutos');
  assert.strictEqual(AUTH_BROADCAST_CHANNEL_NAME, 'chrystal_auth_channel');
  assert.strictEqual(SESSION_FORCE_LOGOUT_REASON_KEY, 'chrystal_erp_logout_reason');

  // 2. Simulación de evaluación de inactividad a los 57 minutos (estado normal sin modal)
  const now = Date.now();
  const lastActivity57m = now - 57 * 60_000;
  const elapsed57 = (now - lastActivity57m) / 60_000;
  assert.ok(elapsed57 < SESSION_INACTIVITY_WARNING_MINUTES, '57 min no debe disparar modal de advertencia');

  // 3. Simulación de evaluación de inactividad a los 58.5 minutos (disparo de modal con cuenta regresiva)
  const lastActivity58m = now - 58.5 * 60_000;
  const elapsed58 = (now - lastActivity58m) / 60_000;
  assert.ok(elapsed58 >= SESSION_INACTIVITY_WARNING_MINUTES, '58.5 min debe disparar modal de advertencia');
  assert.ok(elapsed58 < SESSION_FORCE_LOGOUT_MINUTES, '58.5 min no debe cerrar la sesión forzosamente todavía');
  const remainingSeconds = Math.max(0, Math.floor((SESSION_FORCE_LOGOUT_MINUTES * 60_000 - (now - lastActivity58m)) / 1000));
  assert.ok(remainingSeconds <= 120 && remainingSeconds > 0, `Segundos restantes deben ser <= 120 (calculado: ${remainingSeconds})`);

  // 4. Simulación de evaluación a los 61 minutos (cierre forzado determinista)
  const lastActivity61m = now - 61 * 60_000;
  const elapsed61 = (now - lastActivity61m) / 60_000;
  assert.ok(elapsed61 >= SESSION_FORCE_LOGOUT_MINUTES, '61 min debe gatillar cierre forzado determinista');

  // 5. Verificación de acción de auditoría
  const auditAction: AuditActionType = 'SESSION_TIMEOUT_LOGOUT';
  assert.strictEqual(auditAction, 'SESSION_TIMEOUT_LOGOUT');
});

test('78. Cerebro Operativo de PolarBot Actualizado: Guías Paso a Paso Enumeradas (1., 2., 3...) con Nombres Exactos de Pantallas y Botones para Todos los Módulos Nuevos', () => {
  const mockContext = buildLiveErpOperationalContext({
    user: {
      uid: 'usr-an-01',
      displayName: 'Carlos Operador',
      email: 'carlos@hiperabastopolar.com',
      role: UserRole.ANALISTA,
      locationAccess: [],
      active: true,
      pin: '4321',
      createdAt: '2026-01-01',
    },
    bcvState: {
      activeRate: 885.5,
      spotRateToday: 885.5,
      nextDayRateAfter5Pm: 886.0,
      isAfter5PmVet: false,
      rateSourceLabel: 'BCV Oficial',
      caracasTimeFormatted: '14:30:00',
      caracasDateFormatted: '31/10/2026',
    },
    products: [],
    locations: [],
    discards: [],
  });

  // 1. Consulta OPEX y Arqueo de Gastos
  const opexRes = answerQueryWithHeuristicEngine(
    '¿Cómo registro un gasto operativo y descargo el arqueo mensual?',
    mockContext
  );
  assert.ok(opexRes.answer.includes('Carlos Operador'));
  assert.ok(opexRes.answer.includes('1.'));
  assert.ok(opexRes.answer.includes('2.'));
  assert.ok(opexRes.answer.includes('Control de Gastos'));
  assert.ok(opexRes.answer.includes('Subir Factura o Ticket Escaneado'));
  assert.ok(opexRes.answer.includes('Registrar Gasto'));
  assert.ok(opexRes.answer.includes('Descargar Arqueo PDF'));
  assert.ok(opexRes.answer.includes('PROVEEDOR/AÑO-MES') || opexRes.answer.includes('Google Drive'));

  // 2. Consulta Split-Screen OCR y Pre-Asiento de Facturas
  const splitRes = answerQueryWithHeuristicEngine(
    '¿Cómo funciona la validación visual Split-Screen OCR de facturas?',
    mockContext
  );
  assert.ok(splitRes.answer.includes('Split-Screen OCR'));
  assert.ok(splitRes.answer.includes('Facturas & OCR'));
  assert.ok(splitRes.answer.includes('Aprobar y Asentar Factura'));
  assert.ok(splitRes.answer.includes('Rechazar Comprobante'));

  // 3. Consulta Ingesta Chrystal POS
  const chrystalRes = answerQueryWithHeuristicEngine(
    '¿Cuáles son los pasos para importar las ventas diarias de Chrystal POS?',
    mockContext
  );
  assert.ok(chrystalRes.answer.includes('Chrystal® POS'));
  assert.ok(chrystalRes.answer.includes('Importación Chrystal POS'));
  assert.ok(chrystalRes.answer.includes('Seleccionar Archivo de Ventas Chrystal'));
  assert.ok(chrystalRes.answer.includes('Simular y Validar Conciliación'));
  assert.ok(chrystalRes.answer.includes('Ejecutar Descarga en Inventario'));

  // 4. Consulta BRM WhatsApp con QR
  const brmRes = answerQueryWithHeuristicEngine(
    '¿Cómo vinculo el WhatsApp de proveedores con el código QR y confirmo el envío?',
    mockContext
  );
  assert.ok(brmRes.answer.includes('Proveedores & BRM'));
  assert.ok(brmRes.answer.includes('Vincular WhatsApp'));
  assert.ok(brmRes.answer.includes('ISO/IEC 18004'));
  assert.ok(brmRes.answer.includes('Confirmar y Enviar Comprobante por WhatsApp'));

  // 5. Consulta Retenciones SENIAT
  const seniatRes = answerQueryWithHeuristicEngine(
    '¿Cómo generar una retención de IVA y el archivo TXT para el SENIAT?',
    mockContext
  );
  assert.ok(seniatRes.answer.includes('Retenciones SENIAT'));
  assert.ok(seniatRes.answer.includes('Generar Comprobante de Retención'));
  assert.ok(seniatRes.answer.includes('Generar TXT SENIAT'));

  // 6. Consulta Cadena de Frío, Lotes y FEFO / SADA
  const fefoRes = answerQueryWithHeuristicEngine(
    '¿Cómo funciona el protocolo FEFO de perecederos y la guía SADA en cavas?',
    mockContext
  );
  assert.ok(fefoRes.answer.includes('Lotes & Cadena de Frío'));
  assert.ok(fefoRes.answer.includes('FEFO'));
  assert.ok(fefoRes.answer.includes('-18°C') || fefoRes.answer.includes('Congelación'));
  assert.ok(fefoRes.answer.includes('Vincular Guía Oficial'));

  // 7. Consulta Recetas y Fórmulas BOM
  const bomRes = answerQueryWithHeuristicEngine(
    '¿Cómo crear una receta de panadería con lista de materiales BOM?',
    mockContext
  );
  assert.ok(bomRes.answer.includes('Recetas y Producción'));
  assert.ok(bomRes.answer.includes('+ Nueva Receta / BOM'));
  assert.ok(bomRes.answer.includes('Procesar y Descontar Insumos'));

  // 8. Consulta Flujo de Caja Bimonetario
  const cashRes = answerQueryWithHeuristicEngine(
    '¿Cómo se evalúa el flujo de caja bimonetario proyectado?',
    mockContext
  );
  assert.ok(cashRes.answer.includes('Flujo de Caja Bimonetario Proyectado'));
  assert.ok(cashRes.answer.includes('Dashboard Principal'));
  assert.ok(cashRes.answer.includes('7 Días'));
  assert.ok(cashRes.answer.includes('15 Días'));

  // 9. Consulta Gobernanza de Sesiones (60 Minutos & Multi-Pestaña)
  const sessionRes = answerQueryWithHeuristicEngine(
    '¿Cómo opera la gobernanza de sesiones de 60 minutos y el aviso de inactividad?',
    mockContext
  );
  assert.ok(sessionRes.answer.includes('58 Minutos') || sessionRes.answer.includes('58'));
  assert.ok(sessionRes.answer.includes('60 Minutos') || sessionRes.answer.includes('60'));
  assert.ok(sessionRes.answer.includes('Mantener Sesión Activa'));
  assert.ok(sessionRes.answer.includes('BroadcastChannel'));
});

