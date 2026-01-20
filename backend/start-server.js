import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const serverPath = join(__dirname, 'server.js');

console.log('🚀 Iniciando servidor dygo...');
console.log('📁 Ruta:', serverPath);

const env = { ...process.env, PORT: '3005' };

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
  console.log(`⚠️ Servidor terminado con código ${code} y señal ${signal}`);
  console.log('🔄 Reiniciando en 2 segundos...');
  setTimeout(() => {
    console.log('🔄 Reiniciando servidor...');
    spawn('node', [__filename], {
      cwd: __dirname,
      env: process.env,
      stdio: 'inherit',
      detached: true
    }).unref();
  }, 2000);
});

process.on('SIGINT', () => {
  console.log('\n👋 Deteniendo servidor...');
  child.kill('SIGTERM');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n👋 Deteniendo servidor...');
  child.kill('SIGTERM');
  process.exit(0);
});
