import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { reportsDir, runCommand, runnerRoot, writeJson, writeText } from './_shared.mjs';

const DEFAULT_OUTPUT_ROOT = path.join(reportsDir, 'deltas');

const METRIC_META = {
  eslintErrors: { label: 'ESLint errors', direction: 'lower', signal: 'high', target: '0 (strict gate)', scale: 'count' },
  eslintWarnings: { label: 'ESLint warnings', direction: 'lower', signal: 'medium', target: '0-10 (team policy)', scale: 'count' },
  eslintComplexityHits: { label: 'ESLint cyclomatic rule hits', direction: 'lower', signal: 'high', target: '0', scale: 'count' },
  eslintMaxDepthHits: { label: 'ESLint max-depth hits', direction: 'lower', signal: 'high', target: '0', scale: 'count' },
  eslintMaxLinesPerFunctionHits: { label: 'ESLint max-lines-per-function hits', direction: 'lower', signal: 'medium', target: '0', scale: 'count' },
  eslintMaxParamsHits: { label: 'ESLint max-params hits', direction: 'lower', signal: 'medium', target: '0', scale: 'count' },
  eslintCognitiveHits: { label: 'ESLint cognitive-complexity hits', direction: 'lower', signal: 'high', target: '0', scale: 'count' },

  tsMorphMaxCyclomatic: { label: 'ts-morph max cyclomatic', direction: 'lower', signal: 'high', target: '<= 15 preferred', scale: 'count' },
  tsMorphMaxCognitive: { label: 'ts-morph max cognitive', direction: 'lower', signal: 'high', target: '<= 20 preferred', scale: 'count' },
  tsMorphMaxNesting: { label: 'ts-morph max nesting depth', direction: 'lower', signal: 'high', target: '<= 4 preferred', scale: 'count' },
  tsMorphSourceLocTotal: { label: 'ts-morph total source LOC', direction: 'info', signal: 'low', target: 'context only', scale: 'size' },
  tsMorphMaxHalsteadVolume: { label: 'ts-morph max Halstead volume', direction: 'lower', signal: 'medium', target: 'trend down over time', scale: 'size' },
  tsMorphAvgMi: { label: 'ts-morph average maintainability index', direction: 'higher', signal: 'high', target: '>= 65 good, < 50 risky', scale: 'score' },
  tsMorphMaxFanOut: { label: 'ts-morph max fan-out', direction: 'lower', signal: 'high', target: '<= 15 preferred', scale: 'count' },
  tsMorphMaxFanIn: { label: 'ts-morph max fan-in', direction: 'lower', signal: 'medium', target: 'watch hotspots', scale: 'count' },

  dependencyCruiserErrors: { label: 'dependency-cruiser error violations', direction: 'lower', signal: 'high', target: '0', scale: 'count' },
  dependencyCruiserWarnings: { label: 'dependency-cruiser warning violations', direction: 'lower', signal: 'medium', target: '0', scale: 'count' },
  dependencyCruiserModules: { label: 'dependency-cruiser module count', direction: 'info', signal: 'low', target: 'context only', scale: 'size' },
  dependencyCruiserDependencies: { label: 'dependency-cruiser dependency edges', direction: 'info', signal: 'low', target: 'context only', scale: 'size' },
  dependencyCruiserMaxFanOut: { label: 'dependency-cruiser max fan-out', direction: 'lower', signal: 'high', target: '<= 15 preferred', scale: 'count' },
  dependencyCruiserMaxFanIn: { label: 'dependency-cruiser max fan-in', direction: 'lower', signal: 'medium', target: 'watch hotspots', scale: 'count' },

  platoAvgMaintainability: { label: 'Plato average maintainability', direction: 'higher', signal: 'medium', target: '>= 65 good', scale: 'score' },
  platoMaxCyclomatic: { label: 'Plato max cyclomatic', direction: 'lower', signal: 'medium', target: '<= 15 preferred', scale: 'count' },
  platoAvgHalsteadDifficulty: { label: 'Plato avg Halstead difficulty', direction: 'lower', signal: 'low', target: 'trend down', scale: 'size' },
  platoAvgHalsteadVolume: { label: 'Plato avg Halstead volume', direction: 'lower', signal: 'low', target: 'trend down', scale: 'size' },
  platoTotalLogicalSloc: { label: 'Plato total logical SLOC', direction: 'info', signal: 'low', target: 'context only', scale: 'size' },

  typhonAvgMaintainability: { label: 'Typhon average maintainability', direction: 'higher', signal: 'medium', target: '>= 65 good', scale: 'score' },
  typhonMaxCyclomatic: { label: 'Typhon max cyclomatic', direction: 'lower', signal: 'medium', target: '<= 15 preferred', scale: 'count' },
  typhonAvgHalsteadDifficulty: { label: 'Typhon avg Halstead difficulty', direction: 'lower', signal: 'low', target: 'trend down', scale: 'size' },
  typhonAvgHalsteadVolume: { label: 'Typhon avg Halstead volume', direction: 'lower', signal: 'low', target: 'trend down', scale: 'size' },
  typhonTotalLogicalSloc: { label: 'Typhon total logical SLOC', direction: 'info', signal: 'low', target: 'context only', scale: 'size' },
};

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

function sanitizeLabel(value) {
  return value.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 48);
}

function metricMeta(key) {
  return METRIC_META[key] ?? {
    label: key,
    direction: 'info',
    signal: 'low',
    target: 'context only',
    scale: 'count',
  };
}

function directionLabel(direction) {
  if (direction === 'lower') return 'lower is better';
  if (direction === 'higher') return 'higher is better';
  return 'informational';
}

function classifyDelta(direction, delta) {
  if (direction === 'info' || delta === 0) return 'unchanged';
  if (direction === 'lower') return delta < 0 ? 'improved' : 'regressed';
  if (direction === 'higher') return delta > 0 ? 'improved' : 'regressed';
  return 'unchanged';
}

function classifyMagnitude(scale, baseValue, delta) {
  const absDelta = Math.abs(delta);
  if (absDelta === 0) return 'none';
  if (scale === 'score') {
    if (absDelta < 0.5) return 'tiny';
    if (absDelta < 1.5) return 'small';
    if (absDelta < 3) return 'moderate';
    return 'large';
  }
  const relative = baseValue === 0 ? null : absDelta / Math.max(1, Math.abs(baseValue));
  if (absDelta <= 1 || (relative !== null && relative < 0.01)) return 'tiny';
  if (absDelta <= 3 || (relative !== null && relative < 0.05)) return 'small';
  if (absDelta <= 10 || (relative !== null && relative < 0.15)) return 'moderate';
  return 'large';
}

function summarizeImpact(signal, classification, magnitude) {
  if (classification === 'unchanged' || magnitude === 'none') return 'no meaningful change';
  if (signal === 'high' && (magnitude === 'moderate' || magnitude === 'large')) {
    return classification === 'regressed' ? 'high-priority regression' : 'high-value improvement';
  }
  if (signal === 'medium' && (magnitude === 'moderate' || magnitude === 'large')) {
    return classification === 'regressed' ? 'meaningful regression' : 'meaningful improvement';
  }
  return classification === 'regressed' ? 'minor regression' : 'minor improvement';
}

async function fileExists(filePath) {
  return (await fs.stat(filePath).catch(() => null))?.isFile() ?? false;
}

async function readJson(filePath) {
  const raw = await fs.readFile(filePath, 'utf8');
  return JSON.parse(raw);
}

async function resolveCommit(ref) {
  const run = await runCommand('git', ['rev-parse', '--verify', `${ref}^{commit}`], { allowFailure: true });
  if (!run.ok || !run.stdout.trim()) return null;
  return run.stdout.trim();
}

async function resolveDefaultBaseRef() {
  const upstream = await runCommand(
    'git',
    ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}'],
    { allowFailure: true },
  );
  if (!upstream.ok || !upstream.stdout.trim()) {
    throw new Error('no upstream configured for current branch; pass --base explicitly or set upstream');
  }
  return upstream.stdout.trim();
}

async function runComplexityForCommit(commitSha) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'oscilla-complexity-worktree-'));
  const worktreeDir = path.join(tempDir, 'repo');
  const runAllScriptPath = path.join(runnerRoot, 'scripts/complexity/run-all.mjs');
  const runAllSummaryPath = path.join(worktreeDir, 'reports/complexity/run-all.json');

  const add = await runCommand('git', ['worktree', 'add', '--detach', worktreeDir, commitSha], { allowFailure: true });
  if (!add.ok) {
    throw new Error(`failed to create worktree for ${commitSha}: ${add.stderr || add.stdout}`);
  }

  try {
    // [LAW:one-source-of-truth] Always run the current branch complexity runner against both refs.
    const run = await runCommand('node', [runAllScriptPath], {
      cwd: worktreeDir,
      allowFailure: true,
      env: {
        COMPLEXITY_RUNNER_ROOT: runnerRoot,
        COMPLEXITY_TARGET_ROOT: worktreeDir,
      },
    });
    if (!run.ok) {
      const runAllSummary = (await fileExists(runAllSummaryPath))
        ? await readJson(runAllSummaryPath).catch(() => null)
        : null;
      const failingSteps = Array.isArray(runAllSummary?.runs)
        ? runAllSummary.runs.filter((step) => step.status === 'failed' && step.optional !== true)
        : [];
      const failureDetails = failingSteps
        .map((step) => [
          `step=${step.key} exit=${step.exitCode}`,
          ...(Array.isArray(step.stderrTail) ? step.stderrTail.slice(-10) : []),
        ].join('\n'))
        .join('\n\n');
      const stderrTail = (run.stderr || '').split('\n').slice(-20).join('\n');
      const stdoutTail = (run.stdout || '').split('\n').slice(-20).join('\n');
      throw new Error(
        `complexity toolchain failed for ${commitSha.slice(0, 12)}\nstdout tail:\n${stdoutTail}\nstderr tail:\n${stderrTail}\nfailed steps:\n${failureDetails || 'unknown (run-all summary missing)'}`,
      );
    }

    const summaryPath = path.join(worktreeDir, 'reports/complexity/comparison-summary.json');
    if (!(await fileExists(summaryPath))) {
      throw new Error(`missing comparison summary at ${summaryPath}`);
    }

    return {
      commitSha,
      source: 'local-run',
      summaryPath,
      summary: await readJson(summaryPath),
    };
  } finally {
    await runCommand('git', ['worktree', 'remove', '--force', worktreeDir], { allowFailure: true });
  }
}

function buildDelta(baseSummary, headSummary) {
  const baseHighlights = baseSummary.highlights ?? {};
  const headHighlights = headSummary.highlights ?? {};
  const keys = [...new Set([...Object.keys(baseHighlights), ...Object.keys(headHighlights)])]
    .filter((key) => Number.isFinite(baseHighlights[key]) && Number.isFinite(headHighlights[key]))
    .sort();

  const rows = keys.map((key) => {
    const meta = metricMeta(key);
    const base = Number(baseHighlights[key]);
    const head = Number(headHighlights[key]);
    const delta = head - base;
    const relativeDeltaPct = base === 0 ? null : (delta / Math.abs(base)) * 100;
    const classification = classifyDelta(meta.direction, delta);
    const magnitude = classifyMagnitude(meta.scale, base, delta);
    const impact = summarizeImpact(meta.signal, classification, magnitude);

    return {
      key,
      label: meta.label,
      direction: meta.direction,
      directionLabel: directionLabel(meta.direction),
      signal: meta.signal,
      target: meta.target,
      base,
      head,
      delta,
      relativeDeltaPct,
      classification,
      magnitude,
      impact,
    };
  });

  const improved = rows.filter((row) => row.classification === 'improved');
  const regressed = rows.filter((row) => row.classification === 'regressed');
  const unchanged = rows.filter((row) => row.classification === 'unchanged');
  const highSignalRegressions = regressed.filter((row) => row.signal === 'high').sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).slice(0, 10);
  const highSignalImprovements = improved.filter((row) => row.signal === 'high').sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).slice(0, 10);

  const guide = Object.entries(METRIC_META)
    .map(([key, meta]) => ({ key, ...meta, directionLabel: directionLabel(meta.direction) }))
    .sort((a, b) => a.key.localeCompare(b.key));

  return {
    generatedAt: new Date().toISOString(),
    baseGeneratedAt: baseSummary.generatedAt ?? null,
    headGeneratedAt: headSummary.generatedAt ?? null,
    improvedCount: improved.length,
    regressedCount: regressed.length,
    unchangedCount: unchanged.length,
    score: improved.length - regressed.length,
    rows,
    improved,
    regressed,
    unchanged,
    highSignalRegressions,
    highSignalImprovements,
    guide,
  };
}

function renderDeltaMarkdown(delta, baseLabel, headLabel) {
  const pct = (value) => (Number.isFinite(value) ? `${value.toFixed(2)}%` : 'n/a');
  const rowLine = (row) => {
    const sign = row.delta > 0 ? '+' : '';
    return `| ${row.label} | ${row.base} | ${row.head} | ${sign}${row.delta} | ${pct(row.relativeDeltaPct)} | ${row.magnitude} | ${row.impact} |`;
  };

  const allRows = delta.rows.map((row) => {
    const sign = row.delta > 0 ? '+' : '';
    return `| ${row.key} | ${row.label} | ${row.base} | ${row.head} | ${sign}${row.delta} | ${pct(row.relativeDeltaPct)} | ${row.classification} | ${row.magnitude} | ${row.signal} |`;
  });

  return [
    '# Commit Complexity Delta',
    '',
    `- base: ${baseLabel}`,
    `- head: ${headLabel}`,
    `- base report generated: ${delta.baseGeneratedAt ?? 'unknown'}`,
    `- head report generated: ${delta.headGeneratedAt ?? 'unknown'}`,
    `- improved metrics: ${delta.improvedCount}`,
    `- regressed metrics: ${delta.regressedCount}`,
    `- unchanged / informational metrics: ${delta.unchangedCount}`,
    `- net score (improved - regressed): ${delta.score}`,
    '',
    '## How To Read This',
    '',
    '- Lower-is-better metrics should trend down toward their target; zero is ideal for rule violations.',
    '- Higher-is-better metrics should trend up (for example maintainability index).',
    '- `magnitude` expresses scale: `tiny`, `small`, `moderate`, `large`.',
    '- `impact` combines metric signal strength and magnitude to indicate practical importance.',
    '',
    '## Metric Interpretation Guide',
    '',
    '| Metric | Desired Trend | Practical Target Range | Signal |',
    '| --- | --- | --- | --- |',
    ...delta.guide.map((row) => `| ${row.label} | ${row.directionLabel} | ${row.target} | ${row.signal} |`),
    '',
    '## High-Signal Regressions',
    '',
    '| Metric | Base | Head | Delta (head - base) | % Delta | Magnitude | Impact |',
    '| --- | ---: | ---: | ---: | ---: | --- | --- |',
    ...(delta.highSignalRegressions.length > 0 ? delta.highSignalRegressions.map(rowLine) : ['| none | - | - | - | - | - | - |']),
    '',
    '## High-Signal Improvements',
    '',
    '| Metric | Base | Head | Delta (head - base) | % Delta | Magnitude | Impact |',
    '| --- | ---: | ---: | ---: | ---: | --- | --- |',
    ...(delta.highSignalImprovements.length > 0 ? delta.highSignalImprovements.map(rowLine) : ['| none | - | - | - | - | - | - |']),
    '',
    '## Regressions',
    '',
    '| Metric | Base | Head | Delta (head - base) | % Delta | Magnitude | Impact |',
    '| --- | ---: | ---: | ---: | ---: | --- | --- |',
    ...(delta.regressed.length > 0 ? delta.regressed.map(rowLine) : ['| none | - | - | - | - | - | - |']),
    '',
    '## Improvements',
    '',
    '| Metric | Base | Head | Delta (head - base) | % Delta | Magnitude | Impact |',
    '| --- | ---: | ---: | ---: | ---: | --- | --- |',
    ...(delta.improved.length > 0 ? delta.improved.map(rowLine) : ['| none | - | - | - | - | - | - |']),
    '',
    '## Full Delta Table',
    '',
    '| Key | Metric | Base | Head | Delta (head - base) | % Delta | Classification | Magnitude | Signal |',
    '| --- | --- | ---: | ---: | ---: | ---: | --- | --- | --- |',
    ...allRows,
    '',
  ].join('\n');
}

async function loadSummaryFromPath(summaryPath, label) {
  if (!(await fileExists(summaryPath))) {
    throw new Error(`${label} summary not found: ${summaryPath}`);
  }
  return {
    summary: await readJson(summaryPath),
    metadata: {
      label,
      source: 'provided-summary',
      summaryPath,
    },
  };
}

async function loadSummaryFromRef(ref) {
  const commitSha = await resolveCommit(ref);
  if (!commitSha) {
    throw new Error(`unable to resolve commit for ref '${ref}'`);
  }
  const run = await runComplexityForCommit(commitSha);
  return {
    summary: run.summary,
    metadata: {
      label: `${ref} (${commitSha.slice(0, 12)})`,
      source: run.source,
      commitSha,
      summaryPath: run.summaryPath,
    },
  };
}

async function writeLatestPointer(outputRoot, runDirName) {
  await writeText(path.join(outputRoot, 'latest.txt'), `${runDirName}\n`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || args.h) {
    console.log('usage: node scripts/complexity/commit-delta.mjs [--base <ref>] [--head <ref>] [--output-dir <dir>]');
    console.log('   or: node scripts/complexity/commit-delta.mjs --base-summary <path> --head-summary <path> [--output-dir <dir>]');
    console.log('defaults: base = @{upstream}, head = HEAD');
    return;
  }

  const outputRoot = path.resolve(args['output-dir'] ?? DEFAULT_OUTPUT_ROOT);
  const baseSummaryPath = args['base-summary'];
  const headSummaryPath = args['head-summary'];

  if ((baseSummaryPath && !headSummaryPath) || (!baseSummaryPath && headSummaryPath)) {
    throw new Error('both --base-summary and --head-summary are required together');
  }

  const useSummaryInput = Boolean(baseSummaryPath && headSummaryPath);

  const baseRef = useSummaryInput ? null : (args.base ?? await resolveDefaultBaseRef());
  const headRef = useSummaryInput ? null : (args.head ?? 'HEAD');

  const baseLoaded = useSummaryInput
    ? await loadSummaryFromPath(path.resolve(baseSummaryPath), baseSummaryPath)
    : await loadSummaryFromRef(baseRef);

  const headLoaded = useSummaryInput
    ? await loadSummaryFromPath(path.resolve(headSummaryPath), headSummaryPath)
    : await loadSummaryFromRef(headRef);

  // [LAW:one-source-of-truth] Delta output is derived only from canonical comparison-summary highlights from base/head.
  const delta = buildDelta(baseLoaded.summary, headLoaded.summary);

  const baseLabel = baseLoaded.metadata.label;
  const headLabel = headLoaded.metadata.label;
  const baseShort = sanitizeLabel(baseLoaded.metadata.commitSha?.slice(0, 12) ?? createHash('sha1').update(baseLabel).digest('hex').slice(0, 12));
  const headShort = sanitizeLabel(headLoaded.metadata.commitSha?.slice(0, 12) ?? createHash('sha1').update(headLabel).digest('hex').slice(0, 12));
  const runId = `${new Date().toISOString().replace(/[:.]/g, '-')}_${baseShort}__${headShort}`;
  const runDir = path.join(outputRoot, runId);
  await fs.mkdir(runDir, { recursive: true });

  const result = {
    ...delta,
    base: baseLoaded.metadata,
    head: headLoaded.metadata,
  };

  const jsonPath = path.join(runDir, 'commit-delta.json');
  const mdPath = path.join(runDir, 'commit-delta.md');

  await writeJson(jsonPath, result);
  await writeText(mdPath, renderDeltaMarkdown(result, baseLabel, headLabel));
  await writeLatestPointer(outputRoot, runId);

  // [LAW:verifiable-goals] Always emit machine-readable + human-readable outputs.
  console.log(`wrote ${jsonPath}`);
  console.log(`wrote ${mdPath}`);
  console.log(`latest run: ${path.relative(process.cwd(), path.join(outputRoot, runId))}`);
}

await main();
