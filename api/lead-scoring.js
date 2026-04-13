import { createClient } from '@supabase/supabase-js';

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
    const { data: leads, error: leadsErr } = await supabase
      .from('leads')
      .select('id, email, name, stage, app_user_id, app_registered_at, app_plan, app_is_subscribed, assigned_to, tags, notes_count, last_contacted_at, created_at, phone, company, details, source')
      .not('stage', 'in', '(won,lost,cancelled)');

    if (leadsErr) throw leadsErr;
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

        // Count sessions per psychologist
        const { data: sessions } = await supabase
          .from('sessions')
          .select('psychologist_id')
          .in('psychologist_id', batch);
        if (sessions) {
          for (const s of sessions) {
            sessionsByUser[s.psychologist_id] = (sessionsByUser[s.psychologist_id] || 0) + 1;
          }
        }

        // Count care relationships (patients added)
        const { data: rels } = await supabase
          .from('care_relationships')
          .select('psychologist_id')
          .in('psychologist_id', batch)
          .eq('status', 'active');
        if (rels) {
          for (const r of rels) {
            entriesByUser[r.psychologist_id] = (entriesByUser[r.psychologist_id] || 0) + 1;
          }
        }
      }
    }

    /* ── 4. Fetch inbound emails from admin_emails ── */
    const leadEmails = leads.map(l => l.email.toLowerCase());
    let emailsByLead = {};
    // Check admin_emails for inbound responses from these leads
    for (let i = 0; i < leadEmails.length; i += BATCH) {
      const batch = leadEmails.slice(i, i + BATCH);
      const { data: emails } = await supabase
        .from('admin_emails')
        .select('from_email, direction, created_at')
        .in('from_email', batch)
        .eq('direction', 'inbound')
        .gte('created_at', ninetyDaysAgo);
      if (emails) {
        for (const e of emails) {
          const key = e.from_email.toLowerCase();
          if (!emailsByLead[key]) emailsByLead[key] = [];
          emailsByLead[key].push(e);
        }
      }
    }

    // Also count outbound emails sent TO leads
    let outboundByLead = {};
    for (let i = 0; i < leadEmails.length; i += BATCH) {
      const batch = leadEmails.slice(i, i + BATCH);
      const { data: emails } = await supabase
        .from('admin_emails')
        .select('to_email, direction, created_at')
        .eq('direction', 'outbound')
        .gte('created_at', ninetyDaysAgo);
      if (emails) {
        for (const e of emails) {
          const to = (e.to_email || '').toLowerCase();
          for (const addr of batch) {
            if (to.includes(addr)) {
              if (!outboundByLead[addr]) outboundByLead[addr] = [];
              outboundByLead[addr].push(e);
            }
          }
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

      updates.push({ id: lead.id, lead_score: finalScore, lead_score_updated_at: new Date().toISOString() });
    }

    /* ── 6. Batch update scores ── */
    let updated = 0;
    for (const u of updates) {
      const { error: updateErr } = await supabase
        .from('leads')
        .update({ lead_score: u.lead_score, lead_score_updated_at: u.lead_score_updated_at })
        .eq('id', u.id);
      if (!updateErr) updated++;
    }

    const summary = updates.map(u => {
      const lead = leads.find(l => l.id === u.id);
      return `${tier(u.lead_score)} ${(lead?.name || lead?.email || u.id).substring(0, 30)}: ${u.lead_score}/10`;
    }).join('\n');

    console.log(`[lead-scoring] ✅ Scored ${updated}/${leads.length} leads:\n${summary}`);

    return res.status(200).json({
      message: `Scored ${updated} leads`,
      scored: updated,
      total: leads.length,
      scores: updates.map(u => ({ id: u.id, score: u.lead_score })),
    });
  } catch (err) {
    console.error('[lead-scoring] ❌ Error:', err);
    return res.status(500).json({ error: 'Lead scoring failed', details: err.message });
  }
}
