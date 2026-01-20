# Migración a IDs de Usuario Únicos

## Resumen
Este documento describe la migración del sistema de IDs duplicados (psychologistId/patientId específicos) a un sistema de IDs de usuario únicos donde `psych_user_id` y `patient_user_id` se refieren al mismo `user.id`.

## Motivación
Anteriormente, el sistema usaba IDs separados para psicólogos y pacientes, lo que creaba complejidad innecesaria. Ahora:
- Cada usuario tiene un único `id`
- El rol en una relación (psicólogo o paciente) se determina por el contexto de la relación, no por un ID separado
- Un usuario puede ser psicólogo en una relación y paciente en otra

## Cambios Principales

### 1. Tipos TypeScript (`types.ts`)

#### CareRelationship
**Antes:**
```typescript
interface CareRelationship {
  id: string;
  psychologistId: string;
  patientId: string;
  createdAt: number;
  endedAt?: number;
}
```

**Después:**
```typescript
interface CareRelationship {
  id: string;
  psych_user_id: string;  // ID del usuario que actúa como psicólogo
  patient_user_id: string; // ID del usuario que actúa como paciente
  createdAt: number;
  endedAt?: number;
  
  // DEPRECATED: Mantener por compatibilidad
  psychologistId?: string;
  patientId?: string;
}
```

#### Invitation
**Antes:**
```typescript
interface Invitation {
  id: string;
  psychologistId: string;
  psychologistEmail: string;
  psychologistName: string;
  patientId?: string;
  patientEmail: string;
  patientName?: string;
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED';
  timestamp: number;
  createdAt?: string;
  initiatorEmail?: string;
  patientFirstName?: string;
  patientLastName?: string;
  emailSent?: boolean;
  emailSentAt?: number;
}
```

**Después:**
```typescript
interface Invitation {
  id: string;
  psych_user_id: string;
  psych_user_email: string;
  psych_user_name: string;
  patient_user_id?: string;
  patient_user_email: string;
  patient_user_name?: string;
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED';
  timestamp: number;
  createdAt?: string;
  initiatorEmail?: string;
  patient_first_name?: string;
  patient_last_name?: string;
  emailSent?: boolean;
  emailSentAt?: number;
  
  // DEPRECATED: Mantener por compatibilidad
  psychologistId?: string;
  psychologistEmail?: string;
  psychologistName?: string;
  patientId?: string;
  patientEmail?: string;
  patientName?: string;
  patientFirstName?: string;
  patientLastName?: string;
  fromPsychologistId?: string;
  fromPsychologistName?: string;
  toUserEmail?: string;
}
```

### 2. Base de Datos Local (`backend/db.json`)

**Antes:**
```json
{
  "careRelationships": [
    {
      "id": "rel-001",
      "psychologistId": "psych-001",
      "patientId": "patient-001",
      "createdAt": 1737398400000
    }
  ]
}
```

**Después:**
```json
{
  "careRelationships": [
    {
      "id": "rel-001",
      "psych_user_id": "psych-001",
      "patient_user_id": "patient-001",
      "createdAt": 1737398400000
    }
  ]
}
```

### 3. Backend (`backend/server.js`)

#### Funciones de Utilidad Actualizadas:
- `ensureCareRelationship(psychUserId, patientUserId)` - Ahora usa los nuevos nombres de parámetros
- `removeCareRelationshipByPair(psychUserId, patientUserId)` - Soporta búsqueda por campos nuevos y legacy
- `removeCareRelationshipsForUser(userId)` - Busca en todos los campos

#### Endpoints Actualizados:

**GET /api/relationships**
- Acepta `psych_user_id` y `patient_user_id` (además de los legacy)
- Retorna relaciones con ambos conjuntos de campos

**POST /api/relationships**
```javascript
// Request body soporta:
{
  "psych_user_id": "user-123",
  "patient_user_id": "user-456"
}
// O versión legacy:
{
  "psychologistId": "user-123",
  "patientId": "user-456"
}
```

**DELETE /api/relationships**
- Query params: `psych_user_id` y `patient_user_id` (o legacy)

**PATCH /api/relationships/end**
- Body: `psych_user_id` y `patient_user_id` (o legacy)

**POST /api/invitations**
- Acepta y normaliza campos nuevos y legacy
- Crea invitaciones con ambos conjuntos de campos para compatibilidad

### 4. Frontend (`services/storageService.ts`)

#### Funciones Actualizadas:

```typescript
// Antes
ensureRelationship(psychologistId: string, patientId: string)
removeRelationship(psychologistId: string, patientId: string)
relationshipExists(psychologistId: string, patientId: string)
fetchRelationships({ psychologistId?, patientId? })

// Después
ensureRelationship(psychUserId: string, patientUserId: string)
removeRelationship(psychUserId: string, patientUserId: string)
relationshipExists(psychUserId: string, patientUserId: string)
fetchRelationships({ 
  psych_user_id?, 
  patient_user_id?,
  psychologistId?,  // legacy
  patientId?        // legacy
})
```

#### Funciones Derivadas:
- `linkPatientToPsychologist(patientUserId, psychUserId)` - Parámetros renombrados
- `revokeAccess(patientUserId, psychUserId)` - Parámetros renombrados
- `endRelationship(psychUserId, patientUserId)` - Parámetros renombrados
- `getPatientsForPsychologist(psychId)` - Actualizada para usar `psych_user_id`
- `getPsychologistsForPatient(patientId)` - Actualizada para usar `patient_user_id`
- `sendInvitation()` - Crea invitaciones con nuevos campos
- `acceptInvitation()` - Usa `psych_user_id` del invitation
- `getSentInvitationsForPsychologist()` - Busca por `psych_user_id`
- `getPendingPsychologistInvitationsForEmail()` - Busca por `psych_user_email`

### 5. Migración de Supabase

Se creó el script `backend/scripts/migrate-to-unified-user-ids.sql` que:

1. **Agrega nuevas columnas** a `care_relationships`:
   - `psych_user_id`
   - `patient_user_id`

2. **Agrega nuevas columnas** a `invitations`:
   - `psych_user_id`
   - `psych_user_email`
   - `psych_user_name`
   - `patient_user_id`
   - `patient_user_email`
   - `patient_user_name`
   - `patient_first_name`
   - `patient_last_name`

3. **Migra datos** de campos legacy a nuevos campos
4. **Actualiza JSONB** `data` con nuevos campos
5. **Crea índices** para optimización
6. **Mantiene campos legacy** para compatibilidad

#### Para ejecutar la migración en Supabase:
```sql
-- Copiar y pegar el contenido de:
-- backend/scripts/migrate-to-unified-user-ids.sql
-- en el SQL Editor de Supabase
```

## Compatibilidad

### Retrocompatibilidad
El código está diseñado para soportar AMBOS esquemas:
- **Nuevos campos**: `psych_user_id`, `patient_user_id`, etc.
- **Campos legacy**: `psychologistId`, `patientId`, etc.

Esto permite:
1. Migración gradual sin downtime
2. Rollback seguro si es necesario
3. Soporte para datos mixtos (algunos registros nuevos, otros legacy)

### Búsqueda de Relaciones
Todas las búsquedas verifican AMBOS conjuntos de campos:
```javascript
const relPsychId = rel.psych_user_id || rel.psychologistId;
const relPatId = rel.patient_user_id || rel.patientId;
```

### Creación de Relaciones
Las nuevas relaciones/invitaciones se crean con:
1. **Campos principales**: Nuevos (`psych_user_id`, etc.)
2. **Campos legacy**: Duplicados para compatibilidad

## Testing

### Manual Testing Checklist

- [ ] **Crear nueva relación paciente-psicólogo**
  - Psicólogo envía invitación a paciente nuevo
  - Paciente acepta invitación
  - Verificar que la relación se crea con `psych_user_id` y `patient_user_id`

- [ ] **Listar relaciones**
  - Como psicólogo: ver mis pacientes
  - Como paciente: ver mis psicólogos
  - Verificar que ambos conjuntos de campos se retornan

- [ ] **Eliminar relación**
  - Psicólogo revoca acceso a paciente
  - Verificar que la búsqueda funciona con ambos campos

- [ ] **Finalizar relación**
  - Marcar relación como terminada (endedAt)
  - Verificar que no aparece en listados activos

- [ ] **Compatibilidad legacy**
  - Verificar que relaciones existentes (con campos legacy) siguen funcionando
  - Verificar migración automática al acceder

### API Testing

```bash
# Test crear relación
curl -X POST http://localhost:3001/api/relationships \
  -H "Content-Type: application/json" \
  -d '{"psych_user_id":"psych-001","patient_user_id":"patient-001"}'

# Test listar relaciones (nuevo)
curl "http://localhost:3001/api/relationships?psych_user_id=psych-001"

# Test listar relaciones (legacy - debe funcionar)
curl "http://localhost:3001/api/relationships?psychologistId=psych-001"

# Test eliminar relación
curl -X DELETE "http://localhost:3001/api/relationships?psych_user_id=psych-001&patient_user_id=patient-001"
```

## Migración en Producción

### Pasos Recomendados

1. **Backup de base de datos**
   ```bash
   # En Supabase: Dashboard → Database → Backups → Create Backup
   ```

2. **Ejecutar script de migración SQL**
   - Ir a Supabase SQL Editor
   - Copiar contenido de `backend/scripts/migrate-to-unified-user-ids.sql`
   - Ejecutar script
   - Verificar resultados de queries de verificación

3. **Desplegar nuevo código**
   ```bash
   git add .
   git commit -m "feat: migrate to unified user IDs"
   git push
   ```

4. **Verificar en producción**
   - Probar crear nueva relación
   - Probar listar relaciones existentes
   - Probar eliminar relación
   - Verificar logs del backend

5. **Monitorear errores**
   - Revisar logs de Vercel/backend
   - Verificar que no hay errores relacionados con campos faltantes

### Rollback (si es necesario)

Si algo falla, el código es compatible con el esquema antiguo:
1. Los campos legacy NO se eliminaron
2. El código busca en AMBOS conjuntos de campos
3. Simplemente revertir el deploy del código

Para revertir la migración de base de datos:
```sql
-- SOLO si es absolutamente necesario
UPDATE public.care_relationships 
SET psych_user_id = NULL, 
    patient_user_id = NULL;

UPDATE public.invitations 
SET psych_user_id = NULL,
    psych_user_email = NULL,
    psych_user_name = NULL,
    patient_user_id = NULL,
    patient_user_email = NULL,
    patient_user_name = NULL;
```

## Limpieza Futura

Una vez verificado que todo funciona correctamente (después de ~1 mes), se pueden eliminar los campos legacy:

```sql
-- NO EJECUTAR hasta verificar estabilidad completa
ALTER TABLE public.care_relationships 
DROP COLUMN IF EXISTS psychologistId,
DROP COLUMN IF EXISTS patientId;

ALTER TABLE public.invitations 
DROP COLUMN IF EXISTS psychologistId,
DROP COLUMN IF EXISTS psychologistEmail,
DROP COLUMN IF EXISTS psychologistName,
DROP COLUMN IF EXISTS patientId,
DROP COLUMN IF EXISTS patientEmail,
DROP COLUMN IF EXISTS patientName,
DROP COLUMN IF EXISTS patientFirstName,
DROP COLUMN IF EXISTS patientLastName;
```

También actualizar los tipos TypeScript para remover campos deprecated.

## Beneficios

1. **Simplicidad**: Un solo ID por usuario
2. **Flexibilidad**: Usuarios pueden tener múltiples roles
3. **Claridad**: Nombres de campos más descriptivos (`psych_user_id` vs `psychologistId`)
4. **Consistencia**: Mismo patrón en toda la aplicación
5. **Escalabilidad**: Más fácil agregar nuevos tipos de relaciones

## Notas Adicionales

- Los componentes frontend (React) NO requieren cambios porque usan las abstracciones de `storageService.ts`
- El sistema es totalmente backward-compatible durante la transición
- Todos los endpoints aceptan tanto nombres nuevos como legacy
- Las búsquedas funcionan con ambos conjuntos de campos
