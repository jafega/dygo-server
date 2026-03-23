let app;
let importError;

try {
  const mod = await import('../backend/server.js');
  app = mod.default;
} catch (err) {
  importError = err;
  console.error('❌ [Vercel] Failed to load server.js:', err?.message || err);
  console.error(err?.stack || '');
}

export const config = {
  api: {
    bodyParser: false
  }
};

export default function handler(req, res) {
  if (importError || !app) {
    return res.status(500).json({
      error: 'Server initialization failed',
      details: importError?.message || 'app module did not export a handler',
      stack: process.env.NODE_ENV !== 'production' ? importError?.stack : undefined
    });
  }
  return app(req, res);
}
