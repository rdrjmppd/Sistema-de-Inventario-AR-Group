import React, { useEffect, useRef, useState } from 'react';
import { Camera, CheckCircle2, ScanLine, Trash2, X, Zap } from 'lucide-react';
import { BarcodeScanRecord, Product, StorageZone } from '../../types';
import {
  appendScanToSessionQueue,
  isCameraBarcodeDetectorSupported,
  summarizeScanQueueByProduct,
} from '../../lib/barcode-scanner';
import { resolveCatalogProductFromBarcode } from '../../lib/scale-barcode';

interface BarcodeScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  products: Product[];
  locationId: string;
  defaultZone?: StorageZone;
  onSelectSingleProduct?: (params: {
    product: Product | null;
    rawCode: string;
    effectiveQuantity: number;
    zone: StorageZone;
  }) => void;
  onApplyBatchCount?: (
    items: Array<{
      productId: string;
      sku: string;
      productName: string;
      locationId: string;
      zone: StorageZone;
      totalScannedQty: number;
    }>
  ) => void;
}

export const BarcodeScannerModal: React.FC<BarcodeScannerModalProps> = ({
  isOpen,
  onClose,
  title = 'Escáner Móvil PWA & Decodificador Balanzas EAN-13',
  products,
  locationId,
  defaultZone = 'ANAQUEL',
  onSelectSingleProduct,
  onApplyBatchCount,
}) => {
  const [zone, setZone] = useState<StorageZone>(defaultZone);
  const [manualCode, setManualCode] = useState('');
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [scanQueue, setScanQueue] = useState<BarcodeScanRecord[]>([]);
  const [feedbackBanner, setFeedbackBanner] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setZone(defaultZone);
  }, [defaultZone]);

  useEffect(() => {
    if (!isOpen) {
      stopCameraStream();
      return;
    }
    const timer = setTimeout(() => {
      inputRef.current?.focus();
    }, 120);
    return () => clearTimeout(timer);
  }, [isOpen]);

  const stopCameraStream = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  };

  const handleCodeDetected = (
    rawCode: string,
    source: BarcodeScanRecord['source']
  ) => {
    const clean = rawCode.trim();
    if (!clean) return;

    try {
      const res = appendScanToSessionQueue({
        existingQueue: scanQueue,
        rawCode: clean,
        products,
        locationId,
        zone,
        source,
      });
      setScanQueue(res.updatedQueue);

      const resolved = resolveCatalogProductFromBarcode(clean, products);
      if (resolved.product) {
        const scaleTag = resolved.decoded.isScaleVariableBarcode
          ? ` [Balanza ${resolved.decoded.prefix}: ${resolved.effectiveQuantity} Kg]`
          : '';
        setFeedbackBanner(
          `Detectado: ${resolved.product.name} (${resolved.product.sku})${scaleTag} — Acumulado: ${res.aggregatedQtyForProduct} ${resolved.product.unit}`
        );
      } else {
        setFeedbackBanner(
          `Código ${clean} leído (${res.latestRecord.scannedQty} u.) — Sin coincidencia en catálogo actual.`
        );
      }

      if (onSelectSingleProduct) {
        onSelectSingleProduct({
          product: resolved.product,
          rawCode: clean,
          effectiveQuantity: resolved.effectiveQuantity,
          zone,
        });
      }
      setManualCode('');
    } catch (err) {
      setCameraError(err instanceof Error ? err.message : 'Error leyendo código.');
    }
  };

  const startCameraScanning = async () => {
    setCameraError(null);
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setCameraError(
        'Este navegador o contexto no expone cámara directa. Use pistola láser USB/Bluetooth o ingrese el código debajo.'
      );
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false,
      });
      streamRef.current = stream;
      setCameraActive(true);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }

      if (isCameraBarcodeDetectorSupported()) {
        const DetectorCtor = (
          window as unknown as {
            BarcodeDetector: new (opts?: { formats?: string[] }) => {
              detect: (el: HTMLVideoElement) => Promise<Array<{ rawValue?: string }>>;
            };
          }
        ).BarcodeDetector;
        const detector = new DetectorCtor({
          formats: ['ean_13', 'ean_8', 'code_128', 'upc_a', 'qr_code'],
        });

        const loop = async () => {
          if (!streamRef.current || !videoRef.current) return;
          try {
            const barcodes = await detector.detect(videoRef.current);
            if (barcodes.length > 0 && barcodes[0].rawValue) {
              handleCodeDetected(barcodes[0].rawValue, 'CAMERA_PWA');
            }
          } catch {
            // Ignorar fotograma intermedio
          }
          if (streamRef.current) {
            setTimeout(loop, 650);
          }
        };
        setTimeout(loop, 500);
      }
    } catch {
      setCameraError(
        'Permiso de cámara denegado o cámara ocupada. El lector láser USB/Bluetooth y la entrada rápida siguen activos.'
      );
    }
  };

  if (!isOpen) return null;

  const summary = summarizeScanQueueByProduct(scanQueue);

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        <div className="px-4 py-3.5 bg-slate-950 border-b border-slate-800 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-sky-500/20 border border-sky-500/40 flex items-center justify-center text-sky-400">
              <ScanLine className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">{title}</h3>
              <p className="text-[11px] text-slate-400">
                Soporta Cámara Trasera PWA, Pistola USB/Bluetooth y Etiquetas Balanza 20/21
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              stopCameraStream();
              onClose();
            }}
            className="min-w-[44px] min-h-[44px] rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 overflow-y-auto space-y-4 text-xs">
          {/* Selector de Zona Destino */}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setZone('ANAQUEL')}
              className={`min-h-[44px] rounded-xl font-bold border transition cursor-pointer ${
                zone === 'ANAQUEL'
                  ? 'bg-emerald-600/20 border-emerald-500 text-emerald-300'
                  : 'bg-slate-950 border-slate-800 text-slate-400'
              }`}
            >
              Zona: Anaquel / Exhibición
            </button>
            <button
              type="button"
              onClick={() => setZone('DEPOSITO')}
              className={`min-h-[44px] rounded-xl font-bold border transition cursor-pointer ${
                zone === 'DEPOSITO'
                  ? 'bg-amber-600/20 border-amber-500 text-amber-300'
                  : 'bg-slate-950 border-slate-800 text-slate-400'
              }`}
            >
              Zona: Depósito / Cava
            </button>
          </div>

          {/* Visor de Cámara PWA */}
          <div className="rounded-xl bg-slate-950 border border-slate-800 p-3 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-semibold text-slate-300 flex items-center gap-1.5">
                <Camera className="w-4 h-4 text-sky-400" />
                Lector Óptico Móvil (Offline-Ready)
              </span>
              {!cameraActive ? (
                <button
                  type="button"
                  onClick={startCameraScanning}
                  className="min-h-[44px] px-3.5 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-bold cursor-pointer"
                >
                  Activar Cámara Trasera
                </button>
              ) : (
                <button
                  type="button"
                  onClick={stopCameraStream}
                  className="min-h-[44px] px-3.5 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold cursor-pointer"
                >
                  Detener Cámara
                </button>
              )}
            </div>

            {cameraActive && (
              <div className="relative rounded-lg overflow-hidden bg-black aspect-video border border-sky-500/40">
                <video
                  ref={videoRef}
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-x-8 top-1/2 -translate-y-1/2 h-0.5 bg-emerald-400 shadow-[0_0_12px_#34d399]" />
              </div>
            )}

            {cameraError && (
              <p className="text-[11px] text-amber-300 bg-amber-950/50 border border-amber-500/30 rounded-lg p-2">
                {cameraError}
              </p>
            )}
          </div>

          {/* Entrada rápida de Pistola Láser Wedge / Código Manual */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleCodeDetected(manualCode, 'HARDWARE_WEDGE');
            }}
            className="flex flex-col sm:flex-row gap-2"
          >
            <input
              ref={inputRef}
              type="text"
              value={manualCode}
              onChange={(e) => setManualCode(e.target.value)}
              placeholder="Escanee con lector láser o escriba EAN-13 / SKU / etiqueta 20..."
              className="flex-1 min-h-[44px] px-3 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono focus:outline-none focus:border-sky-500"
            />
            <button
              type="submit"
              className="min-h-[44px] px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Zap className="w-4 h-4" />
              Procesar Lectura
            </button>
          </form>

          {feedbackBanner && (
            <div className="p-2.5 rounded-xl bg-emerald-950/60 border border-emerald-500/40 text-emerald-200 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{feedbackBanner}</span>
            </div>
          )}

          {/* Tabla de Consolidado de Conteo Escaneado */}
          {summary.length > 0 && (
            <div className="rounded-xl border border-slate-800 overflow-hidden">
              <div className="px-3 py-2 bg-slate-950 flex items-center justify-between">
                <span className="font-bold text-slate-200">
                  Lote Escaneado en Sesión ({summary.length} SKUs)
                </span>
                <button
                  type="button"
                  onClick={() => setScanQueue([])}
                  className="text-rose-400 hover:text-rose-300 flex items-center gap-1 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Limpiar
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-900/90 text-slate-400 border-b border-slate-800">
                      <th className="p-2">SKU</th>
                      <th className="p-2">Producto</th>
                      <th className="p-2">Zona</th>
                      <th className="p-2 text-right">Total Contado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.map((item) => (
                      <tr key={`${item.productId}-${item.zone}`} className="border-b border-slate-800/60">
                        <td className="p-2 font-mono text-sky-300">{item.sku}</td>
                        <td className="p-2 text-white">{item.productName}</td>
                        <td className="p-2 font-semibold text-slate-300">{item.zone}</td>
                        <td className="p-2 text-right font-mono font-bold text-emerald-400 tabular-nums">
                          {item.totalScannedQty}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        <div className="px-4 py-3 bg-slate-950 border-t border-slate-800 flex flex-wrap items-center justify-end gap-2">
          {onApplyBatchCount && summary.length > 0 && (
            <button
              type="button"
              onClick={() => {
                onApplyBatchCount(summary);
                stopCameraStream();
                onClose();
              }}
              className="min-h-[44px] px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold cursor-pointer"
            >
              Aplicar Lote Contado ({summary.length} SKUs)
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              stopCameraStream();
              onClose();
            }}
            className="min-h-[44px] px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold cursor-pointer"
          >
            Cerrar Escáner
          </button>
        </div>
      </div>
    </div>
  );
};

export default BarcodeScannerModal;
