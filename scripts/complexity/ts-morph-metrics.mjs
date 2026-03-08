import path from 'node:path';
import { Project, SyntaxKind } from 'ts-morph';
import { reportsDir, writeJson, writeText, mean, percentile } from './_shared.mjs';

const outJson = path.join(reportsDir, 'ts-morph-metrics.json');
const outMd = path.join(reportsDir, 'ts-morph-metrics.md');

const decisionKinds = new Set([
  SyntaxKind.IfStatement,
  SyntaxKind.ConditionalExpression,
  SyntaxKind.SwitchStatement,
  SyntaxKind.CaseClause,
  SyntaxKind.DefaultClause,
  SyntaxKind.ForStatement,
  SyntaxKind.ForInStatement,
  SyntaxKind.ForOfStatement,
  SyntaxKind.WhileStatement,
  SyntaxKind.DoStatement,
  SyntaxKind.CatchClause,
]);

const functionKinds = new Set([
  SyntaxKind.FunctionDeclaration,
  SyntaxKind.MethodDeclaration,
  SyntaxKind.ArrowFunction,
  SyntaxKind.FunctionExpression,
  SyntaxKind.GetAccessor,
  SyntaxKind.SetAccessor,
]);

function isDecisionNode(node) {
  if (decisionKinds.has(node.getKind())) return true;
  if (node.getKind() === SyntaxKind.BinaryExpression) {
    const op = node.getOperatorToken().getText();
    return op === '&&' || op === '||' || op === '??';
  }
  return false;
}

function operatorMatches(text) {
  return text.match(/(\+\+|--|===|!==|==|!=|<=|>=|&&|\|\||\?\?|=>|\+=|-=|\*=|\/=|%=|\+|-|\*|\/|%|<|>|!|=)/g) ?? [];
}

function operandMatches(text) {
  return text.match(/\b[_$A-Za-z][_$A-Za-z0-9]*\b|\b\d+(?:\.\d+)?\b/g) ?? [];
}

function computeHalstead(text) {
  const operators = operatorMatches(text);
  const operands = operandMatches(text);
  const uniqueOperators = new Set(operators);
  const uniqueOperands = new Set(operands);
  const n1 = uniqueOperators.size;
  const n2 = uniqueOperands.size;
  const N1 = operators.length;
  const N2 = operands.length;
  const vocabulary = Math.max(2, n1 + n2);
  const length = N1 + N2;
  const volume = length * Math.log2(vocabulary);
  const difficulty = (n1 / 2) * (N2 / Math.max(1, n2));
  const effort = volume * difficulty;
  return {
    n1,
    n2,
    N1,
    N2,
    vocabulary,
    length,
    volume,
    difficulty,
    effort,
  };
}

function maintainabilityIndex(halsteadVolume, cyclomatic, loc) {
  const volume = Math.max(1, halsteadVolume);
  const lines = Math.max(1, loc);
  const raw = 171 - 5.2 * Math.log(volume) - 0.23 * cyclomatic - 16.2 * Math.log(lines);
  const normalized = Math.max(0, Math.min(100, (raw * 100) / 171));
  return normalized;
}

function functionName(node) {
  const named = node.getSymbol()?.getName();
  if (named) return named;
  const source = node.getSourceFile().getBaseName();
  return `<anonymous>@${source}:${node.getStartLineNumber()}`;
}

function complexityForNode(node) {
  const descendants = node.getDescendants();
  let cyclomatic = 1;
  let cognitive = 0;
  let maxNestingDepth = 0;

  for (const descendant of descendants) {
    if (!isDecisionNode(descendant)) continue;
    cyclomatic += 1;
    const nesting = descendant
      .getAncestors()
      .filter((ancestor) => isDecisionNode(ancestor))
      .length;
    cognitive += 1 + nesting;
    maxNestingDepth = Math.max(maxNestingDepth, nesting + 1);
  }

  const start = node.getStartLineNumber();
  const end = node.getEndLineNumber();
  const loc = Math.max(1, end - start + 1);
  const halstead = computeHalstead(node.getText());
  const mi = maintainabilityIndex(halstead.volume, cyclomatic, loc);

  return {
    cyclomatic,
    cognitive,
    maxNestingDepth,
    loc,
    halstead,
    maintainabilityIndex: mi,
  };
}

async function main() {
  const project = new Project({ tsConfigFilePath: path.join(process.cwd(), 'tsconfig.json') });
  const sourceFiles = project
    .getSourceFiles('src/**/*.ts')
    .filter((sourceFile) => !sourceFile.isDeclarationFile());
  const sourceFilePaths = new Set(sourceFiles.map((sourceFile) => sourceFile.getFilePath()));

  const moduleFanOut = [];
  const moduleFanInMap = new Map(
    sourceFiles.map((sourceFile) => [sourceFile.getFilePath(), 0]),
  );
  const functionMetrics = [];
  const sourceLocValues = [];
  const sourceLocByFile = new Map();

  for (const sourceFile of sourceFiles) {
    const sourceLoc = sourceFile.getFullText().split(/\r?\n/).length;
    sourceLocByFile.set(sourceFile.getFilePath(), sourceLoc);

    const imports = sourceFile.getImportDeclarations();
    moduleFanOut.push({
      filePath: sourceFile.getFilePath(),
      fanOut: imports.length,
    });
    sourceLocValues.push(sourceLoc);

    for (const imp of imports) {
      const target = imp.getModuleSpecifierSourceFile();
      if (!target) continue;
      const targetPath = target.getFilePath();
      if (!sourceFilePaths.has(targetPath)) continue;
      moduleFanInMap.set(targetPath, (moduleFanInMap.get(targetPath) ?? 0) + 1);
    }

    const functionNodes = sourceFile
      .getDescendants()
      .filter((descendant) => functionKinds.has(descendant.getKind()));

    for (const node of functionNodes) {
      const metrics = complexityForNode(node);
      functionMetrics.push({
        filePath: sourceFile.getFilePath(),
        name: functionName(node),
        ...metrics,
      });
    }
  }

  const cyclomaticValues = functionMetrics.map((m) => m.cyclomatic).sort((a, b) => a - b);
  const cognitiveValues = functionMetrics.map((m) => m.cognitive).sort((a, b) => a - b);
  const nestingValues = functionMetrics.map((m) => m.maxNestingDepth).sort((a, b) => a - b);
  const functionLocValues = functionMetrics.map((m) => m.loc).sort((a, b) => a - b);
  const halsteadVolumeValues = functionMetrics.map((m) => m.halstead.volume).sort((a, b) => a - b);
  const halsteadDifficultyValues = functionMetrics.map((m) => m.halstead.difficulty).sort((a, b) => a - b);
  const halsteadEffortValues = functionMetrics.map((m) => m.halstead.effort).sort((a, b) => a - b);
  const miValues = functionMetrics.map((m) => m.maintainabilityIndex).sort((a, b) => a - b);
  const fanOutValues = moduleFanOut.map((m) => m.fanOut).sort((a, b) => a - b);
  const moduleFanIn = [...moduleFanInMap.entries()].map(([filePath, fanIn]) => ({ filePath, fanIn }));
  const fanInValues = moduleFanIn.map((m) => m.fanIn).sort((a, b) => a - b);
  const fanOutByFile = new Map(moduleFanOut.map((entry) => [entry.filePath, entry.fanOut]));
  const fanInByFile = new Map(moduleFanIn.map((entry) => [entry.filePath, entry.fanIn]));
  const functionMetricsByFile = new Map();
  for (const metric of functionMetrics) {
    const list = functionMetricsByFile.get(metric.filePath) ?? [];
    list.push(metric);
    functionMetricsByFile.set(metric.filePath, list);
  }

  const topCyclomatic = [...functionMetrics].sort((a, b) => b.cyclomatic - a.cyclomatic).slice(0, 25);
  const topCognitive = [...functionMetrics].sort((a, b) => b.cognitive - a.cognitive).slice(0, 25);
  const topNesting = [...functionMetrics].sort((a, b) => b.maxNestingDepth - a.maxNestingDepth).slice(0, 25);
  const topHalsteadVolume = [...functionMetrics].sort((a, b) => b.halstead.volume - a.halstead.volume).slice(0, 25);
  const topLowMaintainability = [...functionMetrics].sort((a, b) => a.maintainabilityIndex - b.maintainabilityIndex).slice(0, 25);
  const topFanOut = [...moduleFanOut].sort((a, b) => b.fanOut - a.fanOut).slice(0, 25);
  const topFanIn = [...moduleFanIn].sort((a, b) => b.fanIn - a.fanIn).slice(0, 25);
  // Reuse canonical per-file source LOC, computed once during source-file traversal.
  const totalSourceLoc = [...sourceLocByFile.values()].reduce((sum, value) => sum + value, 0);
  const fileMetrics = sourceFiles
    .map((sourceFile) => {
      const filePath = sourceFile.getFilePath();
      const functions = functionMetricsByFile.get(filePath) ?? [];
      const maintainabilityValues = functions.map((metric) => metric.maintainabilityIndex);
      const lineCount = sourceLocByFile.get(filePath) ?? 0;
      return {
        filePath: path.relative(process.cwd(), filePath).replaceAll('\\', '/'),
        functionCount: functions.length,
        maxCyclomatic: functions.reduce((max, metric) => Math.max(max, metric.cyclomatic), 0),
        maxCognitive: functions.reduce((max, metric) => Math.max(max, metric.cognitive), 0),
        maxNestingDepth: functions.reduce((max, metric) => Math.max(max, metric.maxNestingDepth), 0),
        maxHalsteadVolume: functions.reduce((max, metric) => Math.max(max, metric.halstead.volume), 0),
        avgMaintainabilityIndex: maintainabilityValues.length > 0 ? mean(maintainabilityValues) : null,
        minMaintainabilityIndex: maintainabilityValues.length > 0 ? Math.min(...maintainabilityValues) : null,
        moduleFanOut: fanOutByFile.get(filePath) ?? 0,
        moduleFanIn: fanInByFile.get(filePath) ?? 0,
        sourceLoc: lineCount,
      };
    })
    .sort((a, b) => a.filePath.localeCompare(b.filePath));

  const summary = {
    tool: 'ts-morph',
    analyzedSourceFiles: sourceFiles.length,
    analyzedFunctions: functionMetrics.length,
    cyclomatic: {
      avg: mean(cyclomaticValues),
      p95: percentile(cyclomaticValues, 95),
      max: cyclomaticValues[cyclomaticValues.length - 1] ?? 0,
    },
    cognitive: {
      avg: mean(cognitiveValues),
      p95: percentile(cognitiveValues, 95),
      max: cognitiveValues[cognitiveValues.length - 1] ?? 0,
    },
    halstead: {
      volume: {
        avg: mean(halsteadVolumeValues),
        p95: percentile(halsteadVolumeValues, 95),
        max: halsteadVolumeValues[halsteadVolumeValues.length - 1] ?? 0,
      },
      difficulty: {
        avg: mean(halsteadDifficultyValues),
        p95: percentile(halsteadDifficultyValues, 95),
        max: halsteadDifficultyValues[halsteadDifficultyValues.length - 1] ?? 0,
      },
      effort: {
        avg: mean(halsteadEffortValues),
        p95: percentile(halsteadEffortValues, 95),
        max: halsteadEffortValues[halsteadEffortValues.length - 1] ?? 0,
      },
    },
    maintainabilityIndex: {
      avg: mean(miValues),
      p5: percentile(miValues, 5),
      min: miValues[0] ?? 0,
    },
    linesOfCode: {
      sourceTotal: totalSourceLoc,
      sourceAvg: mean(sourceLocValues),
      functionAvg: mean(functionLocValues),
      functionP95: percentile(functionLocValues, 95),
      functionMax: functionLocValues[functionLocValues.length - 1] ?? 0,
    },
    nestingDepth: {
      avg: mean(nestingValues),
      p95: percentile(nestingValues, 95),
      max: nestingValues[nestingValues.length - 1] ?? 0,
    },
    fanOut: {
      avg: mean(fanOutValues),
      p95: percentile(fanOutValues, 95),
      max: fanOutValues[fanOutValues.length - 1] ?? 0,
    },
    fanIn: {
      avg: mean(fanInValues),
      p95: percentile(fanInValues, 95),
      max: fanInValues[fanInValues.length - 1] ?? 0,
    },
    topCyclomatic,
    topCognitive,
    topNesting,
    topHalsteadVolume,
    topLowMaintainability,
    topFanOut,
    topFanIn,
    fileMetrics,
  };

  await writeJson(outJson, summary);

  const md = [
    '# ts-morph Complexity Report',
    '',
    `- analyzed source files: ${summary.analyzedSourceFiles}`,
    `- analyzed functions: ${summary.analyzedFunctions}`,
    `- cyclomatic avg / p95 / max: ${summary.cyclomatic.avg.toFixed(2)} / ${summary.cyclomatic.p95} / ${summary.cyclomatic.max}`,
    `- cognitive avg / p95 / max: ${summary.cognitive.avg.toFixed(2)} / ${summary.cognitive.p95} / ${summary.cognitive.max}`,
    `- Halstead volume avg / p95 / max: ${summary.halstead.volume.avg.toFixed(2)} / ${summary.halstead.volume.p95.toFixed(2)} / ${summary.halstead.volume.max.toFixed(2)}`,
    `- maintainability index avg / p5 / min: ${summary.maintainabilityIndex.avg.toFixed(2)} / ${summary.maintainabilityIndex.p5.toFixed(2)} / ${summary.maintainabilityIndex.min.toFixed(2)}`,
    `- LOC total (source files): ${summary.linesOfCode.sourceTotal}`,
    `- nesting depth avg / p95 / max: ${summary.nestingDepth.avg.toFixed(2)} / ${summary.nestingDepth.p95} / ${summary.nestingDepth.max}`,
    `- fan-in avg / p95 / max: ${summary.fanIn.avg.toFixed(2)} / ${summary.fanIn.p95} / ${summary.fanIn.max}`,
    `- fan-out avg / p95 / max: ${summary.fanOut.avg.toFixed(2)} / ${summary.fanOut.p95} / ${summary.fanOut.max}`,
    '',
    '## Top Cyclomatic Functions',
    '',
    '| Function | File | Cyclomatic | Cognitive | Max Nesting | LOC | MI |',
    '| --- | --- | ---: | ---: | ---: | ---: | ---: |',
    ...summary.topCyclomatic.map((m) => `| ${m.name} | ${m.filePath} | ${m.cyclomatic} | ${m.cognitive} | ${m.maxNestingDepth} | ${m.loc} | ${m.maintainabilityIndex.toFixed(2)} |`),
    '',
    '## Top Nesting Functions',
    '',
    '| Function | File | Max Nesting | Cyclomatic | Cognitive | LOC |',
    '| --- | --- | ---: | ---: | ---: | ---: |',
    ...summary.topNesting.map((m) => `| ${m.name} | ${m.filePath} | ${m.maxNestingDepth} | ${m.cyclomatic} | ${m.cognitive} | ${m.loc} |`),
    '',
    '## Top Fan-Out Modules',
    '',
    '| File | Fan-Out |',
    '| --- | ---: |',
    ...summary.topFanOut.map((m) => `| ${m.filePath} | ${m.fanOut} |`),
    '',
    '## Top Fan-In Modules',
    '',
    '| File | Fan-In |',
    '| --- | ---: |',
    ...summary.topFanIn.map((m) => `| ${m.filePath} | ${m.fanIn} |`),
    '',
  ].join('\n');

  await writeText(outMd, md);
  console.log(`wrote ${outJson}`);
  console.log(`wrote ${outMd}`);
}

await main();
