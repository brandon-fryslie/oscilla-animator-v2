# Research: Domain Editor UI Design for Oscilla

**Status**: RESEARCH COMPLETE - DECISION READY
**Date**: 2026-01-09
**Scope**: UI/UX patterns and implementation approaches for domain creation

## Question

**What UX patterns and implementation approaches should the domain editor UI use to make domain creation intuitive and efficient?**

---

## Context

### Current Architecture

**From Oscilla Specification:**
- Domains are **compile-time resources**, not wire values
- Referenced in type system's Cardinality axis: `{ kind: 'many'; domain: DomainRef }`
- Parameters stored in `block.params`, consumed by `lower()` function during compilation
- Block role system: user blocks vs derived blocks with explicit metadata

**Current Domain Types:**
```
GridDomain:
  - Parameters: rows, cols
  - Outputs: domain, pos (vec2), index, normIndex, rand

DomainN:
  - Parameters: n (count), seed (determinism)
  - Outputs: domain, index, normIndex, rand
```

---

## Research Findings

### Industry Patterns

| Tool | Pattern | Approach |
|------|---------|----------|
| TouchDesigner | Property panel | Parameters as custom attributes on Component nodes |
| Houdini | Property panel | Node parameters in dockable panel |
| Cables.gl | "Manage Op" tab | Real-time parameter updates |
| Nuke | Property panel | Control-specific UI (sliders, pickers) |
| p5.js | Code-driven | No UI; arrays via code |

**Key Finding**: Professional tools converge on **property panel pattern** with:
- Parameter controls appropriate to type (slider for numeric, picker for color)
- Quick presets as supplementary
- Real-time feedback

---

## Options Evaluated

### Option A: Parameter Panel + Presets (Recommended)
Standard property panel with type-appropriate controls and quick preset buttons.

```
Property Panel (GridDomain Selected):
├─ Rows: [1][4][8]◄─────●─────►[1024] (slider + input)
├─ Cols: [1][4][8]◄─────●─────►[1024] (slider + input)
├─ Quick Presets: [2×2] [4×4] [8×8] [16×16] [32×32]
├─ Info: "8×8 = 64 elements"
└─ [Advanced ▸]
```

### Option B: Presets Only
Select from predefined presets; custom values via JSON editor.

### Option C: Code/JSON Editor Modal
Right-click → "Edit Config" opens JSON editor.

### Option D: Dedicated Domain Palette
Left sidebar with domain library and presets.

### Option E: Visual Domain Wizard
Multi-step guided wizard with visualizations.

---

## Comparison Matrix

| Dimension | A | B | C | D | E |
|-----------|---|---|---|---|---|
| Complexity | Medium | Low | High | High | Very High |
| Consistency | High | Low | Low | Low | Low |
| Flexibility | High | Low | Very High | Medium | Medium |
| Risk | Low | Medium | High | Medium | Very High |
| Matches Industry | Yes | Somewhat | No | No | Somewhat |

---

## Recommendation

**Option A: Parameter Panel with Inline Controls + Quick Presets**

### Rationale

1. **Consistency**: Every block shows parameters in property panel. Single mental model.
2. **Industry Standard**: Matches Houdini, Nuke, Cables.gl.
3. **Low Barrier**: Parameters visible immediately; no modal switching.
4. **Flexible**: Presets for quick selection + manual control for custom.
5. **Scales Well**: Adding domain types requires only metadata, not UI changes.
6. **Low Risk**: Proven pattern, well-understood.

### Implementation Path

**Phase 2A: Core Infrastructure** (2-3 days)
- PropertyPanel component (generic, reusable)
- Parameter metadata system
- Update flow: patch → recompile → UI refresh

**Phase 2B: Domain-Specific UI** (1-2 days)
- GridDomain metadata + presets
- DomainN metadata + presets
- Property panel integration

**Phase 2C: Enhancement** (1 day, optional)
- Live preview (grid visualization)
- Memory/element counter
- Validation (warn if unusually large)

**Total Effort**: 4-6 days, reusable for all future blocks

---

## Dependencies

- Requires Phase 2 UI work (patch-editor-ui)
- Property panel component needed for all blocks (shared infrastructure)
- Phase 1 must be complete (domain compilation works)

---

## Conditions for Reconsideration

- Domain types become significantly more complex (procedural with code entry)
- Live visualization becomes critical (3D spatial domains)
- User research shows preference for different pattern

---

## Out of Scope (Design Later)

1. Which exact presets? (2×2, 4×4, 8×8? Or 50/500/5000?)
2. Can users save custom presets?
3. Performance UX for large domains
4. Domain naming/labeling
5. Preview visualization (always-on vs on-demand)

---

## Decision

**STATUS: RESEARCH COMPLETE, PLANNING DEFERRED**

This is a Phase 2 topic. Implementation deferred until Phase 1 is complete.

**Next Steps When Ready:**
1. Create sprint plan with Option A approach
2. Build PropertyPanel component (shared infrastructure)
3. Add domain-specific metadata and presets
