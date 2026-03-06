import fs from 'node:fs/promises';
import path from 'node:path';
import { reportsDir, tmpDir, runCommand, writeJson, mean } from './_shared.mjs';
import './prepare-js-snapshot.mjs';

const platoDir = path.join(reportsDir, 'plato');
const summaryPath = path.join(reportsDir, 'plato-summary.json');

async function main() {
  await fs.rm(platoDir, { recursive: true, force: true });

  const inputDir = path.join(tmpDir, 'js', 'src');
  const run = await runCommand(
    'plato',
    ['-r', '-d', platoDir, inputDir],
    { allowFailure: true },
  );

  if (!run.ok) {
    throw new Error(`plato failed: ${run.stderr || run.stdout}`);
  }

  const reportPath = path.join(platoDir, 'report.json');
  const reportFile = await fs.stat(reportPath).catch(() => null);
  if (!reportFile?.isFile()) {
    throw new Error(`plato report.json not found in ${platoDir}`);
  }

  const report = JSON.parse(await fs.readFile(reportPath, 'utf8'));
  const reports = Array.isArray(report.reports) ? report.reports : [];
  const files = reports.map((entry) => ({
    file: entry?.info?.file ?? 'unknown',
    maintainability: entry?.complexity?.maintainability ?? 0,
    sloc: entry?.complexity?.methodAggregate?.sloc?.logical ?? 0,
    cyclomatic: entry?.complexity?.methodAggregate?.cyclomatic ?? 0,
    halsteadDifficulty: entry?.complexity?.methodAggregate?.halstead?.difficulty ?? 0,
    halsteadVolume: entry?.complexity?.methodAggregate?.halstead?.volume ?? 0,
    halsteadBugs: entry?.complexity?.methodAggregate?.halstead?.bugs ?? 0,
  }));
  const slocValues = files.map((file) => file.sloc);
  const maintainabilityValues = files.map((file) => file.maintainability);
  const halsteadDifficultyValues = files.map((file) => file.halsteadDifficulty);
  const halsteadVolumeValues = files.map((file) => file.halsteadVolume);

  const summary = {
    tool: 'plato',
    reportPath: path.relative(process.cwd(), reportPath),
    sourceSummary: report.summary ?? null,
    fileCount: files.length,
    totalLogicalSloc: slocValues.reduce((sum, value) => sum + value, 0),
    avgLogicalSloc: mean(slocValues),
    avgMaintainability: mean(maintainabilityValues),
    avgHalsteadDifficulty: mean(halsteadDifficultyValues),
    avgHalsteadVolume: mean(halsteadVolumeValues),
    maxCyclomatic: files.reduce((max, file) => Math.max(max, file.cyclomatic), 0),
    maxHalsteadDifficulty: files.reduce((max, file) => Math.max(max, file.halsteadDifficulty), 0),
    maxHalsteadVolume: files.reduce((max, file) => Math.max(max, file.halsteadVolume), 0),
    topCyclomatic: [...files].sort((a, b) => b.cyclomatic - a.cyclomatic).slice(0, 20),
    topLowMaintainability: [...files].sort((a, b) => a.maintainability - b.maintainability).slice(0, 20),
    topHalsteadDifficulty: [...files].sort((a, b) => b.halsteadDifficulty - a.halsteadDifficulty).slice(0, 20),
    topHalsteadVolume: [...files].sort((a, b) => b.halsteadVolume - a.halsteadVolume).slice(0, 20),
  };

  await writeJson(summaryPath, summary);
  console.log(`wrote ${summaryPath}`);
}

await main();
