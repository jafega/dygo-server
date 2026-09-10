// clientes.js — a quien paga, y a quien pago alguna vez, no se le vende.
//
// EL RIESGO
// Alguien paga 29,99 al mes y le llega un "te quedan 3 dias de prueba". El
// mensaje dice a gritos que no sabemos quien es, y eso invita a cancelar. En
// un SaaS el correo comercial a un cliente no es una molestia, es fuga.
//
// Y con un EX cliente es peor de lo que parece. La primera version de este
// modulo los dejaba pasar, razonando que un ex cliente es un buen lead a
// recuperar. Es cierto en abstracto y equivocado aqui: quien pago y se fue
// tomo una decision, y volver a venderle con un correo automatico —el mismo
// que se le manda a un desconocido— no es recuperarlo, es no haberse enterado
// de que se fue. Una recuperacion se escribe a mano, sabiendo por que se
// marcho.
//
// POR QUE VIVE APARTE
// La cola de leads ya excluye a los suscritos, pero se apoya en
// `leads.app_is_subscribed`, un campo reflejo que el 7 sep 2026 mentia en 5 de
// 6 clientes. Y una cola no protege el momento del envio: un borrador escrito
// el lunes se aprueba el viernes, cuando esa persona ya ha pagado.
//
// QUE CUENTA COMO HABER SIDO CLIENTE
// Dos senales, y basta con una. Se cruzan a proposito porque el precio de
// fallar es escribirle a un cliente:
//   1. Una fila en `subscriptions` con `stripe_subscription_id`. Que exista
//      ese id significa que hubo una suscripcion de verdad en Stripe.
//   2. Un evento de producto `paid`.
// El 10 sep 2026 las dos daban exactamente las mismas 6 personas, sin huecos.
//
// OJO con lo que NO cuenta: hay 42 filas en `subscriptions` con estado nulo y
// sin id de suscripcion. Son marcadores de plan, no clientes. Seis de ellas
// tienen `stripe_customer_id` porque esa persona llego al checkout y no
// termino: eso no es un ex cliente, es un lead caliente, y a ese si se le
// escribe.
//
// LO QUE ESTO NO BLOQUEA, a proposito:
//   - Correo transaccional: facturas, recordatorios, invitaciones. No pasa por
//     aqui y debe seguir saliendo; un cliente es quien mas lo necesita.
//   - Responder a alguien que ESCRIBE. Eso es soporte, no venta.

const ESTADOS_QUE_PAGAN = ['active', 'trialing'];

/**
 * Mapa direccion -> { pagaAhora, plan, estado } de todo el que ha tenido
 * alguna vez una suscripcion de verdad.
 *
 * La consulta va al reves a proposito: no pregunta "el usuario de este email,
 * ¿paga?" sino "quien ha pagado, ¿es este?". Dos razones. Exactitud: cruzar
 * por email con ILIKE es una trampa, porque el guion bajo es un comodin y hay
 * direcciones que lo llevan, y un falso positivo bloquearia correo a quien no
 * toca. Y tamano: los que han pagado son 6 de 76. Si algun dia son miles,
 * habra que darle la vuelta otra vez y cruzar por id.
 */
async function historialDeClientes(supabase) {
  const [subsRes, pagosRes] = await Promise.all([
    supabase.from('subscriptions').select('id, data'),
    supabase.from('product_events').select('user_id').eq('event', 'paid')
  ]);
  if (subsRes.error) throw subsRes.error;
  if (pagosRes.error) throw pagosRes.error;

  const porUsuario = new Map();
  const anotar = (uid, info) => {
    if (!uid) return;
    const clave = String(uid);
    const previo = porUsuario.get(clave) || { pagaAhora: false, plan: null, estado: null };
    porUsuario.set(clave, {
      pagaAhora: previo.pagaAhora || !!info.pagaAhora,
      plan: info.plan || previo.plan,
      estado: info.estado || previo.estado
    });
  };

  for (const s of subsRes.data || []) {
    const d = s.data || {};
    const tuvoSuscripcion = !!d.stripe_subscription_id || ESTADOS_QUE_PAGAN.includes(d.stripe_status);
    if (!tuvoSuscripcion) continue;
    anotar(d.psychologist_user_id || s.id, {
      pagaAhora: ESTADOS_QUE_PAGAN.includes(d.stripe_status),
      plan: d.plan_id || null,
      estado: d.stripe_status || null
    });
  }
  // Segunda senal, por si una fila de suscripcion se perdiera: quien tiene un
  // evento `paid` pago, aunque hoy no le encontremos la suscripcion.
  for (const p of pagosRes.data || []) {
    anotar(p.user_id, { pagaAhora: false, plan: null, estado: 'pago_registrado' });
  }
  if (!porUsuario.size) return new Map();

  const { data: usuarios, error } = await supabase
    .from('users')
    .select('id, user_email, data')
    .in('id', [...porUsuario.keys()]);
  if (error) throw error;

  const porDireccion = new Map();
  for (const u of usuarios || []) {
    const info = porUsuario.get(String(u.id));
    if (!info) continue;
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
 * ¿Esta direccion es de alguien que paga o que pago alguna vez?
 *
 * `trialing` cuenta como cliente que paga: en Stripe significa que ya dejo la
 * tarjeta. No confundir con la prueba de 14 dias de la app, que no tiene
 * suscripcion detras.
 *
 * @returns {Promise<{esCliente: boolean, fueCliente: boolean, plan?: string|null, estado?: string|null}>}
 */
export async function clienteQuePaga(supabase, email) {
  if (!supabase || !email) return { esCliente: false, fueCliente: false };
  const dir = String(email).trim().toLowerCase();
  const historial = await historialDeClientes(supabase);
  const info = historial.get(dir);
  if (!info) return { esCliente: false, fueCliente: false };
  return {
    esCliente: info.pagaAhora,
    fueCliente: !info.pagaAhora,
    plan: info.plan,
    estado: info.estado
  };
}

/**
 * Version en lote: devuelve el subconjunto de `emails` que ha tenido alguna
 * vez una suscripcion, pague hoy o no. Para los envios masivos.
 */
export async function clientesQuePagan(supabase, emails) {
  const fuera = new Set();
  if (!supabase || !emails || !emails.length) return fuera;
  const historial = await historialDeClientes(supabase);
  if (!historial.size) return fuera;
  for (const e of emails) {
    if (!e) continue;
    const dir = String(e).trim().toLowerCase();
    if (historial.has(dir)) fuera.add(dir);
  }
  return fuera;
}

/** Ids de usuario que han tenido alguna vez suscripcion. Para automation.js. */
export async function usuariosQueHanPagado(supabase) {
  const [subsRes, pagosRes] = await Promise.all([
    supabase.from('subscriptions').select('id, data'),
    supabase.from('product_events').select('user_id').eq('event', 'paid')
  ]);
  if (subsRes.error) throw subsRes.error;
  if (pagosRes.error) throw pagosRes.error;

  const ids = new Set();
  for (const s of subsRes.data || []) {
    const d = s.data || {};
    if (!d.stripe_subscription_id && !ESTADOS_QUE_PAGAN.includes(d.stripe_status)) continue;
    const uid = d.psychologist_user_id || s.id;
    if (uid) ids.add(String(uid));
  }
  for (const p of pagosRes.data || []) if (p.user_id) ids.add(String(p.user_id));
  return ids;
}
