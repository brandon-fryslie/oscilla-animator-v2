import { defineConfig } from 'vite';
import path from 'path';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

function readRealpath(candidate: string): string {
  try {
    if (typeof (fs.realpathSync as { native?: (p: string) => string }).native === 'function') {
      return (fs.realpathSync as { native: (p: string) => string }).native(candidate);
    }
    return fs.realpathSync(candidate);
  } catch {
    return candidate;
  }
}

function readGitWorktreeRoots(repoRoot: string): string[] {
  try {
    const output = execFileSync('git', ['worktree', 'list', '--porcelain'], {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return output
      .split('\n')
      .filter((line) => line.startsWith('worktree '))
      .map((line) => line.slice('worktree '.length).trim())
      .filter((value) => value.length > 0);
  } catch {
    return [];
  }
}

const workspaceRoot = path.resolve(__dirname);
const cwdRoot = path.resolve(process.cwd());
const pwdRoot = process.env.PWD ? path.resolve(process.env.PWD) : null;
const gitWorktreeRoots = readGitWorktreeRoots(workspaceRoot);
const allowedFsRoots = Array.from(
  new Set(
    [workspaceRoot, cwdRoot, pwdRoot, ...gitWorktreeRoots]
      .filter((value): value is string => Boolean(value))
      .flatMap((candidate) => [candidate, readRealpath(candidate)])
  )
);

const crossOriginIsolationHeaders = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
} as const;

export default defineConfig({
  base: process.env.BASE_URL || '/',
  root: 'public',
  publicDir: false,
  worker: {
    // [LAW:single-enforcer] Worker bundling format is centralized here so
    // compile-worker wasm code-splitting uses one valid Rollup output mode.
    format: 'es',
  },
  server: {
    port: 5784,
    host: '0.0.0.0',
    allowedHosts: true,
    // [LAW:single-enforcer] SharedArrayBuffer capability is enforced at the
    // HTTP boundary so worker ABI availability does not vary by caller.
    headers: crossOriginIsolationHeaders,
    // [LAW:one-source-of-truth] Dev-server filesystem access is centralized
    // here so every harness/browser lane resolves the same source roots,
    // including sibling git worktrees that source maps can legitimately target.
    fs: {
      allow: allowedFsRoots,
    },
  },
  preview: {
    // [LAW:single-enforcer] Preview must enforce the same SAB prerequisites
    // as dev so runtime capabilities do not vary by serve mode.
    headers: crossOriginIsolationHeaders,
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
