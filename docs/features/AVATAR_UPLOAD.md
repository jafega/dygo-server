# Configuración de Subida de Avatares

## Resumen de Cambios

Se ha implementado la funcionalidad de subida de avatares con almacenamiento en Supabase Storage.

### Archivos Modificados

1. **backend/server.js**
   - Añadido endpoint `/api/upload-avatar` que maneja la subida de imágenes
   - Sube imágenes a Supabase Storage (bucket `avatars`)
   - Fallback a base64 si Supabase no está disponible

2. **services/authService.ts**
   - Nueva función `uploadAvatar()` que llama al endpoint del backend
   - Maneja la subida de imágenes y retorna la URL pública

3. **components/SettingsModal.tsx**
   - Modificado `handleAvatarUpload` para usar `uploadAvatar()`
   - Ahora guarda la URL de Supabase en lugar de base64
   - Actualiza el perfil automáticamente con la nueva foto

### Archivos Nuevos

1. **backend/scripts/create-avatars-bucket.js**
   - Script para crear el bucket de avatares en Supabase
   - Configura permisos públicos para lectura

2. **backend/scripts/create-avatars-bucket.sql**
   - SQL para políticas de seguridad del bucket (opcional)

## Configuración Inicial

### 1. Crear el Bucket en Supabase

Ejecuta el script de configuración:

```bash
cd backend
node scripts/create-avatars-bucket.js
```

Esto creará automáticamente el bucket `avatars` en Supabase Storage con:
- Acceso público para lectura
- Límite de 5MB por archivo
- Formatos permitidos: PNG, JPEG, JPG, GIF, WEBP

### 2. Verificar Variables de Entorno

Asegúrate de tener configuradas en tu archivo `.env`:

```
SUPABASE_URL=https://tu-proyecto.supabase.co
SUPABASE_SERVICE_ROLE_KEY=tu-service-role-key
```

## Cómo Funciona

### Flujo de Subida

1. Usuario selecciona una imagen desde Ajustes → Foto de perfil
2. La imagen se convierte a base64 en el navegador
3. Se envía al endpoint `/api/upload-avatar` con el userId
4. El backend:
   - Decodifica el base64
   - Genera un nombre único: `{userId}-{timestamp}.{ext}`
   - Sube a Supabase Storage en `avatars/{fileName}`
   - Retorna la URL pública
   - Si falla, usa base64 como fallback
5. Se actualiza el usuario con la nueva `avatarUrl`
6. La foto persiste en Supabase y se muestra en todos los componentes

### Persistencia

- **Con Supabase**: Las imágenes se guardan en Supabase Storage y la URL en la base de datos
- **Sin Supabase**: Las imágenes se guardan como base64 directamente en db.json
- Los avatares se sincronizan automáticamente entre local y Supabase

## Uso

Los usuarios pueden subir su foto de perfil desde:

1. Ir a Ajustes (icono de engranaje)
2. Hacer clic en su avatar
3. Seleccionar una imagen de su dispositivo
4. La foto se sube automáticamente y se muestra inmediatamente

## Notas Técnicas

- Las imágenes se optimizan automáticamente al convertirlas a base64
- El nombre de archivo incluye timestamp para evitar conflictos de caché
- Las URLs públicas de Supabase Storage son permanentes
- Si Supabase falla, el sistema usa base64 como fallback
- No se requiere refresh de página para ver el avatar actualizado
