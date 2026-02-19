# Spiral Garden
#
# Spirals arranged in a rotating circle with per-element rainbow colors.
# A hexagon assembled from raw control points via MakeShape2D sits at center.
# Demonstrates: SpiralGenerator, MakeShape2D (assembler), geometry pipeline.

patch "Spiral Garden" {
  block "InfiniteTimeRoot" "clock" {
    periodAMs = 8000
    periodBMs = 20000
    role = "timeRoot"
    outputs {
      phaseA = ring.phase
      phaseB = hue-shift.b
    }
  }

  # --- Spiral shape ---

  block "SpiralGenerator" "spiral" {
    resolution = 48
    turns = 3
    growth = 0.12
    innerRadius = 0.01
    outputs {
      shape = spiral-instances.element
    }
  }

  # 6 copies of the spiral in a circle
  block "Array" "spiral-instances" {
    count = 6
    outputs {
      elements = ring.elements
      t = hue-shift.a
    }
  }

  block "CircleLayoutUV" "ring" {
    radius = 0.3
    outputs {
      position = render-spirals.pos
    }
  }

  # Per-element rainbow that shifts over time
  block "Add" "hue-shift" {
    outputs {
      out = spiral-color.h
    }
  }

  block "MakeColorHSL" "spiral-color" {
    outputs {
      color = render-spirals.color
    }
  }

  block "RenderInstances2D" "render-spirals" {}

  # --- Center hexagon via MakeShape2D assembly pipeline ---

  block "ProceduralPolygon" "hex" {
    sides = 6
    radiusX = 0.08
    radiusY = 0.08
    outputs {
      controlPoints = assemble.controlPoints
    }
  }

  block "MakeShape2D" "assemble" {
    closed = 1
    outputs {
      shape = hex-instances.element
    }
  }

  block "Array" "hex-instances" {
    count = 1
    outputs {
      elements = hex-layout.elements
    }
  }

  block "CircleLayoutUV" "hex-layout" {
    radius = 0.001
    outputs {
      position = render-hex.pos
    }
  }

  block "Const" "hex-color" {
    value = { r = 1, g = 0.9, b = 0.3, a = 1 }
    outputs {
      out = render-hex.color
    }
  }

  block "RenderInstances2D" "render-hex" {}
}
