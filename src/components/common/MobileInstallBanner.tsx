/**
 * Mobile PWA Install & Direct Link Download Component
 * Renders official brand logo (Hiper Abasto Polar, C.A.) and enables Add to Home Screen (A2HS).
 * Handles Android/Chrome (beforeinstallprompt) and iOS Safari (interactive install guide).
 * Ecosystem: 11 Specialized Agents (AGENTS.md)
 * Official Copyright: © 2026 AR Group. Todos los derechos de desarrollo reservados.
 */

import React, { useState, useEffect } from 'react';
import {
  Download,
  Share,
  PlusSquare,
  Smartphone,
  X,
  CheckCircle2,
  Sparkles,
} from 'lucide-react';
import { BRAND_ASSETS, BRAND_NAME, BRAND_LEGAL_NAME } from '../../lib/brand-assets';

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
  prompt(): Promise<void>;
}

export const MobileInstallBanner: React.FC = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isStandalone, setIsStandalone] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);
  const [isIos, setIsIos] = useState(false);
  const [showIosGuide, setShowIosGuide] = useState(false);
  const [installedSuccess, setInstalledSuccess] = useState(false);

  useEffect(() => {
    // 1. Check if already installed / running in standalone mode
    const standaloneMode =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true ||
      document.referrer.includes('android-app://');

    setIsStandalone(Boolean(standaloneMode));

    // 2. Check session dismissal
    const dismissed = sessionStorage.getItem('chrystal_mobile_install_dismissed');
    if (dismissed === 'true') {
      setIsDismissed(true);
    }

    // 3. Detect iOS device
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIosDevice =
      /iphone|ipad|ipod/.test(userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

    setIsIos(isIosDevice);

    // 4. Capture Chromium beforeinstallprompt event
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    // 5. Detect app installed event
    const handleAppInstalled = () => {
      setInstalledSuccess(true);
      setDeferredPrompt(null);
      setTimeout(() => {
        setIsStandalone(true);
      }, 3000);
    };

    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const handleInstallClick = async () => {
    if (isIos) {
      setShowIosGuide(true);
      return;
    }

    if (deferredPrompt) {
      try {
        await deferredPrompt.prompt();
        const choice = await deferredPrompt.userChoice;
        if (choice.outcome === 'accepted') {
          setInstalledSuccess(true);
        }
        setDeferredPrompt(null);
      } catch (err) {
        console.warn('[PWA] Error launching prompt:', err);
      }
    } else {
      // Fallback for browsers where prompt is not available
      setShowIosGuide(true);
    }
  };

  const handleDismiss = () => {
    setIsDismissed(true);
    sessionStorage.setItem('chrystal_mobile_install_dismissed', 'true');
  };

  // If already installed or dismissed, do not render banner
  if (isStandalone || isDismissed) {
    return null;
  }

  // Only show on mobile / tablet viewport (width < 1024px) or if prompt is explicitly captured
  return (
    <>
      {/* Floating Bottom Mobile Install Banner (Above mobile navigation bar) */}
      <div className="fixed bottom-18 left-3 right-3 md:bottom-6 md:left-auto md:right-24 z-30 max-w-md mx-auto transition-all duration-300">
        <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-emerald-950 text-white rounded-2xl p-3.5 shadow-2xl border border-emerald-500/40 backdrop-blur-md flex items-center gap-3">
          {/* Official Hiper Abasto Polar Logo Container */}
          <div className="relative w-12 h-12 rounded-xl bg-white p-1 flex items-center justify-center shadow-lg border border-white/20 flex-shrink-0 overflow-hidden">
            <img
              src={BRAND_ASSETS.logoPublicPath}
              alt={BRAND_NAME}
              className="w-full h-full object-contain"
              onError={(e) => {
                // Fallback to data URI if public path asset has delay
                (e.target as HTMLImageElement).src = BRAND_ASSETS.logoDataUri;
              }}
            />
            <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
            </span>
          </div>

          {/* Banner Text Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <h4 className="font-bold text-xs text-white truncate">
                {BRAND_NAME}
              </h4>
              <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 text-[9px] font-semibold px-1.5 py-0.2 rounded-full">
                App Móvil
              </span>
            </div>
            <p className="text-[11px] text-slate-300 truncate">
              {installedSuccess
                ? '¡Acceso directo instalado con éxito!'
                : 'Descarga el acceso directo en tu teléfono'}
            </p>
          </div>

          {/* Install CTA Button & Dismiss Button */}
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <button
              type="button"
              onClick={handleInstallClick}
              aria-label="Descargar e instalar enlace directo en móvil"
              className="min-h-[44px] min-w-[44px] px-3 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs rounded-xl shadow-md flex items-center gap-1.5 transition active:scale-95 cursor-pointer border border-emerald-400/30"
            >
              <Download className="w-4 h-4 text-white animate-bounce" />
              <span className="hidden sm:inline">Instalar</span>
            </button>

            <button
              type="button"
              onClick={handleDismiss}
              aria-label="Cerrar aviso de instalación móvil"
              className="min-h-[44px] min-w-[44px] p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition flex items-center justify-center cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* iOS / Fallback Instructional Modal */}
      {showIosGuide && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl border border-slate-200 text-slate-800 animate-in fade-in slide-in-from-bottom duration-200">
            {/* Header with Brand Logo */}
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-slate-900 p-1 flex items-center justify-center shadow-md">
                  <img
                    src={BRAND_ASSETS.logoPublicPath}
                    alt={BRAND_NAME}
                    className="w-full h-full object-contain rounded-xl"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = BRAND_ASSETS.logoDataUri;
                    }}
                  />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-slate-900">{BRAND_NAME}</h3>
                  <p className="text-[11px] text-slate-500">{BRAND_LEGAL_NAME}</p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowIosGuide(false)}
                aria-label="Cerrar guía de instalación"
                className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-full transition min-w-[44px] min-h-[44px] flex items-center justify-center"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Step-by-Step Instructions */}
            <div className="py-4 space-y-3.5">
              <p className="text-xs text-slate-600 font-medium">
                Sigue estos 3 pasos para instalar el acceso directo con el logotipo oficial en la pantalla de inicio de tu teléfono:
              </p>

              <div className="space-y-2.5">
                <div className="flex items-start gap-3 p-2.5 bg-slate-50 rounded-xl border border-slate-100">
                  <div className="w-7 h-7 rounded-lg bg-emerald-600 text-white flex items-center justify-center font-bold text-xs flex-shrink-0">
                    1
                  </div>
                  <div className="text-xs text-slate-700 flex-1">
                    Toca el botón <strong className="font-semibold text-slate-900">Compartir</strong>{' '}
                    <Share className="w-3.5 h-3.5 inline text-sky-600 mb-0.5" /> en la barra inferior de tu navegador Safari o Chrome.
                  </div>
                </div>

                <div className="flex items-start gap-3 p-2.5 bg-slate-50 rounded-xl border border-slate-100">
                  <div className="w-7 h-7 rounded-lg bg-emerald-600 text-white flex items-center justify-center font-bold text-xs flex-shrink-0">
                    2
                  </div>
                  <div className="text-xs text-slate-700 flex-1">
                    Desplaza el menú hacia abajo y selecciona{' '}
                    <strong className="font-semibold text-slate-900">"Agregar al inicio"</strong>{' '}
                    <PlusSquare className="w-3.5 h-3.5 inline text-emerald-600 mb-0.5" />.
                  </div>
                </div>

                <div className="flex items-start gap-3 p-2.5 bg-slate-50 rounded-xl border border-slate-100">
                  <div className="w-7 h-7 rounded-lg bg-emerald-600 text-white flex items-center justify-center font-bold text-xs flex-shrink-0">
                    3
                  </div>
                  <div className="text-xs text-slate-700 flex-1">
                    Confirma pulsando <strong className="font-semibold text-slate-900">"Agregar"</strong> en la esquina superior. ¡Listo! El logotipo de Hiper Abasto Polar aparecerá en tu menú de aplicaciones.
                  </div>
                </div>
              </div>
            </div>

            {/* Confirmation CTA */}
            <button
              type="button"
              onClick={() => {
                setShowIosGuide(false);
                handleDismiss();
              }}
              className="w-full min-h-[44px] py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl shadow transition cursor-pointer flex items-center justify-center gap-2"
            >
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span>Entendido</span>
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export default MobileInstallBanner;
