# Skill: Finanzas Bimonetarias & Aritmética Exacta (`decimal.js`)
- Redondeo Bancario: `Decimal.ROUND_HALF_UP` a 2 decimales para montos monetarios (`roundCurrency`) y 4 decimales para tasas de cambio BCV (`roundRate`).
- Regla de Corte BCV 17:00 VET: Toda consulta de tasa evalúa la hora actual en `America/Caracas`. Si es `>= 17:00:00`, activa la tasa publicada para el siguiente día hábil bancario.
