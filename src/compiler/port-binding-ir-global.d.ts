import type { PortBindingIR as CanonicalPortBindingIR } from './ir/program';

// [LAW:one-source-of-truth] Legacy compiler-local PortBindingIR references
// are bound to the canonical IR type from one module until direct references
// are fully migrated.
declare global {
  type PortBindingIR = CanonicalPortBindingIR;
}

export {};
