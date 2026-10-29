// Pacientes, historia clínica, consentimientos, auditoría y bajas con
// reasignación (backlog F2.2, F2.5–F2.8).
//
// Reglas de acceso (R8, R10, plan §1.2/§1.3):
//   - Datos de contacto: patients.contact_all (todos) o contact_assigned (solo
//     los asignados). Un paciente que no ves → 404, no 403.
//   - Historia clínica: clinical.read_all (director), o clinical.read_assigned
//     si el paciente te está asignado o supervisas a quien lo tiene asignado.
//     Recepción, contable, gerente y titular no clínico → 403, y se audita.
//   - Anotaciones privadas: SOLO su autor, siempre. Ni el director, ni el
//     supervisor, ni el acceso de emergencia, ni un superadmin.
//   - Todo contenido clínico se guarda cifrado (fieldCrypto). Sin clave → 503.
//   - Cada lectura de historia clínica (permitida o denegada) deja una fila en
//     access_audit.

import crypto from 'node:crypto';
import { asyncRoute, httpError, badRequest, forbidden, notFound } from './errors.js';
import { requireAction } from './workspace.js';
import { encryptField, decryptField, isEncrypted } from '../utils/fieldCrypto.js';
import { effectivePermissions, isPractitioner, ROLE_LABELS } from '../utils/orgPermissions.js';

const nowIso = () => new Date().toISOString();
const trimOrNull = (v, max = 500) => {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s ? s.slice(0, max) : null;
};
const clientIp = (req) => String(req.ip || req.headers['x-forwarded-for'] || '').split(',')[0].trim() || null;

export const PATIENT_STATUSES = ['active', 'discharged', 'archived'];
export const ACQUISITION_SOURCES = ['own', 'clinic_lead', 'referral', 'other'];
export const CONSENT_METHODS = ['papel_firmado', 'aceptacion_presencial'];
const MAX_NOTE = 50_000;

// ── Ámbito de pacientes ─────────────────────────────────────────────────────
export function patientAccess(ws) {
  if (ws.can('patients.contact_all')) return { all: true, memberId: ws.member.id };
  if (ws.can('patients.contact_assigned')) return { all: false, memberId: ws.member.id };
  return null;
}

export function canSeePatient(ws, patient) {
  const a = patientAccess(ws);
  if (!a || !patient) return false;
  return a.all || (patient.assigned_member_ids || []).includes(a.memberId);
}

export const patientDisplayName = (p) => [p.first_name, p.last_name].filter(Boolean).join(' ').trim() || 'Paciente';

function projectPatient(p, memberNames = {}) {
  return {
    id: p.id,
    first_name: p.first_name,
    last_name: p.last_name || null,
    name: patientDisplayName(p),
    email: p.email || null,
    phone: p.phone || null,
    birth_date: p.birth_date || null,
    tax_id: p.tax_id || null,
    address: p.address || null,
    admin_notes: p.admin_notes || null,
    default_price: p.default_price ?? null,
    status: p.status,
    acquisition_source: p.acquisition_source,
    lead_id: p.lead_id || null,
    assigned_member_ids: p.assigned_member_ids || [],
    assigned_members: (p.assigned_member_ids || []).map(id => ({ id, name: memberNames[id] || null })),
    created_at: p.created_at
  };
}

async function memberNameMap(store, orgId) {
  const members = await store.list('org_members', { eq: { org_id: orgId }, limit: 500 });
  const map = {};
  for (const m of members) map[m.id] = m.display_name || m.email || ROLE_LABELS[m.role];
  return { map, members };
}

/** ¿Puede este miembro leer (y escribir) la historia clínica del paciente? */
export async function hasClinicalAccess(store, ws, patient) {
  if (!patient) return false;
  if (ws.can('clinical.read_all')) return true;
  if (!ws.can('clinical.read_assigned')) return false;
  const assigned = patient.assigned_member_ids || [];
  if (assigned.includes(ws.member.id)) return true;
  // Supervisor de un miembro en prácticas que tiene asignado al paciente.
  for (const id of assigned) {
    const m = await store.get('org_members', id);
    if (m && m.org_id === ws.orgId && m.status === 'active' && m.supervisor_member_id === ws.member.id) return true;
  }
  return false;
}

const noteAad = (id) => `org_clinical_notes:${id}`;

/** Descifra una nota. Si una nota está dañada no tumba el listado entero. */
function safeDecrypt(n) {
  try {
    return { content: decryptField(n.content_enc, { aad: noteAad(n.id) }), unreadable: false };
  } catch (err) {
    if (err?.code === 'ENCRYPTION_NOT_CONFIGURED') throw err; // → 503
    return { content: null, unreadable: true };
  }
}

/** Valida el texto de una nota. Nunca se acepta algo con forma de valor cifrado. */
function noteContent(raw) {
  const content = typeof raw === 'string' ? raw.trim() : '';
  if (!content) throw badRequest('La nota está vacía.');
  if (content.length > MAX_NOTE) throw badRequest('La nota es demasiado larga.');
  if (isEncrypted(content)) throw badRequest('El texto de la nota no es válido.');
  return content;
}

function projectNote(n, { memberNames, meId }) {
  const { content, unreadable } = safeDecrypt(n);
  return {
    id: n.id,
    patient_id: n.patient_id,
    author_member_id: n.author_member_id,
    author_name: memberNames[n.author_member_id] || null,
    appointment_id: n.appointment_id || null,
    visibility: n.visibility,
    content,
    unreadable,
    amends_note_id: n.amends_note_id || null,
    is_mine: n.author_member_id === meId,
    created_at: n.created_at,
    updated_at: n.updated_at || n.created_at
  };
}

async function validateAssignees(store, orgId, ids) {
  if (!Array.isArray(ids)) throw badRequest('member_ids debe ser una lista.');
  const unique = [...new Set(ids.map(String))];
  if (unique.length > 10) throw badRequest('Como máximo 10 profesionales por paciente.');
  for (const id of unique) {
    const m = await store.get('org_members', id);
    if (!m || m.org_id !== orgId || m.status !== 'active' || !isPractitioner(m)) {
      throw badRequest('Solo se puede asignar a profesionales clínicos activos de la clínica.');
    }
  }
  return unique;
}

function patientFields(body, { partial }) {
  const out = {};
  const set = (k, v) => { if (v !== undefined) out[k] = v; };
  if (!partial || body.first_name !== undefined) {
    const fn = trimOrNull(body.first_name, 100);
    if (!fn) throw badRequest('El nombre del paciente es obligatorio.');
    out.first_name = fn;
  }
  set('last_name', body.last_name !== undefined ? trimOrNull(body.last_name, 150) : undefined);
  if (body.email !== undefined) {
    const e = trimOrNull(body.email, 200)?.toLowerCase() || null;
    if (e && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) throw badRequest('Email no válido.');
    out.email = e;
  }
  set('phone', body.phone !== undefined ? trimOrNull(body.phone, 40) : undefined);
  if (body.birth_date !== undefined) {
    const d = trimOrNull(body.birth_date, 10);
    if (d && !/^\d{4}-\d{2}-\d{2}$/.test(d)) throw badRequest('Fecha de nacimiento no válida (AAAA-MM-DD).');
    out.birth_date = d;
  }
  set('tax_id', body.tax_id !== undefined ? trimOrNull(body.tax_id, 20)?.toUpperCase() || null : undefined);
  set('address', body.address !== undefined ? trimOrNull(body.address, 300) : undefined);
  set('admin_notes', body.admin_notes !== undefined ? trimOrNull(body.admin_notes, 2000) : undefined);
  if (body.default_price !== undefined) {
    // Precio propio del paciente (tarifa reducida…). Vacío = tarifa de la clínica.
    if (body.default_price === null || body.default_price === '') out.default_price = null;
    else {
      const n = Number(body.default_price);
      if (!Number.isFinite(n) || n < 0 || n > 100000) throw badRequest('Precio no válido.');
      out.default_price = Math.round(n * 100) / 100;
    }
  }
  if (body.status !== undefined) {
    if (!PATIENT_STATUSES.includes(body.status)) throw badRequest('Estado no válido.');
    out.status = body.status;
  }
  if (body.acquisition_source !== undefined) {
    if (!ACQUISITION_SOURCES.includes(body.acquisition_source)) throw badRequest('Origen no válido.');
    out.acquisition_source = body.acquisition_source;
  }
  return out;
}

export function registerClinicalRoutes(router, ctx) {
  const { store, recordAccess } = ctx;
  // En access_audit, patient_user_id guarda el id del paciente afectado (en
  // Business es org_patients.id): así el historial de accesos de un paciente
  // incluye lecturas, escrituras, consentimientos y accesos de emergencia.
  const audit = (req, action, extra = {}) => recordAccess({
    org_id: req.workspace.orgId, actor_user_id: String(req.authenticatedUserId), action, ip: clientIp(req), ...extra
  });

  /** Carga un paciente visible para quien llama; si no, 404. */
  const loadPatient = async (req) => {
    const ws = req.workspace;
    if (!patientAccess(ws)) throw forbidden();
    const p = await store.get('org_patients', String(req.params.patientId || ''));
    if (!p || p.org_id !== ws.orgId || !canSeePatient(ws, p)) throw notFound('Paciente no encontrado');
    return p;
  };

  // ── Pacientes ──
  router.get('/patients', asyncRoute(async (req, res) => {
    const ws = req.workspace;
    const access = patientAccess(ws);
    if (!access) throw forbidden();
    const opts = { eq: { org_id: ws.orgId }, order: 'first_name', limit: 500 };
    if (!access.all) opts.contains = { assigned_member_ids: ws.member.id };
    const status = req.query.status ? String(req.query.status) : null;
    if (status && status !== 'all') {
      if (!PATIENT_STATUSES.includes(status)) throw badRequest('Estado no válido.');
      opts.eq.status = status;
    }
    let rows = await store.list('org_patients', opts);
    if (!status) rows = rows.filter(p => p.status !== 'archived');
    const q = String(req.query.q || '').trim().toLowerCase();
    if (q) rows = rows.filter(p => [p.first_name, p.last_name, p.email, p.phone].filter(Boolean).join(' ').toLowerCase().includes(q));
    const { map } = await memberNameMap(store, ws.orgId);
    res.json({ patients: rows.map(p => projectPatient(p, map)) });
  }));

  router.post('/patients', asyncRoute(async (req, res) => {
    const ws = req.workspace;
    const access = patientAccess(ws);
    if (!access) throw forbidden();
    const body = req.body || {};
    const fields = patientFields(body, { partial: false });
    let assigned = [];
    if (body.assigned_member_ids !== undefined && access.all) {
      assigned = await validateAssignees(store, ws.orgId, body.assigned_member_ids);
    } else if (!access.all) {
      // Un psicólogo crea pacientes para sí mismo.
      assigned = [ws.member.id];
    }
    const p = await store.insert('org_patients', {
      org_id: ws.orgId, status: 'active', acquisition_source: 'own', ...fields,
      assigned_member_ids: assigned, created_by: String(req.authenticatedUserId), updated_at: nowIso()
    });
    await audit(req, 'patient.created', { resource_type: 'patient', resource_id: p.id, patient_user_id: p.id });
    const { map } = await memberNameMap(store, ws.orgId);
    res.status(201).json({ patient: projectPatient(p, map) });
  }));

  router.get('/patients/:patientId', asyncRoute(async (req, res) => {
    const p = await loadPatient(req);
    const { map } = await memberNameMap(store, req.workspace.orgId);
    res.json({
      patient: projectPatient(p, map),
      clinical_access: await hasClinicalAccess(store, req.workspace, p),
      can_break_glass: req.workspace.can('clinical.break_glass')
    });
  }));

  router.patch('/patients/:patientId', asyncRoute(async (req, res) => {
    const p = await loadPatient(req);
    const fields = patientFields(req.body || {}, { partial: true });
    const updated = await store.update('org_patients', p.id, { ...fields, updated_at: nowIso() });
    await audit(req, 'patient.updated', { resource_type: 'patient', resource_id: p.id, patient_user_id: p.id });
    const { map } = await memberNameMap(store, req.workspace.orgId);
    res.json({ patient: projectPatient(updated, map) });
  }));

  router.put('/patients/:patientId/assignments', requireAction('patients.contact_all'), asyncRoute(async (req, res) => {
    const p = await loadPatient(req);
    const ids = await validateAssignees(store, req.workspace.orgId, req.body?.member_ids);
    const updated = await store.update('org_patients', p.id, { assigned_member_ids: ids, updated_at: nowIso() });
    await audit(req, 'patient.assigned', { resource_type: 'patient', resource_id: p.id, patient_user_id: p.id });
    const { map } = await memberNameMap(store, req.workspace.orgId);
    res.json({ patient: projectPatient(updated, map) });
  }));

  // ── Historia clínica ──
  router.get('/patients/:patientId/notes', asyncRoute(async (req, res) => {
    const ws = req.workspace;
    // Para la historia el ámbito es el clínico, no el de contacto: el
    // supervisor puede no tener asignado al paciente.
    const p = await store.get('org_patients', String(req.params.patientId || ''));
    if (!p || p.org_id !== ws.orgId) throw notFound('Paciente no encontrado');
    if (!(await hasClinicalAccess(store, ws, p))) {
      await audit(req, 'clinical.read.denied', { resource_type: 'patient', resource_id: p.id, patient_user_id: p.id });
      // Quien ni siquiera ve al paciente recibe 404 (no se revela que existe).
      if (!canSeePatient(ws, p)) throw notFound('Paciente no encontrado');
      throw forbidden('No tienes acceso a la historia clínica de este paciente.');
    }
    const rows = await store.list('org_clinical_notes', { eq: { org_id: ws.orgId, patient_id: p.id }, order: 'created_at', limit: 500 });
    const visible = rows.filter(n => n.visibility === 'clinical_record' || n.author_member_id === ws.member.id);
    const { map } = await memberNameMap(store, ws.orgId);
    const notes = visible.map(n => projectNote(n, { memberNames: map, meId: ws.member.id }));
    await audit(req, 'clinical.read', { resource_type: 'patient', resource_id: p.id, patient_user_id: p.id });
    res.json({ notes });
  }));

  router.post('/patients/:patientId/notes', asyncRoute(async (req, res) => {
    const ws = req.workspace;
    const p = await store.get('org_patients', String(req.params.patientId || ''));
    if (!p || p.org_id !== ws.orgId) throw notFound('Paciente no encontrado');
    if (!isPractitioner(ws.member) || !(await hasClinicalAccess(store, ws, p))) {
      await audit(req, 'clinical.write.denied', { resource_type: 'patient', resource_id: p.id, patient_user_id: p.id });
      throw forbidden('No puedes escribir en la historia clínica de este paciente.');
    }
    const body = req.body || {};
    const visibility = body.visibility || 'clinical_record';
    if (!['clinical_record', 'private_annotation'].includes(visibility)) throw badRequest('Tipo de nota no válido.');
    const content = noteContent(body.content);
    let appointmentId = null;
    if (body.appointment_id) {
      const a = await store.get('org_appointments', String(body.appointment_id));
      if (!a || a.org_id !== ws.orgId || a.patient_id !== p.id) throw badRequest('La cita no corresponde a este paciente.');
      appointmentId = a.id;
    }
    let amends = null;
    if (body.amends_note_id) {
      const prev = await store.get('org_clinical_notes', String(body.amends_note_id));
      if (!prev || prev.org_id !== ws.orgId || prev.patient_id !== p.id || prev.visibility !== 'clinical_record' || visibility !== 'clinical_record') {
        throw badRequest('Solo se puede corregir una nota de historia clínica de este paciente.');
      }
      amends = prev.id;
    }
    const id = crypto.randomUUID();
    const contentEnc = encryptField(content, { aad: noteAad(id) });
    const note = await store.insert('org_clinical_notes', {
      id, org_id: ws.orgId, patient_id: p.id, author_member_id: ws.member.id, appointment_id: appointmentId,
      visibility, content_enc: contentEnc, amends_note_id: amends, updated_at: nowIso()
    });
    await audit(req, visibility === 'clinical_record' ? 'clinical.write' : 'clinical.private_write', { resource_type: 'clinical_note', resource_id: note.id, patient_user_id: p.id });
    const { map } = await memberNameMap(store, ws.orgId);
    res.status(201).json({ note: projectNote(note, { memberNames: map, meId: ws.member.id }) });
  }));

  const loadOwnPrivateNote = async (req) => {
    const ws = req.workspace;
    const n = await store.get('org_clinical_notes', String(req.params.noteId || ''));
    if (!n || n.org_id !== ws.orgId || n.patient_id !== String(req.params.patientId)) throw notFound('Nota no encontrada');
    if (n.visibility === 'clinical_record') {
      throw httpError(409, 'NOTE_IMMUTABLE', 'Las notas de historia clínica no se editan ni se borran: añade una corrección.');
    }
    if (n.author_member_id !== ws.member.id) throw notFound('Nota no encontrada');
    return n;
  };

  router.patch('/patients/:patientId/notes/:noteId', asyncRoute(async (req, res) => {
    const n = await loadOwnPrivateNote(req);
    const content = noteContent(req.body?.content);
    const updated = await store.update('org_clinical_notes', n.id, { content_enc: encryptField(content, { aad: noteAad(n.id) }), updated_at: nowIso() });
    const { map } = await memberNameMap(store, req.workspace.orgId);
    res.json({ note: projectNote(updated, { memberNames: map, meId: req.workspace.member.id }) });
  }));

  router.delete('/patients/:patientId/notes/:noteId', asyncRoute(async (req, res) => {
    const n = await loadOwnPrivateNote(req);
    await store.remove('org_clinical_notes', n.id);
    res.json({ ok: true });
  }));

  // Acceso de emergencia del titular: solo historia clínica, con motivo y auditado.
  router.post('/patients/:patientId/break-glass', requireAction('clinical.break_glass'), asyncRoute(async (req, res) => {
    const ws = req.workspace;
    const p = await store.get('org_patients', String(req.params.patientId || ''));
    if (!p || p.org_id !== ws.orgId) throw notFound('Paciente no encontrado');
    const justification = String(req.body?.justification || '').trim();
    if (justification.length < 20) throw badRequest('Explica el motivo del acceso (mínimo 20 caracteres).', 'JUSTIFICATION_REQUIRED');
    const rows = await store.list('org_clinical_notes', { eq: { org_id: ws.orgId, patient_id: p.id, visibility: 'clinical_record' }, order: 'created_at', limit: 500 });
    const { map } = await memberNameMap(store, ws.orgId);
    const notes = rows.filter(n => n.visibility === 'clinical_record').map(n => projectNote(n, { memberNames: map, meId: ws.member.id }));
    await audit(req, 'clinical.break_glass', { resource_type: 'patient', resource_id: p.id, patient_user_id: p.id, justification: justification.slice(0, 500) });
    res.json({ notes });
  }));

  // ── Consentimientos ──
  const canManageConsents = (ws) => ws.can('team.manage') || ws.can('clinical.read_all');

  router.get('/consent-templates', asyncRoute(async (req, res) => {
    const ws = req.workspace;
    if (!patientAccess(ws) && !canManageConsents(ws)) throw forbidden();
    const rows = await store.list('org_consent_templates', { eq: { org_id: ws.orgId }, order: 'name', limit: 200 });
    res.json({ templates: rows.filter(t => t.active !== false || canManageConsents(ws)) });
  }));

  router.post('/consent-templates', asyncRoute(async (req, res) => {
    if (!canManageConsents(req.workspace)) throw forbidden();
    const name = trimOrNull(req.body?.name, 150);
    const content = typeof req.body?.content === 'string' ? req.body.content.trim() : '';
    if (!name || !content) throw badRequest('El nombre y el texto son obligatorios.');
    const t = await store.insert('org_consent_templates', {
      org_id: req.workspace.orgId, name, content: content.slice(0, 100_000), version: 1, active: true,
      created_by: String(req.authenticatedUserId), updated_at: nowIso()
    });
    res.status(201).json({ template: t });
  }));

  router.patch('/consent-templates/:id', asyncRoute(async (req, res) => {
    if (!canManageConsents(req.workspace)) throw forbidden();
    const t = await store.get('org_consent_templates', String(req.params.id));
    if (!t || t.org_id !== req.workspace.orgId) throw notFound('Plantilla no encontrada');
    const patch = { updated_at: nowIso() };
    if (req.body?.name !== undefined) patch.name = trimOrNull(req.body.name, 150) || t.name;
    if (typeof req.body?.content === 'string' && req.body.content.trim() !== t.content) {
      patch.content = req.body.content.trim().slice(0, 100_000);
      patch.version = (t.version || 1) + 1; // los consentimientos ya firmados guardan su copia
    }
    if (req.body?.active !== undefined) patch.active = req.body.active === true;
    res.json({ template: await store.update('org_consent_templates', t.id, patch) });
  }));

  router.get('/patients/:patientId/consents', asyncRoute(async (req, res) => {
    const p = await loadPatient(req);
    const rows = await store.list('org_patient_consents', { eq: { org_id: req.workspace.orgId, patient_id: p.id }, order: '-signed_at', limit: 200 });
    res.json({ consents: rows });
  }));

  router.post('/patients/:patientId/consents', asyncRoute(async (req, res) => {
    const p = await loadPatient(req);
    const method = req.body?.method;
    if (!CONSENT_METHODS.includes(method)) throw badRequest('Indica cómo se ha firmado: papel_firmado o aceptacion_presencial.');
    const t = await store.get('org_consent_templates', String(req.body?.template_id || ''));
    if (!t || t.org_id !== req.workspace.orgId || t.active === false) throw badRequest('Plantilla de consentimiento no encontrada.');
    const c = await store.insert('org_patient_consents', {
      org_id: req.workspace.orgId, patient_id: p.id, template_id: t.id, template_name: t.name,
      template_version: t.version || 1, content_snapshot: t.content,
      content_sha256: crypto.createHash('sha256').update(t.content, 'utf8').digest('hex'),
      method, signed_at: nowIso(), registered_by: req.workspace.member.id
    });
    await audit(req, 'patient.consent_registered', { resource_type: 'patient', resource_id: p.id, patient_user_id: p.id });
    res.status(201).json({ consent: c });
  }));

  // ── Auditoría ──
  router.get('/audit', requireAction('audit.view'), asyncRoute(async (req, res) => {
    const ws = req.workspace;
    const opts = { eq: { org_id: ws.orgId }, order: '-at', limit: Math.min(Number(req.query.limit) || 200, 500) };
    if (req.query.patientId) opts.eq.patient_user_id = String(req.query.patientId);
    if (req.query.from) opts.gte = { at: new Date(String(req.query.from)).toISOString() };
    if (req.query.to) opts.lte = { at: new Date(String(req.query.to)).toISOString() };
    const rows = await store.list('access_audit', opts);
    const { members } = await memberNameMap(store, ws.orgId);
    const byUser = {};
    for (const m of members) if (m.user_id) byUser[m.user_id] = m.display_name || m.email;
    res.json({
      entries: rows.map(e => ({
        id: e.id, at: e.at, action: e.action, actor_user_id: e.actor_user_id, actor_name: byUser[e.actor_user_id] || null,
        resource_type: e.resource_type, resource_id: e.resource_id, patient_id: e.patient_user_id || null, justification: e.justification || null
      }))
    });
  }));

  // ── Baja de un profesional con reasignación de pacientes y citas ──
  router.post('/members/:memberId/offboard', requireAction('team.manage'), asyncRoute(async (req, res) => {
    const ws = req.workspace;
    const target = await store.get('org_members', String(req.params.memberId));
    if (!target || target.org_id !== ws.orgId) throw notFound('Miembro no encontrado');
    if (target.role === 'titular') throw badRequest('No se puede dar de baja al titular.', 'OWNER_PROTECTED');
    if (target.id === ws.member.id) throw badRequest('No puedes darte de baja a ti mismo.');
    if (target.status === 'left') throw httpError(409, 'INVALID_STATUS', 'Ese miembro ya no forma parte del equipo.');
    const reassign = req.body?.reassign && typeof req.body.reassign === 'object' ? req.body.reassign : {};
    for (const to of new Set(Object.values(reassign).filter(Boolean))) {
      if (to === target.id) throw badRequest('No se puede reasignar al mismo profesional.');
      await validateAssignees(store, ws.orgId, [to]);
    }
    const patients = await store.list('org_patients', { eq: { org_id: ws.orgId }, contains: { assigned_member_ids: target.id }, limit: 500 });
    let reassigned = 0;
    for (const p of patients) {
      const to = reassign[p.id] ? String(reassign[p.id]) : null;
      const next = (p.assigned_member_ids || []).filter(id => id !== target.id);
      if (to && !next.includes(to)) next.push(to);
      await store.update('org_patients', p.id, { assigned_member_ids: next, updated_at: nowIso() });
      if (to) reassigned++;
    }
    const future = await store.list('org_appointments', { eq: { member_id: target.id, status: 'scheduled' }, gte: { starts_at: nowIso() }, limit: 500 });
    let moved = 0;
    let cancelled = 0;
    for (const a of future) {
      const to = a.patient_id && reassign[a.patient_id] ? String(reassign[a.patient_id]) : null;
      if (to) {
        const clash = await store.list('org_appointments', { eq: { member_id: to, status: 'scheduled' }, lte: { starts_at: a.ends_at }, gte: { ends_at: a.starts_at }, limit: 50 });
        const realClash = clash.some(b => new Date(b.starts_at) < new Date(a.ends_at) && new Date(a.starts_at) < new Date(b.ends_at));
        if (!realClash) {
          await store.update('org_appointments', a.id, { member_id: to, updated_at: nowIso() });
          moved++;
          continue;
        }
      }
      await store.update('org_appointments', a.id, { status: 'cancelled', updated_at: nowIso() });
      cancelled++;
    }
    await store.update('org_members', target.id, { status: 'left', left_at: nowIso(), seat_billable: false, invitation_token_hash: null, updated_at: nowIso() });
    await ctx.seats.sync(ws.orgId);
    await audit(req, 'org.member_offboarded', { resource_type: 'org_member', resource_id: target.id });
    res.json({ ok: true, patients: patients.length, reassigned, appointments_moved: moved, appointments_cancelled: cancelled });
  }));
}

// Re-exportado para tests.
export { effectivePermissions };
