export interface ExpressionInlineDiagnostic {
  readonly code: string;
  readonly severity: 'error' | 'warning';
  readonly message: string;
  readonly start: number;
  readonly end: number;
}
