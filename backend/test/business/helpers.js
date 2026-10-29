// Utilidades para los tests de integración de mainds business.
import assert from 'node:assert/strict';

export const DPA = { dpa_accepted: true, dpa_version: 'v1-borrador' };
export const CLINICAL_KEY = 'b'.repeat(64);

export const businessEnv = (betaEmails, extra = {}) => ({
  BUSINESS_ENABLED: 'true',
  BUSINESS_STORE: 'file',
  BUSINESS_BETA_EMAILS: betaEmails,
  FRONTEND_URL: 'https://app.test',
  CLINICAL_ENCRYPTION_KEY: CLINICAL_KEY,
  ...extra
});

const tokenOf = (inviteUrl) => new URL(inviteUrl).searchParams.get('org_invite');

/** Invita y acepta. Devuelve el id de miembro. */
export async function addMember(srv, base, ownerToken, user, body) {
  const inv = await srv.request('POST', `${base}/members/invite`, { token: ownerToken, body: { email: user.email, ...body } });
  assert.equal(inv.status, 201, `invite ${user.email}: ${inv.text}`);
  const acc = await srv.request('POST', '/api/org/invitations/accept', { token: user.token, body: { token: tokenOf(inv.body.invite_url) } });
  assert.equal(acc.status, 200, `accept ${user.email}: ${acc.text}`);
  return acc.body.membership.id;
}

/**
 * Crea usuarios, la clínica y su equipo.
 * @param {object} srv  servidor de helpers/server.js
 * @param {{ owner: {email,name,isClinical?}, name: string, members: Array<{key,email,name,role,body?,psych?}> }} spec
 */
export async function setupClinic(srv, { owner, name, members = [] }) {
  const users = {};
  users.owner = await srv.createUser({ name: owner.name, email: owner.email, role: 'PSYCHOLOGIST' });
  const created = await srv.request('POST', '/api/org', {
    token: users.owner.token, body: { name, ...DPA, is_clinical: !!owner.isClinical }
  });
  assert.equal(created.status, 201, created.text);
  const org = created.body.organization;
  const base = `/api/org/${org.id}`;
  users.owner.memberId = created.body.membership.id;
  for (const m of members) {
    users[m.key] = users[m.key] || await srv.createUser({ name: m.name, email: m.email, role: m.psych === false ? 'PATIENT' : 'PSYCHOLOGIST' });
    users[m.key].memberId = await addMember(srv, base, users.owner.token, users[m.key], { role: m.role, ...(m.body || {}) });
  }
  return { org, base, users };
}

/** ISO de un día futuro fijo a una hora (UTC). */
export const at = (day, h, m = 0) => `2031-03-${String(day).padStart(2, '0')}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00.000Z`;
