import { defineConfig } from 'vite';
import path from 'path';
import fs from 'node:fs';

const workspaceRoot = path.resolve(__dirname);
const resolvedWorkspaceRoot =
  typeof (fs.realpathSync as { native?: (p: string) => string }).native === 'function'
    ? (fs.realpathSync as { native: (p: string) => string }).native(workspaceRoot)
    : fs.realpathSync(workspaceRoot);
const allowedFsRoots = Array.from(new Set([workspaceRoot, resolvedWorkspaceRoot]));

export default defineConfig({
  base: process.env.BASE_URL || '/',
  root: 'public',
  publicDir: false,
  server: {
    port: 5174,
    host: '0.0.0.0',
    allowedHosts: true,
    // [LAW:one-source-of-truth] Dev-server filesystem access is centralized
    // here so every harness/browser lane resolves the same source roots.
    fs: {
      allow: allowedFsRoots,
    },
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
