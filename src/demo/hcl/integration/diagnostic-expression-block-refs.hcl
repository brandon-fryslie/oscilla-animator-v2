# Diagnostic: Expression Block Refs
#
# Purpose:
# - Validates Expression block references to layout outputs (`layout.uv`)
# - Validates field swizzle reads (`.x` / `.y`)
# - Validates deterministic lane-dependent branching in field context

patch "Diagnostic - Expression Block Refs" {
  block "InfiniteTimeRoot" "clock" {
    periodAMs = 9000
    role = "timeRoot"
    outputs {
      phaseA = [offset.refs, scale.refs]
    }
  }

  block "Ellipse" "dot" {
    rx = 0.009
    ry = 0.009
    outputs {
      shape = instances.element
    }
  }

  block "InstanceDomain" "instances" {
    count = 180
    outputs {
      index = layout.index
      rank = [offset.refs, scale.refs, color.h]
    }
  }

  block "ScatterUV" "layout" {
    outputs {
      uv = offset.refs
    }
  }

  block "Expression" "offset" {
    expression = <<-EXPR
      phase = mapField(clock.phaseA * 6.2832, instances.rank)
      lane = instances.rank * 25.1328
      signed = instances.rank > 0.5 ? 1.0 : -1.0
      x = layout.uv.x + signed * 0.035 * sin(phase + lane)
      y = layout.uv.y + signed * 0.035 * cos(phase + lane)
      vec2(x, y)
    EXPR
    outputs {
      out = render.controlPoints
    }
  }

  block "Expression" "scale" {
    expression = <<-EXPR
      phase = mapField(clock.phaseA * 6.2832, instances.rank)
      0.62 + 0.18 * sin(phase + instances.rank * 31.4159)
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
