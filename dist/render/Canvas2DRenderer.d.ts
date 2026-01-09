/**
 * Canvas 2D Renderer - Optimized
 *
 * Uses canvas API with strategic batching for performance.
 */
import type { RenderFrameIR } from './types';
/**
 * Render a frame to a 2D canvas context
 */
export declare function renderFrame(ctx: CanvasRenderingContext2D, frame: RenderFrameIR, width: number, height: number): void;
