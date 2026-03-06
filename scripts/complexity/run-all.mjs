import path from 'node:path';
import { reportsDir, runCommand, runnerRoot, writeJson, writeText } from './_shared.mjs';

const runSummaryJson = path.join(reportsDir, 'run-all.json');
const runSummaryMd = path.join(reportsDir, 'run-all.md');

const steps = [
  { key: 'eslint', label: 'ESLint + SonarJS', script: path.join(runnerRoot, 'scripts/complexity/eslint-complexity.mjs'), optional: false },
  { key: 'tsMorph', label: 'ts-morph AST metrics', script: path.join(runnerRoot, 'scripts/complexity/ts-morph-metrics.mjs'), optional: false },
  { key: 'dependencyCruiser', label: 'dependency-cruiser', script: path.join(runnerRoot, 'scripts/complexity/dependency-cruiser-report.mjs'), optional: false },
  { key: 'plato', label: 'Plato', script: path.join(runnerRoot, 'scripts/complexity/plato-report.mjs'), optional: false },
  { key: 'typhon', label: 'TyphonJS ESComplex', script: path.join(runnerRoot, 'scripts/complexity/typhon-report.mjs'), optional: false },
  { key: 'sonar', label: 'Sonar scanner', script: path.join(runnerRoot, 'scripts/complexity/sonar-report.mjs'), optional: true },
  { key: 'compare', label: 'Comparison summary', script: path.join(runnerRoot, 'scripts/complexity/compare-reports.mjs'), optional: false },
];

async function main() {
  const runs = [];

  for (const step of steps) {
    const startedAt = new Date().toISOString();
    const result = await runCommand('node', [step.script], { allowFailure: true });
    const finishedAt = new Date().toISOString();

    runs.push({
      key: step.key,
      label: step.label,
      script: path.relative(runnerRoot, step.script),
      optional: step.optional,
      status: result.ok ? 'ok' : 'failed',
      exitCode: result.code,
      startedAt,
      finishedAt,
      stdoutTail: result.stdout.split('\n').slice(-20).filter(Boolean),
      stderrTail: result.stderr.split('\n').slice(-20).filter(Boolean),
    });
  }

  const failures = runs.filter((run) => run.status === 'failed' && !run.optional);
  const summary = {
    generatedAt: new Date().toISOString(),
    failures: failures.map((run) => ({ key: run.key, label: run.label, exitCode: run.exitCode })),
    runs,
  };

  await writeJson(runSummaryJson, summary);

  const md = [
    '# Complexity Toolchain Run Summary',
    '',
    `Generated: ${summary.generatedAt}`,
    '',
    '| Step | Status | Optional | Exit |',
    '| --- | --- | --- | ---: |',
    ...runs.map((run) => `| ${run.label} | ${run.status} | ${run.optional ? 'yes' : 'no'} | ${run.exitCode} |`),
    '',
  ].join('\n');

  await writeText(runSummaryMd, md);
  console.log(`wrote ${runSummaryJson}`);
  console.log(`wrote ${runSummaryMd}`);

  if (failures.length > 0) {
    process.exitCode = 1;
  }
}

await main();
