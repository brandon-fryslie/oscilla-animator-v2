# Spiral Garden
#
# Pentagons assembled via MakeShape2D, arranged in an Archimedean spiral
# with per-element rainbow colors that shift over time.
# Demonstrates: ProceduralPolygon, MakeShape2D (assembler), SpiralLayout (distributor).

patch "Spiral Garden" {
  block "InfiniteTimeRoot" "clock" {
    periodAMs = 30000
    periodBMs = 120000
    role = "timeRoot"
    outputs {
      phaseA = spiral.phase
      phaseB = hue-shift.b
    }
  }

  # --- Shape stamp: a pentagon assembled from control points ---

  block "ProceduralPolygon" "polygon" {
    sides = 5
    radiusX = 0.04
    radiusY = 0.04
    outputs {
      controlPoints = assemble.controlPoints
    }
  }

  block "MakeShape2D" "assemble" {
    closed = 1
    outputs {
      shape = instances.element
    }
  }

  # --- Instance array ---

  block "Array" "instances" {
    count = 200
    outputs {
      elements = spiral.elements
      t = hue-shift.a
    }
  }

  # --- Spiral layout (Type A Distributor) ---

  block "SpiralLayout" "spiral" {
    turns = 5
    expansion = 0.4
    outputs {
      position = render.pos
    }
  }

  # --- Per-element rainbow color ---

  block "Add" "hue-shift" {
    outputs {
      out = color.h
    }
  }

  block "MakeColorHSL" "color" {
    outputs {
      color = render.color
    }
  }

  block "RenderInstances2D" "render" {}
}
