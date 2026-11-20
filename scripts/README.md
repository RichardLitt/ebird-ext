# Scripts

## Update Hotspots

[updateHotspots.sh](updateHotspots.sh) shows you the updated hotspots in Vermont. It only shows the titles of those hotspots, which is no longer necessary for Ken Ostermiller, as he has his own website set up. This script can probably be deleted.

## Update Vermont Records

[updateVermontRecords.js](updateVermontRecords.js) regenerates `data/vermont_records.json`, the Vermont Bird Records Committee checklist that `rare()` checks sightings against, from the state list PDF the Vermont Center for Ecostudies publishes at <https://vtecostudies.org/vbrc/>. It needs `pdftotext` from poppler (`brew install poppler`).

```sh
curl -L -o /tmp/VTStateList.pdf <url of the current list PDF>
curl -L -o /tmp/ebird_taxonomy.csv 'https://api.ebird.org/v2/ref/taxonomy/ebird?fmt=csv&cat=species'
node scripts/updateVermontRecords.js /tmp/VTStateList.pdf --taxonomy /tmp/ebird_taxonomy.csv --dry-run
node scripts/updateVermontRecords.js /tmp/VTStateList.pdf --taxonomy /tmp/ebird_taxonomy.csv
```

It prints the species added, removed, renamed and changed compared with the current file; check those against the PDF before committing. The VBRC list uses AOS scientific names, but `rare()` matches eBird exports by scientific name, so the script swaps in eBird's name where the two differ (the `EBIRD_SCIENTIFIC_NAMES` map in the script; pass `--aos-names` to skip it). `--taxonomy` warns about any name eBird doesn't know, which is how to find new entries for that map. Then run `npm test`.

## Compare Vermont Records Lists
[compareVermontRecords.js](compareVermontRecords.js) shows what a new VBRC list changes in practice: the sightings in an EBD file that the new list flags and the old one didn't, and the reverse. Both lists go through `rare()`, the check behind `cli.js rare` and the site's VBRC checker. A list is a `vermont_records.json` file or a git ref in this repo, such as the commit before the list update. The EBD file is read once, so a statewide download is fine.

```sh
node scripts/compareVermontRecords.js ebd_US-VT_relNov-2026.txt --old 772d504 --since 2022-01-01
node scripts/compareVermontRecords.js ebd_US-VT_relNov-2026.txt --old 772d504 --since 2022-01-01 --details --csv /tmp/vbrc-changes.csv
```

It prints a count per species and reason, with the date range; `--details` adds a line per sighting with its checklist link, and `--csv` writes every changed sighting to a file. `--new` (default: the current `data/vermont_records.json`) and `--county` are also available. A species whose scientific name changed between the lists is matched under either name, so an EBD from before eBird's taxonomy update works too.

## Update Town, Region and County Sightings

[updateAreaSightings.js](updateAreaSightings.js) regenerates `data/townsightings.json`, `data/regionssightings.json` and `data/countysightings.json`, the all-time species lists behind the website's `/towns`, `/regions` and `/counties` maps, from a statewide eBird Basic Dataset download (request `ebd_US-VT_*` at <https://ebird.org/data/download>). It reads the multi-gigabyte file a line at a time and takes a few minutes.

```sh
node scripts/updateAreaSightings.js ~/data/ebd_US-VT_smp_relAug-2026/ebd_US-VT_smp_relAug-2026.txt --dry-run
node scripts/updateAreaSightings.js ~/data/ebd_US-VT_smp_relAug-2026/ebd_US-VT_smp_relAug-2026.txt
```

Between full rebuilds, `--merge` adds a smaller download's species to the current files instead of replacing them, so you can request only the months since the last update (say, `ebd_US-VT_202501_202612_smp_relSep-2026`):

```sh
node scripts/updateAreaSightings.js ~/data/ebd_US-VT_202501_202612_unv_smp_relSep-2026/ebd_US-VT_202501_202612_unv_smp_relSep-2026.txt --merge --dry-run
node scripts/updateAreaSightings.js ~/data/ebd_US-VT_202501_202612_unv_smp_relSep-2026/ebd_US-VT_202501_202612_unv_smp_relSep-2026.txt --merge
```

New species go after those already in each list, and into the grid squares. A merge never removes a species, even one whose only record eBird has since rejected, so rebuild from an all-time download now and then. Without `--merge`, the download must be all-time: anything not in it is removed.

It prints, for every town and region, how many species were added and which were removed compared with the current file. Escapees (exotic code X) are left out, as eBird leaves them out of counts; pass `--include-escapees` to keep them. eBird omits sensitive species (Spruce Grouse, Long-eared Owl) from the EBD, so the script keeps them wherever the current file already has them. Lists are stored as 2021 banding codes; if the script reports names without a code after an eBird taxonomy update, add them to `EBIRD_NAME_TO_CODE` in `bandingCodes.js`. It also writes `data/grid_sightings.json`, the species recorded in each square of a grid about 2 km across (stored as one bitmap per square over a single species list, about 170 kB gzipped), for the site's 5- and 10-mile radius page; and `data/area_sightings_meta.json` with the EBD release (read from the file name, or pass `--release="Aug 2026"`), which the site's Towns, Bioregions and Counties pages show. Last, it runs `updateSiteCodes.js` (below).

## Update the Site's Banding Codes

[updateSiteCodes.js](updateSiteCodes.js) writes `data/siteBandingCodes.json`: the entries of `data/ibpAlphaCodes2021.json` for every code in the town, region, county, Project 251 and grid lists and every species in `taxonomies/eBird_Taxonomy_VT.json`, with only the code, common name and scientific name. The site's build uses it in place of the full table, which covers every North American bird (330 kB, against about 36 kB). `updateAreaSightings.js` runs it; run it yourself after Project 251 or `updateTaxonomy.js`. `npm test` fails if it is out of date.

```sh
node scripts/updateSiteCodes.js
```

## Update the eBird Taxonomy

[updateTaxonomy.js](updateTaxonomy.js) rebuilds `taxonomies/eBird_Taxonomy_VT.json`, the species and hybrids eBird lists as reported in Vermont, in taxonomic order, with current eBird names. The site's maps use it for each area's "not seen" list. eBird updates its taxonomy each autumn; run this afterwards.

```sh
EBIRD_API_TOKEN=... node scripts/updateTaxonomy.js --dry-run
EBIRD_API_TOKEN=... node scripts/updateTaxonomy.js
```

It prints the taxa added and removed, and any Vermont species whose name doesn't survive the trip to a banding code and back. Add those to `EBIRD_NAME_TO_CODE` in `bandingCodes.js`, then rerun `updateAreaSightings.js` so the lists use the new names, or `updateSiteCodes.js` if only the taxonomy changed.

## Update Town Boundaries

[updateTownBoundaries.js](updateTownBoundaries.js) rebuilds `geojson/vt_towns.json` from the Vermont Center for Geographic Information's [town boundaries](https://geodata.vermont.gov/datasets/VCGI::vt-data-town-boundaries). It keeps this repo's town names where VCGI's differ (ST. ALBANS, not SAINT ALBANS) and rounds coordinates to 6 decimal places. It prints the towns added and removed; `--dry-run` only prints. After a change, run `simplifyForDisplay.js` and `updateTownInfo.js`, then rerun `updateAreaSightings.js` and Project 251.

## Update the Town Table

[updateTownInfo.js](updateTownInfo.js) writes `data/vt_town_info.json`: each town's county and the biophysical region holding a point inside the town. `isSpeciesSightingRare` (in `rarity.js`) reads it, so the site's single-sighting VBRC check doesn't load the town and region boundaries, over 1 MB. Run it after any change to `geojson/vt_towns.json` or the region boundaries; `npm test` fails if it is out of date.

```sh
node scripts/updateTownInfo.js
```

## Simplify Boundaries for Display

[simplifyForDisplay.js](simplifyForDisplay.js) writes simplified copies of the four boundary files to `geojson/display/`, which the site draws. The files in `geojson/` stay precise, because they decide which town and region a checklist is in. It uses [mapshaper](https://github.com/mbloch/mapshaper) through `npx`, keeping 10% of the vertices (about 585 kB → 72 kB gzipped, with no visible difference at the site's map size). Run it after any change to `geojson/`.

