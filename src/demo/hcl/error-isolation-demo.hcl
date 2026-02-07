# Error Isolation Demo
#
# Demonstrates that disconnected broken blocks don't stop compilation.
# The main grid animates with per-element purple-to-pink gradient.
#
# Check the diagnostic console for W_BLOCK_UNREACHABLE_ERROR warnings.
# Demonstrates: error isolation, partial compilation, diagnostic warnings.

patch "Error Isolation Demo" {
  # ========================================================================
  # WORKING RENDER PIPELINE
  # ========================================================================

  block "InfiniteTimeRoot" "clock" {
    periodAMs = 2000
    periodBMs = 10000
    role = "timeRoot"
    outputs {
      phaseA = hue-animated.b
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
      t = hue-scaled.a
    }
  }

  block "GridLayoutUV" "grid" {
    rows = 10
    cols = 10
    outputs {
      position = render.pos
    }
  }

  # Per-element purple-to-pink (hue 0.75→0.95), shifting with time
  block "Const" "hue-range" {
    value = 0.2
    outputs {
      out = hue-scaled.b
    }
  }

  block "Const" "hue-base" {
    value = 0.75
    outputs {
      out = hue-offset.b
    }
  }

  block "Multiply" "hue-scaled" {
    outputs {
      out = hue-offset.a
    }
  }

  block "Add" "hue-offset" {
    outputs {
      out = hue-animated.a
    }
  }

  block "Add" "hue-animated" {
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

  # ========================================================================
  # BROKEN DISCONNECTED BLOCKS - These should NOT stop compilation
  # ========================================================================

  block "Expression" "broken-expr-1" {
    expression = "this is not valid +++"
  }

  block "Expression" "broken-expr-2" {
    expression = "in0 +"
  }

  block "Expression" "broken-expr" {
    expression = "*** invalid ***"
    outputs {
      out = unused-add.a
    }
  }

  block "Add" "unused-add" {}
}
