// E2E F4: formulario en /c/:slug (sin sesión) → aparece en la bandeja →
// asignar → convertir en paciente. Widget embebible (?embed=1) dentro de un iframe.
//
//   node e2e/business/f4.spec.mjs
import { chromium, startStack, loggedInContext, shot, assert, APP_URL } from './helpers.mjs';
import { setupClinic } from '../../backend/test/business/helpers.js';

const stack = await startStack({ BUSINESS_BETA_EMAILS: 'olga@clinic.local' });
const browser = await chromium.launch();
try {
  const srv = stack.backend;
  const { base, org, users: u } = await setupClinic(srv, {
    owner: { name: 'Olga Titular', email: 'olga@clinic.local' },
    name: 'Centro Mar Azul',
    members: [
      { key: 'ana', name: 'Ana López', email: 'ana@clinic.local', role: 'psicologo' },
      { key: 'rec', name: 'Rosa Recepción', email: 'rosa@clinic.local', role: 'recepcion', psych: false }
    ]
  });
  await srv.request('PUT', `${base}/public-page`, { token: u.owner.token, body: { enabled: true, headline: 'Psicología para adultos y parejas', description: 'Somos un equipo de psicólogas sanitarias en el centro de Vigo.', specialties: ['Ansiedad', 'Pareja', 'Duelo'], city: 'Vigo', contact_phone: '986000000' } });
  await srv.request('PUT', `${base}/members/me/public-profile`, { token: u.ana.token, body: { visible: true, display_name: 'Ana López', bio: 'Psicóloga sanitaria. Terapia cognitivo-conductual.', specialties: ['Ansiedad'], accepts_leads: true } });

  // ── Visitante anónimo en la página pública ──
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'es-ES' });
    const page = await ctx.newPage();
    await page.goto(`${APP_URL}/c/${org.slug}?utm_source=google&utm_campaign=otono`);
    await page.getByRole('heading', { name: 'Centro Mar Azul' }).waitFor({ timeout: 30_000 });
    await page.getByText('Ana López').first().waitFor();
    assert(await page.getByText('ana@clinic.local').count() === 0, 'nunca se publica el email del profesional');
    await shot(page, 'f4-01-pagina-publica');
    await page.getByLabel('Nombre *').fill('Marta Vidal');
    await page.getByLabel('Teléfono').fill('600123456');
    await page.getByLabel('¿En qué podemos ayudarte?').fill('Ansiedad en el trabajo desde hace meses.');
    await page.getByLabel('Profesional').selectOption({ label: 'Ana López' });
    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: 'Enviar solicitud' }).click();
    await page.getByText('¡Solicitud enviada!').waitFor();
    await shot(page, 'f4-02-solicitud-enviada');

    // Widget dentro de un iframe en "otra web".
    await page.setContent(`<html><body style="background:#f1f5f9;padding:24px"><h1>Web de la clínica</h1><iframe id="w" src="${APP_URL}/c/${org.slug}?embed=1" style="width:520px;height:720px;border:0"></iframe></body></html>`);
    const frame = page.frameLocator('#w');
    await frame.getByRole('button', { name: 'Enviar solicitud' }).waitFor({ timeout: 30_000 });
    assert(await frame.getByRole('heading', { name: 'Centro Mar Azul' }).count() === 0, 'el widget solo muestra el formulario');
    await shot(page, 'f4-03-widget-iframe');
    await ctx.close();
  }

  // ── Recepción: bandeja → convertir ──
  {
    const ctx = await loggedInContext(browser, u.rec);
    const page = await ctx.newPage();
    await page.goto(APP_URL);
    await page.getByTestId('clinic-workspace').waitFor({ timeout: 30_000 });
    await page.getByRole('navigation').getByRole('button', { name: 'Captación' }).click();
    await page.getByRole('button', { name: /Marta Vidal/ }).click();
    const dlg = page.getByRole('dialog');
    await dlg.getByText('Ansiedad en el trabajo desde hace meses.').waitFor();
    await dlg.getByText(/google/).waitFor();
    assert(await dlg.getByLabel('Profesional asignado').inputValue() !== '', 'asignada a quien eligió');
    await dlg.getByRole('button', { name: 'Contactado' }).click();
    await dlg.getByRole('button', { name: 'Convertir en paciente' }).click();
    await dlg.getByText('Ya es paciente: búscalo en Pacientes.').waitFor();
    await shot(page, 'f4-04-lead-convertido');
    await dlg.getByRole('button', { name: 'Cerrar' }).click();
    await page.getByRole('navigation').getByRole('button', { name: 'Pacientes' }).click();
    await page.getByRole('button', { name: /Marta Vidal/ }).waitFor();
    assert(await page.getByText('Captado por la clínica').count() > 0, 'origen: captado por la clínica');
    await shot(page, 'f4-05-paciente-captado');
    await ctx.close();
  }
  console.log('E2E F4 OK');
} catch (err) {
  console.error(err);
  process.exitCode = 1;
} finally {
  await browser.close();
  await stack.stop();
}
