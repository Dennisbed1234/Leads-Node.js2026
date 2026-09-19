const scrapeMaps = require('./engine');
const { scrapeGitHub } = require('./github');
const { scrapeGoogleWeb } = require('./googleWeb');
const { scrapeOSM } = require('./osm');

const SOURCE_RUNNERS = {
  maps: (keyword, location, opts) => scrapeMaps(keyword, location, opts),
  github: (keyword, location, opts) => scrapeGitHub(keyword, location, opts),
  google_web: (keyword, location, opts) => scrapeGoogleWeb(keyword, location, opts),
  osm: (keyword, location, opts) => scrapeOSM(keyword, location, opts),
};

const DEFAULT_SOURCES = ['maps', 'osm', 'github', 'google_web'];

function normalizeLead(lead) {
  return {
    id: lead.id || '',
    name: lead.name || '',
    rating: lead.rating || '',
    reviews: lead.reviews || '',
    phone: lead.phone || '',
    email: lead.email || '',
    address: lead.address || '',
    website: lead.website || '',
    keyword: lead.keyword || '',
    location: lead.location || '',
    source: lead.source || 'maps',
    extra: lead.extra || undefined,
  };
}

function dedupeKey(lead) {
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
  const { sources = DEFAULT_SOURCES, onProgress = () => {}, skipIds = [] } = options;
  const selected = (Array.isArray(sources) && sources.length ? sources : DEFAULT_SOURCES)
    .map((s) => String(s).toLowerCase().trim())
    .filter((s) => SOURCE_RUNNERS[s]);

  const allLeads = [];
  const seen = new Set(skipIds.filter(Boolean));
  const perSource = {};

  for (let i = 0; i < selected.length; i++) {
    const source = selected[i];
    const basePct = Math.floor((i / selected.length) * 90);
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
            percent: basePct + Math.floor(((p.percent || 0) / 100) * (90 / selected.length)),
          }),
        skipIds: Array.from(seen),
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
        percent: basePct + Math.floor(90 / selected.length),
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

  onProgress({
    stage: 'final',
    message: `Done. ${allLeads.length} unique US leads from ${selected.join(', ')}`,
    percent: 100,
    total: allLeads.length,
  });

  return {
    leads: allLeads,
    meta: {
      totalCards: allLeads.length,
      processedCount: allLeads.length,
      skippedCount: 0,
      remaining: 0,
      sources: selected,
      perSource,
    },
  };
}

module.exports = { scrapeMulti, DEFAULT_SOURCES, SOURCE_RUNNERS };
