import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

function collectTsFiles(dir: string): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__') {
        continue;
      }
      files.push(...collectTsFiles(fullPath));
      continue;
    }
    if (entry.isFile() && fullPath.endsWith('.ts')) {
      files.push(fullPath);
    }
  }
  return files;
}

describe('Block Lowering - Avoid Raw Broadcast', () => {
  it('all block source files avoid direct ctx.b.broadcast(...) calls', () => {
    const blockRoot = join(__dirname, '..');
    const violations: string[] = [];

    const files = collectTsFiles(blockRoot);
    for (const filePath of files) {
      const content = readFileSync(filePath, 'utf8');
      const hasRawBroadcast = /ctx\.b\.broadcast\s*\(/.test(content);
      if (hasRawBroadcast) {
        // [LAW:single-enforcer] Enforce this policy once in a single static test boundary.
        violations.push(filePath);
      }
    }

    // [LAW:dataflow-not-control-flow] Block lowering should encode cardinality
    // adaptation via stable helper dataflow boundaries, not ad-hoc raw broadcasts.
    expect(violations).toEqual([]);
  });
});
