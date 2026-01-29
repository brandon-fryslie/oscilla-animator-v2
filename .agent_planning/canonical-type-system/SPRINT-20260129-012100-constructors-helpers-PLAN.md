# Sprint: constructors-helpers - Canonical Constructors and Helpers

**Generated**: 2026-01-29T01:20:28Z
**Confidence**: HIGH: 9, MEDIUM: 0, LOW: 0
**Status**: ✅ APPROVED (2026-01-29)

**Review Notes**:
- ✓ Constructor set (canonicalSignal, canonicalField, canonicalEvent*) matches derived-kind rules
- ✓ "derived kind is classification, not a new type system" implemented via deriveKind(t)
- **LOCKED**: try/require pattern for instance extraction (see P5 below)

---

## Sprint Goal

Add all canonical constructors and derived classification helpers that the spec defines but the codebase is missing.

---

## Scope

**Deliverables:**
1. Add canonical constructors: `canonicalSignal`, `canonicalField`, `canonicalEventOne`, `canonicalEventField`
2. Add derived helpers: `deriveKind`, `getManyInstance`, `assertSignalType`, `assertFieldType`, `assertEventType`
3. Add `payloadStride` computed helper
4. Remove/deprecate wrong-named alternatives

---

## Work Items

### P0: Add canonicalSignal Constructor

**Confidence**: HIGH

**Target** (from spec lines 173-185):
```typescript
export function canonicalSignal(payload: PayloadType, unit: UnitType = { kind: 'scalar' }): CanonicalType {
  return {
    payload,
    unit,
    extent: {
      cardinality: axisInst({ kind: 'one' }),
      temporality: axisInst({ kind: 'continuous' }),
      binding: axisInst(DEFAULT_BINDING),
      perspective: axisInst(DEFAULT_PERSPECTIVE),
      branch: axisInst(DEFAULT_BRANCH),
    },
  };
}
```

**Acceptance Criteria:**
- [ ] `canonicalSignal(payload, unit?)` exists with exact signature
- [ ] Returns type with cardinality=one, temporality=continuous
- [ ] Uses default constants for binding/perspective/branch
- [ ] Unit defaults to `{ kind: 'scalar' }`

---

### P1: Add canonicalField Constructor

**Confidence**: HIGH

**Target** (from spec lines 187-199):
```typescript
export function canonicalField(payload: PayloadType, unit: UnitType, instance: InstanceRef): CanonicalType {
  return {
    payload,
    unit,
    extent: {
      cardinality: axisInst({ kind: 'many', instance }),
      temporality: axisInst({ kind: 'continuous' }),
      binding: axisInst(DEFAULT_BINDING),
      perspective: axisInst(DEFAULT_PERSPECTIVE),
      branch: axisInst(DEFAULT_BRANCH),
    },
  };
}
```

**Acceptance Criteria:**
- [ ] `canonicalField(payload, unit, instance)` exists with exact signature
- [ ] Unit is REQUIRED (not optional) — spec says so
- [ ] Returns type with cardinality=many(instance), temporality=continuous

---

### P2: Add canonicalEventOne Constructor

**Confidence**: HIGH

**Target** (from spec lines 205-217):
```typescript
export function canonicalEventOne(): CanonicalType {
  return {
    payload: { kind: 'bool' },
    unit: { kind: 'none' },
    extent: {
      cardinality: axisInst({ kind: 'one' }),
      temporality: axisInst({ kind: 'discrete' }),
      binding: axisInst(DEFAULT_BINDING),
      perspective: axisInst(DEFAULT_PERSPECTIVE),
      branch: axisInst(DEFAULT_BRANCH),
    },
  };
}
```

**Acceptance Criteria:**
- [ ] `canonicalEventOne()` exists with no parameters
- [ ] Hardcoded: payload=bool, unit=none, temporality=discrete, cardinality=one
- [ ] No parameters because event type is fully determined

---

### P3: Add canonicalEventField Constructor

**Confidence**: HIGH

**Target** (from spec lines 219-231):
```typescript
export function canonicalEventField(instance: InstanceRef): CanonicalType {
  return {
    payload: { kind: 'bool' },
    unit: { kind: 'none' },
    extent: {
      cardinality: axisInst({ kind: 'many', instance }),
      temporality: axisInst({ kind: 'discrete' }),
      binding: axisInst(DEFAULT_BINDING),
      perspective: axisInst(DEFAULT_PERSPECTIVE),
      branch: axisInst(DEFAULT_BRANCH),
    },
  };
}
```

**Acceptance Criteria:**
- [ ] `canonicalEventField(instance)` exists
- [ ] Only instance is a parameter (payload/unit/temporality are hardcoded)

---

### P4: Add deriveKind Helper

**Confidence**: HIGH

**Target** (from spec lines 241-253):
```typescript
export type DerivedKind = 'signal' | 'field' | 'event';

export function deriveKind(t: CanonicalType): DerivedKind {
  const card = t.extent.cardinality;
  const tempo = t.extent.temporality;

  if (tempo.kind === 'inst' && tempo.value.kind === 'discrete') return 'event';

  // continuous:
  if (card.kind === 'inst' && card.value.kind === 'many') return 'field';
  return 'signal';
}
```

**Acceptance Criteria:**
- [ ] `DerivedKind` type exists
- [ ] `deriveKind(t)` correctly classifies based on axes
- [ ] Event check comes first (discrete temporality)
- [ ] Field check second (many cardinality)
- [ ] Signal is default

---

### P5: Add Instance Extraction Helpers (try/require pattern)

**Confidence**: HIGH

**DECISION LOCKED**: Use explicit try/require pattern, not a single ambiguous function.

**Rationale** (from user review):
> Do not pick a single behavior (null vs throw) for one function and force 30+ call sites to "remember the rule." Make the contract explicit in the API.

**Target**:
```typescript
/**
 * Pure query helper. Never throws.
 * Used when caller legitimately supports non-field types.
 */
export function tryGetManyInstance(t: CanonicalType): InstanceRef | null {
  const card = t.extent.cardinality;
  if (card.kind !== 'inst') return null;
  if (card.value.kind !== 'many') return null;
  return card.value.instance;
}

/**
 * Asserts field-ness. Throws with crisp error message.
 * Used when caller is only correct for fields.
 */
export function requireManyInstance(t: CanonicalType): InstanceRef {
  const inst = tryGetManyInstance(t);
  if (!inst) {
    throw new Error(
      `Expected field type (cardinality=many), got: ${JSON.stringify(t.extent.cardinality)}`
    );
  }
  return inst;
}
```

**Acceptance Criteria:**
- [ ] `tryGetManyInstance(t): InstanceRef | null` — pure query, never throws
- [ ] `requireManyInstance(t): InstanceRef` — asserts field-ness, throws on failure
- [ ] NO single `getManyInstance` function (avoid ambiguity)

---

### P6: Add Signal Type Helpers (try/require pattern)

**Confidence**: HIGH

Following the same try/require pattern for signals.

**Target**:
```typescript
/**
 * Check if type is a signal type. Never throws.
 */
export function isSignalType(t: CanonicalType): boolean {
  return deriveKind(t) === 'signal';
}

/**
 * Asserts signal-ness. Throws with crisp error message.
 * Used when caller is only correct for signals.
 */
export function requireSignalType(t: CanonicalType): void {
  const k = deriveKind(t);
  if (k !== 'signal') throw new Error(`Expected signal type, got ${k}`);
  const card = t.extent.cardinality;
  if (card.kind !== 'inst' || card.value.kind !== 'one') {
    throw new Error('Signal types must have cardinality=one (instantiated)');
  }
  const tempo = t.extent.temporality;
  if (tempo.kind !== 'inst' || tempo.value.kind !== 'continuous') {
    throw new Error('Signal types must have temporality=continuous (instantiated)');
  }
}
```

**Acceptance Criteria:**
- [ ] `isSignalType(t): boolean` — pure query, never throws
- [ ] `requireSignalType(t): void` — asserts signal-ness, throws on failure

---

### P7: Add Field Type Helpers (try/require pattern)

**Confidence**: HIGH

Following the same try/require pattern for fields.

**Target**:
```typescript
/**
 * Check if type is a field type. Never throws.
 */
export function isFieldType(t: CanonicalType): boolean {
  return deriveKind(t) === 'field';
}

/**
 * Asserts field-ness and returns InstanceRef. Throws with crisp error message.
 * Used when caller is only correct for fields.
 */
export function requireFieldType(t: CanonicalType): InstanceRef {
  const k = deriveKind(t);
  if (k !== 'field') throw new Error(`Expected field type, got ${k}`);
  const inst = tryGetManyInstance(t);
  if (!inst) throw new Error('Field types must have cardinality=many(instance) (instantiated)');
  const tempo = t.extent.temporality;
  if (tempo.kind !== 'inst' || tempo.value.kind !== 'continuous') {
    throw new Error('Field types must have temporality=continuous (instantiated)');
  }
  return inst;
}
```

**Acceptance Criteria:**
- [ ] `isFieldType(t): boolean` — pure query, never throws
- [ ] `requireFieldType(t): InstanceRef` — asserts field-ness, returns instance, throws on failure

---

### P8: Add Event Type Helpers (try/require pattern)

**Confidence**: HIGH

Following the same try/require pattern for events.

**Target**:
```typescript
/**
 * Check if type is an event type. Never throws.
 */
export function isEventType(t: CanonicalType): boolean {
  return deriveKind(t) === 'event';
}

/**
 * Asserts event-ness. Throws with crisp error message.
 * Used when caller is only correct for events.
 */
export function requireEventType(t: CanonicalType): void {
  const k = deriveKind(t);
  if (k !== 'event') throw new Error(`Expected event type, got ${k}`);
  if (t.payload.kind !== 'bool') throw new Error('Event payload must be bool');
  if (t.unit.kind !== 'none') throw new Error('Event unit must be none');
  const tempo = t.extent.temporality;
  if (tempo.kind !== 'inst' || tempo.value.kind !== 'discrete') {
    throw new Error('Event temporality must be discrete (instantiated)');
  }
}
```

**Acceptance Criteria:**
- [ ] `isEventType(t): boolean` — pure query, never throws
- [ ] `requireEventType(t): void` — asserts event-ness, throws on failure
- [ ] Checks payload=bool, unit=none, temporality=discrete

---

### P9: Add payloadStride Helper

**Confidence**: HIGH

**Target** (from spec lines 321-329):
```typescript
export function payloadStride(p: PayloadType): 1 | 2 | 3 | 4 {
  switch (p.kind) {
    case 'vec2': return 2;
    case 'vec3': return 3;
    case 'color': return 4;
    default: return 1;
  }
}
```

**Acceptance Criteria:**
- [ ] Computed from payload kind, NOT from embedded stride field
- [ ] Returns 1|2|3|4 based on kind

**Technical Notes:**
- The existing `strideOf()` reads embedded stride — keep it for now but add this pure version
- Eventually migrate to computed-only stride

---

## Dependencies

- **core-types** sprint must be complete (for `axisInst`, axis aliases, etc.)

## Risks

| Risk | Mitigation |
|------|------------|
| Naming conflicts with existing `signalType*` | Add new functions, deprecate old ones |
| Old code uses wrong constructors | Find/replace after this sprint |

---

## Files to Modify

- `src/core/canonical-types.ts` — Add all functions
