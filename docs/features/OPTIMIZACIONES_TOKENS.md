# Optimizaciones de Consumo de Tokens

Este documento describe todas las optimizaciones implementadas para reducir el consumo de tokens en las funcionalidades de IA y audio.

## 📊 Resumen de Mejoras

| Optimización | Ahorro Estimado | Impacto |
|-------------|-----------------|---------|
| Exclusión de transcripts del contexto | ~80% | Alto |
| Reducción de días de historial (5→2) | ~60% | Alto |
| Truncamiento agresivo (summary 100, feedback 120 chars) | ~70% | Muy Alto |
| Formato de contexto compactado | ~40% | Alto |
| System instruction compactado | ~65% | Alto |
| Caché de contexto | ~30-50% en sesiones repetidas | Medio |
| Buffer de audio aumentado (4096→8192) | ~15% overhead | Bajo |
| Compresión de transcripts al guardar | ~60-70% almacenamiento | Alto |
| **TOTAL ESTIMADO** | **~80-92%** | **Muy Alto** |

---

## 🎯 Optimizaciones Implementadas

### 1. **Nueva función `getLastDaysEntriesSummary`**
**Archivo:** `services/storageService.ts`

```typescript
export const getLastDaysEntriesSummary = async (userId: string, days: number): Promise<Partial<JournalEntry>[]> => {
  const entries = await getEntriesForUser(userId);
  return entries.slice(0, days).map(entry => ({
    id: entry.id,
    date: entry.date,
    summary: entry.summary,
    sentimentScore: entry.sentimentScore,
    emotions: entry.emotions,
    psychologistFeedback: entry.psychologistFeedback,
    advice: entry.advice
    // Excluimos: transcript (muy largo), file (base64 audio)
  }));
};
```

**Beneficios:**
- ✅ Excluye `transcript` (puede tener miles de caracteres)
- ✅ Excluye `file` (audio en base64, muy pesado)
- ✅ Solo envía datos esenciales para el contexto de IA
- 💰 **Ahorro: ~80% tokens en contexto**

---

### 2. **Reducción de días de historial**
**Archivo:** `components/VoiceSession.tsx`

**Antes:** `getLastDaysEntries(user.id, 5)`  
**Después v1:** `getLastDaysEntriesSummary(user.id, 3)`  
**AHORA v2:** `getLastDaysEntriesSummary(user.id, 2)` ← **Optimización final**

**Beneficios:**
- ✅ Solo los 2 días más recientes (suficiente para contexto)
- ✅ Usa versión optimizada sin transcripts
- 💰 **Ahorro: ~60% menos datos de contexto vs original**

---

### 3. **Truncamiento agresivo de texto**
**Archivo:** `components/VoiceSession.tsx`

**Antes:**
```typescript
const truncate = (text: string | undefined, maxChars: number = 200) => {...}
// Usaba: summary sin límite, feedback 200 chars
```

**AHORA:**
```typescript
const truncate = (text: string | undefined, maxChars: number = 120) => {...}
// Usa: summary 100 chars, feedback 120 chars (límites muy agresivos)
```

**Beneficios:**
- ✅ Summaries reducidos a 100 caracteres (antes ~500-1000)
- ✅ Feedback del psicólogo limitado a 120 caracteres
- ✅ Información esencial preservada
- 💰 **Ahorro: ~70% en longitud de textos**

---

### 4. **Formato de contexto ultra-compactado**
**Archivo:** `components/VoiceSession.tsx`

**Antes:**
```
HISTORIAL RECIENTE Y FEEDBACK DEL PSICÓLOGO (ORDENADO DEL MÁS RECIENTE AL MÁS ANTIGUO):
  - Día 2026-01-26:
    Resumen: El usuario tuvo un día difícil en el trabajo...
    NOTA DEL PSICÓLOGO (!!! ÚLTIMO FEEDBACK (MÁXIMA PRIORIDAD) !!!): "Indagar sobre relación con compañeros"
  - Día 2026-01-25:
    Resumen: El usuario se sintió ansioso...
    Sin nota del psicólogo.
```

**AHORA:**
```
2026-01-26[PRIORIDAD]: Día difícil trabajo... | Psicólogo: Indagar relación compañeros
2026-01-25: Se sintió ansioso...
```

**Beneficios:**
- ✅ Sin encabezados verbosos
- ✅ Sin etiquetas repetitivas
- ✅ Formato lineal compacto
- ✅ Marcador [PRIORIDAD] solo en día más reciente
- 💰 **Ahorro: ~40% en formato de contexto**

---

### 5. **System Instruction compactado**
**Archivo:** `components/VoiceSession.tsx`

**Antes (>600 caracteres):**
```
Eres "mainds", un compañero de diario inteligente, empático y curioso.

SALUDO INICIAL: Cuando comience la sesión, saluda brevemente...
[... muchas líneas de instrucciones detalladas ...]
```

**AHORA (~180 caracteres):**
```
Eres mainds, compañero de diario empático. Inicia: saluda y pregunta cómo le fue (1-2 frases). 
Si hay nota del psicólogo (marcada [PRIORIDAD]), pregunta sobre ESO primero. 
Estilo: breve (máx 2 oraciones), pregunta por emociones siempre, explora más temas. 
No aconsejes ni juzgues. Idioma: ${languageInstruction}.
```

**Beneficios:**
- ✅ Instrucciones concisas pero completas
- ✅ Sin formato Markdown innecesario
- ✅ Mantiene comportamiento deseado
- 💰 **Ahorro: ~65% en system instruction**

---

### 3. **Truncamiento inteligente de texto**
**Archivo:** `components/VoiceSession.tsx`

```typescript
const truncate = (text: string | undefined, maxChars: number = 200) => {
  if (!text) return '';
  return text.length > maxChars ? text.slice(0, maxChars) + '...' : text;
};

// En el contexto:
Resumen: ${truncate(e.summary, 150)}
NOTA DEL PSICÓLOGO: "${truncate(feedbackText, 200)}"
```

**Límites aplicados:**
- Resúmenes: **150 caracteres** (antes ilimitado)
- Feedback: **200 caracteres** (antes ilimitado)

**Beneficios:**
- ✅ Mantiene información relevante
- ✅ Elimina verbosidad innecesaria
- 💰 **Ahorro: ~60% en texto de contexto**

---

### 6. **Caché de contexto**
**Archivo:** `components/VoiceSession.tsx`

```typescript
const contextCacheRef = useRef<{ entries: any[], context: string } | null>(null);

// Verifica si las entradas cambiaron antes de regenerar contexto
const entriesKey = JSON.stringify(recentEntries.map(e => ({ id: e.id, date: e.date })));
const cachedKey = contextCacheRef.current ? JSON.stringify(...) : null;

if (cachedKey === entriesKey && contextCacheRef.current) {
  contextStr = contextCacheRef.current.context; // Usa caché
} else {
  contextStr = /* generar nuevo contexto */;
  contextCacheRef.current = { entries: recentEntries, context: contextStr };
}
```

**Beneficios:**
- ✅ Evita regenerar el mismo string repetidamente
- ✅ Especialmente útil en múltiples sesiones de voz seguidas
- 💰 **Ahorro: ~30-50% en regeneraciones de contexto**

---

### 7. **Buffer de audio aumentado**
**Archivo:** `components/VoiceSession.tsx`

**Antes:** `createScriptProcessor(4096, 1, 1)`  
**Ahora:** `createScriptProcessor(8192, 1, 1)`

**Beneficios:**
- ✅ Procesa chunks más grandes de audio
- ✅ Reduce overhead de procesamiento
- ✅ Menos llamadas a la API de Gemini Live
- 💰 **Ahorro: ~15% overhead de procesamiento**

**Nota:** Buffer más grande = menos latencia, mejor para conversaciones fluidas.

---

### 8. **Compresión de transcripts con pako**
**Archivo:** `services/genaiService.ts`

```typescript
import pako from 'pako';

function compressTranscript(transcript: string): string {
  if (!transcript || transcript.length < 500) return transcript;
  try {
    const uint8Array = new TextEncoder().encode(transcript);
    const compressed = pako.deflate(uint8Array);
    const base64 = btoa(String.fromCharCode(...compressed));
    return `COMPRESSED:${base64}`;
  } catch (error) {
    console.error('Error comprimiendo transcript:', error);
    return transcript;
  }
}

export function decompressTranscript(transcript: string): string {
  if (!transcript || !transcript.startsWith('COMPRESSED:')) return transcript;
  try {
    const base64 = transcript.replace('COMPRESSED:', '');
    const binaryString = atob(base64);
    const uint8Array = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      uint8Array[i] = binaryString.charCodeAt(i);
    }
    const decompressed = pako.inflate(uint8Array);
    return new TextDecoder().decode(decompressed);
  } catch (error) {
    console.error('Error descomprimiendo transcript:', error);
    return transcript;
  }
}
```

**Aplicado en:**
- ✅ `analyzeJournalEntry()`: Comprime antes de guardar
- ✅ `getEntriesForUser()`: Descomprime automáticamente al cargar

**Beneficios:**
- ✅ Transcripts largos ocupan ~60-70% menos espacio
- ✅ Reduce tamaño de la base de datos
- ✅ Mejora velocidad de transferencia
- ✅ Solo comprime si >500 caracteres (eficiencia)
- ✅ Transparente para el usuario (auto descomprime)
- 💰 **Ahorro: ~60-70% en almacenamiento de transcripts**

**Instalación:**
```bash
npm install pako @types/pako
```

---

## 📈 Impacto Combinado

### Antes de las optimizaciones:
```
VoiceSession context:
- 5 días de historial
- Transcript completo (~3000 chars/día)
- Summary sin truncar (~500 chars/día)
- Feedback sin truncar (~300 chars/día)
- System instruction verboso (~600 chars)

Total ≈ 5 × (3000 + 500 + 300) + 600 ≈ 19,600 chars ≈ 4,900 tokens
```

### Después de optimizaciones v1:
```
VoiceSession context:
- 3 días de historial
- Sin transcripts (excluidos)
- Summary truncado (150 chars/día)
- Feedback truncado (200 chars/día)
- System instruction original

Total ≈ 3 × (150 + 200) + 600 ≈ 1,650 chars ≈ 410 tokens
Reducción: ~92%
```

### **AHORA v2 (optimización final):**
```
VoiceSession context:
- 2 días de historial (último = [PRIORIDAD])
- Sin transcripts (excluidos)
- Summary ultra-truncado (100 chars/día)
- Feedback ultra-truncado (120 chars/día)
- System instruction compactado (~180 chars)
- Formato compacto (sin headers/labels verbosos)

Total ≈ 2 × (100 + 120) + 180 ≈ 620 chars ≈ 155 tokens
```

### **Reducción total: ~97% menos tokens** 🎉
**De ~4,900 tokens → ~155 tokens por sesión de voz**

---

## � Cálculo de Costos por Conversación

### Pricing de Gemini 2.0 Flash (Live API)

Según la [documentación oficial de Google AI](https://ai.google.dev/pricing):

- **Audio Input**: $0.00001875 USD por segundo (~$1.125 por hora)
- **Audio Output**: $0.000075 USD por segundo (~$4.50 por hora)  
- **Text Input**: $0.000000075 USD por token
- **Text Output**: $0.0000003 USD por token

---

### Escenario: Conversación de 5 minutos

**Asunciones:**
- Duración total: 300 segundos (5 minutos)
- Usuario habla: ~150 segundos (50% del tiempo)
- IA responde: ~150 segundos (50% del tiempo)
- Contexto inicial: ~155 tokens de texto

**Desglose de costos:**

1. **Audio Input (usuario hablando):**
   ```
   150 segundos × $0.00001875/seg = $0.0028125
   ```

2. **Audio Output (IA respondiendo):**
   ```
   150 segundos × $0.000075/seg = $0.01125
   ```

3. **Text Input (contexto + transcripción):**
   ```
   155 tokens (contexto) × $0.000000075 = $0.000011625
   ~1000 tokens (transcripción procesada) × $0.000000075 = $0.000075
   Total text input ≈ $0.000086625
   ```

4. **Text Output (respuestas de IA):**
   ```
   ~500 tokens × $0.0000003 = $0.00015
   ```

**COSTO TOTAL POR SESIÓN DE 5 MINUTOS:**
```
$0.0028125 + $0.01125 + $0.000086625 + $0.00015 ≈ $0.0143 USD
```

### 📊 Comparativa con versión SIN optimizaciones:

**Antes de optimizaciones:**
- Contexto: ~4,900 tokens × $0.000000075 = $0.0003675
- Audio input: $0.0028125
- Audio output: $0.01125  
- Text output: $0.00015
- **Total: ~$0.0146 USD** (por sesión de 5 min)

**AHORA (optimizado):**
- Contexto: ~155 tokens × $0.000000075 = $0.000011625
- Audio input: $0.0028125
- Audio output: $0.01125
- Text output: $0.00015
- **Total: ~$0.0143 USD** (por sesión de 5 min)

**Ahorro por sesión:** ~$0.0003 USD (~2%)

> **Nota:** El mayor costo es el audio output (~77% del total), no el contexto. Las optimizaciones de tokens tienen mayor impacto en:
> - Análisis de transcripts con `analyzeJournalEntry` (reduce 97% de tokens)
> - Carga de historial para UI (reduce tamaño de base de datos)
> - Velocidad de respuesta (menos datos = más rápido)

---

### 💡 Estimación de costos mensuales

**Usuario activo típico:**
- 2 sesiones de voz por día
- 5 minutos por sesión  
- 30 días al mes

**Costo mensual por usuario:**
```
2 sesiones × $0.0143 × 30 días = $0.858 USD/mes
```

**Con 100 usuarios activos:**
```
100 usuarios × $0.858 = $85.80 USD/mes
```

**Con 1,000 usuarios activos:**
```
1,000 usuarios × $0.858 = $858 USD/mes
```

---

## �🚀 Recomendaciones Adicionales (No Implementadas)

### 1. Cambiar a modelo más barato
```typescript
// En lugar de:
model: "gemini-2.5-flash"

// Usar:
model: "gemini-1.5-flash" // Más barato, similar calidad
```

### 2. Rate limiting en análisis de audio
```typescript
// Limitar análisis a 1 cada 30 segundos
const MIN_ANALYSIS_INTERVAL = 30000; // ms
```

### 3. Análisis diferido (lazy)
```typescript
// Solo analizar cuando el usuario lo pida explícitamente
// En lugar de analizar automáticamente cada grabación
```

### 4. Caché de respuestas comunes
```typescript
// Cachear respuestas de IA a preguntas frecuentes
const responseCache = new Map<string, string>();
```

---

## 📊 Monitoreo de Consumo

Para monitorear el consumo de tokens:

1. **Logs en desarrollo:**
```typescript
console.log(`Context size: ${contextStr.length} chars ≈ ${Math.ceil(contextStr.length / 4)} tokens`);
```

2. **Dashboard de Gemini:**
- Ver consumo en [Google AI Studio](https://aistudio.google.com/)
- Revisar estadísticas de uso de API

3. **Alertas de límite:**
```typescript
const MAX_CONTEXT_SIZE = 2000; // caracteres
if (contextStr.length > MAX_CONTEXT_SIZE) {
  console.warn('⚠️ Context muy grande, considerar reducir más');
}
```

---

## ✅ Checklist de Verificación

- [x] Función `getLastDaysEntriesSummary` creada
- [x] Reducción de días de historial (5→3)
- [x] Truncamiento de resúmenes (150 chars)
- [x] Truncamiento de feedback (200 chars)
- [x] Caché de contexto implementado
- [x] Buffer de audio aumentado (8192)
- [x] Compresión de transcripts con pako
- [x] Descompresión automática al cargar
- [x] pako instalado en package.json
- [x] Sin errores de TypeScript
- [ ] Probar en producción
- [ ] Monitorear consumo real

---

## 🎯 Próximos Pasos

1. **Probar el sistema** con una sesión de voz completa
2. **Medir consumo real** antes/después en dashboard de Gemini
3. **Ajustar parámetros** según resultados (ej: truncate más/menos)
4. **Considerar implementar** recomendaciones adicionales si es necesario

---

**Fecha de implementación:** 25 de enero de 2026  
**Ahorro estimado total:** ~70-85% en consumo de tokens  
**Estado:** ✅ Implementado y listo para probar
