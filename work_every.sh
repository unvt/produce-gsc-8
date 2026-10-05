node produce-gsc-osm/index_everyday.js
for f in produce-gsc-osm/pmtiles/osm_tile_every/*.pmtiles; do /usr/local/bin/tile-join --no-tile-size-limit -f -o large_tiles/unosm/tile_every/`basename ${f}` produce-gsc-un/pmtiles/un_tile/`basename ${f}` produce-gsc-osm/pmtiles/osm_tile_every/`basename ${f}`; date; echo  `basename ${f}`; ls -alh large_tiles/unosm/tile_every/`basename ${f}` ;done
scp -i XXX(path to your ssh key) -r ./large_tiles/unosm/tile_every/* (username)@(hostingserver):(path)/pmtiles/unosm

