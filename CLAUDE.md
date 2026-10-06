# CLAUDE.md

Guidance for working in ebird-ext.

## Project

Node tools for eBird data, mostly Vermont, plus the data behind
[birdinginvermont.com](https://birdinginvermont.com). The site
(github.com/RichardLitt/birdinginvermont.com) includes this repo as the git
submodule `src/ebird-ext` and imports `index.js`, `bandingCodes.js` and files in
`data/` and `geojson/` directly into its browser bundle. The README documents
every CLI command.

## Commands

```bash
npm test          # node --test, all of test/
npm run test:spec # same, readable reporter
npm run lint      # neostandard; scripts/ and shimeBirdData/ are not linted
node cli.js --help
```

CI runs lint, tests and `node cli.js --help` on Node 22 and 24.

## Layout

- `index.js`: the analysis functions (towns, counties, regions, rare, vt251, …) and `getData`, which reads MyEBirdData.csv, EBD files or parsed rows.
- `cli.js`: the CLI. It only parses flags, calls the library and prints, using `reports.js`.
- `reports.js`: turns what the library returns into the lines the CLI prints.
- `io.js`: all file reading and writing. The library loads it with `import('./io.js')` only when given a file path or an output file, so the site's bundle never runs it.
- `filters.js`: date, location, completeness and duration filters; `getPoint` (which town or region a point is in).
- `spuh.js`: `removeSpuh` and `removeSpuhFromCounties`, without the boundaries `filters.js` imports, so the site's maps can use them cheaply.
- `ebd.js`: EBD support: renames EBD columns to MyEBirdData names, collapses shared checklists, `releaseFromFileName`.
- `bandingCodes.js`: common name ↔ four-letter banding code, from `data/ibpAlphaCodes2021.json`, plus `EBIRD_NAME_TO_CODE` for birds eBird renamed after 2021.
- `hotspots.js`, `helpers.js`, `appearsDuringExpectedDates.js`, `taxonomicSort.js`, `readHistogram.js`: what they say.
- `montpelier.js`, `norwich.js`: standalone local tools; both stay.
- `scripts/`: data refresh scripts (see `scripts/README.md`).
- `shimeBirdData/`: old one-off scripts. `readEBirdDb.js` and `joinTownJson.js` are redundant (their headers say so) but kept for reference.
- `docs/project-251.md`: running Project 251 from the EBD.
- `HARDENING_PLAN.md`: the maintainer's working plan. Untracked on purpose; don't commit it.

## Data files and how they're refreshed

| File | Refreshed by | Used by the site |
|---|---|---|
| `data/townsightings.json`, `regionssightings.json`, `countyBarcharts.json`, `area_sightings_meta.json` | `node scripts/updateAreaSightings.js <statewide EBD>` | /towns, /regions, /counties |
| `data/grid_sightings.json` (species per ~2 km square, as bitmaps) | `node scripts/updateAreaSightings.js <statewide EBD>` | /radius |
| `data/vt_town_counts.json`, `vt_town_counts_meta.json` | `node cli.js 251 --input=<EBD for the year> --year=<year>` | /251 |
| `data/vermont_records.json` | `scripts/updateVermontRecords.js` (VCE's VBRC list PDF) | /vbrc-checker |
| `data/hotspots.json`, `hotspots.csv`, `hotspotsList.md`, `novisits-hotspots.json` | `scripts/updateHotspots.sh` (needs `EBIRD_API_TOKEN`) | /hotspots |
| `data/hotspotsDates.json` | `node montpelier.js hotspotDates <EBD sampling file>` | no |
| `taxonomies/eBird_Taxonomy_VT.json` | `scripts/updateTaxonomy.js` (eBird API; after eBird's autumn taxonomy update) | "not seen" lists on the maps |
| `geojson/vt_towns.json` | `scripts/updateTownBoundaries.js` (VCGI's town boundaries) | town lookups (on upload) |
| `geojson/display/*.json` | `scripts/simplifyForDisplay.js`, after any boundary change | every map (drawing only) |

The data is refreshed about quarterly, from an EBD download. After an
ebird-ext merge, Dependabot opens a site PR that moves the submodule pointer.

## Conventions

- ESM throughout. JSON imports use `with { type: 'json' }`; the site's Craco
  config supports that syntax.
- Library code returns data and doesn't print (diagnostics behind `--verbose`
  are the exception) or import `node:fs`: file access goes through `io.js`,
  text output through `reports.js` and `cli.js`. The site bundles the library
  for the browser, where Node built-ins are only empty fallbacks.
- Tests use `node:test` and `node:assert/strict`. Fixtures are made up: never
  commit a real `MyEBirdData.csv` (not even renamed) or real EBD rows. The EBD
  terms forbid republishing the data in its original form; build fake
  fixtures, or write them at test time.
- EBD files are tab-separated and unquoted (comments can contain stray
  quotes): split lines on tabs. Statewide files are gigabytes; stream them a
  line at a time, as `scripts/updateAreaSightings.js` does.
- No co-author lines or Claude/Anthropic attribution in commits or PRs.

## Decisions already made

Don't re-propose these.

- Keep `norwich.js` and the CLI commands `quad`, `issr`, `countTheBirds`,
  `withinDistance`, `getLastDate`.
- No taxonomy-drift tooling. When eBird renames species, add them to
  `EBIRD_NAME_TO_CODE`, and rerun `scripts/updateVermontRecords.js` when VCE
  publishes a new list.
- The area lists leave out escapees (exotic code X). eBird omits sensitive
  species from the EBD, so `SENSITIVE_CODES` are carried forward from the
  current files.
- Town, region and Project 251 lists store 2021 banding codes; county lists
  store names. Every list is in the order each species was first seen in the
  area, oldest first: the site numbers them that way. `codeToCommonName` gives codes their current eBird name, so
  everything matches `taxonomies/eBird_Taxonomy_VT.json`.
- Town names keep this repo's style (ST. ALBANS, RUTLAND), not VCGI's
  (SAINT ALBANS, RUTLAND TOWN). The gores and grant keep their apostrophes
  (AVERY'S GORE, BUEL'S GORE, WARREN'S GORE, WARNER'S GRANT), which VCGI
  leaves off BUELS GORE.
- Project 251 runs from EBD downloads, not a shared eBird account.
- No JSDoc.

## Known traps

- Object keys `'10'`, `'11'`, `'12'` count as integers and sort before
  `'01'`–`'09'`. Iterate months in a fixed list, not `Object.keys`.
- date-fns `getWeek()` (Sunday-start weeks, as moment's were) puts late-December days in week 1 of the next year.
- npm 11 writes lockfiles that npm 10's `npm ci` rejects. That matters in the
  site, which pins Node 22 and npm 10.
