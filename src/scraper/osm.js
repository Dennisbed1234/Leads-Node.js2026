const NOMINATIM = 'https://nominatim.openstreetmap.org';
const OVERPASS = 'https://overpass-api.de/api/interpreter';
const UA = 'LeadsNodeUS/1.0 (lead research; contact: local-dev)';

async function geocode(location) {
  const q = encodeURIComponent(location);
  const res = await fetch(`${NOMINATIM}/search?q=${q}&format=json&limit=1&countrycodes=us`, {
    headers: { 'User-Agent': UA },
  });
  if (!res.ok) throw new Error(`Nominatim ${res.status}`);
  const data = await res.json();
  if (!data[0]) return null;
  return {
    lat: parseFloat(data[0].lat),
    lon: parseFloat(data[0].lon),
    display: data[0].display_name,
    // boundingbox: [south, north, west, east] as strings when present
    bbox: data[0].boundingbox || null,
  };
}

function osmTagsForKeyword(keyword) {
  const k = String(keyword || '').toLowerCase();
  const map = {
    gym: '["leisure"="fitness_centre"]',
    fitness: '["leisure"="fitness_centre"]',
    hotel: '["tourism"="hotel"]',
    restaurant: '["amenity"="restaurant"]',
    cafe: '["amenity"="cafe"]',
    hospital: '["amenity"="hospital"]',
    school: '["amenity"="school"]',
    library: '["amenity"="library"]',
    dentist: '["amenity"="dentist"]',
    pharmacy: '["amenity"="pharmacy"]',
    bank: '["amenity"="bank"]',
    lawyer: '["office"="lawyer"]',
    realtor: '["office"="estate_agent"]',
    'real estate': '["office"="estate_agent"]',
    salon: '["shop"="hairdresser"]',
    barber: '["shop"="hairdresser"]',
    plumber: '["craft"="plumber"]',
    electrician: '["craft"="electrician"]',
    supermarket: '["shop"="supermarket"]',
  };
  for (const [key, tag] of Object.entries(map)) {
    if (k.includes(key)) return tag;
  }
  return null;
}

/** Detect if location string is state-level (no city) vs city-level */
function isStateLevelLocation(location) {
  const parts = String(location || '')
    .split(',')
    .map((s) => s.trim())
    .filter((p) => p && !/^united states$/i.test(p) && !/^usa$/i.test(p));
  // e.g. "Illinois, United States" → 1 meaningful part
  return parts.length <= 1;
}

function extractStateHint(location) {
  const parts = String(location || '')
    .split(',')
    .map((s) => s.trim())
    .filter((p) => p && !/^united states$/i.test(p) && !/^usa$/i.test(p));
  // Prefer full state name when present
  for (const p of parts) {
    if (p.length > 2) return p;
  }
  return parts[0] || '';
}

async function scrapeOSM(keyword, location, options = {}) {
  const { onProgress = () => {}, max = 60 } = options;
  const leads = [];
  onProgress({ stage: 'osm', message: `Geocoding ${location}…`, percent: 15 });
  let geo;
  try {
    geo = await geocode(location);
  } catch (e) {
    onProgress({ stage: 'osm', message: `Geocode failed: ${e.message}`, percent: 20 });
    return { leads, meta: { source: 'osm', totalCards: 0, processedCount: 0, skippedCount: 0, remaining: 0 } };
  }
  if (!geo) {
    onProgress({ stage: 'osm', message: 'Location not found on OSM', percent: 20 });
    return { leads, meta: { source: 'osm', totalCards: 0, processedCount: 0, skippedCount: 0, remaining: 0 } };
  }

  // City: ~8–15km. State-only: much larger so we cover the region, not one downtown point.
  const stateOnly = isStateLevelLocation(location);
  const radius = stateOnly ? 50000 : 12000;
  const stateHint = extractStateHint(location).toLowerCase();

  const tag = osmTagsForKeyword(keyword);
  const kw = String(keyword).replace(/"/g, '');
  const query = tag
    ? `[out:json][timeout:25];(node${tag}(around:${radius},${geo.lat},${geo.lon});way${tag}(around:${radius},${geo.lat},${geo.lon}););out center tags ${Math.min(max * 2, 120)};`
    : `[out:json][timeout:25];(node["name"~"${kw}",i](around:${radius},${geo.lat},${geo.lon});way["name"~"${kw}",i](around:${radius},${geo.lat},${geo.lon}););out center tags ${Math.min(max * 2, 120)};`;

  onProgress({
    stage: 'osm',
    message: `Querying Overpass (~${Math.round(radius / 1000)}km radius)…`,
    percent: 40,
  });

  let skipped = 0;
  try {
    const res = await fetch(OVERPASS, {
      method: 'POST',
      headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `data=${encodeURIComponent(query)}`,
    });
    if (!res.ok) throw new Error(`Overpass ${res.status}`);
    const data = await res.json();
    for (const el of data.elements || []) {
      const t = el.tags || {};
      const name = t.name || t['name:en'] || '';
      if (!name) continue;

      const phone = t.phone || t['contact:phone'] || '';
      const website = t.website || t['contact:website'] || t.url || '';
      const email = t.email || t['contact:email'] || '';
      const street = [t['addr:housenumber'], t['addr:street']].filter(Boolean).join(' ');
      const city = t['addr:city'] || '';
      const state = t['addr:state'] || '';
      const postcode = t['addr:postcode'] || '';
      const address = [street, city, state, postcode].filter(Boolean).join(', ') || location;

      // If OSM tagged a state and user selected one, require a match when possible
      if (stateHint && state) {
        const st = state.toLowerCase();
        if (!st.includes(stateHint) && !stateHint.includes(st) && st.length > 1) {
          // Allow 2-letter codes vs full names loosely
          const ok =
            stateHint.startsWith(st) ||
            st.startsWith(stateHint.slice(0, 2)) ||
            stateHint.slice(0, 2) === st;
          if (!ok) {
            skipped++;
            continue;
          }
        }
      }

      leads.push({
        id: `osm:${el.type}/${el.id}`,
        name,
        rating: '',
        reviews: '',
        phone,
        email,
        address,
        website,
        keyword,
        location,
        source: 'osm',
      });
      if (leads.length >= max) break;
    }
    onProgress({
      stage: 'osm',
      message: `OSM found ${leads.length} places` + (skipped ? ` (filtered ${skipped} outside state)` : ''),
      percent: 90,
    });
  } catch (err) {
    console.error('[osm]', err.message);
    onProgress({ stage: 'osm', message: `OSM error: ${err.message}`, percent: 50 });
  }
  return {
    leads,
    meta: {
      source: 'osm',
      totalCards: leads.length,
      processedCount: leads.length,
      skippedCount: skipped,
      remaining: 0,
    },
  };
}

module.exports = { scrapeOSM };
