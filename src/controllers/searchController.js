const {
  scrapeMulti,
  scrapeMultiCity,
  DEFAULT_SOURCES,
  US_METRO_HINTS,
} = require('../scraper/orchestrator');

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

function truthy(v) {
  return v === true || v === '1' || v === 'true' || v === 'yes';
}

exports.search = async (req, res) => {
  try {
    const { category, country, state, city, area, processedIds, sources, enrichWebsites, multiCity } =
      req.body;
    const keyword = category;
    if (!keyword) {
      return res.status(400).json({ error: 'Category is required' });
    }

    const opts = {
      sources: parseSources(sources),
      skipIds: Array.isArray(processedIds) ? processedIds : [],
      enrichWebsites: enrichWebsites !== false,
    };

    const useMulti = truthy(multiCity) || (!city && !area);
    let result;
    if (useMulti) {
      result = await scrapeMultiCity(keyword, opts);
    } else {
      const locationString = buildLocation({ country, state, city, area });
      result = await scrapeMulti(keyword, locationString, opts);
    }

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
    const { category, country, state, city, area, processedIds, sources, enrichWebsites, multiCity } =
      req.query;
    const keyword = category;
    if (!keyword) {
      send('error', { error: 'Category is required' });
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
    const opts = {
      sources: parseSources(sources),
      onProgress: (payload) => send('progress', payload),
      skipIds,
      enrichWebsites: enrichWebsites !== '0' && enrichWebsites !== 'false',
    };

    const useMulti = truthy(multiCity) || (!city && !area);
    let result;
    if (useMulti) {
      result = await scrapeMultiCity(keyword, opts);
    } else {
      const locationString = buildLocation({ country, state, city, area });
      result = await scrapeMulti(keyword, locationString, opts);
    }

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
      { id: 'directories', label: 'Directories', description: 'Yelp, YellowPages, BBB, Manta, Angi…' },
      { id: 'github', label: 'GitHub', description: 'Public profiles' },
    ],
    enrichment: { website_crawl: 'Public contact pages for business emails' },
    multiCity: {
      description: 'When no city is selected (or multiCity=true), search major US metros and merge',
      metros: US_METRO_HINTS,
    },
    default: DEFAULT_SOURCES,
    targetMax: 2500,
  });
};
