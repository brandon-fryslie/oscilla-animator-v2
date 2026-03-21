import { getAnyBlockDefinition } from '../blocks/registry';
import type { DefaultSource } from '../types';

// [LAW:one-source-of-truth] UI formatting/classification for DefaultSource lives
// in one module so popovers, nodes, and inspector cannot drift.
function formatDefaultLiteralValue(value: unknown): string {
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string') return value;
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (Array.isArray(value)) return `[${value.join(', ')}]`;
  if (typeof value === 'object' && value !== null) return JSON.stringify(value);
  return String(value);
}

export function isTimeDefaultSource(source: DefaultSource): boolean {
  return getAnyBlockDefinition(source.blockType)?.capability === 'time';
}

function getInlineLiteralParam(source: DefaultSource | null | undefined) {
  if (!source) return null;
  const blockDef = getAnyBlockDefinition(source.blockType);
  if (!blockDef) return null;

  const editableInputs = Object.entries(blockDef.inputs)
    .filter(([, inputDef]) => inputDef.exposedAsPort === false)
    .map(([paramId, inputDef]) => ({
      paramId,
      label: inputDef.label ?? paramId,
      hint: inputDef.uiHint,
    }));
  if (editableInputs.length !== 1) return null;

  const [editableInput] = editableInputs;
  if (!(editableInput.paramId in (source.params ?? {}))) return null;
  return {
    ...editableInput,
    value: source.params?.[editableInput.paramId],
  };
}

export function isConstLiteralDefaultSource(source: DefaultSource | null | undefined): boolean {
  return getInlineLiteralParam(source) !== null;
}

export function formatDefaultSourceReference(source: DefaultSource): string {
  const inlineLiteralParam = getInlineLiteralParam(source);
  if (inlineLiteralParam) {
    return formatDefaultLiteralValue(inlineLiteralParam.value);
  }
  return `${source.blockType}.${source.output}`;
}

export function formatDefaultSourceLabel(source: DefaultSource, prefix?: string): string {
  const base = formatDefaultSourceReference(source);
  return prefix ? `${prefix}${base}` : base;
}
