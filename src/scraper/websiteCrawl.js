/**
 * Crawl public website pages for business contact emails.
 * Homepage + contact/about paths; deobfuscates common [at]/[dot] patterns.
 */

const { extractEmails, extractMailto, domainFromUrl, scoreEmail } = require('./emailUtils');
const { isServerless } = require('./browser');

const CONTACT_PATHS = [
  '/',
  '/contact',
  '/contact-us',
  '/contactus',
  '/contact.html',
  '/contact.php',
  '/about',
  '/about-us',
  '/aboutus',
  '/about.html',
  '/team',
  '/our-team',
  '/staff',
  '/support',
  '/get-in-touch',
  '/connect',
  '/locations',
  '/find-us',
  '/reach-us',
  '/enquiry',
  '/inquiry',
  '/book',
  '/booking',
];

const UA =
  'Mozilla/5.0 (compatible; USLeadsBot/1.1; +https://github.com/Dennisbed1234/Leads-Node.js2026; research)';

async function fetchText(url, timeoutMs = 14000) {
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
    const text = await res.text();
    return text.length > 800000 ? text.slice(0, 800000) : text;
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
  return [...new Set(links)].slice(0, 8);
}

async function crawlWebsiteForEmails(websiteUrl, opts = {}) {
  const maxPages = opts.maxPages || 8;
  let base;
  try {
    const u = new URL(websiteUrl.startsWith('http') ? websiteUrl : `https://${websiteUrl}`);
    base = `${u.protocol}//${u.host}`;
  } catch {
    return { emails: [], pagesChecked: 0 };
  }

  const siteDomain = domainFromUrl(base);
  const queue = [];
  const seenUrl = new Set();
  for (const p of CONTACT_PATHS) {
    queue.push(`${base}${p === '/' ? '/' : p}`);
  }

  const byEmail = new Map();
  let pagesChecked = 0;

  while (queue.length && pagesChecked < maxPages) {
    const url = queue.shift();
    if (!url || seenUrl.has(url)) continue;
    seenUrl.add(url);
    const html = await fetchText(url);
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

    if (pagesChecked <= 2) {
      for (const extra of findExtraContactLinks(html, base)) {
        if (!seenUrl.has(extra)) queue.push(extra);
      }
    }
  }

  const emails = [...byEmail.values()].sort((a, b) => b.score - a.score);
  return { emails, pagesChecked };
}

async function enrichLeadsWithWebsiteEmails(leads, options = {}) {
  // On serverless (Vercel etc.) keep the crawl short to avoid timeouts / connection drops
  const defaultMax = isServerless ? 80 : 500;
  const defaultConcurrency = isServerless ? 4 : 8;
  const { onProgress = () => {}, concurrency = defaultConcurrency, maxLeads = defaultMax } = options;
  const targets = leads
    .filter((l) => l.website && /^https?:/i.test(String(l.website)))
    .slice(0, maxLeads);
  let done = 0;
  let errors = 0;

  async function worker(slice) {
    for (const lead of slice) {
      try {
        const { emails } = await crawlWebsiteForEmails(lead.website, { maxPages: isServerless ? 4 : 7 });
        if (emails.length) {
          const best = emails[0];
          lead.email = best.email;
          lead.emails = [...new Set([...(lead.emails || []), ...emails.map((e) => e.email)])];
          lead.emailScore = best.score;
          lead.extra = { ...(lead.extra || {}), emailPaths: emails.map((e) => e.path) };
        }
      } catch (err) {
        errors++;
        // swallow per-site errors so one bad site does not kill the whole job
      }
      done++;
      if (done % 5 === 0 || done === targets.length) {
        onProgress({
          stage: 'website_crawl',
          message: `Website email crawl ${done}/${targets.length}` + (errors ? ` (${errors} errors)` : ''),
          percent: 70 + Math.floor((done / Math.max(1, targets.length)) * 25),
        });
      }
    }
  }

  if (!targets.length) {
    onProgress({ stage: 'website_crawl', message: 'No websites to crawl', percent: 95 });
    return leads;
  }

  const chunks = Array.from({ length: Math.min(concurrency, targets.length) }, () => []);
  targets.forEach((t, i) => chunks[i % chunks.length].push(t));
  await Promise.all(chunks.map((c) => worker(c)));
  return leads;
}

module.exports = { crawlWebsiteForEmails, enrichLeadsWithWebsiteEmails, CONTACT_PATHS };
