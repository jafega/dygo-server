// E2E F7: Business a demanda. Con BUSINESS_SELF_SERVE un psicólogo sin clínica
// ve Pro igual (sin selector de espacio); en Ajustes (modal del perfil) tiene
// "Crear una clínica";
// al crearla entra en su clínica y aparece el selector. Un paciente no ve nada.
//
//   node e2e/business/f7-self-serve.spec.mjs
import { chromium, startStack, loggedInContext, shot, assert, APP_URL } from './helpers.mjs';

const stack = await startStack({ BUSINESS_BETA_EMAILS: '', BUSINESS_SELF_SERVE: 'true' });
const browser = await chromium.launch();
try {
  const srv = stack.backend;
  const psico = await srv.createUser({ name: 'Paula Martín', email: 'paula@f7.local', role: 'PSYCHOLOGIST' });

  const ctx = await loggedInContext(browser, psico);
  const page = await ctx.newPage();
  await page.goto(APP_URL);
  await page.getByRole('button', { name: 'Mi Perfil Profesional' }).first().waitFor({ timeout: 30000 });
  // Pro igual que antes: sin selector de espacio.
  await page.waitForTimeout(1500);
  assert(await page.getByTestId('workspace-switcher').count() === 0, 'sin clínica no hay selector de espacio');
  await shot(page, 'f7-01-pro-sin-cambios');

  // Ni en Mi Perfil ni en el menú: la oferta vive en Ajustes (modal del perfil).
  await page.getByRole('button', { name: 'Mi Perfil Profesional' }).first().click();
  await page.waitForTimeout(800);
  assert(await page.getByTestId('business-offer').count() === 0, 'Mi Perfil no muestra la oferta');
  await page.getByRole('button', { name: /paula@f7\.local/ }).first().click();
  const offer = page.getByTestId('business-offer');
  await offer.waitFor();
  await offer.scrollIntoViewIfNeeded();
  await shot(page, 'f7-02-oferta-en-ajustes');
  await offer.getByRole('button', { name: 'Crear una clínica' }).click();
  await page.getByPlaceholder('Centro de Psicología Mar Azul').fill('Centro Paula Martín');
  await page.getByLabel(/Acepto, en nombre/).check();
  await page.getByRole('button', { name: 'Crear clínica' }).last().click();
  await page.getByTestId('clinic-workspace').waitFor();
  await page.getByRole('heading', { name: 'Centro Paula Martín' }).waitFor();
  assert(await page.getByTestId('workspace-switcher').count() === 1, 'con clínica aparece el selector');
  await shot(page, 'f7-03-clinica-creada');
  await ctx.close();

  // Un paciente no ve ni selector ni oferta.
  const paciente = await srv.createUser({ name: 'Pedro Paciente', email: 'pedro@f7.local' });
  const pctx = await loggedInContext(browser, paciente);
  const pp = await pctx.newPage();
  await pp.goto(APP_URL);
  await pp.waitForTimeout(4000);
  assert(await pp.getByTestId('workspace-switcher').count() === 0, 'el paciente no ve el selector');
  assert(await pp.getByTestId('business-offer').count() === 0, 'el paciente no ve la oferta');
  await pctx.close();
  console.log('E2E F7 OK');
} catch (err) {
  console.error(err);
  process.exitCode = 1;
} finally {
  await browser.close();
  await stack.stop();
}
