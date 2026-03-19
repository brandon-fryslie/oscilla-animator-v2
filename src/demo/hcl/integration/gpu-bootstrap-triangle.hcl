patch "GPU Bootstrap Triangle" {
  block "InfiniteTimeRoot" "clock" {
    periodAMs = 4000
    periodBMs = 4000
    role = "timeRoot"
  }

  block "GpuTriangleRigid" "triangle" {
    outputs {
      shape = render.shape
    }
  }

  block "WebGPUType1Sink" "render" {}
}
