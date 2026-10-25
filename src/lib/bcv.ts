import { BcvRateState } from '../types';
import { round2, round4, toDecimal } from './decimal';

export const CARACAS_TIMEZONE = 'America/Caracas';

export interface CaracasClockSnapshot {
  hour24: number;
  minute: number;
  second: number;
  timeFormatted: string;
  dateFormatted: string;
  isoTimestamp: string;
  dateString: string;
}

export interface LiveBcvQuotePayload {
  usdRatePortal: number;
  usdSpotRate: number;
  eurRatePortal?: number;
  valueDateLabel: string;
  valueDateIso?: string;
  providerSource: string;
  fetchedAtVet: string;
  latencyMs: number;
  isLiveConnected: boolean;
  fallbackChainUsed: string[];
}

export function getCaracasNow(referenceDate: Date = new Date()): CaracasClockSnapshot {
  const partsFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: CARACAS_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  const parts = partsFormatter.formatToParts(referenceDate);
  const map: Record<string, string> = {};
  for (const part of parts) {
    if (part.type !== 'literal') {
      map[part.type] = part.value;
    }
  }

  const rawHour = parseInt(map.hour || '0', 10);
  const hour24 = rawHour === 24 ? 0 : rawHour;
  const minute = parseInt(map.minute || '0', 10);
  const second = parseInt(map.second || '0', 10);

  const year = map.year || '2026';
  const month = map.month || '01';
  const day = map.day || '01';

  const dateFormatted = `${day}/${month}/${year}`;
  const dateString = `${year}-${month}-${day}`;
  const timeFormatted = `${String(hour24).padStart(2, '0')}:${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}`;
  const isoTimestamp = `${year}-${month}-${day}T${timeFormatted}-04:00`;

  return {
    hour24,
    minute,
    second,
    timeFormatted,
    dateFormatted,
    isoTimestamp,
    dateString,
  };
}

export function isAfter5PmCaracas(hour24: number): boolean {
  return hour24 >= 17;
}

/**
 * Parses a raw Venezuelan number string from BCV DOM (e.g. "887,30200000" or "886.2271")
 * using Decimal.js with 4-decimal and 2-decimal precision.
 */
export function parseBcvNumericRate(rawText: string | number | null | undefined): number {
  if (rawText === null || rawText === undefined) return 0;
  const str = String(rawText).trim();
  if (!str) return 0;

  // Handle Venezuelan format where comma is decimal separator (e.g. "887,30200000" or "1.024,55")
  let normalized = str;
  if (normalized.includes(',') && normalized.includes('.')) {
    // Dot is thousand separator, comma is decimal separator
    normalized = normalized.replace(/\./g, '').replace(',', '.');
  } else if (normalized.includes(',')) {
    normalized = normalized.replace(',', '.');
  }

  normalized = normalized.replace(/[^0-9.]/g, '');
  if (!normalized || isNaN(Number(normalized))) return 0;

  const val = round4(toDecimal(normalized));
  return val > 0 ? val : 0;
}

/**
 * Pure parser for official www.bcv.org.ve HTML document.
 * Extracts #dolar (<strong class="strong-tb">887,30200000</strong>),
 * #euro, and Fecha Valor (<span class="date-display-single" ...>).
 */
export function parseOfficialBcvHtml(html: string): {
  usdRate: number;
  eurRate?: number;
  valueDateLabel?: string;
  valueDateIso?: string;
} | null {
  if (!html || typeof html !== 'string') return null;

  const dolarMatch = html.match(
    /id=["']dolar["'][\s\S]{0,800}?<strong[^>]*>\s*([0-9.,]+)\s*<\/strong>/i
  );
  if (!dolarMatch || !dolarMatch[1]) {
    return null;
  }

  const usdRate = parseBcvNumericRate(dolarMatch[1]);
  if (usdRate <= 0) return null;

  const euroMatch = html.match(
    /id=["']euro["'][\s\S]{0,800}?<strong[^>]*>\s*([0-9.,]+)\s*<\/strong>/i
  );
  const eurRate =
    euroMatch && euroMatch[1] ? parseBcvNumericRate(euroMatch[1]) : undefined;

  const dateMatch = html.match(
    /Fecha\s+Valor[\s\S]{0,300}?<span[^>]*content=["']([^"']+)["'][^>]*>\s*([^<]+)\s*<\/span>/i
  );

  const valueDateIso = dateMatch?.[1]?.trim();
  const valueDateLabel = dateMatch?.[2]?.replace(/\s+/g, ' ').trim();

  return {
    usdRate,
    eurRate: eurRate && eurRate > 0 ? eurRate : undefined,
    valueDateLabel,
    valueDateIso,
  };
}

export function buildBcvRateState(
  spotRateToday: number,
  nextDayRateAfter5Pm: number,
  overrideCaracasHour?: { hour: number; minute?: number },
  telemetry?: Partial<
    Pick<
      BcvRateState,
      | 'eurRate'
      | 'valueDateLabel'
      | 'lastSyncVet'
      | 'providerSource'
      | 'latencyMs'
      | 'isLiveConnected'
    >
  >
): BcvRateState {
  const now = getCaracasNow();
  const effectiveHour =
    overrideCaracasHour !== undefined ? overrideCaracasHour.hour : now.hour24;
  const effectiveMinute =
    overrideCaracasHour?.minute !== undefined ? overrideCaracasHour.minute : now.minute;

  const after5Pm = isAfter5PmCaracas(effectiveHour);
  const activeRate = after5Pm ? round2(nextDayRateAfter5Pm) : round2(spotRateToday);

  const simulatedTimeFormatted =
    overrideCaracasHour !== undefined
      ? `${String(effectiveHour).padStart(2, '0')}:${String(effectiveMinute).padStart(2, '0')}:00`
      : now.timeFormatted;

  return {
    spotRateToday: round2(spotRateToday),
    nextDayRateAfter5Pm: round2(nextDayRateAfter5Pm),
    activeRate,
    eurRate: telemetry?.eurRate ? round2(telemetry.eurRate) : undefined,
    isAfter5PmVet: after5Pm,
    caracasTimeFormatted: simulatedTimeFormatted,
    caracasDateFormatted: now.dateFormatted,
    rateSourceLabel: after5Pm
      ? 'BCV Tasa Oficial Vigente ≥ 17:00 VET'
      : 'BCV Tasa Oficial Spot Diurna (< 17:00 VET)',
    valueDateLabel: telemetry?.valueDateLabel,
    lastSyncVet: telemetry?.lastSyncVet || now.timeFormatted,
    providerSource: telemetry?.providerSource || 'Portal Oficial BCV (www.bcv.org.ve)',
    latencyMs: telemetry?.latencyMs,
    isLiveConnected: telemetry?.isLiveConnected ?? true,
  };
}

export function evaluateBcv5PmRule(params: {
  currentDayRate: number;
  nextBusinessDayRate: number;
  forceAfter5PmSimulation?: boolean;
}) {
  const isAfter5Pm = Boolean(params.forceAfter5PmSimulation);
  return {
    isAfter5PmCaracas: isAfter5Pm,
    activeRate: isAfter5Pm ? params.nextBusinessDayRate : params.currentDayRate,
  };
}

/**
 * Multi-tier client-side & server-backed live BCV connector.
 * Tier 1: Backend proxy `/api/bcv/rate` (scrapes https://www.bcv.org.ve/ directly + ve.dolarapi.com)
 * Tier 2: Direct CORS call to https://ve.dolarapi.com/v1/dolares/oficial + https://open.er-api.com/v6/latest/USD
 */
export async function fetchLiveBcvRateFromNetwork(
  forceRefresh: boolean = false
): Promise<LiveBcvQuotePayload> {
  const startTime = Date.now();
  const fallbackChainUsed: string[] = [];

  // Tier 1: Try our Express Backend Connector (/api/bcv/rate) which scrapes www.bcv.org.ve directly
  try {
    fallbackChainUsed.push('API_PROXY_BCV_ORG_VE');
    const url = forceRefresh
      ? `/api/bcv/rate?force=1&t=${Date.now()}`
      : `/api/bcv/rate?t=${Date.now()}`;
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
    });
    if (res.ok) {
      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const data = (await res.json()) as LiveBcvQuotePayload;
        if (data && data.usdRatePortal > 0) {
          return {
            ...data,
            latencyMs: Date.now() - startTime,
          };
        }
      }
    }
  } catch {
    // Proceed to Tier 2 browser-direct CORS endpoints
  }

  // Tier 2: Browser-direct official BCV mirror APIs (ve.dolarapi.com + open.er-api.com)
  let dolarApiRate = 0;
  let dolarApiDate = '';
  let erApiRate = 0;

  await Promise.allSettled([
    (async () => {
      fallbackChainUsed.push('VE_DOLARAPI_OFICIAL');
      const r = await fetch('https://ve.dolarapi.com/v1/dolares/oficial');
      if (r.ok) {
        const j = await r.json();
        dolarApiRate = parseBcvNumericRate(j?.promedio);
        dolarApiDate = j?.fechaActualizacion || '';
      }
    })(),
    (async () => {
      fallbackChainUsed.push('OPEN_ER_API_VES');
      const r = await fetch('https://open.er-api.com/v6/latest/USD');
      if (r.ok) {
        const j = await r.json();
        erApiRate = parseBcvNumericRate(j?.rates?.VES);
      }
    })(),
  ]);

  const primaryPortalRate = erApiRate > 0 ? erApiRate : dolarApiRate;
  const spotRate = dolarApiRate > 0 ? dolarApiRate : primaryPortalRate;

  if (primaryPortalRate > 0) {
    return {
      usdRatePortal: round2(primaryPortalRate),
      usdSpotRate: round2(spotRate),
      valueDateLabel: dolarApiDate
        ? `Vigencia BCV: ${dolarApiDate.slice(0, 10)}`
        : 'Vigencia Oficial BCV Activa',
      providerSource:
        erApiRate > 0 && dolarApiRate > 0
          ? 'BCV Oficial (Espejo Verificado DolarApi + ER-API)'
          : 'BCV Oficial (ve.dolarapi.com)',
      fetchedAtVet: getCaracasNow().timeFormatted,
      latencyMs: Date.now() - startTime,
      isLiveConnected: true,
      fallbackChainUsed,
    };
  }

  throw new Error(
    'No se pudo establecer conexión con los nodos del Banco Central de Venezuela.'
  );
}
