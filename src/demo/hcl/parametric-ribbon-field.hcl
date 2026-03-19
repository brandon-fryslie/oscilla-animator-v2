# Parametric Ribbon Field
#
# Demonstrates the fresh ParametricTemplates path with live per-instance cubic ribbons.
# Every ribbon shares the same analytical template family, but each lane gets unique
# control-handle motion from instances.t plus shared time.

patch "Parametric Ribbon Field" {
  block "InfiniteTimeRoot" "clock" {
    periodAMs = 9000
    role = "timeRoot"
    outputs {
      phaseA = [pos-x.refs, pos-y.refs, curve-start.refs, curve-h1.refs, curve-h2.refs, curve-end.refs, scale.refs, thickness.refs]
    }
  }

  block "Array" "instances" {
    count = 256
    outputs {
      elements = grid.elements
      t = [pos-x.refs, pos-y.refs, curve-start.refs, curve-h1.refs, curve-h2.refs, curve-end.refs, scale.refs, thickness.refs]
    }
  }

  block "GridLayoutUV" "grid" {
    rows = 16
    cols = 16
    outputs {
      controlPoints = [pos-x.refs, pos-y.refs]
    }
  }

  block "Expression" "pos-x" {
    expression = <<-EXPR
      phase = mapField(clock.phaseA * 6.2832, instances.t)
      drift = 0.012 * sin(phase + instances.t * 18.0)
      grid.controlPoints.x + drift
    EXPR
    outputs {
      out = render.posX
    }
  }

  block "Expression" "pos-y" {
    expression = <<-EXPR
      phase = mapField(clock.phaseA * 6.2832, instances.t)
      drift = 0.012 * cos(phase * 2.0 + instances.t * 23.0)
      grid.controlPoints.y + drift
    EXPR
    outputs {
      out = render.posY
    }
  }

  block "Expression" "curve-start" {
    expression = <<-EXPR
      phase = mapField(clock.phaseA * 6.2832, instances.t)
      seed = instances.t * 41.0
      x = -0.03 + 0.004 * sin(seed + phase)
      y = 0.016 * sin(seed * 1.7 - phase * 2.0)
      vec2(x, y)
    EXPR
    outputs {
      out = render.p0
    }
  }

  block "Expression" "curve-h1" {
    expression = <<-EXPR
      phase = mapField(clock.phaseA * 6.2832, instances.t)
      seed = instances.t * 59.0
      x = -0.012 + 0.01 * sin(seed * 0.9 + phase)
      y = 0.024 * cos(seed * 1.3 - phase * 2.0)
      vec2(x, y)
    EXPR
    outputs {
      out = render.p1
    }
  }

  block "Expression" "curve-h2" {
    expression = <<-EXPR
      phase = mapField(clock.phaseA * 6.2832, instances.t)
      seed = instances.t * 73.0
      x = 0.012 + 0.01 * cos(seed * 1.1 - phase * 2.0)
      y = 0.024 * sin(seed * 1.5 + phase)
      vec2(x, y)
    EXPR
    outputs {
      out = render.p2
    }
  }

  block "Expression" "curve-end" {
    expression = <<-EXPR
      phase = mapField(clock.phaseA * 6.2832, instances.t)
      seed = instances.t * 97.0
      x = 0.03 + 0.004 * cos(seed - phase)
      y = 0.016 * cos(seed * 1.9 + phase * 2.0)
      vec2(x, y)
    EXPR
    outputs {
      out = render.p3
    }
  }

  block "Expression" "scale" {
    expression = <<-EXPR
      phase = mapField(clock.phaseA * 6.2832, instances.t)
      0.78 + 0.24 * sin(phase * 2.0 + instances.t * 15.0)
    EXPR
    outputs {
      out = render.scale
    }
  }

  block "Expression" "thickness" {
    expression = <<-EXPR
      phase = mapField(clock.phaseA * 6.2832, instances.t)
      0.012 + 0.008 * (0.5 + 0.5 * sin(phase * 2.0 + instances.t * 29.0))
    EXPR
    outputs {
      out = render.thickness
    }
  }

  block "Const" "hue" {
    value = 0.58
    outputs {
      out = color.h
    }
  }

  block "Const" "chroma" {
    value = 0.17
    outputs {
      out = color.s
    }
  }

  block "Const" "lightness" {
    value = 0.64
    outputs {
      out = color.l
    }
  }

  block "MakeColorOKLCH" "color" {
    outputs {
      color = render.color
    }
  }

  block "CubicBezierRibbon2D" "render" {
    resolution = 24
  }
}
