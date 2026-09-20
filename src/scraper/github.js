const GITHUB_API = 'https://api.github.com';

/** US state name → common abbreviations / aliases people put in GitHub location */
const STATE_ALIASES = {
  alabama: ['al', 'ala'],
  alaska: ['ak'],
  arizona: ['az', 'ariz'],
  arkansas: ['ar', 'ark'],
  california: ['ca', 'calif', 'cal'],
  colorado: ['co', 'colo'],
  connecticut: ['ct', 'conn'],
  delaware: ['de', 'del'],
  florida: ['fl', 'fla'],
  georgia: ['ga'],
  hawaii: ['hi'],
  idaho: ['id'],
  illinois: ['il', 'ill'],
  indiana: ['in', 'ind'],
  iowa: ['ia'],
  kansas: ['ks', 'kan'],
  kentucky: ['ky'],
  louisiana: ['la'],
  maine: ['me'],
  maryland: ['md'],
  massachusetts: ['ma', 'mass'],
  michigan: ['mi', 'mich'],
  minnesota: ['mn', 'minn'],
  mississippi: ['ms', 'miss'],
  missouri: ['mo'],
  montana: ['mt', 'mont'],
  nebraska: ['ne', 'neb'],
  nevada: ['nv', 'nev'],
  'new hampshire': ['nh'],
  'new jersey': ['nj'],
  'new mexico': ['nm'],
  'new york': ['ny'],
  'north carolina': ['nc'],
  'north dakota': ['nd'],
  ohio: ['oh'],
  oklahoma: ['ok', 'okla'],
  oregon: ['or', 'ore'],
  pennsylvania: ['pa', 'penn'],
  'rhode island': ['ri'],
  'south carolina': ['sc'],
  'south dakota': ['sd'],
  tennessee: ['tn', 'tenn'],
  texas: ['tx', 'tex'],
  utah: ['ut'],
  vermont: ['vt'],
  virginia: ['va'],
  washington: ['wa', 'wash'],
  'west virginia': ['wv'],
  wisconsin: ['wi', 'wis'],
  wyoming: ['wy', 'wyo'],
  'district of columbia': ['dc', 'd.c.', 'washington dc', 'washington d.c.'],
};

function headers() {
  const h = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'Leads-Node-US-Scraper',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  if (process.env.GITHUB_TOKEN) h.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  return h;
}

async function ghFetch(path) {
  const res = await fetch(`${GITHUB_API}${path}`, { headers: headers() });
  if (res.status === 403 || res.status === 429) {
    const reset = res.headers.get('x-ratelimit-reset');
    throw new Error(
      `GitHub rate limited${reset ? ` until ${new Date(Number(reset) * 1000).toISOString()}` : ''}`
    );
  }
  if (!res.ok) throw new Error(`GitHub API ${res.status}`);
  return res.json();
}

/**
 * Parse location string from the UI, e.g.
 * "Chicago, IL, Illinois, United States" or "Illinois, United States"
 */
function parseLocationParts(location) {
  const parts = String(location || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((p) => !/^united states$/i.test(p) && !/^usa$/i.test(p) && !/^us$/i.test(p));

  let city = '';
  let stateName = '';
  let stateCode = '';

  for (const p of parts) {
    const lower = p.toLowerCase();
    // 2-letter state code
    if (/^[A-Z]{2}$/.test(p)) {
      stateCode = p.toUpperCase();
      continue;
    }
    // Full state name
    if (STATE_ALIASES[lower]) {
      stateName = p;
      stateCode = stateCode || STATE_ALIASES[lower][0].toUpperCase();
      continue;
    }
    // Match alias → state
    let matched = false;
    for (const [name, aliases] of Object.entries(STATE_ALIASES)) {
      if (aliases.includes(lower)) {
        stateName = name.replace(/\b\w/g, (c) => c.toUpperCase());
        stateCode = aliases[0].toUpperCase();
        matched = true;
        break;
      }
    }
    if (matched) continue;
    // Otherwise treat as city / area (first non-state token)
    if (!city) city = p;
  }

  // If we only got a code, recover full name
  if (stateCode && !stateName) {
    for (const [name, aliases] of Object.entries(STATE_ALIASES)) {
      if (aliases[0].toUpperCase() === stateCode) {
        stateName = name.replace(/\b\w/g, (c) => c.toUpperCase());
        break;
      }
    }
  }

  return { city, stateName, stateCode, parts };
}

/** Tokens that must appear in profile.location (case-insensitive) */
function locationMatchTokens({ city, stateName, stateCode }) {
  const tokens = [];
  if (stateName) tokens.push(stateName.toLowerCase());
  if (stateCode) tokens.push(stateCode.toLowerCase());
  if (stateName && STATE_ALIASES[stateName.toLowerCase()]) {
    for (const a of STATE_ALIASES[stateName.toLowerCase()]) {
      tokens.push(a.toLowerCase());
    }
  }
  return [...new Set(tokens.filter(Boolean))];
}

function profileMatchesLocation(profileLocation, { city, stateName, stateCode }) {
  const loc = String(profileLocation || '').toLowerCase().trim();
  if (!loc) return false; // no location on profile → drop when user scoped a region

  const stateTokens = locationMatchTokens({ city, stateName, stateCode });
  if (stateTokens.length) {
    // Require at least one state token (name or abbrev) in the free-text location
    const hasState = stateTokens.some((t) => {
      // word-boundary-ish: avoid matching "in" inside "indiana" wrongly for short codes
      if (t.length <= 2) {
        return new RegExp(`(^|[^a-z])${t}([^a-z]|$)`, 'i').test(loc);
      }
      return loc.includes(t);
    });
    if (!hasState) return false;
  }

  // Optional city tighten when city was selected
  if (city) {
    const cityLower = city.toLowerCase();
    // If profile has a clear different major city elsewhere, still OK as long as state matches.
    // Prefer profiles that mention the city when provided.
    if (loc.includes(cityLower)) return true;
    // State-only match is still acceptable when city is set (many GH users only put "Illinois")
    return stateTokens.length > 0;
  }

  return true;
}

async function scrapeGitHub(keyword, location, options = {}) {
  const { onProgress = () => {}, max = 50 } = options;
  const leads = [];
  const seen = new Set();
  const parsed = parseLocationParts(location);

  // Build GitHub search query — prefer state for regional scope
  const locForQuery =
    [parsed.city, parsed.stateName || parsed.stateCode].filter(Boolean).join(' ') ||
    'United States';
  const q = encodeURIComponent(`${keyword} location:"${locForQuery}" type:user`);

  onProgress({
    stage: 'github',
    message: `GitHub search: ${keyword} @ ${locForQuery}`,
    percent: 20,
  });

  let skippedOtherRegion = 0;

  try {
    // Fetch extra results so post-filter still yields enough in-state profiles
    const fetchCount = Math.min(100, Math.max(max * 3, max));
    const data = await ghFetch(`/search/users?q=${q}&per_page=${fetchCount}`);
    const items = data.items || [];
    onProgress({
      stage: 'github',
      message: `Found ${items.length} GitHub candidates (filtering to region)`,
      percent: 40,
      count: items.length,
    });

    for (let i = 0; i < items.length && leads.length < max; i++) {
      const item = items[i];
      if (seen.has(item.login)) continue;
      seen.add(item.login);

      let profile = item;
      try {
        profile = await ghFetch(`/users/${item.login}`);
      } catch (_) {}

      const profileLoc = profile.location || '';
      // When user selected a state/city, drop profiles outside that region
      if (parsed.stateName || parsed.stateCode || parsed.city) {
        if (!profileMatchesLocation(profileLoc, parsed)) {
          skippedOtherRegion++;
          continue;
        }
      }

      const name = profile.name || profile.login || item.login;
      leads.push({
        id: `gh:${profile.login || item.login}`,
        name,
        rating: '',
        reviews: String(profile.public_repos || 0),
        phone: '',
        email: profile.email || '',
        address: profileLoc || location || '',
        website: profile.blog || profile.html_url || item.html_url || '',
        keyword,
        location: profileLoc || location,
        source: 'github',
        extra: {
          login: profile.login,
          company: profile.company || '',
          bio: profile.bio || '',
          followers: profile.followers || 0,
          githubLocation: profileLoc,
        },
      });
    }
  } catch (err) {
    onProgress({ stage: 'github', message: `GitHub error: ${err.message}`, percent: 50 });
    console.error('[github]', err.message);
  }

  onProgress({
    stage: 'github',
    message: `GitHub done: ${leads.length} in-region leads` +
      (skippedOtherRegion ? ` (skipped ${skippedOtherRegion} outside region)` : ''),
    percent: 95,
  });

  return {
    leads,
    meta: {
      totalCards: leads.length,
      processedCount: leads.length,
      skippedCount: skippedOtherRegion,
      remaining: 0,
      source: 'github',
    },
  };
}

module.exports = { scrapeGitHub, parseLocationParts, profileMatchesLocation };
