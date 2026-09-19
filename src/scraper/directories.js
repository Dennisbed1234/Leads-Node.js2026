/**
 * Broad public directory / review-site discovery via Google site: queries.
 * Includes Yelp, YellowPages, BBB, Manta, Superpages, Angi, MapQuest, etc.
 * No logins. Apollo and other commercial CRM/sales DBs are intentionally excluded.
 */

const { startBrowser } = require('./browser');
const { extractEmails } = require('./emailUtils');

function directoryQueries(keyword, location) {
  const k = keyword || 'business';
  const loc = location || 'United States';
  return [
    `site:yelp.com "${k}" "${loc}"`,
    `site:yelp.com/biz "${k}" ${loc}`,
    `site:yellowpages.com "${k}" "${loc}"`,
    `site:bbb.org "${k}" "${loc}"`,
    `site:manta.com "${k}" "${loc}"`,
    `site:superpages.com "${k}" "${loc}"`,
    `site:angi.com "${k}" "${loc}"`,
    `site:thumbtack.com "${k}" "${loc}"`,
    `site:mapquest.com "${k}" "${loc}"`,
    `site:foursquare.com "${k}" "${loc}"`,
    `site:hotfrog.com "${k}" "${loc}"`,
    `site:cylex.us.com "${k}" "${loc}"`,
    `"${k}" "${loc}" (email OR contact) (directory OR "yellow pages" OR "business listing")`,
  ];
}

function detectPlatform(href) {
  const h = href.toLowerCase();
  if (h.includes('yelp.com')) return 'yelp';
  if (h.includes('yellowpages.com')) return 'yellowpages';
  if (h.includes('bbb.org')) return 'bbb';
  if (h.includes('manta.com')) return 'manta';
  if (h.includes('superpages.com')) return 'superpages';
  if (h.includes('angi.com')) return 'angi';
  if (h.includes('thumbtack.com')) return 'thumbtack';
  if (h.includes('mapquest.com')) return 'mapquest';
  if (h.includes('foursquare.com')) return 'foursquare';
  if (h.includes('hotfrog.com')) return 'hotfrog';
  if (h.includes('cylex')) return 'cylex';
  return 'directory';
}

async function scrapeDirectories(keyword, location, options = {}) {
  const { onProgress = () => {}, max = 400, maxQueries = 10 } = options;
  const leads = [];
  const seen = new Set();
  let browser;

  onProgress({ stage: 'directories', message: 'Public directories (Yelp, YP, BBB, Manta…)…', percent: 8 });

  try {
    const started = await startBrowser();
    browser = started.browser;
    const context = started.context;
    const queries = directoryQueries(keyword, location).slice(0, maxQueries);

    for (let qi = 0; qi < queries.length && leads.length < max; qi++) {
      const page = await context.newPage();
      const q = encodeURIComponent(queries[qi]);
      onProgress({
        stage: 'directories',
        message: `Directory query ${qi + 1}/${queries.length}`,
        percent: 10 + Math.floor((qi / queries.length) * 75),
      });
      try {
        await page.goto(`https://www.google.com/search?q=${q}&num=20&hl=en&gl=us`, {
          waitUntil: 'domcontentloaded',
          timeout: 45000,
        });
        await page.waitForTimeout(1400 + Math.floor(Math.random() * 600));
        try {
          const btn = await page.$('button:has-text("Accept all"), button:has-text("I agree")');
          if (btn) await btn.click();
        } catch (_) {}

        const rows = await page.evaluate(() => {
          const out = [];
          document.querySelectorAll('div.g, div.MjjYud').forEach((block) => {
            const h3 = block.querySelector('h3');
            const a = block.querySelector('a[href^="http"]');
            const sn = block.querySelector('div.VwiC3b, span.aCOpRe');
            if (h3 && a) {
              out.push({
                title: h3.innerText.trim(),
                href: a.href,
                snippet: sn ? sn.innerText.trim() : '',
              });
            }
          });
          return out;
        });

        for (const r of rows) {
          if (leads.length >= max) break;
          let key = '';
          try {
            const u = new URL(r.href);
            key = u.hostname + u.pathname.split('/').slice(0, 4).join('/');
          } catch {
            continue;
          }
          if (seen.has(key)) continue;
          seen.add(key);
          const emails = extractEmails(r.snippet + ' ' + r.title);
          const platform = detectPlatform(r.href);
          leads.push({
            id: `dir:${Buffer.from(key).toString('base64').slice(0, 24)}`,
            name: r.title.replace(/\s*[-|–].*$/, '').trim() || r.title,
            rating: '',
            reviews: '',
            phone: '',
            email: emails[0] || '',
            emails,
            address: location,
            website: r.href.split('&')[0],
            keyword,
            location,
            source: platform,
            extra: { snippet: r.snippet.slice(0, 160), query: queries[qi] },
          });
        }
      } catch (err) {
        onProgress({ stage: 'directories', message: `Query error: ${err.message}`, percent: 40 });
      } finally {
        await page.close().catch(() => {});
      }
    }

    onProgress({
      stage: 'directories',
      message: `Directories: ${leads.length} public listings`,
      percent: 90,
    });
  } catch (err) {
    console.error('[directories]', err.message);
    onProgress({ stage: 'directories', message: `Directories error: ${err.message}`, percent: 50 });
  } finally {
    if (browser) await browser.close().catch(() => {});
  }

  return {
    leads,
    meta: {
      source: 'directories',
      totalCards: leads.length,
      processedCount: leads.length,
      skippedCount: 0,
      remaining: 0,
    },
  };
}

module.exports = { scrapeDirectories, directoryQueries };
