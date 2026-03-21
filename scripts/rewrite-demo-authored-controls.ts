import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { deserializePatchFromHCL, serializePatchToHCL } from '../src/patch-dsl';
import { registerAllBlocks } from '../src/blocks/all';
import { PatchStore } from '../src/stores/PatchStore';

const DEMO_ROOT = path.resolve('src/demo/hcl');

async function walk(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const entryPath = path.join(dir, entry.name);
    return entry.isDirectory()
      ? walk(entryPath)
      : entry.name.endsWith('.hcl')
        ? [entryPath]
        : [];
  }));
  return files.flat().sort();
}

function inferPatchName(hcl: string, filePath: string): string {
  const match = hcl.match(/patch\s+"([^"]+)"/);
  return match?.[1] ?? path.basename(filePath, '.hcl');
}

async function main(): Promise<void> {
  registerAllBlocks();
  const files = await walk(DEMO_ROOT);

  for (const filePath of files) {
    const hcl = await readFile(filePath, 'utf8');
    const parsed = deserializePatchFromHCL(hcl);
    if (parsed.errors.length > 0) {
      throw new Error(`Failed to parse ${filePath}: ${parsed.errors.map((error) => error.message).join('; ')}`);
    }

    const store = new PatchStore();
    store.loadPatch(parsed.patch);

    const rewritten = serializePatchToHCL(store.patch, {
      name: inferPatchName(hcl, filePath),
    });
    await writeFile(filePath, rewritten, 'utf8');
  }
}

await main();
