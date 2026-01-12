Yep. Below is a “hand to a junior and they can wire it up” implementation package. I’m going to assume your new architecture is:
•	CompiledProgramIR with nodes, schedule.steps[], outputs[]
•	ValueStore is “dense slots” (numbers, handles, and typed buffers)
•	Renderer consumes a RenderFrameIR (not a closure RenderTree)

I’ll give you concrete TS implementations + the exact integration points.

⸻

A) Add materialization steps to the schedule

A1) Step IR additions

Create/extend src/editor/compiler/ir/steps.ts (or wherever your Step types live):

export type StepKind =
| "nodeEval"
| "busEval"
| "materializeColor"
| "materializePath"
| "renderAssemble";

export type StepId = string;
export type ValueSlot = number;
export type ExprId = string;

export interface StepBase {
id: StepId;
kind: StepKind;
// scheduling:
deps: StepId[];         // must run after these
cacheKey?: CacheKeySpec; // optional; you already spec’d this
}

export interface StepMaterializeColor extends StepBase {
kind: "materializeColor";
domainSlot: ValueSlot;         // Domain handle (or count) lives here
colorExprSlot: ValueSlot;      // field expr handle lives here
outRSlot: ValueSlot;           // Float32Array buffer slot
outGSlot: ValueSlot;
outBSlot: ValueSlot;
outASlot: ValueSlot;
// optional:
format?: "rgba_f32";           // future-proof
}

export interface StepMaterializePath extends StepBase {
kind: "materializePath";
domainSlot: ValueSlot;
pathExprSlot: ValueSlot;       // field expr handle for Path (or handle)
outCmdsSlot: ValueSlot;        // Uint16Array commands
outParamsSlot: ValueSlot;      // Float32Array params
// optional:
flattenTolerancePx?: number;   // default from IR/caches
}

export interface StepRenderAssemble extends StepBase {
kind: "renderAssemble";
// Inputs:
instance2dListSlot: ValueSlot; // e.g. list of Instance2D batch descriptors
pathBatchListSlot: ValueSlot;  // e.g. list of PathBatch descriptors
// Output:
outFrameSlot: ValueSlot;       // RenderFrameIR stored here
}

export type StepIR =
| StepNodeEval
| StepBusEval
| StepMaterializeColor
| StepMaterializePath
| StepRenderAssemble;

“List slots”

You can represent lists as “special values” stored in ValueStore:
•	Instance2DBatchList object
•	PathBatchList object
These are not in hot loops; fine as JS objects.

⸻

A2) Lowering rule: emit materialization steps from render sinks

In your block lowering (node → steps), whenever a render sink requires a materialized buffer, you do:
•	keep the field lazy in ValueStore (expr handle)
•	add a StepMaterializeX just-in-time before assemble

Example lowering: RenderInstances2D needs color buffers

Assume RenderInstances2D node outputs a Instance2DBatchList object containing references to:
•	domainSlot
•	position buffer slot(s) (vec2)
•	radius buffer slot (f32)
•	colorExpr slot (field color) or direct RGBA slots if already materialized

If it has colorExprSlot, schedule must add materializeColor:

function ensureMaterializedColor(
b: ScheduleBuilder,
nodeId: string,
domainSlot: ValueSlot,
colorExprSlot: ValueSlot
): { r: ValueSlot; g: ValueSlot; b: ValueSlot; a: ValueSlot; stepId: StepId } {
const r = b.allocSlot();
const g = b.allocSlot();
const bb = b.allocSlot();
const a = b.allocSlot();

const stepId = b.newStepId(`${nodeId}:matColor`);
b.addStep({
id: stepId,
kind: "materializeColor",
deps: [],
domainSlot,
colorExprSlot,
outRSlot: r,
outGSlot: g,
outBSlot: bb,
outASlot: a,
});

return { r, g, b: bb, a, stepId };
}

You then:
•	update the batch descriptor to reference r/g/b/a slots
•	add dependency from renderAssemble step to matColor step

Same shape for paths via ensureMaterializedPath(...).

⸻

B) Runtime: execute the steps and populate ValueStore buffers

B1) ValueStore buffer API (must exist)

In src/editor/runtime/valueStore.ts:

export type SlotValue =
| number
| boolean
| string
| null
| undefined
| { kind: "fieldExpr"; exprId: string }     // handle
| { kind: "domain"; count: number; ids?: Uint32Array } // minimal
| Float32Array
| Uint16Array
| RenderFrameIR
| any; // for non-hot list objects

export class ValueStore {
private slots: SlotValue[];

constructor(slotCount: number) {
this.slots = new Array(slotCount);
}

get<T = SlotValue>(slot: number): T {
return this.slots[slot] as T;
}

set(slot: number, v: SlotValue): void {
this.slots[slot] = v;
}

ensureF32(slot: number, length: number): Float32Array {
const cur = this.slots[slot];
if (cur instanceof Float32Array && cur.length === length) return cur;
const next = new Float32Array(length);
this.slots[slot] = next;
return next;
}

ensureU16(slot: number, length: number): Uint16Array {
const cur = this.slots[slot];
if (cur instanceof Uint16Array && cur.length === length) return cur;
const next = new Uint16Array(length);
this.slots[slot] = next;
return next;
}
}

B2) Field evaluator hook (you need this)

You must have something like:

export interface FieldRuntime {
// Evaluate a field expression into an output buffer.
// The evaluator decides how to interpret exprId + type.
evalToBuffer(opts: {
exprId: ExprId;
domain: { count: number; ids?: Uint32Array };
type: TypeDesc;
out: Float32Array | Uint16Array | any; // depends
}): void;
}

If you don’t have this yet, stub it as “switch expr opcode + loop domain.count”.

⸻

B3) Step execution: materializeColor

In src/editor/runtime/vm/executeSteps.ts:

function executeMaterializeColor(
step: StepMaterializeColor,
store: ValueStore,
fields: FieldRuntime,
types: { /* your type table or resolver */ }
) {
const domain = store.get<{ kind: "domain"; count: number; ids?: Uint32Array }>(step.domainSlot);
if (!domain || domain.kind !== "domain") throw new Error("materializeColor: missing domain");

const exprHandle = store.get<{ kind: "fieldExpr"; exprId: string }>(step.colorExprSlot);
if (!exprHandle || exprHandle.kind !== "fieldExpr") throw new Error("materializeColor: missing fieldExpr");

const n = domain.count;
const r = store.ensureF32(step.outRSlot, n);
const g = store.ensureF32(step.outGSlot, n);
const b = store.ensureF32(step.outBSlot, n);
const a = store.ensureF32(step.outASlot, n);

// Option 1: eval as 4 separate channels (recommended for perf + your LED goals)
fields.evalToBuffer({ exprId: exprHandle.exprId + ":r", domain, type: { world:"field", domain:"number", semantics:"color.r" }, out: r });
fields.evalToBuffer({ exprId: exprHandle.exprId + ":g", domain, type: { world:"field", domain:"number", semantics:"color.g" }, out: g });
fields.evalToBuffer({ exprId: exprHandle.exprId + ":b", domain, type: { world:"field", domain:"number", semantics:"color.b" }, out: b });
fields.evalToBuffer({ exprId: exprHandle.exprId + ":a", domain, type: { world:"field", domain:"number", semantics:"color.a" }, out: a });

// Option 2: if your color expr is inherently RGBA struct, make evalToRGBA(outR,outG,outB,outA)
}

Important: your FieldExpr system should support “channel projection” (color.r) as an opcode, so exprId+":r" can be a real expr node or a cached projection.

⸻

B4) Step execution: materializePath

You need a canonical flatten-to-commands representation:
•	cmds: Uint16Array
•	params: Float32Array
•	plus counts/offsets are carried by a PathBatch descriptor

Assume FieldRuntime exposes evalPathToCmdBuffers(...):

export interface PathRuntime {
evalPathsToCmdBuffers(opts: {
exprId: ExprId;
domain: { count: number; ids?: Uint32Array };
tolerancePx: number;
outCmds: Uint16Array;
outParams: Float32Array;
}): { cmdCount: number; paramCount: number; perElementOffsets?: Uint32Array };
}

Executor:

function executeMaterializePath(
step: StepMaterializePath,
store: ValueStore,
paths: PathRuntime
) {
const domain = store.get<{ kind: "domain"; count: number; ids?: Uint32Array }>(step.domainSlot);
const expr = store.get<{ kind: "fieldExpr"; exprId: string }>(step.pathExprSlot);
if (!domain || domain.kind !== "domain") throw new Error("materializePath: missing domain");
if (!expr || expr.kind !== "fieldExpr") throw new Error("materializePath: missing fieldExpr");

// sizing strategy: start from last size cached in slot; grow if needed
// simplest for now: allocate a conservative upper bound (tunable later)
const n = domain.count;
const maxCmds = Math.max(1024, n * 64);      // heuristic: 64 cmds/elem
const maxParams = Math.max(2048, n * 128);   // heuristic

const cmds = store.ensureU16(step.outCmdsSlot, maxCmds);
const params = store.ensureF32(step.outParamsSlot, maxParams);

const tol = step.flattenTolerancePx ?? 0.75;
const res = paths.evalPathsToCmdBuffers({
exprId: expr.exprId,
domain,
tolerancePx: tol,
outCmds: cmds,
outParams: params,
});

// store the actual used sizes somewhere the renderer can read.
// simplest: stash a small descriptor object next to the buffers:
store.set(step.outCmdsSlot, cmds.subarray(0, res.cmdCount));           // OK: subarray view
store.set(step.outParamsSlot, params.subarray(0, res.paramCount));
}

If you want to avoid subarray churn, keep full buffers and store used counts in a parallel “metadata slot”. Either is fine.

⸻

C) Assemble into RenderFrameIR

C1) RenderFrameIR (canonical, canvas-friendly)

Put in src/editor/runtime/render/RenderFrameIR.ts:

export interface RenderFrameIR {
version: 1;
clear: { r: number; g: number; b: number; a: number };
// ordered passes, already flattened:
passes: RenderPassIR[];
// perf/debug counters optional:
perf?: { instances2d: number; pathCmds: number; };
}

export type RenderPassIR =
| { kind: "instances2d"; batch: Instances2DBatchIR }
| { kind: "paths2d"; batch: Paths2DBatchIR };

export interface Instances2DBatchIR {
count: number;
// positions in pixels:
x: Float32Array;
y: Float32Array;
radius: Float32Array;
// colors:
r: Float32Array;
g: Float32Array;
b: Float32Array;
a: Float32Array;
// optional:
rotation?: Float32Array;
shapeId?: Uint16Array; // 0=circle,1=square,2=star, etc.
}

export interface Paths2DBatchIR {
cmds: Uint16Array;
params: Float32Array;
// optional style buffers, etc.
}

C2) executeRenderAssemble()

In src/editor/runtime/vm/executeRenderAssemble.ts:

export function executeRenderAssemble(
step: StepRenderAssemble,
store: ValueStore
) {
const instanceList = store.get<any>(step.instance2dListSlot); // your list descriptor
const pathList = store.get<any>(step.pathBatchListSlot);

const passes: RenderPassIR[] = [];

if (instanceList) {
// Example: instanceList is an array of {count, xSlot, ySlot, radiusSlot, rSlot,gSlot,bSlot,aSlot}
for (const b of instanceList.batches as any[]) {
const x = store.get<Float32Array>(b.xSlot);
const y = store.get<Float32Array>(b.ySlot);
const radius = store.get<Float32Array>(b.radiusSlot);
const r = store.get<Float32Array>(b.rSlot);
const g = store.get<Float32Array>(b.gSlot);
const bb = store.get<Float32Array>(b.bSlot);
const a = store.get<Float32Array>(b.aSlot);

      passes.push({
        kind: "instances2d",
        batch: { count: b.count, x, y, radius, r, g, b: bb, a }
      });
    }
}

if (pathList) {
for (const pb of pathList.batches as any[]) {
const cmds = store.get<Uint16Array>(pb.cmdsSlot);
const params = store.get<Float32Array>(pb.paramsSlot);
passes.push({
kind: "paths2d",
batch: { cmds, params }
});
}
}

const frame: RenderFrameIR = {
version: 1,
clear: { r: 0, g: 0, b: 0, a: 1 },
passes,
perf: {
instances2d: passes.filter(p => p.kind === "instances2d").reduce((s,p)=>s+(p as any).batch.count,0),
pathCmds: passes.filter(p => p.kind === "paths2d").reduce((s,p)=>s+(p as any).batch.cmds.length,0),
}
};

store.set(step.outFrameSlot, frame);
}

Your schedule should end with a single renderAssemble step that writes the outFrameSlot referenced by program.outputs[].

⸻

D) Renderer: renderFrame(frame) entrypoint

In src/editor/runtime/renderer/CanvasRenderer2D.ts:

export class CanvasRenderer2D {
constructor(private ctx: CanvasRenderingContext2D) {}

renderFrame(frame: RenderFrameIR, viewport: { w: number; h: number; dpr: number }) {
const { ctx } = this;

    // clear
    ctx.setTransform(1,0,0,1,0,0);
    ctx.clearRect(0, 0, viewport.w, viewport.h);
    ctx.fillStyle = `rgba(${frame.clear.r*255},${frame.clear.g*255},${frame.clear.b*255},${frame.clear.a})`;
    ctx.fillRect(0, 0, viewport.w, viewport.h);

    for (const pass of frame.passes) {
      if (pass.kind === "instances2d") this.drawInstances2D(pass.batch);
      else if (pass.kind === "paths2d") this.drawPaths2D(pass.batch);
    }
}

private drawInstances2D(b: Instances2DBatchIR) {
const { ctx } = this;
const n = b.count;

    for (let i = 0; i < n; i++) {
      const x = b.x[i], y = b.y[i], r = b.radius[i];
      ctx.fillStyle = `rgba(${(b.r[i]*255)|0},${(b.g[i]*255)|0},${(b.b[i]*255)|0},${b.a[i]})`;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
}

private drawPaths2D(b: Paths2DBatchIR) {
const { ctx } = this;
const cmds = b.cmds;
const p = b.params;
let pi = 0;

    ctx.beginPath();
    for (let ci = 0; ci < cmds.length; ci++) {
      const c = cmds[ci];
      // you define these codes; example:
      switch (c) {
        case 0: { // MoveTo
          const x = p[pi++], y = p[pi++];
          ctx.moveTo(x, y);
          break;
        }
        case 1: { // LineTo
          const x = p[pi++], y = p[pi++];
          ctx.lineTo(x, y);
          break;
        }
        case 2: { // Close
          ctx.closePath();
          break;
        }
        // add quad/cubic as needed
        default:
          throw new Error(`Unknown path cmd: ${c}`);
      }
    }
    ctx.stroke();
}
}

This is intentionally “dumb but correct”. You can optimize later (batch fillStyle changes, path caching, etc.). The pipeline wiring is the important part.

⸻

E) PreviewPanel: call renderFrame() not render()

E1) What changes in player/render loop?

Wherever your old code does:

const tree = program.signal(tMs, ctx);
renderer.render(tree);

It becomes:

const frame = vm.evalFrame(tMs, runtimeCtx); // returns RenderFrameIR
renderer.renderFrame(frame, runtimeCtx.viewport);

E2) Concrete PreviewPanel change

In src/editor/PreviewPanel.tsx (or wherever the render loop is driven), change only the call site:

// OLD
player.onFrame = (tree, tMs) => renderer.render(tree);

// NEW
player.onFrame = (frame: RenderFrameIR, tMs: number) => {
renderer.renderFrame(frame, player.runtimeCtx.viewport);
};

If Player currently emits RenderTree, update its ProgramFactory to produce an IR VM program that returns RenderFrameIR.

⸻

F) Integration checklist (the “plug this in” order)
1.	IR types: add StepMaterializeColor, StepMaterializePath, StepRenderAssemble (+ RenderFrameIR)
2.	ScheduleBuilder: expose allocSlot(), addStep(), stable newStepId()
3.	Lowering:
•	render sink lowering creates batch descriptors that reference slots
•	inject ensureMaterializeColor/Path() steps when batches still point at expr slots
•	ensure renderAssemble depends on those materialize steps
4.	Runtime:
•	implement ValueStore.ensureF32/ensureU16
•	implement executeMaterializeColor, executeMaterializePath, executeRenderAssemble
•	wire into executeStep(step) switch
5.	Renderer: add renderFrame(frame) and keep old render temporarily only if needed
6.	PreviewPanel: switch to renderFrame()

⸻

If you paste (or upload) your current ScheduleIR and executeStep() skeleton, I can pin the exact filenames + where each function drops in so the diff is almost mechanical.