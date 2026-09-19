# US Leads Generator (Node.js)

Multi-source **US-focused** lead scraper. India/Nepal geo filters were removed.

## Sources

| Source | What it pulls |
|--------|----------------|
| **Google Maps** | Local businesses (Playwright) |
| **OpenStreetMap** | Public POIs via Nominatim + Overpass |
| **GitHub** | Public users/orgs by keyword + location |
| **Google Search** | SERP titles, phones, emails from snippets |

## Quick start

```bash
npm install
npx playwright install chromium
# optional: higher GitHub rate limit
# echo 'GITHUB_TOKEN=ghp_xxx' >> .env
# optional: skip MySQL
# echo 'DB_DISABLED=true' >> .env
node src/server.js
```

Open http://localhost:3000 — United States is selected by default.

## API

- `GET /api/countries` — US (+ CA, GB, AU)
- `GET /api/sources` — available scrapers
- `POST /api/search` — `{ category, country, state, city, area?, sources?: string[] }`
- `GET /api/search/stream` — SSE progress + same params

## Notes

- GitHub unauthenticated API is rate-limited (~60/hr). Set `GITHUB_TOKEN`.
- OSM asks for polite User-Agent usage; do not hammer Overpass.
- Google Maps/SERP scraping may break when Google changes HTML or blocks automation.
- Use only for legitimate B2B research on public business data.
