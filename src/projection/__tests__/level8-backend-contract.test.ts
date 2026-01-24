/**
 * Level 8: Backend Contract (Screen-Space Only)
 *
 * Tests proving that backends consume ONLY screen-space data and perform
 * ONLY coordinate mapping. No world-space, no camera params, no projection.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { RenderPassIR } from '../../runtime/ScheduleExecutor';
import { SVGRenderer } from '../../render/SVGRenderer';
import { JSDOM } from 'jsdom';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// =============================================================================
// Unit Tests: Backend Function Signatures
// =============================================================================

describe('Level 8 Unit Tests: Backend Signature Contract', () => {
  it('Canvas2D renderInstances2D accepts only: pass (RenderPassIR), width, height (no camera, no worldPos params)', () => {
    // Canvas2D renderer implementation is in Canvas2DRenderer.ts
    // The renderInstances2D function signature is:
    // function renderInstances2D(ctx, pass: RenderPassIR, width: number, height: number)
    //
    // This test verifies the signature by checking the source code
    const source = readFileSync(
      join(__dirname, '../../render/Canvas2DRenderer.ts'),
      'utf-8'
    );

    // Find the renderInstances2D function signature
    const funcMatch = source.match(
      /function renderInstances2D\s*\([^)]+\)/
    );
    expect(funcMatch).toBeTruthy();

    const signature = funcMatch![0];

    // Verify it accepts: ctx, pass, width, height
    expect(signature).toMatch(/ctx/);
    expect(signature).toMatch(/pass/);
    expect(signature).toMatch(/width/);
    expect(signature).toMatch(/height/);

    // Verify it does NOT accept camera or worldPos params
    expect(signature).not.toMatch(/camera/i);
    expect(signature).not.toMatch(/worldPos/i);
    expect(signature).not.toMatch(/projection/i);
  });

  it('SVG renderPassIR accepts only: pass (RenderPassIR) + viewport dimensions (no camera, no worldPos params)', () => {
    // SVG renderer implementation is in SVGRenderer.ts
    // The renderPassIR function signature is:
    // private renderPassIR(pass: RenderPassIR)
    //
    // Viewport dimensions come from instance state (this.width, this.height)
    const source = readFileSync(
      join(__dirname, '../../render/SVGRenderer.ts'),
      'utf-8'
    );

    // Find the renderPassIR method signature
    const funcMatch = source.match(/renderPassIR\s*\([^)]+\)/);
    expect(funcMatch).toBeTruthy();

    const signature = funcMatch![0];

    // Verify it accepts: pass (parameter name)
    expect(signature).toMatch(/pass/);

    // Verify it does NOT accept camera or worldPos params
    expect(signature).not.toMatch(/camera/i);
    expect(signature).not.toMatch(/worldPos/i);
    expect(signature).not.toMatch(/projection/i);
  });

  it('Canvas2D backend uses screenPosition ?? position for coordinate source', () => {
    const source = readFileSync(
      join(__dirname, '../../render/Canvas2DRenderer.ts'),
      'utf-8'
    );

    // Find the line where posSource is assigned
    expect(source).toMatch(/posSource\s*=\s*pass\.screenPosition\s*\?\?\s*position/);
  });

  it('SVG backend uses screenPosition ?? position for coordinate source', () => {
    const source = readFileSync(
      join(__dirname, '../../render/SVGRenderer.ts'),
      'utf-8'
    );

    // Find the line where posSource is assigned
    expect(source).toMatch(/posSource\s*=\s*pass\.screenPosition\s*\?\?\s*position/);
  });
});

// =============================================================================
// Unit Tests: Coordinate Mapping
// =============================================================================

describe('Level 8 Unit Tests: Coordinate Mapping', () => {
  it('Canvas2D uses screenRadius for per-instance sizing when available', () => {
    const source = readFileSync(
      join(__dirname, '../../render/Canvas2DRenderer.ts'),
      'utf-8'
    );

    // Verify the effectiveScale logic uses perInstanceRadius when available
    expect(source).toMatch(/effectiveScale\s*=\s*perInstanceRadius\s*\?\s*perInstanceRadius\[i\]\s*:\s*scale/);
  });

  it('SVG uses screenRadius for per-instance sizing when available', () => {
    const source = readFileSync(
      join(__dirname, '../../render/SVGRenderer.ts'),
      'utf-8'
    );

    // Verify the effectiveScale logic uses perInstanceRadius when available
    expect(source).toMatch(/effectiveScale\s*=\s*perInstanceRadius\s*\?\s*perInstanceRadius\[i\]\s*:\s*scale/);
  });

  it('Canvas2D maps screenPosition to pixel coordinates: x * width, y * height', () => {
    const source = readFileSync(
      join(__dirname, '../../render/Canvas2DRenderer.ts'),
      'utf-8'
    );

    // Verify the coordinate mapping: posSource[i*2] * width, posSource[i*2+1] * height
    expect(source).toMatch(/posSource\[i \* 2\] \* width/);
    expect(source).toMatch(/posSource\[i \* 2 \+ 1\] \* height/);
  });

  it('SVG maps screenPosition to pixel coordinates: x * width, y * height', () => {
    const source = readFileSync(
      join(__dirname, '../../render/SVGRenderer.ts'),
      'utf-8'
    );

    // Verify the coordinate mapping: posSource[i*2] * this.width, posSource[i*2+1] * this.height
    expect(source).toMatch(/posSource\[i \* 2\] \* (this\.)?width/);
    expect(source).toMatch(/posSource\[i \* 2 \+ 1\] \* (this\.)?height/);
  });
});

// =============================================================================
// Integration Tests: Backend Equivalence
// =============================================================================

describe('Level 8 Integration Tests: Backend Equivalence', () => {
  it('SVG maps screenPosition [0,1] to correct pixel coordinates in transform attributes', () => {
    // Setup JSDOM for SVG manipulation
    const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
    global.document = dom.window.document as any;
    global.HTMLElement = dom.window.HTMLElement as any;
    global.SVGSVGElement = dom.window.SVGSVGElement as any;
    global.SVGDefsElement = dom.window.SVGDefsElement as any;
    global.SVGGElement = dom.window.SVGGElement as any;

    const container = document.createElement('div');
    const renderer = new SVGRenderer(container, 1000, 600);

    // Create a test RenderPassIR with screenPosition
    const pass: RenderPassIR = {
      kind: 'instances2d',
      count: 3,
      position: new Float32Array([0, 0, 0, 0, 0, 0]), // Not used when screenPosition exists
      color: new Uint8ClampedArray([
        255, 0, 0, 255,
        0, 255, 0, 255,
        0, 0, 255, 255,
      ]),
      scale: 0.05,
      screenPosition: new Float32Array([
        0.25, 0.5,  // Instance 0: expected pixel (250, 300)
        0.75, 0.25, // Instance 1: expected pixel (750, 150)
        0.1, 0.9,   // Instance 2: expected pixel (100, 540)
      ]),
      resolvedShape: {
        resolved: true,
        topologyId: 0, // Circle
        mode: 'primitive',
        params: {},
      },
    };

    const frame = {
      version: 1 as const,
      passes: [pass],
    };

    // Render the frame
    renderer.renderV1(frame);

    // Get all <use> elements
    const svg = renderer.getSVGElement();
    const uses = svg.querySelectorAll('use');

    expect(uses.length).toBe(3);

    // Extract numeric values (tolerant of floating-point precision)
    const extractTranslate = (transform: string | null) => {
      const match = transform?.match(/translate\(([^ ]+) ([^)]+)\)/);
      return {
        x: parseFloat(match![1]),
        y: parseFloat(match![2])
      };
    };

    const coord0 = extractTranslate(uses[0].getAttribute('transform'));
    const coord1 = extractTranslate(uses[1].getAttribute('transform'));
    const coord2 = extractTranslate(uses[2].getAttribute('transform'));

    // Verify coordinates within 0.5px tolerance
    expect(Math.abs(coord0.x - 250)).toBeLessThan(0.5); // 0.25 * 1000
    expect(Math.abs(coord0.y - 300)).toBeLessThan(0.5); // 0.5 * 600
    
    expect(Math.abs(coord1.x - 750)).toBeLessThan(0.5); // 0.75 * 1000
    expect(Math.abs(coord1.y - 150)).toBeLessThan(0.5); // 0.25 * 600
    
    expect(Math.abs(coord2.x - 100)).toBeLessThan(0.5); // 0.1 * 1000
    expect(Math.abs(coord2.y - 540)).toBeLessThan(0.5); // 0.9 * 600

    renderer.dispose();
  });

  it('SVG uses screenRadius for per-instance scaling', () => {
    // Setup JSDOM
    const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
    global.document = dom.window.document as any;
    global.HTMLElement = dom.window.HTMLElement as any;
    global.SVGSVGElement = dom.window.SVGSVGElement as any;
    global.SVGDefsElement = dom.window.SVGDefsElement as any;
    global.SVGGElement = dom.window.SVGGElement as any;

    const container = document.createElement('div');
    const renderer = new SVGRenderer(container, 1000, 1000);

    const pass: RenderPassIR = {
      kind: 'instances2d',
      count: 3,
      position: new Float32Array([0.5, 0.5, 0.5, 0.5, 0.5, 0.5]),
      color: new Uint8ClampedArray(12).fill(255),
      scale: 0.05, // Default scale (not used when screenRadius exists)
      screenPosition: new Float32Array([0.5, 0.5, 0.5, 0.5, 0.5, 0.5]),
      screenRadius: new Float32Array([0.02, 0.04, 0.06]), // Varying radii
      resolvedShape: {
        resolved: true,
        topologyId: 0,
        mode: 'primitive',
        params: {},
      },
    };

    const frame = {
      version: 1 as const,
      passes: [pass],
    };

    const D = 1000; // min(width, height)

    // Render with SVG
    renderer.renderV1(frame);

    const svg = renderer.getSVGElement();
    const uses = svg.querySelectorAll('use');

    // Extract SVG scale values from transform attributes
    const svgScales = Array.from(uses).map(use => {
      const transform = use.getAttribute('transform') || '';
      const match = transform.match(/scale\(([^ )]+)/);
      return parseFloat(match![1]);
    });

    // Verify scales match expected screenRadius × D
    expect(svgScales[0]).toBeCloseTo(0.02 * D, 1); // 20
    expect(svgScales[1]).toBeCloseTo(0.04 * D, 1); // 40
    expect(svgScales[2]).toBeCloseTo(0.06 * D, 1); // 60

    renderer.dispose();
  });

  it('SVG renders correctly when screenPosition is undefined (fallback to position)', () => {
    // Setup JSDOM
    const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
    global.document = dom.window.document as any;
    global.HTMLElement = dom.window.HTMLElement as any;
    global.SVGSVGElement = dom.window.SVGSVGElement as any;
    global.SVGDefsElement = dom.window.SVGDefsElement as any;
    global.SVGGElement = dom.window.SVGGElement as any;

    const container = document.createElement('div');
    const renderer = new SVGRenderer(container, 800, 600);

    // RenderPassIR WITHOUT screenPosition (2D-only render)
    const pass: RenderPassIR = {
      kind: 'instances2d',
      count: 2,
      position: new Float32Array([0.3, 0.4, 0.7, 0.8]),
      color: new Uint8ClampedArray(8).fill(255),
      scale: 0.05,
      // NO screenPosition field
      resolvedShape: {
        resolved: true,
        topologyId: 0,
        mode: 'primitive',
        params: {},
      },
    };

    const frame = {
      version: 1 as const,
      passes: [pass],
    };

    // Render
    renderer.renderV1(frame);

    const svg = renderer.getSVGElement();
    const uses = svg.querySelectorAll('use');

    expect(uses.length).toBe(2);

    // Extract numeric values (tolerant of floating-point precision)
    const extractTranslate = (transform: string | null) => {
      const match = transform?.match(/translate\(([^ ]+) ([^)]+)\)/);
      return { x: parseFloat(match![1]), y: parseFloat(match![2]) };
    };

    const coord0 = extractTranslate(uses[0].getAttribute('transform'));
    const coord1 = extractTranslate(uses[1].getAttribute('transform'));

    // Verify coordinates within 0.5px tolerance
    expect(Math.abs(coord0.x - 240)).toBeLessThan(0.5); // 0.3 * 800
    expect(Math.abs(coord0.y - 240)).toBeLessThan(0.5); // 0.4 * 600
    expect(Math.abs(coord1.x - 560)).toBeLessThan(0.5); // 0.7 * 800
    expect(Math.abs(coord1.y - 480)).toBeLessThan(0.5); // 0.8 * 600

    renderer.dispose();
  });
});

// =============================================================================
// Integration Tests: Full Pipeline Through Backend
// =============================================================================

describe('Level 8 Integration Tests: Full Pipeline', () => {
  it('Backend renders RenderPassIR with screen-space data without errors', () => {
    // Setup JSDOM
    const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
    global.document = dom.window.document as any;
    global.HTMLElement = dom.window.HTMLElement as any;
    global.SVGSVGElement = dom.window.SVGSVGElement as any;
    global.SVGDefsElement = dom.window.SVGDefsElement as any;
    global.SVGGElement = dom.window.SVGGElement as any;

    const container = document.createElement('div');
    const renderer = new SVGRenderer(container, 1000, 1000);

    // Create a RenderPassIR with all screen-space fields populated
    // (simulating output from projection pipeline)
    const pass: RenderPassIR = {
      kind: 'instances2d',
      count: 9,
      position: new Float32Array(18).fill(0), // World positions (not used)
      color: new Uint8ClampedArray(36).fill(255),
      scale: 0.03,
      screenPosition: new Float32Array([
        0.2, 0.2,
        0.5, 0.2,
        0.8, 0.2,
        0.2, 0.5,
        0.5, 0.5,
        0.8, 0.5,
        0.2, 0.8,
        0.5, 0.8,
        0.8, 0.8,
      ]),
      screenRadius: new Float32Array([
        0.03, 0.03, 0.03,
        0.04, 0.04, 0.04,
        0.02, 0.02, 0.02,
      ]),
      depth: new Float32Array([
        0.5, 0.5, 0.5,
        0.3, 0.3, 0.3,
        0.7, 0.7, 0.7,
      ]),
      visible: new Uint8Array(9).fill(1),
      resolvedShape: {
        resolved: true,
        topologyId: 0,
        mode: 'primitive',
        params: {},
      },
    };

    const frame = {
      version: 1 as const,
      passes: [pass],
    };

    // Render should not throw
    expect(() => renderer.renderV1(frame)).not.toThrow();

    // Verify output
    const svg = renderer.getSVGElement();
    const uses = svg.querySelectorAll('use');
    expect(uses.length).toBe(9);

    // Verify all instances are in viewport (no NaN, all within bounds)
    uses.forEach(use => {
      const transform = use.getAttribute('transform') || '';
      const match = transform.match(/translate\(([^ ]+) ([^)]+)\)/);
      if (match) {
        const x = parseFloat(match[1]);
        const y = parseFloat(match[2]);
        expect(Number.isNaN(x)).toBe(false);
        expect(Number.isNaN(y)).toBe(false);
        expect(x).toBeGreaterThanOrEqual(0);
        expect(x).toBeLessThanOrEqual(1000);
        expect(y).toBeGreaterThanOrEqual(0);
        expect(y).toBeLessThanOrEqual(1000);
      }
    });

    renderer.dispose();
  });
});

// =============================================================================
// Static Analysis Tests: Import Restrictions
// =============================================================================

describe('Level 8 Static Analysis: No Projection Imports in Backends', () => {
  it('Canvas2DRenderer.ts does not import from src/projection/', () => {
    const source = readFileSync(
      join(__dirname, '../../render/Canvas2DRenderer.ts'),
      'utf-8'
    );

    // Check for any imports from projection directory
    const importRegex = /import\s+.*\s+from\s+['"](\.\.\/projection|\.\.\/\.\.\/projection)/;
    expect(source).not.toMatch(importRegex);
  });

  it('SVGRenderer.ts does not import from src/projection/', () => {
    const source = readFileSync(
      join(__dirname, '../../render/SVGRenderer.ts'),
      'utf-8'
    );

    // Check for any imports from projection directory
    const importRegex = /import\s+.*\s+from\s+['"](\.\.\/projection|\.\.\/\.\.\/projection)/;
    expect(source).not.toMatch(importRegex);
  });

  it('No file in src/render/ imports from src/projection/', () => {
    // Read all files in src/render/
    const renderDir = join(__dirname, '../../render');
    const files = readdirSync(renderDir).filter((f: string) => f.endsWith('.ts'));

    for (const file of files) {
      const source = readFileSync(join(renderDir, file), 'utf-8');
      const importRegex = /import\s+.*\s+from\s+['"](\.\.\/projection)/;

      if (importRegex.test(source)) {
        throw new Error(
          `File ${file} imports from src/projection/ - this violates the backend contract!`
        );
      }
    }

    // If we get here, all files passed
    expect(true).toBe(true);
  });

  it('Backend coordinate mapping is purely arithmetic (no projection function calls)', () => {
    // Verify that backends don't call any projection functions
    const canvas2dSource = readFileSync(
      join(__dirname, '../../render/Canvas2DRenderer.ts'),
      'utf-8'
    );

    const svgSource = readFileSync(
      join(__dirname, '../../render/SVGRenderer.ts'),
      'utf-8'
    );

    // Check that neither backend calls projection kernel functions
    expect(canvas2dSource).not.toMatch(/projectOrtho|projectPerspective/);
    expect(svgSource).not.toMatch(/projectOrtho|projectPerspective/);

    // Check that they don't reference camera params
    const canvas2dRenderFunc = canvas2dSource.match(/function renderInstances2D[\s\S]+?^}/m);
    const svgRenderFunc = svgSource.match(/private renderPassIR[\s\S]+?^\s{2}}/m);

    if (canvas2dRenderFunc) {
      expect(canvas2dRenderFunc[0]).not.toMatch(/camera/i);
    }
    if (svgRenderFunc) {
      expect(svgRenderFunc[0]).not.toMatch(/camera/i);
    }
  });
});
