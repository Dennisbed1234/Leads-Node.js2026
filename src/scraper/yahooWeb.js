/**
 * Yahoo Search SERP — public results (theHarvester has yahoosearch).
 * US-scoped via query terms; extracts emails from snippets.
 */

const { startBrowser } = require('./browser');
const { extractEmails } = require('./emailUtils');

function yahooQueries(keyword, location) {
  const k = keyword || 'business';
  const loc = location || 'United States';
  return [
    `${k} ${loc} email contact`,
    `"${k}" "${loc}" ("contact us" OR "email us" OR info@ OR sales@)`,
    `${k} ${loc} (mailto OR contact) (United States OR USA)`,
  ];
}

async function scrapeYahooWeb(keyword, location, options = {}) {
  const { onProgress = () => {}, max = 200, maxQueries = 3 } = options;
  const leads = [];
  const seen = new Set();
  let browser;

  onProgress({ stage: 'yahoo', message: 'Yahoo public search…', percent: 10 });

  try {
    const started = await startBrowser();
    browser = started.browser;
    const context = started.context;
    const queries = yahooQueries(keyword, location).slice(0, maxQueries);

    for (let qi = 0; qi < queries.length && leads.length < max; qi++) {
      const page = await context.newPage();
      const q = encodeURIComponent(queries[qi]);
      onProgress({
        stage: 'yahoo',
        message: `Yahoo query ${qi + 1}/${queries.length}`,
        percent: 15 + qi * 25,
      });
      try {
        await page.goto(`https://search.yahoo.com/search?p=${q}&n=20&ei=UTF-8`, {
          waitUntil: 'domcontentloaded',
          timeout: 45000,
        });
        await page.waitForTimeout(1400);

        const rows = await page.evaluate(() => {
          const out = [];
          document.querySelectorAll('#web li, .algo, .dd.algo, div.relsrch').forEach((block) => {
            const a = block.querySelector('a[href^="http"]');
            const h3 = block.querySelector('h3, .title');
            const sn = block.querySelector('.compText, .abs, p');
            if (a) {
              out.push({
                title: (h3 ? h3.innerText : a.innerText || '').trim(),
                href: a.href,
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
            host = new URL(r.href).hostname.replace(/^www\./, '');
          } catch {
            continue;
          }
          if (seen.has(host)) continue;
          seen.add(host);
          const emails = extractEmails(`${r.title} ${r.snippet}`);
          leads.push({
            id: `yahoo:${Buffer.from(host).toString('base64').slice(0, 20)}`,
            name: r.title.replace(/\s*[-|–].*$/, '').trim() || host,
            rating: '',
            reviews: '',
            phone: '',
            email: emails[0] || '',
            emails,
            address: location,
            website: r.href.split('#')[0],
            keyword,
            location,
            source: 'yahoo',
            extra: { snippet: r.snippet.slice(0, 160), query: queries[qi] },
          });
        }
      } catch (err) {
        onProgress({ stage: 'yahoo', message: err.message, percent: 40 });
      } finally {
        await page.close().catch(() => {});
      }
    }

    onProgress({ stage: 'yahoo', message: `Yahoo: ${leads.length}`, percent: 90 });
  } catch (err) {
    console.error('[yahoo]', err.message);
  } finally {
    if (browser) await browser.close().catch(() => {});
  }

  return {
    leads,
    meta: { source: 'yahoo', totalCards: leads.length, processedCount: leads.length },
  };
}

module.exports = { scrapeYahooWeb };
