/**
 * Module registry — loads all discovery modules (recon-ng / theHarvester style).
 * Enable/disable via sources array in the API.
 */

const maps = require('../scraper/engine');
const { scrapeGitHub } = require('../scraper/github');
const { scrapeGoogleWeb } = require('../scraper/googleWeb');
const { scrapeBingWeb } = require('../scraper/bingWeb');
const { scrapeOSM } = require('../scraper/osm');
const { scrapeSocial } = require('../scraper/social');
const { scrapeDirectories } = require('../scraper/directories');
const { scrapeDuckDuckGo } = require('../scraper/duckduckgo');

/** @type {Record<string, { id: string, label: string, description: string, run: Function }>} */
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
  social: {
    id: 'social',
    label: 'Social (public SERP)',
    description: 'FB / LinkedIn company / IG via Google site: (no login)',
    needsBrowser: true,
    run: (keyword, location, opts) => scrapeSocial(keyword, location, opts),
  },
  directories: {
    id: 'directories',
    label: 'Directories',
    description: 'Yelp, YellowPages, BBB, Manta, Angi… via public search',
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
  duckduckgo: {
    id: 'duckduckgo',
    label: 'DuckDuckGo',
    description: 'Extra free SERP (theHarvester-style)',
    needsBrowser: true,
    run: (keyword, location, opts) => scrapeDuckDuckGo(keyword, location, opts),
  },
};

const DEFAULT_MODULES = ['maps', 'osm', 'google_web', 'bing', 'duckduckgo', 'social', 'directories'];

function listModules() {
  return Object.values(MODULES).map(({ id, label, description, needsBrowser }) => ({
    id,
    label,
    description,
    needsBrowser: !!needsBrowser,
  }));
}

function resolveModules(ids) {
  const selected = (Array.isArray(ids) && ids.length ? ids : DEFAULT_MODULES)
    .map((s) => String(s).toLowerCase().trim())
    .filter((id) => MODULES[id]);
  return selected.map((id) => MODULES[id]);
}

module.exports = { MODULES, DEFAULT_MODULES, listModules, resolveModules };
