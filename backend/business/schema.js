// Columnas de las tablas de Business según las migraciones SQL
// (backend/scripts/business-00N-*.sql).
//
// Lo usa el store local (file/memory) en los tests para comprobar que el
// código solo escribe columnas que existen de verdad. Sin esta comprobación,
// un nombre de columna mal escrito pasaría todos los tests en local y en
// Supabase fallaría (PostgREST rechaza columnas desconocidas).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const SCRIPTS_DIR = path.resolve(__dirname, '..', 'scripts');

/** Columnas por tabla a partir del texto SQL de las migraciones. */
export function parseSchema(sqlTexts) {
  const tables = {};
  for (const sql of sqlTexts) {
    const create = /CREATE TABLE IF NOT EXISTS public\.(\w+) \(([\s\S]*?)\n\);/g;
    let m;
    while ((m = create.exec(sql))) {
      const cols = tables[m[1]] || new Set();
      for (const raw of m[2].split('\n')) {
        const line = raw.trim();
        const c = /^([a-z_][a-z0-9_]*)\s+[a-z]/.exec(line);
        if (c && c[1] !== 'constraint') cols.add(c[1]);
      }
      tables[m[1]] = cols;
    }
    const alter = /ALTER TABLE public\.(\w+) ADD COLUMN IF NOT EXISTS (\w+)/g;
    while ((m = alter.exec(sql))) {
      (tables[m[1]] ||= new Set()).add(m[2]);
    }
  }
  return tables;
}

/** Lee y analiza todas las migraciones de Business. */
export function loadBusinessSchema(dir = SCRIPTS_DIR) {
  const files = fs.readdirSync(dir).filter(f => /^business-\d{3}-.+\.sql$/.test(f)).sort();
  return parseSchema(files.map(f => fs.readFileSync(path.join(dir, f), 'utf-8')));
}
