# Region Counts

This process wasn't the clearest to get going, but the goal was to use the data to get the list of the 150 club for bioregions.

- `sh runRegions.sh`. This should work as expected. I think you need to manually split the db into counties, first, though. There's probably a script that does that that you normally use when importing data. Find that?
- Then run `node joinRegionJson.js`.
- Then copy the console log into a file, and turn it into a CSV. Something like this, in `150 Region Counts.csv`:

```
Region,Year,Observer,Total
Champlain Hills,2020,Tom Doubleday,157
Champlain Valley,1999,Mark LaBarr,156
```

I didn't do this because I was kludging it at the time, and I didn't want to run the script again as I had hit the eBird API a few times already.
- Then run `node makeRegionList.js`.

That's it. Can perfect on the next run-through, next year. Note - this makes some data in `data`, which probably isn't necessary. It uploads all of the counts for the people, which I don't think needs to be saved, frankly.
