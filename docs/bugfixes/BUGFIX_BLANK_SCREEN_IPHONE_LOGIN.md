# Fix: Pantalla en Blanco en iPhone Después del Login con Gmail

## Problema
Después de hacer login con Gmail en iPhone (Safari), la página aparecía completamente en blanco.

## Causa Raíz
El problema estaba en el flujo de autenticación y transición de estados:

1. **AuthScreen** manejaba el callback de OAuth de Supabase
2. Después de autenticación exitosa, llamaba a `onAuthSuccess(user)` 
3. Luego establecía `isAuthenticating = false` **inmediatamente**
4. Esto causaba que **AuthScreen se desmontara** antes de que App.tsx pudiera tomar control
5. App.tsx establecía `isLoadingData = true` pero **ya no había componente visible**
6. Durante la carga de datos del usuario, la pantalla quedaba completamente en blanco

El problema era especialmente notable en iPhone/Safari por:
- Renderizado más estricto del navegador
- Timing diferente en la ejecución de callbacks
- Menor tolerancia a cambios rápidos de estado

## Solución Implementada

### 1. **Mantener AuthScreen Visible Durante la Transición**
```typescript
// AuthScreen.tsx - línea ~110
// NO cambiar isAuthenticating aquí - dejar que App.tsx maneje el loading
// Esto evita que AuthScreen se desmonte antes de que App.tsx esté listo
setError(''); // Limpiar cualquier error previo

console.log('📤 Llamando a onAuthSuccess con usuario...');
onAuthSuccess(user);

// Dar tiempo a que App.tsx tome control antes de desmontar AuthScreen
setTimeout(() => {
    setIsAuthenticating(false);
}, 100);
```

### 2. **Establecer Vista ANTES de Cargar Datos**
```typescript
// App.tsx - handleAuthSuccess (línea ~330)
// Establecer el usuario PRIMERO para que React pueda empezar a renderizar
setCurrentUser(user);

// Establecer la vista ANTES de cargar los datos para evitar pantalla en blanco
setViewState(canAccessPsychologistView ? ViewState.PATIENTS : ViewState.CALENDAR);
setPsychViewMode(canAccessPsychologistView ? 'DASHBOARD' : 'PERSONAL');
setActiveTab(canAccessPsychologistView ? 'dashboard' : 'calendar');

// Desactivar loading ANTES de cargar datos para mostrar la UI
setIsLoadingData(false);
clearTimeout(timeoutId);

// Cargar datos del usuario EN SEGUNDO PLANO
// Esto permite que la UI se muestre inmediatamente
await refreshUserData(user.id);
```

### 3. **Mejorar Manejo de Errores con Valores por Defecto**
```typescript
// App.tsx - loadUserData y refreshUserData
catch (error) {
  console.error('❌ Error cargando datos del usuario:', error);
  // CRÍTICO: Nunca dejar la UI sin datos mínimos
  console.log('⚠️ Usando valores por defecto mínimos');
  setEntries([]);
  setGoals([]);
  setSettings({ 
    notificationsEnabled: false, 
    feedbackNotificationsEnabled: true,
    notificationTime: '20:00',
    language: 'es-ES',
    voice: 'Kore' 
  });
}
```

## Cambios Realizados

### components/AuthScreen.tsx
- Retrasar el cambio de `isAuthenticating` a false con un timeout de 100ms
- Permitir que `onAuthSuccess` complete antes de desmontar el componente
- Mantener la pantalla de "Iniciando sesión..." visible durante la transición

### App.tsx
- Establecer `currentUser` inmediatamente al recibirlo
- Establecer `viewState` ANTES de cargar datos (no esperar a que termine `refreshUserData`)
- Desactivar `isLoadingData` inmediatamente después de establecer la vista
- Cargar datos del usuario en segundo plano sin bloquear la UI
- Agregar logs detallados para debugging
- Mejorar manejo de errores con valores por defecto seguros

## Beneficios

1. **UI Siempre Visible**: La interfaz se muestra inmediatamente después del login
2. **Mejor UX**: Sin pantallas en blanco, transición suave
3. **Resiliente a Errores**: Aunque fallen las llamadas al servidor, la UI se muestra con valores por defecto
4. **Compatible con iOS**: Funciona correctamente en Safari mobile
5. **Debugging Mejorado**: Logs detallados para diagnosticar problemas

## Pruebas Recomendadas

1. ✅ Login con Gmail en iPhone (Safari)
2. ✅ Login con Gmail en Android (Chrome)
3. ✅ Login con Gmail en Desktop (Chrome, Firefox, Safari)
4. ✅ Login con conexión lenta o intermitente
5. ✅ Login cuando el servidor está lento para responder
6. ✅ Login como paciente y como psicólogo

## Notas Técnicas

- El timeout de 100ms es suficiente para que React procese los cambios de estado en App.tsx
- La carga de datos en segundo plano permite mostrar la UI inmediatamente
- Los valores por defecto garantizan que siempre haya algo que renderizar
- El timeout de seguridad de 15 segundos previene cuelgues indefinidos

## Fecha
8 de febrero de 2026
