// automation-runner.js — un único cron para todas las campañas de activación.
//
// Se ejecuta cada hora. Deliberadamente es un solo cron y no uno por campaña:
// así el límite de crons de Vercel no crece con cada secuencia nueva, y sobre
// todo se puede garantizar el "un email por usuario y ejecución", que sería
// imposible con procesos separados compitiendo entre sí.
//
// La lógica vive en backend/utils/automation.js. Aquí solo está la puerta.
//
// Pruebas:
//   GET /api/automation-runner?dryRun=1            → qué se enviaría y por qué
//   GET /api/automation-runner?dryRun=1&user=<id>  → limitado a un usuario

import { runAutomations } from '../backend/utils/automation.js';

export const config = { api: { bodyParser: true } };

export default async function handler(req, res) {
  const auth = req.headers['authorization'];
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const dryRun = String(req.query?.dryRun || '') === '1';
  const soloUsuario = req.query?.user ? String(req.query.user) : null;

  try {
    const resultado = await runAutomations({ dryRun, soloUsuario });
    if (!resultado.ok) return res.status(500).json({ error: resultado.reason });

    console.log(`[automation-runner] ${resultado.enviados} email(s) enviados de ${resultado.candidatos} candidato(s)`
      + (dryRun ? ' [simulación]' : '')
      + (resultado.errores?.length ? ` | ${resultado.errores.length} error(es)` : ''));

    return res.status(200).json(resultado);
  } catch (err) {
    console.error('[automation-runner] error:', err?.message || err);
    return res.status(500).json({ error: err?.message || 'runner falló' });
  }
}
