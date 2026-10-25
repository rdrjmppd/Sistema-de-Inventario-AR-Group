import React from 'react';
import {
  LayoutDashboard,
  Package,
  Boxes,
  ArrowLeftRight,
  FileSpreadsheet,
  Calculator,
  ScanLine,
  Users,
  Wallet,
  BarChart3,
  ShoppingCart,
  ShoppingBag,
  Lock,
  Webhook,
  Settings,
  X,
  History,
} from 'lucide-react';
import { NavigationTab, UserRole } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { useUIConfig } from '../../context/UIConfigContext';

interface SidebarProps {
  activeTab: NavigationTab;
  onSelectTab: (tab: NavigationTab) => void;
  isOpenMobile?: boolean;
  onCloseMobile?: () => void;
}

interface NavItem {
  id: NavigationTab;
  labelKey?: string;
  defaultLabel: string;
  group: 'OPERACIONES' | 'FINANZAS & OCR' | 'INTELIGENCIA & GOBIERNO';
  icon: React.FC<{ className?: string }>;
  allowedRoles: UserRole[];
}

const NAV_ITEMS: NavItem[] = [
  {
    id: 'DASHBOARD',
    defaultLabel: 'Torre de Control BI',
    group: 'OPERACIONES',
    icon: LayoutDashboard,
    allowedRoles: [UserRole.SUPERADMIN, UserRole.GERENTE, UserRole.ANALISTA, UserRole.OBSERVADOR],
  },
  {
    id: 'CATALOG',
    labelKey: 'module_inventory',
    defaultLabel: 'Catálogo Maestro SKU',
    group: 'OPERACIONES',
    icon: Package,
    allowedRoles: [UserRole.SUPERADMIN, UserRole.GERENTE, UserRole.ANALISTA, UserRole.OBSERVADOR],
  },
  {
    id: 'MULTILOCATION',
    defaultLabel: 'Existencias Sede / Depósito',
    group: 'OPERACIONES',
    icon: Boxes,
    allowedRoles: [UserRole.SUPERADMIN, UserRole.GERENTE, UserRole.ANALISTA, UserRole.OBSERVADOR],
  },
  {
    id: 'TRANSFERS',
    defaultLabel: 'Transferencias SADA',
    group: 'OPERACIONES',
    icon: ArrowLeftRight,
    allowedRoles: [UserRole.SUPERADMIN, UserRole.GERENTE, UserRole.ANALISTA],
  },
  {
    id: 'CHRYSTAL_IMPORT',
    labelKey: 'module_chrystal',
    defaultLabel: 'Importador Chrystal®',
    group: 'OPERACIONES',
    icon: FileSpreadsheet,
    allowedRoles: [UserRole.SUPERADMIN, UserRole.GERENTE, UserRole.ANALISTA],
  },
  {
    id: 'PURCHASE_ORDERS_CENTER',
    defaultLabel: 'Compras y Pedidos (7-60d)',
    group: 'OPERACIONES',
    icon: ShoppingBag,
    allowedRoles: [UserRole.SUPERADMIN, UserRole.GERENTE, UserRole.ANALISTA],
  },
  {
    id: 'PRICING',
    labelKey: 'module_pricing',
    defaultLabel: 'Precios & Tasa BCV',
    group: 'FINANZAS & OCR',
    icon: Calculator,
    allowedRoles: [UserRole.SUPERADMIN, UserRole.GERENTE, UserRole.ANALISTA],
  },
  {
    id: 'INVOICES_OCR',
    labelKey: 'module_ocr',
    defaultLabel: 'Facturas & OCR 4 Candados',
    group: 'FINANZAS & OCR',
    icon: ScanLine,
    allowedRoles: [UserRole.SUPERADMIN, UserRole.GERENTE, UserRole.ANALISTA],
  },
  {
    id: 'SUPPLIERS',
    defaultLabel: 'Directorio Proveedores',
    group: 'FINANZAS & OCR',
    icon: Users,
    allowedRoles: [UserRole.SUPERADMIN, UserRole.GERENTE, UserRole.ANALISTA, UserRole.OBSERVADOR],
  },
  {
    id: 'ACCOUNTS_PAYABLE',
    defaultLabel: 'Cuentas por Pagar (CxP)',
    group: 'FINANZAS & OCR',
    icon: Wallet,
    allowedRoles: [UserRole.SUPERADMIN, UserRole.GERENTE, UserRole.ANALISTA],
  },
  {
    id: 'ABC_ROTATION',
    defaultLabel: 'Rotación Pareto ABC',
    group: 'INTELIGENCIA & GOBIERNO',
    icon: BarChart3,
    allowedRoles: [UserRole.SUPERADMIN, UserRole.GERENTE, UserRole.ANALISTA, UserRole.OBSERVADOR],
  },
  {
    id: 'PURCHASE_SUGGESTIONS',
    defaultLabel: 'Riesgo & Alertas de Quiebre',
    group: 'INTELIGENCIA & GOBIERNO',
    icon: ShoppingCart,
    allowedRoles: [UserRole.SUPERADMIN, UserRole.GERENTE, UserRole.ANALISTA],
  },
  {
    id: 'POS_API_SYNC',
    defaultLabel: 'API Ventas POS Webhook',
    group: 'INTELIGENCIA & GOBIERNO',
    icon: Webhook,
    allowedRoles: [UserRole.SUPERADMIN, UserRole.GERENTE, UserRole.ANALISTA],
  },
  {
    id: 'MONTHLY_CLOSING',
    defaultLabel: 'Cierre Contable Mensual',
    group: 'INTELIGENCIA & GOBIERNO',
    icon: Lock,
    allowedRoles: [UserRole.SUPERADMIN, UserRole.GERENTE],
  },
  {
    id: 'SETTINGS_RBAC',
    defaultLabel: 'Gobernanza RBAC & Sedes',
    group: 'INTELIGENCIA & GOBIERNO',
    icon: Settings,
    allowedRoles: [UserRole.SUPERADMIN],
  },
  {
    id: 'AUDIT_HISTORY',
    defaultLabel: 'Histórico & Sesiones',
    group: 'INTELIGENCIA & GOBIERNO',
    icon: History,
    allowedRoles: [UserRole.SUPERADMIN, UserRole.GERENTE],
  },
];

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onSelectTab,
  isOpenMobile = false,
  onCloseMobile,
}) => {
  const { hasPermission } = useAuth();
  const { config } = useUIConfig();

  const groups: Array<NavItem['group']> = [
    'OPERACIONES',
    'FINANZAS & OCR',
    'INTELIGENCIA & GOBIERNO',
  ];

  const handleSelect = (tab: NavigationTab) => {
    onSelectTab(tab);
    if (onCloseMobile) {
      onCloseMobile();
    }
  };

  const renderNavContent = (isMobileDrawer: boolean) => (
    <>
      <div className="p-3 space-y-5 overflow-y-auto flex-1">
        {groups.map((group) => {
          const items = NAV_ITEMS.filter(
            (item) => item.group === group && hasPermission(item.allowedRoles)
          );
          if (items.length === 0) return null;

          return (
            <div key={group}>
              <div className="px-3 mb-1.5 text-[10px] font-mono uppercase tracking-wider text-slate-400 font-semibold">
                {group}
              </div>
              <nav className="space-y-1">
                {items.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeTab === item.id;
                  const label =
                    (item.labelKey && config.customLabels[item.labelKey]) ||
                    item.defaultLabel;

                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleSelect(item.id)}
                      className={`w-full flex items-center gap-2.5 px-3 ${
                        isMobileDrawer ? 'min-h-[44px] py-2.5 text-xs' : 'py-2 text-xs'
                      } rounded-lg font-medium transition cursor-pointer ${
                        isActive
                          ? 'bg-sky-600 text-white shadow-sm font-semibold'
                          : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
                      }`}
                    >
                      <Icon
                        className={`w-4 h-4 shrink-0 ${
                          isActive ? 'text-white' : 'text-slate-400'
                        }`}
                      />
                      <span className="truncate text-left">{label}</span>
                    </button>
                  );
                })}
              </nav>
            </div>
          );
        })}
      </div>

      {/* Bottom Governance Status */}
      <div className="p-3 border-t border-slate-800 bg-slate-950/60 text-[11px]">
        <div className="flex items-center justify-between text-slate-400 font-mono">
          <span>ESTÁNDAR SDD</span>
          <span className="text-emerald-400 font-bold">CERTIFICADO</span>
        </div>
        <div className="text-[10px] text-slate-400 mt-1 leading-tight">
          4 Candados OCR · Chrystal® Col B/F · BCV 17:00 VET
        </div>
      </div>
    </>
  );

  return (
    <>
      {/* Desktop Sidebar (visible on lg and above) */}
      <aside className="hidden lg:flex w-64 bg-slate-900 text-slate-300 border-r border-slate-800 flex-col shrink-0 select-none">
        {renderNavContent(false)}
      </aside>

      {/* Mobile Smartphone Slide-Over Navigation Drawer */}
      {isOpenMobile && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Menú de Navegación Móvil Chrystal ERP"
          className="fixed inset-0 z-50 lg:hidden flex"
        >
          <div
            className="fixed inset-0 bg-slate-950/75 backdrop-blur-xs"
            onClick={onCloseMobile}
          />
          <aside className="relative z-10 w-72 max-w-[85vw] bg-slate-900 text-slate-200 border-r border-slate-800 flex flex-col h-full shadow-2xl select-none">
            <div className="px-4 py-3 border-b border-slate-800 bg-slate-950 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-sky-600 flex items-center justify-center font-bold text-xs text-white">
                  CH®
                </div>
                <div>
                  <div className="text-xs font-bold text-white">CHRYSTAL® ERP MÓVIL</div>
                  <div className="text-[10px] font-mono text-sky-400">
                    Navegación Táctil Multi-Sede
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={onCloseMobile}
                aria-label="Cerrar menú móvil"
                className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            {renderNavContent(true)}
          </aside>
        </div>
      )}
    </>
  );
};

export default Sidebar;

