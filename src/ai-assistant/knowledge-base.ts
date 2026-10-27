/**
 * Official Knowledge Base & Source of Truth for Chrystal ERP Assistant (PolarBot)
 * Extracted and consolidated from MANUAL_DE_USUARIO_Y_ESPECIFICACIONES_CHRYSTAL_ERP.md
 * Official Copyright: © 2026 AR Group. Todos los derechos de desarrollo reservados.
 */

export interface KnowledgeTopic {
  id: string;
  title: string;
  category: 'OPERACIONES' | 'FINANZAS' | 'GOBIERNO' | 'DOCUMENTOS' | 'GLOSARIO';
  summary: string;
  stepByStep?: string[];
  rules: string[];
  juniorExplanation?: string;
  requiredRole?: string;
}

export const COMPANY_IDENTITY = {
  razonSocial: 'HIPER ABASTO POLAR, C.A.',
  brandingName: 'Hiper Abasto Polar',
  rif: 'J-50123456-7',
  sada: 'SADA-049821',
  direccionFiscal: 'Av. Intercomunal, Sector La Morita, Maracay, Edo. Aragua, Venezuela',
  telefono: '+58 (243) 234-5678',
  representanteLegal: 'Dirección General / Administración',
  actividadEconomica: 'Distribución y Comercialización de Alimentos, Víveres y Consumo Masivo',
  copyright: '© 2026 AR Group. Todos los derechos de desarrollo reservados.',
};

export const ERP_KNOWLEDGE_BASE: KnowledgeTopic[] = [
  {
    id: 'matematica-decimal-bcv',
    title: 'Aritmética Exacta Decimal.js y Tasa BCV 17:00 VET',
    category: 'FINANZAS',
    summary:
      'Todo cálculo monetario se realiza con Decimal.js y redondeo ROUND_HALF_UP para evitar errores de punto flotante IEEE-754. La plataforma conmuta automáticamente a la tasa oficial del día siguiente a las 5:00 PM (17:00 VET).',
    rules: [
      'Prohibido el uso de operaciones nativas tipo a + b con dinero.',
      'A las 17:00 VET entra en vigor la tasa de valor del día siguiente hábil.',
      'La conversión USD a VES se realiza multiplicando el monto en USD por la tasa BCV activa.',
    ],
    juniorExplanation:
      'Usamos una calculadora especial (Decimal.js) que nunca pierde ni un céntimo, y a las 5 de la tarde el sistema cambia automáticamente al precio del dólar que anunció el Banco Central para mañana.',
  },
  {
    id: 'catalogo-nuevo-sku',
    title: 'Registro de Nuevos Productos (SKU) y Precios de Venta',
    category: 'OPERACIONES',
    summary:
      'Procedimiento para dar de alta alimentos y víveres con cálculo automático de PVP en USD y Bolívares según costo, margen y alícuota de IVA.',
    stepByStep: [
      '1. Ir a Catálogo Maestro SKU y hacer clic en "+ Nuevo Producto".',
      '2. Ingresar SKU alfanumérico único (ej. HAP-HAR-001) y código de barras EAN-13.',
      '3. Escribir nombre completo, seleccionar categoría (VÍVERES, LÁCTEOS, etc.) y unidad (UND, KG, LT, CAJA, BULTO).',
      '4. Indicar Costo Unitario en USD y Margen Objetivo % (fórmula: PVP = Costo / (1 - Margen/100)).',
      '5. Seleccionar Alícuota de IVA SENIAT: Exento (0%), Reducido (8%) o General (16%).',
      '6. Definir stock inicial y stock mínimo de alarma por cada sede/depósito.',
      '7. Hacer clic en "Guardar Producto".',
    ],
    rules: [
      'El SKU no puede repetirse.',
      'Alimentos básicos de canasta son Exentos (0% IVA).',
      'El PVP en Bolívares se recalcula en tiempo real al cambiar la tasa BCV.',
    ],
    juniorExplanation:
      'Para meter un producto nuevo, anotas su código, nombre, cuánto costó comprarlo y cuánto le quieres ganar. El sistema calcula solito el precio en dólares y en bolívares.',
  },
  {
    id: 'descargas-bajas-inventario',
    title: 'Descargas y Bajas de Inventario (Doble Firma Gerencial)',
    category: 'OPERACIONES',
    summary:
      'Protocolo anti-fraude para desincorporar mercancía por vencimiento, rotura, merma o siniestro con autorización obligatoria por PIN.',
    stepByStep: [
      'Paso 1 (Analista): En "Inteligencia y Gobierno > Descargas & Bajas", pulsar "+ Nueva Solicitud de Descarga". Seleccionar sede, SKU, cantidad dañada, causa oficial (VENCIMIENTO_CADUCIDAD, DETERIORO_EMPAQUE_CONTENEDOR, ACCIDENTE_MALA_MANIPULACION, MERMA_CADENA_FRIO, ERROR_CARGA_SISTEMA) y justificación detallada. Queda en PENDIENTE_AUTORIZACION sin tocar stock físico.',
      'Paso 2 (Gerente/Superadmin): Abrir la solicitud pendiente, revisar la pérdida valorizada en USD y VES, ingresar el PIN confidencial de 4 a 6 dígitos y pulsar "Firmar y Autorizar Baja Definitiva".',
      'Paso 3 (Resultado): El stock se descuenta en la sede y se descarga el Acta Oficial en PDF/Excel con logotipo y marca de agua.',
      'Paso 4 (Rechazo): Si el gerente rechaza la solicitud indicando el motivo, el stock se mantiene intacto.',
    ],
    rules: [
      'El analista NO puede descontar stock por sí solo.',
      'Se requiere rol GERENTE o SUPERADMIN y PIN confidencial.',
      'La justificación es obligatoria para auditoría inmutable.',
    ],
    juniorExplanation:
      'Cuando un paquete se rompe o se vence, el analista anota lo que pasó pero no puede borrar la comida del sistema. El gerente tiene que revisar y meter su clave secreta para aprobar que se bote.',
  },
  {
    id: 'auditoria-forense-ocr',
    title: 'Auditoría Forense OCR de Comprobantes de Pago (4 Candados)',
    category: 'FINANZAS',
    summary:
      'Motor de IA y análisis heurístico para detectar comprobantes de pago falsificados, editados o clonados en transferencias, Pago Móvil o facturas.',
    stepByStep: [
      '1. Ir a Auditoría Forense OCR y subir la foto o captura del pago (JPG/PNG).',
      '2. Candado 1: Calcula huella digital SHA-256 única del archivo.',
      '3. Candado 2: Calcula hash perceptual pHash para evitar reutilización de capturas viejas.',
      '4. Candado 3: Inspecciona metadatos EXIF/JFIF para detectar edición con software gráfico.',
      '5. Candado 4: Peritaje IA extrae banco, monto, referencia y emite dictamen: AUTÉNTICO (90-100), SOSPECHOSO (60-89) o ALERTA FRAUDE (0-59).',
    ],
    rules: [
      'Ningún comprobante en ALERTA FRAUDE debe ser procesado sin confirmación bancaria.',
      'El OCR clasifica pero no liquida automáticamente deudas en libro mayor.',
    ],
    juniorExplanation:
      'Es un detector de pagos falsos que mira las fotos de transferencias y revisa si están editadas con Photoshop o si el cliente mandó una captura vieja.',
  },
  {
    id: 'historico-sesiones-inactividad',
    title: 'Gobernanza de Sesiones, Latido y Suspensión a los 30 Minutos',
    category: 'GOBIERNO',
    summary:
      'Control de conexiones continuas para evitar sesiones zombies y medir con exactitud los accesos y minutos de permanencia.',
    rules: [
      'Recargar la página NO crea una sesión nueva; se reanuda la misma sesión activa.',
      'Cada 60 segundos se emite un latido (heartbeat) de actividad.',
      'Si pasan más de 30 minutos sin comunicación, la sesión pasa a SUSPENDIDA.',
      'Al volver a interactuar, la sesión se reactiva conservando la hora original de entrada.',
      'Al presionar "Cerrar Sesión", se sella formalmente la salida y se calcula la duración.',
    ],
    juniorExplanation:
      'Si se te cae el internet o dejas la computadora tranquila por más de media hora, el sistema pone tu cuenta en pausa. Cuando regresas, continúas en la misma sesión sin que se creen cuentas fantasmas.',
  },
  {
    id: 'reinicio-fabrica-rbac',
    title: 'Reinicio Total de Fábrica (Factory Wipe)',
    category: 'GOBIERNO',
    summary:
      'Borrado destructivo total de la base de datos para restaurar el sistema a estado virgen.',
    rules: [
      'RESTRINGIDO EXCLUSIVAMENTE AL ROL SUPERADMIN.',
      'Requiere PIN de Superadministrador y escribir textualmente "REINICIAR-SISTEMA".',
      'Analistas, Gerentes u Observadores tienen estrictamente prohibido y bloqueado este procedimiento.',
    ],
    requiredRole: 'SUPERADMIN',
    juniorExplanation:
      'Es el botón de emergencia para borrar toda la información y empezar de cero. Solo el dueño o jefe máximo de computación puede hacerlo con su clave maestra.',
  },
  {
    id: 'exportacion-pdf-excel-polar',
    title: 'Exportaciones Oficiales Excel OpenXML y PDF con Marca de Agua Polar',
    category: 'DOCUMENTOS',
    summary:
      'Descarga de reportes ejecutivos con membrete fiscal de Hiper Abasto Polar, C.A., marca de agua central al 7% de opacidad y análisis de liquidez.',
    stepByStep: [
      'Excel (.xlsx): En Catálogo Maestro, clic en "Descargar Sabana (.xlsx)". Genera 3 hojas (Resumen, Matriz Producto/Celda, Fichas) con bordes OpenXML.',
      'PDF Ejecutivo: En Catálogo Maestro, clic en "Exportar PDF Ejecutivo". Incluye logotipo oficial en cabecera, marca de agua central y análisis estratégico de liquidez de SKUs Clase A frente a riesgo de quiebre.',
    ],
    rules: [
      'Todo documento descargado refleja los datos reales de la base de datos sin estimaciones inventadas.',
      'Lleva permanentemente el copyright legal © 2026 AR Group.',
    ],
    juniorExplanation:
      'Puedes bajar las listas de comida en Excel con sus tablas bien marcadas o en PDF con el logo del carrito de Hiper Abasto Polar y su marca de agua de fondo.',
  },
  {
    id: 'rendimiento-carnico-desposte',
    title: 'Rendimiento Cárnico y Desglose de Desposte (Res, Cerdo y Pollo)',
    category: 'OPERACIONES',
    summary:
      'Protocolo de transformación cárnica para desglosar canales enteras o medias canales de vacuno (res), porcino (cerdo) y avícola (pollo) en cortes comerciales con costeo por valor relativo y control de mermas.',
    stepByStep: [
      '1. Ingresar a "Operaciones > Rendimiento Cárnico (Desposte)" en el menú lateral.',
      '2. Seleccionar la especie animal: Vacuno (Res), Porcino (Cerdo) o Avícola (Pollo).',
      '3. Indicar la Sede/Frigorífico, la presentación de entrada (Canal Completa, Media Canal, Cuarto Trasero/Delantero, Bulto de Pollo) y registrar el peso bruto inicial en Kg y el costo unitario de compra ($/Kg).',
      '4. Carga de Subproductos / Cortes: A medida que los carniceros realizan el despiece, registrar los Kg obtenidos de cada corte (ej. Res: Solomo, Lomito, Punta Trasera, Pulpa Negra, Chocozuela, Carne Molida, Costilla; Cerdo: Pernil, Chuleta, Costilla, Lomo, Tocino; Pollo: Pechuga, Milanesa, Muslo/Contramuslo, Alas).',
      '5. Costeo por Valor Comercial Relativo: El sistema calcula automáticamente el % de rendimiento de cada corte sobre el total de la canal y le asigna un costo proporcional a su valor en el mercado, calculando el PVP sugerido en USD y Bolívares con margen objetivo.',
      '6. Registro de Mermas de Desposte: Pesar y desglosar el desperdicio en las 4 categorías: Hueso Blanco de desecho, Grasa/Sebo excedente, Merma por evaporación/líquidos en cava y Aserrín de corte en sierra.',
      '7. Proyección de Compras Futuras: Utilizar la calculadora inteligente integrada indicando cuántos Kg de un corte específico se necesitan para que el sistema calcule exactamente cuántos Kg de canal entera se deben pedir al matadero o proveedor sin generar sobrestock de huesos ni grasas.',
    ],
    rules: [
      'Los pesajes de cortes más mermas deben cuadrar con el peso total de la canal (tolerancia máxima de pesaje: ±0.5%).',
      'El Supervisor de Carnicería realiza la carga y pesaje de cortes, requiriendo doble firma gerencial para confirmación definitiva en Kardex.',
      'El costo de la canal se distribuye de forma ponderada según el valor relativo de cada corte (el lomito absorbe más costo que la costilla o el hueso).',
    ],
    requiredRole: 'SUPERVISOR_CARNICERIA / ANALISTA / GERENTE',
    juniorExplanation:
      'Cuando la empresa compra una vaca, un cochino o bultos de pollo enteros, los carniceros los pican en partes (bisteck, molida, chuletas, pechugas). El sistema anota cuánto pesó cada corte, calcula cuánto costó producirlo, a qué precio venderlo en dólares y bolívares, y anota los huesos y pellejos que se botan como merma.',
  },
  {
    id: 'rendimiento-frutas-verduras-mermas',
    title: 'Rendimiento y Control de Mermas de Frutas y Verduras (Fruver)',
    category: 'OPERACIONES',
    summary:
      'Control de lotes agrícolas, absorción de costos y registro de mermas clasificadas bajo 5 causas específicas de descomposición y deterioro físico.',
    stepByStep: [
      '1. Ingresar a "Operaciones > Rendimiento Frutas y Verduras" en el menú lateral.',
      '2. Seleccionar el rubro agrícola (Tomate Perita, Papa Criolla, Cebolla, Plátano Verde/Maduro, Piña, etc.) y la Sede de recepción.',
      '3. Ingresar el peso bruto recibido del lote en Kg y el costo unitario de factura ($/Kg).',
      '4. Desglose de Merma por 5 Causas Específicas: Pesar los descartes diarios e ingresarlos en la causa correspondiente:',
      '   - Deshidratación y Pérdida Natural de Peso (humedad evaporada por calor/ambiente).',
      '   - Quemadura por Exceso de Frío en Cava (daño por congelación accidental o frío excesivo).',
      '   - Descomposición / Fermentación por Exceso de Calor (maduración acelerada y pudrición).',
      '   - Daño Mecánico por Estiba y Manipulación (golpes, magulladuras o aplastamiento en cestas).',
      '   - Exceso de Días en Piso de Venta (fruta o verdura sobremadurada sin rotación oportuna).',
      '5. Rendimiento Neto Vendible: El sistema resta la merma acumulada del peso inicial para obtener los Kg reales listos para venta en mostrador.',
      '6. Costo Efectivo Absorbido: El costo de los kilos perdidos se absorbe automáticamente en los kilos vendibles restantes, recalculando el PVP por Kg para no comprometer la rentabilidad de la empresa.',
    ],
    rules: [
      'La merma total nunca puede superar el 100% del lote recibido.',
      'El Supervisor de Frutas y Verduras registra los descartes diarios clasificados por causa exacta para auditoría de calidad.',
    ],
    requiredRole: 'SUPERVISOR_FRUVER / ANALISTA / GERENTE',
    juniorExplanation:
      'Las frutas y verduras se van dañando o perdiendo agua con los días. El supervisor anota cuántos kilos se dañaron y por qué (si fue por calor, por frío, porque se aplastaron o porque pasaron muchos días en el mostrador). El sistema calcula cuánta plata se perdió y a cómo hay que vender los tomates sanos que quedaron.',
  },
];

export const JUNIOR_GLOSSARY: Record<string, string> = {
  SKU: 'código único que identifica a cada producto para no confundir marcas ni presentaciones.',
  PVP: 'precio de venta al público en anaquel con margen de ganancia e impuestos incluidos.',
  Merma: 'pérdida de mercancía que se daña, vence o rompe y ya no se puede vender.',
  'Quiebre de Stock': 'quedarse en cero en el anaquel; no tener mercancía disponible para la venta.',
  'Punto de Reorden':
    'la cantidad mínima de paquetes que debe quedar en el depósito antes de tener que pedirle más al proveedor.',
  'Pareto ABC': 'clasificación donde los productos Clase A generan el 80% de los ingresos del negocio.',
  'Doble Firma':
    'medida de seguridad donde una persona solicita la operación y un gerente la aprueba con su clave confidencial.',
  OCR: 'lector inteligente que extrae automáticamente los datos de fotos de facturas o comprobantes de pago.',
  'Marca de Agua': 'sello institucional al 7% de opacidad en el centro de los reportes PDF para certificar autenticidad.',
  Desposte: 'proceso de picar y deshuesar una canal de carne entera (res, cerdo, pollo) en cortes listos para la venta.',
  'Rendimiento Cárnico': 'el porcentaje de carne limpia y aprovechable que sale de un animal entero después de quitarle los huesos y el sebo.',
  Canal: 'el cuerpo del animal entero (res o cerdo) sacrificado y limpio sin vísceras, listo para ser despiezado.',
  'Corte Primario': 'los cortes de carne de mayor valor y calidad, como el lomito, el solomo o la pechuga de pollo.',
  'Merma por Deshidratación': 'los kilos que pierde una fruta o verdura porque se le evapora el agua natural con el calor.',
  Fruver: 'área del supermercado dedicada a la venta de frutas, verduras, hortalizas y tubérculos.',
};
