import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: false });
const page = await browser.newPage();

await page.goto('http://localhost:5177/', { timeout: 10000 });
await page.waitForTimeout(3000);

// Inject logging into executeFrame
const frameInfo = await page.evaluate(() => {
  return new Promise((resolve) => {
    let captured = false;
    const originalLog = console.log;
    const frames = [];
    
    // Capture next 5 frames worth of data
    const checkInterval = setInterval(() => {
      const canvas = document.getElementById('canvas');
      if (canvas && !captured) {
        const ctx = canvas.getContext('2d');
        const imgData = ctx.getImageData(100, 100, 1, 1).data;
        frames.push({
          pixel: Array.from(imgData),
          time: Date.now()
        });
        
        if (frames.length >= 5) {
          captured = true;
          clearInterval(checkInterval);
          resolve({
            frames,
            canvasSize: { w: canvas.width, h: canvas.height }
          });
        }
      }
    }, 100);
    
    setTimeout(() => {
      clearInterval(checkInterval);
      resolve({ frames, error: 'timeout' });
    }, 2000);
  });
});

console.log('=== FRAME DATA ===');
console.log(JSON.stringify(frameInfo, null, 2));

await page.waitForTimeout(2000);
await browser.close();
