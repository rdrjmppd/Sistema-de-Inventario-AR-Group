/**
 * Chrystal AI Assistant Widget (PolarBot)
 * Persona: PolarBot — Masculine, approachable, empathetic, direct, rational, and strictly grounded.
 * Ecosystem: 11 Specialized Agents (AGENTS.md)
 * Official Copyright: © 2026 AR Group. Todos los derechos de desarrollo reservados.
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Bot,
  Sparkles,
  X,
  Send,
  ShieldAlert,
  ShieldCheck,
  Minimize2,
  Maximize2,
  RotateCcw,
  Zap,
  HelpCircle,
  ExternalLink,
} from 'lucide-react';
import { NavigationTab } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { useInventory } from '../../context/InventoryContext';
import { useFinance } from '../../context/FinanceContext';
import {
  ChatMessage,
  buildLiveErpOperationalContext,
  queryAssistant,
  COMPANY_IDENTITY,
} from '../../ai-assistant';

export const STORAGE_KEY_POLARBOT_OPEN = 'chrystal_polarbot_open_v1';
export const STORAGE_KEY_POLARBOT_MINIMIZED = 'chrystal_polarbot_minimized_v1';
export const STORAGE_KEY_POLARBOT_MESSAGES = 'chrystal_polarbot_messages_v1';
export const STORAGE_KEY_POLARBOT_DRAFT = 'chrystal_polarbot_draft_v1';

export function loadStoredPolarbotOpen(): boolean {
  try {
    if (typeof window !== 'undefined') {
      return sessionStorage.getItem(STORAGE_KEY_POLARBOT_OPEN) === 'true';
    }
  } catch {
    // fallback
  }
  return false;
}

export function loadStoredPolarbotMinimized(): boolean {
  try {
    if (typeof window !== 'undefined') {
      return sessionStorage.getItem(STORAGE_KEY_POLARBOT_MINIMIZED) === 'true';
    }
  } catch {
    // fallback
  }
  return false;
}

export function loadStoredPolarbotDraft(): string {
  try {
    if (typeof window !== 'undefined') {
      return sessionStorage.getItem(STORAGE_KEY_POLARBOT_DRAFT) || '';
    }
  } catch {
    // fallback
  }
  return '';
}

export function loadStoredPolarbotMessages(): ChatMessage[] {
  try {
    if (typeof window !== 'undefined') {
      const raw = sessionStorage.getItem(STORAGE_KEY_POLARBOT_MESSAGES);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    }
  } catch {
    // fallback
  }
  return [];
}

export interface InlineMarkdownToken {
  type: 'text' | 'bold' | 'code' | 'italic';
  content: string;
}

/**
 * Deterministic Inline Markdown Tokenizer (O(N), Zero-Duplication Guarantee)
 * Tokenizes bold (**text**), inline code (`code`), and italic (*text*) cleanly
 * without greedy overlapping or post-loop trailing duplicate text insertion.
 */
export function tokenizeInlineMarkdown(str: string): InlineMarkdownToken[] {
  if (!str) return [];
  // Tokenize bold (**text**), inline code (`code`), or italic (*text*) deterministically
  const tokenRegex = /(\*\*(?:[^*]+|\*(?!\*))+\*\*|`[^`]+`|(?<!\*)\*(?!\*)(?:[^\s*][^*]*?)(?<!\*)\*(?!\*))/g;
  const rawParts = str.split(tokenRegex);
  const tokens: InlineMarkdownToken[] = [];

  for (const part of rawParts) {
    if (!part) continue;
    if (part.startsWith('**') && part.endsWith('**') && part.length >= 4) {
      tokens.push({ type: 'bold', content: part.slice(2, -2) });
    } else if (part.startsWith('`') && part.endsWith('`') && part.length >= 2) {
      tokens.push({ type: 'code', content: part.slice(1, -1) });
    } else if (part.startsWith('*') && part.endsWith('*') && part.length >= 2) {
      tokens.push({ type: 'italic', content: part.slice(1, -1) });
    } else {
      tokens.push({ type: 'text', content: part });
    }
  }

  return tokens.length > 0 ? tokens : [{ type: 'text', content: str }];
}

export function formatInline(str: string): React.ReactNode[] {
  try {
    const tokens = tokenizeInlineMarkdown(str);
    return tokens.map((token, idx) => {
      if (token.type === 'bold') {
        return (
          <strong key={idx} className="font-semibold text-slate-900 dark:text-slate-100">
            {token.content}
          </strong>
        );
      }
      if (token.type === 'code') {
        return (
          <code
            key={idx}
            className="px-1.5 py-0.5 bg-slate-200 text-slate-800 rounded text-[11px] font-mono"
          >
            {token.content}
          </code>
        );
      }
      if (token.type === 'italic') {
        return (
          <em key={idx} className="text-slate-600 italic">
            {token.content}
          </em>
        );
      }
      return <span key={idx}>{token.content}</span>;
    });
  } catch {
    return [<span key="fallback">{str}</span>];
  }
}

// Render markdown text cleanly with full defensive error containment and zero duplication
export function renderFormattedText(text: string): React.ReactNode {
  try {
    const lines = text.split('\n');
    return lines.map((line, idx) => {
      // Empty lines
      if (!line.trim()) {
        return <div key={idx} className="h-2" />;
      }

      const trimmed = line.trimStart();
      const indentSpaces = line.length - trimmed.length;
      const indentClass = indentSpaces >= 3 ? 'pl-4' : 'pl-1';

      // Bullet points
      if (trimmed.startsWith('* ') || trimmed.startsWith('- ')) {
        const content = trimmed.substring(2);
        return (
          <div key={idx} className={`flex items-start gap-1.5 my-0.5 ${indentClass}`}>
            <span className="text-emerald-500 font-bold">•</span>
            <div className="flex-1">{formatInline(content)}</div>
          </div>
        );
      }

      // Numbered items
      const numMatch = trimmed.match(/^(\d+)\.\s+(.+)$/);
      if (numMatch) {
        return (
          <div key={idx} className={`flex items-start gap-1.5 my-0.5 ${indentClass}`}>
            <span className="text-emerald-600 font-semibold">{numMatch[1]}.</span>
            <div className="flex-1">{formatInline(numMatch[2])}</div>
          </div>
        );
      }

      return (
        <div key={idx} className="my-0.5">
          {formatInline(line)}
        </div>
      );
    });
  } catch {
    return <div className="my-0.5 whitespace-pre-wrap">{text}</div>;
  }
}

interface ChatAssistantWidgetProps {
  onNavigate?: (tab: NavigationTab) => void;
}

export const ChatAssistantWidget: React.FC<ChatAssistantWidgetProps> = ({ onNavigate }) => {
  const { user } = useAuth();
  const { products, locations, discards } = useInventory();
  const { bcvState } = useFinance();

  const [isOpen, setIsOpenState] = useState<boolean>(() => loadStoredPolarbotOpen());
  const [isMinimized, setIsMinimizedState] = useState<boolean>(() => loadStoredPolarbotMinimized());
  const [inputText, setInputTextState] = useState<string>(() => loadStoredPolarbotDraft());
  const [isProcessing, setIsProcessing] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>(() => loadStoredPolarbotMessages());
  const [suggestedPrompts, setSuggestedPrompts] = useState<string[]>([
    '¿Cuál es la tasa oficial BCV hoy?',
    '¿Qué productos están en quiebre de stock?',
    '¿Cómo solicito una baja de inventario?',
    '¿Cuál es la valorización total del inventario?',
  ]);

  const setIsOpen = (open: boolean) => {
    setIsOpenState(open);
    try {
      sessionStorage.setItem(STORAGE_KEY_POLARBOT_OPEN, open ? 'true' : 'false');
    } catch {
      // ignore
    }
  };

  const setIsMinimized = (min: boolean) => {
    setIsMinimizedState(min);
    try {
      sessionStorage.setItem(STORAGE_KEY_POLARBOT_MINIMIZED, min ? 'true' : 'false');
    } catch {
      // ignore
    }
  };

  const setInputText = (text: string) => {
    setInputTextState(text);
    try {
      if (text) {
        sessionStorage.setItem(STORAGE_KEY_POLARBOT_DRAFT, text);
      } else {
        sessionStorage.removeItem(STORAGE_KEY_POLARBOT_DRAFT);
      }
    } catch {
      // ignore
    }
  };

  // Sync messages to sessionStorage whenever they change
  useEffect(() => {
    try {
      if (messages.length > 0) {
        sessionStorage.setItem(STORAGE_KEY_POLARBOT_MESSAGES, JSON.stringify(messages.slice(-30)));
      }
    } catch {
      // ignore
    }
  }, [messages]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const isSubmittingRef = useRef(false);

  // Build live operational context memoized
  const liveContext = useMemo(() => {
    return buildLiveErpOperationalContext({
      user,
      bcvState,
      products,
      locations,
      discards,
    });
  }, [user, bcvState, products, locations, discards]);

  // Initial welcome message
  useEffect(() => {
    if (messages.length === 0) {
      const userName = user?.displayName || 'Analista';
      const welcomeMsg: ChatMessage = {
        id: 'msg-welcome-01',
        sender: 'assistant',
        text: `Hola ${userName}. Soy **PolarBot**, asistente operativo en vivo de **${COMPANY_IDENTITY.razonSocial}**.

Tengo visibilidad de **${liveContext.metrics.totalSkus} SKUs** en **${liveContext.metrics.totalLocations} sedes**, con tasa oficial BCV de **${liveContext.bcvState.activeRate.toFixed(4)} VES/USD**.

¿En qué te puedo asesorar? Puedes pulsar una de las consultas rápidas abajo o formularme tu pregunta directamente.`,
        timestampVet: new Date().toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' }),
        suggestedPrompts: [
          '¿Cuál es la tasa oficial BCV hoy?',
          '¿Qué productos están en quiebre de stock?',
          '¿Cómo solicito una baja de inventario?',
          '¿Cuál es la valorización total del inventario?',
        ],
      };
      setMessages([welcomeMsg]);
    }
  }, [user, liveContext.metrics.totalSkus, liveContext.metrics.totalLocations, liveContext.bcvState.activeRate]);

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    if (isOpen && !isMinimized) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen, isMinimized, isProcessing]);

  // Focus input on open
  useEffect(() => {
    if (isOpen && !isMinimized) {
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [isOpen, isMinimized]);

  const handleSendMessage = async (textToSend?: string) => {
    if (isSubmittingRef.current) return;
    const query = (textToSend || inputText).trim();
    if (!query || isProcessing) return;

    isSubmittingRef.current = true;
    setInputText('');

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      sender: 'user',
      text: query,
      timestampVet: new Date().toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages(prev => [...prev, userMsg]);
    setIsProcessing(true);

    try {
      const result = await queryAssistant({
        query,
        conversationHistory: [...messages, userMsg],
        liveContext,
      });

      const assistantMsg: ChatMessage = {
        id: `assistant-${Date.now()}`,
        sender: 'assistant',
        text: result.answer,
        timestampVet: new Date().toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' }),
        isBlockedByRbac: result.isBlockedByRbac,
        suggestedPrompts: result.suggestedPrompts,
      };

      setMessages(prev => [...prev, assistantMsg]);
      if (result.suggestedPrompts && result.suggestedPrompts.length > 0) {
        setSuggestedPrompts(result.suggestedPrompts);
      }
    } catch (err: any) {
      const errorMsg: ChatMessage = {
        id: `err-${Date.now()}`,
        sender: 'assistant',
        text: `Ocurrió un inconveniente temporal al procesar tu solicitud: ${err?.message || 'Error de conexión'}. Por favor intenta de nuevo.`,
        timestampVet: new Date().toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsProcessing(false);
      isSubmittingRef.current = false;
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleResetChat = () => {
    setMessages([]);
    try {
      sessionStorage.removeItem(STORAGE_KEY_POLARBOT_MESSAGES);
      sessionStorage.removeItem(STORAGE_KEY_POLARBOT_DRAFT);
    } catch {
      // ignore
    }
    setSuggestedPrompts([
      '¿Cuál es la tasa oficial BCV hoy?',
      '¿Qué productos están en quiebre de stock?',
      '¿Cómo solicito una baja de inventario?',
      '¿Cuál es la valorización total del inventario?',
    ]);
  };

  // Helper for quick module navigation
  const handleQuickNavigate = (module: string) => {
    if (!onNavigate) return;
    if (module.includes('baja') || module.includes('descarga')) onNavigate('INVENTORY_DISCARDS');
    else if (module.includes('reorden') || module.includes('compra')) onNavigate('PURCHASE_ORDERS_CENTER');
    else if (module.includes('catalogo') || module.includes('sku')) onNavigate('CATALOG');
    else if (module.includes('ocr') || module.includes('forense')) onNavigate('INVOICES_OCR');
    else if (module.includes('sede') || module.includes('deposito')) onNavigate('MULTILOCATION');
    else if (module.includes('pareto') || module.includes('abc')) onNavigate('ABC_ROTATION');
  };

  return (
    <>
      {/* Floating Trigger Button (Bottom-Right, positioned above mobile bottom nav and install banner) */}
      {!isOpen && (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          aria-label="Abrir Asistente PolarBot"
          className="fixed bottom-36 right-4 lg:bottom-6 lg:right-6 z-40 flex items-center gap-2.5 bg-gradient-to-r from-emerald-600 via-teal-600 to-sky-700 text-white px-3.5 py-2.5 rounded-full shadow-2xl hover:shadow-emerald-500/30 hover:scale-105 active:scale-95 transition duration-200 cursor-pointer min-h-[48px] min-w-[48px] border border-white/20 group"
        >
          <div className="relative flex items-center justify-center">
            <Bot className="w-5 h-5 text-white" />
            <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-300 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-400"></span>
            </span>
          </div>

          <span className="font-bold text-xs tracking-wide hidden sm:inline">
            PolarBot
          </span>

          {liveContext.metrics.atRiskSkusCount > 0 && (
            <span className="bg-amber-400 text-slate-900 font-extrabold text-[10px] px-1.5 py-0.2 rounded-full shadow-sm">
              {liveContext.metrics.atRiskSkusCount}
            </span>
          )}
        </button>
      )}

      {/* Main Assistant Modal / Floating Window */}
      {isOpen && (
        <div
          className={`fixed z-50 transition-all duration-300 shadow-2xl border border-slate-700/30 bg-white rounded-2xl flex flex-col overflow-hidden ${
            isMinimized
              ? 'bottom-20 right-4 md:bottom-6 md:right-6 w-72 h-14'
              : 'fixed inset-x-3 bottom-20 top-16 md:inset-auto md:bottom-6 md:right-6 md:w-[440px] md:h-[620px] max-h-[85vh]'
          }`}
        >
          {/* Header */}
          <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-emerald-950 text-white px-4 py-3 flex items-center justify-between border-b border-emerald-500/20">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-sky-600 flex items-center justify-center shadow-md">
                <Bot className="w-4 h-4 text-white" />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <h3 className="font-bold text-xs md:text-sm text-slate-100">PolarBot</h3>
                  <span className="text-[9px] font-semibold bg-emerald-500/20 text-emerald-300 px-1.5 py-0.5 rounded border border-emerald-400/30 flex items-center gap-0.5">
                    <Zap className="w-2.5 h-2.5 text-emerald-400" />
                    En vivo
                  </span>
                </div>
                {!isMinimized && (
                  <p className="text-[10px] text-slate-400 truncate max-w-[220px]">
                    {COMPANY_IDENTITY.brandingName} • ERP Asistente
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-1">
              {!isMinimized && (
                <button
                  type="button"
                  onClick={handleResetChat}
                  title="Reiniciar conversación"
                  aria-label="Reiniciar conversación"
                  className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition min-w-[36px] min-h-[36px] flex items-center justify-center cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              )}

              <button
                type="button"
                onClick={() => setIsMinimized(!isMinimized)}
                title={isMinimized ? 'Expandir' : 'Minimizar'}
                aria-label={isMinimized ? 'Expandir ventana' : 'Minimizar ventana'}
                className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition min-w-[36px] min-h-[36px] flex items-center justify-center cursor-pointer"
              >
                {isMinimized ? <Maximize2 className="w-3.5 h-3.5" /> : <Minimize2 className="w-3.5 h-3.5" />}
              </button>

              <button
                type="button"
                onClick={() => setIsOpen(false)}
                title="Cerrar"
                aria-label="Cerrar asistente"
                className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded-lg transition min-w-[36px] min-h-[36px] flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Body (Messages) */}
          {!isMinimized && (
            <>
              {/* Operational Status Pill */}
              <div className="bg-slate-100 border-b border-slate-200 px-3.5 py-1.5 flex items-center justify-between text-[10px] text-slate-600">
                <span className="flex items-center gap-1 font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                  BCV: <strong>{liveContext.bcvState.activeRate.toFixed(4)}</strong> VES/USD
                </span>
                <span className="text-slate-500">
                  {liveContext.metrics.atRiskSkusCount > 0 ? (
                    <span className="text-amber-700 font-bold">
                      ⚠ {liveContext.metrics.atRiskSkusCount} en quiebre
                    </span>
                  ) : (
                    'Inventario en orden'
                  )}
                </span>
              </div>

              {/* Chat Thread */}
              <div className="flex-1 p-3.5 overflow-y-auto space-y-3 bg-slate-50 text-xs">
                {messages.map(msg => (
                  <div
                    key={msg.id}
                    className={`flex flex-col ${
                      msg.sender === 'user' ? 'items-end' : 'items-start'
                    }`}
                  >
                    <div
                      className={`max-w-[88%] rounded-xl px-3.5 py-2.5 shadow-sm text-xs leading-relaxed ${
                        msg.sender === 'user'
                          ? 'bg-emerald-600 text-white rounded-br-none'
                          : 'bg-white text-slate-800 border border-slate-200/90 rounded-bl-none'
                      }`}
                    >
                      {msg.isBlockedByRbac && (
                        <div className="flex items-center gap-1.5 text-rose-600 font-bold text-[11px] mb-1.5 pb-1 border-b border-rose-200">
                          <ShieldAlert className="w-3.5 h-3.5 text-rose-600 flex-shrink-0" />
                          <span>Control de Acceso RBAC</span>
                        </div>
                      )}

                      <div className="whitespace-pre-wrap">{renderFormattedText(msg.text)}</div>

                      <div
                        className={`text-[9px] mt-1.5 flex items-center justify-end gap-1 ${
                          msg.sender === 'user' ? 'text-emerald-100' : 'text-slate-400'
                        }`}
                      >
                        {msg.timestampVet}
                      </div>
                    </div>
                  </div>
                ))}

                {isProcessing && (
                  <div className="flex items-center gap-2 text-slate-500 text-xs py-2 px-1">
                    <div className="w-6 h-6 rounded-md bg-emerald-600/10 flex items-center justify-center">
                      <Sparkles className="w-3.5 h-3.5 text-emerald-600 animate-spin" />
                    </div>
                    <span className="italic">PolarBot está consultando la información...</span>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>

              {/* Quick Suggestion Chips */}
              {suggestedPrompts.length > 0 && !isProcessing && (
                <div className="bg-white border-t border-slate-100 px-3 py-2 flex items-center gap-1.5 overflow-x-auto scrollbar-none">
                  {suggestedPrompts.slice(0, 3).map((prompt, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => handleSendMessage(prompt)}
                      className="whitespace-nowrap px-2.5 py-1 rounded-full text-[10px] font-medium bg-slate-100 hover:bg-emerald-50 hover:text-emerald-700 text-slate-700 border border-slate-200 transition cursor-pointer flex-shrink-0"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              )}

              {/* Input Form */}
              <div className="p-2.5 bg-white border-t border-slate-200">
                <div className="flex items-center gap-1.5 bg-slate-100 rounded-xl px-2.5 py-1.5 border border-slate-300 focus-within:border-emerald-500 focus-within:ring-2 focus-within:ring-emerald-500/20 transition">
                  <input
                    ref={inputRef}
                    type="text"
                    value={inputText}
                    onChange={e => setInputText(e.target.value)}
                    onKeyDown={handleKeyDown}
                    disabled={isProcessing}
                    placeholder="Escribe tu consulta o pide una explicación..."
                    className="flex-1 bg-transparent text-xs text-slate-800 placeholder-slate-400 focus:outline-none min-h-[36px]"
                  />

                  <button
                    type="button"
                    onClick={() => handleSendMessage()}
                    disabled={!inputText.trim() || isProcessing}
                    aria-label="Enviar mensaje"
                    className="w-9 h-9 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed text-white flex items-center justify-center transition flex-shrink-0 cursor-pointer shadow-sm"
                  >
                    <Send className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="flex items-center justify-between mt-1 px-1 text-[9px] text-slate-400">
                  <span>Fuente de Verdad Operativa • Chrystal ERP</span>
                  <span>Modo Solo Lectura</span>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
};

export default ChatAssistantWidget;
