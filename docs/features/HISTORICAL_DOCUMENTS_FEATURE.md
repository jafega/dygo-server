# Feature: Documentos Históricos del Paciente

## Descripción

Se ha implementado una nueva funcionalidad en la **Historia Clínica** del paciente que permite subir y gestionar documentos históricos. Esta característica es especialmente útil para pacientes que se migran desde otro terapeuta o centro, permitiendo mantener un registro completo de su historial clínico previo.

## Ubicación

La funcionalidad se encuentra en:
- **Componente**: `PatientDetailModal.tsx`
- **Pestaña**: "Historia Clínica"
- **Posición**: Al final de la pestaña, después de las sesiones registradas

## Funcionalidades

### 1. Subir Documentos
- Permite subir múltiples documentos simultáneamente
- Formatos soportados: PDF, DOC, DOCX, TXT, JPG, JPEG, PNG
- Tamaño máximo por archivo: 10 MB
- Los documentos se almacenan en formato Base64 en la base de datos

### 2. Visualizar Documentos
- Lista de todos los documentos históricos subidos
- Información mostrada:
  - Nombre del archivo
  - Tamaño del archivo
  - Fecha de subida
- Acciones disponibles:
  - Descargar documento
  - Eliminar documento

### 3. Resumen Automático con IA
- Botón "Generar Resumen" que utiliza Gemini AI
- Analiza todos los documentos históricos subidos
- Genera un resumen clínico estructurado que incluye:
  - Contexto general del paciente
  - Motivos de consulta previos
  - Diagnósticos o evaluaciones previas
  - Tratamientos o intervenciones realizadas
  - Aspectos relevantes para la continuidad terapéutica
- El resumen se actualiza cada vez que se genera
- Muestra la fecha y hora de la última generación

## Estructura de Datos

### Tipos TypeScript (`types.ts`)

```typescript
export interface HistoricalDocument {
  id: string;
  fileName: string;
  fileType: string; // MIME type
  fileSize: number; // In bytes
  uploadedAt: number; // timestamp
  content: string; // Base64 encoded file content
  extractedText?: string; // Text extracted from the document for AI processing
}

export interface HistoricalDocumentsSummary {
  documents: HistoricalDocument[];
  aiSummary?: string; // AI-generated summary of all historical documents
  lastUpdated: number; // timestamp
}
```

### Almacenamiento

Los documentos se guardan en la relación `care_relationships` dentro del campo `data.historicalDocuments`:

**En Supabase:**
- Los documentos se persisten automáticamente en la tabla `care_relationships`
- El campo `data` (JSONB) contiene toda la estructura de documentos históricos
- Se actualiza el cache local para sincronización

**En Base de Datos Local (fallback):**
- Si Supabase no está disponible, se guarda en `db.json`
- Estructura idéntica para compatibilidad

```json
{
  "id": "relationship-id",
  "data": {
    "historicalDocuments": {
      "documents": [
        {
          "id": "doc-id",
          "fileName": "informe_previo.pdf",
          "fileType": "application/pdf",
          "fileSize": 245678,
          "uploadedAt": 1738972800000,
          "content": "data:application/pdf;base64,..."
        }
      ],
      "aiSummary": "Resumen generado por IA...",
      "lastUpdated": 1738972900000
    }
  }
}
```

### Persistencia en Supabase

Todos los endpoints están integrados con Supabase:

1. **GET**: Lee primero desde Supabase, fallback a DB local
2. **POST**: Guarda en Supabase y actualiza cache automáticamente
3. **DELETE**: Elimina de Supabase y sincroniza cache
4. **GENERATE-SUMMARY**: Persiste el resumen en Supabase

Los datos se guardan en el campo JSONB `data` de la tabla `care_relationships`, lo que permite:
- ✅ Sincronización automática entre dispositivos
- ✅ Respaldo en la nube
- ✅ Acceso desde cualquier lugar
- ✅ Persistencia garantizada

## API Endpoints

### GET `/api/relationships/:id/historical-documents`
Obtiene todos los documentos históricos de una relación.

**Respuesta**:
```json
{
  "documents": [...],
  "aiSummary": "...",
  "lastUpdated": 1738972900000
}
```

### POST `/api/relationships/:id/historical-documents`
Sube un nuevo documento histórico.

**Body**:
```json
{
  "fileName": "informe.pdf",
  "fileType": "application/pdf",
  "fileSize": 245678,
  "content": "data:application/pdf;base64,..."
}
```

**Respuesta**: Retorna el documento creado con su ID.

### DELETE `/api/relationships/:id/historical-documents/:docId`
Elimina un documento histórico específico.

**Respuesta**: `{ "success": true }`

### POST `/api/relationships/:id/historical-documents/generate-summary`
Genera un resumen automático de todos los documentos usando Gemini AI.

**Respuesta**:
```json
{
  "success": true,
  "summary": "Resumen generado...",
  "documentsCount": 3
}
```

## Requisitos

- **API Key de Gemini**: Para la funcionalidad de resumen automático, se requiere configurar `GEMINI_API_KEY` en las variables de entorno del backend.
- Si no está configurada, los documentos se pueden subir y gestionar normalmente, pero el botón de generar resumen mostrará un error.

## Flujo de Uso

1. **Psicólogo accede a Historia Clínica del paciente**
   - Navega a la pestaña "Historia Clínica"
   - Desplaza hasta el final donde está la sección "Documentos Históricos"

2. **Subir documentos**
   - Click en botón "Subir"
   - Selecciona uno o varios archivos
   - Los documentos se suben automáticamente

3. **Generar resumen**
   - Cuando hay documentos subidos, aparece el botón "Generar Resumen"
   - Al hacer click, la IA analiza todos los documentos
   - El resumen aparece en la parte superior de la sección
   - Se muestra en un cuadro destacado con fondo degradado

4. **Gestionar documentos**
   - Descargar cualquier documento con el botón de descarga
   - Eliminar documentos que ya no sean necesarios
   - Al eliminar todos los documentos, el resumen también se elimina

## Mejoras Futuras

- [ ] Extracción de texto de PDFs para análisis más profundo
- [ ] OCR para imágenes escaneadas
- [ ] Categorización automática de documentos
- [ ] Búsqueda dentro de documentos
- [ ] Versionado de documentos
- [ ] Firma digital de documentos
- [ ] Integración con servicios de almacenamiento en la nube (S3, etc.)

## Notas Técnicas

- Los documentos se almacenan en Base64 en la base de datos local (`db.json`)
- Para producción, se recomienda migrar a un servicio de almacenamiento externo
- El límite de 10MB por archivo puede ajustarse en `PatientDetailModal.tsx` línea 404
- El resumen de IA está optimizado para contexto clínico y terapéutico
