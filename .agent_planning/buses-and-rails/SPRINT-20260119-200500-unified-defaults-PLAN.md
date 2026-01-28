# Sprint: unified-defaults - Unified Default Source Model

**Generated**: 2026-01-19T20:05:00Z
**Confidence**: HIGH
**Status**: READY FOR IMPLEMENTATION

---

## Sprint Goal

Simplify DefaultSource to a unified block-reference model where every default source is a reference to a block output, with TimeRoot as a special case (already exists) and other blocks creating derived instances.

---

## Scope

**Deliverables:**
1. Unified DefaultSource type
2. Updated helper functions
3. Updated block definitions
4. Updated pass1-default-sources.ts

**Out of Scope:**
- TimeRoot UI changes (separate sprint)
- Adding pulse/palette/energy to TimeRoot (can be done later)
- Rail blocks (removed from design)

**Also In Scope (added):**
- Create Square primitive block (needed for array 'element' default)

---

## Work Items

### P0: Create Square Primitive Block

**File**: `src/blocks/primitive-blocks.ts`

Add Square block similar to Circle:

```typescript
/**
 * Square - Creates a square primitive (Signal<float> representing size)
 *
 * Stage 1: Primitive block that outputs a single square signal.
 * NOT a field - this has cardinality ONE.
 */
registerBlock({
  type: 'Square',
  label: 'Square',
  category: 'shape',
  description: 'Creates a square primitive (ONE element)',
  form: 'primitive',
  capability: 'pure',
  inputs: [
    { id: 'size', label: 'Size', type: canonicalType('float'), defaultValue: 0.02, defaultSource: defaultSourceConst(0.02) },
  ],
  outputs: [
    { id: 'square', label: 'Square', type: canonicalType('float') },
  ],
  params: {
    size: 0.02,
  },
  lower: ({ ctx, inputsById, config }) => {
    const sizeInput = inputsById.size;
    let sizeSig;
    if (sizeInput && sizeInput.k === 'sig') {
      sizeSig = sizeInput.id;
    } else {
      sizeSig = ctx.b.sigConst((config?.size as number) ?? 0.02, canonicalType('float'));
    }
    const slot = ctx.b.allocSlot();
    return {
      outputsById: {
        square: { k: 'sig', id: sizeSig, slot },
      },
    };
  },
});
```

**Acceptance Criteria**:
- [ ] Square block registered
- [ ] Similar structure to Circle block
- [ ] TypeScript compiles

---

### P1: Update DefaultSource Type

**File**: `src/types/index.ts`

**Current** (lines 208-226):
```typescript
export type DefaultSource =
  | { readonly kind: 'rail'; readonly railId: string }
  | { readonly kind: 'constant'; readonly value: unknown }
  | { readonly kind: 'none' };

export function defaultSourceRail(railId: string): DefaultSource { ... }
export function defaultSourceConstant(value: unknown): DefaultSource { ... }
export function defaultSourceNone(): DefaultSource { ... }
```

**New**:
```typescript
/**
 * Default source for an input port.
 * Every input has a default source - there is no 'none' option.
 *
 * If blockType is 'TimeRoot', wires to the existing TimeRoot.
 * Otherwise, creates a derived block instance for this port.
 */
export type DefaultSource = {
  readonly blockType: string;
  readonly output: string;
  readonly params?: Record<string, unknown>;
};

/**
 * Generic default source - any block type
 */
export function defaultSource(
  blockType: string,
  output: string,
  params?: Record<string, unknown>
): DefaultSource {
  return { blockType, output, params };
}

/**
 * Constant default - creates a Const block instance
 */
export function defaultSourceConst(value: unknown): DefaultSource {
  return { blockType: 'Const', output: 'out', params: { value } };
}

/**
 * TimeRoot output default - wires to existing TimeRoot
 */
export function defaultSourceTimeRoot(
  output: 'tMs' | 'phaseA' | 'phaseB' | 'pulse' | 'palette' | 'energy'
): DefaultSource {
  return { blockType: 'TimeRoot', output };
}
```

**Acceptance Criteria**:
- [ ] DefaultSource is a single object type (no union)
- [ ] No 'none' option exists
- [ ] Helper functions cover common cases
- [ ] TypeScript compiles

---

### P1: Update Block Definitions

**Files**: Multiple files in `src/blocks/`

**Changes**:

| Old | New | Files |
|-----|-----|-------|
| `defaultSourceConstant(value)` | `defaultSourceConst(value)` | All blocks |
| `defaultSourceRail('phaseA')` | `defaultSourceTimeRoot('phaseA')` | field-operations-blocks.ts |
| `defaultSourceNone()` | `defaultSourceConst(???)` | array-blocks.ts |

**Specific file updates**:

1. **src/blocks/array-blocks.ts** (line 40):
   ```typescript
   // Old:
   { id: 'element', label: 'Element', type: canonicalType('???'), optional: true, defaultSource: defaultSourceNone() }

   // New: Need to determine appropriate default for 'element' input
   // Option A: Remove defaultSource entirely (if optional means "no default needed")
   // Option B: Use a sensible default block
   ```

2. **src/blocks/field-operations-blocks.ts** (lines 434, 540, 707):
   ```typescript
   // Old:
   defaultSource: defaultSourceRail('phaseA')

   // New:
   defaultSource: defaultSourceTimeRoot('phaseA')
   ```

3. **All other blocks**: Simple rename `defaultSourceConstant` → `defaultSourceConst`

**Acceptance Criteria**:
- [ ] All `defaultSourceConstant` replaced with `defaultSourceConst`
- [ ] All `defaultSourceRail` replaced with `defaultSourceTimeRoot`
- [ ] `defaultSourceNone()` usage resolved
- [ ] TypeScript compiles
- [ ] All tests pass

---

### P2: Update pass1-default-sources.ts

**File**: `src/graph/passes/pass1-default-sources.ts`

**Current logic** (simplified):
```typescript
if (ds.kind === 'constant') {
  // Create Const block and wire it
}
// TODO: Handle 'rail' kind for phaseA/phaseB etc.
```

**New logic**:
```typescript
function materializeDefaultSource(
  ds: DefaultSource,
  targetBlockId: BlockId,
  targetPortId: string,
  patch: Patch
): { block?: Block; edge: Edge } {

  if (ds.blockType === 'TimeRoot') {
    // Wire directly to existing TimeRoot
    const timeRoot = findTimeRoot(patch);
    if (!timeRoot) {
      throw new Error('DefaultSource references TimeRoot but no TimeRoot exists');
    }

    return {
      edge: {
        id: `${timeRoot.id}_${ds.output}_to_${targetBlockId}_${targetPortId}`,
        from: { kind: 'port', blockId: timeRoot.id, slotId: ds.output },
        to: { kind: 'port', blockId: targetBlockId, slotId: targetPortId },
        enabled: true,
      }
    };
  }

  // Create derived block instance
  const derivedId = generateDefaultSourceId(targetBlockId, targetPortId);
  const derivedBlock: Block = {
    id: derivedId,
    type: ds.blockType,
    params: ds.params ?? {},
    displayName: null,
    domainId: null,
    role: {
      kind: 'derived',
      meta: {
        kind: 'defaultSource',
        target: { kind: 'port', port: { blockId: targetBlockId, portId: targetPortId } }
      }
    },
  };

  const edge: Edge = {
    id: `${derivedId}_to_${targetBlockId}_${targetPortId}`,
    from: { kind: 'port', blockId: derivedId, slotId: ds.output },
    to: { kind: 'port', blockId: targetBlockId, slotId: targetPortId },
    enabled: true,
  };

  return { block: derivedBlock, edge };
}
```

**Acceptance Criteria**:
- [ ] TimeRoot defaults wire to existing TimeRoot
- [ ] Other defaults create derived block instances
- [ ] TODO comment removed
- [ ] Tests pass

---

### P3: Update UI Code

**Files**:
- `src/ui/components/BlockInspector.tsx`
- `src/ui/reactFlowEditor/OscillaNode.tsx`
- `src/ui/reactFlowEditor/nodes.ts`

UI code checks `defaultSource.kind === 'rail'` for styling. Update to check `defaultSource.blockType === 'TimeRoot'`.

**Acceptance Criteria**:
- [ ] UI correctly identifies TimeRoot defaults for styling
- [ ] No references to old `kind` property

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/types/index.ts` | Update DefaultSource type and helpers |
| `src/blocks/array-blocks.ts` | Update imports, fix defaultSourceNone |
| `src/blocks/field-operations-blocks.ts` | Update imports, rail→timeRoot |
| `src/blocks/primitive-blocks.ts` | Update imports |
| `src/blocks/instance-blocks.ts` | Update imports |
| `src/blocks/render-blocks.ts` | Update imports |
| `src/blocks/color-blocks.ts` | Update imports |
| `src/graph/passes/pass1-default-sources.ts` | New logic for TimeRoot/block handling |
| `src/ui/components/BlockInspector.tsx` | Update kind checks |
| `src/ui/reactFlowEditor/OscillaNode.tsx` | Update kind checks |
| `src/ui/reactFlowEditor/nodes.ts` | Update kind checks |

---

## Testing

```bash
# Type check
npm run typecheck

# Run tests
npm test

# Manual verification
npm run dev
# → Load patch
# → Verify animations work
# → Verify default sources show correctly in UI
```

---

## Resolved: Array 'element' Default

**Array block 'element' input**: Currently uses `defaultSourceNone()`.

**Decision**: Use Square block as default.

```typescript
// Old:
{ id: 'element', label: 'Element', type: canonicalType('???'), optional: true, defaultSource: defaultSourceNone() }

// New:
{ id: 'element', label: 'Element', type: canonicalType('???'), optional: true, defaultSource: defaultSource('Square', 'out') }
```

This gives arrays a sensible visual default (squares) that users can override.
