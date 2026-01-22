# Migración de Disponibilidad a Tabla `dispo`

## Resumen de Cambios

Se ha implementado una nueva tabla `dispo` para gestionar la disponibilidad de los psicólogos de forma separada de las sesiones programadas. Anteriormente, la disponibilidad se almacenaba en la tabla `sessions` con `status='available'` y sin `patient_user_id`.

## Estructura de la Tabla `dispo`

```sql
CREATE TABLE dispo (
  id TEXT PRIMARY KEY,
  psychologist_user_id TEXT NOT NULL,
  data JSONB NOT NULL,  -- {date, startTime, endTime, type}
  created_at TIMESTAMP DEFAULT NOW()
);
```

## Cambios Implementados

### Backend (backend/server.js)

1. **Tabla dispo agregada a SUPABASE_TABLES_TO_ENSURE**
   - Se asegura que la tabla existe en Supabase

2. **GET /api/sessions**
   - Ahora también obtiene disponibilidad desde `dispo` cuando se consulta por `psychologistId`
   - Los slots de `dispo` se transforman y se marcan con `isFromDispo: true`

3. **POST /api/sessions**
   - Acepta parámetro `deleteDispoId` para borrar un slot de disponibilidad al crear una sesión
   - Útil cuando un paciente reserva una disponibilidad

4. **POST /api/sessions/availability**
   - Ahora crea disponibilidad en la tabla `dispo` en lugar de `sessions`
   - Estructura: `{ id, psychologist_user_id, data: {date, startTime, endTime, type}, created_at }`

5. **DELETE /api/sessions/:id**
   - Primero intenta eliminar de `dispo`
   - Si no encuentra, busca en `sessions`

### Frontend

#### PsychologistCalendar.tsx
- **handleAssignPatient**: Modificado para detectar slots de `dispo` (con `isFromDispo`)
  - Si viene de `dispo`: hace POST con `deleteDispoId` para borrar de `dispo` y crear en `sessions`
  - Si no: usa PATCH como antes

#### PatientSessions.tsx
- **bookSession**: Modificado para detectar slots de `dispo`
  - Si viene de `dispo`: hace POST con `deleteDispoId` para borrar de `dispo` y crear sesión programada
  - Si no: usa PATCH como antes

## Script de Migración

Se incluye un script para migrar sesiones disponibles existentes:

```bash
cd backend
node scripts/migrate-availability-to-dispo.js
```

El script:
- Lee todas las sesiones con `status='available'` y sin `patient_user_id`
- Las mueve a la tabla `dispo`
- Las elimina de la tabla `sessions`
- Crea un backup automático antes de modificar

## Flujo de Trabajo

### Psicólogo crea disponibilidad:
1. Psicólogo hace clic en "Añadir Disponibilidad"
2. Se crea en tabla `dispo` con estructura: `{id, psychologist_user_id, data: {...}, created_at}`
3. Se muestra en el calendario del psicólogo

### Paciente reserva cita:
1. Paciente ve disponibilidad (desde tabla `dispo`)
2. Al reservar:
   - Se BORRA el registro de `dispo`
   - Se CREA un registro en `sessions` con status='scheduled' y `patient_user_id`

### Psicólogo asigna paciente a disponibilidad:
1. Psicólogo ve slot disponible y hace clic para asignar paciente
2. Se BORRA el registro de `dispo`
3. Se CREA sesión en `sessions` con paciente asignado

### Psicólogo cancela sesión programada:
1. Si se cancela una sesión y el psicólogo quiere recrear disponibilidad
2. Opcionalmente se puede crear un nuevo registro en `dispo` (actualmente se pregunta al cancelar)

## Ventajas de este Enfoque

1. **Separación de responsabilidades**: Disponibilidad vs Sesiones programadas
2. **Mejor rendimiento**: Consultas más rápidas al filtrar disponibilidad
3. **Claridad**: No se mezclan estados "available" con sesiones reales
4. **Histórico limpio**: Las sesiones en `sessions` son solo sesiones reales con pacientes
5. **Flexibilidad**: Permite diferentes estructuras de datos para disponibilidad vs sesiones

## Compatibilidad hacia atrás

El sistema mantiene compatibilidad con:
- Sesiones antiguas con `status='available'` en `sessions` (se pueden migrar con el script)
- Campos legacy como `psychologistId` y `patientId` (se mapean a `*_user_id`)

## Notas Técnicas

- La tabla `dispo` usa JSONB en PostgreSQL para el campo `data`, permitiendo flexibilidad en la estructura
- En desarrollo con `db.json`, se maneja como un array simple
- El campo `isFromDispo` es temporal (solo en memoria) para identificar origen del slot
- Los IDs se mantienen únicos entre `dispo` y `sessions` usando timestamps

## Testing

Después de migrar, verificar:
1. ✅ Psicólogo puede crear disponibilidad
2. ✅ Disponibilidad aparece en calendario del psicólogo
3. ✅ Paciente puede ver disponibilidad
4. ✅ Paciente puede reservar cita (borra de dispo, crea en sessions)
5. ✅ Psicólogo puede asignar paciente a disponibilidad
6. ✅ Psicólogo puede eliminar disponibilidad
