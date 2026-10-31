/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Lock, AlertCircle, CheckCircle2 } from 'lucide-react';
import { NavigationTab } from './types';
import { AuthProvider, useAuth } from './context/AuthContext';
import { UIConfigProvider } from './context/UIConfigContext';
import { InventoryProvider } from './context/InventoryContext';
import { FinanceProvider } from './context/FinanceContext';
import { OperationsBrmProvider } from './context/OperationsBrmContext';
import { ExpenseProvider } from './context/ExpenseContext';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { Layout } from './components/layout/Layout';
import { Footer } from './components/layout/Footer';
import { AnalyticsDashboard } from './components/dashboard/AnalyticsDashboard';
import { ProductCatalog } from './components/inventory/ProductCatalog';
import { MultiLocationStock } from './components/inventory/MultiLocationStock';
import { StockTransfers } from './components/inventory/StockTransfers';
import { ChrystalImporter } from './components/inventory/ChrystalImporter';
import { AbcRotationPanel } from './components/inventory/AbcRotationPanel';
import { PurchaseSuggestions } from './components/inventory/PurchaseSuggestions';
import { PurchaseOrdersCenter } from './components/inventory/PurchaseOrdersCenter';
import { SalesApiSimulator } from './components/inventory/SalesApiSimulator';
import { PricingCalculator } from './components/finance/PricingCalculator';
import { SupplierDirectory } from './components/finance/SupplierDirectory';
import { PurchaseInvoices } from './components/finance/PurchaseInvoices';
import { AccountsPayable } from './components/finance/AccountsPayable';
import { MonthlyClosing } from './components/finance/MonthlyClosing';
import { BusinessSettings } from './components/dashboard/BusinessSettings';
import { AuditHistoryView } from './components/dashboard/AuditHistoryView';
import { InventoryDiscardsView } from './components/inventory/InventoryDiscardsView';
import { MeatYieldView } from './components/operations/MeatYieldView';
import { FruverYieldView } from './components/operations/FruverYieldView';
import { SessionTimeoutWarningModal } from './components/common/SessionTimeoutWarningModal';
import { BRAND_ASSETS, BRAND_NAME, BRAND_LEGAL_NAME, BRAND_RIF } from './lib/brand-assets';

const ShelfStockManager = React.lazy(() =>
  import('./components/inventory/ShelfStockManager').then((m) => ({
    default: m.default || m.ShelfStockManager,
  }))
);

const RetentionsCenter = React.lazy(() =>
  import('./components/finance/RetentionsCenter').then((m) => ({
    default: m.default || m.RetentionsCenter,
  }))
);

const FefoColdChainCenter = React.lazy(() =>
  import('./components/operations/FefoColdChainCenter').then((m) => ({
    default: m.default || m.FefoColdChainCenter,
  }))
);

const ProductionRecipesView = React.lazy(() =>
  import('./components/operations/ProductionRecipesView').then((m) => ({
    default: m.default || m.ProductionRecipesView,
  }))
);

const BrmWhatsappCenter = React.lazy(() =>
  import('./components/finance/BrmWhatsappCenter').then((m) => ({
    default: m.default || m.BrmWhatsappCenter,
  }))
);

const BankReconciliationCenter = React.lazy(() =>
  import('./components/finance/BankReconciliationCenter').then((m) => ({
    default: m.default || m.BankReconciliationCenter,
  }))
);

const ExpensesCenter = React.lazy(() =>
  import('./components/expenses/ExpensesCenter').then((m) => ({
    default: m.default || m.ExpensesCenter,
  }))
);

const LoginView: React.FC = () => {
  const { login, logoutReason, clearLogoutReason } = useAuth();
  const [email, setEmail] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const res = login(email, pin);
    if (!res.success) {
      setError(res.error || 'Error de autenticación.');
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col justify-between">
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-5">
          <div className="flex items-center gap-3">
            <div className="w-14 h-14 rounded-2xl bg-white p-1 flex items-center justify-center shadow-lg border border-white/20 shrink-0 overflow-hidden">
              <img
                src={BRAND_ASSETS.logoPublicPath}
                alt={BRAND_NAME}
                className="w-full h-full object-contain"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = BRAND_ASSETS.logoDataUri;
                }}
              />
            </div>
            <div>
              <h1 className="text-base font-bold text-white tracking-tight">
                {BRAND_NAME}
              </h1>
              <p className="text-[11px] text-emerald-400 font-semibold">
                {BRAND_LEGAL_NAME}
              </p>
              <p className="text-[10px] text-slate-400">
                Chrystal® Enterprise ERP · RIF: {BRAND_RIF}
              </p>
            </div>
          </div>

          {logoutReason && (
            <div className="p-3.5 rounded-xl bg-amber-950/80 border border-amber-500/50 text-amber-200 text-xs flex items-start justify-between gap-2.5 animate-fadeIn">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold text-amber-300">Gobernanza de Sesiones (Seguridad)</p>
                  <p className="text-[11px] text-amber-200/90 leading-relaxed mt-0.5">{logoutReason}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={clearLogoutReason}
                className="text-amber-400 hover:text-amber-200 p-1 text-xs shrink-0 rounded transition"
                title="Cerrar aviso"
              >
                ✕
              </button>
            </div>
          )}

          {error && (
            <div className="p-3 rounded-lg bg-rose-950/80 border border-rose-500/40 text-rose-200 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-3.5 text-xs">
            <div>
              <label className="block font-semibold text-slate-300 mb-1">
                Correo Corporativo Autorizado
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="correo@empresa.com"
                autoComplete="username"
                className="w-full px-3 py-2.5 rounded-lg bg-slate-950 border border-slate-700 text-white font-mono focus:outline-none focus:border-sky-500"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-300 mb-1">
                PIN de Seguridad RBAC
              </label>
              <input
                type="password"
                required
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                placeholder="••••••"
                autoComplete="current-password"
                className="w-full px-3 py-2.5 rounded-lg bg-slate-950 border border-slate-700 text-white font-mono focus:outline-none focus:border-sky-500"
              />
            </div>

            <button
              type="submit"
              className="w-full py-2.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-bold flex items-center justify-center gap-2 transition shadow-md cursor-pointer"
            >
              <Lock className="w-4 h-4" />
              Iniciar Sesión en Torre de Control
            </button>
          </form>

          <div className="pt-2 border-t border-slate-800 flex items-center justify-between text-[11px] text-slate-400">
            <span className="flex items-center gap-1 text-emerald-400">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Decimal.js Activo
            </span>
            <span className="font-mono">America/Caracas (UTC-4)</span>
          </div>
        </div>
      </div>

      <Footer />
    </div>
  );
};

export const STORAGE_KEY_ACTIVE_TAB = 'chrystal_erp_active_tab_v1';

export const VALID_NAVIGATION_TABS: NavigationTab[] = [
  'DASHBOARD',
  'CATALOG',
  'MULTILOCATION',
  'SHELF_STOCK',
  'TRANSFERS',
  'INVENTORY_DISCARDS',
  'MEAT_YIELD',
  'FRUVER_YIELD',
  'FEFO_COLD_CHAIN',
  'PRODUCTION_RECIPES',
  'CHRYSTAL_IMPORT',
  'PRICING',
  'INVOICES_OCR',
  'TAX_RETENTIONS',
  'BRM_WHATSAPP',
  'BANK_RECONCILIATION',
  'SUPPLIERS',
  'ACCOUNTS_PAYABLE',
  'EXPENSES_CONTROL',
  'ABC_ROTATION',
  'PURCHASE_SUGGESTIONS',
  'PURCHASE_ORDERS_CENTER',
  'POS_API_SYNC',
  'MONTHLY_CLOSING',
  'SETTINGS_RBAC',
  'AUDIT_HISTORY',
];

export function resolveStoredActiveTab(): NavigationTab {
  try {
    if (typeof window !== 'undefined') {
      const hash = window.location.hash.replace('#', '').toUpperCase() as NavigationTab;
      if (VALID_NAVIGATION_TABS.includes(hash)) {
        return hash;
      }
      const saved = localStorage.getItem(STORAGE_KEY_ACTIVE_TAB) as NavigationTab;
      if (saved && VALID_NAVIGATION_TABS.includes(saved)) {
        return saved;
      }
    }
  } catch {
    // fallback
  }
  return 'DASHBOARD';
}

const MainShell: React.FC = () => {
  const {
    isAuthenticated,
    isTimeoutWarningOpen,
    timeoutCountdownSeconds,
    renewSession,
    logout,
  } = useAuth();
  const [activeTab, setActiveTabState] = useState<NavigationTab>(() => resolveStoredActiveTab());

  // Listen to browser hash changes (back/forward navigation)
  React.useEffect(() => {
    const handleHashChange = () => {
      const target = resolveStoredActiveTab();
      setActiveTabState(target);
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const setActiveTab = (tab: NavigationTab) => {
    setActiveTabState(tab);
    try {
      localStorage.setItem(STORAGE_KEY_ACTIVE_TAB, tab);
      if (typeof window !== 'undefined' && window.location.hash !== `#${tab.toLowerCase()}`) {
        window.history.replaceState(null, '', `#${tab.toLowerCase()}`);
      }
    } catch {
      // ignore storage failure
    }
  };

  if (!isAuthenticated) {
    return <LoginView />;
  }

  return (
    <>
      <Layout activeTab={activeTab} onSelectTab={setActiveTab}>
        <React.Suspense
          fallback={
            <div className="p-8 text-center text-xs font-mono text-slate-500">
              Cargando módulo operativo...
            </div>
          }
        >
          {activeTab === 'DASHBOARD' && <AnalyticsDashboard onNavigate={setActiveTab} />}
          {activeTab === 'CATALOG' && <ProductCatalog />}
          {activeTab === 'MULTILOCATION' && <MultiLocationStock />}
          {activeTab === 'SHELF_STOCK' && <ShelfStockManager />}
          {activeTab === 'TRANSFERS' && <StockTransfers />}
          {activeTab === 'INVENTORY_DISCARDS' && <InventoryDiscardsView />}
          {activeTab === 'MEAT_YIELD' && <MeatYieldView />}
          {activeTab === 'FRUVER_YIELD' && <FruverYieldView />}
          {activeTab === 'FEFO_COLD_CHAIN' && <FefoColdChainCenter />}
          {activeTab === 'PRODUCTION_RECIPES' && <ProductionRecipesView />}
          {activeTab === 'CHRYSTAL_IMPORT' && <ChrystalImporter />}
          {activeTab === 'PRICING' && <PricingCalculator />}
          {activeTab === 'INVOICES_OCR' && <PurchaseInvoices />}
          {activeTab === 'TAX_RETENTIONS' && <RetentionsCenter onNavigate={setActiveTab} />}
          {activeTab === 'BRM_WHATSAPP' && <BrmWhatsappCenter onNavigate={setActiveTab} />}
          {activeTab === 'BANK_RECONCILIATION' && <BankReconciliationCenter />}
          {activeTab === 'SUPPLIERS' && <SupplierDirectory />}
          {activeTab === 'ACCOUNTS_PAYABLE' && <AccountsPayable />}
          {activeTab === 'EXPENSES_CONTROL' && <ExpensesCenter onNavigate={setActiveTab} />}
          {activeTab === 'ABC_ROTATION' && <AbcRotationPanel />}
          {activeTab === 'PURCHASE_SUGGESTIONS' && <PurchaseSuggestions onNavigate={setActiveTab} />}
          {activeTab === 'PURCHASE_ORDERS_CENTER' && <PurchaseOrdersCenter />}
          {activeTab === 'POS_API_SYNC' && <SalesApiSimulator />}
          {activeTab === 'MONTHLY_CLOSING' && <MonthlyClosing />}
          {activeTab === 'SETTINGS_RBAC' && <BusinessSettings />}
          {activeTab === 'AUDIT_HISTORY' && <AuditHistoryView />}
        </React.Suspense>
      </Layout>

      <SessionTimeoutWarningModal
        isOpen={isTimeoutWarningOpen}
        secondsRemaining={timeoutCountdownSeconds}
        onRenewSession={renewSession}
        onLogoutNow={logout}
      />
    </>
  );
};

export const App: React.FC = () => {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <UIConfigProvider>
          <FinanceProvider>
            <InventoryProvider>
              <OperationsBrmProvider>
                <ExpenseProvider>
                  <MainShell />
                </ExpenseProvider>
              </OperationsBrmProvider>
            </InventoryProvider>
          </FinanceProvider>
        </UIConfigProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
};

export default App;
