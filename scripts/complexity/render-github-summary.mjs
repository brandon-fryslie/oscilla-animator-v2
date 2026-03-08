import fs from 'node:fs/promises';
import path from 'node:path';

const SIGNAL_WEIGHTS = {
  high: 5,
  medium: 3,
  low: 1,
};

const MAGNITUDE_WEIGHTS = {
  none: 0,
  tiny: 1,
  small: 2,
  moderate: 3,
  large: 5,
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

async function readJson(filePath) {
  const raw = await fs.readFile(filePath, 'utf8');
  return JSON.parse(raw);
}

function formatSig2(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 'n/a';
  return numeric.toLocaleString('en-US', { maximumSignificantDigits: 3 });
}

function formatMetricValue(value) {
  return Number.isFinite(value) ? formatSig2(value) : 'n/a';
}

function formatDeltaValue(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 'n/a';
  return `${numeric > 0 ? '+' : ''}${formatSig2(numeric)}`;
}

function formatPctValue(value) {
  if (!Number.isFinite(value)) return 'n/a';
  return `${formatSig2(value)}%`;
}

function escapeCell(value) {
  return String(value ?? '')
    .replaceAll('|', '\\|')
    .replaceAll('\n', ' ')
    .trim();
}

function renderTable(headers, rows) {
  const headerLine = `| ${headers.map(escapeCell).join(' | ')} |`;
  const dividerLine = `| ${headers.map(() => '---').join(' | ')} |`;
  const bodyLines = rows.length > 0
    ? rows.map((row) => `| ${row.map(escapeCell).join(' | ')} |`)
    : [`| ${headers.map((_, idx) => idx === 0 ? 'none' : '-').join(' | ')} |`];
  return [headerLine, dividerLine, ...bodyLines].join('\n');
}

function rowToSummaryRow(row) {
  return [
    row.label,
    formatMetricValue(row.base),
    formatMetricValue(row.head),
    formatDeltaValue(row.delta),
    formatPctValue(row.relativeDeltaPct),
    row.magnitude,
    row.impact,
  ];
}

function rowToFullRow(row) {
  return [
    row.key,
    row.label,
    formatMetricValue(row.base),
    formatMetricValue(row.head),
    formatDeltaValue(row.delta),
    formatPctValue(row.relativeDeltaPct),
    row.classification,
    row.magnitude,
    row.signal,
  ];
}

function scoreRows(rows) {
  // [LAW:one-source-of-truth] The indicator is derived only from canonical per-metric delta rows.
  return rows.reduce((total, row) => {
    if (row.classification !== 'improved' && row.classification !== 'regressed') return total;
    const signalWeight = SIGNAL_WEIGHTS[row.signal] ?? 1;
    const magnitudeWeight = MAGNITUDE_WEIGHTS[row.magnitude] ?? 1;
    const contribution = signalWeight * magnitudeWeight;
    return row.classification === 'improved' ? total + contribution : total - contribution;
  }, 0);
}

function classifyTrend(weightedScore) {
  if (weightedScore <= -20) {
    return {
      label: 'VERY BAD',
      badgeLabel: 'very bad',
      badgeColor: 'red',
      description: 'bold+red: severe regression across high-impact metrics',
      emphasize: true,
    };
  }
  if (weightedScore <= -8) {
    return {
      label: 'bad',
      badgeLabel: 'bad',
      badgeColor: 'red',
      description: 'red: net regression',
      emphasize: false,
    };
  }
  if (weightedScore <= 0) {
    return {
      label: 'warning',
      badgeLabel: 'warning',
      badgeColor: 'yellow',
      description: 'yellow: flat-to-negative trend',
      emphasize: false,
    };
  }
  if (weightedScore <= 7) {
    return {
      label: 'improvement',
      badgeLabel: 'improvement',
      badgeColor: 'yellowgreen',
      description: 'yellow-green: modest improvement',
      emphasize: false,
    };
  }
  if (weightedScore <= 20) {
    return {
      label: 'solid improvement',
      badgeLabel: 'solid improvement',
      badgeColor: 'green',
      description: 'light green: strong positive trend',
      emphasize: false,
    };
  }
  return {
    label: 'AWESOME IMPROVEMENT',
    badgeLabel: 'awesome improvement',
    badgeColor: 'brightgreen',
    description: 'bright green + bold: major positive shift',
    emphasize: true,
  };
}

function renderBadge(trend) {
  const label = encodeURIComponent(trend.badgeLabel);
  return `![Complexity trend](https://img.shields.io/badge/Complexity%20trend-${label}-${trend.badgeColor}?style=for-the-badge)`;
}

function renderSummaryMarkdown(delta, options) {
  const weightedScore = scoreRows(delta.rows ?? []);
  const trend = classifyTrend(weightedScore);
  const visibleTrendLabel = trend.emphasize ? `**${trend.label}**` : trend.label;
  const baseSha = options.baseSha ? `\`${options.baseSha}\`` : 'unknown';
  const headSha = options.headSha ? `\`${options.headSha}\`` : 'unknown';
  const artifactUrl = options.artifactUrl ? `[Download archived HTML report](${options.artifactUrl})` : 'Artifact URL unavailable';

  const highSignalRegressionRows = (delta.highSignalRegressions ?? []).map(rowToSummaryRow);
  const highSignalImprovementRows = (delta.highSignalImprovements ?? []).map(rowToSummaryRow);
  const fullRows = (delta.rows ?? []).map(rowToFullRow);
  const guideRows = (delta.guide ?? []).map((row) => [row.label, row.directionLabel, row.target, row.signal]);

  return [
    '## Complexity Delta Summary',
    '',
    `${renderBadge(trend)} ${visibleTrendLabel}`,
    '',
    `- trend class: ${trend.description}`,
    `- weighted trend score: ${weightedScore}`,
    `- net score (improved - regressed): ${delta.score}`,
    `- improved metrics: ${delta.improvedCount}, regressed metrics: ${delta.regressedCount}, unchanged/informational: ${delta.unchangedCount}`,
    `- artifact: ${artifactUrl}`,
    '',
    '### High-Signal Regressions',
    '',
    renderTable(
      ['Metric', 'Base', 'Head', 'Delta', '% Delta', 'Magnitude', 'Impact'],
      highSignalRegressionRows,
    ),
    '',
    '### High-Signal Improvements',
    '',
    renderTable(
      ['Metric', 'Base', 'Head', 'Delta', '% Delta', 'Magnitude', 'Impact'],
      highSignalImprovementRows,
    ),
    '',
    '<details>',
    '<summary>Run Context (collapsed)</summary>',
    '',
    `- base: ${baseSha}`,
    `- head: ${headSha}`,
    `- base report generated: ${delta.baseGeneratedAt ?? 'unknown'}`,
    `- head report generated: ${delta.headGeneratedAt ?? 'unknown'}`,
    `- delta generated: ${delta.generatedAt ?? 'unknown'}`,
    '',
    '</details>',
    '',
    '<details>',
    '<summary>How Indicator Scoring Works (collapsed)</summary>',
    '',
    '- Each improved/regressed metric contributes a signed weight from `signal × magnitude`.',
    '- Signal weights: `high=5`, `medium=3`, `low=1`.',
    '- Magnitude weights: `tiny=1`, `small=2`, `moderate=3`, `large=5`.',
    '- Weighted score bands:',
    '  - `<= -20`: **VERY BAD** (bold + red)',
    '  - `-19..-8`: bad (red)',
    '  - `-7..0`: warning (yellow)',
    '  - `1..7`: improvement (yellow-green)',
    '  - `8..20`: solid improvement (light green)',
    '  - `> 20`: **AWESOME IMPROVEMENT** (bold + bright green)',
    '',
    '</details>',
    '',
    '<details>',
    '<summary>Metric Interpretation Guide (collapsed)</summary>',
    '',
    renderTable(
      ['Metric', 'Desired Trend', 'Practical Target Range', 'Signal'],
      guideRows,
    ),
    '',
    '</details>',
    '',
    '<details>',
    '<summary>Full Delta Table (collapsed)</summary>',
    '',
    renderTable(
      ['Key', 'Metric', 'Base', 'Head', 'Delta', '% Delta', 'Classification', 'Magnitude', 'Signal'],
      fullRows,
    ),
    '',
    '</details>',
    '',
  ].join('\n');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const deltaJsonPath = args['delta-json'];
  if (!deltaJsonPath) {
    console.error('usage: node scripts/complexity/render-github-summary.mjs --delta-json <path> [--artifact-url <url>] [--base-sha <sha>] [--head-sha <sha>]');
    process.exit(1);
  }

  const delta = await readJson(path.resolve(deltaJsonPath));
  const markdown = renderSummaryMarkdown(delta, {
    artifactUrl: typeof args['artifact-url'] === 'string' ? args['artifact-url'] : null,
    baseSha: typeof args['base-sha'] === 'string' ? args['base-sha'] : null,
    headSha: typeof args['head-sha'] === 'string' ? args['head-sha'] : null,
  });

  // [LAW:verifiable-goals] Emit deterministic markdown so CI summaries are machine-comparable.
  process.stdout.write(markdown);
}

await main();
