use wasm_bindgen::JsValue;
use web_sys::OffscreenCanvas;

pub fn create_surface(
    instance: &wgpu::Instance,
    canvas: OffscreenCanvas,
) -> Result<wgpu::Surface<'static>, JsValue> {
    instance
        .create_surface(wgpu::SurfaceTarget::OffscreenCanvas(canvas))
        .map_err(|error| JsValue::from_str(&format!("create_surface failed: {error}")))
}

pub async fn request_adapter(
    instance: &wgpu::Instance,
    surface: &wgpu::Surface<'_>,
) -> Result<wgpu::Adapter, JsValue> {
    instance
        .request_adapter(&wgpu::RequestAdapterOptions {
            power_preference: wgpu::PowerPreference::HighPerformance,
            compatible_surface: Some(surface),
            force_fallback_adapter: false,
        })
        .await
        .ok_or_else(|| JsValue::from_str("request_adapter failed: no compatible adapter"))
}

pub async fn request_device(
    adapter: &wgpu::Adapter,
    required_limits: wgpu::Limits,
) -> Result<(wgpu::Device, wgpu::Queue), JsValue> {
    adapter
        .request_device(
            &wgpu::DeviceDescriptor {
                label: Some("Oscilla.Render.Device"),
                required_features: wgpu::Features::INDIRECT_FIRST_INSTANCE,
                required_limits,
                memory_hints: wgpu::MemoryHints::Performance,
            },
            None,
        )
        .await
        .map_err(|error| JsValue::from_str(&format!("request_device failed: {error}")))
}
