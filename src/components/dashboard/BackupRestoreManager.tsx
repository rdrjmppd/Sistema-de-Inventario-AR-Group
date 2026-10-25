import React, { useState, useRef } from 'react';
import {
  Database,
  Download,
  Upload,
  ShieldCheck,
  AlertTriangle,
  CheckCircle,
  FileText,
  Lock,
  RefreshCw,
  Building2,
  Package,
  Layers,
} from 'lucide-react';
import { useInventory } from '../../context/InventoryContext';
import { useAuth } from '../../context/AuthContext';
import {
  createEncryptedBackup,
  decryptAndValidateBackup,
  downloadBackupFile,
} from '../../lib/backup-crypto';
import { PlatformBackupPayload } from '../../types';

export const BackupRestoreManager: React.FC = () => {
  const {
    products,
    locations,
    auditLogs,
    exportPlatformBackupPayload,
    restoreFullPlatformState,
  } = useInventory();
  const { user } = useAuth();

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Export State
  const [isExporting, setIsExporting] = useState(false);
  const [exportSuccess, setExportSuccess] = useState(false);
  const [customSecretKey, setCustomSecretKey] = useState('');

  // Import / Restore State
  const [isReadingFile, setIsReadingFile] = useState(false);
  const [restoreCandidate, setRestoreCandidate] = useState<PlatformBackupPayload | null>(null);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [restoreSuccess, setRestoreSuccess] = useState(false);
  const [fileNameLoaded, setFileNameLoaded] = useState<string | null>(null);

  // Handle Export Backup
  const handleGenerateBackup = async () => {
    setIsExporting(true);
    setExportSuccess(false);

    try {
      const payload = exportPlatformBackupPayload();
      const secret = customSecretKey.trim() || undefined;
      const envelope = await createEncryptedBackup(payload, secret);

      downloadBackupFile(envelope);
      setExportSuccess(true);
      setTimeout(() => setExportSuccess(false), 5000);
    } catch (err: unknown) {
      console.error('Error generating encrypted backup:', err);
    } finally {
      setIsExporting(false);
    }
  };

  // Handle File Selection
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setRestoreError(null);
    setRestoreSuccess(false);
    setRestoreCandidate(null);
    setFileNameLoaded(file.name);
    setIsReadingFile(true);

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const content = event.target?.result as string;
        if (!content) {
          throw new Error('El archivo seleccionado está vacío.');
        }

        const secret = customSecretKey.trim() || undefined;
        const result = await decryptAndValidateBackup(content, secret);

        if (!result.success || !result.data) {
          setRestoreError(
            result.error ||
              'No se pudo descifrar el archivo. Verifique que la clave de cifrado sea correcta o que el archivo no haya sido alterado.'
          );
          setRestoreCandidate(null);
        } else {
          setRestoreCandidate(result.data);
        }
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : 'Error desconocido al leer el archivo.';
        setRestoreError(`Fallo de lectura: ${errorMsg}`);
        setRestoreCandidate(null);
      } finally {
        setIsReadingFile(false);
      }
    };

    reader.onerror = () => {
      setRestoreError('Error de lectura física del archivo.');
      setIsReadingFile(false);
    };

    reader.readAsText(file);
  };

  // Confirm Restore
  const handleConfirmRestore = () => {
    if (!restoreCandidate) return;

    const res = restoreFullPlatformState(restoreCandidate);
    if (res.success) {
      setRestoreSuccess(true);
      setRestoreCandidate(null);
      setFileNameLoaded(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      setTimeout(() => setRestoreSuccess(false), 5000);
    } else {
      setRestoreError(res.error || 'Error al restaurar los datos en el sistema.');
    }
  };

  return (
    <div className="space-y-6">
      {/* Intro Card */}
      <div className="bg-slate-900/90 border border-slate-800 p-5 rounded-2xl">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-sky-950 text-sky-400 border border-sky-800/80 rounded-xl">
              <Database className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">
                Módulo de Respaldos Cifrados & Continuidad de Negocio
              </h2>
              <p className="text-xs text-slate-400">
                Exportación e importación segura de configuración, catálogo maestro, existencias y registros de auditoría en formato cifrado (<span className="text-sky-400 font-mono">.chrystal-backup</span>).
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-400 font-mono bg-slate-950/80 px-3 py-1.5 rounded-lg border border-slate-800">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>Algoritmo: SHA-256 + Stream Cipher</span>
          </div>
        </div>

        {/* Optional Custom Secret Key */}
        <div className="mt-4 pt-4 border-t border-slate-800/80 flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <Lock className="w-4 h-4 text-amber-400 shrink-0" />
            <span>Clave de Cifrado Personalizada (Opcional):</span>
          </div>
          <input
            type="password"
            placeholder="Por defecto: Llave Maestra AR Group 2026"
            value={customSecretKey}
            onChange={(e) => setCustomSecretKey(e.target.value)}
            className="flex-1 px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-500 font-mono min-h-[44px]"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Export Card */}
        <div className="bg-slate-900/90 border border-slate-800 p-6 rounded-2xl flex flex-col justify-between space-y-5">
          <div className="space-y-3">
            <div className="flex items-center gap-2.5 text-white font-bold text-base">
              <Download className="w-5 h-5 text-sky-400" />
              <h3>Generar Respaldo Local & Nube</h3>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Empaqueta en un único archivo cifrado la totalidad de los datos operativos actuales. Puede conservarse localmente en su disco o almacenarse en almacenamiento seguro para contingencias.
            </p>

            <div className="bg-slate-950/70 p-4 rounded-xl border border-slate-800 space-y-2 text-xs text-slate-300">
              <div className="flex justify-between">
                <span className="text-slate-400 flex items-center gap-1.5">
                  <Package className="w-3.5 h-3.5 text-sky-400" /> Catálogo de Productos:
                </span>
                <span className="font-mono font-bold text-white">{products.length} SKUs</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400 flex items-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5 text-emerald-400" /> Sedes y Depósitos:
                </span>
                <span className="font-mono font-bold text-white">{locations.length} Ubicaciones</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400 flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-indigo-400" /> Registros de Auditoría:
                </span>
                <span className="font-mono font-bold text-white">{auditLogs.length} Eventos</span>
              </div>
            </div>

            {exportSuccess && (
              <div className="p-3 bg-emerald-950/80 border border-emerald-600 text-emerald-300 text-xs rounded-xl flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Respaldo cifrado descargado exitosamente.</span>
              </div>
            )}
          </div>

          <button
            onClick={handleGenerateBackup}
            disabled={isExporting}
            className="w-full py-3 px-4 bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-lg shadow-sky-900/30 transition-all flex items-center justify-center gap-2 min-h-[44px]"
          >
            {isExporting ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                Cifrando y Empaquetando Datos...
              </>
            ) : (
              <>
                <Download className="w-4 h-4" />
                Descargar Respaldo Cifrado (.chrystal-backup)
              </>
            )}
          </button>
        </div>

        {/* Restore Card */}
        <div className="bg-slate-900/90 border border-slate-800 p-6 rounded-2xl flex flex-col justify-between space-y-5">
          <div className="space-y-3">
            <div className="flex items-center gap-2.5 text-white font-bold text-base">
              <Upload className="w-5 h-5 text-indigo-400" />
              <h3>Cargar y Restaurar Respaldo</h3>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Seleccione un archivo <span className="font-mono text-indigo-300">.chrystal-backup</span> para validar su firma criptográfica e integridad antes de restaurar el estado completo de la plataforma.
            </p>

            <input
              ref={fileInputRef}
              type="file"
              accept=".chrystal-backup,.json"
              onChange={handleFileChange}
              className="hidden"
              id="backup-file-input"
            />

            <label
              htmlFor="backup-file-input"
              className="border-2 border-dashed border-slate-700 hover:border-indigo-500/70 bg-slate-950/60 p-5 rounded-xl flex flex-col items-center justify-center gap-2 cursor-pointer transition-colors text-center"
            >
              <Upload className="w-6 h-6 text-indigo-400" />
              <span className="text-xs font-semibold text-slate-200">
                {fileNameLoaded ? fileNameLoaded : 'Haz clic para seleccionar el archivo de respaldo'}
              </span>
              <span className="text-[11px] text-slate-500">
                Archivos compatibles: .chrystal-backup
              </span>
            </label>

            {isReadingFile && (
              <div className="p-3 bg-slate-800/80 border border-slate-700 text-slate-300 text-xs rounded-xl flex items-center gap-2">
                <RefreshCw className="w-4 h-4 animate-spin text-sky-400" />
                <span>Verificando huella criptográfica SHA-256 y descifrando contenido...</span>
              </div>
            )}

            {restoreError && (
              <div className="p-3 bg-red-950/80 border border-red-700 text-red-300 text-xs rounded-xl flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                <span>{restoreError}</span>
              </div>
            )}

            {restoreSuccess && (
              <div className="p-3 bg-emerald-950/80 border border-emerald-600 text-emerald-300 text-xs rounded-xl flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>¡Plataforma restaurada exitosamente con todos los registros del respaldo!</span>
              </div>
            )}

            {/* Candidate Preview */}
            {restoreCandidate && (
              <div className="p-4 bg-indigo-950/40 border border-indigo-700/60 rounded-xl space-y-2 text-xs animate-in fade-in">
                <div className="flex items-center gap-2 text-indigo-300 font-bold">
                  <ShieldCheck className="w-4 h-4 text-indigo-400" />
                  <span>Respaldo Auténtico Validado</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-slate-300 pt-1">
                  <div>
                    <span className="text-slate-400">Exportado el:</span>{' '}
                    <span className="font-mono text-white">{restoreCandidate.exportedAtVet}</span>
                  </div>
                  <div>
                    <span className="text-slate-400">Por:</span>{' '}
                    <span className="text-white">{restoreCandidate.exportedBy}</span>
                  </div>
                  <div>
                    <span className="text-slate-400">Empresa:</span>{' '}
                    <span className="text-white">
                      {restoreCandidate.companyProfile?.razonSocial || 'AR Group'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400">RIF:</span>{' '}
                    <span className="font-mono text-white">
                      {restoreCandidate.companyProfile?.rif || 'J-50128492-0'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400">Productos:</span>{' '}
                    <span className="font-mono text-emerald-400 font-bold">
                      {restoreCandidate.products?.length || 0}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400">Sedes/Depósitos:</span>{' '}
                    <span className="font-mono text-emerald-400 font-bold">
                      {restoreCandidate.locations?.length || 0}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>

          <button
            onClick={handleConfirmRestore}
            disabled={!restoreCandidate}
            className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white font-bold text-xs rounded-xl shadow-lg shadow-indigo-900/30 transition-all flex items-center justify-center gap-2 min-h-[44px]"
          >
            <RefreshCw className="w-4 h-4" />
            Restaurar Base de Datos desde Respaldo
          </button>
        </div>
      </div>
    </div>
  );
};

export default BackupRestoreManager;
