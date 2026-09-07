// automation.js — el motor de campañas de activación.
//
// Sustituye a api/trial-reminders.js, que mandaba tres emails por calendario
// (días 4, 7 y 11) a todo el que no estuviera suscrito, sin mirar lo que había
// hecho: el que ya llevaba cinco sesiones grabadas recibía igualmente un "te
// quedan 3 días" como si no hubiera empezado.
//
// Aquí las campañas se disparan por comportamiento, leyendo product_events.
// El embudo medido dice dónde está el agujero:
//   76 registros → 44 añaden paciente → 14 graban sesión → 6 pagan
// El 32 % de ese tercer paso es lo que hay que mover: de los que graban, el
// 43 % acaba pagando. Por eso las campañas B y C existen.
//
// Garantías del motor, por orden de importancia:
//   1. Un email por usuario y ejecución como máximo (las campañas se evalúan
//      por prioridad y se corta en la primera que encaje).
//   2. Una campaña por usuario para siempre (índice único en automation_sends).
//   3. Silencio de 48 h entre dos emails automáticos al mismo usuario.
//   4. Nunca a quien se ha dado de baja, ni a emails temporales, ni a quien
//      ya paga.
// Todo lo enviado queda en el buzón de superadmin (admin_emails) y en la ficha
// del lead (lead_activities).

import { createClient } from '@supabase/supabase-js';
import { renderEmail } from './email-shell.js';
import { urlBaja, cabecerasBaja, suprimidos, normalizarEmail } from './email-optout.js';
import { traerTodo } from './supabase-paginate.js';

const DAY_MS = 86400000;
const HOUR_MS = 3600000;
const TRIAL_DAYS = 14;
const SILENCIO_ENTRE_EMAILS_MS = 2 * DAY_MS;

const APP_URL = process.env.FRONTEND_URL || 'https://mi.mainds.app';
const FROM = 'mainds <info@mainds.app>';
const REPLY_TO = 'info@mainds.app';

const esEmailTemporal = (email) =>
  !email
  || email.includes('@noemail.mainds.local')
  || email.includes('@noemail.dygo.local');

// La baja vive en email-optout.js: es por direccion de correo, no por usuario,
// para que valga igual en campanas, CRM y envios masivos.

// ─────────────────────────── Campañas ───────────────────────────
// El orden es la prioridad: gana la primera cuyo `cuando` devuelva true.
// `cuando` recibe el perfil del psicólogo y no debe tener efectos.
export const CAMPAIGNS = [
  {
    id: 'valor-primera-grabacion',
    // Justo después de la primera grabación: es el momento de máximo valor
    // percibido y el único punto del embudo donde la conversión ya es alta.
    cuando: p => p.hito('first_session_recorded')
      && p.desdeHito('first_session_recorded') < 6 * HOUR_MS,
    email: p => ({
      tono: 'exito',
      asunto: `${p.nombre ? p.nombre + ', ' : ''}acabas de grabar tu primera sesión en mainds`,
      titulo: 'Tu primera sesión ya está en mainds',
      cuerpo: `
        <p style="margin:0 0 20px;font-size:15px;color:#475569;line-height:1.7">
          ${p.saludo} acabas de grabar tu primera sesión. La transcripción y el resumen
          quedan asociados al paciente, listos para revisar cuando quieras.
        </p>
        <div style="background:#ecfdf5;border:1px solid #a7f3d0;border-radius:10px;padding:20px;margin-bottom:24px">
          <p style="margin:0 0 8px;font-size:14px;font-weight:600;color:#065f46">Lo que acabas de ahorrarte</p>
          <p style="margin:0;font-size:13px;color:#047857;line-height:1.6">
            Redactar la nota clínica a mano son entre 15 y 25 minutos por sesión.
            Con diez sesiones a la semana, son varias horas al mes que recuperas.
          </p>
        </div>
        <p style="margin:0 0 8px;font-size:15px;color:#475569;line-height:1.7">
          Te quedan <strong>${p.diasDePrueba}</strong> días de prueba. Si ya te encaja,
          puedes dejar la suscripción activada y seguir sin interrupciones.
        </p>`,
      ctaTexto: 'Ver mi sesión',
      ctaUrl: APP_URL
    })
  },
  {
    id: 'activacion-primera-grabacion',
    // LA campaña. 44 personas añadieron un paciente y solo 14 llegaron a grabar.
    cuando: p => p.hito('first_patient_added')
      && !p.hito('first_session_recorded')
      && p.desdeHito('first_patient_added') > 24 * HOUR_MS,
    email: p => ({
      asunto: `${p.nombre ? p.nombre + ', ' : ''}graba tu próxima sesión y deja que mainds escriba la nota`,
      titulo: 'Ya tienes paciente. Falta lo que ahorra tiempo',
      cuerpo: `
        <p style="margin:0 0 20px;font-size:15px;color:#475569;line-height:1.7">
          ${p.saludo} ya tienes ${p.pacientes > 1 ? `${p.pacientes} pacientes` : 'tu primer paciente'} en mainds.
          El paso que de verdad cambia tu día a día es el siguiente: grabar una sesión
          y dejar que la nota clínica se escriba sola.
        </p>
        <div style="background:#f8f7ff;border:1px solid #e0ddf7;border-radius:10px;padding:20px;margin-bottom:24px">
          <p style="margin:0 0 12px;font-size:13px;color:#64748b;font-weight:700;text-transform:uppercase;letter-spacing:0.06em">Son tres clics</p>
          <ol style="margin:0;padding-left:18px;color:#475569;font-size:14px;line-height:2">
            <li>Abre la ficha del paciente</li>
            <li>Pulsa <strong>Grabar sesión</strong> al empezar</li>
            <li>Al terminar, tienes transcripción y resumen</li>
          </ol>
        </div>
        <p style="margin:0;font-size:14px;color:#64748b;line-height:1.7">
          Puedes probarlo ahora mismo con treinta segundos de audio para ver cómo queda,
          sin necesidad de esperar a tu próxima consulta.
        </p>`,
      ctaTexto: 'Grabar una sesión',
      ctaUrl: APP_URL
    })
  },
  {
    id: 'ayuda-primera-grabacion',
    // Segundo toque, con otro registro: en vez de insistir, ofrecer ayuda.
    cuando: p => p.hito('first_patient_added')
      && !p.hito('first_session_recorded')
      && p.desdeHito('first_patient_added') > 4 * DAY_MS
      && p.yaRecibio('activacion-primera-grabacion'),
    email: p => ({
      asunto: '¿Te echo una mano con la primera grabación?',
      titulo: '¿Hay algo que no acaba de encajar?',
      cuerpo: `
        <p style="margin:0 0 20px;font-size:15px;color:#475569;line-height:1.7">
          ${p.saludo} veo que tienes pacientes en mainds pero aún no has grabado ninguna sesión.
          Suele pasar por una de tres cosas: dudas sobre el consentimiento del paciente,
          no saber si el audio se guarda bien, o sencillamente no haber tenido el momento.
        </p>
        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:20px;margin-bottom:24px">
          <p style="margin:0 0 10px;font-size:14px;font-weight:600;color:#334155">Sobre el consentimiento</p>
          <p style="margin:0 0 16px;font-size:13px;color:#64748b;line-height:1.6">
            mainds incluye un modelo de consentimiento informado que el paciente firma
            desde su propio acceso. Los audios y documentos se guardan cifrados en
            servidores de la UE, con acceso solo mediante enlaces firmados.
          </p>
          <p style="margin:0;font-size:13px;color:#64748b;line-height:1.6">
            Si es otra cosa, respóndeme a este email y lo miramos. Contesta una persona.
          </p>
        </div>
        <p style="margin:0;font-size:14px;color:#64748b;line-height:1.7">
          Te quedan <strong>${p.diasDePrueba}</strong> días de prueba.
        </p>`,
      ctaTexto: 'Entrar en mainds',
      ctaUrl: APP_URL
    })
  },
  {
    id: 'activacion-primer-paciente',
    // El limite es "hasta que entra fin-de-prueba", no un numero de dias
    // arbitrario: con un tope de 7 quedaba un hueco entre el dia 8 y el 10 en
    // el que quien no habia anadido paciente no recibia nada.
    cuando: p => !p.hito('first_patient_added')
      && p.desdeAlta > 2 * HOUR_MS
      && p.diasDePrueba > 3,
    email: p => ({
      asunto: `${p.nombre ? p.nombre + ', ' : ''}añade tu primer paciente y empieza a usar mainds`,
      titulo: 'Empieza por añadir un paciente',
      cuerpo: `
        <p style="margin:0 0 20px;font-size:15px;color:#475569;line-height:1.7">
          ${p.saludo} para que mainds te sirva de algo necesita al menos un paciente.
          Se tarda menos de un minuto y no hace falta que el paciente haga nada:
          puedes darlo de alta tú y decidir después si le invitas a su propio acceso.
        </p>
        <div style="background:#f8f7ff;border:1px solid #e0ddf7;border-radius:10px;padding:20px;margin-bottom:24px">
          <p style="margin:0 0 12px;font-size:13px;color:#64748b;font-weight:700;text-transform:uppercase;letter-spacing:0.06em">Con un paciente dado de alta puedes</p>
          <ul style="margin:0;padding-left:18px;color:#475569;font-size:14px;line-height:2">
            <li>Grabar sesiones y obtener la nota clínica escrita</li>
            <li>Llevar el historial y los documentos en un sitio</li>
            <li>Emitir facturas desde cada sesión</li>
          </ul>
        </div>`,
      ctaTexto: 'Añadir un paciente',
      ctaUrl: APP_URL
    })
  },
  {
    id: 'fin-de-prueba',
    // Lo único que conservo del cron antiguo: el aviso de cierre. Pero con el
    // texto ajustado a si la persona llegó a usar el producto o no.
    cuando: p => p.diasDePrueba <= 3 && p.diasDePrueba > 0,
    email: p => {
      const activado = p.hito('first_session_recorded');
      return {
        tono: 'urgente',
        asunto: `Te quedan ${p.diasDePrueba} días de prueba en mainds`,
        titulo: `Te quedan ${p.diasDePrueba} días de prueba`,
        cuerpo: activado
          ? `
        <p style="margin:0 0 20px;font-size:15px;color:#475569;line-height:1.7">
          ${p.saludo} tu prueba termina en <strong>${p.diasDePrueba}</strong> días.
          Has grabado sesiones y tienes ${p.pacientes} paciente${p.pacientes === 1 ? '' : 's'} en mainds,
          así que lo que está en juego es tu trabajo ya hecho.
        </p>
        <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:10px;padding:20px;margin-bottom:24px">
          <p style="margin:0 0 10px;font-size:14px;font-weight:600;color:#9a3412">¿Qué pasa si no activo el plan?</p>
          <p style="margin:0;font-size:13px;color:#7c2d12;line-height:1.6">
            No se borra nada. Pierdes el acceso al panel y lo recuperas entero
            en cuanto actives la suscripción.
          </p>
        </div>`
          : `
        <p style="margin:0 0 20px;font-size:15px;color:#475569;line-height:1.7">
          ${p.saludo} tu prueba termina en <strong>${p.diasDePrueba}</strong> días y aún no has
          llegado a grabar una sesión, que es justo lo que mainds hace mejor.
        </p>
        <p style="margin:0 0 20px;font-size:15px;color:#475569;line-height:1.7">
          Si te queda alguna consulta esta semana, pruébalo con ella: al terminar
          tendrás la transcripción y el resumen escritos. Y si prefieres que te
          enseñe cómo va antes de decidir, respóndeme a este email.
        </p>`,
        ctaTexto: activado ? 'Activar mi suscripción' : 'Probar antes de que termine',
        ctaUrl: APP_URL
      };
    }
  },
  {
    id: 'recuperacion-post-prueba',
    cuando: p => p.diasDePrueba <= 0
      && p.diasDesdeAlta >= TRIAL_DAYS + 7
      && p.diasDesdeAlta <= TRIAL_DAYS + 21
      && p.hito('first_session_recorded'),
    email: p => ({
      asunto: 'Tus sesiones siguen guardadas en mainds',
      titulo: 'Tu cuenta te espera',
      cuerpo: `
        <p style="margin:0 0 20px;font-size:15px;color:#475569;line-height:1.7">
          ${p.saludo} tu prueba terminó hace unos días, pero no hemos borrado nada:
          tus pacientes, sesiones y notas siguen donde los dejaste.
        </p>
        <p style="margin:0 0 20px;font-size:15px;color:#475569;line-height:1.7">
          Si lo dejaste por precio, por una función que faltaba o porque no era el
          momento, dímelo respondiendo a este email. Nos sirve más de lo que parece.
        </p>`,
      ctaTexto: 'Recuperar mi cuenta',
      ctaUrl: APP_URL
    })
  }
];

// ─────────────────────────── Motor ───────────────────────────

const construirPerfil = ({ userId, email, nombreCompleto, altaMs, eventos, envios, pacientes, ahora }) => {
  const hitos = new Map();
  for (const e of eventos) {
    const t = new Date(e.created_at).getTime();
    if (!hitos.has(e.event) || t < hitos.get(e.event)) hitos.set(e.event, t);
  }
  const nombre = (nombreCompleto || '').trim().split(/\s+/)[0] || '';
  const diasDesdeAlta = Math.floor((ahora - altaMs) / DAY_MS);

  return {
    userId,
    email,
    nombre,
    saludo: nombre ? `Hola <strong>${nombre}</strong>,` : 'Hola,',
    pacientes,
    altaMs,
    desdeAlta: ahora - altaMs,
    diasDesdeAlta,
    diasDePrueba: Math.max(0, TRIAL_DAYS - diasDesdeAlta),
    hito: ev => hitos.has(ev),
    desdeHito: ev => (hitos.has(ev) ? ahora - hitos.get(ev) : Infinity),
    yaRecibio: campaign => envios.has(campaign)
  };
};

/**
 * Evalúa a todos los psicólogos en prueba y envía como mucho un email a cada uno.
 *
 * @param {object} opts
 * @param {boolean} [opts.dryRun] Si true, no envía ni escribe nada: solo informa.
 * @param {string}  [opts.soloUsuario] Limita la ejecución a un user_id (pruebas).
 */
export async function runAutomations({ dryRun = false, soloUsuario = null } = {}) {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return { ok: false, reason: 'supabase_no_configurado' };
  if (!dryRun && !process.env.RESEND_API_KEY) return { ok: false, reason: 'resend_no_configurado' };

  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const ahora = Date.now();

  // Ventana de trabajo: desde el alta hasta tres semanas después del fin de la
  // prueba. Fuera de ahí no hay ninguna campaña que pueda disparar.
  const ventana = new Date(ahora - (TRIAL_DAYS + 22) * DAY_MS).toISOString();

  const [signups, subsRes] = await Promise.all([
    // Paginado: product_events crece con cada evento de cada usuario y el
    // tope de 1000 filas de PostgREST llegaria sin avisar.
    traerTodo(() => supabase.from('product_events')
      .select('user_id, created_at')
      .eq('event', 'signup')
      .gte('created_at', ventana)
      .order('created_at', { ascending: true })),
    supabase.from('subscriptions').select('id, data')
  ]);

  // Un alta por usuario, la más antigua.
  const altaPorUsuario = new Map();
  for (const s of signups) {
    if (!s.user_id) continue;
    const t = new Date(s.created_at).getTime();
    if (!altaPorUsuario.has(s.user_id) || t < altaPorUsuario.get(s.user_id)) {
      altaPorUsuario.set(s.user_id, t);
    }
  }

  const pagan = new Set(
    (subsRes.data || [])
      .filter(r => ['active', 'trialing'].includes((r.data || {}).stripe_status))
      .map(r => r.id)
  );

  let candidatos = [...altaPorUsuario.keys()].filter(id => !pagan.has(id));
  if (soloUsuario) candidatos = candidatos.filter(id => id === soloUsuario);

  if (candidatos.length === 0) {
    return { ok: true, dry_run: dryRun, candidatos: 0, enviados: 0, decisiones: [] };
  }

  const [usuariosRes, eventosRes, enviosRes, relacionesRes] = await Promise.all([
    supabase.from('users').select('id, user_email, data, master').in('id', candidatos),
    supabase.from('product_events').select('user_id, event, created_at').in('user_id', candidatos),
    supabase.from('automation_sends').select('user_id, campaign, sent_at').in('user_id', candidatos),
    supabase.from('care_relationships').select('psychologist_user_id').in('psychologist_user_id', candidatos)
  ]);

  const usuarioPorId = new Map();
  for (const u of usuariosRes.data || []) usuarioPorId.set(u.id, u);

  // Bajas: una sola consulta con todas las direcciones implicadas.
  const dadosDeBaja = await suprimidos(
    supabase,
    (usuariosRes.data || []).map(u => u.user_email || (u.data || {}).email)
  );

  const eventosPorUsuario = new Map();
  for (const e of eventosRes.data || []) {
    if (!eventosPorUsuario.has(e.user_id)) eventosPorUsuario.set(e.user_id, []);
    eventosPorUsuario.get(e.user_id).push(e);
  }

  const enviosPorUsuario = new Map();
  const ultimoEnvioPorUsuario = new Map();
  for (const s of enviosRes.data || []) {
    if (!enviosPorUsuario.has(s.user_id)) enviosPorUsuario.set(s.user_id, new Set());
    enviosPorUsuario.get(s.user_id).add(s.campaign);
    const t = new Date(s.sent_at).getTime();
    if (!ultimoEnvioPorUsuario.has(s.user_id) || t > ultimoEnvioPorUsuario.get(s.user_id)) {
      ultimoEnvioPorUsuario.set(s.user_id, t);
    }
  }

  const pacientesPorUsuario = new Map();
  for (const r of relacionesRes.data || []) {
    pacientesPorUsuario.set(r.psychologist_user_id, (pacientesPorUsuario.get(r.psychologist_user_id) || 0) + 1);
  }

  const decisiones = [];
  let enviados = 0;
  const errores = [];

  for (const userId of candidatos) {
    const usuario = usuarioPorId.get(userId);
    const email = usuario?.user_email || (usuario?.data || {}).email || '';

    if (!usuario) { decisiones.push({ userId, omitido: 'usuario_no_encontrado' }); continue; }
    if (usuario.master === true) { decisiones.push({ userId, omitido: 'master' }); continue; }
    if (esEmailTemporal(email)) { decisiones.push({ userId, omitido: 'email_temporal' }); continue; }
    if (dadosDeBaja.has(normalizarEmail(email))) { decisiones.push({ userId, email, omitido: 'dado_de_baja' }); continue; }

    const ultimo = ultimoEnvioPorUsuario.get(userId);
    if (ultimo && ahora - ultimo < SILENCIO_ENTRE_EMAILS_MS) {
      decisiones.push({ userId, email, omitido: 'silencio_48h' });
      continue;
    }

    const perfil = construirPerfil({
      userId,
      email,
      nombreCompleto: (usuario.data || {}).name || '',
      altaMs: altaPorUsuario.get(userId),
      eventos: eventosPorUsuario.get(userId) || [],
      envios: enviosPorUsuario.get(userId) || new Set(),
      pacientes: pacientesPorUsuario.get(userId) || 0,
      ahora
    });

    // Prioridad: gana la primera campaña que encaje y no se haya enviado ya.
    const campaign = CAMPAIGNS.find(c => !perfil.yaRecibio(c.id) && c.cuando(perfil));
    if (!campaign) { decisiones.push({ userId, email, omitido: 'ninguna_campana_encaja' }); continue; }

    const contenido = campaign.email(perfil);
    const decision = {
      userId,
      email,
      campaign: campaign.id,
      asunto: contenido.asunto,
      diasDePrueba: perfil.diasDePrueba,
      pacientes: perfil.pacientes
    };

    if (dryRun) { decisiones.push({ ...decision, enviado: false }); continue; }

    try {
      const html = renderEmail({
        titulo: contenido.titulo,
        cuerpo: contenido.cuerpo,
        ctaTexto: contenido.ctaTexto,
        ctaUrl: contenido.ctaUrl,
        tono: contenido.tono,
        bajaUrl: urlBaja(email)
      });

      const { Resend } = await import('resend');
      const resend = new Resend(process.env.RESEND_API_KEY);
      const envio = await resend.emails.send({
        from: FROM,
        to: email,
        reply_to: REPLY_TO,
        subject: contenido.asunto,
        html,
        // Sin estas cabeceras no hay boton nativo de baja en Gmail/Outlook.
        headers: cabecerasBaja(email)
      });
      const resendId = envio?.data?.id || envio?.id || null;

      // El índice único de (user_id, campaign) es la red de seguridad real:
      // si dos ejecuciones se solaparan, la segunda inserción falla y no se
      // contabiliza como enviada.
      const { error: envioErr } = await supabase.from('automation_sends').insert({
        user_id: userId,
        campaign: campaign.id,
        email,
        resend_id: resendId,
        props: { asunto: contenido.asunto, dias_prueba: perfil.diasDePrueba, pacientes: perfil.pacientes }
      });
      if (envioErr) throw new Error(`registro de envío: ${envioErr.message}`);

      await registrarEnBuzon({ supabase, email, usuario, contenido, html, resendId, campaign: campaign.id });

      enviados++;
      decisiones.push({ ...decision, enviado: true, resend_id: resendId });
    } catch (err) {
      errores.push({ userId, email, campaign: campaign.id, error: err?.message || String(err) });
      decisiones.push({ ...decision, enviado: false, error: err?.message || String(err) });
    }
  }

  return {
    ok: true,
    dry_run: dryRun,
    candidatos: candidatos.length,
    enviados,
    errores,
    decisiones
  };
}

/**
 * Deja el email enviado en el buzón de superadmin y en la ficha del lead, para
 * que las acciones automáticas se vean junto a las manuales y no en un log
 * aparte que nadie mira.
 */
async function registrarEnBuzon({ supabase, email, usuario, contenido, html, resendId, campaign }) {
  const nombre = (usuario.data || {}).name || null;

  let lead = null;
  try {
    const { data } = await supabase
      .from('leads')
      .select('id, name, stage, assigned_to')
      .eq('email', email.toLowerCase())
      .limit(1);
    lead = data?.[0] || null;
  } catch (_) { /* el buzón no debe romper el envío */ }

  const tareas = [];

  tareas.push(
    supabase.from('admin_emails').insert({
      mailbox: 'sales',
      direction: 'outbound',
      from_email: 'info@mainds.app',
      from_name: 'mainds',
      to_email: email,
      to_name: lead?.name || nombre,
      subject: contenido.asunto,
      body_html: html,
      is_read: true,
      resend_id: resendId,
      resend_status: 'sent',
      lead_id: lead?.id || null,
      lead_name: lead?.name || nombre,
      assigned_to: lead?.assigned_to || null,
      // `source: automation` distingue estos de los que se mandan a mano
      // desde el CRM, que llevan `source: crm`.
      metadata: { source: 'automation', campaign, user_id: usuario.id }
    })
  );

  if (lead) {
    tareas.push(
      supabase.from('lead_activities').insert({
        lead_id: lead.id,
        type: 'email_sent',
        title: contenido.asunto,
        body: html,
        metadata: { source: 'automation', campaign, resend_id: resendId, to: email },
        created_by: 'automation'
      })
    );
    tareas.push(
      supabase.from('leads')
        .update({ last_contacted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('id', lead.id)
    );
  }

  const resultados = await Promise.allSettled(tareas);
  for (const r of resultados) {
    if (r.status === 'rejected') console.warn('[automation] registro en buzón falló:', r.reason?.message || r.reason);
    else if (r.value?.error) console.warn('[automation] registro en buzón falló:', r.value.error.message);
  }
}
