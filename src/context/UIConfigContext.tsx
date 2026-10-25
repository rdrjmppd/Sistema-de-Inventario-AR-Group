import React, { createContext, useContext, useState, useEffect } from 'react';
import {
  UIConfigState,
  CustomFieldDefinition,
  DynamicRecord,
  CompanyFiscalProfile,
} from '../types';
import { getCaracasNow } from '../lib/bcv';
import { DEFAULT_COMPANY_PROFILE, resolveCompanyProfile } from '../lib/excel-exporter';

interface UIConfigContextType {
  config: UIConfigState;
  dynamicRecords: DynamicRecord[];
  isCompanyModalOpen: boolean;
  setIsCompanyModalOpen: (open: boolean) => void;
  updateCompanyProfile: (updates: Partial<CompanyFiscalProfile>) => void;
  resetCompanyProfileToDefault: () => void;
  updatePrimaryColor: (hex: string) => void;
  toggleDensity: () => void;
  updateCustomLabel: (key: string, value: string) => void;
  addCustomField: (field: Omit<CustomFieldDefinition, 'id'>) => void;
  removeCustomField: (id: string) => void;
  addDynamicRecord: (moduleName: string, values: Record<string, string | number | boolean>) => void;
  deleteDynamicRecord: (id: string) => void;
}

const DEFAULT_CONFIG: UIConfigState = {
  primaryColorHex: '#0F172A',
  accentColorHex: '#0284C7',
  density: 'compact',
  showDiagnosticWatermark: true,
  customLabels: {
    module_inventory: 'Catálogo Maestro & Multi-Sede',
    module_pricing: 'Ingeniería de Precios & BCV',
    module_ocr: 'Auditoría Forense OCR (4 Candados)',
    module_chrystal: 'Importador Chrystal® (Col B / F)',
  },
  customFields: [
    {
      id: 'cf-sada-code',
      module: 'PRODUCTOS',
      key: 'codigo_sada',
      label: 'Código Guía SADA / SUNAGRO',
      type: 'TEXT',
      required: true,
    },
    {
      id: 'cf-temp-control',
      module: 'AUDITORIA',
      key: 'temp_recepcion_c',
      label: 'Temperatura Recepción (°C)',
      type: 'NUMBER',
      required: true,
    },
    {
      id: 'cf-cadena-frio',
      module: 'PROVEEDORES',
      key: 'certificado_sanitario',
      label: 'Permiso Sanitario Vigente',
      type: 'BOOLEAN',
      required: false,
    },
  ],
  companyProfile: { ...DEFAULT_COMPANY_PROFILE },
};

const STORAGE_KEY_UICONFIG = 'chrystal_erp_uiconfig_v1';
const STORAGE_KEY_DYNRECORDS = 'chrystal_erp_dynrecords_v1';

const INITIAL_DYNAMIC_RECORDS: DynamicRecord[] = [
  {
    id: 'dyn-001',
    moduleName: 'AUDITORIA',
    createdAt: '2026-03-20T09:30:00-04:00',
    createdBy: 'rdrj.mppd@gmail.com',
    values: {
      codigo_sada: 'SADA-BOL-88412',
      temp_recepcion_c: 3.8,
      certificado_sanitario: true,
      observacion: 'Recepción de lácteos en Cava Cuarto PZO conforme a norma.',
    },
  },
];

const UIConfigContext = createContext<UIConfigContextType | undefined>(undefined);

export const UIConfigProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [config, setConfig] = useState<UIConfigState>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_UICONFIG);
      if (saved) {
        const parsed = JSON.parse(saved) as Partial<UIConfigState>;
        return {
          ...DEFAULT_CONFIG,
          ...parsed,
          companyProfile: resolveCompanyProfile(parsed.companyProfile),
        };
      }
    } catch {
      // ignore
    }
    return DEFAULT_CONFIG;
  });

  const [isCompanyModalOpen, setIsCompanyModalOpen] = useState(false);

  const [dynamicRecords, setDynamicRecords] = useState<DynamicRecord[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_DYNRECORDS);
      if (saved) return JSON.parse(saved);
    } catch {
      // ignore
    }
    return INITIAL_DYNAMIC_RECORDS;
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_UICONFIG, JSON.stringify(config));
    } catch {
      // ignore
    }
  }, [config]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_DYNRECORDS, JSON.stringify(dynamicRecords));
    } catch {
      // ignore
    }
  }, [dynamicRecords]);

  const updateCompanyProfile = (updates: Partial<CompanyFiscalProfile>) => {
    const now = getCaracasNow();
    setConfig((prev) => {
      const merged = resolveCompanyProfile({
        ...prev.companyProfile,
        ...updates,
        isCustomConfigured: true,
        updatedAtVet: `${now.dateFormatted} ${now.timeFormatted}`,
      });
      return {
        ...prev,
        companyProfile: merged,
      };
    });
  };

  const resetCompanyProfileToDefault = () => {
    const now = getCaracasNow();
    setConfig((prev) => ({
      ...prev,
      companyProfile: {
        ...DEFAULT_COMPANY_PROFILE,
        isCustomConfigured: false,
        updatedAtVet: `${now.dateFormatted} ${now.timeFormatted}`,
      },
    }));
  };

  const updatePrimaryColor = (hex: string) => {
    setConfig((prev) => ({ ...prev, primaryColorHex: hex }));
  };

  const toggleDensity = () => {
    setConfig((prev) => ({
      ...prev,
      density: prev.density === 'compact' ? 'comfortable' : 'compact',
    }));
  };

  const updateCustomLabel = (key: string, value: string) => {
    setConfig((prev) => ({
      ...prev,
      customLabels: {
        ...prev.customLabels,
        [key]: value,
      },
    }));
  };

  const addCustomField = (field: Omit<CustomFieldDefinition, 'id'>) => {
    const newField: CustomFieldDefinition = {
      ...field,
      id: `cf-${Date.now()}`,
    };
    setConfig((prev) => ({
      ...prev,
      customFields: [...prev.customFields, newField],
    }));
  };

  const removeCustomField = (id: string) => {
    setConfig((prev) => ({
      ...prev,
      customFields: prev.customFields.filter((f) => f.id !== id),
    }));
  };

  const addDynamicRecord = (
    moduleName: string,
    values: Record<string, string | number | boolean>
  ) => {
    const rec: DynamicRecord = {
      id: `dyn-${Date.now()}`,
      moduleName,
      createdAt: getCaracasNow().isoTimestamp,
      createdBy: 'rdrj.mppd@gmail.com',
      values,
    };
    setDynamicRecords((prev) => [rec, ...prev]);
  };

  const deleteDynamicRecord = (id: string) => {
    setDynamicRecords((prev) => prev.filter((r) => r.id !== id));
  };

  return (
    <UIConfigContext.Provider
      value={{
        config,
        dynamicRecords,
        isCompanyModalOpen,
        setIsCompanyModalOpen,
        updateCompanyProfile,
        resetCompanyProfileToDefault,
        updatePrimaryColor,
        toggleDensity,
        updateCustomLabel,
        addCustomField,
        removeCustomField,
        addDynamicRecord,
        deleteDynamicRecord,
      }}
    >
      {children}
    </UIConfigContext.Provider>
  );
};

export const useUIConfig = () => {
  const ctx = useContext(UIConfigContext);
  if (!ctx) throw new Error('useUIConfig debe usarse dentro de un UIConfigProvider');
  return ctx;
};

export default UIConfigContext;

