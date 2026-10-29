// colaboradores.js — el programa de colaboradores de mainds, en un solo sitio.
//
// Un colaborador es un usuario (normalmente psicólogo con audiencia) al que un
// superadmin da de alta. Mientras está activo:
//
//   1. Tiene mainds premium sin pagar. No se toca users.master: el acceso se
//      decide preguntando aquí (idsColaboradoresActivos), así que al darlo de
//      baja pierde el premium sin que haya nada que deshacer.
//   2. Tiene códigos de descuento que SOLO crea el superadmin. Cada código es un
//      coupon + promotion code de Stripe, y como el checkout ya tiene
//      allow_promotion_codes, funciona en cuanto se crea.
//   3. Gana dinero por los leads que pagan con sus códigos. El webhook de Stripe
//      (invoice.payment_succeeded) llama a registrarFacturaCobrada, que apunta
//      el lead y lo que haya ganado en la bolsa (collaborator_earnings).
//
// Tablas: backend/scripts/add-collaborators-tables.sql.

const TABLA = {
  colaboradores: 'collaborators',
  codigos: 'collaborator_codes',
  referidos: 'collaborator_referrals',
  apuntes: 'collaborator_earnings'
};

const redondear = (n) => Math.round(Number(n || 0) * 100) / 100;

// ── Caché de colaboradores activos ───────────────────────────────────────────
// El acceso premium se comprueba en muchas rutas; no puede costar una consulta
// cada vez. Mismo esquema que user-block.js: 60s, y quien cambia algo invalida
// la caché de su instancia para que allí sea inmediato.
const TTL_MS = 60 * 1000;
let cache = { ids: new Set(), cargadoEn: 0, valida: false };

export function invalidarCacheColaboradores() {
  cache = { ids: new Set(), cargadoEn: 0, valida: false };
}

/** Ids de usuario de los colaboradores activos. Cacheado 60s. */
export async function idsColaboradoresActivos(supabase, { force = false } = {}) {
  if (!supabase) return new Set();
  const fresca = cache.valida && (Date.now() - cache.cargadoEn) < TTL_MS;
  if (fresca && !force) return cache.ids;
  try {
    const { data, error } = await supabase
      .from(TABLA.colaboradores)
      .select('user_id')
      .eq('active', true);
    if (error) throw error;
    cache = {
      ids: new Set((data || []).map(r => String(r.user_id))),
      cargadoEn: Date.now(),
      valida: true
    };
  } catch (err) {
    // Si la tabla aún no existe (migración sin ejecutar) o falla la lectura,
    // seguimos con lo último que supiéramos: nadie pierde acceso por un error.
    console.warn('[colaboradores] no se pudo leer los colaboradores activos:', err?.message || err);
  }
  return cache.ids;
}

/** Versión síncrona para el código que no puede esperar: usa lo último cacheado. */
export function esColaboradorActivoCacheado(userId) {
  return !!userId && cache.ids.has(String(userId));
}

export async function esColaboradorActivo(supabase, userId) {
  if (!supabase || !userId) return false;
  return (await idsColaboradoresActivos(supabase)).has(String(userId));
}

// ── Validación de la estructura de pagos ─────────────────────────────────────

/**
 * Normaliza y valida la estructura de pagos que manda el panel.
 * Devuelve { ok: true, valores } o { ok: false, error }.
 */
export function validarEstructuraPagos(body = {}) {
  const valores = {};
  if (body.payout_model !== undefined) {
    if (!['one_time', 'recurring'].includes(body.payout_model)) {
      return { ok: false, error: 'payout_model debe ser one_time o recurring' };
    }
    valores.payout_model = body.payout_model;
  }
  if (body.payout_amount_type !== undefined) {
    if (!['fixed', 'percent'].includes(body.payout_amount_type)) {
      return { ok: false, error: 'payout_amount_type debe ser fixed o percent' };
    }
    valores.payout_amount_type = body.payout_amount_type;
  }
  if (body.payout_amount !== undefined) {
    const n = Number(body.payout_amount);
    if (!Number.isFinite(n) || n < 0) return { ok: false, error: 'El importe por lead no es válido' };
    valores.payout_amount = redondear(n);
  }
  if (body.payout_percent !== undefined) {
    const n = Number(body.payout_percent);
    if (!Number.isFinite(n) || n < 0 || n > 100) return { ok: false, error: 'El porcentaje debe estar entre 0 y 100' };
    valores.payout_percent = redondear(n);
  }
  if (body.payout_min_months !== undefined) {
    const n = parseInt(body.payout_min_months, 10);
    if (!Number.isInteger(n) || n < 1) return { ok: false, error: 'Los meses mínimos deben ser 1 o más' };
    valores.payout_min_months = n;
  }
  if (body.payout_max_months !== undefined) {
    if (body.payout_max_months === null || body.payout_max_months === '') {
      valores.payout_max_months = null;
    } else {
      const n = parseInt(body.payout_max_months, 10);
      if (!Number.isInteger(n) || n < 1) return { ok: false, error: 'El tope de meses debe ser 1 o más (o vacío)' };
      valores.payout_max_months = n;
    }
  }
  // El pago único es siempre un importe fijo: un % de "una vez" no tiene base clara.
  if (valores.payout_model === 'one_time') valores.payout_amount_type = 'fixed';
  if (body.notes !== undefined) valores.notes = body.notes ? String(body.notes).slice(0, 2000) : null;
  return { ok: true, valores };
}

// ── Cálculo de lo que gana el colaborador ────────────────────────────────────

/**
 * Qué apuntes genera una factura cobrada. Función pura: no toca nada.
 *
 * @param {object} colab            fila de collaborators
 * @param {object} o
 * @param {number} o.importeNeto    lo que pagó el lead en esta factura, sin IVA (€)
 * @param {number} o.mesesPagados   facturas cobradas del lead CONTANDO esta
 * @param {boolean} o.yaTienePagoUnico si este lead ya generó su pago único
 * @returns {{type: string, amount: number, description: string}[]}
 */
export function calcularGanancia(colab, { importeNeto, mesesPagados, yaTienePagoUnico }) {
  if (!colab || !colab.active) return [];
  if (colab.payout_model === 'one_time') {
    const minimo = Math.max(1, Number(colab.payout_min_months) || 1);
    const importe = redondear(colab.payout_amount);
    if (yaTienePagoUnico || mesesPagados < minimo || importe <= 0) return [];
    return [{
      type: 'one_time',
      amount: importe,
      description: `Pago por lead (${minimo} ${minimo === 1 ? 'mes pagado' : 'meses pagados'})`
    }];
  }
  // recurring
  const tope = colab.payout_max_months ? Number(colab.payout_max_months) : null;
  if (tope && mesesPagados > tope) return [];
  const importe = colab.payout_amount_type === 'percent'
    ? redondear(Number(importeNeto || 0) * Number(colab.payout_percent || 0) / 100)
    : redondear(colab.payout_amount);
  if (importe <= 0) return [];
  return [{
    type: 'recurring',
    amount: importe,
    description: `Comisión mes ${mesesPagados}${tope ? ` de ${tope}` : ''}`
  }];
}

// ── Códigos de descuento (Stripe) ────────────────────────────────────────────

const CODIGO_VALIDO = /^[A-Z0-9_-]{3,40}$/;

/**
 * Crea el código en Stripe (coupon + promotion code) y lo guarda.
 * Solo lo llama el superadmin.
 */
export async function crearCodigo(supabase, stripe, {
  colaborador, code, percentOff, durationMonths, maxRedemptions, createdBy
}) {
  const codigo = String(code || '').trim().toUpperCase();
  if (!CODIGO_VALIDO.test(codigo)) {
    return { ok: false, status: 400, error: 'El código debe tener 3-40 caracteres: letras, números, guion o guion bajo' };
  }
  const pct = Number(percentOff);
  if (!Number.isFinite(pct) || pct <= 0 || pct > 100) {
    return { ok: false, status: 400, error: 'El descuento debe estar entre 1 y 100 %' };
  }
  let meses = null;
  if (durationMonths !== null && durationMonths !== undefined && durationMonths !== '') {
    meses = parseInt(durationMonths, 10);
    if (!Number.isInteger(meses) || meses < 1 || meses > 36) {
      return { ok: false, status: 400, error: 'La duración debe ser de 1 a 36 meses (o vacía = para siempre)' };
    }
  }
  let maxUsos = null;
  if (maxRedemptions !== null && maxRedemptions !== undefined && maxRedemptions !== '') {
    maxUsos = parseInt(maxRedemptions, 10);
    if (!Number.isInteger(maxUsos) || maxUsos < 1) {
      return { ok: false, status: 400, error: 'El máximo de usos debe ser 1 o más (o vacío = sin límite)' };
    }
  }

  const { data: existente } = await supabase
    .from(TABLA.codigos).select('id').ilike('code', codigo).limit(1);
  if (existente?.length) return { ok: false, status: 409, error: `El código ${codigo} ya existe` };

  const metadata = { collaborator_id: String(colaborador.id), collaborator_user_id: String(colaborador.user_id) };
  const coupon = await stripe.coupons.create({
    percent_off: redondear(pct),
    duration: meses ? 'repeating' : 'forever',
    ...(meses ? { duration_in_months: meses } : {}),
    name: `${codigo} · ${redondear(pct)}%${meses ? ` ${meses}m` : ''}`.slice(0, 40),
    metadata
  });
  let promo;
  try {
    promo = await stripe.promotionCodes.create({
      coupon: coupon.id,
      code: codigo,
      ...(maxUsos ? { max_redemptions: maxUsos } : {}),
      metadata
    });
  } catch (err) {
    // Sin promotion code el coupon no sirve para nada: lo quitamos.
    await stripe.coupons.del(coupon.id).catch(() => {});
    const msg = err?.message || 'Stripe rechazó el código';
    return { ok: false, status: 400, error: /already exists|ya existe/i.test(msg) ? `El código ${codigo} ya existe en Stripe` : msg };
  }

  const { data, error } = await supabase.from(TABLA.codigos).insert([{
    collaborator_id: colaborador.id,
    code: codigo,
    percent_off: redondear(pct),
    duration_months: meses,
    max_redemptions: maxUsos,
    stripe_coupon_id: coupon.id,
    stripe_promotion_code_id: promo.id,
    active: true,
    created_by: createdBy || null
  }]).select().single();
  if (error) {
    // Que no quede un código vivo en Stripe que nadie ve en el panel.
    await stripe.promotionCodes.update(promo.id, { active: false }).catch(() => {});
    return { ok: false, status: 500, error: error.message };
  }
  return { ok: true, codigo: data };
}

/** Activa o desactiva un código en Stripe y aquí. */
export async function cambiarEstadoCodigo(supabase, stripe, codigo, activo) {
  await stripe.promotionCodes.update(codigo.stripe_promotion_code_id, { active: !!activo });
  const { data, error } = await supabase
    .from(TABLA.codigos).update({ active: !!activo }).eq('id', codigo.id).select().single();
  if (error) throw error;
  return data;
}

// ── Webhook de Stripe ────────────────────────────────────────────────────────

const idDe = (x) => (x && typeof x === 'object' ? x.id : x) || null;

/** Promotion code aplicado a una factura, si lo hay. */
function promocionDeFactura(invoice) {
  return idDe(invoice?.discount?.promotion_code)
    || (Array.isArray(invoice?.discounts) ? invoice.discounts.map(d => idDe(d?.promotion_code)).find(Boolean) : null)
    || null;
}

async function datosUsuario(supabase, userId) {
  if (!userId) return { email: null, name: null };
  const { data } = await supabase
    .from('users').select('user_email, data').eq('id', String(userId)).maybeSingle();
  const d = data?.data || {};
  const name = d.name || [d.firstName, d.lastName].filter(Boolean).join(' ') || null;
  return { email: data?.user_email || d.email || null, name };
}

/**
 * Busca (o crea, si la suscripción entró con un código de colaborador) el
 * referido de una suscripción. Devuelve null si no tiene nada que ver con el
 * programa.
 */
async function referidoDeSuscripcion(supabase, stripe, stripeSubId, invoice) {
  const { data: existente } = await supabase
    .from(TABLA.referidos).select('*').eq('stripe_subscription_id', stripeSubId).maybeSingle();
  if (existente) return existente;

  // El descuento de la suscripción se copia a cada factura mientras dura, y la
  // primera factura siempre lo lleva. Si esta no trae código, no es nuestra: así
  // no se pregunta a Stripe por cada factura de cada cliente.
  const promoId = promocionDeFactura(invoice);
  if (!promoId) return null;

  const { data: codigo } = await supabase
    .from(TABLA.codigos).select('*').eq('stripe_promotion_code_id', promoId).maybeSingle();
  if (!codigo) return null;
  // Es nuestra: ahora sí hace falta la suscripción, por su metadata (quién es el lead).
  const suscripcion = await stripe.subscriptions.retrieve(stripeSubId).catch(() => null);
  const { data: colab } = await supabase
    .from(TABLA.colaboradores).select('*').eq('id', codigo.collaborator_id).maybeSingle();
  if (!colab) return null;

  const meta = suscripcion?.metadata || invoice?.subscription_details?.metadata || {};
  const tipo = meta.subscription_type || (meta.patient_user_id ? 'patient' : 'psychologist');
  const referidoUserId = meta.psychologist_user_id || meta.patient_user_id || null;
  // Usar tu propio código no cuenta.
  if (referidoUserId && String(referidoUserId) === String(colab.user_id)) return null;

  const usuario = await datosUsuario(supabase, referidoUserId);
  const fila = {
    collaborator_id: colab.id,
    code_id: codigo.id,
    code: codigo.code,
    referred_user_id: referidoUserId,
    referred_email: usuario.email || invoice?.customer_email || null,
    referred_name: usuario.name || invoice?.customer_name || null,
    subscription_type: tipo,
    plan_id: meta.plan_id || null,
    stripe_customer_id: idDe(invoice?.customer) || idDe(suscripcion?.customer),
    stripe_subscription_id: stripeSubId,
    stripe_status: suscripcion?.status || 'active'
  };
  const { data: creado, error } = await supabase
    .from(TABLA.referidos).insert([fila]).select().single();
  if (error) {
    // Dos webhooks a la vez: el otro ya lo creó.
    const { data: otro } = await supabase
      .from(TABLA.referidos).select('*').eq('stripe_subscription_id', stripeSubId).maybeSingle();
    if (otro) return otro;
    throw error;
  }
  console.log(`🤝 [colaboradores] nuevo lead ${fila.referred_email || referidoUserId} con el código ${codigo.code}`);
  return creado;
}

/**
 * invoice.payment_succeeded. Apunta el lead (si vino con un código de
 * colaborador) y lo que haya ganado el colaborador con esta factura.
 * Idempotente: Stripe reintenta los webhooks.
 */
export async function registrarFacturaCobrada(supabase, stripe, invoice) {
  if (!supabase || !stripe || !invoice?.subscription) return null;
  const stripeSubId = idDe(invoice.subscription);
  const referido = await referidoDeSuscripcion(supabase, stripe, stripeSubId, invoice);
  if (!referido) return null;

  const cobrado = Number(invoice.amount_paid || 0);
  // Facturas a 0 € (prueba, descuento del 100 %) dejan constancia del lead pero
  // no son "meses pagados" ni generan comisión.
  if (cobrado <= 0) return { referido, apuntes: [] };

  const pagadas = Array.isArray(referido.paid_invoice_ids) ? referido.paid_invoice_ids : [];
  if (pagadas.includes(invoice.id)) return { referido, apuntes: [] };

  const importeNeto = redondear((cobrado - Number(invoice.tax || 0)) / 100);
  const mesesPagados = pagadas.length + 1;
  const ahora = new Date().toISOString();
  const { data: actualizado } = await supabase.from(TABLA.referidos).update({
    paid_invoice_ids: [...pagadas, invoice.id],
    months_paid: mesesPagados,
    total_paid: redondear(Number(referido.total_paid || 0) + importeNeto),
    first_paid_at: referido.first_paid_at || ahora,
    last_paid_at: ahora,
    stripe_status: 'active',
    updated_at: ahora
  }).eq('id', referido.id).select().single();

  const { data: colab } = await supabase
    .from(TABLA.colaboradores).select('*').eq('id', referido.collaborator_id).maybeSingle();
  const { data: unico } = await supabase
    .from(TABLA.apuntes).select('id').eq('referral_id', referido.id).eq('type', 'one_time').limit(1);

  const apuntes = calcularGanancia(colab, {
    importeNeto, mesesPagados, yaTienePagoUnico: !!unico?.length
  });
  const quien = referido.referred_name || referido.referred_email || 'lead';
  for (const a of apuntes) {
    const { error } = await supabase.from(TABLA.apuntes).insert([{
      collaborator_id: referido.collaborator_id,
      referral_id: referido.id,
      type: a.type,
      amount: a.amount,
      description: `${a.description} · ${quien}`,
      stripe_invoice_id: invoice.id
    }]);
    // Violación de unicidad = este apunte ya estaba (reintento). Cualquier otra cosa se registra.
    if (error && !/duplicate|unique/i.test(error.message || '')) {
      console.error('[colaboradores] no se pudo apuntar la ganancia:', error.message);
    }
  }
  return { referido: actualizado || referido, apuntes };
}

/** customer.subscription.updated / deleted: mantiene el estado del lead al día. */
export async function actualizarEstadoReferido(supabase, subscription, { borrada = false } = {}) {
  if (!supabase || !subscription?.id) return;
  const cambios = {
    stripe_status: borrada ? 'canceled' : subscription.status,
    updated_at: new Date().toISOString()
  };
  if (borrada || subscription.status === 'canceled') cambios.canceled_at = new Date().toISOString();
  await supabase.from(TABLA.referidos).update(cambios).eq('stripe_subscription_id', subscription.id);
}

/**
 * Red de seguridad del webhook: lo llama a diario api/reconcile-subscriptions.js.
 *
 * Recorre en el histórico de Stripe las facturas cobradas de los últimos `dias`
 * y pasa por registrarFacturaCobrada las que llevan un código de colaborador.
 * Si el webhook ya las apuntó no hace nada (es idempotente); si el webhook se
 * perdió o el evento no está activado en Stripe, las apunta ahora. Así el panel
 * sabe quién ha pagado con cada código aunque falle el camino rápido.
 *
 * También pone al día el estado de cada lead con las suscripciones de Stripe
 * que el cron ya ha descargado (`suscripciones`).
 */
export async function reconciliarColaboradores(supabase, stripe, { suscripciones = [], dias = 40, dryRun = false } = {}) {
  const resumen = { codigos: 0, facturas_con_codigo: 0, procesadas: 0, estados_actualizados: 0, errores: [] };
  const { data: codigos, error } = await supabase.from(TABLA.codigos).select('stripe_promotion_code_id');
  if (error) throw error;
  const promos = new Set((codigos || []).map(c => c.stripe_promotion_code_id));
  resumen.codigos = promos.size;
  if (!promos.size) return resumen;

  // Más antiguas primero: el número de mes de cada comisión sale en orden.
  const facturas = [];
  const desde = Math.floor(Date.now() / 1000) - dias * 24 * 60 * 60;
  for await (const inv of stripe.invoices.list({ status: 'paid', created: { gte: desde }, limit: 100 })) {
    if (inv.subscription && promos.has(promocionDeFactura(inv))) facturas.push(inv);
  }
  facturas.sort((a, b) => a.created - b.created);
  resumen.facturas_con_codigo = facturas.length;

  if (!dryRun) {
    for (const inv of facturas) {
      try {
        await registrarFacturaCobrada(supabase, stripe, inv);
        resumen.procesadas++;
      } catch (err) {
        resumen.errores.push({ invoice: inv.id, error: err?.message || String(err) });
      }
    }
    const { data: referidos } = await supabase
      .from(TABLA.referidos).select('stripe_subscription_id, stripe_status');
    const porId = new Map(suscripciones.map(s => [s.id, s]));
    for (const r of referidos || []) {
      const sub = porId.get(r.stripe_subscription_id);
      if (sub && sub.status !== r.stripe_status) {
        await actualizarEstadoReferido(supabase, sub);
        resumen.estados_actualizados++;
      }
    }
  }
  return resumen;
}

// ── Lectura para los paneles ─────────────────────────────────────────────────

/** "maria.lopez@gmail.com" → "ma***@gmail.com". El colaborador no necesita más. */
export function enmascararEmail(email) {
  const e = String(email || '');
  const at = e.indexOf('@');
  if (at < 1) return e ? '***' : null;
  return `${e.slice(0, Math.min(2, at))}***${e.slice(at)}`;
}

const ACTIVOS = ['active', 'trialing', 'past_due'];

function resumir(referidos, apuntes) {
  const sum = (arr) => redondear(arr.reduce((s, a) => s + Number(a.amount || 0), 0));
  const ganado = apuntes.filter(a => a.type !== 'payout');
  const pagos = apuntes.filter(a => a.type === 'payout');
  const inicioMes = new Date(); inicioMes.setDate(1); inicioMes.setHours(0, 0, 0, 0);
  return {
    leads: referidos.length,
    paying: referidos.filter(r => r.months_paid > 0 && ACTIVOS.includes(r.stripe_status)).length,
    converted: referidos.filter(r => r.months_paid > 0).length,
    canceled: referidos.filter(r => r.stripe_status === 'canceled').length,
    total_earned: sum(ganado),
    total_paid_out: redondear(-sum(pagos)),
    balance: sum(apuntes),
    earned_this_month: sum(ganado.filter(a => new Date(a.created_at) >= inicioMes))
  };
}

/** Todo lo que ve un colaborador en su área (y el superadmin en su ficha). */
export async function panelColaborador(supabase, colaboradorId, { vistaAdmin = false } = {}) {
  const [{ data: colab }, { data: codigos }, { data: referidos }, { data: apuntes }] = await Promise.all([
    supabase.from(TABLA.colaboradores).select('*').eq('id', colaboradorId).maybeSingle(),
    supabase.from(TABLA.codigos).select('*').eq('collaborator_id', colaboradorId).order('created_at', { ascending: false }),
    supabase.from(TABLA.referidos).select('*').eq('collaborator_id', colaboradorId).order('created_at', { ascending: false }),
    supabase.from(TABLA.apuntes).select('*').eq('collaborator_id', colaboradorId).order('created_at', { ascending: false })
  ]);
  if (!colab) return null;
  const refs = referidos || [];
  const movs = apuntes || [];
  const ganadoPorReferido = {};
  for (const a of movs) {
    if (a.referral_id && a.type !== 'payout') {
      ganadoPorReferido[a.referral_id] = redondear((ganadoPorReferido[a.referral_id] || 0) + Number(a.amount || 0));
    }
  }
  const usosPorCodigo = {};
  for (const r of refs) if (r.code_id) usosPorCodigo[r.code_id] = (usosPorCodigo[r.code_id] || 0) + 1;

  return {
    collaborator: {
      id: colab.id,
      user_id: colab.user_id,
      name: colab.name,
      email: colab.email,
      active: colab.active,
      created_at: colab.created_at,
      deactivated_at: colab.deactivated_at,
      payout_model: colab.payout_model,
      payout_amount_type: colab.payout_amount_type,
      payout_amount: Number(colab.payout_amount),
      payout_percent: Number(colab.payout_percent),
      payout_min_months: colab.payout_min_months,
      payout_max_months: colab.payout_max_months,
      ...(vistaAdmin ? { notes: colab.notes } : {})
    },
    codes: (codigos || []).map(c => ({
      id: c.id,
      code: c.code,
      percent_off: Number(c.percent_off),
      duration_months: c.duration_months,
      max_redemptions: c.max_redemptions,
      active: c.active,
      created_at: c.created_at,
      uses: usosPorCodigo[c.id] || 0
    })),
    stats: resumir(refs, movs),
    referrals: refs.map(r => ({
      id: r.id,
      name: r.referred_name,
      email: vistaAdmin ? r.referred_email : enmascararEmail(r.referred_email),
      code: r.code,
      subscription_type: r.subscription_type,
      plan_id: r.plan_id,
      status: r.stripe_status,
      months_paid: r.months_paid,
      total_paid: vistaAdmin ? Number(r.total_paid) : undefined,
      created_at: r.created_at,
      first_paid_at: r.first_paid_at,
      earned: ganadoPorReferido[r.id] || 0
    })),
    earnings: movs.slice(0, 200).map(a => ({
      id: a.id,
      type: a.type,
      amount: Number(a.amount),
      description: a.description,
      created_at: a.created_at
    }))
  };
}

/** Lista para el superadmin, con el resumen de cada uno. */
export async function listarColaboradores(supabase) {
  const [{ data: colabs, error }, { data: referidos }, { data: apuntes }, { data: codigos }] = await Promise.all([
    supabase.from(TABLA.colaboradores).select('*').order('created_at', { ascending: false }),
    supabase.from(TABLA.referidos).select('collaborator_id, months_paid, stripe_status'),
    supabase.from(TABLA.apuntes).select('collaborator_id, type, amount, created_at'),
    supabase.from(TABLA.codigos).select('collaborator_id, code, active')
  ]);
  if (error) throw error;
  return (colabs || []).map(c => ({
    id: c.id,
    user_id: c.user_id,
    name: c.name,
    email: c.email,
    active: c.active,
    created_at: c.created_at,
    payout_model: c.payout_model,
    payout_amount_type: c.payout_amount_type,
    payout_amount: Number(c.payout_amount),
    payout_percent: Number(c.payout_percent),
    payout_min_months: c.payout_min_months,
    payout_max_months: c.payout_max_months,
    notes: c.notes,
    codes: (codigos || []).filter(k => k.collaborator_id === c.id).map(k => ({ code: k.code, active: k.active })),
    stats: resumir(
      (referidos || []).filter(r => r.collaborator_id === c.id),
      (apuntes || []).filter(a => a.collaborator_id === c.id)
    )
  }));
}

export const TABLAS_COLABORADORES = TABLA;
