const {
  scrapeMulti,
  scrapeMultiCity,
  DEFAULT_SOURCES,
  US_METRO_HINTS,
} = require('../scraper/orchestrator');

const isServerless =
  !!process.env.VERCEL ||
  !!process.env.AWS_LAMBDA_FUNCTION_NAME ||
  !!process.env.AWS_EXECUTION_ENV;

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
    return raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
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

    // Never multi-city on serverless unless forced — it always times out
    const useMulti =
      !isServerless && (truthy(multiCity) || (!city && !area));
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
    res.status(500).json({
      error: 'Internal Server Error',
      detail: String(error.message || error).slice(0, 300),
    });
  }
};

exports.searchStream = async (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  const send = (event, data) => {
    try {
      res.write(`event: ${event}\n`);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    } catch (_) {}
  };

  // Keep connection alive on Vercel / proxies
  const heartbeat = setInterval(() => {
    try {
      res.write(`: ping ${Date.now()}\n\n`);
    } catch (_) {}
  }, 12000);

  try {
    const { category, country, state, city, area, processedIds, sources, enrichWebsites, multiCity } =
      req.query;
    const keyword = category;
    if (!keyword) {
      send('error', { error: 'Category is required' });
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

    const useMulti =
      !isServerless && (truthy(multiCity) || (!city && !area));
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
    send('error', {
      error: 'Internal Server Error',
      detail: String(error.message || error).slice(0, 300),
    });
  } finally {
    clearInterval(heartbeat);
    try {
      res.end();
    } catch (_) {}
  }
};

exports.listSources = (req, res) => {
  res.json({
    sources: [
      { id: 'osm', label: 'OpenStreetMap', description: 'Public OSM POIs (works on Vercel)', needsBrowser: false },
      { id: 'github', label: 'GitHub', description: 'Public profiles (works on Vercel)', needsBrowser: false },
      { id: 'maps', label: 'Google Maps', description: 'Local businesses (needs browser / local host)', needsBrowser: true },
      { id: 'google_web', label: 'Google Search', description: 'Multi-dork SERP (needs browser)', needsBrowser: true },
      { id: 'bing', label: 'Bing Search', description: 'Second search engine (needs browser)', needsBrowser: true },
      { id: 'social', label: 'Social', description: 'Public FB / LinkedIn / IG via search (needs browser)', needsBrowser: true },
      { id: 'directories', label: 'Directories', description: 'Yelp, YellowPages, BBB… (needs browser)', needsBrowser: true },
    ],
    enrichment: { website_crawl: 'Public contact pages for business emails (fetch, works on Vercel)' },
    multiCity: {
      description: 'Heavy — disabled on Vercel. On local hosts, searches major US metros when no city is set.',
      metros: US_METRO_HINTS,
      disabledOnServerless: true,
    },
    default: DEFAULT_SOURCES,
    serverless: isServerless,
    targetMax: isServerless ? 120 : 2500,
  });
};
