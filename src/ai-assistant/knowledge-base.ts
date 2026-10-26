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
      'Paso 1 (Analista): En "Descargas & Bajas", pulsar "+ Nueva Solicitud". Seleccionar sede, SKU, cantidad dañada, causa (VENCIMIENTO, ROTURA, ACCIDENTE, MERMA, ERROR) y justificación. Queda en PENDIENTE_AUTORIZACION sin tocar stock físico.',
      'Paso 2 (Gerente/Superadmin): Abrir la solicitud pendiente, revisar la pérdida valorizada en USD y VES, ingresar el PIN confidencial y pulsar "Firmar y Autorizar Baja Definitiva".',
      'Paso 3 (Resultado): El stock se descuenta en la sede y se descarga el Acta Oficial en PDF/Excel con logotipo y marca de agua.',
      'Paso 4 (Rechazo): Si el gerente rechaza la solicitud, el stock se mantiene intacto.',
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
      'Requiere PIN de Superadministrador (102030) y escribir textualmente "REINICIAR-SISTEMA".',
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
];

export const JUNIOR_GLOSSARY: Record<string, string> = {
  SKU: 'El código único de cada producto (como la cédula de identidad de cada artículo).',
  PVP: 'Precio de Venta al Público (lo que paga el cliente en la caja).',
  Merma: 'Comida que se venció, rompió o dañó y que hay que dar de baja en el sistema.',
  'Quiebre de Stock': 'Quedarse en cero en el anaquel; no tener comida para venderle al cliente.',
  'Punto de Reorden': 'El aviso de alerta cuando quedan poquitas unidades para pedir más al proveedor.',
  'Pareto ABC': 'Regla donde los productos Clase A son los que dejan casi toda la plata del negocio.',
  'Doble Firma': 'Seguridad donde el analista pide la baja y el gerente la autoriza con su clave.',
  OCR: 'El lector automático que saca los datos de fotos de facturas o transferencias.',
  'Marca de Agua': 'El logo transparente de fondo que tienen las hojas para que nadie las falsifique.',
};
