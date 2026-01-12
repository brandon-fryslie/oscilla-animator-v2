
8) Lenses and adapters as one TransformChain (canonical)

You can keep the terms “adapter” and “lens” for UX, but the runtime needs one representation.

8.1 Transform chain

export type TransformChainRef = string; // id into TransformChainTable

export interface TransformChainTable {
  chains: Record<TransformChainRef, TransformChainIR>;
}

export interface TransformChainIR {
  id: TransformChainRef;

  // A chain is ordered steps.
  // Each step has declared input/output TypeDesc (validated at compile time).
  steps: TransformStepIR[];
}

export type TransformStepIR =
  | { kind: "adapter"; adapterId: string; params?: Record<string, unknown> }
  | { kind: "lens"; lensId: string; params?: Record<string, unknown> };

8.2 Adapter and lens tables

export interface AdapterTable {
  adapters: Record<string, AdapterIR>;
}

export interface LensTable {
  lenses: Record<string, LensIR>;
}

export interface AdapterIR {
  id: string;
  from: TypeDesc;
  to: TypeDesc;

  // Semantic classification for scheduling + debug
  class: "cast" | "lift" | "reduce" | "reshape" | "domainAware";

  // Runtime opcode or kernel reference (no closures)
  impl: TransformImplRef;

  // UI metadata
  ui?: TransformUIHints;
}

export interface LensIR {
  id: string;
  from: TypeDesc;
  to: TypeDesc;

  // Lenses are user-configured transforms (scale, clamp, ease, slew, quantize, remap palette, etc.)
  impl: TransformImplRef;
  ui?: TransformUIHints;
}

export type TransformImplRef =
  | { kind: "opcode"; opcode: OpCode }           // implemented by VM directly
  | { kind: "kernel"; kernelId: string };        // implemented by backend library (Rust/WASM)

Rule: A transform is only “auto-insertable” if it is pure, type-safe, and O(1) per element for Fields unless explicitly marked heavy (reduce).

⸻
