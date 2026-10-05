node produce-gsc-small/index_un-s.js
#node produce-gsc-small/index_osm-s.js
node produce-gsc-small/index_osm-s-compact.js
/usr/local/bin/tile-join --no-tile-size-limit -f -o small_tiles/unosm/small-scale.pmtiles produce-gsc-small/un-s-tile/0-0-0.pmtiles produce-gsc-small/osm-s-tile/0-0-0.pmtiles
scp -i XXX(path to your ssh key) -r ./small_tiles/unosm/small-scale.pmtiles (username)@(hostingserver):(path)/pmtiles/unosm