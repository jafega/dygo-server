# 🔧 Solución: Slots de Disponibilidad en Supabase

## Problema Identificado

Los slots de disponibilidad de los psicólogos **NO se estaban guardando en Supabase** porque la tabla `sessions` no existía en el esquema de base de datos. Solo se guardaban en el archivo local `db.json`, por lo que otros usuarios no podían verlos.

## ✅ Cambios Realizados

1. **Agregado soporte completo para la tabla `sessions`** en el backend:
   - Creación automática de tabla en Postgres/Supabase
   - Persistencia en `saveDb()`
   - Carga en `getDb()` y `loadSupabaseCache()`
   - Migración desde SQLite/db.json

2. **Scripts de migración creados**:
   - `backend/scripts/create-sessions-table.sql` - SQL para crear la tabla
   - `backend/scripts/create-sessions-table.js` - Script Node.js de verificación

## 📋 Pasos para Aplicar la Solución

### Para Desarrollo Local:

No necesitas hacer nada. El servidor creará la tabla automáticamente cuando uses Postgres local.

### Para Producción (Supabase):

**Opción A: Crear la tabla manualmente (Recomendado)**

1. Ve a tu proyecto Supabase: https://app.supabase.com
2. Selecciona tu proyecto
3. Ve a **SQL Editor** en el menú lateral
4. Haz clic en **New Query**
5. Copia y pega el contenido de `backend/scripts/create-sessions-table.sql`
6. Haz clic en **Run** (o presiona Ctrl+Enter)
7. Verifica que se creó: debería mostrar "Success. No rows returned"

**Opción B: Usar el script de Node.js**

```bash
cd backend
node scripts/create-sessions-table.js
```

Este script te mostrará las instrucciones y el SQL a ejecutar.

## 🚀 Después de Crear la Tabla

1. **Reinicia el backend**:
   ```bash
   # Detén el servidor actual (Ctrl+C)
   cd backend
   node server.js
   ```

2. **Verifica que funcione**:
   - Como psicólogo, crea nuevos slots de disponibilidad
   - Abre otra sesión/navegador como paciente
   - Los slots deberían aparecer para reservar

3. **Verifica en Supabase**:
   - Ve a **Table Editor** > **sessions**
   - Deberías ver los slots creados

## 📊 Estructura de la Tabla

```sql
sessions (
  id TEXT PRIMARY KEY,
  data JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE
)
```

El campo `data` contiene:
- `id`: ID único del slot
- `psychologistId`: ID del psicólogo
- `patientId`: ID del paciente (vacío si disponible)
- `patientName`: Nombre del paciente o "Disponible"
- `date`: Fecha (YYYY-MM-DD)
- `startTime`: Hora inicio (HH:MM)
- `endTime`: Hora fin (HH:MM)
- `type`: Tipo de sesión ('online', 'presencial')
- `status`: Estado ('available', 'scheduled', 'completed', 'cancelled')
- `meetLink`: Link de reunión (opcional)

## 🔍 Verificar que Funciona

Ejecuta en el terminal:

```bash
curl http://localhost:3001/api/dbinfo
```

Deberías ver algo como:
```json
{
  "persistence": "supabase-rest",
  "tables": {
    "sessions": 0
  }
}
```

## ⚡ Deploy en Vercel

Cuando hagas push a tu repositorio, Vercel redesplegará automáticamente. Asegúrate de que:

1. La tabla `sessions` existe en Supabase
2. Las variables de entorno están configuradas:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `SUPABASE_REST_ONLY=true`

## 🆘 Troubleshooting

**Error: "Could not find the table 'public.sessions'"**
- La tabla no existe en Supabase
- Ejecuta el SQL de `create-sessions-table.sql`

**Los slots no aparecen para otros usuarios**
- Verifica que el backend esté usando Supabase (no db.json local)
- Ejecuta `GET /api/dbinfo` y verifica que `persistence` sea `"supabase-rest"` o `"postgres"`

**Error al crear slots**
- Revisa los logs del backend: `console.log` mostrará cualquier error de Supabase
- Verifica que `SUPABASE_SERVICE_ROLE_KEY` tenga permisos de escritura
