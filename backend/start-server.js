import { spawn, execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const serverPath = join(__dirname, 'server.js');
const PORT = process.env.PORT || '3001';

function freePort(port) {
  try {
    const result = execSync(
      `powershell -Command "Get-NetTCPConnection -LocalPort ${port} -ErrorAction SilentlyContinue | Where-Object { $_.OwningProcess -ne 0 } | Select-Object -ExpandProperty OwningProcess"`,
      { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
    ).trim();
    if (result) {
      const pids = [...new Set(result.split(/\r?\n/).map(Number).filter(Boolean))];
      for (const pid of pids) {
        try { execSync(`taskkill /PID ${pid} /F`, { stdio: 'pipe' }); } catch {}
      }
      console.log(`🔓 Puerto ${port} liberado (PIDs: ${pids.join(', ')})`);
    }
  } catch {}
}

console.log('🚀 Iniciando servidor mainds...');
console.log('📁 Ruta:', serverPath);

freePort(PORT);

const env = { ...process.env, PORT };

let restartCount = 0;
const MAX_RESTARTS = 10;

function startChild() {
  const child = spawn('node', [serverPath], {
    cwd: __dirname,
    env,
    stdio: 'inherit',
    shell: false
  });

  child.on('error', (err) => {
    console.error('❌ Error al iniciar servidor:', err);
    process.exit(1);
  });

  child.on('exit', (code, signal) => {
    if (signal === 'SIGTERM' || signal === 'SIGINT') return; // salida limpia
    console.log(`⚠️ Servidor terminado con código ${code} y señal ${signal}`);
    restartCount++;
    if (restartCount > MAX_RESTARTS) {
      console.error('💥 Demasiados reinicios, abortando.');
      process.exit(1);
    }
    const delay = Math.min(2000 * restartCount, 30000);
    console.log(`🔄 Reiniciando en ${delay / 1000}s... (intento ${restartCount}/${MAX_RESTARTS})`);
    setTimeout(() => {
      freePort(PORT);
      startChild();
    }, delay);
  });

  return child;
}

let currentChild = startChild();

process.on('SIGINT', () => {
  console.log('\n👋 Deteniendo servidor...');
  currentChild.kill('SIGTERM');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n👋 Deteniendo servidor...');
  currentChild.kill('SIGTERM');
  process.exit(0);
});
