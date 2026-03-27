# 🔧 Configuración de Supabase para mainds

## Problema Actual
Los usuarios se están creando en **db.json local** en lugar de en **Supabase** porque las variables de entorno no están configuradas en el backend.

## Solución: Configurar Variables de Entorno

### Paso 1: Obtener Credenciales de Supabase

1. Ve a [Supabase Dashboard](https://supabase.com/dashboard)
2. Selecciona tu proyecto
3. Ve a **Settings** > **API**
4. Copia los siguientes valores:
   - **Project URL** (ej: `https://xxxxxxxxxxxxx.supabase.co`)
   - **anon/public key** (para el frontend)
   - **service_role key** ⚠️ **IMPORTANTE: Esta es la que necesitas para el backend**

### Paso 2: Crear archivo `.env` en `/backend`

Crea el archivo `backend/.env` con este contenido:

```env
# Supabase Configuration
SUPABASE_URL=https://xxxxxxxxxxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=tu_service_role_key_aqui
SUPABASE_ANON_KEY=tu_anon_key_aqui
SUPABASE_REST_ONLY=true

# Frontend URL
FRONTEND_URL=http://localhost:3000
```

⚠️ **Importante**: Usa la **service_role key**, NO la anon key en el backend.

### Paso 3: Crear archivo `.env.local` en la raíz del proyecto (frontend)

Crea el archivo `.env.local` en la raíz con:

```env
# Supabase Frontend Configuration
VITE_SUPABASE_URL=https://xxxxxxxxxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=tu_anon_key_aqui
VITE_SUPABASE_REDIRECT_URL=http://localhost:3000/?supabase_auth=1
```

### Paso 4: Reiniciar el Backend

Después de crear los archivos `.env`, reinicia el servidor backend:

```bash
cd backend
npm run dev
```

### Paso 5: Verificar en los Logs

Deberías ver en la consola del backend:

```
📊 Configuración Supabase:
   SUPABASE_URL: ✅ Configurado
   SUPABASE_SERVICE_ROLE_KEY: ✅ Configurado
   SUPABASE_REST_ONLY: true
🔄 Importing Supabase client...
🔄 Creating Supabase client...
✅ Supabase REST persistence enabled (service role)
```

### Paso 6: Probar la Autenticación

1. Limpia el localStorage: en la consola del navegador ejecuta `localStorage.clear()`
2. Recarga la página
3. Inicia sesión con Google
4. Deberías ver en los logs del backend:
   ```
   🔍 Buscando usuario en Supabase...
   📊 Total usuarios en Supabase: X
   🆕 Creando nuevo usuario desde OAuth...
   📊 supabaseAdmin disponible: true
   💾 Guardando usuario en Supabase...
   ✅ Created new user in Supabase from OAuth: tu@email.com
   ```

## Verificación

Para confirmar que funciona, ve a tu dashboard de Supabase:
- **Table Editor** > **users**
- Deberías ver tu usuario recién creado con todas las columnas pobladas

## ¿Qué archivos modificar?

✅ **CREAR estos archivos** (no están en git por seguridad):
- `backend/.env`
- `.env.local` (en la raíz del proyecto)

❌ **NO modifiques** (son plantillas):
- `backend/.env.example`
- `.env.example`

## Troubleshooting

### "supabaseAdmin no disponible"
- Verifica que `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` estén en `backend/.env`
- Reinicia el servidor backend
- Verifica los logs al inicio del servidor

### "Error creating user in Supabase"
- Verifica que la tabla `users` existe en Supabase
- Verifica que el schema tenga las columnas: `id`, `data`, `user_email`, `is_psychologist`, `auth_user_id`
- Revisa los logs del backend para más detalles del error
