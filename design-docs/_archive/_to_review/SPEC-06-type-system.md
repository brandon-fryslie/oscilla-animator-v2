# Spec: Type System Primitives

**Date:** 2025-12-28
**Status:** PROPOSED
**Category:** Type System
**Priority:** Tier 1

---

## Overview

The type system has fragmentation between two TypeDesc definitions, missing conversion paths, and adapters/lenses not applied in IR mode.

---

## Backlog Checklist

- [ ] Unify TypeDesc definition and update imports to canonical location.
- [ ] Apply adapters during IR lowering (signal + field paths).
- [ ] Apply lenses during IR lowering (wire-level transforms).
- [ ] Complete coercion graph and path finding for conversions.
- [ ] Define and implement world promotion rules (scalar→signal→field).

---

## Gap 1: Duplicate TypeDesc Definitions (CRITICAL)

### Current State

**Location A:** `src/editor/compiler/ir/types.ts`
```typescript
interface TypeDesc {
  world: "signal" | "field" | "scalar" | "event";
  domain: string;
}
```

**Location B:** `src/editor/ir/types/TypeDesc.ts`
```typescript
interface TypeDesc {
  world: "signal" | "field" | "scalar" | "event" | "config" | "special";
  domain: string;
}
```

### Impact

- Type confusion across codebase
- Some code uses wrong definition
- "config" and "special" worlds not handled everywhere

### Proposed Solution

```typescript
// Single canonical TypeDesc in src/editor/types.ts
export interface TypeDesc {
  /** Value world determines evaluation timing */
  world: TypeWorld;
  /** Domain determines the value shape */
  domain: TypeDomain;
}

export type TypeWorld =
  | "scalar"   // Compile-time constant
  | "signal"   // Per-frame evaluation
  | "field"    // Per-element evaluation
  | "event"    // Discrete trigger
  | "config"   // Block configuration (compile-time)
  | "special"; // Domain handles, etc.

export type TypeDomain =
  | "number"
  | "boolean"
  | "phase01"
  | "time"
  | "vec2"
  | "vec3"
  | "color"
  | "path"
  | "string"
  | "domain"   // Domain handle
  | "any";     // Polymorphic

// Migration: deprecate old locations
// src/editor/compiler/ir/types.ts → re-export from types.ts
// src/editor/ir/types/TypeDesc.ts → delete, update imports
```

### Files to Modify

1. `src/editor/types.ts` - Add canonical definition
2. `src/editor/compiler/ir/types.ts` - Re-export
3. `src/editor/ir/types/TypeDesc.ts` - Delete
4. All files importing from old locations - Update imports

### Complexity

Medium - Many files to update, but mechanical changes.

---

## Gap 2: Adapters Not Applied in IR Mode (HIGH)

### Current State

**Location:** `src/editor/compiler/passes/pass6-block-lowering.ts`

Adapters (type conversions registered on ports) are ignored during IR lowering.

### Impact

- Automatic type coercion doesn't work
- number→phase01 adaptation fails
- User must manually insert adapter blocks

### Proposed Solution

```typescript
// Adapter registry
interface AdapterDef {
  from: TypeDesc;
  to: TypeDesc;
  kernelId: string;  // Kernel that performs conversion
}

const BUILTIN_ADAPTERS: AdapterDef[] = [
  { from: { world: "signal", domain: "number" },
    to: { world: "signal", domain: "phase01" },
    kernelId: "numberToPhase01" },

  { from: { world: "signal", domain: "phase01" },
    to: { world: "signal", domain: "number" },
    kernelId: "phase01ToNumber" },

  { from: { world: "signal", domain: "number" },
    to: { world: "signal", domain: "time" },
    kernelId: "identity" },

  { from: { world: "signal", domain: "boolean" },
    to: { world: "signal", domain: "number" },
    kernelId: "boolToNumber" },
];

// Apply adapters during IR building
function applyAdapter(
  value: ValueRefPacked,
  fromType: TypeDesc,
  toType: TypeDesc,
  builder: IRBuilder
): ValueRefPacked {
  // Check if types already match
  if (typesEqual(fromType, toType)) {
    return value;
  }

  // Find adapter
  const adapter = findAdapter(fromType, toType);
  if (!adapter) {
    throw new CompileError(
      `No adapter from ${formatType(fromType)} to ${formatType(toType)}`
    );
  }

  // Apply adapter
  if (value.k === "sig") {
    const adapted = builder.sigMap(value.id, { kind: "kernel", name: adapter.kernelId });
    const slot = builder.allocValueSlot(toType);
    builder.registerSigSlot(adapted, slot);
    return { k: "sig", id: adapted, slot };
  }

  if (value.k === "field") {
    const adapted = builder.fieldMap(value.id, { kind: "kernel", name: adapter.kernelId });
    const slot = builder.allocValueSlot(toType);
    builder.registerFieldSlot(adapted, slot);
    return { k: "field", id: adapted, slot };
  }

  throw new CompileError(`Cannot adapt ${value.k} values`);
}

// In pass6, wrap input resolution with adapter application
function resolveInputWithAdapter(
  port: InputPort,
  block: Block,
  ctx: LowerContext
): ValueRefPacked {
  const value = resolveInputValue(port, block, ctx);
  const actualType = getValueType(value, ctx);
  const expectedType = port.type;

  return applyAdapter(value, actualType, expectedType, ctx.b);
}
```

### Complexity

Medium - Clear pattern, needs integration.

---

## Gap 3: Lenses Not Applied in IR Mode (HIGH)

### Current State

Lenses (value transformations on wires) are ignored during IR lowering.

### Impact

- Wire-level transformations don't work
- Scale/bias on wires ignored
- Range mapping fails

### Proposed Solution

```typescript
// Lens types
type LensIR =
  | { kind: "scaleBias"; scale: number; bias: number }
  | { kind: "clamp"; min: number; max: number }
  | { kind: "map"; fn: PureFnRef }
  | { kind: "ease"; fn: EaseFn };

interface WireWithLens {
  from: PortRef;
  to: PortRef;
  lens?: LensIR;
}

// Apply lens during wire resolution
function applyLens(
  value: ValueRefPacked,
  lens: LensIR,
  builder: IRBuilder
): ValueRefPacked {
  switch (lens.kind) {
    case "scaleBias":
      if (value.k === "sig") {
        const scaled = builder.sigMap(value.id, {
          kind: "kernel",
          name: "scaleBias",
          params: { scale: lens.scale, bias: lens.bias },
        });
        return { ...value, id: scaled };
      }
      // Handle field case
      break;

    case "clamp":
      // Similar pattern
      break;

    case "ease":
      // Apply easing function
      break;

    case "map":
      // Apply custom function
      break;
  }

  return value;
}

// In wire resolution
function resolveWire(wire: WireWithLens, ctx: LowerContext): ValueRefPacked {
  let value = resolveOutputValue(wire.from, ctx);

  if (wire.lens) {
    value = applyLens(value, wire.lens, ctx.b);
  }

  return value;
}
```

### Complexity

Medium - Similar pattern to adapters.

---

## Gap 4: Type Coercion Paths Incomplete (MEDIUM)

### Current State

Only some type conversions are supported.

### Impact

- vec2→number (magnitude) not available
- color→number (luminance) missing
- Field/signal world conversions limited

### Proposed Solution

```typescript
// Complete coercion graph
const COERCION_GRAPH: Map<string, Map<string, string>> = new Map([
  ["number", new Map([
    ["phase01", "numberToPhase01"],
    ["boolean", "numberToBool"],
    ["time", "identity"],
  ])],
  ["phase01", new Map([
    ["number", "phase01ToNumber"],
  ])],
  ["boolean", new Map([
    ["number", "boolToNumber"],
  ])],
  ["vec2", new Map([
    ["number", "vec2Magnitude"],
  ])],
  ["vec3", new Map([
    ["number", "vec3Magnitude"],
  ])],
  ["color", new Map([
    ["number", "colorLuminance"],
  ])],
]);

// Path finding for multi-step coercion
function findCoercionPath(from: TypeDomain, to: TypeDomain): string[] | null {
  if (from === to) return [];

  const visited = new Set<TypeDomain>();
  const queue: Array<{ domain: TypeDomain; path: string[] }> = [
    { domain: from, path: [] },
  ];

  while (queue.length > 0) {
    const { domain, path } = queue.shift()!;
    if (visited.has(domain)) continue;
    visited.add(domain);

    const edges = COERCION_GRAPH.get(domain);
    if (!edges) continue;

    for (const [target, kernel] of edges) {
      if (target === to) {
        return [...path, kernel];
      }
      queue.push({ domain: target as TypeDomain, path: [...path, kernel] });
    }
  }

  return null;
}
```

### Complexity

Low-Medium - Graph-based coercion path finding.

---

## Gap 5: World Promotion Rules (MEDIUM)

### Current State

No clear rules for promoting scalar→signal→field.

### Impact

- Mixing worlds causes errors
- scalar+signal operations fail

### Proposed Solution

```typescript
// World promotion lattice: scalar < signal < field
const WORLD_ORDER: Record<TypeWorld, number> = {
  scalar: 0,
  config: 0,
  signal: 1,
  event: 1,
  field: 2,
  special: -1,  // Not promotable
};

function promoteWorld(a: TypeWorld, b: TypeWorld): TypeWorld {
  if (WORLD_ORDER[a] < 0 || WORLD_ORDER[b] < 0) {
    throw new CompileError(`Cannot promote ${a} and ${b}`);
  }
  return WORLD_ORDER[a] >= WORLD_ORDER[b] ? a : b;
}

// Binary operation type inference
function inferBinaryType(a: TypeDesc, b: TypeDesc, op: BinaryOp): TypeDesc {
  const world = promoteWorld(a.world, b.world);
  const domain = inferDomain(a.domain, b.domain, op);
  return { world, domain };
}

// Automatic promotion during IR building
function promoteTo(
  value: ValueRefPacked,
  targetWorld: TypeWorld,
  builder: IRBuilder
): ValueRefPacked {
  const currentWorld = getWorld(value);

  if (currentWorld === targetWorld) return value;

  if (currentWorld === "scalar" && targetWorld === "signal") {
    // Promote scalar to constant signal
    if (value.k === "scalar") {
      const sig = builder.sigConst(value.value, value.type);
      return { k: "sig", id: sig, slot: value.slot };
    }
  }

  if (currentWorld === "signal" && targetWorld === "field") {
    // Broadcast signal to field
    if (value.k === "sig") {
      const field = builder.broadcastSigToField(value.id);
      return { k: "field", id: field, slot: value.slot };
    }
  }

  throw new CompileError(`Cannot promote ${currentWorld} to ${targetWorld}`);
}
```

### Complexity

Medium - Clear semantics, needs implementation.

---

## Summary

| Gap | Severity | Complexity | Enables |
|-----|----------|------------|---------|
| Duplicate TypeDesc | CRITICAL | Medium | Type consistency |
| Adapters not applied | HIGH | Medium | Automatic type conversion |
| Lenses not applied | HIGH | Medium | Wire transformations |
| Coercion paths | MEDIUM | Low-Medium | vec2→number, etc. |
| World promotion | MEDIUM | Medium | Mixed-world operations |

**Recommended order:** TypeDesc unification → Adapters → Lenses → World promotion → Coercion paths
