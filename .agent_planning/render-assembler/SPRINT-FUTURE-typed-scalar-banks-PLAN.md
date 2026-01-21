# Sprint: typed-scalar-banks - Separate Scalar Storage by Type
Generated: 2026-01-21T21:15:00Z
Confidence: LOW
Status: DEFERRED - EXPLORATION REQUIRED

## Sprint Goal
Implement typed scalar banks (f32/i32/shape2d) in RuntimeState for type-safe slot access.

## Current Understanding
Currently RuntimeState has a single f64 typed array for all scalars. The recommendation calls for:
- `scalarsF32`: Float32Array for float signals
- `scalarsI32`: Int32Array for integer/enum signals
- `scalarsShape2D`: Packed Uint32Array for shape descriptors

## Major Unknowns
1. **Slot allocation changes**: How does SlotMeta track storage kind?
   - Impact: Every slot read/write path changes
2. **Migration path**: How to transition existing programs?
   - Impact: Could break saved patches
3. **Performance tradeoffs**: Multiple banks vs single bank?
   - Impact: Cache locality, memory usage

## Exploration Options

### Option A: Separate Typed Arrays
| Aspect | Assessment |
|--------|------------|
| Complexity | High |
| Risk | Medium |
| Pros | Type safety, efficient packing |
| Cons | More complex slot management |

### Option B: Tagged Union in Single Array
| Aspect | Assessment |
|--------|------------|
| Complexity | Medium |
| Risk | Low |
| Pros | Simpler migration, single allocation |
| Cons | Wasted space, runtime type checks |

## Questions for User
1. Is type-safe slot access a priority now or can it wait?
2. Are there existing patches that would break with slot format changes?

## Exit Criteria (to reach MEDIUM confidence)
- [ ] Slot allocation strategy chosen
- [ ] Migration path defined
- [ ] Performance impact estimated

## Dependencies
Independent of Sprints 1-3.

## Rationale for Deferral
Current single-array approach works. Prioritize visible architectural improvements (RenderAssembler) before internal optimizations.
