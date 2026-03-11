import fs from 'node:fs/promises';
import path from 'node:path';

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const value = argv[i + 1];
    if (value === undefined || value.startsWith('--')) {
      args[key] = true;
      continue;
    }
    args[key] = value;
    i += 1;
  }
  return args;
}

async function readJson(filePath) {
  const raw = await fs.readFile(filePath, 'utf8');
  return JSON.parse(raw);
}

function formatPct(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 'n/a';
  return `${numeric.toLocaleString('en-US', { maximumSignificantDigits: 4 })}%`;
}

function formatValue(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 'n/a';
  return numeric.toLocaleString('en-US', { maximumSignificantDigits: 6 });
}

function formatPolicyNotice(gate) {
  return typeof gate?.policyNotice === 'string' && gate.policyNotice.length > 0
    ? gate.policyNotice
    : 'MANDATORY: changed-file gate policy notice missing from delta JSON.';
}

function formatPolicySummary(gate) {
  return typeof gate?.policySummary === 'string' && gate.policySummary.length > 0
    ? gate.policySummary
    : `under threshold OR >= ${formatPct(gate?.minImprovementPct)} improvement`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const deltaJsonPath = args['delta-json'];
  if (!deltaJsonPath) {
    console.error('usage: node scripts/complexity/assert-file-gates.mjs --delta-json <path>');
    process.exit(1);
  }

  const delta = await readJson(path.resolve(deltaJsonPath));
  const gate = delta.fileThresholdGate;
  if (!gate) {
    console.error('changed-file threshold gate not found in delta JSON');
    process.exit(1);
  }

  if (gate.passed) {
    console.log(
      [
        `changed-file threshold gate passed`,
        `tracked files=${gate.trackedChangedFilesCount ?? 0}`,
        `checks=${gate.evaluationCount}`,
        `failures=${gate.failureCount}`,
        `required improvement=${formatPct(gate.minImprovementPct)}`,
        `policy=${formatPolicySummary(gate)}`,
      ].join(' | '),
    );
    // [LAW:one-source-of-truth] Emit the canonical policy lock notice from delta JSON so the CI log matches the enforced policy.
    console.log(`policy lock=${formatPolicyNotice(gate)}`);
    return;
  }

  const rows = Array.isArray(gate.failures) ? gate.failures : [];
  console.error('changed-file threshold gate FAILED');
  console.error(
    [
      `tracked files=${gate.trackedChangedFilesCount ?? 0}`,
      `checks=${gate.evaluationCount}`,
      `failures=${gate.failureCount}`,
      `required improvement=${formatPct(gate.minImprovementPct)}`,
      `policy=${formatPolicySummary(gate)}`,
    ].join(' | '),
  );
  // [LAW:one-source-of-truth] Emit the canonical policy lock notice from delta JSON so the CI log matches the enforced policy.
  console.error(`policy lock=${formatPolicyNotice(gate)}`);
  for (const row of rows.slice(0, 80)) {
    console.error(
      [
        `${row.filePath}`,
        `${row.metricLabel}`,
        `base=${formatValue(row.baseValue)}`,
        `head=${formatValue(row.headValue)}`,
        `threshold=${row.direction === 'higher' ? '>=' : '<='}${formatValue(row.threshold)}`,
        `improvement=${formatPct(row.improvementPct)}`,
      ].join(' | '),
    );
  }
  process.exit(1);
}

await main();
