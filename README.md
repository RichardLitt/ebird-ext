# Ebird Extentions

Tools for doing stuff with eBird data.

## Norwich.js

Run:

```sh
git clone https://github.com/RichardLitt/ebird-ext
cd ebird-ext
npm install
npm run norwich
```

To gather the output of the data: `npm run norwich > output.txt`

## Testing

Requires Node 18+.

```sh
npm test
```

Uses Node's built-in test runner (`node --test`). For a more readable reporter, use `npm run test:spec`.