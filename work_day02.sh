node produce-gsc-osm/index_day02.js
for f in produce-gsc-osm/pmtiles/osm_tile_day02/*.pmtiles; do /usr/local/bin/tile-join --no-tile-size-limit -f -o large_tiles/unosm/tile_day02/`basename ${f}` produce-gsc-un/pmtiles/un_tile/`basename ${f}` produce-gsc-osm/pmtiles/osm_tile_day02/`basename ${f}`; date; echo  `basename ${f}`; ls -alh large_tiles/unosm/tile_day02/`basename ${f}` ;done
scp -i XXX(path to your ssh key) -r ./large_tiles/unosm/tile_day02/* (username)@(hostingserver):(path)/pmtiles/unosm
