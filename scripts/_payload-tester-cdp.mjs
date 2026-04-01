#!/usr/bin/env node
/**
 * _payload-tester-cdp.mjs — CDP capture for the payload tester
 *
 * Navigates to the payload tester, waits for boot, clicks a fixture,
 * submits it, waits for result, and captures a screenshot.
 *
 * Usage: node _payload-tester-cdp.mjs <port> <url> <output-path> <width> <height> <fixture-index>
 */

import { request as httpRequest } from 'node:http';
import { randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { mkdirSync } from 'node:fs';

const [debugPort, targetUrl, outputPath, widthStr, heightStr, fixtureIndexStr] = process.argv.slice(2);

if (!debugPort || !targetUrl || !outputPath) {
  console.error('Usage: node _payload-tester-cdp.mjs <port> <url> <output-path> <width> <height> <fixture-index>');
  process.exit(1);
}

const viewportWidth = parseInt(widthStr) || 720;
const viewportHeight = parseInt(heightStr) || 720;
const fixtureIndex = parseInt(fixtureIndexStr) || 0;

setTimeout(() => {
  console.error('Error: Global timeout (60s). Aborting.');
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
  console.error(`Navigating: ${targetUrl}`);
  await cdp.send('Page.navigate', { url: targetUrl });

  // Wait for "Ready" in the status bar (Naga shim + renderer booted)
  const BOOT_TIMEOUT = 30_000;
  const bootStart = Date.now();
  let booted = false;

  while (Date.now() - bootStart < BOOT_TIMEOUT) {
    try {
      const text = await evalJs(cdp, `document.body?.innerText || ''`);
      // "Renderer ready" appears briefly, then auto-install changes it to "Installed..."
      if (text && (text.includes('Renderer ready') || text.includes('Installed') || text.includes('Installing'))) {
        booted = true; break;
      }

      // Check for boot errors
      if (text && (text.includes('GPU fault') || text.includes('Boot failed'))) {
        console.error(`Boot error detected: ${text.slice(0, 500)}`);
        process.exit(1);
      }
    } catch { /* page may be reloading for COI */ }
    await sleep(500);
  }

  if (!booted) {
    console.error('Timed out waiting for renderer boot.');
    // Capture screenshot of the failure state
    const screenshot = await cdp.send('Page.captureScreenshot', { format: 'png' });
    if (screenshot?.data) {
      mkdirSync(dirname(outputPath), { recursive: true });
      writeFileSync(outputPath, Buffer.from(screenshot.data, 'base64'));
      console.error(`Failure screenshot saved to: ${outputPath}`);
    }
    process.exit(1);
  }

  console.error('Renderer booted.');

  // Click fixture by index
  console.error(`Clicking fixture #${fixtureIndex}...`);
  await evalJs(cdp, `document.querySelectorAll('button[title]')[${fixtureIndex}]?.click()`);
  await sleep(300);

  // Click Submit
  console.error('Submitting payload...');
  await evalJs(cdp, `
    Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Submit'))?.click()
  `);

  // Wait for submit result
  await sleep(3000);

  // Read status bar
  const statusText = await evalJs(cdp, `document.body?.innerText || ''`);
  const statusLine = (statusText || '').split('\n').filter(l => l.trim()).pop() || '';
  console.error(`Status: ${statusLine}`);

  // Capture screenshot
  const screenshot = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  if (!screenshot?.data) {
    console.error('No screenshot data.');
    process.exit(1);
  }

  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, Buffer.from(screenshot.data, 'base64'));
  console.error(`Captured: ${outputPath}`);

  cdp.close();
}

main().catch((err) => {
  console.error(`CDP capture failed: ${err.message}`);
  process.exit(1);
});
