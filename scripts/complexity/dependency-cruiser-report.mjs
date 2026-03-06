import path from 'node:path';
import { reportsDir, runCommand, runnerRoot, writeJson, writeText } from './_shared.mjs';

const jsonPath = path.join(reportsDir, 'dependency-cruiser.json');
const dotPath = path.join(reportsDir, 'dependency-cruiser.dot');
const summaryPath = path.join(reportsDir, 'dependency-cruiser-summary.json');
// [LAW:one-source-of-truth] Canonical dependency rules live in runner-root config for both compared refs.
const depCruiseConfigPath = path.join(runnerRoot, '.dependency-cruiser.cjs');

async function main() {
  const jsonRun = await runCommand(
    'depcruise',
    [
      'src',
      '--config',
      depCruiseConfigPath,
      '--output-type',
      'json',
    ],
    { allowFailure: true },
  );

  if (!jsonRun.stdout.trim()) {
    throw new Error(`dependency-cruiser json failed: ${jsonRun.stderr || jsonRun.stdout}`);
  }

  await writeText(jsonPath, jsonRun.stdout);
  const parsed = JSON.parse(jsonRun.stdout);
  const modules = parsed.modules ?? [];
  const fanOutValues = modules.map((moduleRecord) => moduleRecord.dependencies?.length ?? 0);
  const fanInValues = modules.map((moduleRecord) => moduleRecord.dependents?.length ?? 0);
  const topFanOutModules = [...modules]
    .map((moduleRecord) => ({
      source: moduleRecord.source,
      fanOut: moduleRecord.dependencies?.length ?? 0,
      fanIn: moduleRecord.dependents?.length ?? 0,
    }))
    .sort((a, b) => b.fanOut - a.fanOut)
    .slice(0, 25);
  const topFanInModules = [...modules]
    .map((moduleRecord) => ({
      source: moduleRecord.source,
      fanOut: moduleRecord.dependencies?.length ?? 0,
      fanIn: moduleRecord.dependents?.length ?? 0,
    }))
    .sort((a, b) => b.fanIn - a.fanIn)
    .slice(0, 25);

  const dotRun = await runCommand(
    'depcruise',
    [
      'src',
      '--config',
      depCruiseConfigPath,
      '--output-type',
      'dot',
    ],
    { allowFailure: true },
  );

  if (dotRun.ok) {
    await writeText(dotPath, dotRun.stdout);
  }

  const summary = {
    tool: 'dependency-cruiser',
    status: jsonRun.ok ? 'ok' : 'violations',
    exitCode: jsonRun.code,
    graph: {
      json: path.relative(process.cwd(), jsonPath),
      dot: dotRun.ok ? path.relative(process.cwd(), dotPath) : null,
    },
    moduleCount: modules.length,
    dependencyCount: parsed.summary?.totalDependenciesCruised ?? 0,
    violations: parsed.summary?.violations ?? 0,
    errorViolations: parsed.summary?.error ?? 0,
    warnViolations: parsed.summary?.warn ?? 0,
    coupling: {
      maxFanOut: fanOutValues.length === 0 ? 0 : Math.max(...fanOutValues),
      maxFanIn: fanInValues.length === 0 ? 0 : Math.max(...fanInValues),
      avgFanOut:
        fanOutValues.length === 0
          ? 0
          : fanOutValues.reduce((sum, value) => sum + value, 0) / fanOutValues.length,
      avgFanIn:
        fanInValues.length === 0
          ? 0
          : fanInValues.reduce((sum, value) => sum + value, 0) / fanInValues.length,
      topFanOutModules,
      topFanInModules,
    },
    topViolations: (parsed.violations ?? []).slice(0, 30).map((violation) => ({
      rule: violation.rule?.name,
      from: violation.from,
      to: violation.to,
      comment: violation.rule?.comment,
      severity: violation.rule?.severity,
    })),
  };

  await writeJson(summaryPath, summary);
  console.log(`wrote ${jsonPath}`);
  if (dotRun.ok) console.log(`wrote ${dotPath}`);
  console.log(`wrote ${summaryPath}`);
}

await main();
