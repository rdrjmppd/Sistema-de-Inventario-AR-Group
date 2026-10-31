/**
 * Gemini AI Service & Local Heuristic Fallback Engine for Chrystal ERP Assistant (PolarBot)
 * High-Availability Dual Engine: Server-Side Gemini API (/api/assistant/chat) + Deterministic Local Fallback.
 * Official Copyright: © 2026 AR Group. Todos los derechos de desarrollo reservados.
 */

import {
  AssistantQueryRequest,
  AssistantQueryResponse,
  LiveErpOperationalContext,
} from './types';
import { evaluateSecurityGuardrails, buildOutOfScopeResponse } from './security-guardrails';
import { COMPANY_IDENTITY } from './knowledge-base';

/**
 * Heuristic Local Engine: Responds immediately and deterministically when
 * offline, in unit tests, or when the server-side Gemini endpoint is unavailable.
 */
export function answerQueryWithHeuristicEngine(
  query: string,
  liveContext: LiveErpOperationalContext
): { answer: string; suggestedPrompts: string[] } {
  const q = query.toLowerCase().trim();
  const userName = liveContext.activeUser.displayName;

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

  // 4. Descargas y Bajas de inventario / Mermas / Vencimiento
  if (
    q.includes('baja') ||
    q.includes('descarga') ||
    q.includes('vencim') ||
    q.includes('rotura') ||
    q.includes('dañad') ||
    q.includes('accidente') ||
    q.includes('desincorpor')
  ) {
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
  if (
    q.includes('pollo') ||
    q.includes('pechuga') ||
    q.includes('alita') ||
    /\balas\b/.test(q) ||
    q.includes('muslo') ||
    q.includes('milanesa')
  ) {
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
  if (
    q.includes('cerdo') ||
    q.includes('cochino') ||
    q.includes('pernil') ||
    q.includes('chuleta') ||
    q.includes('costillita') ||
    q.includes('tocino') ||
    q.includes('panceta')
  ) {
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
  if (
    /\bres\b/.test(q) ||
    q.includes('canal de res') ||
    q.includes('carne de res') ||
    q.includes('solomo') ||
    q.includes('lomito') ||
    q.includes('chocozuela') ||
    q.includes('pulpa negra') ||
    q.includes('costilla') ||
    q.includes('lagarto') ||
    q.includes('vacuno') ||
    q.includes('bovino')
  ) {
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

  // 12. Portal BRM de Proveedores & Enlace WhatsApp con Código QR ISO
  if (
    q.includes('whatsapp') ||
    q.includes('brm') ||
    q.includes('qr') ||
    q.includes('vincular whatsapp') ||
    q.includes('enviar comprobante')
  ) {
    return {
      answer: `Hola ${userName}. El módulo **"Proveedores & BRM"** integra comunicación bidireccional mediante WhatsApp Web con Código QR ISO y candado anti-envíos accidentales:

**Guía Paso a Paso para Enlazar WhatsApp y Enviar Documentos:**
1. Ingresa a **"Proveedores & BRM"** en el menú lateral.
2. En la barra superior, haz clic en el botón **"Vincular WhatsApp"**.
3. El sistema generará un **Código QR dinámico auténtico (ISO/IEC 18004)** en un canvas 2D idéntico a WhatsApp Web.
4. Abre WhatsApp en el celular corporativo, ve a *Dispositivos vinculados > Vincular un dispositivo* y escanea el código en pantalla. El sistema cambiará a estado verde "Conectado".
5. Para consultar o chatear con un proveedor, selecciónalo en el directorio y se abrirá su ventana de chat en tiempo real.
6. **Prevención de Envíos Involuntarios**: Cuando generes una Retención SENIAT o una Orden de Compra y pulses **"Exportar a BRM WhatsApp"**, el sistema no despachará el archivo en automático; te transferirá al chat con el documento PDF pre-cargado.
7. Revisa el documento y pulsa conscientemente el botón verde **"Confirmar y Enviar Comprobante por WhatsApp"** para completar el envío.`,
      suggestedPrompts: [
        '¿Cómo emito un comprobante de retención SENIAT?',
        '¿Cómo funciona el control de gastos OPEX?',
        '¿Cómo funciona la validación visual Split-Screen OCR?',
      ],
    };
  }

  // 13. Retenciones Fiscales SENIAT (IVA 75%/100% e ISLR)
  if (
    q.includes('retencion') ||
    q.includes('retención') ||
    q.includes('seniat') ||
    q.includes('txt') ||
    q.includes('islr')
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
  if (
    q.includes('receta') ||
    q.includes('bom') ||
    q.includes('panader') ||
    q.includes('produccion') ||
    q.includes('producción') ||
    q.includes('formula') ||
    q.includes('fórmula') ||
    q.includes('pan canilla')
  ) {
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
    q.includes('pdf') ||
    q.includes('excel') ||
    q.includes('informe') ||
    q.includes('reporte') ||
    q.includes('branding') ||
    q.includes('logo') ||
    q.includes('membrete')
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

  // 19. Comprobar si contiene términos operativos del ERP o si es fuera de alcance
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
    'receta',
    'bom',
    'panader',
    'produccion',
    'producción',
    'formula',
    'fórmula',
    'flujo',
    'caja',
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
          return data;
        }
      }
    } catch {
      if (timeoutId) clearTimeout(timeoutId);
      // Seamless fallback to deterministic local heuristic engine below
    }
  }

  // Step 3: Deterministic Local Heuristic Fallback Engine
  const heuristic = answerQueryWithHeuristicEngine(query, liveContext);
  return {
    answer: heuristic.answer,
    isBlockedByRbac: false,
    usedFallbackEngine: true,
    suggestedPrompts: heuristic.suggestedPrompts,
  };
}
