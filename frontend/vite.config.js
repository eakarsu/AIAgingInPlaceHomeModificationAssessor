import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const backendPort = Number.parseInt(process.env.BACKEND_PORT, 10) || 3201;
const frontendPort = Number.parseInt(process.env.FRONTEND_PORT, 10) || 5273;

export default defineConfig({
  plugins: [react({ include: /\.(js|jsx)$/ })],
  esbuild: {
    loader: 'jsx',
    include: [/src\/.*\.jsx?$/],
    exclude: [],
  },
  optimizeDeps: {
    esbuildOptions: {
      loader: { '.js': 'jsx' },
    },
  },
  server: {
    port: frontendPort,
    strictPort: true,
    proxy: {
      '/api': {
        target: `http://127.0.0.1:${backendPort}`,
        changeOrigin: true,
      },
    },
  },
});
