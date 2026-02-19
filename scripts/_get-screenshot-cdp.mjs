#!/usr/bin/env node
/**
 * _get-screenshot-cdp.mjs — Chrome DevTools Protocol screenshot capture
 *
 * Navigates to a URL, waits for canvas, then captures screenshots on a burst
 * schedule with accurate JS-context timing via performance.now().
 *
 * Zero external dependencies — uses only Node.js built-in modules.
 *
 * Usage: node _get-screenshot-cdp.mjs <port> <url> <output-dir> <width> <height> <burst-json>
 *
 * Outputs to stdout (tab-separated, one line per frame):
 *   /path/to/frame_00000ms.png\t0
 *   /path/to/frame_00102ms.png\t102
 *
 * Internal helper for get-screenshot-of-demo-patch.sh. Not intended for direct use.
 */

import { request as httpRequest } from 'node:http';
import { randomBytes } from 'node:crypto';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const [debugPort, targetUrl, outputDir, widthStr, heightStr, burstJson] = process.argv.slice(2);

if (!debugPort || !targetUrl || !outputDir || !widthStr || !heightStr || !burstJson) {
  console.error('Usage: node _get-screenshot-cdp.mjs <port> <url> <output-dir> <width> <height> <burst-json>');
  process.exit(1);
}

const viewportWidth = parseInt(widthStr);
const viewportHeight = parseInt(heightStr);
const burst = JSON.parse(burstJson);

// Global timeout — never hang indefinitely
setTimeout(() => {
  console.error('Error: Global timeout reached (60s). Aborting.');
  process.exit(1);
}, 60_000).unref();

// ─── HTTP helpers ────────────────────────────────────────────────────────────

function httpGet(url) {
  return new Promise((resolve, reject) => {
    httpRequest(url, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { reject(new Error(`Failed to parse JSON from ${url}: ${data.slice(0, 200)}`)); }
      });
    }).on('error', reject).end();
  });
}

// ─── Minimal WebSocket client (RFC 6455) ─────────────────────────────────────

function connectWebSocket(wsUrl) {
  return new Promise((resolve, reject) => {
    const url = new URL(wsUrl);
    const key = randomBytes(16).toString('base64');
    const req = httpRequest({
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: 'GET',
      headers: {
        Connection: 'Upgrade',
        Upgrade: 'websocket',
        'Sec-WebSocket-Key': key,
        'Sec-WebSocket-Version': '13',
      },
    });
    req.on('upgrade', (_res, socket, head) => resolve(new WSConnection(socket, head)));
    req.on('error', reject);
    req.setTimeout(10_000, () => req.destroy(new Error('WebSocket connection timeout')));
    req.end();
  });
}

class WSConnection {
  #socket;
  #buf = Buffer.alloc(0);
  #fragments = [];
  #nextId = 1;
  #pending = new Map();
  #listeners = new Map();

  constructor(socket, head) {
    this.#socket = socket;
    if (head.length > 0) this.#buf = Buffer.from(head);
    socket.on('data', (chunk) => {
      this.#buf = Buffer.concat([this.#buf, chunk]);
      this.#drain();
    });
    socket.on('error', (err) => console.error(`WS error: ${err.message}`));
  }

  send(method, params = {}) {
    const id = this.#nextId++;
    return new Promise((resolve, reject) => {
      this.#pending.set(id, (msg) => {
        if (msg.error) reject(new Error(`CDP ${method}: ${msg.error.message}`));
        else resolve(msg.result);
      });
      this.#writeFrame(1, Buffer.from(JSON.stringify({ id, method, params })));
    });
  }

  on(method, handler) {
    const list = this.#listeners.get(method) ?? [];
    list.push(handler);
    this.#listeners.set(method, list);
  }

  close() {
    try { this.#writeFrame(8, Buffer.alloc(0)); this.#socket.end(); } catch { /* */ }
  }

  #writeFrame(opcode, payload) {
    const mask = randomBytes(4);
    const len = payload.length;
    let header;
    if (len < 126) {
      header = Buffer.alloc(6);
      header[0] = 0x80 | opcode;
      header[1] = 0x80 | len;
      mask.copy(header, 2);
    } else if (len < 65536) {
      header = Buffer.alloc(8);
      header[0] = 0x80 | opcode;
      header[1] = 0x80 | 126;
      header.writeUInt16BE(len, 2);
      mask.copy(header, 4);
    } else {
      header = Buffer.alloc(14);
      header[0] = 0x80 | opcode;
      header[1] = 0x80 | 127;
      header.writeBigUInt64BE(BigInt(len), 2);
      mask.copy(header, 10);
    }
    const masked = Buffer.from(payload);
    for (let i = 0; i < masked.length; i++) masked[i] ^= mask[i % 4];
    this.#socket.write(Buffer.concat([header, masked]));
  }

  #drain() {
    while (this.#buf.length >= 2) {
      const b0 = this.#buf[0];
      const b1 = this.#buf[1];
      const fin = (b0 & 0x80) !== 0;
      const opcode = b0 & 0x0f;
      let payloadLen = b1 & 0x7f;
      let offset = 2;

      if (payloadLen === 126) {
        if (this.#buf.length < 4) return;
        payloadLen = this.#buf.readUInt16BE(2);
        offset = 4;
      } else if (payloadLen === 127) {
        if (this.#buf.length < 10) return;
        payloadLen = Number(this.#buf.readBigUInt64BE(2));
        offset = 10;
      }

      const totalLen = offset + payloadLen;
      if (this.#buf.length < totalLen) return;

      const payload = this.#buf.subarray(offset, totalLen);
      this.#buf = Buffer.from(this.#buf.subarray(totalLen));

      if (opcode === 8) { this.#socket.end(); return; }
      if (opcode === 9) { this.#writeFrame(10, Buffer.from(payload)); continue; }
      if (opcode === 10) continue;

      this.#fragments.push(Buffer.from(payload));
      if (fin) {
        const text = Buffer.concat(this.#fragments).toString('utf8');
        this.#fragments = [];
        this.#onMessage(text);
      }
    }
  }

  #onMessage(text) {
    const msg = JSON.parse(text);
    if (msg.id != null && this.#pending.has(msg.id)) {
      this.#pending.get(msg.id)(msg);
      this.#pending.delete(msg.id);
    }
    if (msg.method) {
      for (const h of this.#listeners.get(msg.method) ?? []) h(msg.params);
    }
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Read performance.now() from the browser JS context. */
async function readJsTime(cdp) {
  const result = await cdp.send('Runtime.evaluate', {
    expression: 'performance.now()',
    returnByValue: true,
  });
  return result.result.value;
}

async function main() {
  // 1. Connect to Chrome
  const targets = await httpGet(`http://127.0.0.1:${debugPort}/json/list`);
  const page = targets.find((t) => t.type === 'page');
  if (!page) { console.error('Error: No page target found.'); process.exit(1); }

  const cdp = await connectWebSocket(page.webSocketDebuggerUrl);

  // 2. Set viewport
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: viewportWidth,
    height: viewportHeight,
    deviceScaleFactor: 1,
    mobile: false,
  });

  // 3. Navigate
  await cdp.send('Page.enable');
  console.error(`Navigating: ${targetUrl}`);
  console.error(`Viewport: ${viewportWidth}×${viewportHeight}`);
  await cdp.send('Page.navigate', { url: targetUrl });

  // 4. Poll for <canvas> — app has loaded, compiled, and rendered
  const POLL_TIMEOUT_MS = 30_000;
  const start = Date.now();
  let canvasFound = false;

  while (Date.now() - start < POLL_TIMEOUT_MS) {
    try {
      const result = await cdp.send('Runtime.evaluate', {
        expression: "document.querySelector('canvas') !== null",
        returnByValue: true,
      });
      if (result?.result?.value === true) { canvasFound = true; break; }
    } catch { /* execution context may change during redirect — retry */ }
    await sleep(500);
  }

  if (canvasFound) {
    console.error('Canvas detected.');
  } else {
    console.error('Warning: Canvas not found after 30s. Capturing anyway.');
  }

  // 5. Wait burst_wait before starting capture (default 0 — capture from animation start)
  if (burst.wait > 0) {
    console.error(`Waiting ${burst.wait}ms before capture...`);
    await sleep(burst.wait);
  }

  // 6. Build target schedule (ms offsets from capture start)
  //    burst_start(b) = b * ((size-1)*interval + gap)
  //    shot(b,s) = burst_start(b) + s * interval
  const schedule = [];
  for (let b = 0; b < burst.count; b++) {
    const burstStart = b * ((burst.size - 1) * burst.interval + burst.gap);
    for (let s = 0; s < burst.size; s++) {
      schedule.push(burstStart + s * burst.interval);
    }
  }

  // 7. Inject timing overlay into the page DOM.
  //    Rendered by the browser's own text engine — no Freetype/ImageMagick fonts needed.
  const showOverlay = burst.count > 1 || burst.size > 1;
  if (showOverlay) {
    await cdp.send('Runtime.evaluate', {
      expression: `(() => {
        const el = document.createElement('div');
        el.id = '__oscilla_timing_overlay';
        el.style.cssText = 'position:fixed;top:6px;left:6px;z-index:999999;' +
          'font:bold ${Math.max(12, Math.round(viewportHeight / 25))}px/1 monospace;' +
          'color:#fff;text-shadow:0 0 4px #000,0 0 2px #000;pointer-events:none;';
        document.body.appendChild(el);
      })()`,
    });
  }

  // 8. Execute capture schedule with accurate JS-context timing.
  //    We record performance.now() RIGHT BEFORE each captureScreenshot call.
  //    The delta from the first recording is the authoritative animation timestamp.
  mkdirSync(outputDir, { recursive: true });

  const CAPTURE_LIMIT_MS = 10_000;
  const captureBaseWall = Date.now();
  let baseJsTime = null;
  let frameCount = 0;

  console.error(`Capturing ${schedule.length} frames...`);

  for (const targetOffset of schedule) {
    // Enforce 10s capture time limit
    if (Date.now() - captureBaseWall > CAPTURE_LIMIT_MS) {
      console.error('Capture time limit reached (10s). Stopping.');
      break;
    }

    // Sleep until target time (corrects for drift from prior screenshot latency)
    const elapsed = Date.now() - captureBaseWall;
    const remaining = targetOffset - elapsed;
    if (remaining > 0) await sleep(remaining);

    // Record JS animation time — this is the authoritative timestamp
    let jsTime;
    try {
      jsTime = await readJsTime(cdp);
    } catch {
      console.error(`Warning: Failed to read JS time for frame ${frameCount}. Skipping.`);
      continue;
    }
    if (baseJsTime === null) baseJsTime = jsTime;
    const deltaMs = Math.round(jsTime - baseJsTime);

    // Update the timing overlay text (rendered by the browser, captured in screenshot)
    if (showOverlay) {
      await cdp.send('Runtime.evaluate', {
        expression: `document.getElementById('__oscilla_timing_overlay').textContent = '+${deltaMs}ms'`,
      });
    }

    // Capture screenshot
    let screenshot;
    try {
      screenshot = await cdp.send('Page.captureScreenshot', {
        format: 'png',
        captureBeyondViewport: false,
      });
    } catch (err) {
      console.error(`Warning: Screenshot failed for frame ${frameCount}: ${err.message}. Skipping.`);
      continue;
    }

    if (!screenshot?.data) {
      console.error(`Warning: No data for frame ${frameCount}. Skipping.`);
      continue;
    }

    // Save frame with delta in filename
    const paddedDelta = String(deltaMs).padStart(5, '0');
    const framePath = join(outputDir, `frame_${paddedDelta}ms.png`);
    writeFileSync(framePath, Buffer.from(screenshot.data, 'base64'));

    // Output manifest line to stdout (tab-separated: path, deltaMs)
    console.log(`${framePath}\t${deltaMs}`);
    frameCount++;
  }

  console.error(`Captured ${frameCount} frames.`);
  cdp.close();
}

main().catch((err) => {
  console.error(`CDP capture failed: ${err.message}`);
  process.exit(1);
});
