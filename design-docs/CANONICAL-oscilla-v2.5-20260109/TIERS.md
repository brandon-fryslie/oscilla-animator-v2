---
parent: INDEX.md
purpose: Define the three-tier organization system for canonical specification content
---

# Three-Tier Organization System

This canonical specification organizes content by answering: **"How expensive would this be to change?"**

The tier system enables:
- **Proper contradiction analysis** - severity depends on which tier is contradicted
- **Agent filtering** - load T1 always, T2 for context, T3 on-demand
- **Clear conflict resolution** - lower tier number wins
- **Architectural stability** - foundational content is protected from churn

---

## The Three Tiers

| Tier | Directory | Meaning | Change Policy |
|------|-----------|---------|---------------|
| **1_foundational** | `*/t1_*.md` | Cannot change. Would make this a different application. | Changes require extraordinary justification and likely indicate a fundamental pivot |
| **2_structural** | `*/t2_*.md` | Can change, but it's work. Affects many other things. | Changes require careful evaluation of costs, benefits, and cascading impacts |
| **3_optional** | `*/t3_*.md` | Can change with clear justification - flexible but deliberate. When there is a clear benefit they should be changed, otherwise stable. | Changes require sound reasoning and demonstrated benefit, not arbitrary preference |

---

## Tier 1: Foundational

**What belongs here:**
- Core invariants that define what this system IS
- Fundamental principles that, if changed, would make this a different application
- Non-negotiable rules that all other architecture depends on

**Examples:**
- Five-axis type system (PayloadType, Extent, CanonicalType)
- Core graph topology rules (multi-in/multi-out, no cycles)
- Time system fundamentals (single TimeRoot, rails)
- Identity principles (what makes Oscilla unique)

**Change threshold:** Extraordinarily high. Changing T1 content means the application has fundamentally pivoted.

**Contradiction severity:** CRITICAL - new sources contradicting T1 are almost always wrong or misaligned with project goals.

---

## Tier 2: Structural

**What belongs here:**
- Architectural decisions that shape the system
- Major design patterns that multiple components depend on
- Core data structures and contracts
- Compilation/runtime architecture

**Examples:**
- BlockRole discriminated union architecture
- Compilation pipeline stages
- Runtime state slot allocation strategy
- Event system architecture
- Diagnostic attribution model

**Change threshold:** High. Changes are possible but require:
- Clear articulation of benefits
- Analysis of cascading impacts
- Understanding of what breaks and needs updating
- Explicit approval

**Contradiction severity:** HIGH - requires careful evaluation. New source might be right, but costs must be weighed.

---

## Tier 3: Optional

**What belongs here:**
- Implementation details and patterns
- UI specifications and interaction models
- Code examples and usage patterns
- Specific diagnostic rules or thresholds
- Detailed error messages and suggestions

**Examples:**
- Debug UI layout (probe card sections)
- Graph editor interaction patterns
- Specific diagnostic rule thresholds
- Example code snippets
- Render batching strategies

**Change threshold:** Moderate. Changes require:
- Clear justification (not arbitrary preference)
- Demonstrated benefit (performance, usability, clarity)
- Sound reasoning (not just "I like this better")
- Stability by default (don't churn without cause)

**Contradiction severity:** NORMAL - evaluate whether new approach has clear benefit. Pick what works better with reasoned justification.

---

## Conflict Resolution

**Lower tier number wins.**

If content in `t3_*.md` conflicts with `t1_*.md`, the T1 (foundational) tier wins. No exceptions.

If new source material conflicts with existing canonical:
- **vs T1**: Almost always keep canonical (source likely misaligned)
- **vs T2**: Carefully evaluate (change is costly but possible)
- **vs T3**: Assess benefit (pick what works better with justification)

---

## Agent Reading Pattern

**Always read**: All `t1_*.md` files (small, critical, foundational)

**Usually read**: All `t2_*.md` files (core architecture context)

**Consult as needed**: Specific `t3_*.md` files (reference material)

This pattern ensures agents always have foundational context while avoiding overwhelming them with optional details.

---

## Not Everything Needs All Tiers

Topics may have content at only one or two tiers. For example:

- **Principles** topic might be pure T1 (what makes Oscilla unique)
- **Type System** might have T1 (5-axis model) and T2 (unification rules) but no T3
- **Debug UI** might be pure T3 (all implementation details)

The tier structure serves the content, not the other way around.

---

## Examples of Tier Classification

### Type System
- **T1**: Five-axis model (PayloadType, Extent, CanonicalType), AxisTag pattern
- **T2**: Type unification rules, domain resource model
- **T3**: Specific axis combinations, example type signatures

### Block System
- **T1**: Multi-in/multi-out topology, no cycles invariant
- **T2**: BlockRole discriminated union, DerivedBlockMeta architecture
- **T3**: Specific block implementations (UnitDelay, Phasor, etc.)

### Debug UI
- **T1**: None (UI is not foundational)
- **T2**: None (UI patterns don't affect core architecture)
- **T3**: Probe mode behavior, card layout, interaction patterns

---

## Benefits of This Organization

1. **Clear severity mapping**: Contradictions against different tiers have different implications
2. **Efficient agent loading**: Load only what's needed for the task
3. **Protected foundations**: T1 content is shielded from churn
4. **Flexible details**: T3 content can evolve with good reason
5. **Explicit architecture**: T2 content documents major design decisions
6. **Simple conflict resolution**: Lower tier number always wins

---

## Related Documents

- [INDEX.md](./INDEX.md) - Master navigation
- [INVARIANTS.md](./INVARIANTS.md) - Non-negotiable rules (mostly T1 content)
- [GLOSSARY.md](./GLOSSARY.md) - Term definitions (cross-tier)
- [RESOLUTION-LOG.md](./RESOLUTION-LOG.md) - Decision history with tier context
