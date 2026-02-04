# Debug Visualization System

## Overview

The debug visualization system provides real-time inspection of runtime values (signals, fields, events) through a hover-based UI and extensible renderer architecture.

## Architecture

### Core Components

#### 1. **DebugMiniView** (`src/ui/debug-viz/DebugMiniView.tsx`)
- Hover-scoped value inspector
- Shows hovered edge/port values with type info
- Displays micro-history sparkline for signals
- Shows aggregate stats for fields
- Non-interactive, performance-optimized (O(1) render)

#### 2. **ValueRenderer System** (`src/ui/debug-viz/ValueRenderer.ts`)
- 3-tier fallback lookup system:
  1. **Exact match**: `{payload}:{unit}` (e.g., "float:turns")
  2. **Payload-only**: `{payload}` (e.g., "float", "vec2")
  3. **Category fallback**: `category:{category}` (e.g., "category:numeric")
- Each renderer provides two display modes:
  - `renderFull()`: Detailed view for panels/inspectors
  - `renderInline()`: Compact single-line view for tooltips

#### 3. **History Tracking** (`src/ui/debug-viz/HistoryService.ts`)
- Ring buffer for temporal value tracking
- Monotonically increasing write index
- Supports multi-component types (vec2, color)
- O(1) append, O(n) read for visualization

#### 4. **Type System** (`src/ui/debug-viz/types.ts`)
- `DebugTargetKey`: Identifies observation targets (edge or port)
- `Stride`: Component count per sample (0, 1, 2, 3, 4)
- `SampleEncoding`: Maps PayloadType to buffer layout
- `HistoryView`: Read-only interface to ring buffers
- `AggregateStats`: Summary statistics for field data
- `RendererSample`: Discriminated union passed to renderers

### Data Flow

```
Runtime (ScheduleExecutor)
  ↓ DebugTap.recordValue()
  ↓
DebugService (bridges runtime → UI)
  ↓ Stores in DebugStore
  ↓ Updates HistoryService
  ↓
useDebugMiniView hook
  ↓ Resolves hovered edge
  ↓ Fetches value + history
  ↓
getValueRenderer() (3-tier lookup)
  ↓
Renderer.renderFull() / renderInline()
  ↓
React component rendered in DebugMiniView
```

## Available Renderers

### Numeric Types

#### **FloatValueRenderer** (`src/ui/debug-viz/renderers/FloatValueRenderer.tsx`)
- Unit-aware float display
- Variants: scalar, phase (turns/radians/degrees), time (ms/seconds), space
- Features:
  - Range indicators for norm01
  - Warn badges for out-of-range
  - Unit labels (phase, rad, deg, ms, s)
  - Field stats: min/mean/max

#### **Vec2ValueRenderer** (`src/ui/debug-viz/renderers/Vec2ValueRenderer.tsx`)
- 2D vector visualization
- Features:
  - Component display (X/Y)
  - Magnitude calculation
  - Directional arrow diagram (80x80 SVG)
  - Field aggregate: Per-component stats + mean vector arrow
- Inline: `(x, y)` format

#### **GenericNumericRenderer** (`src/ui/debug-viz/renderers/GenericNumericRenderer.tsx`)
- Category fallback for all numeric types
- Handles int, vec3, cameraProjection
- Simple numeric display without special formatting

### Color Types

#### **ColorValueRenderer** (`src/ui/debug-viz/renderers/ColorValueRenderer.tsx`)
- Color swatch with channel statistics
- Features:
  - Large average color swatch (32x32)
  - Checkerboard background for alpha visualization
  - Per-channel R/G/B/A range bars
  - Hex representation of mean color
  - Count badge for field aggregates
- Field aggregate: Shows distribution across channels

### Boolean/Event Types

#### **BoolEventValueRenderer** (`src/ui/debug-viz/renderers/BoolEventValueRenderer.tsx`)
- Boolean and event visualization
- Features:
  - **Bool mode**: TRUE/FALSE badges, ✓/✗ inline
  - **Event mode**: FIRED/IDLE badges, ●/○ inline
  - Field aggregate: Percentage true/fired with breakdown
  - Visual bar showing true/fired ratio
  - Count breakdown (true/false or fired/idle)
- Includes pulse animation for FIRED state

## Charts

### **Sparkline** (`src/ui/debug-viz/charts/Sparkline.tsx`)
- Micro-history visualization for signals
- Features:
  - 280x30px compact chart
  - Ring buffer visualization with wrap handling
  - Phase-aware wrapping for angular units
  - Automatic Y-axis scaling
  - Min/max guides

### **DistributionBar** (`src/ui/debug-viz/charts/DistributionBar.tsx`)
- Min-mean-max visualization for field aggregates
- Horizontal bar with range indicators
- Color-coded segments

### **WarmupIndicator** (`src/ui/debug-viz/charts/WarmupIndicator.tsx`)
- Shows history buffer fill status
- Helps users understand if data is stable

## Extending the System

### Adding a New Renderer

1. **Create the renderer file**:
```typescript
// src/ui/debug-viz/renderers/MyTypeRenderer.tsx
import React from 'react';
import type { ValueRenderer } from '../ValueRenderer';
import type { RendererSample } from '../types';

export const myTypeRenderer: ValueRenderer = {
  renderFull(sample: RendererSample): React.ReactElement {
    if (sample.type === 'scalar') {
      // Render single value
      return <div>{sample.components[0]}</div>;
    } else {
      // Render field aggregate
      return <div>Mean: {sample.stats.mean[0]}</div>;
    }
  },

  renderInline(sample: RendererSample): React.ReactElement {
    const value = sample.type === 'scalar' 
      ? sample.components[0] 
      : sample.stats.mean[0];
    return <span>{value.toFixed(2)}</span>;
  },
};
```

2. **Register the renderer**:
```typescript
// src/ui/debug-viz/renderers/register.ts
import { myTypeRenderer } from './MyTypeRenderer';

// Payload-level registration
registerRenderer('myPayloadType', myTypeRenderer);

// Or exact match for specific unit
registerRenderer('float:myUnit', myTypeRenderer);

// Or category fallback
registerRenderer('category:myCategory', myTypeRenderer);
```

3. **Update types if needed**:
```typescript
// src/ui/debug-viz/types.ts
// Add to getSampleEncoding() if new payload type
case 'myPayloadType':
  return { 
    payload: concretePayload, 
    stride: 1, 
    components: ['value'], 
    sampleable: true 
  };
```

### Adding a New Chart Type

1. Create chart component in `src/ui/debug-viz/charts/`
2. Accept `HistoryView` or `AggregateStats` as props
3. Use SVG for scalable graphics
4. Keep size compact (suitable for mini-view)
5. Use consistent color scheme:
   - Primary: `#4ecdc4` (teal)
   - Warning: `#ffaa00` (amber)
   - Error: `#ff4444` (red)
   - Muted: `#888` (gray)
   - Background: `#1a1a2e` (dark blue)

## Configuration

### Payload to Category Mapping

Categories provide the lowest tier of fallback:

```typescript
const PAYLOAD_TO_CATEGORY: Record<string, Category> = {
  float: 'numeric',
  int: 'numeric',
  vec2: 'numeric',
  vec3: 'numeric',
  color: 'color',
  shape: 'shape',
  bool: 'numeric',
  cameraProjection: 'numeric',
};
```

### Unit Registry Keys

Structured units use their sub-unit for specificity:

- Angle: `turns`, `radians`, `degrees`
- Time: `ms`, `seconds`
- Space: `${unit}${dims}` (e.g., "px2", "world3")
- Color: `rgba`

Simple units use their kind: `none`, `scalar`, `count`

## Performance Characteristics

- **DebugMiniView render**: O(1) - pre-computed history views
- **Value lookup**: O(1) - hash map registry
- **History append**: O(1) - ring buffer write
- **Sparkline render**: O(n) where n = history capacity (typically 100)
- **Field aggregate**: O(m) where m = field lane count

## Testing

Each renderer should have corresponding `.test.tsx` file:

```typescript
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { myTypeRenderer } from './MyTypeRenderer';

describe('MyTypeRenderer', () => {
  it('renders scalar value', () => {
    const sample = {
      type: 'scalar' as const,
      components: new Float32Array([42]),
      stride: 1 as const,
    };
    const result = myTypeRenderer.renderFull(sample);
    const { container } = render(result);
    expect(container.textContent).toContain('42');
  });

  it('renders aggregate stats', () => {
    const sample = {
      type: 'aggregate' as const,
      stats: {
        count: 100,
        stride: 1 as const,
        min: new Float32Array([0, 0, 0, 0]),
        max: new Float32Array([1, 0, 0, 0]),
        mean: new Float32Array([0.5, 0, 0, 0]),
      },
    };
    const result = myTypeRenderer.renderFull(sample);
    const { container } = render(result);
    expect(container.textContent).toContain('0.5');
  });
});
```

## Future Enhancements

### Phase 2: Field Enhancements
- Field color heatmap (per-instance color grid)
- Vec2 field scatter plot (spatial distribution)
- Field data heatmap (gradient visualization)

### Phase 3: Event Visualization
- Event FIRED badge system on graph nodes (Issue #oscilla-animator-v2-db4)
- Event history sparkline (temporal firing patterns)
- Pattern recognition (periodic vs random)

### Phase 4: Advanced Visualizations
- Shape renderer (bounding box, vertex count)
- Path renderer (miniature SVG preview)
- Camera projection renderer (FOV, near/far planes)
- Vec3 renderer (if needed in system)

## Related Files

### Core System
- `src/ui/debug-viz/DebugMiniView.tsx` - Main component
- `src/ui/debug-viz/ValueRenderer.ts` - Renderer registry
- `src/ui/debug-viz/types.ts` - Type definitions
- `src/ui/debug-viz/HistoryService.ts` - Temporal tracking

### Renderers
- `src/ui/debug-viz/renderers/FloatValueRenderer.tsx`
- `src/ui/debug-viz/renderers/ColorValueRenderer.tsx`
- `src/ui/debug-viz/renderers/Vec2ValueRenderer.tsx`
- `src/ui/debug-viz/renderers/BoolEventValueRenderer.tsx`
- `src/ui/debug-viz/renderers/GenericNumericRenderer.tsx`
- `src/ui/debug-viz/renderers/register.ts`

### Charts
- `src/ui/debug-viz/charts/Sparkline.tsx`
- `src/ui/debug-viz/charts/DistributionBar.tsx`
- `src/ui/debug-viz/charts/WarmupIndicator.tsx`

### Services
- `src/services/DebugService.ts` - Runtime → UI bridge
- `src/runtime/DebugTap.ts` - Runtime instrumentation
- `src/stores/DebugStore.ts` - State management
