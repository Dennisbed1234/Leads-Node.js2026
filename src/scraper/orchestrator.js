/**
 * Multi-source US lead + public email orchestrator.
 * Sources: maps, osm, github, google_web, bing + website email enrichment.
 */

const scrapeMaps = require('./engine');
const { scrapeGitHub } = require('./github');
const { scrapeGoogleWeb } = require('./googleWeb');
const { scrapeBingWeb } = require('./bingWeb');
const { scrapeOSM } = require('./osm');
const { enrichLeadsWithWebsiteEmails } = require('./websiteCrawl');
const { isLikelyRealEmail } = require('./emailUtils');

const SOURCE_RUNNERS = {
  maps: (keyword, location, opts) => scrapeMaps(keyword, location, opts),
  github: (keyword, location, opts) => scrapeGitHub(keyword, location, opts),
  google_web: (keyword, location, opts) => scrapeGoogleWeb(keyword, location, opts),
  bing: (keyword, location, opts) => scrapeBingWeb(keyword, location, opts),
  osm: (keyword, location, opts) => scrapeOSM(keyword, location, opts),
};

const DEFAULT_SOURCES = ['maps', 'osm', 'google_web', 'bing', 'github'];

function normalizeLead(lead) {
  const emails = [
    ...(Array.isArray(lead.emails) ? lead.emails : []),
    lead.email || '',
  ]
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
    const source = selected[i];
    const basePct = Math.floor((i / selected.length) * 55);
    onProgress({
      stage: 'source',
      message: `Running source: ${source} (${i + 1}/${selected.length})`,
      percent: basePct + 5,
      source,
    });
    try {
      const result = await SOURCE_RUNNERS[source](keyword, location, {
        onProgress: (p) =>
          onProgress({
            ...p,
            source,
            percent: basePct + Math.floor(((p.percent || 0) / 100) * (55 / selected.length)),
          }),
        skipIds: Array.from(seen),
        max: source === 'maps' ? 120 : 60,
      });
      const leads = (result.leads || []).map((l) => normalizeLead({ ...l, source: l.source || source }));
      let added = 0;
      for (const lead of leads) {
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
        message: `${source}: kept ${added} of ${leads.length}`,
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
      message: `Crawling up to ${Math.min(80, allLeads.length)} public websites for contact emails…`,
      percent: 65,
    });
    try {
      await enrichLeadsWithWebsiteEmails(allLeads, {
        onProgress,
        concurrency: 4,
        maxLeads: 80,
      });
      for (let i = 0; i < allLeads.length; i++) {
        allLeads[i] = normalizeLead(allLeads[i]);
      }
      const withEmail = allLeads.filter((l) => l.email).length;
      perSource.website_crawl = { leadsWithEmail: withEmail };
      onProgress({
        stage: 'website_crawl',
        message: `Website crawl done — ${withEmail} leads have email`,
        percent: 92,
      });
    } catch (err) {
      console.error('[orchestrator] website crawl:', err.message);
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
    message: `Done. ${allLeads.length} unique leads (${allLeads.filter((l) => l.email).length} with email)`,
    percent: 100,
    total: allLeads.length,
  });

  return {
    leads: allLeads,
    meta: {
      totalCards: allLeads.length,
      processedCount: allLeads.length,
      withEmail: allLeads.filter((l) => l.email).length,
      skippedCount: 0,
      remaining: 0,
      sources: selected,
      perSource,
    },
  };
}

module.exports = { scrapeMulti, DEFAULT_SOURCES, SOURCE_RUNNERS };
