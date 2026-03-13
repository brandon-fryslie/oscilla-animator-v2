# Error Isolation Demo
#
# Demonstrates that disconnected broken blocks don't stop compilation.
# The main grid animates with per-element rainbow and pulsing scale.
#
# Check the diagnostic console for W_BLOCK_UNREACHABLE_ERROR warnings.
# Demonstrates: error isolation, partial compilation, ScaleBias pulsing.

patch "Error Isolation Demo" {
  # ========================================================================
  # WORKING RENDER PIPELINE
  # ========================================================================

  block "InfiniteTimeRoot" "clock" {
    periodAMs = 2000
    role = "timeRoot"
    outputs {
      phaseA = pulse.phase
    }
  }

  block "Ellipse" "dot" {
    rx = 0.03
    ry = 0.03
    outputs {
      shape = instances.element
    }
  }

  block "Array" "instances" {
    count = 100
    outputs {
      elements = grid.elements
      t = color.h
    }
  }

  block "GridLayoutUV" "grid" {
    rows = 10
    cols = 10
    outputs {
      controlPoints = render.controlPoints
    }
  }

  # Per-element rainbow
  block "MakeColorOKLCH" "color" {
    outputs {
      color = render.color
    }
  }

  # Pulsing scale
  block "Oscillator" "pulse" {
    outputs {
      out = scale-map.in
    }
  }

  block "Const" "scale-amt" {
    value = 0.3
    outputs {
      out = scale-map.scale
    }
  }

  block "Const" "scale-center" {
    value = 1.0
    outputs {
      out = scale-map.bias
    }
  }

  block "ScaleBias" "scale-map" {
    outputs {
      out = render.scale
    }
  }

  block "RenderInstances2D" "render" {}

  # ========================================================================
  # BROKEN DISCONNECTED BLOCKS - These should NOT stop compilation
  # ========================================================================

  block "Expression" "broken-expr-1" {
    expression = <<-EXPR
      // [LAW:behavior-not-structure] Keep this expression invalid to assert isolation semantics, not implementation details.
      // Visual: no effect, because this disconnected block is intentionally excluded from render output.
      this is not valid +++
    EXPR
  }

  block "Expression" "broken-expr-2" {
    expression = <<-EXPR
      // [LAW:behavior-not-structure] This malformed expression remains intentional for unreachable-error demo coverage.
      // Visual: no effect, since this block is also disconnected.
      in0 +
    EXPR
  }

  block "Expression" "broken-expr" {
    expression = <<-EXPR
      // [LAW:behavior-not-structure] Preserve an explicit syntax failure while still documenting purpose.
      // Visual: no visible impact; output only feeds an unused disconnected add node.
      *** invalid ***
    EXPR
    outputs {
      out = unused-add.a
    }
  }

  block "Add" "unused-add" {}

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
