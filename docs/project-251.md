# Project 251

Project 251 asks Vermont birders to submit a complete checklist in every one of
the state's towns and cities (256 with the gores and grants) within one calendar year.
The [/251 map](https://birdinginvermont.com/251) shows which towns have been
covered and how many species each has.

Until 2022 the map was fed by checklists people shared with the `vermont251`
eBird account, plus a one-time export of everyone's data merged in by hand in
June 2022. This document describes running it from the eBird Basic Dataset
(EBD) instead. The EBD has everyone's checklists, so nobody has to share with
an account and nobody gets missed, and it can be refreshed every few months.

## What counts

A checklist counts for its town if it is:

- in Vermont, in the project year;
- complete (all species reported);
- at least 5 minutes long, which also rules out incidental checklists, as
  they have no duration.

Its town is the town that contains the checklist's location. Shared checklists
count once.

## What works now

`vt251()` and the `251` CLI command take a year and read an EBD file:

```sh
node cli.js 251 --input=path/to/ebd_US-VT_2027.txt --year=2027
```

This writes `data/vt_town_counts.json`: every town, with the banding codes of
the species on its qualifying checklists. Beside it goes
`data/vt_town_counts_meta.json`, `{ year, release, updated }`, which the site
uses to say what the map covers. The release ("Aug 2026") comes from the EBD
file name; pass `--release="Aug 2026"` if the file was renamed. Use
`--output=<file>` to write somewhere else.

Tested on January–July 2026 (933,603 rows, 343 MB): 21 seconds, about 2 GB of
memory. 252 of 255 towns had a qualifying checklist; the three missing were
Holland, Lemington and Warner's Grant.

## Before the next season

### Data (ebird-ext)

- [x] **Renamed species.** `EBIRD_NAME_TO_CODE` is in `bandingCodes.js`, so
      birds eBird renamed in 2025 get their 2021 banding codes, and display
      under their current names.
- [x] **Data date.** `vt251` writes `vt_town_counts_meta.json`.
- [x] The same kind of date file for `updateAreaSightings.js`
      (`area_sightings_meta.json`), so the towns, regions and counties pages
      say which release they use.

### Website (birdinginvermont.com)

Done for 2026: Project 251 is back in the menu, the page explains the EBD
approach and credits the data, the "as of" line comes from
`vt_town_counts_meta.json`, and the panel beside the map lists the towns with
no checklists, the 15 with the fewest species and the 5 with the most. The
contributors list is gone (the EBD identifies observers only by ID), and so
are green (low-carbon) towns.

## Quarterly update

About half an hour every three months, e.g. after the April, July, October and
January EBD releases. The EBD comes out monthly, so the map runs a few weeks
behind eBird.

1. Request a Vermont EBD download limited to the project year's dates
   (https://ebird.org/data/download). A date-limited download is a few hundred
   MB; the all-time file is several GB.
2. Run `node cli.js 251 --input=<file> --year=<year>` in ebird-ext.
3. Check the result: the number of towns covered should only go up between
   updates, and the empty towns should look plausible.
4. Commit `data/vt_town_counts.json` in ebird-ext and merge it.
5. In the site, run `npm run update-ebird-ext`, build, and merge the PR.
6. Post the new count and the towns still needed, wherever the project is
   announced.

## Limits

- **Lag.** Checklists appear in the EBD about a month after they're submitted,
  and only at each update. A birder filling a town in December won't see it on
  the map until the January or February release.
- **Review.** The EBD only has approved records. A checklist still counts
  while one of its rarities is pending review; only that species is missing.
- **Sensitive species.** eBird leaves some species out of the EBD (Spruce
  Grouse, Long-eared Owl, …). That doesn't affect which towns are covered;
  their species lists are slightly short.
- **Escapees.** `towns()` keeps birds eBird marks as escapees; the town,
  region and county maps leave them out. That doesn't matter for coverage,
  but the species counts aren't quite comparable.
- **Memory.** The whole year is read into memory. A full year should still fit
  comfortably; if it ever doesn't, the streaming approach in
  `scripts/updateAreaSightings.js` is the fix.
