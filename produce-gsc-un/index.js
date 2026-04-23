const config = require('config');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const Queue = require('better-queue');
const pretty = require('prettysize');
const tilebelt = require('@mapbox/tilebelt');
const TimeFormat = require('hh-mm-ss');
const { Pool } = require('pg');
const Cursor = require('pg-cursor');
const Spinner = require('cli-spinner').Spinner;
const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
const modify = require('./modify.js');

// config constants
const host = config.get('un-l.host');
const port = config.get('un-l.port');
const Z = config.get('un-l.Z');
const dbUser = config.get('un-l.dbUser');
const dbPassword = config.get('un-l.dbPassword');
const relations = config.get('un-l.relations');
const mbtilesDir = config.get('un-l.mbtilesDir');
const logDir = config.get('logDir');

const spinnerString = config.get('spinnerString');
const fetchSize = config.get('fetchSize');
const tippecanoePath = config.get('tippecanoePath');

//make a list
const conversionTilelist01 = config.get('day01Tilelist');
const conversionTilelist02 = config.get('day02Tilelist');
const conversionTilelist03 = config.get('day03Tilelist');
const conversionTilelist04 = config.get('day04Tilelist');
const conversionTilelist05 = config.get('day05Tilelist');
const conversionTilelist06 = config.get('day06Tilelist');
const conversionTilelist07 = config.get('day07Tilelist');

let conversionTilelist = config.get('everydayTilelist');
conversionTilelist = conversionTilelist.concat(conversionTilelist01);
conversionTilelist = conversionTilelist.concat(conversionTilelist02);
conversionTilelist = conversionTilelist.concat(conversionTilelist03);
conversionTilelist = conversionTilelist.concat(conversionTilelist04);
conversionTilelist = conversionTilelist.concat(conversionTilelist05);
conversionTilelist = conversionTilelist.concat(conversionTilelist06);
conversionTilelist = conversionTilelist.concat(conversionTilelist07);

// global configurations
Spinner.setDefaultSpinnerString(spinnerString);
winston.configure({
  level: 'silly',
  format: winston.format.simple(),
  transports: [
    new DailyRotateFile({
      filename: `${logDir}/produce-un46-%DATE%.log`,
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '14d',
    }),
  ],
});

//global variable
const modules = {};
const pools = {};
const productionSpinner = new Spinner();
let moduleKeysInProgress = [];

const iso = () => new Date().toISOString();

// Required attributes for each table
const requiredAttributesByTable = {
  custom_planet_land_main_a: [],
  custom_planet_land_antarctica_a: [],
  custom_planet_land_08_a: [],
  unmap_bndl_l: ['bdytyp', 'iso3cd'],
  custom_unmap_bndl_l: ['type'],
  un_unmik_bndl_l: ['type'],
  un_unvmc_igac_bndl_l: ['level'],
  un_mimu_bndl: ['boundary_type'],
  custom_ne_rivers_lakecentrelines_l: [],
  un_glc30_global_lc_ms_a: ['gridcode'],
  un_mission_lc_ls_a: ['gridcode'],
  un_global_places_p: [
    'type',
    'countrycode',
    'label_1',
    'label_2',
    'placename1',
  ],
  unmap_phyp_label_06_p: ['annotationclassid', 'textstring'],
  unmap_bnda_a1_ap: ['adm1nm'],
  unmap_bnda_a2_ap: ['adm2nm'],
  custom_unmap_bnda_a1_ap: ['adm1_name'],
  custom_unmap_bnda_a2_ap: ['adm2_name'],
  // un_unmik_bnda_a2_ap: [],
  un_unmik_bnda_a3_ap: ['region_name'],
  // un_unvmc_igac_bnda_a1_departments_ap: [],
  // un_unvmc_igac_bnda_a2_municipalities_ap: [],
  un_unvmc_igac_bnda_a3_rural_units_ap: ['nombre_ver'],
  // unmap_bnda05_cty_a: [],
  unmap_bnda_label_06_p: ['annotationclassid', 'textstring', 'status'],
  un_global_pois_p: ['type', 'countrycode', 'poiname'],
  un_minusca_pois_p: ['feat_class', 'poiname'],
  unmap_phyp_p: ['en_name', 'int_name', 'name', 'ar_name', 'type'],
  unmap_popp_p: ['cartolb', 'poptyp', 'scl_id'],
  // custom_planet_coastline_l: [],
};

// make table
const buildWhereClause = table => {
  switch (table) {
    case 'unmap_bndl_l':
      return `
        (
          iso3cd NOT IN (
            'COL', 'COL_ECU', 'COL_PER', 'COL_VEN', 'BRA_COL', 'COL_PAN',
            'BGD_MMR', 'CHN_MMR', 'IND_MMR', 'LAO_MMR', 'MMR', 'MMR_THA'
          )
          OR iso3cd IS NULL
        )
      `;
    case 'un_glc30_global_lc_ms_a':
    case 'un_mission_lc_ls_a':
      return 'gridcode IN (20, 30, 80)';
    case 'unmap_popp_p':
      return `
        (cartolb NOT IN ('Alofi', 'Avarua', 'Sri Jayewardenepura Kotte') OR cartolb IS NULL)
        AND (
          poptyp IN (1, 2)
          OR (poptyp = 3 AND scl_id = 10)
        )
      `;
    default:
      return '';
  }
};

const buildSql = (schema, table, bbox, cols) => {
  const whereClause = buildWhereClause(table);

  return `
    WITH envelope AS (
      SELECT ST_MakeEnvelope(${bbox.join(', ')}, 4326) AS geom
    )
    SELECT ${cols.toString()}
    FROM ${schema}.${table}
    JOIN envelope ON ${schema}.${table}.geom && envelope.geom
    ${whereClause ? `WHERE ${whereClause}` : ''}
  `;
};

// run tippecanoe
const noPressureWrite = (writable, f) => {
  return new Promise((resolve, reject) => {
    const ok = writable.write(`${JSON.stringify(f)}\n`);
    if (ok) return resolve();

    const onDrain = () => {
      writable.off('error', onError);
      resolve();
    };

    const onError = err => {
      writable.off('drain', onDrain);
      reject(err);
    };

    writable.once('drain', onDrain);
    writable.once('error', onError);
  });
};

// fetch some data and modify it for GeoJSON format
const fetch = async (database, table, cursor, writable) => {
  try {
    const rows = await cursor.read(fetchSize);
    if (rows.length === 0) return 0;

    for (const row of rows) {
      let f = {
        type: 'Feature',
        properties: row,
        geometry: JSON.parse(row.st_asgeojson),
      };
      delete f.properties.st_asgeojson;
      f.properties._table = table;
      f = modify(f);

      await noPressureWrite(writable, f);
    }

    return rows.length;
  } catch (err) {
    throw new Error(
      `Error in fetch function for ${table} in ${database}: ${err.message}`,
    );
  }
};

// connect clients and modify the sql
const dumpAndModify = async (bbox, relation, writable, moduleKey) => {
  const [database, schema, table] = relation.split('::');
  if (!pools[database]) {
    pools[database] = new Pool({
      host: host,
      user: dbUser,
      port: port,
      password: dbPassword,
      database: database,
    });
  }

  let client, cursor;
  try {
    client = await pools[database].connect();
    let sql = `
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_schema = $1 
      AND table_name = $2 
      ORDER BY ordinal_position
    `;
    let cols = await client.query(sql, [schema, table]);
    cols = cols.rows.map(r => r.column_name).filter(r => r !== 'geom');
    cols = cols.filter(v => requiredAttributesByTable[table].includes(v));
    cols.push(`ST_AsGeoJSON(${schema}.${table}.geom)`);

    await client.query('BEGIN');

    sql = buildSql(schema, table, bbox, cols);

    cursor = client.query(new Cursor(sql));

    while (true) {
      const len = await fetch(database, table, cursor, writable);
      if (len === 0) break;
    }

    await client.query(`COMMIT`);
  } catch (err) {
    if (client) {
      try {
        await client.query('ROLLBACK');
      } catch (e) {
        console.error('ROLLBACK failed:', e);
      }
    }
    throw new Error(
      `Error executing query for ${schema}.${table} in ${database}: ${err.message}`,
    );
  } finally {
    if (client) client.release();
    winston.info(`${iso()}: finished ${relation} of ${moduleKey}`);
  }
};

//queue data, prepare tippecanoe, and deal with the data after tippecanoe
const queue = new Queue(
  (task, cb) => {
    const startTime = new Date();
    const moduleKey = task.moduleKey;
    let tippecanoe;
    task._attempt = (task._attempt || 0) + 1;
    const [z, x, y] = moduleKey.split('-').map(v => Number(v));
    const bbox = tilebelt.tileToBBOX([x, y, z]);
    const tmpPath = `${__dirname}/${mbtilesDir}/part-${moduleKey}.mbtiles`;
    const dstPath = `${__dirname}/${mbtilesDir}/${moduleKey}.mbtiles`;

    moduleKeysInProgress.push(moduleKey);
    productionSpinner.setSpinnerTitle(moduleKeysInProgress.join(', '));

    tippecanoe = spawn(
      tippecanoePath,
      [
        `--quiet`,
        `--no-feature-limit`,
        `--no-tile-size-limit`,
        `--force`,
        `--simplification=5`,
        `--drop-rate=1`,
        `--minimum-zoom=${Z}`,
        `--maximum-zoom=15`,
        `--base-zoom=15`,
        `--hilbert`,
        `--clip-bounding-box=${bbox.join(',')}`,
        `--output=${tmpPath}`,
      ],
      { stdio: ['pipe', 'inherit', 'inherit'] },
    );

    tippecanoe.on('close', () => {
      fs.renameSync(tmpPath, dstPath);
      moduleKeysInProgress = moduleKeysInProgress.filter(
        v => !(v === moduleKey),
      );

      productionSpinner.stop();
      process.stdout.write('\n');

      const logString = `${iso()}: process ${moduleKey}, id=${task.id}, try=${
        task._attempt
      }, (${pretty(modules[moduleKey].size)} => ${pretty(
        fs.statSync(dstPath).size,
      )}) took ${TimeFormat.fromMs(new Date() - startTime)}.`;
      winston.info(logString);
      console.log(logString);

      if (moduleKeysInProgress.length > 0) {
        productionSpinner.setSpinnerTitle(moduleKeysInProgress.join(', '));
        productionSpinner.start();
      }

      cb(null, { id: task.id });
    });

    productionSpinner.start();

    (async () => {
      try {
        for (const relation of relations) {
          await dumpAndModify(bbox, relation, tippecanoe.stdin, moduleKey);
        }
        tippecanoe.stdin.end();
      } catch (err) {
        if (tippecanoe) tippecanoe.kill();

        const msg = `Error: taskId=${task.id} ${moduleKey}: ${err.message}`;
        console.error(msg);
        winston.error(msg);
        cb(new Error(msg));
      }
    })();
  },
  {
    concurrent: config.get('un-l.concurrent'),
    maxRetries: config.get('maxRetries'),
    retryDelay: config.get('retryDelay'),
  },
);

//push data for specific area based on the list
const queueTasks = () => {
  let i = 1;
  for (const moduleKey of conversionTilelist) {
    // calculate current file size
    const path = `${__dirname}/${mbtilesDir}/${moduleKey}.mbtiles`;
    let size = 0;
    if (fs.existsSync(path)) {
      const stat = fs.statSync(path);
      size = stat.size;
    }
    modules[moduleKey] = {
      size: size,
    };

    queue.push({
      moduleKey: moduleKey,
      id: i,
    });
    i++;
  }
};

const main = () => {
  console.log(`${iso()}: ** production system started! **`);
  winston.info(`${iso()}:========== production system started! ==========`);
  const startTime = new Date();

  queue.on('task_failed', (_taskId, err) => {
    console.error(`Queue task failed:`, err.message);
  });

  queue.on('drain', async () => {
    for (const pool of Object.values(pools)) {
      await pool.end();
    }
    winston.info(
      `${iso()}:========== production system shutdown. Duration: ${TimeFormat.fromMs(
        new Date() - startTime,
      )}.==========\n\n\n`,
    );
    console.log(
      `${iso()}: ** production system shutdown! Duration: ${TimeFormat.fromMs(
        new Date() - startTime,
      )}. **`,
    );
    process.exit(0);
  });
  queueTasks();
};

main();
