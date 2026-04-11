/**
 * GPU-IR DSL: Auto-dependency inference from StatementIR[].
 *
 * Walks the IR tree via walkIR and collects which globals, domains, and textures
 * are referenced, producing the dependency declarations the Rust engine expects.
 */

import type { ExprIR, StatementIR, MemoryManifest } from '../rust/boundary-contract';
import { walkIR } from './ir-node-rules';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface ComputeDeps {
  readonly requiresGlobals: boolean;
  readonly domains: Record<string, 'read' | 'read_write'>;
  readonly textures: Record<string, 'read' | 'write' | 'read_write'>;
}

export interface DrawCallDeps {
  readonly requiresGlobals: boolean;
  readonly cameraRef: string;
  readonly domains: Record<string, 'read'>;
  readonly textures: Record<string, 'sampled'>;
}

export function inferComputeDeps(stmts: readonly StatementIR[], _manifest: MemoryManifest): ComputeDeps {
  const { usesGlobals, domainReads, domainWrites, textureReads, textureWrites } = collectDeps(stmts);
  return {
    requiresGlobals: usesGlobals,
    domains: mergeDomainAccess(domainReads, domainWrites),
    textures: mergeTextureAccess(textureReads, textureWrites),
  };
}

export function inferDrawCallDeps(
  vertexStmts: readonly StatementIR[],
  fragmentStmts: readonly StatementIR[],
  _manifest: MemoryManifest,
  cameraRef: string,
): DrawCallDeps {
  const v = collectDeps(vertexStmts);
  const f = collectDeps(fragmentStmts);
  const domainReads = new Set([...v.domainReads, ...f.domainReads]);
  const domainWrites = new Set([...v.domainWrites, ...f.domainWrites]);
  const textureReads = new Set([...v.textureReads, ...f.textureReads]);
  const textureWrites = new Set([...v.textureWrites, ...f.textureWrites]);
  return {
    requiresGlobals: v.usesGlobals || f.usesGlobals,
    cameraRef,
    domains: Object.fromEntries(
      Object.keys(mergeDomainAccess(domainReads, domainWrites)).map(d => [d, 'read' as const]),
    ),
    textures: Object.fromEntries(
      Object.keys(mergeTextureAccess(textureReads, textureWrites)).map(t => [t, 'sampled' as const]),
    ),
  };
}

// ---------------------------------------------------------------------------
// Collector (walkIR-based)
// ---------------------------------------------------------------------------

function collectDeps(stmts: readonly StatementIR[]) {
  let usesGlobals = false;
  const domainReads = new Set<string>();
  const domainWrites = new Set<string>();
  const textureReads = new Set<string>();
  const textureWrites = new Set<string>();

  walkIR(stmts, {
    onExpr(e: ExprIR) {
      if (e.type === 'LoadGlobal') usesGlobals = true;
      if (e.type === 'LoadField') domainReads.add(extractDomain(e.symbolId));
      if (e.type === 'AtomicLoadField') domainReads.add(extractDomain(e.symbolId));
      if (e.type === 'TextureSample') textureReads.add(e.textureId);
      if (e.type === 'TextureLoad') textureReads.add(e.textureId);
    },
    onStmt(s: StatementIR) {
      if (s.type === 'StoreGlobal') usesGlobals = true;
      if (s.type === 'StoreField') domainWrites.add(extractDomain(s.symbolId));
      if (s.type === 'AtomicOpField') domainWrites.add(extractDomain(s.symbolId));
      if (s.type === 'TextureStore') textureWrites.add(s.textureId);
    },
  });

  return { usesGlobals, domainReads, domainWrites, textureReads, textureWrites };
}

function mergeDomainAccess(reads: Set<string>, writes: Set<string>): Record<string, 'read' | 'read_write'> {
  const out: Record<string, 'read' | 'read_write'> = {};
  for (const d of reads) out[d] = writes.has(d) ? 'read_write' : 'read';
  for (const d of writes) out[d] ??= 'read_write';
  return out;
}

function mergeTextureAccess(reads: Set<string>, writes: Set<string>): Record<string, 'read' | 'write' | 'read_write'> {
  const out: Record<string, 'read' | 'write' | 'read_write'> = {};
  for (const t of reads) out[t] = writes.has(t) ? 'read_write' : 'read';
  for (const t of writes) out[t] ??= 'write';
  return out;
}

function extractDomain(symbolId: string): string {
  const colonIdx = symbolId.indexOf(':');
  if (colonIdx === -1) throw new Error(`Invalid domain symbolId: ${symbolId}`);
  return symbolId.slice(0, colonIdx);
}
