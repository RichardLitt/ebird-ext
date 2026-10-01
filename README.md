# Ebird Extentions

Tools for doing stuff with eBird data.

## Norwich.js

Run:

```sh
git clone https://github.com/RichardLitt/ebird-ext
cd ebird-ext
npm install
npm run norwich -- --input=path/to/MyEBirdData.csv
```

To gather the output of the data: `npm run norwich -- --input=path/to/MyEBirdData.csv > output.txt`

## VBRC rarities

List the records the Vermont Bird Records Committee wants reported. This is the same check as the [VBRC checker](https://birdinginvermont.com/vbrc-checker).

```sh
node cli.js rare --input=path/to/MyEBirdData.csv --year=2026
```

It also reads the eBird Basic Dataset (EBD), the `ebd_*.txt` files you can [request from eBird](https://ebird.org/data/download). Those cover everyone's records for a region, so you can check a whole county:

```sh
node cli.js rare --input=path/to/ebd_US-VT-001_202601_202612_relSep-2026.txt --county=Addison --year=2026
```

Notes on EBD files:

- No conversion step is needed.
- Shared checklists are collapsed, so a sighting shows up once, not once per observer.
- Rarities are matched by scientific name. A species eBird has renamed since the VBRC list was last updated lands under "Vermont Firsts".
- A year of data for one county takes about 20–40 seconds.

## Testing

Requires Node 22+.

```sh
npm test
```

Uses Node's built-in test runner (`node --test`). For a more readable reporter, use `npm run test:spec`.