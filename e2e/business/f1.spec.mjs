// E2E F1: crear clínica → invitar → aceptar desde otra cuenta → cambiar de
// espacio. Y un Pro sin clínica no ve nada nuevo.
//
//   node e2e/business/f1.spec.mjs
import { chromium, startStack, loggedInContext, shot, assert, APP_URL, openCreateClinic } from './helpers.mjs';

const stack = await startStack({ BUSINESS_BETA_EMAILS: 'olga@clinic.local' });
const browser = await chromium.launch();
try {
  const { backend } = stack;
  const owner = await backend.createUser({ name: 'Olga Titular', email: 'olga@clinic.local', role: 'PSYCHOLOGIST' });
  const ana = await backend.createUser({ name: 'Ana Psicóloga', email: 'ana@clinic.local', role: 'PSYCHOLOGIST' });
  const pro = await backend.createUser({ name: 'Pedro Pro', email: 'pedro@pro.local', role: 'PSYCHOLOGIST' });

  // ── Pro sin clínica ni beta: ningún selector de espacio ──
  {
    const ctx = await loggedInContext(browser, pro);
    const page = await ctx.newPage();
    await page.goto(APP_URL);
    await page.getByText('Mi Diario Personal').first().waitFor({ timeout: 30_000 });
    await page.waitForTimeout(1500); // da tiempo a /api/org/me
    assert(await page.getByTestId('workspace-switcher').count() === 0, 'un Pro sin clínica no debe ver el selector');
    await shot(page, 'f1-01-pro-sin-cambios');
    await ctx.close();
  }

  // ── Titular: crea la clínica e invita a Ana ──
  let inviteUrl;
  {
    const ctx = await loggedInContext(browser, owner);
    const page = await ctx.newPage();
    await page.goto(APP_URL);
    await page.getByText('Mi Diario Personal').first().waitFor({ timeout: 30_000 });
    await page.waitForTimeout(1500); // da tiempo a /api/org/me
    // Beta sin clínica: tampoco ve el selector; la clínica se crea desde Ajustes.
    assert(await page.getByTestId('workspace-switcher').count() === 0, 'sin clínica no hay selector, aunque esté en la beta');
    await shot(page, 'f1-02-titular-sin-selector');
    await openCreateClinic(page, owner);
    await page.getByPlaceholder('Centro de Psicología Mar Azul').fill('Centro Mar Azul');
    await page.getByLabel(/Acepto, en nombre de la clínica/).check();
    await shot(page, 'f1-03-crear-clinica');
    await page.getByRole('button', { name: 'Crear clínica' }).last().click();
    await page.getByTestId('clinic-workspace').waitFor({ timeout: 15_000 });
    await page.getByRole('heading', { name: 'Centro Mar Azul' }).waitFor();
    assert(await page.getByText('Prueba gratuita: quedan 14 días').count() === 1, 'banner de prueba');
    await shot(page, 'f1-04-clinica-inicio');

    await page.getByRole('navigation').getByRole('button', { name: 'Equipo' }).click();
    await page.getByRole('button', { name: 'Invitar' }).click();
    await page.locator('input[type=email]').fill('ana@clinic.local');
    await page.getByRole('button', { name: 'Enviar invitación' }).click();
    const linkInput = page.locator('input[readonly]').first();
    await linkInput.waitFor();
    inviteUrl = await linkInput.inputValue();
    assert(inviteUrl.includes('?org_invite='), 'enlace de invitación');
    await shot(page, 'f1-05-invitacion-creada');

    // Volver a la consulta personal: la vista Pro de siempre.
    await page.getByTestId('workspace-switcher').getByRole('button', { name: 'Mi consulta', exact: true }).click();
    await page.getByText('Mi Diario Personal').first().waitFor();
    await ctx.close();
  }

  // ── Ana abre el enlace, acepta y alterna entre espacios ──
  {
    const ctx = await loggedInContext(browser, ana);
    const page = await ctx.newPage();
    await page.goto(inviteUrl);
    await page.getByRole('dialog').getByText('Invitación a una clínica').waitFor({ timeout: 30_000 });
    assert(!page.url().includes('org_invite'), 'el token se limpia de la URL');
    await shot(page, 'f1-06-ana-invitacion');
    await page.getByRole('button', { name: 'Aceptar y entrar' }).click();
    await page.getByTestId('clinic-workspace').waitFor({ timeout: 15_000 });
    await page.getByText('Psicólogo/a', { exact: false }).first().waitFor();
    // Una psicóloga no ve Suscripción.
    assert(await page.getByRole('navigation').getByRole('button', { name: 'Suscripción' }).count() === 0, 'psicóloga sin Suscripción');
    await shot(page, 'f1-07-ana-en-clinica');

    await page.getByTestId('workspace-switcher').getByRole('button', { name: 'Mi consulta', exact: true }).click();
    await page.getByText('Mi Diario Personal').first().waitFor();
    await page.getByTestId('workspace-switcher').getByRole('button', { name: 'Centro Mar Azul' }).click();
    await page.getByTestId('clinic-workspace').waitFor();
    // Recordar el espacio: al recargar sigue en la clínica.
    await page.reload();
    await page.getByTestId('clinic-workspace').waitFor({ timeout: 30_000 });
    await shot(page, 'f1-08-ana-recarga');
    await ctx.close();
  }
  console.log('E2E F1 OK');
} catch (err) {
  console.error(err);
  process.exitCode = 1;
} finally {
  await browser.close();
  await stack.stop();
}
