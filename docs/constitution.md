# CONSTITUTION.MD — Líneas Rojas y Reglas Inmutables del Sistema
1. Copyright del Desarrollador: En el pie de página de cada una de las interfaces de la aplicación, así como en reportes Excel y PDF, DEBE figurar obligatoriamente: "© 2026 AR Group. Todos los derechos de desarrollo reservados."
2. Aritmética Exacta: Prohibido punto flotante nativo de JS. Todo cálculo financiero usa decimal.js con ROUND_HALF_UP.
3. Huso Horario: Todo el sistema opera bajo America/Caracas (UTC-4).
4. Regla BCV 5:00 PM: A partir de las 17:00 VET, el sistema conmuta a la tasa oficial del día hábil siguiente.
5. Doble Motor OCR: El lector de facturas nunca falla; ante falta de cuota o error de IA, el motor heurístico local procesa la factura con sus 4 candados forenses.
6. Fuente Única de Verdad: Prohibido falsear o inventar cifras en informes PDF y Excel. Todo informe refleja datos reales.
