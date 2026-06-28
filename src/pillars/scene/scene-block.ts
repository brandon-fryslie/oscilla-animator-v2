import { z } from 'zod';
import type { AssetId } from '../../core/ids';
import type {
  CameraPlan,
  ColorBinding,
  GeometryDef,
  RenderTarget,
  TransformBinding,
} from '../../render/scene-plan';

export interface SceneDiagnostic {
  readonly message: string;
  readonly blockId: string;
}

export interface InstanceBundle {
  readonly count: number;
  readonly transform: TransformBinding;
  readonly color: ColorBinding;
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

export type SceneContribution =
  | { readonly role: 'instanceSource'; readonly bundle: InstanceBundle }
  | { readonly role: 'draw'; readonly shell: DrawShell };

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

export interface ScenePortDeclaration {
  readonly id: string;
  readonly label: string;
  readonly direction: ScenePortDirection;
  readonly value: SceneValueKind;
}

export type SceneBlockCategory =
  | 'instance'
  | 'modifier'
  | 'draw'
  | 'material'
  | 'asset'
  | 'color';

export type SceneConfigControl =
  | 'number'
  | 'integer'
  | 'asset'
  | 'color'
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
  readonly displayName: string;
  readonly category: SceneBlockCategory;
  readonly ports: readonly ScenePortDeclaration[];
  readonly configFields: readonly SceneCatalogConfigField[];
}

export interface SceneCatalogConfigField extends SceneConfigFieldCatalog {
  readonly key: string;
}

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
  readonly contribute: (config: TConfig) => Extract<SceneContribution, { readonly role: TRole }>;
}

export interface SceneBlockDeclaration<
  TFields extends SceneConfigFields,
  TRole extends SceneContributionRole,
> {
  readonly type: string;
  readonly role: TRole;
  readonly catalog: Omit<SceneCatalogMetadata, 'configFields'>;
  readonly config: TFields;
  readonly contribute: (
    config: SceneConfigFor<TFields>,
  ) => Extract<SceneContribution, { readonly role: TRole }>;
}

type SceneConfigShape<TFields extends SceneConfigFields> = {
  readonly [K in keyof TFields]: TFields[K]['schema'];
};

export function defineSceneBlock<
  const TFields extends SceneConfigFields,
  const TRole extends SceneContributionRole,
>(
  declaration: SceneBlockDeclaration<TFields, TRole>,
): SceneBlockDefinition<SceneConfigFor<TFields>, TRole> {
  // [LAW:one-source-of-truth] One field map derives both parsing and catalog metadata.
  const configSchema = z.object(configShape(declaration.config)) as z.ZodType<
    SceneConfigFor<TFields>
  >;
  const catalog: SceneCatalogMetadata = {
    ...declaration.catalog,
    configFields: Object.entries(declaration.config).map(([key, field]) => ({
      key,
      ...field.catalog,
    })),
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
    contribute: declaration.contribute,
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
  optionalAssetId: (
    catalog: SceneConfigFieldCatalog,
  ): SceneConfigField<string | undefined> => ({
    // [LAW:types-are-the-program] Empty strings are not asset identities.
    schema: z.string().min(1).optional(),
    catalog,
  }),
} as const;
