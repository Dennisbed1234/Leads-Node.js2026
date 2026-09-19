const { scrapeMulti, DEFAULT_SOURCES } = require('../scraper/orchestrator');

function buildLocation({ country, state, city, area }) {
  const locationParts = [];
  if (area) locationParts.push(area);
  if (city) locationParts.push(city);
  if (state) locationParts.push(state);
  locationParts.push(country || 'United States');
  return locationParts.join(', ');
}

function parseSources(raw) {
  if (!raw) return DEFAULT_SOURCES;
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    } catch (_) {}
    return raw.split(',').map((s) => s.trim()).filter(Boolean);
  }
  return DEFAULT_SOURCES;
}

exports.search = async (req, res) => {
  try {
    const { category, country, state, city, area, processedIds, sources, enrichWebsites } = req.body;
    const locationString = buildLocation({ country, state, city, area });
    const keyword = category;
    if (!keyword || !locationString) {
      return res.status(400).json({ error: 'Category and Location are required' });
    }
    const result = await scrapeMulti(keyword, locationString, {
      sources: parseSources(sources),
      skipIds: Array.isArray(processedIds) ? processedIds : [],
      enrichWebsites: enrichWebsites !== false,
    });
    res.json({
      success: true,
      count: result.leads.length,
      withEmail: result.meta.withEmail,
      data: result.leads,
      meta: result.meta,
    });
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

exports.searchStream = async (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  const send = (event, data) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };
  try {
    const { category, country, state, city, area, processedIds, sources, enrichWebsites } = req.query;
    const locationString = buildLocation({ country, state, city, area });
    const keyword = category;
    if (!keyword || !locationString) {
      send('error', { error: 'Category and Location are required' });
      res.end();
      return;
    }
    let skipIds = [];
    if (processedIds) {
      try {
        const parsed = JSON.parse(processedIds);
        if (Array.isArray(parsed)) skipIds = parsed;
      } catch (_) {}
    }
    const result = await scrapeMulti(keyword, locationString, {
      sources: parseSources(sources),
      onProgress: (payload) => send('progress', payload),
      skipIds,
      enrichWebsites: enrichWebsites !== '0' && enrichWebsites !== 'false',
    });
    send('done', {
      success: true,
      count: result.leads.length,
      withEmail: result.meta.withEmail,
      data: result.leads,
      meta: result.meta,
    });
  } catch (error) {
    console.error('Streaming search error:', error);
    send('error', { error: 'Internal Server Error' });
  } finally {
    res.end();
  }
};

exports.listSources = (req, res) => {
  res.json({
    sources: [
      { id: 'maps', label: 'Google Maps', description: 'Local businesses' },
      { id: 'osm', label: 'OpenStreetMap', description: 'Public OSM POIs' },
      { id: 'google_web', label: 'Google Search', description: 'Multi-dork SERP' },
      { id: 'bing', label: 'Bing Search', description: 'Second search engine' },
      { id: 'social', label: 'Social', description: 'Public FB / LinkedIn company / IG via search' },
      { id: 'directories', label: 'Directories', description: 'Yelp, YellowPages, BBB, Manta, Angi, Superpages…' },
      { id: 'github', label: 'GitHub', description: 'Public profiles' },
    ],
    enrichment: { website_crawl: 'Public contact pages for emails' },
    default: DEFAULT_SOURCES,
    targetMax: 2500,
    notes: [
      'Apollo and other commercial sales databases are not supported (not public open data).',
      '10k emails in one free public run is not realistic; use multi-city runs or paid APIs for very large lists.',
    ],
  });
};
