// lead-suscripcion.js — que la ficha del CRM diga lo que dice Stripe.
//
// El problema que resuelve: `leads.stage` y `leads.app_is_subscribed` se
// escribian desde el webhook de Stripe y nada mas. Si el webhook no estaba
// montado todavia, fallaba, o el cliente cancelo antes de que ese codigo
// existiera, la ficha se quedaba congelada para siempre.
//
// El resultado, medido el 7 sep 2026: de 6 leads en etapa `won`, CINCO
// mentian. Cuatro constaban como pagando despues de cancelar, y una que si
// pagaba constaba como no suscrita. El panel decia 6 clientes; el MRR real
// eran 2.
//
// Por eso esto se llama desde reconcile-subscriptions, que corre todos los
// dias contra Stripe: el webhook es el camino rapido, y esto la red que lo
// recoge cuando el rapido falla.
//
// VOCABULARIO DE ETAPAS, que aqui importa:
//   won       → paga AHORA.
//   cancelled → fue cliente y se fue. NO es lo mismo que `lost`.
//   lost      → nunca compro, o dijo que no.
// Mezclar `cancelled` con `lost` borra la unica diferencia que de verdad
// interesa en un SaaS: la fuga de clientes.

/**
 * Ajusta la ficha del lead a lo que dice Stripe, y deja constancia del cambio.
 *
 * @param {object} supabase  cliente con service role
 * @param {object} o
 * @param {string} o.userId       id del usuario de la app
 * @param {boolean} o.activaAhora si la suscripcion esta viva en Stripe
 * @param {string} [o.plan]       plan_id
 * @param {string} [o.estado]     stripe_status, solo para la nota
 * @param {string} [o.origen]     quien lo hace, para la traza
 * @returns {Promise<{cambiado: boolean, leadId?: string, de?: string, a?: string}>}
 */
export async function sincronizarLeadConSuscripcion(supabase, {
  userId, activaAhora, plan = null, estado = null, origen = 'reconcile'
}) {
  if (!supabase || !userId) return { cambiado: false };

  const { data: leads } = await supabase
    .from('leads')
    .select('id, name, email, stage, app_is_subscribed, app_plan')
    .eq('app_user_id', userId)
    .limit(1);
  const lead = leads?.[0];
  if (!lead) return { cambiado: false };

  const cambios = {};
  let etapaNueva = null;

  if (activaAhora) {
    // Paga: es cliente, venga de donde venga. Se respeta `won` si ya lo era.
    if (lead.stage !== 'won') etapaNueva = 'won';
    if (lead.app_is_subscribed !== true) cambios.app_is_subscribed = true;
    if (plan && lead.app_plan !== plan) cambios.app_plan = plan;
  } else {
    // No paga. Solo se degrada a `cancelled` a quien FUE cliente: quien nunca
    // lo fue no ha perdido nada, y marcarlo asi falsearia la fuga.
    if (lead.stage === 'won') etapaNueva = 'cancelled';
    if (lead.app_is_subscribed !== false) cambios.app_is_subscribed = false;
    if (lead.app_plan !== null) cambios.app_plan = null;
  }

  if (etapaNueva) cambios.stage = etapaNueva;
  if (!Object.keys(cambios).length) return { cambiado: false, leadId: lead.id };

  cambios.updated_at = new Date().toISOString();
  const { error } = await supabase.from('leads').update(cambios).eq('id', lead.id);
  if (error) throw error;

  // La nota es lo que hace posible el informe diario de movimientos: sin una
  // fila con fecha, un cambio de etapa no se puede contar despues.
  if (etapaNueva) {
    await supabase.from('lead_activities').insert([{
      lead_id: lead.id,
      type: 'stage_change',
      title: etapaNueva === 'won'
        ? 'Pasa a cliente'
        : 'Deja de pagar',
      body: etapaNueva === 'won'
        ? `Suscripcion activa en Stripe${plan ? ` (${plan})` : ''}.`
        : `La suscripcion ya no esta activa en Stripe${estado ? ` (${estado})` : ''}. Fue cliente y se ha ido.`,
      metadata: {
        source: origen,
        de: lead.stage,
        a: etapaNueva,
        stripe_status: estado,
        plan
      },
      created_by: origen
    }]);
  }

  return { cambiado: true, leadId: lead.id, de: lead.stage, a: etapaNueva || lead.stage };
}
