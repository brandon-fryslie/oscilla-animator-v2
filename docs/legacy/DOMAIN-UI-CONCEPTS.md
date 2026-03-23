# Domain UI Concepts

**Related to:** `WHAT-IS-A-DOMAIN.md` Part 3.9

This document captures UI/UX ideas for making domains invisible to users while still providing the benefits of domain-aware tooling.

---

## Core Principle: Users See Things, Not Types

Users never see the word "domain." They see:
- Circles, rectangles, shapes
- Particles
- Controls, sliders, knobs
- Events, triggers

The system uses domain information internally to provide intelligent behavior.

---

## Visual Domain Indicators

### Wire Colors

Each domain type has a distinct wire color:

| Domain Type | Wire Color | Rationale |
|-------------|------------|-----------|
| `shape` | Blue (#4A90D9) | Geometric, spatial |
| `circle` | Blue (inherited) | Subtype of shape |
| `rectangle` | Blue (inherited) | Subtype of shape |
| `control` | Green (#4CAF50) | Parameters, values |
| `event` | Orange (#FF9800) | Discrete, temporal |
| `audio` | Purple (#9C27B0) | Sound, frequency |
| `particle` | Cyan (#00BCD4) | Simulation, physics |

Wires are colored based on the domain type of the field flowing through them. Signal wires (cardinality: one) use a neutral gray.

### Block Header Tint

Instance blocks have a subtle header tint matching their domain color:

```
┌─────────────────────────────┐
│ ●  Circles                  │  ← Blue tint
├─────────────────────────────┤
│ count: [100]                │
│ layout: ○                   │
├─────────────────────────────┤
│              position ○─────│
│                radius ○─────│
└─────────────────────────────┘
```

### Small Domain Badge

Optionally, a small icon badge on blocks indicates their primary domain:

- ◯ for shape/circle
- ◻ for rectangle
- ◈ for control
- ⚡ for event

---

## Context-Aware Block Palette

When the user has selected a wire or is in the context of a specific domain, the block palette adapts:

### Scenario: User has selected a shape wire

**Highlighted sections:**
- Transform: Translate, Rotate, Scale, Skew
- Geometry: Distance, Bounds, Area
- Boolean: Union, Difference, Intersection
- Convert: Shape → Control

**Grayed/hidden sections:**
- Audio: Filter, Envelope, FFT
- Text: Kern, Style

### Scenario: User is connecting from a shape output

When dragging a wire from a shape output, potential targets show compatibility:

- **Green highlight**: Compatible (same domain or valid subtype)
- **Yellow highlight**: Requires conversion (but converter exists)
- **Red X**: Incompatible (no valid connection)

---

## Connection Behavior

### Same Domain: Direct Connect

When connecting fields of the same domain/instance, connection just works.

### Different Instance, Same Domain Type

When connecting fields from different instances of the same domain type:

```
┌─────────────────────────────────────────┐
│ These are different collections.        │
│                                         │
│ 'foreground circles' (50 elements)      │
│ 'background circles' (200 elements)     │
│                                         │
│ Would you like to:                      │
│  ○ Zip (element-wise, truncate longer)  │
│  ○ Broadcast (repeat shorter)           │
│  ○ Cancel                               │
└─────────────────────────────────────────┘
```

### Different Domain Type

When connecting incompatible domain types:

```
┌─────────────────────────────────────────┐
│ Can't connect directly.                 │
│                                         │
│ 'audio frequency' → 'circle radius'     │
│                                         │
│ Would you like to:                      │
│  ○ Add 'Audio → Control' converter      │
│  ○ Cancel                               │
└─────────────────────────────────────────┘
```

The system knows which conversions are valid and offers them.

---

## Instance Block Design

### Compact Mode (Default)

Shows essential intrinsics only:

```
┌─────────────────────────────┐
│ ●  Circles            [100] │
├─────────────────────────────┤
│              position ○─────│
│                 index ○─────│
│                     t ○─────│
└─────────────────────────────┘
```

### Expanded Mode

Click to expand and see all intrinsics:

```
┌─────────────────────────────┐
│ ●  Circles            [100] │
├─────────────────────────────┤
│              position ○─────│
│                 index ○─────│
│                     t ○─────│
├─ ▼ Circle Properties ───────┤
│                radius ○─────│
│                center ○─────│
│                  area ○─────│
│                bounds ○─────│
└─────────────────────────────┘
```

### Configuration Panel

Double-click to open configuration:

```
┌─────────────────────────────────────────┐
│ Circles Configuration                   │
├─────────────────────────────────────────┤
│ Count:  [100    ] ○ Animate             │
│                                         │
│ Layout: ● Grid                          │
│         ○ Circle                        │
│         ○ Random                        │
│         ○ Along Path                    │
│         ○ Custom                        │
│                                         │
│ Grid Settings:                          │
│   Rows: [10  ]  Cols: [10  ]            │
│   Spacing: [1.0  ]                      │
│                                         │
│ [Apply]                   [Cancel]      │
└─────────────────────────────────────────┘
```

---

## Layout Blocks as Visual Patterns

Layout blocks could display a small preview of the arrangement:

```
┌──────────────────┐
│   Grid Layout    │
├──────────────────┤
│  · · · ·         │  ← Visual preview
│  · · · ·         │
│  · · · ·         │
├──────────────────┤
│ rows: [4 ]       │
│ cols: [4 ]       │
├──────────────────┤
│      layout ○────│
└──────────────────┘
```

```
┌──────────────────┐
│  Circle Layout   │
├──────────────────┤
│    ·   ·         │  ← Visual preview
│  ·       ·       │
│  ·       ·       │
│    ·   ·         │
├──────────────────┤
│ radius: [100]    │
├──────────────────┤
│      layout ○────│
└──────────────────┘
```

---

## Error Messages

### Domain Mismatch Error

Instead of:
> Type error: Field<vec2, circle, inst_1> incompatible with Field<vec2, audio, inst_2>

Show:
> **Can't connect these**
>
> Circle positions can't connect directly to audio filter.
>
> **Suggestion:** Add an envelope follower to convert audio to control values.

### Instance Mismatch Error

Instead of:
> Instance mismatch: inst_1 vs inst_2

Show:
> **Different collections**
>
> "Foreground circles" has 50 elements
> "Background circles" has 200 elements
>
> These need to be combined explicitly. Try a Zip or Broadcast block.

---

## Intrinsic Autocomplete

When typing in an expression field, autocomplete shows available intrinsics based on context:

```
┌────────────────────────────────────────┐
│ offset: [position * 0.1|              │
│         ┌────────────────────────┐    │
│         │ position   vec2        │    │
│         │ radius     float       │    │
│         │ index      int         │    │
│         │ t          float [0,1] │    │
│         │ area       float       │    │
│         │ bounds     rect        │    │
│         └────────────────────────┘    │
└────────────────────────────────────────┘
```

The autocomplete knows which intrinsics are available because it knows the domain type from context.

---

## Visual Hierarchy

### Domain as Background Context

The graph canvas could have subtle zones or regions colored by domain:

```
┌───────────────────────────────────────────────────┐
│ ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ │
│ ░░ [Circles] ──▶ [Translate] ──▶ [Scale] ░░░░░░░ │  ← Blue zone
│ ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ │
│                        │                          │
│                        ▼                          │
│ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ │
│ ▓▓ [Audio In] ──▶ [Envelope] ──▶ [Remap] ▓▓▓▓▓▓ │  ← Purple zone
│ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ │
│                        │                          │
│                        ▼                          │
│ ░░░░░░░░░░░░░░░░░ [Render] ░░░░░░░░░░░░░░░░░░░░░ │  ← Blue (shape rendering)
│ ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ │
└───────────────────────────────────────────────────┘
```

This is very subtle — just enough to help users see the "flow" of data types through the graph.

---

## Progressive Disclosure

Users can operate at different levels of domain awareness:

### Level 1: Just Works

User places blocks, connects them. System handles domain matching automatically. Errors are rare because the UI prevents invalid connections.

### Level 2: Color Awareness

User notices that "blue wires connect to blue inputs" and "orange wires are events." They use this intuitively without understanding the formal model.

### Level 3: Domain Vocabulary

Power user understands that "shapes" and "controls" are different categories with different operations. They can troubleshoot domain mismatches using error messages.

### Level 4: Full Model

Advanced user understands domains, instances, intrinsics. They can create custom domain types (future feature) and reason about the type system.

Most users should never need to go past Level 2.

---

## Non-Goals

Things the UI should NOT do:

- **Expose "domain" as a term** — Use concrete nouns (shapes, controls, events)
- **Require domain selection** — Infer from context wherever possible
- **Show type signatures** — No `Field<vec2, circle, inst_1>` in the UI
- **Block invalid connections silently** — Explain why and suggest fixes
- **Use technical jargon in errors** — "Can't connect these" not "Type mismatch"

---

## Implementation Priority

For MVP:

1. Wire colors by domain type
2. Connection validation with user-friendly errors
3. Conversion suggestions

For v1.0:

4. Block palette filtering
5. Instance block collapsible sections
6. Intrinsic autocomplete

For future:

7. Canvas zones
8. Layout block previews
9. Visual domain debugging tools
