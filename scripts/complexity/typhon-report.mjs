import fs from 'node:fs/promises';
import path from 'node:path';
import escomplex from 'typhonjs-escomplex';
import { reportsDir, mean, runCommand, tmpDir, writeJson, writeText } from './_shared.mjs';
import './prepare-js-snapshot.mjs';

const outJson = path.join(reportsDir, 'typhon-escomplex.json');
const outMd = path.join(reportsDir, 'typhon-escomplex.md');

async function main() {
  const filesRun = await runCommand(
    'rg',
    ['--files', path.join(tmpDir, 'js', 'src'), '--glob', '**/*.js'],
    { allowFailure: true },
  );
  if (!filesRun.ok || !filesRun.stdout.trim()) {
    throw new Error(`unable to enumerate JS snapshot files: ${filesRun.stderr || filesRun.stdout}`);
  }

  const files = filesRun.stdout
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .sort();
  const sources = [];

  for (const fullPath of files) {
    const code = await fs.readFile(fullPath, 'utf8');
    const relativePath = path.relative(process.cwd(), fullPath);
    sources.push({
      srcPath: relativePath,
      filePath: fullPath,
      code,
    });
  }

  const moduleReports = [];
  const failures = [];
  for (const source of sources) {
    try {
      const report = escomplex.analyzeModule(source.code, {
        logicalor: true,
        switchcase: true,
        forin: true,
        trycatch: true,
        newmi: true,
      });
      moduleReports.push({
        ...report,
        srcPath: source.srcPath,
      });
    } catch (error) {
      failures.push({
        srcPath: source.srcPath,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const modules = moduleReports.map((report) => ({
    srcPath: report.srcPath,
    maintainability: report.maintainability ?? 0,
    cyclomatic: report.aggregate?.cyclomatic ?? 0,
    cyclomaticDensity: report.aggregate?.cyclomaticDensity ?? 0,
    halsteadDifficulty: report.aggregate?.halstead?.difficulty ?? 0,
    halsteadVolume: report.aggregate?.halstead?.volume ?? 0,
    slocPhysical: report.aggregate?.sloc?.physical ?? 0,
    slocLogical: report.aggregate?.sloc?.logical ?? 0,
    dependencyCount: Array.isArray(report.dependencies) ? report.dependencies.length : 0,
  }));
  const logicalSlocValues = modules.map((module) => module.slocLogical);
  const halsteadVolumeValues = modules.map((module) => module.halsteadVolume);
  const halsteadDifficultyValues = modules.map((module) => module.halsteadDifficulty);

  const summary = {
    tool: 'typhonjs-escomplex',
    analyzedFiles: sources.length,
    moduleCount: modules.length,
    failedModules: failures.length,
    totalLogicalSloc: logicalSlocValues.reduce((sum, value) => sum + value, 0),
    avgLogicalSloc: mean(logicalSlocValues),
    avgMaintainability: mean(modules.map((module) => module.maintainability)),
    avgCyclomatic: mean(modules.map((module) => module.cyclomatic)),
    avgHalsteadVolume: mean(halsteadVolumeValues),
    avgHalsteadDifficulty: mean(halsteadDifficultyValues),
    maxCyclomatic: modules.reduce((max, module) => Math.max(max, module.cyclomatic), 0),
    maxHalsteadVolume: modules.reduce((max, module) => Math.max(max, module.halsteadVolume), 0),
    maxHalsteadDifficulty: modules.reduce((max, module) => Math.max(max, module.halsteadDifficulty), 0),
    topCyclomatic: [...modules].sort((a, b) => b.cyclomatic - a.cyclomatic).slice(0, 20),
    topLowMaintainability: [...modules].sort((a, b) => a.maintainability - b.maintainability).slice(0, 20),
    topHalsteadDifficulty: [...modules].sort((a, b) => b.halsteadDifficulty - a.halsteadDifficulty).slice(0, 20),
    topHalsteadVolume: [...modules].sort((a, b) => b.halsteadVolume - a.halsteadVolume).slice(0, 20),
    failures: failures.slice(0, 50),
  };

  await writeJson(outJson, summary);

  const md = [
    '# TyphonJS ESComplex Report',
    '',
    `- analyzed files: ${summary.analyzedFiles}`,
    `- analyzed modules: ${summary.moduleCount}`,
    `- failed modules: ${summary.failedModules}`,
    `- avg maintainability: ${summary.avgMaintainability.toFixed(2)}`,
    `- avg cyclomatic: ${summary.avgCyclomatic.toFixed(2)}`,
    `- max cyclomatic: ${summary.maxCyclomatic}`,
    `- avg Halstead volume: ${summary.avgHalsteadVolume.toFixed(2)}`,
    `- avg Halstead difficulty: ${summary.avgHalsteadDifficulty.toFixed(2)}`,
    `- total logical SLOC: ${summary.totalLogicalSloc}`,
    '',
    '## Top Cyclomatic Modules',
    '',
    '| Module | Cyclomatic | Cyclomatic Density | Maintainability | SLOC (logical) |',
    '| --- | ---: | ---: | ---: | ---: |',
    ...summary.topCyclomatic.map((module) => `| ${module.srcPath} | ${module.cyclomatic} | ${module.cyclomaticDensity.toFixed(2)} | ${module.maintainability.toFixed(2)} | ${module.slocLogical} |`),
    '',
  ].join('\n');

  await writeText(outMd, md);
  console.log(`wrote ${outJson}`);
  console.log(`wrote ${outMd}`);
}

await main();
