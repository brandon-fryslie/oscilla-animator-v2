/**
 * GPU-IR DSL: Full payload reverse translator.
 *
 * Converts a PipelineInstallPayload into a gpu({...}) DSL source string
 * that, when evaluated via evalDsl(), produces the identical payload.
 *
 * Helper emission is discriminant-driven — no branching on defaults.
 * [LAW:one-source-of-truth] Uses the same helpers the forward path defines.
 */

import type {
  PipelineInstallPayload,
  MemoryManifest,
  ComputePassSpec,
  RenderPassSpec,
  SystemPassSpec,
  DrawCallSpec,
  PipelineStateSpec,
  StaticGeometrySpec,
  GlobalSpec,
  ArenaScalarSpec,
  FieldSpec,
  TextureSpec,
  SamplerSpec,
  RosterEntry,
} from '../rust/boundary-contract';
import { stmtsToSource } from './reverse';
import { OPAQUE, ALPHA_BLEND, DEPTH_TEST } from './compile';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function payloadToSource(payload: PipelineInstallPayload): string {
  const lines: string[] = ['gpu({'];
  lines.push(emitManifest(payload.manifest));
  lines.push('  roster: [');
  for (const entry of payload.roster) {
    lines.push(emitRosterEntry(entry, payload.manifest));
  }
  lines.push('  ],');
  lines.push('})');
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Manifest emission — compact form (inverse of expandManifest)
// ---------------------------------------------------------------------------

function emitManifest(m: MemoryManifest): string {
  const sections: string[] = [];

  if (m.preserveStateOnRecompile) {
    sections.push(`  preserveStateOnRecompile: true,`);
  }

  if (Object.keys(m.globals).length > 0) {
    sections.push(`  globals: ${emitObj(m.globals, emitGlobal)},`);
  }
  if (Object.keys(m.arenaScalars).length > 0) {
    sections.push(`  scalars: ${emitObj(m.arenaScalars, emitScalar)},`);
  }
  if (Object.keys(m.domains).length > 0) {
    sections.push(`  domains: {`);
    for (const [id, domain] of Object.entries(m.domains)) {
      const fields = emitObj(domain.fields, emitField);
      sections.push(`    ${quote(id)}: { capacity: ${domain.capacity}, active: ${quote(domain.activeLanesSymbol)}, fields: ${fields} },`);
    }
    sections.push(`  },`);
  }
  if (Object.keys(m.textures).length > 0) {
    sections.push(`  textures: ${emitJson(m.textures)},`);
  }
  if (Object.keys(m.shapeBank).length > 0) {
    sections.push(`  shapes: {`);
    for (const [id, shape] of Object.entries(m.shapeBank)) {
      sections.push(`    ${quote(id)}: ${emitShape(shape)},`);
    }
    sections.push(`  },`);
  }
  if (Object.keys(m.samplers).length > 0) {
    sections.push(`  samplers: ${emitJson(m.samplers)},`);
  }

  return sections.join('\n');
}

function emitGlobal(_id: string, spec: GlobalSpec): string {
  // Compact: { f32: defaultValue, dynamic: isDynamic } or just 'f32' for simple case
  return `{ ${spec.type}: ${spec.defaultValue}, dynamic: ${spec.isDynamic} }`;
}

function emitScalar(_id: string, spec: ArenaScalarSpec): string {
  return `{ ${quote(spec.type)}: ${spec.clearValue} }`;
}

function emitField(_id: string, spec: FieldSpec): string {
  return `{ ${quote(spec.type)}: ${spec.clearValue} }`;
}

function emitShape(shape: StaticGeometrySpec): string {
  const verts = `[${(shape.vertexData as number[]).join(', ')}]`;
  return `tri(${verts})`;
}

// ---------------------------------------------------------------------------
// Roster entry emission
// ---------------------------------------------------------------------------

function emitRosterEntry(entry: RosterEntry, manifest: MemoryManifest): string {
  switch (entry.type) {
    case 'Compute': return emitCompute(entry, manifest);
    case 'System_DrawPrep': return emitDrawPrep(entry);
    case 'System_CameraUpdate': {
      const body = stmtsToSource(entry.ast, 2);
      return `    cameraPass('${entry.cameraRef}', () => {\n${body}\n    })`;
    }
    case 'Render': return emitRender(entry, manifest);
  }
}

function emitCompute(pass: ComputePassSpec, manifest: MemoryManifest): string {
  const dispatch = emitDispatch(pass.dispatch);
  const wgSize = `wg(${pass.workgroupSize.join(', ')})`;
  const body = stmtsToSource(pass.ast, 3);
  const arrow = `() => {\n${body}\n      }`;
  return `    compute(${quote(pass.passId)}, ${dispatch}, ${wgSize}, ${arrow}),`;
}

function emitDrawPrep(pass: SystemPassSpec): string {
  return `    drawPrep(${quote(pass.passId)}, ${quote(pass.activeLanesSymbol)}, ${pass.vertexCount}),`;
}

function emitRender(pass: RenderPassSpec, manifest: MemoryManifest): string {
  const targets = emitTargets(pass.targets);
  const draws = pass.drawCalls.map(dc => emitDrawCall(dc, manifest)).join('\n');
  return `    render(${quote(pass.passId)}, ${targets}, [\n${draws}\n    ]),`;
}

function emitDrawCall(dc: DrawCallSpec, manifest: MemoryManifest): string {
  const source = emitDrawSource(dc.source);
  const state = emitPipelineState(dc.pipelineState);

  // Infer vertex params from shape vertex layout
  const vertexParams = inferVertexParams(dc, manifest);
  const vertexBody = stmtsToSource(dc.vertexAst, 5);
  const vertexArrow = `(${vertexParams.join(', ')}) => {\n${vertexBody}\n          }`;

  // Infer fragment params from vertex varyings
  const fragmentParams = inferFragmentParams(dc);
  const fragmentBody = stmtsToSource(dc.fragmentAst, 5);
  const fragmentArrow = `(${fragmentParams.join(', ')}) => {\n${fragmentBody}\n          }`;

  return `      draw(${quote(dc.intentId)}, ${source}, ${state}, {\n        vertex: ${vertexArrow},\n        fragment: ${fragmentArrow},\n      }),`;
}

// ---------------------------------------------------------------------------
// Dispatch / source / targets / pipeline state helpers
// ---------------------------------------------------------------------------

function emitDispatch(dispatch: ComputePassSpec['dispatch']): string {
  switch (dispatch.mode) {
    case 'Exact': return `exact(${dispatch.x}, ${dispatch.y}, ${dispatch.z})`;
    case 'Domain': return `domain(${quote(dispatch.domainId)})`;
    case 'Texture': return `texDispatch(${quote(dispatch.textureId)})`;
  }
}

function emitDrawSource(source: DrawCallSpec['source']): string {
  switch (source.type) {
    case 'Domain': return `domainSource(${quote(source.domainId)}, ${quote(source.shapeId)}, ${quote(source.sourceKind)})`;
    case 'FullScreenQuad': return `fsQuadSource()`;
  }
}

function emitTargets(targets: RenderPassSpec['targets']): string {
  // Use clearTarget helper for the common single-canvas-clear pattern
  if (
    targets.colors.length === 1 &&
    targets.colors[0].textureId === 'canvas' &&
    targets.colors[0].loadOp === 'clear' &&
    targets.colors[0].clearColor &&
    !targets.depthStencil
  ) {
    const cc = targets.colors[0].clearColor!;
    return `clearTarget([${cc.join(', ')}])`;
  }
  return emitJson(targets);
}

function emitPipelineState(state: PipelineStateSpec): string {
  // Check against named presets
  if (deepEqual(state, OPAQUE)) return 'OPAQUE';
  if (deepEqual(state, ALPHA_BLEND)) return 'ALPHA_BLEND';
  if (deepEqual(state, DEPTH_TEST)) return 'DEPTH_TEST';
  return emitJson(state);
}

// ---------------------------------------------------------------------------
// Arrow parameter inference
// ---------------------------------------------------------------------------

function inferVertexParams(dc: DrawCallSpec, manifest: MemoryManifest): string[] {
  if (dc.source.type !== 'Domain') return [];
  const shape = manifest.shapeBank[dc.source.shapeId];
  if (!shape) return [];
  return Object.keys(shape.vertexLayout.attributes);
}

function inferFragmentParams(dc: DrawCallSpec): string[] {
  // Find ReturnVertex in vertex AST and extract varying keys
  for (const stmt of dc.vertexAst) {
    if (stmt.type === 'ReturnVertex') {
      return Object.keys(stmt.varyings);
    }
  }
  return [];
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function quote(s: string): string {
  return `'${s}'`;
}

function emitObj<T>(record: Record<string, T>, emitValue: (key: string, val: T) => string): string {
  const entries = Object.entries(record);
  if (entries.length === 0) return '{}';
  const inner = entries.map(([k, v]) => `${quote(k)}: ${emitValue(k, v)}`).join(', ');
  return `{ ${inner} }`;
}

function emitJson(value: unknown): string {
  return JSON.stringify(value, null, 2).replace(/"([^"]+)":/g, '$1:').replace(/"/g, "'");
}

function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
