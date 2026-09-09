// clientes.js — a un cliente que paga no se le vende.
//
// El riesgo concreto: alguien paga 29,99 al mes y le llega un "te quedan 3
// dias de prueba" o un "cuanto tiempo se te va en notas". El mensaje dice a
// gritos que no sabemos quien es, y eso invita a cancelar. En un SaaS el correo
// comercial a un cliente no es una molestia, es riesgo de fuga.
//
// POR QUE VIVE APARTE
// La cola de leads (/api/agent/leads/next) ya excluye a los suscritos, pero se
// apoya en `leads.app_is_subscribed`, un campo reflejo que el 7 sep 2026
// mentia en 5 de 6 clientes. Y una cola no protege el momento del envio: un
// borrador escrito el lunes puede aprobarse el viernes, cuando esa persona ya
// ha pagado. La comprobacion tiene que estar donde se envia.
//
// La fuente es Stripe a traves de `subscriptions`, no `leads`: esa fila la
// escribe el webhook Y la repasa reconcile-subscriptions cada dia contra
// Stripe, asi que es el dato menos propenso a quedarse viejo que hay.
//
// LA CONSULTA VA AL REVES, Y ES A PROPOSITO
// No se busca "el usuario de este email, ¿paga?" sino "quien paga, ¿es este?".
// Dos razones:
//   1. Exactitud. Cruzar por email con `ilike` es una trampa: en ILIKE el
//      guion bajo es un comodin, y hay direcciones con guion bajo. Un falso
//      positivo bloquearia correo a quien no toca.
//   2. Tamano. Los que pagan son poquisimos comparados con los usuarios (2 de
//      76 hoy), asi que se lee el conjunto pequeno y se compara en memoria.
// Si algun dia hay miles de suscripciones activas, esto habra que darle la
// vuelta otra vez y cruzar por id de usuario.
//
// LO QUE ESTO NO BLOQUEA, tambien a proposito:
//   - Correo transaccional: facturas, recordatorios, invitaciones. No pasa por
//     aqui y debe seguir saliendo; un cliente que paga es quien mas lo
//     necesita.
//   - Responder a un cliente que ESCRIBE. Eso es soporte, no venta.

const ESTADOS_QUE_PAGAN = ['active', 'trialing'];

/** Direcciones (en minusculas) de todo el que tiene suscripcion viva. */
async function direccionesQuePagan(supabase) {
  const { data: subs, error } = await supabase
    .from('subscriptions')
    .select('id, data');
  if (error) throw error;

  const idsQuePagan = [];
  const planPorId = new Map();
  for (const s of subs || []) {
    const d = s.data || {};
    if (!ESTADOS_QUE_PAGAN.includes(d.stripe_status)) continue;
    const uid = d.psychologist_user_id || s.id;
    if (!uid) continue;
    idsQuePagan.push(String(uid));
    planPorId.set(String(uid), { plan: d.plan_id || null, estado: d.stripe_status });
  }
  if (!idsQuePagan.length) return new Map();

  const { data: usuarios, error: errU } = await supabase
    .from('users')
    .select('id, user_email, data')
    .in('id', idsQuePagan);
  if (errU) throw errU;

  const porDireccion = new Map();
  for (const u of usuarios || []) {
    const info = planPorId.get(String(u.id)) || {};
    // Se recogen las dos direcciones posibles: la columna y la del payload.
    // Una cuenta antigua puede tener una y no la otra.
    for (const dir of [u.user_email, u.data && u.data.email]) {
      if (!dir) continue;
      porDireccion.set(String(dir).trim().toLowerCase(), info);
    }
  }
  return porDireccion;
}

/**
 * ¿Esta direccion pertenece a alguien con suscripcion viva en Stripe?
 *
 * `trialing` cuenta como cliente: en Stripe significa que ya dejo la tarjeta.
 * No confundir con la prueba de 14 dias de la app, que no tiene suscripcion.
 *
 * @returns {Promise<{esCliente: boolean, plan?: string|null, estado?: string}>}
 */
export async function clienteQuePaga(supabase, email) {
  if (!supabase || !email) return { esCliente: false };
  const dir = String(email).trim().toLowerCase();
  const pagan = await direccionesQuePagan(supabase);
  const info = pagan.get(dir);
  return info ? { esCliente: true, plan: info.plan, estado: info.estado } : { esCliente: false };
}

/**
 * Version en lote para los envios masivos: devuelve el subconjunto de
 * `emails` que pertenece a clientes que pagan, en minusculas.
 */
export async function clientesQuePagan(supabase, emails) {
  const fuera = new Set();
  if (!supabase || !emails || !emails.length) return fuera;
  const pagan = await direccionesQuePagan(supabase);
  if (!pagan.size) return fuera;
  for (const e of emails) {
    if (!e) continue;
    const dir = String(e).trim().toLowerCase();
    if (pagan.has(dir)) fuera.add(dir);
  }
  return fuera;
}
