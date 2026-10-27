import React, { useState } from 'react';
import {
  LayoutDashboard,
  Package,
  Boxes,
  ShoppingBag,
  Menu,
} from 'lucide-react';
import { NavigationTab } from '../../types';
import { Navbar } from './Navbar';
import { Sidebar } from './Sidebar';
import { Footer } from './Footer';
import { DynamicModuleStudio } from '../common/DynamicModuleStudio';
import { DiagnosticConsole } from '../common/DiagnosticConsole';
import { ReorderNotificationCenter } from '../common/ReorderNotificationCenter';
import { CompanyProfileModal } from '../common/CompanyProfileModal';
import { ChatAssistantWidget } from '../assistant/ChatAssistantWidget';
import { MobileInstallBanner } from './MobileInstallBanner';
import { useUIConfig } from '../../context/UIConfigContext';

interface LayoutProps {
  activeTab: NavigationTab;
  onSelectTab: (tab: NavigationTab) => void;
  children: React.ReactNode;
}

interface AssistantBoundaryState {
  hasError: boolean;
}

class AssistantWidgetErrorBoundary extends React.Component<
  { children: React.ReactNode },
  AssistantBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): AssistantBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.warn('[PolarBot Boundary Caught]:', error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false });
  };

  render() {
    if (this.state.hasError) {
      return (
        <aside
          aria-label="Aviso de recuperación de PolarBot"
          className="fixed bottom-36 right-4 lg:bottom-6 lg:right-6 z-40 bg-slate-900/95 border border-amber-500/50 rounded-2xl p-3 text-xs text-white shadow-2xl flex items-center gap-2.5 backdrop-blur-md"
        >
          <span className="text-[11px] text-slate-300">PolarBot protegido contra fallos.</span>
          <button
            type="button"
            onClick={this.handleRetry}
            className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-[10px] font-bold text-white transition cursor-pointer"
          >
            Reconectar
          </button>
        </aside>
      );
    }
    return this.props.children;
  }
}

export const Layout: React.FC<LayoutProps> = ({ activeTab, onSelectTab, children }) => {
  const [studioOpen, setStudioOpen] = useState(false);
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { config } = useUIConfig();

  const mobileQuickTabs: Array<{
    id: NavigationTab;
    label: string;
    icon: React.FC<{ className?: string }>;
  }> = [
    { id: 'DASHBOARD', label: 'Torre BI', icon: LayoutDashboard },
    { id: 'CATALOG', label: 'Catálogo', icon: Package },
    { id: 'MULTILOCATION', label: 'Sedes', icon: Boxes },
    { id: 'PURCHASE_ORDERS_CENTER', label: 'Compras', icon: ShoppingBag },
  ];

  return (
    <div
      className={`min-h-screen flex flex-col bg-slate-50 text-slate-900 overflow-x-hidden ${
        config.density === 'compact' ? 'text-xs' : 'text-sm'
      }`}
    >
      <Navbar
        onOpenStudio={() => setStudioOpen(true)}
        onOpenDiagnostics={() => setDiagnosticsOpen(true)}
        onOpenNotifications={() => setNotificationsOpen(true)}
        onOpenMobileMenu={() => setMobileMenuOpen(true)}
      />

      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          activeTab={activeTab}
          onSelectTab={onSelectTab}
          isOpenMobile={mobileMenuOpen}
          onCloseMobile={() => setMobileMenuOpen(false)}
        />

        <main className="flex-1 overflow-y-auto overflow-x-hidden p-3 sm:p-4 lg:p-6 pb-20 lg:pb-6">
          <div className="max-w-[1540px] mx-auto space-y-4 sm:space-y-5">{children}</div>
        </main>
      </div>

      <Footer />

      {/* Mobile PWA / A2HS Install Banner positioned directly above mobile bottom nav */}
      <MobileInstallBanner />

      {/* Smartphone Bottom Quick Navigation Bar (visible on < lg screens) */}
      <nav
        aria-label="Barra de navegación rápida móvil"
        className="lg:hidden sticky bottom-0 inset-x-0 z-40 bg-slate-950/95 backdrop-blur-md border-t border-slate-800 px-1.5 py-1 flex items-center justify-around shadow-2xl"
      >
        {mobileQuickTabs.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectTab(item.id)}
              className={`min-h-[48px] min-w-[56px] flex-1 flex flex-col items-center justify-center gap-0.5 rounded-lg px-1 py-1 text-[10px] font-semibold transition cursor-pointer ${
                isActive
                  ? 'bg-sky-600/20 text-sky-400 font-bold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Icon className={`w-4 h-4 ${isActive ? 'text-sky-400' : 'text-slate-400'}`} />
              <span className="truncate max-w-[68px]">{item.label}</span>
            </button>
          );
        })}

        <button
          type="button"
          onClick={() => setMobileMenuOpen(true)}
          aria-label="Abrir todos los módulos en menú móvil"
          className="min-h-[48px] min-w-[56px] flex-1 flex flex-col items-center justify-center gap-0.5 rounded-lg px-1 py-1 text-[10px] font-semibold text-emerald-400 hover:text-emerald-300 transition cursor-pointer"
        >
          <Menu className="w-4 h-4 text-emerald-400" />
          <span>Módulos</span>
        </button>
      </nav>

      <ReorderNotificationCenter
        isOpen={notificationsOpen}
        onClose={() => setNotificationsOpen(false)}
        onNavigate={onSelectTab}
      />

      <CompanyProfileModal />

      <AssistantWidgetErrorBoundary>
        <ChatAssistantWidget onNavigate={onSelectTab} />
      </AssistantWidgetErrorBoundary>

      {studioOpen && <DynamicModuleStudio onClose={() => setStudioOpen(false)} />}
      {diagnosticsOpen && <DiagnosticConsole onClose={() => setDiagnosticsOpen(false)} />}
    </div>
  );
};

export default Layout;


