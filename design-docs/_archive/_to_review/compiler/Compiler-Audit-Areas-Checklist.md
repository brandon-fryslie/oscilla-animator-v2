# Compiler Audit Areas Checklist

- [x] IR compiler pipeline (passes 1–8, type graph, time topology, lowering, linking)
- [x] IR schedule builder and runtime step execution (timeDerive, signalEval, materialize, renderAssemble)
- [x] Bus system (contracts, reserved buses, bus lowering, combine semantics)
- [x] Block lowering registry (IR block coverage, legacy-only blockers, missing opcodes)
- [x] Type system and conversions (TypeDesc, adapters/lenses, type conversion paths)
- [x] Field runtime (FieldExpr, Materializer, kernels, determinism constraints)
- [x] Signal runtime (SigExpr table extraction, evaluator, stateful ops)
- [x] Render pipeline (RenderIR, Instances2D/Paths2D passes, Canvas renderer)
- [x] Time architecture (TimeRoot → TimeModel invariants, player transport)
- [x] Default source system (defaultSourceStore, resolution, compile/linking)
- [x] Debug/inspection tooling (DebugDisplay, debug probes, debug index)
- [x] Export pipeline (phase-driven sampling, determinism) if present
