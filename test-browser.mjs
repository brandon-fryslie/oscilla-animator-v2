import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

const errors = [];
const logs = [];
page.on('console', msg => {
  if (msg.type() === 'error') {
    errors.push(msg.text());
  } else {
    logs.push(msg.text());
  }
});

page.on('pageerror', err => {
  errors.push(`PAGE ERROR: ${err.message}`);
});

try {
  await page.goto('http://localhost:5174/', { timeout: 10000 });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: 'test-screenshot.png' });
  
  console.log('=== LOGS ===');
  logs.forEach(l => console.log(l));
  
  console.log('\n=== ERRORS ===');
  if (errors.length === 0) {
    console.log('No errors!');
  } else {
    errors.forEach(e => console.log(e));
  }
  
  const canvasInfo = await page.evaluate(() => {
    const canvas = document.getElementById('canvas');
    if (!canvas) return { error: 'No canvas found' };
    const ctx = canvas.getContext('2d');
    const data = ctx.getImageData(400, 300, 1, 1).data;
    return {
      width: canvas.width,
      height: canvas.height,
      centerPixel: Array.from(data)
    };
  });
  
  console.log('\n=== CANVAS INFO ===');
  console.log(JSON.stringify(canvasInfo, null, 2));
  
} catch (err) {
  console.error('Test failed:', err.message);
} finally {
  await browser.close();
}
