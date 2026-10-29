// Conocimiento y panel del dueño (backlog F5): biblioteca, cursos y horas de
// formación, registro de supervisión (notas cifradas), asistente IA sobre la
// biblioteca (Plus) y KPIs de la clínica.

import crypto from 'node:crypto';
import { asyncRoute, httpError, badRequest, forbidden, notFound } from './errors.js';
import { assertPlus, requireAction } from './workspace.js';
import { encryptField, decryptField, isEncrypted } from '../utils/fieldCrypto.js';
import { isPractitioner } from '../utils/orgPermissions.js';
import { rankLibrary, buildLibraryPrompt } from '../utils/knowledge.js';
import { computeDashboard } from '../utils/dashboard.js';
import { periodRange } from '../utils/settlements.js';

const KINDS = ['protocolo', 'material', 'plantilla', 'enlace'];
const AI_LIMIT_PER_HOUR = 20;
const nowIso = () => new Date().toISOString();
const trimOrNull = (v, max = 300) => {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s ? s.slice(0, max) : null;
};
const tagList = (v) => (Array.isArray(v) ? [...new Set(v.map(x => trimOrNull(x, 40)).filter(Boolean))].slice(0, 15) : []);
const httpsOrNull = (v) => {
  const u = trimOrNull(v, 500);
  if (u && !/^https:\/\//i.test(u)) throw badRequest('El enlace debe empezar por https://');
  return u;
};
const supAad = (id) => `org_supervision_logs:${id}`;

export function registerKnowledgeRoutes(router, ctx) {
  const { store, recordAccess } = ctx;
  const canConsume = (ws) => ws.can('library.consume') || ws.can('library.manage');
  const loadIn = async (table, req, id, label) => {
    const row = id ? await store.get(table, String(id)) : null;
    if (!row || row.org_id !== req.workspace.orgId) throw notFound(`${label} no encontrado`);
    return row;
  };
  // Límite de preguntas a la IA por miembro (por instancia; suficiente para el coste).
  const aiCalls = new Map();
  const allowAi = (memberId) => {
    const now = Date.now();
    const recent = (aiCalls.get(memberId) || []).filter(t => now - t < 3600 * 1000);
    if (recent.length >= AI_LIMIT_PER_HOUR) return false;
    recent.push(now);
    aiCalls.set(memberId, recent);
    return true;
  };

  // ── Biblioteca ──
  router.get('/library', asyncRoute(async (req, res) => {
    const ws = req.workspace;
    if (!canConsume(ws)) throw forbidden();
    const rows = await store.list('org_library_items', { eq: { org_id: ws.orgId }, order: 'title', limit: 500 });
    res.json({ items: ws.can('library.manage') ? rows : rows.filter(r => r.active !== false) });
  }));

  const itemFields = (b, partial) => {
    const out = {};
    if (!partial || b.title !== undefined) {
      out.title = trimOrNull(b.title, 200);
      if (!out.title) throw badRequest('El título es obligatorio.');
    }
    if (b.kind !== undefined || !partial) {
      const k = b.kind || 'protocolo';
      if (!KINDS.includes(k)) throw badRequest('Tipo no válido.');
      out.kind = k;
    }
    if (b.body !== undefined) out.body = typeof b.body === 'string' ? b.body.slice(0, 50_000) : null;
    if (b.url !== undefined) out.url = httpsOrNull(b.url);
    if (b.tags !== undefined) out.tags = tagList(b.tags);
    if (b.active !== undefined) out.active = b.active !== false;
    return out;
  };

  router.post('/library', requireAction('library.manage'), asyncRoute(async (req, res) => {
    const item = await store.insert('org_library_items', { org_id: req.workspace.orgId, tags: [], active: true, ...itemFields(req.body || {}, false), created_by: String(req.authenticatedUserId), updated_at: nowIso() });
    res.status(201).json({ item });
  }));
  router.patch('/library/:id', requireAction('library.manage'), asyncRoute(async (req, res) => {
    const it = await loadIn('org_library_items', req, req.params.id, 'Elemento');
    res.json({ item: await store.update('org_library_items', it.id, { ...itemFields(req.body || {}, true), updated_at: nowIso() }) });
  }));
  router.delete('/library/:id', requireAction('library.manage'), asyncRoute(async (req, res) => {
    const it = await loadIn('org_library_items', req, req.params.id, 'Elemento');
    await store.remove('org_library_items', it.id);
    res.json({ ok: true });
  }));

  // ── Asistente IA sobre la biblioteca (Plus) ──
  router.post('/library/ask', asyncRoute(async (req, res) => {
    const ws = req.workspace;
    if (!canConsume(ws)) throw forbidden();
    assertPlus(req);
    const question = trimOrNull(req.body?.question, 2000);
    if (!question) throw badRequest('Escribe tu pregunta.');
    const askAI = ctx.deps?.askAI;
    if (typeof askAI !== 'function') throw httpError(503, 'AI_NOT_CONFIGURED', 'El asistente de IA no está disponible.');
    if (!allowAi(ws.member.id)) throw httpError(429, 'TOO_MANY_REQUESTS', 'Has hecho muchas preguntas en la última hora. Inténtalo más tarde.');
    const items = await store.list('org_library_items', { eq: { org_id: ws.orgId, active: true }, limit: 500 });
    const top = rankLibrary(items, question, 4);
    const sources = top.map((it, i) => ({ n: i + 1, id: it.id, title: it.title, kind: it.kind }));
    await recordAccess({ org_id: ws.orgId, actor_user_id: String(req.authenticatedUserId), action: 'library.asked', resource_type: 'library', resource_id: String(top.length) });
    if (!top.length) {
      return res.json({ answer: 'No he encontrado nada en la biblioteca de la clínica sobre esto. Prueba con otras palabras o consulta a la dirección clínica.', sources: [] });
    }
    const prompt = buildLibraryPrompt(question, top, ws.org.name);
    let answer;
    try {
      answer = String(await askAI({ prompt }) || '').trim();
    } catch {
      throw httpError(502, 'AI_ERROR', 'El asistente no ha podido responder ahora mismo.');
    }
    res.json({ answer: answer || 'Sin respuesta.', sources });
  }));

  // ── Cursos ──
  const courseView = async (req, courses) => {
    const ws = req.workspace;
    const modules = await store.list('org_course_modules', { eq: { org_id: ws.orgId }, order: 'position', limit: 500 });
    const mine = await store.list('org_course_progress', { eq: { org_id: ws.orgId, member_id: ws.member.id }, limit: 500 });
    const done = new Set(mine.map(p => p.module_id));
    return courses.map(c => {
      const ms = modules.filter(m => m.course_id === c.id);
      return {
        ...c,
        modules: ms.map(m => ({ ...m, completed: done.has(m.id) })),
        total_minutes: ms.reduce((s, m) => s + (m.minutes || 0), 0),
        my_completed: ms.filter(m => done.has(m.id)).length,
        required: (c.required_for || []).includes(ws.member.role)
      };
    });
  };

  router.get('/courses', asyncRoute(async (req, res) => {
    const ws = req.workspace;
    if (!canConsume(ws)) throw forbidden();
    const rows = await store.list('org_courses', { eq: { org_id: ws.orgId }, order: 'created_at', limit: 200 });
    res.json({ courses: await courseView(req, ws.can('library.manage') ? rows : rows.filter(c => c.active !== false)) });
  }));

  router.post('/courses', requireAction('library.manage'), asyncRoute(async (req, res) => {
    const title = trimOrNull(req.body?.title, 200);
    if (!title) throw badRequest('El título es obligatorio.');
    const course = await store.insert('org_courses', {
      org_id: req.workspace.orgId, title, description: trimOrNull(req.body?.description, 3000),
      required_for: tagList(req.body?.required_for), active: true, created_by: String(req.authenticatedUserId), updated_at: nowIso()
    });
    res.status(201).json({ course });
  }));

  router.patch('/courses/:id', requireAction('library.manage'), asyncRoute(async (req, res) => {
    const c = await loadIn('org_courses', req, req.params.id, 'Curso');
    const patch = { updated_at: nowIso() };
    if (req.body?.title !== undefined) patch.title = trimOrNull(req.body.title, 200) || c.title;
    if (req.body?.description !== undefined) patch.description = trimOrNull(req.body.description, 3000);
    if (req.body?.required_for !== undefined) patch.required_for = tagList(req.body.required_for);
    if (req.body?.active !== undefined) patch.active = req.body.active !== false;
    res.json({ course: await store.update('org_courses', c.id, patch) });
  }));

  router.post('/courses/:id/modules', requireAction('library.manage'), asyncRoute(async (req, res) => {
    const c = await loadIn('org_courses', req, req.params.id, 'Curso');
    const title = trimOrNull(req.body?.title, 200);
    if (!title) throw badRequest('El título del módulo es obligatorio.');
    const minutes = Number(req.body?.minutes ?? 30);
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 1440) throw badRequest('Duración no válida (minutos).');
    const existing = await store.list('org_course_modules', { eq: { course_id: c.id }, limit: 500 });
    const mod = await store.insert('org_course_modules', {
      org_id: req.workspace.orgId, course_id: c.id, title, body: typeof req.body?.body === 'string' ? req.body.body.slice(0, 50_000) : null,
      url: httpsOrNull(req.body?.url), minutes, position: existing.length, updated_at: nowIso()
    });
    res.status(201).json({ module: mod });
  }));

  router.delete('/courses/:id/modules/:mid', requireAction('library.manage'), asyncRoute(async (req, res) => {
    const m = await loadIn('org_course_modules', req, req.params.mid, 'Módulo');
    if (m.course_id !== String(req.params.id)) throw notFound('Módulo no encontrado');
    const done = await store.list('org_course_progress', { eq: { module_id: m.id }, limit: 1 });
    if (done.length) throw httpError(409, 'MODULE_HAS_PROGRESS', 'Alguien ya completó este módulo: desactiva el curso en lugar de borrarlo.');
    await store.remove('org_course_modules', m.id);
    res.json({ ok: true });
  }));

  router.post('/courses/:id/modules/:mid/complete', asyncRoute(async (req, res) => {
    const ws = req.workspace;
    if (!canConsume(ws)) throw forbidden();
    const m = await loadIn('org_course_modules', req, req.params.mid, 'Módulo');
    if (m.course_id !== String(req.params.id)) throw notFound('Módulo no encontrado');
    const [prev] = await store.list('org_course_progress', { eq: { member_id: ws.member.id, module_id: m.id }, limit: 1 });
    if (prev) return res.json({ progress: prev });
    try {
      const p = await store.insert('org_course_progress', { org_id: ws.orgId, course_id: m.course_id, module_id: m.id, member_id: ws.member.id, minutes: m.minutes, completed_at: nowIso() });
      return res.status(201).json({ progress: p });
    } catch (err) {
      if (err?.code !== 'UNIQUE_VIOLATION') throw err;
      const [again] = await store.list('org_course_progress', { eq: { member_id: ws.member.id, module_id: m.id }, limit: 1 });
      return res.json({ progress: again });
    }
  }));

  // Horas de formación y de supervisión por miembro.
  router.get('/training/hours', asyncRoute(async (req, res) => {
    const ws = req.workspace;
    if (!canConsume(ws)) throw forbidden();
    const all = ws.can('library.manage');
    const progress = await store.list('org_course_progress', { eq: all ? { org_id: ws.orgId } : { org_id: ws.orgId, member_id: ws.member.id }, limit: 500 });
    const sup = await store.list('org_supervision_logs', { eq: { org_id: ws.orgId }, limit: 500 });
    const members = await store.list('org_members', { eq: { org_id: ws.orgId, status: 'active' }, limit: 500 });
    const rows = members.filter(m => all || m.id === ws.member.id).filter(m => isPractitioner(m) || progress.some(p => p.member_id === m.id)).map(m => {
      const mins = progress.filter(p => p.member_id === m.id).reduce((s, p) => s + (p.minutes || 0), 0);
      const supMins = sup.filter(s => s.supervisee_member_id === m.id).reduce((s, x) => s + (x.minutes || 0), 0);
      return {
        member_id: m.id, name: m.display_name || m.email, role: m.role,
        training_hours: Math.round((mins / 60) * 10) / 10,
        modules_completed: progress.filter(p => p.member_id === m.id).length,
        supervision_hours: Math.round((supMins / 60) * 10) / 10
      };
    });
    res.json({ members: rows });
  }));

  // ── Supervisión ──
  const canSeeSupervision = (ws, log) => ws.can('clinical.read_all') || log.supervisor_member_id === ws.member.id || log.supervisee_member_id === ws.member.id;
  const projectLog = (l, names) => {
    let notes = null;
    let unreadable = false;
    try { notes = l.notes_enc ? decryptField(l.notes_enc, { aad: supAad(l.id) }) : null; } catch (err) {
      if (err?.code === 'ENCRYPTION_NOT_CONFIGURED') throw err;
      unreadable = true;
    }
    return {
      id: l.id, supervisor_member_id: l.supervisor_member_id, supervisor_name: names[l.supervisor_member_id] || null,
      supervisee_member_id: l.supervisee_member_id, supervisee_name: names[l.supervisee_member_id] || null,
      session_date: l.session_date, minutes: l.minutes, topics: l.topics || [], notes, unreadable, created_at: l.created_at
    };
  };
  const names = async (orgId) => Object.fromEntries((await store.list('org_members', { eq: { org_id: orgId }, limit: 500 })).map(m => [m.id, m.display_name || m.email]));

  router.get('/supervision', asyncRoute(async (req, res) => {
    const ws = req.workspace;
    if (!isPractitioner(ws.member) && !ws.can('clinical.read_all')) throw forbidden();
    const rows = (await store.list('org_supervision_logs', { eq: { org_id: ws.orgId }, order: '-session_date', limit: 500 })).filter(l => canSeeSupervision(ws, l));
    const n = await names(ws.orgId);
    res.json({ logs: rows.map(l => projectLog(l, n)) });
  }));

  router.post('/supervision', asyncRoute(async (req, res) => {
    const ws = req.workspace;
    if (!isPractitioner(ws.member) && !ws.can('clinical.read_all')) throw forbidden();
    const b = req.body || {};
    // Quien registra es el supervisor; la dirección clínica puede registrar en nombre de otro.
    const supervisorId = b.supervisor_member_id && ws.can('clinical.read_all') ? String(b.supervisor_member_id) : ws.member.id;
    const supervisee = await store.get('org_members', String(b.supervisee_member_id || ''));
    if (!supervisee || supervisee.org_id !== ws.orgId || supervisee.status !== 'active' || !isPractitioner(supervisee)) throw badRequest('Elige un profesional clínico de la clínica.');
    if (supervisee.id === supervisorId) throw badRequest('Nadie se supervisa a sí mismo.');
    if (supervisorId !== ws.member.id) {
      const sup = await store.get('org_members', supervisorId);
      if (!sup || sup.org_id !== ws.orgId || !isPractitioner(sup)) throw badRequest('Supervisor no válido.');
    }
    const date = trimOrNull(b.session_date, 10);
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw badRequest('Fecha no válida.');
    const minutes = Number(b.minutes);
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 1440) throw badRequest('Duración no válida (minutos).');
    const notesRaw = typeof b.notes === 'string' ? b.notes.trim().slice(0, 20_000) : '';
    if (notesRaw && isEncrypted(notesRaw)) throw badRequest('El texto de las notas no es válido.');
    const id = crypto.randomUUID();
    const log = await store.insert('org_supervision_logs', {
      id, org_id: ws.orgId, supervisor_member_id: supervisorId, supervisee_member_id: supervisee.id,
      session_date: date, minutes, topics: tagList(b.topics),
      notes_enc: notesRaw ? encryptField(notesRaw, { aad: supAad(id) }) : null,
      created_by: String(req.authenticatedUserId), updated_at: nowIso()
    });
    await recordAccess({ org_id: ws.orgId, actor_user_id: String(req.authenticatedUserId), action: 'supervision.logged', resource_type: 'supervision', resource_id: log.id });
    res.status(201).json({ log: projectLog(log, await names(ws.orgId)) });
  }));

  router.get('/supervision/:id', asyncRoute(async (req, res) => {
    const ws = req.workspace;
    const l = await loadIn('org_supervision_logs', req, req.params.id, 'Registro');
    if (!canSeeSupervision(ws, l)) throw forbidden();
    res.json({ log: projectLog(l, await names(ws.orgId)) });
  }));

  // ── Panel del dueño ──
  router.get('/dashboard', requireAction('team.manage'), asyncRoute(async (req, res) => {
    const ws = req.workspace;
    const period = String(req.query.period || new Date().toISOString().slice(0, 7));
    const range = periodRange(period);
    if (!range) throw badRequest('Periodo no válido (AAAA-MM).');
    const inRange = { gte: { starts_at: range.from }, lte: { starts_at: range.to } };
    const [appointments, invoices, rooms, locations, patients, leads, settlements, members] = await Promise.all([
      store.list('org_appointments', { eq: { org_id: ws.orgId }, ...inRange, limit: 500 }),
      store.list('org_invoices', { eq: { org_id: ws.orgId, kind: 'patient' }, gte: { issue_date: range.from.slice(0, 10) }, lte: { issue_date: range.to.slice(0, 10) }, limit: 500 }),
      store.list('org_rooms', { eq: { org_id: ws.orgId }, limit: 500 }),
      store.list('org_locations', { eq: { org_id: ws.orgId }, limit: 200 }),
      store.list('org_patients', { eq: { org_id: ws.orgId }, limit: 500 }),
      store.list('org_leads', { eq: { org_id: ws.orgId }, gte: { created_at: range.from }, lte: { created_at: range.to }, limit: 500 }).catch(() => []),
      store.list('org_settlements', { eq: { org_id: ws.orgId, period }, limit: 500 }),
      store.list('org_members', { eq: { org_id: ws.orgId }, limit: 500 })
    ]);
    const end = new Date(range.to);
    const data = computeDashboard({
      range,
      appointments: appointments.filter(a => new Date(a.starts_at) < end),
      invoices: invoices.filter(i => i.issue_date && String(i.issue_date).slice(0, 10) < range.to.slice(0, 10)),
      rooms, locations, patients,
      leads: leads.filter(l => new Date(l.created_at) < end),
      settlements,
      memberNames: Object.fromEntries(members.map(m => [m.id, m.display_name || m.email]))
    });
    res.json({ period, ...data });
  }));
}
