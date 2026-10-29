// E2E F3: cita realizada → factura de la clínica (con QR) → liquidación del mes
// → la psicóloga la valida → emite su factura a la clínica.
//
//   node e2e/business/f3.spec.mjs
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
      { key: 'p1', name: 'Paula Psicóloga', email: 'paula@clinic.local', role: 'psicologo', body: { employment_type: 'freelance', billing_model: 'org_invoices', irpf_rate: 15 } },
      { key: 'rec', name: 'Rosa Recepción', email: 'rosa@clinic.local', role: 'recepcion', psych: false }
    ]
  });
  const api = (m, p, token, body) => srv.request(m, `${base}${p}`, { token, body });
  await api('POST', '/billing-entities', u.owner.token, { legal_name: 'Mar Azul Psicología, S.L.', tax_id: 'B12345674', address: 'Calle Mayor 1', city: 'Madrid' });
  await api('POST', '/commission-rules', u.owner.token, { psych_percent: 60, valid_from: '2020-01-01' });
  const pat = (await api('POST', '/patients', u.rec.token, { first_name: 'Laura', last_name: 'Gómez', tax_id: '12345678Z', assigned_member_ids: [u.p1.memberId] })).body.patient;
  // Cita del mes pasado (el panel de liquidaciones abre en el mes anterior).
  const d = new Date(); d.setDate(10); d.setMonth(d.getMonth() - 1); d.setHours(10, 0, 0, 0);
  const appt = (await api('POST', '/appointments', u.rec.token, { member_id: u.p1.memberId, patient_id: pat.id, starts_at: d.toISOString(), ends_at: new Date(d.getTime() + 50 * 60000).toISOString(), price: 70, modality: 'online' })).body.appointment;
  assert(appt.psych_percent === 60, 'regla congelada');
  await api('PATCH', `/appointments/${appt.id}`, u.rec.token, { status: 'completed' });

  // ── Recepción factura la sesión ──
  {
    const ctx = await loggedInContext(browser, u.rec);
    const page = await ctx.newPage();
    page.on('dialog', dlg => dlg.accept());
    await page.goto(APP_URL);
    await page.getByTestId('clinic-workspace').waitFor({ timeout: 30_000 });
    await page.getByRole('navigation').getByRole('button', { name: 'Facturación' }).click();
    await page.getByRole('button', { name: 'Nueva factura' }).click();
    await page.getByLabel('Paciente').selectOption({ label: 'Laura Gómez' });
    await page.getByRole('checkbox').first().check();
    await page.getByText('70,00 €').first().waitFor();
    await page.getByRole('button', { name: 'Crear borrador' }).click();
    await page.getByRole('dialog').getByText('Borrador de factura').waitFor();
    await page.getByRole('button', { name: 'Emitir factura' }).click();
    await page.getByRole('img', { name: 'QR tributario' }).waitFor({ timeout: 15_000 });
    const yy = String(new Date().getFullYear()).slice(2);
    await page.getByRole('heading', { name: `C${yy}-0001` }).waitFor();
    await shot(page, 'f3-01-factura-clinica');
    await ctx.close();
  }

  // ── Titular: calcula el mes ──
  {
    const ctx = await loggedInContext(browser, u.owner);
    const page = await ctx.newPage();
    await page.goto(APP_URL);
    await page.getByTestId('workspace-switcher').getByRole('button', { name: 'Centro Mar Azul' }).click();
    await page.getByRole('navigation').getByRole('button', { name: 'Liquidaciones' }).click();
    await page.getByRole('button', { name: 'Calcular el mes' }).click();
    await page.getByText('Paula Psicóloga').waitFor();
    await page.getByText('Pendiente de que el profesional la valide.').waitFor();
    await shot(page, 'f3-02-liquidaciones-titular');
    await ctx.close();
  }

  // ── Psicóloga: datos fiscales, valida y emite su factura ──
  {
    const ctx = await loggedInContext(browser, u.p1);
    const page = await ctx.newPage();
    await page.goto(APP_URL);
    await page.getByTestId('workspace-switcher').getByRole('button', { name: 'Centro Mar Azul' }).click();
    await page.getByRole('navigation').getByRole('button', { name: 'Liquidaciones' }).click();
    await page.getByRole('button', { name: 'Mis datos fiscales' }).click();
    await page.getByLabel('Nombre fiscal').fill('Paula Ruiz Martín');
    await page.getByLabel('NIF / NIE').fill('X1234567L');
    await page.getByRole('button', { name: 'Guardar' }).click();
    await page.getByText('Guardado').waitFor();
    await page.getByRole('main').getByRole('button', { name: 'Liquidaciones', exact: true }).click();
    // 60 % de 70 € = 42 €; IRPF 15 % = 6,30 € → 35,70 €
    await page.getByText('42,00 €').first().waitFor();
    await page.getByRole('button', { name: 'Estoy de acuerdo' }).click();
    await page.getByRole('button', { name: 'Emitir mi factura a la clínica' }).click();
    await page.getByText('Factura emitida.').waitFor();
    await shot(page, 'f3-03-liquidacion-facturada');
    await page.getByRole('navigation').getByRole('button', { name: 'Facturación' }).click();
    const yy = String(new Date().getFullYear()).slice(2);
    await page.getByRole('cell', { name: `L${yy}-0001` }).click();
    await page.getByRole('img', { name: 'QR tributario' }).waitFor({ timeout: 15_000 });
    assert(await page.getByText('35,70 €').count() > 0, 'total con IRPF');
    await shot(page, 'f3-04-factura-profesional');
    await ctx.close();
  }
  console.log('E2E F3 OK');
} catch (err) {
  console.error(err);
  process.exitCode = 1;
} finally {
  await browser.close();
  await stack.stop();
}
