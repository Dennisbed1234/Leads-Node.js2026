/**
 * Email-focused public dorks (US jurisdiction via location + gl=us).
 * Finds emails on public pages / SERP snippets — not breach dumps.
 */

const { startBrowser } = require('./browser');
const { extractEmails } = require('./emailUtils');

function emailDorkQueries(keyword, location) {
  const k = keyword || 'business';
  const loc = location || 'United States';
  return [
    `"${k}" "${loc}" ("email:" OR "e-mail:" OR "Email us" OR "Contact email")`,
    `"${k}" "${loc}" (info@ OR contact@ OR sales@ OR office@ OR support@)`,
    `"${k}" "${loc}" intext:mailto`,
    `"${k}" ("United States" OR USA OR "${loc}") "Contact Us" email`,
    `"${k}" "${loc}" (yellowpages OR "chamber of commerce" OR "bbb.org") email`,
  ];
}

async function scrapeEmailDorks(keyword, location, options = {}) {
  const { onProgress = () => {}, max = 300, maxQueries = 5 } = options;
  const leads = [];
  const seenHost = new Set();
  const seenEmail = new Set();
  let browser;

  onProgress({ stage: 'email_dorks', message: 'Public email dorks (US-scoped)…', percent: 8 });

  try {
    const started = await startBrowser();
    browser = started.browser;
    const context = started.context;
    const queries = emailDorkQueries(keyword, location).slice(0, maxQueries);

    for (let qi = 0; qi < queries.length && leads.length < max; qi++) {
      const page = await context.newPage();
      const q = encodeURIComponent(queries[qi]);
      onProgress({
        stage: 'email_dorks',
        message: `Email dork ${qi + 1}/${queries.length}`,
        percent: 10 + Math.floor((qi / queries.length) * 75),
      });
      try {
        await page.goto(`https://www.google.com/search?q=${q}&num=20&hl=en&gl=us&pws=0`, {
          waitUntil: 'domcontentloaded',
          timeout: 45000,
        });
        await page.waitForTimeout(1500 + Math.floor(Math.random() * 700));
        try {
          const btn = await page.$('button:has-text("Accept all"), button:has-text("I agree")');
          if (btn) await btn.click();
        } catch (_) {}

        const { rows, bodyText } = await page.evaluate(() => {
          const rows = [];
          document.querySelectorAll('div.g, div.MjjYud').forEach((block) => {
            const h3 = block.querySelector('h3');
            const a = block.querySelector('a[href^="http"]');
            const sn = block.querySelector('div.VwiC3b, span.aCOpRe');
            if (h3 && a && !/google\.(com|co)/i.test(a.href)) {
              rows.push({
                title: h3.innerText.trim(),
                href: a.href,
                snippet: sn ? sn.innerText.trim() : '',
              });
            }
          });
          return {
            rows,
            bodyText: document.body ? document.body.innerText.slice(0, 20000) : '',
          };
        });

        for (const r of rows) {
          if (leads.length >= max) break;
          let host = '';
          try {
            host = new URL(r.href).hostname.replace(/^www\./, '');
          } catch {
            continue;
          }
          const emails = extractEmails(`${r.title} ${r.snippet}`);
          if (!seenHost.has(host)) {
            seenHost.add(host);
            for (const em of emails) seenEmail.add(em);
            leads.push({
              id: `edork:${Buffer.from(host).toString('base64').slice(0, 20)}`,
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
              source: 'email_dorks',
              extra: { snippet: r.snippet.slice(0, 160), query: queries[qi] },
            });
          } else {
            for (const em of emails) {
              if (seenEmail.has(em) || leads.length >= max) continue;
              seenEmail.add(em);
              leads.push({
                id: `edork-em:${em}`,
                name: em.split('@')[0],
                email: em,
                emails: [em],
                address: location,
                website: r.href.split('#')[0],
                keyword,
                location,
                source: 'email_dorks',
              });
            }
          }
        }

        for (const em of extractEmails(bodyText)) {
          if (seenEmail.has(em) || leads.length >= max) continue;
          seenEmail.add(em);
          leads.push({
            id: `edork-em:${em}`,
            name: em.split('@')[0],
            email: em,
            emails: [em],
            address: location,
            website: '',
            keyword,
            location,
            source: 'email_dorks',
            extra: { from: 'serp_body' },
          });
        }
      } catch (err) {
        onProgress({ stage: 'email_dorks', message: err.message, percent: 40 });
      } finally {
        await page.close().catch(() => {});
      }
    }

    onProgress({
      stage: 'email_dorks',
      message: `Email dorks: ${leads.length} public hits`,
      percent: 90,
    });
  } catch (err) {
    console.error('[email_dorks]', err.message);
  } finally {
    if (browser) await browser.close().catch(() => {});
  }

  return {
    leads,
    meta: { source: 'email_dorks', totalCards: leads.length, processedCount: leads.length },
  };
}

module.exports = { scrapeEmailDorks, emailDorkQueries };
