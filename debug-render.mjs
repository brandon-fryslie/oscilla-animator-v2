import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

let logs = [];
page.on('console', msg => {
  logs.push(`[${msg.type()}] ${msg.text()}`);
});

await page.goto('http://localhost:5177/', { timeout: 10000 });
await page.waitForTimeout(3000);

// Check if executeFrame is being called
const info = await page.evaluate(() => {
  return {
    hasCanvas: !!document.getElementById('canvas'),
    canvasPixels: (() => {
      const canvas = document.getElementById('canvas');
      if (!canvas) return null;
      const ctx = canvas.getContext('2d');
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let nonBlack = 0;
      for (let i = 0; i < data.length; i += 4) {
        if (data[i] !== 0 || data[i+1] !== 0 || data[i+2] !== 0) nonBlack++;
      }
      return { total: data.length/4, nonBlack };
    })()
  };
});

console.log('=== RENDER INFO ===');
console.log(JSON.stringify(info, null, 2));
console.log('\n=== RELEVANT LOGS ===');
logs.filter(l => l.includes('RenderBufferArena') || l.includes('error') || l.includes('ERROR')).forEach(l => console.log(l));

await browser.close();
