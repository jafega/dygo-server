import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
        proxy: {
          '/api': {
            target: 'http://localhost:3001',
            changeOrigin: true,
          }
        }
      },
      plugins: [react()],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },
      build: {
        rollupOptions: {
          output: {
            manualChunks(id) {
              // Recharts + D3 — heavy, only used in InsightsPanel (already lazy)
              if (id.includes('node_modules/recharts') || id.includes('node_modules/d3') || id.includes('node_modules/victory-vendor')) {
                return 'vendor-charts';
              }
              // Google AI SDK — only used in genaiService, loaded lazily via components
              if (id.includes('node_modules/@google/genai') || id.includes('node_modules/@google/generative-ai')) {
                return 'vendor-genai';
              }
              // Supabase client
              if (id.includes('node_modules/@supabase')) {
                return 'vendor-supabase';
              }
              // pdfjs — very heavy, only used in document panels
              if (id.includes('node_modules/pdfjs-dist')) {
                return 'vendor-pdfjs';
              }
              // Lucide icons
              if (id.includes('node_modules/lucide-react')) {
                return 'vendor-icons';
              }
              // Everything else in node_modules → shared vendor chunk
              if (id.includes('node_modules/')) {
                return 'vendor';
              }
            }
          }
        }
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
