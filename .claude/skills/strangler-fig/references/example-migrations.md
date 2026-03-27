# Example Migrations

Three completed migrations demonstrating the gate-driven state machine at different seam types.

---

## 1. Payload/Unit Solver Replacement (Compiler Pass)

**Seam:** Type solving within the fixpoint loop.
**Old:** `src/compiler/frontend/solve-payload-unit.ts`
**New:** `src/compiler/frontend/payload-unit/solve.ts`
**Seam file:** `src/compiler/frontend/index.ts`

### State 0: SCAFFOLD

Created `src/compiler/frontend/payload-unit/` with stub `solve.ts`:
```typescript
export function solve(constraints: ExtractedConstraints): PayloadUnitSolution {
  throw new Error('not yet implemented');
}
```

Isolation test:
```typescript
// src/compiler/frontend/__tests__/migration-isolation.test.ts
describe('migration isolation', () => {
  it('payload-unit/ does not import solve-payload-unit', async () => {
    const hits = await grepSourceFiles(
      'src/compiler/frontend/payload-unit/',
      /from\s+['"].*solve-payload-unit/
    );
    expect(hits).toHaveLength(0);
  });
  it('solve-payload-unit does not import payload-unit/', async () => {
    const hits = await grepSourceFiles(
      'src/compiler/frontend/',
      /from\s+['"].*payload-unit\/solve/
    );
    const oldHits = hits.filter(f => f.includes('solve-payload-unit'));
    expect(oldHits).toHaveLength(0);
  });
});
```

Gate passed trivially — new module has no imports.

### State 1: CONTRACT

Contract tests against the seam (`compileFrontend`):
```typescript
// src/compiler/frontend/__tests__/migration-contract.test.ts
import { compileFrontend } from '../index';

describe('type solver contract', () => {
  it('resolves payload for all typed ports', () => {
    const result = compileFrontend(fixtureWithMathChain);
    for (const [, type] of result.typedPatch.portTypes) {
      expect(type.payload.kind).not.toBe('var');
    }
  });

  it('resolves units for all typed ports', () => {
    const result = compileFrontend(fixtureWithUnitPreserving);
    for (const [, type] of result.typedPatch.portTypes) {
      expect(type.unit.kind).not.toBe('var');
    }
  });

  it('reports UnitlessMismatch for incompatible units', () => {
    const result = compileFrontend(fixtureWithUnitConflict);
    expect(result.errors.some(e => e.kind === 'UnitlessMismatch')).toBe(true);
  });

  it('is deterministic across calls', () => {
    const a = compileFrontend(fixtureWithMathChain);
    const b = compileFrontend(fixtureWithMathChain);
    expect(a.typedPatch.portTypes).toEqual(b.typedPatch.portTypes);
  });
});
```

Passed against old solver.

### State 2: BUILD

Implemented constraint-based solver in `payload-unit/solve.ts` with `ConstraintOrigin` tracking. Isolation test caught an early attempt to import a helper from the old solver — fixed by extracting the helper to a shared utils file.

Equivalence tests:
```typescript
// src/compiler/frontend/__tests__/migration-equivalence.test.ts
import { solve as oldSolve } from '../solve-payload-unit';
import { solve as newSolve } from '../payload-unit/solve';

for (const fixture of [minimal, mathChain, unitPreserving, polymorphic, unitConflict]) {
  it(`matches old output: ${fixture.name}`, () => {
    expect(newSolve(fixture.constraints)).toEqual(oldSolve(fixture.constraints));
  });
}
```

All passed. Isolation test still green.

### State 3: FLIP

One-line change in `src/compiler/frontend/index.ts`:
```typescript
// was: import { solve } from './solve-payload-unit';
import { solve } from './payload-unit/solve';
```

Contract tests passed unchanged.

### State 4: CLEAN

1. Deleted `solve-payload-unit.ts`
2. Deleted `migration-equivalence.test.ts`
3. Deleted `migration-isolation.test.ts`
4. Wrote remnant tests — structural, not grep-based:

```typescript
// src/compiler/frontend/__tests__/migration-no-remnants.test.ts
describe('solve-payload-unit is structurally gone', () => {
  it('old file does not exist on disk', () => {
    expect(existsSync(resolve(__dirname, '../solve-payload-unit.ts'))).toBe(false);
  });
  it('old module is not resolvable', () => {
    expect(() => require.resolve('../solve-payload-unit')).toThrow();
  });
  it('old file not in seam import graph', () => {
    const deps = getTransitiveDeps('src/compiler/frontend/index.ts');
    expect(deps.has(resolve(__dirname, '../solve-payload-unit.ts'))).toBe(false);
  });
  it('old export marker absent from build', async () => {
    const build = await readFile('dist/index.js', 'utf-8');
    expect(build).not.toContain('__SOLVE_PAYLOAD_UNIT_V1');
  });
});
```

The `__SOLVE_PAYLOAD_UNIT_V1` marker was added to the old module at state 0 (per the test plan) specifically so the build output check has something concrete to assert on.

Full suite green. Visual validation confirmed no rendering changes.

---

## 2. Layout Block Replacement (Block Registry)

**Seam:** Block registry (`defineBlock()` calls).
**Old:** `src/blocks/layout/CircleLayoutUV.ts`, `GridLayoutUV.ts`, `SpiralLayout.ts`
**New:** `src/blocks/layout/ScatterUV.ts`, `SamplePath.ts`
**Seam file:** `src/blocks/registry.ts` (via automatic registration)

### State 0: SCAFFOLD

Created `ScatterUV.ts` and `SamplePath.ts` with stub `defineBlock()` calls that register block types but throw in `lower()`.

Isolation test:
```typescript
// src/blocks/layout/__tests__/migration-isolation.test.ts
describe('layout migration isolation', () => {
  it('ScatterUV does not import old layout blocks', async () => {
    const hits = await grepSourceFiles(
      'src/blocks/layout/ScatterUV.ts',
      /from\s+['"]\.\/(Circle|Grid|Spiral)Layout/
    );
    expect(hits).toHaveLength(0);
  });
  it('SamplePath does not import old layout blocks', async () => {
    const hits = await grepSourceFiles(
      'src/blocks/layout/SamplePath.ts',
      /from\s+['"]\.\/(Circle|Grid|Spiral)Layout/
    );
    expect(hits).toHaveLength(0);
  });
});
```

### State 1: CONTRACT

Contract tests asserting what any layout block must produce — position arrays with correct cardinality:
```typescript
// src/blocks/layout/__tests__/migration-contract.test.ts
describe('layout block contract', () => {
  it('produces position output with many(instance) cardinality', () => {
    const result = compileAndRun(patchWithLayoutBlock);
    const posType = getOutputType(result, 'position');
    expect(isMany(posType.extent.cardinality)).toBe(true);
  });

  it('position array length matches instance count', () => {
    const result = compileAndRun(patchWith8Instances);
    const positions = getOutputValues(result, 'position');
    expect(positions.length).toBe(8);
  });
});
```

### State 2: BUILD

Implemented ScatterUV and SamplePath as pure math blocks — no shape threading, just rank/index to UV mapping.

Equivalence tests compared old CircleLayoutUV output against new ScatterUV with equivalent parameters. Grid and Spiral tested similarly. All matched within floating-point tolerance.

### State 3: FLIP

Updated demo patches to use new blocks. Removed old block registrations from their respective files. (For registry-seam migrations, the "flip" is updating the consumers — demo patches and any test fixtures — rather than a single import line.)

Contract tests passed.

### State 4: CLEAN

1. Deleted `CircleLayoutUV.ts`, `GridLayoutUV.ts`, `SpiralLayout.ts`
2. Deleted equivalence and isolation tests
3. Wrote structural remnant tests:

```typescript
// src/blocks/layout/__tests__/migration-no-remnants.test.ts
describe('old layout blocks are structurally gone', () => {
  const oldBlocks = ['CircleLayoutUV', 'GridLayoutUV', 'SpiralLayout'];

  for (const old of oldBlocks) {
    it(`${old}.ts does not exist on disk`, () => {
      expect(existsSync(resolve(__dirname, `../${old}.ts`))).toBe(false);
    });
    it(`${old} is not resolvable`, () => {
      expect(() => require.resolve(`../${old}`)).toThrow();
    });
  }

  // For block registry migrations, the structural check is: query the
  // registry at runtime and assert old block types are not registered.
  // This is unfakeable — the block either registers or it doesn't.
  it('old block types not in registry', () => {
    for (const old of oldBlocks) {
      expect(getBlockDef(old)).toBeUndefined();
    });
  }
});
```

Visual validation with burst montage confirmed identical rendering with new blocks.

---

## 3. Continuity Pipeline Extraction (Backend Pass)

**Seam:** Between block lowering (pass 6) and scheduling (pass 7).
**Old:** Shadow slot allocator embedded in `src/compiler/backend/schedule-program.ts`
**New:** `src/compiler/backend/continuity-pipeline.ts`
**Seam file:** `src/compiler/backend/index.ts`

### State 0: SCAFFOLD

Created `continuity-pipeline.ts` with stub `allocateContinuityPipeline()` that throws.

Isolation test:
```typescript
// src/compiler/backend/__tests__/migration-isolation.test.ts
describe('continuity pipeline isolation', () => {
  it('continuity-pipeline does not import schedule-program internals', async () => {
    const hits = await grepSourceFiles(
      'src/compiler/backend/continuity-pipeline.ts',
      /from\s+['"].*schedule-program/
    );
    expect(hits).toHaveLength(0);
  });
});
```

This migration was harder because the old code wasn't a clean module — the shadow allocator was interleaved with scheduling logic in `schedule-program.ts`. The isolation test ensured the new module was built from scratch using only the types and builder API, not by importing pieces of the old code.

### State 1: CONTRACT

Contract tests asserting the output invariants of slot allocation:
```typescript
// src/compiler/backend/__tests__/migration-contract.test.ts
describe('slot allocation contract', () => {
  it('every continuity slot has a type descriptor', () => {
    const program = compileFixture(feedbackPatch);
    for (const slot of program.arena) {
      expect(slot.type).toBeDefined();
    }
  });

  it('field slots use object storage', () => {
    const program = compileFixture(fieldPatch);
    const fieldSlots = program.arena.filter(s => isMany(s.type.extent.cardinality));
    for (const slot of fieldSlots) {
      expect(slot.storageClass).toBe('object');
    }
  });

  it('renderFrameSlot is allocated through builder', () => {
    const program = compileFixture(renderPatch);
    expect(program.renderFrameSlot).toBeLessThan(program.arena.length);
  });
});
```

### State 2: BUILD

Implemented `allocateContinuityPipeline()` — all slots allocated through `builder.allocTypedSlot()`, storage class derived from `type.extent.cardinality`.

Equivalence tests compared slot allocation output between old (schedule-program with shadow allocator) and new (standalone pipeline). Matched exactly.

### State 3: FLIP

Wired `allocateContinuityPipeline()` into `backend/index.ts` between pass 6 and pass 7. Removed shadow allocation logic from `schedule-program.ts`.

Contract tests passed unchanged.

### State 4: CLEAN

1. Removed shadow allocator code from `schedule-program.ts` (not a file delete — the file stays, the interleaved allocation logic was extracted)
2. Deleted `fieldSlotSet` and `objectSlots` tracking sets
3. Deleted the slotMeta scanning hack in `compile.ts`
4. Deleted equivalence and isolation tests
5. Wrote structural remnant tests:

```typescript
// src/compiler/backend/__tests__/migration-no-remnants.test.ts
describe('shadow allocator is structurally gone', () => {
  // For extraction migrations (code removed from a file that stays),
  // the structural check is: compile a fixture and verify the output
  // properties that would only be true if allocation goes through the
  // new pipeline. The old shadow allocator produced slots ABOVE the
  // builder's slot count — the new pipeline doesn't.
  it('all slots are within builder arena bounds', () => {
    const program = compileFixture(feedbackPatch);
    for (const step of program.schedule.steps) {
      for (const slotRef of step.slotRefs) {
        expect(slotRef).toBeLessThan(program.arena.length);
      }
    }
  });

  it('every slot has a type descriptor (no shadow allocations)', () => {
    const program = compileFixture(feedbackPatch);
    for (let i = 0; i < program.arena.length; i++) {
      expect(program.arena[i].type).toBeDefined();
    }
  });

  it('old export marker absent from build', async () => {
    const build = await readFile('dist/index.js', 'utf-8');
    expect(build).not.toContain('__SHADOW_SLOT_ALLOCATOR_V1');
  });
});
```

The behavioral checks (slots within bounds, every slot typed) are unfakeable — they assert on properties of the compiled output that the old shadow allocator could not produce. An agent can rename anything it wants, but it can't make the old allocator produce typed slots.

Visual validation confirmed no rendering changes. Full suite green.

---

## Patterns Across All Three

1. **Isolation test written first** — caught accidental coupling in every case
2. **Contract tests import from the seam** — never from the implementation file
3. **Equivalence tests are temporary** — deleted when old code is removed
4. **Remnant tests are structural, not string-based** — file existence, module resolution, import graph walks, build output markers, and behavioral assertions on compiled output. No grep for names — names can be changed, structural properties cannot.
5. **Export markers added at state 0** — a unique `__brand` constant in the old module, declared in the test plan, gives the build output check something concrete to assert on
6. **The flip is one change** — one import rewiring or one registration swap
7. **State was always derivable** — running the gate tests at any point told the agent exactly what to do next
