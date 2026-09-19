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
  return { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon), display: data[0].display_name };
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

  const radius = 8000;
  const tag = osmTagsForKeyword(keyword);
  const kw = String(keyword).replace(/"/g, '');
  const query = tag
    ? `[out:json][timeout:25];(node${tag}(around:${radius},${geo.lat},${geo.lon});way${tag}(around:${radius},${geo.lat},${geo.lon}););out center tags ${max};`
    : `[out:json][timeout:25];(node["name"~"${kw}",i](around:${radius},${geo.lat},${geo.lon});way["name"~"${kw}",i](around:${radius},${geo.lat},${geo.lon}););out center tags ${max};`;

  onProgress({ stage: 'osm', message: 'Querying Overpass for local businesses…', percent: 40 });
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
    onProgress({ stage: 'osm', message: `OSM found ${leads.length} places`, percent: 90 });
  } catch (err) {
    console.error('[osm]', err.message);
    onProgress({ stage: 'osm', message: `OSM error: ${err.message}`, percent: 50 });
  }
  return {
    leads,
    meta: { source: 'osm', totalCards: leads.length, processedCount: leads.length, skippedCount: 0, remaining: 0 },
  };
}

module.exports = { scrapeOSM };
