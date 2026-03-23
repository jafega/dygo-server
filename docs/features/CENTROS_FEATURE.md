# Sistema de Gestión de Centros

## Descripción
Nuevo módulo para que los psicólogos puedan gestionar los centros donde ofrecen sus servicios y asignarlos a sus pacientes.

## Características
- ✅ Crear centros con CIF, nombre y dirección
- ✅ Editar centros existentes
- ✅ Eliminar centros
- ✅ Listado visual con tarjetas
- ✅ **Asignar centros a pacientes en la configuración de la relación**

## Archivos Modificados

### Backend
- **backend/server.js**: 
  - Agregados endpoints CRUD para centros
  - Actualizado endpoint PUT `/api/relationships/:id` para soportar `center_id`
  - `GET /api/centers?psychologistId=...` - Listar centros
  - `POST /api/centers` - Crear centro
  - `PATCH /api/centers/:id` - Actualizar centro
  - `DELETE /api/centers/:id?psychologistId=...` - Eliminar centro

### Frontend
- **components/CentrosPanel.tsx**: Nuevo componente para gestión de centros
- **components/PatientDetailModal.tsx**: 
  - Agregado selector de centro en la pestaña "RELATIONSHIP"
  - Carga automática de centros del psicólogo
  - Actualización de `center_id` al guardar configuración de relación
- **components/PsychologistSidebar.tsx**: Agregada opción "Centros" con icono Building2
- **App.tsx**: Integrado CentrosPanel en el dashboard del psicólogo

### Base de Datos
- **SUPABASE_SCHEMA.md**: 
  - Actualizado con columna `psychologist_user_id` en tabla `center`
  - Actualizado con columna `center_id` en tabla `care_relationships`
- **backend/scripts/add-psychologist-to-center.sql**: Script para migrar tabla center
- **backend/scripts/add-center-to-relationships.sql**: Script para agregar center_id a care_relationships

## Configuración de Base de Datos

### Ejecutar en Supabase (EN ORDEN)

#### 1. Actualizar tabla center
```bash
# Ejecutar: backend/scripts/add-psychologist-to-center.sql
```

#### 2. Actualizar tabla care_relationships
```bash
# Ejecutar: backend/scripts/add-center-to-relationships.sql
```

#### 3. Verificar cambios
```sql
-- Verificar estructura de center
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'center' 
AND table_schema = 'public';

-- Verificar estructura de care_relationships
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'care_relationships' 
AND table_schema = 'public'
ORDER BY ordinal_position;
```

## Uso

### Gestión de Centros
1. Los psicólogos verán la nueva opción "Centros" en el sidebar
2. Pueden crear un nuevo centro haciendo clic en el botón "Nuevo Centro"
3. Completar los campos:
   - **Nombre del Centro**: Ej. "Centro de Psicología Integral"
   - **CIF**: Ej. "B12345678"
   - **Dirección**: Ej. "Calle Mayor 123, 28001 Madrid"
4. Los centros aparecerán como tarjetas con opciones de editar/eliminar

### Asignar Centro a un Paciente
1. Ir a la vista "Pacientes"
2. Seleccionar un paciente
3. Ir a la pestaña "Configuración de la Relación"
4. En el selector "Centro Asignado", elegir el centro correspondiente
5. Hacer clic en "Guardar Configuración"
6. El centro quedará asociado a ese paciente en su relación

## Endpoints API

### GET /api/centers
Obtiene todos los centros de un psicólogo.

**Query Parameters:**
- `psychologistId` (required)

**Response:**
```json
[
  {
    "id": "uuid",
    "psychologist_user_id": "uuid",
    "center_name": "Centro de Psicología",
    "cif": "B12345678",
    "address": "Calle Mayor 123",
    "created_at": "2026-01-26T..."
  }
]
```

### POST /api/centers
Crea un nuevo centro.

**Body:**
```json
{
  "psychologistId": "uuid",
  "center_name": "Centro de Psicología",
  "cif": "B12345678",
  "address": "Calle Mayor 123"
}
```

### PATCH /api/centers/:id
Actualiza un centro existente.

**Body:**
```json
{
  "psychologistId": "uuid",
  "center_name": "Nuevo Nombre",
  "cif": "B12345678",
  "address": "Nueva Dirección"
}
```

### DELETE /api/centers/:id
Elimina un centro.

**Query Parameters:**
- `psychologistId` (required)

## Validaciones
- Todos los campos son requeridos al crear/editar
- Solo el psicólogo propietario puede editar/eliminar sus centros
- La eliminación requiere confirmación del usuario
