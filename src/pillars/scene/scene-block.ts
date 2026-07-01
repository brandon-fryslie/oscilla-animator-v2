import { z } from 'zod';
import type { AssetId } from '../../core/ids';
import type {
  CameraPlan,
  GeometryDef,
  PlanExpr,
  RenderTarget,
  TransformBinding,
} from '../../render/scene-plan';
import type { ColorPlan } from './color';

export interface SceneDiagnostic {
  readonly message: string;
  readonly blockId: string;
}

export interface InstanceBundle {
  readonly count: number;
  readonly transform: TransformBinding;
  readonly color: ColorPlan;
}

export type MaterialShell =
  | { readonly kind: 'unlitColor' }
  | { readonly kind: 'texturedUnlit'; readonly assetId: AssetId };

export interface DrawShell {
  readonly geometry: GeometryDef;
  readonly material: MaterialShell;
  readonly camera: CameraPlan;
  readonly target: RenderTarget;
}

/**
 * A pure transform from one instance bundle to another. A modifier rewrites the
 * `TransformBinding` / `ColorBinding` `PlanExpr` trees of its upstream bundle —
 * count and the bundle's shape are preserved; only the per-instance value
 * expressions change.
 *
 * [LAW:effects-at-boundaries] This is a pure description-rewriting function: it
 *   composes `PlanExpr` trees, it does not evaluate them. Evaluation happens in
 *   TSL behind the renderer seam.
 */
export type BundleTransform = (input: InstanceBundle) => InstanceBundle;

/**
 * What a scene block hands to assembly.
 *
 * - `instanceSource` carries a concrete bundle (a source: config → bundle).
 * - `modifier` carries a bundle *transform* (a modifier: bundle → bundle); the
 *   concrete bundle is produced only once assembly folds it over its upstream.
 * - `draw` carries the shell assembly joins to the resolved upstream bundle.
 * - `scalarSource` carries a single scalar `PlanExpr` a routable knob reads in
 *   place of its config default (a Constant is `konst(value)`, a clock is
 *   `input('time')`). It never feeds an instance chain — only a knob input port.
 *
 * [LAW:dataflow-not-control-flow] A modifier's behavior is the `apply` *value*,
 *   not a branch in assembly: folding the modifier chain is one generic walk, so
 *   adding a modifier adds no assembly code path.
 */
export type SceneContribution =
  | { readonly role: 'instanceSource'; readonly bundle: InstanceBundle }
  | { readonly role: 'modifier'; readonly apply: BundleTransform }
  | { readonly role: 'draw'; readonly shell: DrawShell }
  | { readonly role: 'scalarSource'; readonly value: PlanExpr };

export type SceneContributionRole = SceneContribution['role'];

export type SceneValueKind =
  | 'instanceBundle'
  | 'geometry'
  | 'materialShell'
  | 'texture'
  | 'camera'
  | 'color'
  | 'scalar'
  | 'mask';

export type ScenePortDirection = 'input' | 'output';

/**
 * How an input port is fed when the author draws no wire to it — a *typed* port
 * property, so "defaultable vs required" is representable, not folded into a
 * codepath.
 *
 * - `required`: the port MUST be wired; unwired is a loud error (a draw's primary
 *   instance bundle has no meaningful default).
 * - `configScalar`: the port has a canonical default *source* — a Constant
 *   carrying the value of config field `configKey`. When the port is unwired the
 *   compiler synthesizes that source, so every knob input has exactly one source
 *   and resolution never branches on wired/unwired.
 *
 * [LAW:no-silent-failure] A required input left unwired is surfaced, never
 *   silently defaulted. [LAW:one-source-of-truth] The default's constant lives in
 *   config; the synthesized source is derived from it, never a second copy.
 */
export type ScenePortInputDefault =
  | { readonly kind: 'required' }
  | { readonly kind: 'configScalar'; readonly configKey: string };

interface ScenePortBase {
  readonly id: string;
  readonly label: string;
  readonly value: SceneValueKind;
}

/**
 * A declared port. Discriminated on `direction`: only an input port carries a
 * `default` policy (an output produces a value, it is never fed).
 *
 * [LAW:types-are-the-program] The default policy is unrepresentable on an output
 *   and mandatory on an input — the shape forbids the illegal combinations.
 */
export type ScenePortDeclaration =
  | (ScenePortBase & { readonly direction: 'output' })
  | (ScenePortBase & {
      readonly direction: 'input';
      readonly default: ScenePortInputDefault;
    });

export type SceneBlockCategory =
  | 'instance'
  | 'modifier'
  | 'draw'
  | 'material'
  | 'asset'
  | 'color'
  // A scalar signal source (Constant, Time) — produces one routable scalar value.
  | 'signal';

export type SceneConfigControl =
  | 'number'
  | 'integer'
  | 'asset'
  | 'color'
  | 'colorList'
  | 'toggle'
  | 'select';

export interface SceneConfigFieldCatalog {
  readonly label: string;
  readonly control: SceneConfigControl;
}

export interface SceneConfigField<TValue> {
  readonly schema: z.ZodType<TValue>;
  readonly catalog: SceneConfigFieldCatalog;
}

export type SceneConfigFields = Readonly<Record<string, SceneConfigField<unknown>>>;

export type SceneConfigFor<TFields extends SceneConfigFields> = {
  readonly [K in keyof TFields]: z.infer<TFields[K]['schema']>;
};

export interface SceneCatalogMetadata {
  /** The block type this catalog entry describes — what the palette instantiates. */
  readonly type: string;
  readonly displayName: string;
  readonly category: SceneBlockCategory;
  readonly ports: readonly ScenePortDeclaration[];
  readonly configFields: readonly SceneCatalogConfigField[];
}

export interface SceneCatalogConfigField extends SceneConfigFieldCatalog {
  readonly key: string;
  /**
   * The field's authored default value, when it has one (a knob carries its
   * `SceneScalarKnob.default`). A field with no authored default omits this and
   * falls to the editor's control-generic default. [LAW:one-source-of-truth] For
   *   a knob this is derived from `SceneScalarKnob.default` alongside the zod
   *   `.default`, in `defineSceneBlock` — one authored source, two projections.
   */
  readonly defaultValue?: number;
}

/**
 * A routable scalar knob: a numeric parameter that is *both* a persisted config
 * default AND a scalar input port a wire can override. One declaration projects
 * to a config field (the default's constant), a scalar input port, and a resolved
 * `PlanExpr` handed to `contribute`.
 *
 * [LAW:one-source-of-truth] A knob is one declaration, not a config field and a
 *   port and a default kept in sync by hand.
 */
export interface SceneScalarKnob {
  readonly label: string;
  readonly default: number;
}

export type SceneKnobFields = Readonly<Record<string, SceneScalarKnob>>;

/** A knob's persisted config value: a finite number (its default source's constant). */
type KnobConfigFor<TKnobs extends SceneKnobFields> = {
  readonly [K in keyof TKnobs]: number;
};

/** The resolved scalar `PlanExpr` feeding each knob input port at compile time. */
export type KnobInputsFor<TKnobs extends SceneKnobFields> = {
  readonly [K in keyof TKnobs]: PlanExpr;
};

export interface SceneBlockDefinition<
  TConfig,
  TRole extends SceneContributionRole = SceneContributionRole,
> {
  readonly type: string;
  readonly role: TRole;
  readonly catalog: SceneCatalogMetadata;
  readonly configSchema: z.ZodType<TConfig>;
  readonly readConfig: (
    raw: Readonly<Record<string, unknown>>,
    blockId: string,
    diagnostics: SceneDiagnostic[],
  ) => TConfig | null;
  /**
   * Produce the block's contribution from its parsed config and its resolved
   * scalar knob inputs. `inputs` is keyed by knob (= scalar input port) id; the
   * compiler guarantees every knob is present (a wired source or the synthesized
   * config default), so a block reads `inputs.x` with no wired/unwired branch.
   */
  readonly contribute: (
    config: TConfig,
    inputs: Readonly<Record<string, PlanExpr>>,
  ) => Extract<SceneContribution, { readonly role: TRole }>;
}

export interface SceneBlockDeclaration<
  TFields extends SceneConfigFields,
  TKnobs extends SceneKnobFields,
  TRole extends SceneContributionRole,
> {
  readonly type: string;
  readonly role: TRole;
  // `type` and `configFields` are derived from the declaration, not repeated here.
  readonly catalog: Omit<SceneCatalogMetadata, 'configFields' | 'type'>;
  readonly config: TFields;
  /** Routable scalar knobs; omit for a block with no routable parameters. */
  readonly knobs?: TKnobs;
  readonly contribute: (
    config: SceneConfigFor<TFields> & KnobConfigFor<TKnobs>,
    inputs: KnobInputsFor<TKnobs>,
  ) => Extract<SceneContribution, { readonly role: TRole }>;
}

type SceneConfigShape<TFields extends SceneConfigFields> = {
  readonly [K in keyof TFields]: TFields[K]['schema'];
};

export function defineSceneBlock<
  const TFields extends SceneConfigFields,
  const TKnobs extends SceneKnobFields,
  const TRole extends SceneContributionRole,
>(
  declaration: SceneBlockDeclaration<TFields, TKnobs, TRole>,
): SceneBlockDefinition<SceneConfigFor<TFields> & KnobConfigFor<TKnobs>, TRole> {
  const knobs: SceneKnobFields = declaration.knobs ?? {};

  // [LAW:one-source-of-truth] Each knob derives its config field (default
  //   source's constant), its scalar input port, and its catalog control from one
  //   declaration — never three hand-synced copies.
  const knobSchema = Object.fromEntries(
    Object.entries(knobs).map(([key, knob]) => [key, z.number().finite().default(knob.default)]),
  );
  const configSchema = z.object({
    ...configShape(declaration.config),
    ...knobSchema,
  }) as z.ZodType<SceneConfigFor<TFields> & KnobConfigFor<TKnobs>>;

  const knobPorts: ScenePortDeclaration[] = Object.entries(knobs).map(([key, knob]) => ({
    id: key,
    label: knob.label,
    direction: 'input',
    value: 'scalar',
    default: { kind: 'configScalar', configKey: key },
  }));

  const configFields: SceneCatalogConfigField[] = [
    ...Object.entries(declaration.config).map(([key, field]) => ({ key, ...field.catalog })),
    ...Object.entries(knobs).map(([key, knob]) => ({
      key,
      label: knob.label,
      control: 'number' as const,
      // [LAW:one-source-of-truth] The knob's authored default flows to the catalog
      //   field here, so a freshly-added block seeds this value — not a generic 1.
      defaultValue: knob.default,
    })),
  ];

  const catalog: SceneCatalogMetadata = {
    type: declaration.type,
    ...declaration.catalog,
    ports: [...declaration.catalog.ports, ...knobPorts],
    configFields,
  };

  return {
    type: declaration.type,
    role: declaration.role,
    catalog,
    configSchema,
    readConfig: (raw, blockId, diagnostics) => {
      const result = configSchema.safeParse(raw);
      if (result.success) return result.data;
      for (const issue of result.error.issues) {
        diagnostics.push({
          blockId,
          message: formatConfigIssue(blockId, declaration.type, issue),
        });
      }
      return null;
    },
    // The declaration's `contribute` reads a knob-typed inputs record; the erased
    // definition hands it a loose `Record<string, PlanExpr>` the compiler fills.
    contribute: declaration.contribute as SceneBlockDefinition<
      SceneConfigFor<TFields> & KnobConfigFor<TKnobs>,
      TRole
    >['contribute'],
  };
}

function configShape<TFields extends SceneConfigFields>(
  fields: TFields,
): SceneConfigShape<TFields> {
  return Object.fromEntries(
    Object.entries(fields).map(([key, field]) => [key, field.schema]),
  ) as SceneConfigShape<TFields>;
}

function formatConfigIssue(blockId: string, blockType: string, issue: z.core.$ZodIssue): string {
  const path = issue.path.length === 0 ? '<root>' : issue.path.join('.');
  return `[scene] block '${blockId}' (${blockType}): config '${path}' ${issue.message}`;
}

export interface SceneRegistry {
  readonly get: (type: string) => SceneBlockDefinition<unknown> | undefined;
  readonly catalog: readonly SceneCatalogMetadata[];
}

export function buildSceneRegistry(
  blocks: readonly SceneBlockDefinition<unknown>[],
): SceneRegistry {
  const byType = new Map<string, SceneBlockDefinition<unknown>>();
  for (const block of blocks) {
    validateSceneBlockDefinition(block);
    if (byType.has(block.type)) {
      throw new Error(`[scene] Duplicate scene block type in registry: '${block.type}'`);
    }
    byType.set(block.type, block);
  }
  return {
    get: (type) => byType.get(type),
    catalog: Array.from(byType.values(), (block) => block.catalog),
  };
}

function validateSceneBlockDefinition(block: SceneBlockDefinition<unknown>): void {
  const catalog = block.catalog;
  const missing = [
    requiredText(block.type, 'type'),
    requiredValue(catalog, 'catalog'),
    catalog === undefined ? null : requiredText(catalog.displayName, 'catalog.displayName'),
    catalog === undefined ? null : requiredText(catalog.category, 'catalog.category'),
    catalog === undefined ? null : requiredItems(catalog.ports, 'catalog.ports'),
    requiredValue(block.configSchema, 'configSchema'),
  ].filter((entry): entry is string => entry !== null);

  if (missing.length > 0) {
    throw new Error(`[scene] invalid scene block contract '${block.type || '<unknown>'}': ${missing.join(', ')}`);
  }
}

function requiredText(value: string, label: string): string | null {
  return value.length === 0 ? label : null;
}

function requiredItems(value: readonly unknown[], label: string): string | null {
  return value.length === 0 ? label : null;
}

function requiredValue(value: unknown, label: string): string | null {
  return value === undefined || value === null ? label : null;
}

export const sceneConfig = {
  finiteNumber: (catalog: SceneConfigFieldCatalog): SceneConfigField<number> => ({
    schema: z.number().finite(),
    catalog,
  }),
  positiveNumber: (catalog: SceneConfigFieldCatalog): SceneConfigField<number> => ({
    schema: z.number().finite().positive(),
    catalog,
  }),
  positiveInt: (catalog: SceneConfigFieldCatalog): SceneConfigField<number> => ({
    schema: z.number().int().positive(),
    catalog,
  }),
  // A positive multiplier (e.g. an aspect ratio) that resolves to `fallback` when
  // omitted, so the default reproduces the canonical value with no `?? default`
  // branch at the read site. [LAW:dataflow-not-control-flow]
  ratio: (fallback: number, catalog: SceneConfigFieldCatalog): SceneConfigField<number> => ({
    schema: z.number().finite().positive().default(fallback),
    catalog,
  }),
  // A closed set of string options with a `fallback` default. The schema both
  // validates the choice and, via the default, hands `contribute` a concrete
  // discriminant — so an omitted field never widens to a runtime `undefined`
  // check. [LAW:types-are-the-program]
  choice: <const TValues extends readonly [string, ...string[]]>(
    values: TValues,
    fallback: TValues[number],
    catalog: SceneConfigFieldCatalog,
  ): SceneConfigField<TValues[number]> => ({
    schema: z.enum(values).default(fallback),
    catalog,
  }),
  color: (catalog: SceneConfigFieldCatalog): SceneConfigField<string> => ({
    // [LAW:one-source-of-truth] An opaque `#rrggbb` value — one color, no
    //   exposed channels. The channel layout is minted only at the seam
    //   (`hexColorBinding`), never on the block API.
    schema: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'must be a #rrggbb hex color'),
    catalog,
  }),
  colorList: (catalog: SceneConfigFieldCatalog): SceneConfigField<readonly string[]> => ({
    // [LAW:one-source-of-truth] A list of opaque `#rrggbb` values — a palette or
    //   gradient's stops — with the same per-entry opaqueness as `color`. ≥2 so a
    //   palette/ramp is meaningful; the channel layout still lives only at the
    //   seam (`paletteColorPlan` / `gradientLutColorPlan`), never on the API.
    schema: z
      .array(z.string().regex(/^#[0-9a-fA-F]{6}$/, 'must be a #rrggbb hex color'))
      .min(2, 'needs at least two colors'),
    catalog,
  }),
  optionalAssetId: (
    catalog: SceneConfigFieldCatalog,
  ): SceneConfigField<string | undefined> => ({
    // [LAW:types-are-the-program] Empty strings are not asset identities.
    schema: z.string().min(1).optional(),
    catalog,
  }),
} as const;
