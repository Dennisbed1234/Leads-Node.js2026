/**
 * Orchestrator — runs selected discovery modules (theHarvester / recon-ng style).
 * On Vercel/serverless: strict time budget so the function always returns before timeout.
 */
const {
  resolveModules,
  DEFAULT_MODULES,
  SERVERLESS_DEFAULT_MODULES,
  listModules,
  isServerless,
} = require('../modules/registry');
const { enrichLeadsWithWebsiteEmails } = require('./websiteCrawl');
const { isLikelyRealEmail } = require('./emailUtils');

const TARGET_MAX = isServerless ? 120 : 2500;
const WEBSITE_MAX = isServerless ? 40 : 500;
const WEBSITE_CONCURRENCY = isServerless ? 3 : 8;
/** Leave headroom under Vercel maxDuration (60s default / up to 300s Pro) */
const TIME_BUDGET_MS = isServerless
  ? Number(process.env.SCRAPE_TIME_BUDGET_MS || 45000)
  : Number(process.env.SCRAPE_TIME_BUDGET_MS || 0); // 0 = no limit locally

const US_METRO_HINTS = [
  'New York, NY',
  'Los Angeles, CA',
  'Chicago, IL',
  'Houston, TX',
  'Phoenix, AZ',
  'Philadelphia, PA',
  'San Antonio, TX',
  'San Diego, CA',
  'Dallas, TX',
  'Austin, TX',
  'Miami, FL',
  'Atlanta, GA',
  'Seattle, WA',
  'Denver, CO',
  'Boston, MA',
];

function normalizeLead(lead) {
  const emails = [...(Array.isArray(lead.emails) ? lead.emails : []), lead.email || '']
    .map((e) => String(e || '').toLowerCase().trim())
    .filter(isLikelyRealEmail);
  const uniq = [...new Set(emails)];
  return {
    id: lead.id || '',
    name: lead.name || '',
    rating: lead.rating || '',
    reviews: lead.reviews || '',
    phone: lead.phone || '',
    email: uniq[0] || lead.email || '',
    emails: uniq,
    address: lead.address || '',
    website: lead.website || '',
    keyword: lead.keyword || '',
    location: lead.location || '',
    source: lead.source || 'unknown',
    emailScore: lead.emailScore || 0,
    extra: lead.extra || undefined,
  };
}

function dedupeKey(lead) {
  const email = String(lead.email || '').toLowerCase();
  if (email && email.includes('@')) return `e:${email}`;
  const phone = String(lead.phone || '').replace(/\D/g, '');
  const name = String(lead.name || '').toLowerCase().replace(/\s+/g, ' ').trim();
  const site = String(lead.website || '')
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/$/, '')
    .split('/')[0];
  if (phone.length >= 10) return `p:${phone}`;
  if (site) return `w:${site}|${name}`;
  return `n:${name}|${String(lead.address || '').toLowerCase().slice(0, 40)}`;
}

function sourceMax(sourceId, room) {
  if (isServerless) {
    if (sourceId === 'osm') return Math.min(50, room);
    if (sourceId === 'github') return Math.min(30, room);
    return Math.min(25, room);
  }
  if (sourceId === 'maps') return Math.min(600, room);
  if (sourceId === 'directories') return Math.min(500, room);
  if (sourceId === 'social') return Math.min(300, room);
  if (sourceId === 'google_web' || sourceId === 'bing' || sourceId === 'duckduckgo') return Math.min(350, room);
  if (sourceId === 'osm') return Math.min(400, room);
  return Math.min(250, room);
}

function withTimeout(promise, ms, label) {
  if (!ms || ms <= 0) return promise;
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    ),
  ]);
}

async function scrapeMulti(keyword, location, options = {}) {
  const {
    sources,
    onProgress = () => {},
    skipIds = [],
    enrichWebsites = true,
  } = options;

  const started = Date.now();
  const deadline = TIME_BUDGET_MS > 0 ? started + TIME_BUDGET_MS : Infinity;
  const remainingMs = () => Math.max(0, deadline - Date.now());

  const modules = resolveModules(sources);
  const allLeads = [];
  const seen = new Set(skipIds.filter(Boolean));
  const perSource = {};

  if (isServerless) {
    onProgress({
      stage: 'init',
      message: `Serverless mode: ${modules.map((m) => m.id).join(', ')} (budget ~${Math.round(TIME_BUDGET_MS / 1000)}s)`,
      percent: 2,
    });
  }

  for (let i = 0; i < modules.length; i++) {
    if (allLeads.length >= TARGET_MAX) break;
    if (Date.now() >= deadline - 8000) {
      onProgress({
        stage: 'budget',
        message: 'Time budget low — skipping remaining discovery modules',
        percent: 60,
      });
      break;
    }

    const mod = modules[i];
    const basePct = Math.floor((i / modules.length) * 55);
    onProgress({
      stage: 'source',
      message: `Module: ${mod.id} (${i + 1}/${modules.length}) — ${allLeads.length} so far`,
      percent: basePct + 5,
      source: mod.id,
    });

    try {
      const room = TARGET_MAX - allLeads.length;
      const modTimeout = Math.min(20000, Math.max(5000, remainingMs() - 10000));
      const result = await withTimeout(
        mod.run(keyword, location, {
          onProgress: (p) =>
            onProgress({
              ...p,
              source: mod.id,
              percent: basePct + Math.floor(((p.percent || 0) / 100) * (55 / modules.length)),
            }),
          skipIds: Array.from(seen),
          max: sourceMax(mod.id, room),
        }),
        modTimeout,
        mod.id
      );
      const leads = (result.leads || []).map((l) =>
        normalizeLead({ ...l, source: l.source || mod.id })
      );
      let added = 0;
      for (const lead of leads) {
        if (allLeads.length >= TARGET_MAX) break;
        const key = dedupeKey(lead);
        if (seen.has(key) || (lead.id && seen.has(lead.id))) continue;
        seen.add(key);
        if (lead.id) seen.add(lead.id);
        allLeads.push(lead);
        added++;
      }
      perSource[mod.id] = { found: leads.length, kept: added };
      onProgress({
        stage: 'source',
        message: `${mod.id}: kept ${added} (total ${allLeads.length})`,
        percent: basePct + Math.floor(55 / modules.length),
        source: mod.id,
      });
    } catch (err) {
      console.error(`[orchestrator] ${mod.id}:`, err.message);
      perSource[mod.id] = { error: err.message };
      onProgress({
        stage: 'source',
        message: `${mod.id} failed: ${err.message}`,
        percent: basePct + 10,
        source: mod.id,
      });
    }
  }

  const doEnrich = enrichWebsites && allLeads.length && remainingMs() > 5000;
  if (doEnrich) {
    onProgress({
      stage: 'website_crawl',
      message: `Crawling websites for public contact emails (up to ${WEBSITE_MAX})…`,
      percent: 65,
    });
    try {
      await withTimeout(
        enrichLeadsWithWebsiteEmails(allLeads, {
          onProgress,
          concurrency: WEBSITE_CONCURRENCY,
          maxLeads: WEBSITE_MAX,
        }),
        Math.max(3000, remainingMs() - 2000),
        'website_crawl'
      );
      for (let i = 0; i < allLeads.length; i++) allLeads[i] = normalizeLead(allLeads[i]);
      perSource.website_crawl = { leadsWithEmail: allLeads.filter((l) => l.email).length };
    } catch (err) {
      perSource.website_crawl = { error: err.message };
      onProgress({
        stage: 'website_crawl',
        message: `Website crawl stopped: ${err.message}`,
        percent: 90,
      });
    }
  } else if (enrichWebsites && allLeads.length) {
    onProgress({
      stage: 'website_crawl',
      message: 'Skipped website crawl (time budget)',
      percent: 90,
    });
  }

  allLeads.sort((a, b) => {
    const ae = a.email ? 1 : 0;
    const be = b.email ? 1 : 0;
    if (be !== ae) return be - ae;
    return (b.emailScore || 0) - (a.emailScore || 0);
  });

  onProgress({
    stage: 'final',
    message: `Done. ${allLeads.length} leads (${allLeads.filter((l) => l.email).length} with email) in ${Math.round((Date.now() - started) / 1000)}s`,
    percent: 100,
    total: allLeads.length,
  });

  return {
    leads: allLeads,
    meta: {
      totalCards: allLeads.length,
      processedCount: allLeads.length,
      withEmail: allLeads.filter((l) => l.email).length,
      targetMax: TARGET_MAX,
      sources: modules.map((m) => m.id),
      perSource,
      serverless: isServerless,
      elapsedMs: Date.now() - started,
    },
  };
}

async function scrapeMultiCity(keyword, options = {}) {
  // Multi-city is too heavy for serverless — fall back to a single major metro
  if (isServerless) {
    const city = (options.cities && options.cities[0]) || 'Chicago, IL';
    options.onProgress?.({
      stage: 'multi_city',
      message: `Serverless: single-city fallback (${city})`,
      percent: 5,
    });
    return scrapeMulti(keyword, `${city}, United States`, {
      ...options,
      enrichWebsites: options.enrichWebsites !== false,
    });
  }

  const {
    cities = US_METRO_HINTS.slice(0, 8),
    sources = DEFAULT_MODULES,
    onProgress = () => {},
    enrichWebsites = true,
  } = options;

  const allLeads = [];
  const seen = new Set();
  const perCity = {};

  for (let i = 0; i < cities.length; i++) {
    if (allLeads.length >= TARGET_MAX) break;
    const city = cities[i];
    const loc = `${city}, United States`;
    onProgress({
      stage: 'multi_city',
      message: `City ${i + 1}/${cities.length}: ${city} (${allLeads.length} so far)`,
      percent: Math.floor((i / cities.length) * 90),
    });
    try {
      const result = await scrapeMulti(keyword, loc, {
        sources,
        enrichWebsites: false,
        skipIds: Array.from(seen),
        onProgress: (p) =>
          onProgress({
            ...p,
            message: `[${city}] ${p.message || ''}`,
            percent:
              Math.floor((i / cities.length) * 90) +
              Math.floor(((p.percent || 0) / 100) * (90 / cities.length)),
          }),
      });
      let added = 0;
      for (const lead of result.leads || []) {
        if (allLeads.length >= TARGET_MAX) break;
        const key = dedupeKey(lead);
        if (seen.has(key)) continue;
        seen.add(key);
        allLeads.push(normalizeLead(lead));
        added++;
      }
      perCity[city] = { kept: added };
    } catch (err) {
      perCity[city] = { error: err.message };
    }
  }

  if (enrichWebsites && allLeads.length) {
    onProgress({ stage: 'website_crawl', message: 'Crawling websites for emails…', percent: 92 });
    await enrichLeadsWithWebsiteEmails(allLeads, {
      onProgress,
      concurrency: WEBSITE_CONCURRENCY,
      maxLeads: WEBSITE_MAX,
    });
    for (let i = 0; i < allLeads.length; i++) allLeads[i] = normalizeLead(allLeads[i]);
  }

  allLeads.sort((a, b) => {
    const ae = a.email ? 1 : 0;
    const be = b.email ? 1 : 0;
    if (be !== ae) return be - ae;
    return (b.emailScore || 0) - (a.emailScore || 0);
  });

  onProgress({
    stage: 'final',
    message: `Multi-city done. ${allLeads.length} leads (${allLeads.filter((l) => l.email).length} with email)`,
    percent: 100,
  });

  return {
    leads: allLeads,
    meta: {
      totalCards: allLeads.length,
      withEmail: allLeads.filter((l) => l.email).length,
      targetMax: TARGET_MAX,
      multiCity: true,
      cities,
      perCity,
      sources,
    },
  };
}

const DEFAULT_SOURCES = isServerless ? SERVERLESS_DEFAULT_MODULES : DEFAULT_MODULES;
const SOURCE_RUNNERS = {};

module.exports = {
  scrapeMulti,
  scrapeMultiCity,
  DEFAULT_SOURCES,
  DEFAULT_MODULES,
  SERVERLESS_DEFAULT_MODULES,
  SOURCE_RUNNERS,
  TARGET_MAX,
  US_METRO_HINTS,
  listModules,
};
