import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

const dbFile = path.join(process.cwd(), 'db.json');

if (fs.existsSync(dbFile)) {
  const raw = fs.readFileSync(dbFile, 'utf-8') || '{}';
  const db = JSON.parse(raw);
  if (Array.isArray(db.entries)) {
    db.entries = db.entries.map((e) => {
      if (e && e.psychologistEntryType === 'SESSION') {
        return {
          ...e,
          psychologistFeedback: undefined,
          psychologistFeedbackUpdatedAt: undefined,
          psychologistFeedbackReadAt: undefined
        };
      }
      return e;
    });
    fs.writeFileSync(dbFile, JSON.stringify(db, null, 2));
  }
}

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (url && key) {
  const supa = createClient(url, key, { auth: { persistSession: false } });
  const { data, error } = await supa.from('entries').select('*');
  if (error) throw error;
  if (data && data.length) {
    const sessionRows = data.filter((row) => {
      const payload = row.data && typeof row.data === 'object' ? row.data : row;
      return payload?.psychologistEntryType === 'SESSION';
    });
    if (sessionRows.length) {
      const updates = sessionRows.map((row) => {
        if (row.data && typeof row.data === 'object') {
          const next = { ...row.data };
          delete next.psychologistFeedback;
          delete next.psychologistFeedbackUpdatedAt;
          delete next.psychologistFeedbackReadAt;
          return { id: row.id, data: next };
        }
        return {
          id: row.id,
          psychologistFeedback: null,
          psychologistFeedbackUpdatedAt: null,
          psychologistFeedbackReadAt: null
        };
      });
      const { error: upErr } = await supa.from('entries').upsert(updates, { onConflict: 'id' });
      if (upErr) throw upErr;
    }
  }
}

console.log('✅ Session feedback cleared');
