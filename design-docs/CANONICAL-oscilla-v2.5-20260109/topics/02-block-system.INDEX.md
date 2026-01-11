---
indexed: true
source: ./02-block-system.md
source_hash: d2e3c5a8f7b4
source_mtime: 2026-01-09T00:00:00Z
original_tokens: ~655
index_tokens: ~130
compression: 80%
index_version: 1.0
---

# Index: Block System (02-block-system.md)

## Key Assertions
- Everything is a block or wire at compile time [L19]
- Blocks are the only compute units; buses/defaults/lenses are derived blocks [L9]
- Roles exist for the editor, not the compiler [L153]
- User entities are the source of truth for undo/redo/persistence [L194]
- Compiler ignores roles; only sees (blocks, edges) [L155-169]

## Definitions
- **Block** (5 fields): id, kind, role, inputs, outputs [L30-36]
- **BlockRole**: `{kind: "user"} | {kind: "derived"; meta: DerivedBlockMeta}` [L63-65]
- **DerivedBlockMeta** (5 variants): defaultSource, wireState, bus, rail, lens [L86-91]
- **PortBinding** (4 fields): id, dir, type, combine [L48-53]
- **EdgeRole** (4 variants): user, default, busTap, auto [L111-115]
- **CombineMode** (3 families): numeric (sum/avg/min/max/mul), any (last/first/layer), bool (or/and) [L265-268]
- **Stateful Primitives** (4 MVP): UnitDelay, Lag, Phasor, SampleAndHold [L204-211]
- **Basic 12 Blocks** (MVP): TimeRoot, DomainN, Id/U01, Hash, Noise, Add, Mul, Length, Normalize, UnitDelay, HSV->RGB, RenderInstances2D [L237-254]
- **Rails** (5 MVP): time, phaseA, phaseB, pulse, palette [L318-326]

## Invariants
- **I1**: Every block and edge carries explicit role declaration [L131-133]
- **I2**: Roles are discriminated unions with closed set, `kind` discriminator [L135-139]
- **I3**: No invisible blocks inserted by compiler; derived blocks ARE in patch.blocks [L141-149]
- **I4**: Compiler ignores roles; roles inform UI/undo/persistence only [L151-169]
- **I5**: Role invariants are validatable (default edges reference derived blocks) [L171-189]
- **I6**: User entities are canonical; derived entities regenerable [L191-196]
- **I7**: Every cycle must cross a stateful boundary (Tarjan SCC validation) [L371-375]
- **I8**: Every input always has exactly one source via DefaultSource block [L289-295]
- **I9**: Default values by PayloadType are useful, not zeros (prefer rails) [L299-310]

## Data Structures
- **Block** (5 fields) [L30]
- **PortBinding** (4 fields) [L48]
- **BlockRole** (discriminated) [L63]
- **DerivedBlockMeta** (5 variants) [L86]
- **EdgeRole** (4 variants) [L111]
- **CombineMode** (3 families) [L265]

## Dependencies
- **Depends on**: [01-type-system](./01-type-system.md) (SignalType, PayloadType), [04-compilation](./04-compilation.md) (compiler passes)
- **Referenced by**: [03-time-system](./03-time-system.md) (TimeRoot, rails), [07-diagnostics-system](./07-diagnostics-system.md) (block targets), [05-runtime](./05-runtime.md) (execution model)

## Decisions
- DECISION: Use `kind` property, NOT `type` (reserved for type system) [L41-43]
- DECISION: Stateful primitives limited to 4 MVP (UnitDelay, Lag, Phasor, SampleAndHold) [L204]
- DECISION: Rails are immutable system-provided blocks with derived role [L316-330]
- DECISION: No custom combine mode registry; built-in only [L281]
- DECISION: Transforms/lenses normalize to explicit derived blocks [L336-365]
- DECISION: UI filtering of derived blocks is presentation choice, not architectural [L387-400]

## Tier Classification
- **Suggested**: T1
- **Rationale**: Core foundation for all subsequent system design; blocks are "the only compute units"; block roles establish the architecture's approach to system-generated vs user-created entities.
