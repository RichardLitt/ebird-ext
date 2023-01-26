#!/usr/bin/env bash

echo "Createing a clean file without quotes..."
sed 's/"//g' ebd_*.txt > clean.txt
sed "s/'//g" clean.txt > nodouble.txt
mv nodouble.txt clean.txt
echo "Done."