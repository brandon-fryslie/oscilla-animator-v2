/**
 * GPU-IR DSL: Compact manifest expansion.
 *
 * Expands shorthand manifest declarations into the full MemoryManifest
 * shape expected by boundary-contract.ts.
 */

import type {
  MemoryManifest,
  GlobalSpec,
  ArenaScalarSpec,
  InstanceDomainSpec,
  FieldSpec,
  TextureSpec,
  StaticGeometrySpec,
  SamplerSpec,
} from '../rust/boundary-contract';

// ---------------------------------------------------------------------------
// Compact input types
// ---------------------------------------------------------------------------

export interface CompactManifest {
  readonly globals?: Record<string, string | CompactGlobalSpec>;
  readonly scalars?: Record<string, CompactScalarSpec>;
  readonly domains?: Record<string, CompactDomainSpec>;
  readonly textures?: Record<string, TextureSpec>;
  readonly shapes?: Record<string, StaticGeometrySpec>;
  readonly samplers?: Record<string, SamplerSpec>;
}

export type CompactGlobalSpec = string | { readonly f32?: number; readonly u32?: number; readonly i32?: number; readonly dynamic?: boolean };
export type CompactScalarSpec = { readonly f32?: number; readonly u32?: number; readonly i32?: number };

export interface CompactDomainSpec {
  readonly capacity: number;
  readonly active: string;
  readonly fields: Record<string, string | CompactFieldSpec>;
}

export type CompactFieldSpec = { readonly f32?: number; readonly u32?: number; readonly i32?: number };

// ---------------------------------------------------------------------------
// Expansion
// ---------------------------------------------------------------------------

export function expandManifest(compact: CompactManifest): MemoryManifest {
  return {
    preserveStateOnRecompile: false,
    globals: expandGlobals(compact.globals ?? {}),
    arenaScalars: expandScalars(compact.scalars ?? {}),
    domains: expandDomains(compact.domains ?? {}),
    textures: compact.textures ?? {},
    shapeBank: compact.shapes ?? {},
    dataStreams: {},
    samplers: compact.samplers ?? {},
  };
}

function expandGlobals(input: Record<string, string | CompactGlobalSpec>): Record<string, GlobalSpec> {
  const out: Record<string, GlobalSpec> = {};
  for (const [id, spec] of Object.entries(input)) {
    if (typeof spec === 'string') {
      out[id] = { type: spec as GlobalSpec['type'], isDynamic: true, defaultValue: 0 };
    } else {
      const [type, defaultValue] = extractTypeAndValue(spec);
      out[id] = { type: type as GlobalSpec['type'], isDynamic: spec.dynamic !== false, defaultValue };
    }
  }
  return out;
}

function expandScalars(input: Record<string, CompactScalarSpec>): Record<string, ArenaScalarSpec> {
  const out: Record<string, ArenaScalarSpec> = {};
  for (const [id, spec] of Object.entries(input)) {
    const [type, clearValue] = extractTypeAndValue(spec);
    out[id] = { type: type as ArenaScalarSpec['type'], clearValue };
  }
  return out;
}

function expandDomains(input: Record<string, CompactDomainSpec>): Record<string, InstanceDomainSpec> {
  const out: Record<string, InstanceDomainSpec> = {};
  for (const [id, spec] of Object.entries(input)) {
    out[id] = {
      capacity: spec.capacity,
      activeLanesSymbol: spec.active,
      fields: expandFields(spec.fields),
    };
  }
  return out;
}

function expandFields(input: Record<string, string | CompactFieldSpec>): Record<string, FieldSpec> {
  const out: Record<string, FieldSpec> = {};
  for (const [id, spec] of Object.entries(input)) {
    if (typeof spec === 'string') {
      out[id] = { type: spec as FieldSpec['type'], clearValue: 0 };
    } else {
      const [type, clearValue] = extractTypeAndValue(spec);
      out[id] = { type: type as FieldSpec['type'], clearValue };
    }
  }
  return out;
}

function extractTypeAndValue(spec: Record<string, unknown>): [string, number] {
  for (const type of ['f32', 'u32', 'i32', 'atomic<u32>', 'atomic<i32>']) {
    if (type in spec) return [type, spec[type] as number];
  }
  throw new Error(`Cannot determine type from spec: ${JSON.stringify(spec)}`);
}
