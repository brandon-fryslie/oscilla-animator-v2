#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const ROOT_DIR = process.cwd();
const PROOF_DIR = path.resolve(ROOT_DIR, 'migration-proof');
const REPORT_PATH = path.resolve(
  process.env.WEBGPU_READINESS_REPORT ?? 'artifacts/webgpu-readiness.json',
);

// [LAW:one-source-of-truth] One canonical map for required W1..W15 artifacts.
const WORKSTREAM_FILES = {
  W1: 'w1-memory-model.json',
  W2: 'w2-slotmeta-runtime-removal.json',
  W3: 'w3-handle-hotpath.json',
  W4: 'w4-state-f32-phase.json',
  W5: 'w5-effects-as-data.json',
  W6: 'w6-evaluator-unification.json',
  W7: 'w7-storage-abi-cleanup.json',
  W8: 'w8-shape-bank.json',
  W9: 'w9-renderer-sink.json',
  W10: 'w10-webgpu-contract.json',
  W11: 'w11-api-surface.json',
  W12: 'w12-address-bypass-ban.json',
  W13: 'w13-continuity-segments.json',
  W14: 'w14-cpu-soa-parity.json',
  W15: 'w15-browser-matrix-perf.json',
};

const GATE_WORKSTREAMS = {
  G1: ['W2', 'W3', 'W4', 'W7', 'W8', 'W12', 'W14'],
  G2: ['W4', 'W5', 'W6', 'W13'],
  G3: ['W9', 'W10'],
  G4: ['W15'],
  G5: Object.keys(WORKSTREAM_FILES),
};

const BROWSER_POLICY_FILES = [
  'docs/WEBGPU-DESIGN-PREREQUISITES-2026-02-22.md',
  'docs/WEBGPU-MIGRATION-READINESS-REBOOT-2026-02-24.md',
  'design-docs/_new/renderer/12-webgpu-v3-migration.md',
  'scripts/webgpu-browser-matrix.mjs',
  'migration-proof/w10-webgpu-contract.json',
  'migration-proof/w15-browser-matrix-perf.json',
];

const BANNED_BROWSER_TERMS = [
  { label: 'Safari', regex: /(?:^|[^a-z])safari(?:[^a-z]|$)/i },
  { label: 'WebKit', regex: /(?:^|[^a-z])webkit(?:[^a-z]|$)/i },
];

function isoNow() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function isTerminalStatus(status) {
  return status === 'completed' || status === 'blocked';
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function createBlocker(gate, code, message, workstream = null) {
  return { gate, code, message, workstream };
}

async function readJsonFile(filePath) {
  const raw = await readFile(filePath, 'utf8');
  return JSON.parse(raw);
}

async function collectBrowserPolicyHits(rootDir) {
  const hits = [];
  for (const relativePath of BROWSER_POLICY_FILES) {
    const absolutePath = path.resolve(rootDir, relativePath);
    let text;
    try {
      text = await readFile(absolutePath, 'utf8');
    } catch {
      continue;
    }

    for (const term of BANNED_BROWSER_TERMS) {
      if (term.regex.test(text)) {
        hits.push({ file: relativePath, term: term.label });
      }
    }
  }
  return hits;
}

function hasZeroExitVerification(artifact) {
  const verifications = asArray(artifact.verification);
  return (
    verifications.length > 0 &&
    verifications.every((entry) => Number(entry.exit_code) === 0)
  );
}

function buildGateResult(blockers, evidence = {}) {
  return {
    passed: blockers.length === 0,
    blockers,
    evidence,
  };
}

function findStaticScanResult(artifact, commandIncludes) {
  const scans = asArray(artifact.static_scans);
  const hit = scans.find((scan) => String(scan.command ?? '').includes(commandIncludes));
  return hit?.result ?? null;
}

async function main() {
  const generatedAt = isoNow();
  const artifacts = {};
  const allBlockers = [];

  for (const [workstream, fileName] of Object.entries(WORKSTREAM_FILES)) {
    const filePath = path.join(PROOF_DIR, fileName);
    try {
      artifacts[workstream] = await readJsonFile(filePath);
    } catch (error) {
      artifacts[workstream] = null;
      allBlockers.push(
        createBlocker(
          'G5',
          'missing_artifact',
          `${workstream} artifact is missing or unreadable: ${fileName}`,
          workstream,
        ),
      );
    }
  }

  const gates = {};

  {
    const gateBlockers = [];
    for (const workstream of GATE_WORKSTREAMS.G1) {
      const artifact = artifacts[workstream];
      if (!artifact || artifact.status !== 'completed') {
        gateBlockers.push(
          createBlocker(
            'G1',
            'workstream_incomplete',
            `${workstream} must be completed for canonical runtime data model gate`,
            workstream,
          ),
        );
      }
    }

    const w2 = artifacts.W2;
    const w7 = artifacts.W7;
    const w12 = artifacts.W12;

    if (w2 && findStaticScanResult(w2, 'program\\.slotMeta') !== 'no_matches') {
      gateBlockers.push(
        createBlocker(
          'G1',
          'slotmeta_scan_failed',
          'W2 static scan must show no operational program.slotMeta access',
          'W2',
        ),
      );
    }
    if (w7 && findStaticScanResult(w7, 'assertF64Stride') !== 'no_matches') {
      gateBlockers.push(
        createBlocker(
          'G1',
          'legacy_f64_scan_failed',
          'W7 static scan must show no legacy f64 ABI assertions in hot paths',
          'W7',
        ),
      );
    }
    if (w12 && w12.static_scan?.forbidden_in_hot_path !== true) {
      gateBlockers.push(
        createBlocker(
          'G1',
          'address_bypass_guard_missing',
          'W12 must mark direct arenaLayout indexing as forbidden in hot path',
          'W12',
        ),
      );
    }

    gates.G1 = buildGateResult(gateBlockers, {
      workstreams: GATE_WORKSTREAMS.G1,
    });
    allBlockers.push(...gateBlockers);
  }

  {
    const gateBlockers = [];
    for (const workstream of GATE_WORKSTREAMS.G2) {
      const artifact = artifacts[workstream];
      if (!artifact || artifact.status !== 'completed') {
        gateBlockers.push(
          createBlocker(
            'G2',
            'workstream_incomplete',
            `${workstream} must be completed for deterministic execution semantics gate`,
            workstream,
          ),
        );
        continue;
      }
      if (!hasZeroExitVerification(artifact)) {
        gateBlockers.push(
          createBlocker(
            'G2',
            'verification_failed',
            `${workstream} verification set must contain only zero-exit checks`,
            workstream,
          ),
        );
      }
    }
    gates.G2 = buildGateResult(gateBlockers, {
      workstreams: GATE_WORKSTREAMS.G2,
    });
    allBlockers.push(...gateBlockers);
  }

  {
    const gateBlockers = [];
    for (const workstream of GATE_WORKSTREAMS.G3) {
      const artifact = artifacts[workstream];
      if (!artifact || artifact.status !== 'completed') {
        gateBlockers.push(
          createBlocker(
            'G3',
            'workstream_incomplete',
            `${workstream} must be completed for renderer contract gate`,
            workstream,
          ),
        );
      }
    }

    const w10 = artifacts.W10;
    if (w10) {
      const matrixVerification = asArray(w10.verification).find((entry) =>
        String(entry.command ?? '').includes('test:webgpu-matrix'),
      );
      if (!matrixVerification || Number(matrixVerification.exit_code) !== 0) {
        gateBlockers.push(
          createBlocker(
            'G3',
            'matrix_verification_failed',
            'W10 must include successful test:webgpu-matrix verification',
            'W10',
          ),
        );
      }
    }

    gates.G3 = buildGateResult(gateBlockers, {
      workstreams: GATE_WORKSTREAMS.G3,
    });
    allBlockers.push(...gateBlockers);
  }

  {
    const gateBlockers = [];
    const w15 = artifacts.W15;
    let matrixReportPath = null;

    if (!w15 || w15.status !== 'completed') {
      gateBlockers.push(
        createBlocker(
          'G4',
          'workstream_incomplete',
          'W15 must be completed for browser qualification gate',
          'W15',
        ),
      );
    } else {
      matrixReportPath = path.resolve(ROOT_DIR, w15.artifact?.matrix_report ?? '');
      let matrixReport = null;
      try {
        matrixReport = await readJsonFile(matrixReportPath);
      } catch {
        gateBlockers.push(
          createBlocker(
            'G4',
            'matrix_report_missing',
            `Matrix report missing or unreadable: ${w15.artifact?.matrix_report ?? 'unset'}`,
            'W15',
          ),
        );
      }

      if (matrixReport) {
        // [LAW:single-enforcer] Chromium is the only blocking browser gate.
        const chromiumBlocking = asArray(matrixReport.results).find(
          (result) => result.browser === 'chromium' && result.blocking === true,
        );
        if (!matrixReport.passed || !chromiumBlocking || chromiumBlocking.passed !== true) {
          gateBlockers.push(
            createBlocker(
              'G4',
              'chromium_gate_failed',
              'Chromium blocking lane must pass in browser matrix report',
              'W15',
            ),
          );
        }
        if (
          typeof w15.artifact?.report_generated_at === 'string' &&
          w15.artifact.report_generated_at !== matrixReport.generatedAt
        ) {
          gateBlockers.push(
            createBlocker(
              'G4',
              'matrix_report_stale',
              'W15 report_generated_at must match matrix artifact generatedAt',
              'W15',
            ),
          );
        }
      }
    }

    gates.G4 = buildGateResult(gateBlockers, {
      workstreams: GATE_WORKSTREAMS.G4,
      matrix_report: matrixReportPath,
    });
    allBlockers.push(...gateBlockers);
  }

  {
    const gateBlockers = [];
    const requiredKeys = [
      'workstream',
      'title',
      'status',
      'timestamp_utc',
      'commit',
      'laws',
      'scope',
    ];

    for (const workstream of GATE_WORKSTREAMS.G5) {
      const artifact = artifacts[workstream];
      if (!artifact) {
        continue;
      }
      if (!isTerminalStatus(artifact.status)) {
        gateBlockers.push(
          createBlocker(
            'G5',
            'non_terminal_status',
            `${workstream} has non-terminal status '${artifact.status}'`,
            workstream,
          ),
        );
      }
      for (const key of requiredKeys) {
        if (!(key in artifact)) {
          gateBlockers.push(
            createBlocker(
              'G5',
              'schema_missing_key',
              `${workstream} is missing required key '${key}'`,
              workstream,
            ),
          );
        }
      }
      const hasEvidence =
        asArray(artifact.verification).length > 0 ||
        asArray(artifact.static_scans).length > 0 ||
        Boolean(artifact.static_scan) ||
        Boolean(artifact.results) ||
        Boolean(artifact.artifact);
      if (!hasEvidence) {
        gateBlockers.push(
          createBlocker(
            'G5',
            'schema_missing_evidence',
            `${workstream} must include verification/scans/results evidence`,
            workstream,
          ),
        );
      }
    }

    const browserPolicyHits = await collectBrowserPolicyHits(ROOT_DIR);
    for (const hit of browserPolicyHits) {
      gateBlockers.push(
        createBlocker(
          'G5',
          'deprecated_browser_vocab',
          `${hit.file} contains forbidden browser term '${hit.term}'`,
          null,
        ),
      );
    }

    gates.G5 = buildGateResult(gateBlockers, {
      workstreams: GATE_WORKSTREAMS.G5,
      browser_policy_files: BROWSER_POLICY_FILES,
    });
    allBlockers.push(...gateBlockers);
  }

  // [LAW:verifiable-goals] One deterministic verdict from fixed gate outcomes.
  const overall = Object.values(gates).every((gate) => gate.passed) ? 'ready' : 'not_ready';

  const report = {
    readiness_version: '1.0.0',
    generated_at_utc: generatedAt,
    overall,
    gates,
    blockers: allBlockers,
  };

  await mkdir(path.dirname(REPORT_PATH), { recursive: true });
  await writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);

  process.stdout.write(`[readiness] report: ${REPORT_PATH}\n`);
  process.stdout.write(`[readiness] overall: ${overall}\n`);
  for (const [gateName, gate] of Object.entries(gates)) {
    process.stdout.write(`[readiness] ${gateName}: ${gate.passed ? 'PASS' : 'FAIL'}\n`);
  }

  if (overall !== 'ready') {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`[readiness] failed: ${message}\n`);
  process.exit(1);
});
