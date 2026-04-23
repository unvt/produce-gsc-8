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
const Z = config.get('un-s.Z');
const dbUser = config.get('un-l.dbUser');
const dbPassword = config.get('un-l.dbPassword');
const relations = config.get('un-s.relations');
const mbtilesDir = config.get('un-s.mbtilesDir');
const logDir = config.get('logDir');
const conversionTilelist = config.get('un-s.conversionTilelist');
const spinnerString = config.get('spinnerString');
const fetchSize = config.get('fetchSize');
const tippecanoePath = config.get('tippecanoePath');

// global configurations
Spinner.setDefaultSpinnerString(spinnerString);
winston.configure({
  level: 'silly',
  format: winston.format.simple(),
  transports: [
    new DailyRotateFile({
      filename: `${logDir}/produce-un-small-%DATE%.log`,
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
  custom_planet_land_08_a: [],
  un_glc30_global_lc_ss_a: ['gridcode'],
  unmap_bndl_l: ['bdytyp'],
  unmap_bndl05_l: ['bdytyp'],
  unmap_bndl25_l: ['bdytyp'],
  custom_ne_rivers_lakecentrelines_l: ['scalerank'],
  unmap_wbya10_a: [],
  unmap_bnda_label_03_p: ['annotationclassid', 'status', 'textstring'],
  unmap_bnda_label_04_p: ['annotationclassid', 'status', 'textstring'],
  unmap_bnda_label_05_p: ['annotationclassid', 'status', 'textstring'],
  unmap_bnda_label_06_p: ['annotationclassid', 'status', 'textstring'],
  unmap_phyp_label_04_p: ['annotationclassid', 'status', 'textstring'],
  unmap_phyp_label_06_p: ['annotationclassid', 'status', 'textstring'],
  unmap_popp_p: ['cartolb', 'poptyp', 'scl_id'],
};

// make table
const buildWhereClause = table => {
  switch (table) {
    case 'un_glc30_global_lc_ss_a':
      return 'gridcode IN (20, 30)';
    case 'unmap_bndl_l':
    case 'unmap_bndl05_l':
    case 'unmap_bndl25_l':
      return 'bdytyp IS DISTINCT FROM 6 AND bdytyp IS DISTINCT FROM 7';
    case 'unmap_bnda_label_03_p':
    case 'unmap_bnda_label_04_p':
    case 'unmap_bnda_label_05_p':
    case 'unmap_bnda_label_06_p':
    case 'unmap_phyp_label_04_p':
    case 'unmap_phyp_label_06_p':
      return 'status IS DISTINCT FROM 1';
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
        `--simplification=10`,
        `--drop-rate=1`,
        `--minimum-zoom=${Z}`,
        `--maximum-zoom=5`,
        `--base-zoom=5`,
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
    concurrent: config.get('concurrentS'),
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
