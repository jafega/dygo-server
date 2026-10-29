// E2E F2: recepción crea paciente → lo asigna → reserva sala → la psicóloga
// escribe historia y una anotación privada → el director solo ve la historia →
// el titular ve los accesos en el registro.
//
//   node e2e/business/f2.spec.mjs
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
      { key: 'dir', name: 'Diego Director', email: 'dir@clinic.local', role: 'director_clinico' },
      { key: 'p1', name: 'Paula Psicóloga', email: 'paula@clinic.local', role: 'psicologo' },
      { key: 'rec', name: 'Rosa Recepción', email: 'rosa@clinic.local', role: 'recepcion', psych: false }
    ]
  });
  const loc = await srv.request('POST', `${base}/locations`, { token: u.owner.token, body: { name: 'Sede Centro' } });
  await srv.request('POST', `${base}/rooms`, { token: u.owner.token, body: { location_id: loc.body.location.id, name: 'Despacho 1' } });

  // Miércoles de la semana actual a las 10:00 (la agenda abre en la semana actual).
  const now = new Date();
  const monday = new Date(now); monday.setHours(0, 0, 0, 0); monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  const wed = new Date(monday); wed.setDate(monday.getDate() + 2);
  const wedStr = `${wed.getFullYear()}-${String(wed.getMonth() + 1).padStart(2, '0')}-${String(wed.getDate()).padStart(2, '0')}`;

  // ── Recepción ──
  {
    const ctx = await loggedInContext(browser, u.rec);
    const page = await ctx.newPage();
    await page.goto(APP_URL);
    // No es psicóloga y solo usa mainds por la clínica: entra directamente en ella.
    await page.getByTestId('clinic-workspace').waitFor({ timeout: 30_000 });
    const nav = page.getByRole('navigation');
    assert(await nav.getByRole('button', { name: 'Registro de accesos' }).count() === 0, 'recepción sin auditoría');
    await nav.getByRole('button', { name: 'Pacientes' }).click();
    await page.getByRole('button', { name: 'Nuevo paciente' }).click();
    const dlg = page.getByRole('dialog');
    await dlg.getByLabel('Nombre *').fill('Laura');
    await dlg.getByLabel('Apellidos').fill('Gómez');
    await dlg.getByLabel('Teléfono').fill('600111222');
    await dlg.getByLabel('Profesional').selectOption({ label: 'Paula Psicóloga' });
    await dlg.getByRole('button', { name: 'Crear' }).click();
    await page.getByRole('heading', { name: 'Laura Gómez' }).waitFor();
    // Recepción no tiene pestaña de historia clínica.
    assert(await page.getByRole('button', { name: 'Historia clínica' }).count() === 0, 'recepción sin historia');
    await shot(page, 'f2-01-recepcion-ficha');

    await nav.getByRole('button', { name: 'Agenda' }).click();
    await page.getByRole('button', { name: 'Nueva cita' }).click();
    const f = page.getByRole('dialog');
    await f.getByLabel('Profesional').selectOption({ label: 'Paula Psicóloga' });
    await f.getByLabel('Paciente').selectOption({ label: 'Laura Gómez' });
    await f.getByLabel('Día').fill(wedStr);
    await f.getByLabel('Hora').fill('10:00');
    await f.getByLabel('Sala').selectOption({ label: 'Despacho 1 · Sede Centro' });
    await f.getByLabel('Precio (€)').fill('60');
    await f.getByRole('button', { name: 'Guardar' }).click();
    await page.getByRole('button', { name: /Laura Gómez/ }).first().waitFor();
    await shot(page, 'f2-02-agenda-cita');

    // Segunda cita en la misma sala y hora: la agenda lo impide.
    await page.getByRole('button', { name: 'Nueva cita' }).click();
    const f2 = page.getByRole('dialog');
    await f2.getByLabel('Profesional').selectOption({ label: 'Diego Director' });
    await f2.getByLabel('Paciente').selectOption({ label: 'Laura Gómez' });
    await f2.getByLabel('Día').fill(wedStr);
    await f2.getByLabel('Hora').fill('10:15');
    await f2.getByLabel('Sala').selectOption({ label: 'Despacho 1 · Sede Centro' });
    await f2.getByRole('button', { name: 'Guardar' }).click();
    await f2.getByText('La sala ya está ocupada en ese horario.').waitFor();
    await shot(page, 'f2-03-sala-ocupada');
    await ctx.close();
  }

  // ── Psicóloga: historia y anotación privada ──
  {
    const ctx = await loggedInContext(browser, u.p1);
    const page = await ctx.newPage();
    await page.goto(APP_URL);
    await page.getByTestId('workspace-switcher').getByRole('button', { name: 'Centro Mar Azul' }).click();
    await page.getByTestId('clinic-workspace').waitFor();
    await page.getByRole('navigation').getByRole('button', { name: 'Pacientes' }).click();
    await page.getByRole('button', { name: /Laura Gómez/ }).click();
    await page.getByRole('button', { name: 'Historia clínica' }).click();
    await page.getByPlaceholder('Evolución, intervención, plan…').fill('Primera sesión: ansiedad ante exámenes. Plan TCC.');
    await page.getByRole('button', { name: 'Añadir nota' }).click();
    await page.getByText('Primera sesión: ansiedad ante exámenes. Plan TCC.').waitFor();
    await page.getByRole('button', { name: 'Mis anotaciones privadas' }).click();
    await page.getByPlaceholder('Impresiones personales, hipótesis…').fill('NOTA-PRIVADA-PAULA: intuyo un tema familiar');
    await page.getByRole('button', { name: 'Añadir nota' }).click();
    await page.getByText('NOTA-PRIVADA-PAULA: intuyo un tema familiar').waitFor();
    await shot(page, 'f2-04-psicologa-privadas');
    await ctx.close();
  }

  // ── Director: ve la historia, nunca la privada ──
  {
    const ctx = await loggedInContext(browser, u.dir);
    const page = await ctx.newPage();
    await page.goto(APP_URL);
    await page.getByTestId('workspace-switcher').getByRole('button', { name: 'Centro Mar Azul' }).click();
    await page.getByRole('navigation').getByRole('button', { name: 'Pacientes' }).click();
    await page.getByRole('button', { name: /Laura Gómez/ }).click();
    await page.getByRole('button', { name: 'Historia clínica' }).click();
    await page.getByText('Primera sesión: ansiedad ante exámenes. Plan TCC.').waitFor();
    assert(await page.getByText('NOTA-PRIVADA-PAULA', { exact: false }).count() === 0, 'el director no ve la privada');
    await page.getByRole('button', { name: 'Mis anotaciones privadas' }).click();
    await page.getByText('Todavía no hay notas.').waitFor();
    await shot(page, 'f2-05-director-historia');
    await ctx.close();
  }

  // ── Titular: registro de accesos ──
  {
    const ctx = await loggedInContext(browser, u.owner);
    const page = await ctx.newPage();
    await page.goto(APP_URL);
    await page.getByTestId('workspace-switcher').getByRole('button', { name: 'Centro Mar Azul' }).click();
    await page.getByRole('navigation').getByRole('button', { name: 'Registro de accesos' }).click();
    await page.getByText('Leyó la historia clínica').first().waitFor();
    assert(await page.getByText('Diego Director').count() > 0, 'aparece el director');
    await shot(page, 'f2-06-auditoria');
    // El titular no clínico ve el acceso de emergencia, no la historia.
    await page.getByRole('navigation').getByRole('button', { name: 'Pacientes' }).click();
    await page.getByRole('button', { name: /Laura Gómez/ }).click();
    await page.getByRole('button', { name: 'Historia clínica' }).click();
    await page.getByText('Acceso de emergencia a la historia clínica').waitFor();
    assert(await page.getByText('Primera sesión', { exact: false }).count() === 0, 'el titular no ve la historia sin motivo');
    await shot(page, 'f2-07-titular-emergencia');
    await ctx.close();
  }
  console.log('E2E F2 OK');
} catch (err) {
  console.error(err);
  process.exitCode = 1;
} finally {
  await browser.close();
  await stack.stop();
}
