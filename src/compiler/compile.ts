/**
 * Compiler Entry Point
 *
 * Main compilation pipeline:
 * 1. Normalization - Convert Patch to NormalizedPatch
 * 2. Pass 2: Type Graph - Resolve types for all connections
 * 3. Pass 3: Time Topology - Determine time model
 * 4. Pass 4: Dependency Graph - Build execution dependencies
 * 5. Pass 5: Cycle Validation (SCC) - Check for illegal cycles
 * 6. Pass 6: Block Lowering - Lower blocks to IR expressions
 * 7. Pass 7: Schedule Construction - Build execution schedule
 *
 * Integrated with event emission for diagnostics.
 */

import type { Patch } from '../graph';
import { normalize, type NormalizedPatch } from '../graph/normalize';
import type { CompiledProgramIR, SlotMetaEntry, ValueSlot, FieldSlotEntry, OutputSpecIR } from './ir/program';
import type { UnlinkedIRFragments } from './passes-v2/pass6-block-lowering';
import type { ScheduleIR } from './passes-v2/pass7-schedule';
import type { FieldExpr, FieldExprId, InstanceId } from './ir/types';
import { payloadStride } from './ir/signalExpr';
import type { AcyclicOrLegalGraph } from './ir/patches';
import { convertCompileErrorsToDiagnostics } from './diagnosticConversion';
import type { EventHub } from '../events/EventHub';
import { signalType } from '../core/canonical-types';
// debugService import removed for strict compiler isolation (One Source of Truth)
import { compilationInspector } from '../services/CompilationInspectorService';

// Import block registrations (side-effect imports to register blocks)
import '../blocks/time-blocks';
import '../blocks/signal-blocks';
import '../blocks/primitive-blocks'; // NEW - Sprint 9: Three-stage architecture (Stage 1)
import '../blocks/array-blocks'; // NEW - Sprint 9: Three-stage architecture (Stage 2)
import '../blocks/instance-blocks'; // NEW - Sprint 3 (replaces domain-blocks)
import '../blocks/field-blocks';
import '../blocks/math-blocks';
import '../blocks/event-blocks';
import '../blocks/expression-blocks'; // NEW - Expression DSL Integration Sprint 3
import '../blocks/color-blocks';
import '../blocks/geometry-blocks';
import '../blocks/identity-blocks';
import '../blocks/render-blocks';
import '../blocks/field-operations-blocks';
import '../blocks/path-blocks'; // NEW - Path foundation sprint
import '../blocks/path-operators-blocks'; // NEW - Path operators sprint
import '../blocks/adapter-blocks'; // Unit-conversion adapters (Spec §B4.1)
import '../blocks/camera-block'; // NEW - Camera system
import '../blocks/io-blocks'; // NEW - External input system

import '../blocks/test-blocks'; // Test blocks for signal evaluation in tests
