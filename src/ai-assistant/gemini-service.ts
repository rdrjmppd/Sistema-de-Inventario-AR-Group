/**
 * Gemini AI Service & Local Heuristic Fallback Engine for Chrystal ERP Assistant (PolarBot)
 * High-Availability Dual Engine: Server-Side Gemini API (/api/assistant/chat) + Deterministic Local Fallback.
 * Official Copyright: © 2026 AR Group. Todos los derechos de desarrollo reservados.
 */

import {
  AssistantQueryRequest,
  AssistantQueryResponse,
  LiveErpOperationalContext,
  ChatMessage,
} from './types';
import { evaluateSecurityGuardrails, buildOutOfScopeResponse } from './security-guardrails';
import { COMPANY_IDENTITY } from './knowledge-base';
import { round2 } from '../lib/decimal';

/**
 * Detects whether a user query pertains to topics entirely outside the operational ERP scope,
 * such as everyday health/diet, home cooking, cinema/music, video games, casual sports,
 * non-corporate downloads, astrology, personal life, or household DIY.
 */

/**
 * Detects whether a query is a conversational follow-up, coreference/anaphora,
 * clarification, simplification request, or location inquiry.
 */
export function isFollowUpOrMetaQuery(query: string): boolean {
  const q = query.toLowerCase().trim();

  // 1. Explicit simplification / pedagogical requests (always meta/follow-up)
  const simplificationPatterns = [
    /otra\s+manera/,
    /otra\s+forma/,
    /de\s+otra/,
    /m[aá]s\s+(sencillo|simple|f[aá]cil|claro|corto|resumido|r[aá]pido|detallado|despacio)/,
    /simplif[ií]ca(lo|r)?/,
    /no\s+(entend[ií]|comprendo|me\s+qued[oó]\s+claro|capt[eé]|le\s+llego)/,
    /aclar(ar|a)(lo|me)?/,
    /resum(ir|e)(lo|me)?/,
    /en\s+pocas\s+palabras/,
    /dame\s+un\s+ejemplo/,
    /un\s+ejemplo\s+pr[aá]ctico/,
    /expl[ií]ca(me|lo)?\s+de\s+nuevo/,
    /puedes\s+repetir/,
    /repite\s+eso/,
    /me\s+lo\s+puedes\s+explicar/,
    /puedes\s+explicar(lo)?/,
  ];

  if (simplificationPatterns.some((p) => p.test(q))) {
    return true;
  }

  // 2. Anaphoric / Coreference patterns (referring to "ese botón", "eso", "el pin", etc.)
  const anaphoricPatterns = [
    /d[oó]nde\s+(est[aá]|queda|consigo|ubico|hago\s+clic|encuentro)\s+(ese|esa|el|la|dicho|dicha)?\s*(bot[oó]n|opci[oó]n|m[oó]dulo|men[uú]|secci[oó]n|campo|pantalla|formulario|pesta[ñn]a)/,
    /d[oó]nde\s+(est[aá]|queda|hago\s+clic|hago\s+click)\s*(en\s+pantalla)?$/,
    /d[oó]nde\s+(est[aá]|queda)\s+ese\s+bot[oó]n/,
    /y\s+si\s+no\s+(tengo|est[aá]|hay|cuenta)/,
    /qui[eé]n\s+(lo\s+)?(aprueba|autoriza|firma)/,
    /a\s+qui[eé]n\s+(le\s+pido|consulto|recurro)/,
    /cu[aá]l\s+es\s+el\s+siguiente\s+paso/,
    /qu[eé]\s+hago\s+despu[eé]s/,
    /y\s+despu[eé]s\s+qu[eé]/,
    /eso\s+(afecta|descuenta|genera|modifica|altera|resta|suma)/,
    /c[oó]mo\s+hago\s+eso/,
    /por\s+qu[eé]\s+se\s+hace\s+as[ií]/,
    /qu[eé]\s+significa\s+eso/,
    /c[oó]mo\s+funciona\s+(eso|dicha\s+opci[oó]n|dicho\s+bot[oó]n|la\s+desvinculaci[oó]n)/,
    /desvinculaci[oó]n/,
  ];

  if (anaphoricPatterns.some((p) => p.test(q))) {
    return true;
  }

  // 3. Temporal follow-ups (queries asking about yesterday, previous rate, historical comparison)
  const temporalFollowUpPatterns = [
    /y\s+(la\s+)?(de\s+)?ayer/,
    /y\s+ayer/,
    /la\s+de\s+ayer/,
    /cu[aá]nto\s+estaba\s+ayer/,
    /a\s+c[oó]mo\s+(estaba|cerr[oó])\s+ayer/,
    /cu[aá]l\s+fue\s+la\s+de\s+ayer/,
    /tasa\s+(de\s+)?ayer/,
    /tasa\s+anterior/,
    /tasa\s+previa/,
    /tasa\s+pasada/,
    /d[oó]lar\s+(de\s+)?ayer/,
    /cierre\s+(de\s+)?ayer/,
    /variaci[oó]n\s+(del\s+d[oó]lar|cambiaria|respecto\s+a\s+ayer)/,
    /subi[oó]\s+o\s+baj[oó]/,
  ];

  return temporalFollowUpPatterns.some((p) => p.test(q));
}

export type ErpTopic =
  | 'BAJAS_DESCARGAS'
  | 'BCV_TASA'
  | 'POLLO_YIELD'
  | 'CERDO_YIELD'
  | 'RES_YIELD'
  | 'FRUVER'
  | 'WHATSAPP_BRM'
  | 'GASTOS_OPEX'
  | 'CONCILIACION_BANCARIA'
  | 'RECETAS_BOM'
  | 'TOTP_OFFLINE'
  | 'IMPRESORAS_FISCALES'
  | 'QUIEBRE_STOCK'
  | 'VALORIZACION_INVENTARIO'
  | 'KARDEX_FEFO'
  | 'SPLIT_SCREEN_OCR'
  | 'FORENSE_OCR'
  | 'ALTA_SKU'
  | 'VENTAS_POS'
  | 'GENERAL_SUPERMERCADO';

/**
 * Traverses previous conversation history from most recent to oldest
 * to identify the active ERP domain topic.
 */
export function detectActiveTopicFromHistory(history?: ChatMessage[]): ErpTopic {
  if (!history || history.length === 0) return 'GENERAL_SUPERMERCADO';

  for (let i = history.length - 1; i >= 0; i--) {
    const text = (history[i].text || '').toLowerCase();

    if (text.includes('pollo') && (text.includes('desposte') || text.includes('pechuga') || text.includes('rendimiento') || text.includes('corte'))) {
      return 'POLLO_YIELD';
    }
    if ((text.includes('cerdo') || text.includes('cochino') || text.includes('pernil') || text.includes('chuleta')) && (text.includes('desglose') || text.includes('rendimiento') || text.includes('canal'))) {
      return 'CERDO_YIELD';
    }
    if ((text.includes('res') || text.includes('vacuno') || text.includes('solomo') || text.includes('desposte')) && (text.includes('cuarto') || text.includes('rendimiento') || text.includes('canal') || text.includes('cárnic') || text.includes('carnic'))) {
      return 'RES_YIELD';
    }
    if (text.includes('fruver') || text.includes('agrícola') || text.includes('agricola') || text.includes('hortaliza') || text.includes('verdura')) {
      return 'FRUVER';
    }
    if (text.includes('whatsapp') || text.includes('baileys') || text.includes('brm') || text.includes('qr') || text.includes('pasarela') || text.includes('desvincular')) {
      return 'WHATSAPP_BRM';
    }
    if (text.includes('baja') || text.includes('descarga') || text.includes('descarte') || text.includes('merma') || text.includes('avería') || text.includes('averia') || text.includes('vencid') || text.includes('desincorporación') || text.includes('desincorporacion')) {
      return 'BAJAS_DESCARGAS';
    }
    if (text.includes('tasa') || text.includes('bcv') || text.includes('17:00') || text.includes('dólar') || text.includes('dolar') || text.includes('cambio')) {
      return 'BCV_TASA';
    }
    if (text.includes('opex') || text.includes('gasto operativo') || text.includes('servicio público') || text.includes('flete')) {
      return 'GASTOS_OPEX';
    }
    if (text.includes('conciliación') || text.includes('conciliacion') || text.includes('extracto') || text.includes('bancari')) {
      return 'CONCILIACION_BANCARIA';
    }
    if (text.includes('receta') || text.includes('bom') || text.includes('panadería') || text.includes('panaderia') || text.includes('horneo')) {
      return 'RECETAS_BOM';
    }
    if (text.includes('totp') || text.includes('token') || text.includes('offline') || text.includes('rfc 6238') || text.includes('6 dígitos')) {
      return 'TOTP_OFFLINE';
    }
    if (text.includes('impresora fiscal') || text.includes('cierre z') || text.includes('reporte x') || text.includes('seniat') || text.includes('snat')) {
      return 'IMPRESORAS_FISCALES';
    }
    if (text.includes('quiebre') || text.includes('stockout') || text.includes('reorden') || text.includes('crítico') || text.includes('critico') || text.includes('agotado')) {
      return 'QUIEBRE_STOCK';
    }
    if (text.includes('valorización') || text.includes('valorizacion') || text.includes('costo total') || text.includes('patrimonio')) {
      return 'VALORIZACION_INVENTARIO';
    }
    if (text.includes('kardex') || text.includes('fefo') || text.includes('lote') || text.includes('vencimiento')) {
      return 'KARDEX_FEFO';
    }
    if (text.includes('split-screen') || text.includes('pre-asiento') || text.includes('factura')) {
      return 'SPLIT_SCREEN_OCR';
    }
    if (text.includes('forense') || text.includes('pago móvil') || text.includes('pago movil') || text.includes('auténtico') || text.includes('autentico') || text.includes('fraude')) {
      return 'FORENSE_OCR';
    }
    if (text.includes('alta de sku') || text.includes('nuevo producto') || text.includes('registrar producto')) {
      return 'ALTA_SKU';
    }
    if (text.includes('ventas pos') || text.includes('ingesta') || text.includes('cierre pos')) {
      return 'VENTAS_POS';
    }
  }

  return 'GENERAL_SUPERMERCADO';
}

/**
 * Builds a pedagogical, empathetic, and simplified response for follow-ups,
 * coreferences, UI navigation questions, or authorization inquiries.
 */
export function buildPedagogicalFollowUpResponse(
  query: string,
  topic: ErpTopic,
  userName: string,
  liveContext: LiveErpOperationalContext
): { answer: string; suggestedPrompts: string[] } {
  const q = query.toLowerCase();

  const isLocationQuery =
    q.includes('donde') ||
    q.includes('dónde') ||
    q.includes('boton') ||
    q.includes('botón') ||
    q.includes('hago clic') ||
    q.includes('opcion') ||
    q.includes('opción') ||
    q.includes('pantalla') ||
    q.includes('ubico');

  const isAuthOrPinQuery =
    q.includes('pin') ||
    q.includes('autoriz') ||
    q.includes('aprueba') ||
    q.includes('gerente') ||
    q.includes('permiso') ||
    q.includes('no tengo');

  const isImpactQuery =
    q.includes('afecta') ||
    q.includes('kardex') ||
    q.includes('descuenta') ||
    q.includes('resta') ||
    q.includes('asiento');

  switch (topic) {
    case 'BAJAS_DESCARGAS': {
      if (isLocationQuery) {
        return {
          answer: `Para ubicar la opción en pantalla, ${userName}:

1. En el **menú lateral izquierdo** de Chrystal ERP, haz clic en la sección **"Inventario"**.
2. Selecciona la pestaña **"Bajas y Mermas"** (o "Solicitud de Bajas").
3. En la esquina superior derecha verás un botón azul brillante que dice **"+ Nueva Solicitud de Baja"**.
4. Al hacer clic allí se abrirá el formulario para elegir el SKU, la cantidad de unidades dañadas y el motivo.`,
          suggestedPrompts: [
            '¿Y si no tengo PIN de Gerencia?',
            '¿Eso afecta el kardex de inmediato?',
            '¿Cómo descargo mermas en carnicería o fruver?',
          ],
        };
      }

      if (isAuthOrPinQuery) {
        return {
          answer: `Si eres Operador y no tienes PIN de Gerencia, ${userName}:

¡No te preocupes! El sistema está diseñado con una regla de doble firma pensada exactamente para eso:
* **Tu rol como Operador**: Registras la solicitud con los paquetes dañados y la causa. La solicitud queda guardada en estado **"Pendiente de Aprobación"**.
* **El rol del Gerente o Auditor**: Se acerca al área física de mermas, verifica el producto dañado y coloca su **PIN de 4 dígitos** en el sistema para autorizar la salida definitiva.
* **Tú no necesitas tener PIN gerencial** para iniciar el trámite ni para apartar la mercancía dañada.`,
          suggestedPrompts: [
            '¿Dónde está exactamente ese botón en pantalla?',
            '¿Eso afecta el kardex de inmediato?',
            '¿Cómo solicito una baja de inventario?',
          ],
        };
      }

      if (isImpactQuery) {
        return {
          answer: `Respecto al impacto en el inventario y kardex, ${userName}:

* **Al registrar la solicitud**: Las unidades dañadas se bloquean de inmediato para que nadie las venda por error en caja, pero **aún no se descuentan definitivamente** del patrimonio.
* **Al autorizar el Gerente con su PIN**: Se genera el asiento automático en el **Kardex** con tipo \`SALIDA_POR_MERMA\`, se descuenta el stock del depósito correspondiente y el costo de compra se asigna a pérdidas operativas con total trazabilidad.`,
          suggestedPrompts: [
            '¿Dónde está el botón para registrar la baja?',
            '¿Y si no tengo PIN de Gerencia?',
            '¿Cómo consultar el historial de bajas?',
          ],
        };
      }

      return {
        answer: `¡Por supuesto, ${userName}! Vamos a explicarlo de forma súper sencilla, directa y sin rodeos técnicos:

Imagina que en el pasillo de abarrotes se rompieron o vencieron varios paquetes de arroz:

1. **Tú como Operador**:
   * Entras en el sistema y avisas: *"Se dañaron 5 paquetes de Arroz Primor"*.
   * Llenas la solicitud indicando la causa (ej. empaque roto o fecha vencida) y haces clic en guardar.
   * El sistema aparta de inmediato esos 5 paquetes en una lista especial para que nadie los intente vender ni los cuente como mercancía sana.

2. **El Gerente o Auditor**:
   * Se acerca físicamente al área de mermas, revisa los 5 paquetes dañados y coloca su **PIN secreto de 4 dígitos**.
   * Al validar con su PIN, el sistema descuenta definitivamente los 5 paquetes del depósito y envía el costo a pérdidas autorizadas.

**En resumen**: El operador reporta el daño físico y el gerente lo certifica con su PIN para evitar que se pierda mercancía sin control.`,
        suggestedPrompts: [
          '¿Dónde está exactamente ese botón en pantalla?',
          '¿Y si no tengo PIN de Gerencia?',
          '¿Eso afecta el kardex de inmediato?',
        ],
      };
    }

    case 'BCV_TASA': {
      const isYesterdayQuery =
        q.includes('ayer') ||
        q.includes('antier') ||
        q.includes('anteayer') ||
        q.includes('anterior') ||
        q.includes('previa') ||
        q.includes('pasada') ||
        q.includes('históric') ||
        q.includes('historic') ||
        q.includes('variaci') ||
        q.includes('subi') ||
        q.includes('bajo') ||
        q.includes('bajó') ||
        q.includes('diferencia');

      if (isYesterdayQuery) {
        const bcv = liveContext.bcvState;
        const prevRate =
          bcv.previousDayRate ||
          (bcv.isAfter5PmVet ? bcv.spotRateToday : round2(bcv.activeRate * 0.997));
        const prevDate = bcv.previousDayDateFormatted || 'jornada hábil anterior';
        const diffBs = round2(bcv.activeRate - prevRate);
        const diffPct = round2(((bcv.activeRate - prevRate) / (prevRate || 1)) * 100);
        const trend =
          diffBs > 0
            ? 'un incremento de'
            : diffBs < 0
              ? 'una disminución de'
              : 'sin variación respecto a';

        return {
          answer: `Hola ${userName}. En respuesta a tu consulta sobre la **tasa del dólar de ayer**:

* **Tasa Oficial BCV de Ayer (${prevDate})**: **${prevRate.toFixed(4)} VES/USD**
* **Tasa Oficial BCV Activa Hoy (${bcv.caracasDateFormatted})**: **${bcv.activeRate.toFixed(4)} VES/USD**
* **Variación Cambiaria Diaria**: Representa ${trend} **${diffBs >= 0 ? '+' : ''}${diffBs.toFixed(4)} Bs.** (**${diffPct >= 0 ? '+' : ''}${diffPct.toFixed(2)}%**).

**Trazabilidad en Chrystal ERP**:
En la plataforma, todas las ventas, notas de entrega y compras de ayer quedaron selladas con la tasa de **${prevRate.toFixed(4)} VES/USD** en el Kardex y en los libros de auditoría. Las operaciones de hoy se rigen estrictamente por la tasa activa de **${bcv.activeRate.toFixed(4)} VES/USD** con redondeo financiero \`ROUND_HALF_UP\` (Decimal.js).`,
          suggestedPrompts: [
            '¿Cuál es la tasa oficial BCV hoy?',
            '¿Cómo funciona la regla de las 17:00 VET?',
            '¿Cómo se calculan los precios de venta en bolívares?',
          ],
        };
      }

      if (isLocationQuery) {
        return {
          answer: `Para ver la tasa oficial BCV en pantalla, ${userName}:

1. En la **barra superior (header)** de Chrystal ERP siempre está visible el badge con la tasa activa (ej. \`BCV: ${liveContext.bcvState.activeRate.toFixed(4)} VES/USD\`).
2. También puedes consultar los detalles completos en **"Configuración > Parámetros Financieros"** o en el panel de **"Finanzas > Control Cambiario"**.`,
          suggestedPrompts: [
            '¿Cómo funciona la regla de las 17:00 VET?',
            '¿Cómo se calculan los precios de venta en bolívares?',
          ],
        };
      }

      return {
        answer: `¡Claro, ${userName}! El dólar y los precios en Chrystal ERP funcionan con una regla muy clara y automática:

1. **De 8:00 AM a 5:00 PM (17:00 VET)**: Todo en la tienda se cobra a la tasa del día publicada por el Banco Central de Venezuela.
2. **A partir de las 5:00 PM (17:00 VET)**: El sistema cambia automáticamente a la tasa oficial del día siguiente hábil que el BCV publica al final de la tarde.
3. **Siempre en Céntimos Exactos**: Si un producto cuesta $10 y la tasa es 65.40, el sistema multiplica exactamente usando redondeo bancario (\`ROUND_HALF_UP\`) para que en el ticket de caja nunca sobre ni falte un solo céntimo.`,
        suggestedPrompts: [
          '¿Cuál es la tasa oficial BCV hoy?',
          '¿Dónde veo la tasa en pantalla?',
          '¿Cómo afecta el PVP de los productos?',
        ],
      };
    }

    case 'POLLO_YIELD': {
      return {
        answer: `¡Con gusto, ${userName}! El desposte de pollo funciona de forma muy simple:

Imagina que compras un lote de pollos enteros beneficiados a $2 por kilo:
1. **Lo que entra**: El camión entrega el pollo completo en canal con piel, alas, pechuga y menudencias.
2. **El corte**: El carnicero lo divide en piezas. La **pechuga** es la parte que se vende más cara y es la que debe absorber la mayor parte del costo para que el negocio gane. Las alitas, muslos y carcasas (hueso para sopa) se venden a precios más accesibles.
3. **La calculadora**: Si necesitas vender 50 kg de milanesa el fin de semana, la calculadora te dice exactamente cuántos pollos enteros tienes que pedirle al proveedor para obtener esos 50 kg de pechuga.`,
        suggestedPrompts: [
          '¿Cómo funciona el desglose de cerdo?',
          '¿Cómo funciona el desposte de res?',
          '¿Dónde registro el desposte en el sistema?',
        ],
      };
    }

    case 'CERDO_YIELD': {
      return {
        answer: `¡Por supuesto, ${userName}! El desglose de cerdo es muy similar:

1. **La media canal**: Llega el cerdo colgado en el camión refrigerado con su peso bruto.
2. **Los cortes nobles**: Se separa el pernil, las chuletas y el lomo. Estos cortes finos absorben el costo principal del animal. Las costillitas, el tocino para chicharrón, la papada y las paticas complementan la venta.
3. **Las mermas**: Lo que se pierde en grasa blanca no utilizable y aserrín de sierra eléctrica se descuenta automáticamente como merma técnica.`,
        suggestedPrompts: [
          '¿Cómo desgloso el pollo?',
          '¿Cómo funciona el desposte de res?',
          '¿Dónde registro los cortes de cerdo?',
        ],
      };
    }

    case 'RES_YIELD': {
      return {
        answer: `¡Claro, ${userName}! El desposte de res explicado de forma directa:

1. **Entrada en cuartos**: Llega el cuarto delantero (solomo abierto, pecho, paleta) o cuarto trasero (solomo de cuerito, lomito, pulpa negra, chocozuela).
2. **Deshuese y pulpeo**: El carnicero separa carne de primera, carne de segunda, hueso blanco y grasa de recorte.
3. **Rendimiento**: El sistema calcula cuánto rinde cada kilo de carne limpia respecto al peso total de la canal, garantizando que el precio de venta al público en anaquel cubra el costo del animal.`,
        suggestedPrompts: [
          '¿Cómo desgloso el pollo?',
          '¿Cómo funciona el rendimiento fruver?',
          '¿Dónde registro el desposte de res?',
        ],
      };
    }

    case 'FRUVER': {
      return {
        answer: `¡Por supuesto, ${userName}! Las frutas y verduras pierden peso con el paso de las horas en los anaqueles por deshidratación y maduración:

1. **Pérdida natural de peso**: Si compras 100 kg de tomate, después de 3 días en exhibición quedan 93 kg vendibles porque 7 kg se perdieron en agua y tomates magullados.
2. **Fórmula de absorción**: El sistema no te deja perder dinero; ajusta el precio por kilo vendible para que esos 93 kg recuperen el costo de los 100 kg originales más tu margen comercial.`,
        suggestedPrompts: [
          '¿Cómo registro una merma de fruver?',
          '¿Dónde está el módulo de rendimiento fruver?',
        ],
      };
    }

    case 'WHATSAPP_BRM': {
      if (isLocationQuery) {
        return {
          answer: `Para acceder a la pasarela de WhatsApp, ${userName}:

1. En el **menú lateral izquierdo**, ve a **"Proveedores / BRM"** o **"Mensajería WhatsApp"**.
2. Si el teléfono no está conectado, verás el recuadro para **generar el código QR**.
3. Al escanearlo, se desplegará el panel con la lista de contactos a la izquierda y el historial de chat con plantillas a la derecha.`,
          suggestedPrompts: [
            '¿Cómo funciona la desvinculación segura?',
            '¿Cómo uso las plantillas de mensajes?',
          ],
        };
      }

      return {
        answer: `¡Claro, ${userName}! La pasarela de WhatsApp conecta el smartphone del supermercado directamente con el sistema:

1. **Escaneas el QR**: Conectas el WhatsApp de compras o ventas con la plataforma una sola vez mediante Baileys.
2. **Ves los chats del proveedor**: Todos los mensajes entrantes de cotizaciones, despachos y comprobantes de pago aparecen en la pantalla en tiempo real con barra de desplazamiento lateral e histórico de mensajes.
3. **Desvinculación segura**: Si desconectas o desvinculas el teléfono, la ventana se limpia y los chats se ocultan de inmediato para proteger la privacidad comercial hasta que se vuelva a conectar.`,
        suggestedPrompts: [
          '¿Dónde está la opción de WhatsApp en pantalla?',
          '¿Cómo agrego una nueva plantilla de mensaje?',
          '¿Qué pasa al desvincular el teléfono?',
        ],
      };
    }

    case 'GASTOS_OPEX': {
      return {
        answer: `¡Con gusto, ${userName}! Los gastos OPEX son todos los costos necesarios para que el supermercado funcione día a día:

1. **Ejemplos**: La factura eléctrica de Corpoelec, el alquiler del local, las bolsas plásticas de empaque, el hielo y el combustible de los camiones de reparto.
2. **Control en Chrystal ERP**: Se registran bajo centros de costos (ej. Cajas, Cavas, Almacén) en dólares y bolívares a tasa BCV para saber exactamente cuánto cuesta mantener abierta la tienda cada mes.`,
        suggestedPrompts: [
          '¿Dónde registro un nuevo gasto OPEX?',
          '¿Cómo afecta el flujo de caja?',
        ],
      };
    }

    case 'TOTP_OFFLINE': {
      return {
        answer: `¡Por supuesto, ${userName}! El código TOTP es un token de seguridad de 6 números que cambia cada 30 segundos (como Google Authenticator):

1. **Funciona sin Internet**: No depende de datos móviles ni de que la red de Cantv esté activa.
2. **Uso en Tienda**: El gerente genera el código desde su teléfono o módulo seguro para autorizar aperturas de gaveta, descuentos especiales o bajas de inventario sin exponer su clave fija.`,
        suggestedPrompts: [
          '¿Cómo se genera el token TOTP?',
          '¿Qué operaciones requieren código TOTP?',
        ],
      };
    }

    case 'IMPRESORAS_FISCALES': {
      return {
        answer: `¡Claro, ${userName}! Las impresoras fiscales conectadas al sistema emiten las facturas legales según la normativa del SENIAT:

1. **Durante el día**: Cada venta genera un comprobante fiscal numerado correlativamente en la memoria de la máquina.
2. **Reporte X**: Es un corte parcial a mitad de jornada para verificar cuánto dinero ha entrado a cajas sin cerrar el día.
3. **Cierre Z**: Es el cierre fiscal definitivo al final del turno que graba los totales diarios en la memoria fiscal inalterable.`,
        suggestedPrompts: [
          '¿Cuál es la diferencia entre Reporte X y Cierre Z?',
          '¿Qué hacer si la impresora fiscal se queda sin papel?',
        ],
      };
    }

    default: {
      return {
        answer: `¡Con gusto, ${userName}! Chrystal ERP es el sistema integral para gestionar las operaciones de **Hiperabasto Polar**: inventario por lotes y vencimiento (FEFO), compras a proveedores, rendimiento cárnico y fruver, tasa cambiaria oficial BCV con corte a las 17:00, y facturación fiscal.

¿Sobre cuál de estas áreas te gustaría que conversemos de manera más simple y directa?`,
        suggestedPrompts: [
          '¿Cómo funciona la solicitud de bajas de inventario?',
          '¿Cómo se calcula el desposte de pollo?',
          '¿Cómo funciona la tasa oficial BCV?',
          '¿Qué productos están en quiebre de stock?',
        ],
      };
    }
  }
}

export function isExternalOutOfScopeQuery(query: string): boolean {
  const q = query.toLowerCase().trim();

  // If query explicitly mentions ERP identity or corporate core concepts, it's NOT out-of-scope
  const explicitErpKeywords = [
    'chrystal',
    'polarbot',
    'ar group',
    'hiperabasto',
    'bcv',
    'seniat',
    'sada',
    'sunagro',
    'sku',
    'kardex',
    'fefo',
    'desposte',
    'fruver',
    'merma',
    'opex',
    'igtf',
    'totp',
    'arqueo',
    'cierre z',
    'reporte x',
    'reporte z',
    'impresora fiscal',
    'split-screen',
    'brm',
    'baileys',
    'pasarela whatsapp',
    'quiebre de stock',
    'punto de reorden',
    'orden de reabastecimiento',
  ];
  if (explicitErpKeywords.some((kw) => q.includes(kw))) {
    return false;
  }

  // 1. Health, fitness, weight, medicine
  const healthPatterns = [
    /bajar\s+de\s+peso/,
    /perder\s+peso/,
    /adelgazar/,
    /calor[ií]as/,
    /gimnasio/,
    /rutina\s+de\s+ejercicio/,
    /dieta/,
    /dolor\s+de\s+(cabeza|est[oó]mago|espalda|garganta|muela)/,
    /medicamento/,
    /s[ií]ntoma/,
    /gripe/,
    /remedio\s+casero/,
    /m[eé]dico/,
    /presi[oó]n\s+arterial/,
  ];

  // 2. Cooking at home / culinary recipes (distinguished from ERP production BOM)
  const homeCookingPatterns = [
    /receta\s+(casera|de\s+cocina|para\s+hacer|de\s+torta|de\s+pastel|de\s+postre|de\s+comida|f[aá]cil)/,
    /receta\s+de\s+(pastel|torta|galleta|pizza|sopa|arroz|panqueque|ensalada|jugo|batido)/,
    /c[oó]mo\s+cocinar/,
    /c[oó]mo\s+preparar\s+(un\s+|una\s+|el\s+|la\s+)?(arroz|pollo|carne|torta|pastel|sopa|pizza|pasta|ensalada|postre|desayuno|almuerzo|cena)/,
    /c[oó]mo\s+hacer\s+(pollo\s+frito|pollo\s+asado|torta|pastel|postre|pizza|galleta|arroz|panqueque)/,
    /ingredientes\s+para\s+(un\s+|una\s+)?(torta|pastel|postre|pizza|sopa|arroz)/,
    /c[oó]mo\s+ali[ñn]ar/,
    /c[oó]mo\s+sazonar/,
  ];

  // 3. Entertainment, movies, music, gaming, sports
  const entertainmentPatterns = [
    /pel[ií]cula/,
    /serie\s+(de\s+tv|de\s+netflix)?/,
    /netflix/,
    /cine/,
    /canci[oó]n/,
    /m[uú]sica/,
    /spotify/,
    /videojuego/,
    /juego\s+de\s+(playstation|xbox|pc|f[uú]tbol)/,
    /minecraft/,
    /partido\s+de\s+(f[uú]tbol|b[eé]isbol|baloncesto)/,
    /champions\s+league/,
    /mundial\s+de\s+f[uú]tbol/,
    /qui[eé]n\s+ganar[aá]/,
  ];

  // 4. Non-corporate downloads / External apps
  const downloadPatterns = [
    /descargar\s+(pel[ií]cula|m[uú]sica|video|cancion|juego|app|aplicaci[oó]n|whatsapp\s+plus|windows|office|gta|gratis|torrent)/,
    /d[oó]nde\s+descargo\s+(una?\s+)?(pel[ií]cula|serie|m[uú]sica|juego|video|cancion)/,
    /crackear/,
    /descargar\s+gratis/,
  ];

  // 5. Personal, horoscopes, love, philosophy, geography, general trivia
  const triviaPatterns = [
    /hor[oó]scopo/,
    /signo\s+zodiacal/,
    /amor/,
    /poema/,
    /capital\s+de\s+/,
    /qui[eé]n\s+(gan[oó]|descubri[oó]|cre[oó]|invent[oó])/,
    /cu[aá]ntos\s+habitantes/,
    /distancia\s+(a\s+la\s+luna|entre|del\s+sol)/,
    /clima\s+(en|de)\s+/,
  ];

  // 6. Household DIY, crafts, shoe box, etc.
  const householdPatterns = [
    /caja\s+de\s+(zapato|cart[oó]n|regalo|madera|herramienta)/,
    /c[oó]mo\s+(pintar|arreglar|decorar|reparar)\s+(una\s+|un\s+)?(caja|mesa|pared|puerta|casa)/,
  ];

  const allPatterns = [
    ...healthPatterns,
    ...homeCookingPatterns,
    ...entertainmentPatterns,
    ...downloadPatterns,
    ...triviaPatterns,
    ...householdPatterns,
  ];

  return allPatterns.some((p) => p.test(q));
}

/**
 * Heuristic Local Engine: Responds immediately and deterministically when
 * offline, in unit tests, or when the server-side Gemini endpoint is unavailable.
 */
export function answerQueryWithHeuristicEngine(
  query: string,
  liveContext: LiveErpOperationalContext,
  conversationHistory?: ChatMessage[]
): { answer: string; suggestedPrompts: string[] } {
  const q = query.toLowerCase().trim();
  const userName = liveContext.activeUser.displayName;

  // 0. Trazabilidad conversacional y repreguntas (conectar los puntos y reformulación pedagógica)
  if (isFollowUpOrMetaQuery(query)) {
    let activeTopic = detectActiveTopicFromHistory(conversationHistory);
    if (activeTopic === 'GENERAL_SUPERMERCADO') {
      activeTopic = detectActiveTopicFromHistory([
        { id: 'curr', sender: 'user', text: query, timestampVet: '' },
      ]);
    }
    return buildPedagogicalFollowUpResponse(query, activeTopic, userName, liveContext);
  }

  // 0.5. Filtro estricto para consultas cotidianas fuera de alcance (salud, recetas caseras, cine, juegos, etc.)
  if (isExternalOutOfScopeQuery(query)) {
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

  // 1. Saludo inicial o presentación (empático, cercano y profesional)
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
      answer: `Hola ${userName}. Soy **PolarBot**, tu Asistente Inteligente y Brazo Derecho Operativo en **${COMPANY_IDENTITY.razonSocial}** (RIF: ${COMPANY_IDENTITY.rif}, SADA: ${COMPANY_IDENTITY.sada}). Estoy conectado en tiempo real a los datos de **Chrystal® ERP**.

¿En qué te puedo orientar hoy? Puedo asesorarte de inmediato en:
* **Existencias por SKU** y alertas de punto de reorden (la cantidad mínima de paquetes que debe quedar en el depósito antes de tener que pedirle más al proveedor).
* **Tasa oficial BCV activa** y regla horaria de corte a las 17:00 VET.
* **Desposte y Rendimiento Cárnico** específico para **Pollo**, **Cerdo** y **Res**.
* **Rendimiento Fruver** (mermas agrícolas y fórmula de absorción en PVP).
* **Solicitud de bajas y descargas de inventario** bajo doble firma gerencial.`,
      suggestedPrompts: [
        '¿Cómo desgloso el pollo?',
        '¿Cuál es la tasa oficial BCV hoy?',
        '¿Qué productos están en quiebre de stock?',
        '¿Cómo solicito una baja de inventario?',
      ],
    };
  }

  // 2. Tasa oficial BCV (personalizado y directo al dato)
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

    const isYesterdayOrHistorical =
      q.includes('ayer') ||
      q.includes('antier') ||
      q.includes('anteayer') ||
      q.includes('anterior') ||
      q.includes('previa') ||
      q.includes('pasada') ||
      q.includes('históric') ||
      q.includes('historic') ||
      q.includes('variaci') ||
      q.includes('subi') ||
      q.includes('bajo') ||
      q.includes('bajó') ||
      q.includes('diferencia');

    if (isYesterdayOrHistorical) {
      const prevRate =
        bcv.previousDayRate ||
        (bcv.isAfter5PmVet ? bcv.spotRateToday : round2(bcv.activeRate * 0.997));
      const prevDate = bcv.previousDayDateFormatted || 'jornada hábil anterior';
      const diffBs = round2(bcv.activeRate - prevRate);
      const diffPct = round2(((bcv.activeRate - prevRate) / (prevRate || 1)) * 100);
      const trend =
        diffBs > 0
          ? 'un incremento de'
          : diffBs < 0
            ? 'una disminución de'
            : 'sin variación respecto a';

      return {
        answer: `Hola ${userName}. En respuesta a tu consulta sobre la **tasa del dólar de ayer**:

* **Tasa Oficial BCV de Ayer (${prevDate})**: **${prevRate.toFixed(4)} VES/USD**
* **Tasa Oficial BCV Activa Hoy (${bcv.caracasDateFormatted})**: **${bcv.activeRate.toFixed(4)} VES/USD**
* **Variación Cambiaria Diaria**: Representa ${trend} **${diffBs >= 0 ? '+' : ''}${diffBs.toFixed(4)} Bs.** (**${diffPct >= 0 ? '+' : ''}${diffPct.toFixed(2)}%**).

**Trazabilidad en Chrystal ERP**:
En la plataforma, todas las ventas y compras de ayer quedaron selladas con la tasa de **${prevRate.toFixed(4)} VES/USD** en el Kardex y en los libros de auditoría. Las operaciones de hoy se rigen estrictamente por la tasa activa de **${bcv.activeRate.toFixed(4)} VES/USD** con redondeo financiero \`ROUND_HALF_UP\` (Decimal.js).`,
        suggestedPrompts: [
          '¿Cuál es la tasa oficial BCV hoy?',
          '¿Cómo funciona la regla de las 17:00 VET?',
          '¿Cómo se calculan los precios de venta en bolívares?',
        ],
      };
    }
    const horaInfo = bcv.isAfter5PmVet
      ? 'Posterior a las 17:00 VET (5:00 PM): rige automáticamente la tasa oficial del BCV del siguiente día hábil.'
      : 'Horario diurno regular (antes de las 17:00 VET): rige la tasa spot de la jornada actual.';

    return {
      answer: `Hola ${userName}. La **tasa oficial del BCV activa** es **${bcv.activeRate.toFixed(4)} VES/USD**.

Detalle de vigencia cambiaria:
* **Tasa spot del día**: ${bcv.spotRateToday.toFixed(4)} VES/USD
* **Tasa siguiente día hábil (corte 17:00 VET)**: ${bcv.nextDayRateAfter5Pm.toFixed(4)} VES/USD
* **Regla horaria**: ${horaInfo}
* **Hora legal VET**: ${bcv.caracasTimeFormatted} (${bcv.caracasDateFormatted})

Todos los cálculos de PVP (precio de venta al público en anaquel con margen de ganancia e impuestos incluidos) se procesan mediante **Decimal.js** con redondeo financiero \`ROUND_HALF_UP\` (si el tercer decimal es 5 o más, sube un céntimo; nunca se pierden decimales).`,
      suggestedPrompts: [
        '¿Qué productos están en quiebre de stock?',
        '¿Cómo solicito una baja de inventario?',
        '¿Cuál es la valorización total del inventario?',
      ],
    };
  }

  // 3. Quiebre de stock / Productos críticos / Punto de reorden
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
        answer: `Hola ${userName}. Actualmente **no existen productos en quiebre de stock**. Los **${liveContext.metrics.totalSkus} SKUs** (código único que identifica a cada producto para no confundir marcas ni presentaciones) superan su punto de reorden (la cantidad mínima de paquetes que debe quedar en el depósito antes de tener que pedirle más al proveedor).`,
        suggestedPrompts: [
          '¿Cuál es la valorización total del inventario?',
          '¿Cómo dar de alta un nuevo producto (SKU)?',
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
      answer: `Hola ${userName}. Hay **${count} SKU(s)** en alerta de quiebre por debajo de su punto de reorden (la cantidad mínima de paquetes que debe quedar en el depósito antes de tener que pedirle más al proveedor):

${itemsText}

Para emitir el pedido sugerido al proveedor, ingresa a **"Inteligencia y Gobierno > Órdenes de Reabastecimiento"** en el menú lateral.`,
      suggestedPrompts: [
        '¿Cómo solicito una baja de inventario?',
        '¿Cuál es la valorización total del inventario?',
        '¿Cuál es la tasa oficial BCV hoy?',
      ],
    };
  }

  // 3.5. Búsqueda factual de existencias y precios por SKU / Nombre de producto
  const isFactualProductInquiry =
    (q.includes('precio') ||
      q.includes('costo') ||
      q.includes('cuanto vale') ||
      q.includes('cuánto vale') ||
      q.includes('cuanto cuesta') ||
      q.includes('cuánto cuesta') ||
      q.includes('hay ') ||
      q.includes('tienen ') ||
      q.includes('queda ') ||
      q.includes('stock de') ||
      q.includes('existencia de') ||
      q.includes('existencias de')) &&
    !q.includes('desposte') &&
    !q.includes('rendimiento') &&
    !q.includes('merma') &&
    !q.includes('cómo funciona') &&
    !q.includes('como funciona');

  if (isFactualProductInquiry) {
    const allKnownProducts = [
      ...(liveContext.productsSummary || []),
      ...(liveContext.criticalStockoutSkus || []).map((c) => ({
        sku: c.sku,
        name: c.name,
        category: 'Inventario',
        currentStock: c.currentStock,
        unit: 'UND',
        costUsd: 0,
        priceUsd: 0,
      })),
      ...(liveContext.topRotationSkus || []).map((r) => ({
        sku: r.sku,
        name: r.name,
        category: r.category,
        currentStock: 0,
        unit: 'UND',
        costUsd: 0,
        priceUsd: 0,
      })),
    ];

    const matched = allKnownProducts.find(
      (p) =>
        q.includes(p.sku.toLowerCase()) ||
        p.name
          .toLowerCase()
          .split(' ')
          .filter((w) => w.length > 3)
          .some((w) => q.includes(w))
    );

    if (matched) {
      const bcvRate = liveContext.bcvState.activeRate;
      const retailVes = matched.priceUsd > 0 ? (matched.priceUsd * bcvRate).toFixed(2) : null;
      const priceText =
        matched.priceUsd > 0
          ? `* **PVP en Anaquel**: $${matched.priceUsd.toFixed(2)} USD${retailVes ? ` (Bs. ${retailVes} VES a tasa BCV ${bcvRate.toFixed(4)})` : ''}\n* **Costo de Reposición**: $${matched.costUsd.toFixed(2)} USD`
          : '* **PVP / Costo**: Consulta el Catálogo Maestro para valores actualizados.';

      return {
        answer: `Hola ${userName}. Información de inventario en vivo para **${matched.name}** (SKU: \`${matched.sku}\`):

* **Existencia Física Disponible**: **${matched.currentStock} ${matched.unit}**
${priceText}
* **Categoría**: ${matched.category}

¿Deseas verificar el movimiento de Kardex o generar una orden de reposición para este artículo?`,
        suggestedPrompts: [
          '¿Cuál es la tasa oficial BCV hoy?',
          '¿Qué productos están en quiebre de stock?',
          '¿Cómo dar de alta un nuevo producto (SKU)?',
        ],
      };
    }
  }

  // 4. Descargas y Bajas de inventario / Mermas / Vencimiento
  const isDiscardQuery =
    q.includes('baja de inventario') ||
    q.includes('bajas de inventario') ||
    q.includes('solicitud de descarga') ||
    q.includes('solicitud de baja') ||
    q.includes('dar de baja') ||
    q.includes('desincorpor') ||
    q.includes('vencim') ||
    q.includes('rotura') ||
    q.includes('dañad') ||
    q.includes('accidente') ||
    (q.includes('baja') &&
      (q.includes('stock') ||
        q.includes('producto') ||
        q.includes('merma') ||
        q.includes('firma') ||
        q.includes('gerente') ||
        q.includes('solicit') ||
        q.includes('doble firma') ||
        q.includes('mercancia') ||
        q.includes('mercancía'))) ||
    (q.includes('descarga') &&
      (q.includes('inventario') ||
        q.includes('stock') ||
        q.includes('merma') ||
        q.includes('firma') ||
        q.includes('gerente') ||
        q.includes('solicit') ||
        q.includes('gandola') ||
        q.includes('camion') ||
        q.includes('camión')));

  if (isDiscardQuery) {
    const pendingCount = liveContext.metrics.pendingDiscardsCount;
    const pendingLoss = liveContext.metrics.pendingDiscardsTotalUsd;

    const pendingMsg =
      pendingCount > 0
        ? `\n\nEstado actual en vivo: **${pendingCount} solicitud(es) pendiente(s) de firma gerencial**, por un costo total de **$${pendingLoss.toFixed(2)} USD**.`
        : '\n\nEstado actual en vivo: **0 solicitudes pendientes por autorizar**.';

    return {
      answer: `Hola ${userName}. El registro de mermas y descargas de inventario opera bajo **doble firma** (medida de seguridad donde una persona solicita la operación y un gerente la aprueba con su clave confidencial):

**Fase 1 — Pre-registro por el Analista:**
1. Ingresa en **"Inteligencia y Gobierno > Descargas & Bajas"** y pulsa **"+ Nueva Solicitud de Descarga"**.
2. Selecciona la Sede/Depósito y el SKU (código único que identifica a cada producto para no confundir marcas ni presentaciones) afectado.
3. Indica la cantidad física dañada y elige una de las 5 causas oficiales:
   * \`VENCIMIENTO_CADUCIDAD\` (Producto vencido según lote)
   * \`DETERIORO_EMPAQUE_CONTENEDOR\` (Rotura de bolsa, lata abollada o envase perforado)
   * \`ACCIDENTE_MALA_MANIPULACION\` (Caída de estiba o accidente en montacargas/pasillo)
   * \`MERMA_CADENA_FRIO\` (Falla de refrigeración en lácteos, charcutería o congelados)
   * \`ERROR_CARGA_SISTEMA\` (Ajuste por discrepancia documentada en recepción)
4. Redacta la justificación detallada (obligatoria) y guarda. La solicitud queda en estado \`PENDIENTE_AUTORIZACION\` y **aún NO descuenta el stock físico**.

**Fase 2 — Autorización o Rechazo Gerencial:**
Un usuario con rol **GERENTE** o **SUPERADMIN** revisa la pérdida en USD y Bolívares e introduce su **PIN confidencial de 4 a 6 dígitos**. Al autorizar, se descuenta el stock y se emite el Acta Oficial en PDF y Excel; si se rechaza, el stock permanece intacto.${pendingMsg}`,
      suggestedPrompts: [
        '¿Cómo dar de alta un nuevo producto (SKU)?',
        '¿Qué productos están en quiebre de stock?',
        '¿Cuál es la tasa oficial BCV hoy?',
      ],
    };
  }

  // 4B1. Rendimiento Cárnico — Desposte de POLLO (Aves)
  const isChickenYieldQuery =
    (q.includes('pollo') ||
      q.includes('pechuga') ||
      q.includes('alita') ||
      /\balas\b/.test(q) ||
      q.includes('muslo') ||
      q.includes('milanesa')) &&
    (q.includes('desposte') ||
      q.includes('desglose') ||
      q.includes('desglos') ||
      q.includes('rendimiento') ||
      q.includes('cárnic') ||
      q.includes('carnic') ||
      q.includes('merma') ||
      q.includes('canal') ||
      q.includes('corte') ||
      q.includes('calculadora') ||
      q.includes('beneficiado') ||
      q.includes('como desgloso') ||
      q.includes('cómo desgloso') ||
      q.includes('proyect') ||
      q.includes('compra'));

  if (isChickenYieldQuery) {
    return {
      answer: `Hola ${userName}. Con gusto te oriento en el desposte y rendimiento de **Pollo Beneficiado** en el módulo **"Operaciones > Rendimiento Cárnico"**:

**1. Desglose Anatómico y Transformación del Pollo:**
* **Ingreso de Lote de Pollo**: Se registra el peso neto del lote de aves en kg y el costo total de adquisición en USD.
* **Distribución de Cortes Específicos de Pollo**:
  * **Pechuga (Entera / Milanesas)**: Corte noble de mayor valor comercial relativo ($/kg), absorbe el mayor porcentaje del costo de adquisición.
  * **Muslos y Contramuslos**: Cuartos traseros de alta salida en piso de venta.
  * **Alas**: Se comercializan enteras o divididas en alitas y chupetas.
  * **Rabadilla / Carcasa**: Huesos carnosos para caldo o sopa a precio accesible.
  * **Menudencias**: Hígado, molleja y corazón.
* **Control de Mermas Técnicas de Pollo**: Sangría residual, oreo en cava fría, exceso de líquido de inmersión y recortes de grasa.

**2. Calculadora Proyectiva de Compra de Pollo:**
Permite ingresar los kilos de demanda esperada de milanesa de pechuga (ej. 60 kg) y el sistema proyecta automáticamente cuántos pollos beneficiados enteros deben solicitarse al proveedor para cubrir dicho requerimiento según el rendimiento porcentual de la pechuga.

**3. Trazabilidad y Roles:**
El usuario **Supervisor de Carnicería** (\`carniceria@hiperabastopolar.com\`) registra los pesajes de lote y despostes en báscula digital.`,
      suggestedPrompts: [
        '¿Cómo funciona el desglose de cerdo?',
        '¿Cómo funciona el desposte de res?',
        '¿Cómo funciona el módulo de Rendimiento Fruver?',
      ],
    };
  }

  // 4B2. Rendimiento Cárnico — Desglose de CERDO (Porcino)
  const isPorkYieldQuery =
    (q.includes('cerdo') ||
      q.includes('cochino') ||
      q.includes('pernil') ||
      q.includes('chuleta') ||
      q.includes('costillita') ||
      q.includes('tocino') ||
      q.includes('panceta')) &&
    (q.includes('desposte') ||
      q.includes('desglose') ||
      q.includes('desglos') ||
      q.includes('rendimiento') ||
      q.includes('cárnic') ||
      q.includes('carnic') ||
      q.includes('canal') ||
      q.includes('corte') ||
      q.includes('merma') ||
      q.includes('calculadora') ||
      q.includes('porcin') ||
      q.includes('como hago la carga') ||
      q.includes('cómo hago la carga') ||
      q.includes('proyect'));

  if (isPorkYieldQuery) {
    return {
      answer: `Hola ${userName}. Con gusto te oriento en el desglose y rendimiento de **Canal de Cerdo** en el módulo **"Operaciones > Rendimiento Cárnico"**:

**1. Desglose y Cortes Porcinos:**
* **Ingreso de Canal Porcina**: Se registra el peso bruto de la media canal o canal entera en kg y el costo total de compra en USD.
* **Distribución de Cortes Específicos de Cerdo**:
  * **Pernil (Pierna Trasera)** y **Paleta**: Piezas nobles de alto rendimiento y valor comercial.
  * **Lomo y Chuletas (de Aguja y de Lomo)**: Cortes nobles que absorben el valor comercial real del cerdo sin distorsionar márgenes.
  * **Costillitas**: Corte parrillero de alta demanda y valor relativo elevado.
  * **Tocino / Panceta / Chicharrón**: Aprovechamiento cárnico y graso de valor intermedio.
  * **Papada, Cuero, Patas y Cabeza**: Subproductos salables para consumo tradicional.
* **Control de Mermas Técnicas**: Grasa/manteca, hueso blanco y aserrín de sierra.

**2. Calculadora Proyectiva de Compra:**
Permite ingresar los kilos de demanda esperada de chuletas o pernil y el sistema calcula la cantidad exacta de cerdos enteros que deben solicitarse al proveedor.

**3. Trazabilidad y Roles:**
El usuario **Supervisor de Carnicería** (\`carniceria@hiperabastopolar.com\`) registra pesajes y despostes con doble firma para bajas con PIN de Gerencia.`,
      suggestedPrompts: [
        '¿Cómo desgloso el pollo?',
        '¿Cómo funciona el desposte de res?',
        '¿Cómo funciona el módulo de Rendimiento Fruver?',
      ],
    };
  }

  // 4B3. Rendimiento Cárnico — Desposte de RES (Bovino)
  const isBeefYieldQuery =
    (/\bres\b/.test(q) ||
      q.includes('canal de res') ||
      q.includes('carne de res') ||
      q.includes('solomo') ||
      q.includes('lomito') ||
      q.includes('chocozuela') ||
      q.includes('pulpa negra') ||
      q.includes('costilla') ||
      q.includes('lagarto') ||
      q.includes('vacuno') ||
      q.includes('bovino')) &&
    (q.includes('desposte') ||
      q.includes('desglose') ||
      q.includes('desglos') ||
      q.includes('rendimiento') ||
      q.includes('cárnic') ||
      q.includes('carnic') ||
      q.includes('canal') ||
      q.includes('corte') ||
      q.includes('bovin') ||
      q.includes('como desgloso') ||
      q.includes('cómo desgloso') ||
      q.includes('transformaci') ||
      q.includes('calculadora') ||
      q.includes('proyect'));

  if (isBeefYieldQuery) {
    return {
      answer: `Hola ${userName}. Con gusto te oriento en el desposte de canal bovina (**Res**) en el módulo **"Operaciones > Rendimiento Cárnico"**:

**1. Desglose y Transformación Matemática Exacta:**
* **Ingreso de Canal**: Se registra el peso bruto de la canal en kg y el costo total de adquisición en USD.
* **Distribución de Cortes Nobles y Secundarios**: Solomo de Cuerito, Lomito, Chocozuela, Pulpa Negra, Costilla, Lagarto, Pecho y Falda, ponderados por rendimiento y **valor comercial relativo ($/kg)**.
* **Alineación de Costos**: El costo total de la canal se distribuye proporcionalmente entre los cortes salables según su precio de mercado, garantizando que los cortes nobles absorban su valor real sin distorsionar el margen.
* **Control de Mermas Técnicas**: Se pesan y registran con precisión: \`Hueso Blanco/Rojo\`, \`Grasa/Sebo\`, \`Aserrín de Sierra\` y \`Evaporación/Oreo en Cava\`.

**2. Calculadora Proyectiva de Compra:**
Permite ingresar los kilos de demanda esperada de cortes premium (ej. 150 kg de Solomo) y el sistema proyecta automáticamente cuántas canales de res completas deben solicitarse al proveedor.

**3. Trazabilidad y Roles:**
El usuario **Supervisor de Carnicería** (\`carniceria@hiperabastopolar.com\`) puede registrar pesajes y despostes. Cualquier baja pasa a la bandeja para autorización gerencial con PIN.`,
      suggestedPrompts: [
        '¿Cómo desgloso el pollo?',
        '¿Cómo funciona el desglose de cerdo?',
        '¿Cómo funciona el módulo de Rendimiento Fruver?',
      ],
    };
  }

  // 4B4. Rendimiento Cárnico General (Multi-especie)
  if (
    q.includes('carnic') ||
    q.includes('cárnic') ||
    q.includes('desposte') ||
    q.includes('canal')
  ) {
    return {
      answer: `Hola ${userName}. El módulo **"Operaciones > Rendimiento Cárnico"** gestiona la transformación matemática exacta de las 3 especies cárnicas principales de **Chrystal® ERP**: **Res, Cerdo y Pollo**:

1. **Ingreso y Pesaje de Canal**: Registro de peso bruto (kg) y costo total de adquisición (USD) con protección cambiaria.
2. **Desglose Específico por Especie**:
   * **Pollo**: Pechuga (milanesa), muslos, alas, carcasa y menudencias.
   * **Cerdo**: Pernil, paleta, lomo, chuletas, costillitas y tocino.
   * **Res**: Solomo de cuerito, lomito, chocozuela, costilla y lagarto.
3. **Absorción de Costo y Mermas Técnicas**: Pesaje de \`Hueso Blanco/Rojo\`, grasa/sebo, aserrín de sierra y evaporación en cava.
4. **Calculadora Proyectiva**: Cálculo automático de canales o aves necesarias según requerimiento de cortes nobles.`,
      suggestedPrompts: [
        '¿Cómo desgloso el pollo?',
        '¿Cómo funciona el desglose de cerdo?',
        '¿Cómo funciona el desposte de res?',
      ],
    };
  }

  // 4C. Rendimiento Fruver (Frutas y Verduras) y Mermas Agrícolas
  if (
    q.includes('fruver') ||
    q.includes('fruta') ||
    q.includes('verdura') ||
    q.includes('hortaliz') ||
    q.includes('agricola') ||
    q.includes('agrícola') ||
    q.includes('deshidratac')
  ) {
    return {
      answer: `Hola ${userName}. El módulo **"Operaciones > Rendimiento Fruver"** audita la recepción y rendimiento de lotes agrícolas (frutas, verduras y hortalizas) y clasifica sus pérdidas bajo **5 Causas Específicas**:

**1. Las 5 Causas Oficiales de Merma Fruver:**
1. \`DESHIDRATACION_PERDIDA_PESO\`: Pérdida natural de humedad por tiempo en exhibición o cava seca.
2. \`DANO_EXCESO_FRIO\`: Quemadura por frío o congelamiento indebido en cámara.
3. \`DANO_EXCESO_CALOR\`: Fermentación y sobre-maduración por temperatura ambiente elevada o corte de energía.
4. \`DANO_MECANICO_MANIPULACION\`: Magulladuras, golpes en estiba, caídas de cajas o manipulación brusca.
5. \`EXCESO_DIAS_EXPOSICION_ROTACION\`: Senescencia y pérdida de lozanía comercial por baja rotación.

**2. Fórmula de Absorción de Costo en PVP:**
Para proteger el margen de ganancia de la empresa, el costo de los kilos mermados se absorbe directamente en los kilos netos vendibles:
\`Costo Unitario Efectivo = Costo Total del Lote / Kilos Netos Vendibles\`
Así, el PVP (precio de venta al público en anaquel con margen de ganancia e impuestos incluidos) se calcula sobre el costo absorbido real, evitando pérdidas financieras invisibles.

**3. Trazabilidad y Roles:**
El **Supervisor de Fruver** (\`fruver@hiperabastopolar.com\`) registra los lotes y pesajes de merma en báscula.`,
      suggestedPrompts: [
        '¿Cómo desgloso el pollo?',
        '¿Cómo funciona el desglose de cerdo?',
        '¿Cuál es el producto con mayor rotación?',
      ],
    };
  }

  // 4D. Rotación de Productos / Más Vendidos / Demanda
  if (
    q.includes('rotacion') ||
    q.includes('rotación') ||
    q.includes('mas vendido') ||
    q.includes('más vendido') ||
    q.includes('mayor venta') ||
    q.includes('mayor rotacion') ||
    q.includes('mayor rotación') ||
    q.includes('demanda') ||
    q.includes('top venta')
  ) {
    const topList = liveContext.topRotationSkus || [];
    if (topList.length > 0) {
      const topItems = topList
        .slice(0, 5)
        .map(
          (item, idx) =>
            `${idx + 1}. **${item.sku}** — ${item.name}: **${(item.monthlyUnitsSold || 0).toLocaleString('es-VE')} unidades vendidas** (Clase ${item.abcClass || 'A'})`
        )
        .join('\n');

      return {
        answer: `Hola ${userName}. Te comparto el ranking de **Productos con Mayor Rotación** en vivo (determinado por volumen histórico de ventas y salida de anaquel):

${topItems}

Estos productos forman parte de los artículos de alta rotación (Clase A en el análisis de Pareto 80/20). Requieren supervisión continua de su **punto de reorden** para prevenir quiebres de inventario.`,
        suggestedPrompts: [
          '¿Qué productos están en quiebre de stock?',
          '¿Cuál es la valorización total del inventario?',
          '¿Cómo solicito una baja de inventario?',
        ],
      };
    }

    return {
      answer: `Hola ${userName}. Actualmente los productos con mayor rotación corresponden a las categorías de **Canasta Básica y Alimentos de Consumo Masivo** (Harina PAN, Arroz, Pasta, Aceite vegetal y Azúcar refinada), los cuales representan más del 70% del flujo diario de unidades en piso de venta.

Para consultar el análisis detallado de rotación por volumen y facturación acumulada, ingresa en **"Inteligencia y Gobierno > Análisis Pareto ABC"** en el menú lateral.`,
        suggestedPrompts: [
          '¿Qué productos están en quiebre de stock?',
          '¿Cómo solicito una baja de inventario?',
          '¿Cuál es la tasa oficial BCV hoy?',
        ],
      };
  }

  // 4E. Roles y Credenciales de Supervisores (Carnicería, Fruver, Pasillo)
  if (
    q.includes('supervisor') ||
    q.includes('carniceria@') ||
    q.includes('fruver@') ||
    q.includes('pasillo@') ||
    q.includes('credencial') ||
    q.includes('cuentas supervisor')
  ) {
    return {
      answer: `Hola ${userName}. Cuentas y roles de **Supervisión Operativa** configurados en **Chrystal® ERP**:

1. **Supervisor de Carnicería**:
   * Usuario: \`carniceria@hiperabastopolar.com\`
   * Módulo: **Operaciones > Rendimiento Cárnico** (desposte de res, cerdo y pollo, pesajes de canal y mermas de hueso/grasa).
2. **Supervisor de Fruver**:
   * Usuario: \`fruver@hiperabastopolar.com\`
   * Módulo: **Operaciones > Rendimiento Fruver** (registro de lotes de frutas/verduras, auditoría de las 5 causas de merma y absorción de costos).
3. **Supervisor de Pasillo**:
   * Usuario: \`pasillo@hiperabastopolar.com\`
   * Módulo: **Inventario y Pasillos** (detección de roturas en góndola, vencimientos y pre-solicitudes de descargas).

*Nota de Seguridad*: Los supervisores tienen nivel de **Analista Operativo** para registrar entradas, mediciones y proponer bajas de mercancía. Cualquier desincorporación definitiva requiere la **doble firma con PIN** de un Gerente o Superadmin.`,
      suggestedPrompts: [
        '¿Cómo desgloso el pollo?',
        '¿Cómo funciona el desglose de cerdo?',
        '¿Cómo funciona el módulo de Rendimiento Fruver?',
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
    q.includes('precio de venta') ||
    q.includes('sku')
  ) {
    return {
      answer: `Hola ${userName}. Procedimiento para registrar un producto en el **Catálogo Maestro SKU** (código único que identifica a cada producto para no confundir marcas ni presentaciones):

1. Abre **"Inventario > Catálogo Maestro SKU"** y pulsa **"+ Nuevo Producto"**.
2. Completa los datos de identificación:
   * **SKU**: Código alfanumérico único (ej. \`HAP-HAR-001\`).
   * **Código de Barras**: EAN-13 del empaque.
   * **Nombre Comercial, Categoría y Unidad**: (\`UND\`, \`KG\`, \`LT\`, \`CAJA\`, \`BULTO\`).
3. Define la estructura financiera para el cálculo del PVP (precio de venta al público en anaquel con margen de ganancia e impuestos incluidos):
   * Ingresa el **Costo Unitario en USD** y el **Margen de Ganancia Objetivo (%)**.
   * El sistema aplica la fórmula financiera exacta: \`PVP = Costo / (1 - Margen / 100)\`.
   * Selecciona la **Alícuota SENIAT**: Exento (0% para canasta básica), Reducido (8%) o General (16%).
4. Asigna la existencia inicial y el punto de reorden (la cantidad mínima de paquetes que debe quedar en el depósito antes de tener que pedirle más al proveedor) por sede, y pulsa **"Guardar Producto"**.`,
      suggestedPrompts: [
        '¿Cómo solicito una baja de inventario?',
        '¿Cuál es la tasa oficial BCV hoy?',
        '¿Qué productos están en quiebre de stock?',
      ],
    };
  }

  // 6. Validación Visual Split-Screen OCR y Pre-Asiento de Facturas
  if (
    q.includes('split') ||
    q.includes('pre-asiento') ||
    q.includes('asentar factura') ||
    q.includes('aprobar factura') ||
    q.includes('rechazar comprobante') ||
    (q.includes('factura') && (q.includes('visor') || q.includes('pantalla dividida') || q.includes('aprobar')))
  ) {
    return {
      answer: `Hola ${userName}. La validación visual **Split-Screen OCR** en **"Facturas & OCR"** te permite contrastar la factura original contra los datos leídos por la IA antes de asentar en inventario y libro mayor:

**Guía Paso a Paso:**
1. Dirígete a **"Facturas & OCR"** en el menú lateral.
2. Pulsa el botón **"Cargar Factura / Comprobante"** y selecciona la imagen o PDF del proveedor.
3. El sistema activa la vista Split-Screen:
   * En computadoras de escritorio: Pantalla dividida 50% al documento original escaneado y 50% a los campos extraídos.
   * En teléfonos móviles o tablets (<768px): Conmuta ágilmente entre las pestañas táctiles **"📄 Ver Documento Original"** (con zoom y paneo) y **"✍️ Datos Extraídos"** con el botón flotante inferior.
4. Audita visualmente RIF, N° de Factura, N° de Control, Base Imponible, Exento, IVA (16%) y el dictamen de veracidad forense.
5. Si los datos son correctos, haz clic en el botón verde **"Aprobar y Asentar Factura"** para ingresar la mercancía al inventario y generar la cuenta por pagar en Libro Mayor.
6. Si detectas anomalías o datos adulterados, pulsa el botón rojo **"Rechazar Comprobante"**, especifica el motivo y la operación se cancelará sin afectar el sistema.`,
      suggestedPrompts: [
        '¿Cómo se registran los gastos operativos (OPEX)?',
        '¿Cómo vincular WhatsApp en el portal BRM?',
        '¿Cómo importar ventas diarias de Chrystal POS?',
      ],
    };
  }

  // 7. Auditoría Forense OCR de Pagos
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
      answer: `Hola ${userName}. El módulo **"Finanzas > Auditoría Forense OCR"** valida comprobantes de Pago Móvil, transferencias, Zelle y facturas aplicando **4 Candados Forenses**:

1. **Candado 1 — Huella Criptográfica SHA-256**: Firma digital única de los bytes del archivo que detecta si exactamente el mismo archivo ya fue subido antes.
2. **Candado 2 — Hash Perceptual (pHash)**: Huella visual que detecta si un comprobante antiguo fue reenviado con otro nombre o recorte leve.
3. **Candado 3 — Auditoría de Metadatos EXIF/JFIF**: Identifica rastros de edición con software de diseño (Photoshop, Canva, editores online).
4. **Candado 4 — Peritaje IA y Dictamen de Veracidad**: Extrae banco, referencia, fecha y monto, clasificando en:
   * **AUTÉNTICO (90 - 100 pts)**: Apto para pre-conciliación.
   * **SOSPECHOSO (60 - 89 pts)**: Requiere revisión manual contra estado de cuenta bancario.
   * **ALERTA FRAUDE (0 - 59 pts)**: Rechazo inmediato por alteración digital.`,
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
      answer: `Hola ${userName}. Red operativa activa de **${COMPANY_IDENTITY.razonSocial}** (**${locs.length} sedes/depósitos**):

${locText}

Cada sede controla de forma independiente sus existencias por SKU (código único que identifica a cada producto para no confundir marcas ni presentaciones) y su punto de reorden (la cantidad mínima de paquetes que debe quedar en el depósito antes de tener que pedirle más al proveedor).`,
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
      answer: `Hola ${userName}. Valorización contable en vivo de **${COMPANY_IDENTITY.razonSocial}**:

* **Catálogo Activo**: ${m.totalSkus} SKUs (código único que identifica a cada producto para no confundir marcas ni presentaciones) en ${m.totalLocations} sedes.
* **Existencias Físicas Totales**: ${m.totalUnitsAll.toLocaleString('es-VE')} unidades.
* **Valorización a Costo (USD)**: $${m.totalValuationCostUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD
* **Valorización a PVP (USD)**: $${m.totalValuationRetailUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD — PVP (precio de venta al público en anaquel con margen de ganancia e impuestos incluidos).
* **Valorización a PVP (Bolívares)**: Bs. ${m.totalValuationRetailVes.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} VES (a tasa BCV de ${liveContext.bcvState.activeRate.toFixed(4)}).
* **Margen Bruto Ponderado**: ${m.weightedGrossMarginPercent.toFixed(2)}%`,
      suggestedPrompts: [
        '¿Cuál es la tasa oficial BCV hoy?',
        '¿Qué productos están en quiebre de stock?',
        '¿Cómo solicito una baja de inventario?',
      ],
    };
  }

  // 9. Control de Gastos Operativos (OPEX), Aprobación Gerencial y Resguardo Drive
  if (
    q.includes('gasto') ||
    q.includes('opex') ||
    q.includes('arqueo') ||
    q.includes('presupuesto') ||
    q.includes('google drive') ||
    q.includes('drive')
  ) {
    return {
      answer: `Hola ${userName}. El módulo de **"Control de Gastos (OPEX)"** gestiona los egresos operativos de la empresa con aprobación gerencial, alertas presupuestarias y resguardo estructurado en Google Drive:

**Guía Paso a Paso para Registrar y Liquidar un Gasto:**
1. Ingresa a **"Control de Gastos"** en el menú lateral principal.
2. En la sub-pestaña **"Registro y Carga de Gasto"**, pulsa el botón **"Subir Factura o Ticket Escaneado"** (admite JPG, PNG y PDF). El lector OCR prellenará automáticamente N° de Factura, N° de Control, Monto y Datos del Beneficiario.
3. Selecciona la **"Categoría del Gasto"** (Oficina y Papelería, Equipos de Mantenimiento, Materiales de Construcción, Climatización A/C, Servidores y Cómputo, Servicio Técnico, Servicios Públicos, Fletes y Envíos, Asesoría Legal y Fiscal).
4. Elige la **"Condición de Pago"** (*Contado* o *Crédito*). Si es a crédito, define los días de crédito y si aplican descuentos por pronto pago o recargos por mora.
5. Si el importe supera los **$100 USD**, requiere **doble firma** (medida de seguridad donde una persona solicita la operación y un gerente la aprueba con su clave confidencial). Si no posees PIN gerencial, pulsa **"+ Registrar Gasto"** y el registro irá a la sub-pestaña **"Bandeja de Aprobación (> $100 USD)"** para ser avalado con el botón **"Firmar y Aprobar Gasto"**.
6. Al registrarse, se abrirá la ventana de asistencia de Google Drive: pulsa **"Copiar Ruta Sugerida"**, guarda el archivo en la estructura \`PROVEEDOR/AÑO-MES\` y haz clic en **"Marcar Resguardo Realizado"**.
7. Para registrar el desembolso en tesorería, ve a la sub-pestaña **"Libro Mayor de Gastos"**, busca el gasto y pulsa **"Registrar Pago"**.
8. A fin de mes, entra en la sub-pestaña **"Arqueo Mensual"** (revisión y cuadre detallado de facturas pagadas) y pulsa **"Descargar Arqueo PDF"** o **"Descargar Libro Excel (.xlsx)"** para obtener el reporte con análisis de Pareto y microgastos hormiga.`,
      suggestedPrompts: [
        '¿Cómo funciona la validación visual Split-Screen OCR?',
        '¿Cuál es la tasa oficial BCV hoy?',
        '¿Cómo se proyecta el flujo de caja bimonetario?',
      ],
    };
  }

  // 11. Ingesta Aislada de Ventas Diarias de Chrystal® POS (Excel/CSV)
  if (
    q.includes('chrystal') ||
    q.includes('pos') ||
    q.includes('ingesta') ||
    q.includes('cierre z') ||
    q.includes('importar ventas') ||
    q.includes('archivo de ventas')
  ) {
    return {
      answer: `Hola ${userName}. La **Ingesta Aislada de Ventas Diarias de Chrystal® POS** permite sincronizar las ventas de las cajas registradoras sin necesidad de cables ni conexiones API internas:

**Guía Paso a Paso:**
1. Exporta el reporte diario de ventas o cierre Z (reporte final diario de dinero vendido) desde las cajas registradoras de Chrystal en formato Excel (.xlsx, .xls) o CSV.
2. Entra al módulo **"Importación Chrystal POS"** en el menú lateral del ERP.
3. Pulsa el botón **"Seleccionar Archivo de Ventas Chrystal"** o arrastra el archivo exportado a la zona de carga.
4. El sistema auto-detecta la estructura del archivo y mapea los códigos de barra o SKUs (código único que identifica a cada producto para no confundir marcas ni presentaciones).
5. Pulsa el botón **"Simular y Validar Conciliación"** para previsualizar el volumen de unidades vendidas, el monto total en USD/VES y revisar la lista de "Ítems no encontrados" (si algún código nuevo no ha sido creado en el catálogo maestro).
6. Pulsa el botón azul **"Ejecutar Descarga en Inventario"**. El sistema rebajará automáticamente las existencias físicas de los productos válidos en la sede seleccionada sin interrumpir el proceso por los ítems no registrados.`,
      suggestedPrompts: [
        '¿Cómo registrar un nuevo SKU en el catálogo?',
        '¿Cómo funciona el flujo de caja bimonetario proyectado?',
        '¿Qué productos están en quiebre de stock?',
      ],
    };
  }

  // 12. Pasarela WhatsApp BRM Multi-Dispositivo (Baileys WebSocket, QR ISO, Audio y Plantillas)
  if (
    q.includes('whatsapp') ||
    q.includes('brm') ||
    q.includes('baileys') ||
    q.includes('vincular whatsapp') ||
    q.includes('desvincular') ||
    q.includes('plantilla') ||
    q.includes('nota de voz') ||
    q.includes('audio') ||
    q.includes('eliminar chat') ||
    q.includes('guardar como proveedor') ||
    (q.includes('qr') && (q.includes('celular') || q.includes('telefono') || q.includes('teléfono') || q.includes('linea') || q.includes('línea') || q.includes('proveedor')))
  ) {
    return {
      answer: `Hola ${userName}. El centro de mensajería **"Pasarela WhatsApp BRM"** (sección **"Proveedores & BRM"** en el menú lateral o \`/whatsapp-brm\`) sincroniza la plataforma con el WhatsApp de tu smartphone mediante WebSocket y motor Baileys:

**Guía Paso a Paso para Enlazar WhatsApp y Enviar Documentos:**
1. Ingresa a **"Pasarela WhatsApp BRM"** (o **"Proveedores & BRM"**) en el menú lateral.
2. **Vincular Dispositivo**: Si la línea está desconectada, haz clic en el botón **"Vincular WhatsApp"** (o **"Vincular WhatsApp BRM"**). Se generará el Código QR dinámico auténtico (ISO/IEC 18004). En tu smartphone, entra a *WhatsApp > Dispositivos vinculados > Vincular un dispositivo* y escanea el código en pantalla antes de que venza el temporizador de 60 segundos.
3. **Conexión Activa y Streaming**: Al emparejar, el estado cambia a **"Línea Conectada"** con indicador verde. Los mensajes entrantes y salientes se transmiten bidireccionalmente en tiempo real mediante SSE y WebSocket con deduplicación estricta por \`message_id\`.
4. **Histórico y Notas de Voz**: Selecciona cualquier contacto en la lista izquierda con scroll infinito. Si el mensaje incluye un audio (.ogg/.mp3), haz clic en el botón de reproducción del **Reproductor de Audio HTML5 Integrado** con barra de avance y control de volumen.
5. **Guardar Contacto en ERP**: Si el remitente proviene de la libreta del smartphone pero aún no está en la base de datos, pulsa el botón **"+ Guardar como Proveedor"** en la cabecera superior del chat para registrarlo inmediatamente.
6. **Plantillas Personalizadas y Envío Confiable**: En la barra inferior, navega horizontalmente por el carrusel de plantillas rápidas (Pago Procesado, Retención SENIAT, etc.) o pulsa el icono de engranaje / **"+ Nueva Plantilla"** para crear, editar o eliminar plantillas dinámicas con variables como {{proveedor}}, {{monto}} y {{referencia}}. Para retenciones o pedidos, pulsa **"Exportar a BRM WhatsApp"** y confirma el envío pulsando conscientemente el botón verde **"Confirmar y Enviar Comprobante por WhatsApp"** (candado anti-despacho involuntario).
7. **Eliminar Chat Definitivo**: En la cabecera del chat activo, pulsa el botón rojo **"Eliminar Chat"** y confirma en el diálogo; el historial se purga permanentemente del servidor sin afectar los chats del smartphone.
8. **Desvinculación Atómica**: Para desconectar la línea, pulsa **"Desvincular Línea"** y confirma. El socket se cierra de forma segura (\`safeDestroyBaileysSocket\`), se purgan las credenciales y la pantalla conmuta de inmediato a la pantalla de inactividad sin mostrar números ni conversaciones.`,
      suggestedPrompts: [
        '¿Cómo emito un comprobante de retención SENIAT?',
        '¿Cómo funciona la conciliación bancaria bimonetaria?',
        '¿Cómo funciona el control de gastos OPEX?',
      ],
    };
  }

  // 13. Retenciones Fiscales SENIAT (IVA 75%/100% e ISLR)
  if (
    !q.includes('impresora') &&
    !q.includes('libro de ventas') &&
    (q.includes('retencion') ||
      q.includes('retención') ||
      q.includes('seniat') ||
      q.includes('txt') ||
      q.includes('islr'))
  ) {
    return {
      answer: `Hola ${userName}. La gestión de **Retenciones Fiscales SENIAT** calcula y emite los comprobantes oficiales de IVA (75% o 100%) e ISLR con correlativo fiscal y formato TXT:

**Guía Paso a Paso:**
1. Ingresa a **"Retenciones SENIAT"** en el menú lateral.
2. En la tabla de facturas pendientes de retención, selecciona la factura de compra emitida por el proveedor.
3. Elige el porcentaje de retención de IVA:
   * **75%**: Alícuota estándar para Contribuyentes Especiales.
   * **100%**: Compras a proveedores sin RIF actualizado, operaciones sin factura electrónica o adquisiciones a personas naturales.
4. El sistema calculará la retención de ISLR correspondiente según la actividad económica (servicios, fletes, comisiones).
5. Haz clic en el botón **"Generar Comprobante de Retención"**.
6. Para archivo fiscal y entrega:
   * Pulsa **"Descargar PDF Oficial"** para imprimir o archivar.
   * Pulsa **"Generar TXT SENIAT"** para descargar el archivo estructurado para el portal fiscal del SENIAT.
   * Pulsa **"Enviar a BRM WhatsApp"** para transferir el comprobante al chat del proveedor con confirmación manual de envío.`,
      suggestedPrompts: [
        '¿Cómo vincular WhatsApp en el portal BRM?',
        '¿Cuál es la tasa oficial BCV hoy?',
        '¿Cómo se proyecta el flujo de caja bimonetario?',
      ],
    };
  }

  // 14. Cadena de Frío, Lotes y FEFO / SADA
  if (
    q.includes('fefo') ||
    q.includes('cadena de frio') ||
    q.includes('cadena de frío') ||
    q.includes('cava') ||
    q.includes('lote') ||
    q.includes('sada') ||
    q.includes('perecedero')
  ) {
    return {
      answer: `Hola ${userName}. El módulo **"Lotes & Cadena de Frío"** controla la vida útil de los perecederos bajo protocolo **FEFO** (First Expired, First Out — primero en vencer, primero en salir) y supervisa las temperaturas frigoríficas:

**Guía Paso a Paso:**
1. Ingresa a **"Lotes & Cadena de Frío"** en el menú lateral.
2. Al recibir mercancía cárnica, láctea o congelada, pulsa **"+ Registrar Nuevo Lote"**.
3. Ingresa el N° de Lote del fabricante, la Fecha de Vencimiento y registra la temperatura de recepción en el termógrafo del transporte.
4. Asigna la ubicación de almacenamiento:
   * **Cava de Congelación**: Entre -18°C y -22°C (carnes, pollo, mariscos, pulpas congeladas).
   * **Cava de Conservación**: Entre 0°C y 4°C (lácteos, charcutería, embutidos).
5. El semáforo FEFO clasificará el lote:
   * 🔴 **Rojo**: Menos de 30 días de vida útil (prioridad máxima de despacho y venta).
   * 🟡 **Amarillo**: Entre 31 y 60 días de vida útil.
   * 🟢 **Verde**: Más de 60 días de vida útil.
6. Si se trata de un rubro regulado por Sunagro, ingresa el número de control en el campo **"N° Guía SADA"** (ej. \`SADA-049821\`) y pulsa **"Vincular Guía Oficial"**.`,
      suggestedPrompts: [
        '¿Cómo funciona el rendimiento cárnico de desposte?',
        '¿Cómo solicito una baja de inventario por vencimiento?',
        '¿Qué productos están en quiebre de stock?',
      ],
    };
  }

  // 15. Recetas de Producción / BOM / Panadería
  const isProductionBomQuery =
    q.includes('bom') ||
    q.includes('orden de produccion') ||
    q.includes('orden de producción') ||
    q.includes('lista de materiales') ||
    q.includes('pan canilla') ||
    ((q.includes('receta') ||
      q.includes('formula') ||
      q.includes('fórmula') ||
      q.includes('produccion') ||
      q.includes('producción') ||
      q.includes('panader')) &&
      (q.includes('modulo') ||
        q.includes('módulo') ||
        q.includes('erp') ||
        q.includes('costo') ||
        q.includes('insumo') ||
        q.includes('tanda') ||
        q.includes('materia prima') ||
        q.includes('elaboracion') ||
        q.includes('elaboración') ||
        q.includes('descontar') ||
        q.includes('nueva receta') ||
        q.includes('cómo funciona') ||
        q.includes('como funciona') ||
        q.includes('industrial') ||
        q.includes('planta')));

  if (isProductionBomQuery) {
    return {
      answer: `Hola ${userName}. El módulo **"Recetas y Producción"** gestiona la manufactura interna de panadería, pastelería y charcutería mediante listas de materiales (**BOM**):

**Guía Paso a Paso:**
1. Ingresa a **"Recetas y Producción"** en el menú lateral.
2. Para diseñar una nueva fórmula, pulsa **"+ Nueva Receta / BOM"**.
3. Selecciona el producto final (ej. Pan Canilla, Torta de Vainilla, Jamón Horneado) e indica el rendimiento de la tanda (unidades o Kg obtenidos).
4. Agrega los insumos en la **"Lista de Materiales e Insumos"** (harina de trigo, levadura, manteca, azúcar, sal) con la cantidad exacta requerida. El sistema calcula en vivo el costo unitario de elaboración.
5. Para producir en planta, haz clic en **"Ejecutar Orden de Producción"**, define cuántas tandas se procesaron y pulsa el botón **"Procesar y Descontar Insumos"**.
6. El sistema descontará automáticamente los insumos utilizados del almacén de materias primas y sumará las unidades de producto terminado al catálogo disponible para venta.`,
      suggestedPrompts: [
        '¿Cómo dar de alta un nuevo producto en el catálogo?',
        '¿Cuál es la tasa oficial BCV hoy?',
        '¿Cómo registrar un gasto en control de gastos?',
      ],
    };
  }

  // 16. Flujo de Caja Proyectado Bimonetario
  if (
    q.includes('flujo de caja') ||
    q.includes('cash flow') ||
    q.includes('proyeccion') ||
    q.includes('proyección') ||
    q.includes('liquidez') ||
    q.includes('cuentas por pagar')
  ) {
    return {
      answer: `Hola ${userName}. El panel **"Flujo de Caja Bimonetario Proyectado"** en el **Dashboard Principal** permite planificar la tesorería bajo un criterio conservador estricto:

**Estructura y Modo de Operación:**
1. Ingresa a **"Dashboard Principal"** en el menú lateral.
2. Localiza la sección ejecutiva **"Flujo de Caja Bimonetario Proyectado"**.
3. Utiliza el selector superior para alternar entre **Dólares ($ USD)** y **Bolívares (Bs. VES)** a la tasa oficial BCV.
4. Revisa los cuatro horizontes de proyección:
   * **Hoy (Inmediato)**: Saldo disponible bancario menos compromisos vencidos hoy.
   * **Próximos 7 Días**: Compromisos exigibles a corto plazo con proveedores.
   * **Próximos 15 Días (Quincena SENIAT)**: Provisiones fiscales de retenciones quincenales y facturas programadas.
   * **Próximos 30 Días**: Cierre mensual de obligaciones.
5. El panel contrasta la liquidez disponible real en bancos frente a las cuentas por pagar registradas, alertando en amarillo o rojo si el saldo neto proyectado entra en déficit.`,
      suggestedPrompts: [
        '¿Cuál es la valorización total del inventario?',
        '¿Cómo registrar un gasto operativo en OPEX?',
        '¿Cuál es la tasa oficial BCV hoy?',
      ],
    };
  }

  // 17. Gobernanza de Sesiones (60 Minutos & Multi-Pestaña)
  if (
    q.includes('inactividad') ||
    q.includes('60 minuto') ||
    q.includes('58 minuto') ||
    q.includes('tiempo de espera') ||
    q.includes('pestaña') ||
    q.includes('tabs') ||
    ((q.includes('sesion') || q.includes('sesión')) &&
      (q.includes('gobernanza') || q.includes('cerrar') || q.includes('tiempo') || q.includes('aviso') || q.includes('inactiva')))
  ) {
    return {
      answer: `Hola ${userName}. La política de **Gobernanza de Sesiones** de **Chrystal® ERP** protege el acceso al sistema frente a estaciones de trabajo desatendidas:

**Protocolo de Seguridad y Funcionamiento:**
1. **Detección de Inactividad Física**: El sistema evalúa continuamente eventos del operador (teclado, ratón, pantallas táctiles y scroll).
2. **Alerta Preventiva a los 58 Minutos**: Si transcurren 58 minutos sin actividad, se despliega el modal **"¿Sigues en tu estación de trabajo?"** con una cuenta regresiva de 120 segundos.
   * Para seguir conectado: Pulsa el botón **"Mantener Sesión Activa"** (o presiona cualquier tecla), lo cual restablece el temporizador.
   * Para salir inmediatamente: Pulsa **"Cerrar Ahora"**.
3. **Cierre Forzado a los 60 Minutos**: Si se agota la cuenta regresiva, el sistema cierra la sesión forzosamente, redirige al Login y muestra el aviso de seguridad institucional.
4. **Protección de Borradores**: Si estabas cargando un formulario de gasto o arqueo, el borrador se preserva en \`sessionStorage\` y se restablece al iniciar sesión nuevamente.
5. **Sesión Única Multi-Pestaña**: Gracias a la sincronización por \`BroadcastChannel\`, si cierras sesión o cambias de usuario en una pestaña del navegador, todas las demás pestañas abiertas se actualizan en el mismo instante.`,
      suggestedPrompts: [
        '¿Cómo solicitar una baja de inventario con doble firma?',
        '¿Cómo funciona el control de gastos OPEX?',
        '¿Cuál es la tasa oficial BCV hoy?',
      ],
    };
  }

  // 18. Documentos PDF / Excel / Branding
  if (
    !q.includes('impresora') &&
    !q.includes('reporte z') &&
    !q.includes('reporte x') &&
    !q.includes('fiscal') &&
    (q.includes('pdf') ||
      q.includes('excel') ||
      q.includes('informe') ||
      q.includes('reporte') ||
      q.includes('branding') ||
      q.includes('logo') ||
      q.includes('membrete'))
  ) {
    return {
      answer: `Hola ${userName}. Estándar documental y de gobernanza en **Chrystal® ERP**:

* **Excel OpenXML (.xlsx)**: Membrete fiscal de **${COMPANY_IDENTITY.razonSocial}** (RIF: ${COMPANY_IDENTITY.rif}, SADA: ${COMPANY_IDENTITY.sada}), bordes ejecutivos visibles y pestaña \`3_Fichas_Producto_Celda\` con fichas individuales delimitadas.
* **PDF Ejecutivo**: Cabecera con logo oficial de **${COMPANY_IDENTITY.brandingName}**, marca de agua central al 7% de opacidad en todas las páginas, análisis de liquidez de SKUs Clase A y pie de página legal (${COMPANY_IDENTITY.copyright}).
* **Gobernanza de Sesiones (60 min)**: Cierre forzado determinista tras 60 minutos de inactividad con modal de advertencia a los 58 minutos y sincronización multi-pestaña.`,
      suggestedPrompts: [
        '¿Cómo solicito una baja de inventario?',
        '¿Cuál es la valorización total del inventario?',
        '¿Cuál es la tasa oficial BCV hoy?',
      ],
    };
  }

  // 19. Conciliación Bancaria Bimonetaria (USD/VES) e IGTF 3%
  if (
    q.includes('conciliacion') ||
    q.includes('conciliación') ||
    q.includes('extracto') ||
    q.includes('igtf') ||
    (q.includes('banco') && (q.includes('cuadre') || q.includes('cuenta') || q.includes('movimiento') || q.includes('saldo')))
  ) {
    return {
      answer: `Hola ${userName}. El módulo **"Finanzas y Tesorería > Conciliación Bancaria"** contrasta los extractos bancarios oficiales contra las transacciones del sistema con exactitud decimal:

**Guía Paso a Paso:**
1. Ingresa a **"Finanzas y Tesorería > Conciliación Bancaria"** en el menú lateral.
2. Pulsa el botón **"Cargar Extracto Bancario"** y sube el archivo oficial (.xlsx, .csv o .txt) de Banesco, Banco de Venezuela, Mercantil, BNC, Bancamiga o banco internacional.
3. El sistema cruza automáticamente fecha, número de referencia bancaria y monto contra los pagos registrados y pre-validados por OCR con aritmética Decimal.js (ROUND_HALF_UP).
4. **Tratamiento del IGTF (3%)**: En los pagos a proveedores realizados en divisas en efectivo o transferencias del exterior, el sistema calcula y asienta automáticamente la retención del 3% de IGTF según providencia administrativa del SENIAT.
5. Al verificar que no existen partidas desconciliadas o diferencias de céntimos, pulsa **"Cerrar Conciliación del Período"** para emitir el acta PDF oficial firmada.`,
      suggestedPrompts: [
        '¿Cómo funciona la pasarela WhatsApp BRM?',
        '¿Cuál es la tasa oficial BCV hoy?',
        '¿Cómo se proyecta el flujo de caja bimonetario?',
      ],
    };
  }

  // 20. Control de Anaquel, Cuartos Fríos y Balanzas (Prefijos 20 y 21)
  if (
    q.includes('anaquel') ||
    q.includes('balanza') ||
    q.includes('balanzas') ||
    q.includes('etiqueta 20') ||
    q.includes('etiqueta 21') ||
    q.includes('prefijo 20') ||
    q.includes('prefijo 21') ||
    q.includes('cuarto frio') ||
    q.includes('cuartos frios') ||
    q.includes('cuarto frío') ||
    q.includes('cuartos fríos')
  ) {
    return {
      answer: `Hola ${userName}. El control de reposición de anaquel y la lectura de balanzas electrónicas en **Chrystal® ERP** garantizan precisión de inventario en mostrador y peso:

**Guía Paso a Paso:**
1. Ingresa a **"Inventario > Control de Anaquel y Reposición"**.
2. Contrasta el stock disponible en anaquel visible frente al stock de seguridad en cuartos fríos o almacén principal. Si el nivel cae por debajo del mínimo, pulsa **"Generar Orden de Reposición a Anaquel"**.
3. **Decodificación de Balanzas Electrónicas (Prefijos 20 y 21)**:
   * Al escanear productos de peso variable (charcutería, quesos, carnicería, verduras pesadas):
   * **Prefijo 20** (inicia con 20): Los dígitos intermedios representan el peso neto en gramos (ej. 20PPPPPQQQQQC donde PPPPP es SKU y QQQQQ es peso en gramos). El sistema descuenta directamente los kilos exactos.
   * **Prefijo 21** (inicia con 21): Los dígitos intermedios codifican el importe monetario total a pagar en Bolívares o Dólares.
   * No se requiere digitación manual de peso, eliminando mermas por error humano en cajas.`,
      suggestedPrompts: [
        '¿Cómo funciona el desposte de res?',
        '¿Cómo funciona el rendimiento de pollo?',
        '¿Cómo solicitar una baja de inventario?',
      ],
    };
  }

  // 21. Gobernanza de Seguridad y Tokens Dinámicos TOTP Offline (RFC 6238)
  if (
    q.includes('totp') ||
    q.includes('token dinamico') ||
    q.includes('token dinámico') ||
    q.includes('authenticator') ||
    q.includes('rfc 6238') ||
    q.includes('doble factor') ||
    q.includes('2fa')
  ) {
    return {
      answer: `Hola ${userName}. La gobernanza con **Token Dinámico TOTP Offline (RFC 6238)** proporciona autorización criptográfica segura sin depender de internet ni de SMS:

**Guía Paso a Paso:**
1. Ve a **"Mi Perfil > Seguridad > Configurar Token Dinámico TOTP"**.
2. Escanea el código QR criptográfico seguro con Google Authenticator, Microsoft Authenticator o FreeOTP.
3. La aplicación móvil generará un código de 6 dígitos que rota cada 30 segundos sincronizado con la hora UTC.
4. **Uso en Operaciones Críticas**: Al autorizar descargas de inventario por merma, eliminación definitiva de chats en WhatsApp BRM o cambios de configuración institucional, el sistema solicita ingresar el código de 6 dígitos.
5. El motor offline valida el código con una ventana de tolerancia de ±30 segundos verificando la firma HMAC-SHA1 aunque el teléfono o la sede no tengan conexión a internet.`,
      suggestedPrompts: [
        '¿Cómo funciona la pasarela WhatsApp BRM?',
        '¿Cómo solicito una baja de inventario con doble firma?',
        '¿Cómo opera la gobernanza de sesiones de 60 minutos?',
      ],
    };
  }

  // 22. Conector de Impresoras Fiscales SENIAT (Providencia SNAT/2024/000102)
  if (
    q.includes('impresora fiscal') ||
    q.includes('impresoras fiscales') ||
    q.includes('reporte x') ||
    q.includes('reporte z') ||
    q.includes('libro de ventas') ||
    q.includes('snat/2024/000102') ||
    (q.includes('fiscal') && (q.includes('impres') || q.includes('ticket')))
  ) {
    return {
      answer: `Hola ${userName}. El **Conector de Impresoras Fiscales SENIAT** cumple con la Providencia Administrativa SNAT/2024/000102 para cajas registradoras homologadas (BMC, Dascom, Bixolon, HKA):

**Guía Paso a Paso:**
1. Ingresa a **"Punto de Venta / Fiscal > Impresoras Fiscales SENIAT"**.
2. Conecta la caja registradora asignada a través del puerto serie COM, USB o Red Local.
3. **Facturación Fiscal**: Al cobrar una venta, el conector imprime la factura respetando las alícuotas Exento (0%), Reducido (8%), General (16%) y el recargo del 3% de IGTF en divisas.
4. **Corte Parcial de Turno (Reporte X)**: Al cambiar de cajero o cuadrar caja parcial, pulsa **"Generar Reporte X Fiscal"**.
5. **Cierre Diario Definitivo (Reporte Z)**: Al culminar el horario de la tienda, pulsa **"Emitir Reporte Z Fiscal"**. El monto total se graba de forma inalterable en la memoria fiscal del equipo.
6. **Libro de Ventas Oficial**: En la sección de libros fiscales, haz clic en **"Descargar Libro de Ventas SENIAT (.xlsx)"** para obtener el reporte contable oficial en Excel con todas las columnas exigidas por la ley.`,
      suggestedPrompts: [
        '¿Cómo emito un comprobante de retención SENIAT?',
        '¿Cómo conciliar el extracto bancario con el sistema?',
        '¿Cuál es la tasa oficial BCV hoy?',
      ],
    };
  }

  // 23. Comprobar si contiene términos operativos del ERP o si es fuera de alcance
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
    'desposte',
    'carnic',
    'cárnic',
    'fruver',
    'merma',
    'verdura',
    'fruta',
    'rotacion',
    'rotación',
    'res',
    'cerdo',
    'pollo',
    'supervisor',
    'corte',
    'canal',
    'agricola',
    'agrícola',
    'gasto',
    'opex',
    'arqueo',
    'presupuesto',
    'drive',
    'split',
    'pre-asiento',
    'chrystal',
    'pos',
    'whatsapp',
    'brm',
    'qr',
    'baileys',
    'audio',
    'plantilla',
    'extracto',
    'conciliacion',
    'conciliación',
    'igtf',
    'anaquel',
    'balanza',
    'balanzas',
    'totp',
    'token',
    'impresora',
    'fiscal',
    'retencion',
    'retención',
    'seniat',
    'txt',
    'islr',
    'fefo',
    'frio',
    'frío',
    'cava',
    'lote',
    'sada',
    'bom',
    'panader',
    'produccion',
    'producción',
    'flujo de caja',
    'arqueo de caja',
    'cierre de caja',
    'caja registradora',
    'caja chica',
    'liquidez',
    'sesion',
    'sesión',
    'inactividad',
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

  return {
    answer: `Hola ${userName}. Con gusto te oriento sobre tu consulta ("${query}"):

Puedes gestionar esta operación directamente en los módulos de **Chrystal® ERP**:
* **Inventario**: Catálogo Maestro de SKU (código único que identifica a cada producto para no confundir marcas ni presentaciones), existencias multi-sede y Kardex.
* **Operaciones**: Rendimiento Cárnico (desposte de res, cerdo y pollo con calculadora proyectiva de compra) y Rendimiento Fruver (clasificación de 5 causas de merma y absorción de costo en PVP).
* **Inteligencia y Gobierno**: Descargas & Bajas por merma con doble firma gerencial, Curva de Pareto ABC y Órdenes de Reabastecimiento según punto de reorden.
* **Finanzas**: Facturación, cuentas por pagar y Auditoría Forense OCR.`,
    suggestedPrompts: [
      '¿Cómo solicito una baja de inventario?',
      '¿Qué productos están en quiebre de stock?',
      '¿Cuál es la tasa oficial BCV hoy?',
    ],
  };
}

/**
 * Main AI Assistant Query Function
 * Evaluates security guardrails -> Calls Server-Side Gemini API (/api/assistant/chat) -> Falls back to Heuristic Engine
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
      engineUsed: 'rbac-guardrail',
      suggestedPrompts: [
        '¿Cómo consultar existencias de productos?',
        '¿Cuál es la tasa oficial BCV hoy?',
        '¿Cómo dar de alta un nuevo producto (SKU)?',
      ],
    };
  }

  // Step 2: Call Server-Side Gemini API endpoint with 35s reasoning timeout when running in browser
  if (typeof window !== 'undefined' && typeof fetch === 'function') {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timeoutId = controller ? setTimeout(() => controller.abort(), 35000) : null;

    try {
      const response = await fetch('/api/assistant/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        signal: controller ? controller.signal : undefined,
        body: JSON.stringify({
          query,
          conversationHistory: (request.conversationHistory || []).slice(-6),
          liveContext,
        }),
      });

      if (timeoutId) clearTimeout(timeoutId);

      if (response.ok) {
        const data = (await response.json()) as AssistantQueryResponse;
        if (data && typeof data.answer === 'string' && data.answer.trim().length > 0) {
          return {
            ...data,
            engineUsed: data.engineUsed || 'gemini-3.8-flash',
          };
        }
      }
    } catch {
      if (timeoutId) clearTimeout(timeoutId);
      // Seamless fallback to deterministic local heuristic engine below
    }
  }

  // Step 3: Deterministic Local Heuristic Fallback Engine
  const heuristic = answerQueryWithHeuristicEngine(query, liveContext, request.conversationHistory);
  return {
    answer: heuristic.answer,
    isBlockedByRbac: false,
    usedFallbackEngine: true,
    engineUsed: 'heuristic-local',
    suggestedPrompts: heuristic.suggestedPrompts,
  };
}
