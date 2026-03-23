# Corrección: Métricas de Facturación con Valores Negativos

**Fecha:** 7 de febrero de 2026
**Problema:** Las métricas de facturación mostraban valores negativos en "Total Cobrado" y otras métricas.

## Causa Raíz

El sistema permite crear **facturas rectificativas** que intencionalmente tienen valores negativos (para anular facturas anteriores). Sin embargo, el cálculo de las métricas de facturación estaba incluyendo estas facturas rectificativas, lo que causaba que las sumas resultaran en valores negativos.

Ejemplo:
- Factura original: €300 (status: paid)
- Factura rectificativa: €-300 (status: paid, is_rectificativa: true)
- **Total Cobrado calculado antes:** €300 + (€-300) = €0 (o incluso negativo si había más rectificativas)

## Solución Implementada

### 1. Filtrado de Facturas Rectificativas en Estadísticas

En el endpoint `GET /api/patient-stats/:patientId` (línea ~5393 de `backend/server.js`):

```javascript
// Excluir facturas rectificativas de los cálculos
const regularInvoices = invoices.filter(inv => 
  !inv.is_rectificativa && !inv.data?.is_rectificativa
);

// Usar regularInvoices en todos los cálculos:
// - totalInvoiced
// - totalCollected  
// - totalPending
// - totalInvoices (conteo)
```

### 2. Preservación de Valores Negativos para Rectificativas

En la función `buildSupabaseInvoiceRow()` (línea ~868):
- **NO** se aplica `Math.abs()` a los valores
- Las facturas rectificativas mantienen sus valores negativos legítimos
- Solo se filtran en el momento de calcular métricas

## Campos Utilizados para Identificar Rectificativas

- `is_rectificativa: true` (campo directo en tabla invoices)
- `data.is_rectificativa: true` (campo en JSONB para compatibilidad)

## Métricas Afectadas (Ahora Corregidas)

✅ **Total Facturado:** Solo suma facturas regulares (excluye cancelled, draft y rectificativas)
✅ **Total Cobrado:** Solo suma facturas pagadas regulares (excluye rectificativas)
✅ **Por Cobrar:** Solo suma facturas pendientes regulares (excluye rectificativas)
✅ **Nº Facturas:** Solo cuenta facturas regulares (excluye rectificativas)

## Componentes del Frontend Afectados

- `PatientDetailModal.tsx` - Muestra las métricas de facturación del paciente
- Las métricas se obtienen de la API `/patient-stats/:patientId`

## Testing

Para verificar que la corrección funciona:

1. Crear una factura normal y marcarla como pagada
2. Crear una factura rectificativa de esa factura
3. Verificar que las métricas de facturación no muestren valores negativos
4. El "Total Cobrado" debe reflejar solo las facturas pagadas regulares

## Notas Adicionales

- Las facturas rectificativas siguen siendo visibles en la lista de facturas
- Se pueden generar PDFs de facturas rectificativas (con valores negativos)
- La lógica de negocio para crear rectificativas no cambió
