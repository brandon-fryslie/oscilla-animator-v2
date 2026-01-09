/**
 * Example: One "Add" Block (Generic over World + Domain)
 *
 * This single block replaces `add_signal`, `add_field`, `add_scalar`, etc.
 */
import type { BlockSig } from "../blockSig";
export declare const AddBlock: BlockSig;
/**
 * Mul block - same structure as Add
 */
export declare const MulBlock: BlockSig;
/**
 * Mix/Lerp block
 */
export declare const MixBlock: BlockSig;
/**
 * Min block
 */
export declare const MinBlock: BlockSig;
/**
 * Max block
 */
export declare const MaxBlock: BlockSig;
