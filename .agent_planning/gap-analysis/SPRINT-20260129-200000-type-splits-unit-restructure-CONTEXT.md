# Implementation Context: Sprint type-splits-unit-restructure

## File Map

| Item | Primary File | Lines | Secondary Files |
|------|-------------|-------|-----------------|
| #16 InferencePayloadType | `src/core/canonical-types.ts` | PayloadType definition | type solver files, `src/types/index.ts` |
| #18 UnitType restructure | `src/core/canonical-types.ts` | 44-76, 91-148 | 57+ consumer files |
| #19 deg/degrees | `src/core/canonical-types.ts` | 49-51 | all `'deg'` usages |

## Execution Order

1. **#16** InferencePayloadType split — cleaner to do before UnitType restructure
2. **#18** UnitType restructure — large migration, then immediately:
3. **#19** deg/degrees collapse — part of #18

## UnitType Migration Strategy

**Current (flat):**
```typescript
type UnitKind = 'none' | 'scalar' | 'norm01' | 'count' | 'radians' | 'degrees' | 'deg' | 'phase01' | 'ms' | 'seconds' | 'ndc2' | 'ndc3' | 'world2' | 'world3' | 'view3' | 'rgba01'
```

**Target (structured):**
```typescript
type UnitType =
  | { kind: 'none' }
  | { kind: 'scalar' }
  | { kind: 'norm01' }
  | { kind: 'count' }
  | { kind: 'angle'; unit: 'radians' | 'degrees' | 'phase01' }
  | { kind: 'time'; unit: 'ms' | 'seconds' }
  | { kind: 'space'; space: 'ndc' | 'world' | 'view'; dims: 2 | 3 }
  | { kind: 'color'; space: 'rgba01' }
```

**Migration steps:**
1. Redefine UnitType
2. Update all constructors (unitRadians → `{ kind: 'angle', unit: 'radians' }`)
3. Update `unitsEqual()` for deep comparison
4. Update ALLOWED_UNITS map
5. Update adapter rules (structured matching)
6. Grep and fix all `unit.kind === '...'` checks in 57+ files
7. Run full test suite

## Key Consumer Patterns to Update

- `unit.kind === 'radians'` → `unit.kind === 'angle' && unit.unit === 'radians'`
- `unit.kind === 'ndc2'` → `unit.kind === 'space' && unit.space === 'ndc' && unit.dims === 2`
- Adapter rules: pattern matching on unit kinds → structured patterns
- ALLOWED_UNITS: keyed by flat kind → keyed by structured kind

## Research Needed

1. **Full consumer file list**: `grep -rn '\.kind.*=.*\(radians\|degrees\|deg\|phase01\|ms\|seconds\|ndc\|world\|view\|rgba01\)' src/`
2. **Payload var audit**: Where does `{ kind: 'var', var: PayloadVarId }` appear in the type solver?
3. **Inference type location decision**: Same file or separate module?
