# Implementation Context: Remove inputDefaults System

Sprint: inputdefaults-removal
Generated: 2026-01-19

---

## Background: Why This Work Exists

### The Original Request
"Render default sources differently on the patch UI" - a visual/UI task.

### What Was Built Instead
A completely new `inputDefaults` field on Block that:
1. Stores DefaultSource values directly on block instances
2. Gets checked in Pass1 BEFORE registry defaults
3. Creates hardcoded constants disconnected from block.params
4. Makes inspector param edits useless

### Why It's Wrong
- Violates "single source of truth" - params AND inputDefaults both store values
- Bypasses the entire block params → normalization → DefaultSource architecture
- Inspector edits block.params, but inputDefaults shadows them
- User changes params, nothing happens visually

---

## The Correct Architecture (MUST FOLLOW)

### Data Flow

```
Block.params (user-editable)
       │
       │ GraphNormalization
       ▼
DefaultSource derived block (reads from params)
       │
       │ Default edge (role: 'default')
       ▼
Input port on target block
       │
       │ Compilation
       ▼
CompiledProgramIR (slot-addressed)
```

### Key Components

**Block.params**: The single source of truth for user-editable values on a block.

**BlockSpec.inputs[].defaultSource**: Registry definition of what default to use for unconnected inputs. This is metadata about the PORT, not the INSTANCE.

**DefaultSource derived block**: Created by GraphNormalization for each unconnected input. Its output value comes from reading the target block's params.

**Default edge**: An edge with `role: { kind: 'default', meta: { defaultSourceBlockId } }` that connects the DefaultSource block to the input.

### Spec References

- `02-block-system.md` lines 437-445: Default Sources section
- `04-compilation.md` lines 45-48: Normalization materializes default sources
- `04-compilation.md` lines 91-94: Every default-source is actual BlockInstance + Edge
- `INVARIANTS.md` I26: Every input has a source

---

## Files to Modify

### src/graph/Patch.ts

**Remove from Block interface (~line 31):**
```typescript
// DELETE THIS LINE
readonly inputDefaults?: Readonly<Record<string, DefaultSource>>;
```

**Remove from addBlock options (~line 103):**
```typescript
// DELETE THIS LINE
inputDefaults?: Record<string, DefaultSource>;
```

**Remove from addBlock implementation (~line 116):**
```typescript
// DELETE THIS LINE
inputDefaults: options?.inputDefaults,
```

### src/graph/passes/pass1-default-sources.ts

**Remove the override check (~line 49):**
```typescript
// DELETE THIS BLOCK - only use registry defaults
const instanceOverride = block.inputDefaults?.[input.id];
if (instanceOverride) {
  // ... use override
}
```

The pass should ONLY use the registry default from `input.defaultSource`.

### src/stores/PatchStore.ts

**Remove inputDefaults handling (~lines 250-260):**
```typescript
// DELETE THIS ENTIRE BLOCK
const newDefaults = { ...block.inputDefaults };
// ...
inputDefaults: Object.keys(newDefaults).length > 0 ? newDefaults : undefined,
```

### src/ui/reactFlowEditor/nodes.ts

**Remove inputDefaults check (~line 47):**
```typescript
// DELETE THIS LINE
const instanceOverride = block.inputDefaults?.[input.id];
```

### src/main.ts

**Remove ALL inputDefaults usages.** There are ~13 occurrences.

For each block that currently uses inputDefaults:
1. Delete the `inputDefaults` object entirely
2. Either rely on registry defaults OR wire explicit Const blocks

**Example fix:**
```typescript
// BEFORE (wrong)
const render = b.addBlock('RenderInstances2D', {}, {
  inputDefaults: {
    size: constant(3),
  },
});

// AFTER (correct - use registry default)
const render = b.addBlock('RenderInstances2D', {});
// Let the registry default for 'size' apply via normalization

// OR if you need a specific value, wire it explicitly:
const sizeConst = b.addBlock('Const', { value: 3 });
b.connect(sizeConst.id, 'value', render.id, 'size');
```

---

## How DefaultSource Blocks Should Work

### In BlockSpec Registry

```typescript
const renderInstances2DSpec: BlockSpec = {
  kind: 'RenderInstances2D',
  inputs: [
    {
      id: 'size',
      type: { payload: 'float', ... },
      defaultSource: { kind: 'const', value: 10 }, // Registry default
    },
    // ...
  ],
};
```

### During Normalization (Pass1)

For each unconnected input:
1. Look up `input.defaultSource` from BlockSpec
2. Create a DefaultSource derived block
3. Create a default edge connecting it

```typescript
// The DefaultSource block reads from the TARGET block's params
// This is how inspector edits affect the default value
const defaultSourceBlock: Block = {
  id: `defaultSource:${block.id}:${input.id}:in`,
  kind: 'Const', // or whatever the defaultSource.kind specifies
  role: {
    kind: 'derived',
    meta: {
      kind: 'defaultSource',
      target: { kind: 'port', port: { blockId: block.id, portId: input.id } }
    }
  },
  params: {
    value: block.params[input.id] ?? defaultSource.value // <-- KEY: reads from block.params
  },
};
```

### The Inspector Connection

When user edits in inspector:
1. Inspector calls `patchStore.updateBlock(blockId, { params: { size: newValue } })`
2. Block.params.size updates
3. MobX triggers recompile
4. Normalization creates new DefaultSource block reading from updated params
5. Compilation produces IR with new value
6. Visual output changes

**This flow is broken when inputDefaults exists because it shadows block.params.**

---

## Testing After Implementation

### Manual Test
1. Start app
2. Select a block with an unconnected input
3. Find that input's param in the inspector
4. Change the value
5. Verify visual output changes

### Automated Verification
```bash
# No inputDefaults references
grep -r "inputDefaults" src/
# Should return nothing

# Type check
npm run typecheck

# Tests pass
npm run test
```

---

## Common Mistakes to Avoid

### "I'll just add a quick field to store the value"
NO. Block.params is the single source of truth. Use it.

### "Normalization is slow, I'll skip it for defaults"
NO. Normalization is where the architecture happens. Don't bypass it.

### "I need a specific value, so I'll add inputDefaults back"
NO. Either:
- Use registry defaults (most cases)
- Wire an explicit Const block (visible in graph)
- Set it in block.params (editable in inspector)

### "The UI needs to know the default value"
The UI can read from:
- The normalized graph (to see DefaultSource blocks)
- The BlockSpec registry (to see what default would apply)
- Block.params (to see current value)

Do NOT add another field.
