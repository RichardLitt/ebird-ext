# Arizona Records

These files were used to deal with the millions of observations. 

Generally the process was this:

- Download the eBird data you need.
- Use `ebd_DataToCSV.sh` in the folder above as a template for how to start. So, first:
  - Clean the eBird database using `cleaneBirdDatabase.sh`
  - Split that file using split_csv_file.sh
  - Use runNodeScriptOnSplitFiles in order to run shimeBirdDb.js on those files
  - Then run `runJSON2CSVOnSplitFiles.sh` on all of the output for that
  - Finally, run `runFinalAZRecords.sh` on those output
- And then, actually finally, merge those files using the munging in BRCRecordsInJSONToCSV.js

This is a ridiculous pathway, but it's this way due to historical reasons:

- This was meant originally to use MyEBirdData, not downloaded data, which is in another format
- Files are too big, so there needs to be a way to split all of the files

There are almost certainly ways of joining these files together. For now, here's how this all works.

As well, note that Arizona records depend upon the files in `data/` that define what species to talk about.

Those files aren't used on the site at all, but may be included at the moment due to the rareBirdsAZ function in 
index.js. It might be worth teasing this out of the website code entirely.
