import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

const logs = [];
page.on('console', msg => logs.push(msg.text()));

await page.goto('http://localhost:5177/', { waitUntil: 'networkidle', timeout: 10000 });
await page.waitForTimeout(2000);

// Inject code to intercept assembleRenderFrame
const result = await page.evaluate(() => {
  let intercepted = null;
  const interval = setInterval(() => {
    try {
      const stats = document.querySelector('#stats')?.textContent;
      if (stats) {
        clearInterval(interval);
        intercepted = { stats };
      }
    } catch (e) {}
  }, 100);
  
  return new Promise(resolve => {
    setTimeout(() => {
      clearInterval(interval);
      resolve(intercepted || { error: 'timeout' });
    }, 3000);
  });
});

console.log('Stats:', result);
console.log('Logs with "Elements":', logs.filter(l => l.includes('Elements') || l.includes('FPS')));

await browser.close();
