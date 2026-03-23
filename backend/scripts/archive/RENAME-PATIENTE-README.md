# Migración: Renombrar patiente_user_id a patient_user_id

Este script corrige el typo en las columnas `patiente_user_id` de las tablas `sessions` e `invoices`, cambiándolas a `patient_user_id`.

## ⚠️ IMPORTANTE

Esta migración debe ejecutarse en Supabase para que el backend funcione correctamente con el nuevo código.

## Pasos para ejecutar la migración

1. **Accede al SQL Editor de Supabase**
   - Ve a https://supabase.com/dashboard/project/pjmpzucmntyehqnunzuz
   - Navega a: SQL Editor (en el menú lateral)

2. **Ejecuta el script de migración**
   - Abre el archivo: `backend/scripts/rename-patiente-to-patient.sql`
   - Copia todo el contenido
   - Pégalo en el SQL Editor de Supabase
   - Haz clic en "Run"

3. **Verifica el resultado**
   - El script incluye queries de verificación al final
   - Deberías ver que las columnas ahora se llaman `patient_user_id`
   - Los constraints también deberían tener el nombre correcto

## Cambios realizados en el código

✅ [backend/server.js](../server.js)
- Endpoint `POST /api/sessions`: Ahora usa `patient_user_id`
- Endpoint `PATCH /api/sessions/:id`: Ahora usa `patient_user_id`

✅ [SUPABASE_SCHEMA.md](../../SUPABASE_SCHEMA.md)
- Documentación actualizada con los nombres correctos

## Qué hace el script SQL

1. **Tabla sessions:**
   - Elimina el constraint `sessions_patiente_user_id_fkey`
   - Renombra `patiente_user_id` → `patient_user_id`
   - Recrea el constraint con el nombre correcto

2. **Tabla invoices:**
   - Elimina el constraint `invoices_patiente_user_id_fkey`
   - Renombra `patiente_user_id` → `patient_user_id`
   - Recrea el constraint con el nombre correcto

## Rollback (en caso de problemas)

Si necesitas revertir los cambios:

```sql
-- Para sessions
ALTER TABLE sessions DROP CONSTRAINT IF EXISTS sessions_patient_user_id_fkey;
ALTER TABLE sessions RENAME COLUMN patient_user_id TO patiente_user_id;
ALTER TABLE sessions ADD CONSTRAINT sessions_patiente_user_id_fkey 
FOREIGN KEY (patiente_user_id) REFERENCES users(id);

-- Para invoices
ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_patient_user_id_fkey;
ALTER TABLE invoices RENAME COLUMN patient_user_id TO patiente_user_id;
ALTER TABLE invoices ADD CONSTRAINT invoices_patiente_user_id_fkey 
FOREIGN KEY (patiente_user_id) REFERENCES users(id);
```

## Después de la migración

Una vez ejecutado el script SQL en Supabase:
1. El servidor backend ya está actualizado y funcionando
2. Las nuevas sesiones se crearán con `patient_user_id`
3. Las sesiones existentes se actualizarán automáticamente al editarse
