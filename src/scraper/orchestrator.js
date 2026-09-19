const scrapeMaps = require('./engine');
const { scrapeGitHub } = require('./github');
const { scrapeGoogleWeb } = require('./googleWeb');
const { scrapeBingWeb } = require('./bingWeb');
const { scrapeOSM } = require('./osm');
const { scrapeSocial } = require('./social');
const { scrapeDirectories } = require('./directories');
const { enrichLeadsWithWebsiteEmails } = require('./websiteCrawl');
const { isLikelyRealEmail } = require('./emailUtils');

const SOURCE_RUNNERS = {
  maps: (keyword, location, opts) => scrapeMaps(keyword, location, opts),
  github: (keyword, location, opts) => scrapeGitHub(keyword, location, opts),
  google_web: (keyword, location, opts) => scrapeGoogleWeb(keyword, location, opts),
  bing: (keyword, location, opts) => scrapeBingWeb(keyword, location, opts),
  osm: (keyword, location, opts) => scrapeOSM(keyword, location, opts),
  social: (keyword, location, opts) => scrapeSocial(keyword, location, opts),
  directories: (keyword, location, opts) => scrapeDirectories(keyword, location, opts),
};

const DEFAULT_SOURCES = ['maps', 'osm', 'google_web', 'bing', 'social', 'directories', 'github'];
const TARGET_MAX = 2500;

/** Major US metros for multi-city expansion (public business discovery only). */
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
    source: lead.source || 'maps',
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

function sourceMax(source, room) {
  if (source === 'maps') return Math.min(600, room);
  if (source === 'directories') return Math.min(500, room);
  if (source === 'social') return Math.min(300, room);
  if (source === 'google_web' || source === 'bing') return Math.min(350, room);
  if (source === 'osm') return Math.min(400, room);
  return Math.min(250, room);
}

async function scrapeMulti(keyword, location, options = {}) {
  const {
    sources = DEFAULT_SOURCES,
    onProgress = () => {},
    skipIds = [],
    enrichWebsites = true,
  } = options;

  const selected = (Array.isArray(sources) && sources.length ? sources : DEFAULT_SOURCES)
    .map((s) => String(s).toLowerCase().trim())
    .filter((s) => SOURCE_RUNNERS[s]);

  const allLeads = [];
  const seen = new Set(skipIds.filter(Boolean));
  const perSource = {};

  for (let i = 0; i < selected.length; i++) {
    if (allLeads.length >= TARGET_MAX) break;
    const source = selected[i];
    const basePct = Math.floor((i / selected.length) * 55);
    onProgress({
      stage: 'source',
      message: `Running source: ${source} (${i + 1}/${selected.length}) — ${allLeads.length} so far`,
      percent: basePct + 5,
      source,
    });
    try {
      const room = TARGET_MAX - allLeads.length;
      const result = await SOURCE_RUNNERS[source](keyword, location, {
        onProgress: (p) =>
          onProgress({
            ...p,
            source,
            percent: basePct + Math.floor(((p.percent || 0) / 100) * (55 / selected.length)),
          }),
        skipIds: Array.from(seen),
        max: sourceMax(source, room),
      });
      const leads = (result.leads || []).map((l) => normalizeLead({ ...l, source: l.source || source }));
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
      perSource[source] = { found: leads.length, kept: added };
      onProgress({
        stage: 'source',
        message: `${source}: kept ${added} (total ${allLeads.length})`,
        percent: basePct + Math.floor(55 / selected.length),
        source,
      });
    } catch (err) {
      console.error(`[orchestrator] ${source}:`, err.message);
      perSource[source] = { error: err.message };
      onProgress({
        stage: 'source',
        message: `${source} failed: ${err.message}`,
        percent: basePct + 10,
        source,
      });
    }
  }

  if (enrichWebsites && allLeads.length) {
    onProgress({
      stage: 'website_crawl',
      message: `Crawling websites for public contact emails (up to 500)…`,
      percent: 65,
    });
    try {
      await enrichLeadsWithWebsiteEmails(allLeads, {
        onProgress,
        concurrency: 8,
        maxLeads: 500,
      });
      for (let i = 0; i < allLeads.length; i++) allLeads[i] = normalizeLead(allLeads[i]);
      const withEmail = allLeads.filter((l) => l.email).length;
      perSource.website_crawl = { leadsWithEmail: withEmail };
      onProgress({
        stage: 'website_crawl',
        message: `Website crawl done — ${withEmail} with email`,
        percent: 92,
      });
    } catch (err) {
      perSource.website_crawl = { error: err.message };
    }
  }

  allLeads.sort((a, b) => {
    const ae = a.email ? 1 : 0;
    const be = b.email ? 1 : 0;
    if (be !== ae) return be - ae;
    return (b.emailScore || 0) - (a.emailScore || 0);
  });

  onProgress({
    stage: 'final',
    message: `Done. ${allLeads.length} leads (${allLeads.filter((l) => l.email).length} with email)`,
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
      skippedCount: 0,
      remaining: 0,
      sources: selected,
      perSource,
    },
  };
}

/**
 * Run the same keyword across several US metros and merge/dedupe.
 * Use when city is omitted or multiCity=true — public business discovery only.
 */
async function scrapeMultiCity(keyword, options = {}) {
  const {
    cities = US_METRO_HINTS.slice(0, 8),
    sources = DEFAULT_SOURCES,
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
            percent: Math.floor((i / cities.length) * 90) + Math.floor(((p.percent || 0) / 100) * (90 / cities.length)),
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
    await enrichLeadsWithWebsiteEmails(allLeads, { onProgress, concurrency: 8, maxLeads: 500 });
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
      processedCount: allLeads.length,
      withEmail: allLeads.filter((l) => l.email).length,
      targetMax: TARGET_MAX,
      multiCity: true,
      cities,
      perCity,
      sources,
    },
  };
}

module.exports = {
  scrapeMulti,
  scrapeMultiCity,
  DEFAULT_SOURCES,
  SOURCE_RUNNERS,
  TARGET_MAX,
  US_METRO_HINTS,
};
