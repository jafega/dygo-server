# Panel Profesional de Psicólogo - mainds

## Nuevas Funcionalidades Implementadas

Se ha implementado un sistema completo de gestión profesional para psicólogos con las siguientes características:

### 1. Menú Lateral Estilo Notion

- **Diseño Responsive**: El sidebar se adapta perfectamente a dispositivos móviles y desktop
- **Navegación Intuitiva**: Acceso rápido a todas las secciones del panel profesional
- **Estado Colapsable**: En móvil, el menú se oculta automáticamente tras la selección
- **Indicador Visual**: Resalta la sección activa con estilo moderno

### 2. Panel de Facturación

#### Características:
- **Crear Facturas**: Formulario completo para generar facturas con:
  - Selección de paciente
  - Múltiples conceptos/líneas de factura
  - Fecha de vencimiento
  - Notas adicionales
  
- **Numeración Automática**: Sistema de numeración ordenada por año (formato: 2026-0001)

- **Estado de Pagos**: Visualización clara del estado de cada factura:
  - ✅ Pagada (verde)
  - ⏰ Pendiente (amarillo)
  - ⚠️ Vencida (rojo)

- **Links de Pago de Stripe**: 
  - Generación de enlaces de pago
  - Copiar al portapapeles con un clic
  - Compartir fácilmente con los pacientes

- **Estadísticas**: Dashboard con métricas clave:
  - Total de facturas
  - Facturas pagadas
  - Facturas pendientes
  - Total de ingresos

### 3. Perfil del Psicólogo

#### Secciones:

**Información Personal:**
- Nombre completo
- Número de colegiado
- Especialidad
- Teléfono
- Email

**Dirección:**
- Dirección de consulta
- Ciudad
- Código postal
- País

**Datos de Facturación:**
- Nombre fiscal/empresa
- NIF/CIF
- IBAN
- Precio por sesión (configurable)

**Vista Previa:** Muestra cómo aparecerán los datos en las facturas

### 4. Calendario de Sesiones

#### Funcionalidades:

**Vista de Calendario:**
- Navegación mensual con flechas
- Vista de grid con indicadores visuales
- Código de colores por estado:
  - Disponible (púrpura)
  - Programada (azul)
  - Completada (verde)
  - Cancelada (rojo)

**Crear Sesión:**
- Asignar a un paciente
- Fecha y hora
- Tipo: Online o Presencial
- Notas personalizadas

**Añadir Disponibilidad:**
- Define bloques de tiempo libre
- Configura duración de cada slot (30/45/60/90 min)
- Genera múltiples espacios automáticamente
- Los pacientes podrán reservar estos espacios

**Gestión de Sesiones:**
- Ver detalles completos
- Marcar como completada
- Cancelar si es necesario
- Historial de sesiones

**Estadísticas del Calendario:**
- Sesiones del mes
- Completadas
- Disponibles
- Canceladas

## API Endpoints Implementados

### Facturas
- `GET /api/invoices?psychologistId={id}` - Listar facturas
- `POST /api/invoices` - Crear factura
- `POST /api/invoices/payment-link` - Generar link de pago

### Perfil
- `GET /api/psychologist/:userId/profile` - Obtener perfil
- `PUT /api/psychologist/:userId/profile` - Actualizar perfil

### Sesiones/Calendario
- `GET /api/sessions?psychologistId={id}&year={year}&month={month}` - Listar sesiones
- `POST /api/sessions` - Crear sesión
- `POST /api/sessions/availability` - Crear espacios disponibles
- `PATCH /api/sessions/:id` - Actualizar estado de sesión

### Pacientes
- `GET /api/psychologist/:psychologistId/patients` - Listar pacientes

## Componentes Creados

1. **PsychologistSidebar.tsx** - Menú lateral de navegación
2. **BillingPanel.tsx** - Panel de facturación completo
3. **PsychologistProfilePanel.tsx** - Formulario de perfil profesional
4. **PsychologistCalendar.tsx** - Sistema de calendario y sesiones

## Integración con Stripe

Para la integración completa con Stripe (pagos reales):

1. Configurar las credenciales de Stripe en `.env`:
```
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...
```

2. Actualizar el endpoint `/api/invoices/payment-link` en `backend/server.js` para:
   - Crear un Payment Link de Stripe
   - Asociar el link al ID de la factura
   - Configurar webhooks para actualizar el estado cuando se pague

3. Agregar webhook handler para eventos de Stripe:
   - `payment_intent.succeeded`
   - `invoice.paid`

## Mejoras Futuras Recomendadas

1. **Notificaciones**: Alertas cuando un paciente reserva una sesión disponible
2. **Recordatorios**: Emails automáticos antes de las sesiones
3. **Exportación**: Generar PDFs de facturas
4. **Reportes**: Estadísticas financieras mensuales/anuales
5. **Sincronización**: Integración con calendarios externos (Google Calendar, Outlook)
6. **Pagos Recurrentes**: Suscripciones para pacientes regulares
7. **Chat**: Sistema de mensajería con pacientes

## Uso

1. Inicia sesión como psicólogo
2. El menú lateral aparecerá automáticamente
3. Navega entre las secciones:
   - **Pacientes**: Gestiona tu lista de pacientes
   - **Calendario**: Programa y gestiona sesiones
   - **Facturación**: Crea y gestiona facturas
   - **Mi Perfil**: Configura tus datos profesionales

## Responsive Design

Todas las interfaces están optimizadas para:
- 📱 Móvil (320px+)
- 📱 Tablet (768px+)
- 💻 Desktop (1024px+)

El menú lateral se transforma en un hamburger menu en pantallas pequeñas con un overlay oscuro al abrirse.
