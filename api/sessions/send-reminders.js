import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

export const config = {
  api: { bodyParser: true }
};

export default async function handler(req, res) {
  // Vercel automatically injects Authorization: Bearer <CRON_SECRET> for cron requests
  const auth = req.headers['authorization'];
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!process.env.RESEND_API_KEY) {
    console.error('[send-reminders] RESEND_API_KEY not set');
    return res.status(500).json({ error: 'RESEND_API_KEY not configured' });
  }
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('[send-reminders] Supabase env vars not set');
    return res.status(500).json({ error: 'Supabase not configured' });
  }

  const resend = new Resend(process.env.RESEND_API_KEY);
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const now = new Date();
  // Query sessions starting in the next ~25 hours (covers both 1h and 24h windows)
  const windowMin = new Date(now.getTime() + 30 * 60 * 1000);           // +30 min (min)
  const windowMax = new Date(now.getTime() + 25 * 60 * 60 * 1000);      // +25 h  (max)

  const { data: sessions, error: fetchError } = await supabase
    .from('sessions')
    .select('id, data, starts_on, patient_user_id, psychologist_user_id, status')
    .in('status', ['scheduled', 'confirmed'])
    .gte('starts_on', windowMin.toISOString())
    .lte('starts_on', windowMax.toISOString());

  if (fetchError) {
    console.error('[send-reminders] Error fetching sessions:', fetchError.message);
    return res.status(500).json({ error: fetchError.message });
  }

  // ±3 min tolerance window around the target time
  const WINDOW_MS = 3 * 60 * 1000;
  const target1h  = now.getTime() + 60 * 60 * 1000;
  const target24h = now.getTime() + 24 * 60 * 60 * 1000;

  let sent = 0;
  const errors = [];

  // Cache psychologist profile lookups to avoid N+1 queries
  const profileCache = new Map();
  const getProfile = async (psychologistId) => {
    if (profileCache.has(psychologistId)) return profileCache.get(psychologistId);
    const { data } = await supabase
      .from('psychologist_profiles')
      .select('data')
      .eq('id', psychologistId)
      .single();
    profileCache.set(psychologistId, data);
    return data;
  };

  for (const session of sessions ?? []) {
    // Session must have reminder toggle enabled
    if (!session.data?.reminder_enabled) continue;

    const sessionTime = new Date(session.starts_on).getTime();
    const is1hWindow  = Math.abs(sessionTime - target1h)  <= WINDOW_MS;
    const is24hWindow = Math.abs(sessionTime - target24h) <= WINDOW_MS;

    if (!is1hWindow && !is24hWindow) continue;

    // Avoid duplicate sends (idempotency)
    if (is1hWindow  && session.data?.reminder_1h_sent_at)  continue;
    if (is24hWindow && session.data?.reminder_24h_sent_at) continue;

    // Check psychologist has email reminders enabled at account level
    const profile = await getProfile(session.psychologist_user_id);
    if (!profile?.data?.email_reminders_enabled) continue;

    const psychName  = profile?.data?.name  || null;
    const psychEmail = profile?.data?.email || null;
    const psychPhone = profile?.data?.phone || null;

    // Get patient email
    const { data: patient } = await supabase
      .from('users')
      .select('user_email, data')
      .eq('id', session.patient_user_id)
      .single();

    const patientEmail = patient?.user_email;
    if (!patientEmail) continue;

    const tz = session.data?.schedule_timezone || 'Europe/Madrid';
    const sessionDateStr = new Date(session.starts_on).toLocaleDateString('es-ES', {
      weekday: 'long', day: 'numeric', month: 'long', timeZone: tz
    });
    const sessionTimeStr = new Date(session.starts_on).toLocaleTimeString('es-ES', {
      hour: '2-digit', minute: '2-digit', timeZone: tz
    });

    const label = is1hWindow ? 'en 1 hora' : 'mañana';
    const patientFirstName =
      patient?.data?.firstName ||
      patient?.data?.name?.split?.(' ')?.[0] ||
      '';

    try {
      await resend.emails.send({
        from: 'mainds <no-reply@mainds.app>',
        to: patientEmail,
        ...(psychEmail ? { reply_to: psychEmail } : {}),
        subject: `Recordatorio: tienes una sesión ${label}`,
        html: buildReminderEmail({
          patientFirstName,
          sessionDateStr,
          sessionTimeStr,
          label,
          is1hWindow,
          meetLink: session.data?.meetLink || null,
          sessionType: session.data?.type || null,
          psychName,
          psychEmail,
          psychPhone
        })
      });

      // Mark as sent to prevent duplicates on next cron run
      const sentKey = is1hWindow ? 'reminder_1h_sent_at' : 'reminder_24h_sent_at';
      await supabase
        .from('sessions')
        .update({ data: { ...session.data, [sentKey]: new Date().toISOString() } })
        .eq('id', session.id);

      console.log(`[send-reminders] ✉️  Sent ${is1hWindow ? '1h' : '24h'} reminder to ${patientEmail} for session ${session.id}`);
      sent++;
    } catch (err) {
      console.error(`[send-reminders] Failed for session ${session.id}:`, err.message);
      errors.push({ sessionId: session.id, error: err.message });
    }
  }

  return res.status(200).json({ sent, errors });
}

function buildReminderEmail({ patientFirstName, sessionDateStr, sessionTimeStr, label, is1hWindow, meetLink, sessionType, psychName, psychEmail, psychPhone }) {
  const greeting = patientFirstName ? `Hola <strong>${patientFirstName}</strong>,` : 'Hola,';
  const isOnline = sessionType === 'online';
  const bodyText = is1hWindow
    ? isOnline
      ? 'La sesión comienza en 1 hora. Usa el enlace de abajo para conectarte cuando sea el momento.'
      : 'La sesión comienza pronto. Asegúrate de estar en un lugar tranquilo.'
    : isOnline
      ? 'Recuerda que mañana tienes sesión online. Prepara un espacio tranquilo y comprueba tu conexión con antelación.'
      : 'Recuerda que mañana tienes sesión. Si necesitas cancelar o cambiar la cita, contacta con tu psicólogo/a con antelación.';

  const meetLinkBlock = isOnline && meetLink
    ? `<div style="text-align:center;margin-bottom:24px">
        <a href="${meetLink}"
           style="display:inline-block;padding:14px 32px;background:#10b981;color:white;text-decoration:none;border-radius:8px;font-weight:700;font-size:16px">
          🎥 Unirse a la videollamada
        </a>
        <div style="margin-top:10px;font-size:11px;color:#94a3b8;word-break:break-all">${meetLink}</div>
      </div>`
    : '';

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,sans-serif;color:#333">
  <div style="max-width:600px;margin:32px auto;padding:0 16px">
    <div style="background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);color:white;padding:32px 24px;text-align:center;border-radius:12px 12px 0 0">
      <div style="font-size:32px;margin-bottom:8px">⏰</div>
      <h1 style="margin:0;font-size:22px;font-weight:700">Recordatorio de sesión</h1>
    </div>
    <div style="background:#ffffff;padding:32px 24px;border-radius:0 0 12px 12px;box-shadow:0 4px 16px rgba(0,0,0,0.06)">
      <p style="margin:0 0 16px">${greeting}</p>
      <p style="margin:0 0 24px">Te recordamos que tienes una sesión programada <strong>${label}</strong>.</p>

      <div style="background:#f8f7ff;border:1px solid #e0ddf7;border-radius:10px;padding:20px;text-align:center;margin-bottom:24px">
        <div style="font-size:17px;font-weight:600;color:#4a5568;text-transform:capitalize">${sessionDateStr}</div>
        <div style="font-size:28px;font-weight:700;color:#667eea;margin-top:6px">${sessionTimeStr}</div>
        ${isOnline ? '<div style="margin-top:8px;font-size:13px;color:#6366f1;font-weight:500">📹 Sesión online</div>' : ''}
      </div>

      <p style="margin:0 0 24px;color:#555">${bodyText}</p>

      ${meetLinkBlock}

      <div style="text-align:center">
        <a href="${process.env.FRONTEND_URL || 'https://mi.mainds.app'}"
           style="display:inline-block;padding:12px 32px;background:#667eea;color:white;text-decoration:none;border-radius:8px;font-weight:600;font-size:15px">
          Ir a mainds
        </a>
      </div>

      ${(psychName || psychEmail || psychPhone) ? `
      <div style="margin-top:28px;padding:16px 20px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px">
        <div style="font-size:12px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:10px">Tu psicólogo/a</div>
        ${psychName  ? `<div style="font-size:14px;font-weight:600;color:#1e293b;margin-bottom:4px">${psychName}</div>` : ''}
        ${psychEmail ? `<div style="font-size:13px;color:#475569;margin-bottom:2px">✉️ <a href="mailto:${psychEmail}" style="color:#667eea;text-decoration:none">${psychEmail}</a></div>` : ''}
        ${psychPhone ? `<div style="font-size:13px;color:#475569">📞 ${psychPhone}</div>` : ''}
      </div>` : ''}

      <p style="margin-top:24px;font-size:12px;color:#94a3b8;text-align:center;border-top:1px solid #f1f5f9;padding-top:16px">
        Este recordatorio fue enviado automáticamente por mainds.<br>
        Si no deseas recibir estos emails, comunícaselo a tu psicólogo/a.
      </p>
    </div>
  </div>
</body>
</html>`;
}
