/**
 * Crawl public website pages for business contact emails.
 * Homepage + contact/about paths; deobfuscates common [at]/[dot] patterns.
 *
 * On serverless: strict per-request + overall deadlines so this stage cannot hang.
 */

const { extractEmails, extractMailto, domainFromUrl, scoreEmail } = require('./emailUtils');
const { isServerless } = require('./browser');

const CONTACT_PATHS_FULL = [
  '/',
  '/contact',
  '/contact-us',
  '/contactus',
  '/about',
  '/about-us',
  '/team',
  '/support',
  '/get-in-touch',
];

/** Minimal paths for Vercel — fewer slow round-trips */
const CONTACT_PATHS_FAST = ['/', '/contact', '/contact-us', '/about'];

const UA =
  'Mozilla/5.0 (compatible; USLeadsBot/1.1; +https://github.com/Dennisbed1234/Leads-Node.js2026; research)';

async function fetchText(url, timeoutMs = 4000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': UA,
        Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });
    if (!res.ok) return '';
    const ctype = res.headers.get('content-type') || '';
    if (!/text\/html|text\/plain|application\/xhtml/i.test(ctype) && ctype) return '';
    // Cap body size early — large pages waste time on serverless
    const text = await res.text();
    return text.length > 200000 ? text.slice(0, 200000) : text;
  } catch {
    return '';
  } finally {
    clearTimeout(t);
  }
}

function absolutize(base, href) {
  try {
    return new URL(href, base).href;
  } catch {
    return null;
  }
}

function findExtraContactLinks(html, baseUrl) {
  const links = [];
  const re = /href=["']([^"']+)["']/gi;
  let m;
  while ((m = re.exec(html))) {
    const href = m[1];
    if (
      /contact|about|team|support|get-in-touch|enquiry|inquiry|locations|reach/i.test(href) &&
      !/^mailto:/i.test(href) &&
      !/^#/i.test(href) &&
      !/\.(pdf|jpg|png|css|js)$/i.test(href)
    ) {
      const abs = absolutize(baseUrl, href);
      if (abs && abs.startsWith('http') && abs.includes(new URL(baseUrl).hostname)) {
        links.push(abs.split('#')[0]);
      }
    }
  }
  return [...new Set(links)].slice(0, 3);
}

async function crawlWebsiteForEmails(websiteUrl, opts = {}) {
  const maxPages = opts.maxPages || (isServerless ? 2 : 6);
  const pageTimeout = opts.pageTimeoutMs || (isServerless ? 3500 : 10000);
  const paths = opts.paths || (isServerless ? CONTACT_PATHS_FAST : CONTACT_PATHS_FULL);
  const deadline = opts.deadline || 0;

  let base;
  try {
    const u = new URL(websiteUrl.startsWith('http') ? websiteUrl : `https://${websiteUrl}`);
    base = `${u.protocol}//${u.host}`;
  } catch {
    return { emails: [], pagesChecked: 0 };
  }

  const siteDomain = domainFromUrl(base);
  const queue = paths.map((p) => `${base}${p === '/' ? '/' : p}`);
  const seenUrl = new Set();
  const byEmail = new Map();
  let pagesChecked = 0;

  while (queue.length && pagesChecked < maxPages) {
    if (deadline && Date.now() >= deadline) break;

    const url = queue.shift();
    if (!url || seenUrl.has(url)) continue;
    seenUrl.add(url);

    const html = await fetchText(url, pageTimeout);
    pagesChecked++;
    if (!html) continue;

    const pathHint = url.replace(base, '') || '/';
    const fromMailto = extractMailto(html);
    const fromText = extractEmails(html);
    const isContact = /contact|about|team|support|enquiry|inquiry|locations|reach/i.test(pathHint);

    for (const email of fromMailto) {
      const prev = byEmail.get(email);
      const score = scoreEmail(email, { siteDomain, fromMailto: true, fromContactPage: isContact });
      if (!prev || score > prev.score) byEmail.set(email, { email, score, path: pathHint });
    }
    for (const email of fromText) {
      const prev = byEmail.get(email);
      const score = scoreEmail(email, { siteDomain, fromMailto: false, fromContactPage: isContact });
      if (!prev || score > prev.score) byEmail.set(email, { email, score, path: pathHint });
    }

    // Early exit if we already found a strong contact email
    if (byEmail.size && [...byEmail.values()].some((e) => e.score >= 70)) break;

    if (pagesChecked <= 1 && !isServerless) {
      for (const extra of findExtraContactLinks(html, base)) {
        if (!seenUrl.has(extra)) queue.push(extra);
      }
    }
  }

  const emails = [...byEmail.values()].sort((a, b) => b.score - a.score);
  return { emails, pagesChecked };
}

/**
 * Enrich leads with public website emails.
 * options.deadlineMs — absolute wall-clock stop (Date.now() based)
 * Never throws; returns whatever was collected before the deadline.
 */
async function enrichLeadsWithWebsiteEmails(leads, options = {}) {
  const defaultMax = isServerless ? 25 : 500;
  const defaultConcurrency = isServerless ? 2 : 6;
  const defaultBudget = isServerless ? 20000 : 0; // 20s max for crawl stage on Vercel

  const {
    onProgress = () => {},
    concurrency = defaultConcurrency,
    maxLeads = defaultMax,
    deadlineMs = defaultBudget,
  } = options;

  const started = Date.now();
  const deadline = deadlineMs > 0 ? started + deadlineMs : 0;

  // Prefer leads that don't already have an email and have a real website
  const targets = leads
    .filter((l) => l.website && /^https?:/i.test(String(l.website)))
    .sort((a, b) => {
      const ae = a.email ? 1 : 0;
      const be = b.email ? 1 : 0;
      return ae - be; // no-email first
    })
    .slice(0, maxLeads);

  let done = 0;
  let found = 0;
  let errors = 0;
  let stoppedEarly = false;

  if (!targets.length) {
    onProgress({ stage: 'website_crawl', message: 'No websites to crawl', percent: 95 });
    return leads;
  }

  onProgress({
    stage: 'website_crawl',
    message: `Website crawl: ${targets.length} sites` +
      (deadline ? ` (max ~${Math.round(deadlineMs / 1000)}s)` : ''),
    percent: 70,
  });

  // Shared index so workers pull next site and can stop on deadline
  let nextIndex = 0;

  async function worker() {
    while (true) {
      if (deadline && Date.now() >= deadline) {
        stoppedEarly = true;
        return;
      }
      const i = nextIndex++;
      if (i >= targets.length) return;

      const lead = targets[i];
      try {
        const remaining = deadline ? Math.max(500, deadline - Date.now()) : 15000;
        // Don't start a site if almost out of time
        if (deadline && remaining < 800) {
          stoppedEarly = true;
          return;
        }

        const { emails } = await crawlWebsiteForEmails(lead.website, {
          maxPages: isServerless ? 2 : 6,
          pageTimeoutMs: isServerless ? Math.min(3500, remaining - 200) : 10000,
          deadline: deadline || 0,
        });

        if (emails.length) {
          const best = emails[0];
          // Only overwrite if better / missing
          if (!lead.email || (best.score || 0) > (lead.emailScore || 0)) {
            lead.email = best.email;
            lead.emailScore = best.score;
          }
          lead.emails = [...new Set([...(lead.emails || []), ...emails.map((e) => e.email)])];
          lead.extra = { ...(lead.extra || {}), emailPaths: emails.map((e) => e.path) };
          found++;
        }
      } catch (_) {
        errors++;
      }

      done++;
      if (done % 3 === 0 || done === targets.length || (deadline && Date.now() >= deadline)) {
        onProgress({
          stage: 'website_crawl',
          message:
            `Website email crawl ${done}/${targets.length}` +
            (found ? ` · ${found} emails` : '') +
            (errors ? ` · ${errors} errors` : '') +
            (stoppedEarly || (deadline && Date.now() >= deadline) ? ' · stopping' : ''),
          percent: 70 + Math.floor((done / Math.max(1, targets.length)) * 25),
        });
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, targets.length) }, () => worker());
  await Promise.all(workers);

  onProgress({
    stage: 'website_crawl',
    message:
      `Website crawl done: ${done}/${targets.length} sites, ${found} emails` +
      (stoppedEarly ? ' (time limit reached)' : '') +
      ` in ${Math.round((Date.now() - started) / 1000)}s`,
    percent: 95,
  });

  return leads;
}

module.exports = {
  crawlWebsiteForEmails,
  enrichLeadsWithWebsiteEmails,
  CONTACT_PATHS: CONTACT_PATHS_FULL,
};
