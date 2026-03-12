# Smooth Chase
#
# An oscillator drives a target value. A Lag block smoothly chases it.
# Both raw and smoothed values drive separate ring scales.
# Per-element rainbow on both rings for visual clarity.
#
# Demonstrates: Lag (exponential smoothing), dual render passes, per-element color.

patch "Smooth Chase" {
  block "InfiniteTimeRoot" "clock" {
    periodAMs = 2500
    role = "timeRoot"
    outputs {
      phaseA = source.phase
    }
  }

  # --- One-cardinality chain: oscillator → lag ---

  block "Oscillator" "source" {
    outputs {
      out = [smoother.target, raw-half.a]
    }
  }

  block "Lag" "smoother" {
    smoothing = 0.92
    initialValue = 0
    outputs {
      out = smooth-half.a
    }
  }

  # --- Scale mapping for both one-cardinality values ---

  block "Const" "half" {
    value = 0.5
    outputs {
      out = [raw-half.b, smooth-half.b]
    }
  }

  block "Const" "one" {
    value = 1
    outputs {
      out = [raw-scale.a, smooth-scale.a]
    }
  }

  block "Multiply" "raw-half" {
    outputs {
      out = raw-scale.b
    }
  }

  block "Add" "raw-scale" {
    outputs {
      out = render-raw.scale
    }
  }

  block "Multiply" "smooth-half" {
    outputs {
      out = smooth-scale.b
    }
  }

  block "Add" "smooth-scale" {
    outputs {
      out = render-smooth.scale
    }
  }

  # --- Outer ring: raw oscillator (jumpy), per-element rainbow ---

  block "Ellipse" "outer-dot" {
    rx = 0.012
    ry = 0.012
    outputs {
      shape = outer-instances.element
    }
  }

  block "Array" "outer-instances" {
    count = 24
    outputs {
      elements = outer-ring.elements
      t = outer-color.h
    }
  }

  block "CircleLayoutUV" "outer-ring" {
    radius = 0.35
    outputs {
      controlPoints = render-raw.controlPoints
    }
  }

  block "Const" "outer-sat" {
    value = 0.5
    outputs {
      out = outer-color.s
    }
  }

  block "MakeColorOKLCH" "outer-color" {
    outputs {
      color = render-raw.color
    }
  }

  block "RenderInstances2D" "render-raw" {}

  # --- Inner ring: smoothed (silky), per-element rainbow ---

  block "Ellipse" "inner-dot" {
    rx = 0.02
    ry = 0.02
    outputs {
      shape = inner-instances.element
    }
  }

  block "Array" "inner-instances" {
    count = 12
    outputs {
      elements = inner-ring.elements
      t = inner-color.h
    }
  }

  block "CircleLayoutUV" "inner-ring" {
    radius = 0.18
    outputs {
      controlPoints = render-smooth.controlPoints
    }
  }

  block "MakeColorOKLCH" "inner-color" {
    outputs {
      color = render-smooth.color
    }
  }

  block "RenderInstances2D" "render-smooth" {}

  # spice_overlay_v2: radial accent layer
  block "Rect" "spicea_tile" {
    width = 0.009
    height = 0.009
    cornerRadius = 0.002
    outputs {
      shape = spicea_instances.element
    }
  }

  block "Array" "spicea_instances" {
    count = 36
    outputs {
      elements = spicea_layout.elements
      t = [spicea_offset.refs, spicea_color.h]
    }
  }

  block "CircleLayoutUV" "spicea_layout" {
    radius = 0.44
    outputs {
      controlPoints = spicea_offset.refs
    }
  }

  block "Expression" "spicea_offset" {
    expression = <<-EXPR
      lane = spicea_instances.t * 31.4159
      x = spicea_layout.controlPoints.x + 0.018 * sin(lane)
      y = spicea_layout.controlPoints.y + 0.018 * cos(lane * 1.3)
      vec2(x, y)
    EXPR
    outputs {
      out = spicea_render.controlPoints
    }
  }

  block "Const" "spicea_scale" {
    value = 0.38
    outputs {
      out = spicea_render.scale
    }
  }

  block "Const" "spicea_sat" {
    value = 0.84
    outputs {
      out = spicea_color.s
    }
  }

  block "Const" "spicea_light" {
    value = 0.72
    outputs {
      out = spicea_color.l
    }
  }

  block "Const" "spicea_alpha" {
    value = 0.7
    outputs {
      out = spicea_color.a
    }
  }

  block "MakeColorOKLCH" "spicea_color" {
    outputs {
      color = spicea_render.color
    }
  }

  block "RenderInstances2D" "spicea_render" {}

}
