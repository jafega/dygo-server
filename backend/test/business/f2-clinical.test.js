// F2 — Integración: sedes y salas, pacientes, agenda, historia clínica cifrada,
// anotaciones privadas, acceso de emergencia, consentimientos, auditoría,
// aislamiento entre clínicas y baja con reasignación.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { startServer } from '../helpers/server.js';
import { businessEnv, setupClinic, addMember, at, DPA } from './helpers.js';

test('F2: operativa clínica completa', async (t) => {
  const srv = await startServer({ env: businessEnv('owner@a.local,owner@b.local') });
  t.after(() => srv.stop());
  const req = srv.request;

  const { base, users: u, org } = await setupClinic(srv, {
    owner: { name: 'Olga Titular', email: 'owner@a.local' },
    name: 'Clínica A',
    members: [
      { key: 'dir', name: 'Diego Director', email: 'dir@a.local', role: 'director_clinico' },
      { key: 'p1', name: 'Paula Uno', email: 'p1@a.local', role: 'psicologo', body: { employment_type: 'freelance', billing_model: 'org_invoices' } },
      { key: 'p2', name: 'Pablo Dos', email: 'p2@a.local', role: 'psicologo' },
      { key: 'rec', name: 'Rosa Recepción', email: 'rec@a.local', role: 'recepcion', psych: false },
      { key: 'acc', name: 'Carmen Contable', email: 'acc@a.local', role: 'contable', psych: false }
    ]
  });
  // En prácticas, supervisada por P1.
  u.int = await srv.createUser({ name: 'Inés Prácticas', email: 'int@a.local', role: 'PSYCHOLOGIST' });
  u.int.memberId = await addMember(srv, base, u.owner.token, u.int, { role: 'en_practicas', supervisor_member_id: u.p1.memberId });

  // ── Sedes y salas ──
  assert.equal((await req('POST', `${base}/locations`, { token: u.p1.token, body: { name: 'X' } })).status, 403);
  const loc = await req('POST', `${base}/locations`, { token: u.owner.token, body: { name: 'Sede Centro', address: 'Calle Mayor 1' } });
  assert.equal(loc.status, 201);
  const room1 = (await req('POST', `${base}/rooms`, { token: u.owner.token, body: { location_id: loc.body.location.id, name: 'Despacho 1', hourly_rate: 12 } })).body.room;
  const room2 = (await req('POST', `${base}/rooms`, { token: u.owner.token, body: { location_id: loc.body.location.id, name: 'Despacho 2' } })).body.room;
  const locsAsP1 = await req('GET', `${base}/locations`, { token: u.p1.token });
  assert.equal(locsAsP1.body.locations[0].rooms.length, 2);
  assert.equal(locsAsP1.body.locations[0].rooms[0].hourly_rate, undefined, 'el psicólogo no ve tarifas');

  // ── Pacientes ──
  // Recepción crea y asigna; P1 crea uno propio (se asigna a sí misma).
  const pa = (await req('POST', `${base}/patients`, { token: u.rec.token, body: { first_name: 'Laura', last_name: 'Gómez', email: 'laura@pac.local', phone: '600000001' } })).body.patient;
  assert.deepEqual(pa.assigned_member_ids, []);
  const asg = await req('PUT', `${base}/patients/${pa.id}/assignments`, { token: u.rec.token, body: { member_ids: [u.int.memberId] } });
  assert.equal(asg.status, 200);
  assert.equal((await req('PUT', `${base}/patients/${pa.id}/assignments`, { token: u.rec.token, body: { member_ids: [u.rec.memberId] } })).status, 400, 'no se asigna a recepción');
  assert.equal((await req('PUT', `${base}/patients/${pa.id}/assignments`, { token: u.p1.token, body: { member_ids: [u.p1.memberId] } })).status, 403, 'un psicólogo no reasigna');

  const pb = (await req('POST', `${base}/patients`, { token: u.p1.token, body: { first_name: 'Marta', last_name: 'Ruiz' } })).body.patient;
  assert.deepEqual(pb.assigned_member_ids, [u.p1.memberId]);
  const pc = (await req('POST', `${base}/patients`, { token: u.rec.token, body: { first_name: 'Nacho', assigned_member_ids: [u.p2.memberId] } })).body.patient;

  // Cada psicólogo ve solo los suyos; uno ajeno → 404.
  const listP1 = await req('GET', `${base}/patients`, { token: u.p1.token });
  assert.deepEqual(listP1.body.patients.map(p => p.id), [pb.id]);
  assert.equal((await req('GET', `${base}/patients/${pc.id}`, { token: u.p1.token })).status, 404);
  assert.equal((await req('GET', `${base}/patients`, { token: u.rec.token })).body.patients.length, 3);
  assert.equal((await req('GET', `${base}/patients`, { token: u.acc.token })).status, 403, 'contable sin pacientes');

  // ── Agenda ──
  const mk = (token, body) => req('POST', `${base}/appointments`, { token, body });
  const a1 = await mk(u.rec.token, { member_id: u.p1.memberId, patient_id: pb.id, room_id: room1.id, starts_at: at(10, 9), ends_at: at(10, 10), price: 60 });
  assert.equal(a1.status, 201, a1.text);
  assert.equal(a1.body.appointment.location_id, loc.body.location.id, 'la sede se deduce de la sala');
  // Sala ocupada → 409 ROOM_CONFLICT; profesional ocupado → 409 PROFESSIONAL_CONFLICT.
  const clashRoom = await mk(u.rec.token, { member_id: u.p2.memberId, patient_id: pc.id, room_id: room1.id, starts_at: at(10, 9, 30), ends_at: at(10, 10, 30) });
  assert.equal(clashRoom.status, 409);
  assert.equal(clashRoom.body.code, 'ROOM_CONFLICT');
  const clashPro = await mk(u.rec.token, { member_id: u.p1.memberId, patient_id: pb.id, room_id: room2.id, starts_at: at(10, 9, 30), ends_at: at(10, 10, 30) });
  assert.equal(clashPro.body.code, 'PROFESSIONAL_CONFLICT');
  // Contigua sí.
  assert.equal((await mk(u.rec.token, { member_id: u.p2.memberId, patient_id: pc.id, room_id: room1.id, starts_at: at(10, 10), ends_at: at(10, 11) })).status, 201);
  // Un psicólogo no puede crear citas para otro (403) ni con pacientes que no son suyos (403).
  assert.equal((await mk(u.p1.token, { member_id: u.p2.memberId, patient_id: pb.id, starts_at: at(11, 9), ends_at: at(11, 10) })).status, 403);
  assert.equal((await mk(u.p1.token, { member_id: u.p1.memberId, patient_id: pc.id, starts_at: at(11, 9), ends_at: at(11, 10) })).status, 403);
  assert.equal((await mk(u.p1.token, { patient_id: pb.id, starts_at: at(11, 9), ends_at: at(11, 10), modality: 'online' })).status, 201);
  assert.equal((await mk(u.acc.token, { member_id: u.p1.memberId, patient_id: pb.id, starts_at: at(12, 9), ends_at: at(12, 10) })).status, 403);

  // Vista de agenda: P1 ve lo de P2 como "ocupado" sin paciente; recepción lo ve todo.
  const range = `from=${encodeURIComponent(at(9, 0))}&to=${encodeURIComponent(at(13, 0))}`;
  const agP1 = await req('GET', `${base}/appointments?${range}`, { token: u.p1.token });
  const p2Appt = agP1.body.appointments.find(a => a.member_id === u.p2.memberId);
  assert.equal(p2Appt.busy, true);
  assert.equal(p2Appt.patient_id, undefined);
  assert.ok(!JSON.stringify(agP1.body).includes('Nacho'));
  const mineP1 = agP1.body.appointments.find(a => a.member_id === u.p1.memberId);
  assert.equal(mineP1.patient_name, 'Marta Ruiz');
  const agRec = await req('GET', `${base}/appointments?${range}`, { token: u.rec.token });
  assert.ok(agRec.body.appointments.every(a => !a.busy));
  assert.equal((await req('GET', `${base}/appointments?from=2031-01-01&to=2031-06-01`, { token: u.rec.token })).status, 400, 'rango > 62 días');
  // Mover P1 encima de otra cita suya → 409; marcar completada → 200.
  const move = await req('PATCH', `${base}/appointments/${a1.body.appointment.id}`, { token: u.p1.token, body: { starts_at: at(11, 9), ends_at: at(11, 10) } });
  assert.equal(move.body.code, 'PROFESSIONAL_CONFLICT');
  assert.equal((await req('PATCH', `${base}/appointments/${a1.body.appointment.id}`, { token: u.p1.token, body: { status: 'completed' } })).body.appointment.status, 'completed');

  // ── Historia clínica ──
  const note = (token, patientId, body) => req('POST', `${base}/patients/${patientId}/notes`, { token, body });
  const n1 = await note(u.p1.token, pb.id, { content: 'Ansiedad generalizada. Plan: TCC 12 sesiones.', appointment_id: a1.body.appointment.id });
  assert.equal(n1.status, 201, n1.text);
  const priv = await note(u.p1.token, pb.id, { content: 'SECRETO-P1: impresión personal, no compartir', visibility: 'private_annotation' });
  assert.equal(priv.status, 201);
  assert.equal((await note(u.p1.token, pb.id, { content: 'enc:v1:aaa:bbb:ccc' })).status, 400, 'no se acepta texto con forma de cifrado');
  // Recepción y contable no escriben ni leen historia.
  assert.equal((await note(u.rec.token, pb.id, { content: 'x' })).status, 403);
  const recRead = await req('GET', `${base}/patients/${pb.id}/notes`, { token: u.rec.token });
  assert.equal(recRead.status, 403);
  // P2 (no asignado) → 404 (no ve al paciente).
  assert.equal((await req('GET', `${base}/patients/${pb.id}/notes`, { token: u.p2.token })).status, 404);
  // El titular no clínico tampoco lee la historia (403).
  assert.equal((await req('GET', `${base}/patients/${pb.id}/notes`, { token: u.owner.token })).status, 403);

  // P1 ve su nota de historia y su anotación privada.
  const readP1 = await req('GET', `${base}/patients/${pb.id}/notes`, { token: u.p1.token });
  assert.equal(readP1.status, 200);
  assert.equal(readP1.body.notes.length, 2);
  assert.ok(readP1.body.notes.some(n => n.content.includes('SECRETO-P1') && n.is_mine));
  // El director ve la historia, pero no la anotación privada.
  const readDir = await req('GET', `${base}/patients/${pb.id}/notes`, { token: u.dir.token });
  assert.equal(readDir.status, 200);
  assert.equal(readDir.body.notes.length, 1);
  assert.ok(!JSON.stringify(readDir.body).includes('SECRETO-P1'));

  // Historia inmutable; corrección encadenada; la privada sí se edita.
  assert.equal((await req('PATCH', `${base}/patients/${pb.id}/notes/${n1.body.note.id}`, { token: u.p1.token, body: { content: 'cambio' } })).body.code, 'NOTE_IMMUTABLE');
  assert.equal((await req('DELETE', `${base}/patients/${pb.id}/notes/${n1.body.note.id}`, { token: u.p1.token })).status, 409);
  const fix = await note(u.p1.token, pb.id, { content: 'Corrección: 16 sesiones.', amends_note_id: n1.body.note.id });
  assert.equal(fix.body.note.amends_note_id, n1.body.note.id);
  assert.equal((await req('PATCH', `${base}/patients/${pb.id}/notes/${priv.body.note.id}`, { token: u.p1.token, body: { content: 'SECRETO-P1 v2' } })).status, 200);
  // Nadie más puede tocar la privada (404, no se revela).
  assert.equal((await req('PATCH', `${base}/patients/${pb.id}/notes/${priv.body.note.id}`, { token: u.dir.token, body: { content: 'x' } })).status, 404);

  // Supervisión: P1 supervisa a Inés → lee la historia de Laura (asignada a Inés), sin sus privadas.
  await note(u.int.token, pa.id, { content: 'Primera visita, valoración inicial.' });
  await note(u.int.token, pa.id, { content: 'PRIVADO-INES', visibility: 'private_annotation' });
  const sup = await req('GET', `${base}/patients/${pa.id}/notes`, { token: u.p1.token });
  assert.equal(sup.status, 200);
  assert.equal(sup.body.notes.length, 1);
  assert.ok(!JSON.stringify(sup.body).includes('PRIVADO-INES'));
  assert.equal((await req('GET', `${base}/patients/${pa.id}/notes`, { token: u.p2.token })).status, 404);

  // Acceso de emergencia del titular: motivo obligatorio, solo historia, auditado.
  assert.equal((await req('POST', `${base}/patients/${pb.id}/break-glass`, { token: u.owner.token, body: { justification: 'urgente' } })).status, 400);
  assert.equal((await req('POST', `${base}/patients/${pb.id}/break-glass`, { token: u.dir.token, body: { justification: 'x'.repeat(30) } })).status, 403);
  const bg = await req('POST', `${base}/patients/${pb.id}/break-glass`, { token: u.owner.token, body: { justification: 'Requerimiento judicial nº 123/2031 del juzgado' } });
  assert.equal(bg.status, 200);
  assert.equal(bg.body.notes.length, 2);
  assert.ok(bg.body.notes.every(n => n.visibility === 'clinical_record'));
  assert.ok(!JSON.stringify(bg.body).includes('SECRETO-P1'));

  // En el almacén todo el contenido clínico está cifrado.
  const storeFile = `${srv.tmpDir}/business-store.json`;
  const raw = fs.readFileSync(storeFile, 'utf-8');
  assert.ok(!raw.includes('Ansiedad generalizada'));
  assert.ok(!raw.includes('SECRETO-P1'));
  const stored = JSON.parse(raw).tables;
  assert.ok(stored.org_clinical_notes.every(n => n.content_enc.startsWith('enc:v1:')));

  // ── Consentimientos ──
  const tpl = await req('POST', `${base}/consent-templates`, { token: u.dir.token, body: { name: 'Consentimiento informado', content: 'Texto v1' } });
  assert.equal(tpl.status, 201);
  assert.equal((await req('POST', `${base}/consent-templates`, { token: u.p1.token, body: { name: 'x', content: 'y' } })).status, 403);
  const cons = await req('POST', `${base}/patients/${pb.id}/consents`, { token: u.p1.token, body: { template_id: tpl.body.template.id, method: 'papel_firmado' } });
  assert.equal(cons.status, 201);
  assert.equal(cons.body.consent.content_snapshot, 'Texto v1');
  assert.match(cons.body.consent.content_sha256, /^[0-9a-f]{64}$/);
  const tpl2 = await req('PATCH', `${base}/consent-templates/${tpl.body.template.id}`, { token: u.dir.token, body: { content: 'Texto v2' } });
  assert.equal(tpl2.body.template.version, 2);
  const consList = await req('GET', `${base}/patients/${pb.id}/consents`, { token: u.rec.token });
  assert.equal(consList.body.consents[0].content_snapshot, 'Texto v1', 'lo firmado no cambia');

  // ── Auditoría ──
  assert.equal((await req('GET', `${base}/audit`, { token: u.rec.token })).status, 403);
  const aud = await req('GET', `${base}/audit?patientId=${pb.id}`, { token: u.owner.token });
  assert.equal(aud.status, 200);
  const actions = aud.body.entries.map(e => e.action);
  for (const a of ['clinical.read', 'clinical.read.denied', 'clinical.break_glass', 'clinical.write']) assert.ok(actions.includes(a), a);
  const denied = aud.body.entries.find(e => e.action === 'clinical.read.denied' && e.actor_user_id === u.rec.id);
  assert.ok(denied, 'el intento de recepción queda registrado');
  assert.equal(denied.actor_name, 'Rosa Recepción');
  assert.ok(aud.body.entries.find(e => e.action === 'clinical.break_glass').justification.includes('judicial'));

  // ── Baja de P1 con reasignación a P2 ──
  const off = await req('POST', `${base}/members/${u.p1.memberId}/offboard`, { token: u.owner.token, body: { reassign: { [pb.id]: u.p2.memberId } } });
  assert.equal(off.status, 200, off.text);
  assert.equal(off.body.reassigned, 1);
  assert.equal((await req('GET', base, { token: u.p1.token })).status, 404);
  const pbNow = await req('GET', `${base}/patients/${pb.id}`, { token: u.p2.token });
  assert.equal(pbNow.status, 200);
  assert.deepEqual(pbNow.body.patient.assigned_member_ids, [u.p2.memberId]);
  // Las notas conservan su autoría; P2 ve la historia, nunca la privada de P1.
  const readP2 = await req('GET', `${base}/patients/${pb.id}/notes`, { token: u.p2.token });
  assert.ok(readP2.body.notes.every(n => n.author_member_id === u.p1.memberId));
  assert.ok(!JSON.stringify(readP2.body).includes('SECRETO-P1'));

  void org;
});

test('F2: aislamiento entre clínicas y agenda unificada con la consulta personal', async (t) => {
  const SESSION_START = at(20, 10);
  const srv = await startServer({ env: businessEnv('owner@a.local,owner@b.local') });
  t.after(() => srv.stop());
  const req = srv.request;

  // Psicóloga que trabaja en A y en B y tiene su consulta personal.
  const ana = await srv.createUser({ name: 'Ana Multi', email: 'ana@multi.local', role: 'PSYCHOLOGIST' });
  const A = await setupClinic(srv, { owner: { name: 'Olga', email: 'owner@a.local' }, name: 'Clínica A' });
  const B = await setupClinic(srv, { owner: { name: 'Berta', email: 'owner@b.local' }, name: 'Clínica B' });
  const anaA = await addMember(srv, A.base, A.users.owner.token, ana, { role: 'psicologo' });
  const anaB = await addMember(srv, B.base, B.users.owner.token, ana, { role: 'psicologo' });

  // Sesión de su consulta personal (mainds pro) el día 20 a las 10:00.
  const db = srv.readDb();
  db.sessions = [{ id: 'pers-1', psychologist_user_id: ana.id, psychologistId: ana.id, patient_user_id: 'x', status: 'scheduled', starts_on: SESSION_START, ends_on: at(20, 11) }];
  srv.writeDb(db);

  const patA = (await req('POST', `${A.base}/patients`, { token: ana.token, body: { first_name: 'PacienteDeA' } })).body.patient;
  const patB = (await req('POST', `${B.base}/patients`, { token: ana.token, body: { first_name: 'PacienteDeB' } })).body.patient;

  // Nada de A aparece en B y viceversa.
  const listA = await req('GET', `${A.base}/patients`, { token: ana.token });
  const listB = await req('GET', `${B.base}/patients`, { token: ana.token });
  assert.ok(!JSON.stringify(listA.body).includes('PacienteDeB'));
  assert.ok(!JSON.stringify(listB.body).includes('PacienteDeA'));
  assert.equal((await req('GET', `${B.base}/patients/${patA.id}`, { token: ana.token })).status, 404);
  assert.equal((await req('GET', `${B.base}/patients/${patA.id}/notes`, { token: ana.token })).status, 404);
  assert.equal((await req('POST', `${B.base}/appointments`, { token: ana.token, body: { patient_id: patA.id, starts_at: at(21, 9), ends_at: at(21, 10) } })).status, 400);
  // El titular de B no ve nada de A.
  assert.equal((await req('GET', `${A.base}/patients`, { token: B.users.owner.token })).status, 404);

  // Cita en A a la misma hora que su sesión personal → se crea con aviso, sin detalles.
  const inA = await req('POST', `${A.base}/appointments`, { token: ana.token, body: { patient_id: patA.id, starts_at: at(20, 10, 30), ends_at: at(20, 11, 30), modality: 'online' } });
  assert.equal(inA.status, 201);
  assert.deepEqual(inA.body.warnings, ['CONFLICT_OTHER_WORKSPACE']);
  // Cita en B a la misma hora que la de A → también avisa (y no revela nada de A).
  const inB = await req('POST', `${B.base}/appointments`, { token: ana.token, body: { patient_id: patB.id, starts_at: at(20, 11), ends_at: at(20, 12), modality: 'online' } });
  assert.deepEqual(inB.body.warnings, ['CONFLICT_OTHER_WORKSPACE']);
  assert.ok(!JSON.stringify(inB.body).includes('PacienteDeA'));
  // Sin solape → sin aviso.
  const free = await req('POST', `${B.base}/appointments`, { token: ana.token, body: { patient_id: patB.id, starts_at: at(22, 9), ends_at: at(22, 10), modality: 'online' } });
  assert.deepEqual(free.body.warnings, []);

  // Mi agenda unificada: bloques de A, B y la consulta personal, solo horas.
  const busy = await req('GET', `/api/org/me/busy?from=${encodeURIComponent(at(20, 0))}&to=${encodeURIComponent(at(23, 0))}`, { token: ana.token });
  assert.equal(busy.status, 200);
  const sources = busy.body.blocks.map(b => b.source + ':' + (b.org_name || ''));
  assert.ok(sources.includes('personal:'));
  assert.ok(sources.includes('org:Clínica A'));
  assert.ok(sources.includes('org:Clínica B'));
  assert.ok(!JSON.stringify(busy.body).includes('Paciente'));

  // Los ids de miembro son distintos en cada clínica.
  assert.notEqual(anaA, anaB);
});

test('F2: sin CLINICAL_ENCRYPTION_KEY las notas responden 503 y no se guarda nada en claro', async (t) => {
  const srv = await startServer({ env: businessEnv('owner@k.local', { CLINICAL_ENCRYPTION_KEY: '' }) });
  t.after(() => srv.stop());
  const owner = await srv.createUser({ name: 'O', email: 'owner@k.local', role: 'PSYCHOLOGIST' });
  const c = await srv.request('POST', '/api/org', { token: owner.token, body: { name: 'Clínica K', ...DPA, is_clinical: true } });
  const base = `/api/org/${c.body.organization.id}`;
  const p = (await srv.request('POST', `${base}/patients`, { token: owner.token, body: { first_name: 'Z' } })).body.patient;
  await srv.request('PUT', `${base}/patients/${p.id}/assignments`, { token: owner.token, body: { member_ids: [c.body.membership.id] } });
  const r = await srv.request('POST', `${base}/patients/${p.id}/notes`, { token: owner.token, body: { content: 'texto-en-claro' } });
  assert.equal(r.status, 503);
  assert.equal(r.body.code, 'ENCRYPTION_NOT_CONFIGURED');
  assert.ok(!fs.readFileSync(`${srv.tmpDir}/business-store.json`, 'utf-8').includes('texto-en-claro'));
});
