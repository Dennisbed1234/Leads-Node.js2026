const { startBrowser } = require('./browser');

function extractPhones(text) {
  const re = /(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g;
  return [...new Set((String(text || '').match(re) || []).map((p) => p.trim()))];
}

function extractEmails(text) {
  const re = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  return [...new Set(String(text || '').match(re) || [])].filter(
    (e) => !e.includes('example.com') && !e.includes('google.')
  );
}

async function scrapeGoogleWeb(keyword, location, options = {}) {
  const { onProgress = () => {}, max = 25 } = options;
  const leads = [];
  let browser;
  onProgress({ stage: 'google_web', message: 'Opening Google search…', percent: 15 });
  try {
    const started = await startBrowser();
    browser = started.browser;
    const page = await started.context.newPage();
    const q = encodeURIComponent(`${keyword} ${location} phone contact`);
    await page.goto(`https://www.google.com/search?q=${q}&num=20&hl=en&gl=us`, {
      waitUntil: 'domcontentloaded',
      timeout: 45000,
    });
    await page.waitForTimeout(2000);
    try {
      const btn = await page.$('button:has-text("Accept all"), button:has-text("I agree")');
      if (btn) await btn.click();
    } catch (_) {}

    onProgress({ stage: 'google_web', message: 'Parsing search results…', percent: 40 });
    const results = await page.evaluate(() => {
      const rows = [];
      document.querySelectorAll('div.g, div.MjjYud').forEach((block) => {
        const titleEl = block.querySelector('h3');
        const linkEl = block.querySelector('a[href^="http"]');
        const snippetEl = block.querySelector('div.VwiC3b') || block.querySelector('span.aCOpRe');
        const title = titleEl ? titleEl.innerText.trim() : '';
        const href = linkEl ? linkEl.href : '';
        const snippet = snippetEl ? snippetEl.innerText.trim() : block.innerText.slice(0, 400);
        if (title && href && !href.includes('google.com')) rows.push({ title, href, snippet });
      });
      return rows;
    });

    const seen = new Set();
    for (const r of results) {
      if (leads.length >= max) break;
      const key = r.href.split('?')[0];
      if (seen.has(key)) continue;
      seen.add(key);
      const phones = extractPhones(r.snippet + ' ' + r.title);
      const emails = extractEmails(r.snippet);
      leads.push({
        id: `gweb:${Buffer.from(key).toString('base64').slice(0, 24)}`,
        name: r.title.replace(/\s*[-|–].*$/, '').trim() || r.title,
        rating: '',
        reviews: '',
        phone: phones[0] || '',
        email: emails[0] || '',
        address: location,
        website: r.href,
        keyword,
        location,
        source: 'google_web',
        extra: { snippet: r.snippet.slice(0, 200) },
      });
    }
    onProgress({
      stage: 'google_web',
      message: `Google web: ${leads.length} results`,
      percent: 90,
      count: leads.length,
    });
  } catch (err) {
    console.error('[googleWeb]', err.message);
    onProgress({ stage: 'google_web', message: `Google web error: ${err.message}`, percent: 50 });
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
  return {
    leads,
    meta: { source: 'google_web', totalCards: leads.length, processedCount: leads.length, skippedCount: 0, remaining: 0 },
  };
}

module.exports = { scrapeGoogleWeb };
