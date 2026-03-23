# Sistema de Notas de Sesión

## Descripción
Sistema completo para que los psicólogos documenten sus sesiones con transcripciones automáticas y resúmenes generados por IA.

## Características

### 1. **Tres métodos de entrada**
- **Transcript manual**: Escribir directamente las notas de la sesión
- **Subir archivo**: Soporta archivos de texto, PDF, audio (mp3, wav, webm) y video (mp4)
- **Grabar audio**: Grabación directa desde el navegador

### 2. **Transcripción automática**
- Archivos de audio y video se transcriben automáticamente usando Google Gemini 2.0 Flash
- Archivos PDF se procesan con extracción de texto mediante Gemini
- Archivos de texto se leen directamente
- El transcript generado es **editable** en tiempo real

### 3. **Resumen con IA**
- El psicólogo controla cuándo generar el resumen (botón manual)
- Usa Google Gemini 2.0 Flash para análisis profesional
- El resumen generado es **editable**
- Incluye:
  - Temas principales tratados
  - Observaciones clínicas
  - Intervenciones realizadas
  - Tareas o seguimiento
  - Notas adicionales

### 4. **Almacenamiento completo**
Los `session_entries` guardan:
- ✅ **Archivo original** (en base64)
- ✅ **Transcript** (extraído o escrito)
- ✅ **Resumen con IA** (generado o editado)
- ✅ **Estado** (pending/done)
- ✅ **Metadatos** (nombre archivo, tipo, fechas)

### 5. **Indicadores visuales**
- 🔴 **Rojo**: Sin nota creada
- 🟠 **Naranja**: Nota en estado "pending"
- 🟢 **Verde**: Nota completada (estado "done")

## Configuración

### Variables de entorno necesarias

```bash
# Backend (.env)
GEMINI_API_KEY=xxx  # Para transcripción con Gemini
```

### Instalación de dependencias

```bash
cd backend
npm install @google/generative-ai form-data busboy
```

## Endpoints API

### POST /api/transcribe
Transcribe archivos de audio/video o extrae texto de archivos.

**Request:**
```
Content-Type: multipart/form-data
Body: FormData con campo 'file'
```

**Response:**
```json
{
  "transcript": "Texto transcrito..."
}
```

**Tipos de archivo soportados:**
- Texto: `.txt`
- PDF: `.pdf` (extracción de texto con Gemini)
- Audio: `.mp3`, `.wav`, `.webm`, `.m4a`
- Video: `.mp4`, `.webm`

### POST /api/session-entries
Crea una nueva entrada de sesión.

**Request:**
```json
{
  "session_id": "uuid",
  "creator_user_id": "uuid",
  "target_user_id": "uuid",
  "transcript": "Texto del transcript...",
  "summary": "Resumen de la sesión...",
  "status": "pending",
  "file": "data:audio/webm;base64,xxx",
  "file_name": "recording.webm",
  "file_type": "audio/webm"
}
```

### PATCH /api/session-entries/:id
Actualiza una entrada existente (transcript, summary, status, archivo).

**Request:**
```json
{
  "transcript": "Transcript actualizado...",
  "summary": "Resumen actualizado...",
  "status": "done"
}
```

### GET /api/session-entries?session_id=xxx
Obtiene las entradas de una sesión específica.

## Flujo de uso

1. **Completar sesión**: El psicólogo marca la sesión como "completada"
2. **Abrir modal**: Clic en el botón de detalles (🔴/🟠/🟢)
3. **Elegir método**:
   - Escribir transcript manualmente
   - Subir archivo (se transcribe automáticamente)
   - Grabar audio (se transcribe automáticamente)
4. **Editar transcript**: El transcript generado se puede modificar
5. **Generar resumen**: Clic en "Generar resumen con IA"
6. **Editar resumen**: El resumen se puede ajustar antes de guardar
7. **Seleccionar estado**: Pending o Done
8. **Guardar**: Los datos se almacenan en la base de datos

## Estructura de datos

```typescript
interface SessionEntry {
  id: string;
  session_id: string;
  creator_user_id: string;
  target_user_id: string;
  data: {
    transcript: string;          // Editable
    summary: string;             // Editable
    status: 'pending' | 'done';
    file?: string;               // Base64
    file_name?: string;          // Nombre original
    file_type?: string;          // MIME type
    entry_type: 'session_note';
    created_at: string;
    updated_at?: string;
  };
  created_at: string;
}
```

## Componentes modificados

- `components/SessionDetailsModal.tsx` - Modal principal con todos los métodos de entrada
- `components/PsychologistPatientSessions.tsx` - Lista de sesiones de paciente específico
- `components/SessionsList.tsx` - Lista global de sesiones
- `backend/server.js` - Endpoints de transcripción y session_entries

## Limitaciones actuales
Tamaño de archivo**: Limitado por Gemini API (~20MB para archivos multimodales)
- **Transcripción**: Depende de Google Gemini (requiere API key gratuitate)
- **Transcripción**: Depende de OpenAI Whisper (requiere API key y créditos)

## Próximas mejoras sugeridas

- [ ] Añadir soporte para extracción de texto de PDF (usando pdf-parse)
- [ ] Implementar progreso de transcripción para archivos grandes
- [ ] Añadir preview de archivos multimedia
- [ ] Exportar sesiones a PDF con resumen incluido
- [ ] Búsqueda de texto en transcripts
- [ ] Filtros por estado (pending/done)
- [ ] Soporte para múltiples idiomas en transcripción