#!/usr/bin/env node

// Renderer/runtime-shell baseline verification gate.
//
// [LAW:single-enforcer] This is the ONE command that answers "is the
// renderer/runtime shell baseline green enough to verify Three-migration work?"
// Future migration tickets run this instead of ad hoc manual checks, so the
// answer is mechanical, not a matter of opinion.
// [LAW:no-silent-failure] Every gate runs, every result is reported explicitly,
// and any failure makes the whole run exit non-zero. A skipped or swallowed
// gate would let a red baseline masquerade as green for downstream tickets.
//
// Contract: design-docs/three-migration-renderer-shell-baseline.md

import { execSync, spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

// [LAW:one-source-of-truth] The renderer-shell targeted test set is exactly the
// tests covering the canonical "Keep" surfaces named in
// design-docs/three-migration-renderer-seam-inventory.md: runtime lifecycle
// (RuntimeService, AnimationLoop), compile/hot-swap (CompileOrchestrator,
// LiveRecompile), and render-facade fault policy (renderer-circuit-breaker).
// It is declared here once; the doc points back to this list, not a copy.
const RENDERER_SHELL_TESTS = [
  'src/services/__tests__/RuntimeService.test.ts',
  'src/services/__tests__/AnimationLoop.test.ts',
  'src/services/__tests__/runtime-gpu-fault-policy.test.ts',
  'src/services/__tests__/CompileOrchestrator.schedule-contract.test.ts',
  'src/services/__tests__/LiveRecompile.test.ts',
  'src/render/webgpu/__tests__/renderer-circuit-breaker.test.ts',
];

// [LAW:one-source-of-truth] The app-shell smoke check is the existing
// demo-bootstrap spec: it boots the real app shell, asserts the runtime
// bootstrap probe reaches "succeeded", and asserts at least one rendered frame.
const SMOKE_SPEC = 'tests/e2e/editor/demo-bootstrap.spec.ts';

const ARTIFACT_DIR = 'artifacts/three-migration/renderer-shell-baseline';
const ARTIFACT_FILE = path.join(ARTIFACT_DIR, 'summary.json');

// The three gates, in order. Each is one self-contained promise about one
// dimension of the baseline. [LAW:decomposition]
const GATES = [
  {
    id: 'typecheck',
    title: 'TypeScript typecheck (tsc -b)',
    command: 'pnpm',
    args: ['-s', 'typecheck'],
  },
  {
    id: 'runtime-tests',
    title: 'Targeted renderer/runtime-shell tests',
    command: 'pnpm',
    args: ['-s', 'exec', 'vitest', 'run', ...RENDERER_SHELL_TESTS, '--reporter=dot'],
  },
  {
    id: 'app-shell-smoke',
    title: 'App-shell smoke (demo-bootstrap)',
    command: 'pnpm',
    args: ['-s', 'exec', 'playwright', 'test', SMOKE_SPEC, '--reporter=line'],
  },
];

function currentCommit() {
  try {
    return execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}

function runGate(gate) {
  process.stdout.write(`\n=== gate: ${gate.id} — ${gate.title} ===\n`);
  const startedAt = Date.now();
  const result = spawnSync(gate.command, gate.args, {
    stdio: 'inherit',
    env: process.env,
  });
  const durationMs = Date.now() - startedAt;

  // [LAW:no-silent-failure] A missing binary or killed process is a gate
  // failure with a named reason, never a pass-through.
  if (result.error) {
    return { id: gate.id, title: gate.title, passed: false, durationMs, reason: result.error.message };
  }
  if (result.signal) {
    return { id: gate.id, title: gate.title, passed: false, durationMs, reason: `terminated by signal ${result.signal}` };
  }
  return {
    id: gate.id,
    title: gate.title,
    passed: result.status === 0,
    durationMs,
    reason: result.status === 0 ? null : `exit status ${result.status}`,
  };
}

function formatDuration(ms) {
  return `${(ms / 1000).toFixed(1)}s`;
}

function main() {
  const commit = currentCommit();
  const results = GATES.map(runGate);
  const allPassed = results.every((r) => r.passed);

  // [LAW:verifiable-goals] Emit a machine-readable artifact so downstream
  // tickets (e.g. ThreeForkRenderer integration) can assert the baseline state
  // mechanically rather than re-deriving it.
  mkdirSync(ARTIFACT_DIR, { recursive: true });
  const summary = {
    baseline: 'renderer-shell',
    generated_at: new Date().toISOString(),
    commit,
    passed: allPassed,
    gates: results.map((r) => ({
      id: r.id,
      title: r.title,
      passed: r.passed,
      duration_ms: r.durationMs,
      reason: r.reason,
    })),
  };
  writeFileSync(ARTIFACT_FILE, `${JSON.stringify(summary, null, 2)}\n`);

  process.stdout.write('\n================ RENDERER-SHELL BASELINE ================\n');
  for (const r of results) {
    const status = r.passed ? 'PASS' : 'FAIL';
    const reason = r.reason ? `  (${r.reason})` : '';
    process.stdout.write(`  [${status}] ${r.id.padEnd(16)} ${formatDuration(r.durationMs).padStart(7)}${reason}\n`);
  }
  process.stdout.write(`  artifact: ${ARTIFACT_FILE}\n`);
  process.stdout.write(`  commit:   ${commit}\n`);
  process.stdout.write('=========================================================\n');
  process.stdout.write(`RENDERER-SHELL BASELINE: ${allPassed ? 'PASS' : 'FAIL'}\n`);

  process.exit(allPassed ? 0 : 1);
}

main();
