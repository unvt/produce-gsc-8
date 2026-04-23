//modify for small conversion
const preProcess = f => {
  if (!f || typeof f !== 'object') {
    throw new Error(`Feature is invalid at table : ${f?.properties?._table}`);
  }

  f.tippecanoe = {
    layer: 'other',
    minzoom: 5,
    maxzoom: 5,
  };
  return f;
};

const postProcess = f => {
  if (f !== null) {
    delete f.properties['_table'];
  }
  return f;
};

const lut = {
  //osm
  roads_major_0408_l: f => {
    f.tippecanoe = {
      layer: 'road-s',
      minzoom: 4,
      maxzoom: 5,
    };
    return f; //edited 2026-01-05
  },
  // un1 Base
  custom_planet_land_08_a: f => {
    f.tippecanoe = {
      layer: 'landmass',
      minzoom: 0,
      maxzoom: 5,
    };
    return f;
  },
  un_glc30_global_lc_ss_a: f => {
    f.tippecanoe = {
      layer: 'landcover',
      // minzoom: 3,  //20250828
      minzoom: 0,
      maxzoom: 5,
    };
    return f;
  }, // delete custom_ne_10m_bathymetry_a 2026-01-13
  unmap_bndl_l: f => {
    f.tippecanoe = {
      layer: 'bndl',
      minzoom: 5,
      maxzoom: 5,
    };
    //no need admin 1 and 2 for ZL5
    return f;
  },
  unmap_bndl05_l: f => {
    f.tippecanoe = {
      layer: 'bndl',
      minzoom: 3,
      maxzoom: 4,
    };
    //no need admin 1 and 2 for small scale
    return f;
  },
  unmap_bndl25_l: f => {
    f.tippecanoe = {
      layer: 'bndl',
      minzoom: 0,
      maxzoom: 2,
    };
    //no need admin 1 and 2 for small scale
    return f;
  },
  custom_ne_rivers_lakecentrelines_l: f => {
    f.tippecanoe = {
      layer: 'un_water',
      maxzoom: 5,
    };
    if (
      f.properties.scalerank == 1 ||
      f.properties.scalerank == 2 ||
      f.properties.scalerank == 3 ||
      f.properties.scalerank == 4
    ) {
      f.tippecanoe.minzoom = 3;
    } else if (
      f.properties.scalerank == 5 ||
      f.properties.scalerank == 6 ||
      f.properties.scalerank == 7
    ) {
      f.tippecanoe.minzoom = 4;
    } else {
      f.tippecanoe.minzoom = 5;
    }
    delete f.properties['scalerank'];
    return f;
  },
  unmap_wbya10_a: f => {
    f.tippecanoe = {
      layer: 'watera-s',
      minzoom: 2,
      maxzoom: 5,
    };
    return f;
  },
  unmap_bnda_label_03_p: f => {
    f.tippecanoe = {
      layer: 'lab_cty',
      minzoom: 1,
      maxzoom: 1,
    };
    return f;
  },
  unmap_bnda_label_04_p: f => {
    f.tippecanoe = {
      layer: 'lab_cty',
      minzoom: 2,
      maxzoom: 2,
    };
    return f;
  },
  unmap_bnda_label_05_p: f => {
    f.tippecanoe = {
      layer: 'lab_cty',
      minzoom: 3,
      maxzoom: 3,
    };
    return f;
  },
  unmap_bnda_label_06_p: f => {
    f.tippecanoe = {
      layer: 'lab_cty',
      minzoom: 4,
      maxzoom: 5,
    };
    return f;
  }, // delete unmap_bnda_cty_anno_03_p etc 2026-01-05
  unmap_phyp_label_04_p: f => {
    f.tippecanoe = {
      layer: 'lab_water',
      minzoom: 3,
      maxzoom: 3,
    };
    //Ocean minz 1, Bay minz 2, Sea minz3
    if (
      f.properties.annotationclassid == 0 ||
      f.properties.annotationclassid == 1
    ) {
      f.tippecanoe.minzoom = 1;
    } else if (f.properties.annotationclassid == 3) {
      f.tippecanoe.minzoom = 2;
    } else if (
      f.properties.annotationclassid == 2 ||
      f.properties.annotationclassid == 4 ||
      f.properties.annotationclassid == 5
    ) {
      f.tippecanoe.minzoom = 3;
    } else {
      f.tippecanoe.minzoom = 5;
    }
    delete f.properties['status'];
    return f;
  },
  unmap_phyp_label_06_p: f => {
    f.tippecanoe = {
      layer: 'lab_water',
      minzoom: 4,
      maxzoom: 5,
    };
    if (f.properties.annotationclassid == 6) {
      f.tippecanoe.minzoom = 5;
    }
    delete f.properties['status'];
    return f;
  },
  // delete unmap_phyp_p 2026-3-25
  unmap_popp_p: f => {
    f.tippecanoe = {
      layer: 'un_popp',
      minzoom: 3,
      maxzoom: 5,
    };
    //    let popp_arr = [1, 2, 3]
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
