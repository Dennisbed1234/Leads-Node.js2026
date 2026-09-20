# US Leads + Public Email Finder (Node.js)

Multi-source **US business** lead tool with **public email** extraction.

## Architecture

| Phase | What | Similar to |
|-------|------|------------|
| 1. Discovery | Maps, OSM, Google/Bing SERP, GitHub | theHarvester / EmailFinder multi-engine |
| 2. Website crawl | Homepage + `/contact` `/about` + mailto | emailextractor contact traversal |
| 3. Normalize | Dedupe, junk filter, score domain match | Email-Harvester scoring |

## Sources

| Source | Browser? | Works on Vercel? |
|--------|----------|------------------|
| OpenStreetMap | No | Yes |
| GitHub | No | Yes |
| Website crawl (public pages) | No | Yes |
| Google Maps / Google / Bing / Yahoo / DDG / Social / Directories | Yes | No (timeout / Chromium limits) |

## Local Run

```bash
npm install
npm start
# → http://localhost:3000
```

`.env` example:

```
DB_DISABLED=true
GITHUB_TOKEN=ghp_xxx   # optional, higher GitHub rate limits
PORT=3000
```

## Vercel — why searches used to hang halfway

Vercel serverless functions have a hard time limit (≈10s Hobby / 60s Pro by default).  
Running Google Maps + several SERP modules + crawling hundreds of sites exceeds that, so the connection dropped mid-progress.

### What we changed so searches **always finish**

1. **Serverless defaults** = only `osm` + `github` (no Playwright).
2. **Hard time budget** (~45s) — remaining modules / crawl are skipped instead of hanging.
3. **Website crawl** capped (≈40 sites, concurrency 3) on Vercel.
4. **Multi-city mode disabled** on serverless.
5. **SSE heartbeats** so the UI does not show a dead “connection error”.
6. Browser modules are still available on a long-running host (Railway, Render, Fly, VPS).

### Deploy

1. Redeploy from GitHub after these commits.
2. Env (also set in `vercel.json`):
   - `DB_DISABLED=true`
   - `SCRAPE_TIME_BUDGET_MS=45000`
3. Pick a **specific city** in the UI (e.g. Chicago, IL).
4. Start a search — you should see progress for OSM → GitHub → website crawl → **Done** within ~30–50s.

### Need more leads / Maps / Google SERP?

Run the same repo on a **persistent** host:

```bash
npm install
npx playwright install chromium
npm start
```

Or set `FORCE_BROWSER_MODULES=1` on a host with enough time/memory (not recommended on Vercel Hobby).

## Scope

Collects **publicly posted** business contact emails (mailto links, contact pages, public search snippets, OSM tags, public GitHub profiles).  
Does **not** access private inboxes, bypass logins/CAPTCHAs, or use data-breach / leak databases.

Use responsibly and respect site terms and applicable law.
