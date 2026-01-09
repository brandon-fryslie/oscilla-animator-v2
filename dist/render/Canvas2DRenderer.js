/**
 * Canvas 2D Renderer - Optimized
 *
 * Uses canvas API with strategic batching for performance.
 */
/**
 * Render a frame to a 2D canvas context
 */
export function renderFrame(ctx, frame, width, height) {
    // Clear canvas once
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, width, height);
    // Render each pass
    for (const pass of frame.passes) {
        renderPass(ctx, pass, width, height);
    }
}
/**
 * Render a single pass
 */
function renderPass(ctx, pass, width, height) {
    if (pass.kind === 'instances2d') {
        renderInstances2D(ctx, pass, width, height);
    }
    else {
        throw new Error(`Unknown pass kind: ${pass.kind}`);
    }
}
/**
 * Render 2D instances with minimal fillStyle changes
 * Uses squares instead of circles for better performance
 */
function renderInstances2D(ctx, pass, width, height) {
    const position = pass.position;
    const color = pass.color;
    const sizes = typeof pass.size === 'number' ? null : pass.size;
    const uniformSize = typeof pass.size === 'number' ? pass.size : 3;
    // Simplest possible loop - JIT optimizes this best
    for (let i = 0; i < pass.count; i++) {
        const x = position[i * 2] * width;
        const y = position[i * 2 + 1] * height;
        const size = sizes ? sizes[i] : uniformSize;
        ctx.fillStyle = `rgba(${color[i * 4]},${color[i * 4 + 1]},${color[i * 4 + 2]},${color[i * 4 + 3] / 255})`;
        ctx.fillRect(x - size / 2, y - size / 2, size, size);
    }
}
