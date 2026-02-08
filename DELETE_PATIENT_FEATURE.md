# Feature: Eliminar Paciente

**Fecha de implementación:** 8 de febrero de 2026

## Descripción

Funcionalidad para que un psicólogo pueda eliminar un paciente desde la vista de configuración del paciente. La eliminación es inteligente según si el paciente tiene o no una cuenta propia.

## Comportamiento

### Cuando el paciente NO tiene cuenta propia (sin auth):
- ✅ Se elimina la relación psicólogo-paciente
- ✅ Se eliminan todas las sesiones entre ese psicólogo y paciente
- ❌ NO se eliminan las facturas (se mantienen para histórico)

### Cuando el paciente tiene cuenta propia (con auth/email):
- ✅ Se elimina la relación psicólogo-paciente
- ✅ Se eliminan todas las sesiones entre ese psicólogo y paciente  
- ❌ NO se eliminan las facturas
- ℹ️ El paciente puede seguir accediendo a su información personal

## Implementación

### Backend (server.js)

**Endpoint:** `DELETE /api/relationships/:psychologistId/patients/:patientId`

**Ubicación:** Línea ~6953 del archivo `backend/server.js`

**Lógica:**
1. Verifica si el paciente tiene cuenta (busca en tabla `users` si tiene email)
2. Elimina la relación de `care_relationships`
3. Elimina todas las sesiones de `sessions` donde coincidan psychologist_user_id y patient_user_id
4. Actualiza el cache en memoria
5. Retorna mensaje personalizado según tenga o no auth

### Frontend (PatientDetailModal.tsx)

**Ubicación:** Pestaña "Configuración" del modal de detalle del paciente

**Elementos añadidos:**
- Estado `showDeleteConfirm` para controlar el popup
- Estado `isDeleting` para mostrar loading durante eliminación
- Función `handleDeletePatient()` que llama al endpoint
- Botón "Eliminar Paciente" (rojo) al final de la configuración
- Modal de confirmación con advertencias claras

**Flujo UX:**
1. Usuario hace clic en "Eliminar Paciente"
2. Aparece popup de confirmación explicando:
   - Qué se eliminará (relación + sesiones)
   - Qué NO se eliminará (facturas)
   - Que la acción es irreversible
   - Que si tiene cuenta propia, seguirá accediendo a su info
3. Si confirma, se ejecuta la eliminación
4. Muestra loading durante el proceso
5. Al completar, cierra el modal y recarga la página

## Problema Conocido

Si aparece error 404 al intentar eliminar:
- **Causa:** El servidor no se ha reiniciado con los nuevos cambios
- **Solución:** Reiniciar el servidor backend (`node server.js` en la carpeta `/backend`)

## Testing

Para probar la funcionalidad:

1. Iniciar sesión como psicólogo
2. Abrir el perfil de un paciente
3. Ir a la pestaña "Configuración"
4. Scroll hasta el final, encontrar botón "Eliminar Paciente"
5. Hacer clic y confirmar en el popup
6. Verificar que:
   - La relación se elimina
   - Las sesiones se eliminan
   - Las facturas se mantienen
   - Si el paciente tiene auth, aún puede hacer login

## Archivos Modificados

- `backend/server.js` - Nuevo endpoint DELETE
- `components/PatientDetailModal.tsx` - UI y lógica de eliminación
