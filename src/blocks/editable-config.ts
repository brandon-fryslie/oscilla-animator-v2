import type { UIControlHint } from '../types';
import { getAnyBlockDefinition } from './registry';

export interface EditableConfigParam {
  readonly paramId: string;
  readonly label: string;
  readonly hint?: UIControlHint;
  readonly value: unknown;
}

export function getEditableConfigParams(
  blockType: string,
  params: Readonly<Record<string, unknown>>,
): readonly EditableConfigParam[] {
  const def = getAnyBlockDefinition(blockType);
  if (!def) return [];

  const entries: EditableConfigParam[] = [];
  for (const [paramId, inputDef] of Object.entries(def.inputs)) {
    if (inputDef.exposedAsPort !== false) continue;
    const value = params[paramId] ?? inputDef.defaultValue;
    if (value === undefined) continue;
    entries.push({
      paramId,
      label: inputDef.label ?? paramId,
      hint: inputDef.uiHint,
      value,
    });
  }
  return entries;
}

export function getPreferredInlineSourceParam(
  blockType: string,
  params: Readonly<Record<string, unknown>>,
): EditableConfigParam | null {
  const configParams = getEditableConfigParams(blockType, params);
  return configParams.length === 1 ? configParams[0] : null;
}
