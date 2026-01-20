# Definition of Done: First-Class Ports

## Must Pass

### Data Model
- [ ] `InputPort` interface in Patch.ts
- [ ] `OutputPort` interface in Patch.ts
- [ ] `Block.inputPorts: ReadonlyMap<string, InputPort>`
- [ ] `Block.outputPorts: ReadonlyMap<string, OutputPort>`

### PatchStore
- [ ] `addBlock()` creates ports from registry
- [ ] `updateInputPort(blockId, portId, updates)` method works
- [ ] Port deletion automatic when block deleted

### Pass1 Integration
- [ ] Reads `block.inputPorts.get(portId)?.defaultSource`
- [ ] Falls back to registry `inputDef.defaultSource`
- [ ] Derived blocks use effective defaultSource

### UI
- [ ] BlockInspector shows defaultSource editor
- [ ] Can change block type (dropdown)
- [ ] Can edit params for block type
- [ ] Changes persist and trigger recompile

### TypeScript
- [ ] No TypeScript errors
- [ ] No new `any` types

---

## Verification Scenarios

### Scenario 1: Create Block with Ports
1. Call `addBlock('RenderInstances2D')`
2. Check block has `inputPorts` map
3. Check all registry inputs have port entries
4. Check block has `outputPorts` map

### Scenario 2: Edit Port DefaultSource
1. Get block with unconnected input
2. Call `updateInputPort(blockId, 'colors', { defaultSource: {...} })`
3. Verify `block.inputPorts.get('colors').defaultSource` updated
4. Verify compilation uses new defaultSource

### Scenario 3: UI Edit Flow
1. Select block with unconnected input
2. Open BlockInspector
3. Change defaultSource from Const to Oscillator
4. Edit frequency param
5. Verify visual output updates
6. Save patch, reload
7. Verify override persists

---

## Success Criteria

- User can edit `port.defaultSource` like any other property
- Ports are real objects nested in blocks
- Clean architecture (no workarounds)
- Clean, simple implementation
