# Diagnostic Stage 03: Expression Ops + Block Refs
#
# Purpose:
# - Verify Expression lowering on GPU path with mapField + trig + min/max/clamp/mix.
# - Verify block refs inside expression (`grid.controlPoints`, `instances.t`, `clock.phaseA`).
# - Isolate Expression behavior with moderate cardinality for easier inspection.

patch "Diagnostic - Stage 03 Expression Ops" {
  block "InfiniteTimeRoot" "clock" {
    periodAMs = 6500
    role = "timeRoot"
    outputs {
      phaseA = [position.refs, scale.refs]
    }
  }

  block "Ellipse" "dot" {
    rx = 0.01
    ry = 0.01
    outputs {
      shape = instances.element
    }
  }

  block "Array" "instances" {
    count = 144
    outputs {
      elements = grid.elements
      t = [position.refs, scale.refs, color.h]
    }
  }

  block "GridLayoutUV" "grid" {
    rows = 12
    cols = 12
    outputs {
      controlPoints = [position.refs, scale.refs]
    }
  }

  block "Expression" "position" {
    expression = <<-EXPR
      phase = mapField(clock.phaseA * 6.2832, instances.t)
      x0 = grid.controlPoints.x
      y0 = grid.controlPoints.y
      lane = instances.t

      radius = sqrt(max(x0 * x0 + y0 * y0, 0.000001))
      warp = sin(phase + lane * 18.0 + radius * 25.0)
      gain = mix(0.01, 0.05, clamp(0.5 + 0.5 * warp, 0.0, 1.0))

      x = x0 + gain * cos(phase + y0 * 11.0)
      y = y0 + gain * sin(phase + x0 * 11.0)
      vec2(x, y)
    EXPR
    outputs {
      out = render.controlPoints
    }
  }

  block "Expression" "scale" {
    expression = <<-EXPR
      phase = mapField(clock.phaseA * 6.2832, instances.t)
      wave = clamp(0.5 + 0.5 * sin(phase + instances.t * 31.4159), 0.0, 1.0)
      mix(0.45, 0.95, wave)
    EXPR
    outputs {
      out = render.scale
    }
  }

  block "MakeColorOKLCH" "color" {
    outputs {
      color = render.color
    }
  }

  block "RenderInstances2D" "render" {}
}
