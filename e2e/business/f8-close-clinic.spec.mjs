// E2E F8: la titular cierra su centro y sigue como psicóloga en mainds pro.
// Ajustes → Cerrar la clínica (confirmando el nombre) → vuelve a su consulta Pro;
// la clínica queda "cerrada" (solo lectura) y la psicóloga del equipo pierde el acceso.
//
//   node e2e/business/f8-close-clinic.spec.mjs
import { chromium, startStack, loggedInContext, shot, assert, APP_URL } from './helpers.mjs';
import { setupClinic } from '../../backend/test/business/helpers.js';

const stack = await startStack({ BUSINESS_BETA_EMAILS: 'olga@f8.local' });
const browser = await chromium.launch();
try {
  const srv = stack.backend;
  const { base, users: u } = await setupClinic(srv, {
    owner: { name: 'Olga Martín', email: 'olga@f8.local', isClinical: true },
    name: 'Centro Olga',
    members: [{ key: 'paula', name: 'Paula', email: 'paula@f8.local', role: 'psicologo' }]
  });

  const ctx = await loggedInContext(browser, u.owner);
  const page = await ctx.newPage();
  await page.goto(APP_URL);
  await page.getByTestId('workspace-switcher').getByRole('button', { name: 'Centro Olga' }).click();
  await page.getByRole('navigation').getByRole('button', { name: 'Ajustes' }).click();
  const zone = page.getByTestId('close-clinic');
  await zone.getByText('Tu consulta personal de mainds pro y su suscripción no cambian.').waitFor();
  await zone.getByRole('button', { name: 'Cerrar Centro Olga' }).click();
  const confirmBtn = zone.getByRole('button', { name: 'Cerrar definitivamente' });
  assert(await confirmBtn.isDisabled(), 'sin el nombre no se puede cerrar');
  await zone.getByLabel('Nombre de la clínica para confirmar').fill('Centro Olga');
  await shot(page, 'f8-01-cerrar-clinica');
  await confirmBtn.click();

  // De vuelta en su consulta Pro.
  await page.getByTestId('clinic-workspace').waitFor({ state: 'detached' });
  await page.getByRole('button', { name: 'Mi Perfil Profesional' }).first().waitFor();
  await page.getByTestId('workspace-switcher').getByText('cerrada').waitFor();
  await shot(page, 'f8-02-de-vuelta-en-pro');

  // La clínica cerrada se consulta en solo lectura.
  await page.getByTestId('workspace-switcher').getByRole('button', { name: /Centro Olga/ }).click();
  await page.getByText('La clínica está cerrada').waitFor();
  await shot(page, 'f8-03-clinica-cerrada');
  await ctx.close();

  // La psicóloga del equipo ya no la ve.
  const me = (await srv.request('GET', '/api/org/me', { token: u.paula.token })).body;
  assert(me.memberships.length === 0, 'el equipo pierde el acceso');
  assert((await srv.request('GET', base, { token: u.paula.token })).status === 404, 'sin acceso a la clínica');
  console.log('E2E F8 OK');
} catch (err) {
  console.error(err);
  process.exitCode = 1;
} finally {
  await browser.close();
  await stack.stop();
}
