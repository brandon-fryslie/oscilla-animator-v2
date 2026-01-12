# TypeDesc Unification: Editor ↔ IR Type System

**Purpose:** Document the relationship between the editor's type system (SlotType strings) and the IR's TypeDesc system.

## Overview

The Oscilla compiler bridges two type representations:

1. **Editor Types** - String-based slot types from the visual editor (e.g., `"Signal<number>"`, `"Field<vec2>"`)
2. **IR Types** - Structured TypeDesc objects used throughout the compilation IR

Pass 2 (Type Graph Construction) performs the conversion from editor types to IR types.

## TypeDesc Structure

```typescript
interface TypeDesc {
  world: TypeWorld;      // "signal" | "field" | "scalar" | "event" | "special"
  domain: TypeDomain;    // "number" | "vec2" | "color" | "boolean" | ...
  semantics?: string;    // Optional: "point", "hsl", "linearRGB", "bpm", etc.
  unit?: string;         // Optional: "px", "deg", "ms", etc.
}
```

## Editor → IR Type Mapping

### Generic Type Patterns

| Editor Pattern | World | Domain | Notes |
|----------------|-------|--------|-------|
| `Signal<D>` | `signal` | D | Time-varying reactive value |
| `Field<D>` | `field` | D | Domain-varying spatial value |
| `Event<D>` | `event` | D | Discrete event stream |
| `Scalar:D` | `scalar` | D | Compile-time constant |

### Special Types

| Editor Type | World | Domain | Usage |
|-------------|-------|--------|-------|
| `Scene` | `special` | `scene` | SceneGraph root |
| `SceneTargets` | `special` | `sceneTargets` | Target collection |
| `SceneStrokes` | `special` | `sceneStrokes` | Stroke collection |
| `Domain` | `special` | `domain` | Element ID handle |
| `Program` | `special` | `program` | Compiled program |
| `RenderTree` | `special` | `renderTree` | Render command tree |
| `CanvasRender` | `special` | `canvasRender` | Canvas render state |
| `FilterDef` | `special` | `filterDef` | Filter definition |
| `StrokeStyle` | `special` | `strokeStyle` | Stroke styling |

### Domain Aliases

The editor uses friendly names that are normalized to canonical IR domains:

| Editor Domain | IR Domain | Meaning |
|---------------|-----------|---------|
| `Point` | `vec2` | 2D position |
| `Unit` | `unit01` | Normalized [0,1] range |
| `Time` | `timeMs` | Time in milliseconds |
| `PhaseSample` | `phase01` | Phase in [0,1] range |
| `any` | `unknown` | Polymorphic/unknown type |

All other domains are lowercased (e.g., `"Number"` → `"number"`).

## Bus Eligibility

Not all TypeDescs can be used as buses. Bus eligibility rules:

### Bus-Eligible Types

1. **Signal world** - Always eligible
   ```typescript
   { world: "signal", domain: "number" }   // ✓ Can be bus
   { world: "signal", domain: "vec2" }     // ✓ Can be bus
   ```

2. **Event world** - Always eligible
   ```typescript
   { world: "event", domain: "trigger" }   // ✓ Can be bus
   ```

3. **Field world** - Only for scalar domains
   ```typescript
   { world: "field", domain: "number" }    // ✓ Can be bus (scalar field)
   { world: "field", domain: "boolean" }   // ✓ Can be bus (scalar field)
   { world: "field", domain: "color" }     // ✓ Can be bus (scalar field)
   { world: "field", domain: "vec2" }      // ✗ Cannot be bus (non-scalar)
   ```

### Not Bus-Eligible

- **Scalar world** - Compile-time only, cannot be runtime bus
- **Special world** - Not designed for bus communication

### Implementation

```typescript
export function isBusEligible(type: TypeDesc): boolean {
  if (type.world === "signal") return true;
  if (type.world === "event") return true;

  if (type.world === "field") {
    // Field is bus-eligible only for scalar domains
    const scalarDomains = ["number", "boolean", "color"];
    return scalarDomains.includes(type.domain);
  }

  return false; // scalar and special are not bus-eligible
}
```

**Location:** `src/editor/compiler/passes/pass2-types.ts`

## Reserved Bus Constraints

Certain bus names have mandatory type requirements:

| Bus Name | Required Type | Description |
|----------|---------------|-------------|
| `phaseA` | `signal<number>` | Primary phase signal (0..1) |
| `pulse` | `event<trigger>` | Primary pulse/event trigger |
| `energy` | `signal<number>` | Energy/amplitude signal (0..∞) |
| `palette` | `signal<color>` | Color palette signal |

Pass 2 validates these constraints and emits `ReservedBusTypeViolation` errors if violated.

## Type Conversion

Currently, Pass 2 only allows exact type matches (same world and domain). Future passes will support:

- **Adapters** - Convert between different domains (e.g., `number` → `color`)
- **Lenses** - Convert between worlds (e.g., `signal` → `field`)
- **Composition** - Chain multiple conversions

The `conversionPaths` map in `TypedPatch` is reserved for this future work.

## Implementation Notes

### SlotWorld → TypeWorld

Editor slots have a `SlotWorld` annotation that includes a `"config"` world (for compile-time parameters). At compile time, `config` becomes `scalar`:

```typescript
function slotWorldToTypeWorld(slotWorld: SlotWorld): TypeWorld {
  if (slotWorld === "config") return "scalar";
  return slotWorld;
}
```

### Type Parsing

The `slotTypeToTypeDesc()` function in Pass 2 uses regex patterns to parse editor type strings:

```typescript
// Patterns:
/^(Signal|Field|Event)<(.+)>$/  // Generic types
/^Scalar:(.+)$/                  // Scalar types
// + hardcoded map for special types
```

### Error Handling

Pass 2 emits these type-related errors:

- **PortTypeUnknown** - Cannot parse slot type string
- **BusIneligibleType** - Bus has non-eligible type
- **ReservedBusTypeViolation** - Reserved bus has wrong type
- **NoConversionPath** - No adapter/lens chain exists for wire

## Testing

The `isBusEligible()` function is tested in:
- `src/editor/compiler/passes/__tests__/pass2-types.test.ts`
- Integration tests in `pipeline-integration.test.ts`

## Future Work

1. **Adapter Registry** - Query available type adapters
2. **Lens Composition** - Automatic world conversion
3. **Type Inference** - Infer types from connections
4. **Subtyping** - Structural type compatibility
5. **Generics** - Parametric polymorphism

## References

- **Pass 2 Implementation:** `src/editor/compiler/passes/pass2-types.ts`
- **IR Types:** `src/editor/compiler/ir/types.ts`
- **Editor Types:** `src/editor/types.ts`
- **Design Spec:** `design-docs/12-Compiler-Final/02-IR-Schema.md`
