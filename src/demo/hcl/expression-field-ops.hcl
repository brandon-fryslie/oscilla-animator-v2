# Expression Field Ops
#
# Demonstrates Expression block as a field-first math surface:
# - mixed one+many references (`clock.phaseA` + `points.t`)
# - explicit field mapping with `mapField(value, overField)`
# - pure Expression-driven scale + hue animation

patch "Expression Field Ops" {
  block "InfiniteTimeRoot" "clock" {
    periodAMs = 5000
    role = "timeRoot"
    outputs {
      phaseA = scale_expr.refs
    }
  }

  block "Ellipse" "dot" {
    rx = 0.02
    ry = 0.02
    outputs {
      shape = points.element
    }
  }

  block "Array" "points" {
    count = 120
    outputs {
      elements = layout.elements
      t = [scale_expr.refs, color.h]
    }
  }

  block "GridLayoutUV" "layout" {
    rows = 12
    cols = 10
    outputs {
      position = render.pos
    }
  }

  # Explicit field operator: map one-cardinality oscillator value over points.t lanes
  block "Expression" "scale_expr" {
    expression = "mapField(0.85 + 0.2 * sin(clock.phaseA * 6.2832), points.t)"
    outputs {
      out = render.scale
    }
  }

  block "MakeColorHSL" "color" {
    outputs {
      color = render.color
    }
  }

  block "RenderInstances2D" "render" {}
}
