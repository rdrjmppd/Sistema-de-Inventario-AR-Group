import React, { useState } from 'react';
import {
  Folder,
  Copy,
  Check,
  ExternalLink,
  X,
  Cloud,
  FileText,
  AlertCircle,
  HelpCircle,
} from 'lucide-react';
import { ExpenseRecord } from '../../types';
import { buildSuggestedDrivePath } from '../../lib/expenses-engine';

interface GoogleDriveBackupHelperModalProps {
  expense: ExpenseRecord | null;
  isOpen: boolean;
  onClose: () => void;
  onConfirmBackup?: (expenseId: string, driveUrl?: string) => void;
}

export const GoogleDriveBackupHelperModal: React.FC<GoogleDriveBackupHelperModalProps> = ({
  expense,
  isOpen,
  onClose,
  onConfirmBackup,
}) => {
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [driveUrlInput, setDriveUrlInput] = useState<string>('');
  const [confirmed, setConfirmed] = useState<boolean>(false);

  if (!isOpen || !expense) return null;

  const pathInfo = buildSuggestedDrivePath({
    beneficiaryName: expense.beneficiaryName,
    issueDate: expense.issueDate,
    voucherType: expense.voucherType,
    voucherNumber: expense.voucherNumber,
    originalFileName: expense.attachment?.fileName,
  });

  const handleCopy = (text: string, fieldName: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(fieldName);
    setTimeout(() => setCopiedField(null), 2500);
  };

  const handleSaveConfirmation = () => {
    if (onConfirmBackup) {
      onConfirmBackup(expense.id, driveUrlInput.trim() || undefined);
    }
    setConfirmed(true);
    setTimeout(() => {
      setConfirmed(false);
      onClose();
    }, 1200);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/80 backdrop-blur-sm animate-fadeIn">
      <div className="relative w-full max-w-2xl bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-500/20 rounded-xl border border-blue-400/30">
              <Cloud className="w-6 h-6 text-blue-300" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                Asistente de Respaldo Corporativo Google Drive
              </h2>
              <p className="text-xs text-blue-200">
                Estructura de archivo para evitar colapso de la nube y preservar comprobantes físicos
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-300 hover:text-white rounded-lg hover:bg-white/10 transition-colors"
            title="Cerrar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-5 text-slate-700 dark:text-slate-200 text-sm">
          {/* Alerta de Recomendación */}
          <div className="p-4 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900 rounded-xl flex items-start gap-3">
            <HelpCircle className="w-5 h-5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
            <div className="text-xs leading-relaxed text-blue-900 dark:text-blue-200">
              <span className="font-semibold">Política de Preservación Documental:</span> Para no sobrecargar el almacenamiento del ERP con imágenes pesadas, guarde el comprobante escaneado en el Google Drive corporativo siguiendo la estructura jerárquica: <span className="font-mono font-bold">[Proveedor] / [Periodo Mes] / [Nombre del Archivo]</span>.
            </div>
          </div>

          {/* Carpeta Principal Sugerida */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <Folder className="w-4 h-4 text-amber-500" />
              1. Carpeta de Destino en Google Drive:
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={pathInfo.folderPath}
                className="flex-1 px-3.5 py-2.5 bg-slate-100 dark:bg-slate-800/80 border border-slate-300 dark:border-slate-700 rounded-xl font-mono text-xs sm:text-sm text-slate-800 dark:text-slate-200 select-all"
              />
              <button
                type="button"
                onClick={() => handleCopy(pathInfo.folderPath, 'folder')}
                className="px-3 py-2.5 min-h-[44px] bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl font-medium text-xs flex items-center gap-1.5 transition-colors shrink-0"
                title="Copiar ruta de carpeta"
              >
                {copiedField === 'folder' ? (
                  <>
                    <Check className="w-4 h-4 text-emerald-500" />
                    <span className="text-emerald-600 dark:text-emerald-400 font-semibold">Copiado</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    <span>Copiar</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Nombre de Archivo Sugerido */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <FileText className="w-4 h-4 text-indigo-500" />
              2. Nombre Estandarizado del Archivo:
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={pathInfo.suggestedFileName}
                className="flex-1 px-3.5 py-2.5 bg-slate-100 dark:bg-slate-800/80 border border-slate-300 dark:border-slate-700 rounded-xl font-mono text-xs sm:text-sm text-slate-800 dark:text-slate-200 select-all"
              />
              <button
                type="button"
                onClick={() => handleCopy(pathInfo.suggestedFileName, 'file')}
                className="px-3 py-2.5 min-h-[44px] bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl font-medium text-xs flex items-center gap-1.5 transition-colors shrink-0"
                title="Copiar nombre de archivo"
              >
                {copiedField === 'file' ? (
                  <>
                    <Check className="w-4 h-4 text-emerald-500" />
                    <span className="text-emerald-600 dark:text-emerald-400 font-semibold">Copiado</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    <span>Copiar</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Ruta Completa Integrada */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              3. Ruta Relativa Completa (Referencia Contable):
            </label>
            <div className="flex items-center gap-2">
              <div className="flex-1 p-2.5 bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-mono text-slate-600 dark:text-slate-400 break-all">
                {pathInfo.fullRelativePath}
              </div>
              <button
                type="button"
                onClick={() => handleCopy(pathInfo.fullRelativePath, 'full')}
                className="px-3 py-2.5 min-h-[44px] bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl font-medium text-xs flex items-center gap-1.5 transition-colors shrink-0"
              >
                {copiedField === 'full' ? (
                  <Check className="w-4 h-4 text-emerald-500" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>

          {/* Enlace Directo a Google Drive Opcional */}
          <div className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-2">
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              Vincular Enlace Directo del Archivo o Carpeta en Drive (Opcional):
            </label>
            <div className="flex items-center gap-2">
              <input
                type="url"
                placeholder="https://drive.google.com/file/d/..."
                value={driveUrlInput}
                onChange={(e) => setDriveUrlInput(e.target.value)}
                className="flex-1 px-3.5 py-2.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs sm:text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              />
              {driveUrlInput.startsWith('http') && (
                <a
                  href={driveUrlInput}
                  target="_blank"
                  rel="noreferrer"
                  className="p-2.5 min-h-[44px] text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-xl flex items-center justify-center transition-colors"
                  title="Abrir en pestaña nueva"
                >
                  <ExternalLink className="w-4 h-4" />
                </a>
              )}
            </div>
            <p className="text-[11px] text-slate-400">
              Al guardar este enlace, cualquier auditor o gerente podrá abrir el soporte original con un solo clic.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-50 dark:bg-slate-800/60 border-t border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="text-xs text-slate-500">
            {expense.driveBackupConfirmed ? (
              <span className="text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1">
                <Check className="w-4 h-4" /> Respaldo previamente marcado como completado
              </span>
            ) : (
              <span className="text-amber-600 dark:text-amber-400 font-medium flex items-center gap-1">
                <AlertCircle className="w-4 h-4" /> Pendiente de confirmación de respaldo
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 sm:flex-none px-4 py-2.5 min-h-[44px] text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl transition-colors"
            >
              Cerrar
            </button>
            <button
              type="button"
              onClick={handleSaveConfirmation}
              className="flex-1 sm:flex-none px-5 py-2.5 min-h-[44px] text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 active:bg-blue-800 rounded-xl shadow-md transition-all flex items-center justify-center gap-1.5"
            >
              {confirmed ? (
                <>
                  <Check className="w-4 h-4" />
                  <span>¡Guardado!</span>
                </>
              ) : (
                <span>Confirmar Respaldo Realizado</span>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default GoogleDriveBackupHelperModal;
