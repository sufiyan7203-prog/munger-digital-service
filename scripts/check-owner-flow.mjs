// Focused end-to-end check for the owner order-status flow.
// Usage: node scripts/check-owner-flow.mjs [baseUrl]
// Exits non-zero on the first failed expectation so it can gate a deploy.

const base = (process.argv[2] || 'http://127.0.0.1:3000').replace(/\/+$/, '');
const PIN = process.env.CHECK_PIN || '1234';

let failures = 0;
function check(label, condition, detail = '') {
  if (condition) {
    console.log(`PASS ${label}`);
  } else {
    failures += 1;
    console.log(`FAIL ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

async function call(path, { method = 'GET', pin, body } = {}) {
  const headers = {};
  if (pin) headers['x-owner-pin'] = pin;
  if (body) headers['content-type'] = 'application/json';
  const res = await fetch(`${base}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  return { status: res.status, json };
}

const menu = await call('/api/menu');
check('GET /api/menu returns 200', menu.status === 200, `status ${menu.status}`);
const dish = (menu.json?.items || []).find((item) => item.available);
check('menu has an available dish', Boolean(dish));
if (!dish) process.exit(1);

const placed = await call('/api/orders', {
  method: 'POST',
  body: { table: 'T-CHECK', name: 'Automated Check', items: [{ id: dish.id, qty: 2 }] }
});
check('POST /api/orders returns 201', placed.status === 201, `status ${placed.status}`);
const order = placed.json?.order;
check('new order starts in "new" status', order?.status === 'new', `status ${order?.status}`);
check('order total matches menu price x qty', order?.total === dish.price * 2, `${order?.total} vs ${dish.price * 2}`);

const orderId = order?.id;
const orderCode = order?.code;

const unauthorised = await call(`/api/owner/orders/${orderId}`, { method: 'PATCH', body: { status: 'preparing' } });
check('owner status update without PIN is rejected', unauthorised.status === 401, `status ${unauthorised.status}`);

const toPreparing = await call(`/api/owner/orders/${orderId}`, { method: 'PATCH', pin: PIN, body: { status: 'preparing' } });
check('owner can move order to "preparing"', toPreparing.status === 200 && toPreparing.json?.order?.status === 'preparing', `status ${toPreparing.status}/${toPreparing.json?.order?.status}`);

const invalidJump = await call(`/api/owner/orders/${orderId}`, { method: 'PATCH', pin: PIN, body: { status: 'new' } });
check('invalid status jump is refused', invalidJump.status === 409, `status ${invalidJump.status}`);

const toServed = await call(`/api/owner/orders/${orderId}`, { method: 'PATCH', pin: PIN, body: { status: 'served' } });
check('owner can move order to "served"', toServed.status === 200 && toServed.json?.order?.status === 'served', `status ${toServed.status}`);

const board = await call('/api/owner/orders?today=1', { pin: PIN });
check('owner board lists the order as served', board.json?.orders?.some((o) => o.id === orderId && o.status === 'served'));

const customerView = await call(`/api/orders/${orderCode}`);
check('customer tracking shows the served status', customerView.json?.order?.status === 'served', `status ${customerView.json?.order?.status}`);

const closed = await call(`/api/owner/orders/${orderId}`, { method: 'PATCH', pin: PIN, body: { status: 'paid' } });
check('order can be closed as paid', closed.status === 200 && closed.json?.order?.status === 'paid', `status ${closed.status}`);

if (failures > 0) {
  console.log(`\n${failures} check(s) failed against ${base}`);
  process.exit(1);
}
console.log(`\nAll owner flow checks passed against ${base}`);
