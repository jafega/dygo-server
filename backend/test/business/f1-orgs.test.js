// F1 — Integración de punta a punta (servidor real, driver file, sin Supabase):
// alta de clínica, invitaciones, permisos de equipo, bajas y webhook de Stripe.
import test from 'node:test';
import assert from 'node:assert/strict';
import Stripe from 'stripe';
import { startServer } from '../helpers/server.js';

const ENV = {
  BUSINESS_ENABLED: 'true',
  BUSINESS_STORE: 'file',
  BUSINESS_BETA_EMAILS: 'owner@clinic.local',
  FRONTEND_URL: 'https://app.test'
};
const DPA = { dpa_accepted: true, dpa_version: 'v1-borrador' };
const tokenOf = (inviteUrl) => new URL(inviteUrl).searchParams.get('org_invite');

test('F1: alta, invitaciones, roles, bajas y aislamiento', async (t) => {
  const srv = await startServer({ env: ENV });
  t.after(() => srv.stop());
  const req = srv.request;

  const owner = await srv.createUser({ name: 'Olga Titular', email: 'owner@clinic.local', role: 'PSYCHOLOGIST' });
  const a = await srv.createUser({ name: 'Ana Psicóloga', email: 'ana@clinic.local', role: 'PSYCHOLOGIST' });
  const b = await srv.createUser({ name: 'Bea', email: 'bea@clinic.local', role: 'PSYCHOLOGIST' });
  const c = await srv.createUser({ name: 'Carlos Ajeno', email: 'carlos@else.local', role: 'PSYCHOLOGIST' });
  const r = await srv.createUser({ name: 'Rosa Recepción', email: 'rosa@clinic.local' });

  // 1. Crear clínica: beta → 201; otro → 403; sin DPA → 400; slug repetido → 409.
  assert.equal((await req('POST', '/api/org', { token: c.token, body: { name: 'X', ...DPA } })).status, 403);
  const noDpa = await req('POST', '/api/org', { token: owner.token, body: { name: 'Clínica Mar' } });
  assert.equal(noDpa.status, 400);
  assert.equal(noDpa.body.code, 'DPA_REQUIRED');
  assert.equal((await req('POST', '/api/org', { token: owner.token, body: { name: '', ...DPA } })).status, 400);
  assert.equal((await req('POST', '/api/org', { token: owner.token, body: { name: 'Admin', slug: 'admin', ...DPA } })).status, 400);

  const created = await req('POST', '/api/org', { token: owner.token, body: { name: 'Clínica Mar Azul', ...DPA } });
  assert.equal(created.status, 201, created.text);
  const org = created.body.organization;
  assert.equal(org.slug, 'clinica-mar-azul');
  assert.equal(org.status, 'trialing');
  assert.equal(org.access, 'full');
  assert.equal(org.trial_days_left, 14);
  assert.equal(created.body.membership.role, 'titular');
  assert.equal((await req('POST', '/api/org', { token: owner.token, body: { name: 'Otra', slug: 'clinica-mar-azul', ...DPA } })).status, 409);
  const base = `/api/org/${org.id}`;

  // /me del titular
  const meOwner = await req('GET', '/api/org/me', { token: owner.token });
  assert.equal(meOwner.body.memberships.length, 1);
  assert.equal(meOwner.body.memberships[0].role, 'titular');

  // 2. Invitar a A (psicóloga autónoma) → 201 con enlace; duplicada → 409; rol titular → 400.
  const invA = await req('POST', `${base}/members/invite`, {
    token: owner.token,
    body: { email: 'ANA@clinic.local', role: 'psicologo', employment_type: 'freelance', billing_model: 'org_invoices' }
  });
  assert.equal(invA.status, 201, invA.text);
  assert.match(invA.body.invite_url, /^https:\/\/app\.test\/\?org_invite=/);
  assert.equal(invA.body.member.status, 'invited');
  assert.equal(invA.body.member.email, 'ana@clinic.local');
  assert.equal(invA.body.email_sent, false);
  assert.equal((await req('POST', `${base}/members/invite`, { token: owner.token, body: { email: 'ana@clinic.local', role: 'psicologo' } })).status, 409);
  assert.equal((await req('POST', `${base}/members/invite`, { token: owner.token, body: { email: 'z@z.local', role: 'titular' } })).status, 400);
  assert.equal((await req('POST', `${base}/members/invite`, { token: owner.token, body: { email: 'z@z.local', role: 'recepcion', permissions_override: { grant: ['clinical.read_all'] } } })).status, 400);

  // A ve la invitación pendiente en /me
  const meA0 = await req('GET', '/api/org/me', { token: a.token });
  assert.equal(meA0.body.pendingInvitations.length, 1);
  assert.equal(meA0.body.pendingInvitations[0].orgName, 'Clínica Mar Azul');
  assert.equal(meA0.body.memberships.length, 0);

  // 3. B intenta aceptar con el token de A → 403; token inventado → 404.
  const tokA = tokenOf(invA.body.invite_url);
  const wrong = await req('POST', '/api/org/invitations/accept', { token: b.token, body: { token: tokA } });
  assert.equal(wrong.status, 403);
  assert.equal(wrong.body.code, 'INVITATION_EMAIL_MISMATCH');
  assert.equal((await req('POST', '/api/org/invitations/accept', { token: a.token, body: { token: 'nope' } })).status, 404);

  // 4. A acepta → 200; segunda vez → 409; A ya entra en la clínica.
  const acc = await req('POST', '/api/org/invitations/accept', { token: a.token, body: { token: tokA } });
  assert.equal(acc.status, 200, acc.text);
  assert.equal(acc.body.membership.role, 'psicologo');
  assert.equal((await req('POST', '/api/org/invitations/accept', { token: a.token, body: { token: tokA } })).status, 409);
  const orgAsA = await req('GET', base, { token: a.token });
  assert.equal(orgAsA.status, 200);
  assert.ok(orgAsA.body.membership.permissions.includes('agenda.manage_own'));

  // Aceptar no cambia nada de la cuenta personal.
  const userA = srv.readDb().users.find(u => u.id === a.id);
  assert.equal(userA.is_psychologist, true);

  // La lista de equipo: A ve nombres y roles, sin emails ajenos; el titular ve todo.
  const teamA = await req('GET', `${base}/members`, { token: a.token });
  assert.equal(teamA.status, 200);
  const ownerSeenByA = teamA.body.members.find(m => m.role === 'titular');
  assert.equal(ownerSeenByA.email, undefined);
  assert.equal(teamA.body.members.find(m => m.role === 'psicologo').email, 'ana@clinic.local'); // su propia ficha
  const teamOwner = await req('GET', `${base}/members`, { token: owner.token });
  assert.ok(teamOwner.body.members.every(m => typeof m.email === 'string'));

  // 5. C (no miembro) → 404 en todo; superadmin tampoco entra.
  for (const url of [base, `${base}/members`, `${base}/billing`]) {
    assert.equal((await req('GET', url, { token: c.token })).status, 404, url);
  }
  assert.equal((await req('GET', '/api/org/00000000-0000-0000-0000-000000000000', { token: owner.token })).status, 404);

  // 6. Recepción no puede invitar ni gestionar el equipo → 403.
  const invR = await req('POST', `${base}/members/invite`, { token: owner.token, body: { email: 'rosa@clinic.local', role: 'recepcion' } });
  assert.equal((await req('POST', '/api/org/invitations/accept', { token: r.token, body: { token: tokenOf(invR.body.invite_url) } })).status, 200);
  const rInvites = await req('POST', `${base}/members/invite`, { token: r.token, body: { email: 'x@clinic.local', role: 'psicologo' } });
  assert.equal(rInvites.status, 403);
  assert.equal(rInvites.body.code, 'FORBIDDEN');
  assert.equal((await req('PATCH', base, { token: r.token, body: { name: 'Hack' } })).status, 403);
  assert.equal((await req('GET', `${base}/billing`, { token: r.token })).status, 403);

  // Nadie cambia el rol del titular ni se escala a sí mismo.
  const ownerMemberId = created.body.membership.id;
  const aMemberId = acc.body.membership.id;
  assert.equal((await req('PATCH', `${base}/members/${ownerMemberId}`, { token: owner.token, body: { role: 'gerente' } })).status, 403);
  const gerInv = await req('POST', `${base}/members/invite`, { token: owner.token, body: { email: 'bea@clinic.local', role: 'gerente' } });
  await req('POST', '/api/org/invitations/accept', { token: b.token, body: { token: tokenOf(gerInv.body.invite_url) } });
  const bMember = (await req('GET', `${base}/members`, { token: owner.token })).body.members.find(m => m.email === 'bea@clinic.local');
  assert.equal((await req('PATCH', `${base}/members/${bMember.id}`, { token: b.token, body: { permissions_override: { grant: ['library.manage'] } } })).status, 403);
  assert.equal((await req('PATCH', `${base}/members/${ownerMemberId}`, { token: b.token, body: { display_name: 'X' } })).status, 403);
  // El gerente sí puede cambiar el rol de A, y los permisos se recalculan.
  const toDir = await req('PATCH', `${base}/members/${aMemberId}`, { token: b.token, body: { role: 'director_clinico' } });
  assert.equal(toDir.status, 200);
  assert.ok(toDir.body.member.permissions.includes('clinical.read_all'));
  await req('PATCH', `${base}/members/${aMemberId}`, { token: owner.token, body: { role: 'psicologo' } });

  // El titular no puede salir; suspender/reactivar.
  assert.equal((await req('POST', `${base}/leave`, { token: owner.token })).status, 400);
  assert.equal((await req('POST', `${base}/members/${aMemberId}/suspend`, { token: owner.token })).status, 200);
  assert.equal((await req('GET', base, { token: a.token })).status, 404);
  assert.equal((await req('POST', `${base}/members/${aMemberId}/reactivate`, { token: owner.token })).status, 200);
  assert.equal((await req('GET', base, { token: a.token })).status, 200);

  // 7. Baja de A → su siguiente petición 404; su /me ya no tiene la clínica.
  const del = await req('DELETE', `${base}/members/${aMemberId}`, { token: owner.token });
  assert.equal(del.status, 200);
  assert.equal(del.body.member.status, 'left');
  assert.equal((await req('GET', base, { token: a.token })).status, 404);
  assert.deepEqual((await req('GET', '/api/org/me', { token: a.token })).body.memberships, []);

  // Re-invitación de alguien que se fue: reutiliza su ficha.
  const reInv = await req('POST', `${base}/members/invite`, { token: owner.token, body: { email: 'ana@clinic.local', role: 'psicologo' } });
  assert.equal(reInv.status, 201);
  assert.equal(reInv.body.member.id, aMemberId);

  // Licencias: titular no clínico (0) + A fuera; recepción y gerente no cuentan.
  const bill = await req('GET', `${base}/billing`, { token: owner.token });
  assert.equal(bill.status, 200);
  assert.equal(bill.body.seats, 0);
  assert.equal(bill.body.stripe_configured, false);
  const co = await req('POST', `${base}/billing/checkout`, { token: owner.token, body: { plan: 'plus', interval: 'month' } });
  assert.equal(co.status, 503);
  assert.equal(co.body.code, 'STRIPE_NOT_CONFIGURED');

  // Auditoría: el alta y el DPA quedaron registrados.
  const store = JSON.parse((await import('node:fs')).readFileSync(`${srv.tmpDir}/business-store.json`, 'utf-8'));
  const actions = store.tables.access_audit.map(e => e.action);
  for (const a2 of ['org.created', 'org.dpa_accepted', 'org.member_invited', 'org.member_joined', 'org.member_remove']) {
    assert.ok(actions.includes(a2), a2);
  }
  // El token de invitación nunca se guarda en claro.
  assert.ok(!JSON.stringify(store).includes(tokA));
});

test('F1: webhook firmado de una clínica actualiza la clínica y no toca las suscripciones de Pro', async (t) => {
  const SECRET = 'whsec_test_business';
  const srv = await startServer({
    env: { ...ENV, STRIPE_SECRET_KEY: 'sk_test_dummy_no_network', STRIPE_WEBHOOK_SECRET: SECRET },
    db: {
      users: [],
      subscriptions: [{
        id: 'psych-1', psychologist_user_id: 'psych-1', stripe_subscription_id: 'sub_pro', stripe_customer_id: 'cus_pro',
        stripe_status: 'active', access_blocked: false, plan_id: 'starter'
      }]
    }
  });
  t.after(() => srv.stop());
  const owner = await srv.createUser({ name: 'Olga', email: 'owner@clinic.local', role: 'PSYCHOLOGIST' });
  const created = await srv.request('POST', '/api/org', { token: owner.token, body: { name: 'Clínica Stripe', ...DPA } });
  const orgId = created.body.organization.id;

  const stripe = new Stripe('sk_test_dummy_no_network', { apiVersion: '2022-11-15' });
  const send = async (event) => {
    const payload = JSON.stringify(event);
    const header = stripe.webhooks.generateTestHeaderString({ payload, secret: SECRET });
    return fetch(`${srv.baseUrl}/webhook`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'stripe-signature': header }, body: payload });
  };
  const subsBefore = JSON.stringify(srv.readDb().subscriptions);

  const r1 = await send({
    id: 'evt_1', type: 'checkout.session.completed',
    data: { object: { id: 'cs_1', mode: 'subscription', customer: 'cus_org', subscription: 'sub_org', metadata: { mainds_kind: 'organization', organization_id: orgId, plan: 'plus', interval: 'month' } } }
  });
  assert.equal(r1.status, 200);
  const org1 = (await srv.request('GET', `/api/org/${orgId}`, { token: owner.token })).body.organization;
  assert.equal(org1.status, 'active');
  assert.equal(org1.plan_id, 'plus');

  const r2 = await send({
    id: 'evt_2', type: 'customer.subscription.updated',
    data: { object: { id: 'sub_org', status: 'past_due', customer: 'cus_org', metadata: { mainds_kind: 'organization', organization_id: orgId } } }
  });
  assert.equal(r2.status, 200);
  const org2 = (await srv.request('GET', `/api/org/${orgId}`, { token: owner.token })).body.organization;
  assert.equal(org2.status, 'past_due');
  assert.equal(org2.access, 'read_only');

  // Con la suscripción impagada: lectura sí, cambios no (402); pagar sí.
  const base = `/api/org/${orgId}`;
  assert.equal((await srv.request('GET', `${base}/members`, { token: owner.token })).status, 200);
  const blocked = await srv.request('POST', `${base}/members/invite`, { token: owner.token, body: { email: 'n@x.local', role: 'psicologo' } });
  assert.equal(blocked.status, 402);
  assert.equal(blocked.body.code, 'ORG_SUBSCRIPTION_REQUIRED');
  assert.equal((await srv.request('POST', `${base}/billing/checkout`, { token: owner.token, body: {} })).status, 503);

  // Las suscripciones de Pro no se han tocado.
  assert.equal(JSON.stringify(srv.readDb().subscriptions), subsBefore);
});
