# Spec: Export Pipeline Primitives

**Date:** 2025-12-28
**Status:** PROPOSED
**Category:** Export Pipeline
**Priority:** Tier 3

---

## Overview

The export pipeline is a new feature not yet implemented. It enables exporting animations as video files, GIFs, image sequences, and standalone players.

---

## Backlog Checklist

- [ ] Implement image sequence export (PNG/WebP/JPEG).
- [ ] Implement video export (WebCodecs + muxer).
- [ ] Implement GIF export (palette + dithering).
- [ ] Implement standalone HTML player export.
- [ ] Add deterministic replay support (seed + state serialization).

---

## Feature 1: Frame Export to Image Sequence (HIGH)

### Current State

No export functionality exists.

### Requirements

- Export animation frames as PNG/WebP image sequence
- Support for custom resolution (independent of canvas size)
- Support for custom frame rate
- Deterministic rendering (same seed = same output)

### Proposed Solution

```typescript
// Export configuration
interface ImageSequenceExportConfig {
  format: "png" | "webp" | "jpeg";
  width: number;
  height: number;
  frameRate: number;
  startFrame: number;
  endFrame: number;
  quality?: number;  // 0-100 for jpeg/webp
  outputDir: string;
  filenamePattern: string;  // e.g., "frame_{frame:05d}.png"
}

// Export executor
class ImageSequenceExporter {
  private canvas: OffscreenCanvas;
  private renderer: Canvas2DRenderer;
  private program: CompiledProgramIR;
  private runtime: RuntimeState;

  async export(config: ImageSequenceExportConfig): Promise<ExportResult> {
    // 1. Create offscreen canvas at target resolution
    this.canvas = new OffscreenCanvas(config.width, config.height);
    this.renderer = new Canvas2DRenderer(this.canvas);
    this.renderer.setViewport(config.width, config.height, 1);

    // 2. Initialize runtime with deterministic seed
    this.runtime = createRuntimeState(this.program, {
      seed: this.program.meta.seed,  // Use patch's seed for determinism
    });

    const frameDuration = 1000 / config.frameRate;
    const frames: Blob[] = [];

    // 3. Render each frame
    for (let frame = config.startFrame; frame <= config.endFrame; frame++) {
      const tMs = frame * frameDuration;

      // Execute schedule
      executeSchedule(this.program.schedule, this.runtime, tMs);

      // Get render frame
      const renderFrame = this.runtime.values.read(
        this.program.renderSlot
      ) as RenderFrameIR;

      // Render to canvas
      this.renderer.renderFrame(renderFrame, this.runtime.values);

      // Export frame
      const blob = await this.canvas.convertToBlob({
        type: `image/${config.format}`,
        quality: config.quality ? config.quality / 100 : undefined,
      });

      frames.push(blob);

      // Progress callback
      this.onProgress?.(frame, config.endFrame);
    }

    // 4. Save frames
    return this.saveFrames(frames, config);
  }

  private async saveFrames(
    frames: Blob[],
    config: ImageSequenceExportConfig
  ): Promise<ExportResult> {
    // In browser: trigger downloads or use File System Access API
    // In Node/worker: write to filesystem
    const files: string[] = [];

    for (let i = 0; i < frames.length; i++) {
      const frameNum = config.startFrame + i;
      const filename = config.filenamePattern
        .replace("{frame}", String(frameNum).padStart(5, "0"));
      const path = `${config.outputDir}/${filename}`;

      await this.writeBlob(frames[i], path);
      files.push(path);
    }

    return {
      success: true,
      frameCount: frames.length,
      files,
    };
  }
}
```

### Complexity

Medium - Uses existing renderer, adds export coordination.

---

## Feature 2: Video Export (HIGH)

### Current State

Not implemented.

### Requirements

- Export to MP4/WebM video
- Support for various codecs (H.264, VP9, etc.)
- Audio sync support (future)

### Proposed Solution

```typescript
// Video export using WebCodecs API
interface VideoExportConfig {
  format: "mp4" | "webm";
  codec: "h264" | "vp9" | "av1";
  width: number;
  height: number;
  frameRate: number;
  bitrate: number;
  startTime: number;
  duration: number;
  outputPath: string;
}

class VideoExporter {
  private encoder: VideoEncoder | null = null;
  private muxer: Muxer | null = null;

  async export(config: VideoExportConfig): Promise<ExportResult> {
    // 1. Initialize encoder
    this.encoder = new VideoEncoder({
      output: (chunk, meta) => this.handleEncodedChunk(chunk, meta),
      error: (e) => this.handleError(e),
    });

    await this.encoder.configure({
      codec: this.getCodecString(config.codec),
      width: config.width,
      height: config.height,
      bitrate: config.bitrate,
      framerate: config.frameRate,
    });

    // 2. Initialize muxer (MP4Box.js or similar)
    this.muxer = createMuxer(config.format, config.outputPath);

    // 3. Render and encode frames
    const frameCount = Math.ceil(config.duration * config.frameRate / 1000);
    const frameDuration = 1000 / config.frameRate;

    for (let frame = 0; frame < frameCount; frame++) {
      const tMs = config.startTime + frame * frameDuration;

      // Render frame to ImageBitmap
      const bitmap = await this.renderFrame(tMs, config.width, config.height);

      // Create VideoFrame
      const videoFrame = new VideoFrame(bitmap, {
        timestamp: frame * (1000000 / config.frameRate),  // microseconds
        duration: 1000000 / config.frameRate,
      });

      // Encode
      this.encoder.encode(videoFrame);
      videoFrame.close();

      this.onProgress?.(frame, frameCount);
    }

    // 4. Flush and finalize
    await this.encoder.flush();
    await this.muxer.finalize();

    return {
      success: true,
      frameCount,
      outputPath: config.outputPath,
    };
  }

  private getCodecString(codec: string): string {
    switch (codec) {
      case "h264": return "avc1.42E01E";
      case "vp9": return "vp09.00.10.08";
      case "av1": return "av01.0.04M.08";
      default: throw new Error(`Unknown codec: ${codec}`);
    }
  }
}
```

### Complexity

High - Requires WebCodecs API and muxing library.

---

## Feature 3: GIF Export (MEDIUM)

### Current State

Not implemented.

### Requirements

- Export to animated GIF
- Support for palette optimization
- Support for dithering options

### Proposed Solution

```typescript
// GIF export using gif.js or similar library
interface GifExportConfig {
  width: number;
  height: number;
  frameRate: number;  // GIF typically 10-30fps
  startTime: number;
  duration: number;
  quality: number;  // 1-20 (lower = better)
  dither: boolean;
  loop: number;  // 0 = infinite loop
  outputPath: string;
}

class GifExporter {
  async export(config: GifExportConfig): Promise<ExportResult> {
    const gif = new GIF({
      workers: navigator.hardwareConcurrency || 2,
      quality: config.quality,
      width: config.width,
      height: config.height,
      workerScript: '/gif.worker.js',
      dither: config.dither,
      repeat: config.loop,
    });

    const frameCount = Math.ceil(config.duration * config.frameRate / 1000);
    const frameDuration = 1000 / config.frameRate;
    const delay = 1000 / config.frameRate;  // GIF delay in ms

    for (let frame = 0; frame < frameCount; frame++) {
      const tMs = config.startTime + frame * frameDuration;
      const canvas = await this.renderFrameToCanvas(tMs, config.width, config.height);

      gif.addFrame(canvas, { delay, copy: true });
      this.onProgress?.(frame, frameCount);
    }

    return new Promise((resolve, reject) => {
      gif.on('finished', (blob: Blob) => {
        this.saveBlob(blob, config.outputPath)
          .then(() => resolve({
            success: true,
            frameCount,
            outputPath: config.outputPath,
          }))
          .catch(reject);
      });

      gif.on('error', reject);
      gif.render();
    });
  }
}
```

### Complexity

Medium - Requires third-party GIF library.

---

## Feature 4: Standalone Player Export (LOW)

### Current State

Not implemented.

### Requirements

- Export animation as self-contained HTML file
- Embed compiled IR and runtime
- No external dependencies

### Proposed Solution

```typescript
// Standalone HTML player export
interface StandaloneExportConfig {
  outputPath: string;
  title: string;
  width: number;
  height: number;
  includeControls: boolean;
  embedRuntime: boolean;  // Inline vs CDN
}

class StandaloneExporter {
  async export(
    program: CompiledProgramIR,
    config: StandaloneExportConfig
  ): Promise<ExportResult> {
    // 1. Serialize program IR
    const programJson = JSON.stringify(program);

    // 2. Get minified runtime
    const runtimeJs = config.embedRuntime
      ? await this.getEmbeddedRuntime()
      : this.getCdnRuntimeUrl();

    // 3. Generate HTML
    const html = this.generateHtml(programJson, runtimeJs, config);

    // 4. Write file
    await this.writeFile(config.outputPath, html);

    return {
      success: true,
      outputPath: config.outputPath,
    };
  }

  private generateHtml(
    programJson: string,
    runtimeJs: string,
    config: StandaloneExportConfig
  ): string {
    return `<!DOCTYPE html>
<html>
<head>
  <title>${config.title}</title>
  <style>
    body { margin: 0; background: #000; display: flex; justify-content: center; align-items: center; min-height: 100vh; }
    canvas { max-width: 100%; max-height: 100vh; }
    ${config.includeControls ? this.getControlStyles() : ''}
  </style>
</head>
<body>
  <canvas id="canvas" width="${config.width}" height="${config.height}"></canvas>
  ${config.includeControls ? this.getControlHtml() : ''}

  <script>${runtimeJs}</script>
  <script>
    const program = ${programJson};
    const canvas = document.getElementById('canvas');
    const player = new OscillaPlayer(canvas, program);
    player.play();
    ${config.includeControls ? this.getControlScript() : ''}
  </script>
</body>
</html>`;
  }
}
```

### Complexity

Medium - Requires bundled runtime.

---

## Feature 5: Deterministic Replay Support (CRITICAL for Export)

### Current State

No seed/state serialization for deterministic replay.

### Requirements

- Export must produce identical output for same patch+seed
- Random operations must be seeded
- State must be serializable

### Proposed Solution

```typescript
// Deterministic runtime initialization
interface DeterministicConfig {
  seed: number;
  startTime: number;
  frameRate: number;
}

function createDeterministicRuntime(
  program: CompiledProgramIR,
  config: DeterministicConfig
): RuntimeState {
  // 1. Initialize PRNG with seed
  const prng = createSeededPRNG(config.seed);

  // 2. Pre-generate all random values used by program
  const randomPool = generateRandomPool(program, prng);

  // 3. Create runtime with deterministic random source
  const runtime = new RuntimeState({
    program,
    randomSource: () => randomPool.next(),
    initialTime: config.startTime,
  });

  return runtime;
}

// Seeded PRNG (xorshift128+)
function createSeededPRNG(seed: number): () => number {
  let s0 = seed | 0;
  let s1 = (seed * 1103515245 + 12345) | 0;

  return () => {
    const t0 = s1;
    let t1 = s0;
    s0 = t0;
    t1 ^= t1 << 23;
    t1 ^= t1 >>> 17;
    t1 ^= t0;
    t1 ^= t0 >>> 26;
    s1 = t1;
    return (t0 + t1) >>> 0;
  };
}

// State serialization for pause/resume
interface SerializedState {
  version: number;
  frameId: number;
  stateBuffer: Float64Array;
  eventHistory: EventRecord[];
  randomIndex: number;
}

function serializeState(runtime: RuntimeState): SerializedState {
  return {
    version: 1,
    frameId: runtime.frameId,
    stateBuffer: runtime.state.serialize(),
    eventHistory: runtime.events.getHistory(),
    randomIndex: runtime.randomIndex,
  };
}

function deserializeState(
  data: SerializedState,
  program: CompiledProgramIR
): RuntimeState {
  const runtime = createDeterministicRuntime(program, {
    seed: program.meta.seed,
    startTime: 0,
    frameRate: 60,
  });

  runtime.state.deserialize(data.stateBuffer);
  runtime.events.setHistory(data.eventHistory);
  runtime.randomIndex = data.randomIndex;
  runtime.frameId = data.frameId;

  return runtime;
}
```

### Complexity

High - Requires replacing all Math.random() usage.

---

## Summary

| Feature | Priority | Complexity | Enables |
|---------|----------|------------|---------|
| Deterministic replay | CRITICAL | High | All exports |
| Image sequence | HIGH | Medium | PNG/WebP export |
| Video export | HIGH | High | MP4/WebM export |
| GIF export | MEDIUM | Medium | Animated GIF |
| Standalone player | LOW | Medium | Self-contained sharing |

**Recommended order:** Deterministic replay → Image sequence → Video export → GIF → Standalone
