import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    server: {
      port: 5173,
      host: '0.0.0.0',
      proxy: {
        '/api': {
          target: 'http://localhost:3001',
          changeOrigin: true
        },
        '/api-abacate': {
          target: 'https://api.abacatepay.com',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api-abacate/, '')
        }
      }
    },
    plugins: [react()],
    define: {
      'process.env.BUILD_TIME': JSON.stringify(new Date().toISOString())
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      }
    }
  };
});
