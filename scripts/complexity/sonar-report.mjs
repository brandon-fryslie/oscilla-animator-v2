import path from 'node:path';
import { reportsDir, runCommand, writeJson } from './_shared.mjs';

const outJson = path.join(reportsDir, 'sonar-run.json');

async function main() {
  const hostUrl = process.env.SONAR_HOST_URL;
  const token = process.env.SONAR_TOKEN;

  if (!hostUrl || !token) {
    const skipped = {
      tool: 'sonarqube/sonarcloud',
      status: 'skipped',
      reason: 'SONAR_HOST_URL and SONAR_TOKEN are required to run scanner.',
    };
    await writeJson(outJson, skipped);
    console.log(`wrote ${outJson} (skipped)`);
    return;
  }

  const run = await runCommand(
    'sonar-scanner',
    [
      `-Dsonar.host.url=${hostUrl}`,
      '-Dsonar.projectBaseDir=.',
    ],
    { allowFailure: true },
  );

  const result = {
    tool: 'sonarqube/sonarcloud',
    status: run.ok ? 'ok' : 'failed',
    exitCode: run.code,
    stdoutTail: run.stdout.split('\n').slice(-40),
    stderrTail: run.stderr.split('\n').slice(-40),
  };

  await writeJson(outJson, result);
  if (!run.ok) {
    throw new Error('sonar-scanner failed; see reports/complexity/sonar-run.json');
  }

  console.log(`wrote ${outJson}`);
}

await main();
