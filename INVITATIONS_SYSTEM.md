# Sistema de Invitaciones - Documentación Técnica

## Resumen

El sistema de invitaciones permite a los psicólogos enviar solicitudes a pacientes para establecer relaciones de cuidado. Este documento explica cómo funciona el flujo completo y las mejoras implementadas.

## Flujo de Invitaciones

### 1. Envío de Invitación (Psicólogo)

1. El psicólogo accede a la pestaña "Conexiones"
2. Introduce el email del paciente
3. El sistema:
   - Crea una invitación con estado `PENDING`
   - La guarda en `db.json` (local)
   - La sincroniza con Supabase (tabla `invitations`)
   - Aparece en la lista "Invitaciones enviadas" del psicólogo

### 2. Recepción de Invitación (Paciente)

**Escenarios:**

#### A. Usuario Existente
Si el email ya está registrado:
- Al abrir la pestaña "Conexiones", ve la invitación pendiente
- Puede aceptar o rechazar
- El sistema recarga automáticamente cada 10 segundos para detectar nuevas invitaciones

#### B. Usuario Nuevo (✨ MEJORADO)
Si el email NO está registrado:
- La invitación queda en estado `PENDING` en Supabase
- Cuando el usuario se registre con ese email:
  - El backend detecta automáticamente las invitaciones pendientes
  - Las registra en los logs para visibilidad
  - Quedan inmediatamente disponibles para el usuario
- Al abrir "Conexiones", verá todas sus invitaciones pendientes
- Puede aceptar o rechazar cada una

**✨ NUEVO:** El sistema ahora valida y reporta invitaciones pendientes durante el registro:
```javascript
// En backend/server.js - POST /api/auth/register
📧 Encontradas X invitaciones pendientes para email@example.com
   - Invitación de Psicólogo Name (psych-id)
✅ El usuario podrá ver y gestionar estas invitaciones en el panel de Conexiones
```

### 3. Revocación de Invitación (Psicólogo)

1. El psicólogo encuentra la invitación en "Invitaciones enviadas"
2. Hace clic en el botón de revocar (🗑️)
3. Confirma la acción
4. El sistema:
   - Elimina la invitación de `db.json`
   - Elimina la invitación de Supabase
   - Recarga la lista inmediatamente
   - El paciente dejará de ver la invitación en su próxima recarga (máximo 10 segundos)

## Verificación Técnica

### Estado Actual en Supabase

Actualmente hay 5 invitaciones en Supabase:
- **2 PENDING** (pendientes de aceptar)
- **3 ACCEPTED** (ya aceptadas/convertidas en relaciones)

Las invitaciones pendientes son para:
- `javier@ciudadela.eu`
- `test.invitation@example.com`

### Scripts de Verificación

Se han creado 5 scripts útiles en `backend/scripts/`:

#### 1. `check-invitations.js`
Consulta todas las invitaciones en Supabase y muestra estadísticas.

```bash
cd backend
node scripts/check-invitations.js
```

**Salida:**
- Lista completa de invitaciones con detalles
- Estadísticas por estado (PENDING, ACCEPTED, REJECTED)
- Lista de emails con invitaciones pendientes

#### 2. `create-test-invitation.js`
Crea una invitación de prueba para testing.

```bash
cd backend
node scripts/create-test-invitation.js
```

#### 3. `revoke-invitation.js`
Revoca una invitación específica usando la API del backend.

```bash
cd backend
node scripts/revoke-invitation.js <invitation-id>
```

**Ejemplo:**
```bash
node scripts/revoke-invitation.js c72eb0d7-9ef4-4e53-a1f0-81bc6101cfc9
```

#### 4. `verify-invitation-email-mapping.js` ✨ NUEVO
Verifica cómo están asociadas las invitaciones pendientes por email.

```bash
cd backend
node scripts/verify-invitation-email-mapping.js
```

**Muestra:**
- Todas las invitaciones pendientes
- Si existe un usuario con ese email
- Estado de disponibilidad para cada invitación

#### 5. `test-invitation-flow.js` ✨ NUEVO
Prueba el flujo completo: crear invitación → registrar usuario → aceptar invitación.

```bash
cd backend
node scripts/test-invitation-flow.js
```

**Verifica:**
- Creación de invitación antes del registro
- Registro de nuevo usuario
- Disponibilidad de invitaciones para el usuario
- Aceptación de invitación
- Creación de relación

## Mejoras Implementadas

### 1. Logs Detallados en Backend

Se agregaron logs extensivos en `backend/server.js` para rastrear el flujo completo:

**Endpoints afectados:**
- `DELETE /api/invitations/:id`
- `DELETE /api/invitations?id=...`
- `POST /api/auth/register` ✨ NUEVO
- Supabase OAuth flow ✨ NUEVO

**Información que se registra:**
- 🗑️ Inicio de revocación
- 📊 Cantidad de invitaciones antes/después
- ✅ Invitación eliminada del caché
- 🔄 Inicio de persistencia en Supabase
- ✅ Confirmación de persistencia exitosa
- ❌ Errores detallados si fallan
- 📧 **NUEVO:** Detección de invitaciones pendientes al registrarse

**Función `deleteMissing`:**
- 🔍 Tabla, IDs previos/nuevos
- 📝 Lista de IDs a eliminar
- 🗑️ Progreso de eliminación por chunks
- ✅ Confirmación de finalización

### 2. Detección Automática de Invitaciones al Registrarse ✨ NUEVO

**Problema anterior:** 
No había visibilidad clara de si un nuevo usuario tenía invitaciones pendientes esperándole.

**Solución:**
Cuando un usuario se registra (vía email/password o Supabase OAuth), el backend:
1. Busca automáticamente invitaciones pendientes para ese email
2. Registra en los logs cuántas invitaciones hay y de quién son
3. Las invitaciones quedan inmediatamente disponibles vía `getPendingInvitationsForEmail()`

```javascript
// En POST /api/auth/register y Supabase OAuth
const pendingInvitations = db.invitations.filter(
  inv => inv.toUserEmail === normalizedEmail && inv.status === 'PENDING'
);

if (pendingInvitations.length > 0) {
  console.log(`📧 Encontradas ${pendingInvitations.length} invitaciones pendientes para ${normalizedEmail}`);
  pendingInvitations.forEach(inv => {
    console.log(`   - Invitación de ${inv.fromPsychologistName} (${inv.fromPsychologistId})`);
  });
}
```

**Beneficios:**
- Visibilidad completa en los logs del servidor
- Debugging más fácil de problemas con invitaciones
- Confirmación inmediata de que el sistema funciona correctamente

### 3. Recarga Automática en ConnectionsPanel

**Problema anterior:** 
Si un usuario tenía la sesión abierta, no veía cambios en invitaciones hasta que recargara manualmente la página.

**Solución:**
```typescript
useEffect(() => {
  if (!currentUser) return;
  loadConnections();
  
  // Recargar invitaciones cada 10 segundos
  const interval = setInterval(() => {
    loadConnections(false); // Sin mostrar loader
  }, 10000);
  
  return () => clearInterval(interval);
}, [currentUser?.id]);
```

**Beneficios:**
- Detección automática de nuevas invitaciones
- Actualización de cambios en tiempo real
- Sin molestias visuales (no muestra loader en recargas automáticas)
- Limpieza apropiada del intervalo al desmontar componente

### 4. Persistencia Correcta en Supabase

Los endpoints DELETE ahora pasan correctamente `prevCache` a `persistSupabaseData`:

```javascript
if (supabaseAdmin) {
  const prevCache = supabaseDbCache;
  saveDb(db);
  supabaseDbCache = db;
  persistSupabaseData(db, prevCache).then(() => {
    console.log('✅ Persistencia completada');
  }).catch(err => {
    console.error('❌ Error:', err);
  });
}
```

Esto permite que la función `deleteMissing` compare correctamente:
- **prevCache.invitations**: invitaciones antes de la eliminación
- **db.invitations**: invitaciones después de la eliminación
- **Resultado**: elimina de Supabase las invitaciones que faltan

## Comportamiento Esperado

### Cuando un Psicólogo Revoca una Invitación

1. **Inmediatamente:**
   - Se elimina de su lista "Invitaciones enviadas"
   - Se elimina de `db.json`
   - Se elimina de Supabase

2. **En el Paciente:**
   - Si tiene la sesión abierta: desaparecerá en máximo 10 segundos
   - Si no tiene sesión abierta: no la verá cuando abra la aplicación
   - Si se registra después: no verá ninguna invitación

### Cuando un Paciente Registra

El flujo en `ConnectionsPanel` carga todas las invitaciones pendientes automáticamente:

```typescript
const [connected, pending] = await Promise.all([
  getPsychologistsForPatient(currentUser.id),
  getPendingInvitationsForEmail(currentUser.email)
]);
```

## Consideraciones de Seguridad

- ✅ Las invitaciones se validan en el backend
- ✅ Solo el psicólogo que envió la invitación puede revocarla
- ✅ Solo el paciente destinatario puede aceptar/rechazar
- ✅ Se requiere confirmación para revocar invitaciones
- ✅ Los logs NO exponen información sensible (solo IDs)

## Testing Manual

### Test 1: Revocar Invitación Existente

1. Iniciar el servidor: `cd backend && node server.js`
2. Listar invitaciones: `node scripts/check-invitations.js`
3. Copiar un ID de invitación PENDING
4. Revocar: `node scripts/revoke-invitation.js <id>`
5. Verificar eliminación: `node scripts/check-invitations.js`
6. Revisar logs del servidor para ver el flujo completo

### Test 2: Ciclo Completo

1. Crear invitación de prueba: `node scripts/create-test-invitation.js`
2. Verificar creación: `node scripts/check-invitations.js`
3. Abrir la aplicación como el psicólogo que la creó
4. Ir a Conexiones → Invitaciones Enviadas
5. Revocar la invitación desde la UI
6. Verificar en Supabase: `node scripts/check-invitations.js`

## Troubleshooting

### Problema: "Invitación no se revoca"

**Verificar:**
1. ¿El servidor backend está corriendo?
2. ¿La invitación realmente existe? → `node scripts/check-invitations.js`
3. ¿Los logs muestran algún error? → Revisar consola del servidor
4. ¿El estado en Supabase cambió? → Ejecutar script de verificación

### Problema: "Usuario no ve invitación al registrarse"

**Verificar:**
1. ¿El email coincide exactamente? (case-sensitive)
2. ¿La invitación existe en Supabase? → `node scripts/check-invitations.js`
3. ¿El estado es PENDING? (no ACCEPTED/REJECTED)
4. ¿El usuario abrió la pestaña "Conexiones"?

### Problema: "Invitación eliminada localmente pero persiste en Supabase"

**Verificar:**
1. ¿Supabase está configurado correctamente? → Variables de entorno
2. ¿Los logs muestran "Persistencia completada"?
3. ¿Hay errores de red al comunicarse con Supabase?

**Solución temporal:**
```bash
# Sincronizar manualmente
cd backend
node scripts/sync-to-supabase.js  # Si existe
```

## Próximas Mejoras Sugeridas

1. **WebSockets para actualizaciones en tiempo real** (eliminar el polling de 10 segundos)
2. **Notificaciones push** cuando llega una nueva invitación
3. **Historial de invitaciones** (aceptadas/rechazadas con timestamps)
4. **Límite de invitaciones** por psicólogo/día para prevenir spam
5. **Expiración automática** de invitaciones después de X días

## Referencias

- Código principal: `components/ConnectionsPanel.tsx`
- API Backend: `backend/server.js` (líneas 1941-2000)
- Servicio de Storage: `services/storageService.ts`
- Scripts de utilidad: `backend/scripts/`
