/**
 * DuckDuckGo HTML search — extra free SERP (theHarvester has duckduckgosearch).
 * Public results only; no API key.
 */

const { startBrowser } = require('./browser');
const { extractEmails } = require('./emailUtils');

async function scrapeDuckDuckGo(keyword, location, options = {}) {
  const { onProgress = () => {}, max = 200 } = options;
  const leads = [];
  const seen = new Set();
  let browser;

  onProgress({ stage: 'duckduckgo', message: 'DuckDuckGo public search…', percent: 10 });

  try {
    const started = await startBrowser();
    browser = started.browser;
    const context = started.context;
    const queries = [
      `"${keyword}" "${location}" (email OR contact OR "contact us")`,
      `"${keyword}" "${location}" site:.com (phone OR address)`,
    ];

    for (let qi = 0; qi < queries.length && leads.length < max; qi++) {
      const page = await context.newPage();
      const q = encodeURIComponent(queries[qi]);
      onProgress({
        stage: 'duckduckgo',
        message: `DuckDuckGo query ${qi + 1}/${queries.length}`,
        percent: 20 + qi * 30,
      });
      try {
        await page.goto(`https://html.duckduckgo.com/html/?q=${q}`, {
          waitUntil: 'domcontentloaded',
          timeout: 45000,
        });
        await page.waitForTimeout(1200);

        const rows = await page.evaluate(() => {
          const out = [];
          document.querySelectorAll('.result, .web-result').forEach((block) => {
            const a = block.querySelector('a.result__a, a[href]');
            const sn = block.querySelector('.result__snippet, .result__body');
            if (a) {
              out.push({
                title: (a.innerText || '').trim(),
                href: a.href || '',
                snippet: sn ? sn.innerText.trim() : '',
              });
            }
          });
          return out;
        });

        for (const r of rows) {
          if (leads.length >= max) break;
          let host = '';
          try {
            const real = r.href.includes('uddg=')
              ? decodeURIComponent(r.href.split('uddg=')[1].split('&')[0])
              : r.href;
            host = new URL(real).hostname;
            r.href = real;
          } catch {
            continue;
          }
          if (seen.has(host)) continue;
          seen.add(host);
          const emails = extractEmails(`${r.title} ${r.snippet}`);
          leads.push({
            id: `ddg:${Buffer.from(host).toString('base64').slice(0, 20)}`,
            name: r.title.replace(/\s*[-|–].*$/, '').trim() || host,
            rating: '',
            reviews: '',
            phone: '',
            email: emails[0] || '',
            emails,
            address: location,
            website: r.href,
            keyword,
            location,
            source: 'duckduckgo',
            extra: { snippet: r.snippet.slice(0, 160) },
          });
        }
      } catch (err) {
        onProgress({ stage: 'duckduckgo', message: err.message, percent: 40 });
      } finally {
        await page.close().catch(() => {});
      }
    }

    onProgress({ stage: 'duckduckgo', message: `DuckDuckGo: ${leads.length}`, percent: 90 });
  } catch (err) {
    console.error('[duckduckgo]', err.message);
  } finally {
    if (browser) await browser.close().catch(() => {});
  }

  return {
    leads,
    meta: { source: 'duckduckgo', totalCards: leads.length, processedCount: leads.length },
  };
}

module.exports = { scrapeDuckDuckGo };
