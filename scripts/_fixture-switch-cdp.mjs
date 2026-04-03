#!/usr/bin/env node
/**
 * _fixture-switch-cdp.mjs — CDP capture for fixture-switching validation
 *
 * Loads the payload tester with fixture A, captures a screenshot, then switches
 * to fixture B in-app (clicking the sidebar button), captures a second screenshot,
 * and exits. The shell script performs the ImageMagick comparison.
 *
 * Usage: node _fixture-switch-cdp.mjs <port> <url> <fixtureB> <outA> <outB> <width> <height>
 */

import { request as httpRequest } from 'node:http';
import { randomBytes } from 'node:crypto';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const [debugPort, targetUrl, fixtureBName, outPathA, outPathB, widthStr, heightStr] = process.argv.slice(2);

if (!debugPort || !targetUrl || !fixtureBName || !outPathA || !outPathB) {
  console.error('Usage: node _fixture-switch-cdp.mjs <port> <url> <fixtureB> <outA> <outB> <width> <height>');
  process.exit(1);
}

const viewportWidth = parseInt(widthStr) || 720;
const viewportHeight = parseInt(heightStr) || 720;

setTimeout(() => {
  console.error('Error: Global timeout (90s). Aborting.');
  process.exit(1);
}, 90_000).unref();

// ─── HTTP helpers ────────────────────────────────────────────────────────────

function httpGet(url) {
  return new Promise((resolve, reject) => {
    httpRequest(url, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { reject(new Error(`JSON parse from ${url}: ${data.slice(0, 200)}`)); }
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
    req.setTimeout(10_000, () => req.destroy(new Error('WebSocket timeout')));
    req.end();
  });
}

class WSConnection {
  #socket; #buf = Buffer.alloc(0); #fragments = []; #nextId = 1;
  #pending = new Map(); #listeners = new Map();

  constructor(socket, head) {
    this.#socket = socket;
    if (head.length > 0) this.#buf = Buffer.from(head);
    socket.on('data', (chunk) => { this.#buf = Buffer.concat([this.#buf, chunk]); this.#drain(); });
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

  close() { try { this.#writeFrame(8, Buffer.alloc(0)); this.#socket.end(); } catch {} }

  #writeFrame(opcode, payload) {
    const mask = randomBytes(4);
    const len = payload.length;
    let header;
    if (len < 126) {
      header = Buffer.alloc(6); header[0] = 0x80 | opcode; header[1] = 0x80 | len; mask.copy(header, 2);
    } else if (len < 65536) {
      header = Buffer.alloc(8); header[0] = 0x80 | opcode; header[1] = 0x80 | 126;
      header.writeUInt16BE(len, 2); mask.copy(header, 4);
    } else {
      header = Buffer.alloc(14); header[0] = 0x80 | opcode; header[1] = 0x80 | 127;
      header.writeBigUInt64BE(BigInt(len), 2); mask.copy(header, 10);
    }
    const masked = Buffer.from(payload);
    for (let i = 0; i < masked.length; i++) masked[i] ^= mask[i % 4];
    this.#socket.write(Buffer.concat([header, masked]));
  }

  #drain() {
    while (this.#buf.length >= 2) {
      const b0 = this.#buf[0]; const b1 = this.#buf[1];
      const fin = (b0 & 0x80) !== 0; const opcode = b0 & 0x0f;
      let payloadLen = b1 & 0x7f; let offset = 2;
      if (payloadLen === 126) { if (this.#buf.length < 4) return; payloadLen = this.#buf.readUInt16BE(2); offset = 4; }
      else if (payloadLen === 127) { if (this.#buf.length < 10) return; payloadLen = Number(this.#buf.readBigUInt64BE(2)); offset = 10; }
      const totalLen = offset + payloadLen;
      if (this.#buf.length < totalLen) return;
      const payload = this.#buf.subarray(offset, totalLen);
      this.#buf = Buffer.from(this.#buf.subarray(totalLen));
      if (opcode === 8) { this.#socket.end(); return; }
      if (opcode === 9) { this.#writeFrame(10, Buffer.from(payload)); continue; }
      if (opcode === 10) continue;
      this.#fragments.push(Buffer.from(payload));
      if (fin) { const text = Buffer.concat(this.#fragments).toString('utf8'); this.#fragments = []; this.#onMessage(text); }
    }
  }

  #onMessage(text) {
    const msg = JSON.parse(text);
    if (msg.id != null && this.#pending.has(msg.id)) { this.#pending.get(msg.id)(msg); this.#pending.delete(msg.id); }
    if (msg.method) { for (const h of this.#listeners.get(msg.method) ?? []) h(msg.params); }
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function evalJs(cdp, expression) {
  const result = await cdp.send('Runtime.evaluate', { expression, returnByValue: true });
  return result?.result?.value;
}

async function waitForInstall(cdp, label, timeoutMs = 30_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const status = await evalJs(cdp, `window.__rendererStatus || ''`);
      if (status && status.includes('Installed')) return true;
      if (status && status.includes('GPU fault')) {
        console.error(`[${label}] GPU fault: ${status}`);
        return false;
      }
    } catch { /* page may be loading */ }
    await sleep(300);
  }
  console.error(`[${label}] Timed out waiting for install.`);
  return false;
}

async function captureScreenshot(cdp, outputPath) {
  const screenshot = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  if (!screenshot?.data) {
    console.error('No screenshot data.');
    return false;
  }
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, Buffer.from(screenshot.data, 'base64'));
  return true;
}

async function main() {
  const targets = await httpGet(`http://127.0.0.1:${debugPort}/json/list`);
  const page = targets.find((t) => t.type === 'page');
  if (!page) { console.error('No page target.'); process.exit(1); }

  const cdp = await connectWebSocket(page.webSocketDebuggerUrl);

  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: viewportWidth, height: viewportHeight, deviceScaleFactor: 1, mobile: false,
  });

  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');

  // ── Step 1: Load fixture A via query param ──
  console.error(`Navigating: ${targetUrl}`);
  await cdp.send('Page.navigate', { url: targetUrl });

  const installedA = await waitForInstall(cdp, 'fixture-A');
  if (!installedA) {
    await captureScreenshot(cdp, outPathA);
    console.error('Fixture A failed to install. Failure screenshot saved.');
    process.exit(1);
  }

  // Let a few frames render
  await sleep(2000);

  console.error('Capturing fixture A screenshot...');
  const capturedA = await captureScreenshot(cdp, outPathA);
  if (!capturedA) process.exit(1);
  console.error(`Fixture A captured: ${outPathA}`);

  // ── Step 2: Switch to fixture B by clicking the sidebar button ──
  // Clear the __rendererStatus so we can detect the NEW install.
  await evalJs(cdp, `window.__rendererStatus = ''`);

  // Click the fixture button that contains the target fixture name.
  // The FixtureSelector renders <button> elements with <div> children
  // containing the fixture name text.
  const clicked = await evalJs(cdp, `
    (function() {
      const buttons = document.querySelectorAll('button');
      for (const btn of buttons) {
        const nameDiv = btn.querySelector('div');
        if (nameDiv && nameDiv.textContent.trim() === '${fixtureBName}') {
          btn.click();
          return true;
        }
      }
      return false;
    })()
  `);

  if (!clicked) {
    console.error(`Could not find fixture button for: ${fixtureBName}`);
    process.exit(1);
  }
  console.error(`Clicked fixture: ${fixtureBName}`);

  // ── Step 3: Wait for fixture B to install ──
  const installedB = await waitForInstall(cdp, 'fixture-B');
  if (!installedB) {
    await captureScreenshot(cdp, outPathB);
    console.error('Fixture B failed to install. Failure screenshot saved.');
    process.exit(1);
  }

  // Let a few frames render
  await sleep(2000);

  console.error('Capturing fixture B screenshot...');
  const capturedB = await captureScreenshot(cdp, outPathB);
  if (!capturedB) process.exit(1);
  console.error(`Fixture B captured: ${outPathB}`);

  cdp.close();
}

main().catch((err) => {
  console.error(`CDP capture failed: ${err.message}`);
  process.exit(1);
});
