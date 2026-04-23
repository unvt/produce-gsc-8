//modify for osm large (ZL6-
const geojsonArea = require('@mapbox/geojson-area');

const preProcess = f => {
  if (!f || typeof f !== 'object') {
    throw new Error(`Feature is invalid at table : ${f?.properties?._table}`);
  }

  f.tippecanoe = {
    layer: 'other',
    minzoom: 15,
    maxzoom: 15,
  };
  // name
  if (
    f.properties.hasOwnProperty('en_name') ||
    f.properties.hasOwnProperty('int_name') ||
    f.properties.hasOwnProperty('name') ||
    f.properties.hasOwnProperty('ar_name')
  ) {
    let name = '';
    if (f.properties['en_name']) {
      name = f.properties['en_name'];
    } else if (f.properties['int_name']) {
      name = f.properties['int_name'];
    } else if (f.properties['name']) {
      name = f.properties['name'];
    } else {
      name = f.properties['ar_name'];
    }
    delete f.properties['en_name'];
    delete f.properties['ar_name'];
    delete f.properties['int_name'];
    delete f.properties['name'];
    f.properties.name = name;
  }
  return f;
};

const postProcess = f => {
  delete f.properties['_table'];
  return f;
};

const flap = (f, defaultZ) => {
  switch (f.geometry.type) {
    case 'MultiPolygon':
    case 'Polygon':
      let mz = Math.floor(19 - Math.log2(geojsonArea.geometry(f.geometry)) / 2);
      if (mz > 15) {
        mz = 15;
      }
      if (mz < 6) {
        mz = 6;
      }
      return mz;
    default:
      return defaultZ ? defaultZ : 10;
  }
};

//new
const minzoomRoad = f => {
  switch (f.properties.z_order) {
    case 1:
    case 3:
    case 5:
      return 6;
    case 7:
      return 7;
    case 9:
    case 10:
      return 8;
    case 2:
    case 4:
    case 6:
    case 8:
      return 9;
    case 11:
    case 12:
    case 23:
    case 24:
    case 25:
    case 26:
    case 27:
    case 28:
    case 29:
      return 10;
    case 13:
      return 11;
    case 15:
    case 16:
    case 17:
      return 12;
    case 14:
    case 18:
    case 19:
    case 20:
    case 21:
    case 22:
      return 13;
    default:
      return 15;
  }
};

const minzoomRail = f => {
  switch (f.properties.z_order) {
    case 1:
      return 10;
    case 2:
    case 3:
      return 11;
    default:
      return 13;
  }
};

const minzoomWater = f => {
  if (f.properties.fclass === 'water') {
    return 6;
  } else if (f.properties.fclass === 'lake') {
    return 6;
  } else if (f.properties.fclass === 'pond') {
    return 6;
  } else if (f.properties.fclass === 'glacier') {
    return 6;
  } else if (f.properties.fclass === 'riverbank') {
    return 6;
  } else if (f.properties.fclass === 'wetland') {
    return 6;
  } else if (f.properties.fclass === 'basin') {
    return 6;
  } else if (f.properties.fclass === 'reservoir') {
    return 6;
  } else if (f.properties.fclass === 'dock') {
    return 6;
  } else {
    throw new Error(`monzoomWater: ${f.properties}`);
  }
};

const minzoomWaterLine = f => {
  switch (f.properties.z_order) {
    case 1:
    case 2:
      return 11;
    case 3:
    case 4:
      return 13;
    default:
      return 13;
  }
};

const minzoomOsmplace = f => {
  if (f.properties.z_order == 1) {
    return 6;
  } else if (f.properties.z_order == 2) {
    return 7;
  } else if (f.properties.z_order == 3) {
    return 11;
  } else if (f.properties.z_order == 7 || f.properties.z_order == 8) {
    return 12;
  } else {
    return 14;
  }
};

const lut = {
  // nature
  landuse_naturallarge_a: f => {
    f.tippecanoe = {
      layer: 'nature-l',
      minzoom: 12,
      //minzoom: flap(f, 15),
      maxzoom: 15,
    };
    delete f.properties['status'];
    return f;
  },
  landuse_naturalmedium_a: f => {
    f.tippecanoe = {
      layer: 'nature-m',
      //minzoom: 10,
      minzoom: flap(f, 10),
      maxzoom: 15,
    };
    delete f.properties['status'];
    return f;
  },

  // 2. water
  water_all_a: f => {
    f.tippecanoe = {
      layer: 'watera',
      minzoom: minzoomWater(f),
      maxzoom: 15,
    };
    if (f.properties.ungsc_mission === 'UNMIK') {
      f.properties.name = '';
    }
    delete f.properties['ungsc_mission'];
    return f;
  },
  waterways_small_l: f => {
    f.tippecanoe = {
      layer: 'water',
      minzoom: 7,
      maxzoom: 10,
    };
    if (f.properties.ungsc_mission === 'UNMIK') {
      f.properties.name = '';
    }
    delete f.properties['ungsc_mission'];
    delete f.properties['status'];
    return f;
  },
  waterways_large_l: f => {
    f.tippecanoe = {
      layer: 'water',
      //minzoom: 11,
      minzoom: minzoomWaterLine(f), //z_order 1,2 --> 11, 3,4--> 13
      maxzoom: 15,
    };
    if (f.properties.ungsc_mission === 'UNMIK') {
      f.properties.name = '';
    }
    delete f.properties['ungsc_mission'];
    delete f.properties['status'];
    return f;
  },

  // 4. road
  roads_major_l: f => {
    f.tippecanoe = {
      layer: 'road',
      minzoom: minzoomRoad(f),
      maxzoom: 15,
    };
    if (f.properties.ungsc_mission === 'UNMIK') {
      f.properties.name = '';
    }
    delete f.properties['ungsc_mission'];
    delete f.properties['status'];
    return f;
  },
  roads_medium_l: f => {
    f.tippecanoe = {
      layer: 'road',
      minzoom: minzoomRoad(f),
      maxzoom: 15,
    };
    if (f.properties.ungsc_mission === 'UNMIK') {
      f.properties.name = '';
    }
    delete f.properties['ungsc_mission'];
    return f;
  },
  roads_minor_l: f => {
    f.tippecanoe = {
      layer: 'road',
      minzoom: minzoomRoad(f),
      maxzoom: 15,
    };
    if (f.properties.ungsc_mission === 'UNMIK') {
      f.properties.name = '';
    }
    delete f.properties['ungsc_mission'];
    return f;
  },
  roads_other_l: f => {
    f.tippecanoe = {
      layer: 'road',
      minzoom: minzoomRoad(f),
      maxzoom: 15,
    };
    if (f.properties.ungsc_mission === 'UNMIK') {
      f.properties.name = '';
    }
    delete f.properties['ungsc_mission'];
    return f;
  },
  roads_special_l: f => {
    f.tippecanoe = {
      layer: 'road',
      minzoom: minzoomRoad(f),
      maxzoom: 15,
    };
    if (f.properties.ungsc_mission === 'UNMIK') {
      f.properties.name = '';
    }
    delete f.properties['ungsc_mission'];
    return f;
  },
  // 5. railway
  railways_all_l: f => {
    f.tippecanoe = {
      layer: 'railway',
      minzoom: minzoomRail(f), //modified on 2022-05-09
      maxzoom: 15,
    };
    return f;
  },
  // 6. route
  ferries_all_l: f => {
    f.tippecanoe = {
      layer: 'ferry',
      minzoom: 6,
      maxzoom: 15,
    };
    delete f.properties['status'];
    return f;
  },
  // 7. structure
  runways_all_l: f => {
    f.tippecanoe = {
      layer: 'runway',
      minzoom: 11,
      maxzoom: 15,
    };
    return f;
  },
  pois_transport_a: f => {
    f.tippecanoe = {
      layer: 'trans_area',
      minzoom: flap(f, 10),
      maxzoom: 15,
    };
    return f;
  },
  // 8. building
  landuse_urban_a: f => {
    f.tippecanoe = {
      layer: 'lu_urban',
      minzoom: 10,
      maxzoom: 15,
    };
    delete f.properties['status'];
    return f;
  },
  buildings_a: f => {
    f.tippecanoe = {
      layer: 'building',
      //      minzoom: 12,
      minzoom: flap(f, 15), //test 2021-09-20
      maxzoom: 15,
    };
    if (f.tippecanoe.minzoom > 14) f.tippecanoe.minzoom = 14; //test2021-09-20
    return f;
  },
  // 9. pois place
  pois_transport_p: f => {
    f.tippecanoe = {
      layer: 'poi_trans',
      maxzoom: 15,
    };
    switch (f.properties.fclass) {
      case 'aerodrome':
        f.tippecanoe.minzoom = 7;
        break;
      case 'airfield':
        f.tippecanoe.minzoom = 10;
        break;
      case 'helipad':
        f.tippecanoe.minzoom = 10;
        break;
      case 'station':
        f.tippecanoe.minzoom = 12;
        break;
      case 'bus_station':
        f.tippecanoe.minzoom = 12;
        break;
      case 'ferry_terminal':
        f.tippecanoe.minzoom = 12;
        break;
      default:
        f.tippecanoe.minzoom = 15;
    }
    if (f.properties.ungsc_mission === 'UNMIK') {
      f.properties.name = '';
    }
    return f;
  },
  pois_transport_ap: f => {
    f.tippecanoe = {
      layer: 'poi_trans',
      maxzoom: 15,
    };
    switch (f.properties.fclass) {
      case 'aerodrome':
        f.tippecanoe.minzoom = 7;
        break;
      case 'airfield':
        f.tippecanoe.minzoom = 10;
        break;
      case 'helipad':
        f.tippecanoe.minzoom = 10;
        break;
      case 'station':
        f.tippecanoe.minzoom = 12;
        break;
      case 'bus_station':
        f.tippecanoe.minzoom = 12;
        break;
      case 'ferry_terminal':
        f.tippecanoe.minzoom = 12;
        break;
      default:
        f.tippecanoe.minzoom = 15;
    }
    f.properties._source = 't-ap';
    if (f.properties.ungsc_mission === 'UNMIK') {
      f.properties.name = '';
    }
    return f;
  },
  pois_public_p: f => {
    f.tippecanoe = {
      layer: 'poi_public',
      minzoom: 12,
      maxzoom: 15,
    };
    return f;
  },
  pois_public_ap: f => {
    f.tippecanoe = {
      layer: 'poi_public',
      minzoom: 12,
      maxzoom: 15,
    };
    f.properties._source = 'pu-ap';
    if (f.properties.ungsc_mission === 'UNMIK') {
      f.properties.name = '';
    }
    return f;
  },
  pois_services_p: f => {
    f.tippecanoe = {
      layer: 'poi_services',
      maxzoom: 15,
    };
    switch (f.properties.fclass) {
      case 'college':
      case 'doctors':
      case 'hospital':
      case 'hotel':
      case 'kindergarten':
      case 'school':
      case 'university':
        f.tippecanoe.minzoom = 13;
        break;
      default:
        f.tippecanoe.minzoom = 14;
    }
    if (f.properties.ungsc_mission === 'UNMIK') {
      f.properties.name = '';
    }
    return f;
  },
  pois_services_ap: f => {
    f.tippecanoe = {
      layer: 'poi_services',
      maxzoom: 15,
    };
    switch (f.properties.fclass) {
      case 'college':
      case 'doctors':
      case 'hospital':
      case 'hotel':
      case 'kindergarten':
      case 'school':
      case 'university':
        f.tippecanoe.minzoom = 13;
        break;
      default:
        f.tippecanoe.minzoom = 14;
    }
    f.properties._source = 'se-ap';
    if (f.properties.ungsc_mission === 'UNMIK') {
      f.properties.name = '';
    }
    return f;
  },
  pois_worship_p: f => {
    f.tippecanoe = {
      layer: 'poi_worship',
      minzoom: 13,
      maxzoom: 15,
    };
    if (f.properties.ungsc_mission === 'UNMIK') {
      f.properties.name = '';
    }
    delete f.properties['status'];
    return f;
  },
  pois_worship_ap: f => {
    f.tippecanoe = {
      layer: 'poi_worship',
      minzoom: 13,
      maxzoom: 15,
    };
    if (f.properties.ungsc_mission === 'UNMIK') {
      f.properties.name = '';
    }
    delete f.properties['status'];
    return f;
  },
  pois_heritage_p: f => {
    f.tippecanoe = {
      layer: 'poi_heritage',
      minzoom: 15,
      maxzoom: 15,
    };
    if (f.properties.ungsc_mission === 'UNMIK') {
      f.properties.name = '';
    }
    delete f.properties['status'];
    return f;
  },
  pois_heritage_ap: f => {
    f.tippecanoe = {
      layer: 'poi_heritage',
      minzoom: 15,
      maxzoom: 15,
    };
    if (f.properties.ungsc_mission === 'UNMIK') {
      f.properties.name = '';
    }
    delete f.properties['status'];
    return f;
  },
  pois_other_p: f => {
    if (f.properties.fclass == 'station') {
      f.properties.fclass = 'p_station';
    }
    f.tippecanoe = {
      layer: 'poi_other',
      minzoom: 15,
      maxzoom: 15,
    };
    if (f.properties.ungsc_mission === 'UNMIK') {
      f.properties.name = '';
    }
    delete f.properties['status'];
    return f;
  },
  pois_other_ap: f => {
    f.tippecanoe = {
      layer: 'poi_other',
      minzoom: 15,
      maxzoom: 15,
    };
    if (f.properties.ungsc_mission === 'UNMIK') {
      f.properties.name = '';
    }
    delete f.properties['status'];
    return f;
  },
  pois_traffic_p: f => {
    f.tippecanoe = {
      layer: 'poi_traffic',
      minzoom: 14,
      maxzoom: 15,
    };
    if (f.properties.ungsc_mission === 'UNMIK') {
      f.properties.name = '';
    }
    return f;
  },
  pois_water_p: f => {
    f.tippecanoe = {
      layer: 'poi_water',
      minzoom: 15,
      maxzoom: 15,
    };
    if (f.properties.ungsc_mission === 'UNMIK') {
      f.properties.name = '';
    }
    delete f.properties['status'];
    return f;
  },
  landuse_parkreserve_a: f => {
    f.tippecanoe = {
      layer: 'area_park',
      minzoom: 8,
      maxzoom: 15,
    };
    delete f.properties['status'];
    return f;
  },
  places_all_p: f => {
    f.tippecanoe = {
      layer: 'osm_place',
      //      minzoom: 7,
      minzoom: minzoomOsmplace(f), // added on 2021-09-21
      maxzoom: 15,
    };
    delete f.properties['status'];
    delete f.properties['ungsc_ctry'];
    return f;
  },
};

module.exports = f => {
  const afterPreF = preProcess(f);
  const table = afterPreF.properties._table;
  if (typeof lut[table] !== 'function') {
    throw new Error(`Undefined _table: ${table}`);
  }
  const afterEditF = lut[table](afterPreF);
  const afterPostF = postProcess(afterEditF);
  return afterPostF;
};
