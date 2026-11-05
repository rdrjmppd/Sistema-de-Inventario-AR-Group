# Manual de Usuario y Especificaciones Operativas — Chrystal® Enterprise Food Retail ERP

**Edición Venezuela | Versión Oficial 5.0 Enterprise**  
**Empresa**: Hiper Abasto Polar, C.A. (RIF: J-50123456-7 | SADA: SADA-049821)  
**Sede Principal**: Av. Intercomunal, Sector La Morita, Maracay, Edo. Aragua, Venezuela  
**Desarrollado por**: AR Group  
**Copyright Legal**: © 2026 AR Group. Todos los derechos de desarrollo reservados.  
**Cerebro Central de Asistencia**: PolarBot (Asistente Inteligente de Soporte Operativo y Gobernanza)

---

## Índice General de Secciones
1. [Principios Rectores, Identidad y Aritmética Financiera](#1-principios-rectores-identidad-y-aritmética-financiera)
2. [Gobernanza de Seguridad, Roles RBAC y Token Dinámico TOTP](#2-gobernanza-de-seguridad-roles-rbac-y-token-dinámico-totp)
3. [Dashboard Ejecutivo y Flujo de Caja Bimonetario (USD/VES)](#3-dashboard-ejecutivo-y-flujo-de-caja-bimonetario-usdves)
4. [Catálogo Maestro de Productos (SKU) y Precios de Venta (PVP)](#4-catálogo-maestro-de-productos-sku-y-precios-de-venta-pvp)
5. [Multi-Sedes, Depósitos y Transferencias Internas](#5-multi-sedes-depósitos-y-transferencias-internas)
6. [Control de Existencias en Anaquel y Balanzas de Peso / Precio](#6-control-de-existencias-en-anaquel-y-balanzas-de-peso--precio)
7. [Descargas y Bajas de Inventario (Doble Firma Anti-Fraude)](#7-descargas-y-bajas-de-inventario-doble-firma-anti-fraude)
8. [Auditoría Forense OCR de Comprobantes de Pago (4 Candados)](#8-auditoría-forense-ocr-de-comprobantes-de-pago-4-candados)
9. [Validación Visual Split-Screen OCR y Pre-Asiento de Facturas](#9-validación-visual-split-screen-ocr-y-pre-asiento-de-facturas)
10. [Retenciones Fiscales SENIAT (IVA 75%/100% e ISLR) y Archivos TXT](#10-retenciones-fiscales-seniat-iva-75100-e-islr-y-archivos-txt)
11. [Conciliación Bancaria Bimonetaria (USD/VES + IGTF 3%)](#11-conciliación-bancaria-bimonetaria-usdves--igtf-3)
12. [Pasarela WhatsApp BRM Multi-Device (WhatsApp Web Baileys)](#12-pasarela-whatsapp-brm-multi-device-whatsapp-web-baileys)
13. [Ingesta Desacoplada de Ventas Chrystal® POS (Excel/CSV)](#13-ingesta-desacoplada-de-ventas-chrystal-pos-excelcsv)
14. [Conector de Impresoras Fiscales SENIAT (SNAT/2024/000102)](#14-conector-de-impresoras-fiscales-seniat-snat2024000102)
15. [Rendimiento Cárnico Multi-Especie (Desposte de Res, Cerdo y Pollo)](#15-rendimiento-cárnico-multi-especie-desposte-de-res-cerdo-y-pollo)
16. [Rendimiento de Frutas y Verduras Fruver (5 Mermas y Absorción)](#16-rendimiento-de-frutas-y-verduras-fruver-5-mermas-y-absorción)
17. [Cadena de Frío, Lotes Perecederos FEFO y Guías SADA](#17-cadena-de-frío-lotes-perecederos-fefo-y-guías-sada)
18. [Recetas de Producción y Fórmulas BOM (Panadería y Charcutería)](#18-recetas-de-producción-y-fórmulas-bom-panadería-y-charcutería)
19. [Control de Gastos Operativos (OPEX), Aprobación y Resguardo Drive](#19-control-de-gastos-operativos-opex-aprobación-y-resguardo-drive)
20. [Análisis de Rotación ABC, Curva de Pareto y Sugerencias de Compra](#20-análisis-de-rotación-abc-curva-de-pareto-y-sugerencias-de-compra)
21. [Cuentas por Pagar (CxP), Catálogo BRM y Órdenes de Compra](#21-cuentas-por-pagar-cxp-catálogo-brm-y-órdenes-de-compra)
22. [Cierre Mensual Contable e Inventario Fiscal](#22-cierre-mensual-contable-e-inventario-fiscal)
23. [Exportaciones Oficiales Excel OpenXML y PDF con Marca de Agua Polar](#23-exportaciones-oficiales-excel-openxml-y-pdf-con-marca-de-agua-polar)
24. [Gobernanza de Sesiones (60 Minutos), Latido y Multi-Pestaña](#24-gobernanza-de-sesiones-60-minutos-latido-y-multi-pestaña)
25. [PolarBot: Cerebro de Asistencia y Protocolo Empático](#25-polarbot-cerebro-de-asistencia-y-protocolo-empático)
26. [Glosario Oficial de Términos](#26-glosario-oficial-de-términos)

---

## 1. Principios Rectores, Identidad y Aritmética Financiera

### 1.1 Aritmética Exacta Decimal.js (Cero Deriva en Céntimos)
- Todo cálculo monetario, conversión cambiaria, alícuota de impuesto, nómina o coste se ejecuta mediante aritmética decimal pura utilizando la librería `Decimal.js` bajo el modo de redondeo financiero estricto `ROUND_HALF_UP` (redondeo bancario a 2 decimales exactos).
- **Prohibición Universal**: Queda estrictamente prohibido utilizar punto flotante nativo de JavaScript (`0.1 + 0.2`) para valores financieros, garantizando que jamás se pierda ni se sume un solo céntimo en conciliaciones o balances.

### 1.2 Regla Horaria Oficial BCV 17:00 VET (5:00 PM Caracas)
- La plataforma consulta la tasa oficial del Banco Central de Venezuela (BCV).
- De lunes a viernes antes de las 17:00 VET (5:00 PM hora legal de Caracas), rige la **Tasa Spot de la Jornada**.
- A partir de las 17:00 VET (5:00 PM), el sistema conmuta de forma automática y determinista a la **Tasa Oficial del Siguiente Día Hábil** publicada por el BCV.
- Todos los precios de venta al público (PVP) en Bolívares (VES) y la valorización de inventario se sincronizan en tiempo real al conmutar la tasa.

---

## 2. Gobernanza de Seguridad, Roles RBAC y Token Dinámico TOTP

### 2.1 Matriz de Roles y Privilegios (RBAC)
- **SUPERADMIN**: Control total del sistema, configuración de sedes, reinicio de fábrica, gestión de usuarios, auditoría forense y autorizaciones gerenciales.
- **GERENTE**: Aprobación de bajas de inventario con PIN confidencial, autorización de gastos OPEX > $100 USD, firmas contables y arqueos mensuales.
- **ANALISTA**: Operación de inventario, pre-registro de bajas, registro de gastos, importación de ventas POS, generación de retenciones SENIAT y gestión de WhatsApp BRM.
- **SUPERVISOR DE CARNICERÍA**: Pesaje de canales, desposte de res, cerdo y pollo, y control de mermas técnicas en frigoríficos.
- **SUPERVISOR DE FRUVER**: Recepción de lotes agrícolas, registro de mermas por las 5 causas específicas y absorción de costo en mostrador.
- **SUPERVISOR DE PASILLO**: Control de anaqueles, transferencias y reposición desde cavas.
- **OBSERVADOR**: Perfil de solo lectura para auditorías externas o directores sin facultades de modificación.

### 2.2 Token Dinámico TOTP Offline (RFC 6238)
- Implementación de seguridad matemática offline bajo el estándar RFC 6238 (HMAC-SHA1, 6 dígitos, ventana de validez de ±30 segundos).
- Permite a la Gerencia autorizar operaciones críticas (Sinceración de inventario, Bajas por siniestro, Anulación fiscal de facturas) aun cuando la sede sufra caída total de conectividad a internet.
- En la sección **"Configuración & Auditoría"**, el Gerente puede escanear su código QR en cualquier app autenticadora (Google Authenticator, Microsoft Authenticator) para enrolar su dispositivo de forma permanente.

---

## 3. Dashboard Ejecutivo y Flujo de Caja Bimonetario (USD/VES)

### 3.1 Panel de Métricas e Indicadores Clave (KPIs)
- Lectura en menos de 5 segundos con números tabulares (`tabular-nums`).
- Muestra existencias totales, valorización del inventario en USD y VES a tasa BCV activa, SKUs en quiebre de stock por debajo del punto de reorden y solicitudes pendientes de firma gerencial.

### 3.2 Flujo de Caja Bimonetario Proyectado a 7, 15 y 30 Días
- Selector de moneda dinámico: Dólares ($ USD) o Bolívares (Bs. VES).
- Horizontes de proyección financiera:
  1. **Inmediato (Hoy)**: Liquidez real en bancos frente a deudas exigibles hoy.
  2. **Próximos 7 Días**: Compromisos a corto plazo con proveedores de reposición rápida.
  3. **Próximos 15 Días (Quincena SENIAT)**: Provisiones fiscales de retenciones de IVA/ISLR y facturas con crédito quincenal.
  4. **Próximos 30 Días**: Cierre mensual proyectado y obligaciones globales.
- Criterio conservador estricto: Compara saldos disponibles contra pasivos reales, sin asumir ingresos futuros inciertos de ventas no recaudadas.

---

## 4. Catálogo Maestro de Productos (SKU) y Precios de Venta (PVP)

### 4.1 Registro de Nuevos Productos
1. Ingresar en el menú lateral a **"Inventario > Catálogo Maestro SKU"**.
2. Hacer clic en el botón verde superior **"+ Nuevo Producto"**.
3. Rellenar los campos requeridos:
   - **SKU Alfanumérico Único**: Ej. `HAP-HAR-001`.
   - **Código de Barras EAN-13**: Lectura directa con pistola lectora o digitación.
   - **Nombre Comercial y Descripción**: Ej. *Harina de Maíz Blanco Precocida 1 Kg*.
   - **Categoría**: Seleccionar entre *VÍVERES*, *LÁCTEOS*, *CARNICERÍA*, *FRUVER*, *PANADERÍA*, etc.
   - **Unidad de Medida**: `UND`, `KG`, `LT`, `CAJA`, `BULTO`.
   - **Costo Unitario en USD**: Costo de compra según factura del proveedor.
   - **Margen Objetivo (%)**: Porcentaje de ganancia deseado.
   - **Alícuota de IVA SENIAT**: *Exento (0%)* para canasta básica alimentaria, *Reducido (8%)* o *General (16%)*.
   - **Stock Mínimo de Alarma (Punto de Reorden)**: Cantidad crítica por sede para disparar alarmas.
4. El sistema calcula en vivo mediante Decimal.js:
   $$\text{PVP USD} = \frac{\text{Costo USD}}{1 - (\text{Margen \%} / 100)}$$
   $$\text{PVP VES} = \text{PVP USD} \times \text{Tasa BCV Activa}$$
5. Hacer clic en **"Guardar Producto"**.

---

## 5. Multi-Sedes, Depósitos y Transferencias Internas

### 5.1 Gestión Multi-Sede
- Administra existencias independientes para depósitos mayoristas, cavas frigoríficas y sucursales comerciales.
- Cada sede cuenta con inventario físico segregado y alarmas individuales de quiebre.

### 5.2 Transferencias Internas entre Sedes
1. Ir a **"Operaciones > Transferencias Internas"**.
2. Pulsar **"+ Nueva Transferencia"**.
3. Seleccionar la **Sede Origen** y la **Sede Destino**.
4. Agregar los SKUs y cantidades a trasladar. El sistema verifica que la sede origen posea existencias suficientes.
5. Pulsar **"Emitir Guía de Transferencia"**. El stock en origen queda en estado *En Tránsito*.
6. La sede receptora abre la transferencia y pulsa **"Confirmar Recepción y Asentar Stock"** tras verificar físicamente la mercancía.

---

## 6. Control de Existencias en Anaquel y Balanzas de Peso / Precio

### 6.1 Surtido desde Cava / Depósito a Piso de Venta
1. Ir a **"Inventario > Control de Anaqueles"**.
2. Seleccionar el producto y pulsar **"Surtir Anaquel"**.
3. Indicar la cantidad que sale de la Cava Central hacia el anaquel o vitrina expositora.

### 6.2 Integración con Balanzas Digitales de Códigos 20 y 21
- El sistema reconoce etiquetas generadas por balanzas comerciales (Torrey, Dibal, Toledo):
  - **Prefijo 20**: Códigos de barra con peso incorporado (`20 + SKU(5) + PESO(5) + D`).
  - **Prefijo 21**: Códigos de barra con precio total incorporado (`21 + SKU(5) + MONTO(5) + D`).
- Al leer una etiqueta con el lector láser en caja, el sistema desglosa automáticamente los kilos netos o el importe monetario para descontar el peso exacto del inventario.

---

## 7. Descargas y Bajas de Inventario (Doble Firma Anti-Fraude)

### 7.1 Protocolo de Desincorporación Física
Ninguna mercancía dañada, vencida o siniestrada puede descontarse de existencias por un único usuario. Opera bajo doble firma obligatoria:

#### Paso 1: Pre-registro por el Analista
1. Ir a **"Inteligencia y Gobierno > Descargas & Bajas"**.
2. Hacer clic en **"+ Nueva Solicitud de Descarga"**.
3. Seleccionar la Sede, el SKU y la cantidad física deteriorada.
4. Seleccionar la causa oficial:
   - `VENCIMIENTO_CADUCIDAD` (Producto vencido según lote).
   - `DETERIORO_EMPAQUE_CONTENEDOR` (Bolsa rota, lata abollada o rotura).
   - `ACCIDENTE_MALA_MANIPULACION` (Caída de estiba o montacargas).
   - `MERMA_CADENA_FRIO` (Falla eléctrica o daño en cava).
   - `ERROR_CARGA_SISTEMA` (Discrepancia documentada en conteo).
5. Escribir la justificación detallada obligatoria y pulsar **"Registrar Solicitud"**.
6. La solicitud queda en estado **PENDIENTE_AUTORIZACION** sin descontar el stock físico.

#### Paso 2: Autorización o Rechazo Gerencial
1. El Gerente o Superadmin abre la solicitud pendiente.
2. Revisa la pérdida valorizada en USD y Bolívares.
3. Introduce su **PIN confidencial de 4 a 6 dígitos**.
4. Si aprueba, pulsa **"Firmar y Autorizar Baja Definitiva"**: el stock se descuenta en Kardex y se emite el Acta Oficial en PDF y Excel con logotipo y sellos.
5. Si desaprueba, pulsa **"Rechazar Solicitud"** e ingresa el motivo: el stock permanece intacto.

---

## 8. Auditoría Forense OCR de Comprobantes de Pago (4 Candados)

### 8.1 Motor de Análisis de Veracidad y Anti-Fraude
Diseñado para auditar capturas de transferencias, Pago Móvil y Zelle. Aplica 4 candados forenses incondicionales:
1. **Candado 1 (Huella SHA-256)**: Comprueba que el archivo no haya sido procesado previamente en el sistema.
2. **Candado 2 (Hash Perceptual pHash)**: Detecta imágenes visualmente duplicadas o reutilizadas por clientes.
3. **Candado 3 (Inspección EXIF/JFIF)**: Revisa firmas de software de edición digital (Photoshop, Canva, editores web) o imágenes generadas por IA.
4. **Candado 4 (Peritaje Multimodal IA y Dictamen)**: Extrae banco emisor, banco receptor, número de referencia, fecha y monto, asignando un puntaje (0-100) y dictamen:
   - `AUTENTICO_ALTA_CONFIANZA` (90 a 100 puntos): Pago verificado.
   - `SOSPECHOSO_REVISION_HUMANA` (60 a 89 puntos): Discrepancias tipográficas o de metadatos.
   - `ALERTA_FRAUDE_EDICION_O_IA` (0 a 59 puntos): Bloqueo inmediato por manipulación digital.

---

## 9. Validación Visual Split-Screen OCR y Pre-Asiento de Facturas

### 9.1 Procedimiento de Carga y Cotejo
1. Ir a **"Facturas & OCR"** en el menú lateral.
2. Hacer clic en **"Cargar Factura / Comprobante"** y subir el documento escaneado (JPG, PNG o PDF).
3. **Visor Split-Screen**: En computadoras de escritorio, la pantalla se divide al 50% mostrando el documento original a la izquierda y los campos extraídos a la derecha. En dispositivos móviles, se conmuta con las pestañas *📄 Ver Documento Original* y *✍️ Datos Extraídos*.
4. Verificar RIF, Número de Factura, Número de Control, Base Imponible, Exento e IVA (16%).
5. **Aprobación**: Hacer clic en el botón verde **"Aprobar y Asentar Factura"** para ingresar el inventario y generar la cuenta por pagar en Libro Mayor.
6. **Rechazo**: Hacer clic en el botón rojo **"Rechazar Comprobante"** e indicar el motivo de descarte.

---

## 10. Retenciones Fiscales SENIAT (IVA 75%/100% e ISLR) y Archivos TXT

### 10.1 Emisión y Despacho de Comprobantes
1. Ir a **"Retenciones SENIAT"** en el menú lateral.
2. Localizar la factura de compra del proveedor en la lista de pendientes.
3. Seleccionar el porcentaje de retención de IVA: **75%** (general para Contribuyentes Especiales) o **100%** (proveedores sin RIF actualizado o compras a personas naturales).
4. El sistema calcula automáticamente la retención de ISLR según la actividad del proveedor (Decreto 1808).
5. Hacer clic en **"Generar Comprobante de Retención"**. El sistema asigna el correlativo fiscal oficial de 14 dígitos (`AAAAMMNºCorrelativo`).
6. Hacer clic en **"Descargar PDF Oficial"** para imprimir o archivar.
7. Hacer clic en **"Generar TXT SENIAT"** para exportar el archivo listo para cargar en el portal fiscal del SENIAT.
8. Hacer clic en **"Exportar a BRM WhatsApp"** para transferir el comprobante directamente al chat del proveedor.

---

## 11. Conciliación Bancaria Bimonetaria (USD/VES + IGTF 3%)

### 11.1 Cuadre de Bancos y Pre-Conciliación
1. Ir a **"Conciliación Bancaria"** en el menú lateral.
2. Subir el extracto bancario oficial en formato Excel o CSV mediante el botón **"Cargar Extracto Bancario"**.
3. El sistema cruza automáticamente los débitos y créditos contra el Libro Mayor de la empresa.
4. **Verificación de IGTF (3%)**: Identifica de forma independiente las percepciones del 3% en transacciones en divisas.
5. **Bandeja de Pre-Conciliación OCR**: Los pagos aprobados por el módulo OCR entran en estado `pendiente_verificacion`. El analista financiero revisa el cruce con el extracto y pulsa **"Conciliar y Asentar en Libro Mayor"**.

---

## 12. Pasarela WhatsApp BRM Multi-Device (WhatsApp Web Baileys)

### 12.1 Arquitectura y Resiliencia
- Pasarela basada en socket WebSocket nativo `@whiskeysockets/baileys` alojada en el servidor, comunicada con el navegador mediante Server-Sent Events (SSE) en tiempo real (<5ms).
- Opera bajo el principio **Single Source of Truth (SSoT)**: el servidor gestiona el socket y el almacén duradero (`chat_messages_history.json`), evitando split-brain entre terminales.

### 12.2 Procedimiento de Vinculación con Código QR ISO/IEC 18004
1. Ir a **"Proveedores & BRM"** en el menú lateral.
2. En la barra superior, pulsar el botón verde **"Vincular WhatsApp BRM"**.
3. En la ventana emergente aparecerá el Código QR auténtico generado bajo estándar ISO/IEC 18004.
4. En el smartphone de la empresa, abrir **WhatsApp > Menú (tres puntos) > Dispositivos vinculados > Vincular un dispositivo**.
5. Apuntar la cámara al código QR. Al escanearse, el estado conmuta automáticamente a **CONECTADO** y se muestra el número telefónico enlazado.

### 12.3 Interacción en el Chat y Reproducción de Notas de Voz
- Al seleccionar cualquier contacto del directorio izquierdo, se despliega el historial completo de la conversación.
- **Notas de Voz**: Los mensajes de audio se reproducen directamente en la plataforma mediante el reproductor integrado (`WhatsAppAudioMessagePlayer`), con barra de progreso, control de tiempo y velocidad de reproducción (1x, 1.5x, 2x).

### 12.4 Resuelto de Nombres y Guardado de Nuevos Proveedores
- Los contactos guardados en la libreta del smartphone se resuelven automáticamente con su nombre real en la lista de chats.
- Si entra un mensaje de un número no registrado en el catálogo del ERP, la plataforma despliega el botón **"Guardar como Proveedor"** en la cabecera. Al pulsarlo, abre el formulario prellenado para registrar al nuevo proveedor formalmente en AR Group.

### 12.5 Gestor de Plantillas Rápidas Personalizadas
- Barra horizontal con desplazamiento lateral (*scroll*) ubicada sobre el campo de texto.
- Incluye plantillas predeterminadas de un clic: *Pago Procesado*, *Comprobante de Retención SENIAT*, *Aviso de Descarga en Andén*, *Estado de Cuenta CxP*.
- **Personalización**: Al hacer clic en el botón **"Gestionar"** (icono de engranaje), se abre el gestor modal para:
  1. Agregar nuevas plantillas con título, icono y texto.
  2. Editar plantillas existentes.
  3. Utilizar variables dinámicas: `{proveedor}`, `{monto}`, `{rif}`, `{telefono}`, las cuales se reemplazan automáticamente con los datos reales del proveedor activo.
  4. Eliminar plantillas obsoletas.

### 12.6 Eliminación Asimétrica Duradera de Chats
- En la cabecera del chat, hacer clic en el botón rojo **"Eliminar Chat"** (icono de papelera).
- El sistema solicita confirmación en modal. Al confirmar:
  - Elimina físicamente los mensajes en el almacén duradero en disco (`chat_messages_history.json`) y en la memoria del servidor.
  - Emite el evento SSE `chat_deleted`, limpiando el historial en pantalla en todas las pestañas abiertas.
  - La conversación desaparece de la vista del ERP sin alterar el historial propio del teléfono del proveedor.

### 12.7 Desvinculación Limpia, Purga y Pantalla Inactiva Protegida
- Al pulsar el botón **"Desvincular"**:
  1. Se destruye el socket de Baileys de forma segura.
  2. Se purgan en disco las credenciales Signal, el historial `chat_messages_history.json`, la cola pendiente y la caché de contactos.
  3. El frontend vacía su estado local y elimina las claves de `localStorage`.
  4. **Protección de Privacidad**: En el directorio lateral desaparecen todos los chats informales y números móviles en crudo (`+5...`), mostrando únicamente los proveedores oficiales del catálogo ERP.
  5. En el panel central de conversación, se bloquean los mensajes y el formulario de envío, mostrando la pantalla ejecutiva de seguridad: **"Dispositivo WhatsApp no vinculado"** con el botón directo para volver a escanear el QR.

---

## 13. Ingesta Desacoplada de Ventas Chrystal® POS (Excel/CSV)

### 13.1 Carga de Ventas Diarias sin Conexión Directa
1. Exportar el reporte diario de ventas o cierre Z desde las cajas del sistema Chrystal POS en formato Excel (`.xlsx`, `.xls`) o CSV.
2. Ir a **"Importación Chrystal POS"** en el menú lateral.
3. Pulsar **"Seleccionar Archivo de Ventas Chrystal"** o arrastrar el archivo al área punteada.
4. El motor detecta automáticamente columnas de código, descripción, cantidad y precio.
5. Pulsar **"Simular y Validar Conciliación"**: muestra el resumen de ventas, montos en USD/VES y lista de advertencia de ítems no registrados.
6. Pulsar el botón azul **"Ejecutar Descarga en Inventario"**: el sistema descuenta las existencias físicas en Kardex de los productos reconocidos de forma ininterrumpida.

---

## 14. Conector de Impresoras Fiscales SENIAT (SNAT/2024/000102)

### 14.1 Emisión Fiscal y Cierre Z
- Conector homologado bajo normativa SENIAT SNAT/2024/000102 para impresoras The Factory HKA, Bixolon, Dascom y BMC.
- Genera firmas HMAC-SHA256 para cada comando fiscal.
- Maneja alícuotas General (16%), Reducida (8%), Exento (0%) y percepción del IGTF (3%).
- Emisión de Cierres Z diarios con idempotencia (evita duplicar el cierre fiscal) y exportación automática del Libro de Ventas en formato `.xlsx`.

---

## 15. Rendimiento Cárnico Multi-Especie (Desposte de Res, Cerdo y Pollo)

### 15.1 Protocolo de Despiece y Costeo Relativo
Ubicado en **"Operaciones > Rendimiento Cárnico"**. Transforma canales completas en cortes comerciales salables con costeo exacto por valor relativo:

#### A. Especie POLLO (Aves)
- **Cortes Salables**: Pechuga (entera o milanesas finas, absorbe el mayor valor $/kg), Muslos y Contramuslos (cuartos traseros), Alas, Rabadilla/Carcasa (sopa), Menudencias (hígado, molleja, corazón), Piel y Grasa.
- **Mermas Técnicas**: Sangría residual, evaporación en cava fría y exceso de agua por inmersión.
- **Calculadora de Compra**: Permite ingresar los kilos proyectados de milanesa requeridos para el fin de semana y calcula cuántos pollos beneficiados enteros pedir al matadero.

#### B. Especie RES (Vacuno)
- **Cortes Salables**: Solomo de Cuerito, Lomito, Chocozuela, Pulpa Negra, Costilla, Lagarto, Pecho, Falda.
- **Mermas Técnicas**: Hueso Blanco de desecho, Hueso Rojo, Grasa/Sebo excedente, Aserrín de corte en sierra y Merma por oreo/evaporación.

#### C. Especie CERDO (Porcino)
- **Cortes Salables**: Pernil, Paleta, Lomo, Chuletas de aguja y lomo, Costillitas parrilleras, Tocino/Panceta, Papada, Cuero y Patas.
- **Mermas Técnicas**: Grasa/manteca, hueso blanco y aserrín de sierra.

---

## 16. Rendimiento de Frutas y Verduras Fruver (5 Mermas y Absorción)

### 16.1 Control de Lotes Agrícolas y Mermas
Ubicado en **"Operaciones > Rendimiento Frutas y Verduras"**. Clasifica los descartes diarios bajo 5 causas específicas:
1. `DESHIDRATACION_PERDIDA_PESO` (Pérdida natural de humedad por temperatura ambiente).
2. `DANO_EXCESO_FRIO` (Quemadura por congelación o exceso de frío en cava).
3. `DANO_EXCESO_CALOR` (Fermentación y pudrición acelerada por calor).
4. `DANO_MECANICO_MANIPULACION` (Aplastamiento, golpes o magulladuras en cestas/estibas).
5. `EXCESO_DIAS_EXPOSICION_ROTACION` (Sobremaduración en anaquel por baja rotación).

### 16.2 Absorción de Costo en PVP
El costo de los kilos perdidos se absorbe automáticamente en los kilos vendibles restantes:
$$\text{Costo Unitario Efectivo} = \frac{\text{Costo Total del Lote}}{\text{Kilos Netos Vendibles}}$$
Garantiza que el negocio mantenga su margen bruto intacto sin sufrir pérdidas invisibles.

---

## 17. Cadena de Frío, Lotes Perecederos FEFO y Guías SADA

### 17.1 Protocolo FEFO (First Expired, First Out)
- Ubicado en **"Lotes & Cadena de Frío"**.
- Todo producto perecedero ingresa con su fecha de vencimiento y lote de fabricación.
- **Semáforo FEFO**:
  - **Rojo**: Menos de 30 días de vida útil (prioridad máxima de despacho a anaquel).
  - **Amarillo**: Entre 31 y 60 días de vida útil.
  - **Verde**: Más de 60 días de vida útil.
- Monitoreo continuo de cavas de congelación (-18°C a -22°C) y conservación (0°C a 4°C).
- Vinculación de Guías de Movilización Sunagro SADA con el botón **"Vincular Guía Oficial"**.

---

## 18. Recetas de Producción y Fórmulas BOM (Panadería y Charcutería)

### 18.1 Manufactura Interna y Explosión de Materiales
- Ubicado en **"Recetas y Producción"**.
- Estructura Listas de Materiales (*Bill of Materials - BOM*): ej. Harina de Trigo, Levadura, Manteca, Azúcar y Sal para Pan Canilla.
- Calcula el Costo Unitario de Producción según el costo promedio ponderado de los insumos.
- Al ejecutar una orden de horneado o elaboración, pulsar **"Procesar y Descontar Insumos"**: descuenta automáticamente las materias primas del almacén de producción e ingresa las unidades terminadas al inventario de venta.

---

## 19. Control de Gastos Operativos (OPEX), Aprobación y Resguardo Drive

### 19.1 Registro de Egresos y Doble Firma
1. Ir a **"Control de Gastos"**.
2. En la sub-pestaña **"Registro y Carga de Gasto"**, pulsar **"Subir Factura o Ticket Escaneado"** para prellenar datos con OCR.
3. Seleccionar categoría (Oficina, Mantenimiento, A/C, Cómputo, Servicios Públicos, Fletes, Legal).
4. Indicar condición de pago (Contado o Crédito con días y descuentos por pronto pago o mora) y monto.
5. **Doble Firma Gerencial (> $100 USD)**: Si el monto supera los $100 USD, se requiere PIN de Gerencia. El analista puede pulsar **"+ Registrar Gasto"** para enviarlo a la **"Bandeja de Aprobación (> $100 USD)"**, donde el Gerente pulsa **"Firmar y Aprobar Gasto"**.
6. **Resguardo en Google Drive**: En la ventana emergente, pulsar **"Copiar Ruta Sugerida"** (`PROVEEDOR/AÑO-MES`) y confirmar con **"Marcar Resguardo Realizado"**.
7. En la sub-pestaña **"Libro Mayor de Gastos"**, pulsar **"Registrar Pago"** para asentar la salida de fondos.
8. En **"Arqueo Mensual"**, descargar el reporte en PDF o Excel con análisis de Pareto y microgastos hormiga.

---

## 20. Análisis de Rotación ABC, Curva de Pareto y Sugerencias de Compra

### 20.1 Clasificación Pareto ABC de Inventario
- Ubicado en **"Inteligencia y Gobierno > Rotación ABC"**.
- **Clase A**: Representa el 80% del valor de las ventas de la empresa (control estricto y cero quiebres).
- **Clase B**: Representa el 15% del valor de ventas (rotación intermedia).
- **Clase C**: Representa el 5% del valor de ventas (productos de baja rotación o consumo ocasional).

### 20.2 Simulador de Compras Futuras (7, 15, 30, 45 y 60 Días)
- Ubicado en **"Sugerencias de Compra"**.
- Proyecta de forma monotónica las compras necesarias según el consumo diario promedio real y el tiempo de reposición del proveedor, evitando sobre-stock y desabastecimiento.

---

## 21. Cuentas por Pagar (CxP), Catálogo BRM y Órdenes de Compra

### 21.1 Gestión de Obligaciones con Proveedores
- Ubicado en **"Finanzas > Cuentas por Pagar"**.
- Control de fechas de vencimiento de facturas, amortizaciones parciales en bolívares o dólares a tasa oficial BCV y cálculo de retenciones pendientes.
- **Centro de Órdenes de Compra**: Emisión formal de pedidos con código correlativo, aprobación gerencial y exportación directa a WhatsApp BRM.

---

## 22. Cierre Mensual Contable e Inventario Fiscal

### 22.1 Valorización de Cierre de Mes
- Ubicado en **"Contabilidad > Cierre Mensual"**.
- Realiza el corte contable de existencias físicas al último día del mes a las 23:59 VET.
- Genera el Libro de Inventario Fiscal exigido por la administración tributaria valorizado a tasa oficial BCV de cierre de mes.

---

## 23. Exportaciones Oficiales Excel OpenXML y PDF con Marca de Agua Polar

### 23.1 Especificaciones de Exportación
- **Excel OpenXML (`.xlsx`)**: Formato multi-hoja con bordes ejecutivos coloreados, membrete fiscal oficial de Hiper Abasto Polar, C.A., y fichas de producto estructuradas.
- **PDF Ejecutivo**: Renderizado vectorial con encabezado institucional, logotipo oficial de la empresa, marca de agua central al 7% de opacidad y pie de página legal inmutable (`© 2026 AR Group. Todos los derechos de desarrollo reservados`).

---

## 24. Gobernanza de Sesiones (60 Minutos), Latido y Multi-Pestaña

### 24.1 Seguridad de Conexión Física
- Emisión de latido (*heartbeat*) cada 60 segundos.
- **Modal Preventivo a los 58 Minutos**: Tras 58 minutos sin actividad física (teclado, ratón o toques táctiles), emerge el modal con cuenta regresiva de 120 segundos y botones **"Mantener Sesión Activa"** y **"Cerrar Ahora"**.
- **Cierre Forzado a los 60 Minutos**: Si se agota el tiempo, el sistema cierra la sesión y redirige al Login protegiendo la estación de trabajo.
- **Preservación de Borrador**: Los formularios de gastos o arqueos no guardados se resguardan en `sessionStorage` para restaurarse al volver a iniciar sesión.
- **Sincronización Multi-Pestaña**: Conexión vía `BroadcastChannel` que replica cierres de sesión de inmediato en todas las pestañas abiertas del navegador.

---

## 25. PolarBot: Cerebro de Asistencia y Protocolo Empático

### 25.1 Identidad y Tono de PolarBot
- PolarBot es el Asistente Inteligente y Brazo Derecho Operativo de **Chrystal® ERP**.
- Su trato es masculino, empático, cercano, profesional y altamente racional.
- Inicia siempre dirigiéndose al usuario por su nombre real y adaptando su asesoría al rol que ejerce.
- Añade explicaciones coloquiales y sencillas entre paréntesis para términos técnicos.

### 25.2 Protocolo de Guías Paso a Paso
Cuando el usuario solicita ayuda ("¿cómo hago para...?", "¿dónde le doy para...?", "¿cuáles son los pasos para...?"), PolarBot responde obligatoriamente con:
1. Una lista enumerada paso a paso (1., 2., 3., etc.).
2. El nombre exacto de la pestaña o menú lateral.
3. El nombre exacto de los botones en negrita (ej. **"+ Registrar Gasto"**, **"Vincular WhatsApp BRM"**, **"Aprobar y Asentar Factura"**, **"Eliminar Chat"**).
4. La advertencia de si requiere rol de Gerente o PIN confidencial.

### 25.3 Protocolo Empático de Fallback (Consultas Fuera de Alcance o Sin Información)
Si el usuario realiza una consulta cuya información no forma parte del ERP o excede su base de conocimientos confirmable, PolarBot no emite respuestas secas ni cortantes. Responde con calidez bajo la siguiente estructura empática:
> *"Hola [Nombre]. Comprendo tu inquietud sobre [Tema]. Sin embargo, esa información no forma parte de la operativa interna de Chrystal® ERP y no dispongo de una fuente confirmable para darte una cifra exacta o respuesta oficial. Con mucho gusto, dentro del sistema sí puedo orientarte en [temas operativos relacionados que sí domina, ej: existencias de productos, tasa oficial BCV, solicitud de bajas con doble firma, pasarela WhatsApp BRM o control de gastos OPEX]. ¿Deseas que revisemos alguno de estos puntos?"*

---

## 26. Glosario Oficial de Términos
- **SKU**: Código alfanumérico único que identifica cada presentación de producto para evitar confusiones.
- **PVP**: Precio de Venta al Público en mostrador con margen e impuestos incluidos.
- **Merma**: Pérdida física de mercancía por deterioro, rotura o vencimiento que no puede venderse.
- **Punto de Reorden**: Existencia mínima de seguridad en depósito que dispara el pedido de reposición al proveedor.
- **Doble Firma**: Mecanismo de control interno donde un analista solicita una operación y un gerente la autoriza con PIN.
- **OCR**: Reconocimiento Óptico de Caracteres para digitalizar facturas y comprobantes automáticamente.
- **Desposte**: Proceso cárnico de despiece de una canal en cortes limpios salables y mermas.
- **Fruver**: Área especializada en frutas, verduras y hortalizas perecederas.
- **FEFO**: *First Expired, First Out* — regla que prioriza la venta de los productos que vencen primero.
- **BOM**: *Bill of Materials* — lista de materiales e insumos necesarios para fabricar una receta.
- **OPEX**: Gastos operativos de funcionamiento regular de la empresa.
- **SADA**: Sistema Integral de Control Agroalimentario administrado por Sunagro para el traslado de alimentos.
- **Baileys**: Pasarela WebSocket que conecta WhatsApp Web con la plataforma ERP sin intermediarios externos.
- **E.164**: Estándar internacional para números telefónicos (`+58412...`).
- **SSE**: *Server-Sent Events* — transmisión de datos del servidor al navegador en tiempo real (<5ms).
- **TOTP**: *Time-based One-Time Password* — token dinámico de 6 dígitos que cambia cada 30 segundos para autorizaciones offline.
