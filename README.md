# US Leads + Public Email Finder (Node.js)

Multi-source **US business** lead tool with **public email** extraction.

## Architecture (inspired by common OSS patterns)

| Phase | What | Similar to |
|-------|------|------------|
| 1. Discovery | Maps, OSM, Google/Bing SERP, GitHub | theHarvester / EmailFinder multi-engine |
| 2. Website crawl | Homepage + `/contact` `/about` + mailto | emailextractor contact traversal |
| 3. Normalize | Dedupe, junk filter, score domain match | Email-Harvester scoring |

## Sources

- **Google Maps** — local businesses (phone, site, address)
- **OpenStreetMap** — free POIs + `contact:email` when tagged
- **Google Search** — multi-dork queries for contact emails in snippets
- **Bing Search** — second SERP for more coverage
- **GitHub** — public profiles (optional `GITHUB_TOKEN`)
- **Website crawl** (always on after discovery) — fetches public pages only

## Run

```bash
npm install
npx playwright install chromium
echo 'DB_DISABLED=true' >> .env
# optional
echo 'GITHUB_TOKEN=ghp_xxx' >> .env
node src/server.js
```

## Scope

Collects **publicly posted** business contact emails (mailto, contact pages, search snippets).  
Does **not** access private inboxes, bypass logins/CAPTCHAs, or query breach databases.

Use responsibly and respect site terms and applicable law.
