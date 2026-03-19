import fs from 'node:fs/promises';
import path from 'node:path';
import {
  classifyTrend,
  isComplexityMetric,
  rowStatus,
  scoreRows,
  sortRowsForDisplay,
  summarizeTrendNarrative,
} from './delta-visuals.mjs';

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

function formatFileGatePolicy(fileGate) {
  return typeof fileGate?.policySummary === 'string' && fileGate.policySummary.length > 0
    ? fileGate.policySummary
    : `under threshold OR >= ${formatPctValue(fileGate?.minImprovementPct)} improvement`;
}

function fileGatePolicyNotice(fileGate) {
  return typeof fileGate?.policyNotice === 'string' && fileGate.policyNotice.length > 0
    ? fileGate.policyNotice
    : 'MANDATORY: changed-file gate policy notice missing from delta JSON.';
}

function escapeCell(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('|', '\\|')
    .replaceAll('\n', ' ')
    .trim();
}

function escapeSummaryText(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function escapeCodeBlock(value) {
  return escapeSummaryText(String(value ?? '')).replaceAll('```', '`\\`\\`');
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

function findLocationForEvidence(evidenceLine, locations) {
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

function renderMetricInlineLinks(row, metricAttribution) {
  const details = metricAttribution?.[row.key] ?? {};
  const locations = Array.isArray(details.locations) ? details.locations : [];
  const links = locations
    .slice(0, 2)
    .map((location) => {
      const safeUrl = sanitizeHttpUrl(location.url);
      if (!safeUrl) return null;
      return `[\`${location.filePath}:${location.startLine}-${location.endLine}\`](${safeUrl})`;
    })
    .filter(Boolean);
  return links.length > 0 ? `${row.label} · ${links.join(' · ')}` : row.label;
}

function renderTable(headers, rows) {
  const headerLine = `| ${headers.map(escapeCell).join(' | ')} |`;
  const dividerLine = `| ${headers.map(() => '---').join(' | ')} |`;
  const bodyLines = rows.length > 0
    ? rows.map((row) => `| ${row.map(escapeCell).join(' | ')} |`)
    : [`| ${headers.map((_, idx) => idx === 0 ? 'none' : '-').join(' | ')} |`];
  return [headerLine, dividerLine, ...bodyLines].join('\n');
}

function rowToSummaryRow(row, metricAttribution) {
  const status = rowStatus(row);
  return [
    row.signal,
    renderMetricInlineLinks(row, metricAttribution),
    `${formatMetricValue(row.base)}/${formatMetricValue(row.head)}`,
    `${status.emoji} ${formatDeltaValue(row.delta)} (${formatPctValue(row.relativeDeltaPct)})`,
    row.magnitude,
    row.impact,
  ];
}

function rowToFullRow(row, metricAttribution) {
  return rowToSummaryRow(row, metricAttribution);
}

function renderBadge(trend) {
  const label = encodeURIComponent(trend.badgeLabel);
  return `![Complexity trend](https://img.shields.io/badge/Complexity%20trend-${label}-${trend.badgeColor}?style=for-the-badge)`;
}

function renderMetricContext(rows, metricAttribution) {
  const relevantRows = rows.filter((row) => {
    const status = rowStatus(row);
    return status.kind === 'regression' || status.kind === 'improvement';
  });
  if (relevantRows.length === 0) return 'No changed metrics.';
  return relevantRows.map((row) => {
    const status = rowStatus(row);
    const details = metricAttribution[row.key] ?? { locations: [], snippets: [], evidence: [] };
    const links = Array.isArray(details.locations) ? details.locations : [];
    const snippets = Array.isArray(details.snippets) ? details.snippets : [];
    const evidence = Array.isArray(details.evidence) ? details.evidence : [];
    const evidenceLines = evidence.map((line) => {
      const matchedLocation = findLocationForEvidence(line, links);
      const safeUrl = sanitizeHttpUrl(matchedLocation?.url);
      if (!safeUrl || !matchedLocation) return `- ${escapeSummaryText(String(line))}`;
      const text = String(line);
      const tokenMatch = text.match(/^([^:\s][^:]*:\d+:\d+)(.*)$/);
      if (!tokenMatch) {
        const fallbackToken = `${matchedLocation.filePath}:${matchedLocation.startLine}-${matchedLocation.endLine}`;
        return `- [\`${escapeCell(fallbackToken)}\`](${safeUrl})${text ? ` ${escapeSummaryText(text)}` : ''}`;
      }
      const token = tokenMatch[1];
      const rest = tokenMatch[2] ?? '';
      return `- [\`${escapeCell(token)}\`](${safeUrl})${escapeSummaryText(rest)}`;
    });
    const unmatchedLinks = links
      .filter((location) => !evidence.some((line) => findLocationForEvidence(line, [location])))
      .map((location) => {
        const safeUrl = sanitizeHttpUrl(location.url);
        if (!safeUrl) return null;
        return `- [\`${escapeCell(`${location.filePath}:${location.startLine}-${location.endLine}`)}\`](${safeUrl})`;
      })
      .filter(Boolean);
    return [
      '<details>',
      `<summary>${status.emoji} ${escapeCell(row.label)} (${formatDeltaValue(row.delta)}, ${formatPctValue(row.relativeDeltaPct)})</summary>`,
      '',
      ...((evidenceLines.length > 0 || unmatchedLinks.length > 0)
        ? ['Evidence:', ...evidenceLines.slice(0, 5), ...unmatchedLinks.slice(0, 5), '']
        : ['Evidence: none captured', '']),
      ...(snippets.length > 0
        ? [
          'Snippets:',
          ...snippets.slice(0, 3).flatMap((snippet) => [
            (() => {
              const safeSnippetUrl = sanitizeHttpUrl(snippet.url);
              const safeCompareUrl = sanitizeHttpUrl(snippet.compareUrl);
              return [
                `<details><summary>\`${escapeCell(String(snippet.filePath))}:${snippet.startLine}-${snippet.endLine}\`</summary>`,
                '',
                `${safeSnippetUrl ? `[Open file at commit](${safeSnippetUrl})` : 'No file link available'}${safeCompareUrl ? ` · [Open compare](${safeCompareUrl})` : ''}`,
                '',
                '```diff',
                escapeCodeBlock(snippet.snippet),
                '```',
                '</details>',
              ].join('\n');
            })(),
          ]),
          '',
        ]
        : ['Snippets: none captured', '']),
      '</details>',
    ].join('\n');
  }).join('\n');
}

function renderSummaryMarkdown(delta, options) {
  const rows = (delta.rows ?? []).filter(isComplexityMetric);
  const sortedRows = sortRowsForDisplay(rows);
  const weightedScore = scoreRows(rows);
  const trend = classifyTrend(weightedScore, rows);
  const trendLabel = trend.emphasize ? `**${trend.label}**` : trend.label;
  const improvedCount = rows.filter((row) => rowStatus(row).kind === 'improvement').length;
  const regressedCount = rows.filter((row) => rowStatus(row).kind === 'regression').length;
  const statusNetScore = improvedCount - regressedCount;
  const neutralCount = rows.filter((row) => ['neutral', 'unchanged'].includes(rowStatus(row).kind)).length;
  const baseSha = options.baseSha ? `\`${options.baseSha}\`` : 'unknown';
  const headSha = options.headSha ? `\`${options.headSha}\`` : 'unknown';
  const safeArtifactUrl = sanitizeHttpUrl(options.artifactUrl);
  const artifactUrl = safeArtifactUrl ? `[Download archived HTML report](${safeArtifactUrl})` : 'Artifact URL unavailable';
  const metricAttribution = delta.metricAttribution ?? delta.regressionAttribution ?? {};
  const fileGate = delta.fileThresholdGate ?? null;
  const highSignalRegressionRows = sortRowsForDisplay(
    (delta.highSignalRegressions ?? [])
      .filter(isComplexityMetric)
      .filter((row) => rowStatus(row).kind === 'regression'),
  ).map((row) => rowToSummaryRow(row, metricAttribution));
  const highSignalImprovementRows = sortRowsForDisplay(
    (delta.highSignalImprovements ?? [])
      .filter(isComplexityMetric)
      .filter((row) => rowStatus(row).kind === 'improvement'),
  ).map((row) => rowToSummaryRow(row, metricAttribution));
  const fullRows = sortedRows.map((row) => rowToFullRow(row, metricAttribution));
  const guideRows = (delta.guide ?? [])
    .filter((row) => row.direction !== 'info')
    .map((row) => [row.label, row.directionLabel, row.target, row.signal, row.description ?? '']);

  return [
    '## Complexity Delta Summary',
    '',
    `${renderBadge(trend)}`,
    '',
    `- trend assessment: ${trendLabel} (${summarizeTrendNarrative(rows)})`,
    `- weighted trend score: ${weightedScore}`,
    `- net score (improved - regressed): ${statusNetScore}`,
    `- improved metrics: ${improvedCount}, regressed metrics: ${regressedCount}, unchanged/near-zero: ${neutralCount}`,
    `- artifact: ${artifactUrl}`,
    ...(fileGate ? [
      `- changed-file threshold advisory: ${fileGate.passed ? 'pass' : 'would fail'} (${fileGate.failureCount}/${fileGate.evaluationCount} failing checks across ${fileGate.trackedChangedFilesCount} tracked changed files)`,
      `- changed-file threshold policy: ${formatFileGatePolicy(fileGate)}`,
      // [LAW:one-source-of-truth] Render the canonical advisory notice from delta JSON so CI output cannot drift from the computed report policy.
      `- changed-file threshold policy note: ${fileGatePolicyNotice(fileGate)}`,
    ] : []),
    '',
    '### High-Signal Regressions',
    '',
    renderTable(
      ['Signal', 'Metric', 'Base/Head', 'Delta (%)', 'Magnitude', 'Impact'],
      highSignalRegressionRows,
    ),
    '',
    '### High-Signal Improvements',
    '',
    renderTable(
      ['Signal', 'Metric', 'Base/Head', 'Delta (%)', 'Magnitude', 'Impact'],
      highSignalImprovementRows,
    ),
    '',
    ...(fileGate ? [
      '### Changed-File Threshold Advisory',
      '',
      `Policy: ${escapeSummaryText(formatFileGatePolicy(fileGate))}`,
      '',
      `Policy note: ${escapeSummaryText(fileGatePolicyNotice(fileGate))}`,
      '',
      renderTable(
        ['File', 'Metric', 'Base/Head', 'Delta (%)', 'Threshold', 'Result'],
        (fileGate.evaluations ?? []).slice(0, 300).map((evaluation) => {
          const deltaValue = Number(evaluation.headValue) - Number(evaluation.baseValue);
          const deltaPct = Number.isFinite(evaluation.improvementPct)
            ? evaluation.improvementPct
            : null;
          const statusEmoji = evaluation.passed ? '✅' : '❌';
          return [
            evaluation.filePath,
            evaluation.metricLabel,
            `${formatMetricValue(evaluation.baseValue)}/${formatMetricValue(evaluation.headValue)}`,
            `${statusEmoji} ${formatDeltaValue(deltaValue)} (${formatPctValue(deltaPct)})`,
            `${evaluation.direction === 'higher' ? '>=' : '<='} ${formatMetricValue(evaluation.threshold)}`,
            evaluation.passed ? 'pass' : 'would fail',
          ];
        }),
      ),
      '',
    ] : []),
    '<details>',
    '<summary>Code Context (collapsed)</summary>',
    '',
    renderMetricContext(sortedRows, metricAttribution),
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
    '  - `⬜️` unchanged',
    '  - `😐` changed < 2% (either direction)',
    '  - Worse: `🟨` `🟧` `🟥` `‼️`',
    '  - Better: `🟩` `✅` `❇️` `🤑`',
    '- Sorting: signal (`high` first), then worst-to-best delta.',
    '',
    '</details>',
    '',
    '<details>',
    '<summary>Metric Interpretation Guide (collapsed)</summary>',
    '',
    renderTable(
      ['Metric', 'Desired Trend', 'Practical Target Range', 'Signal', 'Description'],
      guideRows,
    ),
    '',
    '</details>',
    '',
    '<details>',
    '<summary>Full Delta Table (collapsed)</summary>',
    '',
    renderTable(
      ['Signal', 'Metric', 'Base/Head', 'Delta (%)', 'Magnitude', 'Impact'],
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
