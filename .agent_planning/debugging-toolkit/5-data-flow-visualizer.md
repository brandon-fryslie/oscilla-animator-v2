
Slot Trace / Data Flow Visualizer

  Goal: Given a slot or value, trace backwards to see where it came from and forwards to see where it goes.

  ---
  Slot Trace - Planning Prompt

  Goal: Answer "why is this slot empty/wrong?" by showing the complete data flow path from source to sink.

  The Problem It Solves

  Right now we're asking: "Why aren't control points reaching the renderer?"

  The answer requires tracing:
  ProceduralPolygon.lower()
    → creates controlPointField (FieldExprId=?)
    → embedded in SigExprShapeRef (SigExprId=?)
    → pass7 extracts it (or doesn't?)
    → creates StepMaterialize (slot=?)
    → executor runs step (or doesn't?)
    → writes to slot (or doesn't?)
    → renderer reads slot (or doesn't?)

  Output Format

  TRACE: controlPoints for Render block "b5"

  Source: ProceduralPolygon.controlPoints
    ├─ FieldExprId: 7 (kind: zipSig, fn: polygonVertex)
    │   └─ inputs: FieldExpr:3 (index intrinsic), Signals: [sides, radiusX, radiusY]
    │
    ├─ Embedded in: SigExprId: 12 (kind: shapeRef, topology: polygon-5)
    │   └─ controlPointField: FieldExprId:7 ✓
    │
    ├─ Pass7 extraction: ✓ Found in resolveShapeInfo()
    │   └─ Created StepMaterialize for FieldExprId:7 → Slot:15
    │
    ├─ Schedule step: StepMaterialize { field: 7, target: Slot:15 } ✓
    │
    ├─ StepRender: { controlPoints: { k: 'slot', slot: 15 } } ✓ or ❌ MISSING
    │
    └─ Runtime: Slot 15 = ??? (Float32Array[10] or undefined)

  DIAGNOSIS: StepRender.controlPoints is undefined - pass7 didn't include it

  Implementation

  interface TraceResult {
    steps: TraceStep[];
    diagnosis: string;
    failurePoint?: string;
  }

  interface TraceStep {
    stage: 'block' | 'ir' | 'pass7' | 'schedule' | 'runtime';
    description: string;
    status: 'ok' | 'missing' | 'error';
    data?: unknown;
  }

  function traceSlot(slotId: ValueSlot, schedule: ScheduleIR, runtime: RuntimeState): TraceResult;
  function traceField(fieldId: FieldExprId, ir: CompiledProgramIR): TraceResult;
  function traceConnection(edgeId: string, patch: Patch, ir: CompiledProgramIR): TraceResult;

  ---
  That's probably the full debugging toolkit:
  ┌───────────────────────┬─────────────────────────────────────────────────────────────┐
  │         Tool          │                     Question It Answers                     │
  ├───────────────────────┼─────────────────────────────────────────────────────────────┤
  │ Debug Probe           │ "What value is flowing through this wire right now?"        │
  ├───────────────────────┼─────────────────────────────────────────────────────────────┤
  │ Compilation Inspector │ "What IR did each pass produce?"                            │
  ├───────────────────────┼─────────────────────────────────────────────────────────────┤
  │ Runtime Inspector     │ "What's in the runtime slots/buffers?"                      │
  ├───────────────────────┼─────────────────────────────────────────────────────────────┤
  │ Patch Export          │ "What does the patch look like?" (for sharing)              │
  ├───────────────────────┼─────────────────────────────────────────────────────────────┤
  │ Slot Trace            │ "Why is this value missing/wrong?" (connects all the above) │
  └───────────────────────┴─────────────────────────────────────────────────────────────┘
  ---
