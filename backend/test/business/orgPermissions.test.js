// F1.1 — Matriz de permisos (plan §1.3). Cada rol se compara con su lista
// EXACTA de acciones: así quedan cubiertas todas las celdas (lo que puede y lo
// que no).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ACTIONS, ROLES, can, effectivePermissions, isSeatBillable, validateOverride, sanitizeOverride, rolePreset
} from '../../utils/orgPermissions.js';

const active = (role, extra = {}) => ({ role, status: 'active', permissions_override: {}, ...extra });

const PRACTITIONER = ['agenda.view_busy', 'agenda.manage_own', 'patients.contact_assigned', 'clinical.read_assigned',
  'billing.own', 'settlements.own', 'leads.assigned', 'library.consume'];

const EXPECTED = {
  titular: ['org.subscription', 'org.delete', 'org.settings', 'team.manage',
    'agenda.view_all', 'agenda.view_busy', 'agenda.manage_all', 'patients.contact_all', 'clinical.break_glass',
    'billing.manage', 'billing.read_export', 'settlements.manage', 'settlements.read', 'leads.manage',
    'library.manage', 'library.consume', 'audit.view'],
  gerente: ['org.settings', 'team.manage', 'agenda.view_all', 'agenda.view_busy', 'agenda.manage_all',
    'patients.contact_all', 'billing.manage', 'billing.read_export', 'settlements.manage', 'settlements.read',
    'leads.manage', 'library.manage', 'library.consume'],
  director_clinico: [...PRACTITIONER, 'agenda.view_all', 'patients.contact_all', 'clinical.read_all',
    'leads.manage', 'library.manage', 'audit.view'],
  psicologo: [...PRACTITIONER],
  en_practicas: ['agenda.view_busy', 'agenda.manage_own', 'patients.contact_assigned', 'clinical.read_assigned',
    'settlements.own', 'library.consume'],
  recepcion: ['agenda.view_all', 'agenda.view_busy', 'agenda.manage_all', 'patients.contact_all',
    'billing.manage', 'leads.manage'],
  contable: ['billing.read_export', 'settlements.read']
};

for (const role of ROLES) {
  test(`matriz: ${role} tiene exactamente sus permisos`, () => {
    const got = new Set(effectivePermissions(active(role)));
    const want = new Set(EXPECTED[role]);
    for (const action of ACTIONS) {
      assert.equal(got.has(action), want.has(action), `${role} / ${action}`);
      assert.equal(can(active(role), action), want.has(action), `can(${role}, ${action})`);
    }
  });
}

test('celdas clave del plan §1.3', () => {
  // Historia clínica: recepción, contable y gerente nunca; titular solo break-glass.
  for (const role of ['recepcion', 'contable', 'gerente']) {
    for (const a of ['clinical.read_assigned', 'clinical.read_all', 'clinical.break_glass']) {
      assert.equal(can(active(role), a), false, `${role} ${a}`);
    }
  }
  assert.equal(can(active('titular'), 'clinical.read_assigned'), false);
  assert.equal(can(active('titular'), 'clinical.break_glass'), true);
  assert.equal(can(active('director_clinico'), 'clinical.read_all'), true);
  // Agenda: psicólogo ve huecos, no la agenda de todos.
  assert.equal(can(active('psicologo'), 'agenda.view_busy'), true);
  assert.equal(can(active('psicologo'), 'agenda.view_all'), false);
  // Solo el titular gestiona la suscripción y puede borrar la clínica.
  for (const role of ROLES.filter(r => r !== 'titular')) {
    assert.equal(can(active(role), 'org.subscription'), false, role);
    assert.equal(can(active(role), 'org.delete'), false, role);
  }
});

test('titular clínico suma los permisos de quien atiende pacientes', () => {
  const t = active('titular', { is_clinical: true });
  for (const a of PRACTITIONER) assert.equal(can(t, a), true, a);
  assert.equal(can(t, 'clinical.read_all'), false);
  assert.deepEqual(rolePreset('psicologo', { isClinical: true }).sort(), [...PRACTITIONER].sort());
});

test('un miembro no activo no tiene ningún permiso', () => {
  for (const status of ['invited', 'suspended', 'left', 'declined']) {
    assert.deepEqual(effectivePermissions({ role: 'titular', status }), []);
  }
  assert.deepEqual(effectivePermissions(null), []);
  assert.deepEqual(effectivePermissions(active('inventado')), []);
});

test('override: grant nunca concede clinical.* a recepción ni contable', () => {
  for (const role of ['recepcion', 'contable']) {
    const m = active(role, { permissions_override: { grant: ['clinical.read_all', 'clinical.read_assigned', 'clinical.break_glass', 'audit.view'] } });
    for (const a of ['clinical.read_all', 'clinical.read_assigned', 'clinical.break_glass', 'audit.view']) {
      assert.equal(can(m, a), false, `${role} ${a}`);
    }
    assert.match(validateOverride(role, { grant: ['clinical.read_all'] }), /No se puede conceder/);
  }
});

test('override: grant solo concede delegables; revoke no quita lo del titular', () => {
  const rec = active('recepcion', { permissions_override: { grant: ['library.manage', 'team.manage', 'org.subscription'] } });
  assert.equal(can(rec, 'library.manage'), true);
  assert.equal(can(rec, 'team.manage'), false);
  assert.equal(can(rec, 'org.subscription'), false);
  assert.match(validateOverride('recepcion', { grant: ['team.manage'] }), /No se puede conceder team.manage/);

  const psy = active('psicologo', { permissions_override: { revoke: ['leads.assigned'] } });
  assert.equal(can(psy, 'leads.assigned'), false);
  assert.equal(can(psy, 'agenda.manage_own'), true);

  const tit = active('titular', { permissions_override: { revoke: ['org.subscription', 'team.manage'] } });
  assert.equal(can(tit, 'org.subscription'), true);
  assert.equal(can(tit, 'team.manage'), false);
  assert.match(validateOverride('titular', { revoke: ['org.delete'] }), /No se puede quitar/);

  assert.deepEqual(sanitizeOverride('psicologo', { grant: ['x.y', 'leads.manage'], revoke: 'nope' }), { revoke: [], grant: ['leads.manage'] });
  assert.equal(validateOverride('psicologo', null), null);
  assert.match(validateOverride('psicologo', { extra: [] }), /Clave no válida/);
  assert.match(validateOverride('psicologo', { grant: ['inventada'] }), /Acción desconocida/);
});

test('can() con una acción inexistente lanza (evita erratas silenciosas)', () => {
  assert.throws(() => can(active('titular'), 'agenda.ver_todo'), /Acción desconocida/);
});

test('licencias facturables: roles clínicos y titular solo si es clínico', () => {
  assert.equal(isSeatBillable(active('psicologo')), true);
  assert.equal(isSeatBillable(active('director_clinico')), true);
  assert.equal(isSeatBillable(active('en_practicas')), true);
  assert.equal(isSeatBillable(active('recepcion')), false);
  assert.equal(isSeatBillable(active('gerente')), false);
  assert.equal(isSeatBillable(active('contable')), false);
  assert.equal(isSeatBillable(active('titular')), false);
  assert.equal(isSeatBillable(active('titular', { is_clinical: true })), true);
});
