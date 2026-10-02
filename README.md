# ebird-ext

Tools for exploring eBird data, mostly for Vermont: your biggest days and years, species by town, county and biophysical region, records to report to the Vermont Bird Records Committee (VBRC), hotspots you haven't birded, and more. It also holds the data and code behind [birdinginvermont.com](https://birdinginvermont.com), which imports this repository as a git submodule.

## Install

Requires Node 22 or later.

```sh
git clone https://github.com/RichardLitt/ebird-ext
cd ebird-ext
npm install
node cli.js --help
```

## Input files

Most commands take `--input=<file>`. Give several files by separating them with commas.

- **Your eBird data, `MyEBirdData.csv`.** Download it from [ebird.org/downloadMyData](https://ebird.org/downloadMyData) and unzip it.
- **The eBird Basic Dataset (EBD), `ebd_*.txt`.** These have everyone's records for a region. [Request them from eBird](https://ebird.org/data/download). No conversion is needed. A checklist shared between several observers is counted once. Most commands read the whole file into memory: a year of one county takes 20–40 seconds, and a year of the whole state works too, but an all-time statewide file is too big. Request a download limited to a county or a date range.
- **Macaulay Library exports.** Only `quad` uses these: the CSV you can download of your photos and recordings.

### Columns used

The tool reads these columns and ignores the rest. EBD columns are renamed to the MyEBirdData names when a file is read (`ebd.js`).

| MyEBirdData.csv | EBD | Used for |
|---|---|---|
| Submission ID | SAMPLING EVENT IDENTIFIER | Telling checklists apart; checklist links |
| Common Name | SUBSPECIES COMMON NAME, else COMMON NAME | Species names in output |
| Scientific Name | SUBSPECIES SCIENTIFIC NAME, else SCIENTIFIC NAME | Matching species, the VBRC list, spotting spuhs, slashes and hybrids |
| Count | OBSERVATION COUNT | `countTheBirds` |
| State/Province | STATE CODE | `--state`, `--country`; Vermont-only commands |
| County | COUNTY | `--county`, county lists |
| Location ID | LOCALITY ID | Hotspot commands |
| Location | LOCALITY | Report output |
| Latitude, Longitude | LATITUDE, LONGITUDE | Which town and region a checklist is in; `withinDistance` |
| Date | OBSERVATION DATE | Everything to do with time |
| Time | TIME OBSERVATIONS STARTED | `checklists` |
| Protocol | PROTOCOL TYPE or PROTOCOL NAME | Leaving out incidental checklists |
| Duration (Min) | DURATION MINUTES | Minimum durations (Project 251) |
| All Obs Reported | ALL SPECIES REPORTED | `--complete` |
| Breeding Code | BREEDING CODE | `rare`: breeding records |
| | LAST EDITED DATE | `rare --year`: earlier sightings edited that year |
| | GROUP IDENTIFIER | Counting shared checklists once |
| | OBSERVER ID | Kept, not used by any command |

Macaulay Library exports need `Format` (`Photo` or `Audio`), `Common Name`, `Scientific Name`, `State/Province` and `Date`.

## Commands

The examples below were run on a made-up eBird export, and trimmed.

### Filters

These options work with most commands:

| Option | Keeps |
|---|---|
| `--country=US`, `--state=Vermont`, `--county=Addison` | Records in that place |
| `--town=Montpelier`, `--region="Champlain Valley"` | Records in that Vermont town or biophysical region |
| `--year=2025`, `--after=2025-06-01` | Records from that year, or after that date |
| `--complete` | Complete checklists only |
| `--output=<file>` | Also writes the result to a JSON file |

### Your lists

**`big`, `big-year`, `big-month`, `big-day`**: the year, month or day you saw the most species. `big` gives all three. Add `--list` to name the species.

```console
$ node cli.js big-day --input=MyEBirdData.csv --list
Your biggest day was October 16th, 2025 with 15 species.
With these species: Gavia immer, Vireo olivaceus, Mergus merganser, Ardea herodias, ...
```

**`first`, `first-year`, `first-month`, `first-day`**: the year, month or day you added the most species you'd never seen before.

```console
$ node cli.js first --input=MyEBirdData.csv
Your newest year was 2024 with 35 new species.
Your newest month was August 2024 with 14 new species.
Your newest day was May 18th, 2024 with 10 new species.
```

**`quad`**: how many species you have seen, photographed and recorded. Give your MyEBirdData.csv and your Macaulay Library exports together. Add `--list` for the date you completed each.

```console
$ node cli.js quad --input=MyEBirdData.csv,ML_photos.csv,ML_audio.csv --list
2023-02-04: Tufted Titmouse.
2023-03-15: Barred Owl.
You have seen, photographed, and recorded a total of 4 species.
```

**`subspecies`**: everything you've reported below or beside the species level, sorted into species, subspecies, spuhs, slashes, hybrids, domestic and feral types, groups, and so on.

```console
$ node cli.js subspecies --input=MyEBirdData.csv
{
  species: [ 'Plectrophenax nivalis', 'Larus delawarensis', ... ],
  spuhs: [ 'Anatinae sp.' ],
  slashes: [ 'Junco hyemalis hyemalis/carolinensis' ],
  hybrids: [],
  ...
}
```

**`countTheBirds`**: the total of every count on every checklist.

```console
$ node cli.js countTheBirds --input=MyEBirdData.csv
3789
```

**`checklists`**: your checklists, one per line, with links. Combine with the filters.

```console
$ node cli.js checklists --input=MyEBirdData.csv --year=2026 --complete
2026-01-13 08:00 AM | Hubbard Park, Montpelier | https://ebird.org/checklist/S900000017
2026-03-08 08:00 AM | Otter Creek Gorge, Middlebury | https://ebird.org/checklist/S900000016
7 checklists.
```

### Vermont

**`towns`, `regions`, `counties`**: how many species you've seen in each Vermont town, biophysical region or county, most first. Towns and regions are worked out from each checklist's coordinates.

```console
$ node cli.js counties --input=MyEBirdData.csv
Addison: 28
Caledonia: 28
Washington: 25
```

With `--town`, `towns` lists that town's species in the order you first saw them. With `--county`, `counties` gives that county's species, and `collectiveTotal`, the number of species anyone has seen there.

```console
$ node cli.js towns --input=MyEBirdData.csv --town=Montpelier
1 | Common Raven - Corvus corax | Montpelier, Washington, Vermont | 2024-08-26
2 | Canada Goose - Branta canadensis | Montpelier, Washington, Vermont | 2024-08-26
```

**`state`**: your Vermont species, grouped by the day you first saw each.

```console
$ node cli.js state --input=MyEBirdData.csv
38
2024-05-18: Snow Bunting, Ring-billed Gull, Bald Eagle, American Goldfinch, ...
2024-06-16: Tufted Titmouse, Common Merganser, Blue Jay, American Robin, Dark-eyed Junco (Slate-colored).
```

**`withinDistance`**: the species you've seen within `--distance` miles (default 10) of `--coordinates=<lat,lng>` (default Montpelier).

```console
$ node cli.js withinDistance --input=MyEBirdData.csv --coordinates=44.4759,-73.2121 --distance=5
23 species within 5 miles of 44.4759, -73.2121: Snow Bunting, Ring-billed Gull, Bald Eagle, ...
```

**`rare`**: the records the VBRC wants reported. This is the same check as the [VBRC checker](https://birdinginvermont.com/vbrc-checker). Records are matched by scientific name against `data/vermont_records.json`, and sorted into: species not on the Vermont checklist, species to report anywhere in Vermont, outside the Champlain Valley, outside the Northeast Kingdom, breeding records, subspecies, and sightings outside a species' expected dates.

```console
$ node cli.js rare --input=MyEBirdData.csv --year=2024
Vermont Records (report anywhere in Vermont) (1)
  2024-11-02 | King Eider | Burlington Waterfront, Burlington, Chittenden | https://ebird.org/checklist/S900000003

Outside of expected dates (1)
  2024-05-18 | Snow Bunting | Burlington Waterfront, Burlington, Chittenden | https://ebird.org/checklist/S900000006
```

With an EBD file you can check everyone's records for a county. With `--year`, the results also include sightings from earlier years whose checklist was last edited that year. `--slack` groups the report by county as Slack messages.

```sh
node cli.js rare --input=ebd_US-VT-001_202601_202612_relSep-2026.txt --county=Addison --year=2026
node cli.js rare --input=ebd_US-VT_relAug-2026.txt,ebd_US-VT_relAug-2026_unvetted.txt --year=2026 --slack
```

A species eBird has renamed since the VBRC list was last updated lands under "Vermont Firsts". Regenerate the list with `scripts/updateVermontRecords.js` (see [scripts/README.md](scripts/README.md)).

**`issr`** ("is species sighting rare"): checks one sighting, without an input file.

```console
$ node cli.js issr --species="King Eider" --town=Burlington --date=2026-02-01
Vermont Records (report anywhere in Vermont) (1)
  2026-02-01 | King Eider | Burlington, Chittenden
```

**`datesSpeciesObserved`**: the 20 species you've seen in Vermont on the most days of the year (any year).

```console
$ node cli.js datesSpeciesObserved --input=MyEBirdData.csv
[ 'Mallard: 9', 'American Goldfinch: 8', 'Black-capped Chickadee: 8', ... ]
```

**`daylistTargets`**: species you've seen in Vermont, but never on today's date.

```console
$ node cli.js daylistTargets --input=MyEBirdData.csv
Chipping Sparrow
Song Sparrow
```

**`251`**: the [Project 251](https://birdinginvermont.com/251) town lists for `--year` (default this year): the species on complete checklists of 5 minutes or more in each town. Use an EBD download for the year. It writes `data/vt_town_counts.json` (or `--output`) and a `_meta.json` file beside it. See [docs/project-251.md](docs/project-251.md).

```sh
node cli.js 251 --input=ebd_US-VT_2026_relAug-2026.txt --year=2026
```

**`getLastDate`**: today's date, in the form the Project 251 page uses.

### Hotspots

These read `data/hotspots.json`, Vermont's eBird hotspots. Refresh it with `scripts/updateHotspots.sh`.

**`townHotspots --town=Montpelier`**: the hotspots in a town, with their species and checklist counts.

**`unbirdedHotspots`**: Vermont hotspots, with when anyone last birded each, least recently birded first. With `--input`, only hotspots you have never birded; with `--currentYear`, only hotspots nobody has birded this year; with `--sinceYear=2020`, only those nobody has birded since that year.

```console
$ node cli.js unbirdedHotspots --input=MyEBirdData.csv
[ 'Beaver Lake - Hyde Park (16 acres), ', 'Beecher Pond - Brighton (15 acres), ', ... ]
```

**`weeksYouveBirdedAtHotspot --id=<hotspot ID>`**: the weeks of the year you haven't birded a hotspot, and when the next one starts.

```console
$ node cli.js weeksYouveBirdedAtHotspot --input=MyEBirdData.csv --id=L150998
You've not birded here on weeks: 1, 2, 4, 5, 6, 7, ...
The next unbirded week (#41) starts on Sunday, October 4th.
```

**`csvToJsonHotspots --input=<hotspots.csv>`**: rebuilds `data/hotspots.json` from eBird's hotspot list. `scripts/updateHotspots.sh` runs it.

## Other scripts

- **`norwich.js`**: your checklists in Norwich, for the Vermont Center for Ecostudies' Norwich Quest. `npm run norwich -- --input=path/to/MyEBirdData.csv`
- **`montpelier.js`**: which Washington County hotspots haven't had a complete checklist on today's date, in any year. Run `node montpelier.js` for hotspots near Montpelier; the file's header lists its other commands. It calls the eBird API, so it needs an API key in `EBIRD_API_TOKEN`.
- **`scripts/`**: the scripts that refresh the data in `data/`: town, region and county lists, the VBRC list, and hotspots. See [scripts/README.md](scripts/README.md).

## Testing

```sh
npm test
npm run lint
```

Tests use Node's built-in test runner (`node --test`). For a more readable reporter, use `npm run test:spec`.
