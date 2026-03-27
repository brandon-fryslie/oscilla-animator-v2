import { defineConfig, type Plugin, type ResolvedConfig } from 'vite';
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
const localFsRoots = [workspaceRoot, cwdRoot, pwdRoot].filter((value): value is string => Boolean(value));
const gitWorktreeRoots = readGitWorktreeRoots(workspaceRoot);
const extraFsRootsEnabled = gitWorktreeRoots.some((candidate) => !localFsRoots.includes(candidate));
const allowedFsRoots = Array.from(
  new Set(
    [...localFsRoots, ...gitWorktreeRoots]
      .filter((value): value is string => Boolean(value))
      .flatMap((candidate) => [candidate, readRealpath(candidate)])
  )
);
const devServerHost = extraFsRootsEnabled ? '127.0.0.1' : '0.0.0.0';
const devAllowedHosts = extraFsRootsEnabled ? ['127.0.0.1', 'localhost'] : true;

const crossOriginIsolationHeaders = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
} as const;

function emitCoiServiceWorker(): Plugin {
  let resolvedConfig: ResolvedConfig | null = null;
  const sourceFile = path.resolve(workspaceRoot, 'public', 'coi-serviceworker.js');
  return {
    name: 'emit-coi-service-worker',
    apply: 'build',
    configResolved(config) {
      resolvedConfig = config;
    },
    closeBundle() {
      if (!resolvedConfig) {
        return;
      }
      // [LAW:one-source-of-truth] Build output location is read from resolved
      // Vite config so service-worker emission stays aligned with one outDir.
      const outDir = path.resolve(resolvedConfig.root, resolvedConfig.build.outDir);
      const destinationFile = path.resolve(outDir, 'coi-serviceworker.js');
      fs.copyFileSync(sourceFile, destinationFile);
    },
  };
}

export default defineConfig({
  base: process.env.BASE_URL || '/',
  root: 'public',
  publicDir: false,
  plugins: [emitCoiServiceWorker()],
  worker: {
    // [LAW:single-enforcer] Worker bundling format is centralized here so
    // compile-worker wasm code-splitting uses one valid Rollup output mode.
    format: 'es',
  },
  server: {
    port: 5784,
    host: devServerHost,
    allowedHosts: devAllowedHosts,
    // [LAW:single-enforcer] SharedArrayBuffer capability is enforced at the
    // HTTP boundary so worker ABI availability does not vary by caller.
    headers: crossOriginIsolationHeaders,
    // [LAW:one-source-of-truth] Dev-server filesystem access is centralized
    // here so every harness/browser lane resolves the same source roots,
    // including sibling git worktrees that source maps can legitimately target.
    // [LAW:single-enforcer] When extra roots are enabled, this same boundary
    // also narrows host exposure so @fs access stays local-only.
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
      input: {
        main: path.resolve(__dirname, 'public', 'index.html'),
        'payload-tester': path.resolve(__dirname, 'public', 'payload-tester.html'),
      },
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
