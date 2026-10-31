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
  {
    id: 'control-gastos-opex-arqueo',
    title: 'Control de Gastos Operativos (OPEX), Aprobación Gerencial y Resguardo Drive',
    category: 'FINANZAS',
    summary:
      'Gestión integral de gastos internos en 10 rubros, flujo de aprobación de doble firma para egresos > $100 USD, alarmas de presupuesto al 70% y bloqueo al 100%, resguardo estructurado en Google Drive y Arqueo Mensual de Cierre con Pareto y microgastos hormiga.',
    stepByStep: [
      '1. Ir a "Control de Gastos" en el menú lateral principal.',
      '2. En la sub-pestaña "Registro y Carga de Gasto", hacer clic en "Subir Factura o Ticket Escaneado" (soporta JPG, PNG y PDF) para prellenar datos automáticamente mediante el lector OCR.',
      '3. Seleccionar el rubro en "Categoría del Gasto" (Oficina y Papelería, Equipos de Mantenimiento, Materiales de Construcción, Climatización A/C, Servidores y Cómputo, Servicio Técnico, Servicios Públicos, Fletes y Envíos, Asesoría Legal y Fiscal).',
      '4. Seleccionar la "Condición de Pago" ("Contado" o "Crédito"). Si es crédito, indicar los días de crédito, si aplica descuento por pronto pago (% y fecha límite) o mora mensual (%).',
      '5. Indicar Monto y Moneda ("USD" o "VES"). Si el monto supera los $100 USD, el sistema exigirá PIN Gerencial. Si el analista no tiene PIN, pulsa "+ Registrar Gasto" y el registro pasa a la sub-pestaña "Bandeja de Aprobación (> $100 USD)".',
      '6. Al guardar, se abrirá la ventana "Resguardo en Google Drive". Hacer clic en "Copiar Ruta Sugerida" y luego en "Marcar Resguardo Realizado" tras almacenar el archivo en la carpeta PROVEEDOR/AÑO-MES.',
      '7. Para registrar el desembolso en tesorería, ir a la sub-pestaña "Libro Mayor de Gastos", buscar el gasto y hacer clic en "Registrar Pago". Indicar método de pago y pulsar "Confirmar Liquidación".',
      '8. A fin de mes, ingresar a la sub-pestaña "Arqueo Mensual", revisar el semáforo presupuestario y pulsar "Descargar Arqueo PDF" o "Descargar Libro Excel (.xlsx)".',
    ],
    rules: [
      'Todo gasto superior a $100 USD requiere aprobación de doble firma con PIN Gerencial.',
      'Al alcanzar el 70% del presupuesto mensual se emite alarma amarilla preventiva; al 100% se activa bloqueo total de egresos.',
      'Las facturas escaneadas deben respaldarse en la estructura de Google Drive para evitar colapso de la base de datos.',
      'Cálculo matemático exacto mediante Decimal.js y redondeo ROUND_HALF_UP.',
    ],
    requiredRole: 'ANALISTA / GERENTE / SUPERADMIN',
    juniorExplanation:
      'Aquí anotamos todos los gastos del negocio (papel de oficina, arreglo de los aires acondicionados, la luz, el internet, fletes). Si el gasto es mayor a 100 dólares, el gerente tiene que autorizarlo con su clave secreta. Además, el sistema te recuerda guardar la foto de la factura en Google Drive en una carpeta ordenada con el nombre del proveedor y el mes para que nunca se pierda ningún papel.',
  },
  {
    id: 'split-screen-ocr-facturas',
    title: 'Validación Visual Split-Screen OCR y Pre-Asiento de Facturas',
    category: 'FINANZAS',
    summary:
      'Interfaz de doble pantalla que contrasta el documento original recibido contra los datos extraídos por OCR, permitiendo al operador aprobar o rechazar manualmente antes de asentar la operación en inventario y libro mayor.',
    stepByStep: [
      '1. Ir a "Facturas & OCR" en el menú lateral de la plataforma.',
      '2. Hacer clic en "Cargar Factura / Comprobante" y subir la imagen o PDF escaneado.',
      '3. En computadoras de escritorio, el sistema despliega el visor Split-Screen (50% documento escaneado a la izquierda y 50% campos extraídos a la derecha). En teléfonos móviles (<768px), conmutar con las pestañas "📄 Ver Documento Original" y "✍️ Datos Extraídos" con zoom y paneo táctil.',
      '4. Verificar visualmente RIF del proveedor, N° de Factura, N° de Control, Base Imponible, Exento, IVA (16%) y dictamen forense.',
      '5. Si los datos coinciden, hacer clic en el botón verde "Aprobar y Asentar Factura" para cargar el inventario y crear la cuenta por pagar en Libro Mayor.',
      '6. Si el documento presenta borrones o no coincide, hacer clic en "Rechazar Comprobante", ingresar el motivo y descartar.',
    ],
    rules: [
      'Ninguna factura altera el inventario ni el libro mayor sin aprobación humana visual previa.',
      'Todo archivo procesado resguarda su huella SHA-256 y pHash perceptual anti-fraude.',
    ],
    requiredRole: 'ANALISTA / GERENTE',
    juniorExplanation:
      'Es una pantalla doble: a la izquierda ves la foto real de la factura que mandó el proveedor y a la derecha ves lo que leyó la computadora. Si todo está perfecto, le das al botón verde para aprobarla; si tiene un error o es falsa, le das al botón rojo para rechazarla.',
  },
  {
    id: 'ingesta-chrystal-pos-excel',
    title: 'Ingesta Aislada de Ventas Diarias de Chrystal® POS (Excel/CSV)',
    category: 'OPERACIONES',
    summary:
      'Mecanismo de ingesta desacoplada para sincronizar las ventas diarias y cierres Z exportados de las cajas Chrystal POS sin requerir APIs internas, garantizando el descuento automático de existencias.',
    stepByStep: [
      '1. Exportar el reporte diario de ventas o cierre Z desde las cajas del sistema Chrystal POS en formato Excel (.xlsx, .xls) o CSV.',
      '2. Ir a "Importación Chrystal POS" en el menú lateral del ERP.',
      '3. Hacer clic en "Seleccionar Archivo de Ventas Chrystal" o arrastrar el archivo al área punteada.',
      '4. El motor detecta automáticamente las columnas y concilia los códigos de barra o SKUs contra el catálogo maestro.',
      '5. Hacer clic en el botón "Simular y Validar Conciliación". El sistema mostrará el resumen de ventas, montos en USD/VES y los "Ítems no encontrados" si existen códigos no registrados.',
      '6. Hacer clic en el botón azul "Ejecutar Descarga en Inventario". El sistema descontará automáticamente el stock de los productos reconocidos en la sede seleccionada sin interrumpir la operación por los ítems no registrados.',
    ],
    rules: [
      'Soporta auto-detección multi-formato (.xlsx, .xls, .csv).',
      'Los ítems no encontrados se registran en una lista de advertencia para auditoría y no detienen la descarga de los productos válidos.',
      'Toda descarga genera un registro de auditoría inmutable en Kardex.',
    ],
    requiredRole: 'ANALISTA / SUPERVISOR / GERENTE',
    juniorExplanation:
      'Como las cajas registradoras de Chrystal no se conectan por internet al ERP, el cajero descarga el reporte de ventas del día en Excel y tú lo subes en esta pantalla. El sistema lee los códigos de barra y descuenta de inmediato la comida vendida de los anaqueles.',
  },
  {
    id: 'brm-whatsapp-qr-retenciones',
    title: 'Portal BRM de Proveedores, Enlace QR ISO y Envío WhatsApp',
    category: 'OPERACIONES',
    summary:
      'Integración con WhatsApp Web mediante Código QR auténtico ISO/IEC 18004, trazabilidad de chats con proveedores y prevención de envíos accidentales de retenciones u órdenes de compra.',
    stepByStep: [
      '1. Ir a "Proveedores & BRM" en el menú lateral.',
      '2. En la barra superior, hacer clic en "Vincular WhatsApp".',
      '3. El sistema renderizará un Código QR real bajo estándar ISO/IEC 18004.',
      '4. En el teléfono móvil de la empresa, abrir WhatsApp > Dispositivos vinculados > Vincular un dispositivo y escanear el QR.',
      '5. Una vez enlazado, seleccionar cualquier proveedor del directorio para interactuar en su chat en tiempo real.',
      '6. Cuando se genere una Retención SENIAT u Orden de Compra, el botón "Exportar a BRM WhatsApp" transferirá al usuario directamente al chat con el proveedor con el documento PDF pre-cargado.',
      '7. El usuario debe hacer clic voluntariamente en el botón verde "Confirmar y Enviar Comprobante por WhatsApp", garantizando que ningún archivo se despache accidentalmente.',
    ],
    rules: [
      'El número telefónico debe estar guardado en formato internacional estándar E.164 (ej. +584121234567).',
      'El socket de WhatsApp opera de forma desacoplada para evitar caídas en el ERP si se desconecta el teléfono.',
      'Confirmación manual obligatoria del usuario antes del despacho final del archivo.',
    ],
    requiredRole: 'ANALISTA / GERENTE / COMPRAS',
    juniorExplanation:
      'Te permite conectar el WhatsApp del supermercado escaneando un código QR como si fuera WhatsApp Web. Cuando le vas a mandar un pago o una retención de impuestos a un proveedor, el sistema no lo manda solo: te lleva al chat del proveedor con el archivo listo para que tú revises y le des al botón verde de confirmar envío.',
  },
  {
    id: 'retenciones-fiscales-seniat',
    title: 'Comprobantes de Retención SENIAT (IVA 75%/100% e ISLR)',
    category: 'FINANZAS',
    summary:
      'Emisión automatizada de retenciones de IVA (75% general o 100% especial) e ISLR según alícuotas del Decreto 1808, correlativo fiscal oficial, generación de archivos TXT para el portal fiscal SENIAT y exportación.',
    stepByStep: [
      '1. Ir a "Retenciones SENIAT" en el menú lateral.',
      '2. Seleccionar la factura de compra correspondiente de la lista de facturas pendientes de retención.',
      '3. Seleccionar el porcentaje de retención de IVA: 75% (estándar para Contribuyentes Especiales) o 100% (proveedores sin RIF actualizado, omisión de factura electrónica o compras a personas naturales).',
      '4. El sistema calcula automáticamente la retención de ISLR según la tarifa aplicable (honorarios, servicios o fletes).',
      '5. Hacer clic en "Generar Comprobante de Retención".',
      '6. Hacer clic en "Descargar PDF Oficial" para imprimir o archivar, o "Generar TXT SENIAT" para la declaración quincenal.',
      '7. Para enviarlo al proveedor, hacer clic en "Enviar a BRM WhatsApp" para pre-cargar el comprobante en su chat.',
    ],
    rules: [
      'La retención se deduce de forma automática de la cuenta por pagar en Libro Mayor.',
      'El número de comprobante sigue el formato fiscal oficial de 14 dígitos (Año + Mes + Correlativo).',
    ],
    requiredRole: 'ANALISTA / GERENTE / ADMINISTRACION',
    juniorExplanation:
      'Por ley venezolana (SENIAT), cuando le pagamos a un proveedor debemos retenerle el 75% o el 100% del IVA y un porcentaje de impuesto sobre la renta para pagárselo directamente al Estado. Esta pantalla calcula esa resta solita y genera el comprobante oficial en PDF y el archivo de texto para el portal del SENIAT.',
  },
  {
    id: 'fefo-cadena-frio-sada',
    title: 'Cadena de Frío, Control de Lotes FEFO y Guías SADA',
    category: 'OPERACIONES',
    summary:
      'Control de productos perecederos bajo protocolo FEFO (First Expired, First Out), monitoreo de temperaturas en cavas de congelación y conservación, semáforo de vencimiento y vinculación de Guías de Movilización SADA.',
    stepByStep: [
      '1. Ir a "Lotes & Cadena de Frío" en el menú lateral.',
      '2. Al ingresar mercancía refrigerada o congelada, hacer clic en "+ Registrar Nuevo Lote".',
      '3. Ingresar el Lote del fabricante, Fecha de Elaboración, Fecha de Vencimiento y registrar la temperatura de recepción en el termógrafo (°C).',
      '4. Asignar a Cava de Congelación (-18°C a -22°C para carnes y pollo) o Cava de Conservación (0°C a 4°C para lácteos y embutidos).',
      '5. El sistema prioriza automáticamente en los despachos el lote con fecha de caducidad más cercana (regla FEFO).',
      '6. Si el producto es rubro controlado por Sunagro, ingresar el código de la Guía de Movilización SADA (ej. SADA-049821) y pulsar "Vincular Guía Oficial".',
    ],
    rules: [
      'Semáforo FEFO: Rojo (< 30 días de vida útil), Amarillo (31-60 días), Verde (> 60 días).',
      'La ruptura de cadena de frío (temperatura fuera de rango) debe registrarse inmediatamente como merma o someterse a inspección de calidad.',
    ],
    requiredRole: 'SUPERVISOR / ANALISTA / ALMACEN',
    juniorExplanation:
      'Garantiza que la comida que se vence primero sea la primera que se ponga en los anaqueles para la venta (regla FEFO). También controla que las cavas de pollo, carne y quesos estén bien frías para que nada se descongele ni se dañe, y anota los permisos SADA que pide el gobierno para mover comida.',
  },
  {
    id: 'recetas-produccion-bom',
    title: 'Recetas de Producción y Fórmulas (BOM) para Panadería y Charcutería',
    category: 'OPERACIONES',
    summary:
      'Módulo de manufactura y transformación para panadería, pastelería y alimentos preparados. Estructura listas de materiales (BOM), costeo unitario y explosión automática de materias primas en inventario.',
    stepByStep: [
      '1. Ir a "Recetas y Producción" en el menú lateral.',
      '2. Para configurar una fórmula, hacer clic en "+ Nueva Receta / BOM".',
      '3. Seleccionar el producto final terminado (ej. Pan Canilla, Torta de Chocolate, Queso Aliñado) e indicar el rendimiento de la tanda (unidades o kilogramos).',
      '4. En la sección "Lista de Materiales e Insumos", agregar cada materia prima (harina de trigo, levadura, manteca, azúcar, sal) con su cantidad exacta.',
      '5. El sistema calcula en tiempo real el Costo Unitario de Producción según el último costo de compra de cada insumo.',
      '6. Para fabricar, hacer clic en "Ejecutar Orden de Producción", indicar el número de tandas a hornear y pulsar "Procesar y Descontar Insumos". El stock de harina y levadura se descontará automáticamente y se incrementará el stock del pan terminado.',
    ],
    rules: [
      'No se puede procesar una orden de producción si no hay existencia suficiente de materias primas en el almacén de producción.',
      'La merma por horneado o evaporación se parametriza en el rendimiento de la receta.',
    ],
    requiredRole: 'MAESTRO_PANADERO / SUPERVISOR / GERENTE',
    juniorExplanation:
      'Funciona como el recetario de la panadería del supermercado. Anotas cuánta harina, levadura y azúcar lleva una canilla. Cuando los panaderos hornean 100 panes, le das al botón y el sistema descuenta solito los sacos de harina del depósito y suma los panes listos para vender en el mostrador.',
  },
  {
    id: 'flujo-caja-proyectado-bimonetario',
    title: 'Flujo de Caja Bimonetario Proyectado (USD/VES) a 7, 15 y 30 Días',
    category: 'FINANZAS',
    summary:
      'Panel ejecutivo de tesorería y liquidez que proyecta las obligaciones financieras y compromisos bancarios a 7, 15 y 30 días en dólares y bolívares, integrando cuentas por pagar a proveedores y provisiones fiscales del SENIAT.',
    stepByStep: [
      '1. Ir a "Dashboard Principal" en el menú lateral.',
      '2. Localizar la tarjeta ejecutiva "Flujo de Caja Bimonetario Proyectado".',
      '3. Usar el selector de moneda para conmutar entre Dólares ($ USD) y Bolívares (Bs. VES) calculados a la tasa oficial BCV.',
      '4. Analizar los horizontes temporales: "Inmediato (Hoy)", "Próximos 7 Días", "Próximos 15 Días (Quincena SENIAT)" y "Próximos 30 Días".',
      '5. El panel compara la liquidez real disponible en cuentas bancarias frente a las cuentas por pagar a proveedores y las provisiones de retenciones fiscales, mostrando el saldo neto proyectado y emitiendo alertas si hay riesgo de iliquidez.',
    ],
    rules: [
      'Criterio conservador estricto: considera la liquidez real disponible frente a deudas exigibles, sin asumir ingresos futuros inciertos de ventas no recaudadas.',
      'Conversión bimonetaria exacta a tasa BCV activa.',
    ],
    requiredRole: 'ANALISTA / GERENTE / TESORERIA',
    juniorExplanation:
      'Es un termómetro del dinero del negocio. Te muestra cuánta plata hay hoy en los bancos y cuánta habrá que pagar en 7, 15 o 30 días a los proveedores y de impuestos. Si falta dinero para pagarle a alguien el viernes, el panel se pone en amarillo o rojo para avisarle al gerente a tiempo.',
  },
  {
    id: 'gobernanza-sesiones-60min-tabs',
    title: 'Gobernanza de Sesiones (60 Minutos), Modal de Aviso y Sincronización Multi-Pestaña',
    category: 'GOBIERNO',
    summary:
      'Seguridad institucional de acceso: detección de inactividad física con cierre forzado a los 60 minutos, aviso modal a los 58 minutos con cuenta regresiva de 120s, sincronización cross-tab por BroadcastChannel y protección de borrador en sessionStorage.',
    stepByStep: [
      '1. El sistema evalúa continuamente la actividad física del operador mediante eventos de teclado, ratón, toques táctiles y scroll.',
      '2. Si transcurren 58 minutos de inactividad, emerge en pantalla el modal "¿Sigues en tu estación de trabajo?" con un temporizador regresivo de 120 segundos.',
      '3. Para continuar trabajando, hacer clic en el botón ámbar "Mantener Sesión Activa" (o mover el ratón/teclear), lo que renovará la sesión inmediatamente.',
      '4. Para salir de forma segura, hacer clic en "Cerrar Ahora".',
      '5. Al cumplirse 60 minutos exactos sin respuesta, la plataforma cierra la sesión automáticamente, redirige al Login y muestra el banner: "Sesión cerrada automáticamente por 60 minutos de inactividad física por motivos de seguridad institucional".',
      '6. Si el usuario estaba llenando un formulario de gasto o arqueo, el borrador queda protegido en sessionStorage y se restaura al reingresar.',
      '7. Sincronización Multi-Pestaña: Si el usuario cierra sesión en una pestaña del navegador o cambia de cuenta, todas las demás pestañas abiertas se sincronizan de inmediato sin inconsistencias.',
    ],
    rules: [
      'Cierre forzado determinista a los 60 minutos de inactividad física ininterrumpida.',
      'Aviso preventivo a los 58 minutos con 120 segundos de cuenta regresiva.',
      'Solo se permite una sesión activa coherente en el navegador.',
      'Borradores de arqueo y gastos preservados frente a cierres por inactividad.',
    ],
    requiredRole: 'TODOS LOS ROLES',
    juniorExplanation:
      'Por seguridad, si te levantas de la computadora y la dejas sola por casi una hora, a los 58 minutos el sistema te pregunta si todavía estás ahí. Si no respondes en 2 minutos, la pantalla se bloquea y se cierra tu cuenta para que nadie toque tu trabajo. Si estabas llenando un formulario de gastos, el sistema te guarda el borrador para que cuando vuelvas a entrar no hayas perdido nada.',
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
  OPEX: 'gastos operativos necesarios para que la empresa funcione a diario (papelería, luz, internet, repuestos, mantenimiento de aires acondicionados).',
  'Arqueo de Gastos': 'revisión y cuadre detallado de todas las facturas y comprobantes pagados durante el mes para saber en qué se gastó el dinero.',
  'Pareto de Gastos': 'análisis que demuestra cuáles 2 o 3 rubros concentran el 80% de los desembolsos de dinero de la empresa.',
  'Microgastos Hormiga': 'gastos pequeños (menores a 15 dólares) que parecen insignificantes pero sumados pueden representar una fuga importante de dinero.',
  'Split-Screen OCR': 'pantalla dividida en dos mitades para ver la foto de la factura a un lado y los datos que leyó el sistema al otro lado antes de guardarla.',
  'Ingesta Chrystal': 'proceso para cargar los archivos de ventas o cierres Z exportados de las cajas registradoras Chrystal al ERP sin cables ni APIs.',
  'Cierre Z': 'reporte final diario que imprimen las cajas registradoras con el total de dinero vendido durante el día.',
  BRM: 'módulo de relación con proveedores (Business Relationship Management) para hablar con ellos, enviarles pedidos y retenciones.',
  FEFO: 'regla que obliga a vender primero los alimentos que se vencen más rápido (First Expired, First Out).',
  'Cadena de Frío': 'mantener la carne, pollo, quesos y congelados siempre a baja temperatura (a menos de 4°C o -18°C) para que no se dañen.',
  SADA: 'código del Sistema Integral de Control Agroalimentario que exige el Estado para transportar alimentos en Venezuela.',
  BOM: 'lista de ingredientes y cantidades necesarias para preparar una receta o producto final en panadería o charcutería.',
  'Retención SENIAT': 'porcentaje de impuesto (IVA o ISLR) que la empresa le retiene al proveedor en la factura para enterarlo directamente al fisco.',
  'Gobernanza de Sesiones': 'regla de seguridad que cierra la sesión si la computadora se queda sola por más de una hora para que nadie use tu cuenta.',
};
