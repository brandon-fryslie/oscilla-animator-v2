#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

function listTestFiles() {
  const out = execFileSync(
    'rg',
    ['--files', 'src', '--glob', '**/*.test.ts', '--glob', '**/*.test.tsx'],
    { encoding: 'utf8', cwd: process.cwd() },
  ).trim();
  return out ? out.split('\n').filter(Boolean).sort() : [];
}

function count(pattern, text) {
  const matches = text.match(pattern);
  return matches ? matches.length : 0;
}

function analyzeFile(file) {
  const content = readFileSync(file, 'utf8');
  return {
    file,
    lines: content.split('\n').length,
    testCount: count(/\b(?:it|test)\s*\(/g, content),
    skippedCount: count(/\b(?:it|test|describe)\.skip\s*\(/g, content),
    placeholderCount: count(/placeholder|_placeholder|test removed during type system refactor/gi, content),
    weakAssertCount: count(/expect\(\s*true\s*\)\.toBe\(\s*true\s*\)/g, content),
    staticScanCount: count(/execSync|execFileSync|\brg\b|\bgrep\b/g, content),
  };
}

function topN(items, key, n = 10) {
  return [...items]
    .sort((a, b) => b[key] - a[key])
    .slice(0, n)
    .map((item) => ({ file: item.file, [key]: item[key] }));
}

function overlaps(files, field) {
  return files.filter((f) => f[field] > 0).map((f) => ({ file: f.file, [field]: f[field] }));
}

const testFiles = listTestFiles();
const analyses = testFiles.map(analyzeFile);

const totals = analyses.reduce(
  (acc, item) => {
    acc.files += 1;
    acc.tests += item.testCount;
    acc.skipped += item.skippedCount;
    acc.placeholders += item.placeholderCount;
    acc.weakAsserts += item.weakAssertCount;
    return acc;
  },
  { files: 0, tests: 0, skipped: 0, placeholders: 0, weakAsserts: 0 },
);

const guardrailCandidates = analyses.filter(
  (f) => f.staticScanCount > 0 || f.file.includes('forbidden-patterns') || f.file.includes('guardrail'),
);

const report = {
  generatedAt: new Date().toISOString(),
  root: process.cwd(),
  totals,
  hotspots: {
    byTestCount: topN(analyses, 'testCount', 10),
    byLineCount: topN(analyses, 'lines', 10),
  },
  qualitySignals: {
    placeholderFiles: overlaps(analyses, 'placeholderCount'),
    skippedFiles: overlaps(analyses, 'skippedCount'),
    weakAssertionFiles: overlaps(analyses, 'weakAssertCount'),
  },
  overlapIndicators: {
    staticScanSuites: guardrailCandidates.map((entry) => ({
      file: entry.file,
      staticScanCount: entry.staticScanCount,
    })),
  },
  hints: [
    'Prefer behavior assertions over placeholder/skipped tests.',
    'Assign each architecture invariant to exactly one guardrail suite.',
    'Keep full demo compile coverage under src/demo/hcl/__tests__/hcl-demos.test.ts.',
  ],
};

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
