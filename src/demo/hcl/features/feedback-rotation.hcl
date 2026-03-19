# Feedback Rotation
#
# UnitDelay showcase: feedback-driven rotation with variable speed.
# Scale breathes in sync with speed — dots grow when fast, shrink when slow.
# Per-element rainbow on outer ring differentiates from feedback-simple.
#
# Demonstrates: UnitDelay, ScaleBias speed-responsive scale, per-element color.

patch "Feedback Rotation" {
  block "InfiniteTimeRoot" "clock" {
    periodAMs = 3000
    periodBMs = 3000
    role = "timeRoot"
    outputs {
      phaseA = speed-osc.phase
      phaseB = inner-layout.phase
    }
  }

  # ===========================================================================
  # FEEDBACK ACCUMULATOR
  # ===========================================================================

  block "Const" "speed-base" {
    value = 0.015
    outputs {
      out = speed-delta.a
    }
  }

  block "Const" "speed-amp" {
    value = 0.01
    outputs {
      out = speed-modulation.b
    }
  }

  block "Oscillator" "speed-osc" {
    outputs {
      out = [speed-modulation.a, scale-map.in]
    }
  }

  block "Multiply" "speed-modulation" {
    outputs {
      out = speed-delta.b
    }
  }

  block "Add" "speed-delta" {
    outputs {
      out = phase-add.b
    }
  }

  block "UnitDelay" "phase-delay" {
    initialValue = 0
    outputs {
      out = phase-add.a
    }
  }

  block "Add" "phase-add" {
    outputs {
      out = phase-wrap.a
    }
  }

  block "Const" "phase-wrap-divisor" {
    value = 1.0
    outputs {
      out = phase-wrap.b
    }
  }

  block "Modulo" "phase-wrap" {
    outputs {
      out = [phase-delay.in, feedback-phase.in]
    }
  }

  block "Adapter_ScalarToPhase01" "feedback-phase" {
    outputs {
      out = [outer-layout.phase, outer-hue.b]
    }
  }

  # Speed-responsive scale: scale = osc * 0.4 + 1.0 → [0.6, 1.4]
  block "Const" "scale-amt" {
    value = 0.55
    outputs {
      out = scale-map.scale
    }
  }

  block "Const" "scale-center" {
    value = 1.05
    outputs {
      out = scale-map.bias
    }
  }

  block "ScaleBias" "scale-map" {
    outputs {
      out = render-outer.scale
    }
  }

  # ===========================================================================
  # OUTER RING: Feedback-driven, per-element rainbow
  # ===========================================================================

  block "Ellipse" "outer-dot" {
    rx = 0.018
    ry = 0.018
    outputs {
      shape = outer-instances.element
    }
  }

  block "Array" "outer-instances" {
    count = 36
    outputs {
      elements = outer-layout.elements
      t = outer-hue.a
    }
  }

  block "CircleLayoutUV" "outer-layout" {
    radius = 0.35
    outputs {
      controlPoints = render-outer.controlPoints
    }
  }

  block "MakeColorOKLCH" "outer-color" {
    s = 0.95
    l = 0.74
    a = 0.95
    outputs {
      color = render-outer.color
    }
  }

  block "Add" "outer-hue" {
    outputs {
      out = outer-color.h
    }
  }

  # ===========================================================================
  # INNER RING: Constant speed, warm orange
  # ===========================================================================

  block "Ellipse" "inner-dot" {
    rx = 0.013
    ry = 0.013
    outputs {
      shape = inner-instances.element
    }
  }

  block "Array" "inner-instances" {
    count = 20
    outputs {
      elements = inner-layout.elements
    }
  }

  block "CircleLayoutUV" "inner-layout" {
    radius = 0.18
    outputs {
      controlPoints = render-inner.controlPoints
    }
  }

  block "Const" "inner-color" {
    value = { r = 1.0, g = 0.6, b = 0.3, a = 1.0 }
    outputs {
      out = render-inner.color
    }
  }

  block "RenderInstances2D" "render-outer" {}
  block "RenderInstances2D" "render-inner" {}
}
