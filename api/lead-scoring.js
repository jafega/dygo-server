import { createClient } from '@supabase/supabase-js';
import { traerTodo } from '../backend/utils/supabase-paginate.js';

export const config = { api: { bodyParser: true } };

// ── Score colour helper (for logging) ──
const tier = s => s >= 8 ? '🟢' : s >= 5 ? '🟡' : '🔴';

export default async function handler(req, res) {
  /* ── Auth ── */
  const auth = req.headers['authorization'];
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({ error: 'Supabase not configured' });
  }
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    /* ── 1. Fetch all active leads (not won/lost/cancelled) ── */
    // Paginado: PostgREST corta en 1000 filas sin avisar. Con 1.116 leads
    // activos, la version anterior dejaba 116 sin puntuar en cada ejecucion
    // — siempre los mismos, y sin ninguna senal de que faltaran.
    const leads = await traerTodo(() => supabase
      .from('leads')
      .select('id, email, name, stage, app_user_id, app_registered_at, app_plan, app_is_subscribed, assigned_to, tags, notes_count, last_contacted_at, created_at, phone, company, details, source, lead_score')
      .not('stage', 'in', '(won,lost,cancelled)')
      .order('created_at', { ascending: true }));
    if (!leads || leads.length === 0) {
      return res.status(200).json({ message: 'No active leads to score', scored: 0 });
    }

    /* ── 2. Fetch activities for all active leads (last 90 days) ── */
    const leadIds = leads.map(l => l.id);
    const ninetyDaysAgo = new Date(Date.now() - 90 * 86400000).toISOString();

    // Batch fetch activities (Supabase has a URL length limit, batch in groups)
    let allActivities = [];
    const BATCH = 50;
    for (let i = 0; i < leadIds.length; i += BATCH) {
      const batch = leadIds.slice(i, i + BATCH);
      const { data: acts } = await supabase
        .from('lead_activities')
        .select('lead_id, type, created_at, metadata')
        .in('lead_id', batch)
        .gte('created_at', ninetyDaysAgo)
        .order('created_at', { ascending: false });
      if (acts) allActivities = allActivities.concat(acts);
    }

    // Group activities by lead_id
    const actsByLead = {};
    for (const a of allActivities) {
      if (!actsByLead[a.lead_id]) actsByLead[a.lead_id] = [];
      actsByLead[a.lead_id].push(a);
    }

    /* ── 3. Fetch app usage data for leads with app_user_id ── */
    const appUserIds = leads.filter(l => l.app_user_id).map(l => l.app_user_id);
    let sessionsByUser = {};
    let entriesByUser = {};

    if (appUserIds.length > 0) {
      for (let i = 0; i < appUserIds.length; i += BATCH) {
        const batch = appUserIds.slice(i, i + BATCH);

        // Count sessions per psychologist.
        // La columna es psychologist_user_id (no psychologist_id): con el nombre
        // antiguo la query no devolvía nada y el uso puntuaba siempre 0.
        const { data: sessions } = await supabase
          .from('sessions')
          .select('psychologist_user_id')
          .in('psychologist_user_id', batch);
        if (sessions) {
          for (const s of sessions) {
            sessionsByUser[s.psychologist_user_id] = (sessionsByUser[s.psychologist_user_id] || 0) + 1;
          }
        }

        // Count care relationships (patients added)
        // Mismo caso, y además el filtro correcto de "activa" es la columna
        // booleana `active` (status='active' no lo cumple ninguna fila).
        const { data: rels } = await supabase
          .from('care_relationships')
          .select('psychologist_user_id')
          .in('psychologist_user_id', batch)
          .or('active.is.null,active.eq.true');
        if (rels) {
          for (const r of rels) {
            entriesByUser[r.psychologist_user_id] = (entriesByUser[r.psychologist_user_id] || 0) + 1;
          }
        }
      }
    }

    /* ── 4. Emails de admin_emails (una sola lectura) ── */
    // La version anterior recorria los leads en lotes de 50 y, para los salientes,
    // pedia TODOS los outbound en cada iteracion sin filtrar por destinatario:
    // con 1.127 leads eran 23 escaneos completos de admin_emails por ejecucion.
    // El volumen de los ultimos 90 dias es pequeno, asi que se lee una vez y se
    // indexa en memoria.
    const leadEmails = leads.map(l => (l.email || '').toLowerCase());
    const leadEmailSet = new Set(leadEmails.filter(Boolean));
    const emailsByLead = {};
    const outboundByLead = {};

    let recentEmails = [];
    try {
      recentEmails = await traerTodo(() => supabase
        .from('admin_emails')
        .select('from_email, to_email, direction, created_at')
        .gte('created_at', ninetyDaysAgo)
        .order('created_at', { ascending: true }));
    } catch (emailsErr) {
      console.warn('[lead-scoring] admin_emails no disponible:', emailsErr.message || emailsErr);
    }

    for (const e of recentEmails || []) {
      if (e.direction === 'inbound') {
        const key = (e.from_email || '').toLowerCase();
        if (!leadEmailSet.has(key)) continue;
        (emailsByLead[key] = emailsByLead[key] || []).push(e);
      } else if (e.direction === 'outbound') {
        // to_email puede llevar varios destinatarios separados por comas.
        const recipients = (e.to_email || '').toLowerCase().split(/[,;\s]+/).filter(Boolean);
        for (const addr of recipients) {
          if (!leadEmailSet.has(addr)) continue;
          (outboundByLead[addr] = outboundByLead[addr] || []).push(e);
        }
      }
    }

    /* ── 5. Score each lead ── */
    const now = Date.now();
    const dayMs = 86400000;
    const updates = [];

    for (const lead of leads) {
      const acts = actsByLead[lead.id] || [];
      const inboundEmails = emailsByLead[lead.email.toLowerCase()] || [];
      const outboundEmails = outboundByLead[lead.email.toLowerCase()] || [];
      const sessionCount = lead.app_user_id ? (sessionsByUser[lead.app_user_id] || 0) : 0;
      const patientCount = lead.app_user_id ? (entriesByUser[lead.app_user_id] || 0) : 0;

      let score = 0;

      // ── A. Profile completeness (0-1 pts) ──
      let profilePts = 0;
      if (lead.name) profilePts += 0.25;
      if (lead.phone) profilePts += 0.25;
      if (lead.company) profilePts += 0.25;
      if (lead.details) profilePts += 0.25;
      score += profilePts;

      // ── B. Pipeline stage progression (0-2 pts) ──
      const stagePts = { new: 0, prueba: 0.5, contacted: 1, demo: 1.5 };
      score += stagePts[lead.stage] ?? 0;

      // ── C. App registration & subscription (0-2.5 pts) ──
      if (lead.app_user_id) {
        score += 1; // Registered in app
        if (lead.app_is_subscribed) {
          score += 1.5; // Already paying
        } else if (lead.app_plan) {
          score += 0.5; // Has a plan but not subscribed (trial?)
        }
      }

      // ── D. Platform usage (0-1.5 pts) ──
      if (lead.app_user_id) {
        if (sessionCount > 0) score += Math.min(sessionCount / 10, 0.75); // Up to 0.75 for sessions
        if (patientCount > 0) score += Math.min(patientCount / 5, 0.75);  // Up to 0.75 for patients
      }

      // ── E. Communication engagement (0-1.5 pts) ──
      const emailsSent = outboundEmails.length + acts.filter(a => a.type === 'email_sent' || a.type === 'email_bulk').length;
      const emailsReceived = inboundEmails.length + acts.filter(a => a.type === 'email_received').length;

      if (emailsSent > 0) score += 0.25; // We've reached out
      if (emailsReceived > 0) {
        score += 0.5; // They've responded at least once
        // Response ratio bonus
        const ratio = emailsSent > 0 ? emailsReceived / emailsSent : 1;
        score += Math.min(ratio * 0.75, 0.75); // Up to 0.75 for good response rate
      }

      // ── F. Recency of interaction (0-1 pts) ──
      if (lead.last_contacted_at) {
        const daysSince = (now - new Date(lead.last_contacted_at).getTime()) / dayMs;
        if (daysSince <= 3) score += 1;
        else if (daysSince <= 7) score += 0.75;
        else if (daysSince <= 14) score += 0.5;
        else if (daysSince <= 30) score += 0.25;
        // > 30 days: 0 pts (gone cold)
      }

      // ── G. Activity volume (0-0.5 pts) ──
      const totalActivities = acts.length;
      score += Math.min(totalActivities / 20, 0.5);

      // Clamp to 1-10 and round
      const finalScore = Math.max(1, Math.min(10, Math.round(score)));

      updates.push({
        id: lead.id,
        lead_score: finalScore,
        previous_score: lead.lead_score ?? null,
        lead_score_updated_at: new Date().toISOString()
      });
    }

    /* ── 6. Persistir solo los scores que han cambiado ── */
    // Antes se lanzaba un UPDATE por lead (1.127 peticiones por ejecucion) y los
    // errores se descartaban con `if (!updateErr)`, asi que el cron parecia
    // funcionar aunque no escribiera nada. Ahora se escriben solo los cambios y
    // los fallos se cuentan y se devuelven.
    const changed = updates.filter(u => u.previous_score !== u.lead_score);
    let updated = 0;
    const writeErrors = [];
    const WRITE_CONCURRENCY = 8;

    for (let i = 0; i < changed.length; i += WRITE_CONCURRENCY) {
      const slice = changed.slice(i, i + WRITE_CONCURRENCY);
      const results = await Promise.all(slice.map(u =>
        supabase
          .from('leads')
          .update({ lead_score: u.lead_score, lead_score_updated_at: u.lead_score_updated_at })
          .eq('id', u.id)
          .then(({ error }) => ({ id: u.id, error }))
      ));
      for (const r of results) {
        if (r.error) writeErrors.push({ id: r.id, error: r.error.message || String(r.error) });
        else updated++;
      }
    }

    if (writeErrors.length) {
      console.error(`[lead-scoring] ${writeErrors.length} escrituras fallaron:`, writeErrors.slice(0, 5));
    }

    const summary = changed.slice(0, 25).map(u => {
      const lead = leads.find(l => l.id === u.id);
      return `${tier(u.lead_score)} ${(lead?.name || lead?.email || u.id).substring(0, 30)}: ${u.previous_score ?? '-'} -> ${u.lead_score}/10`;
    }).join('\n');

    console.log(`[lead-scoring] ✅ ${updated}/${changed.length} scores actualizados (${leads.length} leads evaluados):\n${summary}`);

    return res.status(200).json({
      message: `Actualizados ${updated} de ${changed.length} scores con cambios`,
      scored: updated,
      changed: changed.length,
      total: leads.length,
      write_errors: writeErrors.length,
      scores: changed.map(u => ({ id: u.id, score: u.lead_score, previous: u.previous_score })),
    });
  } catch (err) {
    console.error('[lead-scoring] ❌ Error:', err);
    return res.status(500).json({ error: 'Lead scoring failed', details: err.message });
  }
}
