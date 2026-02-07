# BUGFIX: Pantalla en Blanco Después de Login

**Fecha**: 7 de febrero de 2026  
**Usuario Afectado**: cb8da7b2-06a1-4a81-81d2-a27d4d11407e

## Problema

Algunos usuarios experimentaban una pantalla en blanco después de iniciar sesión, sin mostrar ningún contenido de la aplicación.

## Causa Raíz

El campo `is_psychologist` en algunos usuarios podía tener valores `null` o `undefined` en la base de datos. El código del frontend tenía múltiples verificaciones estrictas como:

```typescript
if (user.is_psychologist === true) {
  // Mostrar vista de psicólogo
} else if (user.is_psychologist === false) {
  // Mostrar vista de paciente  
}
```

Cuando `is_psychologist` era `null` o `undefined`, ninguna de estas condiciones se cumplía, resultando en que no se renderizaba ninguna vista y la pantalla quedaba en blanco.

## Solución Implementada

### 1. Backend (`server.js`)

Se agregaron validaciones en todos los endpoints que devuelven datos de usuario para asegurar que `is_psychologist` siempre tenga un valor booleano por defecto (`false` si no está definido):

- **GET `/api/users/:id`** (líneas ~2725-2756)
- **GET `/api/users`** (líneas ~2765-2824)
- **POST `/api/auth/login`** (líneas ~2063-2148)
- **POST `/api/supabase-auth`** (líneas ~1797-2007)

```javascript
// BUGFIX: Asegurar que is_psychologist siempre tenga un valor booleano
if (user.is_psychologist === undefined || user.is_psychologist === null) {
  user.is_psychologist = false;
}
user.isPsychologist = user.is_psychologist;
```

### 2. Frontend - authService.ts

Se agregó validación en `getUserById()` para normalizar el valor antes de devolverlo al componente:

```typescript
// BUGFIX: Asegurar que is_psychologist siempre tenga un valor booleano
if (user && (user.is_psychologist === undefined || user.is_psychologist === null)) {
    user.is_psychologist = false;
    user.isPsychologist = false;
}
```

### 3. Frontend - App.tsx

Se agregaron múltiples capas de protección:

1. **En `loadUserData()`**: Try-catch para evitar que errores en la carga de datos causen pantalla en blanco
2. **En `refreshUserData()`**: Validación de `is_psychologist` y mejor manejo de errores
3. **En `handleAuthSuccess()`**: Normalización del campo antes de establecer las vistas
4. **En `useEffect` de inicialización**: Validación del campo al cargar el usuario actual

```typescript
// BUGFIX: Asegurar que is_psychologist siempre tenga un valor booleano
if (user.is_psychologist === undefined || user.is_psychologist === null) {
    user.is_psychologist = false;
    user.isPsychologist = false;
}
```

## Impacto

- ✅ Los usuarios con `is_psychologist = null/undefined` ahora se tratan como pacientes por defecto
- ✅ La aplicación siempre renderiza una vista, evitando pantallas en blanco
- ✅ Mejor manejo de errores en la carga de datos del usuario
- ✅ Logs más detallados para debugging futuro

## Testing

Para probar el fix:

1. Crear un usuario con `is_psychologist = null` en la base de datos
2. Intentar iniciar sesión con ese usuario
3. Verificar que se muestra la vista de paciente correctamente
4. Verificar en los logs del navegador que se normalizó el valor

## Prevención Futura

- El schema de Supabase define `is_psychologist boolean NOT NULL DEFAULT false`, lo que previene valores null en nuevos usuarios
- Para usuarios existentes, se recomienda ejecutar una migración para normalizar los valores:

```sql
UPDATE users 
SET is_psychologist = false 
WHERE is_psychologist IS NULL;
```
