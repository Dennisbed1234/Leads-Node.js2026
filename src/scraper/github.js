const GITHUB_API = 'https://api.github.com';

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
    throw new Error(`GitHub rate limited${reset ? ` until ${new Date(Number(reset) * 1000).toISOString()}` : ''}`);
  }
  if (!res.ok) throw new Error(`GitHub API ${res.status}`);
  return res.json();
}

async function scrapeGitHub(keyword, location, options = {}) {
  const { onProgress = () => {}, max = 50 } = options;
  const leads = [];
  const seen = new Set();
  const locParts = String(location || '').split(',').map((s) => s.trim()).filter(Boolean);
  const locQuery = locParts.slice(0, 2).join(' ') || 'United States';
  const q = encodeURIComponent(`${keyword} location:"${locQuery}" type:user`);
  onProgress({ stage: 'github', message: `GitHub search: ${keyword} @ ${locQuery}`, percent: 20 });

  try {
    const data = await ghFetch(`/search/users?q=${q}&per_page=${Math.min(max, 100)}`);
    const items = data.items || [];
    onProgress({ stage: 'github', message: `Found ${items.length} GitHub profiles`, percent: 40, count: items.length });

    for (let i = 0; i < items.length && leads.length < max; i++) {
      const item = items[i];
      if (seen.has(item.login)) continue;
      seen.add(item.login);
      let profile = item;
      try {
        profile = await ghFetch(`/users/${item.login}`);
      } catch (_) {}
      const name = profile.name || profile.login || item.login;
      leads.push({
        id: `gh:${profile.login || item.login}`,
        name,
        rating: '',
        reviews: String(profile.public_repos || 0),
        phone: '',
        email: profile.email || '',
        address: profile.location || location || '',
        website: profile.blog || profile.html_url || item.html_url || '',
        keyword,
        location: profile.location || location,
        source: 'github',
        extra: {
          login: profile.login,
          company: profile.company || '',
          bio: profile.bio || '',
          followers: profile.followers || 0,
        },
      });
    }
  } catch (err) {
    onProgress({ stage: 'github', message: `GitHub error: ${err.message}`, percent: 50 });
    console.error('[github]', err.message);
  }

  onProgress({ stage: 'github', message: `GitHub done: ${leads.length} leads`, percent: 95 });
  return {
    leads,
    meta: { totalCards: leads.length, processedCount: leads.length, skippedCount: 0, remaining: 0, source: 'github' },
  };
}

module.exports = { scrapeGitHub };
