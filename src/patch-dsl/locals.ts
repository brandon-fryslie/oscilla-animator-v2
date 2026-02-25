import type { HclBlock, HclDocument, HclValue } from './ast';
import { PatchDslError, type PatchDslWarning } from './errors';

export interface ExpandLocalsResult {
  readonly document: HclDocument;
  readonly errors: PatchDslError[];
  readonly warnings: PatchDslWarning[];
}

/**
 * Expand top-level locals blocks as a pure literal substitution pass.
 *
 * Supported form:
 *   locals {
 *     key = <literal | object | list>
 *   }
 *
 * Local references inside local definitions are intentionally rejected.
 */
export function expandTopLevelLocals(document: HclDocument): ExpandLocalsResult {
  const errors: PatchDslError[] = [];
  const warnings: PatchDslWarning[] = [];
  const locals = new Map<string, HclValue>();
  const retainedBlocks: HclBlock[] = [];

  let reachedNonLocalsBlock = false;

  for (const block of document.blocks) {
    if (block.type === 'locals') {
      if (reachedNonLocalsBlock) {
        errors.push(new PatchDslError('locals blocks must appear at the top of the file', block.pos));
        continue; // hard reject: do not collect or substitute a misplaced locals block
      }
      collectLocals(block, locals, errors);
      continue;
    }

    reachedNonLocalsBlock = true;
    retainedBlocks.push(block);
  }

  // [LAW:single-enforcer] Local substitution is enforced at one boundary:
  // immediately after parse and before any AST->domain conversion.
  const expandedBlocks = retainedBlocks.map((block) => substituteInBlock(block, locals, errors));
  return { document: { blocks: expandedBlocks }, errors, warnings };
}

function collectLocals(block: HclBlock, locals: Map<string, HclValue>, errors: PatchDslError[]): void {
  if (block.labels.length > 0) {
    errors.push(new PatchDslError('locals block does not accept labels', block.pos));
  }
  if (block.children.length > 0) {
    errors.push(new PatchDslError('locals block does not accept child blocks', block.pos));
  }

  for (const [key, value] of Object.entries(block.attributes)) {
    if (locals.has(key)) {
      errors.push(new PatchDslError(`Duplicate local "${key}"`, block.pos));
      continue;
    }
    // [LAW:one-source-of-truth] Local definitions are restricted to literals so
    // they remain pure aliases, not a second expression/evaluation mechanism.
    if (!isLiteralValue(value)) {
      errors.push(new PatchDslError(`Local "${key}" must be a literal/object/list without references`, block.pos));
      continue;
    }
    locals.set(key, cloneValue(value));
  }
}

function substituteInBlock(block: HclBlock, locals: ReadonlyMap<string, HclValue>, errors: PatchDslError[]): HclBlock {
  const attributes: Record<string, HclValue> = {};
  for (const [key, value] of Object.entries(block.attributes)) {
    attributes[key] = substituteInValue(value, locals, errors, block.pos);
  }

  return {
    ...block,
    attributes,
    children: block.children.map((child) => substituteInBlock(child, locals, errors)),
  };
}

function substituteInValue(
  value: HclValue,
  locals: ReadonlyMap<string, HclValue>,
  errors: PatchDslError[],
  pos: { start: number; end: number }
): HclValue {
  if (value.kind === 'reference' && value.parts[0] === 'local') {
    if (value.parts.length !== 2) {
      errors.push(new PatchDslError('Local references must be of the form local.<name>', pos));
      return value;
    }

    const localName = value.parts[1];
    const localValue = locals.get(localName);
    if (!localValue) {
      errors.push(new PatchDslError(`Unknown local "${localName}"`, pos));
      return value;
    }

    return cloneValue(localValue);
  }

  if (value.kind === 'object') {
    const entries: Record<string, HclValue> = {};
    for (const [entryKey, entryValue] of Object.entries(value.entries)) {
      entries[entryKey] = substituteInValue(entryValue, locals, errors, pos);
    }
    return { kind: 'object', entries };
  }

  if (value.kind === 'list') {
    return {
      kind: 'list',
      items: value.items.map((item) => substituteInValue(item, locals, errors, pos)),
    };
  }

  return value;
}

function isLiteralValue(value: HclValue): boolean {
  if (value.kind === 'reference') return false;
  if (value.kind === 'list') {
    return value.items.every((item) => isLiteralValue(item));
  }
  if (value.kind === 'object') {
    return Object.values(value.entries).every((entry) => isLiteralValue(entry));
  }
  return true;
}

function cloneValue(value: HclValue): HclValue {
  if (value.kind === 'object') {
    const entries: Record<string, HclValue> = {};
    for (const [key, entryValue] of Object.entries(value.entries)) {
      entries[key] = cloneValue(entryValue);
    }
    return { kind: 'object', entries };
  }

  if (value.kind === 'list') {
    return { kind: 'list', items: value.items.map((item) => cloneValue(item)) };
  }

  if (value.kind === 'reference') {
    return { kind: 'reference', parts: [...value.parts] };
  }

  return value;
}
