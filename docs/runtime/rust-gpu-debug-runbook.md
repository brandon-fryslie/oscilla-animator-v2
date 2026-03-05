# Rust/GPU Debug Runbook (Steel Thread)

Use this runbook for every Rust/WebGPU runtime debugging session.

## 1) Start the app in debug URL mode

```bash
pnpm dev -- --port 5175 --strictPort
```

Open:

`http://localhost:5175/?runtimeConsole=true&showPreview=true`

- `runtimeConsole=true` enables canonical runtime heartbeat lines.
- `showPreview=true` keeps the preview canvas visible in isolation.

## 2) Canonical runtime console line contract

Each heartbeat emits one JSON line prefixed with:

`[runtimeConsole]`

Payload contract (required):
- `kind: "runtime-heartbeat"`
- `fps`
- `stats.{drawOps,lastTickMs,meanTickMs,sinkWords,frameCount}`
- `scheduler`
- `telemetry.stageTimings`
- `telemetry.dispatchCounters`
- `telemetry.resourceStats`
- `breadcrumb` (nullable latest runtime event)

## 3) Mandatory smoke check (scripted)

```bash
pnpm test:runtime-console-smoke
```

The script opens `http://localhost:5175/?runtimeConsole=true&showPreview=true`, validates telemetry fields, and fails on fatal breadcrumbs or page/runtime errors.

Environment overrides:

```bash
RUNTIME_DEBUG_URL="http://localhost:5175/?runtimeConsole=true&showPreview=true" \
RUNTIME_SMOKE_TIMEOUT_MS=9000 \
pnpm test:runtime-console-smoke
```

## 4) Chrome DevTools MCP workflow

Use MCP to inspect runtime behavior deterministically:

1. Launch/select a page at `http://localhost:5175/?runtimeConsole=true&showPreview=true`.
2. Capture console messages and ensure `[runtimeConsole]` lines parse as JSON.
3. Capture network + page errors for the same window.
4. Treat any fatal breadcrumb or unhandled page error as a blocking failure.

## 5) Failure triage checklist

- `telemetry.stageTimings.totalFrameMs` regressed: inspect Rust scheduler packet + renderer worker bridge.
- `dispatchCounters` invalid/zero unexpectedly: inspect compute dispatch + sink table word counts.
- `resourceStats` drift from expected canvas/sink/shape words: inspect shared plane writers and runtime-hotpath publication.
- `breadcrumb.severity === "fatal"`: treat as runtime contract break and stop rollout.
