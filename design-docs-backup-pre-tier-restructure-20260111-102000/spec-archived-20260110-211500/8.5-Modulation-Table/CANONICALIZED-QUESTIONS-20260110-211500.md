---
command: /canonicalize-architecture Next do design-docs/8.5-Modulation-Table.  Look at them, read them, find all contradictioons, questions, etc.  present findings to me for resolution.  when we're done, archive
files: 1-Completely-New-UI-Again.md 2-Spec.md 3-Canonical-Typed-Events.md
indexed: true
source_files:
  - design-docs/8.5-Modulation-Table/1-Completely-New-UI-Again.md
  - design-docs/8.5-Modulation-Table/2-Spec.md
  - design-docs/8.5-Modulation-Table/3-Canonical-Typed-Events.md
topics:
  - modulation-table
  - ui-paradigm
  - event-system
timestamp: 20260110-211500
progress: 0%
---

# Modulation Table Canonicalization - Questions & Contradictions

**Status**: PENDING USER RESOLUTION
**Created**: 2026-01-10 21:15:00
**Source Directory**: `design-docs/8.5-Modulation-Table/`

## Resolution Instructions

For each item below:
1. Read the issue description
2. Provide your resolution/decision
3. Mark with `RESOLVED: [your decision]`
4. I will integrate resolutions into the canonical spec

---

## CRITICAL CONTRADICTIONS

These are blocking issues that must be resolved before integration.

### C1: Binding Model - Single vs Multiple Influences

**Status**: Multiple obviously.  this is already settled in the canonical spec

**Location**: `2-Spec.md:176`

**Issue**: The Modulation Table spec states:
- "At most one listener per input port"
- "A row can only be bound to one bus at a time"

**Contradiction**: This directly conflicts with the canonical spec's `CombineMode` system (GLOSSARY.md:381-397) which explicitly allows multiple writers to an input.

**Impact**: Fundamental architectural conflict affecting:
- Whether multiple influences per attribute are allowed
- What CombineMode means in the Modulation Table context
- Whether the table UI needs to support multiple bindings per cell

**Questions**:
1. Can a single row (port/attribute) have multiple active bindings?
2. If yes, how does the table UI represent this?
3. If no, does this mean CombineMode only applies at the bus level (multiple publishers)?

**YOUR RESOLUTION**:
```
[Awaiting resolution]
```

---

### C2: Event Terminology Mismatch

**Status**: EventHub wins. ignore all events from modulation table

**Location**: `3-Canonical-Typed-Events.md` (throughout)

**Issue**: This document uses completely different event naming conventions and structures than the Event Hub spec (topic 12):

**Modulation Table Events**:
- `nav.enterGraph`, `nav.exitGraph`
- `port.bindDirect`, `port.unbindDirect`
- `bus.create`, `bus.delete`
- `lens.add`, `lens.remove`

**Canonical Event Hub Patterns**:
- `GraphCommittedEvent`
- Diagnostic event integration
- Structured event types with payloads

**Impact**: We have two incompatible event systems documented.

**Questions**:
1. Should the Modulation Table events be integrated into the Event Hub taxonomy?
2. Are these high-level UI events that emit canonical events internally?
3. Should we create a new topic document for "UI-level events" vs "system events"?

**YOUR RESOLUTION**:
```
[Awaiting resolution]
```

---

### C3: Direct Binding Semantics

**Status**: ignore/remove.  they're just edges

**Locations**:
- `2-Spec.md:36` - mentions `directBindings?: DirectBinding[]` as "possibly kept internally"
- `3-Canonical-Typed-Events.md:234-240` - has full `port.bindDirect` / `port.unbindDirect` API

**Issue**: Unclear if direct bindings exist at all in the Modulation Table paradigm.

**Impact**:
- Affects whether "source stacks" need mini-pipeline UI (2-Spec.md:306-313)
- Affects how non-bus connections are represented
- May be obsolete concept from earlier design

**Questions**:
1. Do direct bindings exist in the Modulation Table model?
2. If yes, how are they different from bus-mediated bindings?
3. If no, should we remove all references to them?

**YOUR RESOLUTION**:
```
[Awaiting resolution]
```

---

## HIGH-PRIORITY DESIGN QUESTIONS

Strategic decisions that affect multiple topics.

### Q1: UI Paradigm Replacement Timeline

**Status**: remove this language.  doesn't replace anything.  this is referencing a prior architecture

**Issue**: Conflicting statements about whether Modulation Table replaces or coexists with current block graph UI.

**Evidence for REPLACEMENT**:
- `1-Completely-New-UI-Again.md:223` - "PatchBay becomes TableView"
- Document title suggests complete paradigm shift

**Evidence for COEXISTENCE**:
- `2-Spec.md:217-220` - suggests "new Editor mode" with "migration strategy"
- Implies both UIs exist simultaneously

**Questions**:
1. Is the Modulation Table the ONLY UI, or an optional view?
2. If coexistence, can users switch between graph and table views of the same patch?
3. What is the migration path from current UI?

**YOUR RESOLUTION**:
```
[Awaiting resolution]
```

---

### Q2: Bus Publishing Model

**Status**: There is no such thing as a publisher.  Remove/drop this langauge.

**Locations**: `2-Spec.md:29-30, 56-66`

**Issue**: Publishers list is flat (`publishers: string[]`), but document mentions "publisher-side adapters" (line 64).

**Questions**:
1. Can publishers have lens chains, or only listeners?
2. If publishers can transform, do cells show both publisher-side AND listener-side lenses?
3. Example: If PhaseClock publishes phase → scale(0..2π) → Bus, does the bus column show this?

**Implications**:
- Cell UI complexity (one lens chain vs two)
- Where type conversion happens (publish-side, listen-side, or both)
- Whether buses have intrinsic types or are polymorphic

**YOUR RESOLUTION**:
```
[Awaiting resolution]
```

---

### Q3: Row Identity for Domains

**Status**: Very good question!  We will need to think about this, because something like 'spacing', if that is indeed a property of domain, should certainly be bindable.  100%

**Locations**:
- `1-Completely-New-UI-Again.md:108` - Domain blocks get rows
- `2-Spec.md:251-252` - "important spatial attributes"

**Issue**: Domain blocks are compile-time topology (GLOSSARY.md:151-160), not render targets.

**Questions**:
1. Are Domain block parameters (jitter, spacing, density) bindable targets?
2. Or do only Renderer attributes appear as rows?
3. If domains are bindable, how does this interact with compile-time topology constraints?

**Canon Check**: Current spec says domains define topology at compile time. Modulating domain params would require recompilation.

**YOUR RESOLUTION**:
```
[Awaiting resolution]
```

---

### Q4: Recipe View as Derived Projection

**Status**: time, domain, and motion comes from blocks, of course?  like everything?  ignore the entire recipe system.  we aren't implementing it.  do not add it to the canonical docs (explicit rejection)

**Location**: `1-Completely-New-UI-Again.md:252-278`

**Issue**: Recipe View is described as "just a projection" but requires semantic groupings like "Time, Domain, Motion".

**Questions**:
1. Where does this semantic metadata come from?
2. Is it in the block registry (`BlockUiContract`)?
3. Or is there a separate recipe template system?
4. Can users create custom recipe views?

**Example**:
```
Recipe View "Orbit Animation":
  - Time: loopDuration, secondary
  - Domain: radius, spacing
  - Motion: speed, easing
```

Where is "Orbit Animation" defined? Block-level? System-level? User-level?

**YOUR RESOLUTION**:
```
it is not defined yet.  ignore it / remove language referring to it
```

---

### Q5: TimeRoot Representation

**Status**: answered inline

**Location**: `2-Spec.md:252`

**Issue**: "TimeRoot: not rows; it is global (top bar + time panel)"

**Questions**:
1. Can TimeRoot inputs (loopDuration, playbackSpeed, etc.) be modulated via the table?

NO.  Of course not.  TimeRoot has no inouts!  And loopDuration & playbackSpeed are NOT properties of TimeRoot!

2. Or are they always inspector-only?  N/A
3. If they ARE bindable, how do they appear in the table (special header section)? They don't exist!

**Canon Check**: Topic 03 (Time System) shows TimeRoot has inputs. Are these runtime-modulatable?

**YOUR RESOLUTION**:
```
This is absurdly unaligned with the canonical spec.  This should have been immediately rejected.
```

---

## AMBIGUITIES & MISSING DETAILS

Specifications that need clarification but aren't blockers.

### A1: Cell Lens Chain Ordering

**Status**: We aren't going to deal with this yet.  Remove the language

**Location**: `1-Completely-New-UI-Again.md:176-187`


---

### A2: "Compatible Buses" Filtering

**Status**: What's a bus?  

---

### A3: Table Column/Row Ordering

**Status**: who gives a shit?


---

### A4: Muted Bindings

**Status**: ⚠️ UNRESOLVED

**Locations**:
- `1-Completely-New-UI-Again.md:135` - mentions "Muted" cell state
- `2-Spec.md:62` - has `enabled: boolean` on Listener

**Questions**:
1. Is "muted" the same as `enabled: false`? Yes
3. What is the semantic difference between "muted" and "deleted"? A muted edge can be turned back on while a deleted one must be recreated?


---

### A5: Bus Activity Indicator

**Status**: this is not a thing.  discard


---

## TERMINOLOGY CONFLICTS WITH CANONICAL SPEC

Naming consistency issues.

### T1: "Adapter" vs "Lens"

**Status**: Adapters and lenses are the two types of transform
Adapters = type change
Lenses = calculation, maybe type change, maybe not.  at the end of the day they're all blocks to the compiler

**Issue**: Modulation docs use both terms:
- `1-Completely-New-UI-Again.md:165` - "Lens Editor"
- `1-Completely-New-UI-Again.md:186` - "adapter chain system"
- `2-Spec.md:16` - "lenses (adapters)"

**Questions**:
1. Are "adapter" and "lens" synonyms?
2. If different, what distinguishes them?
3. Which term should be canonical?

**YOUR RESOLUTION**:
```
Transforms = Adapters + Lenses
Lenses = change how a value is interpreted by a block (scale, etc)
Adapter = mechancially allow ports of different types to connect (do not change the value itself)
```

---

### T2: "Port" Terminology

**Status**: ⚠️ UNRESOLVED

**Issue**:
- **Modulation docs**: "port" = bindable attribute on a renderer/domain
- **Canon**: `PortBinding` is on blocks (GLOSSARY.md:211-216)

**Questions**:
1. Are renderer attributes literally ports on a block?

Does this matter?

2. Or is "port" a UI-level abstraction in the table context?

use whatever is in the spec.  

3. Should we use different terminology to avoid confusion?

**Suggestion**: Consider "attribute" or "property" instead of "port" in table context.

**YOUR RESOLUTION**:
```
this is a waste of time.  the spec defines this already.  when a new document directly conflicts with a canonicalized spec, it's wrong. 
if it's something as trivial as "we call it Port and they call it PortBinding" pleasse just adopt the canonical language and move on 
```

---

### T3: "Row" and "Target"

**Status**:  Really?

**Issue**:
- **Modulation docs**: "Row = bindable port = target"
- **Canon**: `TargetRef` is diagnostic addressing (GLOSSARY.md:581-602)

**Risk**: Name collision - using "target" for table rows may confuse with diagnostic targets.

**Recommendation**: Avoid using "target" for table rows; stick with "row" or "attribute".

**YOUR RESOLUTION**:
```
It won't.  This is stupid. 
```

---

### T4: "Direct Binding" vs "Direct Connection"

**Status**: ⚠️ UNRESOLVED

**Issue**:
- **Modulation docs**: `DirectBinding` (2-Spec.md:36)
- **Canon**: Edge types include `user` edges but no "direct binding" term

**Questions**:
1. Is this the same as a `user` edge in the block graph?
2. Or is it a new concept?
3. Should terminology be unified?

**YOUR RESOLUTION**:
```
Binding == Connection == Edge.  Pick one.  It's literally identical.
```

---

## INTEGRATION QUESTIONS WITH CANONICAL SPEC

How this fits with existing topics.

### I1: How Does Modulation Table Map to NormalizedGraph?

**Status**: No, that's stupid

**Issue**: Modulation Table is UI; NormalizedGraph is compile input (topic 04).

**Questions**:
1. Does the table serialize to:
   - A set of blocks + buses + listeners → normalized → compiled?
   - Or a different IR that bypasses the block graph?
2. Is there a bidirectional mapping (can you view block graph AS table)?
3. What is the source of truth: table data or NormalizedGraph?

**YOUR RESOLUTION**:
```
This is a table in the UI that allows you to modify the patch.  IS that what a normalized graph is?  No, it is not.
```

---

### I2: Lens Registry Location

**Status**: Add it to the TODO list.  It's coming soon.

**Location**: `2-Spec.md:190-192`

**Issue**: Mentions "Lens registry" but canonical spec has no such concept yet.

**Questions**:
1. Is this part of the block registry?
2. Part of the type system?
3. A new standalone registry?
4. Where is it specified?

**YOUR RESOLUTION**:
```
I can't specify everything at the exact same time, can I?
```

---

### I3: CombineMode Visibility

**Status**: READ THE EXISTING SPEC

**Location**: `1-Completely-New-UI-Again.md:67-69` shows combine mode in column header

**Issue**: Related to C1 - if "at most one listener per port", why show combine mode?

**Possible Resolutions**:
1. Multiple influences ARE allowed (via bus combine upstream), combine mode shows how bus merges its publishers
2. Combine mode is shown but always "last" (single writer) - vestigial UI
3. C1 is incorrect - multiple bindings per row ARE allowed

**YOUR RESOLUTION**:
```
Read the existing spec
```

---

### I4: Bus Creation Flow

**Status**: You need to do a baseline of research before you can competently address these

**YOUR RESOLUTION**:
```
You need to get up to speed on the project so you don't ask stupid questioons
```

---

### I5: Rails in the Table

**Status**: Remove time.secondary.  not relevant.  Rails do show up as columns on the table

**Location**: `1-Completely-New-UI-Again.md:56` shows `time.secondary` as example bus

**Issue**: Rails are immutable system buses (GLOSSARY.md:362-376).

**Questions**:
1. Do rails appear as columns in the table? yes
2. Can you bind listeners to rails directly? what is a listener?  are you retarded?
3. Or only via intermediate blocks that consume rails? wtf is an intermediate block?  do you even know what we're talking about?
4. Are rails visually distinguished from user buses? yea they're in a section that says "Rails" and not in the one that says Buses

**YOUR RESOLUTION**:
```
they're column only. not row
```

---

## MISSING SPECIFICATIONS

Gaps that need to be filled.

### M1: Undo/Redo Granularity

**Status**: undo/redo/xaction all deferred

---

### M2: Clipboard/Copy-Paste Semantics

**Status**: ignore / discard

---

### M3: Table View State Persistence

**Status**: irrelevant


---

### M4: Block Lifecycle and Row Appearance

**Status**: irrelevant, ignore

---

### M5: Type Conversion UX

**Status**: leave out of the spec for now

---

## NEXT STEPS

Once you provide resolutions:

1. I will integrate decisions into the canonical spec
2. Create/update affected topic documents
3. Update GLOSSARY.md with new terms
4. Update RESOLUTION-LOG.md with your decisions
5. Archive the source documents

---

**END OF QUESTIONS DOCUMENT**
