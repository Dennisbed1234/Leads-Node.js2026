/**
 * Bing SERP public results — second engine for more coverage (EmailFinder-style multi-engine).
 */

const { startBrowser } = require('./browser');
const { extractEmails } = require('./emailUtils');

async function scrapeBingWeb(keyword, location, options = {}) {
  const { onProgress = () => {}, max = 40 } = options;
  const leads = [];
  let browser;
  onProgress({ stage: 'bing', message: 'Bing search…', percent: 15 });

  try {
    const started = await startBrowser();
    browser = started.browser;
    const page = await started.context.newPage();
    const q = encodeURIComponent(`${keyword} ${location} email contact`);
    await page.goto(`https://www.bing.com/search?q=${q}&count=20&setlang=en-US`, {
      waitUntil: 'domcontentloaded',
      timeout: 45000,
    });
    await page.waitForTimeout(2000);

    const rows = await page.evaluate(() => {
      const out = [];
      document.querySelectorAll('li.b_algo').forEach((block) => {
        const a = block.querySelector('h2 a');
        const sn = block.querySelector('.b_caption p, .b_algoSlug');
        if (a && a.href) {
          out.push({
            title: a.innerText.trim(),
            href: a.href,
            snippet: sn ? sn.innerText.trim() : '',
          });
        }
      });
      return out;
    });

    const seen = new Set();
    for (const r of rows) {
      if (leads.length >= max) break;
      let host = '';
      try {
        host = new URL(r.href).hostname;
      } catch {
        continue;
      }
      if (seen.has(host)) continue;
      seen.add(host);
      const emails = extractEmails(r.snippet + ' ' + r.title);
      leads.push({
        id: `bing:${Buffer.from(host).toString('base64').slice(0, 20)}`,
        name: r.title.replace(/\s*[-|–].*$/, '').trim() || r.title,
        rating: '',
        reviews: '',
        phone: '',
        email: emails[0] || '',
        emails,
        address: location,
        website: r.href,
        keyword,
        location,
        source: 'bing',
        extra: { snippet: r.snippet.slice(0, 180) },
      });
    }
    onProgress({ stage: 'bing', message: `Bing: ${leads.length} results`, percent: 90 });
  } catch (err) {
    console.error('[bing]', err.message);
    onProgress({ stage: 'bing', message: `Bing error: ${err.message}`, percent: 50 });
  } finally {
    if (browser) await browser.close().catch(() => {});
  }

  return {
    leads,
    meta: { source: 'bing', totalCards: leads.length, processedCount: leads.length, skippedCount: 0, remaining: 0 },
  };
}

module.exports = { scrapeBingWeb };
