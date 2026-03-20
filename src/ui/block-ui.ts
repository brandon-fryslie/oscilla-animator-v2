import type { DockviewApi } from 'dockview';
import type { BlockId } from '../types';
import type {
  AnyBlockDef,
  BlockOpenBehaviorDef,
  BlockParamEditorDef,
} from '../blocks/registry';
import { openExpressionEditorPanel } from './dockview';
import type { DiagnosticsStore, ExpressionEditorStore } from '../stores';

export interface RunBlockOpenBehaviorContext {
  readonly blockId: BlockId;
  readonly api: DockviewApi | null;
  readonly diagnostics: DiagnosticsStore;
  readonly expressionEditor: ExpressionEditorStore;
}

function unreachableBehavior(behavior: never, message: string): never {
  throw new Error(`${message}: ${JSON.stringify(behavior)}`);
}

export function hasBlockOpenBehavior(behavior: BlockOpenBehaviorDef): boolean {
  return behavior.kind !== 'noop';
}

export function getBlockOpenBehaviorLabel(behavior: BlockOpenBehaviorDef): string {
  if (behavior.kind === 'open-expression-editor') {
    return 'Open Expression Editor';
  }
  if (behavior.kind === 'noop') {
    return 'Open';
  }
  return unreachableBehavior(behavior, 'Unhandled BlockOpenBehaviorDef in getBlockOpenBehaviorLabel');
}

export function runBlockOpenBehavior(
  behavior: BlockOpenBehaviorDef,
  context: RunBlockOpenBehaviorContext,
): void {
  if (behavior.kind === 'noop') {
    return;
  }

  if (behavior.kind === 'open-expression-editor') {
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
  return unreachableBehavior(behavior, 'Unhandled BlockOpenBehaviorDef in runBlockOpenBehavior');
}

export function getBlockParamEditor(
  blockDef: AnyBlockDef,
  paramKey: string,
): BlockParamEditorDef {
  // [LAW:one-source-of-truth] Param editor behavior is sourced from the
  // normalized block definition instead of UI-local block-type conditionals.
  return blockDef.ui.inspector.paramEditors[paramKey] ?? { kind: 'default' };
}
