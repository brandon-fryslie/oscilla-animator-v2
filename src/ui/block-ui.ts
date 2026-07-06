import type { DockviewApi } from 'dockview';
import type { BlockId } from '../types';
import type {
  AnyBlockDef,
  BlockParamEditorDef,
} from '../blocks/registry';
import { openExpressionEditorPanel } from './dockview';
import type { DiagnosticsStore, ExpressionEditorStore } from '../stores';
import type { CatalogOpenBehavior } from './graphEditor/block-catalog';

export interface RunBlockOpenBehaviorContext {
  readonly blockId: BlockId;
  readonly api: DockviewApi | null;
  readonly diagnostics: DiagnosticsStore;
  readonly expressionEditor: ExpressionEditorStore;
}

function unreachableBehavior(behavior: never, message: string): never {
  throw new Error(`${message}: ${JSON.stringify(behavior)}`);
}

// The open behavior is a neutral, per-type fact supplied by the BlockCatalog; a
// backend without an expression editor reports `{ kind: 'none' }`.
export function hasBlockOpenBehavior(behavior: CatalogOpenBehavior): boolean {
  return behavior.kind !== 'none';
}

export function getBlockOpenBehaviorLabel(behavior: CatalogOpenBehavior): string {
  if (behavior.kind === 'expressionEditor') {
    return 'Open Expression Editor';
  }
  if (behavior.kind === 'none') {
    return 'Open';
  }
  return unreachableBehavior(behavior, 'Unhandled CatalogOpenBehavior in getBlockOpenBehaviorLabel');
}

export function runBlockOpenBehavior(
  behavior: CatalogOpenBehavior,
  context: RunBlockOpenBehaviorContext,
): void {
  if (behavior.kind === 'none') {
    return;
  }

  if (behavior.kind === 'expressionEditor') {
    context.expressionEditor.openForBlock(context.blockId);
    if (!context.api) {
      context.diagnostics.log({
        level: 'error',
        message: 'Expression editor open failed: Dockview API unavailable',
      });
      return;
    }
    openExpressionEditorPanel(context.api, context.blockId);
    return;
  }
  return unreachableBehavior(behavior, 'Unhandled CatalogOpenBehavior in runBlockOpenBehavior');
}

export function getBlockParamEditor(
  blockDef: AnyBlockDef,
  paramKey: string,
): BlockParamEditorDef {
  // [LAW:one-source-of-truth] Param editor behavior is sourced from the
  // normalized block definition instead of UI-local block-type conditionals.
  return blockDef.ui.inspector.paramEditors[paramKey] ?? { kind: 'default' };
}
