import { describe, expect, it } from 'vitest';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const REPO_ROOT = process.cwd();
const READINESS_SCRIPT = path.resolve(REPO_ROOT, 'scripts/webgpu-migration-readiness.mjs');

function runReadinessCheck(env: NodeJS.ProcessEnv): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync('node', [READINESS_SCRIPT], {
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      ...env,
    },
    encoding: 'utf8',
  });
  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

describe('webgpu migration readiness checker', () => {
  it('computes ready verdict for normalized migration-proof artifacts', async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), 'readiness-ok-'));
    const reportPath = path.join(tempDir, 'readiness.json');

    try {
      const result = runReadinessCheck({ WEBGPU_READINESS_REPORT: reportPath });
      expect(result.status).toBe(0);

      const report = JSON.parse(await readFile(reportPath, 'utf8')) as {
        overall: string;
        gates: Record<string, { passed: boolean }>;
      };

      expect(report.overall).toBe('ready');
      expect(report.gates.G1?.passed).toBe(true);
      expect(report.gates.G2?.passed).toBe(true);
      expect(report.gates.G3?.passed).toBe(true);
      expect(report.gates.G4?.passed).toBe(true);
      expect(report.gates.G5?.passed).toBe(true);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it('fails deterministically when an artifact regresses to non-terminal status', async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), 'readiness-fail-'));
    const proofDir = path.join(tempDir, 'migration-proof');
    const reportPath = path.join(tempDir, 'readiness.json');

    try {
      await cp(path.resolve(REPO_ROOT, 'migration-proof'), proofDir, { recursive: true });

      const w2Path = path.join(proofDir, 'w2-slotmeta-runtime-removal.json');
      const w2 = JSON.parse(await readFile(w2Path, 'utf8')) as Record<string, unknown>;
      w2.status = 'slice_completed';
      await writeFile(w2Path, JSON.stringify(w2, null, 2));

      const result = runReadinessCheck({
        WEBGPU_READINESS_PROOF_DIR: proofDir,
        WEBGPU_READINESS_REPORT: reportPath,
      });

      expect(result.status).toBe(1);

      const report = JSON.parse(await readFile(reportPath, 'utf8')) as {
        overall: string;
        gates: Record<string, { passed: boolean }>;
      };
      expect(report.overall).toBe('not_ready');
      expect(report.gates.G1?.passed).toBe(false);
      expect(report.gates.G5?.passed).toBe(false);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});
