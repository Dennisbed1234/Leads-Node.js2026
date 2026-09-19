/**
 * Public social discovery via Google site: queries (no login).
 * Facebook pages, LinkedIn company, Instagram business profiles when indexed.
 */

const { startBrowser } = require('./browser');
const { extractEmails } = require('./emailUtils');

function socialQueries(keyword, location) {
  const k = keyword || 'business';
  const loc = location || 'United States';
  return [
    `site:facebook.com/pages OR site:facebook.com "${k}" "${loc}"`,
    `site:linkedin.com/company "${k}" "${loc}"`,
    `site:instagram.com "${k}" "${loc}" (business OR shop OR studio)`,
    `site:twitter.com OR site:x.com "${k}" "${loc}" (contact OR email)`,
    `"${k}" "${loc}" (facebook.com OR linkedin.com/company)`,
  ];
}

async function scrapeSocial(keyword, location, options = {}) {
  const { onProgress = () => {}, max = 250, maxQueries = 5 } = options;
  const leads = [];
  const seen = new Set();
  let browser;

  onProgress({ stage: 'social', message: 'Public social search…', percent: 10 });

  try {
    const started = await startBrowser();
    browser = started.browser;
    const context = started.context;
    const queries = socialQueries(keyword, location).slice(0, maxQueries);

    for (let qi = 0; qi < queries.length && leads.length < max; qi++) {
      const page = await context.newPage();
      const q = encodeURIComponent(queries[qi]);
      onProgress({
        stage: 'social',
        message: `Social query ${qi + 1}/${queries.length}`,
        percent: 15 + qi * 12,
      });
      try {
        await page.goto(`https://www.google.com/search?q=${q}&num=20&hl=en&gl=us`, {
          waitUntil: 'domcontentloaded',
          timeout: 45000,
        });
        await page.waitForTimeout(1500);
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
          let host = '';
          try {
            host = new URL(r.href).hostname + new URL(r.href).pathname.split('/').slice(0, 3).join('/');
          } catch {
            continue;
          }
          if (seen.has(host)) continue;
          seen.add(host);
          const emails = extractEmails(r.snippet + ' ' + r.title);
          let platform = 'social';
          if (/facebook\.com/i.test(r.href)) platform = 'facebook';
          else if (/linkedin\.com/i.test(r.href)) platform = 'linkedin';
          else if (/instagram\.com/i.test(r.href)) platform = 'instagram';
          else if (/twitter\.com|x\.com/i.test(r.href)) platform = 'x';

          leads.push({
            id: `social:${Buffer.from(host).toString('base64').slice(0, 24)}`,
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
        onProgress({ stage: 'social', message: `Social query error: ${err.message}`, percent: 40 });
      } finally {
        await page.close().catch(() => {});
      }
    }

    onProgress({ stage: 'social', message: `Social: ${leads.length} public pages`, percent: 90 });
  } catch (err) {
    console.error('[social]', err.message);
    onProgress({ stage: 'social', message: `Social error: ${err.message}`, percent: 50 });
  } finally {
    if (browser) await browser.close().catch(() => {});
  }

  return {
    leads,
    meta: { source: 'social', totalCards: leads.length, processedCount: leads.length, skippedCount: 0, remaining: 0 },
  };
}

module.exports = { scrapeSocial };
