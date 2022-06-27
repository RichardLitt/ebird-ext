#!/usr/bin/env bash

## Should only need to be run on the next download from the database.
## Note: Going to need a better way to diff the next download.

## Run all of the scripts
node readeBirdStateDbForSpecies.js ~/Downloads/ebd_US-CT_relMay-2022/clean.txt
node readeBirdStateDbForSpecies.js ~/Downloads/ebd_US-MA_relMay-2022/clean.txt
node readeBirdStateDbForSpecies.js ~/Downloads/ebd_US-ME_relMay-2022/clean.txt
node readeBirdStateDbForSpecies.js ~/Downloads/ebd_US-NH_relMay-2022/clean.txt
node readeBirdStateDbForSpecies.js ~/Downloads/ebd_US-RI_relMay-2022/clean.txt
node readeBirdStateDbForSpecies.js ~/Downloads/ebd_US-VT_relMay-2022/clean.txt

## Mung the files together for an ultra one
cat CT-species.csv > NE-species.csv
echo '' >> NE-species.csv
tail -n +2 MA-species.csv >> NE-species.csv
echo '' >> NE-species.csv
tail -n +2 ME-species.csv >> NE-species.csv
echo '' >> NE-species.csv
tail -n +2 NH-species.csv >> NE-species.csv
echo '' >> NE-species.csv
tail -n +2 RI-species.csv >> NE-species.csv
echo '' >> NE-species.csv
tail -n +2 VT-species.csv >> NE-species.csv

node joinStateLists.js