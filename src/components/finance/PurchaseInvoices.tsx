import React, { useState, useRef } from 'react';
import {
  ScanLine,
  Lock,
  CheckCircle2,
  AlertOctagon,
  Sparkles,
  FilePlus2,
  Cpu,
  Upload,
  FileText,
  Image as ImageIcon,
  Fingerprint,
  Eye,
  Plus,
  Trash2,
  X,
  ShieldCheck,
  FileDown,
  Receipt,
} from 'lucide-react';
import { useFinance } from '../../context/FinanceContext';
import { useInventory } from '../../context/InventoryContext';
import { useUIConfig } from '../../context/UIConfigContext';
import { useAuth } from '../../context/AuthContext';
import {
  OcrEngineMode,
  PurchaseInvoiceLine,
  PurchaseInvoice,
  IndexedInvoiceAttachment,
  StorageZone,
  TaxRetentionVoucher,
} from '../../types';
import {
  runForensicOcrAudit,
  simulateDualEngineOcrExtraction,
  extractHeuristicInvoiceFromUploadedFile,
} from '../../lib/ocr';
import {
  ISLR_CONCEPTS_CATALOG,
  calculateInvoiceRetentions,
} from '../../lib/fiscal-retentions';
import { exportRetentionVoucherPdf } from '../../lib/retention-pdf';
import { applyStockDeltaToZone } from '../../lib/shelf-stock';
import { formatUsd, formatVes, round2, toDecimal } from '../../lib/decimal';
import { getCaracasNow } from '../../lib/bcv';

export const PurchaseInvoices: React.FC = () => {
  const { invoices, suppliers, retentionVouchers, bcvState, registerOcrInvoice } = useFinance();
  const { locations, products, addOrUpdateProduct, logAuditEvent } = useInventory();
  const { config } = useUIConfig();
  const { user } = useAuth();

  const [engineMode, setEngineMode] = useState<OcrEngineMode>('GEMINI_VISION_PRO');
  const [scenario, setScenario] = useState<
    'VALID_POLAR' | 'TAMPERED_DISCREPANCY' | 'UPLOADED_FILE'
  >('VALID_POLAR');

  const initialSample = simulateDualEngineOcrExtraction(
    'GEMINI_VISION_PRO',
    'VALID_POLAR'
  );

  const [invoiceNumber, setInvoiceNumber] = useState(initialSample.invoiceNumber);
  const [controlNumber, setControlNumber] = useState(initialSample.controlNumber);
  const [supplierId, setSupplierId] = useState(suppliers[0]?.id || 'sup-001');
  const [locationId, setLocationId] = useState('loc-pzo-01');
  const [lines, setLines] = useState<PurchaseInvoiceLine[]>(initialSample.lines);
  const [subtotalUsd, setSubtotalUsd] = useState(String(initialSample.subtotalUsd));
  const [ivaAmountUsd, setIvaAmountUsd] = useState(String(initialSample.ivaAmountUsd));
  const [igtfAmountUsd, setIgtfAmountUsd] = useState(String(initialSample.igtfAmountUsd));
  const [totalUsd, setTotalUsd] = useState(String(initialSample.totalUsd));
  const [destinationZone, setDestinationZone] = useState<StorageZone>('DEPOSITO');
  const [ivaUndiscriminated, setIvaUndiscriminated] = useState(false);
  const [hasFormalDefects, setHasFormalDefects] = useState(false);
  const [lastEmittedVouchers, setLastEmittedVouchers] = useState<{
    ivaVoucher: TaxRetentionVoucher | null;
    islrVoucher: TaxRetentionVoucher | null;
  } | null>(null);

  // Uploaded Document State (Image or PDF)
  const [uploadedAttachment, setUploadedAttachment] =
    useState<IndexedInvoiceAttachment | null>({
      fileName: 'Factura_Polar_FAC-2026-08914.pdf',
      mimeType: 'application/pdf',
      fileSize: 148200,
      sha256Hash:
        '8f434346648f6b96df89dda901c5176b10a6d83961dd3c1ac88b59b2dc327aa4',
      verdict: 'AUTENTICO_ALTA_CONFIANZA',
      indexedAtVet: getCaracasNow().isoTimestamp,
    });
  const [isProcessingUpload, setIsProcessingUpload] = useState(false);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [previewModalInvoice, setPreviewModalInvoice] =
    useState<PurchaseInvoice | null>(null);
  const [commitMessage, setCommitMessage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const existingHashes = invoices
    .map((inv) => inv.attachment?.sha256Hash)
    .filter((h): h is string => Boolean(h));

  const processSelectedFile = async (file: File) => {
    setIsProcessingUpload(true);
    setCommitMessage(null);
    setLastEmittedVouchers(null);
    setScenario('UPLOADED_FILE');

    try {
      const dataUrl: string = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('No se pudo leer el archivo.'));
        reader.readAsDataURL(file);
      });

      const base64Data = dataUrl.includes(',') ? dataUrl.split(',')[1] : '';
      const mimeType =
        file.type ||
        (file.name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/png');

      let extractedData: {
        invoiceNumber: string;
        controlNumber: string;
        supplierName: string;
        supplierRif: string;
        lines: PurchaseInvoiceLine[];
        subtotalUsd: number;
        ivaAmountUsd: number;
        igtfAmountUsd: number;
        totalUsd: number;
        sha256Hash: string;
        verdict:
          | 'AUTENTICO_ALTA_CONFIANZA'
          | 'ALERTA_FRAUDE_EDICION_O_IA'
          | 'DUPLICADO_DETECTADO';
      } | null = null;

      try {
        const res = await fetch('/api/ocr/extract', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fileName: file.name,
            fileSize: file.size,
            mimeType,
            base64Data,
            engine: engineMode,
            existingHashes,
          }),
        });
        if (res.ok) {
          extractedData = await res.json();
        }
      } catch {
        // Fallback to local deterministic extractor
      }

      if (!extractedData) {
        extractedData = extractHeuristicInvoiceFromUploadedFile({
          fileName: file.name,
          fileSize: file.size,
          mimeType,
          existingHashes,
        });
      }

      setInvoiceNumber(extractedData.invoiceNumber);
      setControlNumber(extractedData.controlNumber);

      // Match supplier by RIF or Name if exists
      const matchedSupplier = suppliers.find(
        (s) =>
          s.rif.toLowerCase() === extractedData?.supplierRif.toLowerCase() ||
          s.name.toLowerCase().includes(extractedData?.supplierName.toLowerCase().slice(0, 8) || '')
      );
      if (matchedSupplier) {
        setSupplierId(matchedSupplier.id);
      }

      setLines(extractedData.lines);
      setSubtotalUsd(String(extractedData.subtotalUsd));
      setIvaAmountUsd(String(extractedData.ivaAmountUsd));
      setIgtfAmountUsd(String(extractedData.igtfAmountUsd));
      setTotalUsd(String(extractedData.totalUsd));

      setUploadedAttachment({
        fileName: file.name,
        mimeType,
        fileSize: file.size,
        sha256Hash: extractedData.sha256Hash,
        dataUrl: mimeType.startsWith('image/') ? dataUrl : undefined,
        verdict: extractedData.verdict,
        indexedAtVet: getCaracasNow().isoTimestamp,
      });

      setCommitMessage(
        `Documento "${file.name}" (${(file.size / 1024).toFixed(1)} KB) escaneado y pre-indexado por ${engineMode}. Verifique los 4 Candados para asentar en el sistema.`
      );
    } finally {
      setIsProcessingUpload(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await processSelectedFile(file);
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDraggingOver(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    await processSelectedFile(file);
  };

  const handleRunOcrSimulation = (
    chosenScenario: 'VALID_POLAR' | 'TAMPERED_DISCREPANCY'
  ) => {
    setScenario(chosenScenario);
    const extracted = simulateDualEngineOcrExtraction(engineMode, chosenScenario);
    setInvoiceNumber(extracted.invoiceNumber);
    setControlNumber(extracted.controlNumber);
    setLines(extracted.lines);
    setSubtotalUsd(String(extracted.subtotalUsd));
    setIvaAmountUsd(String(extracted.ivaAmountUsd));
    setIgtfAmountUsd(String(extracted.igtfAmountUsd));
    setTotalUsd(String(extracted.totalUsd));
    setUploadedAttachment({
      fileName:
        chosenScenario === 'VALID_POLAR'
          ? 'Factura_Polar_FAC-2026-08914.pdf'
          : 'Factura_Alterada_FAC-ERR-99201.jpg',
      mimeType:
        chosenScenario === 'VALID_POLAR' ? 'application/pdf' : 'image/jpeg',
      fileSize: chosenScenario === 'VALID_POLAR' ? 148200 : 94300,
      sha256Hash:
        chosenScenario === 'VALID_POLAR'
          ? '8f434346648f6b96df89dda901c5176b10a6d83961dd3c1ac88b59b2dc327aa4'
          : 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      verdict:
        chosenScenario === 'VALID_POLAR'
          ? 'AUTENTICO_ALTA_CONFIANZA'
          : 'ALERTA_FRAUDE_EDICION_O_IA',
      indexedAtVet: getCaracasNow().isoTimestamp,
    });
    setCommitMessage(null);
    setLastEmittedVouchers(null);
  };

  const handleLineChange = (
    lineId: string,
    field: 'sku' | 'description' | 'quantity' | 'unitCostUsd' | 'lineTotalUsd',
    value: string
  ) => {
    setLines((prev) =>
      prev.map((ln) => {
        if (ln.id !== lineId) return ln;
        if (field === 'sku' || field === 'description') {
          return { ...ln, [field]: value };
        }
        const num = parseFloat(value) || 0;
        const updated = { ...ln, [field]: num };
        if (field === 'quantity' || field === 'unitCostUsd') {
          updated.lineTotalUsd = round2(
            toDecimal(updated.quantity).times(updated.unitCostUsd)
          );
        }
        return updated;
      })
    );
  };

  const handleLineFiscalChange = (
    lineId: string,
    patch: Partial<Pick<PurchaseInvoiceLine, 'ivaRate' | 'lineType' | 'islrConceptCode'>>
  ) => {
    setLines((prev) =>
      prev.map((ln) => {
        if (ln.id !== lineId) return ln;
        const nextLine = { ...ln, ...patch };
        if (patch.lineType === 'SERVICIO' && !nextLine.islrConceptCode) {
          nextLine.islrConceptCode = ISLR_CONCEPTS_CATALOG[0]?.code || 'SRV-FLETE';
        }
        if (patch.lineType === 'BIEN') {
          nextLine.islrConceptCode = undefined;
        }
        return nextLine;
      })
    );
  };

  const handleSyncTotalsFromLines = () => {
    const fixedLines = lines.map((ln) => ({
      ...ln,
      lineTotalUsd: round2(toDecimal(ln.quantity).times(ln.unitCostUsd)),
    }));
    const newSub = round2(
      fixedLines.reduce((acc, l) => acc.plus(l.lineTotalUsd), toDecimal(0))
    );
    const computedIva = round2(
      fixedLines.reduce(
        (acc, l) => acc.plus(toDecimal(l.lineTotalUsd).times((l.ivaRate ?? 0) / 100)),
        toDecimal(0)
      )
    );
    const igtf = round2(parseFloat(igtfAmountUsd) || 0);
    const newTot = round2(toDecimal(newSub).plus(computedIva).plus(igtf));

    setLines(fixedLines);
    setSubtotalUsd(String(newSub));
    setIvaAmountUsd(String(computedIva));
    setTotalUsd(String(newTot));
  };

  const handleAddLine = () => {
    const defaultProd = products[0];
    const newLine: PurchaseInvoiceLine = {
      id: `ln-manual-${Date.now()}`,
      sku: defaultProd?.sku || 'HAR-PAN-1KG',
      description: defaultProd?.name || 'Nuevo Ítem Facturado',
      quantity: 10,
      unitCostUsd: defaultProd?.costUsd || 1.0,
      lineTotalUsd: round2(toDecimal(10).times(defaultProd?.costUsd || 1.0)),
      ivaRate: defaultProd?.ivaRate ?? 16,
      lineType: 'BIEN',
    };
    const nextLines = [...lines, newLine];
    setLines(nextLines);
  };

  const handleRemoveLine = (lineId: string) => {
    if (lines.length <= 1) return;
    setLines((prev) => prev.filter((l) => l.id !== lineId));
  };

  const liveAudit = runForensicOcrAudit({
    lines,
    declaredSubtotalUsd: parseFloat(subtotalUsd) || 0,
    declaredIvaUsd: parseFloat(ivaAmountUsd) || 0,
    declaredIgtfUsd: parseFloat(igtfAmountUsd) || 0,
    declaredTotalUsd: parseFloat(totalUsd) || 0,
  });

  const selectedSupplier = suppliers.find((s) => s.id === supplierId) || suppliers[0];

  const retentionPreview = calculateInvoiceRetentions({
    invoice: {
      id: 'preview-inv',
      invoiceNumber,
      controlNumber,
      supplierId: selectedSupplier?.id || 'sup-001',
      supplierName: selectedSupplier?.name || 'Proveedor',
      supplierRif: selectedSupplier?.rif || 'J-00000000-0',
      locationId,
      issueDate: getCaracasNow().dateString,
      dueDate: '2026-04-25',
      currency: 'USD',
      bcvRateAtIssue: bcvState.activeRate,
      lines,
      subtotalUsd: parseFloat(subtotalUsd) || 0,
      ivaAmountUsd: parseFloat(ivaAmountUsd) || 0,
      igtfAmountUsd: parseFloat(igtfAmountUsd) || 0,
      totalUsd: parseFloat(totalUsd) || 0,
      ivaUndiscriminated,
      hasFormalDefects,
      paidAmountUsd: 0,
      status: 'PENDIENTE',
      ocrEngineUsed: engineMode,
      forensicAudit: liveAudit,
      createdAtVet: getCaracasNow().isoTimestamp,
    },
    supplier: selectedSupplier,
    companyProfile: config.companyProfile,
    nextIvaSeq: Math.max(
      config.companyProfile.nextIvaVoucherSeq ?? 1,
      retentionVouchers.filter((v) => v.type === 'IVA').length + 1
    ),
    nextIslrSeq: Math.max(
      config.companyProfile.nextIslrVoucherSeq ?? 1,
      retentionVouchers.filter((v) => v.type === 'ISLR').length + 1
    ),
    createdBy: user?.email || 'rdrj.mppd@gmail.com',
  });

  const handleAutoRepairDiscrepancy = () => {
    const fixedLines = lines.map((ln) => ({
      ...ln,
      lineTotalUsd: round2(toDecimal(ln.quantity).times(ln.unitCostUsd)),
    }));
    const newSub = round2(
      fixedLines.reduce((acc, l) => acc.plus(l.lineTotalUsd), toDecimal(0))
    );
    const hasExplicitLineRates = fixedLines.some((l) => l.ivaRate !== undefined);
    const iva = hasExplicitLineRates
      ? round2(
          fixedLines.reduce(
            (acc, l) => acc.plus(toDecimal(l.lineTotalUsd).times((l.ivaRate ?? 0) / 100)),
            toDecimal(0)
          )
        )
      : round2(parseFloat(ivaAmountUsd) || 0);
    const igtf = round2(parseFloat(igtfAmountUsd) || 0);
    const newTot = round2(toDecimal(newSub).plus(iva).plus(igtf));

    setLines(fixedLines);
    setSubtotalUsd(String(newSub));
    setIvaAmountUsd(String(iva));
    setTotalUsd(String(newTot));
  };

  const handleCommitVerifiedInvoice = () => {
    if (!liveAudit.passedAllLocks) return;
    const sup = suppliers.find((s) => s.id === supplierId) || suppliers[0];
    const vetNow = getCaracasNow();

    const finalAttachment: IndexedInvoiceAttachment = uploadedAttachment || {
      fileName: `${invoiceNumber}.pdf`,
      mimeType: 'application/pdf',
      fileSize: 125000,
      sha256Hash:
        '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08',
      verdict: 'AUTENTICO_ALTA_CONFIANZA',
      indexedAtVet: vetNow.isoTimestamp,
    };

    const newInvoice: PurchaseInvoice = {
      id: `inv-${Date.now()}`,
      invoiceNumber,
      controlNumber,
      supplierId: sup.id,
      supplierName: sup.name,
      supplierRif: sup.rif,
      locationId,
      issueDate: vetNow.dateString,
      dueDate: '2026-04-25',
      currency: 'USD',
      bcvRateAtIssue: bcvState.activeRate,
      lines,
      subtotalUsd: parseFloat(subtotalUsd),
      ivaAmountUsd: parseFloat(ivaAmountUsd),
      igtfAmountUsd: parseFloat(igtfAmountUsd),
      totalUsd: parseFloat(totalUsd),
      ivaUndiscriminated,
      hasFormalDefects,
      paidAmountUsd: 0,
      status: 'PENDIENTE',
      ocrEngineUsed: engineMode,
      forensicAudit: liveAudit,
      attachment: finalAttachment,
      createdAtVet: vetNow.isoTimestamp,
    };

    const result = registerOcrInvoice(newInvoice, () => {
      for (const ln of lines) {
        if (ln.lineType === 'SERVICIO') continue;
        const match = products.find((p) => p.sku === ln.sku);
        if (match) {
          const updatedProd = applyStockDeltaToZone(
            match,
            locationId,
            ln.quantity,
            destinationZone,
            vetNow.isoTimestamp
          );
          addOrUpdateProduct(updatedProd);
        }
      }
    });

    setLastEmittedVouchers({
      ivaVoucher: result.ivaVoucher,
      islrVoucher: result.islrVoucher,
    });

    if (result.ivaVoucher || result.islrVoucher) {
      const emittedCodes = [
        result.ivaVoucher ? `IVA ${result.ivaVoucher.voucherNumber}` : null,
        result.islrVoucher ? `ISLR ${result.islrVoucher.voucherNumber}` : null,
      ]
        .filter(Boolean)
        .join(' + ');
      logAuditEvent(
        'TAX_RETENTION_EMIT',
        'TAX_RETENTIONS',
        `Emisión automática de retenciones fiscales (${emittedCodes}) al indexar factura ${invoiceNumber} de ${sup.name}. Neto a pagar proveedor: ${formatUsd(result.invoice.netPayableUsd ?? result.invoice.totalUsd)}.`,
        {
          invoiceNumber,
          ivaVoucherNumber: result.ivaVoucher?.voucherNumber,
          islrVoucherNumber: result.islrVoucher?.voucherNumber,
          netPayableUsd: result.invoice.netPayableUsd,
        }
      );
    }

    const retSummary =
      result.ivaVoucher || result.islrVoucher
        ? ` Retenciones emitidas automáticamente (${[
            result.ivaVoucher
              ? `IVA #${result.ivaVoucher.voucherNumber}: ${formatUsd(result.ivaVoucher.retainedTotalUsd)}`
              : null,
            result.islrVoucher
              ? `ISLR #${result.islrVoucher.voucherNumber}: ${formatUsd(result.islrVoucher.retainedTotalUsd)}`
              : null,
          ]
            .filter(Boolean)
            .join(' · ')}) — Neto CxP: ${formatUsd(result.invoice.netPayableUsd ?? result.invoice.totalUsd)}.`
        : '';

    setCommitMessage(
      `Factura ${invoiceNumber} indexada en Libro de Compras, CxP e Inventario (${locationId} → ${destinationZone === 'ANAQUEL' ? 'Exhibición / Anaquel' : 'Depósito / Cava'}).${retSummary}`
    );
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <ScanLine className="w-5 h-5 text-sky-600" />
            <h1 className="text-base font-bold text-slate-900">
              Auditoría Forense OCR (4 Candados) & Indexación de Facturas (Imagen / PDF)
            </h1>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Suba la imagen (`.png`, `.jpg`, `.webp`) o documento `.pdf` de la factura para extraer
            sus ítems por OCR Dual, auditar los 4 Candados Matemáticos e indexarla en el ERP.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center bg-slate-100 p-1 rounded-lg border border-slate-200 text-xs">
            <button
              type="button"
              onClick={() => setEngineMode('GEMINI_VISION_PRO')}
              className={`px-2.5 py-1 rounded-md font-mono font-semibold transition ${
                engineMode === 'GEMINI_VISION_PRO'
                  ? 'bg-slate-900 text-sky-300 shadow-xs'
                  : 'text-slate-600'
              }`}
            >
              Motor 1: Gemini Vision Pro
            </button>
            <button
              type="button"
              onClick={() => setEngineMode('TESSERACT_FORENSIC')}
              className={`px-2.5 py-1 rounded-md font-mono font-semibold transition ${
                engineMode === 'TESSERACT_FORENSIC'
                  ? 'bg-slate-900 text-emerald-300 shadow-xs'
                  : 'text-slate-600'
              }`}
            >
              Motor 2: Tesseract Forensic
            </button>
          </div>
        </div>
      </div>

      {commitMessage && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-900 px-4 py-3 rounded-xl text-xs font-semibold flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{commitMessage}</span>
          </div>
          {lastEmittedVouchers && (lastEmittedVouchers.ivaVoucher || lastEmittedVouchers.islrVoucher) && (
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {lastEmittedVouchers.ivaVoucher && (
                <button
                  type="button"
                  onClick={() =>
                    exportRetentionVoucherPdf(
                      lastEmittedVouchers.ivaVoucher!,
                      config.companyProfile
                    )
                  }
                  className="min-h-[38px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-sky-300 font-mono text-[11px] font-bold transition cursor-pointer"
                >
                  <FileDown className="w-3.5 h-3.5" />
                  PDF Retención IVA #{lastEmittedVouchers.ivaVoucher.voucherNumber}
                </button>
              )}
              {lastEmittedVouchers.islrVoucher && (
                <button
                  type="button"
                  onClick={() =>
                    exportRetentionVoucherPdf(
                      lastEmittedVouchers.islrVoucher!,
                      config.companyProfile
                    )
                  }
                  className="min-h-[38px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-mono text-[11px] font-bold transition cursor-pointer"
                >
                  <FileDown className="w-3.5 h-3.5" />
                  PDF Retención ISLR #{lastEmittedVouchers.islrVoucher.voucherNumber}
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* NEW: Document Upload & Forensic Indexing Module (Image / PDF) */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <Upload className="w-4 h-4 text-sky-600" />
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-800">
              1. Módulo de Carga e Indexación de Soporte Digital de Factura (Imagen / PDF)
            </h2>
          </div>
          <span className="text-[11px] font-mono text-slate-500">
            Formatos soportados: PDF, PNG, JPG, JPEG, WEBP · Firma Forense SHA-256
          </span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Drag & Drop Upload Zone */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDraggingOver(true);
            }}
            onDragLeave={() => setIsDraggingOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`lg:col-span-2 border-2 border-dashed rounded-xl p-5 flex flex-col items-center justify-center text-center cursor-pointer transition ${
              isDraggingOver
                ? 'border-sky-500 bg-sky-50/70'
                : 'border-slate-300 hover:border-sky-500 hover:bg-slate-50/70'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/*"
              onChange={handleFileChange}
              className="hidden"
            />
            <div className="w-11 h-11 rounded-full bg-sky-100 text-sky-700 flex items-center justify-center mb-2.5">
              <Upload className="w-5 h-5" />
            </div>
            <p className="text-xs font-bold text-slate-800">
              {isProcessingUpload
                ? 'Escaneando documento y extrayendo estructura fiscal...'
                : 'Arrastre aquí la imagen o el PDF de la factura o haga clic para seleccionar archivo'}
            </p>
            <p className="text-[11px] text-slate-500 mt-1">
              El motor {engineMode} extraerá automáticamente proveedor, RIF, líneas de productos,
              base imponible, IVA e IGTF para su indexación.
            </p>
            <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
              <span className="px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold shadow-xs">
                Subir Imagen o PDF de Factura
              </span>
            </div>
          </div>

          {/* Forensic Metadata & Document Preview Card */}
          <div className="bg-slate-900 text-white rounded-xl p-4 flex flex-col justify-between space-y-3 text-xs">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <div className="flex items-center gap-1.5 text-sky-400 font-mono text-[11px] font-bold">
                <Fingerprint className="w-4 h-4" />
                <span>EXPEDIENTE DIGITAL INDEXADO</span>
              </div>
              {uploadedAttachment && (
                <span
                  className={`px-2 py-0.5 rounded font-mono text-[10px] font-bold ${
                    uploadedAttachment.verdict === 'AUTENTICO_ALTA_CONFIANZA'
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                      : 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                  }`}
                >
                  {uploadedAttachment.verdict === 'AUTENTICO_ALTA_CONFIANZA'
                    ? 'AUTÉNTICO'
                    : uploadedAttachment.verdict}
                </span>
              )}
            </div>

            {uploadedAttachment ? (
              <div className="space-y-2.5">
                <div className="flex items-start gap-2.5 bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                  {uploadedAttachment.mimeType.includes('pdf') ? (
                    <FileText className="w-7 h-7 text-rose-400 shrink-0 mt-0.5" />
                  ) : (
                    <ImageIcon className="w-7 h-7 text-sky-400 shrink-0 mt-0.5" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="font-bold text-white truncate">
                      {uploadedAttachment.fileName}
                    </div>
                    <div className="text-[11px] text-slate-400 font-mono">
                      {(uploadedAttachment.fileSize / 1024).toFixed(1)} KB ·{' '}
                      {uploadedAttachment.mimeType}
                    </div>
                  </div>
                </div>

                {uploadedAttachment.dataUrl && (
                  <div className="h-24 rounded-lg overflow-hidden border border-slate-800 bg-slate-950 flex items-center justify-center">
                    <img
                      src={uploadedAttachment.dataUrl}
                      alt="Vista previa de factura"
                      className="max-h-full max-w-full object-contain"
                    />
                  </div>
                )}

                <div className="bg-slate-950/90 p-2 rounded border border-slate-800 font-mono text-[10px] text-slate-300 space-y-1">
                  <div className="text-slate-400 uppercase">Huella Forense SHA-256:</div>
                  <div className="truncate text-emerald-400">
                    {uploadedAttachment.sha256Hash}
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-slate-400 text-center py-6">
                Ningún documento cargado. Suba un PDF o imagen para generar huella SHA-256.
              </div>
            )}

            <div className="text-[10px] font-mono text-slate-400 flex items-center justify-between pt-1 border-t border-slate-800">
              <span>Control Anti-Duplicados</span>
              <span className="text-emerald-400 font-bold">ACTIVO</span>
            </div>
          </div>
        </div>
      </div>

      {/* OCR Extraction Workbench & 4 Mathematical Locks */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Left 2 Columns: Extracted Invoice Data */}
        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl p-4 shadow-xs space-y-4 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <Cpu className="w-4 h-4 text-sky-600" />
              <span className="font-bold uppercase tracking-wider text-slate-800">
                2. Mesa de Extracción Documental e Indexación ({engineMode})
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleRunOcrSimulation('VALID_POLAR')}
                className={`px-2.5 py-1.5 rounded-lg font-semibold flex items-center gap-1 border transition ${
                  scenario === 'VALID_POLAR'
                    ? 'bg-emerald-600 text-white border-emerald-600'
                    : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5" />
                Cargar Factura Cuadrada
              </button>
              <button
                type="button"
                onClick={() => handleRunOcrSimulation('TAMPERED_DISCREPANCY')}
                className={`px-2.5 py-1.5 rounded-lg font-semibold flex items-center gap-1 border transition ${
                  scenario === 'TAMPERED_DISCREPANCY'
                    ? 'bg-rose-600 text-white border-rose-600'
                    : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                }`}
              >
                <AlertOctagon className="w-3.5 h-3.5" />
                Simular Factura con Error OCR
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <div>
              <label className="block font-semibold text-slate-600 mb-1">N° Factura</label>
              <input
                type="text"
                value={invoiceNumber}
                onChange={(e) => setInvoiceNumber(e.target.value)}
                className="w-full px-2.5 py-1.5 border border-slate-300 rounded font-mono font-bold"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-600 mb-1">N° Control Fiscal</label>
              <input
                type="text"
                value={controlNumber}
                onChange={(e) => setControlNumber(e.target.value)}
                className="w-full px-2.5 py-1.5 border border-slate-300 rounded font-mono"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-600 mb-1">Proveedor</label>
              <select
                value={supplierId}
                onChange={(e) => setSupplierId(e.target.value)}
                className="w-full px-2 py-1.5 border border-slate-300 rounded bg-white"
              >
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.taxpayerType || 'ORDINARIO'})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-semibold text-slate-600 mb-1">Sede Receptora</label>
              <select
                value={locationId}
                onChange={(e) => setLocationId(e.target.value)}
                className="w-full px-2 py-1.5 border border-slate-300 rounded bg-white"
              >
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.code}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-semibold text-slate-600 mb-1">Zona Destino</label>
              <select
                value={destinationZone}
                onChange={(e) => setDestinationZone(e.target.value as StorageZone)}
                className="w-full px-2 py-1.5 border border-slate-300 rounded bg-white font-semibold"
              >
                <option value="DEPOSITO">Depósito / Cava (Por Defecto)</option>
                <option value="ANAQUEL">Directo a Exhibición / Anaquel</option>
              </select>
            </div>
          </div>

          {/* Fiscal Exceptions SENIAT */}
          <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
            <div className="flex flex-wrap items-center gap-4 text-[11px] text-slate-700">
              <label className="inline-flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={ivaUndiscriminated}
                  onChange={(e) => setIvaUndiscriminated(e.target.checked)}
                  className="rounded border-slate-300 text-sky-600"
                />
                <span>IVA no discriminado (Retención 100% SNAT/2025/000054)</span>
              </label>
              <label className="inline-flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={hasFormalDefects}
                  onChange={(e) => setHasFormalDefects(e.target.checked)}
                  className="rounded border-slate-300 text-rose-600"
                />
                <span>Incumplimiento formal SENIAT (Retención 100%)</span>
              </label>
            </div>
            <button
              type="button"
              onClick={handleSyncTotalsFromLines}
              className="px-2.5 py-1 rounded bg-slate-900 hover:bg-slate-800 text-sky-300 font-mono text-[10px] font-bold transition cursor-pointer"
            >
              Sincronizar Subtotal / IVA desde Líneas
            </button>
          </div>

          {/* Editable Lines Table */}
          <div className="border border-slate-200 rounded-lg overflow-x-auto">
            <div className="bg-slate-50 px-3 py-2 border-b border-slate-200 flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase text-slate-700">
                Líneas de Factura Extraídas por OCR (Alícuota IVA &amp; Clasificación ISLR)
              </span>
              <button
                type="button"
                onClick={handleAddLine}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-sky-600 hover:bg-sky-500 text-white text-[11px] font-semibold transition"
              >
                <Plus className="w-3 h-3" />
                Añadir Ítem
              </button>
            </div>
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-900 text-slate-200 text-[10px] font-mono uppercase">
                  <th className="py-2 px-2">SKU</th>
                  <th className="py-2 px-2">Descripción</th>
                  <th className="py-2 px-2">Tipo / ISLR</th>
                  <th className="py-2 px-2 text-center">IVA %</th>
                  <th className="py-2 px-2 text-right">Cant.</th>
                  <th className="py-2 px-2 text-right">Costo ($)</th>
                  <th className="py-2 px-2 text-right">Subtotal ($)</th>
                  <th className="py-2 px-1.5 text-center"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {lines.map((ln) => (
                  <tr key={ln.id}>
                    <td className="py-1.5 px-2 font-mono font-bold">
                      <input
                        type="text"
                        value={ln.sku}
                        onChange={(e) => handleLineChange(ln.id, 'sku', e.target.value)}
                        className="w-24 px-1.5 py-1 border border-slate-200 rounded font-mono text-xs"
                      />
                    </td>
                    <td className="py-1.5 px-2">
                      <input
                        type="text"
                        value={ln.description}
                        onChange={(e) =>
                          handleLineChange(ln.id, 'description', e.target.value)
                        }
                        className="w-full min-w-[140px] px-1.5 py-1 border border-slate-200 rounded text-xs"
                      />
                    </td>
                    <td className="py-1.5 px-2">
                      <div className="space-y-1">
                        <select
                          value={ln.lineType || 'BIEN'}
                          onChange={(e) =>
                            handleLineFiscalChange(ln.id, {
                              lineType: e.target.value as 'BIEN' | 'SERVICIO',
                            })
                          }
                          className="w-28 px-1.5 py-1 border border-slate-200 rounded bg-white text-[11px] font-semibold"
                        >
                          <option value="BIEN">Mercancía</option>
                          <option value="SERVICIO">Servicio (ISLR)</option>
                        </select>
                        {ln.lineType === 'SERVICIO' && (
                          <select
                            value={ln.islrConceptCode || ISLR_CONCEPTS_CATALOG[0]?.code || 'SRV-FLETE'}
                            onChange={(e) =>
                              handleLineFiscalChange(ln.id, {
                                islrConceptCode: e.target.value,
                              })
                            }
                            className="w-28 px-1 py-0.5 border border-amber-300 rounded bg-amber-50 text-[10px] font-mono text-amber-950 block"
                          >
                            {ISLR_CONCEPTS_CATALOG.map((c) => (
                              <option key={c.code} value={c.code}>
                                {c.code} - {c.name.slice(0, 22)}
                              </option>
                            ))}
                          </select>
                        )}
                      </div>
                    </td>
                    <td className="py-1.5 px-2 text-center font-mono">
                      <select
                        value={ln.ivaRate ?? 16}
                        onChange={(e) =>
                          handleLineFiscalChange(ln.id, {
                            ivaRate: Number(e.target.value) as 0 | 8 | 16,
                          })
                        }
                        className="px-1.5 py-1 border border-slate-200 rounded bg-white font-mono text-xs"
                      >
                        <option value={0}>0% Ex</option>
                        <option value={8}>8%</option>
                        <option value={16}>16%</option>
                      </select>
                    </td>
                    <td className="py-1.5 px-2 text-right font-mono">
                      <input
                        type="number"
                        step="1"
                        value={ln.quantity}
                        onChange={(e) =>
                          handleLineChange(ln.id, 'quantity', e.target.value)
                        }
                        className="w-14 px-1.5 py-1 border border-slate-200 rounded font-mono text-right text-xs"
                      />
                    </td>
                    <td className="py-1.5 px-2 text-right font-mono">
                      <input
                        type="number"
                        step="0.01"
                        value={ln.unitCostUsd}
                        onChange={(e) =>
                          handleLineChange(ln.id, 'unitCostUsd', e.target.value)
                        }
                        className="w-20 px-1.5 py-1 border border-slate-200 rounded font-mono text-right text-xs"
                      />
                    </td>
                    <td className="py-1.5 px-2 text-right font-mono font-bold">
                      <input
                        type="number"
                        step="0.01"
                        value={ln.lineTotalUsd}
                        onChange={(e) =>
                          handleLineChange(ln.id, 'lineTotalUsd', e.target.value)
                        }
                        className="w-20 px-1.5 py-1 border border-slate-200 rounded font-mono font-bold text-right text-xs"
                      />
                    </td>
                    <td className="py-1.5 px-1.5 text-center">
                      <button
                        type="button"
                        onClick={() => handleRemoveLine(ln.id)}
                        className="text-slate-400 hover:text-rose-600 p-1"
                        title="Eliminar línea"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Totals Row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
            <div>
              <label className="block font-semibold text-slate-600 mb-1">
                Subtotal Declarado (USD)
              </label>
              <input
                type="number"
                step="0.01"
                value={subtotalUsd}
                onChange={(e) => setSubtotalUsd(e.target.value)}
                className="w-full px-2.5 py-1.5 border border-slate-300 rounded font-mono font-bold"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-600 mb-1">IVA (USD)</label>
              <input
                type="number"
                step="0.01"
                value={ivaAmountUsd}
                onChange={(e) => setIvaAmountUsd(e.target.value)}
                className="w-full px-2.5 py-1.5 border border-slate-300 rounded font-mono"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-600 mb-1">IGTF 3% (USD)</label>
              <input
                type="number"
                step="0.01"
                value={igtfAmountUsd}
                onChange={(e) => setIgtfAmountUsd(e.target.value)}
                className="w-full px-2.5 py-1.5 border border-slate-300 rounded font-mono"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-600 mb-1">
                Gran Total Declarado (USD)
              </label>
              <input
                type="number"
                step="0.01"
                value={totalUsd}
                onChange={(e) => setTotalUsd(e.target.value)}
                className="w-full px-2.5 py-1.5 border border-slate-300 rounded font-mono font-bold text-sky-900 bg-sky-50"
              />
            </div>
          </div>

          {/* Live Fiscal Retention Pre-Liquidation Banner (SPE IVA / ISLR) */}
          <div className="bg-slate-900 text-white rounded-xl p-3.5 border border-slate-800 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2">
              <div className="flex items-center gap-1.5 text-amber-400 font-mono text-[11px] font-bold">
                <Receipt className="w-4 h-4" />
                <span>
                  PRE-LIQUIDACIÓN AUTOMÁTICA DE RETENCIONES SENIAT (SPE IVA / DECRETO 1.808 ISLR)
                </span>
              </div>
              <span className="text-[10px] font-mono text-slate-400">
                Tasa Emisión BCV: Bs. {bcvState.activeRate.toFixed(2)}
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 font-mono text-xs tabular-nums">
              <div className="bg-slate-950 border border-slate-800 rounded-lg p-2">
                <div className="text-[10px] text-slate-400">Retención IVA</div>
                <div className="font-bold text-sky-300">
                  {formatUsd(retentionPreview.ivaVoucher?.retainedTotalUsd || 0)}
                </div>
                <div className="text-[10px] text-slate-500">
                  {retentionPreview.ivaVoucher
                    ? `${retentionPreview.ivaVoucher.retentionPercentApplied}% · ${formatVes(
                        retentionPreview.ivaVoucher.retainedTotalVes
                      )}`
                    : 'No aplica (Exento / 0%)'}
                </div>
              </div>
              <div className="bg-slate-950 border border-slate-800 rounded-lg p-2">
                <div className="text-[10px] text-slate-400">Retención ISLR</div>
                <div className="font-bold text-amber-300">
                  {formatUsd(retentionPreview.islrVoucher?.retainedTotalUsd || 0)}
                </div>
                <div className="text-[10px] text-slate-500">
                  {retentionPreview.islrVoucher
                    ? `${retentionPreview.islrVoucher.retentionPercentApplied}% · ${formatVes(
                        retentionPreview.islrVoucher.retainedTotalVes
                      )}`
                    : 'Solo líneas de Servicio'}
                </div>
              </div>
              <div className="bg-slate-950 border border-slate-800 rounded-lg p-2">
                <div className="text-[10px] text-slate-400">Total Retenido SENIAT</div>
                <div className="font-bold text-rose-300">
                  {formatUsd(retentionPreview.updatedInvoice.totalRetainedUsd || 0)}
                </div>
                <div className="text-[10px] text-slate-500">Enteramiento Quincenal</div>
              </div>
              <div className="bg-emerald-950/60 border border-emerald-500/40 rounded-lg p-2">
                <div className="text-[10px] text-emerald-300">Neto a Pagar Proveedor</div>
                <div className="font-bold text-emerald-300 text-sm">
                  {formatUsd(
                    retentionPreview.updatedInvoice.netPayableUsd ??
                      (parseFloat(totalUsd) || 0)
                  )}
                </div>
                <div className="text-[10px] text-emerald-400/80">Saldo exigible en CxP</div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: The 4 Forensic Locks Status */}
        <div className="bg-slate-900 text-white rounded-xl p-4 shadow-xs flex flex-col justify-between space-y-4 text-xs">
          <div className="space-y-3">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
              <div className="flex items-center gap-2">
                <Lock className="w-4 h-4 text-amber-400" />
                <h2 className="font-bold uppercase tracking-wider">
                  3. Auditoría Forense (4 Candados)
                </h2>
              </div>
              <span
                className={`px-2 py-0.5 rounded font-mono text-[10px] font-bold ${
                  liveAudit.passedAllLocks
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                    : 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                }`}
              >
                {liveAudit.passedAllLocks ? 'APROBADA' : 'BLOQUEADA'}
              </span>
            </div>

            <div className="space-y-2">
              {[
                {
                  label: 'Candado 1: Cantidad × Costo Unit. = Línea',
                  ok: liveAudit.lock1LineIntegrations,
                },
                {
                  label: 'Candado 2: Σ Líneas = Base Imponible',
                  ok: liveAudit.lock2SubtotalMatch,
                },
                {
                  label: 'Candado 3: Coherencia Fiscal IVA / IGTF',
                  ok: liveAudit.lock3TaxCoherence,
                },
                {
                  label: 'Candado 4: Base + Impuestos = Gran Total',
                  ok: liveAudit.lock4TotalCrossCheck,
                },
              ].map((lock) => (
                <div
                  key={lock.label}
                  className={`p-2.5 rounded-lg border flex items-center justify-between ${
                    lock.ok
                      ? 'bg-slate-950/70 border-emerald-500/30 text-emerald-300'
                      : 'bg-rose-950/60 border-rose-500/50 text-rose-200'
                  }`}
                >
                  <span className="font-medium">{lock.label}</span>
                  <span className="font-mono font-bold text-[10px]">
                    {lock.ok ? 'OK' : 'FALLO'}
                  </span>
                </div>
              ))}
            </div>

            <div className="bg-slate-950 border border-slate-800 rounded-lg p-2.5 font-mono text-[11px] space-y-1 max-h-36 overflow-y-auto">
              {liveAudit.auditLog.map((entry, i) => (
                <div
                  key={i}
                  className={
                    entry.includes('[FALLO]') ? 'text-rose-400' : 'text-slate-300'
                  }
                >
                  {entry}
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-2 pt-2 border-t border-slate-800">
            {!liveAudit.passedAllLocks && (
              <button
                type="button"
                onClick={handleAutoRepairDiscrepancy}
                className="w-full py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold transition"
              >
                Recalcular y Corregir Discrepancia con Decimal.js
              </button>
            )}

            <button
              type="button"
              disabled={!liveAudit.passedAllLocks}
              onClick={handleCommitVerifiedInvoice}
              className={`w-full py-2.5 rounded-lg font-bold flex items-center justify-center gap-2 transition ${
                liveAudit.passedAllLocks
                  ? 'bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer'
                  : 'bg-slate-800 text-slate-500 cursor-not-allowed'
              }`}
            >
              <FilePlus2 className="w-4 h-4" />
              Indexar Factura y Soporte Digital en el Sistema
            </button>
          </div>
        </div>
      </div>

      {/* Historical Invoices Table with Indexed Digital Attachment */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
            Libro de Compras Auditado & Repositorio de Soportes Digitales Indexados ({invoices.length} Facturas)
          </h3>
          <span className="text-[11px] font-mono text-emerald-700 font-semibold">
            Indexación SHA-256 + 4 Candados Activa
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-900 text-slate-200 text-[11px] font-mono uppercase">
                <th className="py-2.5 px-3">N° Factura / Control</th>
                <th className="py-2.5 px-3">Proveedor / RIF</th>
                <th className="py-2.5 px-3">Soporte Indexado (PDF / IMG)</th>
                <th className="py-2.5 px-3 text-right">Subtotal / IVA</th>
                <th className="py-2.5 px-3 text-right">Total Factura</th>
                <th className="py-2.5 px-3 text-right">Retenido / Neto CxP</th>
                <th className="py-2.5 px-3 text-center">Comprobantes SENIAT</th>
                <th className="py-2.5 px-3 text-center">Estado CxP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-xs">
              {invoices.map((inv) => {
                const ivaVoucher = retentionVouchers.find(
                  (v) => v.id === inv.ivaRetentionId || (v.invoiceId === inv.id && v.type === 'IVA')
                );
                const islrVoucher = retentionVouchers.find(
                  (v) => v.id === inv.islrRetentionId || (v.invoiceId === inv.id && v.type === 'ISLR')
                );
                const netPayable = inv.netPayableUsd ?? inv.totalUsd;
                const totalRetained = inv.totalRetainedUsd ?? 0;

                return (
                  <tr key={inv.id} className="hover:bg-slate-50">
                    <td className="py-2.5 px-3 font-mono">
                      <div className="font-bold text-slate-900">{inv.invoiceNumber}</div>
                      <div className="text-[10px] text-slate-400">Ctrl: {inv.controlNumber}</div>
                    </td>
                    <td className="py-2.5 px-3">
                      <div className="font-semibold text-slate-900">{inv.supplierName}</div>
                      <div className="font-mono text-[10px] text-slate-500">{inv.supplierRif}</div>
                    </td>
                    <td className="py-2.5 px-3">
                      {inv.attachment ? (
                        <div className="flex items-center gap-2">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-sky-50 text-sky-800 border border-sky-200 font-mono text-[10px]">
                            {inv.attachment.mimeType.includes('pdf') ? (
                              <FileText className="w-3 h-3 text-rose-600" />
                            ) : (
                              <ImageIcon className="w-3 h-3 text-sky-600" />
                            )}
                            <span className="truncate max-w-[120px]">
                              {inv.attachment.fileName}
                            </span>
                          </span>
                          <button
                            type="button"
                            onClick={() => setPreviewModalInvoice(inv)}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-900 hover:bg-slate-800 text-white text-[10px] font-semibold transition"
                          >
                            <Eye className="w-3 h-3" />
                            Ver
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setPreviewModalInvoice(inv)}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-mono text-[10px] transition"
                        >
                          <Eye className="w-3 h-3" />
                          Expediente OCR
                        </button>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                      <div>{formatUsd(inv.subtotalUsd)}</div>
                      <div className="text-[10px] text-slate-500">
                        IVA: {formatUsd(inv.ivaAmountUsd)}
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900 tabular-nums">
                      {formatUsd(inv.totalUsd)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                      <div className="font-bold text-emerald-700">{formatUsd(netPayable)}</div>
                      {totalRetained > 0 && (
                        <div className="text-[10px] text-rose-600">
                          Ret: -{formatUsd(totalRetained)}
                        </div>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <div className="flex flex-wrap items-center justify-center gap-1">
                        {ivaVoucher && (
                          <button
                            type="button"
                            onClick={() =>
                              exportRetentionVoucherPdf(ivaVoucher, config.companyProfile)
                            }
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-900 hover:bg-slate-800 text-sky-300 font-mono text-[10px] font-bold transition cursor-pointer"
                            title={`Descargar Comprobante IVA #${ivaVoucher.voucherNumber}`}
                          >
                            <FileDown className="w-3 h-3" />
                            IVA
                          </button>
                        )}
                        {islrVoucher && (
                          <button
                            type="button"
                            onClick={() =>
                              exportRetentionVoucherPdf(islrVoucher, config.companyProfile)
                            }
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-600 hover:bg-amber-500 text-white font-mono text-[10px] font-bold transition cursor-pointer"
                            title={`Descargar Comprobante ISLR #${islrVoucher.voucherNumber}`}
                          >
                            <FileDown className="w-3 h-3" />
                            ISLR
                          </button>
                        )}
                        {!ivaVoucher && !islrVoucher && (
                          <span className="text-[10px] font-mono text-slate-400">Exenta</span>
                        )}
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <span
                        className={`px-2 py-0.5 rounded font-mono text-[10px] font-bold ${
                          inv.status === 'PAGADA'
                            ? 'bg-emerald-100 text-emerald-800'
                            : inv.status === 'VENCIDA'
                            ? 'bg-rose-100 text-rose-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {inv.status}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: Indexed Invoice Digital Attachment & Forensic Certificate Viewer */}
      {previewModalInvoice && (
        <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl max-w-2xl w-full shadow-2xl overflow-hidden text-slate-900">
            <div className="px-5 py-3.5 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-emerald-400" />
                <div>
                  <h3 className="text-sm font-bold">
                    Expediente Digital Indexado — Factura {previewModalInvoice.invoiceNumber}
                  </h3>
                  <p className="text-[11px] text-slate-400 font-mono">
                    {previewModalInvoice.supplierName} ({previewModalInvoice.supplierRif})
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPreviewModalInvoice(null)}
                className="p-1 rounded text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs max-h-[75vh] overflow-y-auto">
              {previewModalInvoice.attachment && (
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-800">
                      Archivo Digital: {previewModalInvoice.attachment.fileName}
                    </span>
                    <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-mono text-[10px] font-bold">
                      {previewModalInvoice.attachment.verdict}
                    </span>
                  </div>
                  <div className="font-mono text-[11px] text-slate-600 break-all">
                    SHA-256: {previewModalInvoice.attachment.sha256Hash}
                  </div>
                  {previewModalInvoice.attachment.dataUrl && (
                    <div className="mt-2 bg-slate-900 rounded-lg p-2 flex items-center justify-center max-h-64 overflow-hidden">
                      <img
                        src={previewModalInvoice.attachment.dataUrl}
                        alt="Soporte de factura indexado"
                        className="max-h-60 object-contain"
                      />
                    </div>
                  )}
                </div>
              )}

              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-900 text-white text-[10px] font-mono uppercase">
                      <th className="py-2 px-3">SKU</th>
                      <th className="py-2 px-3">Descripción</th>
                      <th className="py-2 px-3 text-right">Cantidad</th>
                      <th className="py-2 px-3 text-right">Costo Unit.</th>
                      <th className="py-2 px-3 text-right">Total Línea</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {previewModalInvoice.lines.map((l) => (
                      <tr key={l.id}>
                        <td className="py-2 px-3 font-mono font-bold">{l.sku}</td>
                        <td className="py-2 px-3">{l.description}</td>
                        <td className="py-2 px-3 text-right font-mono">{l.quantity}</td>
                        <td className="py-2 px-3 text-right font-mono">
                          {formatUsd(l.unitCostUsd)}
                        </td>
                        <td className="py-2 px-3 text-right font-mono font-bold">
                          {formatUsd(l.lineTotalUsd)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="bg-slate-900 text-slate-200 rounded-lg p-3 font-mono text-[11px] space-y-1">
                {previewModalInvoice.forensicAudit.auditLog.map((log, idx) => (
                  <div key={idx} className="text-emerald-300">
                    ✓ {log}
                  </div>
                ))}
              </div>
            </div>

            <div className="px-5 py-3 bg-slate-100 border-t border-slate-200 flex justify-end">
              <button
                type="button"
                onClick={() => setPreviewModalInvoice(null)}
                className="px-4 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-semibold"
              >
                Cerrar Expediente
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PurchaseInvoices;
