// Recorrido exploratorio (no es un test): la titular de un centro que también
// pasa consulta usa mainds business una semana. Capturas en e2e/.shots/explore-*.
import { chromium, startStack, loggedInContext, shot, APP_URL } from './helpers.mjs';
import { DPA } from '../../backend/test/business/helpers.js';

const stack = await startStack({ BUSINESS_BETA_EMAILS: 'olga@centro.local' });
const browser = await chromium.launch();
const srv = stack.backend;
const step = async (page, name, fn) => { try { await fn(); } catch (e) { console.log('FALLO', name, e.message.split('\n')[0]); } await shot(page, `explore-${name}`); };
try {
  const olga = await srv.createUser({ name: 'Olga Martín', email: 'olga@centro.local', role: 'PSYCHOLOGIST' });
  const ctx = await loggedInContext(browser, olga);
  const page = await ctx.newPage();
  page.on('dialog', d => d.accept('Motivo de prueba suficientemente largo para el acceso'));
  await page.goto(APP_URL);
  await page.getByTestId('workspace-switcher').waitFor({ timeout: 30000 });
  await step(page, '01-pro-con-selector', async () => {});
  await step(page, '02-crear-centro', async () => {
    await page.getByTestId('workspace-switcher').getByRole('button', { name: 'Crear clínica' }).click();
    await page.getByPlaceholder('Centro de Psicología Mar Azul').fill('Centro Olga Martín Psicología');
    await page.getByLabel(/Acepto, en nombre/).check();
  });
  await page.getByRole('button', { name: 'Crear clínica' }).last().click();
  await page.getByTestId('clinic-workspace').waitFor();
  await step(page, '03-inicio-vacio', async () => {});
  const nav = page.getByRole('navigation');
  await step(page, '04-agenda-vacia', async () => { await nav.getByRole('button', { name: 'Agenda' }).click(); await page.waitForTimeout(800); });
  await step(page, '05-nueva-cita-sin-pacientes', async () => { await page.getByRole('button', { name: 'Nueva cita' }).click(); await page.waitForTimeout(500); });
  await page.keyboard.press('Escape');
  await page.goto(APP_URL); await page.getByTestId('clinic-workspace').waitFor();
  await step(page, '06-pacientes', async () => { await nav.getByRole('button', { name: 'Pacientes' }).click(); await page.getByRole('button', { name: 'Nuevo paciente' }).click(); });
  await page.getByLabel('Nombre *').fill('Laura'); await page.getByLabel('Apellidos').fill('Gómez');
  await page.getByRole('dialog').getByLabel('Profesional').selectOption({ index: 1 }).catch(() => {});
  await page.getByRole('dialog').getByRole('button', { name: 'Crear' }).click();
  await step(page, '07-ficha-paciente', async () => { await page.getByRole('heading', { name: 'Laura Gómez' }).waitFor(); });
  await step(page, '08-cita', async () => {
    await nav.getByRole('button', { name: 'Agenda' }).click();
    await page.getByRole('button', { name: 'Nueva cita' }).click();
    await page.getByRole('dialog').getByLabel('Paciente').selectOption({ label: 'Laura Gómez' });
  });
  await page.getByRole('dialog').getByRole('button', { name: 'Guardar' }).click();
  await page.waitForTimeout(800);
  await step(page, '09-agenda-con-cita', async () => {});
  await step(page, '10-facturacion', async () => { await nav.getByRole('button', { name: 'Facturación' }).click(); await page.waitForTimeout(600); });
  await step(page, '11-liquidaciones', async () => { await nav.getByRole('button', { name: 'Liquidaciones' }).click(); await page.waitForTimeout(600); });
  await step(page, '12-sidebar-larga', async () => { await nav.getByRole('button', { name: 'Equipo' }).click(); await page.waitForTimeout(600); });

  await step(page, '16-detalle-cita', async () => { await nav.getByRole('button', { name: 'Agenda' }).click(); await page.getByText('Laura Gómez').first().click(); await page.waitForTimeout(500); });
  await page.keyboard.press('Escape');
  await step(page, '17-nueva-factura', async () => { await nav.getByRole('button', { name: 'Facturación' }).click(); await page.getByRole('main').getByRole('button', { name: 'Nueva factura' }).click(); await page.waitForTimeout(600); });
  await step(page, '18-panel', async () => { await nav.getByRole('button', { name: 'Panel de la clínica' }).click(); await page.waitForTimeout(1200); });
  await step(page, '19-captacion', async () => { await nav.getByRole('button', { name: 'Captación' }).click(); await page.waitForTimeout(800); });
  await step(page, '20-historia', async () => { await nav.getByRole('button', { name: 'Pacientes' }).click(); await page.getByText('Laura Gómez').first().click(); await page.getByRole('button', { name: 'Historia clínica' }).click(); await page.waitForTimeout(600); });

  // Móvil: mismo contexto (el último espacio queda guardado en este navegador).
  const mp = await ctx.newPage();
  await mp.setViewportSize({ width: 390, height: 844 });
  await mp.goto(APP_URL);
  await mp.getByTestId('clinic-workspace').waitFor({ timeout: 30000 });
  await step(mp, '13-movil-inicio', async () => {});
  await step(mp, '14-movil-menu', async () => { await mp.getByRole('button', { name: 'Abrir menú' }).click(); await mp.waitForTimeout(400); });
  await step(mp, '15-movil-agenda', async () => { await mp.getByRole('navigation').getByRole('button', { name: 'Agenda' }).click(); await mp.waitForTimeout(800); });
  console.log('EXPLORACION OK');
} catch (e) { console.error(e); } finally { await browser.close(); await stack.stop(); }
