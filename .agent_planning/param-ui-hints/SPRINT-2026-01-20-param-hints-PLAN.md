# Sprint: param-hints - Add paramHints to BlockDef

**Generated:** 2026-01-20
**Confidence:** HIGH
**Status:** READY FOR IMPLEMENTATION

## Sprint Goal

Enable blocks to specify UI hints for params that don't correspond to inputs, using a new `paramHints` field on `BlockDef`.

## Scope

**Deliverables:**
1. Add `paramHints` field to `BlockDef` type
2. Update `ParamField` component to use `paramHints`
3. Update Const block to use new `paramHints` structure

## Work Items

### P0: Add paramHints to BlockDef

**Files to modify:**
- `src/blocks/registry.ts`

**Changes:**
```typescript
export interface BlockDef {
  // ... existing fields ...

  // Block parameters (values)
  readonly params?: Record<string, unknown>;

  // NEW: UI hints for params (separate from input hints)
  readonly paramHints?: Record<string, UIControlHint>;

  // ... rest ...
}
```

**Acceptance Criteria:**
- [ ] `paramHints` field added to `BlockDef` interface
- [ ] Type is `Record<string, UIControlHint>` (optional)
- [ ] Import `UIControlHint` type if not already imported

### P1: Update ParamField to use paramHints

**Files to modify:**
- `src/ui/components/BlockInspector.tsx` (ParamField component, ~line 1632)

**Changes:**
```typescript
const ParamField = observer(function ParamField({ blockId, paramKey, value, typeInfo }: ParamFieldProps) {
  // Look for uiHint in three places:
  // 1. typeInfo.paramHints (NEW)
  // 2. Matching inputDef.uiHint (existing)
  const paramHint = typeInfo.paramHints?.[paramKey];
  const inputDef = typeInfo.inputs.find(i => i.id === paramKey);
  const uiHint = paramHint ?? inputDef?.uiHint;

  // ... rest unchanged ...
});
```

**Acceptance Criteria:**
- [ ] ParamField checks `typeInfo.paramHints[paramKey]` first
- [ ] Falls back to `inputDef.uiHint` if no paramHint
- [ ] Type narrowing works correctly

### P2: Update Const block registration

**Files to modify:**
- `src/blocks/signal-blocks.ts`

**Changes:**
```typescript
registerBlock({
  type: 'Const',
  label: 'Constant',
  category: 'signal',
  description: 'Outputs a constant value (type inferred from target)',
  form: 'primitive',
  capability: 'pure',
  inputs: [],
  outputs: [
    { id: 'out', label: 'Output', type: signalType('???') },
  ],
  params: {
    value: 0,
    // payloadType is set by normalizer after type inference
  },
  paramHints: {
    value: { kind: 'slider', min: 1, max: 10000, step: 1 },
  },
  lower: ({ ctx, config }) => {
    // ... unchanged ...
  },
});
```

**Acceptance Criteria:**
- [ ] `uiHint` removed from inline params
- [ ] `paramHints` added with value hint
- [ ] Block registration still works (no errors)

### P3: Verify UI rendering

**Manual testing:**
1. Add a Const block to the patch
2. Select it in the inspector
3. Verify "value" param shows slider control (not plain number input)
4. Verify slider has correct min/max/step (1, 10000, 1)
5. Verify changing slider updates the param value

**Acceptance Criteria:**
- [ ] Slider renders for Const.value param
- [ ] Slider range is 1-10000 with step 1
- [ ] Value changes propagate correctly

## Dependencies

- None

## Risks

- **Low:** If BlockDef type change causes unexpected TypeScript errors, may need to check all block registrations. Mitigation: `paramHints` is optional so should be backward compatible.
