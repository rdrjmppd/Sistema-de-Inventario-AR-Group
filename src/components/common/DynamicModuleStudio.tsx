import React, { useState } from 'react';
import { X, Sliders, Plus, Trash2, Database, Check } from 'lucide-react';
import { useUIConfig } from '../../context/UIConfigContext';
import { CustomFieldDefinition } from '../../types';

interface DynamicModuleStudioProps {
  onClose: () => void;
}

export const DynamicModuleStudio: React.FC<DynamicModuleStudioProps> = ({ onClose }) => {
  const {
    config,
    dynamicRecords,
    toggleDensity,
    updateCustomLabel,
    addCustomField,
    removeCustomField,
    addDynamicRecord,
    deleteDynamicRecord,
  } = useUIConfig();

  const [newFieldModule, setNewFieldModule] =
    useState<CustomFieldDefinition['module']>('PRODUCTOS');
  const [newFieldLabel, setNewFieldLabel] = useState('');
  const [newFieldKey, setNewFieldKey] = useState('');
  const [newFieldType, setNewFieldType] = useState<CustomFieldDefinition['type']>('TEXT');

  const [recordModule, setRecordModule] = useState('AUDITORIA');
  const [recordNote, setRecordNote] = useState('');
  const [recordCode, setRecordCode] = useState('SADA-2026-991');

  const handleCreateField = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFieldLabel.trim() || !newFieldKey.trim()) return;
    addCustomField({
      module: newFieldModule,
      label: newFieldLabel.trim(),
      key: newFieldKey.trim().toLowerCase().replace(/\s+/g, '_'),
      type: newFieldType,
      required: false,
    });
    setNewFieldLabel('');
    setNewFieldKey('');
  };

  const handleCreateRecord = (e: React.FormEvent) => {
    e.preventDefault();
    if (!recordNote.trim()) return;
    addDynamicRecord(recordModule, {
      codigo_control: recordCode,
      observacion: recordNote,
      verificado_bcv: true,
    });
    setRecordNote('');
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white border border-slate-200 rounded-xl max-w-4xl w-full shadow-2xl overflow-hidden text-slate-900">
        <div className="flex items-center justify-between px-6 py-4 bg-slate-900 text-white">
          <div className="flex items-center gap-2.5">
            <Sliders className="w-5 h-5 text-sky-400" />
            <div>
              <h2 className="text-sm font-bold">
                Studio No-Code Superadmin (`ui_config` & `dynamic_modules`)
              </h2>
              <p className="text-[11px] text-slate-400">
                Personalización en Caliente de Etiquetas, Densidad Visual, Metadatos y Tablas Dinámicas
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 grid grid-cols-1 lg:grid-cols-2 gap-6 max-h-[78vh] overflow-y-auto">
          {/* Left Column: UI Config & Labels */}
          <div className="space-y-5">
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-3">
                1. Densidad Operativa y Etiquetas de Navegación
              </h3>
              <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-200">
                <div>
                  <div className="text-xs font-semibold">Densidad de Tablas ERP</div>
                  <div className="text-[11px] text-slate-500">
                    Actual: {config.density === 'compact' ? 'Compacta (Alta Densidad)' : 'Confortable'}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={toggleDensity}
                  className="px-3 py-1.5 rounded bg-slate-900 text-white text-xs font-medium hover:bg-slate-800"
                >
                  Alternar Densidad
                </button>
              </div>

              <div className="space-y-2.5">
                {Object.entries(config.customLabels).map(([key, val]) => (
                  <div key={key}>
                    <label className="block text-[10px] font-mono uppercase text-slate-500 mb-1">
                      Etiqueta ({key})
                    </label>
                    <input
                      type="text"
                      value={val}
                      onChange={(e) => updateCustomLabel(key, e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded bg-white focus:outline-none focus:border-sky-600"
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Dynamic Custom Fields */}
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-3">
                2. Campos Personalizados (`customFields`)
              </h3>
              <form onSubmit={handleCreateField} className="grid grid-cols-2 gap-2 mb-3">
                <select
                  value={newFieldModule}
                  onChange={(e) =>
                    setNewFieldModule(e.target.value as CustomFieldDefinition['module'])
                  }
                  className="px-2 py-1.5 text-xs border border-slate-300 rounded bg-white"
                >
                  <option value="PRODUCTOS">Módulo: PRODUCTOS</option>
                  <option value="PROVEEDORES">Módulo: PROVEEDORES</option>
                  <option value="AUDITORIA">Módulo: AUDITORÍA</option>
                </select>
                <select
                  value={newFieldType}
                  onChange={(e) =>
                    setNewFieldType(e.target.value as CustomFieldDefinition['type'])
                  }
                  className="px-2 py-1.5 text-xs border border-slate-300 rounded bg-white"
                >
                  <option value="TEXT">Tipo: Texto</option>
                  <option value="NUMBER">Tipo: Número</option>
                  <option value="BOOLEAN">Tipo: Booleano</option>
                </select>
                <input
                  type="text"
                  placeholder="Nombre visible (ej. Permiso INSAI)"
                  value={newFieldLabel}
                  onChange={(e) => setNewFieldLabel(e.target.value)}
                  className="px-2.5 py-1.5 text-xs border border-slate-300 rounded bg-white"
                />
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    placeholder="Clave (ej. permiso_insai)"
                    value={newFieldKey}
                    onChange={(e) => setNewFieldKey(e.target.value)}
                    className="flex-1 px-2.5 py-1.5 text-xs border border-slate-300 rounded bg-white font-mono"
                  />
                  <button
                    type="submit"
                    className="px-3 py-1.5 rounded bg-sky-600 text-white text-xs font-semibold hover:bg-sky-500 flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
              </form>

              <div className="space-y-1.5 max-h-40 overflow-y-auto">
                {config.customFields.map((cf) => (
                  <div
                    key={cf.id}
                    className="flex items-center justify-between px-2.5 py-1.5 bg-white border border-slate-200 rounded text-xs"
                  >
                    <div>
                      <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 mr-2">
                        {cf.module}
                      </span>
                      <span className="font-semibold">{cf.label}</span>
                      <span className="text-slate-400 font-mono text-[10px] ml-1.5">
                        ({cf.key})
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeCustomField(cf.id)}
                      className="text-slate-400 hover:text-rose-600"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right Column: Dynamic Modules Records */}
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Database className="w-4 h-4 text-sky-600" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                  3. Registros en Colección `dynamic_modules`
                </h3>
              </div>

              <form onSubmit={handleCreateRecord} className="space-y-2.5 mb-4">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] font-mono uppercase text-slate-500 mb-1">
                      Esquema Destino
                    </label>
                    <select
                      value={recordModule}
                      onChange={(e) => setRecordModule(e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded bg-white"
                    >
                      <option value="AUDITORIA">AUDITORÍA SADA / FRÍO</option>
                      <option value="INSPECCION_CALIDAD">INSPECCIÓN CALIDAD</option>
                      <option value="LOGISTICA_FLOTA">LOGÍSTICA DE FLOTA</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-mono uppercase text-slate-500 mb-1">
                      Código Guía / Lote
                    </label>
                    <input
                      type="text"
                      value={recordCode}
                      onChange={(e) => setRecordCode(e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded bg-white font-mono"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-mono uppercase text-slate-500 mb-1">
                    Observación Dinámica Persistente
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Ej. Verificación térmica Cava PZO -4°C aprobada"
                      value={recordNote}
                      onChange={(e) => setRecordNote(e.target.value)}
                      className="flex-1 px-2.5 py-1.5 text-xs border border-slate-300 rounded bg-white"
                    />
                    <button
                      type="submit"
                      className="px-3 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-1"
                    >
                      <Check className="w-3.5 h-3.5" />
                      Guardar
                    </button>
                  </div>
                </div>
              </form>

              <div className="space-y-2 max-h-64 overflow-y-auto">
                {dynamicRecords.map((rec) => (
                  <div
                    key={rec.id}
                    className="p-3 bg-white border border-slate-200 rounded-lg text-xs space-y-1"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-bold text-[10px] px-2 py-0.5 rounded bg-sky-100 text-sky-800">
                        {rec.moduleName}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[10px] text-slate-400">
                          {rec.createdAt.slice(0, 16).replace('T', ' ')}
                        </span>
                        <button
                          type="button"
                          onClick={() => deleteDynamicRecord(rec.id)}
                          className="text-slate-400 hover:text-rose-600"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                    <pre className="text-[11px] font-mono text-slate-700 bg-slate-50 p-2 rounded overflow-x-auto">
                      {JSON.stringify(rec.values, null, 2)}
                    </pre>
                  </div>
                ))}
              </div>
            </div>

            <div className="pt-3 border-t border-slate-200 flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-lg bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800"
              >
                Aplicar y Volver al ERP
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DynamicModuleStudio;
