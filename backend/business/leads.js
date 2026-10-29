// Captación (backlog F4): página pública de la clínica, widget, solicitudes de
// cita (leads), bandeja con asignación y conversión a paciente, y métricas.
//
// Público (sin sesión), en /api/public/org:
//   GET  /:slug          página pública (solo Plus o en prueba, y si está activada)
//   POST /:slug/leads    solicitud de cita (consentimiento, honeypot, límite por IP)
// Privado, en /api/org/:orgId:
//   GET/PUT /public-page                 configuración de la página
//   PUT  /members/me/public-profile      perfil público del profesional
//   GET  /leads, POST /leads, PATCH /leads/:id, POST /leads/:id/assign|convert
//   GET  /leads/metrics
//
// Privacidad: la página pública nunca expone ids internos, emails ni teléfonos
// de los profesionales, y de quien escribe no se guarda la IP en claro.

import crypto from 'node:crypto';
import { asyncRoute, httpError, badRequest, forbidden, notFound } from './errors.js';
import { assertPlus, hasPlus, requireAction } from './workspace.js';
import { isPractitioner } from '../utils/orgPermissions.js';
import {
  LEAD_STATUSES, MANUAL_SOURCES, canTransition, nextRoundRobin, splitName, isPurgeable, leadMetrics
} from '../utils/leads.js';

export const CONSENT_VERSION = 'leads-v1';
export const consentText = (orgName) =>
  `Acepto que ${orgName} trate mis datos para gestionar mi solicitud de cita y contactarme. ` +
  'Responsable: la clínica. Puedes ejercer tus derechos de acceso, rectificación y supresión escribiendo a la clínica.';
const MAX_LEADS_PER_HOUR = 5;

const nowIso = () => new Date().toISOString();
const trimOrNull = (v, max = 300) => {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s ? s.slice(0, max) : null;
};
const isEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
const clientIp = (req) => String(req.ip || req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
/** Referencia pública de un profesional: no revela su id interno. */
export const memberRef = (orgId, memberId) => crypto.createHash('sha256').update(`${orgId}:${memberId}`).digest('hex').slice(0, 12);
const ipHash = (orgId, ip) => crypto.createHash('sha256').update(`${orgId}|${ip}`).digest('hex');

const publicPage = (org) => org.settings?.public_page || {};

function stringList(v, max = 12) {
  if (!Array.isArray(v)) return [];
  return [...new Set(v.map(x => trimOrNull(x, 60)).filter(Boolean))].slice(0, max);
}

async function loadPublicOrg(store, slug) {
  const s = String(slug || '').trim().toLowerCase();
  if (!/^[a-z0-9-]{3,50}$/.test(s)) return null;
  const [org] = await store.list('organizations', { eq: { slug: s }, limit: 1 });
  if (!org || !hasPlus(org) || publicPage(org).enabled !== true) return null;
  return org;
}

async function publicTeam(store, org) {
  const members = await store.list('org_members', { eq: { org_id: org.id, status: 'active' }, limit: 500 });
  return members.filter(m => isPractitioner(m) && m.public_profile?.visible === true);
}

async function eligibleForLeads(store, orgId) {
  const members = await store.list('org_members', { eq: { org_id: orgId, status: 'active' }, limit: 500 });
  return members.filter(m => isPractitioner(m) && m.accepts_leads === true);
}

/** Profesional siguiente en el reparto rotatorio de la clínica. */
async function roundRobinMember(store, orgId) {
  const eligible = await eligibleForLeads(store, orgId);
  if (!eligible.length) return null;
  const ids = eligible.map(m => m.id);
  const recent = await store.list('org_leads', { eq: { org_id: orgId }, order: '-assigned_at', limit: 50 });
  const last = recent.find(l => l.assigned_at && ids.includes(l.assigned_member_id));
  return nextRoundRobin(ids, last?.assigned_member_id || null);
}

const event = (type, by, extra = {}) => ({ at: nowIso(), type, by: by || null, ...extra });

function projectLead(l, names = {}) {
  return {
    id: l.id, name: l.name, email: l.email || null, phone: l.phone || null, reason: l.reason || null,
    modality: l.modality || null, preferences: l.preferences || null, source: l.source, utm: l.utm || {},
    preferred_member_id: l.preferred_member_id || null, preferred_member_name: names[l.preferred_member_id] || null,
    status: l.status, assigned_member_id: l.assigned_member_id || null, assigned_member_name: names[l.assigned_member_id] || null,
    patient_id: l.patient_id || null, consent_at: l.consent_at || null, events: l.events || [],
    created_at: l.created_at, updated_at: l.updated_at || l.created_at
  };
}

// ── Público ─────────────────────────────────────────────────────────────────
export function registerLeadsPublic(router, ctx) {
  const { store } = ctx;

  router.get('/:slug', asyncRoute(async (req, res) => {
    const org = await loadPublicOrg(store, req.params.slug);
    if (!org) throw notFound();
    const p = publicPage(org);
    const team = await publicTeam(store, org);
    res.set('Cache-Control', 'public, max-age=60');
    res.json({
      clinic: {
        name: org.name, slug: org.slug, logo_url: org.logo_url || null,
        headline: p.headline || null, description: p.description || null, specialties: p.specialties || [],
        phone: p.contact_phone || null, email: p.contact_email || null, address: p.address || null, city: p.city || null,
        modalities: p.modalities || ['in_person', 'online']
      },
      team: team.map(m => ({
        ref: memberRef(org.id, m.id),
        name: m.public_profile?.display_name || m.display_name || 'Profesional',
        bio: m.public_profile?.bio || null,
        specialties: m.public_profile?.specialties || [],
        photo_url: m.public_profile?.photo_url || null,
        accepts_leads: m.accepts_leads === true
      })),
      consent: { version: CONSENT_VERSION, text: consentText(org.name) }
    });
  }));

  router.post('/:slug/leads', asyncRoute(async (req, res) => {
    const org = await loadPublicOrg(store, req.params.slug);
    if (!org) throw notFound();
    const b = req.body || {};
    // Honeypot: los bots rellenan el campo oculto. Se responde igual, sin guardar.
    if (trimOrNull(b.website)) return res.status(201).json({ ok: true });
    if (b.consent !== true) throw badRequest('Necesitamos tu consentimiento para tratar tus datos.', 'CONSENT_REQUIRED');
    const name = trimOrNull(b.name, 120);
    if (!name) throw badRequest('Indica tu nombre.');
    const email = trimOrNull(b.email, 200)?.toLowerCase() || null;
    const phone = trimOrNull(b.phone, 30);
    if (email && !isEmail(email)) throw badRequest('El email no es válido.');
    if (phone && (phone.replace(/\D/g, '').length < 9)) throw badRequest('El teléfono no es válido.');
    if (!email && !phone) throw badRequest('Déjanos un email o un teléfono para contactarte.');

    const hash = ipHash(org.id, clientIp(req));
    const since = new Date(Date.now() - 3600 * 1000).toISOString();
    const recent = await store.list('org_leads', { eq: { org_id: org.id, ip_hash: hash }, gte: { created_at: since }, limit: MAX_LEADS_PER_HOUR + 1 });
    if (recent.length >= MAX_LEADS_PER_HOUR) {
      throw httpError(429, 'TOO_MANY_REQUESTS', 'Has enviado varias solicitudes seguidas. Inténtalo de nuevo más tarde o llama a la clínica.');
    }

    let preferred = null;
    if (b.professional_ref) {
      const team = await publicTeam(store, org);
      preferred = team.find(m => memberRef(org.id, m.id) === String(b.professional_ref)) || null;
    }
    let assigned = null;
    if (preferred && preferred.accepts_leads === true) assigned = preferred.id;
    else if (publicPage(org).assignment === 'round_robin') assigned = await roundRobinMember(store, org.id);

    const utm = {};
    for (const k of ['source', 'medium', 'campaign', 'term', 'content']) {
      const v = trimOrNull(b.utm?.[k], 100);
      if (v) utm[k] = v;
    }
    const source = b.embed === true ? 'widget' : 'web';
    const modality = ['in_person', 'online', 'any'].includes(b.modality) ? b.modality : 'any';
    const events = [event('created', null, { source })];
    if (assigned) events.push(event('assigned', null, { to: assigned, auto: true }));
    await store.insert('org_leads', {
      org_id: org.id, name, email, phone, reason: trimOrNull(b.reason, 2000), modality,
      preferences: trimOrNull(b.preferences, 1000), preferred_member_id: preferred?.id || null,
      source, utm, consent_at: nowIso(), consent_version: CONSENT_VERSION,
      status: 'nuevo', assigned_member_id: assigned, assigned_at: assigned ? nowIso() : null,
      events, ip_hash: hash, updated_at: nowIso()
    });
    res.status(201).json({ ok: true });
  }));
}

// ── Privado ─────────────────────────────────────────────────────────────────
export function registerLeadsRoutes(router, ctx) {
  const { store, recordAccess } = ctx;
  const audit = (req, action, extra = {}) => recordAccess({ org_id: req.workspace.orgId, actor_user_id: String(req.authenticatedUserId), action, ...extra });
  const memberNames = async (orgId) => Object.fromEntries((await store.list('org_members', { eq: { org_id: orgId }, limit: 500 }))
    .map(m => [m.id, m.public_profile?.display_name || m.display_name || m.email]));

  const canSeeLeads = (ws) => ws.can('leads.manage') || ws.can('leads.assigned');
  const loadLead = async (req) => {
    const ws = req.workspace;
    if (!canSeeLeads(ws)) throw forbidden();
    assertPlus(req);
    const l = await store.get('org_leads', String(req.params.id || ''));
    if (!l || l.org_id !== ws.orgId) throw notFound('Solicitud no encontrada');
    if (!ws.can('leads.manage') && l.assigned_member_id !== ws.member.id) throw notFound('Solicitud no encontrada');
    return l;
  };

  // Página pública
  router.get('/public-page', asyncRoute(async (req, res) => {
    const { org } = req.workspace;
    res.json({ public_page: publicPage(org), plus: req.workspace.plus, slug: org.slug });
  }));

  router.put('/public-page', requireAction('org.settings'), asyncRoute(async (req, res) => {
    assertPlus(req);
    const b = req.body || {};
    const contactEmail = trimOrNull(b.contact_email, 200);
    if (contactEmail && !isEmail(contactEmail)) throw badRequest('Email de contacto no válido.');
    const page = {
      enabled: b.enabled === true,
      headline: trimOrNull(b.headline, 160),
      description: trimOrNull(b.description, 3000),
      specialties: stringList(b.specialties, 20),
      contact_phone: trimOrNull(b.contact_phone, 30),
      contact_email: contactEmail,
      address: trimOrNull(b.address, 200),
      city: trimOrNull(b.city, 80),
      modalities: (Array.isArray(b.modalities) ? b.modalities : ['in_person', 'online']).filter(m => ['in_person', 'online'].includes(m)),
      assignment: b.assignment === 'round_robin' ? 'round_robin' : 'manual'
    };
    const org = await store.update('organizations', req.workspace.orgId, { settings: { ...(req.workspace.org.settings || {}), public_page: page }, updated_at: nowIso() });
    res.json({ public_page: publicPage(org) });
  }));

  router.put('/members/me/public-profile', asyncRoute(async (req, res) => {
    const me = req.workspace.member;
    if (!isPractitioner(me)) throw forbidden('Solo los profesionales clínicos tienen perfil público.');
    const b = req.body || {};
    const photo = trimOrNull(b.photo_url, 500);
    if (photo && !/^https:\/\//i.test(photo)) throw badRequest('La foto debe ser una URL https.');
    const profile = {
      visible: b.visible === true,
      display_name: trimOrNull(b.display_name, 120),
      bio: trimOrNull(b.bio, 2000),
      specialties: stringList(b.specialties),
      photo_url: photo
    };
    const m = await store.update('org_members', me.id, { public_profile: profile, accepts_leads: b.accepts_leads === true, updated_at: nowIso() });
    res.json({ public_profile: m.public_profile, accepts_leads: m.accepts_leads });
  }));

  // Bandeja
  router.get('/leads', asyncRoute(async (req, res) => {
    const ws = req.workspace;
    if (!canSeeLeads(ws)) throw forbidden();
    assertPlus(req);
    const eq = { org_id: ws.orgId };
    if (req.query.status && LEAD_STATUSES.includes(String(req.query.status))) eq.status = String(req.query.status);
    if (!ws.can('leads.manage')) eq.assigned_member_id = ws.member.id;
    let rows = await store.list('org_leads', { eq, order: '-created_at', limit: 500 });
    if (ws.can('leads.manage')) {
      // Retención: los descartados hace más de 12 meses se borran.
      const stale = rows.filter(l => isPurgeable(l));
      for (const l of stale) await store.remove('org_leads', l.id).catch(() => {});
      if (stale.length) rows = rows.filter(l => !stale.includes(l));
    }
    const names = await memberNames(ws.orgId);
    res.json({ leads: rows.map(l => projectLead(l, names)) });
  }));

  router.get('/leads/metrics', requireAction('leads.manage'), asyncRoute(async (req, res) => {
    assertPlus(req);
    const opts = { eq: { org_id: req.workspace.orgId }, limit: 500 };
    if (req.query.from) opts.gte = { created_at: new Date(String(req.query.from)).toISOString() };
    if (req.query.to) opts.lte = { created_at: new Date(String(req.query.to)).toISOString() };
    const rows = await store.list('org_leads', opts);
    const names = await memberNames(req.workspace.orgId);
    const m = leadMetrics(rows);
    m.by_member = m.by_member.map(x => ({ ...x, member_name: names[x.member_id] || null }));
    res.json(m);
  }));

  router.post('/leads', requireAction('leads.manage'), asyncRoute(async (req, res) => {
    assertPlus(req);
    const b = req.body || {};
    const name = trimOrNull(b.name, 120);
    if (!name) throw badRequest('Indica el nombre.');
    const email = trimOrNull(b.email, 200)?.toLowerCase() || null;
    const phone = trimOrNull(b.phone, 30);
    if (email && !isEmail(email)) throw badRequest('Email no válido.');
    if (!email && !phone) throw badRequest('Indica un email o un teléfono.');
    const source = MANUAL_SOURCES.includes(b.source) ? b.source : 'telefono';
    const lead = await store.insert('org_leads', {
      org_id: req.workspace.orgId, name, email, phone, reason: trimOrNull(b.reason, 2000),
      modality: ['in_person', 'online', 'any'].includes(b.modality) ? b.modality : 'any',
      preferences: trimOrNull(b.preferences, 1000), source, utm: {},
      // Alta manual: el consentimiento lo recoge la clínica por su canal.
      consent_at: b.consent === true ? nowIso() : null, consent_version: b.consent === true ? 'manual' : null,
      status: 'nuevo', events: [event('created', String(req.authenticatedUserId), { source })],
      created_by: String(req.authenticatedUserId), updated_at: nowIso()
    });
    await audit(req, 'leads.created', { resource_type: 'lead', resource_id: lead.id });
    res.status(201).json({ lead: projectLead(lead, await memberNames(req.workspace.orgId)) });
  }));

  router.patch('/leads/:id', asyncRoute(async (req, res) => {
    const ws = req.workspace;
    const l = await loadLead(req);
    const b = req.body || {};
    const patch = { updated_at: nowIso() };
    const events = [...(l.events || [])];
    if (b.status !== undefined && b.status !== l.status) {
      if (!LEAD_STATUSES.includes(b.status) || !canTransition(l.status, b.status)) {
        throw badRequest(`No se puede pasar de "${l.status}" a "${b.status}".`, 'INVALID_TRANSITION');
      }
      patch.status = b.status;
      if (b.status === 'descartado') patch.discarded_at = nowIso();
      if (l.status === 'descartado') patch.discarded_at = null;
      events.push(event('status', String(req.authenticatedUserId), { from: l.status, to: b.status }));
    }
    if (b.note !== undefined && trimOrNull(b.note, 1000)) {
      events.push(event('note', String(req.authenticatedUserId), { note: trimOrNull(b.note, 1000) }));
    }
    if (b.reason !== undefined && ws.can('leads.manage')) patch.reason = trimOrNull(b.reason, 2000);
    patch.events = events.slice(-200);
    const updated = await store.update('org_leads', l.id, patch);
    res.json({ lead: projectLead(updated, await memberNames(ws.orgId)) });
  }));

  router.post('/leads/:id/assign', requireAction('leads.manage'), asyncRoute(async (req, res) => {
    const l = await loadLead(req);
    if (l.status === 'paciente') throw httpError(409, 'LEAD_CONVERTED', 'La solicitud ya es paciente.');
    let to;
    if (req.body?.member_id === 'round_robin') {
      to = await roundRobinMember(store, req.workspace.orgId);
      if (!to) throw badRequest('Ningún profesional acepta solicitudes. Actívalo en su perfil público.');
    } else if (req.body?.member_id) {
      const m = await store.get('org_members', String(req.body.member_id));
      if (!m || m.org_id !== req.workspace.orgId || m.status !== 'active' || !isPractitioner(m)) throw badRequest('Profesional no válido.');
      to = m.id;
    } else {
      to = null;
    }
    const updated = await store.update('org_leads', l.id, {
      assigned_member_id: to, assigned_at: to ? nowIso() : null, updated_at: nowIso(),
      events: [...(l.events || []), event('assigned', String(req.authenticatedUserId), { to })].slice(-200)
    });
    res.json({ lead: projectLead(updated, await memberNames(req.workspace.orgId)) });
  }));

  router.post('/leads/:id/convert', asyncRoute(async (req, res) => {
    const ws = req.workspace;
    const l = await loadLead(req);
    if (l.status === 'paciente' && l.patient_id) throw httpError(409, 'LEAD_CONVERTED', 'La solicitud ya es paciente.');
    if (l.status === 'descartado') throw badRequest('Reabre la solicitud antes de convertirla.', 'INVALID_TRANSITION');
    const { first_name, last_name } = splitName(l.name);
    const assigned = l.assigned_member_id ? [l.assigned_member_id] : [];
    const patient = await store.insert('org_patients', {
      org_id: ws.orgId, first_name, last_name, email: l.email || null, phone: l.phone || null,
      assigned_member_ids: assigned, acquisition_source: 'clinic_lead', lead_id: l.id, status: 'active',
      admin_notes: l.preferences ? `Preferencias: ${l.preferences}` : null,
      created_by: String(req.authenticatedUserId), updated_at: nowIso()
    });
    const updated = await store.update('org_leads', l.id, {
      status: 'paciente', patient_id: patient.id, converted_at: nowIso(), updated_at: nowIso(),
      events: [...(l.events || []), event('converted', String(req.authenticatedUserId), { patient_id: patient.id })].slice(-200)
    });
    await audit(req, 'leads.converted', { resource_type: 'patient', resource_id: patient.id, patient_user_id: patient.id });
    res.status(201).json({ lead: projectLead(updated, await memberNames(ws.orgId)), patient_id: patient.id });
  }));
}
