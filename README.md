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

## Local Run

```bash
npm install
# postinstall installs Chromium automatically (skipped on Vercel)
npm start
# → http://localhost:3000 (or PORT from .env)
```

If you still see "Executable doesn't exist":

```bash
npx playwright install chromium
# or
npm run playwright:install
```

Create a `.env` (never commit it):

```
DB_DISABLED=true
# optional
GITHUB_TOKEN=ghp_xxx
PORT=3000
```

## Vercel / Serverless Deployment

**Important:** Full multi-source scrapes + Playwright + website crawl of hundreds of sites exceed typical serverless timeouts.  
This project is tuned for Vercel but still has limits (maxDuration 60s on Pro, lower on Hobby).

### What was fixed for Vercel

1. Switched to `playwright-core` + `@sparticuz/chromium` (serverless-compatible Chromium binary).
2. Browser launch auto-detects Vercel/Lambda and uses the Sparticuz binary.
3. Website crawl automatically lowers concurrency & max leads on serverless to reduce timeouts.
4. Better error isolation so one failed browser launch or bad site does not kill the whole job.
5. Proper `.gitignore` (node_modules and .env are no longer tracked).

### Deploy steps

1. Push this repo to GitHub (without `node_modules`).
2. Import the project in Vercel.
3. Set Environment Variables if needed:
   - `DB_DISABLED=true`
   - `PLAYWRIGHT_USE_SPARTICUZ=1` (already set in vercel.json)
4. Deploy. The build will **not** run `playwright install` (skipped automatically).

### Recommended usage on Vercel

- Select a specific city (avoid multi-city mode which is heavier).
- Prefer lighter sources if you hit timeouts (disable Google/Bing if needed).
- Expect the "Website email crawl" stage to process fewer sites than on a long-running server.
- For heavy production use, prefer a long-running host (Railway, Render, Fly.io, DigitalOcean App Platform, etc.).

### Troubleshooting Playwright on Vercel

If you still see browser launch errors:

- Confirm `@sparticuz/chromium` and `playwright-core` are in `dependencies`.
- Do **not** run `npx playwright install` in the Vercel build command.
- Increase `maxDuration` in `vercel.json` if you are on a Pro plan (up to 300s).

## Scope

Collects **publicly posted** business contact emails (mailto, contact pages, search snippets).  
Does **not** access private inboxes, bypass logins/CAPTCHAs, or query breach databases.

Use responsibly and respect site terms and applicable law.
