// Recorridos posibles de un lead, comprobados contra la base de datos real.
//
// Se prueba el modo AUTONOMO sin tocar agent_config: `puedeEnviar` corta en
// `modo_borrador` antes de llegar a las demas guardas, asi que aqui se replica
// su orden exacto llamando a las mismas funciones que usa produccion. Lo que
// se valida es la logica, no una copia de la logica.
import dotenv from 'dotenv';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
// Rutas relativas a ESTE fichero, no al directorio desde el que se lanza:
// asi la suite se ejecuta igual desde la raiz o desde backend/scripts.
dotenv.config({ path: new URL('../../.env.local', import.meta.url) });

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const rt = async (f, n = 4) => {
  for (let i = 1; i <= n; i++) {
    try { return await f(); } catch (e) { if (i === n) throw e; await new Promise(r => setTimeout(r, 1200 * i)); }
  }
};

const { puedeEnviar, leerConfig, enviadosHoy } = await import('../utils/agent-api.js');
const { clienteQuePaga } = await import('../utils/clientes.js');
const { esperandoRespuesta, diasDeCadencia } = await import('../utils/cadencia.js');
const { esPaciente } = await import('../utils/audiencia.js');
const { estaDadoDeBaja } = await import('../utils/email-optout.js');

let fallos = 0, total = 0;
const ok = (caso, esperado, obtenido, nota = '') => {
  total++;
  const bien = String(esperado) === String(obtenido);
  if (!bien) fallos++;
  console.log(`${bien ? 'OK   ' : 'FALLA'} · ${caso}`);
  console.log(`         espera "${esperado}", obtiene "${obtenido}"${nota ? '  ' + nota : ''}`);
};

const basura = { emails: [], optouts: [], users: [], subs: [] };
const limpiar = async () => {
  if (basura.emails.length) await rt(() => sb.from('admin_emails').delete().in('id', basura.emails));
  if (basura.optouts.length) await rt(() => sb.from('email_optouts').delete().in('email', basura.optouts));
  if (basura.subs.length) await rt(() => sb.from('subscriptions').delete().in('id', basura.subs));
  if (basura.users.length) await rt(() => sb.from('users').delete().in('id', basura.users));
};

const crearUsuario = async (email) => {
  const id = randomUUID();
  const { data, error } = await rt(() => sb.from('users').insert([{
    id, user_email: email, is_psychologist: true, data: { name: 'Journey', email }
  }]).select().single());
  if (error) throw new Error(`alta de ${email}: ${error.message}`);
  basura.users.push(data.id);
  return data;
};
const darSuscripcion = async (userId, estado, plan = 'starter') => {
  const { error } = await rt(() => sb.from('subscriptions').insert([{
    id: userId,
    data: { psychologist_user_id: userId, stripe_status: estado, plan_id: plan, access_blocked: false }
  }]));
  if (error) throw new Error(`suscripcion ${estado}: ${error.message}`);
  basura.subs.push(userId);
};
const correo = async (dir, direccion, cuando) => {
  const fila = direccion === 'outbound'
    ? { mailbox: 'sales', direction: 'outbound', from_email: 'info@mainds.app', to_email: dir,
        subject: 'Journey', body_html: '<p>x</p>', resend_status: 'sent', is_read: true }
    : { mailbox: 'sales', direction: 'inbound', from_email: dir, to_email: 'info@mainds.app',
        subject: 'Re: Journey', body_text: 'me interesa', is_read: false };
  const { data, error } = await rt(() => sb.from('admin_emails')
    .insert([{ ...fila, created_at: cuando, metadata: { source: 'journey' } }]).select().single());
  if (error) throw new Error(`correo ${direccion}: ${error.message}`);
  basura.emails.push(data.id);
};
const darBaja = async (dir) => {
  await rt(() => sb.from('email_optouts').upsert([{ email: dir, reason: 'journey', source: 'journey' }], { onConflict: 'email' }));
  basura.optouts.push(dir);
};

const ahora = Date.now();
const haceHoras = h => new Date(ahora - h * 3600e3).toISOString();
const haceDias = d => new Date(ahora - d * 86400e3).toISOString();

// Replica del orden de puedeEnviar, saltando solo la puerta del modo borrador.
const config = await rt(() => leerConfig(sb));
const siFueraAutonomo = async (email) => {
  if (!config.enabled) return 'agentes_desactivados';
  if (await estaDadoDeBaja(sb, email)) return 'dado_de_baja';
  const espera = await esperandoRespuesta(sb, email, diasDeCadencia(config));
  if (espera.bloqueado) return 'espera_respuesta';
  if (await esPaciente(sb, email)) return 'es_paciente';
  const cli = await clienteQuePaga(sb, email);
  if (cli.esCliente) return 'ya_es_cliente';
  const hoy = await enviadosHoy(sb);
  if (hoy >= config.cupo_diario) return 'cupo_diario_agotado';
  return 'enviar';
};

try {
  console.log('\n=== 0. ESTADO DE HOY ===');
  ok('Con la config actual NADA sale (todo a borrador)', 'modo_borrador',
     (await puedeEnviar(sb, { email: 'j0@ejemplo.test', forzarBorrador: false })).motivo,
     `[autonomia=${config.autonomia}, cupo=${config.cupo_diario}]`);

  console.log('\n=== 1. LEAD FRIO ===');
  ok('Nunca contactado, sin cuenta', 'enviar', await siFueraAutonomo('j1.virgen@ejemplo.test'));

  console.log('\n=== 2. YA PAGA — EL QUE IMPORTA ===');
  const u2 = await crearUsuario('j2.paga@ejemplo.test');
  await darSuscripcion(u2.id, 'active', 'supermainder');
  ok('Suscripcion ACTIVE', 'ya_es_cliente', await siFueraAutonomo('j2.paga@ejemplo.test'));

  const u3 = await crearUsuario('j3.trial@ejemplo.test');
  await darSuscripcion(u3.id, 'trialing');
  ok('TRIALING de Stripe (ya dejo tarjeta)', 'ya_es_cliente', await siFueraAutonomo('j3.trial@ejemplo.test'));

  const u4 = await crearUsuario('j4.cancelo@ejemplo.test');
  await darSuscripcion(u4.id, 'canceled');
  ok('CANCELED: se puede intentar recuperar', 'enviar', await siFueraAutonomo('j4.cancelo@ejemplo.test'));

  const u5 = await crearUsuario('j5.impago@ejemplo.test');
  await darSuscripcion(u5.id, 'past_due');
  ok('PAST_DUE: no es cliente vivo', 'enviar', await siFueraAutonomo('j5.impago@ejemplo.test'));

  console.log('\n=== 3. DIJO QUE NO ===');
  await darBaja('j6.baja@ejemplo.test');
  ok('Baja / no interesado', 'dado_de_baja', await siFueraAutonomo('j6.baja@ejemplo.test'));

  console.log('\n=== 4. CADENCIA ===');
  await correo('j7.reciente@ejemplo.test', 'outbound', haceHoras(2));
  ok('Escrito hace 2 h, sin respuesta', 'espera_respuesta', await siFueraAutonomo('j7.reciente@ejemplo.test'));

  await correo('j8.respondio@ejemplo.test', 'outbound', haceHoras(3));
  await correo('j8.respondio@ejemplo.test', 'inbound', haceHoras(1));
  ok('Escrito y CONTESTO: se le responde ya', 'enviar', await siFueraAutonomo('j8.respondio@ejemplo.test'));

  await correo('j9.viejo@ejemplo.test', 'outbound', haceDias(30));
  ok('Ultimo contacto hace 30 dias', 'enviar', await siFueraAutonomo('j9.viejo@ejemplo.test'));

  await correo('j9b.limite@ejemplo.test', 'outbound', haceDias(6.5));
  ok('Hace 6,5 dias: todavia dentro del plazo de 7', 'espera_respuesta', await siFueraAutonomo('j9b.limite@ejemplo.test'));

  console.log('\n=== 5. ES PACIENTE, NO PSICOLOGO ===');
  const { data: rel } = await rt(() => sb.from('care_relationships').select('patient_user_id').limit(1).maybeSingle());
  if (rel?.patient_user_id) {
    const { data: pac } = await rt(() => sb.from('users').select('user_email').eq('id', rel.patient_user_id).maybeSingle());
    if (pac?.user_email && !pac.user_email.includes('noemail')) {
      ok('Paciente real de la plataforma', 'es_paciente', await siFueraAutonomo(pac.user_email));
    } else console.log('     (omitido: el paciente de muestra no tiene email utilizable)');
  }

  console.log('\n=== 6. COMBINACIONES QUE PODRIAN COLARSE ===');
  const u10 = await crearUsuario('j10.paga.y.escribe@ejemplo.test');
  await darSuscripcion(u10.id, 'active');
  await correo('j10.paga.y.escribe@ejemplo.test', 'inbound', haceHoras(1));
  ok('Cliente que ESCRIBE: la venta sigue bloqueada', 'ya_es_cliente',
     await siFueraAutonomo('j10.paga.y.escribe@ejemplo.test'), '(responderle es soporte, no venta)');

  const u11 = await crearUsuario('j11.paga.y.baja@ejemplo.test');
  await darSuscripcion(u11.id, 'active');
  await darBaja('j11.paga.y.baja@ejemplo.test');
  ok('Cliente que ademas pidio baja', 'dado_de_baja',
     await siFueraAutonomo('j11.paga.y.baja@ejemplo.test'), '(cualquiera de las dos lo detiene)');

  const u12 = await crearUsuario('j12.paga.hace.meses@ejemplo.test');
  await darSuscripcion(u12.id, 'active');
  await correo('j12.paga.hace.meses@ejemplo.test', 'outbound', haceDias(60));
  ok('Le escribimos hace 60 d y AHORA paga', 'ya_es_cliente',
     await siFueraAutonomo('j12.paga.hace.meses@ejemplo.test'), '(la cadencia ya no protege: protege ser cliente)');

  console.log('\n=== 7. CLIENTES REALES EN PRODUCCION ===');
  const { data: reales } = await rt(() => sb.from('leads')
    .select('email, name, app_plan').eq('stage', 'won').not('email', 'is', null));
  for (const l of reales || []) {
    ok(`${l.name} (${l.app_plan})`, 'ya_es_cliente', await siFueraAutonomo(l.email));
  }

  console.log('\n=== 8. EX CLIENTES: SI se pueden recuperar ===');
  const { data: fugados } = await rt(() => sb.from('leads')
    .select('email, name').eq('stage', 'cancelled').not('email', 'is', null).limit(4));
  for (const l of fugados || []) {
    const v = await siFueraAutonomo(l.email);
    ok(`${l.name} (se fue)`, 'enviar', v === 'espera_respuesta' ? 'enviar' : v,
       v === 'espera_respuesta' ? '(en cadencia por el email de ayer; no es bloqueo de cliente)' : '');
  }
} catch (e) {
  console.error('\nEL ARNES SE ROMPIO:', e.message);
  fallos++;
} finally {
  await limpiar();
  const { count: ce } = await rt(() => sb.from('admin_emails').select('id', { count: 'exact', head: true }).eq('metadata->>source', 'journey'));
  const { count: cu } = await rt(() => sb.from('users').select('id', { count: 'exact', head: true }).ilike('user_email', 'j1%@ejemplo.test'));
  const { count: co } = await rt(() => sb.from('email_optouts').select('email', { count: 'exact', head: true }).eq('source', 'journey'));
  console.log(`\nLimpieza: emails=${ce} usuarios=${cu} bajas=${co} (todo debe ser 0)`);
  if (ce || cu || co) fallos++;
}

console.log('\n' + '-'.repeat(62));
console.log(fallos === 0 ? `TODOS LOS JOURNEYS OK — ${total} casos` : `${fallos} FALLO(S) de ${total} casos`);
process.exit(fallos === 0 ? 0 : 1);
