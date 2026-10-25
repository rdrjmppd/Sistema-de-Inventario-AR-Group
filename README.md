<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />

# Chrystal® Enterprise Food Retail ERP (Edición Venezuela 2026)
**Plataforma Bimonetaria (USD / VES BCV) Multi-Sede con Compatibilidad Chrystal®, Auditoría Forense OCR 4 Candados, Respaldos Cifrados y Gobernanza Antigravity 2.0**

[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-19-cyan.svg)](https://react.dev/)
[![TailwindCSS](https://img.shields.io/badge/Tailwind-4.x-38bdf8.svg)](https://tailwindcss.com/)
[![Tests](https://img.shields.io/badge/Tests-17%2F17%20Passed-emerald.svg)](https://nodejs.org/api/test.html)
[![License](https://img.shields.io/badge/License-Proprietary%20AR%20Group-0f172a.svg)](#)

*Copyright © 2026 AR Group. Todos los derechos de desarrollo reservados.*
</div>

---

## 🏛️ Gobernanza Técnica — Ecosistema de 11 Agentes Especializados (`AGENTS.md`)
Este repositorio está gobernado por el equipo multidisciplinario de 11 agentes de Antigravity 2.0:
1. **`@Orquestador`**: Planificación de arquitectura desacoplada, gestión de entorno y garantía de Cero Colisiones.
2. **`@Finanzas`**: Aritmética decimal exacta con `Decimal.js` (`ROUND_HALF_UP`), conector en tiempo real BCV (Regla de las 5:00 PM VET), Cuentas por Pagar e impuestos SENIAT (IVA 16%, 8%, 0% e IGTF 3%).
3. **`@RRHH`**: Gestión de perfiles, control de acceso RBAC y trazabilidad de acciones operativas.
4. **`@Backend`**: Servidor Express con Scoping Léxico Defensivo, conector BCV con caché TTL y endpoints REST seguros.
5. **`@Frontend`**: React 19 funcional con doctrina de **Doble Exportación Obligatoria** (`named` + `default`) y consumo tolerante.
6. **`@Dashboards`**: Paneles de Business Intelligence con alineación numérica (`tabular-nums`) y lectura en < 5 segundos.
7. **`@Documentos`**: Motor OpenXML Excel (`xlsx-js-style`) con tablas bordeadas, fichas independientes y membrete corporativo dinámico, además de reportes ejecutivos PDF con jsPDF.
8. **`@UX`**: Interfaz 100% responsiva para pantallas móviles (desde 375px) y controles táctiles mínimos de 44x44px.
9. **`@QA`**: 17 pruebas unitarias y de estrés automatizadas sin promesas huérfanas ni desbordes de memoria.
10. **`@CRM` / `@BRM`**: Directorio de proveedores, homologación comercial y pre-conciliación de facturación.
11. **`@OCR`**: Doble motor de alta disponibilidad (IA Multimodal Gemini Vision Pro + Heurístico Local) con 4 candados forenses (SHA-256, metadatos EXIF, cuadre horizontal/vertical y auditoría fiscal SENIAT).

---

## 🚀 Nuevas Funcionalidades y Elevación de Plataforma (Fase 10)

### 1. Motor de Exportación OpenXML Excel Ejecutivo (`xlsx-js-style`)
- **Tablas con bordes definidos**: Celdas y encabezados con bordes nítidos en color pizarra (`#94A3B8` y `#0F172A`).
- **Fichas de Producto Enmarcadas (`3_Fichas_Producto_Celda`)**: Cada producto se renderiza en un bloque estructurado de 4 filas delimitado por bordes exteriores medianos y separado de la siguiente ficha por una fila espaciadora sin bordes.
- **Membrete Corporativo Dinámico**: Encabezado de 5 filas en las 3 hojas con Razón Social, RIF, Dirección Fiscal, Teléfono, Email y Guía SADA/SUNAGRO inyectados desde el perfil de la empresa.

### 2. Gestión Manual de Límites Mínimos & Alarmas de Quiebre
- **Ajuste por SKU y Ubicación**: Botón interactivo en cada producto (tabla y fichas móviles) para ajustar el stock mínimo por Sede/Depósito o de forma global.
- **Selector de Modo de Riesgo**: `AUTOMATICO`, `CRITICO_MANUAL`, `PREVENTIVO_MANUAL` y `EXENTO_MANUAL`.
- **Alarma en Tiempo Real**: Si la existencia física es menor o igual al límite mínimo, se activa un semáforo visual con pulso de advertencia en el catálogo, la torre de control y las alertas de reorden.
- **Registro de Nuevos SKUs**: Formulario con asignación directa de stock mínimo y modo de alarma desde el alta.

### 3. Histórico de Acciones & Sesiones (`AUDIT_HISTORY`)
- **Restricción de Gobernanza**: Visible en el menú lateral únicamente para roles `SUPERADMIN` y `GERENTE`.
- **Resumen Visual Superior**: 4 tarjetas de KPIs con total de eventos auditados, sesiones activas, ajustes de stock mínimo y operaciones críticas.
- **Buscador y Filtros por Acción**: Trazabilidad completa de `LOGIN`, `LOGOUT`, `MIN_STOCK_UPDATE`, `PRODUCT_CREATE`, `LOCATION_CREATE`, `LOCATION_DELETE`, `BACKUP_EXPORT`, `BACKUP_RESTORE` y `PLATFORM_RESET`.
- **Historial de Conexiones**: Registro de entradas y salidas de usuarios en horario VET (America/Caracas) con cálculo de tiempo de sesión.

### 4. Módulo de Respaldos Cifrados (`.chrystal-backup`)
- **Empaquetado Completo**: Reúne catálogo maestro, existencias multi-sede, proveedores, facturas OCR, historial de auditoría y configuración fiscal.
- **Cifrado Simétrico & Huella SHA-256**: Genera un sobre criptográfico con firma SHA-256 de 64 caracteres para detectar cualquier alteración no autorizada.
- **Descarga Local & Restauración Segura**: Permite exportar a disco para contingencias fuera de línea y restaurar el sistema tras validar la integridad del archivo.

### 5. Zona de Alta Seguridad — Reinicio de Fábrica (Pristine Wipe)
- **Exclusivo para Superadministrador**: Botón accesible solo para cuentas con rol `SUPERADMIN` en la Torre de Control y en el Histórico de Auditoría.
- **Doble Candado de Autorización**: Exige ingresar el PIN de Superadmin (`102030`) y escribir textualmente la frase `REINICIAR-SISTEMA`.
- **Vaciado Seguro**: Limpia la base de datos operativa dejándola completamente virgen (0 SKUs, 0 órdenes) para inicializar datos desde cero o restaurar un respaldo, registrando el evento en el log inmutable.

---

## 🧪 Pruebas Unitarias y de Estrés (17/17 Aprobadas)
Ejecutar la suite completa de pruebas:
```bash
npm test
# O directamente:
npx tsx --test src/lib/erp-core.test.ts
```

| Prueba | Componente Auditado | Resultado |
|---|---|:---:|
| 1 | Aritmética exacta Decimal.js (`ROUND_HALF_UP`) | ✅ Aprobada |
| 2 | IVA SENIAT (16%, 8%, 0%), IGTF (3%) y conversión BCV | ✅ Aprobada |
| 3 | Regla de las 5:00 PM Caracas (Conmutación automática de tasa) | ✅ Aprobada |
| 4 | Mapeador inteligente Chrystal® (Detección Col B / Col F) | ✅ Aprobada |
| 5 | Doble motor OCR y 4 candados forenses anti-fraude | ✅ Aprobada |
| 6 | Alertas de reorden con límites manuales de inventario | ✅ Aprobada |
| 7 | **Estrés BCV**: 100 solicitudes concurrentes + red en vivo | ✅ Aprobada |
| 8 | **Estrés Paginación**: Lotes de 20 sobre 10,000 SKUs y PIN en Sedes | ✅ Aprobada |
| 9 | **Estrés Recompra**: 12,500 simulaciones de horizontes (7 a 60 días) | ✅ Aprobada |
| 10 | Filtro de rotación por rango de fechas [Desde, Hasta] | ✅ Aprobada |
| 11 | **Estrés OpenXML**: Matriz de 3 hojas sobre 500 SKUs | ✅ Aprobada |
| 12 | Inyección de membrete corporativo dinámico | ✅ Aprobada |
| 13 | Estilo visual OpenXML: bordes Slate y fichas cerradas | ✅ Aprobada |
| 14 | **Estrés Respaldo Cifrado**: Cifrado y descifrado de **1,000 SKUs** en 107 ms | ✅ Aprobada |
| 15 | Detección de alteraciones (tamper) y clave personalizada | ✅ Aprobada |
| 16 | Trazabilidad de auditoría y permanencia de sesión | ✅ Aprobada |
| 17 | Validación de PIN Superadmin (`102030`) y reinicio de fábrica | ✅ Aprobada |

---

## 💻 Ejecución Local

1. **Instalar dependencias**:
   ```bash
   npm install --legacy-peer-deps
   ```
2. **Configurar variables de entorno** (opcional para IA multimodal):
   Crear archivo `.env` con:
   ```env
   GEMINI_API_KEY=tu_api_key_de_google_ai_studio
   PORT=3000
   ```
3. **Iniciar en modo desarrollo**:
   ```bash
   npm run dev
   ```
4. **Construir para producción**:
   ```bash
   npm run build
   ```
5. **Cuentas de Acceso Pre-configuradas (RBAC)**:
   - **Superadministrador**: `rdrj.mppd@gmail.com` · PIN: `102030`
   - **Gerente**: `gerencia@chrystal.com.ve` · PIN: `203040`
   - **Analista**: `costos@chrystal.com.ve` · PIN: `304050`
   - **Observador**: `auditoria@chrystal.com.ve` · PIN: `405060`

