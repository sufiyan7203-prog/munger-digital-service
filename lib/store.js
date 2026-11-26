// Tiny JSON-file store: no native modules, so it runs on any Node base image.
// Writes are serialised and atomic (temp file + rename) to survive restarts.

import fs from 'node:fs';
import path from 'node:path';
import { seedState } from './seed.js';

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

let state = null;
let writeChain = Promise.resolve();

export function init() {
  fs.mkdirSync(DATA_DIR, { recursive: true });

  let loaded = null;
  if (fs.existsSync(DB_FILE)) {
    try {
      loaded = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    } catch (err) {
      console.error('[store] db.json padha nahi ja saka, fresh data banaya:', err.message);
      loaded = null;
    }
  }

  const fresh = seedState();
  if (!loaded || typeof loaded !== 'object') {
    state = fresh;
  } else {
    state = {
      settings: { ...fresh.settings, ...(loaded.settings || {}) },
      menu: Array.isArray(loaded.menu) && loaded.menu.length ? loaded.menu : fresh.menu,
      orders: Array.isArray(loaded.orders) ? loaded.orders : [],
      seq: { order: Number(loaded.seq?.order) || fresh.seq.order }
    };
  }

  return state;
}

export function getState() {
  if (!state) init();
  return state;
}

export function save() {
  const snapshot = JSON.stringify(getState(), null, 2);
  writeChain = writeChain
    .then(async () => {
      const tmp = `${DB_FILE}.${process.pid}.tmp`;
      await fs.promises.writeFile(tmp, snapshot, 'utf8');
      await fs.promises.rename(tmp, DB_FILE);
    })
    .catch((err) => {
      console.error('[store] save fail:', err.message);
    });
  return writeChain;
}

export function dataFile() {
  return DB_FILE;
}
