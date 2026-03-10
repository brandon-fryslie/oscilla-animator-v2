import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {
  escapeHtml,
  formatSig2,
  reportsDir,
  renderHtmlDocument,
  renderHtmlTable,
  runCommand,
  runnerRoot,
  writeJson,
  writeText,
} from './_shared.mjs';
import { isComplexityMetric, rowStatus, sortRowsForDisplay } from './delta-visuals.mjs';

const DEFAULT_OUTPUT_ROOT = path.join(reportsDir, 'deltas');

const METRIC_META = {
  eslintErrors: { label: 'ESLint errors', direction: 'lower', signal: 'high', target: '0 (strict gate)', scale: 'count' },
  eslintWarnings: { label: 'ESLint warnings', direction: 'lower', signal: 'medium', target: '0-10 (team policy)', scale: 'count' },
  eslintComplexityHits: { label: 'ESLint cyclomatic rule hits', direction: 'lower', signal: 'high', target: '0', scale: 'count' },
  eslintMaxDepthHits: { label: 'ESLint max-depth hits', direction: 'lower', signal: 'high', target: '0', scale: 'count' },
  eslintMaxLinesPerFunctionHits: { label: 'ESLint max-lines-per-function hits', direction: 'lower', signal: 'medium', target: '0', scale: 'count' },
  eslintMaxParamsHits: { label: 'ESLint max-params hits', direction: 'lower', signal: 'medium', target: '0', scale: 'count' },
  eslintCognitiveHits: { label: 'ESLint cognitive-complexity hits', direction: 'lower', signal: 'high', target: '0', scale: 'count' },

  tsMorphMaxCyclomatic: { label: 'ts-morph max cyclomatic', direction: 'lower', signal: 'high', target: '<= 15 preferred', scale: 'count', description: 'Highest cyclomatic complexity across analyzed functions.' },
  tsMorphMaxCognitive: { label: 'ts-morph max cognitive', direction: 'lower', signal: 'high', target: '<= 20 preferred', scale: 'count', description: 'Highest cognitive complexity across analyzed functions.' },
  tsMorphMaxNesting: { label: 'ts-morph max nesting depth', direction: 'lower', signal: 'high', target: '<= 4 preferred', scale: 'count', description: 'Deepest nested control-flow depth found in a function.' },
  tsMorphSourceLocTotal: { label: 'ts-morph total source LOC', direction: 'info', signal: 'low', target: 'context only', scale: 'size', description: 'Total lines of source code. Context-only size metric, not complexity.' },
  tsMorphMaxHalsteadVolume: { label: 'ts-morph max Halstead volume', direction: 'lower', signal: 'medium', target: 'trend down over time', scale: 'size', description: 'Largest Halstead volume observed among functions.' },
  tsMorphAvgMi: { label: 'ts-morph average maintainability index', direction: 'higher', signal: 'high', target: '>= 65 good, < 50 risky', scale: 'score', description: 'Average maintainability index across analyzed functions.' },
  tsMorphMaxFanOut: { label: 'ts-morph max fan-out', direction: 'lower', signal: 'high', target: '<= 15 preferred', scale: 'count', description: 'Maximum number of internal modules imported by a single module.' },
  tsMorphMaxFanIn: { label: 'ts-morph max fan-in', direction: 'lower', signal: 'medium', target: 'watch hotspots', scale: 'count', description: 'Maximum number of internal modules that import the same module (hotspot fan-in).' },

  dependencyCruiserErrors: { label: 'dependency-cruiser error violations', direction: 'lower', signal: 'high', target: '0', scale: 'count' },
  dependencyCruiserWarnings: { label: 'dependency-cruiser warning violations', direction: 'lower', signal: 'medium', target: '0', scale: 'count' },
  dependencyCruiserModules: { label: 'dependency-cruiser module count', direction: 'info', signal: 'low', target: 'context only', scale: 'size' },
  dependencyCruiserDependencies: { label: 'dependency-cruiser dependency edges', direction: 'info', signal: 'low', target: 'context only', scale: 'size', description: 'Total number of dependency edges in the module graph.' },
  dependencyCruiserMaxFanOut: { label: 'dependency-cruiser max fan-out', direction: 'lower', signal: 'high', target: '<= 15 preferred', scale: 'count' },
  dependencyCruiserMaxFanIn: { label: 'dependency-cruiser max fan-in', direction: 'lower', signal: 'medium', target: 'watch hotspots', scale: 'count' },

  platoAvgMaintainability: { label: 'Plato average maintainability', direction: 'higher', signal: 'medium', target: '>= 65 good', scale: 'score' },
  platoMaxCyclomatic: { label: 'Plato max cyclomatic', direction: 'lower', signal: 'medium', target: '<= 15 preferred', scale: 'count' },
  platoAvgHalsteadDifficulty: { label: 'Plato avg Halstead difficulty', direction: 'lower', signal: 'low', target: 'trend down', scale: 'size' },
  platoAvgHalsteadVolume: { label: 'Plato avg Halstead volume', direction: 'lower', signal: 'low', target: 'trend down', scale: 'size' },
  platoTotalLogicalSloc: { label: 'Plato total logical SLOC', direction: 'info', signal: 'low', target: 'context only', scale: 'size', description: 'Total logical source lines of code measured by Plato.' },

  typhonAvgMaintainability: { label: 'Typhon average maintainability', direction: 'higher', signal: 'medium', target: '>= 65 good', scale: 'score' },
  typhonMaxCyclomatic: { label: 'Typhon max cyclomatic', direction: 'lower', signal: 'medium', target: '<= 15 preferred', scale: 'count' },
  typhonAvgHalsteadDifficulty: { label: 'Typhon avg Halstead difficulty', direction: 'lower', signal: 'low', target: 'trend down', scale: 'size' },
  typhonAvgHalsteadVolume: { label: 'Typhon avg Halstead volume', direction: 'lower', signal: 'low', target: 'trend down', scale: 'size' },
  typhonTotalLogicalSloc: { label: 'Typhon total logical SLOC', direction: 'info', signal: 'low', target: 'context only', scale: 'size', description: 'Total logical source lines of code measured by Typhon.' },
};

const FILE_GATE_MIN_IMPROVEMENT_PCT = 0;
const FILE_GATE_MAX_REGRESSION_PCT = 1;
const FILE_GATE_METRICS = [
  { key: 'eslintComplexityHits', label: 'ESLint cyclomatic rule hits (per file)', direction: 'lower', threshold: 0, source: 'eslint-rule', sourceKey: 'complexity' },
  { key: 'eslintMaxDepthHits', label: 'ESLint max-depth hits (per file)', direction: 'lower', threshold: 0, source: 'eslint-rule', sourceKey: 'max-depth' },
  { key: 'eslintMaxLinesPerFunctionHits', label: 'ESLint max-lines-per-function hits (per file)', direction: 'lower', threshold: 0, source: 'eslint-rule', sourceKey: 'max-lines-per-function' },
  { key: 'eslintMaxParamsHits', label: 'ESLint max-params hits (per file)', direction: 'lower', threshold: 0, source: 'eslint-rule', sourceKey: 'max-params' },
  { key: 'eslintCognitiveHits', label: 'ESLint cognitive-complexity hits (per file)', direction: 'lower', threshold: 0, source: 'eslint-rule', sourceKey: 'sonarjs/cognitive-complexity' },
  { key: 'tsMorphFileMaxCyclomatic', label: 'ts-morph max cyclomatic (per file)', direction: 'lower', threshold: 15, source: 'ts-morph', sourceKey: 'maxCyclomatic' },
  { key: 'tsMorphFileMaxCognitive', label: 'ts-morph max cognitive (per file)', direction: 'lower', threshold: 20, source: 'ts-morph', sourceKey: 'maxCognitive' },
  { key: 'tsMorphFileMaxNestingDepth', label: 'ts-morph max nesting depth (per file)', direction: 'lower', threshold: 4, source: 'ts-morph', sourceKey: 'maxNestingDepth' },
  { key: 'tsMorphFileAvgMaintainability', label: 'ts-morph average maintainability index (per file)', direction: 'higher', threshold: 65, source: 'ts-morph', sourceKey: 'avgMaintainabilityIndex' },
  { key: 'tsMorphFileModuleFanOut', label: 'ts-morph module fan-out (per file)', direction: 'lower', threshold: 15, source: 'ts-morph', sourceKey: 'moduleFanOut' },
];

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
    description: `${key} metric.`,
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

function formatMetricValue(value) {
  if (!Number.isFinite(value)) return 'n/a';
  if (Number.isInteger(value)) return String(value);
  return formatSig2(value);
}

function formatDeltaValue(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 'n/a';
  if (Number.isInteger(numeric)) return `${numeric > 0 ? '+' : ''}${numeric}`;
  return `${numeric > 0 ? '+' : ''}${formatSig2(numeric)}`;
}

function formatPctValue(value) {
  if (!Number.isFinite(value)) return 'n/a';
  return `${formatSig2(value)}%`;
}

function inferRepoRootFromSummaryPath(summaryPath) {
  if (!summaryPath) return null;
  const cwd = path.isAbsolute(summaryPath) ? path.dirname(summaryPath) : process.cwd();
  const result = spawnSync('git', ['rev-parse', '--show-toplevel'], { cwd, encoding: 'utf8' });
  if (result.status === 0 && result.stdout) {
    return result.stdout.trim();
  }
  return null;
}

function normalizeFilePath(filePath, repoRoot) {
  if (typeof filePath !== 'string' || filePath.length === 0) return null;
  const normalizedPath = filePath.replaceAll('\\', '/');
  if (path.isAbsolute(filePath) && repoRoot) {
    const rel = path.relative(repoRoot, filePath);
    if (!rel.startsWith('..') && !path.isAbsolute(rel)) {
      return rel.replaceAll('\\', '/');
    }
    const repoNormalized = repoRoot.replaceAll('\\', '/');
    const directIndex = normalizedPath.indexOf(`${repoNormalized}/`);
    if (directIndex >= 0) {
      return normalizedPath.slice(directIndex + repoNormalized.length + 1);
    }
    const marker = `/${path.basename(repoNormalized)}/`;
    const markerIndex = normalizedPath.indexOf(marker);
    if (markerIndex >= 0) {
      return normalizedPath.slice(markerIndex + marker.length);
    }
  }
  for (const marker of ['/src/', '/scripts/', '/tests/']) {
    const markerIndex = normalizedPath.indexOf(marker);
    if (markerIndex >= 0) return normalizedPath.slice(markerIndex + 1);
  }
  return normalizedPath.replace(/^\.\//, '');
}

function uniqueItems(values) {
  return [...new Set(values.filter(Boolean))];
}

function sanitizeHttpUrl(value) {
  if (typeof value !== 'string' || value.length === 0) return null;
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

function normalizeGitFilePath(filePath) {
  if (typeof filePath !== 'string' || filePath.length === 0) return null;
  return filePath.replaceAll('\\', '/').replace(/^\.\//, '');
}

function isEslintTrackedFile(filePath) {
  return /^src\/.+\.tsx?$/.test(filePath) || /^scripts\/.+\.mjs$/.test(filePath);
}

function isTsMorphTrackedFile(filePath) {
  return /^src\/.+\.tsx?$/.test(filePath);
}

function isFileTrackedForMetric(metric, filePath) {
  if (metric.source === 'ts-morph') return isTsMorphTrackedFile(filePath);
  return isEslintTrackedFile(filePath);
}

function toFiniteNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function passesThreshold(direction, value, threshold) {
  if (!Number.isFinite(value) || !Number.isFinite(threshold)) return false;
  if (direction === 'higher') return value >= threshold;
  return value <= threshold;
}

function computeImprovementPct(direction, baseValue, headValue) {
  if (!Number.isFinite(baseValue) || !Number.isFinite(headValue)) return null;
  if (baseValue === 0) {
    if (headValue === 0) return 0;
    if (direction === 'higher') return 100;
    return -100;
  }
  if (direction === 'higher') {
    return ((headValue - baseValue) / Math.abs(baseValue)) * 100;
  }
  return ((baseValue - headValue) / Math.abs(baseValue)) * 100;
}

async function listChangedFiles(baseSha, headSha) {
  if (!baseSha || !headSha) return [];
  const run = await runCommand(
    'git',
    ['diff', '--name-only', '--diff-filter=ACMR', `${baseSha}..${headSha}`],
    { allowFailure: true },
  );
  if (!run.ok) {
    throw new Error(`unable to list changed files for ${baseSha}..${headSha}: ${run.stderr || run.stdout}`);
  }
  return uniqueItems(
    run.stdout
      .split('\n')
      .map((line) => normalizeGitFilePath(line.trim()))
      .filter(Boolean),
  ).sort((a, b) => a.localeCompare(b));
}

function buildEslintRuleCountMaps(eslintSummary, repoRoot) {
  const findings = normalizeEslintFindings(eslintSummary, repoRoot);
  const maps = Object.fromEntries(
    FILE_GATE_METRICS
      .filter((metric) => metric.source === 'eslint-rule')
      .map((metric) => [metric.sourceKey, new Map()]),
  );
  for (const finding of findings) {
    const filePath = normalizeGitFilePath(finding.filePath);
    if (!filePath || !maps[finding.ruleId]) continue;
    const current = maps[finding.ruleId].get(filePath) ?? 0;
    maps[finding.ruleId].set(filePath, current + 1);
  }
  return maps;
}

function buildTsMorphFieldMaps(tsMorphSummary, repoRoot) {
  const rows = Array.isArray(tsMorphSummary?.fileMetrics) ? tsMorphSummary.fileMetrics : [];
  const maps = Object.fromEntries(
    FILE_GATE_METRICS
      .filter((metric) => metric.source === 'ts-morph')
      .map((metric) => [metric.sourceKey, new Map()]),
  );
  for (const row of rows) {
    const normalizedPath = normalizeFilePath(row.filePath, repoRoot);
    const filePath = normalizeGitFilePath(normalizedPath);
    if (!filePath) continue;
    for (const metric of FILE_GATE_METRICS.filter((entry) => entry.source === 'ts-morph')) {
      const value = toFiniteNumber(row?.[metric.sourceKey]);
      if (!Number.isFinite(value)) continue;
      maps[metric.sourceKey].set(filePath, value);
    }
  }
  return maps;
}

function metricValueFromMaps(metric, filePath, maps, fallback = null) {
  const container = metric.source === 'ts-morph' ? maps.tsMorph : maps.eslint;
  const value = container?.[metric.sourceKey]?.get(filePath);
  if (Number.isFinite(value)) return value;
  return fallback;
}

async function evaluateChangedFileThresholdGate(baseLoaded, headLoaded) {
  const baseSha = baseLoaded.metadata.commitSha ?? null;
  const headSha = headLoaded.metadata.commitSha ?? null;
  const changedFiles = await listChangedFiles(baseSha, headSha);
  const trackedChangedFiles = changedFiles.filter((filePath) => (
    isEslintTrackedFile(filePath) || isTsMorphTrackedFile(filePath)
  ));

  const baseRepoRoot = inferRepoRootFromSummaryPath(baseLoaded.metadata.summaryPath);
  const headRepoRoot = inferRepoRootFromSummaryPath(headLoaded.metadata.summaryPath);
  const baseMaps = {
    eslint: buildEslintRuleCountMaps(baseLoaded.summary.tools?.eslint ?? {}, baseRepoRoot),
    tsMorph: buildTsMorphFieldMaps(baseLoaded.summary.tools?.tsMorph ?? {}, baseRepoRoot),
  };
  const headMaps = {
    eslint: buildEslintRuleCountMaps(headLoaded.summary.tools?.eslint ?? {}, headRepoRoot),
    tsMorph: buildTsMorphFieldMaps(headLoaded.summary.tools?.tsMorph ?? {}, headRepoRoot),
  };

  const evaluations = [];
  for (const filePath of trackedChangedFiles) {
    for (const metric of FILE_GATE_METRICS) {
      if (!isFileTrackedForMetric(metric, filePath)) continue;
      const defaultValue = metric.source === 'eslint-rule' ? 0 : null;
      const headValue = metricValueFromMaps(metric, filePath, headMaps, defaultValue);
      if (!Number.isFinite(headValue)) continue;
      const baseValue = metricValueFromMaps(metric, filePath, baseMaps, defaultValue);
      const underThreshold = passesThreshold(metric.direction, headValue, metric.threshold);
      const improvementPct = computeImprovementPct(metric.direction, baseValue, headValue);
      const improvedEnough = Number.isFinite(improvementPct) && improvementPct >= FILE_GATE_MIN_IMPROVEMENT_PCT;
      const withinRegressionTolerance =
        Number.isFinite(improvementPct) && improvementPct >= -FILE_GATE_MAX_REGRESSION_PCT;
      const passed = underThreshold || withinRegressionTolerance;
      const reason = underThreshold
        ? 'under-threshold'
        : withinRegressionTolerance
          ? 'over-threshold-within-regression-tolerance'
          : 'over-threshold-regressed-beyond-tolerance';
      evaluations.push({
        filePath,
        metricKey: metric.key,
        metricLabel: metric.label,
        direction: metric.direction,
        threshold: metric.threshold,
        baseValue,
        headValue,
        improvementPct,
        underThreshold,
        improvedEnough,
        withinRegressionTolerance,
        passed,
        reason,
      });
    }
  }

  const failures = evaluations
    .filter((evaluation) => !evaluation.passed)
    .sort((a, b) => {
      const fileOrder = a.filePath.localeCompare(b.filePath);
      if (fileOrder !== 0) return fileOrder;
      return a.metricLabel.localeCompare(b.metricLabel);
    });

  return {
    enabled: true,
    policy: 'changed-file-under-threshold-or-regression-within-1pct',
    minImprovementPct: FILE_GATE_MIN_IMPROVEMENT_PCT,
    maxRegressionPct: FILE_GATE_MAX_REGRESSION_PCT,
    changedFiles,
    trackedChangedFiles,
    trackedChangedFilesCount: trackedChangedFiles.length,
    evaluations,
    failures,
    evaluationCount: evaluations.length,
    failureCount: failures.length,
    passed: failures.length === 0,
  };
}

function uniqueLocations(locations) {
  const seen = new Set();
  const out = [];
  for (const location of locations) {
    const filePath = location?.filePath ?? null;
    const startLine = Number(location?.startLine ?? 0);
    const endLine = Number(location?.endLine ?? startLine);
    if (!filePath || !Number.isFinite(startLine) || startLine <= 0) continue;
    const normalized = {
      filePath,
      startLine,
      endLine: Number.isFinite(endLine) && endLine >= startLine ? endLine : startLine,
      reason: typeof location?.reason === 'string' ? location.reason : '',
    };
    const signature = `${normalized.filePath}|${normalized.startLine}|${normalized.endLine}|${normalized.reason}`;
    if (seen.has(signature)) continue;
    seen.add(signature);
    out.push(normalized);
  }
  return out;
}

function findingSignature(finding) {
  return [
    finding.filePath,
    finding.line,
    finding.column,
    finding.ruleId,
    finding.severity,
    finding.message,
  ].join('|');
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
    await fs.rm(tempDir, { recursive: true, force: true });
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
      description: meta.description ?? `${meta.label}. ${directionLabel(meta.direction)}.`,
      base,
      head,
      delta,
      relativeDeltaPct,
      classification,
      magnitude,
      impact,
    };
  });

  const improved = rows.filter((row) => rowStatus(row).kind === 'improvement');
  const regressed = rows.filter((row) => rowStatus(row).kind === 'regression');
  const unchanged = rows.filter((row) => ['unchanged', 'neutral'].includes(rowStatus(row).kind));
  const highSignalRegressions = regressed.filter((row) => row.signal === 'high').sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).slice(0, 10);
  const highSignalImprovements = improved.filter((row) => row.signal === 'high').sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).slice(0, 10);

  const guide = Object.entries(METRIC_META)
    .map(([key, meta]) => ({
      key,
      ...meta,
      directionLabel: directionLabel(meta.direction),
      description: meta.description ?? `${meta.label}. ${directionLabel(meta.direction)}.`,
    }))
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

function normalizeEslintFindings(eslintSummary, repoRoot) {
  const findings = Array.isArray(eslintSummary?.findings) ? eslintSummary.findings : [];
  return findings.map((finding) => ({
    ...finding,
    filePath: normalizeFilePath(finding.filePath, repoRoot),
  }));
}

function fileFromViolation(violation, repoRoot) {
  return [
    normalizeFilePath(violation?.from ?? null, repoRoot),
    normalizeFilePath(violation?.to ?? null, repoRoot),
  ].filter(Boolean);
}

function parseEmbeddedLine(name) {
  if (typeof name !== 'string') return null;
  const match = name.match(/:(\d+)$/);
  if (!match) return null;
  const line = Number(match[1]);
  return Number.isFinite(line) && line > 0 ? line : null;
}

function collectMetricAttribution(row, context) {
  const {
    baseTools,
    headTools,
    baseRepoRoot,
    headRepoRoot,
  } = context;
  const evidence = [];
  const files = [];
  const locations = [];
  const pushFile = (filePath) => {
    if (filePath) files.push(filePath);
  };
  const pushEvidence = (line) => {
    if (line) evidence.push(line);
  };
  const pushLocation = (filePath, startLine, endLine, reason) => {
    locations.push({ filePath, startLine, endLine, reason });
  };

  const headEslint = normalizeEslintFindings(headTools.eslint, headRepoRoot);
  const baseEslint = normalizeEslintFindings(baseTools.eslint, baseRepoRoot);
  const baseEslintSigs = new Set(baseEslint.map(findingSignature));
  const newEslintFindings = headEslint.filter((finding) => !baseEslintSigs.has(findingSignature(finding)));
  const eslintRuleByMetric = {
    eslintComplexityHits: 'complexity',
    eslintMaxDepthHits: 'max-depth',
    eslintMaxLinesPerFunctionHits: 'max-lines-per-function',
    eslintMaxParamsHits: 'max-params',
    eslintCognitiveHits: 'sonarjs/cognitive-complexity',
  };

  if (row.key === 'eslintErrors' || row.key === 'eslintWarnings' || eslintRuleByMetric[row.key]) {
    const severityFilter = row.key === 'eslintErrors' ? 2 : row.key === 'eslintWarnings' ? 1 : null;
    const ruleFilter = eslintRuleByMetric[row.key] ?? null;
    const matchedFindings = newEslintFindings.filter((finding) => {
      if (severityFilter !== null && finding.severity !== severityFilter) return false;
      if (ruleFilter !== null && finding.ruleId !== ruleFilter) return false;
      return true;
    });
    pushEvidence(`new findings in head for this metric: ${matchedFindings.length}`);
    for (const finding of matchedFindings.slice(0, 6)) {
      pushFile(finding.filePath);
      pushEvidence(`${finding.filePath}:${finding.line}:${finding.column} [${finding.ruleId}] ${finding.message}`);
      pushLocation(
        finding.filePath,
        finding.line ?? 0,
        finding.endLine ?? finding.line ?? 0,
        finding.ruleId ?? 'eslint',
      );
    }
  }

  if (row.key === 'tsMorphMaxCyclomatic') {
    const top = headTools.tsMorph?.topCyclomatic?.[0] ?? null;
    pushFile(normalizeFilePath(top?.filePath, headRepoRoot));
    if (top) pushEvidence(`head max cyclomatic function: ${top.name} (${formatMetricValue(top.cyclomatic)})`);
    const line = parseEmbeddedLine(top?.name);
    if (top?.filePath && line) pushLocation(normalizeFilePath(top.filePath, headRepoRoot), line, line, 'ts-morph');
  }
  if (row.key === 'tsMorphMaxCognitive') {
    const top = headTools.tsMorph?.topCognitive?.[0] ?? null;
    pushFile(normalizeFilePath(top?.filePath, headRepoRoot));
    if (top) pushEvidence(`head max cognitive function: ${top.name} (${formatMetricValue(top.cognitive)})`);
    const line = parseEmbeddedLine(top?.name);
    if (top?.filePath && line) pushLocation(normalizeFilePath(top.filePath, headRepoRoot), line, line, 'ts-morph');
  }
  if (row.key === 'tsMorphMaxNesting') {
    const top = headTools.tsMorph?.topNesting?.[0] ?? null;
    pushFile(normalizeFilePath(top?.filePath, headRepoRoot));
    if (top) pushEvidence(`head max nesting function: ${top.name} (${formatMetricValue(top.maxNestingDepth)})`);
    const line = parseEmbeddedLine(top?.name);
    if (top?.filePath && line) pushLocation(normalizeFilePath(top.filePath, headRepoRoot), line, line, 'ts-morph');
  }
  if (row.key === 'tsMorphMaxHalsteadVolume') {
    const top = headTools.tsMorph?.topHalsteadVolume?.[0] ?? null;
    pushFile(normalizeFilePath(top?.filePath, headRepoRoot));
    if (top) pushEvidence(`head max Halstead volume function: ${top.name} (${formatMetricValue(top.halstead?.volume)})`);
    const line = parseEmbeddedLine(top?.name);
    if (top?.filePath && line) pushLocation(normalizeFilePath(top.filePath, headRepoRoot), line, line, 'ts-morph');
  }
  if (row.key === 'tsMorphAvgMi') {
    const low = headTools.tsMorph?.topLowMaintainability?.[0] ?? null;
    pushFile(normalizeFilePath(low?.filePath, headRepoRoot));
    if (low) pushEvidence(`lowest maintainability function in head: ${low.name} (${formatMetricValue(low.maintainabilityIndex)})`);
    const line = parseEmbeddedLine(low?.name);
    if (low?.filePath && line) pushLocation(normalizeFilePath(low.filePath, headRepoRoot), line, line, 'ts-morph');
  }
  if (row.key === 'tsMorphMaxFanOut') {
    const top = headTools.tsMorph?.topFanOut?.[0] ?? null;
    pushFile(normalizeFilePath(top?.filePath, headRepoRoot));
    if (top) pushEvidence(`head max fan-out module: ${normalizeFilePath(top.filePath, headRepoRoot)} (${formatMetricValue(top.fanOut)})`);
  }
  if (row.key === 'tsMorphMaxFanIn') {
    const top = headTools.tsMorph?.topFanIn?.[0] ?? null;
    pushFile(normalizeFilePath(top?.filePath, headRepoRoot));
    if (top) pushEvidence(`head max fan-in module: ${normalizeFilePath(top.filePath, headRepoRoot)} (${formatMetricValue(top.fanIn)})`);
  }

  if (row.key === 'dependencyCruiserErrors' || row.key === 'dependencyCruiserWarnings') {
    const baseViolations = Array.isArray(baseTools.dependencyCruiser?.topViolations) ? baseTools.dependencyCruiser.topViolations : [];
    const headViolations = Array.isArray(headTools.dependencyCruiser?.topViolations) ? headTools.dependencyCruiser.topViolations : [];
    const baseViolationSigs = new Set(baseViolations.map((violation) => `${violation.rule}|${violation.from}|${violation.to}`));
    const newViolations = headViolations.filter((violation) => !baseViolationSigs.has(`${violation.rule}|${violation.from}|${violation.to}`));
    pushEvidence(`new visible dependency violations in head: ${newViolations.length}`);
    for (const violation of newViolations.slice(0, 6)) {
      for (const filePath of fileFromViolation(violation, headRepoRoot)) pushFile(filePath);
      pushEvidence(`${violation.rule ?? 'rule'}: ${violation.from ?? 'unknown'} -> ${violation.to ?? 'unknown'}`);
    }
  }
  if (row.key === 'dependencyCruiserMaxFanOut') {
    const top = headTools.dependencyCruiser?.coupling?.topFanOutModules?.[0] ?? null;
    pushFile(normalizeFilePath(top?.source, headRepoRoot));
    if (top) pushEvidence(`head max dependency fan-out module: ${top.source} (${formatMetricValue(top.fanOut)})`);
  }
  if (row.key === 'dependencyCruiserMaxFanIn') {
    const top = headTools.dependencyCruiser?.coupling?.topFanInModules?.[0] ?? null;
    pushFile(normalizeFilePath(top?.source, headRepoRoot));
    if (top) pushEvidence(`head max dependency fan-in module: ${top.source} (${formatMetricValue(top.fanIn)})`);
  }

  if (row.key === 'platoAvgMaintainability') {
    const low = headTools.plato?.topLowMaintainability?.[0] ?? null;
    pushFile(normalizeFilePath(low?.file, headRepoRoot));
    if (low) pushEvidence(`lowest Plato maintainability file in head: ${low.file} (${formatMetricValue(low.maintainability)})`);
  }
  if (row.key === 'platoMaxCyclomatic') {
    const top = headTools.plato?.topCyclomatic?.[0] ?? null;
    pushFile(normalizeFilePath(top?.file, headRepoRoot));
    if (top) pushEvidence(`highest Plato cyclomatic file in head: ${top.file} (${formatMetricValue(top.cyclomatic)})`);
  }
  if (row.key === 'platoAvgHalsteadDifficulty') {
    const top = headTools.plato?.topHalsteadDifficulty?.[0] ?? null;
    pushFile(normalizeFilePath(top?.file, headRepoRoot));
    if (top) pushEvidence(`highest Plato Halstead difficulty file in head: ${top.file} (${formatMetricValue(top.halsteadDifficulty)})`);
  }
  if (row.key === 'platoAvgHalsteadVolume') {
    const top = headTools.plato?.topHalsteadVolume?.[0] ?? null;
    pushFile(normalizeFilePath(top?.file, headRepoRoot));
    if (top) pushEvidence(`highest Plato Halstead volume file in head: ${top.file} (${formatMetricValue(top.halsteadVolume)})`);
  }

  if (row.key === 'typhonAvgMaintainability') {
    const low = headTools.typhon?.topLowMaintainability?.[0] ?? null;
    pushFile(normalizeFilePath(low?.srcPath, headRepoRoot));
    if (low) pushEvidence(`lowest Typhon maintainability module in head: ${low.srcPath} (${formatMetricValue(low.maintainability)})`);
  }
  if (row.key === 'typhonMaxCyclomatic') {
    const top = headTools.typhon?.topCyclomatic?.[0] ?? null;
    pushFile(normalizeFilePath(top?.srcPath, headRepoRoot));
    if (top) pushEvidence(`highest Typhon cyclomatic module in head: ${top.srcPath} (${formatMetricValue(top.cyclomatic)})`);
  }
  if (row.key === 'typhonAvgHalsteadDifficulty') {
    const top = headTools.typhon?.topHalsteadDifficulty?.[0] ?? null;
    pushFile(normalizeFilePath(top?.srcPath, headRepoRoot));
    if (top) pushEvidence(`highest Typhon Halstead difficulty module in head: ${top.srcPath} (${formatMetricValue(top.halsteadDifficulty)})`);
  }
  if (row.key === 'typhonAvgHalsteadVolume') {
    const top = headTools.typhon?.topHalsteadVolume?.[0] ?? null;
    pushFile(normalizeFilePath(top?.srcPath, headRepoRoot));
    if (top) pushEvidence(`highest Typhon Halstead volume module in head: ${top.srcPath} (${formatMetricValue(top.halsteadVolume)})`);
  }

  return {
    evidence: uniqueItems(evidence),
    files: uniqueItems(files),
    locations: uniqueLocations(locations),
  };
}

function normalizeRepositoryWebUrl(remoteUrl) {
  if (typeof remoteUrl !== 'string' || remoteUrl.length === 0) return null;
  const trimmed = remoteUrl.trim();
  if (trimmed.startsWith('git@github.com:')) {
    return `https://github.com/${trimmed.slice('git@github.com:'.length).replace(/\.git$/, '')}`;
  }
  if (trimmed.startsWith('ssh://git@github.com/')) {
    return `https://github.com/${trimmed.slice('ssh://git@github.com/'.length).replace(/\.git$/, '')}`;
  }
  if (trimmed.startsWith('https://github.com/')) {
    return trimmed.replace(/\.git$/, '').replace(/\/$/, '');
  }
  return null;
}

async function resolveRepositoryWebUrl(cwd) {
  const run = await runCommand('git', ['config', '--get', 'remote.origin.url'], { cwd, allowFailure: true });
  if (!run.ok) return null;
  return normalizeRepositoryWebUrl(run.stdout.trim());
}

function encodePathSegments(filePath) {
  return String(filePath).split('/').map((segment) => encodeURIComponent(segment)).join('/');
}

function buildBlobRangeUrl(repoWebUrl, commitSha, filePath, startLine, endLine) {
  if (!repoWebUrl || !commitSha || !filePath || !Number.isFinite(startLine) || startLine <= 0) return null;
  const normalizedEnd = Number.isFinite(endLine) && endLine >= startLine ? endLine : startLine;
  return `${repoWebUrl}/blob/${commitSha}/${encodePathSegments(filePath)}#L${startLine}-L${normalizedEnd}`;
}

function buildCompareUrl(repoWebUrl, baseSha, headSha) {
  if (!repoWebUrl || !baseSha || !headSha) return null;
  return `${repoWebUrl}/compare/${baseSha}...${headSha}`;
}

function parseUnifiedDiffHunks(diffText, options = {}) {
  const {
    maxHunks = 12,
    maxLinesPerHunk = 80,
    maxTotalLines = 1600,
  } = options;
  const lines = diffText.split('\n');
  const hunks = [];
  let current = null;
  let seenLines = 0;
  const flushCurrent = () => {
    if (!current) return;
    const snippetLines = [current.header, ...current.lines];
    const limitedSnippet = snippetLines.length > maxLinesPerHunk
      ? `${snippetLines.slice(0, maxLinesPerHunk).join('\n')}\n... (truncated)`
      : snippetLines.join('\n');
    const normalizedNewCount = current.newCount > 0 ? current.newCount : 1;
    hunks.push({
      oldStart: current.oldStart,
      oldCount: current.oldCount,
      newStart: current.newStart,
      newCount: current.newCount,
      newEnd: current.newStart + normalizedNewCount - 1,
      snippet: limitedSnippet,
    });
  };

  for (const line of lines) {
    seenLines += 1;
    if (seenLines > maxTotalLines || hunks.length >= maxHunks) break;
    const headerMatch = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
    if (headerMatch) {
      flushCurrent();
      current = {
        header: line,
        oldStart: Number(headerMatch[1]),
        oldCount: Number(headerMatch[2] ?? '1'),
        newStart: Number(headerMatch[3]),
        newCount: Number(headerMatch[4] ?? '1'),
        lines: [],
      };
      continue;
    }
    if (!current) continue;
    current.lines.push(line);
  }
  flushCurrent();
  return hunks;
}

async function buildMetricAttribution(delta, baseLoaded, headLoaded) {
  const baseSha = baseLoaded.metadata.commitSha ?? null;
  const headSha = headLoaded.metadata.commitSha ?? null;
  const baseRepoRoot = inferRepoRootFromSummaryPath(baseLoaded.metadata.summaryPath);
  const headRepoRoot = inferRepoRootFromSummaryPath(headLoaded.metadata.summaryPath);
  const repoWebUrl = await resolveRepositoryWebUrl(headRepoRoot ?? process.cwd());
  const compareUrl = buildCompareUrl(repoWebUrl, baseSha, headSha);
  const context = {
    baseTools: baseLoaded.summary.tools ?? {},
    headTools: headLoaded.summary.tools ?? {},
    baseRepoRoot,
    headRepoRoot,
  };
  const diffCache = new Map();
  const getDiff = async (filePath) => {
    if (!baseSha || !headSha) return null;
    if (diffCache.has(filePath)) return diffCache.get(filePath);
    const run = await runCommand(
      'git',
      ['diff', '--unified=3', '--no-color', `${baseSha}..${headSha}`, '--', filePath],
      { allowFailure: true },
    );
    const trimmed = run.stdout.trim();
    const lines = trimmed.length === 0 ? [] : trimmed.split('\n');
    const limited = lines.length > 220 ? `${lines.slice(0, 220).join('\n')}\n... (truncated)` : trimmed;
    const parseInput = trimmed.length > 250000 ? trimmed.slice(0, 250000) : trimmed;
    const value = limited.length > 0
      ? { diffText: limited, hunks: parseUnifiedDiffHunks(parseInput) }
      : null;
    diffCache.set(filePath, value);
    return value;
  };

  const attribution = {};
  const rowsToAttribute = delta.rows.filter((row) => {
    const status = rowStatus(row);
    return status.kind === 'regression' || status.kind === 'improvement';
  });
  for (const row of rowsToAttribute) {
    const metricAttribution = collectMetricAttribution(row, context);
    const files = metricAttribution.files.slice(0, 5);
    const diffs = [];
    const snippets = [];
    const locationLinks = [];

    for (const location of metricAttribution.locations.slice(0, 8)) {
      const url = buildBlobRangeUrl(repoWebUrl, headSha, location.filePath, location.startLine, location.endLine);
      if (!url) continue;
      locationLinks.push({
        ...location,
        url,
      });
    }

    for (const filePath of files) {
      const diffArtifact = await getDiff(filePath);
      if (!diffArtifact) continue;
      diffs.push({ filePath, diffText: diffArtifact.diffText });
      for (const hunk of diffArtifact.hunks.slice(0, 3)) {
        const url = buildBlobRangeUrl(repoWebUrl, headSha, filePath, hunk.newStart, hunk.newEnd);
        snippets.push({
          filePath,
          startLine: hunk.newStart,
          endLine: hunk.newEnd,
          snippet: hunk.snippet,
          url,
          compareUrl,
        });
      }
    }
    attribution[row.key] = {
      evidence: metricAttribution.evidence,
      files,
      locations: locationLinks,
      snippets: snippets.slice(0, 10),
      diffs,
      status: rowStatus(row),
    };
  }
  return attribution;
}

function renderDeltaMarkdown(delta, baseLabel, headLabel) {
  const pct = (value) => formatPctValue(value);
  const gate = delta.fileThresholdGate ?? null;
  const rowLine = (row) => {
    return `| ${row.label} | ${formatMetricValue(row.base)} | ${formatMetricValue(row.head)} | ${formatDeltaValue(row.delta)} | ${pct(row.relativeDeltaPct)} | ${row.magnitude} | ${row.impact} |`;
  };

  const allRows = delta.rows.map((row) => {
    return `| ${row.key} | ${row.label} | ${formatMetricValue(row.base)} | ${formatMetricValue(row.head)} | ${formatDeltaValue(row.delta)} | ${pct(row.relativeDeltaPct)} | ${row.classification} | ${row.magnitude} | ${row.signal} |`;
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
    ...(gate ? [
      `- changed-file gate: ${gate.passed ? 'pass' : 'fail'} (${gate.failureCount}/${gate.evaluationCount} failing checks across ${gate.trackedChangedFilesCount} tracked changed files)`,
      `- gate policy: file must be under threshold or regress by no more than ${formatPctValue(gate.maxRegressionPct ?? 0)}`,
    ] : []),
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
    ...(gate ? [
      '## Changed-File Threshold Gate',
      '',
      '| File | Metric | Base | Head | Threshold | Improvement | Result |',
      '| --- | --- | ---: | ---: | --- | ---: | --- |',
      ...(gate.evaluations.length > 0
        ? gate.evaluations.slice(0, 250).map((evaluation) => `| ${evaluation.filePath} | ${evaluation.metricLabel} | ${formatMetricValue(evaluation.baseValue)} | ${formatMetricValue(evaluation.headValue)} | ${evaluation.direction === 'higher' ? '>=' : '<='} ${formatMetricValue(evaluation.threshold)} | ${formatPctValue(evaluation.improvementPct)} | ${evaluation.passed ? 'pass' : 'fail'} |`)
        : ['| none | - | - | - | - | - | - |']),
      '',
    ] : []),
    '## Full Delta Table',
    '',
    '| Key | Metric | Base | Head | Delta (head - base) | % Delta | Classification | Magnitude | Signal |',
    '| --- | --- | ---: | ---: | ---: | ---: | --- | --- | --- |',
    ...allRows,
    '',
  ].join('\n');
}

function findEvidenceLocation(evidenceLine, locations) {
  const match = String(evidenceLine).match(/^([^:\s][^:]*):(\d+):\d+/);
  if (!match) return null;
  const filePath = match[1];
  const line = Number(match[2]);
  if (!Number.isFinite(line)) return null;
  return locations.find((location) => (
    location?.filePath === filePath
    && Number.isFinite(Number(location?.startLine))
    && Number(location.startLine) <= line
    && Number(location.endLine ?? location.startLine) >= line
  )) ?? null;
}

function renderInlineMetricLinks(row, metricAttribution) {
  const details = metricAttribution?.[row.key] ?? {};
  const locations = Array.isArray(details.locations) ? details.locations : [];
  const links = locations.slice(0, 2)
    .map((location) => {
      const safeUrl = sanitizeHttpUrl(location?.url);
      if (!safeUrl) return null;
      const label = `${location.filePath}:${location.startLine}-${location.endLine}`;
      return `<a href="${escapeHtml(safeUrl)}"><code>${escapeHtml(label)}</code></a>`;
    })
    .filter(Boolean);
  return links.length > 0 ? `<div class="inline-links">${links.join('<br>')}</div>` : '';
}

function renderColorizedMetricTable(rows, metricAttribution = {}) {
  const headers = ['Signal', 'Metric', 'Base/Head', 'Delta (%)', 'Magnitude', 'Impact'];
  const headerHtml = headers.map((header) => `<th>${escapeHtml(header)}</th>`).join('');
  const bodyHtml = rows.length === 0
    ? `<tr><td colspan="${headers.length}">none</td></tr>`
    : rows.map((row) => {
      const status = rowStatus(row);
      const inlineLinks = renderInlineMetricLinks(row, metricAttribution);
      const metricCell = `<span title="${escapeHtml(row.description ?? row.label)}">${escapeHtml(row.label)}</span>${inlineLinks}`;
      const deltaCell = `${escapeHtml(status.emoji)} ${escapeHtml(formatDeltaValue(row.delta))} (${escapeHtml(formatPctValue(row.relativeDeltaPct))})`;
      const cells = [
        escapeHtml(row.signal),
        metricCell,
        escapeHtml(`${formatMetricValue(row.base)}/${formatMetricValue(row.head)}`),
        deltaCell,
        escapeHtml(row.magnitude),
        escapeHtml(row.impact),
      ];
      return `<tr class="sev-row sev-${status.level}">${cells.map((cell) => `<td>${cell}</td>`).join('')}</tr>`;
    }).join('\n');
  return `<table class="colorized-table"><thead><tr>${headerHtml}</tr></thead><tbody>${bodyHtml}</tbody></table>`;
}

function renderColorizedFullTable(rows, metricAttribution = {}) {
  return renderColorizedMetricTable(rows, metricAttribution);
}

function renderMetricDrilldownHtml(rows, metricAttribution) {
  if (rows.length === 0) return '<p>None.</p>';
  return rows.map((row) => {
    const details = metricAttribution[row.key] ?? { evidence: [], files: [], locations: [], snippets: [], diffs: [] };
    const locations = Array.isArray(details.locations) ? details.locations : [];
    const evidenceItems = Array.isArray(details.evidence) ? details.evidence : [];
    const evidenceLines = evidenceItems.map((line) => {
      const matchedLocation = findEvidenceLocation(line, locations);
      const safeUrl = sanitizeHttpUrl(matchedLocation?.url);
      if (!safeUrl || !matchedLocation) return `<li>${escapeHtml(line)}</li>`;
      const text = String(line);
      const tokenMatch = text.match(/^([^:\s][^:]*:\d+:\d+)(.*)$/);
      if (!tokenMatch) {
        return `<li><a href="${escapeHtml(safeUrl)}"><code>${escapeHtml(`${matchedLocation.filePath}:${matchedLocation.startLine}-${matchedLocation.endLine}`)}</code></a> — ${escapeHtml(text)}</li>`;
      }
      const token = tokenMatch[1];
      const rest = tokenMatch[2] ?? '';
      return `<li><a href="${escapeHtml(safeUrl)}"><code>${escapeHtml(token)}</code></a>${escapeHtml(rest)}</li>`;
    });
    const uncoveredLocations = locations
      .filter((location) => !evidenceItems.some((line) => findEvidenceLocation(line, [location])))
      .map((location) => {
        const safeUrl = sanitizeHttpUrl(location.url);
        if (!safeUrl) return null;
        return `<li><a href="${escapeHtml(safeUrl)}"><code>${escapeHtml(`${location.filePath}:${location.startLine}-${location.endLine}`)}</code></a>${location.reason ? ` — ${escapeHtml(location.reason)}` : ''}</li>`;
      })
      .filter(Boolean);
    const mergedEvidenceItems = [...evidenceLines, ...uncoveredLocations];
    const evidenceHtml = mergedEvidenceItems.length > 0
      ? `<ul>${mergedEvidenceItems.join('')}</ul>`
      : '<p>No metric-level evidence captured.</p>';
    const candidateFilesHtml = details.files.length > 0
      ? `<p><strong>Candidate files:</strong> <code>${escapeHtml(details.files.join(', '))}</code></p>`
      : '<p><strong>Candidate files:</strong> none</p>';
    const snippetHtml = details.snippets?.length > 0
      ? details.snippets.map((snippet) => {
        const safeSnippetUrl = sanitizeHttpUrl(snippet.url);
        const safeCompareUrl = sanitizeHttpUrl(snippet.compareUrl);
        return [
          '<details>',
          `<summary><code>${escapeHtml(snippet.filePath)}:${snippet.startLine}-${snippet.endLine}</code></summary>`,
          `<p>${safeSnippetUrl ? `<a href="${escapeHtml(safeSnippetUrl)}">Open file at commit</a>` : 'No file link available'}${safeCompareUrl ? ` · <a href="${escapeHtml(safeCompareUrl)}">Open compare view</a>` : ''}</p>`,
          `<pre>${escapeHtml(snippet.snippet)}</pre>`,
          '</details>',
        ].join('\n');
      }).join('\n')
      : '<p>No diff snippet context captured.</p>';
    return [
      '<details>',
      `<summary>${escapeHtml(rowStatus(row).emoji)} ${escapeHtml(row.label)}: ${escapeHtml(formatMetricValue(row.base))} -> ${escapeHtml(formatMetricValue(row.head))} (${escapeHtml(formatDeltaValue(row.delta))}, ${escapeHtml(formatPctValue(row.relativeDeltaPct))})</summary>`,
      '<div>',
      '<p><strong>Evidence:</strong></p>',
      evidenceHtml,
      candidateFilesHtml,
      '<p><strong>Code snippets:</strong></p>',
      snippetHtml,
      '</div>',
      '</details>',
    ].join('\n');
  }).join('\n');
}

function renderDeltaHtml(delta, baseLabel, headLabel, metricAttribution) {
  const complexityRows = sortRowsForDisplay(delta.rows.filter(isComplexityMetric));
  const complexityRegressed = sortRowsForDisplay(delta.regressed.filter(isComplexityMetric));
  const complexityImproved = sortRowsForDisplay(delta.improved.filter(isComplexityMetric));
  const complexityHighSignalRegressions = sortRowsForDisplay(delta.highSignalRegressions.filter(isComplexityMetric));
  const complexityHighSignalImprovements = sortRowsForDisplay(delta.highSignalImprovements.filter(isComplexityMetric));
  const fileGate = delta.fileThresholdGate ?? null;
  const guideRows = delta.guide
    .filter((row) => row.direction !== 'info')
    .map((row) => [row.label, row.directionLabel, row.target, row.signal, row.description ?? '']);

  return renderHtmlDocument(
    'Commit Complexity Delta',
    [
      '<style>',
      '  .inline-links { margin-top: 4px; font-size: 12px; line-height: 1.4; }',
      '  .colorized-table .sev-row.sev-regression-4 td { background: #321010 !important; }',
      '  .colorized-table .sev-row.sev-regression-3 td { background: #2e1313 !important; }',
      '  .colorized-table .sev-row.sev-regression-2 td { background: #2d1c10 !important; }',
      '  .colorized-table .sev-row.sev-regression-1 td { background: #2a2410 !important; }',
      '  .colorized-table .sev-row.sev-neutral td { background: #21242a !important; }',
      '  .colorized-table .sev-row.sev-unchanged td { background: #1b1e25 !important; }',
      '  .colorized-table .sev-row.sev-improvement-1 td { background: #162410 !important; }',
      '  .colorized-table .sev-row.sev-improvement-2 td { background: #102819 !important; }',
      '  .colorized-table .sev-row.sev-improvement-3 td { background: #0f2d1f !important; }',
      '  .colorized-table .sev-row.sev-improvement-4 td { background: #0a331f !important; }',
      '</style>',
      '<h1>Commit Complexity Delta</h1>',
      `<p class="small">Generated: ${delta.generatedAt}</p>`,
      '<div class="meta">',
      `<div><strong>Base</strong><br>${escapeHtml(baseLabel)}</div>`,
      `<div><strong>Head</strong><br>${escapeHtml(headLabel)}</div>`,
      `<div><strong>Base Report</strong><br>${delta.baseGeneratedAt ?? 'unknown'}</div>`,
      `<div><strong>Head Report</strong><br>${delta.headGeneratedAt ?? 'unknown'}</div>`,
      `<div><strong>Improved Metrics</strong><br>${complexityImproved.length}</div>`,
      `<div><strong>Regressed Metrics</strong><br>${complexityRegressed.length}</div>`,
      `<div><strong>Unchanged / Near-Zero</strong><br>${complexityRows.length - complexityImproved.length - complexityRegressed.length}</div>`,
      `<div><strong>Net Score</strong><br>${delta.score}</div>`,
      ...(fileGate ? [`<div><strong>Changed-File Gate</strong><br>${fileGate.passed ? 'pass' : 'fail'} (${fileGate.failureCount}/${fileGate.evaluationCount})</div>`] : []),
      '</div>',
      '<h2>How To Read This</h2>',
      '<ul>',
      '<li>Delta indicator uses emojis only: unchanged `⬜️`, near-zero `😐`, worse `🟨🟧🟥‼️`, better `🟩✅❇️🤑`.</li>',
      '<li>Tables are sorted by signal (high first), then worst-to-best delta.</li>',
      '<li>Lower-is-better metrics should trend down toward target. Zero is ideal for rule violations.</li>',
      '<li>Higher-is-better metrics should trend up (for example maintainability index).</li>',
      '</ul>',
      '<h2>Metric Interpretation Guide</h2>',
      renderHtmlTable(['Metric', 'Desired Trend', 'Practical Target Range', 'Signal', 'Description'], guideRows),
      ...(fileGate ? [
        '<h2>Changed-File Threshold Gate</h2>',
        `<p>Policy: changed files must be under threshold or regress by no more than ${escapeHtml(formatPctValue(fileGate.maxRegressionPct ?? 0))}. Tracked changed files: ${escapeHtml(String(fileGate.trackedChangedFilesCount))}.</p>`,
        renderHtmlTable(
          ['File', 'Metric', 'Base', 'Head', 'Threshold', 'Improvement', 'Result'],
          fileGate.evaluations.length > 0
            ? fileGate.evaluations.slice(0, 400).map((evaluation) => [
              evaluation.filePath,
              evaluation.metricLabel,
              formatMetricValue(evaluation.baseValue),
              formatMetricValue(evaluation.headValue),
              `${evaluation.direction === 'higher' ? '>=' : '<='} ${formatMetricValue(evaluation.threshold)}`,
              formatPctValue(evaluation.improvementPct),
              evaluation.passed ? 'pass' : 'fail',
            ])
            : [['none', '-', '-', '-', '-', '-', '-']],
        ),
      ] : []),
      '<h2>High-Signal Regressions</h2>',
      renderColorizedMetricTable(complexityHighSignalRegressions, metricAttribution),
      '<h2>High-Signal Improvements</h2>',
      renderColorizedMetricTable(complexityHighSignalImprovements, metricAttribution),
      '<h2>Regressions</h2>',
      renderColorizedMetricTable(complexityRegressed, metricAttribution),
      '<h2>Regression Drilldown (click row)</h2>',
      renderMetricDrilldownHtml(complexityRegressed, metricAttribution),
      '<h2>Improvements</h2>',
      renderColorizedMetricTable(complexityImproved, metricAttribution),
      '<h2>Improvement Drilldown (click row)</h2>',
      renderMetricDrilldownHtml(complexityImproved, metricAttribution),
      '<h2>Full Delta Table</h2>',
      renderColorizedFullTable(complexityRows, metricAttribution),
    ].join('\n'),
  );
}

async function loadSummaryFromPath(summaryPath, label, commitSha) {
  if (!(await fileExists(summaryPath))) {
    throw new Error(`${label} summary not found: ${summaryPath}`);
  }
  return {
    summary: await readJson(summaryPath),
    metadata: {
      label,
      source: 'provided-summary',
      summaryPath,
      ...(commitSha ? { commitSha } : {}),
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
    console.log('   or: node scripts/complexity/commit-delta.mjs --base-summary <path> --head-summary <path> [--base-sha <sha>] [--head-sha <sha>] [--output-dir <dir>]');
    console.log('defaults: base = @{upstream}, head = HEAD');
    console.log('  --base-sha / --head-sha: only used with --base-summary / --head-summary; supply commit SHAs to enable regression diff drilldown');
    return;
  }

  const outputRoot = path.resolve(args['output-dir'] ?? DEFAULT_OUTPUT_ROOT);
  const baseSummaryPath = args['base-summary'];
  const headSummaryPath = args['head-summary'];
  const baseShaArg = args['base-sha'] ?? null;
  const headShaArg = args['head-sha'] ?? null;

  if ((baseSummaryPath && !headSummaryPath) || (!baseSummaryPath && headSummaryPath)) {
    throw new Error('both --base-summary and --head-summary are required together');
  }

  const useSummaryInput = Boolean(baseSummaryPath && headSummaryPath);

  const baseRef = useSummaryInput ? null : (args.base ?? await resolveDefaultBaseRef());
  const headRef = useSummaryInput ? null : (args.head ?? 'HEAD');

  const baseLoaded = useSummaryInput
    ? await loadSummaryFromPath(path.resolve(baseSummaryPath), baseSummaryPath, baseShaArg)
    : await loadSummaryFromRef(baseRef);

  const headLoaded = useSummaryInput
    ? await loadSummaryFromPath(path.resolve(headSummaryPath), headSummaryPath, headShaArg)
    : await loadSummaryFromRef(headRef);

  // [LAW:one-source-of-truth] Delta output is derived only from canonical comparison-summary highlights from base/head.
  const delta = buildDelta(baseLoaded.summary, headLoaded.summary);
  const metricAttribution = await buildMetricAttribution(delta, baseLoaded, headLoaded);
  // [LAW:single-enforcer] Enforce changed-file threshold policy once, from canonical base/head summaries.
  const fileThresholdGate = await evaluateChangedFileThresholdGate(baseLoaded, headLoaded);
  const regressionAttribution = Object.fromEntries(
    delta.regressed.map((row) => [row.key, metricAttribution[row.key] ?? { evidence: [], files: [], locations: [], snippets: [], diffs: [] }]),
  );

  const baseLabel = baseLoaded.metadata.label;
  const headLabel = headLoaded.metadata.label;
  const baseShort = sanitizeLabel(baseLoaded.metadata.commitSha?.slice(0, 12) ?? createHash('sha1').update(baseLabel).digest('hex').slice(0, 12));
  const headShort = sanitizeLabel(headLoaded.metadata.commitSha?.slice(0, 12) ?? createHash('sha1').update(headLabel).digest('hex').slice(0, 12));
  const runId = `${new Date().toISOString().replace(/[:.]/g, '-')}_${baseShort}__${headShort}`;
  const runDir = path.join(outputRoot, runId);
  await fs.mkdir(runDir, { recursive: true });

  const result = {
    ...delta,
    metricAttribution,
    regressionAttribution,
    fileThresholdGate,
    base: baseLoaded.metadata,
    head: headLoaded.metadata,
  };

  const jsonPath = path.join(runDir, 'commit-delta.json');
  const mdPath = path.join(runDir, 'commit-delta.md');
  const htmlPath = path.join(runDir, 'commit-delta.html');

  await writeJson(jsonPath, result);
  await writeText(mdPath, renderDeltaMarkdown(result, baseLabel, headLabel));
  await writeText(htmlPath, renderDeltaHtml(result, baseLabel, headLabel, metricAttribution));
  await writeLatestPointer(outputRoot, runId);

  // [LAW:verifiable-goals] Always emit machine-readable + human-readable outputs.
  console.log(`wrote ${jsonPath}`);
  console.log(`wrote ${mdPath}`);
  console.log(`wrote ${htmlPath}`);
  console.log(`latest run: ${path.relative(process.cwd(), path.join(outputRoot, runId))}`);
}

await main();
