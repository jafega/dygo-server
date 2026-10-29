// E2E F5: el gestor crea un curso → la psicóloga completa un módulo → las
// horas aparecen para el gestor. Panel del dueño con datos reales.
//
//   node e2e/business/f5.spec.mjs
import { chromium, startStack, loggedInContext, shot, assert, APP_URL } from './helpers.mjs';
import { setupClinic } from '../../backend/test/business/helpers.js';

const stack = await startStack({ BUSINESS_BETA_EMAILS: 'olga@clinic.local' });
const browser = await chromium.launch();
try {
  const srv = stack.backend;
  const { base, users: u } = await setupClinic(srv, {
    owner: { name: 'Olga Titular', email: 'olga@clinic.local' },
    name: 'Centro Mar Azul',
    members: [
      { key: 'paula', name: 'Paula Psicóloga', email: 'paula@clinic.local', role: 'psicologo' },
      { key: 'rec', name: 'Rosa Recepción', email: 'rosa@clinic.local', role: 'recepcion', psych: false }
    ]
  });
  const api = (m, p, token, body) => srv.request(m, `${base}${p}`, { token, body });
  // Actividad de este mes para el panel.
  const loc = (await api('POST', '/locations', u.owner.token, { name: 'Sede Centro' })).body.location;
  const room = (await api('POST', '/rooms', u.owner.token, { location_id: loc.id, name: 'Despacho 1' })).body.room;
  const pat = (await api('POST', '/patients', u.rec.token, { first_name: 'Laura', assigned_member_ids: [u.paula.memberId] })).body.patient;
  const now = new Date();
  for (let i = 0; i < 4; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), 2 + i, 10);
    const a = (await api('POST', '/appointments', u.rec.token, { member_id: u.paula.memberId, patient_id: pat.id, room_id: room.id, starts_at: d.toISOString(), ends_at: new Date(d.getTime() + 3600e3).toISOString(), price: 60 })).body.appointment;
    await api('PATCH', `/appointments/${a.id}`, u.rec.token, { status: i === 3 ? 'no_show' : 'completed' });
  }
  await api('POST', '/library', u.owner.token, { title: 'Protocolo de primera visita', kind: 'protocolo', body: 'Acoger, explicar encuadre y firmar el consentimiento.', tags: ['acogida'] });

  // ── Titular: crea el curso y ve el panel ──
  {
    const ctx = await loggedInContext(browser, u.owner);
    const page = await ctx.newPage();
    await page.goto(APP_URL);
    await page.getByTestId('workspace-switcher').getByRole('button', { name: 'Centro Mar Azul' }).click();
    await page.getByRole('navigation').getByRole('button', { name: 'Panel de la clínica' }).click();
    await page.getByText('Producción').first().waitFor();
    await page.getByText('180 €').first().waitFor();          // 3 sesiones × 60 €
    await page.getByText('25 %').first().waitFor();            // 1 no-show de 4
    await shot(page, 'f5-01-panel-dueno');
    await page.getByRole('navigation').getByRole('button', { name: 'Formación' }).click();
    await page.getByRole('main').getByRole('button', { name: 'Cursos' }).click();
    await page.getByPlaceholder('Nuevo curso (p. ej. Acogida en la clínica)').fill('Acogida en la clínica');
    await page.getByRole('button', { name: 'Curso', exact: true }).click();
    await page.getByText('Acogida en la clínica').waitFor();
    await page.getByPlaceholder('Nuevo módulo').fill('Protocolos y consentimientos');
    await page.getByPlaceholder('min').fill('90');
    await page.getByRole('button', { name: 'Añadir' }).click();
    await page.getByText('Protocolos y consentimientos').waitFor();
    await ctx.close();
  }

  // ── Psicóloga: completa el módulo ──
  {
    const ctx = await loggedInContext(browser, u.paula);
    const page = await ctx.newPage();
    await page.goto(APP_URL);
    await page.getByTestId('workspace-switcher').getByRole('button', { name: 'Centro Mar Azul' }).click();
    assert(await page.getByRole('navigation').getByRole('button', { name: 'Panel de la clínica' }).count() === 0, 'la psicóloga no ve el panel del dueño');
    await page.getByRole('navigation').getByRole('button', { name: 'Formación' }).click();
    await page.getByText('Protocolo de primera visita').waitFor();
    await page.getByRole('main').getByRole('button', { name: 'Cursos' }).click();
    await page.getByText('Obligatorio').waitFor();
    await page.getByRole('button', { name: 'Marcar como completado' }).click();
    await page.getByText('1/1').waitFor();
    await shot(page, 'f5-02-curso-completado');
    await ctx.close();
  }

  // ── Titular: ve las horas ──
  {
    const ctx = await loggedInContext(browser, u.owner);
    const page = await ctx.newPage();
    await page.goto(APP_URL);
    await page.getByTestId('workspace-switcher').getByRole('button', { name: 'Centro Mar Azul' }).click();
    await page.getByRole('navigation').getByRole('button', { name: 'Formación' }).click();
    await page.getByRole('main').getByRole('button', { name: 'Cursos' }).click();
    await page.getByText('1,5 h formación').waitFor();
    await shot(page, 'f5-03-horas-formacion');
    await ctx.close();
  }
  console.log('E2E F5 OK');
} catch (err) {
  console.error(err);
  process.exitCode = 1;
} finally {
  await browser.close();
  await stack.stop();
}
