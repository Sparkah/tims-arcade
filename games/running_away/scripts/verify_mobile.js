const puppeteer = require('puppeteer');
const path = require('path');

(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  // iPhone 14 Pro portrait viewport
  await page.setViewport({ width: 393, height: 852, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await page.goto('file://' + path.resolve('index.html'));
  await new Promise(r => setTimeout(r, 1500));
  await page.evaluate(() => document.querySelector('.role-human').click());
  await new Promise(r => setTimeout(r, 1200));
  // Capture position of sprint, pause, joystick, action buttons
  const positions = await page.evaluate(() => {
    const r = (sel) => {
      const e = document.querySelector(sel);
      if (!e) return null;
      const b = e.getBoundingClientRect();
      const cs = getComputedStyle(e);
      return { x: Math.round(b.left), y: Math.round(b.top), w: Math.round(b.width), h: Math.round(b.height), display: cs.display };
    };
    return {
      sprint: r('#touch-sprint'),
      pause: r('#pause-btn'),
      joy: r('#touch-joystick'),
      btnE: r('#touch-e'),
      btnF: r('#touch-f'),
      viewport: { w: window.innerWidth, h: window.innerHeight },
    };
  });
  console.log(JSON.stringify(positions, null, 2));
  await page.screenshot({ path: '/tmp/mobile_layout.png' });
  await browser.close();
})();
