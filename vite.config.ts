import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  base: process.env.BASE_URL || '/',
  root: 'public',
  publicDir: false,
  server: {
    port: 5174,
    host: '0.0.0.0',
    allowedHosts: true,
  },
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    // [LAW:single-enforcer] Build-warning normalization is centralized at the Vite boundary.
    chunkSizeWarningLimit: 6000,
    rollupOptions: {
      onwarn(warning, warn) {
        // Ignore third-party "use client" directive noise from bundled dependencies.
        if (
          warning.code === 'MODULE_LEVEL_DIRECTIVE' &&
          typeof warning.id === 'string' &&
          warning.id.includes('node_modules')
        ) {
          return;
        }
        warn(warning);
      },
    },
  },
  resolve: {
    alias: {
      '/src': path.resolve(__dirname, 'src'),
    },
  },
  optimizeDeps: {
    include: [],
  },
});
