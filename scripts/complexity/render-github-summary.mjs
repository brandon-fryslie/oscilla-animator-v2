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

function rowStatus(row) {
  if (row.classification === 'regressed') {
    const severe = row.signal === 'high' && (row.magnitude === 'moderate' || row.magnitude === 'large');
    if (severe) return { level: 'very-bad', label: 'very bad', emoji: '🟥' };
    return { level: 'bad', label: 'bad', emoji: '🔴' };
  }
  if (row.classification === 'improved') {
    const excellent = row.signal === 'high' && (row.magnitude === 'moderate' || row.magnitude === 'large');
    if (excellent) return { level: 'awesome', label: 'awesome improvement', emoji: '🟩✨' };
    if (row.magnitude === 'moderate' || row.magnitude === 'large') {
      return { level: 'solid', label: 'solid improvement', emoji: '🟩' };
    }
    return { level: 'improvement', label: 'improvement', emoji: '🟨🟩' };
  }
  return { level: 'warning', label: 'warning', emoji: '🟡' };
}

function rowToSummaryRow(row) {
  const status = rowStatus(row);
  return [
    `${status.emoji} ${status.label}`,
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
  const status = rowStatus(row);
  return [
    `${status.emoji} ${status.label}`,
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
  // [LAW:one-source-of-truth] Trend score derives strictly from canonical per-metric delta rows.
  return rows.reduce((total, row) => {
    if (row.classification !== 'improved' && row.classification !== 'regressed') return total;
    const signalWeight = SIGNAL_WEIGHTS[row.signal] ?? 1;
    const magnitudeWeight = MAGNITUDE_WEIGHTS[row.magnitude] ?? 1;
    const contribution = signalWeight * magnitudeWeight;
    return row.classification === 'improved' ? total + contribution : total - contribution;
  }, 0);
}

function classifyTrend(weightedScore, rows) {
  const severeRegressions = rows.filter((row) => rowStatus(row).level === 'very-bad').length;
  if (severeRegressions > 0 && weightedScore <= -20) {
    return {
      label: 'very bad',
      badgeLabel: 'very bad',
      badgeColor: 'red',
      emphasize: true,
    };
  }
  if (weightedScore <= -8) {
    return {
      label: 'bad',
      badgeLabel: 'bad',
      badgeColor: 'red',
      emphasize: false,
    };
  }
  if (weightedScore <= 0) {
    return {
      label: 'warning',
      badgeLabel: 'warning',
      badgeColor: 'yellow',
      emphasize: false,
    };
  }
  if (weightedScore <= 7) {
    return {
      label: 'improvement',
      badgeLabel: 'improvement',
      badgeColor: 'yellowgreen',
      emphasize: false,
    };
  }
  if (weightedScore <= 20) {
    return {
      label: 'solid improvement',
      badgeLabel: 'solid improvement',
      badgeColor: 'green',
      emphasize: false,
    };
  }
  return {
    label: 'awesome improvement',
    badgeLabel: 'awesome improvement',
    badgeColor: 'brightgreen',
    emphasize: true,
  };
}

function summarizeTrendNarrative(rows) {
  const regressed = rows.filter((row) => row.classification === 'regressed');
  const improved = rows.filter((row) => row.classification === 'improved');
  const severe = regressed.filter((row) => rowStatus(row).level === 'very-bad').length;
  const minorRegressed = regressed.filter((row) => row.impact === 'minor regression').length;
  const meaningfulRegressed = regressed.filter((row) => row.impact === 'meaningful regression').length;
  const highValueImproved = improved.filter((row) => row.impact === 'high-value improvement').length;
  const meaningfulImproved = improved.filter((row) => row.impact === 'meaningful improvement').length;

  if (regressed.length === 0 && improved.length === 0) return 'No metric-level movement.';
  if (severe > 0) return `${severe} severe row-level regressions detected.`;
  if (regressed.length > improved.length) {
    return `Net regression with mostly minor impacts (${minorRegressed}/${regressed.length} minor, ${meaningfulRegressed} meaningful).`;
  }
  if (improved.length > regressed.length) {
    return `Net improvement (${highValueImproved} high-value, ${meaningfulImproved} meaningful improvements).`;
  }
  return 'Mixed trend with offsetting improvements and regressions.';
}

function renderBadge(trend) {
  const label = encodeURIComponent(trend.badgeLabel);
  return `![Complexity trend](https://img.shields.io/badge/Complexity%20trend-${label}-${trend.badgeColor}?style=for-the-badge)`;
}

function renderMetricContext(rows, metricAttribution) {
  const relevantRows = rows.filter((row) => row.classification === 'regressed' || row.classification === 'improved');
  if (relevantRows.length === 0) return 'No changed metrics.';
  return relevantRows.map((row) => {
    const status = rowStatus(row);
    const details = metricAttribution[row.key] ?? { locations: [], snippets: [], evidence: [] };
    const links = Array.isArray(details.locations) ? details.locations : [];
    const snippets = Array.isArray(details.snippets) ? details.snippets : [];
    const evidence = Array.isArray(details.evidence) ? details.evidence : [];
    return [
      '<details>',
      `<summary>${status.emoji} ${escapeCell(row.label)} (${formatDeltaValue(row.delta)}, ${formatPctValue(row.relativeDeltaPct)})</summary>`,
      '',
      ...(evidence.length > 0
        ? ['Evidence:', ...evidence.slice(0, 5).map((line) => `- ${line}`), '']
        : ['Evidence: none captured', '']),
      ...(links.length > 0
        ? ['Code links (commit + file + line range):', ...links.slice(0, 6).map((link) => `- [\`${link.filePath}:${link.startLine}-${link.endLine}\`](${link.url})`), '']
        : ['Code links: none captured', '']),
      ...(snippets.length > 0
        ? [
          'Snippets:',
          ...snippets.slice(0, 3).flatMap((snippet) => [
            `<details><summary>\`${snippet.filePath}:${snippet.startLine}-${snippet.endLine}\`</summary>`,
            '',
            `${snippet.url ? `[Open file at commit](${snippet.url})` : 'No file link available'}${snippet.compareUrl ? ` · [Open compare](${snippet.compareUrl})` : ''}`,
            '',
            '```diff',
            snippet.snippet,
            '```',
            '</details>',
          ]),
          '',
        ]
        : ['Snippets: none captured', '']),
      '</details>',
    ].join('\n');
  }).join('\n');
}

function renderSummaryMarkdown(delta, options) {
  const rows = delta.rows ?? [];
  const weightedScore = scoreRows(rows);
  const trend = classifyTrend(weightedScore, rows);
  const trendLabel = trend.emphasize ? `**${trend.label}**` : trend.label;
  const baseSha = options.baseSha ? `\`${options.baseSha}\`` : 'unknown';
  const headSha = options.headSha ? `\`${options.headSha}\`` : 'unknown';
  const artifactUrl = options.artifactUrl ? `[Download archived HTML report](${options.artifactUrl})` : 'Artifact URL unavailable';
  const highSignalRegressionRows = (delta.highSignalRegressions ?? []).map(rowToSummaryRow);
  const highSignalImprovementRows = (delta.highSignalImprovements ?? []).map(rowToSummaryRow);
  const fullRows = rows.map(rowToFullRow);
  const guideRows = (delta.guide ?? []).map((row) => [row.label, row.directionLabel, row.target, row.signal]);
  const metricAttribution = delta.metricAttribution ?? delta.regressionAttribution ?? {};

  return [
    '## Complexity Delta Summary',
    '',
    `${renderBadge(trend)}`,
    '',
    `- trend assessment: ${trendLabel} (${summarizeTrendNarrative(rows)})`,
    `- weighted trend score: ${weightedScore}`,
    `- net score (improved - regressed): ${delta.score}`,
    `- improved metrics: ${delta.improvedCount}, regressed metrics: ${delta.regressedCount}, unchanged/informational: ${delta.unchangedCount}`,
    `- artifact: ${artifactUrl}`,
    '',
    '### High-Signal Regressions',
    '',
    renderTable(
      ['Indicator', 'Metric', 'Base', 'Head', 'Delta', '% Delta', 'Magnitude', 'Impact'],
      highSignalRegressionRows,
    ),
    '',
    '### High-Signal Improvements',
    '',
    renderTable(
      ['Indicator', 'Metric', 'Base', 'Head', 'Delta', '% Delta', 'Magnitude', 'Impact'],
      highSignalImprovementRows,
    ),
    '',
    '<details>',
    '<summary>Code Context (collapsed)</summary>',
    '',
    renderMetricContext(rows, metricAttribution),
    '',
    '</details>',
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
    '- Row-level indicators:',
    '  - `🟥` = very bad',
    '  - `🔴` = bad',
    '  - `🟡` = warning',
    '  - `🟨🟩` = improvement',
    '  - `🟩` = solid improvement',
    '  - `🟩✨` = awesome improvement',
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
      ['Indicator', 'Key', 'Metric', 'Base', 'Head', 'Delta', '% Delta', 'Classification', 'Magnitude', 'Signal'],
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
