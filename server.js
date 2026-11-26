import express from 'express';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import QRCode from 'qrcode';
import { init, getState, save } from './lib/store.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;
const OWNER_PIN = String(process.env.OWNER_PIN || '1234');
const TZ = process.env.TZ || 'Asia/Kolkata';
const PUBLIC_DIR = path.join(__dirname, 'public');
const MAX_ORDERS_KEPT = 2000;

const STATUSES = ['new', 'preparing', 'served', 'paid', 'cancelled'];
const NEXT_STATUS = { new: ['preparing', 'cancelled'], preparing: ['served', 'cancelled'], served: ['paid'], paid: [], cancelled: ['new'] };

init();

const app = express();
app.set('trust proxy', true);
app.disable('x-powered-by');
app.use(express.json({ limit: '64kb' }));
app.use(express.static(PUBLIC_DIR, { extensions: ['html'], maxAge: 0 }));

/* ---------------------------------- utils --------------------------------- */

function baseUrl(req) {
  const configured = process.env.PUBLIC_URL;
  if (configured) return configured.replace(/\/+$/, '');
  return `${req.protocol}://${req.get('host')}`;
}

function dayKey(value = new Date()) {
  return new Date(value).toLocaleDateString('en-CA', { timeZone: TZ });
}

function publicOrder(order) {
  return {
    id: order.id,
    code: order.code,
    table: order.table,
    name: order.name,
    items: order.items,
    total: order.total,
    note: order.note,
    status: order.status,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt
  };
}

function ownerOrder(order) {
  return { ...order, canMoveTo: NEXT_STATUS[order.status] || [] };
}

function nextCode(state) {
  state.seq.order = Number(state.seq.order) + 1;
  return String(state.seq.order);
}

function ownerOnly(req, res, next) {
  const pin = String(req.get('x-owner-pin') || '');
  const a = Buffer.from(pin);
  const b = Buffer.from(OWNER_PIN);
  if (a.length === b.length && crypto.timingSafeEqual(a, b)) return next();
  return res.status(401).json({ error: 'Galat PIN. Dobara try karein.' });
}

const hitBuckets = new Map();
function rateLimit(max, windowMs) {
  return (req, res, next) => {
    const key = req.ip || 'unknown';
    const now = Date.now();
    const recent = (hitBuckets.get(key) || []).filter((t) => now - t < windowMs);
    if (recent.length >= max) {
      return res.status(429).json({ error: 'Bahut zyada requests. Thodi der baad try karein.' });
    }
    recent.push(now);
    hitBuckets.set(key, recent);
    if (hitBuckets.size > 500) hitBuckets.clear();
    return next();
  };
}

function cleanText(value, max) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

/* -------------------------------- public API ------------------------------ */

app.get('/api/health', (req, res) => {
  res.json({ ok: true, service: 'munger-digital-service', time: new Date().toISOString() });
});

app.get('/api/menu', (req, res) => {
  const state = getState();
  const items = state.menu.map((item) => ({
    id: item.id,
    name: item.name,
    price: item.price,
    category: item.category,
    emoji: item.emoji,
    veg: Boolean(item.veg),
    available: Boolean(item.available)
  }));
  const categories = [...new Set(items.map((i) => i.category))];
  res.json({ restaurant: state.settings, categories, items });
});

app.post('/api/orders', rateLimit(15, 5 * 60 * 1000), async (req, res) => {
  const body = req.body || {};
  const table = cleanText(body.table, 12);
  const name = cleanText(body.name, 60);
  const phone = cleanText(body.phone, 20);
  const note = cleanText(body.note, 200);

  if (!table) return res.status(400).json({ error: 'Table number chahiye.' });
  if (!name) return res.status(400).json({ error: 'Naam chahiye.' });
  if (!Array.isArray(body.items) || body.items.length === 0) {
    return res.status(400).json({ error: 'Cart khali hai.' });
  }
  if (body.items.length > 40) return res.status(400).json({ error: 'Ek order me bahut zyada items hain.' });

  const state = getState();
  const menuById = new Map(state.menu.map((item) => [item.id, item]));
  const lines = [];

  for (const raw of body.items) {
    const item = menuById.get(String(raw?.id ?? ''));
    if (!item) return res.status(400).json({ error: 'Menu item nahi mila. Menu refresh karein.' });
    if (!item.available) return res.status(409).json({ error: `${item.name} abhi available nahi hai.` });
    const qty = Math.floor(Number(raw?.qty));
    if (!Number.isFinite(qty) || qty < 1 || qty > 20) {
      return res.status(400).json({ error: 'Quantity 1 se 20 ke beech honi chahiye.' });
    }
    lines.push({ id: item.id, name: item.name, price: item.price, qty });
  }

  const total = lines.reduce((sum, line) => sum + line.price * line.qty, 0);
  const now = new Date().toISOString();
  const order = {
    id: crypto.randomUUID(),
    code: nextCode(state),
    table,
    name,
    phone,
    note,
    items: lines,
    total,
    status: 'new',
    createdAt: now,
    updatedAt: now
  };

  state.orders.unshift(order);
  if (state.orders.length > MAX_ORDERS_KEPT) state.orders.length = MAX_ORDERS_KEPT;
  await save();

  console.log(`[order] #${order.code} table ${table} — ${lines.length} items, ${state.settings.currency}${total}`);
  res.status(201).json({ order: publicOrder(order) });
});

app.get('/api/orders/:code', rateLimit(120, 60 * 1000), (req, res) => {
  const state = getState();
  const order = state.orders.find((o) => o.code === String(req.params.code));
  if (!order) return res.status(404).json({ error: 'Order nahi mila.' });
  res.json({ order: publicOrder(order) });
});

app.get('/api/qr/:table.svg', rateLimit(120, 60 * 1000), async (req, res) => {
  const table = cleanText(req.params.table, 12);
  const url = `${baseUrl(req)}/?table=${encodeURIComponent(table)}`;
  try {
    const svg = await QRCode.toString(url, {
      type: 'svg',
      margin: 1,
      width: 260,
      errorCorrectionLevel: 'M',
      color: { dark: '#173b91', light: '#ffffff' }
    });
    res.type('image/svg+xml').send(svg);
  } catch (err) {
    res.status(500).json({ error: 'QR banaya nahi ja saka.' });
  }
});

/* -------------------------------- owner API ------------------------------- */

app.get('/api/owner/session', ownerOnly, (req, res) => {
  res.json({ ok: true, settings: getState().settings });
});

app.get('/api/owner/orders', ownerOnly, (req, res) => {
  const state = getState();
  const { status, today } = req.query;
  let orders = state.orders;
  if (today === '1') {
    const key = dayKey();
    orders = orders.filter((o) => dayKey(o.createdAt) === key);
  }
  if (status && STATUSES.includes(String(status))) {
    orders = orders.filter((o) => o.status === status);
  }
  res.json({ orders: orders.map(ownerOrder), currency: state.settings.currency });
});

app.patch('/api/owner/orders/:id', ownerOnly, async (req, res) => {
  const state = getState();
  const order = state.orders.find((o) => o.id === req.params.id);
  if (!order) return res.status(404).json({ error: 'Order nahi mila.' });

  const next = String(req.body?.status || '');
  if (!STATUSES.includes(next)) return res.status(400).json({ error: 'Status galat hai.' });
  const allowed = NEXT_STATUS[order.status] || [];
  if (!allowed.includes(next)) {
    return res.status(409).json({ error: `Order ${order.status} se ${next} par nahi ja sakta.` });
  }

  order.status = next;
  order.updatedAt = new Date().toISOString();
  await save();
  res.json({ order: ownerOrder(order) });
});

app.get('/api/owner/stats', ownerOnly, (req, res) => {
  const state = getState();
  const key = dayKey();
  const todays = state.orders.filter((o) => dayKey(o.createdAt) === key);
  const active = todays.filter((o) => o.status !== 'cancelled');
  const revenue = active.reduce((sum, o) => sum + o.total, 0);
  const collected = todays.filter((o) => o.status === 'paid').reduce((sum, o) => sum + o.total, 0);

  const byStatus = Object.fromEntries(STATUSES.map((s) => [s, 0]));
  todays.forEach((o) => { byStatus[o.status] = (byStatus[o.status] || 0) + 1; });

  const itemCount = new Map();
  active.forEach((o) => o.items.forEach((line) => {
    const row = itemCount.get(line.name) || { name: line.name, qty: 0, revenue: 0 };
    row.qty += line.qty;
    row.revenue += line.price * line.qty;
    itemCount.set(line.name, row);
  }));

  const topItems = [...itemCount.values()].sort((a, b) => b.qty - a.qty).slice(0, 5);

  res.json({
    date: key,
    currency: state.settings.currency,
    ordersToday: todays.length,
    activeOrders: todays.filter((o) => ['new', 'preparing', 'served'].includes(o.status)).length,
    revenue,
    collected,
    avgOrderValue: active.length ? Math.round(revenue / active.length) : 0,
    byStatus,
    topItems
  });
});

app.get('/api/owner/tables', ownerOnly, (req, res) => {
  const state = getState();
  const base = baseUrl(req);
  const tables = Array.from({ length: Number(state.settings.tables) || 1 }, (_, i) => {
    const label = String(i + 1).padStart(2, '0');
    return { table: label, url: `${base}/?table=${label}`, qr: `${base}/api/qr/${label}.svg` };
  });
  res.json({ tables });
});

app.post('/api/owner/menu', ownerOnly, async (req, res) => {
  const state = getState();
  const name = cleanText(req.body?.name, 60);
  const price = Math.round(Number(req.body?.price));
  const category = cleanText(req.body?.category, 30) || 'Main Course';
  const emoji = cleanText(req.body?.emoji, 4) || '🍽️';

  if (!name) return res.status(400).json({ error: 'Dish ka naam chahiye.' });
  if (!Number.isFinite(price) || price < 1 || price > 100000) {
    return res.status(400).json({ error: 'Price 1 se 100000 ke beech honi chahiye.' });
  }

  const item = {
    id: `m-${crypto.randomUUID().slice(0, 8)}`,
    name,
    price,
    category,
    emoji,
    veg: req.body?.veg !== false,
    available: true
  };
  state.menu.push(item);
  await save();
  res.status(201).json({ item });
});

app.patch('/api/owner/menu/:id', ownerOnly, async (req, res) => {
  const state = getState();
  const item = state.menu.find((m) => m.id === req.params.id);
  if (!item) return res.status(404).json({ error: 'Dish nahi mili.' });

  if (typeof req.body?.available === 'boolean') item.available = req.body.available;
  if (req.body?.price !== undefined) {
    const price = Math.round(Number(req.body.price));
    if (!Number.isFinite(price) || price < 1 || price > 100000) {
      return res.status(400).json({ error: 'Price galat hai.' });
    }
    item.price = price;
  }
  if (req.body?.name !== undefined) {
    const name = cleanText(req.body.name, 60);
    if (!name) return res.status(400).json({ error: 'Dish ka naam chahiye.' });
    item.name = name;
  }
  await save();
  res.json({ item });
});

/* --------------------------------- fallback -------------------------------- */

app.use('/api', (req, res) => res.status(404).json({ error: 'Route nahi mila.' }));

app.use((err, req, res, next) => {
  console.error('[error]', err);
  if (res.headersSent) return next(err);
  res.status(500).json({ error: 'Server error. Thodi der baad try karein.' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Munger Digital Services chal raha hai: http://0.0.0.0:${PORT}`);
  console.log(`Owner dashboard: /owner (PIN ${OWNER_PIN === '1234' ? 'default 1234 — OWNER_PIN set karein' : 'env se set'})`);
});

process.on('unhandledRejection', (reason) => console.error('[unhandledRejection]', reason));
