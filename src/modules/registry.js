/**
 * Module registry — loads all discovery modules (recon-ng / theHarvester style).
 */

const maps = require('../scraper/engine');
const { scrapeGitHub } = require('../scraper/github');
const { scrapeGoogleWeb } = require('../scraper/googleWeb');
const { scrapeBingWeb } = require('../scraper/bingWeb');
const { scrapeOSM } = require('../scraper/osm');
const { scrapeSocial } = require('../scraper/social');
const { scrapeDirectories } = require('../scraper/directories');
const { scrapeDuckDuckGo } = require('../scraper/duckduckgo');
const { scrapeYahooWeb } = require('../scraper/yahooWeb');
const { scrapeEmailDorks } = require('../scraper/emailDorks');

const isServerless =
  !!process.env.VERCEL ||
  !!process.env.AWS_LAMBDA_FUNCTION_NAME ||
  !!process.env.AWS_EXECUTION_ENV;

const MODULES = {
  maps: {
    id: 'maps',
    label: 'Google Maps',
    description: 'Local business listings (public)',
    needsBrowser: true,
    run: (keyword, location, opts) => maps(keyword, location, opts),
  },
  osm: {
    id: 'osm',
    label: 'OpenStreetMap',
    description: 'Public OSM POIs / Nominatim',
    needsBrowser: false,
    run: (keyword, location, opts) => scrapeOSM(keyword, location, opts),
  },
  google_web: {
    id: 'google_web',
    label: 'Google Search',
    description: 'SERP multi-dork (public pages)',
    needsBrowser: true,
    run: (keyword, location, opts) => scrapeGoogleWeb(keyword, location, opts),
  },
  bing: {
    id: 'bing',
    label: 'Bing Search',
    description: 'Second search engine SERP',
    needsBrowser: true,
    run: (keyword, location, opts) => scrapeBingWeb(keyword, location, opts),
  },
  yahoo: {
    id: 'yahoo',
    label: 'Yahoo Search',
    description: 'Yahoo SERP public results',
    needsBrowser: true,
    run: (keyword, location, opts) => scrapeYahooWeb(keyword, location, opts),
  },
  duckduckgo: {
    id: 'duckduckgo',
    label: 'DuckDuckGo',
    description: 'Extra free SERP',
    needsBrowser: true,
    run: (keyword, location, opts) => scrapeDuckDuckGo(keyword, location, opts),
  },
  email_dorks: {
    id: 'email_dorks',
    label: 'Email dorks',
    description: 'US-scoped public email/contact dorks',
    needsBrowser: true,
    run: (keyword, location, opts) => scrapeEmailDorks(keyword, location, opts),
  },
  social: {
    id: 'social',
    label: 'Social (public SERP)',
    description: 'FB / LinkedIn company / IG via Google site:',
    needsBrowser: true,
    run: (keyword, location, opts) => scrapeSocial(keyword, location, opts),
  },
  directories: {
    id: 'directories',
    label: 'Directories',
    description: 'Yelp, YellowPages, BBB, Manta, Angi…',
    needsBrowser: true,
    run: (keyword, location, opts) => scrapeDirectories(keyword, location, opts),
  },
  github: {
    id: 'github',
    label: 'GitHub',
    description: 'Public GitHub profiles / search API',
    needsBrowser: false,
    run: (keyword, location, opts) => scrapeGitHub(keyword, location, opts),
  },
};

/** Full set — local / long-running hosts only */
const DEFAULT_MODULES = [
  'maps',
  'osm',
  'google_web',
  'bing',
  'yahoo',
  'duckduckgo',
  'email_dorks',
  'social',
  'directories',
  'github',
];

/**
 * Vercel / Lambda safe defaults: API-only sources (no Chromium).
 * Website crawl (fetch) still runs after discovery for public contact emails.
 */
const SERVERLESS_DEFAULT_MODULES = ['osm', 'github'];

function listModules() {
  return Object.values(MODULES).map(({ id, label, description, needsBrowser }) => ({
    id,
    label,
    description,
    needsBrowser: !!needsBrowser,
  }));
}

function resolveModules(ids) {
  const fallback = isServerless ? SERVERLESS_DEFAULT_MODULES : DEFAULT_MODULES;
  const selected = (Array.isArray(ids) && ids.length ? ids : fallback)
    .map((s) => String(s).toLowerCase().trim())
    .filter((id) => MODULES[id]);

  // On serverless, drop browser modules unless explicitly forced
  const forceBrowser = process.env.FORCE_BROWSER_MODULES === '1';
  const filtered =
    isServerless && !forceBrowser
      ? selected.filter((id) => !MODULES[id].needsBrowser)
      : selected;

  // Always keep at least OSM if everything was filtered out
  if (!filtered.length) return [MODULES.osm];
  return filtered.map((id) => MODULES[id]);
}

module.exports = {
  MODULES,
  DEFAULT_MODULES,
  SERVERLESS_DEFAULT_MODULES,
  listModules,
  resolveModules,
  isServerless,
};
