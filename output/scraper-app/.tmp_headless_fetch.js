(async ()=>{
  const puppeteer = require('puppeteer');
  const regex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.(?!jpeg|jpg|png|gif|webp|svg)[a-zA-Z]{2,}/g;
  const html = `<!doctype html><html><body><p>Contact us at test.user+demo@example.org for info.</p><script>/* simulate JS-inserted email */ document.body.insertAdjacentHTML('beforeend','<p>JS: hello+js@example.com</p>');</script></body></html>`;
  const browser = await puppeteer.launch({ args:['--no-sandbox','--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'networkidle0' });
  await page.waitForTimeout(200);
  const content = await page.content();
  const matches = content.match(regex) || [];
  console.log('FOUND', matches);
  await page.close();
  await browser.close();
})();
