/**
 * C1 Compiler Backend — Core Types
 *
 * [LAW:one-source-of-truth] Output types are imported from boundary-contract.ts.
 * This module defines only the C1-specific interfaces for the compilation pipeline.
 */

import type {
  ExprIR,
  StatementIR,
  GlobalSpec,
  ArenaScalarSpec,
  InstanceDomainSpec,
  TextureSpec,
  StaticGeometrySpec,
  SamplerSpec,
  MemoryManifest,
  RosterEntry,
  PipelineInstallPayload,
} from '../../render/rust/boundary-contract';
import type { PortKey } from '../ir/patches';
import type { CanonicalType } from '../../core/canonical-types';

// ---------------------------------------------------------------------------
// Block Definition Contract
// ---------------------------------------------------------------------------

/**
 * C1 block lowering definition.
 *
 * Each block type registers one of these. It declares what GPU resources
 * the block needs (manifest) and how to lower it to GPU-IR (lower).
 */
export interface BlockDefC1 {
  /** If true, this block is a render/write sink (root of a backward walk). */
  readonly isSink?: boolean;

  /** Declare GPU resource requirements. Called during Phase 2 (Harvest). */
  readonly manifestRequirements?: (ctx: ManifestContext) => ManifestContribution;

  /** Lower this block to GPU-IR. Called during Phase 4 (Lowering). */
  readonly lower: (ctx: C1LoweringContext) => C1LoweredBlock;
}

// ---------------------------------------------------------------------------
// Context Types
// ---------------------------------------------------------------------------

/** Context provided to manifestRequirements(). */
export interface ManifestContext {
  readonly blockId: string;
  readonly blockType: string;
  readonly config: Readonly<Record<string, unknown>>;
  readonly portTypes: ReadonlyMap<PortKey, CanonicalType>;
  readonly blockIndex: number;
}

/** Context provided to lower(). */
export interface C1LoweringContext {
  readonly blockId: string;
  readonly blockType: string;
  readonly config: Readonly<Record<string, unknown>>;
  readonly portTypes: ReadonlyMap<PortKey, CanonicalType>;
  readonly blockIndex: number;
  /** Resolved upstream expressions per input port name. null if port is unwired. */
  readonly inputsById: Readonly<Record<string, ExprIR | null>>;
  /** The full manifest (after harvesting) for symbol reference. */
  readonly manifest: MemoryManifest;
}

// ---------------------------------------------------------------------------
// Manifest Contribution
// ---------------------------------------------------------------------------

/** What a block contributes to the MemoryManifest during harvesting. */
export interface ManifestContribution {
  readonly globals?: Readonly<Record<string, GlobalSpec>>;
  readonly arenaScalars?: Readonly<Record<string, ArenaScalarSpec>>;
  readonly domains?: Readonly<Record<string, InstanceDomainSpec>>;
  readonly textures?: Readonly<Record<string, TextureSpec>>;
  readonly shapes?: Readonly<Record<string, StaticGeometrySpec>>;
  readonly samplers?: Readonly<Record<string, SamplerSpec>>;
}

// ---------------------------------------------------------------------------
// Lowered Block Output
// ---------------------------------------------------------------------------

/**
 * Result of lowering a block.
 *
 * Math blocks return 'proxy' with output expressions.
 * Sink blocks return 'sink' with injected roster entries.
 */
export type C1LoweredBlock =
  | { readonly kind: 'proxy'; readonly outputs: Readonly<Record<string, ExprIR>> }
  | { readonly kind: 'sink'; readonly injectedPasses: readonly RosterEntry[]; readonly preamble?: readonly StatementIR[] };

// ---------------------------------------------------------------------------
// Compile Result
// ---------------------------------------------------------------------------

export type C1CompileResult =
  | { readonly kind: 'ok'; readonly payload: PipelineInstallPayload }
  | { readonly kind: 'error'; readonly errors: readonly string[] };
