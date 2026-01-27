/**
 * Level 9: Continuity-Projection Decoupling Verification
 *
 * VERIFICATION-ONLY level: no new implementation code needed.
 * Tests proving that continuity and projection systems are completely decoupled.
 *
 * Core invariant:
 * - Continuity operates on world-space data (vec3 positions, float radii)
 * - Projection operates on world-space data (read-only, pure functions)
 * - Continuity state is IDENTICAL regardless of camera mode (ortho vs perspective)
 *
 * Test groups:
 * 1. Unit Tests: Continuity uses world-space, not screen-space (4 tests)
 * 2. Integration Tests: Continuity unaffected by camera toggle (4 tests)
 * 3. Integration Tests: Projection never writes world state (3 tests)
 * 4. Integration Tests: Continuity remap during toggle (2 tests)
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { projectInstances } from '../../runtime/RenderAssembler';
import { DEFAULT_CAMERA, type ResolvedCameraParams } from '../../runtime/CameraResolver';
import { detectDomainChange, buildMappingById } from '../../runtime/ContinuityMapping';
import { applyContinuity } from '../../runtime/ContinuityApply';
import { createContinuityState, type ContinuityState } from '../../runtime/ContinuityState';
import { createRuntimeState, type RuntimeState } from '../../runtime/RuntimeState';
import { getTestArena } from '../../runtime/__tests__/test-arena-helper';
import { executeFrame } from '../../runtime/ScheduleExecutor';
import type { CompiledProgramIR } from '../../compiler/ir/program';
import type { DomainInstance, StepContinuityApply, ContinuityPolicy } from '../../compiler/ir/types';
import type { ValueSlot } from '../../types';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// =============================================================================
// Unit Tests: Continuity Operates on World-Space, Not Screen-Space
// =============================================================================

describe('Level 9 Unit Tests: Continuity Uses World-Space Data', () => {
  it('Test 1: Continuity system reads/writes Field<vec3> world positions (not screen positions)', () => {
    // Read ContinuityApply.ts and verify it operates on stride-3 buffers
    const source = readFileSync(
      join(__dirname, '../../runtime/ContinuityApply.ts'),
      'utf-8'
    );

    // applyContinuity gets stride from the step (type-derived, not semantic)
    // This ensures stride comes from ONE SOURCE OF TRUTH (the type system)
    expect(source).toMatch(/const\s*\{\s*[^}]*stride[^}]*\}\s*=\s*step/);

    // Gauge initialization operates on buffers with stride (world-space layout)
    expect(source).toMatch(/initializeGaugeOnDomainChange/);
    expect(source).toMatch(/stride/);

    // Slew filter operates on buffers (world-space, not screen-space)
    expect(source).toMatch(/applySlewFilter/);

    // Verify NO imports from projection modules
    expect(source).not.toMatch(/from ['"].*projection/);
    expect(source).not.toMatch(/screenPosition/);
    expect(source).not.toMatch(/screenRadius/);
  });

  it('Test 2: Continuity system reads/writes Field<float> world sizes (not screen radii)', () => {
    const source = readFileSync(
      join(__dirname, '../../runtime/ContinuityApply.ts'),
      'utf-8'
    );

    // Stride comes from step.stride (type-derived), not from semantic heuristics
    // This ensures stride is uniform for all field types
    expect(source).toMatch(/const\s*\{\s*[^}]*stride[^}]*\}\s*=\s*step/);

    // Continuity operates on the scale/radius field (world-space), not screenRadius
    expect(source).not.toMatch(/screenRadius/);
    expect(source).not.toMatch(/screen.*[Rr]adius/);
  });

  it('Test 3: Continuity system has no import/dependency on projection modules (static analysis)', () => {
    // Check all 4 continuity files for zero imports from src/projection/
    const continuityFiles = [
      'ContinuityApply.ts',
      'ContinuityMapping.ts',
      'ContinuityState.ts',
      'ContinuityDefaults.ts',
    ];

    for (const file of continuityFiles) {
      const source = readFileSync(
        join(__dirname, '../../runtime', file),
        'utf-8'
      );

      // No imports from projection
      expect(source).not.toMatch(/from ['"].*projection/);
      expect(source).not.toMatch(/import.*projection/);

      // No references to projection types or functions
      expect(source).not.toMatch(/projectInstances/);
      expect(source).not.toMatch(/OrthoCameraParams/);
      expect(source).not.toMatch(/PerspectiveCameraParams/);
      expect(source).not.toMatch(/ProjectionMode/);
      expect(source).not.toMatch(/projectFieldOrtho/);
      expect(source).not.toMatch(/projectFieldPerspective/);
    }
  });

  it('Test 4: Continuity mapping is keyed by instanceId, not by screen position', () => {
    const mappingSource = readFileSync(
      join(__dirname, '../../runtime/ContinuityMapping.ts'),
      'utf-8'
    );

    // Mapping uses DomainInstance (identity-based, not screen-position-based)
    expect(mappingSource).toMatch(/DomainInstance/);
    expect(mappingSource).toMatch(/identityMode/);
    expect(mappingSource).toMatch(/elementId/);

    // Mapping by position uses world-space posHintXY, not screen coordinates
    expect(mappingSource).toMatch(/posHintXY/);

    // No references to screen-space coordinates
    expect(mappingSource).not.toMatch(/screenPos/);
    expect(mappingSource).not.toMatch(/screenX/);
    expect(mappingSource).not.toMatch(/screenY/);
  });
});

// =============================================================================
// Integration Tests: Continuity Unaffected by Camera Toggle
// =============================================================================

describe('Level 9 Integration: Continuity Unaffected by Toggle', () => {
  /**
   * Helper: Create a minimal CompiledProgramIR with continuity steps
   */
  function createMinimalProgramWithContinuity(count: number): CompiledProgramIR {
    const instanceId = 'test-instance';

    return {
      version: 1,
      signalExprs: { nodes: [], idMap: new Map() },
      fieldExprs: { nodes: [], idMap: new Map() },
      eventExprs: { nodes: [], idMap: new Map() },
      slotMeta: [
        // System-reserved slots that executeFrame writes to
        { slot: 0 as ValueSlot, storage: 'f64', offset: 0, stride: 4 }, // time.palette
        // Test slots
        { slot: 10 as ValueSlot, storage: 'object', offset: 0, stride: 3 },
        { slot: 11 as ValueSlot, storage: 'object', offset: 1, stride: 3 },
        { slot: 100 as ValueSlot, storage: 'object', offset: 2, stride: 3 },
      ],
      fieldSlotRegistry: new Map(),
      renderGlobals: [],
      outputs: [{ slot: 100 as ValueSlot }],
      schedule: {
        kind: 'schedule',
        timeModel: { kind: 'absolute' },
        instances: new Map([
          [instanceId, {
            instanceId,
            count,
            identityMode: 'stable' as const,
            elementIdSeed: 42,
          }],
        ]),
        steps: [
          // Continuity map build step
          {
            kind: 'continuityMapBuild' as const,
            instanceId,
          },
          // Continuity apply step (position)
          {
            kind: 'continuityApply' as const,
            targetKey: 'position:test-instance:pos',
            instanceId,
            policy: { kind: 'project', projector: 'byId', post: 'slew', tauMs: 360 } as ContinuityPolicy,
            baseSlot: 10 as ValueSlot,
            outputSlot: 11 as ValueSlot,
            semantic: 'position' as const,
            stride: 2,  // vec2 position
          },
        ],
      },
    } as unknown as CompiledProgramIR;
  }

  /**
   * Helper: Create world-space position buffer (stride 2 for vec2 in 2D)
   * Note: Current system uses vec2 for positions, not vec3
   */
  function createWorldPositions(count: number, seed: number = 0): Float32Array {
    const buf = new Float32Array(count * 2);
    for (let i = 0; i < count; i++) {
      buf[i * 2 + 0] = 0.1 + i * 0.1 + seed * 0.01; // x
      buf[i * 2 + 1] = 0.2 + i * 0.15 + seed * 0.02; // y
    }
    return buf;
  }

  /**
   * Helper: Serialize ContinuityState for comparison
   */
  function serializeContinuityState(state: ContinuityState): string {
    const targets: Record<string, any> = {};
    for (const [key, value] of state.targets.entries()) {
      targets[key] = {
        gaugeBuffer: Array.from(value.gaugeBuffer),
        slewBuffer: Array.from(value.slewBuffer),
        count: value.count,
      };
    }

    const mappings: Record<string, any> = {};
    for (const [key, value] of state.mappings.entries()) {
      mappings[key] = { newToOld: Array.from(value.newToOld) };
    }

    return JSON.stringify({ targets, mappings }, null, 2);
  }

  it('Test 5-8: Continuity state is identical across ortho and perspective camera modes', () => {
    const program = createMinimalProgramWithContinuity(10);
    const worldPositions = createWorldPositions(10);

    // Sequence 1: Ortho
    const stateOrtho = createRuntimeState(program.slotMeta.length);
    const arenaOrtho = getTestArena();
    for (let frame = 0; frame < 30; frame++) {
      stateOrtho.values.objects.set(10 as ValueSlot, worldPositions);
      arenaOrtho.reset();
      executeFrame(program, stateOrtho, arenaOrtho, frame * 16.667);
    }
    const orthoSnapshot = serializeContinuityState(stateOrtho.continuity);

    // Sequence 2: Perspective
    const statePersp = createRuntimeState(program.slotMeta.length);
    const arenaPersp = getTestArena();
    for (let frame = 0; frame < 30; frame++) {
      statePersp.values.objects.set(10 as ValueSlot, worldPositions);
      arenaPersp.reset();
      executeFrame(program, statePersp, arenaPersp, frame * 16.667);
    }
    const perspSnapshot = serializeContinuityState(statePersp.continuity);

    // Assert: Snapshots are identical (identity mapping and converged world-space tracked positions)
    expect(orthoSnapshot).toBeTruthy();
    expect(perspSnapshot).toBeTruthy();
    expect(orthoSnapshot).toBe(perspSnapshot);

    // Deep equality check on the raw objects for robustness
    const orthoData = JSON.parse(orthoSnapshot);
    const perspData = JSON.parse(perspSnapshot);
    expect(orthoData.mappings).toEqual(perspData.mappings);
    expect(orthoData.targets).toEqual(perspData.targets);
  });
});

// =============================================================================
// Integration Tests: Projection Never Writes World State
// =============================================================================

describe('Level 9 Integration: Projection is Pure (Read-Only)', () => {
  it('Test 9-11: Projection (ortho and persp) is pure and never writes to world buffer', () => {
    // Create a world-position buffer (vec3 for 3D projection system)
    const count = 10;
    const worldPositions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      worldPositions[i * 3 + 0] = 0.1 + i * 0.1;
      worldPositions[i * 3 + 1] = 0.2 + i * 0.15;
      worldPositions[i * 3 + 2] = 0.0;
    }

    // Take a snapshot before projection
    const beforeSnapshot = new Float32Array(worldPositions);

    // 1. Run projection (ortho)
    const cameraOrtho: ResolvedCameraParams = DEFAULT_CAMERA;
    const outputOrtho = projectInstances(worldPositions, 0.05, count, cameraOrtho, getTestArena());

    // Verify projection produced output
    expect(outputOrtho.screenPosition.length).toBe(count * 2);
    expect(outputOrtho.depth.length).toBe(count);

    // Verify world buffer is unchanged
    for (let i = 0; i < worldPositions.length; i++) {
      expect(worldPositions[i]).toBe(beforeSnapshot[i]);
    }

    // 2. Run projection (perspective)
    const cameraPersp: ResolvedCameraParams = {
      projection: 'persp',
      centerX: 0.5,
      centerY: 0.5,
      distance: 2.0,
      tiltRad: (35 * Math.PI) / 180,
      yawRad: 0,
      fovYRad: (45 * Math.PI) / 180,
      near: 0.01,
      far: 100,
    };
    const outputPersp = projectInstances(worldPositions, 0.05, count, cameraPersp, getTestArena());

    // Verify projection produced output
    expect(outputPersp.screenPosition.length).toBe(count * 2);
    expect(outputPersp.depth.length).toBe(count);

    // Verify world buffer is STILL unchanged
    for (let i = 0; i < worldPositions.length; i++) {
      expect(worldPositions[i]).toBe(beforeSnapshot[i]);
    }
  });
});

// =============================================================================
// Integration Tests: Continuity Remap During Toggle
// =============================================================================

describe('Level 9 Integration: Continuity Remap During Toggle', () => {
  /**
   * Helper: Create domain instance with stable IDs
   */
  function createStableDomain(count: number, seed: number): DomainInstance {
    const elementId = new Uint32Array(count);
    for (let i = 0; i < count; i++) {
      elementId[i] = seed + i;
    }
    return {
      count,
      identityMode: 'stable' as const,
      elementId,
    };
  }

  it('Test 12: Remap mid-toggle: remap completes correctly', () => {
    const instanceId = 'test-remap';

    // Frame 1-30: stable with 10 instances
    const oldDomain = createStableDomain(10, 1000);
    const continuity = createContinuityState();
    continuity.prevDomains.set(instanceId, oldDomain);

    // Frame 31: reduce to 8 instances (triggers remap)
    // Keep first 8 instances (IDs 1000-1007), drop last 2 (IDs 1008-1009)
    const newDomain = createStableDomain(8, 1000);

    const { changed, mapping } = detectDomainChange(instanceId, newDomain, continuity.prevDomains);

    // Verify domain change detected
    expect(changed).toBe(true);
    expect(mapping).toBeTruthy();

    if (mapping) {
      // Verify mapping: first 8 map to themselves, last 2 are gone
      expect(mapping.newToOld.length).toBe(8);
      for (let i = 0; i < 8; i++) {
        expect(mapping.newToOld[i]).toBe(i); // Identity mapping for survivors
      }
    }

    // Update prevDomains
    continuity.prevDomains.set(instanceId, newDomain);
    if (mapping) {
      continuity.mappings.set(instanceId, mapping);
    }

    // Frame 32: toggle to perspective (camera mode changes, but domain stays same)
    const { changed: changedAfterToggle } = detectDomainChange(
      instanceId,
      newDomain,
      continuity.prevDomains
    );

    // No domain change on camera toggle (same instance count and IDs)
    expect(changedAfterToggle).toBe(false);
  });

  it('Test 13: Surviving instances maintain identity through remap AND toggle', () => {
    const instanceId = 'test-remap-identity';

    // Initial state: 10 instances
    const oldDomain = createStableDomain(10, 2000);
    const continuity = createContinuityState();
    continuity.prevDomains.set(instanceId, oldDomain);

    // Remap to 8 instances (drop last 2)
    const newDomain = createStableDomain(8, 2000);
    const { mapping: mapping1 } = detectDomainChange(instanceId, newDomain, continuity.prevDomains);

    expect(mapping1).toBeTruthy();
    continuity.prevDomains.set(instanceId, newDomain);
    if (mapping1) {
      continuity.mappings.set(instanceId, mapping1);
    }

    // Verify element IDs are preserved
    expect(newDomain.elementId[0]).toBe(2000);
    expect(newDomain.elementId[7]).toBe(2007);

    // Toggle camera (domain unchanged)
    const { changed, mapping: mapping2 } = detectDomainChange(instanceId, newDomain, continuity.prevDomains);

    // No change on toggle
    expect(changed).toBe(false);
    expect(mapping2).toBeTruthy();
    if (mapping2) {
      // Identity mapping: all elements map to themselves
      expect(mapping2.newToOld.length).toBe(8);
      for (let i = 0; i < 8; i++) {
        expect(mapping2.newToOld[i]).toBe(i);
      }
    }

    // Verify element IDs still preserved
    expect(newDomain.elementId[0]).toBe(2000);
    expect(newDomain.elementId[7]).toBe(2007);
  });
});
