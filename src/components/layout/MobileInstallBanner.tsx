/**
 * MobileInstallBanner — Acceso Directo Móvil con Logotipo Institucional (PWA / A2HS)
 * Gobernanza: @Frontend + @UX + @Backend + @QA (AGENTS.md)
 * - Android / Chrome: Captura `beforeinstallprompt` y dispara `prompt()` nativo.
 * - iOS / Safari (iPhone/iPad): Despliega modal educativo interactivo de 3 pasos.
 * - Detección Standalone: Se oculta automáticamente cuando ya corre instalada (`display-mode: standalone` o `navigator.standalone === true`).
 * - Doble Exportación Obligatoria: `export const MobileInstallBanner` y `export default MobileInstallBanner`.
 * © 2026 AR Group. Todos los derechos de desarrollo reservados.
 */

import React, { useState, useEffect } from 'react';
import { Download, Share, PlusSquare, CheckCircle2, X, Smartphone } from 'lucide-react';

export interface BeforeInstallPromptEvent extends Event {
  readonly platforms?: string[];
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
  prompt(): Promise<void>;
}

export interface PwaEnvironmentState {
  isStandalone: boolean;
  isIOS: boolean;
  isAndroid: boolean;
  isMobileUserAgent: boolean;
}

export const OFFICIAL_LOGO_PATH = '/assets/branding/hiper_abasto_polar_logo.jpg';

/**
 * Pure helper for deterministic environment inspection (testable in Node & Browser)
 */
export function detectPwaEnvironment(params?: {
  userAgent?: string;
  matchMediaStandalone?: boolean;
  navigatorStandalone?: boolean;
}): PwaEnvironmentState {
  const ua = (
    params?.userAgent ??
    (typeof window !== 'undefined' && window.navigator ? window.navigator.userAgent : '')
  ).toLowerCase();

  const matchMediaStandalone =
    params?.matchMediaStandalone ??
    (typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(display-mode: standalone)').matches
      : false);

  const navigatorStandalone =
    params?.navigatorStandalone ??
    (typeof window !== 'undefined' && window.navigator
      ? (window.navigator as unknown as { standalone?: boolean }).standalone === true
      : false);

  const isStandalone = Boolean(matchMediaStandalone || navigatorStandalone);
  const isIOS = /iphone|ipad|ipod/.test(ua);
  const isAndroid = /android/.test(ua);
  const isMobileUserAgent = isIOS || isAndroid || /mobile|tablet/.test(ua);

  return {
    isStandalone,
    isIOS,
    isAndroid,
    isMobileUserAgent,
  };
}

export const MobileInstallBanner: React.FC = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isStandalone, setIsStandalone] = useState<boolean>(false);
  const [isIOS, setIsIOS] = useState<boolean>(false);
  const [isDismissed, setIsDismissed] = useState<boolean>(false);
  const [showIosModal, setShowIosModal] = useState<boolean>(false);
  const [installSuccess, setInstallSuccess] = useState<boolean>(false);

  useEffect(() => {
    const env = detectPwaEnvironment();
    setIsStandalone(env.isStandalone);
    setIsIOS(env.isIOS);

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setInstallSuccess(true);
      setIsStandalone(true);
      setDeferredPrompt(null);
      setShowIosModal(false);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    // Listen to display-mode changes dynamically
    let mediaQuery: MediaQueryList | null = null;
    const handleDisplayModeChange = (ev: MediaQueryListEvent) => {
      if (ev.matches) {
        setIsStandalone(true);
      }
    };
    if (typeof window.matchMedia === 'function') {
      mediaQuery = window.matchMedia('(display-mode: standalone)');
      if (typeof mediaQuery.addEventListener === 'function') {
        mediaQuery.addEventListener('change', handleDisplayModeChange);
      }
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
      if (mediaQuery && typeof mediaQuery.removeEventListener === 'function') {
        mediaQuery.removeEventListener('change', handleDisplayModeChange);
      }
    };
  }, []);

  // Hide automatically if already running in standalone mode or dismissed
  if (isStandalone || isDismissed || installSuccess) {
    return null;
  }

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      try {
        await deferredPrompt.prompt();
        const choice = await deferredPrompt.userChoice;
        if (choice.outcome === 'accepted') {
          setInstallSuccess(true);
          setIsStandalone(true);
          setDeferredPrompt(null);
        }
      } catch {
        setShowIosModal(true);
      }
      return;
    }

    // For iOS Safari (or browsers where beforeinstallprompt is deferred/manual), open the 3-step interactive guide
    setShowIosModal(true);
  };

  return (
    <>
      {/* Floating Mobile Install Banner positioned directly above the mobile quick navigation bar */}
      <aside
        aria-label="Aviso de instalación de aplicación móvil Hiper Abasto Polar"
        className="lg:hidden sticky bottom-[58px] inset-x-0 z-40 px-2.5 pb-1.5 pointer-events-none"
      >
        <div className="pointer-events-auto mx-auto max-w-xl rounded-2xl bg-slate-900/95 backdrop-blur-md border border-amber-500/40 shadow-2xl px-3 py-2.5 flex items-center justify-between gap-2.5 text-white">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-11 h-11 rounded-xl bg-white p-0.5 flex-shrink-0 shadow-md border border-amber-400/50 overflow-hidden flex items-center justify-center">
              <img
                src={OFFICIAL_LOGO_PATH}
                srcSet={`${OFFICIAL_LOGO_PATH} 1x, ${OFFICIAL_LOGO_PATH} 2x, ${OFFICIAL_LOGO_PATH} 3x`}
                alt="Logotipo Oficial Hiper Abasto Polar"
                width={44}
                height={44}
                loading="eager"
                decoding="sync"
                className="w-full h-full object-contain rounded-lg"
              />
            </div>

            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <p className="font-bold text-xs sm:text-sm text-white truncate">
                  Hiper Abasto Polar
                </p>
                <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-400/30">
                  ERP App
                </span>
              </div>
              <p className="text-[11px] text-slate-300 truncate">
                Descarga el acceso directo en tu teléfono
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 flex-shrink-0">
            <button
              type="button"
              onClick={handleInstallClick}
              aria-label="Instalar App Hiper Abasto Polar"
              className="min-h-[44px] min-w-[44px] px-3 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-slate-950 font-extrabold text-xs flex items-center justify-center gap-1.5 shadow-lg transition cursor-pointer active:scale-95"
            >
              <Download className="w-4 h-4 stroke-[2.5]" />
              <span>Instalar App</span>
            </button>

            <button
              type="button"
              onClick={() => setIsDismissed(true)}
              title="Ocultar aviso de instalación"
              aria-label="Cerrar aviso de instalación"
              className="min-h-[44px] min-w-[44px] rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 flex items-center justify-center transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Interactive 3-Step Installation Modal for iOS / Safari (iPhone/iPad) & Mobile Browsers */}
      {showIosModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="pwa-install-modal-title"
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/80 backdrop-blur-sm p-3 sm:p-4"
        >
          <div className="w-full max-w-md rounded-2xl bg-slate-900 border border-slate-700/80 shadow-2xl overflow-hidden text-white animate-in fade-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-slate-950 via-slate-900 to-amber-950/60 px-4 py-3.5 border-b border-slate-800 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-white p-1 shadow-md border border-amber-400/50 flex-shrink-0 overflow-hidden flex items-center justify-center">
                  <img
                    src={OFFICIAL_LOGO_PATH}
                    srcSet={`${OFFICIAL_LOGO_PATH} 1x, ${OFFICIAL_LOGO_PATH} 2x, ${OFFICIAL_LOGO_PATH} 3x`}
                    alt="Icono Hiper Abasto Polar"
                    width={48}
                    height={48}
                    className="w-full h-full object-contain rounded-lg"
                  />
                </div>
                <div>
                  <h3 id="pwa-install-modal-title" className="font-bold text-sm text-white">
                    Instalar Hiper Abasto Polar
                  </h3>
                  <p className="text-[11px] text-amber-300 font-medium flex items-center gap-1">
                    <Smartphone className="w-3.5 h-3.5" />
                    {isIOS
                      ? 'Guía oficial para iPhone / iPad (Safari)'
                      : 'Acceso directo en pantalla de inicio'}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowIosModal(false)}
                aria-label="Cerrar guía de instalación"
                className="min-h-[44px] min-w-[44px] rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 flex items-center justify-center transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* 3-Step Interactive Instructions */}
            <div className="p-4 space-y-3 text-xs">
              <p className="text-slate-300 leading-relaxed">
                Sigue estos <strong>3 pasos rápidos</strong> para fijar el icono oficial de{' '}
                <strong className="text-white">Hiper Abasto Polar, C.A.</strong> en la pantalla de
                inicio de tu teléfono:
              </p>

              <div className="space-y-2.5">
                {/* Paso 1 */}
                <div className="flex items-start gap-3 p-3 rounded-xl bg-slate-800/80 border border-slate-700/70">
                  <div className="w-9 h-9 rounded-lg bg-sky-500/20 border border-sky-400/40 text-sky-300 flex items-center justify-center flex-shrink-0 font-bold">
                    <Share className="w-4 h-4" />
                  </div>
                  <div className="space-y-0.5">
                    <p className="font-bold text-white">
                      Paso 1: Tocar el botón &ldquo;Compartir&rdquo;
                    </p>
                    <p className="text-slate-300 text-[11px]">
                      En la barra de Safari (o menú del navegador), pulsa el icono cuadrado con la
                      flecha hacia arriba.
                    </p>
                  </div>
                </div>

                {/* Paso 2 */}
                <div className="flex items-start gap-3 p-3 rounded-xl bg-slate-800/80 border border-slate-700/70">
                  <div className="w-9 h-9 rounded-lg bg-amber-500/20 border border-amber-400/40 text-amber-300 flex items-center justify-center flex-shrink-0 font-bold">
                    <PlusSquare className="w-4 h-4" />
                  </div>
                  <div className="space-y-0.5">
                    <p className="font-bold text-white">
                      Paso 2: Seleccionar &ldquo;Agregar al inicio&rdquo;
                    </p>
                    <p className="text-slate-300 text-[11px]">
                      Desliza el menú de opciones y toca <strong>&ldquo;Agregar a pantalla de inicio&rdquo;</strong>{' '}
                      (icono con el símbolo <strong>+</strong>).
                    </p>
                  </div>
                </div>

                {/* Paso 3 */}
                <div className="flex items-start gap-3 p-3 rounded-xl bg-slate-800/80 border border-slate-700/70">
                  <div className="w-9 h-9 rounded-lg bg-emerald-500/20 border border-emerald-400/40 text-emerald-300 flex items-center justify-center flex-shrink-0 font-bold">
                    <CheckCircle2 className="w-4 h-4" />
                  </div>
                  <div className="space-y-0.5">
                    <p className="font-bold text-white">
                      Paso 3: Confirmar &ldquo;Agregar&rdquo;
                    </p>
                    <p className="text-slate-300 text-[11px]">
                      Pulsa <strong>&ldquo;Agregar&rdquo;</strong> en la esquina superior derecha para fijar el
                      logotipo oficial de <strong>Hiper Abasto Polar</strong> en tu menú de aplicaciones.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-4 py-3 bg-slate-950/90 border-t border-slate-800 flex items-center justify-end">
              <button
                type="button"
                onClick={() => setShowIosModal(false)}
                className="min-h-[44px] w-full sm:w-auto px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-xs transition cursor-pointer"
              >
                Entendido
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default MobileInstallBanner;
