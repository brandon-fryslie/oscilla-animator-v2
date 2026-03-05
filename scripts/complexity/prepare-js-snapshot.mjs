import fs from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript';
import { listTypeScriptFiles, ensureDir, tmpDir, writeJson } from './_shared.mjs';

const outDir = path.join(tmpDir, 'js');
const manifestPath = path.join(tmpDir, 'snapshot-manifest.json');

async function main() {
  const files = await listTypeScriptFiles();
  await fs.rm(outDir, { recursive: true, force: true });
  await ensureDir(outDir);

  const compilerOptions = {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
    sourceMap: false,
    inlineSources: false,
    removeComments: false,
  };

  const manifest = [];

  for (const relativePath of files) {
    const sourcePath = path.join(process.cwd(), relativePath);
    const sourceText = await fs.readFile(sourcePath, 'utf8');
    const transpiled = ts.transpileModule(sourceText, {
      compilerOptions,
      fileName: sourcePath,
      reportDiagnostics: false,
    });

    const outFile = path
      .join(outDir, relativePath)
      .replace(/\.ts$/, '.js');

    await ensureDir(path.dirname(outFile));
    await fs.writeFile(outFile, transpiled.outputText, 'utf8');
    manifest.push({ source: relativePath, js: path.relative(process.cwd(), outFile) });
  }

  await writeJson(manifestPath, {
    generatedAt: new Date().toISOString(),
    outDir: path.relative(process.cwd(), outDir),
    fileCount: manifest.length,
    files: manifest,
  });

  console.log(`transpiled ${manifest.length} TypeScript files into ${outDir}`);
  console.log(`wrote ${manifestPath}`);
}

await main();
