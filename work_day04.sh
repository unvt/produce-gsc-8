node produce-gsc-osm/index_day04.js
for f in produce-gsc-osm/pmtiles/osm_tile_day04/*.pmtiles; do /usr/local/bin/tile-join --no-tile-size-limit -f -o large_tiles/unosm/tile_day04/`basename ${f}` produce-gsc-un/pmtiles/un_tile/`basename ${f}` produce-gsc-osm/pmtiles/osm_tile_day04/`basename ${f}`; date; echo  `basename ${f}`; ls -alh large_tiles/unosm/tile_day04/`basename ${f}` ;done
scp -i XXX(path to your ssh key) -r ./large_tiles/unosm/tile_day04/* (username)@(hostingserver):(path)/pmtiles/unosm
