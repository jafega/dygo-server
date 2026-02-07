# Funcionalidad: Número Inicial de Facturas por Año

## Descripción
Sistema para permitir que los psicólogos que se incorporan al software a mitad de ejercicio puedan configurar el número inicial de sus facturas para cada año, manteniendo la continuidad con facturas previas emitidas fuera del sistema.

## Fecha de Implementación
6 de febrero de 2026

## Flujo de Funcionamiento

### 1. Primera Factura del Año
Cuando un psicólogo intenta crear su primera factura de un año específico:

1. El sistema detecta que no hay facturas previas para ese año
2. Verifica si existe un número inicial configurado en `psychologist_profiles.data.invoice_start_numbers[año]`
3. Si **NO** existe configuración:
   - Muestra un modal preguntando: *"¿Qué número quieres que sea la primera factura de [año]?"*
   - El psicólogo ingresa el número (ej: 50 si ya tiene 49 facturas de ese año fuera del sistema)
   - El sistema guarda esta configuración en el perfil del psicólogo
   - Crea la factura con ese número inicial
4. Si **SÍ** existe configuración:
   - Usa directamente el número configurado previamente

### 2. Facturas Subsiguientes
Una vez configurado el número inicial, todas las facturas siguientes del mismo año se incrementan automáticamente:
- Primera factura: F26000050 (si se configuró 50)
- Segunda factura: F26000051
- Tercera factura: F26000052
- Y así sucesivamente...

### 3. Nuevo Año
Cada año es independiente:
- 2026: puede empezar en 50
- 2027: puede empezar en 1 (o cualquier otro número)
- El sistema preguntará nuevamente al crear la primera factura del nuevo año

## Formato de Numeración
- **Formato**: `F[YY][NNNNNN]`
  - `F`: Prefijo fijo
  - `YY`: Últimos 2 dígitos del año (ej: 26 para 2026)
  - `NNNNNN`: Número secuencial de 6 dígitos con padding de ceros

- **Ejemplos**:
  - `F26000001`: Primera factura de 2026 (si se configura como 1)
  - `F26000050`: Primera factura de 2026 (si se configura como 50)
  - `F27000001`: Primera factura de 2027

## Estructura de Datos

### Almacenamiento en Base de Datos
Los números iniciales se guardan en `psychologist_profiles.data` (campo JSONB):

```json
{
  "invoice_start_numbers": {
    "2026": 50,
    "2027": 1,
    "2028": 100
  },
  // ... otros datos del perfil
}
```

## Archivos Modificados

### Frontend
- **`components/BillingPanel.tsx`**
  - Nuevos estados:
    - `showInvoiceStartModal`: controla visibilidad del modal
    - `invoiceStartNumber`: número ingresado por el usuario
    - `pendingInvoiceData`: guarda datos de factura mientras se espera configuración
  
  - Nuevas funciones:
    - `getInvoiceStartNumber(year)`: obtiene número inicial configurado
    - `saveInvoiceStartNumber(year, startNumber)`: guarda número inicial en perfil
    - `handleConfirmInvoiceStart()`: procesa confirmación del modal
  
  - Funciones modificadas:
    - `generateInvoiceNumber()`: detecta primera factura y solicita configuración si es necesario
    - `handleSaveInvoice()`: intercepta cuando se requiere configuración y muestra modal
  
  - Nuevo componente UI:
    - Modal de configuración de número inicial

### Backend
- **No requiere cambios**: utiliza endpoints existentes
  - `GET /api/psychologist/:userId/profile`: obtener perfil
  - `PUT /api/psychologist/:userId/profile`: actualizar perfil

### Scripts SQL
- **`backend/scripts/add-invoice-start-numbers-to-profiles.sql`**
  - Script de verificación y documentación
  - No requiere ejecución (la tabla ya tiene la columna `data` JSONB)

## Casos de Uso

### Caso 1: Psicólogo Nuevo
**Situación**: Psicólogo que empieza a usar el software desde enero
- Primera factura 2026 → Modal aparece → Ingresa "1"
- Sistema crea factura: `F26000001`
- Siguientes facturas: `F26000002`, `F26000003`, etc.

### Caso 2: Psicólogo que se Incorpora a Mitad de Año
**Situación**: Psicólogo con 49 facturas ya emitidas fuera del sistema
- Primera factura en el sistema → Modal aparece → Ingresa "50"
- Sistema crea factura: `F26000050`
- Siguientes facturas: `F26000051`, `F26000052`, etc.

### Caso 3: Cambio de Año
**Situación**: Psicólogo al crear primera factura de 2027
- Primera factura 2027 → Modal aparece → Ingresa "1" (o cualquier número)
- Sistema crea factura: `F27000001`
- Las facturas de 2026 siguen en su secuencia independiente

## Validaciones
1. El número inicial debe ser mayor a 0
2. Solo se puede configurar una vez por año (primera factura)
3. Si el usuario cancela el modal, no se crea la factura
4. Las facturas borradores (`draft`) no afectan la numeración

## Interfaz de Usuario

### Modal de Configuración
Aparece automáticamente al crear la primera factura del año:

```
┌─────────────────────────────────────────┐
│ Primera Factura del Año                 │
│                                         │
│ Vas a crear tu primera factura de 2026.│
│ ¿Qué número quieres que sea?           │
│                                         │
│ Número inicial de factura para 2026:   │
│ [___50___]  ← Input numérico           │
│                                         │
│ Este número se usará para tu primera   │
│ factura de 2026 y las siguientes se    │
│ incrementarán automáticamente.          │
│                                         │
│ Formato: F26000050                      │
│                                         │
│         [Cancelar]  [Confirmar]        │
└─────────────────────────────────────────┘
```

## Notas Técnicas
- La configuración es **por psicólogo** y **por año**
- Se almacena en el perfil del psicólogo (tabla `psychologist_profiles`)
- No afecta facturas existentes
- Es retrocompatible: psicólogos sin configuración empiezan en 1
- La numeración es independiente para cada año fiscal

## Mantenimiento Futuro
Para modificar el número inicial de un año ya configurado, actualmente se requiere:
1. Acceso directo a la base de datos, o
2. Implementar una interfaz de configuración en el panel de ajustes del psicólogo

Se recomienda añadir esta funcionalidad en futuras versiones para permitir editar la configuración desde la UI.
