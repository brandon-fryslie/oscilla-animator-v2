# Adapter Obligation Name Demo
#
# Intentionally invalid: wires vec2 output into RenderInstances2D.scale (float).
# This should produce an open needsAdapter obligation and demonstrate
# canonical block-type names in the diagnostic message.
#
# @expect-compile-error needsAdapter:ExternalVec2.position->RenderInstances2D.scale

patch "Adapter Obligation Name Demo" {
  block "Ellipse" "dot" {
    rx = 0.03
    ry = 0.03
    outputs {
      shape = instances.element
    }
  }

  block "InstanceDomain" "instances" {
    count = 24
    outputs {
      index = layout.index
      rank = color.h
    }
  }

  block "ScatterUV" "layout" {

    outputs {
      uv = render.controlPoints
    }
  }

  block "MakeColorOKLCH" "color" {
    outputs {
      color = render.color
    }
  }

  block "ExternalVec2" "bad-scale" {
    channelBase = "mouse"
    outputs {
      position = render.scale
    }
  }

  block "RenderInstances2D" "render" {}
}
