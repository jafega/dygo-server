// Organizaciones, equipo e invitaciones (backlog F1.3).
//
// Rutas de nivel superior (registerTopLevelRoutes, en /api/org):
//   POST /                         crear clínica (lista beta o superadmin)
//   POST /invitations/accept       aceptar invitación (token del email)
//   POST /invitations/decline      rechazar invitación
//   GET  /admin/orgs               soporte (solo superadmin, sin datos clínicos)
// Rutas de una clínica (registerScopedRoutes, en /api/org/:orgId, ya con
// requireMember):
//   GET/PATCH /                    datos de la clínica
//   GET  /members                  equipo
//   POST /members/invite           invitar
//   PATCH /members/:memberId       cambiar rol, modelo económico, permisos…
//   POST /members/:memberId/suspend | reactivate
//   DELETE /members/:memberId      dar de baja (status left)
//   POST /leave                    salir de la clínica

import crypto from 'node:crypto';
import {
  ROLES, isValidRole, validateOverride, effectivePermissions, isSeatBillable
} from '../utils/orgPermissions.js';
import { asyncRoute, httpError, badRequest, forbidden, notFound } from './errors.js';
import { orgAccess, hasPlus, requireAction } from './workspace.js';
import { canCreateOrganization } from './flags.js';

export const TRIAL_DAYS = 14;
const INVITE_TTL_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

export const EMPLOYMENT_TYPES = ['employee', 'freelance', 'room_rental', 'intern'];
export const BILLING_MODELS = ['payroll', 'org_invoices', 'psych_invoices', 'fixed_rent'];
export const PLANS = ['essential', 'plus'];
export const INTERVALS = ['month', 'year'];

const RESERVED_SLUGS = new Set(['admin', 'api', 'me', 'invitations', 'org', 'public', 'nueva', 'new', 'app', 'www', 'mainds']);

const nowIso = () => new Date().toISOString();
export const normEmail = (e) => String(e || '').trim().toLowerCase();
const emailOf = (user) => normEmail(user?.email || user?.user_email || user?.data?.email);
const nameOf = (user) => String(user?.name || user?.data?.name || '').trim() || null;
const isEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
export const hashToken = (token) => crypto.createHash('sha256').update(String(token)).digest('hex');
const clientIp = (req) => String(req.ip || req.headers['x-forwarded-for'] || '').split(',')[0].trim() || null;

/** "Clínica Sáenz & Co." → "clinica-saenz-co" */
export function slugify(text) {
  return String(text || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50)
    .replace(/-+$/g, '');
}

export function validateSlug(slug) {
  if (!/^[a-z0-9](?:[a-z0-9-]{1,48}[a-z0-9])$/.test(slug)) {
    return 'El identificador debe tener entre 3 y 50 caracteres: letras minúsculas, números y guiones.';
  }
  if (RESERVED_SLUGS.has(slug)) return 'Ese identificador está reservado.';
  return null;
}

const trimOrNull = (v, max = 200) => {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s ? s.slice(0, max) : null;
};

// ── Proyecciones (qué sale en las respuestas) ──────────────────────────────
export function projectOrg(org) {
  const access = orgAccess(org);
  return {
    id: org.id,
    name: org.name,
    slug: org.slug,
    legal_name: org.legal_name || null,
    cif: org.cif || null,
    logo_url: org.logo_url || null,
    plan_id: org.plan_id,
    billing_interval: org.billing_interval,
    status: org.status,
    trial_ends_at: org.trial_ends_at || null,
    access: access.level,
    trial: access.trial,
    trial_days_left: access.trialDaysLeft,
    plus: hasPlus(org),
    created_at: org.created_at
  };
}

/** Datos de un miembro. Los sensibles solo para quien gestiona el equipo. */
export function projectMember(m, { full = false } = {}) {
  const base = {
    id: m.id,
    user_id: m.status === 'active' ? (m.user_id || null) : null,
    display_name: m.display_name || null,
    role: m.role,
    status: m.status,
    is_clinical: !!m.is_clinical,
    supervisor_member_id: m.supervisor_member_id || null,
    accepts_leads: !!m.accepts_leads
  };
  if (!full) return base;
  return {
    ...base,
    user_id: m.user_id || null,
    email: m.email,
    employment_type: m.employment_type,
    billing_model: m.billing_model,
    irpf_rate: m.irpf_rate ?? null,
    seat_billable: !!m.seat_billable,
    permissions_override: m.permissions_override || {},
    permissions: effectivePermissions(m),
    invitation_expires_at: m.status === 'invited' ? (m.invitation_expires_at || null) : null,
    joined_at: m.joined_at || null,
    left_at: m.left_at || null,
    created_at: m.created_at
  };
}

function inviteEmailHtml({ orgName, inviterName, roleLabel, url }) {
  const esc = (s) => String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  return `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#0f172a">
  <h2 style="color:#4f46e5">Te han invitado a ${esc(orgName)} en mainds</h2>
  <p>${esc(inviterName || 'El equipo de la clínica')} te invita a unirte a <strong>${esc(orgName)}</strong> como <strong>${esc(roleLabel)}</strong>.</p>
  <p>Entrarás con tu propia cuenta de mainds. Los datos de la clínica quedan separados de tu consulta personal.</p>
  <p style="margin:28px 0"><a href="${esc(url)}" style="background:#4f46e5;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none">Aceptar invitación</a></p>
  <p style="font-size:13px;color:#64748b">El enlace caduca en ${INVITE_TTL_DAYS} días. Si no esperabas esta invitación, ignora este email.</p>
</div>`;
}

const ROLE_LABEL_ES = {
  titular: 'titular', gerente: 'gerente', director_clinico: 'director/a clínico/a', psicologo: 'psicólogo/a',
  en_practicas: 'psicólogo/a en prácticas', recepcion: 'recepción', contable: 'contable'
};

// ── /me ─────────────────────────────────────────────────────────────────────
/** Construye la respuesta de GET /api/org/me para un usuario. */
export async function buildMe(ctx, user, userId) {
  const { store, flags, isSuperAdmin } = ctx;
  const email = emailOf(user);
  const canCreateOrg = canCreateOrganization(email, { betaEmails: flags.betaEmails, isSuperAdmin });

  const memberRows = await store.list('org_members', { eq: { user_id: String(userId) }, limit: 100 });
  const memberships = [];
  for (const m of memberRows) {
    if (m.status !== 'active') continue;
    const org = await store.get('organizations', m.org_id);
    if (!org) continue;
    const access = orgAccess(org);
    memberships.push({
      orgId: org.id, name: org.name, slug: org.slug, logo_url: org.logo_url || null,
      role: m.role, status: m.status, memberId: m.id,
      permissions: effectivePermissions(m),
      access: access.level, trial: access.trial, trial_days_left: access.trialDaysLeft
    });
  }

  const pendingInvitations = [];
  if (email) {
    const invited = await store.list('org_members', { eq: { email, status: 'invited' }, limit: 50 });
    const now = Date.now();
    for (const m of invited) {
      if (m.invitation_expires_at && new Date(m.invitation_expires_at).getTime() < now) continue;
      const org = await store.get('organizations', m.org_id);
      if (!org) continue;
      pendingInvitations.push({ memberId: m.id, orgId: org.id, orgName: org.name, role: m.role, expiresAt: m.invitation_expires_at || null });
    }
  }

  return { enabled: true, canCreateOrg, dpaVersion: flags.dpaVersion, memberships, pendingInvitations };
}

// ── Rutas de nivel superior ─────────────────────────────────────────────────
export function registerTopLevelRoutes(router, ctx) {
  const { store, flags, getUser, isSuperAdmin, recordAccess, authenticateRequest, seats } = ctx;

  // Crear clínica
  router.post('/', authenticateRequest, asyncRoute(async (req, res) => {
    const userId = String(req.authenticatedUserId);
    const user = await getUser(userId);
    const email = emailOf(user);
    if (!canCreateOrganization(email, { betaEmails: flags.betaEmails, isSuperAdmin })) {
      throw httpError(403, 'BUSINESS_NOT_ALLOWED', 'mainds business está en beta privada. Escríbenos para darte de alta.');
    }
    if (!email) throw badRequest('Tu cuenta no tiene email.');

    const body = req.body || {};
    const name = trimOrNull(body.name, 120);
    if (!name) throw badRequest('El nombre de la clínica es obligatorio.');
    const slug = body.slug ? String(body.slug).trim().toLowerCase() : slugify(name);
    const slugError = validateSlug(slug);
    if (slugError) throw badRequest(slugError, 'INVALID_SLUG');
    const plan = body.plan || 'essential';
    if (!PLANS.includes(plan)) throw badRequest('Plan no válido.');
    const interval = body.billing_interval || 'month';
    if (!INTERVALS.includes(interval)) throw badRequest('Periodicidad no válida.');
    if (body.dpa_accepted !== true || body.dpa_version !== flags.dpaVersion) {
      throw badRequest('Debes aceptar el contrato de encargo del tratamiento (DPA) vigente.', 'DPA_REQUIRED');
    }

    const now = new Date();
    const org = await store.insert('organizations', {
      name, slug,
      legal_name: trimOrNull(body.legal_name),
      cif: trimOrNull(body.cif, 20)?.toUpperCase() || null,
      logo_url: null,
      settings: {},
      plan_id: plan,
      billing_interval: interval,
      status: 'trialing',
      trial_ends_at: new Date(now.getTime() + TRIAL_DAYS * DAY_MS).toISOString(),
      dpa_accepted_at: now.toISOString(),
      dpa_version: flags.dpaVersion,
      dpa_accepted_by: userId,
      created_by: userId,
      updated_at: now.toISOString()
    });

    let owner;
    try {
      const ownerRow = {
        org_id: org.id, user_id: userId, email, display_name: nameOf(user),
        role: 'titular', is_clinical: body.is_clinical === true,
        permissions_override: {}, employment_type: 'employee', billing_model: 'payroll',
        status: 'active', joined_at: now.toISOString(), invited_by: userId,
        public_profile: {}, accepts_leads: false, updated_at: now.toISOString()
      };
      ownerRow.seat_billable = isSeatBillable(ownerRow);
      owner = await store.insert('org_members', ownerRow);
    } catch (err) {
      await store.remove('organizations', org.id).catch(() => {});
      throw err;
    }

    await recordAccess({ org_id: org.id, actor_user_id: userId, action: 'org.created', resource_type: 'organization', resource_id: org.id, ip: clientIp(req) });
    await recordAccess({ org_id: org.id, actor_user_id: userId, action: 'org.dpa_accepted', resource_type: 'organization', resource_id: org.id, justification: `DPA ${flags.dpaVersion}`, ip: clientIp(req) });

    res.status(201).json({
      organization: projectOrg(org),
      membership: { ...projectMember(owner, { full: true }), permissions: effectivePermissions(owner) }
    });
  }));

  // Aceptar invitación
  router.post('/invitations/accept', authenticateRequest, asyncRoute(async (req, res) => {
    const token = String(req.body?.token || '').trim();
    if (!token) throw notFound('Invitación no encontrada o caducada');
    const userId = String(req.authenticatedUserId);
    const [invite] = await store.list('org_members', { eq: { invitation_token_hash: hashToken(token) }, limit: 1 });
    if (!invite) throw httpError(404, 'INVITATION_NOT_FOUND', 'Invitación no encontrada o caducada');
    if (invite.status !== 'invited') {
      throw httpError(409, 'INVITATION_USED', 'Esta invitación ya se ha usado.');
    }
    if (invite.invitation_expires_at && new Date(invite.invitation_expires_at).getTime() < Date.now()) {
      throw httpError(404, 'INVITATION_NOT_FOUND', 'Invitación no encontrada o caducada');
    }
    const user = await getUser(userId);
    if (!emailOf(user) || emailOf(user) !== normEmail(invite.email)) {
      throw httpError(403, 'INVITATION_EMAIL_MISMATCH',
        `Esta invitación es para otra dirección de email. Entra con la cuenta de ${invite.email}.`);
    }
    const org = await store.get('organizations', invite.org_id);
    if (!org) throw httpError(404, 'INVITATION_NOT_FOUND', 'Invitación no encontrada o caducada');

    const updated = await store.update('org_members', invite.id, {
      user_id: userId,
      display_name: invite.display_name || nameOf(user),
      status: 'active',
      joined_at: nowIso(),
      left_at: null,
      seat_billable: isSeatBillable(invite),
      updated_at: nowIso()
    });
    await recordAccess({ org_id: org.id, actor_user_id: userId, action: 'org.member_joined', resource_type: 'org_member', resource_id: invite.id, ip: clientIp(req) });
    await seats.sync(org.id);

    res.json({
      organization: projectOrg(org),
      membership: { ...projectMember(updated, { full: true }), permissions: effectivePermissions(updated) }
    });
  }));

  // Rechazar invitación
  router.post('/invitations/decline', authenticateRequest, asyncRoute(async (req, res) => {
    const token = String(req.body?.token || '').trim();
    const [invite] = token
      ? await store.list('org_members', { eq: { invitation_token_hash: hashToken(token) }, limit: 1 })
      : [];
    if (!invite || invite.status !== 'invited') throw httpError(404, 'INVITATION_NOT_FOUND', 'Invitación no encontrada o caducada');
    const user = await getUser(String(req.authenticatedUserId));
    if (emailOf(user) !== normEmail(invite.email)) {
      throw httpError(403, 'INVITATION_EMAIL_MISMATCH', 'Esta invitación es para otra dirección de email.');
    }
    await store.update('org_members', invite.id, { status: 'declined', invitation_token_hash: null, updated_at: nowIso() });
    res.json({ ok: true });
  }));

  // Soporte: listado de clínicas (solo superadmin, sin datos clínicos ni de pacientes)
  router.get('/admin/orgs', authenticateRequest, asyncRoute(async (req, res) => {
    const user = await getUser(String(req.authenticatedUserId));
    if (!isSuperAdmin(emailOf(user))) throw forbidden();
    const orgs = await store.list('organizations', { order: '-created_at', limit: 500 });
    const out = [];
    for (const org of orgs) {
      const members = await store.list('org_members', { eq: { org_id: org.id }, limit: 500 });
      out.push({
        ...projectOrg(org),
        stripe_subscription_id: org.stripe_subscription_id || null,
        members_active: members.filter(m => m.status === 'active').length,
        members_invited: members.filter(m => m.status === 'invited').length,
        seats: members.filter(m => m.status === 'active' && m.seat_billable).length,
        seats_billed: org.seats_billed ?? null
      });
    }
    res.json({ organizations: out });
  }));
}

// ── Rutas de una clínica ────────────────────────────────────────────────────
export function registerScopedRoutes(router, ctx) {
  const { store, recordAccess, seats, sendEmail, frontendUrl } = ctx;

  const loadMember = async (req) => {
    const m = await store.get('org_members', String(req.params.memberId || ''));
    if (!m || m.org_id !== req.workspace.orgId) throw notFound('Miembro no encontrado');
    return m;
  };

  router.get('/', asyncRoute(async (req, res) => {
    const { org, member, permissions } = req.workspace;
    res.json({
      organization: projectOrg(org),
      membership: { ...projectMember(member, { full: true }), permissions }
    });
  }));

  router.patch('/', requireAction('org.settings'), asyncRoute(async (req, res) => {
    const body = req.body || {};
    const patch = { updated_at: nowIso() };
    if (body.name !== undefined) {
      const name = trimOrNull(body.name, 120);
      if (!name) throw badRequest('El nombre no puede estar vacío.');
      patch.name = name;
    }
    if (body.legal_name !== undefined) patch.legal_name = trimOrNull(body.legal_name);
    if (body.cif !== undefined) patch.cif = trimOrNull(body.cif, 20)?.toUpperCase() || null;
    if (body.logo_url !== undefined) {
      const url = trimOrNull(body.logo_url, 500);
      if (url && !/^https:\/\//i.test(url)) throw badRequest('El logo debe ser una URL https.');
      patch.logo_url = url;
    }
    if (body.slug !== undefined) {
      const slug = String(body.slug).trim().toLowerCase();
      const err = validateSlug(slug);
      if (err) throw badRequest(err, 'INVALID_SLUG');
      patch.slug = slug;
    }
    const org = await store.update('organizations', req.workspace.orgId, patch);
    res.json({ organization: projectOrg(org) });
  }));

  // Equipo
  router.get('/members', asyncRoute(async (req, res) => {
    const full = req.workspace.can('team.manage');
    const rows = await store.list('org_members', { eq: { org_id: req.workspace.orgId }, order: 'created_at', limit: 500 });
    const visible = full ? rows : rows.filter(m => m.status === 'active');
    res.json({ members: visible.map(m => projectMember(m, { full: full || m.id === req.workspace.member.id })) });
  }));

  router.post('/members/invite', requireAction('team.manage'), asyncRoute(async (req, res) => {
    const body = req.body || {};
    const email = normEmail(body.email);
    if (!isEmail(email)) throw badRequest('Email no válido.');
    const role = body.role;
    if (role === 'titular') throw badRequest('Solo puede haber un titular.', 'INVALID_ROLE');
    if (!isValidRole(role)) throw badRequest(`Rol no válido. Valores: ${ROLES.filter(r => r !== 'titular').join(', ')}.`, 'INVALID_ROLE');
    const employment = body.employment_type || (role === 'en_practicas' ? 'intern' : 'employee');
    if (!EMPLOYMENT_TYPES.includes(employment)) throw badRequest('Tipo de relación no válido.');
    const billingModel = body.billing_model || 'payroll';
    if (!BILLING_MODELS.includes(billingModel)) throw badRequest('Modelo económico no válido.');
    const overrideErr = validateOverride(role, body.permissions_override);
    if (overrideErr) throw badRequest(overrideErr, 'INVALID_PERMISSIONS');
    if (body.supervisor_member_id) await assertSupervisor(store, req.workspace.orgId, body.supervisor_member_id);

    const [existing] = await store.list('org_members', { eq: { org_id: req.workspace.orgId, email }, limit: 1 });
    if (existing && ['active', 'invited', 'suspended'].includes(existing.status)) {
      throw httpError(409, 'MEMBER_EXISTS', existing.status === 'invited'
        ? 'Ya hay una invitación pendiente para ese email.'
        : 'Esa persona ya forma parte del equipo.');
    }

    const token = crypto.randomBytes(32).toString('base64url');
    const fields = {
      role,
      display_name: trimOrNull(body.display_name, 120),
      is_clinical: false,
      permissions_override: body.permissions_override || {},
      employment_type: employment,
      billing_model: billingModel,
      irpf_rate: body.irpf_rate ?? null,
      supervisor_member_id: body.supervisor_member_id || null,
      status: 'invited',
      invitation_token_hash: hashToken(token),
      invitation_expires_at: new Date(Date.now() + INVITE_TTL_DAYS * DAY_MS).toISOString(),
      invited_by: String(req.authenticatedUserId),
      seat_billable: false,
      left_at: null,
      updated_at: nowIso()
    };
    const member = existing
      ? await store.update('org_members', existing.id, fields)
      : await store.insert('org_members', { org_id: req.workspace.orgId, email, user_id: null, public_profile: {}, accepts_leads: false, ...fields });

    const inviteUrl = `${frontendUrl}/?org_invite=${encodeURIComponent(token)}`;
    let emailSent = false;
    if (typeof sendEmail === 'function') {
      try {
        emailSent = !!(await sendEmail({
          to: email,
          subject: `Invitación a ${req.workspace.org.name} en mainds`,
          html: inviteEmailHtml({
            orgName: req.workspace.org.name,
            inviterName: req.workspace.member.display_name,
            roleLabel: ROLE_LABEL_ES[role] || role,
            url: inviteUrl
          })
        }));
      } catch { emailSent = false; }
    }
    await recordAccess({ org_id: req.workspace.orgId, actor_user_id: String(req.authenticatedUserId), action: 'org.member_invited', resource_type: 'org_member', resource_id: member.id });

    res.status(201).json({ member: projectMember(member, { full: true }), invite_url: inviteUrl, email_sent: emailSent });
  }));

  router.patch('/members/:memberId', requireAction('team.manage'), asyncRoute(async (req, res) => {
    const target = await loadMember(req);
    const me = req.workspace.member;
    const body = req.body || {};
    const isSelf = target.id === me.id;
    const patch = { updated_at: nowIso() };

    if (target.role === 'titular' && me.role !== 'titular') throw forbidden('Solo el titular puede cambiar sus datos.');
    if (body.role !== undefined && body.role !== target.role) {
      if (isSelf) throw forbidden('No puedes cambiar tu propio rol.');
      if (target.role === 'titular') throw forbidden('El rol del titular no se puede cambiar.');
      if (body.role === 'titular') throw badRequest('Solo puede haber un titular.', 'INVALID_ROLE');
      if (!isValidRole(body.role)) throw badRequest('Rol no válido.', 'INVALID_ROLE');
      patch.role = body.role;
    }
    const role = patch.role || target.role;
    if (body.permissions_override !== undefined) {
      if (isSelf) throw forbidden('No puedes cambiar tus propios permisos.');
      const err = validateOverride(role, body.permissions_override);
      if (err) throw badRequest(err, 'INVALID_PERMISSIONS');
      patch.permissions_override = body.permissions_override || {};
    } else if (patch.role) {
      // Al cambiar de rol, lo concedido para el anterior puede no valer.
      const err = validateOverride(role, target.permissions_override);
      if (err) patch.permissions_override = {};
    }
    if (body.is_clinical !== undefined) {
      if (target.role !== 'titular') throw badRequest('is_clinical solo aplica al titular.');
      patch.is_clinical = body.is_clinical === true;
    }
    if (body.employment_type !== undefined) {
      if (!EMPLOYMENT_TYPES.includes(body.employment_type)) throw badRequest('Tipo de relación no válido.');
      patch.employment_type = body.employment_type;
    }
    if (body.billing_model !== undefined) {
      if (!BILLING_MODELS.includes(body.billing_model)) throw badRequest('Modelo económico no válido.');
      patch.billing_model = body.billing_model;
    }
    if (body.irpf_rate !== undefined) {
      const r = body.irpf_rate === null ? null : Number(body.irpf_rate);
      if (r !== null && (!Number.isFinite(r) || r < 0 || r > 50)) throw badRequest('IRPF no válido.');
      patch.irpf_rate = r;
    }
    if (body.supervisor_member_id !== undefined) {
      if (body.supervisor_member_id) {
        if (body.supervisor_member_id === target.id) throw badRequest('Nadie puede supervisarse a sí mismo.');
        await assertSupervisor(store, req.workspace.orgId, body.supervisor_member_id);
      }
      patch.supervisor_member_id = body.supervisor_member_id || null;
    }
    if (body.display_name !== undefined) patch.display_name = trimOrNull(body.display_name, 120);
    if (body.accepts_leads !== undefined) patch.accepts_leads = body.accepts_leads === true;

    const next = { ...target, ...patch };
    patch.seat_billable = next.status === 'active' ? isSeatBillable(next) : false;
    const updated = await store.update('org_members', target.id, patch);
    if (updated.seat_billable !== !!target.seat_billable) await seats.sync(req.workspace.orgId);
    await recordAccess({ org_id: req.workspace.orgId, actor_user_id: String(req.authenticatedUserId), action: 'org.member_updated', resource_type: 'org_member', resource_id: target.id });
    res.json({ member: projectMember(updated, { full: true }) });
  }));

  const changeStatus = (action) => asyncRoute(async (req, res) => {
    const target = await loadMember(req);
    if (target.role === 'titular') throw badRequest('No se puede suspender ni dar de baja al titular.', 'OWNER_PROTECTED');
    if (target.id === req.workspace.member.id) throw badRequest('No puedes hacerlo sobre ti. Usa "Salir de la clínica".');
    let patch;
    if (action === 'suspend') {
      if (target.status !== 'active') throw httpError(409, 'INVALID_STATUS', 'Solo se puede suspender a un miembro activo.');
      patch = { status: 'suspended', seat_billable: false };
    } else if (action === 'reactivate') {
      if (target.status !== 'suspended') throw httpError(409, 'INVALID_STATUS', 'Solo se puede reactivar a un miembro suspendido.');
      patch = { status: 'active', seat_billable: isSeatBillable(target) };
    } else {
      if (target.status === 'left') throw httpError(409, 'INVALID_STATUS', 'Ese miembro ya no forma parte del equipo.');
      // Una invitación pendiente se anula; un miembro pasa a "left".
      patch = { status: 'left', left_at: nowIso(), seat_billable: false, invitation_token_hash: null };
    }
    const updated = await store.update('org_members', target.id, { ...patch, updated_at: nowIso() });
    await seats.sync(req.workspace.orgId);
    await recordAccess({ org_id: req.workspace.orgId, actor_user_id: String(req.authenticatedUserId), action: `org.member_${action}`, resource_type: 'org_member', resource_id: target.id });
    res.json({ member: projectMember(updated, { full: true }) });
  });

  router.post('/members/:memberId/suspend', requireAction('team.manage'), changeStatus('suspend'));
  router.post('/members/:memberId/reactivate', requireAction('team.manage'), changeStatus('reactivate'));
  router.delete('/members/:memberId', requireAction('team.manage'), changeStatus('remove'));

  router.post('/leave', asyncRoute(async (req, res) => {
    const me = req.workspace.member;
    if (me.role === 'titular') throw badRequest('El titular no puede salir de la clínica.', 'OWNER_PROTECTED');
    await store.update('org_members', me.id, { status: 'left', left_at: nowIso(), seat_billable: false, updated_at: nowIso() });
    await seats.sync(req.workspace.orgId);
    await recordAccess({ org_id: req.workspace.orgId, actor_user_id: String(req.authenticatedUserId), action: 'org.member_left', resource_type: 'org_member', resource_id: me.id });
    res.json({ ok: true });
  }));
}

async function assertSupervisor(store, orgId, supervisorId) {
  const sup = await store.get('org_members', String(supervisorId));
  if (!sup || sup.org_id !== orgId || sup.status !== 'active' ||
      !effectivePermissions(sup).includes('clinical.read_assigned')) {
    throw badRequest('El supervisor debe ser un miembro clínico activo de la clínica.');
  }
}
