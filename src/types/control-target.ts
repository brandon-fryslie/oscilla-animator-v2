import type { BlockId, PortId } from './index';

/**
 * Semantic control target owned by PatchStore.
 *
 * UI edits write through these targets instead of guessing whether a control
 * happens to live in block params, a default-source recipe, or a lens record.
 */
export type ControlMutationTarget =
  | {
      readonly kind: 'blockParam';
      readonly blockId: BlockId;
      readonly paramId: string;
    }
  | {
      readonly kind: 'bindingSourceParam';
      readonly blockId: BlockId;
      readonly portId: PortId;
      readonly sourceBlockType: string;
      readonly sourceOutputPortId: PortId;
      readonly paramId: string;
    }
  | {
      readonly kind: 'bindingLensParam';
      readonly blockId: BlockId;
      readonly portId: PortId;
      readonly lensId: string;
      readonly paramId: string;
    };
