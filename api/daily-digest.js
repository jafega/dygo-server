// daily-digest.js — el parte de guerra diario.
//
// Un email a las 7:00 con el embudo real de mainds: cuánta gente entró ayer,
// cuánta llegó a cada hito, cuánto MRR hay, quién se cae y en qué paso.
// Sustituye a tener que abrir el panel de superadmin para enterarse de algo.
//
// Todo sale de product_events (capa 0) + Stripe. No toca tablas clínicas.

import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';
import { traerTodo } from '../backend/utils/supabase-paginate.js';

export const config = { api: { bodyParser: true } };

// El embudo, en orden. El cuello de botella conocido está entre añadir el
// primer paciente y grabar la primera sesión: quien no graba, no paga.
const FUNNEL = [
  { event: 'signup', label: 'Registros' },
  { event: 'first_patient_added', label: 'Añaden 1er paciente' },
  { event: 'first_session_recorded', label: 'Graban 1ª sesión' },
  { event: 'first_invoice', label: 'Emiten 1ª factura' },
  { event: 'checkout_started', label: 'Abren checkout' },
  { event: 'paid', label: 'Pagan' }
];

const TRIAL_DAYS = 14;
const DAY_MS = 86400000;

const euros = cents => (cents / 100).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });
const esc = str => String(str ?? '').replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));

export default async function handler(req, res) {
  const auth = req.headers['authorization'];
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({ error: 'Supabase no configurado' });
  }

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const now = Date.now();
  const preview = String(req.query?.preview || '') === '1';

  try {
    /* ── 1. Embudo: ayer, últimos 7 días y los 7 anteriores ── */
    const since = new Date(now - 15 * DAY_MS).toISOString();
    // Paginado: el .limit(10000) era ilusorio, PostgREST devuelve 1000 como
    // maximo y no avisa de las que faltan.
    const recentEvents = await traerTodo(() => supabase
      .from('product_events')
      .select('user_id, event, created_at')
      .gte('created_at', since)
      .order('created_at', { ascending: true }));

    const startOfDay = d => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x.getTime(); };
    const todayStart = startOfDay(now);
    const yesterdayStart = todayStart - DAY_MS;
    const week1Start = now - 7 * DAY_MS;
    const week2Start = now - 14 * DAY_MS;

    const counts = { yesterday: {}, week1: {}, week2: {} };
    for (const e of recentEvents) {
      const t = new Date(e.created_at).getTime();
      if (t >= yesterdayStart && t < todayStart) counts.yesterday[e.event] = (counts.yesterday[e.event] || 0) + 1;
      if (t >= week1Start) counts.week1[e.event] = (counts.week1[e.event] || 0) + 1;
      else if (t >= week2Start) counts.week2[e.event] = (counts.week2[e.event] || 0) + 1;
    }

    /* ── 2. Embudo acumulado (histórico completo) ── */
    const lifetime = {};
    for (const step of FUNNEL) {
      const { count } = await supabase
        .from('product_events')
        .select('id', { count: 'exact', head: true })
        .eq('event', step.event);
      lifetime[step.event] = count || 0;
    }

    /* ── 3. MRR real desde Stripe ── */
    let mrrCents = 0;
    let activeSubs = 0;
    let stripeError = null;
    if (process.env.STRIPE_SECRET_KEY) {
      try {
        const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2022-11-15' });
        for await (const sub of stripe.subscriptions.list({ status: 'active', limit: 100 })) {
          activeSubs++;
          for (const item of sub.items?.data || []) {
            const amount = item.price?.unit_amount ?? 0;
            const qty = item.quantity ?? 1;
            const interval = item.price?.recurring?.interval;
            const factor = interval === 'year' ? 1 / 12 : interval === 'week' ? 4.345 : 1;
            mrrCents += Math.round(amount * qty * factor);
          }
        }
      } catch (err) {
        stripeError = err?.message || String(err);
      }
    }

    /* ── 4. En prueba ahora mismo, y dónde se han atascado ── */
    const trialCutoff = new Date(now - TRIAL_DAYS * DAY_MS).toISOString();
    const { data: trialSignups } = await supabase
      .from('product_events')
      .select('user_id, created_at')
      .eq('event', 'signup')
      .gte('created_at', trialCutoff)
      .order('created_at', { ascending: false })
      .limit(200);

    const trialIds = [...new Set((trialSignups || []).map(s => s.user_id).filter(Boolean))];
    const reached = {};
    if (trialIds.length) {
      const { data: milestones } = await supabase
        .from('product_events')
        .select('user_id, event')
        .in('user_id', trialIds)
        .in('event', ['first_patient_added', 'first_session_recorded', 'paid']);
      for (const m of milestones || []) {
        (reached[m.user_id] = reached[m.user_id] || new Set()).add(m.event);
      }
    }

    let emailById = {};
    if (trialIds.length) {
      const { data: users } = await supabase
        .from('users')
        .select('id, user_email')
        .in('id', trialIds);
      for (const u of users || []) emailById[u.id] = u.user_email || '';
    }

    // En riesgo: añadieron paciente pero no han grabado ninguna sesión y les
    // quedan menos de 7 días de prueba. Es el punto exacto donde se pierde
    // la gente que sí acabaría pagando.
    const atRisk = [];
    let activeTrials = 0;
    for (const s of trialSignups || []) {
      const got = reached[s.user_id] || new Set();
      if (got.has('paid')) continue;
      activeTrials++;
      const daysElapsed = Math.floor((now - new Date(s.created_at).getTime()) / DAY_MS);
      const daysLeft = TRIAL_DAYS - daysElapsed;
      if (got.has('first_patient_added') && !got.has('first_session_recorded')) {
        atRisk.push({
          email: emailById[s.user_id] || s.user_id,
          daysLeft,
          stuck: 'Tiene paciente, no ha grabado'
        });
      } else if (!got.has('first_patient_added') && daysElapsed >= 2) {
        atRisk.push({
          email: emailById[s.user_id] || s.user_id,
          daysLeft,
          stuck: 'No ha añadido ningún paciente'
        });
      }
    }
    atRisk.sort((a, b) => a.daysLeft - b.daysLeft);

    /* ── 5. Montar el informe ── */
    const funnelRows = FUNNEL.map((step, i) => {
      const prev = i > 0 ? lifetime[FUNNEL[i - 1].event] : null;
      const rate = prev ? Math.round((lifetime[step.event] / prev) * 100) : null;
      return {
        label: step.label,
        yesterday: counts.yesterday[step.event] || 0,
        week1: counts.week1[step.event] || 0,
        week2: counts.week2[step.event] || 0,
        lifetime: lifetime[step.event],
        rate
      };
    });

    const churnedWeek = counts.week1['churned'] || 0;
    const report = {
      date: new Date(yesterdayStart).toISOString().slice(0, 10),
      mrr_eur: mrrCents / 100,
      active_subscriptions: activeSubs,
      active_trials: activeTrials,
      churned_last_7d: churnedWeek,
      funnel: funnelRows,
      at_risk: atRisk.slice(0, 10),
      at_risk_total: atRisk.length,
      stripe_error: stripeError
    };

    if (preview) return res.status(200).json(report);

    /* ── 6. Enviar ── */
    //
    // Quien lo recibe sale de SUPERADMIN_EMAILS, MENOS quien este en
    // DIGEST_EXCLUDE_EMAILS.
    //
    // Son dos variables y no una a proposito: SUPERADMIN_EMAILS es lo que da
    // acceso al panel (ver isSuperAdmin en backend/server.js). Si a alguien
    // que no quiere el parte diario lo sacaramos de ahi, le quitariamos
    // tambien el acceso, que es un efecto que nadie pidio. Recibir el correo
    // y poder entrar son dos permisos distintos y aqui se tratan como tales.
    const lista = (v) => (v || '').split(',').map(x => x.trim().toLowerCase()).filter(Boolean);
    const excluidos = new Set(lista(process.env.DIGEST_EXCLUDE_EMAILS));
    const todos = lista(process.env.SUPERADMIN_EMAILS);
    const recipients = todos.filter(e => !excluidos.has(e));
    const fuera = todos.filter(e => excluidos.has(e));

    if (fuera.length) {
      console.log(`[daily-digest] ${fuera.length} excluido(s) por DIGEST_EXCLUDE_EMAILS: ${fuera.join(', ')}`);
    }
    // Una direccion en la lista de exclusion que no esta en la de superadmin
    // suele ser una errata: se avisa para que no pase inadvertida.
    const sobran = [...excluidos].filter(e => !todos.includes(e));
    if (sobran.length) {
      console.warn(`[daily-digest] en DIGEST_EXCLUDE_EMAILS hay direcciones que no reciben el parte: ${sobran.join(', ')}`);
    }

    if (!process.env.RESEND_API_KEY || recipients.length === 0) {
      console.warn('[daily-digest] Sin RESEND_API_KEY o sin destinatarios tras excluir — no se envía');
      return res.status(200).json({
        ...report, sent: false,
        reason: 'destinatarios_o_resend_no_configurados',
        excluidos: fuera
      });
    }

    const { Resend } = await import('resend');
    const resend = new Resend(process.env.RESEND_API_KEY);
    const delta = (a, b) => {
      if (!b) return a ? '<span style="color:#059669">nuevo</span>' : '—';
      const pct = Math.round(((a - b) / b) * 100);
      const color = pct > 0 ? '#059669' : pct < 0 ? '#dc2626' : '#6b7280';
      return `<span style="color:${color}">${pct > 0 ? '+' : ''}${pct}%</span>`;
    };

    /* ── Quien ha avanzado en las ultimas 24 h ── */
    //
    // Son DOS cosas distintas y en el parte van juntas porque para vender dan
    // igual: lo que interesa es "quien se movio ayer".
    //
    //   - Hitos de producto: anadir el primer paciente, grabar la primera
    //     sesion. No mueven la etapa del lead, asi que no dejan nota, pero son
    //     los pasos que de verdad predicen la compra.
    //   - Cambios de etapa: los que si dejan nota (a demo, a ganado, a baja,
    //     a perdido), vengan de una persona, de un agente o de la
    //     conciliacion diaria con Stripe.
    const ETIQUETA_HITO = {
      signup: 'Se registro',
      first_patient_added: 'Anadio su primer paciente',
      first_session_recorded: 'Grabo su primera sesion',
      first_invoice: 'Emitio su primera factura',
      paid: 'Empezo a pagar'
    };
    const desde24h = new Date(now - DAY_MS).toISOString();
    let movimientos = [];
    try {
      const [avances, cambios] = await Promise.all([
        supabase.from('product_events')
          .select('user_id, event, created_at')
          .in('event', Object.keys(ETIQUETA_HITO))
          .gte('created_at', desde24h),
        supabase.from('lead_activities')
          .select('lead_id, title, metadata, created_at')
          .eq('type', 'stage_change')
          .gte('created_at', desde24h)
      ]);

      const idsUsuario = [...new Set((avances.data || []).map(a => a.user_id).filter(Boolean))];
      const idsLead = [...new Set((cambios.data || []).map(c => c.lead_id).filter(Boolean))];

      const [porUsuario, porLead] = await Promise.all([
        idsUsuario.length
          ? supabase.from('leads').select('id, name, email, app_user_id').in('app_user_id', idsUsuario)
          : Promise.resolve({ data: [] }),
        idsLead.length
          ? supabase.from('leads').select('id, name, email').in('id', idsLead)
          : Promise.resolve({ data: [] })
      ]);

      const nombreDeUsuario = {};
      for (const l of porUsuario.data || []) nombreDeUsuario[l.app_user_id] = l.name || l.email;
      const nombreDeLead = {};
      for (const l of porLead.data || []) nombreDeLead[l.id] = l.name || l.email;

      for (const a of avances.data || []) {
        movimientos.push({
          quien: nombreDeUsuario[a.user_id] || emailById[a.user_id] || 'Alguien sin ficha',
          que: ETIQUETA_HITO[a.event] || a.event,
          cuando: a.created_at,
          bueno: true
        });
      }
      for (const c of cambios.data || []) {
        const a = (c.metadata && c.metadata.a) || null;
        movimientos.push({
          quien: nombreDeLead[c.lead_id] || 'Lead sin nombre',
          que: c.title || 'Cambio de etapa',
          cuando: c.created_at,
          bueno: !['cancelled', 'lost'].includes(a)
        });
      }
      movimientos.sort((x, y) => (x.cuando < y.cuando ? 1 : -1));
    } catch (e) {
      console.warn('[daily-digest] no se pudieron leer los movimientos:', e?.message || e);
    }

    const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#f6f7f9;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#111827">
  <div style="max-width:640px;margin:0 auto;background:#fff;border-radius:12px;padding:28px">
    <p style="margin:0 0 4px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#6b7280">mainds · ${esc(report.date)}</p>
    <h1 style="margin:0 0 24px;font-size:22px">Parte diario</h1>

    <table style="width:100%;border-collapse:collapse;margin-bottom:28px">
      <tr>
        <td style="padding:12px;background:#f9fafb;border-radius:8px;width:33%">
          <div style="font-size:11px;color:#6b7280;text-transform:uppercase">MRR</div>
          <div style="font-size:24px;font-weight:600">${euros(mrrCents)}</div>
          <div style="font-size:12px;color:#6b7280">${activeSubs} suscripción(es)</div>
        </td>
        <td style="width:8px"></td>
        <td style="padding:12px;background:#f9fafb;border-radius:8px;width:33%">
          <div style="font-size:11px;color:#6b7280;text-transform:uppercase">En prueba</div>
          <div style="font-size:24px;font-weight:600">${activeTrials}</div>
          <div style="font-size:12px;color:#6b7280">${atRisk.length} en riesgo</div>
        </td>
        <td style="width:8px"></td>
        <td style="padding:12px;background:#f9fafb;border-radius:8px;width:33%">
          <div style="font-size:11px;color:#6b7280;text-transform:uppercase">Bajas 7d</div>
          <div style="font-size:24px;font-weight:600">${churnedWeek}</div>
        </td>
      </tr>
    </table>

    <h2 style="font-size:15px;margin:0 0 10px">Embudo</h2>
    <table style="width:100%;border-collapse:collapse;font-size:13px">
      <tr style="text-align:left;color:#6b7280;font-size:11px;text-transform:uppercase">
        <th style="padding:6px 4px">Paso</th><th style="padding:6px 4px">Ayer</th>
        <th style="padding:6px 4px">7d</th><th style="padding:6px 4px">vs. previo</th>
        <th style="padding:6px 4px">Total</th><th style="padding:6px 4px">Conv.</th>
      </tr>
      ${funnelRows.map(r => `<tr style="border-top:1px solid #f3f4f6">
        <td style="padding:8px 4px">${esc(r.label)}</td>
        <td style="padding:8px 4px;font-weight:600">${r.yesterday}</td>
        <td style="padding:8px 4px">${r.week1}</td>
        <td style="padding:8px 4px">${delta(r.week1, r.week2)}</td>
        <td style="padding:8px 4px;color:#6b7280">${r.lifetime}</td>
        <td style="padding:8px 4px;color:${r.rate !== null && r.rate < 40 ? '#dc2626' : '#6b7280'}">${r.rate === null ? '—' : r.rate + '%'}</td>
      </tr>`).join('')}
    </table>

    <h2 style="font-size:15px;margin:28px 0 10px">Se movieron ayer (${movimientos.length})</h2>
    ${movimientos.length ? `<table style="width:100%;border-collapse:collapse;font-size:13px">
      ${movimientos.map(m => `<tr style="border-top:1px solid #f3f4f6">
        <td style="padding:8px 4px">${esc(m.quien)}</td>
        <td style="padding:8px 4px;color:${m.bueno ? '#166534' : '#dc2626'}">${esc(m.que)}</td>
        <td style="padding:8px 4px;text-align:right;color:#6b7280">${new Date(m.cuando).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' })}</td>
      </tr>`).join('')}
    </table>` : `<p style="margin:0;font-size:13px;color:#6b7280">Nadie avanzo un paso ayer.</p>`}

    ${atRisk.length ? `<h2 style="font-size:15px;margin:28px 0 10px">En riesgo (${atRisk.length})</h2>
    <table style="width:100%;border-collapse:collapse;font-size:13px">
      ${report.at_risk.map(r => `<tr style="border-top:1px solid #f3f4f6">
        <td style="padding:8px 4px">${esc(r.email)}</td>
        <td style="padding:8px 4px;color:#6b7280">${esc(r.stuck)}</td>
        <td style="padding:8px 4px;text-align:right;color:${r.daysLeft <= 3 ? '#dc2626' : '#6b7280'}">${r.daysLeft}d</td>
      </tr>`).join('')}
    </table>` : ''}

    ${stripeError ? `<p style="margin-top:24px;padding:10px;background:#fef2f2;border-radius:6px;font-size:12px;color:#991b1b">Stripe no respondió: ${esc(stripeError)}</p>` : ''}
  </div>
</body></html>`;

    await resend.emails.send({
      from: 'mainds <no-reply@mainds.app>',
      to: recipients,
      subject: `mainds · ${report.date} · ${euros(mrrCents)} MRR · ${counts.yesterday['signup'] || 0} registros · ${counts.yesterday['paid'] || 0} pagos`,
      html
    });

    console.log(`[daily-digest] enviado a ${recipients.length} destinatario(s)`);
    return res.status(200).json({ ...report, sent: true, recipients: recipients.length, excluidos: fuera });
  } catch (err) {
    console.error('[daily-digest] error:', err?.message || err);
    return res.status(500).json({ error: err?.message || 'digest falló' });
  }
}
