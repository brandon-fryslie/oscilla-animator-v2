# Judder Hot-Swap Test
#
# Purpose:
#   Validate continuity + compile/swap behavior while the scene is animating.
#   This patch is intentionally simple to make judder easy to spot.

patch "Judder Hot-Swap Test" {
  block "Comment" "instructions" {
    text = "Judder test instructions:\n1) Press Play and let it run for 10-15 seconds.\n2) Change spiral-turns.value repeatedly (e.g. 4 -> 12 -> 6 -> 14) while animation is running.\n3) Change instances.count between 300 and 1200 to force reallocation + continuity remap.\n4) Optionally add/remove a Lens on render.scale to trigger graph recompiles.\nExpected: no visible freeze, no hard-cut jump, and motion phase should feel continuous after swaps.\nIf you see judder, note exact edit action + timestamp."
  }

  block "InfiniteTimeRoot" "clock" {
    periodAMs = 22000
    periodBMs = 5000
    role = "timeRoot"
    outputs {
      phaseA = spin-osc.phase
      phaseB = pulse-osc.phase
    }
  }

  block "Ellipse" "dot" {
    rx = 0.008
    ry = 0.008
    outputs {
      shape = instances.element
    }
  }

  block "Array" "instances" {
    count = 800
    outputs {
      elements = spiral.elements
      t = color.h
    }
  }

  block "Const" "spiral-turns" {
    value = 7
    outputs {
      out = spiral.turns
    }
  }

  block "Const" "spiral-expansion" {
    value = 0.65
    outputs {
      out = spiral.expansion
    }
  }

  block "Oscillator" "spin-osc" {
    mode = 0
    outputs {
      out = spin-map.in
    }
  }

  block "Const" "spin-scale" {
    value = 1.2
    outputs {
      out = spin-map.scale
    }
  }

  block "Const" "spin-bias" {
    value = -0.6
    outputs {
      out = spin-map.bias
    }
  }

  block "ScaleBias" "spin-map" {
    outputs {
      out = spiral.spin
    }
  }

  block "SpiralLayout" "spiral" {
    outputs {
      controlPoints = render.controlPoints
    }
  }

  block "Oscillator" "pulse-osc" {
    mode = 0
    outputs {
      out = pulse-map.in
    }
  }

  block "Const" "pulse-scale" {
    value = 0.28
    outputs {
      out = pulse-map.scale
    }
  }

  block "Const" "pulse-bias" {
    value = 0.82
    outputs {
      out = pulse-map.bias
    }
  }

  block "ScaleBias" "pulse-map" {
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

