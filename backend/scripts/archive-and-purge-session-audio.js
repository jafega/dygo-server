#!/usr/bin/env node
/**
 * Archiva a Storage y purga de Postgres el audio base64 guardado en
 * session_entry.data.file (y non_session_entry.data.file).
 *
 * POR QUÉ: ese audio nunca se lee. El frontend no lo pide en ningún sitio y la
 * transcripción va por el bucket `session-files`. Solo se escribe. Eran 211 MB, el 86%
 * de toda la base de datos, y fue la causa raíz de los 522: cualquier listado con
 * select('*') arrastraba cientos de MB por PostgREST y saturaba su pool. Sacando el
 * audio de Postgres, ese modo de fallo desaparece de raíz.
 *
 * SEGURIDAD DEL PROCESO, por fila:
 *   1. sube el audio al bucket PRIVADO `session-audio-archive`
 *   2. lo RE-DESCARGA y compara el tamaño byte a byte
 *   3. solo si cuadra, quita la clave `file` del JSONB y deja anotado dónde quedó
 * Si cualquier paso falla, la fila se salta INTACTA. Es idempotente: se puede relanzar.
 *
 * No usa DDL ni SQL crudo: solo el cliente normal de Supabase.
 * El inventario pide únicamente `id` (filtrando por `data->>file=not.is.null`), así que
 * nunca transfiere los blobs en bloque — que es justo lo que tumbaba la instancia.
 *
 * Uso:
 *   node backend/scripts/archive-and-purge-session-audio.js
 *   node backend/scripts/archive-and-purge-session-audio.js --apply
 *   node backend/scripts/archive-and-purge-session-audio.js --apply --table non_session_entry
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '..', '.env.local') });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = 'session-audio-archive';
const ALLOWED_TABLES = ['session_entry', 'non_session_entry'];

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY en .env.local');
  process.exit(1);
}

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const TABLE = (() => {
  const i = args.indexOf('--table');
  return i >= 0 && args[i + 1] ? args[i + 1] : 'session_entry';
})();

if (!ALLOWED_TABLES.includes(TABLE)) {
  console.error(`Tabla no permitida: ${TABLE}. Solo ${ALLOWED_TABLES.join(', ')}`);
  process.exit(1);
}

const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const EXT_BY_TYPE = {
  'audio/webm': 'webm', 'audio/mpeg': 'mp3', 'audio/mp3': 'mp3', 'audio/mp4': 'm4a',
  'audio/m4a': 'm4a', 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/ogg': 'ogg',
  'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov'
};

const human = (n) => {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} kB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
};

async function main() {
  console.log(`\n${APPLY ? '🔴 APPLY' : '🟢 DRY-RUN'} — tabla ${TABLE}, bucket ${BUCKET}\n`);

  // Inventario LIGERO: solo ids. El filtro va sobre data->>file pero no se proyecta,
  // así que PostgREST no manda un solo byte de audio.
  const { data: ids, error: invErr } = await db
    .from(TABLE)
    .select('id')
    .not('data->>file', 'is', null);

  if (invErr) {
    console.error('Error leyendo el inventario:', invErr.message);
    process.exit(1);
  }
  if (!ids?.length) {
    console.log('No hay filas con audio. Nada que hacer.');
    return;
  }

  console.log(`Filas con audio: ${ids.length}`);
  if (!APPLY) {
    console.log('\nDRY-RUN: no se toca nada. Relanza con --apply.');
    console.log('Se archivará cada audio en el bucket privado y luego se quitará del JSONB.');
    return;
  }

  let archived = 0, purged = 0, skipped = 0, freed = 0;

  for (const [i, { id }] of ids.entries()) {
    const label = `[${String(i + 1).padStart(3)}/${ids.length}] ${id.slice(0, 8)}`;
    try {
      // Una fila a la vez: como mucho ~4 MB en vuelo.
      const { data: rows, error: rowErr } = await db
        .from(TABLE).select('id, data').eq('id', id).limit(1);
      if (rowErr) { console.log(`${label} ❌ lectura: ${rowErr.message}`); skipped++; continue; }

      const data = rows?.[0]?.data;
      const rawFile = data?.file;
      if (!rawFile) { console.log(`${label} ⏭️  ya sin audio`); continue; }

      // Puede venir como data-URI o como base64 desnudo.
      const b64 = String(rawFile).includes('base64,')
        ? String(rawFile).split('base64,')[1]
        : String(rawFile);
      const buf = Buffer.from(b64, 'base64');
      if (!buf.length) { console.log(`${label} ⚠️  base64 ilegible, se salta`); skipped++; continue; }

      const declaredType = data.file_type
        || (String(rawFile).match(/^data:([\w.+\-\/]+);base64,/)?.[1]) || '';
      const ext = EXT_BY_TYPE[declaredType]
        || (data.file_name?.includes('.') ? data.file_name.split('.').pop().toLowerCase() : 'bin');
      const objectPath = `${TABLE}/${id}.${ext}`;

      // 1) Subir (upsert => relanzable sin duplicar)
      const { error: upErr } = await db.storage.from(BUCKET).upload(objectPath, buf, {
        contentType: declaredType || 'application/octet-stream',
        upsert: true
      });
      if (upErr) { console.log(`${label} ❌ subida: ${upErr.message}`); skipped++; continue; }

      // 2) Verificar: re-descargar y comparar tamaño exacto
      const { data: back, error: dlErr } = await db.storage.from(BUCKET).download(objectPath);
      if (dlErr) { console.log(`${label} ❌ verificación: ${dlErr.message}`); skipped++; continue; }
      const backLen = (await back.arrayBuffer()).byteLength;
      if (backLen !== buf.length) {
        console.log(`${label} ❌ tamaño no cuadra (${backLen} != ${buf.length}) — NO se purga`);
        skipped++; continue;
      }
      archived++;

      // 3) Solo ahora se quita el audio del JSONB. Se guarda la ruta para poder
      //    recuperarlo, y file_name/file_type se conservan (el historial clínico y
      //    los informes muestran "Archivo adjunto" con ellos).
      const { file: _drop, ...lightData } = data;
      lightData.audio_archived_to = `${BUCKET}/${objectPath}`;
      lightData.audio_archived_at = new Date().toISOString();
      lightData.audio_bytes = buf.length;

      const { error: updErr } = await db.from(TABLE).update({ data: lightData }).eq('id', id);
      if (updErr) { console.log(`${label} ❌ purga: ${updErr.message}`); continue; }

      purged++;
      freed += Buffer.byteLength(String(rawFile), 'utf8');
      console.log(`${label} ✅ ${human(buf.length).padStart(9)} → ${objectPath}`);
    } catch (err) {
      console.log(`${label} ❌ ${err.message}`);
      skipped++;
    }
  }

  console.log(`\n── Resumen ──`);
  console.log(`  archivados: ${archived}`);
  console.log(`  purgados:   ${purged}`);
  console.log(`  saltados:   ${skipped}`);
  console.log(`  liberado:   ${human(freed)} de JSONB`);
  if (skipped) console.log(`\n  ⚠️  ${skipped} filas quedaron INTACTAS. Revisa los errores y relanza.`);
  console.log(`\n  Para devolver el espacio al disco: VACUUM FULL ANALYZE public.${TABLE};`);
}

main().catch(err => { console.error(err); process.exit(1); });
