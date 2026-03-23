# Resolución de Inconsistencias en Métricas de Pacientes

## 🔍 Problema Identificado

La UI mostraba 2 sesiones con el badge "Pagada" (verde), pero las métricas del backend reportaban solo 1 sesión pagada.

## 🕵️ Investigación

### Datos Encontrados en Supabase

Para el psicólogo `be26ba5d-aa25-4861-a15a-585a3ce331e6` y paciente `bcccd2a2-b203-4f76-9321-9c4a6ac58046`:

- **Total de sesiones**: 10
- **Sesiones completadas**: 4
- **Sesiones con paid=true**: 2 (INCONSISTENCIA)

### Detalle de la Inconsistencia

Sesiones que tenían `paid=true`:

1. **Sesión 17690160** (21 ene):
   - Estado: `scheduled` ❌
   - Paid: `true`
   - Problema: Una sesión programada no debería estar marcada como pagada

2. **Sesión 17689087** (21 ene):
   - Estado: `completed` ✅
   - Paid: `true`
   - Correcto: Solo las sesiones completadas deberían poder estar pagadas

### Por qué ocurrió la discrepancia

1. **Backend** (`/api/patient-stats`): Filtraba correctamente contando solo sesiones `completed` con `paid=true`
   ```javascript
   const paidSessions = completedSessions.filter(s => s.paid === true).length;
   ```

2. **Frontend** (`PsychologistPatientSessions.tsx`): Mostraba el badge "Pagada" para CUALQUIER sesión con `paid=true`, sin verificar el estado
   ```tsx
   {session.paid && ( ... )} // ❌ No verificaba el estado
   ```

## ✅ Soluciones Implementadas

### 1. Corrección de Datos en Supabase

Ejecutado script `fix-paid-inconsistencies.js` que:
- Identificó sesiones con `paid=true` pero estado diferente a `completed`
- Actualizó la sesión 17690160 cambiando `paid` de `true` a `false`

**Resultado**: Ahora solo hay 1 sesión con `paid=true` y está en estado `completed` ✅

### 2. Mejora en el Componente Frontend

Modificado `PsychologistPatientSessions.tsx` línea 665:

**Antes:**
```tsx
{session.paid && (
  <span className="...">Pagada</span>
)}
```

**Después:**
```tsx
{session.paid && session.status === 'completed' && (
  <span className="...">Pagada</span>
)}
```

Esto previene que sesiones no completadas muestren el badge "Pagada" incluso si por error tienen `paid=true` en la base de datos.

## 🛡️ Prevención de Futuras Inconsistencias

### Reglas de Negocio Aplicadas

1. Solo las sesiones con `status='completed'` pueden tener `paid=true`
2. El badge "Pagada" en la UI solo se muestra si:
   - `session.paid === true` AND
   - `session.status === 'completed'`

### Scripts de Verificación Creados

- `check-paid-sessions.js`: Verifica el estado de sesiones pagadas de un paciente específico
- `find-patient-sessions.js`: Busca todas las sesiones de un psicólogo y muestra inconsistencias
- `fix-paid-inconsistencies.js`: Corrige automáticamente sesiones con paid=true pero no completed

## 📊 Estado Final

Después de las correcciones:

- ✅ Backend reporta: 1 sesión pagada
- ✅ Frontend muestra: 1 badge "Pagada"
- ✅ Métricas consistentes con la visualización
- ✅ Datos de Supabase corregidos

## 🎯 Conclusión

Las inconsistencias se debieron a:
1. Datos incorrectos en Supabase (sesión programada marcada como pagada)
2. Validación insuficiente en el frontend al mostrar el badge

Ambos problemas han sido resueltos y se han implementado medidas preventivas.
