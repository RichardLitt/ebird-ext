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

## Update Town, Region and County Sightings

[updateAreaSightings.js](updateAreaSightings.js) regenerates `data/townsightings.json`, `data/regionssightings.json` and `data/countyBarcharts.json`, the all-time species lists behind the website's `/towns`, `/regions` and `/counties` maps, from a statewide eBird Basic Dataset download (request `ebd_US-VT_*` at <https://ebird.org/data/download>). It reads the multi-gigabyte file a line at a time and takes a few minutes.

```sh
node scripts/updateAreaSightings.js ~/data/ebd_US-VT_smp_relAug-2026/ebd_US-VT_smp_relAug-2026.txt --dry-run
node scripts/updateAreaSightings.js ~/data/ebd_US-VT_smp_relAug-2026/ebd_US-VT_smp_relAug-2026.txt
```

It prints, for every town and region, how many species were added and which were removed compared with the current file. Escapees (exotic code X) are left out, as eBird leaves them out of counts; pass `--include-escapees` to keep them. eBird omits sensitive species (Spruce Grouse, Long-eared Owl) from the EBD, so the script keeps them wherever the current file already has them. Lists are stored as 2021 banding codes; if the script reports names without a code after an eBird taxonomy update, add them to `EBIRD_NAME_TO_CODE` in `bandingCodes.js`. `countyBarcharts.json` keeps the shape of the eBird county bar charts it was first made from, but holds only species names, not the weekly frequencies. It also writes `data/area_sightings_meta.json` with the EBD release (read from the file name, or pass `--release="Aug 2026"`), which the site's Towns, Bioregions and Counties pages show.

## Update the eBird Taxonomy

[updateTaxonomy.js](updateTaxonomy.js) rebuilds `taxonomies/eBird_Taxonomy_VT.json`, the species and hybrids eBird lists as reported in Vermont, in taxonomic order, with current eBird names. The site's maps use it for each area's "not seen" list. eBird updates its taxonomy each autumn; run this afterwards.

```sh
EBIRD_API_TOKEN=... node scripts/updateTaxonomy.js --dry-run
EBIRD_API_TOKEN=... node scripts/updateTaxonomy.js
```

It prints the taxa added and removed, and any Vermont species whose name doesn't survive the trip to a banding code and back. Add those to `EBIRD_NAME_TO_CODE` in `bandingCodes.js`, then rerun `updateAreaSightings.js` so the lists use the new names.

## Update Town Boundaries

[updateTownBoundaries.js](updateTownBoundaries.js) rebuilds `geojson/vt_towns.json` from the Vermont Center for Geographic Information's [town boundaries](https://geodata.vermont.gov/datasets/VCGI::vt-data-town-boundaries). It keeps this repo's town names where VCGI's differ (ST. ALBANS, not SAINT ALBANS) and rounds coordinates to 6 decimal places. It prints the towns added and removed; `--dry-run` only prints. After a change, rerun `updateAreaSightings.js` and Project 251.

