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

  // 1. Saludo inicial o presentación (directo y al grano)
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
      answer: `Soy **PolarBot**, Asistente Inteligente y Brazo Derecho Operativo de **${COMPANY_IDENTITY.razonSocial}** (RIF: ${COMPANY_IDENTITY.rif}, SADA: ${COMPANY_IDENTITY.sada}). Estoy conectado en tiempo real a los datos de **Chrystal® ERP**.

Puedo orientarte de inmediato en:
* Existencias por SKU (código único que identifica a cada producto para no confundir marcas ni presentaciones) y alertas de punto de reorden (la cantidad mínima de paquetes que debe quedar en el depósito antes de tener que pedirle más al proveedor).
* Tasa oficial BCV activa y regla de corte a las 17:00 VET.
* Solicitud de bajas por merma (pérdida de mercancía que se daña, vence o rompe y ya no se puede vender) bajo doble firma (medida de seguridad donde una persona solicita la operación y un gerente la aprueba con su clave confidencial).
* Cálculo de PVP (precio de venta al público en anaquel con margen de ganancia e impuestos incluidos) y auditoría forense OCR.`,
      suggestedPrompts: [
        '¿Cuál es la tasa oficial BCV hoy?',
        '¿Qué productos están en quiebre de stock?',
        '¿Cómo solicito una baja de inventario?',
        '¿Cuál es la valorización total del inventario?',
      ],
    };
  }

  // 2. Tasa oficial BCV (directo al dato)
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
      answer: `La **tasa oficial del BCV activa** es **${bcv.activeRate.toFixed(4)} VES/USD**.

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
        answer: `Actualmente **no existen productos en quiebre de stock**. Los **${liveContext.metrics.totalSkus} SKUs** (código único que identifica a cada producto para no confundir marcas ni presentaciones) superan su punto de reorden (la cantidad mínima de paquetes que debe quedar en el depósito antes de tener que pedirle más al proveedor).`,
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
      answer: `Hay **${count} SKU(s)** (código único que identifica a cada producto para no confundir marcas ni presentaciones) en alerta de quiebre por debajo de su punto de reorden (la cantidad mínima de paquetes que debe quedar en el depósito antes de tener que pedirle más al proveedor):

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
      answer: `El registro de merma (pérdida de mercancía que se daña, vence o rompe y ya no se puede vender) opera bajo **doble firma** (medida de seguridad donde una persona solicita la operación y un gerente la aprueba con su clave confidencial):

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

  // 4B. Rendimiento Cárnico y Desposte (Res, Cerdo, Pollo)
  if (
    q.includes('carnic') ||
    q.includes('cárnic') ||
    q.includes('desposte') ||
    q.includes('canal') ||
    q.includes('cerdo') ||
    q.includes('pollo') ||
    q.includes('res') ||
    q.includes('solomo') ||
    q.includes('lomito') ||
    q.includes('pechuga') ||
    q.includes('pernil')
  ) {
    return {
      answer: `El módulo **"Operaciones > Rendimiento Cárnico"** gestiona la transformación y desglose de canales completas de **Res, Cerdo y Pollo** en cortes primarios, secundarios y mermas técnicas:

**1. Desglose y Transformación Matemática Exacta:**
* **Ingreso de Canal**: Se registra el peso bruto de la canal en kg y el costo total de adquisición en USD.
* **Distribución de Cortes**: Cada corte (ej. Solomo de Cuerito, Lomito, Chocozuela, Costilla, Pulpa Negra) se pondera según su rendimiento histórico y su **valor comercial relativo ($/kg)**.
* **Alineación de Costos**: El costo total de la canal se distribuye proporcionalmente entre los cortes salables según su precio de mercado, garantizando que los cortes nobles absorban su valor real sin distorsionar el margen.
* **Control de Mermas Técnicas**: Se pesan y registran con precisión: \`Hueso Blanco/Rojo\`, \`Grasa/Sebo\`, \`Aserrín de Sierra\` y \`Evaporación/Oreo en Cava\`.

**2. Calculadora Proyectiva de Compra:**
Permite ingresar los kilos de demanda esperada de cortes premium (ej. 150 kg de Solomo) y el sistema proyecta automáticamente cuántas canales de res o cerdos enteros deben solicitarse al proveedor para cubrir dicho requerimiento.

**3. Trazabilidad y Roles:**
El usuario **Supervisor de Carnicería** (\`carniceria@hiperabastopolar.com\`) puede registrar pesajes y despostes. Cualquier baja por descomposición o desincorporación de hueso pasa a la bandeja de bajas para autorización gerencial con PIN.`,
      suggestedPrompts: [
        '¿Cómo funciona el módulo de Rendimiento Fruver?',
        '¿Cuál es el producto con mayor rotación?',
        '¿Cómo solicito una baja de inventario?',
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
      answer: `El módulo **"Operaciones > Rendimiento Fruver"** audita la recepción y rendimiento de lotes agrícolas (frutas, verduras y hortalizas) y clasifica sus pérdidas bajo **5 Causas Específicas**:

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
        '¿Cómo funciona el módulo de Rendimiento Cárnico?',
        '¿Cuál es el producto con mayor rotación?',
        '¿Cómo dar de alta un nuevo producto (SKU)?',
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
        answer: `Ranking de **Productos con Mayor Rotación** en vivo (determinado por volumen histórico de ventas y salida de anaquel):

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
      answer: `Actualmente los productos con mayor rotación corresponden a las categorías de **Canasta Básica y Alimentos de Consumo Masivo** (Harina PAN, Arroz, Pasta, Aceite vegetal y Azúcar refinada), los cuales representan más del 70% del flujo diario de unidades en piso de venta.

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
      answer: `Cuentas y roles de **Supervisión Operativa** configurados en **Chrystal® ERP**:

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
        '¿Cómo funciona el módulo de Rendimiento Cárnico?',
        '¿Cómo funciona el módulo de Rendimiento Fruver?',
        '¿Cómo solicito una baja de inventario?',
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
      answer: `Procedimiento para registrar un producto en el **Catálogo Maestro SKU** (código único que identifica a cada producto para no confundir marcas ni presentaciones):

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
      answer: `El módulo **"Finanzas > Auditoría Forense OCR"** valida comprobantes de Pago Móvil, transferencias, Zelle y facturas aplicando **4 Candados Forenses**:

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
      answer: `Red operativa activa de **${COMPANY_IDENTITY.razonSocial}** (**${locs.length} sedes/depósitos**):

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
      answer: `Valorización contable en vivo de **${COMPANY_IDENTITY.razonSocial}**:

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

  // 9. Documentos PDF / Excel / Branding / Sesiones
  if (
    q.includes('pdf') ||
    q.includes('excel') ||
    q.includes('informe') ||
    q.includes('reporte') ||
    q.includes('branding') ||
    q.includes('logo') ||
    q.includes('membrete') ||
    q.includes('sesion') ||
    q.includes('sesión')
  ) {
    return {
      answer: `Estándar documental y de gobernanza en **Chrystal® ERP**:

* **Excel OpenXML (.xlsx)**: Membrete fiscal de **${COMPANY_IDENTITY.razonSocial}** (RIF: ${COMPANY_IDENTITY.rif}, SADA: ${COMPANY_IDENTITY.sada}), bordes ejecutivos visibles y pestaña \`3_Fichas_Producto_Celda\` con fichas individuales delimitadas.
* **PDF Ejecutivo**: Cabecera con logo oficial de **${COMPANY_IDENTITY.brandingName}**, marca de agua central al 7% de opacidad en todas las páginas, análisis de liquidez de SKUs Clase A y pie de página legal (${COMPANY_IDENTITY.copyright}).
* **Continuidad de Sesiones (30 min)**: Recargar el navegador reanuda la misma sesión activa con latido cada 60s y suspensión automática tras 30 minutos de inactividad.`,
      suggestedPrompts: [
        '¿Cómo solicito una baja de inventario?',
        '¿Cuál es la valorización total del inventario?',
        '¿Cuál es la tasa oficial BCV hoy?',
      ],
    };
  }

  // 10. Comprobar si contiene términos operativos del ERP o si es fuera de alcance
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
    answer: `Sobre tu consulta ("${query}"):

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

  // Step 2: Call Server-Side Gemini API endpoint with 8s fast timeout when running in browser
  if (typeof window !== 'undefined' && typeof fetch === 'function') {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timeoutId = controller ? setTimeout(() => controller.abort(), 8000) : null;

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
