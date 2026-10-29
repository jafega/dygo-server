// E2E F6: el día de la titular que también pasa consulta (feedback de la
// evaluación). Inicio con primeros pasos → tarifas → cita semanal con paciente
// nuevo desde la agenda → cerrar citas pasadas desde Inicio → facturar
// pendientes en lote y emitir → del detalle de la cita a la ficha → móvil.
//
//   node e2e/business/f6.spec.mjs
import { chromium, startStack, loggedInContext, shot, assert, APP_URL } from './helpers.mjs';
import { setupClinic } from '../../backend/test/business/helpers.js';

const stack = await startStack({ BUSINESS_BETA_EMAILS: 'olga@f6.local' });
const browser = await chromium.launch();
try {
  const srv = stack.backend;
  const { base, users: u } = await setupClinic(srv, {
    owner: { name: 'Olga Martín', email: 'olga@f6.local', isClinical: true },
    name: 'Centro Olga Martín',
    members: [{ key: 'rec', name: 'Rosa Recepción', email: 'rosa@f6.local', role: 'recepcion', psych: false }]
  });
  const api = (m, p, token, body) => srv.request(m, `${base}${p}`, { token, body });
  await api('POST', '/billing-entities', u.owner.token, { legal_name: 'Centro Olga Martín, S.L.', tax_id: 'B12345674', address: 'Calle Mayor 1', city: 'Madrid' });

  const ctx = await loggedInContext(browser, u.owner);
  const page = await ctx.newPage();
  await page.goto(APP_URL);
  await page.getByTestId('workspace-switcher').getByRole('button', { name: 'Centro Olga Martín' }).click();
  const nav = page.getByRole('navigation');
  const main = page.getByRole('main');

  // ── Inicio: saludo, acciones rápidas y primeros pasos ──
  await main.getByText('Primeros pasos').waitFor();
  await main.getByText('Hoy no tienes citas', { exact: false }).waitFor();
  assert(await nav.getByText('Día a día').count() === 1, 'menú agrupado');
  assert(await page.getByRole('button', { name: 'Volver a mi consulta' }).count() === 0, 'sin botón duplicado');
  await shot(page, 'f6-01-inicio');

  // ── Tarifas desde primeros pasos ──
  await main.getByRole('button', { name: 'Tarifas' }).click();
  await page.getByLabel('Tarifa Sesión').fill('60');
  await page.getByLabel('Tarifa Primera visita').fill('75');
  await page.getByRole('button', { name: 'Guardar tarifas' }).click();
  await page.getByText('Tarifas guardadas').waitFor();
  await shot(page, 'f6-02-tarifas');

  // ── Nueva cita desde Inicio, con paciente nuevo y repetición semanal ──
  await nav.getByRole('button', { name: 'Inicio' }).click();
  await main.getByRole('button', { name: 'Nueva cita' }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Paciente nuevo' }).click();
  await dialog.getByLabel('Nombre del paciente').fill('Laura');
  await dialog.getByLabel('Apellidos del paciente').fill('Gómez');
  await dialog.getByLabel('Teléfono del paciente').fill('600111222');
  await dialog.getByRole('button', { name: 'Crear paciente' }).click();
  await dialog.locator('#appt-patient').waitFor();
  assert(await dialog.locator('#appt-patient').inputValue() !== '', 'el paciente nuevo queda elegido');
  assert(await dialog.getByLabel('Precio (€)').inputValue() === '60', 'precio de la tarifa');
  // Mañana a las 10:00, cada semana, 4 citas.
  const tomorrow = new Date(Date.now() + 864e5);
  const ymd = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;
  await dialog.getByLabel('Día').fill(ymd);
  await dialog.getByLabel('Repetir').check();
  await dialog.getByLabel('Número de citas').fill('4');
  await shot(page, 'f6-03-cita-semanal');
  await dialog.getByRole('button', { name: 'Guardar' }).click();
  await page.getByText('Se han creado 4 citas.').waitFor();

  // ── Del detalle de la cita a la ficha (pestaña Citas) ──
  await page.getByRole('button', { name: 'Día', exact: true }).click();
  await page.getByRole('button', { name: 'Día siguiente' }).click();
  await main.getByRole('button', { name: /Laura Gómez/ }).first().click();
  await page.getByText('Forma parte de una serie').waitFor();
  await shot(page, 'f6-04-detalle-cita');
  await page.keyboard.press('Escape');
  assert(await page.getByRole('dialog').count() === 0, 'Escape cierra el detalle');
  await main.getByRole('button', { name: /Laura Gómez/ }).first().click();
  await page.getByRole('dialog').getByRole('button', { name: 'Ficha' }).click();
  await page.getByRole('heading', { name: 'Laura Gómez' }).waitFor();
  await main.getByRole('button', { name: 'Citas', exact: true }).click();
  await main.getByText('Próximas').waitFor();
  assert(await main.getByText('Programada').count() === 4, 'las 4 citas de la serie');
  await shot(page, 'f6-05-ficha-citas');

  // ── Citas pasadas sin cerrar → Inicio ──
  const laura = (await api('GET', '/patients', u.owner.token)).body.patients.find(p => p.first_name === 'Laura');
  for (const daysAgo of [8, 1]) {
    const s = new Date(Date.now() - daysAgo * 864e5);
    s.setHours(10, 0, 0, 0);
    const r = await api('POST', '/appointments', u.rec.token, { member_id: u.owner.memberId, patient_id: laura.id, starts_at: s.toISOString(), ends_at: new Date(s.getTime() + 50 * 60e3).toISOString() });
    assert(r.status === 201, r.text);
  }
  await nav.getByRole('button', { name: 'Inicio' }).click();
  const toClose = page.getByTestId('to-close');
  await toClose.getByText('2 citas pasadas siguen').waitFor();
  await shot(page, 'f6-06-pendientes');
  await toClose.getByRole('button', { name: /Marcar como realizadas/ }).click();
  await main.getByText('2 sesiones realizadas sin facturar · 120 €').waitFor();

  // ── Facturar pendientes en lote y emitir ──
  await main.getByRole('button', { name: 'Facturar', exact: true }).click();
  const bulk = page.getByTestId('bulk-invoicing');
  await bulk.getByText('Laura Gómez').waitFor();
  await bulk.getByRole('button', { name: 'Preparar 1 borrador' }).click();
  await bulk.getByText('1 borrador preparado').waitFor();
  await bulk.getByRole('button', { name: 'Emitir 1 factura' }).click();
  const yy = String(new Date().getFullYear()).slice(2);
  await bulk.getByText(`C${yy}-0001`).waitFor();
  await shot(page, 'f6-07-facturado');
  await nav.getByRole('button', { name: 'Inicio' }).click();
  await main.getByText('Todo al día').waitFor();

  // ── Móvil: agenda en vista de día ──
  const mp = await ctx.newPage();
  await mp.setViewportSize({ width: 390, height: 844 });
  await mp.goto(APP_URL);
  await mp.getByTestId('clinic-workspace').waitFor();
  await shot(mp, 'f6-08-movil-inicio');
  await mp.getByRole('button', { name: 'Abrir menú' }).click();
  await mp.getByRole('navigation').getByRole('button', { name: 'Agenda' }).click();
  await mp.getByRole('button', { name: 'Día', exact: true, pressed: true }).waitFor();
  await shot(mp, 'f6-09-movil-agenda');
  await ctx.close();
  console.log('E2E F6 OK');
} catch (err) {
  console.error(err);
  process.exitCode = 1;
} finally {
  await browser.close();
  await stack.stop();
}
