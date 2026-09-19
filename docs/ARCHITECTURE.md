# OSINT-inspired architecture

This project follows the **modular discovery** pattern used by popular open-source OSINT tools:

| Tool | Stars (approx) | Pattern we adopt |
|------|----------------|------------------|
| [theHarvester](https://github.com/laramies/theHarvester) | 17k+ | One file per source under `discovery/`; shared runner |
| [Recon-ng](https://github.com/lanmaster53/recon-ng) | classic | Load modules by name; workspace-style results |
| [SpiderFoot](https://github.com/smicallef/spiderfoot) | 22k+ | Many modules, single scan orchestration |
| [Sherlock](https://github.com/sherlock-project/sherlock) | 92k+ | Site list + parallel checks (username OSINT — different use case) |

## Layout

```
src/
  modules/
    base.js          # Module contract
    registry.js      # Registers all sources
  scraper/           # Implementation of each source
    engine.js        # Maps
    googleWeb.js
    bingWeb.js
    duckduckgo.js    # Extra free SERP (theHarvester-style)
    directories.js
    social.js
    osm.js
    github.js
    websiteCrawl.js  # Enrichment (contact pages)
    emailUtils.js
    orchestrator.js  # Runs selected modules + enrich
```

## Scope (important)

**In scope:** public US **business** listings and contact emails published on company sites and directories.

**Out of scope for this repo (even though some OSINT tools do them):**
- Breach / leak database dumps
- LinkedIn personal profile scraping
- Mass personal Gmail/Hotmail harvesting
- Unofficial Voyager/session LinkedIn APIs

Those belong in specialized tools (theHarvester for domain email, holehe for email registration checks, HIBP for breach lookup) under their own terms and legal constraints.

## Adding a module

1. Implement `scrapeX(keyword, location, options)` → `{ leads, meta }`
2. Register in `src/modules/registry.js`
3. Add checkbox in `public/index.html` sources grid
