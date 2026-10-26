/**
 * Types & Data Contracts for Chrystal AI Assistant (PolarBot)
 * Ecosystem: 11 Specialized Agents (AGENTS.md)
 * Official Copyright: © 2026 AR Group. Todos los derechos de desarrollo reservados.
 */

import { UserRole, Product, LocationNode, BcvRateState, InventoryDiscardRecord } from '../types';

export interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant' | 'system';
  text: string;
  timestampVet: string;
  isBlockedByRbac?: boolean;
  suggestedPrompts?: string[];
}

export interface LiveErpOperationalContext {
  activeUser: {
    uid: string;
    displayName: string;
    email: string;
    role: UserRole;
  };
  bcvState: {
    activeRate: number;
    spotRateToday: number;
    nextDayRateAfter5Pm: number;
    isAfter5PmVet: boolean;
    rateSourceLabel: string;
    caracasTimeFormatted: string;
    caracasDateFormatted: string;
  };
  metrics: {
    totalSkus: number;
    totalLocations: number;
    totalUnitsAll: number;
    totalValuationCostUsd: number;
    totalValuationRetailUsd: number;
    totalValuationRetailVes: number;
    weightedGrossMarginPercent: number;
    atRiskSkusCount: number;
    pendingDiscardsCount: number;
    pendingDiscardsTotalUsd: number;
  };
  criticalStockoutSkus: Array<{
    sku: string;
    name: string;
    currentStock: number;
    minStock: number;
    deficit: number;
  }>;
  pendingDiscardsSummary: Array<{
    referenceCode: string;
    sku: string;
    productName: string;
    locationName: string;
    quantity: number;
    lossUsd: number;
    reason: string;
  }>;
  locationsList: Array<{
    code: string;
    name: string;
    type: string;
    city: string;
  }>;
}

export interface AssistantQueryRequest {
  query: string;
  conversationHistory: ChatMessage[];
  liveContext: LiveErpOperationalContext;
  apiKey?: string;
}

export interface AssistantQueryResponse {
  answer: string;
  isBlockedByRbac: boolean;
  usedFallbackEngine: boolean;
  suggestedPrompts?: string[];
}
