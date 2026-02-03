# User Response: effects-as-data Sprint
Date: 2026-02-03

## Decision: PARTIAL APPROVAL

### Approved
- WI-1: LowerEffects type + updated LowerResult
- WI-2: Symbolic state keys in IR (StateReadExpr uses StableStateId)
- WI-3: Migrate all 6 stateful blocks to effects-as-data
- WI-4: Post-lowering binding pass (resolveEffects)
- WI-5: Migrate pure blocks (Add, HueRainbow, DefaultSource)

### Deferred
- WI-6: Remove legacy imperative path from orchestrator (MEDIUM confidence, unknowns about Array/render blocks)

### Key Architectural Decisions
- Symbolic state keys: StableStateId in IR, binding pass resolves to physical StateSlotId
- Real IRBuilder passed to blocks (no runtime sandboxing)
- PureIRBuilder enforcement via ESLint if needed
- Stateful blocks migrated first (harder proof), pure blocks follow
