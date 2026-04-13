export interface CanvasAttachment {
  readonly textureId: string;
  readonly loadOp: 'clear' | 'load';
  readonly clearColor?: readonly [number, number, number, number];
}

export const clearCanvas = (
  clearColor: readonly [number, number, number, number],
): CanvasAttachment => ({
  textureId: 'canvas',
  loadOp: 'clear',
  clearColor,
});

export const loadCanvas = (): CanvasAttachment => ({
  textureId: 'canvas',
  loadOp: 'load',
});
