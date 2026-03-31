/**
 * GPU-IR DSL: Auto-dependency inference from StatementIR[].
 *
 * Walks the IR tree and collects which globals, domains, and textures
 * are referenced, producing the dependency declarations the Rust engine expects.
 */

import type { ExprIR, StatementIR, MemoryManifest } from '../rust/boundary-contract';

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
  readonly domains: Record<string, 'read'>;
  readonly textures: Record<string, 'sampled'>;
}

export function inferComputeDeps(stmts: readonly StatementIR[], manifest: MemoryManifest): ComputeDeps {
  const ctx = new DepCollector(manifest);
  for (const s of stmts) ctx.walkStmt(s);
  return {
    requiresGlobals: ctx.usesGlobals,
    domains: ctx.computeDomainAccess(),
    textures: ctx.computeTextureAccess(),
  };
}

export function inferDrawCallDeps(
  vertexStmts: readonly StatementIR[],
  fragmentStmts: readonly StatementIR[],
  manifest: MemoryManifest,
): DrawCallDeps {
  const ctx = new DepCollector(manifest);
  for (const s of vertexStmts) ctx.walkStmt(s);
  for (const s of fragmentStmts) ctx.walkStmt(s);
  return {
    requiresGlobals: ctx.usesGlobals,
    domains: Object.fromEntries(
      Object.keys(ctx.computeDomainAccess()).map(d => [d, 'read' as const]),
    ),
    textures: Object.fromEntries(
      Object.keys(ctx.computeTextureAccess()).map(t => [t, 'sampled' as const]),
    ),
  };
}

// ---------------------------------------------------------------------------
// Collector
// ---------------------------------------------------------------------------

class DepCollector {
  usesGlobals = false;
  private domainReads = new Set<string>();
  private domainWrites = new Set<string>();
  private textureReads = new Set<string>();
  private textureWrites = new Set<string>();
  private manifest: MemoryManifest;

  constructor(manifest: MemoryManifest) {
    this.manifest = manifest;
  }

  computeDomainAccess(): Record<string, 'read' | 'read_write'> {
    const out: Record<string, 'read' | 'read_write'> = {};
    for (const d of this.domainReads) out[d] = this.domainWrites.has(d) ? 'read_write' : 'read';
    for (const d of this.domainWrites) out[d] ??= 'read_write';
    return out;
  }

  computeTextureAccess(): Record<string, 'read' | 'write' | 'read_write'> {
    const out: Record<string, 'read' | 'write' | 'read_write'> = {};
    for (const t of this.textureReads) out[t] = this.textureWrites.has(t) ? 'read_write' : 'read';
    for (const t of this.textureWrites) out[t] ??= 'write';
    return out;
  }

  walkStmt(s: StatementIR): void {
    switch (s.type) {
      case 'Let': this.walkExpr(s.value); break;
      case 'Var': if (s.value) this.walkExpr(s.value); break;
      case 'Assign': this.walkExpr(s.target); this.walkExpr(s.value); break;
      case 'StoreScalar': this.walkExpr(s.value); break;
      case 'StoreField': {
        this.domainWrites.add(extractDomain(s.symbolId));
        this.walkExpr(s.index); this.walkExpr(s.value); break;
      }
      case 'TextureStore': {
        this.textureWrites.add(s.textureId);
        this.walkExpr(s.coords); this.walkExpr(s.value); break;
      }
      case 'If': {
        this.walkExpr(s.condition);
        for (const st of s.accept) this.walkStmt(st);
        for (const st of s.reject) this.walkStmt(st);
        break;
      }
      case 'For': {
        this.walkStmt(s.init); this.walkExpr(s.condition);
        this.walkStmt(s.update);
        for (const st of s.body) this.walkStmt(st);
        break;
      }
      case 'AtomicOpField': {
        this.domainWrites.add(extractDomain(s.symbolId));
        this.walkExpr(s.index); this.walkExpr(s.value); break;
      }
      case 'AtomicOpScalar': this.walkExpr(s.value); break;
      case 'ReturnVertex': {
        this.walkExpr(s.position);
        for (const v of Object.values(s.varyings)) this.walkExpr(v);
        break;
      }
      case 'ReturnFragment': {
        for (const v of Object.values(s.outputs)) this.walkExpr(v);
        break;
      }
      case 'Break': case 'Continue': break;
    }
  }

  walkExpr(e: ExprIR): void {
    switch (e.type) {
      case 'LoadGlobal': this.usesGlobals = true; break;
      case 'LoadField': {
        this.domainReads.add(extractDomain(e.symbolId));
        this.walkExpr(e.index); break;
      }
      case 'AtomicLoadField': {
        this.domainReads.add(extractDomain(e.symbolId));
        this.walkExpr(e.index); break;
      }
      case 'TextureSample': this.textureReads.add(e.textureId); this.walkExpr(e.uv); break;
      case 'TextureLoad': this.textureReads.add(e.textureId); this.walkExpr(e.coords); break;
      case 'BinaryOp': this.walkExpr(e.left); this.walkExpr(e.right); break;
      case 'UnaryOp': this.walkExpr(e.expr); break;
      case 'CallBuiltin': for (const a of e.args) this.walkExpr(a); break;
      case 'Construct': for (const a of e.args) this.walkExpr(a); break;
      case 'Cast': this.walkExpr(e.expr); break;
      case 'Swizzle': this.walkExpr(e.source); break;
      case 'IndexAccess': this.walkExpr(e.target); this.walkExpr(e.index); break;
      case 'LiteralF32': case 'LiteralU32': case 'LiteralI32': case 'LiteralBool':
      case 'VarRef': case 'Intrinsic': case 'LoadScalar': case 'AtomicLoadScalar':
        break;
    }
  }
}

function extractDomain(symbolId: string): string {
  const colonIdx = symbolId.indexOf(':');
  if (colonIdx === -1) throw new Error(`Invalid domain symbolId: ${symbolId}`);
  return symbolId.slice(0, colonIdx);
}
