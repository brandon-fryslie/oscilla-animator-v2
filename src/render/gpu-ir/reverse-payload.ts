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
  SystemCameraUpdateSpec,
  DrawCallSpec,
  PipelineStateSpec,
  StaticGeometrySpec,
  GlobalSpec,
  ArenaScalarSpec,
  FieldSpec,
  TextureSpec,
  SamplerSpec,
  RosterEntry,
  StatementIR,
} from '../rust/boundary-contract';
import { stmtsToSource } from './reverse';
import { OPAQUE, ALPHA_BLEND, DEPTH_TEST } from './compile';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function payloadToSource(payload: PipelineInstallPayload): string {
  // Collect camera passes — they're derived from render() and shouldn't appear in output
  const cameraPasses = new Map<string, SystemCameraUpdateSpec>();
  for (const entry of payload.roster) {
    if (entry.type === 'System_CameraUpdate') {
      cameraPasses.set(entry.cameraRef, entry);
    }
  }

  // Identify camera-derived globals/scalars to filter from manifest
  const cameraGlobalKeys = new Set<string>();
  const cameraScalarKeys = new Set<string>();
  for (const vpSymbol of cameraPasses.keys()) {
    // vpSymbol is e.g. "cam:draw:vp" — prefix is "cam:draw"
    const prefix = vpSymbol.replace(/:vp$/, '');
    cameraScalarKeys.add(vpSymbol);
    // Find matching globals with this prefix
    for (const key of Object.keys(payload.manifest.globals)) {
      if (key.startsWith(prefix + ':') && key !== vpSymbol) {
        cameraGlobalKeys.add(key);
      }
    }
  }
  // sys:resolution is auto-injected when cameras exist
  if (cameraPasses.size > 0) cameraGlobalKeys.add('sys:resolution');

  const lines: string[] = ['gpu({'];
  lines.push(emitManifest(payload.manifest, cameraGlobalKeys, cameraScalarKeys));
  lines.push('  roster: [');
  for (const entry of payload.roster) {
    // Skip camera passes — they're reconstructed from render()'s camera arg
    if (entry.type === 'System_CameraUpdate') continue;
    if (entry.type === 'Render') {
      lines.push(emitRender(entry, payload.manifest, cameraPasses));
    } else {
      lines.push(emitRosterEntry(entry, payload.manifest));
    }
  }
  lines.push('  ],');
  lines.push('})');
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Manifest emission — compact form (inverse of expandManifest)
// ---------------------------------------------------------------------------

function emitManifest(
  m: MemoryManifest,
  excludeGlobals: Set<string>,
  excludeScalars: Set<string>,
): string {
  const sections: string[] = [];

  if (m.preserveStateOnRecompile) {
    sections.push(`  preserveStateOnRecompile: true,`);
  }

  const filteredGlobals = filterKeys(m.globals, excludeGlobals);
  if (Object.keys(filteredGlobals).length > 0) {
    sections.push(`  globals: ${emitObj(filteredGlobals, emitGlobal)},`);
  }
  const filteredScalars = filterKeys(m.arenaScalars, excludeScalars);
  if (Object.keys(filteredScalars).length > 0) {
    sections.push(`  scalars: ${emitObj(filteredScalars, emitScalar)},`);
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
    case 'System_CameraUpdate':
    case 'Render':
      throw new Error(`emitRosterEntry: ${entry.type} should be handled by caller`);
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

function emitRender(
  pass: RenderPassSpec,
  manifest: MemoryManifest,
  cameraPasses: Map<string, SystemCameraUpdateSpec>,
): string {
  const targets = emitTargets(pass.targets);
  // [LAW:one-type-per-behavior] Composite is a Render pass with no camera.
  // We distinguish at the DSL emit layer by checking whether a matching
  // camera pass exists for this passId — no separate wire type needed.
  const vpSymbol = `cam:${pass.passId}:vp`;
  const hasCamera = cameraPasses.has(vpSymbol);
  if (!hasCamera) {
    const draws = pass.drawCalls.map(dc => emitDrawCall(dc, manifest, '')).join('\n');
    return `    composite(${quote(pass.passId)}, ${targets}, [\n${draws}\n    ]),`;
  }
  const camera = reconstructCamera(pass.passId, manifest, cameraPasses);
  const draws = pass.drawCalls.map(dc => emitDrawCall(dc, manifest, vpSymbol)).join('\n');
  return `    render(${quote(pass.passId)}, ${camera}, ${targets}, [\n${draws}\n    ]),`;
}

function emitDrawCall(dc: DrawCallSpec, manifest: MemoryManifest, _vpSymbol: string): string {
  const source = emitDrawSource(dc.source);
  const state = emitPipelineState(dc.pipelineState);
  const domainId = dc.source.type === 'Domain' ? dc.source.domainId : '';

  // Strip semantic nodes (ApplyVP, ApplyTransform2D) and reconstruct declarations
  const { ast: vertexAst, transform } = stripSemanticNodes(dc.vertexAst, domainId);

  // Infer vertex params from shape vertex layout
  const vertexParams = inferVertexParams(dc, manifest);
  const vertexBody = stmtsToSource(vertexAst, 5);
  const vertexArrow = `(${vertexParams.join(', ')}) => {\n${vertexBody}\n          }`;

  // Build shader options
  const shaderOpts: string[] = [];
  if (transform) {
    const fields = [`posX: ${quote(transform.posX)}, posY: ${quote(transform.posY)}`];
    if (transform.rotation) fields.push(`rotation: ${quote(transform.rotation)}`);
    if (transform.scale) fields.push(`scale: ${quote(transform.scale)}`);
    shaderOpts.push(`        transform: { ${fields.join(', ')} },`);
  }
  if (dc.varyings && Object.keys(dc.varyings).length > 0) {
    shaderOpts.push(`        varyings: ${emitJson(dc.varyings)},`);
  }
  shaderOpts.push(`        vertex: ${vertexArrow},`);

  // Omit fragment if it's a passthrough
  if (!isPassthroughFragment(dc.fragmentAst)) {
    const fragmentParams = inferFragmentParams(dc);
    const fragmentBody = stmtsToSource(dc.fragmentAst, 5);
    const fragmentArrow = `(${fragmentParams.join(', ')}) => {\n${fragmentBody}\n          }`;
    shaderOpts.push(`        fragment: ${fragmentArrow},`);
  }

  return `      draw(${quote(dc.intentId)}, ${source}, ${state}, {\n${shaderOpts.join('\n')}\n      }),`;
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
  // Recognize DSL helpers for single-color-target patterns
  if (targets.colors.length === 1 && !('depthStencil' in targets && targets.depthStencil)) {
    const ct = targets.colors[0];
    const isDefaultAttachmentState =
      (ct.blendMode == null || ct.blendMode === 'opaque')
      && (ct.writeMask == null || JSON.stringify(ct.writeMask) === JSON.stringify(['r', 'g', 'b', 'a']));
    if (ct.loadOp === 'clear' && ct.clearColor) {
      const cc = ct.clearColor;
      if (isDefaultAttachmentState) {
        if (ct.textureId === 'canvas') return `clearTarget([${cc.join(', ')}])`;
        return `clearTexture(${quote(ct.textureId)}, [${cc.join(', ')}])`;
      }
    }
    if (ct.loadOp === 'load' && ct.textureId === 'canvas' && isDefaultAttachmentState) return `loadTarget()`;
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
  if (dc.varyings) return Object.keys(dc.varyings);
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

function filterKeys<T>(record: Record<string, T>, exclude: Set<string>): Record<string, T> {
  const result: Record<string, T> = {};
  for (const [k, v] of Object.entries(record)) {
    if (!exclude.has(k)) result[k] = v;
  }
  return result;
}

// ---------------------------------------------------------------------------
// Camera reconstruction — derive CameraSpec from compiled globals
// ---------------------------------------------------------------------------

const ORTHO_PARAMS = ['center_x', 'center_y', 'zoom'] as const;
const PERSPECTIVE_PARAMS = ['center_x', 'center_y', 'fov', 'distance', 'tilt', 'yaw'] as const;

function reconstructCamera(
  passId: string,
  manifest: MemoryManifest,
  _cameraPasses: Map<string, SystemCameraUpdateSpec>,
): string {
  const prefix = `cam:${passId}`;
  // Detect type by checking for perspective-only params
  const hasFov = `${prefix}:fov` in manifest.globals;
  if (hasFov) {
    const params = PERSPECTIVE_PARAMS.map(p => manifest.globals[`${prefix}:${p}`]?.defaultValue);
    // Only emit non-default params
    const opts: string[] = [];
    const defaults = { centerX: 0, centerY: 0, fov: 45, distance: 2, tilt: 35, yaw: 0 };
    const names = ['centerX', 'centerY', 'fov', 'distance', 'tilt', 'yaw'] as const;
    for (let i = 0; i < PERSPECTIVE_PARAMS.length; i++) {
      const val = params[i] ?? 0;
      if (val !== defaults[names[i]]) {
        opts.push(`${names[i]}: ${val}`);
      }
    }
    return opts.length > 0 ? `perspective({ ${opts.join(', ')} })` : 'perspective()';
  }

  // Ortho
  const params = ORTHO_PARAMS.map(p => manifest.globals[`${prefix}:${p}`]?.defaultValue);
  const opts: string[] = [];
  const defaults = { centerX: 0, centerY: 0, zoom: 1 };
  const names = ['centerX', 'centerY', 'zoom'] as const;
  for (let i = 0; i < ORTHO_PARAMS.length; i++) {
    const val = params[i] ?? 0;
    if (val !== defaults[names[i]]) {
      opts.push(`${names[i]}: ${val}`);
    }
  }
  return opts.length > 0 ? `ortho({ ${opts.join(', ')} })` : 'ortho()';
}

// ---------------------------------------------------------------------------
// VP injection stripping — reverse of compile's auto-inject
// ---------------------------------------------------------------------------

/** Result of stripping semantic nodes from vertex AST. */
interface StrippedVertex {
  readonly ast: StatementIR[];
  readonly transform?: { posX: string; posY: string; rotation?: string; scale?: string };
}

/**
 * Strip auto-injected semantic nodes (ApplyVP, ApplyTransform2D) from vertex AST.
 * Returns the cleaned AST plus any reconstructed transform declaration.
 */
function stripSemanticNodes(ast: readonly StatementIR[], domainId: string): StrippedVertex {
  let transform: StrippedVertex['transform'];
  const stripped = ast.map(stmt => {
    if (stmt.type !== 'ReturnVertex') return stmt;
    let pos = stmt.position;

    // Strip ApplyVP (outermost wrapper)
    if (pos.type === 'ApplyVP') pos = pos.position;

    // Strip ApplyTransform2D and reconstruct transform declaration
    if (pos.type === 'ApplyTransform2D') {
      const t = pos;
      const prefix = domainId + ':';
      const fieldName = (e: StatementIR['type'] extends string ? any : never) =>
        e.type === 'LoadField' && e.symbolId.startsWith(prefix)
          ? e.symbolId.slice(prefix.length)
          : undefined;

      const posX = fieldName(t.translateX);
      const posY = fieldName(t.translateY);
      const rotation = fieldName(t.rotation);
      const scale = fieldName(t.scale);

      if (posX && posY) {
        transform = {
          posX, posY,
          ...(rotation && t.rotation.type !== 'LiteralF32' ? { rotation } : {}),
          ...(scale && t.scale.type !== 'LiteralF32' ? { scale } : {}),
        };
      }
      pos = t.position;
    }

    return { ...stmt, position: pos };
  });
  return { ast: stripped, transform };
}

/** Detect passthrough fragment: single ReturnFragment whose outputs are all VarRefs. */
function isPassthroughFragment(ast: readonly StatementIR[]): boolean {
  if (ast.length !== 1) return false;
  const stmt = ast[0];
  if (stmt.type !== 'ReturnFragment') return false;
  return Object.values(stmt.outputs).every(e => e.type === 'VarRef');
}
