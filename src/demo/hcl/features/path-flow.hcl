# Path Flow
#
# Elements flowing along a visible pentagon path.  A dense scaffold
# of tiny dots traces the path shape behind the flowing elements
# so the shape they're following is unmistakable.
#
# Demonstrates: PathLayout arc-length sampling, ProceduralPolygon,
#               ShapeWobble2D, dual-layer render (scaffold + flow).

patch "Path Flow" {
  block "InfiniteTimeRoot" "clock" {
    periodAMs = 8000
    periodBMs = 12000
    role = "timeRoot"
    outputs {
      phaseA = [path-layout.offset, polygon-wobble.phase]
      phaseB = hue-shift.b
    }
  }

  # --- Pentagon path definition ---

  block "ProceduralPolygon" "polygon" {
    sides = 5
    radiusX = 0.28
    radiusY = 0.28
    outputs {
      controlPoints = polygon-wobble.controlPoints
    }
  }

  block "ShapeWobble2D" "polygon-wobble" {
    amount = 0.018
    frequency = 5
    outputs {
      points = assembler.controlPoints
    }
  }

  block "MakeShape2D" "assembler" {
    closed = true
    outputs {
      shape = [path-layout.shape, scaffold-layout.shape]
    }
  }

  # --- Scaffold layer: dense tiny dots tracing the pentagon path ---

  block "Ellipse" "scaffold-dot" {
    rx = 0.005
    ry = 0.005
    outputs {
      shape = scaffold-arr.element
    }
  }

  block "Array" "scaffold-arr" {
    count = 200
    outputs {
      elements = scaffold-layout.elements
    }
  }

  block "PathLayout" "scaffold-layout" {
    outputs {
      controlPoints = scaffold-center.refs
    }
  }

  block "Expression" "scaffold-center" {
    expression = <<-EXPR
      x = scaffold_layout.controlPoints.x + 0.5
      y = scaffold_layout.controlPoints.y + 0.5
      vec2(x, y)
    EXPR
    outputs {
      out = scaffold-render.controlPoints
    }
  }

  block "Const" "scaffold-color" {
    value = { r = 0.4, g = 0.5, b = 0.7, a = 0.35 }
    outputs {
      out = scaffold-render.color
    }
  }

  block "RenderInstances2D" "scaffold-render" {}

  # --- Flow layer: colored dots flowing along the path ---

  block "Ellipse" "dot" {
    rx = 0.014
    ry = 0.014
    outputs {
      shape = arr.element
    }
  }

  block "Array" "arr" {
    count = 48
    outputs {
      elements = path-layout.elements
      t = hue-shift.a
    }
  }

  block "PathLayout" "path-layout" {
    outputs {
      controlPoints = center-path.refs
    }
  }

  block "Expression" "center-path" {
    expression = <<-EXPR
      x = path_layout.controlPoints.x + 0.5
      y = path_layout.controlPoints.y + 0.5
      vec2(x, y)
    EXPR
    outputs {
      out = render.controlPoints
    }
  }

  block "Add" "hue-shift" {
    outputs {
      out = color.h
    }
  }

  block "MakeColorOKLCH" "color" {
    s = 0.95
    l = 0.78
    a = 0.95
    outputs {
      color = render.color
    }
  }

  block "RenderInstances2D" "render" {}
}
