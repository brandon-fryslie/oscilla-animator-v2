import path from 'node:path';
import { ESLint } from 'eslint';
import { reportsDir, runnerRoot, writeJson, writeText, mean } from './_shared.mjs';

const outJson = path.join(reportsDir, 'eslint-complexity.json');
const outMd = path.join(reportsDir, 'eslint-complexity.md');
const trackedRules = [
  'complexity',
  'max-depth',
  'max-lines-per-function',
  'max-params',
  'sonarjs/cognitive-complexity',
];

async function main() {
  const eslint = new ESLint({
    // [LAW:one-source-of-truth] Always use the runner branch ESLint complexity config for both compared refs.
    overrideConfigFile: path.join(runnerRoot, 'eslint.complexity.config.js'),
  });

  const results = await eslint.lintFiles(['src/**/*.ts', 'scripts/**/*.mjs']);

  let totalMessages = 0;
  let errorCount = 0;
  let warningCount = 0;
  const ruleCounts = new Map();
  const fileSummaries = [];
  const findings = [];

  for (const result of results) {
    totalMessages += result.messages.length;
    for (const message of result.messages) {
      if (message.severity === 2) errorCount += 1;
      if (message.severity === 1) warningCount += 1;
      const rule = message.ruleId ?? 'unknown';
      ruleCounts.set(rule, (ruleCounts.get(rule) ?? 0) + 1);
      findings.push({
        filePath: result.filePath,
        line: message.line ?? 0,
        column: message.column ?? 0,
        endLine: message.endLine ?? message.line ?? 0,
        endColumn: message.endColumn ?? message.column ?? 0,
        severity: message.severity ?? 0,
        ruleId: message.ruleId ?? 'unknown',
        message: message.message ?? '',
      });
    }

    if (result.messages.length > 0) {
      fileSummaries.push({
        filePath: result.filePath,
        messageCount: result.messages.length,
        errorCount: result.errorCount,
        warningCount: result.warningCount,
      });
    }
  }

  fileSummaries.sort((a, b) => b.messageCount - a.messageCount);
  const sortedRuleCounts = [...ruleCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([ruleId, count]) => ({ ruleId, count }));
  const trackedRuleCounts = trackedRules.map((ruleId) => ({
    ruleId,
    count: ruleCounts.get(ruleId) ?? 0,
  }));

  const summary = {
    tool: 'eslint+sonarjs',
    analyzedFiles: results.length,
    filesWithFindings: fileSummaries.length,
    totalMessages,
    errorCount,
    warningCount,
    avgMessagesPerFlaggedFile: fileSummaries.length === 0 ? 0 : mean(fileSummaries.map((f) => f.messageCount)),
    trackedRuleCounts,
    findings,
    topRules: sortedRuleCounts.slice(0, 20),
    topFiles: fileSummaries.slice(0, 20),
  };

  await writeJson(outJson, summary);

  const md = [
    '# ESLint Complexity Report',
    '',
    `- analyzed files: ${summary.analyzedFiles}`,
    `- files with findings: ${summary.filesWithFindings}`,
    `- total messages: ${summary.totalMessages}`,
    `- errors: ${summary.errorCount}`,
    `- warnings: ${summary.warningCount}`,
    '',
    '## Tracked Complexity Rule Hits',
    '',
    '| Rule | Hits |',
    '| --- | ---: |',
    ...summary.trackedRuleCounts.map((rule) => `| ${rule.ruleId} | ${rule.count} |`),
    '',
    '## Top Rules',
    '',
    '| Rule | Count |',
    '| --- | ---: |',
    ...summary.topRules.map((rule) => `| ${rule.ruleId} | ${rule.count} |`),
    '',
    '## Top Files',
    '',
    '| File | Messages | Errors | Warnings |',
    '| --- | ---: | ---: | ---: |',
    ...summary.topFiles.map((file) => `| ${file.filePath} | ${file.messageCount} | ${file.errorCount} | ${file.warningCount} |`),
    '',
  ].join('\n');

  await writeText(outMd, md);
  console.log(`wrote ${outJson}`);
  console.log(`wrote ${outMd}`);
}

await main();
