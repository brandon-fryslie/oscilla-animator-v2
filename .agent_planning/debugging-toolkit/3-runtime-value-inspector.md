Runtime Value Inspector

  Goal: Inspect live runtime state - slot values, buffers, instance counts - to see what the executor actually has at runtime.

  ---
  Runtime Value Inspector - Planning Prompt

  Goal: Create a Runtime Inspector that shows the actual values in runtime state slots, helping debug cases where compilation looks correct but
  runtime values are wrong.

  Core Requirements

  1. Trigger: Button in Debug Panel or keyboard shortcut (Ctrl+Shift+R)
  2. Display: Table/tree of all runtime slots and their current values
  3. Live updates: Refresh each frame or on-demand
  4. Slot types to inspect:
    - Value slots (scalars, vectors)
    - Object slots (buffers, arrays)
    - State slots (persistent values)
    - Instance data (counts, element IDs)
  5. Buffer visualization: For Float32Array, show length + sample values + histogram

  Key Questions This Answers

  - "Is the control points buffer actually populated?"
  - "What values are in slot 5?"
  - "How many elements does this instance have?"
  - "Is the materialization step writing to the right slot?"

  Architecture

  ┌─────────────────────────────────────────────────────┐
  │ RuntimeInspectorService                             │
  │ - getSlotValue(slot) → RuntimeValue                 │
  │ - getInstanceInfo(instanceId) → InstanceInfo        │
  │ - getAllSlots() → Map<slot, RuntimeValue>           │
  │ - subscribe(callback) → unsubscribe                 │
  └─────────────────────────────────────────────────────┘
           │
           ▼
  ┌─────────────────────────────────────────────────────┐
  │ <RuntimeInspector> panel                            │
  │ - Slot table with live values                       │
  │ - Instance list with counts                         │
  │ - Buffer detail view (click to expand)              │
  │ - Pause/resume updates toggle                       │
  └─────────────────────────────────────────────────────┘

  Files to Create

  - src/ui/debug/RuntimeInspectorService.ts
  - src/ui/debug/RuntimeInspector.tsx
  - src/ui/debug/SlotTable.tsx - Sortable/filterable slot list
  - src/ui/debug/BufferVisualizer.tsx - Array buffer display
  - src/ui/debug/InstanceList.tsx - Instance info display

  Data Structures

  interface RuntimeValue {
    slot: ValueSlot;
    type: 'number' | 'buffer' | 'object';
    value: number | ArrayBufferView | unknown;
    sourceExpr?: string; // Which expression writes to this slot
  }

  interface InstanceInfo {
    id: InstanceId;
    domainType: string;
    count: number;
    layout: LayoutSpec;
    elementIds?: Uint32Array;
  }

  Integration

  Add hooks into ScheduleExecutor.ts to expose state. Add panel to Dockview layout.