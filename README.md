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
npm install          # also runs: npx playwright install chromium (postinstall)
# If you still see "Executable doesn't exist":
npm run playwright:install
# or manually:
npx playwright install chromium

echo 'DB_DISABLED=true' >> .env
# optional
echo 'GITHUB_TOKEN=ghp_xxx' >> .env
npm start
# or: node src/server.js
```

### Troubleshooting: Playwright "Executable doesn't exist"

This error means the Chromium binary was not downloaded. Run:

```bash
npx playwright install chromium
```

On some hosts (AWS Lambda, Vercel, certain sandboxes) the default cache path is not writable or browsers are stripped. Options:

1. Run `npx playwright install chromium` during the **build** step so binaries are included in the image/artifact.
2. Set `PLAYWRIGHT_BROWSERS_PATH` to a writable directory (e.g. `/tmp/ms-playwright`) and install there at startup or build time.
3. For pure serverless, consider a Lambda-compatible Chromium package and set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to its binary.

## Scope

Collects **publicly posted** business contact emails (mailto, contact pages, search snippets).  
Does **not** access private inboxes, bypass logins/CAPTCHAs, or query breach databases.

Use responsibly and respect site terms and applicable law.
