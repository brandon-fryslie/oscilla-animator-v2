/**
 * src/pillars/block-api.ts
 *
 * Compiler-facing block definitions and manifest contribution shapes.
 */

export type NodeId = string & { readonly __nodeIdBrand: unique symbol };

export type DiagnosticSeverity = 'error' | 'warning' | 'info';

export interface Diagnostic {
  readonly severity: DiagnosticSeverity;
  readonly message: string;
  readonly blockId?: string;
}

export interface GlobalSpec {
  readonly type: string;
  readonly isDynamic: boolean;
  readonly defaultValue: unknown;
}

export interface ArenaScalarSpec {
  readonly type: string;
  readonly clearValue: number;
}

export interface DomainFieldSpec {
  readonly type: string;
  readonly clearValue: number;
}

export interface InstanceDomainSpec {
  readonly capacity: number;
  readonly activeLanesSymbol: string;
  readonly fields: Readonly<Record<string, DomainFieldSpec>>;
}

export interface TextureSpec {
  readonly dimension: string;
  readonly width: number;
  readonly height: number;
  readonly format: string;
  readonly usage: readonly string[];
  readonly depthOrArrayLayers?: number;
}

export interface StaticGeometrySpec {
  readonly topology: string;
  readonly vertexLayout: {
    readonly stride: number;
    readonly attributes: Readonly<
      Record<string, { readonly format: string; readonly shaderLocation: number }>
    >;
  };
  readonly vertexData: readonly number[];
}

export interface SamplerSpec {
  readonly magFilter: string;
  readonly minFilter: string;
}

export interface ManifestContribution {
  readonly globals?: Readonly<Record<string, GlobalSpec>>;
  readonly arenaScalars?: Readonly<Record<string, ArenaScalarSpec>>;
  readonly domains?: Readonly<Record<string, InstanceDomainSpec>>;
  readonly textures?: Readonly<Record<string, TextureSpec>>;
  readonly shapes?: Readonly<Record<string, StaticGeometrySpec>>;
  readonly samplers?: Readonly<Record<string, SamplerSpec>>;
}

export interface BlockDefinition<TConfig> {
  readonly type: string;
  readonly readConfig: (
    raw: Readonly<Record<string, unknown>>,
    diagnostics: Diagnostic[],
  ) => TConfig | null;
  readonly buildManifestContribution: (config: TConfig) => ManifestContribution;
}
