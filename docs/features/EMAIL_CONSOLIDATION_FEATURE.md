# Consolidación de Usuarios al Añadir Email

## Descripción

Esta funcionalidad permite consolidar usuarios temporales (creados sin email) cuando se les asigna un email que ya existe en el sistema.

## Problema que Resuelve

Cuando un psicólogo crea un paciente sin email (con un email temporal tipo `temp_xxxxx@noemail.dygo.local`), y posteriormente ese paciente se registra con su email real, el sistema podría crear duplicados. Esta funcionalidad evita eso consolidando automáticamente los datos.

## Flujo de Consolidación

### Cuando se añade un email a un usuario temporal:

1. **Verificar si existe otro usuario con ese email**
   - Si NO existe → Actualizar el email del usuario temporal normalmente
   - Si SÍ existe → Proceder con la consolidación

2. **Proceso de Consolidación (si existe usuario con el email)**:

   a. **Actualizar Relaciones de Cuidado**
      - Buscar todas las relaciones (`care_relationships`) donde el usuario temporal es paciente
      - Cambiar `patient_user_id` al ID del usuario con el email real
      - Si ya existe una relación entre el psicólogo y el usuario real, eliminar la duplicada

   b. **Migrar Datos Asociados**
      - `session_entry`: Actualizar `target_user_id` y `creator_user_id`
      - `goals`: Actualizar `patient_user_id`
      - `invoices`: Actualizar `patient_user_id` y `psychologist_user_id`
      - `sessions`: Actualizar `patient_user_id` y `psychologist_user_id`

   c. **Eliminar Usuario Temporal**
      - Eliminar el usuario temporal de la base de datos
      - Todos sus datos ya están asociados al usuario real

   d. **Retornar Usuario Real**
      - Retornar el usuario existente con un flag `consolidated: true`

## Casos de Uso

### Caso 1: Usuario Temporal se Convierte en Real (Sin Conflicto)

```
1. Psicólogo crea paciente "Juan" sin email
   → Usuario ID: temp-123, Email: temp_abc@noemail.dygo.local
   
2. Se actualiza el email a "juan@example.com"
   → No existe otro usuario con ese email
   → Usuario temp-123 actualizado con email real
   → has_temp_email = false
```

### Caso 2: Usuario Temporal + Usuario Real Existente (Con Consolidación)

```
1. Psicólogo A crea paciente "Juan" sin email
   → Usuario ID: temp-123, Email: temp_abc@noemail.dygo.local
   → Relación: Psych-A ↔ temp-123

2. Usuario "juan@example.com" ya existe (ID: real-456)
   → Registrado previamente en el sistema

3. Se actualiza el email de temp-123 a "juan@example.com"
   → Sistema detecta que real-456 ya existe
   → Actualiza relación: Psych-A ↔ real-456
   → Migra datos de temp-123 → real-456
   → Elimina temp-123
   → Retorna real-456 con consolidated: true
```

### Caso 3: Usuario Temporal con Múltiples Psicólogos

```
1. Psych-A crea "Juan" sin email → temp-123
2. Psych-B también conecta con temp-123
3. Se añade email "juan@example.com" a temp-123
4. Sistema consolida:
   - Psych-A ↔ real-456
   - Psych-B ↔ real-456
   - Migra todas las sesiones, objetivos, etc.
   - Elimina temp-123
```

## Implementación Técnica

### Endpoint Modificado

**PATCH /api/users/:id**

### Lógica en Supabase

```javascript
// 1. Buscar usuario existente con el email
const existingUserWithEmail = await supabaseAdmin
  .from('users')
  .select('id, data, user_email')
  .eq('user_email', newEmail)
  .neq('id', userId)
  .maybeSingle();

// 2. Si existe, consolidar
if (existingUserWithEmail) {
  // Actualizar relaciones
  // Migrar datos
  // Eliminar temporal
  return consolidatedUser;
}

// 3. Si no existe, actualizar normalmente
updateFields.user_email = newEmail;
```

### Lógica en DB Local (db.json)

Similar a Supabase, pero manipulando directamente los arrays:
- `db.users`
- `db.careRelationships`
- `db.entries`
- `db.goals`
- `db.invoices`
- `db.sessions`

## Testing

### Prueba Manual

1. **Crear usuario temporal**:
   ```bash
   curl -X POST http://localhost:3001/api/admin/create-patient \
     -H "x-user-id: {psychologist-id}" \
     -H "Content-Type: application/json" \
     -d '{
       "name": "Paciente Temporal",
       "phone": "123456789"
     }'
   ```

2. **Crear/obtener usuario real**:
   ```bash
   # Registrar usuario con email real
   curl -X POST http://localhost:3001/api/auth/register \
     -H "Content-Type: application/json" \
     -d '{
       "name": "Usuario Real",
       "email": "real@example.com",
       "password": "password123",
       "role": "PATIENT"
     }'
   ```

3. **Actualizar email del temporal al real**:
   ```bash
   curl -X PATCH http://localhost:3001/api/users/{temp-user-id} \
     -H "Content-Type: application/json" \
     -d '{
       "email": "real@example.com"
     }'
   ```

4. **Verificar consolidación**:
   - Respuesta debe incluir `consolidated: true`
   - Usuario temporal debe estar eliminado
   - Relaciones deben apuntar al usuario real

## Logs y Debugging

El sistema registra logs detallados durante la consolidación:

```
📧 Usuario con email real@example.com ya existe (ID: real-456). Consolidando...
   Actualizando 2 relaciones...
   ✓ Relación rel-001 actualizada
   ✓ Relación duplicada rel-002 eliminada
✅ Usuario temporal temp-123 eliminado. Datos consolidados en real-456
```

## Consideraciones Importantes

1. **Validación de Email**: Solo se consolida cuando:
   - El usuario tiene `has_temp_email: true` o email tipo `@noemail.dygo.local`
   - Se proporciona un email real (no temporal)

2. **Prevención de Pérdida de Datos**:
   - Todos los datos se migran antes de eliminar el usuario temporal
   - Se verifican relaciones duplicadas antes de actualizar

3. **Transaccionalidad**:
   - En Supabase, las operaciones deben completarse todas
   - En db.json, se guarda al final del proceso completo

4. **Compatibilidad**:
   - Funciona tanto con Supabase como con db.json
   - Mantiene retrocompatibilidad con usuarios existentes

## Campos Relacionados

- `has_temp_email`: Boolean que indica si el email es temporal
- `user_email`: Email del usuario (columna en tabla)
- `email`: Email en el campo data (JSONB)
- Emails temporales siguen el patrón: `temp_[uuid]@noemail.dygo.local`
