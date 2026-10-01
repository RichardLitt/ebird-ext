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
