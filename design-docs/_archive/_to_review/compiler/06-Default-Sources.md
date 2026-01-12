# Default Sources Architecture

## Overview

Default sources provide values for unconnected inputs. They are implemented as **structural blocks** that are hidden from the user but participate in the graph like any other block.

## CANONICAL SOURCE OF TRUTH

**GraphNormalizer.normalize()** (`src/editor/graph/GraphNormalizer.ts`) is the SINGLE SOURCE OF TRUTH for default source materialization.

- NO other system may create structural blocks or edges for default sources
- All provider type selection happens in GraphNormalizer.selectProviderType()
- All provider ID generation happens in GraphNormalizer.generateProviderId()

### Historical Note (2026-01-04)

Previously, multiple systems competed to create default sources:
- pass0-materialize.ts (deleted)
- constProviders.ts (deleted)
- DefaultSourceStore attachment methods (deleted)
- pass1-normalize default scanning (deleted)

This caused duplicate providers, type mismatches, and architectural chaos.
All these systems were deleted. GraphNormalizer is now the only system.

## Architecture

### Provider Block ID Format

```
${blockId}_default_${slotId}
```

Example: `circle_1_default_radius`

This format is CANONICAL and DETERMINISTIC. Moving blocks doesn't change their provider IDs.

### Provider Type Selection

GraphNormalizer selects provider block types using world:domain keys:

```typescript
const mapping: Record<string, string> = {
  // Scalar providers
  'scalar:float': 'DSConstScalarFloat',
  'scalar:int': 'DSConstScalarInt',
  'scalar:string': 'DSConstScalarString',
  'scalar:waveform': 'DSConstScalarWaveform',

  // Signal providers
  'signal:float': 'DSConstSignalFloat',
  'signal:int': 'DSConstSignalInt',
  'signal:color': 'DSConstSignalColor',
  'signal:vec2': 'DSConstSignalPoint',
  'signal:point': 'DSConstSignalPoint',
  'signal:phase': 'DSConstSignalPhase',
  'signal:time': 'DSConstSignalTime',

  // Field providers
  'field:float': 'DSConstFieldFloat',
  'field:vec2': 'DSConstFieldVec2',
  'field:color': 'DSConstFieldColor',
};

// Special case: config/domain → DomainN
```

### Data Flow

```
RawGraph (user blocks + edges)
    ↓
GraphNormalizer.normalize()
    ↓
NormalizedGraph (user + structural blocks + edges)
    ↓
Compiler (receives NormalizedGraph, doesn't create providers)
```

### Role Metadata

Structural blocks and edges are tagged with role metadata:

```typescript
// Block role
{
  kind: 'structural',
  meta: {
    kind: 'defaultSource',
    target: { kind: 'port', port: PortRef }
  }
}

// Edge role
{
  kind: 'default',
  meta: { defaultSourceBlockId: string }
}
```

## Constants (Legacy Reference)

```typescript
export interface ConstPool {
  consts: Record<string, TypedConst>;
}

export type TypedConst =
  | { type: TypeDesc; value: number | string | boolean | object | null };
```

## Semantics

- Every Node input always resolves to an InputSource: slot/bus/const/default/external
- "Parameter" == "this input is fed by its DefaultSource"
- GraphNormalizer creates providers BEFORE compilation (in PatchStore.getNormalizedGraph())
- Compiler receives a graph where all default-sourced inputs already have provider blocks
