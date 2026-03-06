import fs from 'node:fs/promises';
import path from 'node:path';
import {
  formatSig2,
  reportsDir,
  renderHtmlDocument,
  renderHtmlTable,
  writeJson,
  writeText,
} from './_shared.mjs';

const summaryJsonPath = path.join(reportsDir, 'comparison-summary.json');
const summaryMdPath = path.join(reportsDir, 'comparison-summary.md');
const summaryHtmlPath = path.join(reportsDir, 'comparison-summary.html');

async function readJsonSafe(fileName) {
  const filePath = path.join(reportsDir, fileName);
  try {
    const content = await fs.readFile(filePath, 'utf8');
    return { filePath, data: JSON.parse(content) };
  } catch {
    return { filePath, data: null };
  }
}

function asNumber(value, fallback = 0) {
  return Number.isFinite(value) ? Number(value) : fallback;
}

function rel(filePath) {
  return path.relative(process.cwd(), filePath);
}

function trackedRuleCount(eslintData, ruleId) {
  const rules = Array.isArray(eslintData?.trackedRuleCounts) ? eslintData.trackedRuleCounts : [];
  const match = rules.find((rule) => rule.ruleId === ruleId);
  return asNumber(match?.count);
}

function renderComparisonHtml(comparison, depCruiser) {
  const highlights = comparison.highlights;
  const toolRows = [
    [
      'ESLint + SonarJS',
      'complexity, max-depth, max-lines-per-function, max-params, cognitive',
      `errors=${highlights.eslintErrors}, warnings=${highlights.eslintWarnings}, complexity hits=${highlights.eslintComplexityHits}, depth hits=${highlights.eslintMaxDepthHits}, max-lines hits=${highlights.eslintMaxLinesPerFunctionHits}, max-params hits=${highlights.eslintMaxParamsHits}`,
      comparison.artifacts.eslint,
    ],
    [
      'ts-morph custom AST',
      'cyclomatic, cognitive, Halstead, MI, LOC, nesting, fan-in/out',
      `maxCyclomatic=${highlights.tsMorphMaxCyclomatic}, maxCognitive=${highlights.tsMorphMaxCognitive}, maxNesting=${highlights.tsMorphMaxNesting}, sourceLOC=${highlights.tsMorphSourceLocTotal}`,
      comparison.artifacts.tsMorph,
    ],
    [
      'dependency-cruiser',
      'coupling, dependency graph, cycles, layer violations',
      `errors=${highlights.dependencyCruiserErrors}, warnings=${highlights.dependencyCruiserWarnings}, modules=${highlights.dependencyCruiserModules}, deps=${highlights.dependencyCruiserDependencies}`,
      comparison.artifacts.dependencyCruiser,
    ],
    [
      'Plato',
      'cyclomatic, Halstead, maintainability, SLOC',
      `avgMI=${formatSig2(highlights.platoAvgMaintainability)}, maxCyclomatic=${highlights.platoMaxCyclomatic}, avgHalsteadDiff=${formatSig2(highlights.platoAvgHalsteadDifficulty)}`,
      comparison.artifacts.plato,
    ],
    [
      'TyphonJS ESComplex',
      'cyclomatic, Halstead, maintainability, SLOC',
      `avgMI=${formatSig2(highlights.typhonAvgMaintainability)}, maxCyclomatic=${highlights.typhonMaxCyclomatic}, avgHalsteadDiff=${formatSig2(highlights.typhonAvgHalsteadDifficulty)}`,
      comparison.artifacts.typhon,
    ],
    [
      'SonarQube / SonarCloud',
      'cognitive complexity, debt, maintainability rating, duplication',
      `status=${highlights.sonarStatus}`,
      comparison.artifacts.sonar,
    ],
  ];
  const coverageRows = comparison.metricCoverage.map((row) => [row.metric, row.tools, row.values]);

  return renderHtmlDocument(
    'TypeScript Complexity Toolchain Comparison',
    [
      '<h1>TypeScript Complexity Toolchain Comparison</h1>',
      `<p class="small">Generated: ${comparison.generatedAt}</p>`,
      '<h2>Tools</h2>',
      renderHtmlTable(['Tool', 'Primary Metric(s)', 'Current Value(s)', 'Output'], toolRows),
      '<h2>Metric Coverage Matrix</h2>',
      renderHtmlTable(['Metric', 'Tools', 'Evidence'], coverageRows),
      '<h2>Graph Artifacts</h2>',
      '<ul>',
      `<li>dependency JSON graph: <code>${depCruiser.data?.graph?.json ?? comparison.artifacts.dependencyCruiser}</code></li>`,
      `<li>dependency DOT graph: <code>${comparison.artifacts.dependencyCruiserDot ?? 'not produced'}</code></li>`,
      '</ul>',
      '<h2>Notes</h2>',
      '<ul>',
      '<li>Sonar is marked skipped unless <code>SONAR_HOST_URL</code> and <code>SONAR_TOKEN</code> are present.</li>',
      '<li>Plato and Typhon run on a transpiled JS snapshot generated from current TypeScript sources.</li>',
      '<li>ts-morph metrics are computed directly from the TypeScript AST and include function-level and module-level rankings.</li>',
      '</ul>',
    ].join('\n'),
  );
}

async function main() {
  const eslint = await readJsonSafe('eslint-complexity.json');
  const tsMorph = await readJsonSafe('ts-morph-metrics.json');
  const depCruiser = await readJsonSafe('dependency-cruiser-summary.json');
  const plato = await readJsonSafe('plato-summary.json');
  const typhon = await readJsonSafe('typhon-escomplex.json');
  const sonar = await readJsonSafe('sonar-run.json');

  const highlights = {
    eslintErrors: asNumber(eslint.data?.errorCount),
    eslintWarnings: asNumber(eslint.data?.warningCount),
    eslintComplexityHits: trackedRuleCount(eslint.data, 'complexity'),
    eslintMaxDepthHits: trackedRuleCount(eslint.data, 'max-depth'),
    eslintMaxLinesPerFunctionHits: trackedRuleCount(eslint.data, 'max-lines-per-function'),
    eslintMaxParamsHits: trackedRuleCount(eslint.data, 'max-params'),
    eslintCognitiveHits: trackedRuleCount(eslint.data, 'sonarjs/cognitive-complexity'),

    tsMorphMaxCyclomatic: asNumber(tsMorph.data?.cyclomatic?.max),
    tsMorphMaxCognitive: asNumber(tsMorph.data?.cognitive?.max),
    tsMorphMaxNesting: asNumber(tsMorph.data?.nestingDepth?.max),
    tsMorphSourceLocTotal: asNumber(tsMorph.data?.linesOfCode?.sourceTotal),
    tsMorphMaxHalsteadVolume: asNumber(tsMorph.data?.halstead?.volume?.max),
    tsMorphAvgMi: asNumber(tsMorph.data?.maintainabilityIndex?.avg),
    tsMorphMaxFanOut: asNumber(tsMorph.data?.fanOut?.max),
    tsMorphMaxFanIn: asNumber(tsMorph.data?.fanIn?.max),

    dependencyCruiserErrors: asNumber(depCruiser.data?.errorViolations),
    dependencyCruiserWarnings: asNumber(depCruiser.data?.warnViolations),
    dependencyCruiserModules: asNumber(depCruiser.data?.moduleCount),
    dependencyCruiserDependencies: asNumber(depCruiser.data?.dependencyCount),
    dependencyCruiserMaxFanOut: asNumber(depCruiser.data?.coupling?.maxFanOut),
    dependencyCruiserMaxFanIn: asNumber(depCruiser.data?.coupling?.maxFanIn),

    platoAvgMaintainability: asNumber(plato.data?.avgMaintainability),
    platoMaxCyclomatic: asNumber(plato.data?.maxCyclomatic),
    platoAvgHalsteadDifficulty: asNumber(plato.data?.avgHalsteadDifficulty),
    platoAvgHalsteadVolume: asNumber(plato.data?.avgHalsteadVolume),
    platoTotalLogicalSloc: asNumber(plato.data?.totalLogicalSloc),

    typhonAvgMaintainability: asNumber(typhon.data?.avgMaintainability),
    typhonMaxCyclomatic: asNumber(typhon.data?.maxCyclomatic),
    typhonAvgHalsteadDifficulty: asNumber(typhon.data?.avgHalsteadDifficulty),
    typhonAvgHalsteadVolume: asNumber(typhon.data?.avgHalsteadVolume),
    typhonTotalLogicalSloc: asNumber(typhon.data?.totalLogicalSloc),

    sonarStatus: sonar.data?.status ?? 'missing',
  };

  // [LAW:one-source-of-truth] This table is the canonical metric coverage map consumed by JSON and markdown output.
  const metricCoverage = [
    {
      metric: 'Cyclomatic complexity',
      tools: 'ESLint, ts-morph, Plato, Typhon',
      values: `ts-morph max=${highlights.tsMorphMaxCyclomatic}; plato max=${highlights.platoMaxCyclomatic}; typhon max=${highlights.typhonMaxCyclomatic}; eslint hits=${highlights.eslintComplexityHits}`,
    },
    {
      metric: 'Cognitive complexity',
      tools: 'ESLint SonarJS, ts-morph, SonarQube',
      values: `ts-morph max=${highlights.tsMorphMaxCognitive}; eslint sonarjs hits=${highlights.eslintCognitiveHits}; sonar=${highlights.sonarStatus}`,
    },
    {
      metric: 'Halstead metrics',
      tools: 'ts-morph, Plato, Typhon',
      values: `ts-morph max volume=${formatSig2(highlights.tsMorphMaxHalsteadVolume)}; plato avg volume=${formatSig2(highlights.platoAvgHalsteadVolume)}; typhon avg volume=${formatSig2(highlights.typhonAvgHalsteadVolume)}`,
    },
    {
      metric: 'Maintainability index',
      tools: 'ts-morph, Plato, Typhon, SonarQube',
      values: `ts-morph avg=${formatSig2(highlights.tsMorphAvgMi)}; plato avg=${formatSig2(highlights.platoAvgMaintainability)}; typhon avg=${formatSig2(highlights.typhonAvgMaintainability)}; sonar=${highlights.sonarStatus}`,
    },
    {
      metric: 'Coupling and dependency graph',
      tools: 'dependency-cruiser, ts-morph (fan-in/out)',
      values: `modules=${highlights.dependencyCruiserModules}; deps=${highlights.dependencyCruiserDependencies}; dep max fan-in/out=${highlights.dependencyCruiserMaxFanIn}/${highlights.dependencyCruiserMaxFanOut}; ts-morph max fan-in/out=${highlights.tsMorphMaxFanIn}/${highlights.tsMorphMaxFanOut}`,
    },
    {
      metric: 'Lines of code',
      tools: 'ts-morph, Plato, Typhon',
      values: `ts-morph source LOC=${highlights.tsMorphSourceLocTotal}; plato logical SLOC=${highlights.platoTotalLogicalSloc}; typhon logical SLOC=${highlights.typhonTotalLogicalSloc}`,
    },
    {
      metric: 'Nesting depth',
      tools: 'ESLint, ts-morph',
      values: `ts-morph max nesting=${highlights.tsMorphMaxNesting}; eslint max-depth hits=${highlights.eslintMaxDepthHits}`,
    },
    {
      metric: 'Fan-in / fan-out',
      tools: 'ts-morph, dependency-cruiser',
      values: `ts-morph max fan-in/out=${highlights.tsMorphMaxFanIn}/${highlights.tsMorphMaxFanOut}; dep max fan-in/out=${highlights.dependencyCruiserMaxFanIn}/${highlights.dependencyCruiserMaxFanOut}`,
    },
  ];

  const comparison = {
    generatedAt: new Date().toISOString(),
    tools: {
      eslint: eslint.data,
      tsMorph: tsMorph.data,
      dependencyCruiser: depCruiser.data,
      plato: plato.data,
      typhon: typhon.data,
      sonar: sonar.data,
    },
    highlights,
    metricCoverage,
    artifacts: {
      eslint: rel(eslint.filePath),
      tsMorph: rel(tsMorph.filePath),
      dependencyCruiser: rel(depCruiser.filePath),
      dependencyCruiserDot: depCruiser.data?.graph?.dot ?? null,
      plato: rel(plato.filePath),
      typhon: rel(typhon.filePath),
      sonar: rel(sonar.filePath),
    },
  };

  await writeJson(summaryJsonPath, comparison);

  const md = [
    '# TypeScript Complexity Toolchain Comparison',
    '',
    `Generated: ${comparison.generatedAt}`,
    '',
    '| Tool | Primary Metric(s) | Current Value(s) | Output |',
    '| --- | --- | --- | --- |',
    `| ESLint + SonarJS | complexity, max-depth, max-lines-per-function, max-params, cognitive | errors=${highlights.eslintErrors}, warnings=${highlights.eslintWarnings}, complexity hits=${highlights.eslintComplexityHits}, depth hits=${highlights.eslintMaxDepthHits}, max-lines hits=${highlights.eslintMaxLinesPerFunctionHits}, max-params hits=${highlights.eslintMaxParamsHits} | ${comparison.artifacts.eslint} |`,
    `| ts-morph custom AST | cyclomatic, cognitive, Halstead, MI, LOC, nesting, fan-in/out | maxCyclomatic=${highlights.tsMorphMaxCyclomatic}, maxCognitive=${highlights.tsMorphMaxCognitive}, maxNesting=${highlights.tsMorphMaxNesting}, sourceLOC=${highlights.tsMorphSourceLocTotal} | ${comparison.artifacts.tsMorph} |`,
    `| dependency-cruiser | coupling, dependency graph, cycles, layer violations | errors=${highlights.dependencyCruiserErrors}, warnings=${highlights.dependencyCruiserWarnings}, modules=${highlights.dependencyCruiserModules}, deps=${highlights.dependencyCruiserDependencies} | ${comparison.artifacts.dependencyCruiser} |`,
    `| Plato | cyclomatic, Halstead, maintainability, SLOC | avgMI=${formatSig2(highlights.platoAvgMaintainability)}, maxCyclomatic=${highlights.platoMaxCyclomatic}, avgHalsteadDiff=${formatSig2(highlights.platoAvgHalsteadDifficulty)} | ${comparison.artifacts.plato} |`,
    `| TyphonJS ESComplex | cyclomatic, Halstead, maintainability, SLOC | avgMI=${formatSig2(highlights.typhonAvgMaintainability)}, maxCyclomatic=${highlights.typhonMaxCyclomatic}, avgHalsteadDiff=${formatSig2(highlights.typhonAvgHalsteadDifficulty)} | ${comparison.artifacts.typhon} |`,
    `| SonarQube / SonarCloud | cognitive complexity, debt, maintainability rating, duplication | status=${highlights.sonarStatus} | ${comparison.artifacts.sonar} |`,
    '',
    '## Metric Coverage Matrix',
    '',
    '| Metric | Tools | Evidence |',
    '| --- | --- | --- |',
    ...comparison.metricCoverage.map((row) => `| ${row.metric} | ${row.tools} | ${row.values} |`),
    '',
    '## Graph Artifacts',
    '',
    `- dependency JSON graph: ${depCruiser.data?.graph?.json ?? comparison.artifacts.dependencyCruiser}`,
    `- dependency DOT graph: ${comparison.artifacts.dependencyCruiserDot ?? 'not produced'}`,
    '',
    '## Notes',
    '',
    '- Sonar is marked `skipped` unless `SONAR_HOST_URL` and `SONAR_TOKEN` are present.',
    '- Plato and Typhon run on a transpiled JS snapshot generated from current TypeScript sources.',
    '- ts-morph metrics are computed directly from the TypeScript AST and include function-level + module-level rankings.',
    '',
  ].join('\n');

  await writeText(summaryMdPath, md);
  await writeText(summaryHtmlPath, renderComparisonHtml(comparison, depCruiser));
  console.log(`wrote ${summaryJsonPath}`);
  console.log(`wrote ${summaryMdPath}`);
  console.log(`wrote ${summaryHtmlPath}`);
}

await main();
