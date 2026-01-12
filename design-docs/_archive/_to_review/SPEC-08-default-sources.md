# Spec: Default Sources Primitives

**Date:** 2025-12-28
**Status:** PROPOSED
**Category:** Default Sources
**Priority:** Tier 0

---

## Overview

The default sources system allows ports to have automatic values when not connected. Currently, pass8 acknowledges defaults but doesn't materialize them in IR mode.

---

## Backlog Checklist

- [ ] Materialize defaultSource in IR lowering (wire/bus/default resolution).
- [ ] Support scalar/signal/field default materialization paths.
- [ ] Define empty values for optional inputs across domains.
- [ ] Add diagnostics for missing defaults vs required inputs.
- [ ] Add tests for defaultSource behavior in IR mode.

---

## Gap 1: Default Sources Not Materialized (CRITICAL)

### Current State

**Location:** `src/editor/compiler/passes/pass6-block-lowering.ts`

Default sources are registered on ports but:
- Pass 8 acknowledges them but doesn't materialize
- IR mode uses placeholder values
- Closure mode works because it evaluates defaults at runtime

### Impact

- Blocks with unconnected optional inputs fail
- Default values ignored in IR mode
- Many blocks unusable without explicit wiring

### Proposed Solution

```typescript
// In pass6-block-lowering.ts, handle default sources properly
function resolveInputValue(
  inputPort: InputPort,
  block: Block,
  ctx: LowerContext
): ValueRefPacked {
  // 1. Check for wire
  const wire = ctx.findWireToPort(block.id, inputPort.id);
  if (wire) {
    return resolveWireSource(wire, ctx);
  }

  // 2. Check for bus listener
  const listener = ctx.findBusListener(block.id, inputPort.id);
  if (listener) {
    return resolveBusValue(listener, ctx);
  }

  // 3. Check for defaultSource on port declaration
  const portDecl = getPortDeclaration(block.type, inputPort.id);
  if (portDecl?.defaultSource) {
    return materializeDefaultSource(portDecl.defaultSource, portDecl.type, ctx);
  }

  // 4. Check if port is optional
  if (portDecl?.optional) {
    // Return appropriate "empty" value for type
    return emptyValueForType(portDecl.type, ctx);
  }

  // 5. Error - required input not provided
  throw new CompileError(
    `Missing required input "${inputPort.id}" for block "${block.type}" (${block.id}). ` +
    `Connect a wire, add a bus listener, or define a defaultSource.`
  );
}

// Materialize a default source to IR
function materializeDefaultSource(
  defaultSource: DefaultSource,
  type: TypeDesc,
  ctx: LowerContext
): ValueRefPacked {
  switch (defaultSource.kind) {
    case "constant":
      return materializeConstant(defaultSource.value, type, ctx);

    case "signal":
      return materializeSignalDefault(defaultSource, type, ctx);

    case "field":
      return materializeFieldDefault(defaultSource, type, ctx);

    case "dynamic":
      return materializeDynamicDefault(defaultSource, type, ctx);
  }
}

function materializeConstant(
  value: unknown,
  type: TypeDesc,
  ctx: LowerContext
): ValueRefPacked {
  const builder = ctx.b;

  switch (type.world) {
    case "signal":
      const numValue = typeof value === "number" ? value : Number(value) || 0;
      const sigId = builder.sigConst(numValue, type);
      const sigSlot = builder.allocValueSlot(type);
      builder.registerSigSlot(sigId, sigSlot);
      return { k: "sig", id: sigId, slot: sigSlot };

    case "field":
      const fieldValue = typeof value === "number" ? value : Number(value) || 0;
      const fieldId = builder.fieldConst(fieldValue, type);
      const fieldSlot = builder.allocValueSlot(type);
      builder.registerFieldSlot(fieldId, fieldSlot);
      return { k: "field", id: fieldId, slot: fieldSlot };

    case "scalar":
      return { k: "scalar", value: value as number };

    default:
      throw new CompileError(`Cannot materialize constant for world: ${type.world}`);
  }
}
```

### Files to Modify

1. `src/editor/compiler/passes/pass6-block-lowering.ts` - Main resolution logic
2. `src/editor/blocks/*.ts` - Ensure defaultSource is properly declared
3. Add tests for default source materialization

### Complexity

Medium - Clear pattern, needs systematic application.

---

## Gap 2: Dynamic Default Sources (HIGH)

### Current State

Only constant default sources supported.

### Impact

- Can't have default that references time
- Can't have default that references other signals

### Proposed Solution

```typescript
// Extended default source types
type DefaultSource =
  | { kind: "constant"; value: unknown }
  | { kind: "timeRef"; signal: "tAbsMs" | "tModelMs" | "phase01" }
  | { kind: "domainRef"; property: "index" | "count" }
  | { kind: "expression"; expr: string };  // Future: mini-expression language

function materializeSignalDefault(
  defaultSource: DefaultSource,
  type: TypeDesc,
  ctx: LowerContext
): ValueRefPacked {
  if (defaultSource.kind === "timeRef") {
    // Reference well-known time slot
    const timeSlot = ctx.getTimeSlot(defaultSource.signal);
    const sigId = ctx.b.sigInputSlot(timeSlot, type);
    return { k: "sig", id: sigId, slot: timeSlot };
  }

  // Handle other kinds...
}

// In block definitions, use dynamic defaults
const LFO: BlockDef = {
  inputs: [
    {
      id: "phase",
      type: { world: "signal", domain: "phase01" },
      defaultSource: { kind: "timeRef", signal: "phase01" },  // Uses TimeRoot phase
    },
    {
      id: "frequency",
      type: { world: "signal", domain: "number" },
      defaultSource: { kind: "constant", value: 1 },
    },
  ],
  // ...
};
```

### Complexity

Medium - Requires time slot registry access.

---

## Gap 3: Domain-Aware Field Defaults (HIGH)

### Current State

Field defaults don't respect domain count.

### Impact

- Field constants may have wrong length
- Domain-indexed defaults don't work

### Proposed Solution

```typescript
// Field default that respects domain
interface FieldDefaultSource {
  kind: "fieldDefault";
  pattern: FieldPattern;
}

type FieldPattern =
  | { kind: "uniform"; value: number }           // Same value for all
  | { kind: "linear"; start: number; end: number }  // Interpolate
  | { kind: "indexed"; fn: "index" | "normalized" }  // i or i/n
  | { kind: "random"; seed: number; min: number; max: number };

function materializeFieldDefault(
  pattern: FieldPattern,
  domainCount: number,
  ctx: LowerContext
): FieldExprId {
  switch (pattern.kind) {
    case "uniform":
      return ctx.b.fieldConst(pattern.value, type);

    case "linear": {
      // Generate linear interpolation field
      return ctx.b.fieldMapIndexed(
        ctx.domainSlot,
        { kind: "kernel", name: "linearInterp", params: pattern }
      );
    }

    case "indexed": {
      // Use FieldExprMapIndexed
      return ctx.b.fieldMapIndexed(
        ctx.domainSlot,
        { kind: "kernel", name: pattern.fn }
      );
    }

    case "random": {
      // Pre-generate random values at compile time
      const values = generateSeededRandom(pattern.seed, domainCount, pattern.min, pattern.max);
      return ctx.b.fieldConstArray(values, type);
    }
  }
}
```

### Complexity

Medium - Requires FieldExprMapIndexed (from SPEC-01).

---

## Gap 4: Default Source Validation (MEDIUM)

### Current State

No validation that default source matches port type.

### Impact

- Type mismatches cause runtime errors
- Invalid defaults not caught at compile time

### Proposed Solution

```typescript
// Validate default source during block registration
function validateDefaultSource(
  defaultSource: DefaultSource,
  portType: TypeDesc,
  blockType: string,
  portId: string
): void {
  const defaultType = inferDefaultSourceType(defaultSource);

  if (!typesCompatible(defaultType, portType)) {
    throw new Error(
      `Default source type mismatch for ${blockType}.${portId}: ` +
      `expected ${formatType(portType)}, got ${formatType(defaultType)}`
    );
  }
}

function inferDefaultSourceType(source: DefaultSource): TypeDesc {
  switch (source.kind) {
    case "constant":
      return inferConstantType(source.value);

    case "timeRef":
      switch (source.signal) {
        case "phase01": return { world: "signal", domain: "phase01" };
        case "tAbsMs":
        case "tModelMs": return { world: "signal", domain: "time" };
      }

    case "domainRef":
      switch (source.property) {
        case "index": return { world: "field", domain: "number" };
        case "count": return { world: "signal", domain: "number" };
      }

    default:
      return { world: "signal", domain: "any" };
  }
}

// Run validation at block registry time
function registerBlock(def: BlockDef): void {
  for (const input of def.inputs) {
    if (input.defaultSource) {
      validateDefaultSource(input.defaultSource, input.type, def.type, input.id);
    }
  }
  // ... rest of registration
}
```

### Complexity

Low - Validation at registration time.

---

## Gap 5: Optional Ports Without Defaults (MEDIUM)

### Current State

Optional ports without defaultSource get undefined behavior.

### Impact

- Block behavior unpredictable
- No clear contract for optional inputs

### Proposed Solution

```typescript
// Clear semantics for optional ports
interface InputPortDef {
  id: string;
  type: TypeDesc;
  optional?: boolean;          // True if port can be unconnected
  defaultSource?: DefaultSource;  // What to use if unconnected
  nullBehavior?: NullBehavior;    // What block does if null
}

type NullBehavior =
  | "skip"      // Skip this input in processing
  | "identity"  // Use identity value (0 for add, 1 for mul)
  | "error";    // Runtime error if accessed

// Empty value generation for optional ports
function emptyValueForType(type: TypeDesc, ctx: LowerContext): ValueRefPacked {
  switch (type.world) {
    case "signal":
      // Identity value for numeric operations
      const identity = getIdentityValue(type.domain);
      return materializeConstant(identity, type, ctx);

    case "field":
      // Empty field - 0 for all elements
      return materializeConstant(0, type, ctx);

    default:
      throw new CompileError(`No empty value for type: ${formatType(type)}`);
  }
}

function getIdentityValue(domain: string): number {
  switch (domain) {
    case "number":
    case "phase01":
    case "time":
      return 0;
    case "boolean":
      return 0;  // false
    default:
      return 0;
  }
}
```

### Complexity

Low - Clear semantics, simple implementation.

---

## Summary

| Gap | Severity | Complexity | Enables |
|-----|----------|------------|---------|
| Defaults not materialized | CRITICAL | Medium | Basic optional inputs |
| Dynamic defaults | HIGH | Medium | Time-based defaults |
| Domain-aware field defaults | HIGH | Medium | Proper field initialization |
| Default validation | MEDIUM | Low | Type safety |
| Optional port semantics | MEDIUM | Low | Clear behavior |

**Recommended order:** Materialization → Validation → Optional semantics → Dynamic defaults → Field defaults
