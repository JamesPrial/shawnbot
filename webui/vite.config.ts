import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Polyfill for esbuild's TextEncoder check in test environment
if (typeof global !== 'undefined' && typeof global.TextEncoder === 'undefined') {
  try {
    const { TextEncoder, TextDecoder } = require('util');
    Object.assign(global, { TextEncoder, TextDecoder });
  } catch {
    // Fallback polyfill
  }
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
        secure: false,
      },
      '/health': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
        secure: false,
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/__tests__/setup.ts',
  },
});
