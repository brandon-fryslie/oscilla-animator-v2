export interface DiagnosticSourceRange {
  readonly start: number;
  readonly end: number;
}

export interface BlockParamSourceSpan {
  readonly kind: 'blockParam';
  readonly blockId: string;
  readonly paramId: string;
  readonly range?: DiagnosticSourceRange;
  readonly suggestion?: string;
}
