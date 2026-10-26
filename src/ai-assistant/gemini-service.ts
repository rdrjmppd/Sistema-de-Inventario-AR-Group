/**
 * Gemini AI Service & Local Heuristic Fallback Engine for Chrystal ERP Assistant (PolarBot)
 * High-Availability Dual Engine: Google GenAI + Deterministic Local Fallback.
 * Official Copyright: © 2026 AR Group. Todos los derechos de desarrollo reservados.
 */

import { GoogleGenAI } from '@google/genai';
import {
  AssistantQueryRequest,
  AssistantQueryResponse,
  LiveErpOperationalContext,
} from './types';
import { evaluateSecurityGuardrails, buildOutOfScopeResponse } from './security-guardrails';
import { buildMasterSystemPrompt } from './system-prompt';
import { ERP_KNOWLEDGE_BASE, COMPANY_IDENTITY } from './knowledge-base';

/**
 * Heuristic Local Engine: Responds immediately and deterministically when
 * offline, with quota exceeded, or without an active API key.
 */
export function answerQueryWithHeuristicEngine(
  query: string,
  liveContext: LiveErpOperationalContext
): { answer: string; suggestedPrompts: string[] } {
  const q = query.toLowerCase().trim();
  const userName = liveContext.activeUser.displayName;

  // 1. Saludo inicial o presentación
  if (
    q === 'hola' ||
    q.startsWith('hola ') ||
    q.includes('buenos dias') ||
    q.includes('buenos días') ||
    q.includes('buenas tardes') ||
    q.includes('buenas noches') ||
    q.includes('quien eres') ||
    q.includes('quién eres')
  ) {
    return {
      answer: `Hola ${userName}. Soy **PolarBot**, asistente operativo de ${COMPANY_IDENTITY.razonSocial}. Estoy conectado en tiempo real al inventario y finanzas del ERP.

¿En qué puedo orientarte hoy?
* Existencias físicas y alertas de quiebre de stock.
* Tasa oficial BCV activa y cálculo a las 17:00 VET.
* Paso a paso para registro de SKUs, descargas o auditoría OCR.
* Valorización de inventario y margen bruto comercial.`,
      suggestedPrompts: [
        '¿Cuál es la tasa oficial BCV hoy?',
        '¿Qué productos están en quiebre de stock?',
        '¿Cómo solicito una baja de inventario?',
        '¿Cuál es la valorización total del inventario?',
      ],
    };
  }

  // 2. Tasa oficial BCV
  if (
    q.includes('tasa') ||
    q.includes('bcv') ||
    q.includes('dolar') ||
    q.includes('dólar') ||
    q.includes('cambio') ||
    q.includes('17:00') ||
    q.includes('5 pm')
  ) {
    const bcv = liveContext.bcvState;
    const horaInfo = bcv.isAfter5PmVet
      ? 'Actualmente es después de las 5:00 PM VET, por lo que rige la tasa oficial fijada para el siguiente día hábil.'
      : 'Actualmente rige la tasa de la jornada regular.';

    return {
      answer: `La **tasa oficial del BCV activa** en el sistema es de **${bcv.activeRate.toFixed(4)} VES/USD**.

Detalle de cotización oficial:
* **Tasa del día**: ${bcv.spotRateToday.toFixed(4)} VES/USD
* **Tasa siguiente día hábil (post-17:00 VET)**: ${bcv.nextDayRateAfter5Pm.toFixed(4)} VES/USD
* **Estado de jornada**: ${horaInfo}
* **Hora actual Caracas**: ${bcv.caracasTimeFormatted} (${bcv.caracasDateFormatted})

Todos los precios de venta al público (PVP) y valorizaciones contables se recalculan con aritmética decimal exacta (*Decimal.js con redondeo ROUND_HALF_UP*), garantizando que no se pierda ni un céntimo en las conversiones.`,
      suggestedPrompts: [
        '¿Cómo se actualiza la tasa BCV manualmente?',
        '¿Qué productos están en quiebre de stock?',
        '¿Cuál es la valorización total del inventario?',
      ],
    };
  }

  // 3. Quiebre de stock / Productos críticos
  if (
    q.includes('quiebre') ||
    q.includes('stockout') ||
    q.includes('agotado') ||
    q.includes('critico') ||
    q.includes('crítico') ||
    q.includes('deficit') ||
    q.includes('déficit') ||
    q.includes('reorden') ||
    q.includes('alerta de stock') ||
    q.includes('faltante')
  ) {
    const count = liveContext.metrics.atRiskSkusCount;
    const criticalList = liveContext.criticalStockoutSkus;

    if (count === 0 || criticalList.length === 0) {
      return {
        answer: `Actualmente **no existen productos en quiebre crítico de stock**. Todos los ${liveContext.metrics.totalSkus} SKUs registrados se encuentran por encima de su nivel de inventario de seguridad (*stock mínimo de alarma requerido para no quedarse desabastecido*).`,
        suggestedPrompts: [
          '¿Cuál es la valorización total del inventario?',
          '¿Cómo registro un nuevo producto (SKU)?',
          '¿Cuáles sedes están registradas?',
        ],
      };
    }

    const itemsText = criticalList
      .slice(0, 5)
      .map(
        (p, idx) =>
          `${idx + 1}. **${p.sku}** — ${p.name}: Stock actual **${p.currentStock}**, Mínimo requerido **${p.minStock}** (*Déficit: -${p.deficit} unidades*)`
      )
      .join('\n');

    return {
      answer: `Se detectan **${count} productos con alerta de quiebre o riesgo de desabastecimiento** (*inventario por debajo del mínimo de seguridad establecido*).

Principales productos críticos:
${itemsText}

Para generar la orden de reabastecimiento automática sugerida a proveedores, dirígete al módulo **"Inteligencia y Gobierno > Órdenes de Reabastecimiento"** en el menú lateral.`,
      suggestedPrompts: [
        '¿Cómo solicito una baja de inventario?',
        '¿Cuál es la valorización total del inventario?',
        '¿Cuál es la tasa oficial BCV hoy?',
      ],
    };
  }

  // 4. Descargas y Bajas de inventario / Mermas / Vencimiento
  if (
    q.includes('baja') ||
    q.includes('descarga') ||
    q.includes('merma') ||
    q.includes('vencim') ||
    q.includes('rotura') ||
    q.includes('dañad') ||
    q.includes('accidente') ||
    q.includes('desincorpor')
  ) {
    const topic = ERP_KNOWLEDGE_BASE.find(t => t.id === 'descargas-bajas-inventario');
    const pendingCount = liveContext.metrics.pendingDiscardsCount;
    const pendingLoss = liveContext.metrics.pendingDiscardsTotalUsd;

    const pendingMsg =
      pendingCount > 0
        ? `\n\nActualmente hay **${pendingCount} solicitud(es) de baja pendiente(s) de firma gerencial**, totalizando **$${pendingLoss.toFixed(2)} USD** en pérdida pre-registrada.`
        : '\n\nEn este momento **no hay solicitudes de baja pendientes por autorizar**.';

    return {
      answer: `El protocolo de **Descargas y Bajas de Inventario** funciona bajo el principio de **Doble Firma y Auditoría Inmutable** (*el analista reporta la pérdida, pero solo la gerencia puede descontar la mercancía del sistema*):

**Paso a paso para solicitar una baja (Rol Analista):**
1. En el menú lateral, abre **"Inteligencia y Gobierno > Descargas & Bajas"**.
2. Pulsa el botón **"+ Nueva Solicitud de Descarga"**.
3. Selecciona la Sede/Depósito y el producto (SKU) afectado.
4. Indica la cantidad física a dar de baja y la causa oficial (*VENCIMIENTO, ROTURA_EMPAQUE, ACCIDENTE_MANIPULACION, MERMA_OPERATIVA o ERROR_CARGA*).
5. Escribe una justificación operativa clara (campo obligatorio).
6. Haz clic en **"Registrar Solicitud de Descarga"**. La solicitud quedará guardada en estado \`PENDIENTE_AUTORIZACION\` sin descontar aún el stock físico.

**Autorización Gerencial:**
El Gerente de Operaciones o Superadministrador abrirá la solicitud, revisará la pérdida valorizada en USD y Bolívares e ingresará su **PIN confidencial de 4 a 6 dígitos** para firmar la baja definitiva. Al aprobarse, el inventario se descuenta en la sede y se emite el Acta Oficial en PDF/Excel con branding oficial.${pendingMsg}`,
      suggestedPrompts: [
        '¿Cómo dar de alta un nuevo producto (SKU)?',
        '¿Qué productos están en quiebre de stock?',
        '¿Cuál es la tasa oficial BCV hoy?',
      ],
    };
  }

  // 5. Alta de SKU / Registro de nuevo producto
  if (
    q.includes('nuevo producto') ||
    q.includes('registrar sku') ||
    q.includes('dar de alta') ||
    q.includes('crear producto') ||
    q.includes('catalogo') ||
    q.includes('catálogo') ||
    q.includes('pvp') ||
    q.includes('precio de venta')
  ) {
    return {
      answer: `Para dar de alta un nuevo producto en **Chrystal® ERP**:

1. Ingresa a **"Inventario > Catálogo Maestro SKU"** en el menú lateral.
2. Pulsa el botón **"+ Nuevo Producto"**.
3. Completa los datos maestros:
   * **SKU**: Código alfanumérico único (ej. \`HAP-HAR-001\`).
   * **Código de Barras**: EAN-13 del producto.
   * **Nombre Comercial**: Descripción completa y precisa del vívere o alimento.
   * **Categoría y Unidad de Medida**: Selecciona VÍVERES, LÁCTEOS, CHARCUTERÍA, etc., y unidad (UND, KG, LT, CAJA, BULTO).
4. **Estructura de Precios**:
   * **Costo Unitario USD**: Monto neto facturado por el proveedor.
   * **Margen Objetivo %**: Porcentaje de utilidad deseado. El sistema calcula automáticamente el PVP base mediante la fórmula exacta: \`PVP = Costo / (1 - Margen / 100)\`.
   * **Alícuota de IVA**: Exento (0% para alimentos básicos de canasta), Reducido (8%) o General (16%).
5. **Existencias Iniciales**: Define el stock inicial y el stock mínimo de seguridad por cada sede.
6. Pulsa **"Guardar Producto"**. El PVP en Bolívares se actualizará automáticamente con la tasa oficial BCV en cada jornada.`,
      suggestedPrompts: [
        '¿Cómo solicito una baja de inventario?',
        '¿Cuál es la tasa oficial BCV hoy?',
        '¿Qué productos están en quiebre de stock?',
      ],
    };
  }

  // 6. Auditoría Forense OCR de Pagos
  if (
    q.includes('ocr') ||
    q.includes('comprobante') ||
    q.includes('forense') ||
    q.includes('veracidad') ||
    q.includes('fraude') ||
    q.includes('pago movil') ||
    q.includes('pago móvil') ||
    q.includes('zelle') ||
    q.includes('transferencia')
  ) {
    return {
      answer: `El módulo de **Auditoría Forense OCR** protege a la empresa contra fraudes y comprobantes falsos mediante **4 Candados Forenses Incondicionales**:

1. **Candado 1 — Huella Criptográfica SHA-256**: Genera una firma matemática única de los bytes del archivo para certificar su integridad.
2. **Candado 2 — Hash Perceptual (pHash)**: Compara visualmente la imagen contra la base de datos histórica de pagos para impedir que un cliente reutilice un capture antiguo cambiándole el nombre.
3. **Candado 3 — Metadatos EXIF / JFIF y Tipografía**: Detecta si la imagen fue alterada con software de diseño (Photoshop, Canva, editores web) o si carece de firmas auténticas de la cámara o aplicación bancaria.
4. **Candado 4 — Peritaje Multimodal y Dictamen de Veracidad**: Extrae banco emisor, referencia, monto en VES/USD y emite dictamen:
   * **AUTÉNTICO (90 - 100 pts)**: Alta confianza para pre-conciliación.
   * **SOSPECHOSO (60 - 89 pts)**: Requiere verificación manual con el estado de cuenta bancario.
   * **ALERTA FRAUDE (0 - 59 pts)**: Señales claras de edición digital o generación artificial.

Para auditar un comprobante, ve a **"Finanzas > Auditoría Forense OCR"**, arrastra el archivo y pulsa **"Procesar Comprobante"**.`,
      suggestedPrompts: [
        '¿Cuál es la tasa oficial BCV hoy?',
        '¿Cómo solicito una baja de inventario?',
        '¿Cuál es la valorización total del inventario?',
      ],
    };
  }

  // 7. Sedes y Depósitos
  if (
    q.includes('sede') ||
    q.includes('sedes') ||
    q.includes('deposito') ||
    q.includes('depósito') ||
    q.includes('almacen') ||
    q.includes('almacén') ||
    q.includes('sucursal')
  ) {
    const locs = liveContext.locationsList;
    const locText = locs
      .map(l => `* **${l.name}** (\`${l.code}\`) — Tipo: *${l.type}*, Ciudad: *${l.city}*`)
      .join('\n');

    return {
      answer: `La empresa cuenta actualmente con **${locs.length} sedes/depósitos operativos**:

${locText}

Cada sede maneja su propio stock físico independiente, niveles de reorden y auditoría de descargas.`,
      suggestedPrompts: [
        '¿Qué productos están en quiebre de stock?',
        '¿Cuál es la valorización total del inventario?',
        '¿Cómo solicito una baja de inventario?',
      ],
    };
  }

  // 8. Valorización global y finanzas
  if (
    q.includes('valoriz') ||
    q.includes('valoración') ||
    q.includes('patrimonio') ||
    q.includes('margen') ||
    q.includes('total unidades') ||
    q.includes('cuanto vale') ||
    q.includes('cuánto vale')
  ) {
    const m = liveContext.metrics;
    return {
      answer: `Estado financiero actual del inventario de **${COMPANY_IDENTITY.razonSocial}**:

* **Catálogo Activo**: ${m.totalSkus} SKUs distribuidos en ${m.totalLocations} sedes.
* **Existencias Físicas Totales**: ${m.totalUnitsAll.toLocaleString('es-VE')} unidades.
* **Valorización a Costo (USD)**: $${m.totalValuationCostUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD
* **Valorización a PVP (USD)**: $${m.totalValuationRetailUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD
* **Valorización a PVP (Bolívares)**: Bs. ${m.totalValuationRetailVes.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} VES (a tasa oficial BCV de ${liveContext.bcvState.activeRate.toFixed(4)})
* **Margen Bruto Ponderado**: ${m.weightedGrossMarginPercent.toFixed(2)}%

Todos los cálculos están calculados con precisión decimal estricta.`,
      suggestedPrompts: [
        '¿Cuál es la tasa oficial BCV hoy?',
        '¿Qué productos están en quiebre de stock?',
        '¿Cómo solicito una baja de inventario?',
      ],
    };
  }

  // 9. Documentos PDF / Excel / Branding
  if (
    q.includes('pdf') ||
    q.includes('excel') ||
    q.includes('informe') ||
    q.includes('reporte') ||
    q.includes('branding') ||
    q.includes('logo') ||
    q.includes('membrete')
  ) {
    return {
      answer: `Todos los reportes generados en **Chrystal® ERP** cumplen con el estándar corporativo de **AR Group**:

* **Excel (.xlsx)**: Incluyen encabezado institucional con los datos fiscales de **${COMPANY_IDENTITY.razonSocial}** (RIF, SADA, dirección fiscal), cuadrícula ejecutiva visible, celdas formateadas con \`tabular-nums\` y pestañas individuales por sede o clasificación.
* **PDF Oficial**: Incluye membrete con el logotipo institucional de **Hiper Abasto Polar**, marca de agua suave al 7% de opacidad en el fondo de todas las páginas, pie de página permanente con copyright © 2026 AR Group, numeración ("Página X de Y") y sello de tiempo VET.
* **Actas de Baja y Kardex**: Reflejan la doble firma del analista solicitante y del gerente autorizante con su PIN encriptado.`,
      suggestedPrompts: [
        '¿Cómo solicito una baja de inventario?',
        '¿Cuál es la valorización total del inventario?',
        '¿Cuál es la tasa oficial BCV hoy?',
      ],
    };
  }

  // 10. Si no coincide con ningún tema interno, comprobar si es fuera de alcance o consulta general
  const erpKeywords = [
    'inventario',
    'producto',
    'precio',
    'costo',
    'venta',
    'compra',
    'proveedor',
    'cliente',
    'usuario',
    'pin',
    'rol',
    'almacen',
    'kardex',
    'pareto',
  ];

  const hasErpKeyword = erpKeywords.some(kw => q.includes(kw));

  if (!hasErpKeyword) {
    return {
      answer: buildOutOfScopeResponse(query, userName),
      suggestedPrompts: [
        '¿Cuál es la tasa oficial BCV hoy?',
        '¿Qué productos están en quiebre de stock?',
        '¿Cómo solicito una baja de inventario?',
        '¿Cuál es la valorización total del inventario?',
      ],
    };
  }

  // Respuesta general guiada
  return {
    answer: `Hola ${userName}. En relación con tu consulta sobre "${query}":

Para realizar o consultar esa operación dentro de **Chrystal® ERP**, puedes acceder a los módulos correspondientes en el menú lateral:
* **Inventario**: Catálogo de SKUs, existencias por sede y movimientos de Kardex.
* **Inteligencia y Gobierno**: Descargas & Bajas con doble firma, Curva de Pareto ABC y Órdenes de Reabastecimiento.
* **Finanzas**: Facturación, cuentas, caja y Auditoría Forense OCR.

Si necesitas la explicación paso a paso de algún procedimiento específico, por favor indícamelo con detalle y te guiaré de inmediato.`,
    suggestedPrompts: [
      '¿Cómo solicito una baja de inventario?',
      '¿Qué productos están en quiebre de stock?',
      '¿Cuál es la tasa oficial BCV hoy?',
    ],
  };
}

/**
 * Main AI Assistant Query Function
 * Evaluates security guardrails -> Calls Gemini 2.5 Flash -> Falls back to Heuristic Engine on error/offline
 */
export async function queryAssistant(
  request: AssistantQueryRequest
): Promise<AssistantQueryResponse> {
  const { query, liveContext } = request;

  // Step 1: Security guardrails check (RBAC and Write-protection)
  const guardrail = evaluateSecurityGuardrails(query, liveContext);
  if (guardrail.isBlocked) {
    return {
      answer: guardrail.responseMessage || 'Operación restringida por políticas de seguridad.',
      isBlockedByRbac: true,
      usedFallbackEngine: false,
      suggestedPrompts: [
        '¿Cómo consultar existencias de productos?',
        '¿Cuál es la tasa oficial BCV hoy?',
        '¿Cómo dar de alta un nuevo producto (SKU)?',
      ],
    };
  }

  // Step 2: Resolve Gemini API Key
  const apiKey =
    request.apiKey ||
    (typeof import.meta !== 'undefined' && import.meta.env
      ? (import.meta.env.VITE_GEMINI_API_KEY as string | undefined)
      : undefined) ||
    (typeof process !== 'undefined' && process.env
      ? (process.env.VITE_GEMINI_API_KEY as string | undefined)
      : undefined);

  // If no API key is configured or invalid format, use high-fidelity heuristic engine immediately
  if (!apiKey || !apiKey.startsWith('AIzaSy') || apiKey.length < 25) {
    const heuristic = answerQueryWithHeuristicEngine(query, liveContext);
    return {
      answer: heuristic.answer,
      isBlockedByRbac: false,
      usedFallbackEngine: true,
      suggestedPrompts: heuristic.suggestedPrompts,
    };
  }

  // Step 3: Call Gemini AI Model with grounding and system instructions
  try {
    const ai = new GoogleGenAI({ apiKey });
    const systemPrompt = buildMasterSystemPrompt(liveContext);

    // Build chat history context (last 4 messages for conversational continuity)
    const recentHistory = (request.conversationHistory || []).slice(-4);
    const historyContext = recentHistory
      .map(m => `${m.sender === 'user' ? 'Usuario' : 'PolarBot'}: ${m.text}`)
      .join('\n\n');

    const promptWithHistory = historyContext
      ? `Historial reciente de conversación:\n${historyContext}\n\nNueva consulta del usuario:\n${query}`
      : query;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: promptWithHistory,
      config: {
        systemInstruction: systemPrompt,
        temperature: 0.2, // Low temperature for high factual accuracy and zero hallucination
      },
    });

    const answerText = response.text?.trim() || '';

    if (!answerText) {
      throw new Error('Respuesta vacía recibida del modelo Gemini');
    }

    return {
      answer: answerText,
      isBlockedByRbac: false,
      usedFallbackEngine: false,
      suggestedPrompts: [
        '¿Cuál es la tasa oficial BCV hoy?',
        '¿Qué productos están en quiebre de stock?',
        '¿Cómo solicito una baja de inventario?',
      ],
    };
  } catch (error: any) {
    console.warn(
      '[PolarBot] Gemini API call interrupted. Seamlessly engaging local heuristic fallback engine:',
      error?.message || error
    );

    const heuristic = answerQueryWithHeuristicEngine(query, liveContext);
    return {
      answer: heuristic.answer,
      isBlockedByRbac: false,
      usedFallbackEngine: true,
      suggestedPrompts: heuristic.suggestedPrompts,
    };
  }
}
