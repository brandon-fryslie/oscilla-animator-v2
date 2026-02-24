#!/usr/bin/env node

import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const PROOF_DIR = process.env.WEBGPU_READINESS_PROOF_DIR ?? 'migration-proof';
const OUTPUT_REPORT = process.env.WEBGPU_READINESS_REPORT ?? 'artifacts/webgpu-migration-readiness.json';

const TERMINAL_STATUSES = new Set(['completed', 'blocked']);
const REQUIRED_FIELDS = [
  'workstream',
  'title',
  'status',
  'timestamp_utc',
  'commit',
  'laws',
  'scope',
  'verification',
  'static_scans',
];

const GATE_SPECS = {
  G1: {
    name: 'Canonical Runtime Data Model',
    workstreams: ['W2', 'W3', 'W4', 'W7', 'W8', 'W12', 'W14'],
    owner: 'runtime+compiler',
  },
  G2: {
    name: 'Deterministic Execution Semantics',
    workstreams: ['W4', 'W5', 'W6', 'W13'],
    owner: 'runtime+compiler',
  },
  G3: {
    name: 'Renderer Contract Hardness',
    workstreams: ['W9', 'W10'],
    owner: 'renderer+runtime',
  },
  G4: {
    name: 'Browser Qualification And Performance',
    workstreams: ['W15'],
    owner: 'browser-matrix',
  },
};

const REQUIRED_WORKSTREAMS = Array.from({ length: 15 }, (_, i) => `W${i + 1}`);

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeWorkstream(value) {
  return typeof value === 'string' ? value.trim().toUpperCase() : '';
}

function createBlocker(gateId, reason, owner, nextAction) {
  return {
    gate: gateId,
    reason,
    owner,
    next_action: nextAction,
  };
}

function validateArtifactSchema(file, artifact) {
  const issues = [];

  if (!isObject(artifact)) {
    issues.push(`${file}: root must be an object`);
    return issues;
  }

  for (const field of REQUIRED_FIELDS) {
    if (!(field in artifact)) {
      issues.push(`${file}: missing required field ${field}`);
    }
  }

  if (typeof artifact.commit !== 'string' || artifact.commit.trim().length === 0) {
    issues.push(`${file}: commit must be a non-empty string`);
  }

  if (!TERMINAL_STATUSES.has(artifact.status)) {
    issues.push(`${file}: status must be one of ${Array.from(TERMINAL_STATUSES).join(', ')}`);
  }

  if (!Array.isArray(artifact.verification)) {
    issues.push(`${file}: verification must be an array`);
  }

  if (!Array.isArray(artifact.static_scans)) {
    issues.push(`${file}: static_scans must be an array`);
  }

  if (artifact.status === 'blocked') {
    const blockers = asArray(artifact.blockers);
    if (blockers.length === 0) {
      issues.push(`${file}: blocked status requires non-empty blockers[]`);
    }
    for (const [index, blocker] of blockers.entries()) {
      if (!isObject(blocker)) {
        issues.push(`${file}: blockers[${index}] must be an object`);
        continue;
      }
      if (typeof blocker.reason !== 'string' || blocker.reason.trim().length === 0) {
        issues.push(`${file}: blockers[${index}].reason is required`);
      }
      if (typeof blocker.owner !== 'string' || blocker.owner.trim().length === 0) {
        issues.push(`${file}: blockers[${index}].owner is required`);
      }
      if (typeof blocker.next_action !== 'string' || blocker.next_action.trim().length === 0) {
        issues.push(`${file}: blockers[${index}].next_action is required`);
      }
    }
  }

  return issues;
}

async function loadArtifacts(proofDir) {
  const entries = await readdir(proofDir);
  const files = entries.filter((entry) => entry.endsWith('.json')).sort();

  const artifacts = new Map();
  const issues = [];

  for (const file of files) {
    const abs = path.resolve(proofDir, file);
    const raw = await readFile(abs, 'utf8');
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      issues.push(`${file}: invalid JSON (${error instanceof Error ? error.message : String(error)})`);
      continue;
    }

    const ws = normalizeWorkstream(parsed.workstream);
    if (!ws) {
      issues.push(`${file}: missing or invalid workstream`);
      continue;
    }

    if (artifacts.has(ws)) {
      issues.push(`${file}: duplicate artifact for workstream ${ws}`);
      continue;
    }

    artifacts.set(ws, {
      file,
      artifact: parsed,
    });

    issues.push(...validateArtifactSchema(file, parsed));
  }

  return {
    files,
    artifacts,
    schemaIssues: issues,
  };
}

function evaluateWorkstreamGate(gateId, spec, artifactsByWorkstream) {
  const failures = [];
  const evidence = [];

  for (const ws of spec.workstreams) {
    const entry = artifactsByWorkstream.get(ws);
    if (!entry) {
      failures.push(`missing artifact for ${ws}`);
      continue;
    }
    const status = entry.artifact.status;
    evidence.push({ workstream: ws, file: entry.file, status });
    if (status !== 'completed') {
      failures.push(`${ws} is ${status}, expected completed`);
    }
  }

  // [LAW:verifiable-goals] Gate pass/fail is deterministic from explicit workstream status evidence.
  const passed = failures.length === 0;
  return { gate: gateId, name: spec.name, passed, failures, evidence };
}

function evaluateG4Extras(artifactsByWorkstream) {
  const failures = [];
  const entry = artifactsByWorkstream.get('W15');
  if (!entry) {
    failures.push('missing artifact for W15');
    return failures;
  }

  const results = entry.artifact.results;
  const chromium = isObject(results) ? results.chromium : undefined;
  const chromiumPassed = isObject(chromium) ? chromium.passed === true : false;

  if (!chromiumPassed) {
    failures.push('W15 chromium gating lane is not passed');
  }

  return failures;
}

function evaluateG5(artifactsByWorkstream, schemaIssues) {
  const failures = [...schemaIssues];

  for (const ws of REQUIRED_WORKSTREAMS) {
    if (!artifactsByWorkstream.has(ws)) {
      failures.push(`missing required artifact ${ws}`);
    }
  }

  // [LAW:one-source-of-truth] G5 enforces one normalized artifact schema across all proof files.
  const passed = failures.length === 0;
  const evidence = REQUIRED_WORKSTREAMS.map((ws) => {
    const entry = artifactsByWorkstream.get(ws);
    return {
      workstream: ws,
      file: entry?.file ?? null,
      status: entry?.artifact.status ?? null,
    };
  });

  return {
    gate: 'G5',
    name: 'Evidence Integrity',
    passed,
    failures,
    evidence,
  };
}

function buildBlockers(gates) {
  const blockers = [];
  for (const gate of gates) {
    if (gate.passed) {
      continue;
    }

    const owner =
      gate.gate === 'G5'
        ? 'migration-proof'
        : gate.gate === 'G4'
          ? 'browser-matrix'
          : GATE_SPECS[gate.gate]?.owner ?? 'unknown';

    for (const failure of gate.failures) {
      blockers.push(
        createBlocker(
          gate.gate,
          failure,
          owner,
          `Resolve ${gate.gate} failure and regenerate readiness report`,
        ),
      );
    }
  }
  return blockers;
}

async function main() {
  const proofDir = path.resolve(PROOF_DIR);
  const outputPath = path.resolve(OUTPUT_REPORT);

  const loaded = await loadArtifacts(proofDir);
  const gates = [];

  for (const gateId of ['G1', 'G2', 'G3', 'G4']) {
    const spec = GATE_SPECS[gateId];
    const gate = evaluateWorkstreamGate(gateId, spec, loaded.artifacts);
    if (gateId === 'G4') {
      gate.failures.push(...evaluateG4Extras(loaded.artifacts));
      gate.passed = gate.failures.length === 0;
    }
    gates.push(gate);
  }

  gates.push(evaluateG5(loaded.artifacts, loaded.schemaIssues));

  // [LAW:no-mode-explosion] Canonical readiness verdict is a single ready/not_ready state.
  const overall = gates.every((gate) => gate.passed) ? 'ready' : 'not_ready';
  const blockers = buildBlockers(gates);

  const report = {
    readiness_version: '2026-02-24.v1',
    generated_at_utc: new Date().toISOString(),
    source: {
      proof_dir: path.relative(process.cwd(), proofDir) || '.',
      artifact_count: loaded.files.length,
    },
    gates: Object.fromEntries(
      gates.map((gate) => [
        gate.gate,
        {
          name: gate.name,
          passed: gate.passed,
          failures: gate.failures,
          evidence: gate.evidence,
        },
      ]),
    ),
    blockers,
    overall,
  };

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, JSON.stringify(report, null, 2));

  process.stdout.write(`[readiness] report written: ${outputPath}\n`);
  for (const gate of gates) {
    process.stdout.write(`[readiness] ${gate.gate} ${gate.passed ? 'PASS' : 'FAIL'} (${gate.failures.length} failures)\n`);
  }
  process.stdout.write(`[readiness] overall=${overall}\n`);

  // [LAW:single-enforcer] This checker is the sole pass/fail enforcer for migration readiness verdicts.
  if (overall !== 'ready') {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`[readiness] failed: ${message}\n`);
  process.exit(1);
});
