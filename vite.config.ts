import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  root: 'public',
  publicDir: false,
  server: {
    port: 5174,
  },
  build: {
    outDir: '../dist',
    emptyOutDir: true,
  },
  resolve: {
    alias: {
      '/src': path.resolve(__dirname, 'src'),
      // Resolve npm-linked jspanel4 from local fork
      'jspanel4/es6module/jspanel.js': path.resolve(
        process.env.HOME || '',
        'code/brandon-fryslie_jsPanel4/es6module/jspanel.js'
      ),
      'jspanel4/dist/jspanel.css': path.resolve(
        process.env.HOME || '',
        'code/brandon-fryslie_jsPanel4/dist/jspanel.css'
      ),
      'jspanel4': path.resolve(
        process.env.HOME || '',
        'code/brandon-fryslie_jsPanel4'
      ),
    },
  },
  // Ensure linked packages are properly optimized
  optimizeDeps: {
    include: [],
    exclude: ['jspanel4'],
  },
});
