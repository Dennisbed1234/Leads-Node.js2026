/**
 * Multi-query Google SERP email harvest (public results only).
 */

const { startBrowser } = require('./browser');
const { extractEmails } = require('./emailUtils');

function buildQueries(keyword, location) {
  const loc = location || 'United States';
  const k = keyword || 'business';
  return [
    `${k} ${loc} email contact`,
    `${k} ${loc} "contact us" email`,
    `${k} ${loc} "@" email -inurl:(login OR signup)`,
    `"${k}" "${loc}" (email OR e-mail) (contact OR sales)`,
    `${k} near ${loc} contact OR info@`,
    `"${k}" "${loc}" (info@ OR sales@ OR office@ OR contact@)`,
    `${k} ${loc} "email us" OR "send email" OR mailto`,
  ];
}

async function parseSerpPage(page) {
  return page.evaluate(() => {
    const rows = [];
    document.querySelectorAll('div.g, div.MjjYud, div[data-sokoban-container]').forEach((block) => {
      const titleEl = block.querySelector('h3');
      const linkEl = block.querySelector('a[href^="http"]');
      const snippetEl =
        block.querySelector('div.VwiC3b') ||
        block.querySelector('span.aCOpRe') ||
        block.querySelector('div[data-sncf]');
      const title = titleEl ? titleEl.innerText.trim() : '';
      const href = linkEl ? linkEl.href : '';
      const snippet = snippetEl ? snippetEl.innerText.trim() : (block.innerText || '').slice(0, 500);
      if (title && href && !/google\.(com|co)/i.test(href)) {
        rows.push({ title, href, snippet });
      }
    });
    const bodyText = document.body ? document.body.innerText.slice(0, 15000) : '';
    return { rows, bodyText };
  });
}

async function scrapeGoogleWeb(keyword, location, options = {}) {
  const { onProgress = () => {}, max = 200, maxQueries = 6 } = options;
  const leads = [];
  const seenHost = new Set();
  const seenEmail = new Set();
  let browser;

  onProgress({ stage: 'google_web', message: 'Google multi-dork search…', percent: 10 });

  try {
    const started = await startBrowser();
    browser = started.browser;
    const context = started.context;
    const queries = buildQueries(keyword, location).slice(0, maxQueries);

    for (let qi = 0; qi < queries.length && leads.length < max; qi++) {
      const page = await context.newPage();
      const q = encodeURIComponent(queries[qi]);
      onProgress({
        stage: 'google_web',
        message: `Google query ${qi + 1}/${queries.length}`,
        percent: 15 + qi * 12,
      });

      try {
        await page.goto(`https://www.google.com/search?q=${q}&num=20&hl=en&gl=us&pws=0`, {
          waitUntil: 'domcontentloaded',
          timeout: 45000,
        });
        await page.waitForTimeout(1500 + Math.floor(Math.random() * 800));
        try {
          const btn = await page.$('button:has-text("Accept all"), button:has-text("I agree")');
          if (btn) await btn.click();
        } catch (_) {}

        const { rows, bodyText } = await parseSerpPage(page);
        const pageEmails = extractEmails(bodyText);

        for (const r of rows) {
          if (leads.length >= max) break;
          let host = '';
          try {
            host = new URL(r.href).hostname.replace(/^www\./, '');
          } catch {
            continue;
          }
          if (seenHost.has(host)) continue;
          seenHost.add(host);

          const snippetEmails = extractEmails(r.snippet + ' ' + r.title);
          const email = snippetEmails[0] || '';
          if (email) seenEmail.add(email);

          leads.push({
            id: `gweb:${Buffer.from(host).toString('base64').slice(0, 20)}`,
            name: r.title.replace(/\s*[-|–].*$/, '').trim() || r.title,
            rating: '',
            reviews: '',
            phone: '',
            email,
            emails: snippetEmails,
            address: location,
            website: r.href.split('#')[0],
            keyword,
            location,
            source: 'google_web',
            extra: { snippet: r.snippet.slice(0, 180), query: queries[qi] },
          });
        }

        for (const em of pageEmails) {
          if (seenEmail.has(em) || leads.length >= max) continue;
          seenEmail.add(em);
          leads.push({
            id: `gweb-em:${em}`,
            name: em.split('@')[0],
            rating: '',
            reviews: '',
            phone: '',
            email: em,
            address: location,
            website: '',
            keyword,
            location,
            source: 'google_web',
            extra: { from: 'serp_text' },
          });
        }
      } catch (err) {
        onProgress({ stage: 'google_web', message: `Query failed: ${err.message}`, percent: 40 });
      } finally {
        await page.close().catch(() => {});
      }
    }

    onProgress({
      stage: 'google_web',
      message: `Google web: ${leads.length} rows`,
      percent: 85,
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
    meta: {
      source: 'google_web',
      totalCards: leads.length,
      processedCount: leads.length,
      skippedCount: 0,
      remaining: 0,
    },
  };
}

module.exports = { scrapeGoogleWeb, buildQueries };
